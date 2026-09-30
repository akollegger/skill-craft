import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { deriveFrames } from "../src/sim/frames.js";
import { loadWorld } from "../src/sim/loader.js";
import type { RunLogEntry } from "../src/sim/runlog.js";
import { ReplayError } from "../src/sim/score.js";
import { makeWorld } from "./helpers/worlds.js";

const world = makeWorld(); // goal e: d from a+a, then e from d+b
const goal = { item: "e", qty: 1 };

function play(script: (g: Game) => void, w = world): RunLogEntry[] {
  const game = new Game(w);
  script(game);
  return game.log.entries;
}

/** A run with a free call, a refusal, a wrong craft, a right craft, and the goal at the end. */
const varied = (g: Game) => {
  g.record("help", {}, { ok: true });
  g.place("a", 0, 0);
  g.place("a", 0, 0); // refused: cell_occupied
  g.place("a", 0, 1);
  g.craft(); // d
  g.look();
  g.place("d", 1, 0);
  g.place("b", 1, 1);
  g.craft(); // e
  g.inventory();
};

/** Replay entries 1..n a different way from the library: straight through the engine, no shared code. */
function independent(entries: RunLogEntry[], n: number) {
  const g = new Game(world);
  let actions = 0;
  let refusals = 0;
  for (const e of entries.slice(0, n)) {
    const a = e.args;
    const out: object =
      e.tool === "place" ? g.place(String(a["item"]), Number(a["row"]), Number(a["col"]))
      : e.tool === "remove" ? g.remove(Number(a["row"]), Number(a["col"]))
      : e.tool === "clear" ? g.clear()
      : e.tool === "craft" ? g.craft()
      : e.tool === "look" ? g.look()
      : e.tool === "inventory" ? g.inventory()
      : { ok: true };
    if (["place", "remove", "clear", "craft"].includes(e.tool)) actions++;
    if ("ok" in out && out.ok === false) refusals++;
  }
  const p = g.preview();
  const held = Object.fromEntries(world.items.map((i) => [i.id, g.count(i.id)] as const).filter(([, c]) => c > 0));
  return { grid: p.grid, craftable: p.craftable, held, actions, refusals };
}

describe("deriveFrames", () => {
  const entries = play(varied);
  const frames = deriveFrames(world, goal, entries);

  it("returns a start frame and then one frame per log entry, with contiguous seq", () => {
    expect(frames).toHaveLength(entries.length + 1);
    expect(frames.map((f) => f.seq)).toEqual(frames.map((_, i) => i));
    expect(frames[0]).toMatchObject({ seq: 0, tool: "start", args: {}, ok: true, actions: 0, refusals: 0, reached: false });
  });

  it("makes frame n equal an independent replay of entries 1..n, for every n", () => {
    for (let n = 0; n <= entries.length; n++) {
      const f = frames[n];
      const want = independent(entries, n);
      expect({ grid: f?.grid, craftable: f?.craftable, held: f?.held, actions: f?.actions, refusals: f?.refusals }, `frame ${n}`).toEqual(want);
    }
  });

  it("carries the call, its outcome and what a craft made", () => {
    const refused = frames.find((f) => f.error !== undefined);
    expect(refused).toMatchObject({ tool: "place", ok: false, error: "cell_occupied" });
    const crafts = frames.filter((f) => f.tool === "craft");
    expect(crafts).toHaveLength(2);
    expect(crafts[0]?.crafted).toEqual({ item: "d", qty: 1 });
    expect(crafts[1]?.crafted).toEqual({ item: "e", qty: 1 });
    expect(frames.find((f) => f.tool === "look")?.args).toEqual({});
  });

  it("turns reached true at the goal-reaching frame and keeps it true", () => {
    const at = frames.findIndex((f) => f.reached);
    expect(frames[at]?.crafted).toEqual({ item: "e", qty: 1 });
    expect(frames.slice(at).every((f) => f.reached)).toBe(true);
    expect(frames.slice(0, at).every((f) => !f.reached)).toBe(true);
  });

  it("shows the preview: what the table could make after each change", () => {
    const afterPair = frames.find((f) => f.tool === "place" && f.args["col"] === 1);
    expect(afterPair?.craftable).toBe("d");
  });

  it("is deterministic across two calls", () => {
    expect(deriveFrames(world, goal, entries)).toEqual(frames);
  });

  it("has no partial field in a world whose hints are exact", () => {
    for (const f of frames) expect(f).not.toHaveProperty("partial");
  });

  it("has a partial field in a world whose hints are partial", () => {
    const partial = loadWorld("test/fixtures/valid/partial-hints.json");
    const first = Object.keys(partial.stock)[0] as string;
    const log = play((g) => g.place(first, 0, 0), partial);
    const fs = deriveFrames(partial, { item: "c", qty: 1 }, log);
    expect(fs[1]).toHaveProperty("partial");
    expect(typeof fs[1]?.partial).toBe("boolean");
  });

  it("is a start frame alone for an empty log, and reached when the goal is already held", () => {
    expect(deriveFrames(world, goal, [])).toHaveLength(1);
    expect(deriveFrames(world, { item: "a", qty: 1 }, [])[0]?.reached).toBe(true);
  });

  it("throws ReplayError for a log that does not replay", () => {
    const bad = play(varied).map((e, i) => (i === 1 ? { ...e, ok: false } : e));
    expect(() => deriveFrames(world, goal, bad)).toThrow(ReplayError);
    expect(() => deriveFrames(world, goal, [{ seq: 1, tool: "teleport", args: {}, ok: true }])).toThrow(ReplayError);
  });
});
