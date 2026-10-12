/**
 * Live check (spec 007, FR-013, SC-007): cancelling a run, by Ctrl-C and by its time limit, ends it as cancelled, writes the
 * summary and leaves no craft server process behind. It starts real runs on a cheap Fireworks model, so it runs only with
 * LIVE_SDK=1 and FIREWORKS_API_KEY:
 *   LIVE_SDK=1 pnpm vitest run test/live-cancel.test.ts
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { orphanServers, scriptArgs, skipUnlessKey, writeCheckRecord } from "./helpers/live.js";

const MODEL = "fireworks/nemotron-lightning-3p5-30b-a3b";
const common = (out: string, label: string) => ["--goal", "glirol", "--runs", "1", "--max-turns", "60", "--model", MODEL, "--out", out, "--label", label];
const summaryOf = (out: string, label: string) => JSON.parse(readFileSync(join(out, label, "summary.json"), "utf8")) as { cancelled: boolean; runs: { reason?: string; ended: string }[] };

describe.skipIf(skipUnlessKey("FIREWORKS_API_KEY"))("cancelling a real run", () => {
  it("ends five Ctrl-C'd runs as cancelled, with a summary and no orphaned craft server", async () => {
    const out = mkdtempSync(join(tmpdir(), "skill-craft-live-cancel-"));
    const before = new Set(orphanServers());
    for (let i = 1; i <= 5; i++) {
      const label = `sigint-${i}`;
      const child = spawn(process.execPath, scriptArgs("scripts/run-agent.ts", common(out, label)), { stdio: "ignore" });
      const code = await new Promise<number | null>((resolve) => {
        setTimeout(() => child.kill("SIGINT"), 6000);
        child.on("exit", (c) => resolve(c));
      });
      expect(code, `run ${i} exit code`).toBe(130);
      const s = summaryOf(out, label);
      expect(s.cancelled).toBe(true);
      expect(s.runs[0]?.reason?.startsWith("RunCancelled")).toBe(true);
    }
    await new Promise((r) => setTimeout(r, 1000));
    expect(orphanServers().filter((l) => !before.has(l))).toEqual([]);
  }, 300_000);

  it("ends five runs stopped by a very short time limit with the timeout reason, a summary and no orphaned craft server", async () => {
    const out = mkdtempSync(join(tmpdir(), "skill-craft-live-timeout-"));
    const before = new Set(orphanServers());
    for (let i = 1; i <= 5; i++) {
      const label = `timeout-${i}`;
      const res = spawnSync(process.execPath, scriptArgs("scripts/run-agent.ts", [...common(out, label), "--timeout-minutes", "0.05"]), { encoding: "utf8", timeout: 120_000 });
      expect(existsSync(join(out, label, "summary.json")), `run ${i} summary (exit ${res.status})`).toBe(true);
      expect(summaryOf(out, label).runs[0]?.reason?.startsWith("RunTimedOut")).toBe(true);
    }
    await new Promise((r) => setTimeout(r, 1000));
    expect(orphanServers().filter((l) => !before.has(l))).toEqual([]);
    writeCheckRecord(
      "live-check-cancel.md",
      `# Live check: cancelling a real run\n\nRun by \`test/live-cancel.test.ts\` (spec 007, T056).\n\n- Model: \`${MODEL}\` (cheap), goal glirol.\n- Five runs interrupted with SIGINT after 6 s: each exited 130, wrote a summary with \`cancelled: true\` and a \`RunCancelled\` reason.\n- Five runs with \`--timeout-minutes 0.05\`: each wrote a summary whose run reason starts \`RunTimedOut\`.\n- After all ten, no craft server process was left running (none reparented to init).\n`,
    );
  }, 300_000);
});
