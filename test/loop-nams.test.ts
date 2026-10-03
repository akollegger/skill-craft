import { describe, expect, it } from "vitest";
import { CandidateFailed, WorkspaceRefused } from "../src/harness/errors.js";
import { createNamsClient, guarded, WorkspaceGuard, type WorkspaceTools } from "../src/loop/nams.js";
import { FakeNams, FAKE_SECRET } from "./helpers/fake-nams.js";

const KEY = "nams_test_KEY_must_never_appear_0123456789";
const signal = new AbortController().signal;

describe("WorkspaceGuard and guarded()", () => {
  it("accepts only the id the step created, and refuses every other id before a request is made", async () => {
    const fake = new FakeNams({ existing: ["dev-ws"] });
    const g = guarded(fake, new WorkspaceGuard({ forbidden: [] }));
    const { id } = await g.createWorkspace("loop-x");
    await g.addConversation(id, {});
    const before = fake.calls.length;
    for (const call of [
      () => g.addConversation("dev-ws", {}),
      () => g.addMessage("dev-ws", "c", "user", "x"),
      () => g.addStep("dev-ws", "c", "t"),
      () => g.addToolCall("dev-ws", { tool: "t", input: "{}", output: "{}", status: "success", durationMs: 1 } as never, "s"),
      () => g.generateSkill("dev-ws", { conversationIds: [], procedureFormat: "prose" }),
      () => g.downloadSkill("dev-ws", "s"),
      () => g.getRun("dev-ws", "r"),
      () => g.waitExtracted("dev-ws", [], signal),
      () => g.capabilities("dev-ws"),
      () => g.deleteWorkspace("dev-ws"),
    ]) await expect(call()).rejects.toBeInstanceOf(WorkspaceRefused);
    expect(fake.calls.length).toBe(before); // nothing reached the service
    expect(fake.deleted).toEqual([]);
  });

  it("refuses the id in NAMS_WORKSPACE_ID even when the service hands it back as the created one", async () => {
    const fake = new FakeNams({ createdId: "the-experiment-ws" });
    const g = guarded(fake, new WorkspaceGuard({ forbidden: ["the-experiment-ws"] }));
    await expect(g.createWorkspace("loop-x")).rejects.toBeInstanceOf(WorkspaceRefused);
    await expect(g.addConversation("the-experiment-ws", {})).rejects.toBeInstanceOf(WorkspaceRefused);
  });

  it("deletes only an id that is in the account's list", async () => {
    const fake = new FakeNams();
    const g = guarded(fake, new WorkspaceGuard({ forbidden: [] }));
    const { id } = await g.createWorkspace("loop-x");
    await fake.deleteWorkspace(id); // gone behind the guard's back
    await expect(g.deleteWorkspace(id)).rejects.toBeInstanceOf(WorkspaceRefused);
  });

  it("deletes the created workspace", async () => {
    const fake = new FakeNams();
    const g = guarded(fake, new WorkspaceGuard({ forbidden: [] }));
    const { id } = await g.createWorkspace("loop-x");
    await g.deleteWorkspace(id);
    expect(fake.deleted).toEqual([id]);
  });
});

/** A fetch stub that records every request and answers from a table. */
function stub(answers: Record<string, unknown | ((n: number) => unknown)>, status = 200) {
  const seen: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
  const counts: Record<string, number> = {};
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const route = `${init.method ?? "GET"} ${u.pathname}`;
    seen.push({ method: init.method ?? "GET", url, headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)), body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    const key = Object.keys(answers).find((k) => route === k || (k.endsWith("*") && route.startsWith(k.slice(0, -1))));
    counts[route] = (counts[route] ?? 0) + 1;
    const a = key === undefined ? {} : answers[key];
    const body = typeof a === "function" ? (a as (n: number) => unknown)(counts[route]!) : a;
    if (body instanceof Uint8Array) return new Response(body, { status });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, seen };
}

const tools: WorkspaceTools = { create: async () => ({ id: "ws-1" }), isActive: async () => true, list: async () => ["ws-1"], delete: async () => {} };

describe("the real client's requests", () => {
  const make = (answers: Record<string, unknown>, status = 200) => {
    const s = stub(answers, status);
    return { ...s, nams: createNamsClient({ key: KEY, baseUrl: "https://nams.test", fetch: s.fetch, tools, pollMs: 1, maxWaitMs: 200 }) };
  };

  it("sends the key and the workspace on every data call, with the documented routes and bodies", async () => {
    const { nams, seen } = make({
      "POST /v1/conversations": { id: "c1" },
      "POST /v1/conversations/*": {},
      "POST /v1/reasoning/steps": { id: "s1" },
      "POST /v1/reasoning/tool-calls": {},
      "POST /v1/skills/generate": { runId: "r1" },
      "GET /v1/skills/runs/*": { status: "completed", skillId: "k1" },
      "GET /v1/skills/capabilities": { thresholds: {} },
    });
    await nams.addConversation("ws-1", { source: "critic-loop" });
    await nams.addMessage("ws-1", "c1", "user", "hello");
    await nams.addStep("ws-1", "c1", "mcp__craft__place");
    await nams.addToolCall("ws-1", { tool: "mcp__craft__place", input: "{}", output: "{}", status: "failure", durationMs: 12 } as never, "s1");
    await nams.generateSkill("ws-1", { conversationIds: ["c1"], procedureFormat: "prose", nameHint: "craft-x" });
    await nams.getRun("ws-1", "r1");
    await nams.capabilities("ws-1");
    for (const r of seen) {
      expect(r.headers["Authorization"]).toBe(`Bearer ${KEY}`);
      expect(r.headers["X-Workspace-Id"]).toBe("ws-1");
      expect(r.url.startsWith("https://nams.test/v1/")).toBe(true);
    }
    const byRoute = Object.fromEntries(seen.map((r) => [`${r.method} ${new URL(r.url).pathname}`, r.body]));
    expect(byRoute["POST /v1/conversations"]).toEqual({ metadata: { source: "critic-loop" } });
    expect(byRoute["POST /v1/conversations/c1/messages"]).toEqual({ role: "user", content: "hello" });
    expect(byRoute["POST /v1/reasoning/steps"]).toMatchObject({ conversationId: "c1", actionTaken: "mcp__craft__place" });
    expect(byRoute["POST /v1/reasoning/tool-calls"]).toEqual({ toolName: "mcp__craft__place", input: "{}", output: "{}", status: "failure", durationMs: 12, stepId: "s1" });
    expect(byRoute["POST /v1/skills/generate"]).toEqual({ scope: { type: "conversations", conversationIds: ["c1"] }, procedureFormat: "prose", nameHint: "craft-x" });
  });

  it("reads a run's status and skill id tolerantly, and returns the downloaded bytes", async () => {
    const { nams } = make({
      "GET /v1/skills/runs/*": { status: "succeeded", result: { skillId: "k9" }, gates: { coverage: 1 } },
      "GET /v1/skills/k9/download": new Uint8Array([1, 2, 3]),
    });
    expect(await nams.getRun("ws-1", "r1")).toMatchObject({ status: "succeeded", skillId: "k9" });
    expect(Array.from(await nams.downloadSkill("ws-1", "k9"))).toEqual([1, 2, 3]);
  });

  it("polls extraction until every message is done, and fails when one fails", async () => {
    const ok = make({ "GET /v1/conversations/*": (n: number) => ({ messages: [{ status: n < 3 ? "pending" : "done" }, { status: "done" }] }) });
    await expect(ok.nams.waitExtracted("ws-1", ["c1"], signal)).resolves.toBeUndefined();
    expect(ok.seen.length).toBeGreaterThanOrEqual(3);
    const bad = make({ "GET /v1/conversations/*": { messages: [{ status: "failed" }] } });
    await expect(bad.nams.waitExtracted("ws-1", ["c1"], signal)).rejects.toBeInstanceOf(CandidateFailed);
  });

  it("times out a wait that never finishes, with a fixed message", async () => {
    const never = make({ "GET /v1/conversations/*": { messages: [{ status: "pending" }] } });
    await expect(never.nams.waitExtracted("ws-1", ["c1"], signal)).rejects.toThrow(/did not finish/);
  });

  it("turns an HTTP error into a fixed message with the route and status, and never the body or the key", async () => {
    const { nams } = make({ "POST /v1/skills/generate": { detail: `${FAKE_SECRET} ${KEY}` } }, 500);
    try {
      await nams.generateSkill("ws-1", { conversationIds: ["c1"], procedureFormat: "prose" });
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CandidateFailed);
      const text = `${(e as Error).message} ${JSON.stringify(e)}`;
      expect(text).toContain("POST /v1/skills/generate");
      expect(text).toContain("500");
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(FAKE_SECRET);
    }
  });

  it("never holds the key in anything it returns", async () => {
    const { nams } = make({ "POST /v1/conversations": { id: "c1" }, "GET /v1/skills/capabilities": { ok: true } });
    expect(JSON.stringify(await nams.addConversation("ws-1", {}))).not.toContain(KEY);
    expect(JSON.stringify(await nams.capabilities("ws-1"))).not.toContain(KEY);
    expect(JSON.stringify(nams)).not.toContain(KEY);
  });

  it("creates a workspace through the tools, and waits until its database answers", async () => {
    let active = 0;
    const slow: WorkspaceTools = { ...tools, isActive: async () => ++active >= 3 };
    const s = stub({ "GET /v1/entities/count": { count: 0 } });
    const nams = createNamsClient({ key: KEY, baseUrl: "https://nams.test", fetch: s.fetch, tools: slow, pollMs: 1, maxWaitMs: 500 });
    expect(await nams.createWorkspace("loop-x")).toEqual({ id: "ws-1" });
    await nams.waitActive("ws-1", signal);
    expect(active).toBeGreaterThanOrEqual(3);
    expect(s.seen.some((r) => r.url.endsWith("/v1/entities/count") && r.headers["X-Workspace-Id"] === "ws-1")).toBe(true);
  });
});
