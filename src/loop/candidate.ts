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
import { guarded, WorkspaceGuard, type NamsApi, type RunStatus } from "./nams.js";
import { assertSameTask, type Recording } from "./transcript.js";
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

export interface CandidateOutcome {
  pkg: SkillPackage;
  stages: NamsStage[];
  /** Run ids, the format and the service's thresholds, for the loop record. */
  info: {
    workspace: { id: string; name: string };
    runs: string[];
    conversationIds: string[];
    generation: { runId: string; skillId: string; format: "graph" | "prose"; status: string; gates?: unknown };
    capabilities: unknown;
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
        const conv = (await guard(nams.addConversation(id, { source: "critic-loop", run: rec.label }))).id;
        conversationIds.push(conv);
        await guard(nams.addMessage(id, conv, "user", rec.prompt));
        // One step per distinct tool, as the hooks make, so the recording has the same shape.
        const steps = new Map<string, string>();
        for (const tool of new Set(rec.calls.map((c) => `mcp__craft__${c.tool}`))) steps.set(tool, (await guard(nams.addStep(id, conv, tool))).id);
        for (const c of rec.calls) {
          const tool = `mcp__craft__${c.tool}`;
          await guard(nams.addToolCall(id, { tool, input: JSON.stringify(c.args), output: c.output, status: c.ok ? "success" : "failure", durationMs: c.durationMs }, steps.get(tool)!));
        }
        await guard(nams.addMessage(id, conv, "assistant", rec.finalAnswer));
      });
      a.out(`recorded run ${rec.label}`);
    }

    await timed("wait-extraction", () => guard(nams.waitExtracted(id, conversationIds, a.signal)));

    const { runId, run } = await timed("generate", async () => {
      const { runId } = await guard(nams.generateSkill(id, { conversationIds, procedureFormat: a.format }));
      a.out(`generating skill (run ${runId})`);
      const deadline = Date.now() + (a.maxWaitMs ?? 15 * 60_000);
      for (;;) {
        const run = await guard(nams.getRun(id, runId));
        if (classify(run) !== "pending") return { runId, run };
        if (Date.now() >= deadline) throw new CandidateFailed("the distiller did not finish in time");
        await sleep(a.pollMs ?? 5000, a.signal);
      }
    });

    mkdirSync(join(a.loopDir, "candidate"), { recursive: true });
    const generation = { runId, skillId: run.skillId ?? null, format: a.format, status: run.status, failure: run.failure ?? null, gates: run.gates ?? null, capabilities };
    writeFileSync(join(a.loopDir, "candidate/generation.json"), `${JSON.stringify(generation, null, 2)}\n`);
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
      info: { workspace: { id, name }, runs: a.runs.map((r) => r.label), conversationIds, generation: { runId, skillId: run.skillId, format: a.format, status: run.status, gates: run.gates }, capabilities },
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

/** Anything that is not already a typed harness error becomes one with fixed text; an abort becomes a cancellation. */
function wrap(e: unknown, signal: AbortSignal): HarnessError {
  if (e instanceof HarnessError) return e;
  if (signal.aborted) return new LoopCancelled();
  return new CandidateFailed("a call to the memory service failed", e);
}
