/**
 * List every prompt in play: its kind, version, fingerprint and whether its changelog has an entry (spec 008).
 * Usage: pnpm dev scripts/prompts.ts
 * Exits 1 when a kind has no versions, a version has no changelog section, or a file is refused.
 */
import { listPrompts } from "../src/prompts/index.js";

const { lines, problems } = listPrompts();
for (const l of lines) console.log(l);
for (const p of problems) console.error(`problem: ${p}`);
process.exit(problems.length === 0 ? 0 : 1);
