import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame } from "../sim/frames.js";
import type { RunScore } from "../sim/score.js";
import { linesAfter, readTrace, type TraceLine } from "../trace/lines.js";
import type { Measured } from "../trace/measure.js";
import type { ModelInfo } from "./run.js";

export interface BundleManifest {
  format: 1;
  /** The run's experiment label and number, such as `baseline / 001`. */
  label: string;
  world: { name: string; rows: number; cols: number };
  goal: { item: string; qty: number };
  best: { minCrafts: number; minCalls: number; slack: number } | null;
  /** Number of frames, including the start frame. */
  frames: number;
  trace: "matched" | "mismatch" | "absent";
  model: ModelInfo;
  /** The world's prior fit as the run recorded it. Absent in bundles exported before the visualizer. */
  priorFit?: string;
  /** The fixed sentence added to the prompt, when the run had one. */
  promptNote?: string;
  /** The skill the run had installed: its name, whether the agent loaded it and after how many calls. */
  skill?: { name: string; loaded: boolean; loadedAfter: number | null };
}

/** The run's result without the agent's own text. */
export interface BundleResult {
  ended: "stopped" | "budget" | "error";
  reason?: string;
  turns: number | null;
  score: RunScore;
  measured: Measured;
}

export interface Bundle {
  manifest: BundleManifest;
  frames: Frame[];
  trace: TraceLine[];
  result: BundleResult;
}

const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as T);

/** Read a bundle. It needs nothing but the bundle's own files: no world, no run log, no simulation. */
export function readBundle(dir: string): Bundle {
  return {
    manifest: JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8")) as BundleManifest,
    frames: readJsonl<Frame>(join(dir, "frames.jsonl")),
    trace: readTrace(join(dir, "trace.jsonl")),
    result: JSON.parse(readFileSync(join(dir, "score.json"), "utf8")) as BundleResult,
  };
}

/** The frames a consumer that has read up to `n` has not seen; all of them when `n` is negative. */
export const framesAfter = (bundle: Bundle, n: number): Frame[] => linesAfter(bundle.frames, n);

/** The trace lines after `n`, by the same rule. */
export const traceAfter = (bundle: Bundle, n: number): TraceLine[] => linesAfter(bundle.trace, n);
