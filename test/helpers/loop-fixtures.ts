/** Small hand-made recordings, skill packages, verdicts and revisions for the loop's tests. */
import type { SkillPackage } from "../../src/loop/package.js";
import type { Recording } from "../../src/loop/transcript.js";
import { loadRubric } from "../../src/loop/rubric.js";

export const rubric = loadRubric();

export function recording(label: string, calls = 4, goal = { item: "thing", qty: 1 }): Recording {
  return {
    label,
    runDir: `runs/x/${label}`,
    goal,
    world: "worlds/test.json",
    models: ["claude-test-teacher"],
    prompt: `Your goal: end up holding one ${goal.item}. (run ${label} prompt)`,
    calls: Array.from({ length: calls }, (_, i) => ({
      seq: i + 1,
      tool: i === calls - 1 ? "craft" : "place",
      args: i === calls - 1 ? {} : { item: "a", row: 0, col: i },
      ok: true,
      output: `{"ok": true, "note": "output of call ${i + 1} in run ${label}"}`,
      durationMs: 5,
    })),
    callCount: calls,
    finalAnswer: `I hold the ${goal.item}.`,
  };
}

export const skillText = (marker: string, name = "craft-thing") =>
  `---\nname: ${name}\ndescription: Use when you need the thing. ${marker}\n---\n\n# The thing\n\nPlace A, then B. ${marker}\n`;

export const candidate = (marker = "OLD-TEXT-0"): SkillPackage => ({ "SKILL.md": skillText(marker), "references/domain.md": "# Domain\n\nGeneric notes.\n" });

export function verdict(overall: "accept" | "revise" | "reject", marker = "V") {
  return {
    overall,
    questions: Object.fromEntries(rubric.questions.map((q) => [q.id, { value: "no", reason: `reason ${marker}` }])),
    reasons: `Overall ${marker}.`,
    proposedRevisions: [`Add the chain ${marker}.`],
  };
}

export function revision(marker: string, sourceCalls: string[] = ["run 001 call 2"]) {
  return {
    skillMd: skillText(marker),
    provenanceMd: `# Where each fact comes from\n\n- chain: ${sourceCalls.join(", ") || "none"}\n`,
    changes: [{ what: `Added the chain ${marker}`, why: "the skill had no recipe", sourceCalls }],
  };
}
