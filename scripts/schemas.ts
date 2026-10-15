/**
 * Write the committed JSON Schema files of the distillation harness contracts from their zod definitions (spec 009).
 * Usage: pnpm dev scripts/schemas.ts
 * A test fails when a committed file differs from what the definitions generate, so run this after editing src/distill/schemas.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsonSchemaOf, runRecordSchema, skillSetSchema } from "../src/distill/schemas.js";
import { REPO } from "../src/harness/paths.js";

mkdirSync(join(REPO, "schemas"), { recursive: true });
for (const [file, schema] of [["run-record.v1.json", runRecordSchema], ["skill-set.v1.json", skillSetSchema]] as const) {
  writeFileSync(join(REPO, "schemas", file), `${JSON.stringify(jsonSchemaOf(schema), null, 2)}\n`);
  console.log(`schemas/${file}`);
}
