import { describe, expect, it } from "vitest";
import { confettiBurst, effectsForStep, sceneAt } from "../src/scene/model.ts";
import type { FrameData } from "../../src/viz/contract.ts";

const grid = (...rows: string[]): (string | null)[][] => rows.map((r) => [...r].map((c) => (c === "." ? null : c)));
const f = (seq: number, tool: string, over: Partial<FrameData> = {}): FrameData => ({
  seq, tool, args: {}, ok: true, grid: grid("..", ".."), craftable: null, held: {}, actions: seq, refusals: 0, reached: false, ...over,
});

// a place, a refused place, a craft, a take-back, a clear, a read, and the goal
const frames: FrameData[] = [
  f(0, "start", { held: { a: 2 } }),
  f(1, "place", { args: { item: "a", row: 0, col: 0 }, grid: grid("a.", ".."), held: { a: 1 } }),
  f(2, "place", { args: { item: "zz", row: 1, col: 1 }, ok: false, error: "unknown_item", grid: grid("a.", ".."), held: { a: 1 }, refusals: 1 }),
  f(3, "look", { grid: grid("a.", ".."), held: { a: 1 }, refusals: 1, craftable: "d" }),
  f(4, "craft", { crafted: { item: "d", qty: 1 }, grid: grid("..", ".."), held: { a: 1, d: 1 }, refusals: 1 }),
  f(5, "place", { args: { item: "d", row: 1, col: 0 }, grid: grid("..", "d."), held: { a: 1 }, refusals: 1 }),
  f(6, "remove", { args: { row: 1, col: 0 }, grid: grid("..", ".."), held: { a: 1, d: 1 }, refusals: 1 }),
  f(7, "place", { args: { item: "a", row: 0, col: 1 }, grid: grid(".a", ".a"), held: { d: 1 }, refusals: 1, reached: true }),
  f(8, "clear", { grid: grid("..", ".."), held: { a: 2, d: 1 }, refusals: 1, reached: true }),
];

describe("sceneAt", () => {
  it("lays the sprites out by slot and sizes the board from the frame", () => {
    const s = sceneAt(frames, 1);
    expect(s).toMatchObject({ rows: 2, cols: 2, seq: 1 });
    expect(s.cells).toEqual(grid("a.", ".."));
  });

  it("shows an empty socket when nothing can be crafted, and the item when something can", () => {
    expect(sceneAt(frames, 1).output).toEqual({ state: "empty" });
    expect(sceneAt(frames, 3).output).toEqual({ state: "ready", item: "d" });
  });

  it("lists what is held, with counts, in a fixed order", () => {
    expect(sceneAt(frames, 4).hotbar).toEqual([{ item: "a", count: 1 }, { item: "d", count: 1 }]);
    expect(sceneAt(frames, 0).hotbar).toEqual([{ item: "a", count: 2 }]);
  });

  it("takes a frame by position and refuses one that is out of range", () => {
    expect(sceneAt(frames, 0).seq).toBe(0);
    expect(() => sceneAt(frames, 99)).toThrow(RangeError);
    expect(() => sceneAt(frames, -1)).toThrow(RangeError);
  });

  it("does not share its cells with the frame", () => {
    const s = sceneAt(frames, 1);
    s.cells[0]![0] = "x";
    expect(frames[1]!.grid[0]![0]).toBe("a");
  });
});

describe("effectsForStep", () => {
  it("names a placement with its item and slot", () => {
    expect(effectsForStep(frames, 0, 1)).toEqual([{ kind: "place", row: 0, col: 0, item: "a" }]);
  });

  it("shakes for a refused call", () => {
    expect(effectsForStep(frames, 1, 2)).toEqual([{ kind: "refuse" }]);
  });

  it("has none for a read", () => {
    expect(effectsForStep(frames, 2, 3)).toEqual([]);
  });

  it("names a craft with the item and quantity made", () => {
    expect(effectsForStep(frames, 3, 4)).toEqual([{ kind: "craft", item: "d", qty: 1 }]);
  });

  it("lifts the item a take-back removes, and one per item for a clear", () => {
    expect(effectsForStep(frames, 5, 6)).toEqual([{ kind: "lift", row: 1, col: 0, item: "d" }]);
    expect(effectsForStep(frames, 7, 8)).toEqual([
      { kind: "lift", row: 0, col: 1, item: "a" },
      { kind: "lift", row: 1, col: 1, item: "a" },
    ]);
  });

  it("adds the goal once, on the step that first holds it", () => {
    expect(effectsForStep(frames, 6, 7)).toEqual([{ kind: "place", row: 0, col: 1, item: "a" }, { kind: "goal" }]);
    expect(effectsForStep(frames, 7, 8).some((e) => e.kind === "goal")).toBe(false);
  });

  it("plays nothing when the same frame is shown again", () => {
    for (let i = 0; i < frames.length; i++) expect(effectsForStep(frames, i, i), String(i)).toEqual([]);
  });

  it("plays nothing for a jump, a step back, or a scrub", () => {
    expect(effectsForStep(frames, 0, 5)).toEqual([]);
    expect(effectsForStep(frames, 4, 3)).toEqual([]);
    expect(effectsForStep(frames, 8, 0)).toEqual([]);
  });
});

describe("confettiBurst", () => {
  const seeded = () => {
    let x = 0.123;
    return () => (x = (x * 9301 + 49297) % 233280 / 233280);
  };

  it("is a function of its random source: the same source gives the same burst", () => {
    expect(confettiBurst(seeded(), 30)).toEqual(confettiBurst(seeded(), 30));
  });

  it("makes the number of pieces asked for, each with a direction, a spin and a color index", () => {
    const burst = confettiBurst(seeded(), 12);
    expect(burst).toHaveLength(12);
    for (const p of burst) {
      expect(p.dy).toBeLessThan(0); // thrown upward first
      expect(Number.isFinite(p.dx + p.spin)).toBe(true);
      expect(Number.isInteger(p.color)).toBe(true);
    }
  });
});
