import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PriceAliasesInvalid } from "../src/harness/errors.js";
import { loadAliases, priceSource } from "../src/harness/pricing.js";

// OpenRouter's public model list, in the shape it answers with (checked 2026-10-12): dollars per token, as strings.
const entry = (id: string, pricing: Record<string, unknown>) => ({ id, pricing });
const HAIKU = entry("anthropic/claude-haiku-4.5", { prompt: "0.000001", completion: "0.000005", input_cache_read: "0.0000001", input_cache_write: "0.00000125", input_cache_write_1h: "0.000002", web_search: "0.01" });
const LIST = {
  data: [
    HAIKU,
    entry("anthropic/claude-haiku-4.5:batch", { prompt: "0.0000005", completion: "0.0000025" }),
    entry("anthropic/claude-sonnet-5.5", { prompt: "0.000002", completion: "0.00001", input_cache_read: "0.0000001", input_cache_write: "0.0000025" }),
    entry("anthropic/claude-sonnet-5", { prompt: "0.000002", completion: "0.00001", input_cache_read: "0.0000002", input_cache_write: "0.0000025" }),
    entry("openai/gpt-oss-120b", { prompt: "0.000000037", completion: "0.00000017" }),
    entry("openai/gpt-oss-120b:free", { prompt: "0", completion: "0" }),
    entry("tiered/model", { prompt: "0.000003", completion: "0.000015", overrides: [{ min_prompt_tokens: 200000, prompt: "0.000006", completion: "0.0000225" }] }),
  ],
};
const ALIASES = { "anthropic/claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5", "fireworks/gpt-oss-120b": "openai/gpt-oss-120b", "tiered/m": "tiered/model" };

interface Seen { url: string; init: RequestInit | undefined }
/** A fetch that answers with the list (or fails), and keeps what it was asked. */
function fetcher(answer: unknown = LIST, mode: "ok" | "http500" | "throw" = "ok") {
  const seen: Seen[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    if (mode === "throw") throw new Error("offline SECRET-NETWORK-TEXT");
    return mode === "http500" ? new Response("{}", { status: 500 }) : new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, seen };
}
const cachePath = () => join(mkdtempSync(join(tmpdir(), "skill-craft-prices-")), "openrouter-models.json");
const T0 = Date.parse("2026-10-12T12:00:00Z");
const HOUR = 3_600_000;
const source = (over: Record<string, unknown> = {}) => priceSource({ pins: {}, aliases: ALIASES, cachePath: cachePath(), now: () => T0, ...over } as never);

describe("a pin", () => {
  it("is used first, without a fetch, and records its rates and that it is a pin", async () => {
    const f = fetcher();
    const pins = { "anthropic/claude-haiku-4-5-20251001": { input: 9, output: 99 } };
    const q = await source({ pins, fetch: f.fetch }).resolve("claude-haiku-4-5-20251001"); // a bare Claude id is read as anthropic/<id>
    expect(q).toEqual({ source: "pin", openRouterId: null, fetchedAt: null, perMillion: { input: 9, output: 99 } });
    expect(f.seen).toHaveLength(0);
  });
});

describe("a market quote", () => {
  it("is read for a model with an alias, as dollars per million tokens, with the five-minute cache write rate", async () => {
    const f = fetcher();
    const q = await source({ fetch: f.fetch }).resolve("anthropic/claude-haiku-4-5-20251001");
    expect(q).toMatchObject({ source: "market-quote", openRouterId: "anthropic/claude-haiku-4.5", fetchedAt: "2026-10-12T12:00:00.000Z" });
    expect(q?.perMillion.input).toBeCloseTo(1, 9);
    expect(q?.perMillion.output).toBeCloseTo(5, 9);
    expect(q?.perMillion.cacheRead).toBeCloseTo(0.1, 9);
    expect(q?.perMillion.cacheWrite).toBeCloseTo(1.25, 9); // not the one-hour rate
  });

  it("asks the public list without a key or any credential, and only once for many models", async () => {
    const f = fetcher();
    const s = source({ fetch: f.fetch });
    await s.resolve("anthropic/claude-haiku-4-5-20251001");
    await s.resolve("fireworks/gpt-oss-120b");
    expect(f.seen).toHaveLength(1);
    expect(f.seen[0]?.url).toBe("https://openrouter.ai/api/v1/models");
    const headers = JSON.stringify(f.seen[0]?.init?.headers ?? {}).toLowerCase();
    for (const word of ["authorization", "bearer", "cookie", "api-key", "api_key"]) expect(headers).not.toContain(word);
  });

  it("leaves out the cache rates a model has none of", async () => {
    const q = await source({ fetch: fetcher().fetch }).resolve("fireworks/gpt-oss-120b");
    expect(q?.perMillion).toEqual({ input: expect.closeTo(0.037, 9), output: expect.closeTo(0.17, 9) });
    expect(q?.perMillion).not.toHaveProperty("cacheRead");
    expect(q?.perMillion).not.toHaveProperty("cacheWrite");
  });

  it("is never made for a model with no alias, however close a name in the list is, and does not even fetch", async () => {
    const f = fetcher();
    expect(await source({ fetch: f.fetch }).resolve("anthropic/claude-sonnet-5-5")).toBeUndefined(); // the list has claude-sonnet-5.5, and a near-match is not a match
    expect(f.seen).toHaveLength(0);
  });

  it("is the aliased entry exactly: a variant or a missing id gives none", async () => {
    const f = fetcher();
    const s = source({ fetch: f.fetch, aliases: { ...ALIASES, "a/batch": "anthropic/claude-haiku-4.5:batch", "a/free": "openai/gpt-oss-120b:free", "a/gone": "no/such-model" } });
    for (const spec of ["a/batch", "a/free", "a/gone"]) expect(await s.resolve(spec), spec).toBeUndefined();
  });

  it("is the base rate for a model with a long-prompt tier, and says the tier was ignored", async () => {
    const q = await source({ fetch: fetcher().fetch }).resolve("tiered/m");
    expect(q?.perMillion.input).toBeCloseTo(3, 9);
    expect(q?.note).toBe("tiers ignored");
    expect((await source({ fetch: fetcher().fetch }).resolve("anthropic/claude-haiku-4-5-20251001"))?.note).toBeUndefined();
  });
});

describe("the cache of the list", () => {
  it("is written once with only the list and when it was fetched, and read by the next session without a fetch", async () => {
    const path = cachePath();
    const f = fetcher();
    await source({ fetch: f.fetch, cachePath: path }).resolve("fireworks/gpt-oss-120b");
    const cached = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    expect(Object.keys(cached).sort()).toEqual(["fetchedAt", "models"]);
    expect(cached["fetchedAt"]).toBe("2026-10-12T12:00:00.000Z");
    const g = fetcher();
    const q = await source({ fetch: g.fetch, cachePath: path, now: () => T0 + HOUR }).resolve("fireworks/gpt-oss-120b");
    expect(g.seen).toHaveLength(0);
    expect(q?.fetchedAt).toBe("2026-10-12T12:00:00.000Z"); // the quote says when the list was read, not when it was used
  });

  it("is refreshed when it is older than a day, and the quote carries the new time", async () => {
    const path = cachePath();
    await source({ fetch: fetcher().fetch, cachePath: path }).resolve("fireworks/gpt-oss-120b");
    const g = fetcher();
    const q = await source({ fetch: g.fetch, cachePath: path, now: () => T0 + 25 * HOUR }).resolve("fireworks/gpt-oss-120b");
    expect(g.seen).toHaveLength(1);
    expect(q?.fetchedAt).toBe("2026-10-13T13:00:00.000Z");
  });

  it("is used when it is stale and the network is not, saying how old the list is", async () => {
    const path = cachePath();
    await source({ fetch: fetcher().fetch, cachePath: path }).resolve("fireworks/gpt-oss-120b");
    for (const mode of ["throw", "http500"] as const) {
      const q = await source({ fetch: fetcher(LIST, mode).fetch, cachePath: path, now: () => T0 + 48 * HOUR }).resolve("fireworks/gpt-oss-120b");
      expect(q?.fetchedAt, mode).toBe("2026-10-12T12:00:00.000Z");
    }
  });

  it("gives no quote, and does not fail, with no cache and no network or an answer that is not the list", async () => {
    for (const f of [fetcher(LIST, "throw"), fetcher(LIST, "http500"), fetcher({ nothing: true }), fetcher({ data: "no" })]) {
      const path = cachePath();
      expect(await source({ fetch: f.fetch, cachePath: path }).resolve("fireworks/gpt-oss-120b")).toBeUndefined();
      expect(existsSync(path)).toBe(false); // nothing is cached that was not the list
    }
  });

  it("is not replaced by an answer that is not the list", async () => {
    const path = cachePath();
    await source({ fetch: fetcher().fetch, cachePath: path }).resolve("fireworks/gpt-oss-120b");
    const before = readFileSync(path, "utf8");
    await source({ fetch: fetcher({ nothing: true }).fetch, cachePath: path, now: () => T0 + 48 * HOUR }).resolve("fireworks/gpt-oss-120b");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("never lets the network's own error text out", async () => {
    const q = await source({ fetch: fetcher(LIST, "throw").fetch }).resolve("fireworks/gpt-oss-120b");
    expect(JSON.stringify(q ?? {})).not.toContain("SECRET-NETWORK-TEXT");
  });
});

describe("the aliases", () => {
  const file = (text: string) => {
    const path = join(mkdtempSync(join(tmpdir(), "skill-craft-alias-")), "aliases.json");
    writeFileSync(path, text);
    return path;
  };

  it("are read from a data file of ids, with notes left out", () => {
    expect(loadAliases(file(JSON.stringify({ _note: "ids only", "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4.5" })))).toEqual({ "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4.5" });
  });

  it("read a bare Claude id as anthropic/<id>, the way a model spec is", () => {
    expect(loadAliases(file(JSON.stringify({ "claude-haiku-4-5": "anthropic/claude-haiku-4.5" })))).toEqual({ "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4.5" });
  });

  it("are none when there is no file, and are refused when a value is not an id, so a rate cannot be slipped in", () => {
    expect(loadAliases(join(tmpdir(), "no-such-aliases-file.json"))).toEqual({});
    for (const bad of [{ "a/b": { input: 1, output: 2 } }, { "a/b": 3 }, { "a/b": "" }, { "a/b": "has space" }]) {
      expect(() => loadAliases(file(JSON.stringify(bad)))).toThrow(PriceAliasesInvalid);
    }
    expect(() => loadAliases(file("{not json"))).toThrow(PriceAliasesInvalid);
  });
});
