/**
 * The `distill` command as a function (spec 009): arguments in, lines out, an exit code back. It builds a run record from each run folder, records them
 * with a named harness, distills over all of them, and writes the skill set, the sidecar and the provenance record. The script is a thin wrapper, so this
 * is what the tests drive, with scripted roles and a scripted memory service.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { canonicalSpec, checkSettings, loadSettings } from "../harness/models.js";
import { HarnessError, HarnessRefused, isUserError, LoopCancelled, LoopRefused, reasonOf, RunTimedOut } from "../harness/errors.js";
import { toRepoPath } from "../harness/paths.js";
import { priceSource, type PriceQuote, type PriceResolver } from "../harness/pricing.js";
import type { RoleDriver } from "../harness/role-driver.js";
import { recordedSettings } from "../harness/run.js";
import { checkSizes } from "../loop/inputs.js";
import { endedLoopResult, type LoopResult, type Stage as LoopStage } from "../loop/loop.js";
import { createMcpWorkspaceTools, createNamsClient, type NamsApi } from "../loop/nams.js";
import { packageFromFiles } from "../loop/package.js";
import { currentProcessInfo, recordingFormatOf, type ProcessInfo } from "../loop/process.js";
import { createLoopFolder, runPath, writeLoopRecord } from "../loop/record.js";
import { loadRubric } from "../loop/rubric.js";
import { assertSameTask, recordingsChars, replayRun, type Recording } from "../loop/transcript.js";
import { loadVersion } from "../prompts/index.js";
import { assertSet } from "../prompts/set.js";
import type { DistillResult, Harness, Session } from "./harness.js";
import { BESPOKE_ONE_SHOT, BESPOKE_PROCESS_VERSION, bespokeOneShotHarness } from "./harnesses/bespoke-one-shot.js";
import { NAMS_REVIEWED, namsReviewedHarness, type NamsReviewedSession } from "./harnesses/nams-reviewed.js";
import { buildDistillationRecord, writeDistillationRecord } from "./provenance.js";
import { assertHarnessKnown, harnessNames } from "./registry.js";
import { toRunRecord } from "./run-record.js";
import type { Provenance } from "./schemas.js";
import { writeSkillSet } from "./skill-set.js";

export interface DistillCliDeps {
  /** The role driver. Default: the AI SDK's, loaded only when a harness actually calls a model. */
  role?: RoleDriver | undefined;
  /** The memory service, for `nams-reviewed`. Default: the real client, built from `NAMS_API_KEY`. */
  nams?: NamsApi | undefined;
  /** Polling for the service's waits; tests make it fast. */
  namsWait?: { pollMs?: number; maxWaitMs?: number } | undefined;
  /** Aborting it ends the current call, writes the record and returns 130. */
  signal?: AbortSignal | undefined;
  env?: Record<string, string | undefined> | undefined;
  now?: (() => number) | undefined;
  /** Resolves the price a role's model is costed with. Default: a pin, else a market quote for a model with an alias. */
  pricing?: PriceResolver | undefined;
  /** Which code ran. Default: read from git. Tests pass a fixed answer. */
  processInfo?: (() => ProcessInfo) | undefined;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE =
  "usage: distill.ts --harness <name> --runs <run folder> [<run folder>...] [--allow-workspace]\n" +
  "       [--critic-model m] [--reviser-model m] [--distiller-model m] [--format graph|prose] [--max-rounds 1-3] [--max-role-usd n]\n" +
  "       [--timeout-minutes n] [--out distills] [--label name] [--settings <file>] [--experiment <folder>] [--dry-run]";

class UsageError extends Error {}

const cost = (c: number | null) => (c === null ? "-" : `$${c.toFixed(3)}`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function number(name: string, text: string | undefined, min: number, max = Infinity): number {
  const n = Number(text);
  if (!Number.isFinite(n) || n < min || n > max) throw new UsageError(`--${name} must be a number from ${min}${max === Infinity ? "" : ` to ${max}`}`);
  return n;
}

function roundLines(result: LoopResult): string[] {
  const stage = (name: string): LoopStage | undefined => result.stages.find((s) => s.stage === name);
  const lines: string[] = [];
  for (const r of result.rounds) {
    const c = stage(`critic-${r.n}`);
    if (c) lines.push(`round ${r.n}  critic ${c.model.resolved ?? c.model.requested}: ${r.verdict.overall}    ${cost(c.costUsd)} / ${secs(c.durationMs)}`);
    const v = stage(`reviser-${r.n}`);
    if (v && r.revision) lines.push(`round ${r.n}  reviser ${v.model.resolved ?? v.model.requested}: revised    ${cost(v.costUsd)} / ${secs(v.durationMs)}   sha256 ${r.revision.revisedSha256.slice(0, 12)}`);
  }
  return lines;
}

/** A provenance for a distillation that ended before its harness could describe itself. */
const bareProvenance = (name: string, processVersion: string, retainedExternally: boolean): Provenance => ({
  harness: { name, processVersion }, roles: {}, prompts: {}, service: null, retainedExternally, stages: [],
  spend: { costUsd: null, pricedStages: 0, unpricedStages: 0, tokens: { input: null, output: null, cacheRead: null, cacheCreation: null } },
});

export async function runDistillCli(argv: string[], deps: DistillCliDeps): Promise<number> {
  const env = deps.env ?? process.env;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        harness: { type: "string" },
        runs: { type: "string", multiple: true },
        "allow-workspace": { type: "boolean", default: false },
        format: { type: "string", default: "prose" },
        "critic-model": { type: "string" },
        "reviser-model": { type: "string" },
        "distiller-model": { type: "string" },
        "max-rounds": { type: "string", default: "3" },
        "max-role-usd": { type: "string", default: "1.00" },
        "timeout-minutes": { type: "string", default: "45" },
        out: { type: "string", default: "distills" },
        label: { type: "string" },
        settings: { type: "string" },
        experiment: { type: "string" },
        "dry-run": { type: "boolean", default: false },
      },
    });
    // Run folders may follow --runs without repeating it, in the order given.
    const runDirs = [...(values.runs ?? []), ...positionals];
    if (runDirs.length === 0 || values.harness === undefined) throw new UsageError(values.harness === undefined && runDirs.length > 0 ? `--harness is required\n${USAGE}` : USAGE);
    const harnessName = values.harness;
    assertHarnessKnown(harnessName);
    const format = values.format as string;
    if (format !== "graph" && format !== "prose") throw new UsageError("--format must be graph or prose");
    const maxRounds = number("max-rounds", values["max-rounds"], 1, 3);
    if (!Number.isInteger(maxRounds)) throw new UsageError("--max-rounds must be a whole number from 1 to 3");
    const maxUsd = number("max-role-usd", values["max-role-usd"], Number.MIN_VALUE);
    const timeoutMs = number("timeout-minutes", values["timeout-minutes"], Number.MIN_VALUE) * 60_000;
    const allowWorkspace = values["allow-workspace"] === true;
    if (harnessName === NAMS_REVIEWED && !allowWorkspace) throw new LoopRefused("nams-reviewed creates and deletes a managed workspace in the memory service's account, so it needs --allow-workspace");
    const key = env["NAMS_API_KEY"];

    // The runs: finished, replaying, one goal in one world.
    const recordings: Recording[] = [];
    for (const [i, dir] of runDirs.entries()) recordings.push(await replayRun(dir, String(i + 1).padStart(3, "0")));
    assertSameTask(recordings);

    const label = values.label ?? `distill-${recordings[0]!.goal.item}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const out = values.out as string;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) throw new LoopRefused("the label may hold letters, digits, dots, dashes and underscores only");
    if (existsSync(resolve(out, label))) throw new LoopRefused(`${toRepoPath(resolve(out, label))} already exists; choose a new --label`);

    const bespoke = harnessName === BESPOKE_ONE_SHOT;
    const teacherModels = [...new Set(recordings.flatMap((r) => r.models))];
    const fallback = teacherModels.length === 1 ? teacherModels[0] : undefined;
    // The models this harness uses: a critic and a reviser for `nams-reviewed` (they default to the teacher's model), the distiller for `bespoke-one-shot`.
    const roleModels: Record<string, string> = {};
    if (bespoke) {
      const model = values["distiller-model"];
      if (model === undefined) throw new UsageError("--distiller-model is required for bespoke-one-shot");
      roleModels["distiller"] = model;
    } else {
      const criticModel = values["critic-model"] ?? fallback;
      const reviserModel = values["reviser-model"] ?? fallback;
      if (criticModel === undefined || reviserModel === undefined) {
        throw new LoopRefused(`the recordings come from ${teacherModels.length === 0 ? "no named model" : "more than one model"}; set --critic-model and --reviser-model`);
      }
      roleModels["critic"] = criticModel;
      roleModels["reviser"] = reviserModel;
    }
    const models = [...new Set(Object.values(roleModels))];

    // Settings pinned per model (thinking, effort, temperature), as for a player: a role runs the way its model was calibrated.
    // A setting the model's provider does not take is refused here, before any call.
    const settings = values.settings === undefined ? undefined : loadSettings(values.settings);
    for (const model of models) {
      const pinned = settings?.[canonicalSpec(model)];
      if (pinned !== undefined) checkSettings(model, pinned);
    }

    // The models' prices are resolved before any call, once for a model that fills several roles. A model with none has no cost figure.
    const resolvePrice = deps.pricing ?? priceSource().resolve;
    const quotes = new Map<string, PriceQuote | undefined>();
    for (const model of models) quotes.set(model, await resolvePrice(canonicalSpec(model)));
    const roleSettings = (model: string) => {
      const pinned = settings?.[canonicalSpec(model)];
      return pinned === undefined ? null : recordedSettings(pinned);
    };
    const prices = Object.fromEntries([...quotes].flatMap(([model, q]) => (q === undefined ? [] : [[model, q] as const])));

    const rubric = loadRubric();
    const distillerPrompt = bespoke ? loadVersion("distiller", "1") : undefined;
    // An experiment that pins a prompt's version refuses a harness that would use another, before any call.
    if (values.experiment !== undefined) assertSet(values.experiment, bespoke ? { distiller: (distillerPrompt as { version: string }).version } : rubric.kindVersion === null ? {} : { reviewRubric: rubric.kindVersion });
    if (!bespoke && recordingsChars(recordings) > 0) checkSizes(recordings, packageFromFiles({ "SKILL.md": "---\nname: placeholder\ndescription: d\n---\nbody\n" }));

    if (values["dry-run"]) {
      const goal = recordings[0]!.goal;
      deps.out(`plan: ${recordings.length} run(s) of ${goal.item} x${goal.qty}`);
      recordings.forEach((r, i) => deps.out(`  run ${r.label}: ${toRepoPath(runDirs[i]!)}`));
      deps.out(`harness ${harnessName}`);
      if (bespoke) {
        deps.out(`distiller ${roleModels["distiller"]}; prompt distiller version ${(distillerPrompt as { version: string }).version}; spend cap ${cost(maxUsd)}`);
      } else {
        deps.out(`critic ${roleModels["critic"]}, reviser ${roleModels["reviser"]}; rubric version ${rubric.version}; at most ${maxRounds} rounds; spend cap ${cost(maxUsd)} per call`);
      }
      if (settings !== undefined) for (const model of models) deps.out(`settings ${canonicalSpec(model)}: ${JSON.stringify(settings[canonicalSpec(model)] ?? {})}`);
      deps.out(bespoke ? "distillation: one model call over the recordings; nothing is sent to a store" : `distillation: recorded to the memory service (NAMS: create a workspace, record, generate, download, delete; format ${format}), then reviewed`);
      deps.out(`output folder: ${toRepoPath(resolve(out, label))}`);
      return 0;
    }
    // A dry run makes no call, so only a real run needs the key.
    if (!bespoke && !key && deps.nams === undefined) throw new LoopRefused("NAMS_API_KEY is not set (it is read from the environment, never from an argument)");

    const stop = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; stop.abort(); }, timeoutMs);
    const relay = () => stop.abort();
    if (deps.signal?.aborted) stop.abort();
    else deps.signal?.addEventListener("abort", relay, { once: true });
    try {
      const dir = createLoopFolder(out, label, runDirs);
      const process = (deps.processInfo ?? currentProcessInfo)();
      const code = { commit: process.commit, dirty: process.dirty, changesSha256: process.changesSha256 };
      const role = deps.role ?? (await import("../harness/ai-driver.js")).aiRoleDriver;
      let tools: ReturnType<typeof createMcpWorkspaceTools> | undefined;
      let harness: Harness;
      if (bespoke) {
        const model = roleModels["distiller"] as string;
        const pinned = settings?.[canonicalSpec(model)];
        harness = bespokeOneShotHarness({ role, model, maxUsd, ...(pinned === undefined ? {} : { settings: pinned }), ...(quotes.get(model) === undefined ? {} : { price: quotes.get(model) as PriceQuote }), ...(deps.now === undefined ? {} : { now: deps.now }) });
      } else {
        const baseUrl = env["NAMS_BASE_URL"] || undefined;
        tools = deps.nams ? undefined : createMcpWorkspaceTools(key!, baseUrl);
        const nams = deps.nams ?? createNamsClient({ key: key!, baseUrl, tools: tools!, signal: stop.signal });
        harness = namsReviewedHarness({
          nams, allowWorkspace, loopDir: dir, format, out: deps.out, forbiddenWorkspaceIds: [env["NAMS_WORKSPACE_ID"] ?? ""], ...(deps.namsWait ?? {}), now: deps.now,
          rubric, criticModel: roleModels["critic"] as string, reviserModel: roleModels["reviser"] as string, role, maxRounds, maxUsd, ...(settings === undefined ? {} : { settings }), prices, goals: [recordings[0]!.goal],
        });
      }

      let session: Session | undefined;
      let result: DistillResult | undefined;
      let failure: HarnessError | undefined;
      try {
        session = await harness.open(label, stop.signal);
        for (const rec of recordings) await session.record(toRunRecord(rec), stop.signal);
        result = await session.distill({ runIds: recordings.map((r) => r.label), maxUsd }, stop.signal);
      } catch (e) {
        if (!(e instanceof HarnessError)) throw e; // every typed error from a harness ends the distillation with a record
        failure = e;
      } finally {
        await session?.close();
        await tools?.close?.();
      }

      const cancelled = failure !== undefined ? failure instanceof LoopCancelled || stop.signal.aborted : result?.ok === false && result.code === "cancelled";
      const reason = failure !== undefined ? reasonOf(failure) : undefined;
      const final: DistillResult = result ?? { ok: false, code: cancelled ? "cancelled" : "failed", spendUsd: null, stages: [] };
      const refusalReason = !final.ok ? final.reason : undefined;

      // `nams-reviewed` keeps the loop's own working files (rounds, verdicts, the accepted skill, `loop.json`), as the loop folder had them.
      let loop: LoopResult | undefined;
      if (!bespoke) {
        const named = session as NamsReviewedSession | undefined;
        loop = named?.loop ?? endedLoopResult(rubric, reason ?? refusalReason ?? "no skill was produced", { failed: !cancelled, cancelled });
        const criticModel = roleModels["critic"] as string;
        const reviserModel = roleModels["reviser"] as string;
        writeLoopRecord(loop, {
          dir, label, mode: "runs", runs: runDirs, models: { critic: criticModel, reviser: reviserModel }, stages: named?.candidate?.stages, process,
          recorded: recordings.map((r) => ({ label: r.label, run: runPath(r.runDir), runLogSha256: r.runLogSha256, scoreSha256: r.scoreSha256, models: r.models, settings: r.settings })),
          recordingFormat: recordingFormatOf(recordings), ...(named?.candidate === undefined ? {} : { distiller: { service: named.candidate.info.service }, candidate: named.candidate.info }),
          rolePrices: { critic: quotes.get(criticModel), reviser: quotes.get(reviserModel) }, roleSettings: { critic: roleSettings(criticModel), reviser: roleSettings(reviserModel) },
        });
      }
      if (final.ok) writeSkillSet(join(dir, "skills"), final.skills);
      const provenance = session?.describe() ?? bareProvenance(harnessName, bespoke ? BESPOKE_PROCESS_VERSION : process.version, !bespoke);
      const record = buildDistillationRecord(provenance, recordings, final, code);
      writeDistillationRecord(join(dir, "harness.json"), failure === undefined || reason === undefined ? record : { ...record, reason });

      if (loop !== undefined) for (const line of roundLines(loop)) deps.out(line);
      // A skill set already on disk is the outcome; the timer only decides the exit when distillation did not finish with one.
      if (timedOut && !final.ok) {
        deps.err(reasonOf(new RunTimedOut(timeoutMs)));
        deps.out(`files: ${toRepoPath(dir)}`);
        return 1;
      }
      if (failure !== undefined) {
        deps.err(reason as string);
        deps.out(`files: ${toRepoPath(dir)}`);
        return cancelled ? 130 : 1;
      }
      const why = loop?.reason || refusalReason;
      if (final.ok) deps.out(`outcome skill-set   ${final.skills.skills.length} skill(s): ${toRepoPath(join(dir, "skills"))}`);
      else deps.out(`outcome ${final.code}${why ? `  (${why})` : ""}`);
      if (!final.ok && (final.code === "failed" || final.code === "spend_limit")) deps.err(why || `distillation was refused: ${final.code}`);
      deps.out(`files: ${toRepoPath(dir)}`);
      return final.ok || final.code === "no_skill" ? 0 : final.code === "cancelled" ? 130 : 1;
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

export { harnessNames, HarnessRefused };
