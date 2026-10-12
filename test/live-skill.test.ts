/**
 * Live check (spec 007, SC-009): a real model plays a goal with a skill installed, and the run records whether it loaded the
 * skill through the Skill tool and after how many calls. Runs only with LIVE_SDK=1 and ANTHROPIC_API_KEY:
 *   LIVE_SDK=1 pnpm vitest run test/live-skill.test.ts
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptArgs, skipUnlessKey, writeCheckRecord } from "./helpers/live.js";

const SKILL = "spikes/skill-pilot/craft-glirol";
const MODEL = "anthropic/claude-haiku-4-5-20251001";

describe.skipIf(skipUnlessKey("ANTHROPIC_API_KEY"))("a real model with a skill installed", () => {
  it("records, for each run, whether the skill was loaded and after how many craft calls", () => {
    const out = mkdtempSync(join(tmpdir(), "skill-craft-live-skill-"));
    // The player runs the way its model was calibrated: the earlier runtime ran Haiku with a 31,999-token thinking budget.
    const settings = join(out, "settings.json");
    writeFileSync(settings, JSON.stringify({ [MODEL]: { thinking: 31999 } }));
    const res = spawnSync(process.execPath, scriptArgs("scripts/run-agent.ts", ["--goal", "glirol", "--runs", "3", "--max-turns", "40", "--model", MODEL, "--skill", SKILL, "--settings", settings, "--out", out, "--label", "rt-skill"]), { encoding: "utf8", timeout: 900_000 });
    expect(res.status, res.stderr).toBe(0);
    const scores = [1, 2, 3].map((i) => JSON.parse(readFileSync(join(out, "rt-skill", String(i).padStart(3, "0"), "score.json"), "utf8")) as { skill?: { name: string; invoked: boolean; loadedAfterCalls: number | null }; score: { reached: boolean }; costUsd: number | null });
    for (const s of scores) {
      expect(s.skill, "the run records the skill it had").toBeDefined();
      expect(typeof s.skill?.invoked).toBe("boolean");
      expect(s.skill?.invoked ? typeof s.skill.loadedAfterCalls : s.skill?.loadedAfterCalls).toBe(s.skill?.invoked ? "number" : null);
    }
    const loaded = scores.filter((s) => s.skill?.invoked).length;
    writeCheckRecord(
      "live-check-skill.md",
      `# Live check: a real model loading a skill through the Skill tool\n\nRun by \`test/live-skill.test.ts\` (spec 007, T055).\n\n- Command: \`scripts/run-agent.ts --goal glirol --runs 3 --model ${MODEL} --skill ${SKILL} --settings <thinking 31999 for Haiku>\`.\n- Loaded the skill in ${loaded} of 3 runs; after ${scores.map((s) => (s.skill?.invoked ? s.skill.loadedAfterCalls : "-")).join(", ")} craft calls.\n- Reached the goal in ${scores.filter((s) => s.score.reached).length} of 3 runs (not a result: three runs on one goal).\n- Cost: $${scores.reduce((a, s) => a + (s.costUsd ?? 0), 0).toFixed(3)}.\n`,
    );
  }, 1_000_000);
});
