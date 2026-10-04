import { z } from "zod";
import { RevisionInvalid, VerdictInvalid } from "../harness/errors.js";
import { skillName } from "../harness/skill.js";
import { hasCitation } from "./package.js";
import type { Rubric } from "./rubric.js";

export const OVERALL = ["accept", "revise", "reject"] as const;
export type Overall = (typeof OVERALL)[number];

/** The critic's answer. The keys of `questions` are exactly the rubric's ids. */
export interface Verdict {
  overall: Overall;
  questions: Record<string, { value: string; reason: string }>;
  reasons: string;
  proposedRevisions: string[];
}

export function verdictSchema(rubric: Rubric) {
  const answer = z.strictObject({ value: z.string().min(1).max(40), reason: z.string().max(400) });
  return z.strictObject({
    overall: z.enum(OVERALL),
    questions: z.strictObject(Object.fromEntries(rubric.questions.map((q) => [q.id, answer]))),
    reasons: z.string().max(800),
    proposedRevisions: z.array(z.string().max(300)).max(10),
  });
}

/** The error's message is fixed; the schema's issues (which can quote the agent) stay in `cause`. */
export function parseVerdict(rubric: Rubric, raw: unknown): Verdict {
  const parsed = verdictSchema(rubric).safeParse(raw);
  if (!parsed.success) throw new VerdictInvalid(parsed.error);
  return parsed.data as Verdict;
}

export interface Change {
  what: string;
  why: string;
  /** `run NNN call N`; empty when the change has no source. */
  sourceCalls: string[];
}

export interface Revision {
  skillMd: string;
  provenanceMd: string;
  changes: Change[];
}

/** What a revision's citations are checked against: the runs in the loop and how many calls each holds. */
export interface RevisionContext {
  candidateName: string;
  runs: { label: string; callCount: number }[];
}

const SOURCE = /^run (\d{3}) call (\d+)$/;
const FILE_CHARS = 32 * 1024;

export function revisionSchema(ctx: RevisionContext) {
  return z
    .strictObject({
      skillMd: z.string().min(1).max(FILE_CHARS),
      provenanceMd: z.string().min(1).max(FILE_CHARS),
      changes: z
        .array(z.strictObject({ what: z.string().min(1).max(400), why: z.string().min(1).max(400), sourceCalls: z.array(z.string().max(40)).max(20) }))
        .min(1)
        .max(30),
    })
    .superRefine((rev, issue) => {
      const bad = (message: string) => issue.addIssue({ code: "custom", message });
      try {
        if (skillName(rev.skillMd) !== ctx.candidateName) bad("the skill's name changed");
      } catch {
        bad("SKILL.md has no usable name");
      }
      const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(rev.skillMd);
      if (!/^description:\s*\S/m.test(match?.[1] ?? "")) bad("SKILL.md has no description");
      if ((match?.[2] ?? "").trim() === "") bad("SKILL.md has no body");
      if (hasCitation(rev.skillMd)) bad("SKILL.md holds a citation");
      for (const change of rev.changes) {
        for (const source of change.sourceCalls) {
          const m = SOURCE.exec(source);
          const run = ctx.runs.find((r) => r.label === m?.[1]);
          if (!m || !run || Number(m[2]) < 1 || Number(m[2]) > run.callCount) bad("a source names a call that is not in the recordings");
        }
      }
    });
}

export function parseRevision(raw: unknown, ctx: RevisionContext): Revision {
  const parsed = revisionSchema(ctx).safeParse(raw);
  if (!parsed.success) throw new RevisionInvalid(parsed.error);
  return parsed.data;
}

/** The JSON Schema the SDK is given to constrain a role's answer. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // The SDK refuses a schema that carries the `$schema` meta key (found by the live role check), so it is dropped.
  const { $schema: _meta, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/**
 * The harness's own record of what changed, below the reviser's provenance text: every change with the sources the harness
 * checked against the recordings. The reviser's text can say anything; this section cannot, so a rewrite always leaves a
 * checked record of what it changed and where each change came from.
 */
export function withChangeRecord(provenanceMd: string, changes: readonly Change[]): string {
  const base = provenanceMd.endsWith("\n") ? provenanceMd : `${provenanceMd}\n`;
  const rows = changes.map((c) => `- ${c.what}: ${c.sourceCalls.length === 0 ? "no source" : c.sourceCalls.join(", ")}`);
  return `${base}\n## Change record\n\nEvery change, with the sources the harness checked against the recordings.\n\n${rows.join("\n")}\n`;
}

/**
 * Below the reviser's own provenance text, list every change that has no source, so the next critic is asked to judge
 * it. The harness writes this section; the reviser cannot leave an unsourced change out by omission.
 */
export function withUncitedSection(provenanceMd: string, changes: readonly Change[]): string {
  const uncited = changes.filter((c) => c.sourceCalls.length === 0);
  if (uncited.length === 0) return provenanceMd;
  const base = provenanceMd.endsWith("\n") ? provenanceMd : `${provenanceMd}\n`;
  const rows = uncited.map((c) => `- ${c.what} (${c.why})`);
  return `${base}\n## Uncited changes\n\nThese changes have no recorded source.\n\n${rows.join("\n")}\n`;
}
