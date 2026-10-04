import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { LoopRefused } from "../harness/errors.js";
import { REPO } from "../harness/paths.js";

/** The questions and the roles' instructions are one file, so one version and one hash cover what both roles are told. */
export const DEFAULT_RUBRIC_PATH = join(REPO, "src/loop/rubric/skill-review.v1.json");

const RubricFile = z.strictObject({
  version: z.string().min(1),
  questions: z
    .array(z.strictObject({ id: z.string().regex(/^[a-z][a-z_]*$/), text: z.string().min(1) }))
    .min(1),
  criticInstructions: z.string().min(1),
  reviserInstructions: z.string().min(1),
});

export interface Rubric extends z.infer<typeof RubricFile> {
  /** SHA-256 of the file's bytes. */
  sha256: string;
}

export function loadRubric(path: string = DEFAULT_RUBRIC_PATH): Rubric {
  const raw = readFileSync(path);
  let parsed: z.infer<typeof RubricFile>;
  try {
    parsed = RubricFile.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    throw new LoopRefused("the rubric file is not valid");
  }
  const ids = parsed.questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) throw new LoopRefused("the rubric has a duplicate question id");
  return { ...parsed, sha256: createHash("sha256").update(raw).digest("hex") };
}
