// Price probe (spec 007 FR-046 to FR-051): what would a run on each model be costed with, from the live public OpenRouter list?
// Usage: pnpm dev spikes/fireworks/probe-prices.ts <provider>/<model>...
// It goes through the harness's own resolver (the pins, the aliases file, the cache), so it shows what a run would record. It prints rates, the OpenRouter id
// and when the list was read, never a key (none is used), and it makes one public request at most, to the list.
import { parseModelSpec } from "../../src/harness/models.js";
import { priceSource } from "../../src/harness/pricing.js";

const specs = process.argv.slice(2);
if (specs.length === 0) throw new Error("usage: probe-prices.ts <provider>/<model>...");
const source = priceSource();
for (const spec of specs) {
  const canonical = parseModelSpec(spec).spec;
  const q = await source.resolve(canonical);
  if (q === undefined) console.log(`${canonical}: no price (no pin and no alias, or the list could not be read)`);
  else console.log(`${canonical}: ${q.source}${q.openRouterId === null ? "" : ` ${q.openRouterId}`}${q.fetchedAt === null ? "" : `, list read ${q.fetchedAt}`}; per million tokens ${JSON.stringify(q.perMillion)}${q.note === undefined ? "" : ` (${q.note})`}`);
}
