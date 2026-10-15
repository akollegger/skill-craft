// A prompt set (spec 008, ADR-007 amendment): the version of each prompt kind an experiment pins, and the check of what a run or a loop
// used against it. Pure; the harness, the loop and the report call it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PromptRefused } from "../harness/errors.js";

const version = z.string().regex(/^[1-9]\d*$/);

export const promptSetSchema = z.strictObject({
  base: version,
  callBudget: z.number().int().positive().optional(),
  armSentence: version.optional(),
  skillTool: version.optional(),
  reviewRubric: version.optional(),
  /** The bespoke harness's instructions (spec 009). */
  distiller: version.optional(),
});
export type PromptSet = z.infer<typeof promptSetSchema>;

/** What one run or loop used. `base` may be `custom` for an ad hoc template, which no pin can match. */
export interface UsedPrompts {
  base?: string;
  /** Present when the run states a call budget. */
  callBudget?: number;
  armSentence?: string;
  skillTool?: string;
  reviewRubric?: string;
  distiller?: string;
}

export function parsePromptSet(value: unknown): PromptSet {
  const parsed = promptSetSchema.safeParse(value);
  if (!parsed.success) throw new PromptRefused(`the prompt set is not valid: ${parsed.error.issues[0]?.path.join(".") || "it must name a base prompt version"}`);
  return parsed.data;
}

const LABEL = { base: "base prompt", armSentence: "arm sentence", skillTool: "skill tool", reviewRubric: "review rubric", distiller: "distiller prompt" } as const;

/**
 * The ways what was used differs from the set, as sentences naming the kind and both versions. A kind the set does not pin is not
 * checked, and a pinned kind that was not used (no loop, so no rubric) is not either.
 */
export function checkSet(set: PromptSet, used: UsedPrompts): string[] {
  const out: string[] = [];
  for (const kind of ["base", "armSentence", "skillTool", "reviewRubric", "distiller"] as const) {
    const pinned = set[kind];
    const got = used[kind];
    if (pinned !== undefined && got !== undefined && got !== pinned) out.push(`${LABEL[kind]} version ${got} differs from the experiment's ${pinned}`);
  }
  if (used.callBudget !== undefined && set.callBudget === undefined) out.push(`a call budget of ${used.callBudget} is used but the experiment pins none`);
  else if (used.callBudget !== undefined && set.callBudget !== undefined && used.callBudget !== set.callBudget) out.push(`call budget ${used.callBudget} differs from the experiment's ${set.callBudget}`);
  else if (used.callBudget === undefined && set.callBudget !== undefined && used.base !== undefined) out.push(`the experiment pins a call budget of ${set.callBudget} but this uses a step budget`);
  return out;
}

/** The prompt set an experiment folder's `summary.json` pins, or undefined when it pins none. A folder with no readable summary is refused. */
export function readExperimentSet(folder: string): PromptSet | undefined {
  const path = join(folder, "summary.json");
  if (!existsSync(path)) throw new PromptRefused("the experiment folder has no summary.json to read its prompt set from");
  let summary: unknown;
  try {
    summary = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new PromptRefused("the experiment's summary.json is not valid JSON");
  }
  const set = (summary as { promptSet?: unknown } | null)?.promptSet;
  return set === undefined ? undefined : parsePromptSet(set);
}

/** Refuse, before any spend, what an arm or a loop uses when it differs from the experiment's pinned set. */
export function assertSet(folder: string, used: UsedPrompts): void {
  const set = readExperimentSet(folder);
  const wrong = set === undefined ? undefined : checkSet(set, used)[0];
  if (wrong !== undefined) throw new PromptRefused(wrong);
}
