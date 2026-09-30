import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverOptions, DriverSink } from "../src/harness/driver.js";

// The real SDK is replaced here by a stand-in for `query`, so the driver's own wiring can be tested without a
// session: what it does with the abort signal, a throw after a result, and a stream with no result.
const control = vi.hoisted(() => ({
  messages: [] as Record<string, unknown>[],
  waitForInterrupt: false,
  throwAfter: undefined as unknown,
  interrupt: undefined as unknown as ReturnType<typeof import("vitest").vi.fn>,
  lastOptions: undefined as { abortController?: AbortController } | undefined,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: ({ options }: { options: { abortController?: AbortController } }) => {
    control.lastOptions = options;
    const interrupt = control.interrupt;
    let release: () => void = () => {};
    const released = new Promise<void>((r) => (release = r));
    interrupt.mockImplementation(async () => release());
    return {
      interrupt,
      async *[Symbol.asyncIterator]() {
        for (const m of control.messages) yield m;
        if (control.waitForInterrupt) {
          await released;
          throw Object.assign(new Error("interrupted"), { name: "AbortError" });
        }
        if (control.throwAfter !== undefined) throw control.throwAfter;
      },
    };
  },
}));

const { sdkDriver } = await import("../src/harness/sdk-driver.js");

const sink = (): DriverSink => ({ onMessage: vi.fn(), onToolStart: vi.fn(), onToolEnd: vi.fn() });
const opts = (signal: AbortSignal): DriverOptions => ({ prompt: "p", world: "/w.json", runLog: "/r.jsonl", runDir: mkdtempSync(join(tmpdir(), "sdk-")), maxTurns: 5, record: false, signal });
const init = { type: "system", subtype: "init", model: "m-1" };
const result = (subtype: string) => ({ type: "result", subtype, num_turns: 2, total_cost_usd: 0.1, duration_ms: 500, result: "done", usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 }, modelUsage: { "m-1": {} } });

beforeEach(() => {
  control.messages = [];
  control.waitForInterrupt = false;
  control.throwAfter = undefined;
  control.interrupt = vi.fn();
});

describe("sdkDriver", () => {
  it("forwards every message to the sink and returns the mapped result", async () => {
    control.messages = [init, result("success")];
    const s = sink();
    const r = await sdkDriver(opts(new AbortController().signal), s);
    expect(s.onMessage).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ended: "stopped", initModel: "m-1", modelsUsed: ["m-1"], turns: 2, costUsd: 0.1 });
  });

  it("keeps an error_max_turns result when the SDK throws after delivering it", async () => {
    control.messages = [init, result("error_max_turns")];
    control.throwAfter = new Error("max turns");
    expect((await sdkDriver(opts(new AbortController().signal), sink())).ended).toBe("budget");
  });

  it("rethrows when the stream fails before any result", async () => {
    control.messages = [init];
    control.throwAfter = new Error("boom");
    await expect(sdkDriver(opts(new AbortController().signal), sink())).rejects.toThrow("boom");
  });

  it("throws when the stream ends without a result", async () => {
    control.messages = [init];
    await expect(sdkDriver(opts(new AbortController().signal), sink())).rejects.toThrow(/without a result/);
  });

  it("interrupts the query when the signal aborts, as well as aborting the option's controller", async () => {
    control.messages = [init];
    control.waitForInterrupt = true;
    const outer = new AbortController();
    const done = sdkDriver(opts(outer.signal), sink());
    await new Promise((r) => setTimeout(r, 20));
    outer.abort();
    await expect(done).rejects.toThrow();
    expect(control.interrupt).toHaveBeenCalledTimes(1);
    expect(control.lastOptions?.abortController?.signal.aborted).toBe(true);
  });

  it("interrupts at once when the signal is already aborted", async () => {
    control.messages = [init];
    control.waitForInterrupt = true;
    const outer = new AbortController();
    outer.abort();
    await expect(sdkDriver(opts(outer.signal), sink())).rejects.toThrow();
    expect(control.interrupt).toHaveBeenCalledTimes(1);
  });

  it("does not interrupt a run that finished normally", async () => {
    control.messages = [init, result("success")];
    const outer = new AbortController();
    await sdkDriver(opts(outer.signal), sink());
    outer.abort();
    expect(control.interrupt).not.toHaveBeenCalled();
  });
});
