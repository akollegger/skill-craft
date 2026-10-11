// Provider admission probe, part 3 (spec 007): which pinned settings does a provider accept for a model? It sends one tiny
// call per setting through the provider row's own mapping and reports accepted or rejected (with the status, never the
// message), beside what the table says. Usage: pnpm dev spikes/fireworks/probe-settings.ts <provider>/<model>...
import { generateText } from "ai";
import { languageModel } from "../../src/harness/ai-driver.js";
import { parseModelSpec, type ModelSettings } from "../../src/harness/models.js";
import { findProvider } from "../../src/harness/providers.js";

const CASES: [string, ModelSettings][] = [
  ["temperature 0", { temperature: 0 }],
  ["thinking adaptive", { thinking: "adaptive" }],
  ["thinking off", { thinking: "off" }],
  ["effort high", { effort: "high" }],
];

for (const spec of process.argv.slice(2)) {
  const ref = parseModelSpec(spec);
  const row = findProvider(ref.provider);
  console.log(`\n== ${ref.spec}`);
  for (const [name, settings] of CASES) {
    const key = Object.keys(settings)[0] as "temperature" | "effort" | "thinking";
    const table = row?.settings.accepts.includes(key) && row.settings.refuses?.(ref.id, key, settings[key]) !== true ? "table: accepts" : "table: refuses";
    try {
      await generateText({ model: await languageModel(ref), prompt: "Reply with the word ok.", maxOutputTokens: 300, maxRetries: 0, ...(row?.callOptions(settings, ref.id) ?? {}) });
      console.log(`${name.padEnd(18)} provider: accepted   ${table}`);
    } catch (e) {
      console.log(`${name.padEnd(18)} provider: REJECTED (status ${(e as { statusCode?: number }).statusCode ?? "-"})   ${table}`);
    }
  }
}
