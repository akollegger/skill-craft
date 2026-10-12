/**
 * The first candidate skill from finished runs (spec 005, User Story 1): record the runs to a workspace this step creates,
 * have the distiller generate one skill from them, download it, and delete the workspace whatever happens. The roles never
 * see any of this; they get the package it returns.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CandidateFailed, HarnessError, LoopCancelled, LoopRefused } from "../harness/errors.js";
import { checkSizes } from "./inputs.js";
import { packageFromFiles, writePackage, type SkillPackage } from "./package.js";
import { guarded, WorkspaceGuard, type NamsApi, type RunStatus, type ServiceVersion } from "./nams.js";
import { assertSameTask, type Recording } from "./transcript.js";
import type { ConversationTurn } from "../harness/conversation.js";
import { readZip } from "./zip.js";

/** A step that happened before the roles ran. Roles' stages are in `loop.ts`. */
export interface NamsStage {
  stage: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface CandidateArgs {
  runs: readonly Recording[];
  format: "graph" | "prose";
  /** Creating and deleting a workspace is a write to the account, so it needs the operator's explicit option. */
  allowWorkspace: boolean;
  nams: NamsApi;
  /** The loop folder; the candidate is saved under `candidate/` and the workspace id in `workspace.json`. */
  loopDir: string;
  signal: AbortSignal;
  out: (line: string) => void;
  now?: (() => number) | undefined;
  /** Ids this step must never touch, such as the one development or experiment sessions record to. */
  forbiddenWorkspaceIds?: readonly string[] | undefined;
  pollMs?: number | undefined;
  maxWaitMs?: number | undefined;
}

/** The memory service that distilled the skill: its own account of its version, or the fixed code for why that is not known. */
export type DistillerService = ({ name: "nams" } & ServiceVersion) | { name: "nams"; unknown: "version_unavailable" };

export interface CandidateOutcome {
  pkg: SkillPackage;
  stages: NamsStage[];
  /** Run ids, the format and the service's thresholds, for the loop record. */
  info: {
    workspace: { id: string; name: string };
    runs: string[];
    conversationIds: string[];
    generation: { runId: string; skillId: string; format: "graph" | "prose"; status: string; gates?: unknown; request: { scope: "conversations"; conversations: number; procedureFormat: "graph" | "prose" } };
    capabilities: unknown;
    service: DistillerService;
  };
}

const SUCCESS = new Set(["completed", "complete", "succeeded", "success", "done", "ready", "finished"]);
const classify = (r: RunStatus): "done" | "failed" | "pending" => (SUCCESS.has(r.status) ? "done" : /fail|error|reject/.test(r.status) ? "failed" : "pending");
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(new LoopCancelled());
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); reject(new LoopCancelled()); }, { once: true });
});

/** The zip's one top-level folder, when it has one, is the skill's own name and is not part of the package. */
function stripRoot(files: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const paths = Object.keys(files);
  const first = paths[0]?.split("/")[0];
  if (paths.length === 0 || "SKILL.md" in files || !first || !paths.every((p) => p.includes("/") && p.split("/")[0] === first)) return files;
  return Object.fromEntries(paths.map((p) => [p.slice(first.length + 1), files[p]!]));
}

export async function obtainCandidate(a: CandidateArgs): Promise<CandidateOutcome> {
  if (!a.allowWorkspace) throw new LoopRefused("creating a workspace needs --allow-workspace");
  assertSameTask(a.runs);
  const now = a.now ?? Date.now;
  const nams = guarded(a.nams, new WorkspaceGuard({ forbidden: a.forbiddenWorkspaceIds ?? [] }));
  const stages: NamsStage[] = [];
  const timed = async <T>(stage: string, f: () => Promise<T>): Promise<T> => {
    const startedAt = now();
    try {
      return await f();
    } finally {
      const endedAt = now();
      stages.push({ stage, startedAt, endedAt, durationMs: Math.max(0, endedAt - startedAt) });
    }
  };

  const name = `${basename(a.loopDir)}-${now()}`;
  const file = join(a.loopDir, "workspace.json");
  const writeWorkspace = (rec: { id: string | null; retired: boolean }) => writeFileSync(file, `${JSON.stringify({ name, createdBy: "loop", ...rec }, null, 2)}\n`);
  // Written before the workspace exists, so a crash leaves a record of what the step meant to create.
  mkdirSync(a.loopDir, { recursive: true });
  writeWorkspace({ id: null, retired: false });

  // The id lives in a holder so the closures below can set it and the `finally` can read it.
  const ws: { id: string | null } = { id: null };
  let failure: unknown;
  let outcome: CandidateOutcome | undefined;
  try {
    const guard = <T>(p: Promise<T>): Promise<T> => p.catch((e: unknown) => { throw wrap(e, a.signal); });
    // Creating a workspace includes waiting until its database answers.
    await timed("create-workspace", async () => {
      ws.id = (await guard(nams.createWorkspace(name))).id;
      writeWorkspace({ id: ws.id, retired: false });
      a.out(`workspace ${ws.id} created`);
      await guard(nams.waitActive(ws.id, a.signal));
    });
    const id = ws.id as string;
    const capabilities = await guard(nams.capabilities(id));

    const conversationIds: string[] = [];
    for (const rec of a.runs) {
      await timed(`record-run-${rec.label}`, async () => {
        const conv = (await guard(nams.addConversation(id, conversationMetadata(rec)))).id;
        conversationIds.push(conv);
        await guard(nams.addMessage(id, conv, "user", rec.prompt));
        const write = { id, conv, nams, guard };
        if (rec.conversation === null) await recordPlaceholder(write, rec);
        else await recordConversation(write, rec, rec.conversation);
      });
      a.out(`recorded run ${rec.label}`);
    }

    await timed("wait-extraction", () => guard(nams.waitExtracted(id, conversationIds, a.signal)));

    let service: DistillerService = { name: "nams", unknown: "version_unavailable" };
    const { runId, run } = await timed("generate", async () => {
      const { runId } = await guard(nams.generateSkill(id, { conversationIds, procedureFormat: a.format }));
      a.out(`generating skill (run ${runId})`);
      // Read while generation runs, so it names the deployment that did the work. A failure is not a failed loop.
      service = await guard(nams.version()).then(
        (v): DistillerService => ({ name: "nams", version: v.version, released: v.released, commit: v.commit, environment: v.environment }),
        (e: unknown): DistillerService => {
          if (a.signal.aborted || e instanceof LoopCancelled) throw e;
          return { name: "nams", unknown: "version_unavailable" };
        },
      );
      const deadline = Date.now() + (a.maxWaitMs ?? 15 * 60_000);
      for (;;) {
        const run = await guard(nams.getRun(id, runId));
        if (classify(run) !== "pending") return { runId, run };
        if (Date.now() >= deadline) throw new CandidateFailed("the distiller did not finish in time");
        await sleep(a.pollMs ?? 5000, a.signal);
      }
    });

    const request = { scope: "conversations" as const, conversations: conversationIds.length, procedureFormat: a.format };
    const generation = { runId, skillId: run.skillId ?? null, format: a.format, request, status: run.status, failure: run.failure ?? null, gates: run.gates ?? null, capabilities };
    // Beside the package folder, not in it: the archive is untrusted and may hold a file of the same name.
    writeFileSync(join(a.loopDir, "generation.json"), `${JSON.stringify(generation, null, 2)}\n`);
    if (classify(run) === "failed") {
      // The distiller's own reasons, as a code when it gave one; no retry (FR-007).
      const code = run.failure && /^[a-z][a-z_]*$/.test(run.failure) ? ` (${run.failure})` : "";
      throw new CandidateFailed(`the distiller reported ${run.status}${code}`);
    }
    if (!run.skillId) throw new CandidateFailed("the distiller finished but named no skill");

    const bytes = await timed("download", () => guard(nams.downloadSkill(id, run.skillId!)));
    const pkg = packageFromFiles(stripRoot(readZip(bytes)));
    writePackage(join(a.loopDir, "candidate"), pkg);
    outcome = {
      pkg,
      stages,
      info: { workspace: { id, name }, runs: a.runs.map((r) => r.label), conversationIds, generation: { runId, skillId: run.skillId, format: a.format, status: run.status, gates: run.gates, request }, capabilities, service },
    };
  } catch (e) {
    failure = e;
  } finally {
    if (ws.id !== null) {
      const id = ws.id;
      try {
        await timed("delete-workspace", () => nams.deleteWorkspace(id));
        writeWorkspace({ id, retired: true });
        a.out(`workspace ${id} deleted`);
      } catch {
        // Reported with the id, and never allowed to hide the loop's own result.
        a.out(`workspace ${id} could not be deleted; delete it by hand`);
      }
    }
  }
  if (failure !== undefined) throw wrap(failure, a.signal);
  return { ...outcome!, stages };
}

const NO_REASONING_TURN = "No reasoning was returned for this turn.";
const NO_REASONING_RUN = "No reasoning was recorded for this run.";

/** How much of a conversation's tool-calling turns came with reasoning from the provider. */
export function reasoningState(turns: readonly ConversationTurn[]): "returned" | "partial" | "none" {
  const calling = turns.filter((t) => t.calls.length > 0);
  const given = calling.filter((t) => t.reasoning.trim() !== "").length;
  return given === 0 ? "none" : given === calling.length ? "returned" : "partial";
}

/**
 * What the conversation says about who wrote it, so a skill traces to the model and settings behind its recording. The service
 * takes a conversation's metadata as an object of strings only (any other value is a 400), so the models and settings are
 * written as strings: `+`-joined names, and the settings as JSON text, as a tool call's input is.
 */
function conversationMetadata(rec: Recording): Record<string, string> {
  const providers = [...new Set(rec.models.map((m) => m.split("/")[0] as string))];
  return {
    source: "critic-loop",
    run: rec.label,
    recordingFormat: rec.conversation === null ? "placeholder" : "conversation",
    reasoning: rec.conversation === null ? "not-kept" : reasoningState(rec.conversation),
    model: rec.models.length === 0 ? "unknown" : rec.models.join("+"),
    provider: providers.length === 0 ? "unknown" : providers.join("+"),
    settings: rec.settings === null ? "none recorded" : JSON.stringify(rec.settings),
  };
}

interface Write {
  id: string;
  conv: string;
  nams: NamsApi;
  guard: <T>(p: Promise<T>) => Promise<T>;
}

/** The recording as the model lived it: its messages, a step for each turn that called tools, and each call under its step. */
async function recordConversation(w: Write, rec: Recording, turns: readonly ConversationTurn[]): Promise<void> {
  const byId = new Map(rec.calls.map((c) => [c.toolUseId, c]));
  for (const turn of turns) {
    if (turn.text.trim() !== "") await w.guard(w.nams.addMessage(w.id, w.conv, "assistant", turn.text));
    if (turn.calls.length === 0) continue;
    // The provider's reasoning; else what the model wrote that turn; else a fixed line. Never an account the harness made up.
    const reasoning = turn.reasoning.trim() !== "" ? turn.reasoning : turn.text.trim() !== "" ? turn.text : NO_REASONING_TURN;
    const step = await w.guard(w.nams.addStep(w.id, w.conv, { action: turn.calls.map((c) => c.tool).join(", "), reasoning }));
    for (const made of turn.calls) {
      const c = byId.get(made.id);
      if (c === undefined) continue; // a call that was not valid never reached the craft server, so it has no outcome to record
      await w.guard(w.nams.addToolCall(w.id, { tool: c.tool, input: JSON.stringify(c.args), output: c.output, status: c.ok ? "success" : "failure", durationMs: c.durationMs }, step.id));
    }
  }
}

/** A run made before conversations were kept: two messages and one step per distinct tool, with no reasoning, as the hooks recorded it. */
async function recordPlaceholder(w: Write, rec: Recording): Promise<void> {
  const steps = new Map<string, string>();
  for (const tool of new Set(rec.calls.map((c) => `mcp__craft__${c.tool}`))) steps.set(tool, (await w.guard(w.nams.addStep(w.id, w.conv, { action: tool, reasoning: NO_REASONING_RUN }))).id);
  for (const c of rec.calls) {
    const tool = `mcp__craft__${c.tool}`;
    await w.guard(w.nams.addToolCall(w.id, { tool, input: JSON.stringify(c.args), output: c.output, status: c.ok ? "success" : "failure", durationMs: c.durationMs }, steps.get(tool)!));
  }
  await w.guard(w.nams.addMessage(w.id, w.conv, "assistant", rec.finalAnswer));
}

/** Anything that is not already a typed harness error becomes one with fixed text; an abort becomes a cancellation. */
function wrap(e: unknown, signal: AbortSignal): HarnessError {
  if (e instanceof HarnessError) return e;
  if (signal.aborted) return new LoopCancelled();
  return new CandidateFailed("a call to the memory service failed", e);
}
