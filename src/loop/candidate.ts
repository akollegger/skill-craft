/**
 * The first candidate skill from finished runs (spec 005, User Story 1): record the runs to a workspace this step creates,
 * have the distiller generate one skill from them, download it, and delete the workspace whatever happens. The roles never
 * see any of this; they get the package it returns.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CandidateFailed, HarnessError, LoopCancelled, LoopRefused, NoSkillProduced } from "../harness/errors.js";
import { checkSizes } from "./inputs.js";
import { packageFromFiles, writePackage, type SkillPackage } from "./package.js";
import { guarded, WorkspaceGuard, type NamsApi, type RunStatus, type ServiceVersion } from "./nams.js";
import { assertSameTask, type Recording } from "./transcript.js";
import { INVALID_CALL, toRunRecord } from "../distill/run-record.js";
import type { RunRecord } from "../distill/schemas.js";
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

/** What a session needs to open: the account option, the client, where to keep its files and the limits on waiting. */
export interface NamsSessionArgs {
  /** Creating and deleting a workspace is a write to the account, so it needs the operator's explicit option. */
  allowWorkspace: boolean;
  nams: NamsApi;
  /** The loop folder; the candidate is saved under `candidate/` and the workspace id in `workspace.json`. */
  loopDir: string;
  format: "graph" | "prose";
  signal: AbortSignal;
  out: (line: string) => void;
  now?: (() => number) | undefined;
  forbiddenWorkspaceIds?: readonly string[] | undefined;
  pollMs?: number | undefined;
  maxWaitMs?: number | undefined;
}

/**
 * One managed workspace and what is done in it, split along a harness session's operations (spec 009): `open` creates it, `recordRun` records one
 * run, `generate` has the service distil the named runs and downloads the skill, and `close` deletes it. `obtainCandidate` is these in order.
 */
export class NamsSession {
  readonly stages: NamsStage[] = [];
  private readonly conversations = new Map<string, string>();
  private capabilities: unknown;
  private deleted = false;

  private constructor(
    private readonly a: NamsSessionArgs,
    private readonly nams: NamsApi,
    readonly name: string,
    readonly id: string,
    private readonly writeWorkspace: (rec: { id: string | null; retired: boolean }) => void,
    private readonly now: () => number,
  ) {}

  private guard<T>(p: Promise<T>): Promise<T> {
    return p.catch((e: unknown) => {
      throw wrap(e, this.a.signal);
    });
  }

  private async timed<T>(stage: string, f: () => Promise<T>): Promise<T> {
    const startedAt = this.now();
    try {
      return await f();
    } finally {
      const endedAt = this.now();
      this.stages.push({ stage, startedAt, endedAt, durationMs: Math.max(0, endedAt - startedAt) });
    }
  }

  /** Create the workspace and wait until it answers. A failure after it exists deletes it before the error leaves. */
  static async open(a: NamsSessionArgs): Promise<NamsSession> {
    if (!a.allowWorkspace) throw new LoopRefused("creating a workspace needs --allow-workspace");
    const now = a.now ?? Date.now;
    const nams = guarded(a.nams, new WorkspaceGuard({ forbidden: a.forbiddenWorkspaceIds ?? [] }));
    const name = `${basename(a.loopDir)}-${now()}`;
    const file = join(a.loopDir, "workspace.json");
    const writeWorkspace = (rec: { id: string | null; retired: boolean }) => writeFileSync(file, `${JSON.stringify({ name, createdBy: "loop", ...rec }, null, 2)}\n`);
    // Written before the workspace exists, so a crash leaves a record of what the step meant to create.
    mkdirSync(a.loopDir, { recursive: true });
    writeWorkspace({ id: null, retired: false });

    const stages: NamsStage[] = [];
    const ws: { id: string | null } = { id: null };
    let opened: NamsSession | undefined;
    try {
      const startedAt = now();
      try {
        // Creating a workspace includes waiting until its database answers.
        ws.id = (await nams.createWorkspace(name)).id;
        writeWorkspace({ id: ws.id, retired: false });
        a.out(`workspace ${ws.id} created`);
        await nams.waitActive(ws.id, a.signal);
      } finally {
        const endedAt = now();
        stages.push({ stage: "create-workspace", startedAt, endedAt, durationMs: Math.max(0, endedAt - startedAt) });
      }
      opened = new NamsSession(a, nams, name, ws.id, writeWorkspace, now);
      opened.stages.push(...stages);
      opened.capabilities = await opened.guard(nams.capabilities(ws.id));
      return opened;
    } catch (e) {
      if (ws.id !== null) await (opened ?? new NamsSession(a, nams, name, ws.id, writeWorkspace, now)).close();
      throw wrap(e, a.signal);
    }
  }

  /** Record one run as a conversation. A second record of the same run id records nothing. */
  async recordRun(run: RunRecord, durationsMs?: readonly number[]): Promise<void> {
    if (this.conversations.has(run.id)) return;
    await this.timed(`record-run-${run.id}`, async () => {
      const conv = (await this.guard(this.nams.addConversation(this.id, conversationMetadata(run)))).id;
      await this.guard(this.nams.addMessage(this.id, conv, "user", run.prompt));
      const write: Write = { id: this.id, conv, nams: this.nams, guard: (p) => this.guard(p) };
      if (run.reasoning === "not-kept") await recordPlaceholder(write, run);
      else await recordConversation(write, run, durationsMs);
      // Only now is the conversation whole; a failure above leaves the run unrecorded, so a second record starts again.
      this.conversations.set(run.id, conv);
    });
    this.a.out(`recorded run ${run.id}`);
  }

  /** Have the service distil the named runs (all recorded here), wait for the skill, and download it. */
  async generate(runIds: readonly string[]): Promise<CandidateOutcome> {
    const a = this.a;
    const id = this.id;
    const conversationIds = runIds.map((r) => this.conversations.get(r) as string);
    await this.timed("wait-extraction", () => this.guard(this.nams.waitExtracted(id, conversationIds, a.signal)));

    let service: DistillerService = { name: "nams", unknown: "version_unavailable" };
    const { runId, run } = await this.timed("generate", async () => {
      const { runId } = await this.guard(this.nams.generateSkill(id, { conversationIds, procedureFormat: a.format }));
      a.out(`generating skill (run ${runId})`);
      // Read while generation runs, so it names the deployment that did the work. A failure is not a failed loop.
      service = await this.guard(this.nams.version()).then(
        (v): DistillerService => ({ name: "nams", version: v.version, released: v.released, commit: v.commit, environment: v.environment }),
        (e: unknown): DistillerService => {
          if (a.signal.aborted || e instanceof LoopCancelled) throw e;
          return { name: "nams", unknown: "version_unavailable" };
        },
      );
      const deadline = Date.now() + (a.maxWaitMs ?? 15 * 60_000);
      for (;;) {
        const run = await this.guard(this.nams.getRun(id, runId));
        if (classify(run) !== "pending") return { runId, run };
        if (Date.now() >= deadline) throw new CandidateFailed("the distiller did not finish in time");
        await sleep(a.pollMs ?? 5000, a.signal);
      }
    });

    const request = { scope: "conversations" as const, conversations: conversationIds.length, procedureFormat: a.format };
    const generation = { runId, skillId: run.skillId ?? null, format: a.format, request, status: run.status, failure: run.failure ?? null, gates: run.gates ?? null, capabilities: this.capabilities };
    // Beside the package folder, not in it: the archive is untrusted and may hold a file of the same name.
    writeFileSync(join(a.loopDir, "generation.json"), `${JSON.stringify(generation, null, 2)}\n`);
    if (classify(run) === "failed") {
      // The distiller's own reasons, as a code when it gave one; no retry (FR-007).
      const code = run.failure && /^[a-z][a-z_]*$/.test(run.failure) ? ` (${run.failure})` : "";
      throw new CandidateFailed(`the distiller reported ${run.status}${code}`);
    }
    if (!run.skillId) throw new NoSkillProduced();

    const bytes = await this.timed("download", () => this.guard(this.nams.downloadSkill(id, run.skillId!)));
    const pkg = packageFromFiles(stripRoot(readZip(bytes)));
    writePackage(join(a.loopDir, "candidate"), pkg);
    return {
      pkg,
      stages: this.stages,
      info: { workspace: { id, name: this.name }, runs: [...runIds], conversationIds, generation: { runId, skillId: run.skillId, format: a.format, status: run.status, gates: run.gates, request }, capabilities: this.capabilities, service },
    };
  }

  /** Delete the workspace, whatever happened. A failed delete is reported with the id and never hides the result. Safe to call twice. */
  async close(): Promise<void> {
    if (this.deleted) return;
    this.deleted = true;
    try {
      await this.timed("delete-workspace", () => this.nams.deleteWorkspace(this.id));
      this.writeWorkspace({ id: this.id, retired: true });
      this.a.out(`workspace ${this.id} deleted`);
    } catch {
      // Reported with the id, and never allowed to hide the loop's own result.
      this.a.out(`workspace ${this.id} could not be deleted; delete it by hand`);
    }
  }
}

export async function obtainCandidate(a: CandidateArgs): Promise<CandidateOutcome> {
  if (!a.allowWorkspace) throw new LoopRefused("creating a workspace needs --allow-workspace");
  assertSameTask(a.runs);
  const session = await NamsSession.open({ allowWorkspace: a.allowWorkspace, nams: a.nams, loopDir: a.loopDir, format: a.format, signal: a.signal, out: a.out, now: a.now, forbiddenWorkspaceIds: a.forbiddenWorkspaceIds, pollMs: a.pollMs, maxWaitMs: a.maxWaitMs });
  let failure: unknown;
  let outcome: CandidateOutcome | undefined;
  try {
    const records = a.runs.map(toRunRecord);
    for (const [i, r] of records.entries()) await session.recordRun(r, a.runs[i]!.calls.map((c) => c.durationMs));
    outcome = await session.generate(records.map((r) => r.id));
  } catch (e) {
    failure = e;
  } finally {
    await session.close();
  }
  if (failure !== undefined) throw wrap(failure, a.signal);
  return { ...outcome!, stages: session.stages };
}

const NO_REASONING_TURN = "No reasoning was returned for this turn.";
const NO_REASONING_RUN = "No reasoning was recorded for this run.";

/**
 * What the conversation says about who wrote it, so a skill traces to the model and settings behind its recording. The service
 * takes a conversation's metadata as an object of strings only (any other value is a 400), so the models and settings are
 * written as strings: `+`-joined names, and the settings as JSON text, as a tool call's input is.
 */
function conversationMetadata(run: RunRecord): Record<string, string> {
  const models = run.models.resolved;
  const providers = [...new Set(models.map((m) => m.split("/")[0] as string))];
  return {
    source: "critic-loop",
    run: run.id,
    recordingFormat: run.reasoning === "not-kept" ? "placeholder" : "conversation",
    reasoning: run.reasoning,
    model: models.length === 0 ? "unknown" : models.join("+"),
    provider: providers.length === 0 ? "unknown" : providers.join("+"),
    settings: run.settings === null ? "none recorded" : JSON.stringify(run.settings),
  };
}

interface Write {
  id: string;
  conv: string;
  nams: NamsApi;
  guard: <T>(p: Promise<T>) => Promise<T>;
}

/** The recording as the model lived it: its messages, a step for each turn that called tools, and each call under its step. The run record carries no timing, so a call's duration is the caller's if it has one, else 0. */
async function recordConversation(w: Write, run: RunRecord, durationsMs?: readonly number[]): Promise<void> {
  let n = 0; // the call's place in the run, to find its duration when the caller has them
  for (const turn of run.turns) {
    if (turn.text.trim() !== "") await w.guard(w.nams.addMessage(w.id, w.conv, "assistant", turn.text));
    if (turn.calls.length === 0) continue;
    // The provider's reasoning; else what the model wrote that turn; else a fixed line. Never an account the harness made up.
    const reasoning = turn.reasoning !== undefined && turn.reasoning.trim() !== "" ? turn.reasoning : turn.text.trim() !== "" ? turn.text : NO_REASONING_TURN;
    const step = await w.guard(w.nams.addStep(w.id, w.conv, { action: turn.calls.map((c) => c.tool).join(", "), reasoning }));
    for (const c of turn.calls) {
      // A call that never reached the craft server has no outcome to record; its step still names the tool it tried.
      if (c.refusal === INVALID_CALL) continue;
      await w.guard(w.nams.addToolCall(w.id, { tool: c.tool, input: JSON.stringify(c.arguments), output: c.output, status: c.status === "ok" ? "success" : "failure", durationMs: durationsMs?.[n++] ?? 0 }, step.id));
    }
  }
}

/** A run made before conversations were kept: two messages and one step per distinct tool, with no reasoning, as the hooks recorded it. */
async function recordPlaceholder(w: Write, run: RunRecord): Promise<void> {
  const calls = run.turns.flatMap((t) => t.calls);
  const steps = new Map<string, string>();
  for (const tool of new Set(calls.map((c) => `mcp__craft__${c.tool}`))) steps.set(tool, (await w.guard(w.nams.addStep(w.id, w.conv, { action: tool, reasoning: NO_REASONING_RUN }))).id);
  for (const c of calls) {
    const tool = `mcp__craft__${c.tool}`;
    await w.guard(w.nams.addToolCall(w.id, { tool, input: JSON.stringify(c.arguments), output: c.output, status: c.status === "ok" ? "success" : "failure", durationMs: 0 }, steps.get(tool)!));
  }
  await w.guard(w.nams.addMessage(w.id, w.conv, "assistant", run.finalAnswer));
}

/** How much of a conversation's tool-calling turns came with reasoning from the provider. */
export function reasoningState(turns: readonly ConversationTurn[]): "returned" | "partial" | "none" {
  const calling = turns.filter((t) => t.calls.length > 0);
  const given = calling.filter((t) => t.reasoning.trim() !== "").length;
  return given === 0 ? "none" : given === calling.length ? "returned" : "partial";
}

/** Anything that is not already a typed harness error becomes one with fixed text; an abort becomes a cancellation. */
function wrap(e: unknown, signal: AbortSignal): HarnessError {
  if (e instanceof HarnessError) return e;
  if (signal.aborted) return new LoopCancelled();
  return new CandidateFailed("a call to the memory service failed", e);
}
