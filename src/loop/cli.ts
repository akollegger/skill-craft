import { parseArgs } from "node:util";
import { CandidateFailed, HarnessError, isUserError, LoopCancelled, LoopRefused, reasonOf, RunTimedOut } from "../harness/errors.js";
import { toRepoPath } from "../harness/paths.js";
import type { RoleDriver } from "../harness/role-driver.js";
import { checkSizes } from "./inputs.js";
import { obtainCandidate, type NamsStage } from "./candidate.js";
import { endedLoopResult, runLoop, type LoopResult, type Stage } from "./loop.js";
import { createMcpWorkspaceTools, createNamsClient, type NamsApi } from "./nams.js";
import { packageFromFiles, readPackage, type SkillPackage } from "./package.js";
import { createLoopFolder, writeLoopRecord } from "./record.js";
import { loadRubric } from "./rubric.js";
import { assertSameTask, recordingsChars, replayRun, type Recording } from "./transcript.js";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface LoopCliDeps {
  /** The role driver. Default: the Claude Agent SDK, loaded only when a loop actually runs. */
  role?: RoleDriver | undefined;
  /** The memory service, for runs-only mode. Default: the real client, built from `NAMS_API_KEY`. */
  nams?: NamsApi | undefined;
  /** Polling for the service's waits; tests make it fast. */
  namsWait?: { pollMs?: number; maxWaitMs?: number } | undefined;
  /** Aborting it ends the current role call, writes the record and returns 130. */
  signal?: AbortSignal | undefined;
  env?: Record<string, string | undefined> | undefined;
  now?: (() => number) | undefined;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE =
  "usage: critic-loop.ts --runs <run folder> [<run folder>...] (--candidate <folder> | --allow-workspace)\n" +
  "       [--format graph|prose] [--critic-model m] [--reviser-model m] [--max-rounds 1-3] [--max-role-usd n]\n" +
  "       [--timeout-minutes n] [--out loops] [--label name] [--dry-run]";

class UsageError extends Error {}

const pad = (n: number) => String(n).padStart(3, "0");
const cost = (c: number | null) => (c === null ? "-" : `$${c.toFixed(3)}`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function number(name: string, text: string | undefined, min: number, max = Infinity): number {
  const n = Number(text);
  if (!Number.isFinite(n) || n < min || n > max) throw new UsageError(`--${name} must be a number from ${min}${max === Infinity ? "" : ` to ${max}`}`);
  return n;
}

function roundLines(result: LoopResult): string[] {
  const stage = (name: string): Stage | undefined => result.stages.find((s) => s.stage === name);
  const lines: string[] = [];
  for (const r of result.rounds) {
    const c = stage(`critic-${r.n}`);
    if (c) lines.push(`round ${r.n}  critic ${c.model.resolved ?? c.model.requested}: ${r.verdict.overall}    ${cost(c.costUsd)} / ${secs(c.durationMs)}`);
    const v = stage(`reviser-${r.n}`);
    if (v && r.revision) lines.push(`round ${r.n}  reviser ${v.model.resolved ?? v.model.requested}: revised    ${cost(v.costUsd)} / ${secs(v.durationMs)}   sha256 ${r.revision.revisedSha256.slice(0, 12)}`);
  }
  return lines;
}

/**
 * The `critic-loop` command as a function: arguments in, lines out, an exit code back. The script is a thin wrapper,
 * so this is what the tests drive, with scripted roles and an abort signal.
 */
export async function runCriticLoopCli(argv: string[], deps: LoopCliDeps): Promise<number> {
  const env = deps.env ?? process.env;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        runs: { type: "string", multiple: true },
        candidate: { type: "string" },
        "allow-workspace": { type: "boolean", default: false },
        format: { type: "string", default: "prose" },
        "critic-model": { type: "string" },
        "reviser-model": { type: "string" },
        "max-rounds": { type: "string", default: "3" },
        "max-role-usd": { type: "string", default: "1.00" },
        "timeout-minutes": { type: "string", default: "45" },
        out: { type: "string", default: "loops" },
        label: { type: "string" },
        "dry-run": { type: "boolean", default: false },
      },
    });
    // Run folders may follow --runs without repeating it, in the order given.
    const runDirs = [...(values.runs ?? []), ...positionals];
    if (runDirs.length === 0) throw new UsageError(USAGE);
    const format = values.format as string;
    if (format !== "graph" && format !== "prose") throw new UsageError("--format must be graph or prose");
    const maxRounds = number("max-rounds", values["max-rounds"], 1, 3);
    if (!Number.isInteger(maxRounds)) throw new UsageError("--max-rounds must be a whole number from 1 to 3");
    const maxUsd = number("max-role-usd", values["max-role-usd"], Number.MIN_VALUE);
    const timeoutMs = number("timeout-minutes", values["timeout-minutes"], Number.MIN_VALUE) * 60_000;
    const candidateFolder = values.candidate;
    const allowWorkspace = values["allow-workspace"] === true;

    if (candidateFolder === undefined && !allowWorkspace) throw new LoopRefused("one of --candidate or --allow-workspace is required: --candidate starts from a skill folder, --allow-workspace distills one from the runs");
    const key = env["NAMS_API_KEY"];
    if (candidateFolder === undefined && !key) throw new LoopRefused("NAMS_API_KEY is not set (it is read from the environment, never from an argument)");

    // The runs: finished, replaying, one goal in one world.
    const recordings: Recording[] = [];
    for (const [i, dir] of runDirs.entries()) recordings.push(await replayRun(dir, pad(i + 1)));
    assertSameTask(recordings);

    const label = values.label ?? `loop-${recordings[0]!.goal.item}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const out = values.out as string;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) throw new LoopRefused("the label may hold letters, digits, dots, dashes and underscores only");
    if (existsSync(resolve(out, label))) throw new LoopRefused(`${toRepoPath(resolve(out, label))} already exists; choose a new --label`);

    const teacherModels = [...new Set(recordings.flatMap((r) => r.models))];
    const fallback = teacherModels.length === 1 ? teacherModels[0] : undefined;
    const criticModel = values["critic-model"] ?? fallback;
    const reviserModel = values["reviser-model"] ?? fallback;
    if (criticModel === undefined || reviserModel === undefined) {
      throw new LoopRefused(`the recordings come from ${teacherModels.length === 0 ? "no named model" : "more than one model"}; set --critic-model and --reviser-model`);
    }

    const rubric = loadRubric();
    const candidate = candidateFolder === undefined ? undefined : readPackage(candidateFolder);
    if (recordingsChars(recordings) > 0) checkSizes(recordings, candidate ?? packageFromFiles({ "SKILL.md": "---\nname: placeholder\ndescription: d\n---\nbody\n" }));

    if (values["dry-run"]) {
      const goal = recordings[0]!.goal;
      deps.out(`plan: ${recordings.length} run(s) of ${goal.item} x${goal.qty}`);
      recordings.forEach((r, i) => deps.out(`  run ${r.label}: ${toRepoPath(runDirs[i]!)}`));
      deps.out(`critic ${criticModel}, reviser ${reviserModel}; rubric version ${rubric.version}; at most ${maxRounds} rounds; spend cap ${cost(maxUsd)} per call`);
      deps.out(candidate ? `candidate: ${toRepoPath(candidateFolder!)} (no NAMS call will be made)` : `candidate: distilled from the runs (NAMS: create a workspace, record, generate, download, delete; format ${format})`);
      deps.out(`loop folder: ${toRepoPath(resolve(out, label))}`);
      return 0;
    }

    const stop = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; stop.abort(); }, timeoutMs);
    const relay = () => stop.abort();
    if (deps.signal?.aborted) stop.abort();
    else deps.signal?.addEventListener("abort", relay, { once: true });
    try {
      const dir = createLoopFolder(out, label, runDirs);
      let pkg = candidate;
      let stages: NamsStage[] = [];
      let info: unknown;
      const models = { critic: criticModel, reviser: reviserModel };
      if (pkg === undefined) {
        const baseUrl = env["NAMS_BASE_URL"] || undefined;
        const tools = deps.nams ? undefined : createMcpWorkspaceTools(key!, baseUrl);
        const nams = deps.nams ?? createNamsClient({ key: key!, baseUrl, tools: tools! });
        try {
          const got = await obtainCandidate({
            runs: recordings, format, allowWorkspace, nams, loopDir: dir, signal: stop.signal, out: deps.out, now: deps.now,
            forbiddenWorkspaceIds: [env["NAMS_WORKSPACE_ID"] ?? ""], ...(deps.namsWait ?? {}),
          });
          ({ pkg, stages, info } = got);
          checkSizes(recordings, pkg);
        } catch (e) {
          // The step has already deleted its workspace. The loop ends with nothing to review, and says why.
          if (!(e instanceof CandidateFailed || e instanceof LoopCancelled || e instanceof LoopRefused)) throw e;
          const cancelled = e instanceof LoopCancelled || stop.signal.aborted;
          writeLoopRecord(endedLoopResult(rubric, reasonOf(e), { failed: !cancelled, cancelled }), { dir, label, mode: "runs", runs: runDirs, models });
          if (timedOut) deps.err(reasonOf(new RunTimedOut(timeoutMs)));
          else deps.err(reasonOf(e));
          deps.out(`files: ${toRepoPath(dir)}`);
          return cancelled && !timedOut ? 130 : 1;
        } finally {
          await tools?.close?.();
        }
      }
      const role = deps.role ?? (await import("../harness/sdk-driver.js")).sdkRoleDriver;
      const result = await runLoop({
        candidate: pkg,
        recordings,
        rubric,
        criticModel,
        reviserModel,
        role,
        maxRounds,
        maxUsd,
        signal: stop.signal,
        ...(deps.now ? { now: deps.now } : {}),
      });
      writeLoopRecord(result, { dir, label, mode: candidate ? "candidate" : "runs", runs: runDirs, models, stages, ...(info === undefined ? {} : { candidate: info }) });

      for (const line of roundLines(result)) deps.out(line);
      if (timedOut) {
        deps.err(reasonOf(new RunTimedOut(timeoutMs)));
        deps.out(`files: ${toRepoPath(dir)}`);
        return 1;
      }
      if (result.failed) {
        deps.err(result.reason);
        deps.out(`files: ${toRepoPath(dir)}`);
        return 1;
      }
      deps.out(result.outcome === "accept" ? `outcome accept   skill: ${toRepoPath(join(dir, "skill"))}` : `outcome reject  (${result.reason})`);
      deps.out(`files: ${toRepoPath(dir)}`);
      return result.cancelled ? 130 : 0;
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener("abort", relay);
    }
  } catch (e) {
    if (e instanceof UsageError) deps.err(e.message);
    else if (e instanceof TypeError && /Unknown option|argument/i.test(e.message)) deps.err(`${e.message}\n${USAGE}`);
    else if (isUserError(e)) deps.err((e as Error).message);
    else deps.err(e instanceof HarnessError ? `${e.code}: ${e.message}` : "unexpected error");
    return 1;
  }
}
