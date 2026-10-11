/**
 * Live check (spec 007, FR-015): the critic loop end to end on the AI SDK roles. It spends real model usage (a Fireworks run
 * to make a teacher recording, then a Claude critic and reviser), so it runs only with LIVE_SDK=1 and both keys set:
 *   LIVE_SDK=1 pnpm vitest run test/live-critic-loop.test.ts
 * Candidate mode distils nothing through NAMS, so it writes nothing outside the output folders it is given.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptArgs, skipUnlessKey, writeCheckRecord } from "./helpers/live.js";

const skip = skipUnlessKey("FIREWORKS_API_KEY") || skipUnlessKey("ANTHROPIC_API_KEY");
const GOAL = "glirol";
const SKILL = "spikes/skill-pilot/craft-glirol";
const CRITIC = "anthropic/claude-haiku-4-5-20251001";
const TEACHER = "fireworks/gpt-oss-120b";

describe.skipIf(skip)("the critic loop on the AI SDK roles", () => {
  it("runs from a finished teacher run and a candidate skill to a recorded accept or reject", () => {
    const work = mkdtempSync(join(tmpdir(), "skill-craft-live-loop-"));
    // A teacher recording that reached the goal. gpt-oss-120b reached glirol in 2 of 5 runs in the spike and answers quickly (glm-5p3
    // reached it 5 of 5 but its responses took 20 to 40 seconds on the day this was first run), so make up to five and take the first that reached it.
    const teacher = spawnSync(process.execPath, scriptArgs("scripts/run-agent.ts", ["--goal", GOAL, "--runs", "5", "--max-turns", "40", "--model", TEACHER, "--out", join(work, "runs"), "--label", "rt-teacher", "--timeout-minutes", "5"]), { encoding: "utf8", timeout: 900_000 });
    expect(teacher.status, teacher.stderr).toBe(0);
    const reached = [1, 2, 3, 4, 5]
      .map((i) => join(work, "runs", "rt-teacher", String(i).padStart(3, "0")))
      .find((dir) => existsSync(join(dir, "score.json")) && (JSON.parse(readFileSync(join(dir, "score.json"), "utf8")) as { score: { reached: boolean } }).score.reached);
    expect(reached, "none of five teacher runs reached the goal, so the loop has no recording").toBeDefined();
    const runDir = reached as string;

    const loops = join(work, "loops");
    const loop = spawnSync(process.execPath, scriptArgs("scripts/critic-loop.ts", ["--runs", runDir, "--candidate", SKILL, "--max-rounds", "1", "--critic-model", CRITIC, "--reviser-model", CRITIC, "--max-role-usd", "0.5", "--out", loops, "--label", "rt-loop"]), { encoding: "utf8", timeout: 600_000 });
    expect(loop.status, loop.stderr).toBe(0);

    const record = JSON.parse(readFileSync(join(loops, "rt-loop", "loop.json"), "utf8")) as { outcome: string; rounds: unknown[]; failed: boolean; stages: { costUsd: number | null }[]; models: { critic: { requested: string; resolved: string[] } } };
    expect(["accept", "reject"]).toContain(record.outcome);
    expect(record.failed).toBe(false);
    expect(record.rounds.length).toBeGreaterThanOrEqual(1);
    expect(existsSync(join(loops, "rt-loop", "loop.json"))).toBe(true);
    expect(record.models.critic.resolved.every((m) => m.startsWith("anthropic/"))).toBe(true);

    const cost = record.stages.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
    writeCheckRecord(
      "live-check-critic-loop.md",
      `# Live check: the critic loop on the AI SDK roles\n\nRun by \`test/live-critic-loop.test.ts\` (spec 007, T052).\n\n- Teacher recording: \`scripts/run-agent.ts --goal ${GOAL} --runs 5 --model ${TEACHER}\`, the first run that reached the goal.\n- Loop: \`scripts/critic-loop.ts --candidate ${SKILL} --max-rounds 1\`, critic and reviser \`${CRITIC}\`.\n- Outcome: ${record.outcome} after ${record.rounds.length} round(s).\n- Role cost: $${cost.toFixed(3)} (models resolved to ${record.models.critic.resolved.join(", ")}).\n- No NAMS call: candidate mode.\n`,
    );
  }, 1_500_000);
});
