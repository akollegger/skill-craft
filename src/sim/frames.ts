import { Game } from "./engine.js";
import type { RunLogEntry } from "./runlog.js";
import { isAction, replayEntry } from "./score.js";
import type { World } from "./schema.js";
import type { SolverGoal } from "./solver.js";

/** The state of a run after one call: what a viewer draws. `seq` 0 is the start, then the run log's `seq`. */
export interface Frame {
  seq: number;
  /** `start` for seq 0. */
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  error?: string;
  crafted?: { item: string; qty: number };
  grid: (string | null)[][];
  /** What `craft` would make from the table as it is now. */
  craftable: string | null;
  /** Only in worlds whose hints are `partial`. */
  partial?: boolean;
  /** Items held, by id, zero quantities omitted, keys sorted. */
  held: Record<string, number>;
  /** Action calls so far. */
  actions: number;
  refusals: number;
  /** Whether the goal is held. */
  reached: boolean;
}

/**
 * Replay a run log on its world and capture one frame per call, preceded by the start state. Deterministic,
 * and shares its replay with scoring, so a log that does not match its world is a `ReplayError` here too.
 * A frame names only what the run placed, held, crafted or saw previewed; it carries no recipe.
 */
export function deriveFrames(world: World, goal: SolverGoal, entries: readonly RunLogEntry[]): Frame[] {
  const game = new Game(world);
  let actions = 0;
  let refusals = 0;
  const frames: Frame[] = [];
  // Reaching the goal is history, as it is for scoring: it stays true if the agent later uses the item up.
  let reached = game.count(goal.item) >= goal.qty;

  const snapshot = (call: Pick<Frame, "seq" | "tool" | "args" | "ok"> & Partial<Pick<Frame, "error" | "crafted">>): void => {
    const p = game.preview();
    const held = Object.fromEntries(
      world.items
        .map((i) => [i.id, game.count(i.id)] as const)
        .filter(([, n]) => n > 0)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    frames.push({
      ...call,
      grid: p.grid,
      craftable: p.craftable,
      ...(p.partial === undefined ? {} : { partial: p.partial }),
      held,
      actions,
      refusals,
      reached,
    });
  };

  snapshot({ seq: 0, tool: "start", args: {}, ok: true });
  for (const entry of entries) {
    const { ok, error, crafted } = replayEntry(game, entry);
    if (isAction(entry.tool)) actions++;
    if (!ok) refusals++;
    reached = reached || game.count(goal.item) >= goal.qty;
    snapshot({
      seq: entry.seq,
      tool: entry.tool,
      args: entry.args,
      ok,
      ...(error === undefined ? {} : { error }),
      ...(crafted === undefined ? {} : { crafted }),
    });
  }
  return frames;
}
