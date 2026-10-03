import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReplayFailed, LoopRefused } from "../src/harness/errors.js";
import { runExperiment } from "../src/harness/run.js";
import { assertSameTask, recordingText, replayRun } from "../src/loop/transcript.js";
import { fakePlayer } from "./helpers/fake-player.js";

const WORLD = "test/fixtures/valid/mirror-pair.json";
const GOAL = { item: "c", qty: 1 };

async function made(mode: "solve" | "refuse", label: string, world = WORLD, goal = GOAL): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "skill-craft-transcript-"));
  const { dir } = await runExperiment({ world, goal, runs: 1, maxTurns: 12, out, label, record: false, driver: fakePlayer({ mode, goal }) });
  return join(dir, "001");
}

describe("replayRun", () => {
  it("returns the prompt, each call with its output and status, and the final answer", async () => {
    const run = await made("solve", "s");
    const rec = await replayRun(run, "001");
    expect(rec.label).toBe("001");
    expect(rec.goal).toEqual(GOAL);
    expect(rec.world).toContain("mirror-pair");
    expect(rec.prompt).toContain(GOAL.item);
    expect(rec.models.length).toBeGreaterThan(0);
    expect(rec.calls.length).toBeGreaterThan(2);
    expect(rec.callCount).toBe(rec.calls.length);
    expect(rec.calls[0]).toMatchObject({ seq: 1, tool: "help", ok: true });
    expect(rec.calls.every((c) => c.output.length > 0)).toBe(true);
    expect(rec.calls.at(-1)?.crafted).toBeDefined();
    expect(typeof rec.finalAnswer).toBe("string");
  });

  it("marks a refusal as refused, with the engine's own error code", async () => {
    const rec = await replayRun(await made("refuse", "r"), "001");
    const refused = rec.calls.filter((c) => !c.ok);
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every((c) => typeof c.error === "string")).toBe(true);
  });

  it("refuses a run whose log no longer replays, or whose logged craft differs from the replay", async () => {
    const run = await made("solve", "d");
    const lines = readFileSync(join(run, "run.jsonl"), "utf8").trim().split("\n");
    const i = lines.findIndex((l) => l.includes('"crafted"'));
    const entry = JSON.parse(lines[i]!);
    entry.crafted = { item: "wrong", qty: 9 };
    lines[i] = JSON.stringify(entry);
    writeFileSync(join(run, "run.jsonl"), `${lines.join("\n")}\n`);
    await expect(replayRun(run, "001")).rejects.toBeInstanceOf(ReplayFailed);
  });

  it("refuses a run whose trace does not match its log", async () => {
    const run = await made("solve", "t");
    const score = JSON.parse(readFileSync(join(run, "score.json"), "utf8"));
    score.measured.trace = "mismatched";
    writeFileSync(join(run, "score.json"), JSON.stringify(score));
    await expect(replayRun(run, "001")).rejects.toBeInstanceOf(ReplayFailed);
  });

  it("refuses a run folder that is unfinished", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-unfinished-"));
    appendFileSync(join(dir, "run.jsonl"), "");
    await expect(replayRun(dir, "001")).rejects.toBeInstanceOf(ReplayFailed);
  });
});

describe("recordingText", () => {
  it("holds the prompt, every call and every output, and nothing of the world file", async () => {
    const rec = await replayRun(await made("solve", "x"), "001");
    const text = recordingText(rec);
    expect(text).toContain(rec.prompt.trim());
    for (const c of rec.calls) {
      expect(text).toContain(`Call ${c.seq}: ${c.tool}`);
      expect(text).toContain(c.output.trim().split("\n")[0]!);
    }
    expect(text).toContain("Run 001");
    // What the agent saw, and no more: no recipe list or pattern from the world file.
    expect(text).not.toContain('"recipes"');
    expect(text).not.toContain('"pattern"');
  });
});

describe("assertSameTask", () => {
  it("accepts runs of one goal in one world and refuses a mix", async () => {
    const a = await replayRun(await made("solve", "a1"), "001");
    const b = await replayRun(await made("solve", "a2"), "002");
    expect(() => assertSameTask([a, b])).not.toThrow();
    expect(() => assertSameTask([a, { ...b, goal: { item: "d", qty: 1 } }])).toThrow(LoopRefused);
    expect(() => assertSameTask([a, { ...b, world: "worlds/forge.json" }])).toThrow(LoopRefused);
  });
});
