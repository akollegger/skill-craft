import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { deriveFrames } from "../sim/frames.js";
import { loadWorld } from "../sim/loader.js";
import { ReplayError } from "../sim/score.js";
import { readTrace } from "../trace/lines.js";
import type { Bundle, BundleManifest, BundleResult } from "./bundle.js";
import { ExportRefused } from "./errors.js";
import { fromRepoPath } from "./paths.js";
import { readLog, replayFailure } from "./read-log.js";

const jsonl = (rows: readonly unknown[]): string => rows.map((r) => `${JSON.stringify(r)}\n`).join("");

/** What a run's `score.json` holds that a bundle's manifest and result are built from. */
type SavedScore = BundleResult & {
  model: BundleManifest["model"];
  priorFit?: string;
  promptNote?: string;
  skill?: { name: string; invoked: boolean; loadedAfterCalls: number | null };
};

/** The world file a run folder's `mcp.json` recorded, as a path on this machine, or undefined when it recorded none. */
export function recordedWorldPath(runDir: string): string | undefined {
  const mcpPath = join(runDir, "mcp.json");
  if (!existsSync(mcpPath)) return undefined;
  const mcp = JSON.parse(readFileSync(mcpPath, "utf8")) as { mcpServers?: { craft?: { env?: { SIM_WORLD?: string } } } };
  const recorded = mcp.mcpServers?.craft?.env?.SIM_WORLD;
  return recorded ? fromRepoPath(recorded) : undefined;
}

/**
 * Build a finished run's replay bundle in memory: its frames, its trace if the trace matched, and its result
 * without the agent's text. Nothing in it names the world file, a recipe, an item description or an item the
 * run never met. The export writes it and the visualizer's server supplies it, so both carry the same bytes.
 */
export function buildBundle(runDir: string): Bundle {
  const scorePath = join(runDir, "score.json");
  if (!existsSync(scorePath)) throw new ExportRefused("the run is unfinished (it has no score.json)", "unfinished");
  const saved = JSON.parse(readFileSync(scorePath, "utf8")) as SavedScore;

  const worldPath = recordedWorldPath(runDir);
  if (!worldPath || !existsSync(worldPath)) throw new ExportRefused("the world file the run used is missing", "world");
  const world = loadWorld(worldPath);

  let frames;
  try {
    frames = deriveFrames(world, saved.score.goal, readLog(join(runDir, "run.jsonl")));
  } catch (e) {
    throw e instanceof ReplayError ? replayFailure(e) : e;
  }

  const matched = saved.measured.trace === "matched";
  const manifest: BundleManifest = {
    format: 1,
    label: `${basename(dirname(runDir))} / ${basename(runDir)}`,
    world: { name: world.name, rows: world.grid.rows, cols: world.grid.cols },
    goal: saved.score.goal,
    best: saved.score.best,
    frames: frames.length,
    trace: saved.measured.trace,
    model: saved.model,
    ...(saved.priorFit === undefined ? {} : { priorFit: saved.priorFit }),
    ...(saved.promptNote === undefined ? {} : { promptNote: saved.promptNote }),
    ...(saved.skill === undefined ? {} : { skill: { name: saved.skill.name, loaded: saved.skill.invoked, loadedAfter: saved.skill.loadedAfterCalls } }),
  };
  const result: BundleResult = {
    ended: saved.ended,
    ...(saved.reason === undefined ? {} : { reason: saved.reason }),
    turns: saved.turns,
    score: saved.score,
    measured: saved.measured,
  };
  // A trace that did not match the log is not trusted to show times, so it is not shipped.
  return { manifest, frames, trace: matched ? readTrace(join(runDir, "trace.jsonl")) : [], result };
}

/** The four files of a bundle as text, exactly as the export writes them and the visualizer's server supplies them. */
export const BUNDLE_FILES = ["bundle.json", "frames.jsonl", "trace.jsonl", "score.json"] as const;
export type BundleFileName = (typeof BUNDLE_FILES)[number];

export function bundleFiles({ manifest, frames, trace, result }: Bundle): Record<BundleFileName, string> {
  return {
    "bundle.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "frames.jsonl": jsonl(frames),
    "trace.jsonl": jsonl(trace),
    "score.json": `${JSON.stringify(result, null, 2)}\n`,
  };
}

/**
 * Package a finished run as a replay bundle folder. It is built in a temporary folder and renamed, so a
 * failure leaves nothing behind.
 */
export function exportBundle(runDir: string, dest: string): { dest: string; frames: number } {
  if (existsSync(dest)) throw new ExportRefused(`${dest} already exists`, "destination");
  const bundle = buildBundle(runDir);
  const files = bundleFiles(bundle);

  const temp = `${dest}.tmp-${process.pid}`;
  try {
    mkdirSync(temp, { recursive: true });
    for (const name of BUNDLE_FILES) writeFileSync(join(temp, name), files[name]);
    renameSync(temp, dest);
  } catch (e) {
    rmSync(temp, { recursive: true, force: true });
    throw e;
  }
  return { dest, frames: bundle.frames.length };
}
