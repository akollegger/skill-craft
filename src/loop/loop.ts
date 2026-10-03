import { LoopCancelled, reasonOf, RevisionInvalid, RoleFailed } from "../harness/errors.js";
import { skillName } from "../harness/skill.js";
import type { RoleDriver, RoleResult, RoleTokens } from "../harness/role-driver.js";
import { unifiedDiff } from "./diff.js";
import { checkSizes, criticPrompt, reviserPrompt, type RolePrompt } from "./inputs.js";
import { packageFromFiles, skillSha256, type SkillPackage } from "./package.js";
import type { Rubric } from "./rubric.js";
import type { Recording } from "./transcript.js";
import { parseRevision, parseVerdict, revisionSchema, toJsonSchema, verdictSchema, withUncitedSection, type Change, type Verdict } from "./verdict.js";

export interface LoopInput {
  candidate: SkillPackage;
  recordings: readonly Recording[];
  rubric: Rubric;
  criticModel: string;
  reviserModel: string;
  role: RoleDriver;
  /** At most this many critic reviews, 1 to 3. */
  maxRounds: number;
  /** Spend cap for one role call. */
  maxUsd: number;
  signal: AbortSignal;
  /** The harness clock, injectable so tests are exact. Default `Date.now`. */
  now?: () => number;
}

export interface Stage {
  stage: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  model: { requested: string; resolved: string | null };
  tokens: RoleTokens;
  costUsd: number | null;
}

export interface RoundResult {
  n: number;
  /** The package the round's critic reviewed. */
  pkg: SkillPackage;
  skillSha256: string;
  verdict: Verdict;
  revision?: { changes: Change[]; pkg: SkillPackage; revisedSha256: string; diff: string } | undefined;
}

export interface LoopResult {
  outcome: "accept" | "reject";
  /** Fixed text: a phrase for a normal end, `code: fixed message` for a failure. Never anything a role wrote. */
  reason: string;
  /** True when the loop stopped on an error rather than on a verdict or the round limit. */
  failed: boolean;
  cancelled: boolean;
  rounds: RoundResult[];
  /** The accepted package: the text the accepting critic reviewed. Absent unless the outcome is accept. */
  final?: SkillPackage | undefined;
  stages: Stage[];
  rubric: { version: string; sha256: string };
}

/** A loop that ended before any round, such as one whose candidate could not be obtained. */
export function endedLoopResult(rubric: Rubric, reason: string, extra: { failed: boolean; cancelled: boolean }): LoopResult {
  return { outcome: "reject", reason, failed: extra.failed, cancelled: extra.cancelled, rounds: [], stages: [], rubric: { version: rubric.version, sha256: rubric.sha256 } };
}

const MAIN = "SKILL.md";
const PROVENANCE = "references/provenance.md";

/** The change between two packages' two loop files, as one unified diff. */
function diffOf(from: SkillPackage, to: SkillPackage, fromLabel: string, toLabel: string): string {
  return [MAIN, PROVENANCE]
    .map((path) => unifiedDiff(from[path] ?? "", to[path] ?? "", { oldLabel: `${fromLabel}/${path}`, newLabel: `${toLabel}/${path}` }))
    .filter((d) => d !== "")
    .join("");
}

/**
 * Up to `maxRounds` critic reviews. On `revise` (and a round left), a reviser edits the package and the next round's
 * critic reviews the result from scratch. The loop ends in `accept`, or `reject`: the critic's, or the round limit's.
 * An error or an abort ends it too, with the rounds finished so far kept. Pure over its inputs and the role seam.
 */
export async function runLoop(input: LoopInput): Promise<LoopResult> {
  const now = input.now ?? Date.now;
  const { rubric, signal } = input;
  const rounds: RoundResult[] = [];
  const stages: Stage[] = [];
  const result = (outcome: LoopResult["outcome"], reason: string, extra: { failed?: boolean; cancelled?: boolean; final?: SkillPackage } = {}): LoopResult => ({
    outcome,
    reason,
    failed: extra.failed ?? false,
    cancelled: extra.cancelled ?? false,
    rounds,
    ...(extra.final ? { final: extra.final } : {}),
    stages,
    rubric: { version: rubric.version, sha256: rubric.sha256 },
  });

  /** One role call, timed and recorded. A failure is a typed error; an abort is a cancellation. */
  async function call(stage: string, model: string, prompt: RolePrompt, schema: Record<string, unknown>): Promise<RoleResult> {
    const startedAt = now();
    const r = await input.role({ prompt: prompt.prompt, system: prompt.system, model, schema, maxUsd: input.maxUsd, signal });
    const endedAt = now();
    stages.push({ stage, startedAt, endedAt, durationMs: Math.max(0, endedAt - startedAt), model: { requested: r.requestedModel, resolved: r.resolvedModel }, tokens: r.tokens, costUsd: r.costUsd });
    if (!r.ok) {
      if (signal.aborted) throw new LoopCancelled();
      throw new RoleFailed(r.reason ?? "DriverFailed: the role failed");
    }
    return r;
  }

  try {
    let pkg = input.candidate;
    const goals = [...new Map(input.recordings.map((r) => [`${r.goal.item}:${r.goal.qty}`, r.goal])).values()];
    const ctx = { candidateName: skillName(pkg[MAIN] ?? ""), runs: input.recordings.map((r) => ({ label: r.label, callCount: r.callCount })) };
    const criticSchema = toJsonSchema(verdictSchema(rubric));
    const reviserSchema = toJsonSchema(revisionSchema(ctx));
    checkSizes(input.recordings, pkg);

    for (let n = 1; n <= input.maxRounds; n++) {
      if (signal.aborted) throw new LoopCancelled();
      const parts = { rubric, goals, recordings: input.recordings, pkg };
      const verdict = parseVerdict(rubric, (await call(`critic-${n}`, input.criticModel, criticPrompt(parts), criticSchema)).answer);
      const round: RoundResult = { n, pkg, skillSha256: skillSha256(pkg), verdict };
      rounds.push(round);

      if (verdict.overall === "accept") return result("accept", "the critic accepted the skill", { final: pkg });
      if (verdict.overall === "reject") return result("reject", "the critic rejected the skill");
      if (n === input.maxRounds) return result("reject", "round limit reached");
      if (signal.aborted) throw new LoopCancelled();

      const revision = parseRevision((await call(`reviser-${n}`, input.reviserModel, reviserPrompt({ ...parts, verdict }), reviserSchema)).answer, ctx);
      let next: SkillPackage;
      try {
        next = packageFromFiles({ [MAIN]: revision.skillMd, [PROVENANCE]: withUncitedSection(revision.provenanceMd, revision.changes) });
      } catch (e) {
        // A revision that parsed but cannot be packaged (for example, over a size limit) is an invalid revision.
        throw new RevisionInvalid(e);
      }
      round.revision = { changes: revision.changes, pkg: next, revisedSha256: skillSha256(next), diff: diffOf(pkg, next, `round-${n}`, `round-${n + 1}`) };
      pkg = next;
    }
    return result("reject", "round limit reached");
  } catch (e) {
    if (e instanceof LoopCancelled || signal.aborted) return result("reject", reasonOf(new LoopCancelled()), { cancelled: true });
    return result("reject", reasonOf(e), { failed: true });
  }
}
