// Step 1 of the spike: list the models the account can call. Read-only; the key comes from the environment.
import { writeFileSync } from "node:fs";

const key = process.env["FIREWORKS_API_KEY"];
if (!key) throw new Error("FIREWORKS_API_KEY is not set (set -a; source ./.env; set +a)");

const res = await fetch("https://api.fireworks.ai/inference/v1/models", { headers: { Authorization: `Bearer ${key}` } });
console.log("status", res.status);
const body = (await res.json()) as { data?: Record<string, unknown>[] };
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(body, null, 2));
const data = body.data ?? [];
console.log("models", data.length);
console.log("fields", Object.keys(data[0] ?? {}).join(", "));
