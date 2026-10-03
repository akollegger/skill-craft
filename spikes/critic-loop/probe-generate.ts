/**
 * Probe (spec 005, task T021): run the real candidate step once against the memory service on a throwaway workspace,
 * and record the SHAPE of every response (key names, types, status words and numbers; never message content or the
 * key). The shapes settle what the OpenAPI spec leaves untyped: the run's status values, where the skill id is, what a
 * failed gate looks like, extraction status, and the zip's file list.
 * Usage (a subshell, so NAMS_WORKSPACE_ID is never exported where a session starts):
 *   ( set -a; source ./.env; set +a; unset NAMS_WORKSPACE_ID; pnpm dev spikes/critic-loop/probe-generate.ts <out folder> <run folder>... )
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { obtainCandidate } from "../../src/loop/candidate.js";
import { createMcpWorkspaceTools, createNamsClient, type WorkspaceTools } from "../../src/loop/nams.js";
import { replayRun } from "../../src/loop/transcript.js";
import { reasonOf } from "../../src/harness/errors.js";
import { readZip } from "../../src/loop/zip.js";

const [out, ...runs] = process.argv.slice(2);
const key = process.env["NAMS_API_KEY"];
if (!key) throw new Error("NAMS_API_KEY must be set");
if (!out || runs.length === 0) throw new Error("usage: probe-generate.ts <out folder> <run folder>...");
mkdirSync(out, { recursive: true });

const WORDS = new Set(["status", "state", "failure", "error", "error_code", "reason", "kind", "type", "format", "procedureFormat"]);
function shape(v: unknown, key = "", depth = 0): unknown {
  if (Array.isArray(v)) return depth > 3 ? "[...]" : [`array(${v.length})`, v.length ? shape(v[0], key, depth + 1) : null];
  if (typeof v === "object" && v !== null) return depth > 3 ? "{...}" : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, k, depth + 1)]));
  if (typeof v === "string") return WORDS.has(key) ? `"${v.slice(0, 40)}"` : `string(${v.length})`;
  if (typeof v === "number") return /gate|score|ground|cover|threshold|coherence|count/i.test(key) ? v : "number";
  return typeof v;
}

const log: { call: string; status?: number; shape: unknown }[] = [];
const instrumented: typeof fetch = async (url, init) => {
  const res = await fetch(url, init);
  const path = new URL(String(url)).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>");
  const type = res.headers.get("content-type") ?? "";
  let body: unknown;
  if (type.includes("json")) body = await res.clone().json().catch(() => "unparsable");
  else body = `bytes(${(await res.clone().arrayBuffer()).byteLength}) ${type}`;
  log.push({ call: `${init?.method ?? "GET"} ${path}`, status: res.status, shape: shape(body) });
  return res;
};

const real = createMcpWorkspaceTools(key, process.env["NAMS_BASE_URL"] || undefined);
const tools: WorkspaceTools = {
  create: async (n) => { const r = await real.create(n); log.push({ call: "mcp workspace_create", shape: shape(r) }); return r; },
  isActive: async (id) => { const r = await real.isActive(id); log.push({ call: "mcp workspace_get -> isActive", shape: r }); return r; },
  list: async () => { const r = await real.list(); log.push({ call: "mcp workspace_list", shape: `ids(${r.length})` }); return r; },
  delete: async (id) => { await real.delete(id); log.push({ call: "mcp workspace_delete", shape: "ok" }); },
};
const nams = createNamsClient({ key, baseUrl: process.env["NAMS_BASE_URL"] || undefined, fetch: instrumented, tools, pollMs: 10_000, maxWaitMs: 25 * 60_000 });

const recordings = [];
for (const [i, r] of runs.entries()) recordings.push(await replayRun(r, String(i + 1).padStart(3, "0")));

let failure = "";
try {
  const r = await obtainCandidate({
    runs: recordings, format: "prose", allowWorkspace: true, nams, loopDir: join(out, "loop"), signal: new AbortController().signal,
    out: (l) => console.log(l), forbiddenWorkspaceIds: [process.env["NAMS_WORKSPACE_ID"] ?? ""], pollMs: 10_000, maxWaitMs: 25 * 60_000,
  });
  console.log(`candidate files: ${Object.keys(r.pkg).join(", ")}`);
  console.log(`stages: ${r.stages.map((s) => `${s.stage} ${(s.durationMs / 1000).toFixed(1)}s`).join(", ")}`);
} catch (e) {
  failure = reasonOf(e);
  console.log(`ended with: ${failure}`);
} finally {
  await real.close?.();
}
writeFileSync(join(out, "probe-log.json"), `${JSON.stringify({ failure, log }, null, 2)}\n`);
// The response shapes, compactly, for the fixtures and the contract.
const seen = new Set<string>();
for (const e of log) {
  const k = `${e.call} ${e.status ?? ""} ${JSON.stringify(e.shape)}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`\n${e.call}${e.status === undefined ? "" : ` -> ${e.status}`}\n${JSON.stringify(e.shape, null, 1)}`);
}
void readZip;
