import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalSpec } from "../src/harness/models.js";
import { ALIASES_PATH, loadAliases, priceSource } from "../src/harness/pricing.js";

describe("the aliases file (spec 007 FR-051)", () => {
  const aliases = loadAliases();
  const raw = JSON.parse(readFileSync(ALIASES_PATH, "utf8")) as Record<string, unknown>;

  it("loads, and holds ids only: no rate, no variant, no key that is not a canonical spec", () => {
    expect(Object.keys(aliases).length).toBeGreaterThan(0);
    for (const [spec, id] of Object.entries(aliases)) {
      expect(canonicalSpec(spec), spec).toBe(spec);
      expect(id, spec).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/); // an author, a slash and a slug: nothing with a colon variant, a space or a number
    }
    for (const [key, value] of Object.entries(raw)) if (!key.startsWith("_")) expect(typeof value, key).toBe("string");
  });

  it("maps the Claude models in use to the OpenRouter entry of the same model, checked against its name and canonical slug", () => {
    expect(aliases["anthropic/claude-haiku-4-5-20251001"]).toBe("anthropic/claude-haiku-4.5"); // its canonical slug carries the date 20251001
    expect(aliases["anthropic/claude-haiku-4-5"]).toBe("anthropic/claude-haiku-4.5");
    expect(aliases["anthropic/claude-sonnet-5-5"]).toBe("anthropic/claude-sonnet-5.5"); // not claude-sonnet-5, which is the earlier model
    expect(aliases["anthropic/claude-opus-5-5"]).toBe("anthropic/claude-opus-5.5");
  });

  it("aliases the Fireworks models whose OpenRouter entry is unambiguous, and leaves out one that was not checked", () => {
    expect(aliases["fireworks/gpt-oss-120b"]).toBe("openai/gpt-oss-120b");
    expect(aliases["fireworks/nemotron-lightning-3p5-30b-a3b"]).toBe("nvidia/nemotron-3.5-lightning"); // 3B active of 30B total
    expect(aliases).not.toHaveProperty("fireworks/glm-5p3");
  });

  it("aliases the survey models by id, each checked against its OpenRouter entry on 2026-10-13", () => {
    expect(aliases["anthropic/claude-fable-5-1"]).toBe("anthropic/claude-fable-5.1");
    expect(aliases["anthropic/claude-haiku-5-5"]).toBe("anthropic/claude-haiku-5.5");
    expect(aliases["fireworks/nemotron-3-ultra-nvfp4"]).toBe("nvidia/nemotron-3-ultra-550b-a55b"); // the nvfp4 build of the 550B model
    expect(aliases["fireworks/glm-5p3-flash"]).toBe("z-ai/glm-5.3-flash"); // not the flashx variant
    expect(aliases["fireworks/deepseek-v4p1-flash"]).toBe("deepseek/deepseek-v4.1-flash");
    expect(aliases["fireworks/minimax-m3"]).toBe("minimax/minimax-m3");
    expect(aliases["fireworks/ember-1"]).toBe("fireworks/ember-1");
    expect(aliases["fireworks/kimi-k3"]).toBe("moonshotai/kimi-k3");
  });

  it("gives a quote for an aliased model that has no pin, through the resolver, and none for one that has no alias", async () => {
    const list = { data: [{ id: "anthropic/claude-sonnet-5.5", pricing: { prompt: "0.000002", completion: "0.00001", input_cache_read: "0.0000001", input_cache_write: "0.0000025" } }] };
    const fetch = (async () => new Response(JSON.stringify(list))) as unknown as typeof globalThis.fetch;
    const s = priceSource({ pins: {}, fetch, cachePath: `${process.env["TMPDIR"] ?? "/tmp"}/skill-craft-alias-test-${process.pid}.json`, now: () => 0 });
    const q = await s.resolve("claude-sonnet-5-5");
    expect(q).toMatchObject({ source: "market-quote", openRouterId: "anthropic/claude-sonnet-5.5" });
    expect(q?.perMillion.cacheRead).toBeCloseTo(0.1, 9);
    expect(await s.resolve("fireworks/glm-5p3")).toBeUndefined();
  });
});
