import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { deriveFrames } from "../sim/frames.js";
import { loadWorld } from "../sim/loader.js";
import { ReplayError } from "../sim/score.js";
import { readTrace } from "../trace/lines.js";
import type { BundleManifest, BundleResult } from "./bundle.js";
import { ExportRefused } from "./errors.js";
import { readLog, replayFailure } from "./read-log.js";

const jsonl = (rows: readonly unknown[]): string => rows.map((r) => `${JSON.stringify(r)}\n`).join("");

/**
 * Package a finished run as a replay bundle: its frames, its trace if the trace matched, and its result
 * without the agent's text. Nothing in it names the world file, a recipe, an item description or an item
 * the run never met. It is built in a temporary folder and renamed, so a failure leaves nothing behind.
 */
export function exportBundle(runDir: string, dest: string): { dest: string; frames: number } {
  if (existsSync(dest)) throw new ExportRefused(`${dest} already exists`);
  const scorePath = join(runDir, "score.json");
  if (!existsSync(scorePath)) throw new ExportRefused("the run is unfinished (it has no score.json)");
  const saved = JSON.parse(readFileSync(scorePath, "utf8")) as BundleResult & { model: BundleManifest["model"] };

  const mcpPath = join(runDir, "mcp.json");
  const mcp = existsSync(mcpPath) ? (JSON.parse(readFileSync(mcpPath, "utf8")) as { mcpServers?: { craft?: { env?: { SIM_WORLD?: string } } } }) : {};
  const worldPath = mcp.mcpServers?.craft?.env?.SIM_WORLD;
  if (!worldPath || !existsSync(worldPath)) throw new ExportRefused("the world file the run used is missing");
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
  };
  const result: BundleResult = {
    ended: saved.ended,
    ...(saved.reason === undefined ? {} : { reason: saved.reason }),
    turns: saved.turns,
    score: saved.score,
    measured: saved.measured,
  };

  const temp = `${dest}.tmp-${process.pid}`;
  try {
    mkdirSync(temp, { recursive: true });
    writeFileSync(join(temp, "bundle.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(temp, "frames.jsonl"), jsonl(frames));
    // A trace that did not match the log is not trusted to show times, so it is not shipped.
    writeFileSync(join(temp, "trace.jsonl"), jsonl(matched ? readTrace(join(runDir, "trace.jsonl")) : []));
    writeFileSync(join(temp, "score.json"), `${JSON.stringify(result, null, 2)}\n`);
    renameSync(temp, dest);
  } catch (e) {
    rmSync(temp, { recursive: true, force: true });
    throw e;
  }
  return { dest, frames: frames.length };
}
