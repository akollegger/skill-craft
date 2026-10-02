import type { FrameData, TraceLineData } from "../../../src/viz/contract.ts";

/** The playhead of one open table: a frame position and whether it is advancing. Presentation only. */
export interface PlaybackState {
  index: number;
  playing: boolean;
  length: number;
}

export type PlaybackAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "step"; by: number }
  | { type: "restart" }
  | { type: "scrub"; to: number };

/** A finished run opens at its start state, paused. */
export const initial = (length: number): PlaybackState => ({ index: 0, playing: false, length });

const clamp = (i: number, length: number): number => Math.max(0, Math.min(Math.max(0, length - 1), Math.trunc(i)));

export function reduce(s: PlaybackState, a: PlaybackAction): PlaybackState {
  const last = Math.max(0, s.length - 1);
  switch (a.type) {
    case "play":
      // Pressing play at the end plays the run again from its start.
      return s.index >= last && s.length > 1 ? { ...s, index: 0, playing: true } : { ...s, playing: true };
    case "pause":
      return { ...s, playing: false };
    case "toggle":
      return reduce(s, { type: s.playing ? "pause" : "play" });
    case "restart":
      return { ...s, index: 0, playing: false };
    case "scrub":
      return { ...s, index: clamp(a.to, s.length), playing: false };
    case "step": {
      const index = clamp(s.index + a.by, s.length);
      // Playing runs out at the last frame. A step the viewer takes while it plays is the playback's own.
      return { ...s, index, playing: s.playing && index < last };
    }
  }
}

export type KeyAction = PlaybackAction | { type: "close" };

export function keyAction(key: string): KeyAction | undefined {
  switch (key) {
    case " ": return { type: "toggle" };
    case "ArrowRight": return { type: "step", by: 1 };
    case "ArrowLeft": return { type: "step", by: -1 };
    case "r": return { type: "restart" };
    case "Escape": return { type: "close" };
    default: return undefined;
  }
}

/**
 * When each frame happened, in ms from the start of the session: zero for the start frame, then the end time of the
 * matching tool call. The trace's tool lines run in the order of the log's calls, so the nth line is the nth call.
 * Without a trace that covers every call there are no times.
 */
export function stepTimes(frames: readonly FrameData[], trace: readonly TraceLineData[]): (number | null)[] {
  const tools = trace.filter((l) => l.kind === "tool");
  if (tools.length !== frames.length - 1) return frames.map(() => null);
  return frames.map((_, i) => (i === 0 ? 0 : tools[i - 1]!.endMs));
}

const MIN_DELAY_MS = 100;
const MAX_DELAY_MS = 2000;
const STEADY_MS = 600;

/** How long to wait before showing frame `index` while playing: the time it took, capped so long pauses are skipped. */
export function delayBefore(times: readonly (number | null)[], index: number): number {
  const a = times[index - 1];
  const b = times[index];
  if (a == null || b == null) return STEADY_MS;
  return Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, b - a));
}
