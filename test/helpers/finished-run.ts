import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExperiment } from "../../src/harness/run.js";
import { fakePlayer, type FakePlayerOptions } from "./fake-player.js";
import { makeWorld } from "./worlds.js";

export const GOAL = { item: "e", qty: 1 };
/** Distinctive descriptions, so a test can prove none of them reaches a payload. */
export const DESCRIPTIONS = { a: "DESC-A-raw", b: "DESC-B-raw", c: "DESC-C-raw", d: "DESC-D-made", e: "DESC-E-goal", s: "DESC-S-UNMET" };
export const WORLD_FILE_NAME = "unique-world-file-xyz.json";

/** A world file with distinctive descriptions, in a folder the test can delete. */
export function worldFile(dir: string, name = "export-world"): string {
  const world = makeWorld({ name, items: Object.entries(DESCRIPTIONS).map(([id, description]) => ({ id, description })) });
  const path = join(dir, WORLD_FILE_NAME);
  writeFileSync(path, JSON.stringify(world));
  return path;
}

export interface FinishedRunOptions {
  player?: FakePlayerOptions;
  label?: string;
  /** An existing scratch folder to reuse, with its world file; the run goes in `<dir>/runs`. */
  dir?: string;
  world?: string;
  runs?: number;
  /** A goal other than the helper's own, for a world other than the helper's own. */
  goal?: { item: string; qty: number };
}

/** Run the fake player against a temporary world and return the finished run folder(s). */
export async function finishedRun(o: FinishedRunOptions = {}) {
  const dir = o.dir ?? mkdtempSync(join(tmpdir(), "skill-craft-viz-"));
  const world = o.world ?? worldFile(dir);
  const out = join(dir, "runs");
  const res = await runExperiment({
    world, goal: o.goal ?? GOAL, runs: o.runs ?? 1, maxTurns: 12, out, label: o.label ?? "lab", record: false,
    driver: fakePlayer({ mode: "solve", goal: o.goal ?? GOAL, models: ["fake-a"], ...o.player }),
  });
  const runDir = res.reports[0]?.dir as string;
  return { dir, world, out, runDir, dest: join(dir, "bundle"), report: res.reports[0]!, reports: res.reports };
}

/**
 * Add the fields a harness run with a prompt note or a skill writes to score.json, and drop the named ones.
 * Dropping `priorFit` makes the run look like one from a harness older than the prior-fit stamp.
 */
export function stampScore(runDir: string, extra: Record<string, unknown>, drop: string[] = []): void {
  const path = join(runDir, "score.json");
  const score = { ...(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>), ...extra };
  for (const key of drop) delete score[key];
  writeFileSync(path, `${JSON.stringify(score, null, 2)}\n`);
}
