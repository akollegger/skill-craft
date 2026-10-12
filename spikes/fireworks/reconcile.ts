// Spot check: do the harness's token counts match what Fireworks billed? Read-only (firectl billing get-usage).
//   pnpm dev spikes/fireworks/reconcile.ts snapshot <file>                       before a batch of runs
//   pnpm dev spikes/fireworks/reconcile.ts compare <file> <runs/label>... [--cost <model>=<usd>]   after it
// Billing groups by UTC day, so a snapshot is needed to isolate a batch from earlier calls that day. A batch that
// crosses midnight UTC is refused. Only tokens are compared: firectl reports no per-model cost to an agent, so the
// optional --cost (read from the Fireworks dashboard by hand) is turned into a blended rate, not a price table.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Counts { prompt: number; cached: number; completion: number }
type Usage = Record<string, Counts>; // key: `${apiKeyName}|${model}`
interface Snapshot { day: string; usage: Usage }

const today = () => new Date().toISOString().slice(0, 10);
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

function billing(day: string): Usage {
  const out = execFileSync("firectl", ["billing", "get-usage", "--start-time", day, "--end-time", nextDay(day), "--usage-type", "serverless", "--group-by", "model_name", "--group-by", "api_key_name", "-o", "json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const rows = (JSON.parse(out) as { account_usage?: { serverless_costs?: Record<string, unknown>[] } }).account_usage?.serverless_costs ?? [];
  const usage: Usage = {};
  for (const r of rows) {
    const group = (r["group"] ?? {}) as Record<string, string>;
    const model = String(r["model_name"]).replace("accounts/fireworks/models/", "fireworks/");
    const key = `${group["api_key_name"] ?? "-"}|${model}`;
    const c = usage[key] ?? (usage[key] = { prompt: 0, cached: 0, completion: 0 });
    c.prompt += Number(r["prompt_tokens"] ?? 0);
    c.cached += Number(r["cached_prompt_tokens"] ?? 0);
    c.completion += Number(r["completion_tokens"] ?? 0);
  }
  return usage;
}

/** What the harness recorded for run folders: per model, tokens summed from each run's trace. */
function harness(labels: string[]): Record<string, Counts> {
  const total: Record<string, Counts> = {};
  for (const label of labels) {
    for (const run of readdirSync(label).filter((d) => existsSync(join(label, d, "score.json")))) {
      const score = JSON.parse(readFileSync(join(label, run, "score.json"), "utf8")) as { model?: { resolved?: string[] } };
      const model = score.model?.resolved?.[0];
      if (!model?.startsWith("fireworks/")) continue;
      const c = total[model] ?? (total[model] = { prompt: 0, cached: 0, completion: 0 });
      for (const line of readFileSync(join(label, run, "trace.jsonl"), "utf8").split("\n").filter(Boolean)) {
        const l = JSON.parse(line) as { kind: string; inputTokens?: number; cacheReadTokens?: number; outputTokens?: number };
        if (l.kind !== "request") continue;
        c.prompt += (l.inputTokens ?? 0) + (l.cacheReadTokens ?? 0); // the harness keeps non-cached input apart from cache reads
        c.cached += l.cacheReadTokens ?? 0;
        c.completion += l.outputTokens ?? 0;
      }
    }
  }
  return total;
}

const [cmd, file, ...rest] = process.argv.slice(2);
if (cmd === "snapshot" && file) {
  const snap: Snapshot = { day: today(), usage: billing(today()) };
  writeFileSync(file, `${JSON.stringify(snap, null, 2)}\n`);
  console.log(`snapshot of ${Object.keys(snap.usage).length} key/model rows for ${snap.day} (UTC) written to ${file}`);
} else if (cmd === "compare" && file) {
  const costs = new Map<string, number>();
  const labels: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--cost") {
      const [m, usd] = String(rest[++i]).split("=");
      costs.set(m as string, Number(usd));
    } else labels.push(rest[i] as string);
  }
  const before = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  if (today() !== before.day) throw new Error(`the snapshot is for ${before.day} UTC and it is now ${today()}; billing days differ, so no comparison`);
  const after = billing(before.day);
  const delta: Record<string, Counts> = {}; // by model, summed over keys
  for (const [k, c] of Object.entries(after)) {
    const b = before.usage[k] ?? { prompt: 0, cached: 0, completion: 0 };
    const m = k.split("|")[1] as string;
    const d = delta[m] ?? (delta[m] = { prompt: 0, cached: 0, completion: 0 });
    d.prompt += c.prompt - b.prompt;
    d.cached += c.cached - b.cached;
    d.completion += c.completion - b.completion;
  }
  const mine = harness(labels);
  const keys = [...new Set(Object.keys(after).map((k) => k.split("|")[0]))];
  console.log(`billing keys seen: ${keys.join(", ")} (all keys are summed; other users of the account would add to the billed side)`);
  for (const m of [...new Set([...Object.keys(mine), ...Object.keys(delta)])].sort()) {
    const h = mine[m] ?? { prompt: 0, cached: 0, completion: 0 };
    const d = delta[m] ?? { prompt: 0, cached: 0, completion: 0 };
    const row = (n: string, a: number, b: number) => `${n} ${a}/${b}${a === b ? " ok" : ` (billed ${b - a >= 0 ? "+" : ""}${b - a})`}`;
    console.log(`${m}: harness/billed  ${row("prompt", h.prompt, d.prompt)}  ${row("cached", h.cached, d.cached)}  ${row("completion", h.completion, d.completion)}`);
    const usd = costs.get(m);
    if (usd !== undefined && d.prompt + d.completion > 0) console.log(`  implied blended rate: $${((usd / (d.prompt + d.completion)) * 1_000_000).toFixed(4)} per million tokens (prompt + completion, cache included)`);
  }
} else {
  console.error("usage: reconcile.ts snapshot <file> | compare <file> <runs/label>... [--cost <model>=<usd>]");
  process.exit(2);
}
