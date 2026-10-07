import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fromRepoPath } from "../../src/harness/paths.js";
import { readLog } from "../../src/harness/read-log.js";
import { Game } from "../../src/sim/engine.js";
import { goalsPathFor, loadGoals } from "../../src/sim/goals.js";
import { loadWorld } from "../../src/sim/loader.js";
import type { World } from "../../src/sim/schema.js";
import type { RunLogEntry } from "../../src/sim/runlog.js";
import { RunCatalog } from "../../src/viz/catalog.js";
import { frameSchema, type FrameData } from "../../src/viz/contract.js";
import { finishedRun } from "../helpers/finished-run.js";

interface Seen {
  seq: number;
  grid: (string | null)[][];
  craftable: string | null;
  held: Record<string, number>;
}

/**
 * A replay that shares nothing with `deriveFrames`: it calls the engine itself for each logged call and reads the
 * table, the preview and the holdings straight from it.
 */
function independent(world: World, entries: readonly RunLogEntry[]): Seen[] {
  const game = new Game(world);
  const seen = (seq: number): Seen => {
    const p = game.preview();
    const held = Object.fromEntries(world.items.map((i) => [i.id, game.count(i.id)] as const).filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    return { seq, grid: p.grid, craftable: p.craftable, held };
  };
  const out = [seen(0)];
  for (const e of entries) {
    const a = e.args;
    if (e.tool === "place") game.place(String(a["item"]), Number(a["row"]), Number(a["col"]));
    else if (e.tool === "remove") game.remove(Number(a["row"]), Number(a["col"]));
    else if (e.tool === "clear") game.clear();
    else if (e.tool === "craft") game.craft();
    else if (e.tool === "look") game.look();
    else if (e.tool === "inventory") game.inventory();
    out.push(seen(e.seq));
  }
  return out;
}

const framesOf = (text: string | undefined): FrameData[] => (text ?? "").split("\n").filter(Boolean).map((l) => frameSchema.parse(JSON.parse(l)));
const view = (f: FrameData): Seen => ({ seq: f.seq, grid: f.grid, craftable: f.craftable, held: f.held });

describe("the frames a bundle carries", () => {
  const fixtures = readdirSync("test/fixtures/valid").filter((f) => f.endsWith(".json") && !f.includes(".goals."));

  it.each(fixtures)("equal a fresh replay of the log, step for step, on %s", async (file) => {
    const worldPath = join("test/fixtures/valid", file);
    const world = loadWorld(worldPath);
    const goal = loadGoals(goalsPathFor(worldPath), world)[0]!;
    const run = await finishedRun({ world: worldPath, goal: { item: goal.item, qty: goal.qty } });
    const snap = new RunCatalog(run.out).scan();
    const entry = snap.catalog.runs[0]!;
    expect(entry.status).toBe("ready");
    const frames = framesOf(snap.file(entry.id, "frames.jsonl"));
    const expected = independent(world, readLog(join(run.runDir, "run.jsonl")));
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.map(view)).toEqual(expected);
  });

  it("equal a fresh replay for a run with zero calls: the start frame only", async () => {
    const run = await finishedRun();
    writeFileSync(join(run.runDir, "run.jsonl"), "");
    const snap = new RunCatalog(run.out).scan();
    const entry = snap.catalog.runs[0]!;
    const frames = framesOf(snap.file(entry.id, "frames.jsonl"));
    expect(frames).toHaveLength(1);
    expect(frames.map(view)).toEqual(independent(loadWorld(run.world), []));
  });

  it("equal a fresh replay for every run on disk that can be opened", () => {
    if (!existsSync("runs")) return; // a clean checkout has no recorded runs; the fixtures above cover it
    const snap = new RunCatalog("runs").scan();
    for (const entry of snap.catalog.runs) {
      if (entry.status !== "ready" || entry.kind !== "run") continue;
      const [label, run] = [String(entry.attributes["label"]), String(entry.attributes["run"])];
      const dir = join("runs", label, run);
      if (!existsSync(join(dir, "mcp.json"))) continue; // nested deeper than label/run: not a layout this check knows
      const mcp = JSON.parse(readFileSync(join(dir, "mcp.json"), "utf8")) as { mcpServers: { craft: { env: { SIM_WORLD: string } } } };
      const world = loadWorld(fromRepoPath(mcp.mcpServers.craft.env.SIM_WORLD));
      const frames = framesOf(snap.file(entry.id, "frames.jsonl"));
      expect(frames.map(view), `${label}/${run}`).toEqual(independent(world, readLog(join(dir, "run.jsonl"))));
    }
  });
});
