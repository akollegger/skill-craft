// Search-strategy classifier for a calibration survey: what did each run try, and in what order, before it found (or missed) the goal?
// Usage: pnpm dev spikes/survey/classify-search.ts <run label folder>... > table.md
// It reads only run.jsonl (the calls the model made and whether they were ok) and score.json (the ending and whether the goal was reached),
// never conversation.jsonl, so it sees no model text. The oracle (the goal) is used to label a run, never to read its calls.
// A "settled arrangement" is the table as it stood when the model cleared it, crafted it or stopped. A "pair probe" is a settled arrangement of
// exactly two cells holding the same base item; a base item is one placed before the run's first successful craft.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

type Call = { seq: number; tool: string; args?: Record<string, unknown>; ok: boolean };
type Settled = { call: number; cells: string[]; crafted: boolean };
type Row = {
  label: string; run: string; reached: boolean; ended: string; calls: number;
  firstMultiCall: number | null; pairProbeCall: number | null; bigBeforePair: boolean; arrangements: number; crafts: number; singleCrafts: number;
  pairedItems: string[]; settled: Settled[]; firstCraftSeq: number;
};

function classify(dir: string, label: string, run: string): Row {
  const calls: Call[] = readFileSync(join(dir, "run.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const score = JSON.parse(readFileSync(join(dir, "score.json"), "utf8"));
  let table = new Map<string, string>();
  const settled: Settled[] = [];
  let firstCraftSeq = Infinity;
  const settle = (call: number, crafted: boolean) => { if (table.size > 0) settled.push({ call, cells: [...table.values()], crafted }); };
  for (const c of calls) {
    const a = c.args ?? {};
    if (c.tool === "place" && c.ok) table.set(`${a["row"]},${a["col"]}`, String(a["item"]));
    else if (c.tool === "remove" && c.ok) table.delete(`${a["row"]},${a["col"]}`);
    else if (c.tool === "clear") { settle(c.seq, false); table = new Map(); }
    else if (c.tool === "craft") { settle(c.seq, c.ok); if (c.ok && firstCraftSeq === Infinity) firstCraftSeq = c.seq; table = new Map(); }
  }
  if (table.size > 0) settled.push({ call: calls.length, cells: [...table.values()], crafted: false });
  // placing happens before the craft that consumes it, so the base items are everything settled up to the first successful craft
  const base = new Set(settled.filter((s) => s.call <= firstCraftSeq).flatMap((s) => s.cells));
  const isPair = (s: { cells: string[] }) => s.cells.length === 2 && s.cells[0] === s.cells[1] && base.has(s.cells[0] as string);
  const pair = settled.find(isPair);
  const multi = settled.find((s) => s.cells.length >= 3);
  const key = (s: { cells: string[] }) => [...s.cells].sort().join("+");
  return {
    label, run, reached: score.score.reached, ended: score.ended, calls: score.score.totalCalls,
    firstMultiCall: multi?.call ?? null, pairProbeCall: pair?.call ?? null,
    bigBeforePair: multi !== undefined && (pair === undefined || multi.call < pair.call),
    arrangements: new Set(settled.map(key)).size,
    crafts: settled.filter((s) => s.crafted).length,
    singleCrafts: settled.filter((s) => s.crafted && s.cells.length === 1).length,
    pairedItems: [], settled, firstCraftSeq,
  };
}

const rows: Row[] = [];
for (const folder of process.argv.slice(2)) {
  for (const run of readdirSync(folder).filter((d) => /^\d+$/.test(d)).sort()) {
    const dir = join(folder, run);
    if (existsSync(join(dir, "run.jsonl")) && existsSync(join(dir, "score.json"))) rows.push(classify(dir, basename(folder), run));
  }
}
// A base item is one any run placed before its own first successful craft; the survey's base set is their union, so a run that never reached
// an item is still judged against it.
const baseAll = [...new Set(rows.flatMap((r) => r.settled.filter((s) => s.call <= r.firstCraftSeq).flatMap((s) => s.cells)))].sort();
for (const r of rows) r.pairedItems = baseAll.filter((b) => r.settled.some((s) => s.cells.length === 2 && s.cells[0] === b && s.cells[1] === b));
const n = (v: number | null) => (v === null ? "-" : String(v));
console.log(`Base items placed before a first craft, across these runs: ${baseAll.join(", ")} (${baseAll.length}).`);
console.log("");
console.log("| model | run | reached | ended | calls | base items tried as a pair | first pair probe (call) | first 3+ cell arrangement (call) | 3+ before pair | distinct arrangements | crafts (single-item) |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.label} | ${r.run} | ${r.reached ? "yes" : "no"} | ${r.ended} | ${r.calls} | ${r.pairedItems.length}/${baseAll.length}: ${r.pairedItems.join(", ") || "-"} | ${n(r.pairProbeCall)} | ${n(r.firstMultiCall)} | ${r.bigBeforePair ? "yes" : "no"} | ${r.arrangements} | ${r.crafts} (${r.singleCrafts}) |`);
const by = (f: (r: Row) => boolean) => { const s = rows.filter(f); return `${s.filter((r) => r.reached).length}/${s.length} reached`; };
console.log("");
for (const k of [0, 1, 2, 3, 4]) console.log(`- ${k} of ${baseAll.length} base items tried as a pair: ${by((r) => r.pairedItems.length === k)}`);
console.log(`- A 3+ cell arrangement before any pair probe: ${by((r) => r.bigBeforePair)}`);
