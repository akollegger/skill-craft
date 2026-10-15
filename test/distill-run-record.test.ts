// Building a run record from a replayed finished run (spec 009, research R5).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toRunRecord } from "../src/distill/run-record.js";
import { runRecordSchema } from "../src/distill/schemas.js";
import { runExperiment } from "../src/harness/run.js";
import { replayRun } from "../src/loop/transcript.js";
import { fakePlayer } from "./helpers/fake-player.js";

const WORLD = "test/fixtures/valid/mirror-pair.json";
const GOAL = { item: "c", qty: 1 };

async function made(mode: "solve" | "refuse", label: string, personal = false): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "skill-craft-rr-"));
  const { dir } = await runExperiment({ world: WORLD, goal: GOAL, runs: 1, maxTurns: 12, out, label, driver: fakePlayer({ mode, goal: GOAL, ...(personal ? { agentText: "AGENT-TEXT-0042" } : {}) }) });
  return join(dir, "001");
}

describe("toRunRecord", () => {
  it("validates, and carries the prompt, models, settings, turns with reasoning, calls with regenerated outputs and the final answer", async () => {
    const run = await made("solve", "s");
    const rec = await replayRun(run, "001");
    const r = toRunRecord(rec);
    expect(runRecordSchema.safeParse(r).success).toBe(true);
    expect(r.id).toBe("001");
    expect(r.prompt).toBe(rec.prompt);
    expect(r.models.resolved).toEqual(rec.models);
    expect(r.finalAnswer).toBe(rec.finalAnswer);
    const calls = r.turns.flatMap((t) => t.calls);
    expect(calls.map((c) => c.tool)).toEqual(rec.calls.map((c) => c.tool));
    expect(calls.every((c) => c.output.length > 0)).toBe(true);
    expect(calls.every((c) => c.status === "ok" || c.status === "failed")).toBe(true);
    expect(r.turns.some((t) => t.reasoning !== undefined && t.reasoning !== "")).toBe(rec.conversation?.some((t) => t.reasoning !== "") ?? false);
  });

  it("holds none of the goal, the world path, the hashes or the timings of the recording", async () => {
    const rec = await replayRun(await made("solve", "x"), "001");
    const record = toRunRecord(rec);
    const text = JSON.stringify(record);
    expect(text).not.toContain(rec.world);
    expect(text).not.toContain(rec.runLogSha256);
    expect(text).not.toContain(rec.scoreSha256);
    // The keys, outside a call's arguments (which are the model's own), name no goal, score or timing.
    const keys: string[] = [];
    const walk = (v: unknown, inArgs = false): void => {
      if (Array.isArray(v)) return v.forEach((x) => walk(x, inArgs));
      if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (!inArgs) keys.push(k); walk(x, inArgs || k === "arguments"); }
    };
    walk(record);
    for (const k of keys) expect(k).not.toMatch(/duration|goal|reached|score|world|hash|sha/i);
  });

  it("marks a failed call and keeps the world's refusal text", async () => {
    const rec = await replayRun(await made("refuse", "r"), "001");
    const calls = toRunRecord(rec).turns.flatMap((t) => t.calls);
    const failed = calls.filter((c) => c.status === "failed");
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((c) => typeof c.refusal === "string" && c.refusal.length > 0)).toBe(true);
  });

  it("says no reasoning was returned for a run with no conversation file, and invents none", async () => {
    const run = await made("solve", "n");
    rmSync(join(run, "conversation.jsonl"), { force: true });
    const rec = await replayRun(run, "001");
    expect(rec.conversation).toBeNull();
    const r = toRunRecord(rec);
    expect(r.reasoning).toBe("not-kept");
    expect(r.turns.every((t) => t.reasoning === undefined)).toBe(true);
    expect(r.turns.flatMap((t) => t.calls)).toHaveLength(rec.calls.length);
  });

  it("says whether the turns returned reasoning in all, some or none", async () => {
    const rec = await replayRun(await made("solve", "q"), "001");
    const turns = rec.conversation!;
    const set = (reasonings: string[]) => ({ ...rec, conversation: turns.map((t, i) => ({ ...t, reasoning: reasonings[i % reasonings.length]! })) });
    expect(toRunRecord(set(["thought"])).reasoning).toBe("returned");
    expect(toRunRecord(set([""])).reasoning).toBe("none");
    if (turns.length > 1) expect(toRunRecord(set(["thought", ""])).reasoning).toBe("partial");
  });
});
