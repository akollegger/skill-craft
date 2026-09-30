/**
 * Builds the mock's data and inlines it into index.html between the FRAMES markers.
 * Run from the repo root: node --import tsx design/notes/pixel-observer/mock/make-frames.ts
 *
 * Run w1 is a real recording (run-without-skill.jsonl: headless Claude Code, 10 turns, forge-7, goal
 * glirol). The other runs are scripted on a real Game and marked "stand-in": they exist so the run
 * picker has variety (a give-up, refusals, detours, skill-guided finishes).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Game } from "../../../../src/sim/engine.js";
import { deriveFrames } from "../../../../src/sim/frames.js";
import { loadWorld } from "../../../../src/sim/loader.js";
import type { RunLogEntry } from "../../../../src/sim/runlog.js";
import { solve } from "../../../../src/sim/solver.js";

const here = dirname(fileURLToPath(import.meta.url));
const WORLD = "worlds/generated/forge-7.json";
const goal = { item: "glirol", qty: 1 };
const world = loadWorld(WORLD);
const best = solve(world, goal);
if (!best.reachable) throw new Error("goal unreachable");

const ACTIONS = new Set(["place", "remove", "clear", "craft"]);

/**
 * Clock time for each frame, in milliseconds since the run began. The run log has no timestamps by
 * design, so these are stand-ins: the gaps are weighted by kind of call with a deterministic jitter,
 * then scaled so the run lasts `totalMs`. Only w1's total is real (18,984 ms, from its CLI result).
 */
function clock(frames: Record<string, unknown>[], totalMs: number, seed: number): number[] {
  const weight = (tool: string, i: number): number => {
    const jitter = ((Math.imul(i + 1, 2654435761) ^ Math.imul(seed, 40503)) >>> 0) % 100 / 100; // 0..1, deterministic
    const base = tool === "craft" ? 1.4 : tool === "look" || tool === "inventory" || tool === "help" ? 0.7 : 1;
    return base * (i % 4 === 3 ? 0.15 + jitter * 0.2 : 0.4 + jitter * 1.3);
  };
  const ws = frames.slice(1).map((f, i) => weight(String(f["tool"]), i));
  const sum = ws.reduce((a, b) => a + b, 0);
  let t = 0;
  return [0, ...ws.map((w) => (t += (w / sum) * totalMs))].map((x) => Math.round(x));
}

/** Replay log entries on a fresh game, capturing what an observer would draw after each call. */
const framesFor = (entries: RunLogEntry[]) => deriveFrames(world, goal, entries) as unknown as Record<string, unknown>[];

type Step = ["help"] | ["inventory"] | ["look"] | ["place", string, number, number] | ["remove", number, number] | ["clear"] | ["craft"];

/** Play a scripted sequence on a real Game and return its run log, so stand-in runs obey the rules. */
function scripted(steps: Step[]): RunLogEntry[] {
  const game = new Game(world);
  for (const st of steps) {
    if (st[0] === "help") game.record("help", {}, { ok: true });
    else if (st[0] === "inventory") game.inventory();
    else if (st[0] === "look") game.look();
    else if (st[0] === "place") game.place(st[1], st[2], st[3]);
    else if (st[0] === "remove") game.remove(st[1], st[2]);
    else if (st[0] === "clear") game.clear();
    else game.craft();
  }
  return game.log.entries;
}

const recorded = readFileSync(join(here, "run-without-skill.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RunLogEntry);
const bestSteps: Step[] = best.calls.map((c) => (c.tool === "craft" ? ["craft"] : ["place", String(c.args["item"]), Number(c.args["row"]), Number(c.args["col"])]));

const REC = "recorded: headless Claude Code, 10 turns";
const STAND = "stand-in";
const runs = [
  { id: "w1", title: "Without a skill 1", tag: REC, ended: "budget", live: true, totalMs: 18984, entries: recorded },
  { id: "w2", title: "Without a skill 2", tag: STAND, ended: "stopped", live: false, totalMs: 9700, entries: scripted([["help"], ["inventory"], ["look"], ["place", "doudrur", 0, 0], ["place", "lugli", 0, 1], ["clear"], ["place", "tepitil", 0, 0], ["place", "thegen", 0, 1], ["clear"]]) },
  { id: "w3", title: "Without a skill 3", tag: STAND, ended: "budget", live: false, totalMs: 15300, entries: scripted([["help"], ["place", "lugli", 0, 0], ["place", "doudrur", 0, 1], ["craft"], ["clear"], ["place", "tepitil", 0, 0], ["place", "lugli", 0, 1], ["craft"], ["clear"], ["place", "thegen", 0, 0], ["place", "thegen", 0, 1], ["craft"], ["remove", 0, 1], ["place", "doudrur", 1, 1], ["craft"]]) },
  { id: "s1", title: "With a skill 1", tag: STAND, ended: "reached", live: false, totalMs: 4200, entries: scripted([["help"], ["inventory"], ...bestSteps]) },
  { id: "s2", title: "With a skill 2", tag: STAND, ended: "reached", live: false, totalMs: 6900, entries: scripted([["help"], ["inventory"], ["place", "lugli", 0, 0], ["place", "tepitil", 0, 1], ["remove", 0, 1], ["place", "lugli", 0, 1], ["craft"]]) },
  { id: "s3", title: "With a skill 3", tag: STAND, ended: "reached", live: false, totalMs: 4600, entries: scripted([["help"], ["look"], ...bestSteps]) },
];

const data = {
  world: { name: world.name, rows: world.grid.rows, cols: world.grid.cols },
  goal,
  best: { minCalls: best.minCalls, minCrafts: best.minCrafts },
  experiment: "pilot-1",
  runs: runs.map(({ entries, totalMs, ...r }, k) => {
    const frames = framesFor(entries);
    const ts = clock(frames, totalMs, k + 1);
    return { ...r, frames: frames.map((f, i) => ({ ...f, t: ts[i] })) };
  }),
};

const htmlPath = join(here, "index.html");
const html = readFileSync(htmlPath, "utf8");
const block = `/*FRAMES*/\nwindow.OBSERVER_DATA = ${JSON.stringify(data)};\n/*END*/`;
const next = html.replace(/\/\*FRAMES\*\/[\s\S]*?\/\*END\*\//, () => block);
if (next === html && !html.includes("/*FRAMES*/")) throw new Error("index.html has no FRAMES markers");
writeFileSync(htmlPath, next);
console.log(`inlined ${data.runs.map((r) => `${r.id}: ${r.frames.length}`).join(", ")} frames into index.html`);
