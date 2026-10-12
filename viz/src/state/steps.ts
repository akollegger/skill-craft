import type { FrameData } from "../../../src/viz/contract.ts";

/**
 * A run's steps are its action calls: each one changes what the table shows, and the reads between them (look, inventory, help) do not.
 * These are the numbers behind the pips and the counter: which frame each step is, and how far a pull on the counter moves.
 */

/** The index of the frame each action call produced, in order: the frame where the run's action count first reaches 1, 2, 3 and so on. */
export function actionFrameIndices(frames: readonly FrameData[]): number[] {
  const out: number[] = [];
  let made = 0;
  frames.forEach((f, i) => {
    if (f.actions > made) {
      made = f.actions;
      out.push(i);
    }
  });
  return out;
}

/** The frame to show once `calls` action calls have been made: the start frame for none, else the frame of that call (the last, past the end). */
export function frameForCalls(actionFrames: readonly number[], calls: number): number {
  if (calls <= 0 || actionFrames.length === 0) return 0;
  return actionFrames[Math.min(calls, actionFrames.length) - 1]!;
}

const SWEEP_PX = 500; // a pull this long crosses a whole run, however long
const MIN_PX = 2;
const MAX_PX = 12;

/**
 * The number of calls to show after pulling the counter `dx` pixels from where it started with `startCalls` made. A short run takes a
 * wide pull per call and a long run a narrow one, so a sweep of the same length crosses either, and neither is a few pixels from end to end.
 */
export function scrubTarget(startCalls: number, dx: number, total: number): number {
  if (total <= 0) return 0;
  const perCall = Math.max(MIN_PX, Math.min(MAX_PX, SWEEP_PX / total));
  return Math.max(0, Math.min(total, Math.round(startCalls + dx / perCall)));
}
