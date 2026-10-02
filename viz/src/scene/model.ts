import type { FrameData } from "../../../src/viz/contract.ts";

/**
 * The scene as pure data: what sits where, what the output slot shows, what is held, and which effects a step
 * calls for. The drawing layer reads this and nothing else, so the logic is tested without a renderer. Nothing here
 * reads a clock: the time at which an effect plays belongs to the drawing layer, and its random source is passed in.
 */
export interface SceneState {
  seq: number;
  rows: number;
  cols: number;
  /** Item ids by slot, `null` for an empty slot. A copy: changing it does not change the frame. */
  cells: (string | null)[][];
  /** The ghost of what `craft` would make now: an empty socket, or the item. */
  output: { state: "empty" } | { state: "ready"; item: string };
  hotbar: { item: string; count: number }[];
}

export function sceneAt(frames: readonly FrameData[], index: number): SceneState {
  const frame = frames[index];
  if (!frame) throw new RangeError(`no frame at ${index}`);
  return {
    seq: frame.seq,
    rows: frame.grid.length,
    cols: Math.max(0, ...frame.grid.map((r) => r.length)),
    cells: frame.grid.map((r) => [...r]),
    output: frame.craftable === null ? { state: "empty" } : { state: "ready", item: frame.craftable },
    hotbar: Object.entries(frame.held).filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([item, count]) => ({ item, count })),
  };
}

export type Effect =
  | { kind: "place"; row: number; col: number; item: string }
  | { kind: "lift"; row: number; col: number; item: string }
  | { kind: "craft"; item: string; qty: number }
  | { kind: "refuse" }
  | { kind: "goal" };

const ACTIONS = new Set(["place", "remove", "clear", "craft"]);

/**
 * The effects to play when the playhead moves from one frame to another. Only a single step forward plays anything;
 * the same frame again, a step back or a jump (a scrub, a restart) plays nothing, so effects never repeat and a
 * scrub does not fire a burst. Reads play nothing. The goal effect comes once, on the step that first holds it.
 */
export function effectsForStep(frames: readonly FrameData[], from: number, to: number): Effect[] {
  if (to !== from + 1) return [];
  const prev = frames[from];
  const next = frames[to];
  if (!prev || !next) return [];
  const out: Effect[] = [];
  if (ACTIONS.has(next.tool)) {
    if (!next.ok) out.push({ kind: "refuse" });
    else if (next.tool === "place") out.push({ kind: "place", row: Number(next.args["row"]), col: Number(next.args["col"]), item: String(next.args["item"]) });
    else if (next.tool === "craft" && next.crafted) out.push({ kind: "craft", item: next.crafted.item, qty: next.crafted.qty });
    else if (next.tool === "remove" || next.tool === "clear") {
      prev.grid.forEach((row, r) =>
        row.forEach((item, c) => {
          if (item !== null && next.grid[r]?.[c] == null) out.push({ kind: "lift", row: r, col: c, item });
        }),
      );
    }
  }
  if (!prev.reached && next.reached) out.push({ kind: "goal" });
  return out;
}

export interface ConfettiPiece {
  /** Horizontal and vertical speed in pixels per frame; vertical is negative: thrown upward first. */
  dx: number;
  dy: number;
  spin: number;
  /** An index into the colors the drawing layer chooses for the burst. */
  color: number;
  /** Frames the piece lives. */
  life: number;
}

/** A burst of confetti as data. The random source is passed in, so a test can fix it and the scene can seed it. */
export function confettiBurst(random: () => number, count: number): ConfettiPiece[] {
  return Array.from({ length: count }, () => ({
    dx: (random() - 0.5) * 4,
    dy: -(1 + random() * 3),
    spin: (random() - 0.5) * 0.4,
    color: Math.floor(random() * 6),
    life: 40 + Math.floor(random() * 40),
  }));
}
