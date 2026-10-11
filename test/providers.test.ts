import { afterEach, describe, expect, it } from "vitest";
import { BackendNotPinned, UnknownModel, UnknownProvider } from "../src/harness/errors.js";
import { parseModelSpec } from "../src/harness/models.js";
import { PROVIDERS, findProvider, normaliseReported, providerPrefixes, validateRow, type ProviderRow } from "../src/harness/providers.js";

const row = (over: Partial<ProviderRow> = {}): ProviderRow => ({
  prefix: "scripted",
  package: "scripted-provider",
  factory: "createScripted",
  keyEnv: "SCRIPTED_API_KEY",
  shortPattern: /^[a-z0-9-]+$/,
  expand: (short) => short,
  normaliseId: (id) => `scripted/${id}`,
  usageReport: null,
  settings: { accepts: [] },
  callOptions: () => ({}),
  ...over,
});

describe("the provider table", () => {
  it("has rows for anthropic and fireworks", () => {
    expect(providerPrefixes()).toEqual(expect.arrayContaining(["anthropic", "fireworks"]));
    expect(findProvider("anthropic")?.keyEnv).toBe("ANTHROPIC_API_KEY");
    expect(findProvider("fireworks")?.keyEnv).toBe("FIREWORKS_API_KEY");
  });

  it("names the package and factory as strings, and imports no provider package itself", () => {
    for (const r of PROVIDERS) {
      expect(typeof r.package).toBe("string");
      expect(typeof r.factory).toBe("string");
    }
  });
});

describe("call options", () => {
  it("turn on the prompt cache for Anthropic, and set nothing for Fireworks", () => {
    expect(findProvider("anthropic")?.callOptions({}, "claude-haiku-4-5-20251001")).toEqual({ providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } });
    expect(findProvider("fireworks")?.callOptions({}, "accounts/fireworks/models/gpt-oss-120b")).toEqual({});
  });
});

describe("parseModelSpec", () => {
  it("records a Claude model in canonical form whichever way it was asked for", () => {
    for (const s of ["claude-sonnet-5-5", "anthropic/claude-sonnet-5-5"]) {
      expect(parseModelSpec(s)).toEqual({ provider: "anthropic", id: "claude-sonnet-5-5", spec: "anthropic/claude-sonnet-5-5" });
    }
  });

  it("expands a short Fireworks name, keeps the spec short, and leaves a full path alone", () => {
    expect(parseModelSpec("fireworks/gpt-oss-120b")).toEqual({ provider: "fireworks", id: "accounts/fireworks/models/gpt-oss-120b", spec: "fireworks/gpt-oss-120b" });
    expect(parseModelSpec("fireworks/accounts/fireworks/models/gpt-oss-120b").spec).toBe("fireworks/gpt-oss-120b");
    expect(parseModelSpec("fireworks/accounts/fireworks/routers/kimi-k3-fast")).toMatchObject({ id: "accounts/fireworks/routers/kimi-k3-fast", spec: "fireworks/accounts/fireworks/routers/kimi-k3-fast" });
  });

  it("round-trips its own spec", () => {
    for (const s of ["claude-sonnet-5-5", "fireworks/glm-5p3", "fireworks/accounts/fireworks/routers/kimi-k3-fast"]) {
      expect(parseModelSpec(parseModelSpec(s).spec)).toEqual(parseModelSpec(s));
    }
  });

  it("refuses an unknown provider with fixed text that lists the providers", () => {
    expect(() => parseModelSpec("mistral/large")).toThrow(UnknownProvider);
    expect(() => parseModelSpec("mistral/large")).toThrow("provider 'mistral' is not available; the providers are anthropic, fireworks");
  });

  it("refuses a bare name that is not a Claude id, and an empty model", () => {
    for (const s of ["gpt-4o", "", "fireworks/", "anthropic/gpt-4o"]) expect(() => parseModelSpec(s)).toThrow(UnknownModel);
  });
});

describe("normaliseReported", () => {
  it("maps what a provider reports to the canonical spec", () => {
    expect(normaliseReported("fireworks", "accounts/fireworks/models/x")).toBe("fireworks/x");
    expect(normaliseReported("fireworks", "accounts/fireworks/routers/kimi-k3-fast")).toBe("fireworks/accounts/fireworks/routers/kimi-k3-fast");
    expect(normaliseReported("anthropic", "claude-haiku-4-5-20251001")).toBe("anthropic/claude-haiku-4-5-20251001");
  });

  it("keeps an id it cannot place, in the provider's prefix, as reported", () => {
    expect(normaliseReported("fireworks", "something-else")).toBe("fireworks/something-else");
  });
});

describe("a router's backend", () => {
  it("is refused when its row is routed and does not pin a backend", () => {
    expect(() => validateRow(row({ routed: true }))).toThrow(BackendNotPinned);
    expect(() => validateRow(row({ routed: true }))).toThrow("provider 'scripted' routes one model across backends; its table entry must pin the backend");
  });

  it("is accepted when pinned, and a plain row needs no pin", () => {
    expect(() => validateRow(row({ routed: true, pinnedBackend: { allowFallbacks: false, order: ["a"] } }))).not.toThrow();
    expect(() => validateRow(row())).not.toThrow();
  });
});

describe("adding a row", () => {
  afterEach(() => {
    const i = PROVIDERS.findIndex((r) => r.prefix === "scripted");
    if (i >= 0) PROVIDERS.splice(i, 1);
  });

  it("is refused at parse time when it is a router with no pinned backend, so a run or a dry run stops before anything is created", () => {
    PROVIDERS.push(row({ routed: true }));
    expect(() => parseModelSpec("scripted/m-1")).toThrow(BackendNotPinned);
  });

  it("is accepted at parse time when its backend is pinned", () => {
    PROVIDERS.push(row({ routed: true, pinnedBackend: { allowFallbacks: false, order: ["b1"] } }));
    expect(parseModelSpec("scripted/m-1").spec).toBe("scripted/m-1");
  });

  it("makes its models parse with no other change", () => {
    PROVIDERS.push(row());
    expect(parseModelSpec("scripted/m-1")).toEqual({ provider: "scripted", id: "m-1", spec: "scripted/m-1" });
    expect(() => parseModelSpec("mistral/large")).toThrow("anthropic, fireworks, scripted");
  });
});
