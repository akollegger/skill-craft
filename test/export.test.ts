import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { framesAfter, readBundle, traceAfter } from "../src/harness/bundle.js";
import { ExportRefused, ReplayFailed } from "../src/harness/errors.js";
import { exportBundle } from "../src/harness/export.js";
import { runExperiment } from "../src/harness/run.js";
import { Game } from "../src/sim/engine.js";
import { deriveFrames } from "../src/sim/frames.js";
import { loadWorld } from "../src/sim/loader.js";
import type { RunLogEntry } from "../src/sim/runlog.js";
import { fakePlayer, type FakePersonal, type FakePlayerOptions } from "./helpers/fake-player.js";
import { makeWorld } from "./helpers/worlds.js";

const PERSONAL: FakePersonal = { email: "zed.quill@invented.example", userId: "user_INVENTED_4471", accountIds: ["acct_INVENTED_aa11"], organizationId: "org_INVENTED_9090", sessionId: "sess-INVENTED-7777" };
const CHATTER = "SECRET-CHATTER-reasoning-0042";
const GOAL = { item: "e", qty: 1 };
const DESCRIPTIONS = { a: "DESC-A-raw", b: "DESC-B-raw", c: "DESC-C-raw", d: "DESC-D-made", e: "DESC-E-goal", s: "DESC-S-UNMET" };

/** A world file with distinctive descriptions, in a folder the test can delete. */
function worldFile(dir: string): string {
  const world = makeWorld({ name: "export-world", items: Object.entries(DESCRIPTIONS).map(([id, description]) => ({ id, description })) });
  const path = join(dir, "unique-world-file-xyz.json");
  writeFileSync(path, JSON.stringify(world));
  return path;
}

async function finishedRun(player: FakePlayerOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-export-"));
  const world = worldFile(dir);
  const out = join(dir, "runs");
  const res = await runExperiment({
    world, goal: GOAL, runs: 1, maxTurns: 12, out, label: "lab", record: false,
    driver: fakePlayer({ mode: "solve", goal: GOAL, personal: PERSONAL, agentText: CHATTER, models: ["fake-a"], ...player }),
  });
  const runDir = res.reports[0]?.dir as string;
  return { dir, world, runDir, dest: join(dir, "bundle"), report: res.reports[0]! };
}

const filesOf = (root: string) => readdirSync(root).sort();
const textOf = (root: string) => filesOf(root).map((f) => readFileSync(join(root, f), "utf8")).join("\n");

describe("exportBundle", () => {
  it("writes exactly bundle.json, frames.jsonl, trace.jsonl and score.json", async () => {
    const { runDir, dest } = await finishedRun();
    const res = exportBundle(runDir, dest);
    expect(filesOf(dest)).toEqual(["bundle.json", "frames.jsonl", "score.json", "trace.jsonl"]);
    expect(res.dest).toBe(dest);
  });

  it("has one frame per logged call plus the start, and carries the run's labels and model", async () => {
    const { runDir, dest, report } = await finishedRun();
    exportBundle(runDir, dest);
    const b = readBundle(dest);
    expect(b.frames).toHaveLength(report.score.totalCalls + 1);
    expect(b.manifest).toMatchObject({
      format: 1, label: "lab / 001", world: { name: "export-world", rows: 3, cols: 3 }, goal: GOAL,
      frames: report.score.totalCalls + 1, trace: "matched", model: { requested: null, resolved: ["fake-a"] },
    });
    expect(b.manifest.best).toMatchObject({ minCalls: expect.any(Number) });
    expect(b.result).toMatchObject({ ended: "stopped", measured: { trace: "matched" } });
    expect(b.result.score.reached).toBe(true);
    expect(b.trace.length).toBeGreaterThan(0);
  });

  it("reproduces every step with the run folder and the world file deleted", async () => {
    const { runDir, world, dest } = await finishedRun();
    const entries = readFileSync(join(runDir, "run.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RunLogEntry);
    const independent = deriveFrames(loadWorld(world), GOAL, entries);
    exportBundle(runDir, dest);
    rmSync(runDir, { recursive: true });
    rmSync(world);
    const b = readBundle(dest);
    expect(b.frames).toEqual(independent);
    expect(Game).toBeDefined(); // the bundle itself needs no engine: nothing above constructed one from the bundle
  });

  it("lets a consumer ask for frames and trace lines after a given number", async () => {
    const { runDir, dest } = await finishedRun();
    exportBundle(runDir, dest);
    const b = readBundle(dest);
    const n = Math.floor(b.frames.length / 2);
    expect(framesAfter(b, n)).toEqual(b.frames.slice(n + 1));
    expect(framesAfter(b, -1)).toEqual(b.frames);
    expect(framesAfter(b, b.frames.length - 1)).toEqual([]);
    const t = Math.floor(b.trace.length / 2);
    expect(traceAfter(b, t)).toEqual(b.trace.slice(t + 1));
  });

  it("holds no world file, item description, recipe, unmet item, identifier or agent text", async () => {
    const { runDir, dest } = await finishedRun();
    exportBundle(runDir, dest);
    const text = textOf(dest);
    expect(text).not.toContain("unique-world-file-xyz");
    for (const d of Object.values(DESCRIPTIONS)) expect(text, d).not.toContain(d);
    for (const recipe of ["r-d", "r-e", "r-s", "shapeless", "shaped"]) expect(text, recipe).not.toContain(recipe);
    expect(text).not.toMatch(/"s"/); // the item this run never placed, held, crafted or saw previewed
    for (const secret of [PERSONAL.email, PERSONAL.userId, PERSONAL.organizationId, PERSONAL.sessionId, CHATTER, "I hold it."]) expect(text, secret).not.toContain(secret);
    const result = JSON.parse(readFileSync(join(dest, "score.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(result).sort()).toEqual(["ended", "measured", "score", "turns"]); // no agent text, no top-level cost
  });

  it("exports a mismatched run with its frames and no measured figures or trace lines", async () => {
    const { runDir, dest } = await finishedRun({ dropToolEnd: 1 });
    exportBundle(runDir, dest);
    const b = readBundle(dest);
    expect(b.manifest.trace).toBe("mismatch");
    expect(b.result.measured).toMatchObject({ trace: "mismatch" });
    expect(b.result.measured).not.toHaveProperty("total");
    expect(b.frames.length).toBeGreaterThan(1);
    expect(b.trace).toEqual([]);
  });

  it("exports a run with no measurements with its frames and the call-based result", async () => {
    const { runDir, dest } = await finishedRun({ mode: "silent" });
    exportBundle(runDir, dest);
    const b = readBundle(dest);
    expect(b.manifest.trace).toBe("absent");
    expect(b.result.measured).toEqual({ trace: "absent" });
    expect(b.frames.length).toBeGreaterThan(1);
    expect(b.trace).toEqual([]);
  });
});

describe("exportBundle with a repository-relative world", () => {
  it("finds a world that mcp.json records relative to the repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-export-rel-"));
    const goal = { item: "c", qty: 1 };
    const res = await runExperiment({ world: "test/fixtures/valid/mirror-pair.json", goal, runs: 1, maxTurns: 12, out: join(dir, "runs"), label: "lab", record: false, driver: fakePlayer({ mode: "solve", goal }) });
    const runDir = res.reports[0]?.dir as string;
    const recorded = (JSON.parse(readFileSync(join(runDir, "mcp.json"), "utf8")) as { mcpServers: { craft: { env: Record<string, string> } } }).mcpServers.craft.env["SIM_WORLD"];
    expect(recorded).toBe("test/fixtures/valid/mirror-pair.json");
    const dest = join(dir, "bundle");
    exportBundle(runDir, dest);
    expect(readBundle(dest).frames.length).toBeGreaterThan(1);
  });
});

describe("exportBundle refuses", () => {
  it("an unfinished run, which has no score.json", async () => {
    const { runDir, dest } = await finishedRun();
    rmSync(join(runDir, "score.json"));
    expect(() => exportBundle(runDir, dest)).toThrow(ExportRefused);
    expect(() => exportBundle(runDir, dest)).toThrow(/unfinished/);
    expect(existsSync(dest)).toBe(false);
  });

  it("an existing destination, without touching it", async () => {
    const { runDir, dest } = await finishedRun();
    exportBundle(runDir, dest);
    const before = textOf(dest);
    expect(() => exportBundle(runDir, dest)).toThrow(/already exists/);
    expect(textOf(dest)).toBe(before);
  });

  it("a run whose world file is gone", async () => {
    const { runDir, world, dest } = await finishedRun();
    rmSync(world);
    expect(() => exportBundle(runDir, dest)).toThrow(/world file/);
    expect(existsSync(dest)).toBe(false);
  });

  it("a run that does not replay, leaving no folder behind, not even a temporary one", async () => {
    const { runDir, dest, dir } = await finishedRun();
    const log = join(runDir, "run.jsonl");
    writeFileSync(log, readFileSync(log, "utf8").replace('"ok":true', '"ok":false'));
    expect(() => exportBundle(runDir, dest)).toThrow(ReplayFailed);
    expect(existsSync(dest)).toBe(false);
    expect(readdirSync(dirname(dest)).filter((n) => n !== basename(runDir) && n.startsWith("bundle"))).toEqual([]);
    expect(readdirSync(dir).filter((n) => n.startsWith("bundle"))).toEqual([]);
  });
});
