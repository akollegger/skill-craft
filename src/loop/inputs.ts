/**
 * The only place a role's prompt is assembled. A role has no tools, so what is built here is everything it can see:
 * the rubric, the goals, the recordings and the current skill, and for the reviser the current verdict. There is no
 * parameter that takes a path, a world, a file list or an earlier round, so the blindness FR-010 asks for is the shape
 * of these functions and not a rule a prompt has to be trusted to follow.
 */
import { LoopRefused } from "../harness/errors.js";
import { LIMITS, type SkillPackage } from "./package.js";
import type { Rubric } from "./rubric.js";
import { recordingText, recordingsChars, type Recording } from "./transcript.js";
import type { Verdict } from "./verdict.js";

export interface PromptParts {
  rubric: Rubric;
  goals: readonly { item: string; qty: number }[];
  recordings: readonly Recording[];
  pkg: SkillPackage;
}

export interface RolePrompt {
  system: string;
  prompt: string;
}

const FENCE = "````";

function common({ rubric, goals, recordings, pkg }: PromptParts): string[] {
  const out = [`# Rubric (version ${rubric.version})`, ""];
  rubric.questions.forEach((q, i) => out.push(`${i + 1}. ${q.id}: ${q.text}`));
  out.push("", "# Goals the recordings cover", "");
  for (const g of goals) out.push(`- ${g.item} x${g.qty}`);
  out.push("", "# Recordings", "");
  out.push(recordings.map(recordingText).join("\n---\n\n"));
  out.push("", "# The skill", "");
  for (const path of Object.keys(pkg).sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b)))) {
    out.push(`## File: ${path}`, "", FENCE, pkg[path]!.replace(/\n$/, ""), FENCE, "");
  }
  return out;
}

export function criticPrompt(parts: PromptParts): RolePrompt {
  return { system: parts.rubric.criticInstructions, prompt: `${common(parts).join("\n")}\n` };
}

export function reviserPrompt(parts: PromptParts & { verdict: Verdict }): RolePrompt {
  const { verdict } = parts;
  const lines = [...common(parts), "# The critic's verdict on this skill", "", `overall: ${verdict.overall}`, `reasons: ${verdict.reasons}`, "", "Answers to the rubric:"];
  for (const [id, a] of Object.entries(verdict.questions)) lines.push(`- ${id} (${a.value}): ${a.reason}`);
  lines.push("", "Proposed revisions:");
  for (const r of verdict.proposedRevisions) lines.push(`- ${r}`);
  return { system: parts.rubric.reviserInstructions, prompt: `${lines.join("\n")}\n` };
}

/** Refuse before any call when what a role would be given is larger than the limits (FR-025). */
export function checkSizes(recordings: readonly Recording[], pkg: SkillPackage): void {
  if (recordingsChars(recordings) > LIMITS.recordingsChars) {
    throw new LoopRefused(`the recordings exceed ${LIMITS.recordingsChars.toLocaleString("en-US")} characters`);
  }
  const bytes = Object.values(pkg).reduce((n, t) => n + Buffer.byteLength(t, "utf8"), 0);
  if (bytes > LIMITS.packageBytes) throw new LoopRefused("the skill package exceeds 64 KB");
}
