import { describe, expect, it } from "vitest";
import { createClient } from "../src/contract/client.ts";
import type { CatalogEntry } from "../../src/viz/contract.ts";

const ID = "0123456789abcdef";
const frame = (seq: number) => ({ seq, tool: seq === 0 ? "start" : "place", args: {}, ok: true, grid: [["a", null]], craftable: null, held: {}, actions: seq, refusals: 0, reached: false });
const manifest = { format: 1, label: "lab / 001", world: { name: "w", rows: 1, cols: 2 }, goal: { item: "a", qty: 1 }, best: null, frames: 2, trace: "absent", model: { requested: null, resolved: [] } };
const result = {
  ended: "stopped", turns: 3,
  score: { goal: { item: "a", qty: 1 }, reached: true, totalCalls: 1, actionCalls: 1, callsToGoal: 1, craftsMade: 0, failedCrafts: 0, refusals: {}, best: null, extraCalls: null, extraCrafts: null, reachedSeq: 1 },
  measured: { trace: "absent" },
};
const entry: CatalogEntry = { id: ID, kind: "run", status: "ready", attributes: { label: "lab" }, preview: { strip: "p", table: [["a", null]] }, bundle: `bundles/${ID}/` };

const files: Record<string, string> = {
  "catalog.json": JSON.stringify({ format: 1, runs: [entry] }),
  [`bundles/${ID}/bundle.json`]: JSON.stringify(manifest),
  [`bundles/${ID}/frames.jsonl`]: `${JSON.stringify(frame(0))}\n${JSON.stringify(frame(1))}\n`,
  [`bundles/${ID}/trace.jsonl`]: "",
  [`bundles/${ID}/score.json`]: JSON.stringify(result),
};

function host(over: Record<string, string | number> = {}) {
  const asked: string[] = [];
  const fetchFn = async (url: string): Promise<Response> => {
    asked.push(url);
    const o = over[url];
    if (typeof o === "number") return new Response("nope", { status: o });
    const body = typeof o === "string" ? o : files[url];
    return body === undefined ? new Response("nope", { status: 404 }) : new Response(body, { status: 200 });
  };
  return { asked, client: createClient(fetchFn) };
}

describe("the contract client", () => {
  it("asks for the catalog and the four bundle files by relative address only", async () => {
    const { asked, client } = host();
    const cat = await client.catalog();
    expect(cat.ok).toBe(true);
    const b = await client.bundle(entry);
    expect(b.ok).toBe(true);
    expect(asked).toEqual(["catalog.json", ...["bundle.json", "frames.jsonl", "trace.jsonl", "score.json"].map((f) => `bundles/${ID}/${f}`)]);
    for (const url of asked) expect(url, url).not.toMatch(/^([a-z][a-z0-9+.-]*:|\/)/i);
  });

  it("returns the parsed catalog and bundle", async () => {
    const { client } = host();
    const cat = await client.catalog();
    if (!cat.ok) throw new Error("expected a catalog");
    expect(cat.value.runs[0]?.id).toBe(ID);
    const b = await client.bundle(entry);
    if (!b.ok) throw new Error("expected a bundle");
    expect(b.value.frames.map((f) => f.seq)).toEqual([0, 1]);
    expect(b.value.manifest.world.name).toBe("w");
    expect(b.value.trace).toEqual([]);
    expect(b.value.result.score.reached).toBe(true);
  });

  it("reports an unknown format of the catalog or a bundle as such, not as broken data", async () => {
    const cat = await host({ "catalog.json": JSON.stringify({ format: 2, runs: [] }) }).client.catalog();
    expect(cat).toEqual({ ok: false, error: { kind: "unsupported-format", format: 2 } });
    const b = await host({ [`bundles/${ID}/bundle.json`]: JSON.stringify({ ...manifest, format: 2 }) }).client.bundle(entry);
    expect(b).toMatchObject({ ok: false, error: { kind: "unsupported-format", format: 2 } });
  });

  it("returns a typed error for a failed fetch, an HTTP error and data that is not valid, and does not throw", async () => {
    const boom = createClient(async () => { throw new TypeError("network down"); });
    expect(await boom.catalog()).toMatchObject({ ok: false, error: { kind: "network" } });
    // A connection that drops while the body is being read is a network failure too, and does not throw.
    const dropped = createClient(async () => ({ ok: true, status: 200, text: async () => { throw new TypeError("connection reset"); } }) as unknown as Response);
    expect(await dropped.catalog()).toMatchObject({ ok: false, error: { kind: "network", message: "connection reset" } });
    expect(await host({ "catalog.json": 500 }).client.catalog()).toMatchObject({ ok: false, error: { kind: "http", status: 500 } });
    expect(await host({ "catalog.json": "not json" }).client.catalog()).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(await host({ [`bundles/${ID}/frames.jsonl`]: "{bad\n" }).client.bundle(entry)).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(await host({ [`bundles/${ID}/score.json`]: JSON.stringify({ ended: "stopped" }) }).client.bundle(entry)).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });

  it("rejects frames whose seq numbers are not 0, 1, 2 and so on", async () => {
    const skewed = `${JSON.stringify(frame(0))}\n${JSON.stringify(frame(2))}\n`;
    expect(await host({ [`bundles/${ID}/frames.jsonl`]: skewed }).client.bundle(entry)).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(await host({ [`bundles/${ID}/frames.jsonl`]: "" }).client.bundle(entry)).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });

  it("takes a missing trace file as an empty trace, as an old static host may have no file for it", async () => {
    const { client } = host({ [`bundles/${ID}/trace.jsonl`]: 404 });
    const b = await client.bundle(entry);
    expect(b.ok && b.value.trace).toEqual([]);
  });

  it("ignores fields it does not know", async () => {
    const { client } = host({ [`bundles/${ID}/bundle.json`]: JSON.stringify({ ...manifest, later: { a: 1 } }) });
    expect((await client.bundle(entry)).ok).toBe(true);
  });

  it("does not fetch a bundle for an entry that is not ready", async () => {
    const { asked, client } = host();
    const r = await client.bundle({ id: ID, kind: "run", status: "unfinished", reason: "Unfinished: x", attributes: {} });
    expect(r).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(asked).toEqual([]);
  });
});
