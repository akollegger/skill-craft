// The nams-reviewed harness (ADR-008, spec 009): the project's first pipeline as one harness. A session creates a managed NAMS workspace, records each run to it,
// and on distill has the service generate one skill from the named runs, downloads it, and runs the critic and reviser over it for up to three rounds.
// `close` deletes the workspace. The review is this harness's own business: the experiment does not require it of any harness.
import { CandidateFailed, HarnessError, LoopCancelled, NoSkillProduced, reasonOf, RoleFailed } from "../../harness/errors.js";
import { skillName } from "../../harness/skill.js";
import type { PriceQuote } from "../../harness/pricing.js";
import type { ModelSettings } from "../../harness/providers.js";
import type { RoleDriver } from "../../harness/role-driver.js";
import { canonicalSpec } from "../../harness/models.js";
import { NamsSession, type CandidateOutcome, type NamsSessionArgs, type NamsStage } from "../../loop/candidate.js";
import { runLoop, type LoopResult, type Stage as LoopStage } from "../../loop/loop.js";
import type { SkillPackage } from "../../loop/package.js";
import { PROCESS_VERSION } from "../../loop/process.js";
import type { Rubric } from "../../loop/rubric.js";
import type { Recording, RecordedCall } from "../../loop/transcript.js";
import type { NamsApi } from "../../loop/nams.js";
import type { DistillRequest, DistillResult, Harness, Refusal } from "../harness.js";
import { registerHarness } from "../registry.js";
import { HarnessSession } from "../session.js";
import type { Provenance, RunRecord, Skill, Stage } from "../schemas.js";

export interface NamsReviewedConfig {
  nams: NamsApi;
  /** Creating and deleting a workspace is a write to the account, so it needs the operator's explicit option. */
  allowWorkspace: boolean;
  /** The folder the harness keeps its working files in (`workspace.json`, `candidate/`, `generation.json`). */
  loopDir: string;
  format: "graph" | "prose";
  out: (line: string) => void;
  /** Ids this harness must never touch, such as the one development or experiment sessions record to. */
  forbiddenWorkspaceIds?: readonly string[] | undefined;
  pollMs?: number | undefined;
  maxWaitMs?: number | undefined;
  now?: (() => number) | undefined;
  rubric: Rubric;
  criticModel: string;
  reviserModel: string;
  role: RoleDriver;
  maxRounds: number;
  /** Spend cap for one role call. */
  maxUsd: number;
  /** Settings pinned per model, and each model's price. */
  settings?: Record<string, ModelSettings> | undefined;
  prices?: Record<string, PriceQuote> | undefined;
  /** The goal the runs are for: the critic is told which goals the recordings cover, and a run record does not name one. */
  goals: readonly { item: string; qty: number }[];
}

export const NAMS_REVIEWED = "nams-reviewed";

/** A run record as the critic's recording: what the roles read is the prompt, the calls and what came back, and the final answer. */
function toRecording(run: RunRecord, goal: { item: string; qty: number }): Recording {
  const calls: RecordedCall[] = run.turns
    .flatMap((t) => t.calls)
    .map((c, i) => ({ seq: i + 1, toolUseId: c.id, tool: c.tool, args: c.arguments, ok: c.status === "ok", output: c.output, ...(c.refusal === undefined ? {} : { error: c.refusal }), durationMs: 0 }));
  return {
    label: run.id, runDir: "", goal, world: "", models: run.models.resolved, requestedModel: run.models.requested, prompt: run.prompt, runLogSha256: "", scoreSha256: "",
    settings: run.settings, conversation: null, calls, callCount: calls.length, finalAnswer: run.finalAnswer,
  };
}

/** A skill package as a skill of the set. */
function skillOf(pkg: SkillPackage): Skill {
  const md = pkg["SKILL.md"] ?? "";
  const front = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? "";
  const description = /^description:\s*(.+)$/m.exec(front)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  return { name: skillName(md), description, files: Object.entries(pkg).map(([path, content]) => ({ path, content })) };
}

const namsStage = (s: NamsStage): Stage => ({ stage: s.stage, durationMs: s.durationMs, tokens: null, costUsd: null });
const loopStage = (s: LoopStage): Stage => ({ stage: s.stage, durationMs: s.durationMs, tokens: s.tokens, costUsd: s.costUsd, model: { requested: s.model.requested, resolved: s.model.resolved } });
const spendOf = (stages: readonly Stage[]): number | null => {
  const priced = stages.filter((s) => s.costUsd !== null);
  return priced.length === 0 ? null : priced.reduce((n, s) => n + (s.costUsd as number), 0);
};

class NamsReviewedSession extends HarnessSession {
  /** What the last distillation produced, for the command to write the loop's own files from. */
  candidate: CandidateOutcome | undefined;
  loop: LoopResult | undefined;
  private loopStages: Stage[] = [];

  /** The service's stages as they stand, then the roles', so a late stage (the deletion on close) is described too. */
  private get stages(): Stage[] {
    return [...this.nams.stages.map(namsStage), ...this.loopStages];
  }

  constructor(private readonly nams: NamsSession, private readonly c: NamsReviewedConfig) {
    super();
  }

  protected async onRecord(run: RunRecord): Promise<void> {
    await this.nams.recordRun(run);
  }

  protected async onDistill(request: DistillRequest, runs: readonly RunRecord[], signal: AbortSignal): Promise<DistillResult> {
    const c = this.c;
    const refuse = (code: Refusal["code"], reason?: string): Refusal => ({ ok: false, code, spendUsd: spendOf(this.stages), stages: this.stages, ...(reason === undefined ? {} : { reason }) });
    try {
      this.candidate = await this.nams.generate(request.runIds);
      const goal = c.goals[0] ?? { item: "", qty: 1 };
      const result = await runLoop({
        candidate: this.candidate.pkg, recordings: runs.map((r) => toRecording(r, goal)), rubric: c.rubric, criticModel: c.criticModel, reviserModel: c.reviserModel, role: c.role,
        maxRounds: c.maxRounds, maxUsd: request.maxUsd ?? c.maxUsd, signal, ...(c.now === undefined ? {} : { now: c.now }),
        ...(c.settings === undefined ? {} : { settings: c.settings }), ...(c.prices === undefined ? {} : { prices: c.prices }),
      });
      this.loop = result;
      this.loopStages = result.stages.map(loopStage);
      if (result.cancelled) return refuse("cancelled", result.reason);
      if (result.failed) return refuse(/spend cap/i.test(result.reason) ? "spend_limit" : "failed", result.reason);
      if (result.outcome === "reject" || result.final === undefined) return refuse("no_skill", result.reason);
      return { ok: true, skills: { skills: [skillOf(result.final)] }, stages: this.stages };
    } catch (e) {
      if (e instanceof LoopCancelled || signal.aborted) return refuse("cancelled", reasonOf(e instanceof HarnessError ? e : new LoopCancelled()));
      if (e instanceof NoSkillProduced) return refuse("no_skill", reasonOf(e));
      if (e instanceof CandidateFailed || e instanceof RoleFailed || e instanceof HarnessError) return refuse("failed", reasonOf(e));
      throw e;
    }
  }

  protected async onClose(): Promise<void> {
    await this.nams.close();
  }

  describe(): Provenance {
    const c = this.c;
    const loop = this.loop;
    const role = (requested: string, prefix: string) => {
      const resolved = [...new Set((loop?.stages ?? []).filter((s) => s.stage.startsWith(prefix) && s.model.resolved !== null).map((s) => s.model.resolved as string))];
      const key = canonicalSpec(requested);
      const pinned = Object.entries(c.settings ?? {}).find(([m]) => canonicalSpec(m) === key)?.[1];
      const price = Object.entries(c.prices ?? {}).find(([m]) => canonicalSpec(m) === key)?.[1];
      return { requested, resolved, settings: pinned === undefined ? null : { temperature: pinned.temperature ?? null, effort: pinned.effort ?? null, thinking: pinned.thinking ?? null }, price: price ?? null };
    };
    const stages = this.stages;
    const priced = stages.filter((s) => s.costUsd !== null).length;
    const tokens = (key: "input" | "output" | "cacheRead" | "cacheCreation") => {
      const given = stages.flatMap((s) => (s.tokens === null || s.tokens[key] === null ? [] : [s.tokens[key] as number]));
      return given.length === 0 ? null : given.reduce((a, b) => a + b, 0);
    };
    return {
      harness: { name: NAMS_REVIEWED, processVersion: PROCESS_VERSION },
      roles: { critic: role(c.criticModel, "critic"), reviser: role(c.reviserModel, "reviser") },
      prompts: { "review-rubric": { version: c.rubric.kindVersion ?? c.rubric.version, sha256: c.rubric.sha256 } },
      service: this.candidate?.info.service ?? null,
      retainedExternally: true,
      stages,
      spend: { costUsd: spendOf(stages), pricedStages: priced, unpricedStages: stages.length - priced, tokens: { input: tokens("input"), output: tokens("output"), cacheRead: tokens("cacheRead"), cacheCreation: tokens("cacheCreation") } },
      ...(loop === undefined ? {} : { review: { rounds: loop.rounds.map((r) => ({ n: r.n, skillSha256: r.skillSha256, overall: r.verdict.overall })), outcome: loop.outcome } }),
    };
  }
}

/** The harness; open it for one experiment. The session also exposes what the last distillation produced, for the command's files. */
export function namsReviewedHarness(config: NamsReviewedConfig): Harness {
  return {
    name: NAMS_REVIEWED,
    async open(_experimentId: string, signal: AbortSignal) {
      const args: NamsSessionArgs = { allowWorkspace: config.allowWorkspace, nams: config.nams, loopDir: config.loopDir, format: config.format, signal, out: config.out, now: config.now, forbiddenWorkspaceIds: config.forbiddenWorkspaceIds, pollMs: config.pollMs, maxWaitMs: config.maxWaitMs };
      return new NamsReviewedSession(await NamsSession.open(args), config);
    },
  };
}

export type { NamsReviewedSession };

registerHarness(NAMS_REVIEWED, (config) => namsReviewedHarness(config as NamsReviewedConfig));
