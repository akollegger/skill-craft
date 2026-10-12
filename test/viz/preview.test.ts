import { describe, expect, it } from "vitest";
import { buildBundle } from "../../src/harness/export.js";
import type { Frame } from "../../src/sim/frames.js";
import { previewOf } from "../../src/viz/preview.js";
import { finishedRun, DESCRIPTIONS } from "../helpers/finished-run.js";

const grid = (...cells: (string | null)[]) => [cells.slice(0, 2), cells.slice(2, 4)];
const frame = (seq: number, tool: string, ok: boolean, g: (string | null)[][], held: Record<string, number> = {}): Frame => ({
  seq, tool, args: {}, ok, grid: g, craftable: null, held, actions: 0, refusals: 0, reached: false,
});

describe("previewOf", () => {
  const empty = grid(null, null, null, null);

  it("has one character per action call and none for reads", () => {
    const frames = [
      frame(0, "start", true, empty),
      frame(1, "look", true, empty),
      frame(2, "place", true, grid("a", null, null, null), {}),
      frame(3, "place", false, grid("a", null, null, null)),
      frame(4, "inventory", true, grid("a", null, null, null)),
      frame(5, "craft", true, grid("d", null, null, null), { d: 1 }),
      frame(6, "remove", true, empty, { d: 1 }),
      frame(7, "clear", true, empty, { d: 1 }),
    ];
    expect(previewOf(frames).strip).toBe("pr" + "c" + "t" + ".");
  });

  it("marks a refused craft as a refusal", () => {
    expect(previewOf([frame(0, "start", true, empty), frame(1, "craft", false, empty)]).strip).toBe("r");
  });

  it("names the goal item when the run reached it, and not otherwise", () => {
    const reached = [frame(0, "start", true, empty), { ...frame(1, "craft", true, empty), reached: true }];
    expect(previewOf(reached, "e").made).toBe("e");
    expect(previewOf(reached).made).toBeUndefined();
    expect(previewOf([frame(0, "start", true, empty), frame(1, "craft", false, empty)], "e")).not.toHaveProperty("made");
  });

  it("takes the table from the last frame", () => {
    const last = grid("a", "b", null, "c");
    expect(previewOf([frame(0, "start", true, empty), frame(1, "place", true, last)]).table).toEqual(last);
  });

  it("is the start table and an empty strip for a run with no calls", () => {
    const p = previewOf([frame(0, "start", true, grid("a", null, null, null))]);
    expect(p.strip).toBe("");
    expect(p.table).toEqual(grid("a", null, null, null));
  });

  it("does not share its table with the frame", () => {
    const f = [frame(0, "start", true, grid("a", null, null, null))];
    const p = previewOf(f);
    p.table[0]![0] = "x";
    expect(f[0]!.grid[0]![0]).toBe("a");
  });

  it("matches the frames of a real run and leaks no description", async () => {
    const { runDir } = await finishedRun();
    const b = buildBundle(runDir);
    const p = previewOf(b.frames);
    expect(p.strip).toHaveLength(b.result.score.actionCalls);
    expect(p.strip).toMatch(/^[pcrt.]+$/);
    expect(p.table).toEqual(b.frames.at(-1)!.grid);
    for (const d of Object.values(DESCRIPTIONS)) expect(JSON.stringify(p)).not.toContain(d);
  });
});
