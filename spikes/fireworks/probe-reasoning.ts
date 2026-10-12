// Provider admission probe, part 3 (spec 007 FR-028): does a model's reasoning reach the run's conversation file, and on which turns?
// It plays one short, capped run through the harness's own path (the AI SDK driver, the sink, the conversation writer), so what it
// reports is what a recording would be written from. Usage:
//   pnpm dev spikes/fireworks/probe-reasoning.ts <world.json> <goal-item> <provider>/<model> [--settings <file>] [--turns 6] [--max-total-tokens 60000]
// Prints counts only: per turn, the characters of text and of reasoning and the tools called; and the state a recording would
// give the conversation (returned, partial or none). The run folder holds the model's words, so it is deleted afterwards.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readConversation } from "../../src/harness/conversation.js";
import { loadSettings, parseModelSpec } from "../../src/harness/models.js";
import { findProvider } from "../../src/harness/providers.js";
import { runExperiment } from "../../src/harness/run.js";
import { reasoningState } from "../../src/loop/candidate.js";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { settings: { type: "string" }, turns: { type: "string", default: "6" }, "max-total-tokens": { type: "string", default: "60000" } } });
const [world, item, spec] = positionals;
if (!world || !item || !spec) throw new Error("usage: probe-reasoning.ts <world.json> <goal-item> <provider>/<model> [--settings <file>] [--turns 6] [--max-total-tokens 60000]");

const ref = parseModelSpec(spec);
const keyEnv = findProvider(ref.provider)?.keyEnv;
console.log(`== ${ref.spec}  (key ${keyEnv}: ${keyEnv && process.env[keyEnv] ? "set" : "NOT SET"})`);
const settings = values.settings === undefined ? undefined : loadSettings(values.settings)[ref.spec];
console.log(`settings: ${JSON.stringify(settings ?? {})}`);

const out = mkdtempSync(join(tmpdir(), "probe-reasoning-"));
try {
  const { reports } = await runExperiment({
    world, goal: { item, qty: 1 }, runs: 1, maxTurns: Number(values.turns), out, label: "p", model: spec,
    ...(settings === undefined ? {} : { settings }), limits: { maxTotalTokens: Number(values["max-total-tokens"]) },
  });
  const r = reports[0]!;
  console.log(`ended: ${r.ended}${r.reason ? ` (${r.reason})` : ""}; turns ${r.turns ?? "-"}; cost ${r.costUsd === null ? "-" : `$${r.costUsd.toFixed(4)}`}`);
  const turns = readConversation(join(r.dir, "conversation.jsonl"));
  if (turns === null) console.log("no conversation file: the player reported no turns");
  else {
    for (const t of turns) console.log(`turn ${t.seq + 1}: textChars=${t.text.length} reasoningChars=${t.reasoning.length} calls=[${t.calls.map((c) => c.tool).join(",")}]`);
    console.log(`recording would mark reasoning: ${reasoningState(turns)}`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
