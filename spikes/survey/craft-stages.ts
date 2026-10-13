// Stage classifier for the woodworking survey: in what order did each run make the parts, and did it hold all of them and still miss the stool?
// Usage: pnpm dev spikes/survey/craft-stages.ts <run label folder>...
// Reads run.jsonl (successful crafts and their outputs) and score.json only; no model text. Specific to worlds/woodworking.json: the stool needs a seat
// and three rods, and a rod craft makes two, so "all parts" means one seat and two rod crafts.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const abbr: Record<string, string> = { plank: "P", rod: "R", seat: "S", wooden_stool: "STOOL" };
const rows: { label: string; run: string; reached: boolean; calls: number; seq: string; allPartsAt: number | null; after: number }[] = [];
for (const folder of process.argv.slice(2)) {
  for (const run of readdirSync(folder).filter((d) => /^\d+$/.test(d)).sort()) {
    const dir = join(folder, run);
    if (!existsSync(join(dir, "run.jsonl")) || !existsSync(join(dir, "score.json"))) continue;
    const calls = readFileSync(join(dir, "run.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const score = JSON.parse(readFileSync(join(dir, "score.json"), "utf8"));
    let rods = 0, seats = 0, allPartsAt: number | null = null, lastCraft = 0;
    const seq: string[] = [];
    for (const c of calls) {
      if (c.tool !== "craft" || !c.ok) continue;
      const item = c.crafted.item as string;
      seq.push(`${abbr[item] ?? item}@${c.seq}`);
      lastCraft = c.seq;
      if (item === "rod") rods++;
      if (item === "seat") seats++;
      if (allPartsAt === null && rods >= 2 && seats >= 1) allPartsAt = c.seq;
    }
    rows.push({ label: basename(folder), run, reached: score.score.reached, calls: calls.length, seq: seq.join(" ") || "(no craft)", allPartsAt, after: calls.length - lastCraft });
  }
}
console.log("| model | run | reached | calls | crafts in order | all parts held at call | calls after the last craft |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.label} | ${r.run} | ${r.reached ? "yes" : "no"} | ${r.calls} | ${r.seq} | ${r.allPartsAt ?? "-"} | ${r.after} |`);
const misses = rows.filter((r) => !r.reached);
console.log("");
console.log(`Misses: ${misses.length}; held all parts and still missed the stool: ${misses.filter((r) => r.allPartsAt !== null).length}; never held all parts: ${misses.filter((r) => r.allPartsAt === null).length}`);
for (const label of [...new Set(rows.map((r) => r.label))]) {
  const m = misses.filter((r) => r.label === label);
  console.log(`- ${label}: ${rows.filter((r) => r.label === label && r.reached).length}/${rows.filter((r) => r.label === label).length} reached; misses with all parts ${m.filter((r) => r.allPartsAt !== null).length}, without ${m.filter((r) => r.allPartsAt === null).length}`);
}
