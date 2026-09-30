import { Game } from "./engine.js";
import type { RunLogEntry } from "./runlog.js";
import { solve, type SolverGoal } from "./solver.js";
import type { World } from "./schema.js";

/** Calls that change the table or the inventory. `help`, `inventory` and `look` are free. */
const ACTIONS = new Set(["place", "remove", "clear", "craft"]);

export const isAction = (tool: string): boolean => ACTIONS.has(tool);

export interface RunScore {
  goal: SolverGoal;
  /** Whether the agent ever held the goal. */
  reached: boolean;
  /** Every call in the log, including the free read-only ones. */
  totalCalls: number;
  /** Calls that change the table or the inventory: place, remove, clear and craft. */
  actionCalls: number;
  /** Action calls up to the moment the goal was first held; all of them if it never was. */
  callsToGoal: number;
  /** Crafts that succeeded, over the whole run. */
  craftsMade: number;
  /** Crafts that were refused (nothing matched). */
  failedCrafts: number;
  /** Refusals by code, over the whole run. */
  refusals: Record<string, number>;
  /** The best possible run for this goal, or null if the goal cannot be reached. */
  best: { minCrafts: number; minCalls: number; slack: number } | null;
  /** callsToGoal minus the best run's minimum calls; null unless the goal was reached. */
  extraCalls: number | null;
  /** Successful crafts up to the goal minus the best run's minimum crafts; null unless reached. */
  extraCrafts: number | null;
  /** Log `seq` of the entry after which the goal was first held; 0 if held before any call; null if never. */
  reachedSeq: number | null;
}

/** Thrown when a run log cannot be replayed on the given world. */
export class ReplayError extends Error {
  constructor(seq: number, tool: string, detail: string) {
    super(`run log entry ${seq} (${tool}) does not replay: ${detail}`);
    this.name = "ReplayError";
  }
}

/**
 * Apply one logged call to a game and check it behaves as the log says. Throws `ReplayError` when it does
 * not, so a log that does not match its world is an error, never a score. Shared by scoring and frames.
 */
export function replayEntry(game: Game, entry: RunLogEntry): { ok: boolean; error?: string } {
  const { args } = entry;
  const outcome = (() => {
    switch (entry.tool) {
      case "place": return game.place(String(args["item"]), Number(args["row"]), Number(args["col"]));
      case "remove": return game.remove(Number(args["row"]), Number(args["col"]));
      case "clear": return game.clear();
      case "craft": return game.craft();
      case "look": return game.look();
      case "inventory": return game.inventory();
      case "help": return { ok: true };
      default: throw new ReplayError(entry.seq, entry.tool, "unknown tool");
    }
  })();
  const ok = !("ok" in outcome && outcome.ok === false);
  if (ok !== entry.ok) throw new ReplayError(entry.seq, entry.tool, `logged ok=${entry.ok}, replay gave ok=${ok}`);
  return ok ? { ok } : { ok, ...("error" in outcome ? { error: String(outcome.error) } : {}) };
}

/**
 * Score a run from its log. The simulation is deterministic, so the log is replayed on a fresh game:
 * that shows whether and when the goal was first held, and it checks the log matches the world.
 */
export function scoreRun(world: World, goal: SolverGoal, entries: readonly RunLogEntry[]): RunScore {
  const game = new Game(world);
  const refusals: Record<string, number> = {};
  let actionCalls = 0;
  let craftsMade = 0;
  let failedCrafts = 0;
  // A goal that is already held at the start is reached with no calls.
  let reachedAt: { actions: number; crafts: number; seq: number } | null = game.count(goal.item) >= goal.qty ? { actions: 0, crafts: 0, seq: 0 } : null;

  for (const entry of entries) {
    const { ok, error } = replayEntry(game, entry);
    if (!ok && error !== undefined) refusals[error] = (refusals[error] ?? 0) + 1;
    if (isAction(entry.tool)) actionCalls++;
    if (entry.tool === "craft") ok ? craftsMade++ : failedCrafts++;
    if (reachedAt === null && game.count(goal.item) >= goal.qty) reachedAt = { actions: actionCalls, crafts: craftsMade, seq: entry.seq };
  }

  const solved = solve(world, goal);
  const best = solved.reachable ? { minCrafts: solved.minCrafts, minCalls: solved.minCalls, slack: solved.slack } : null;
  const reached = reachedAt !== null;
  return {
    goal,
    reached,
    totalCalls: entries.length,
    actionCalls,
    callsToGoal: reachedAt ? reachedAt.actions : actionCalls,
    craftsMade,
    failedCrafts,
    refusals,
    best,
    extraCalls: reachedAt && best ? reachedAt.actions - best.minCalls : null,
    extraCrafts: reachedAt && best ? reachedAt.crafts - best.minCrafts : null,
    reachedSeq: reachedAt ? reachedAt.seq : null,
  };
}
