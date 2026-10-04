/**
 * The loop's only way to talk to the memory service (contracts/nams-seam.md). `NamsApi` is the seam; the real client
 * uses `fetch` for the REST calls and the service's MCP tools for the workspace lifecycle (the REST API can create a
 * workspace but has no delete). `WorkspaceGuard` and `guarded()` sit in front of any `NamsApi`: the step may touch only the
 * workspace it created, and never the one a development or experiment session records to.
 */
import { CandidateFailed, LoopCancelled, WorkspaceRefused } from "../harness/errors.js";

export interface RecordedCall {
  tool: string;
  input: string;
  output: string;
  status: "success" | "failure";
  durationMs: number;
}

/** A distillation run as the service reports it. Shapes beyond `status` are tolerated, not assumed (see the probe, T021). */
export interface RunStatus {
  status: string;
  skillId?: string | undefined;
  gates?: unknown;
  failure?: string | undefined;
}

export interface NamsApi {
  capabilities(ws: string): Promise<unknown>;
  createWorkspace(name: string): Promise<{ id: string }>;
  waitActive(id: string, signal: AbortSignal): Promise<void>;
  listWorkspaceIds(): Promise<string[]>;
  deleteWorkspace(id: string): Promise<void>;
  addConversation(ws: string, metadata: object): Promise<{ id: string }>;
  addMessage(ws: string, conv: string, role: "user" | "assistant", content: string): Promise<void>;
  addStep(ws: string, conv: string, tool: string): Promise<{ id: string }>;
  addToolCall(ws: string, call: RecordedCall, stepId: string): Promise<void>;
  waitExtracted(ws: string, convs: string[], signal: AbortSignal): Promise<void>;
  generateSkill(ws: string, req: { conversationIds: string[]; procedureFormat: "graph" | "prose"; nameHint?: string }): Promise<{ runId: string }>;
  getRun(ws: string, runId: string): Promise<RunStatus>;
  downloadSkill(ws: string, skillId: string): Promise<Uint8Array>;
}

/** The ids the step created, and the ids it must never touch. */
export class WorkspaceGuard {
  private readonly owned = new Set<string>();
  private readonly forbidden: Set<string>;

  constructor(options: { forbidden: readonly string[] }) {
    this.forbidden = new Set(options.forbidden.filter((id) => id !== ""));
  }

  own(id: string): void {
    if (this.forbidden.has(id)) throw new WorkspaceRefused("the service returned a workspace id this step must never use");
    this.owned.add(id);
  }

  assertOwned(id: string): void {
    if (this.forbidden.has(id) || !this.owned.has(id)) throw new WorkspaceRefused("that workspace was not created by this step");
  }
}

/** Wrap a client so every call that names a workspace is checked first; a refused call never reaches the service. */
export function guarded(inner: NamsApi, guard: WorkspaceGuard): NamsApi {
  const own = <A extends unknown[], R>(f: (ws: string, ...rest: A) => Promise<R>) => async (ws: string, ...rest: A): Promise<R> => {
    guard.assertOwned(ws);
    return f.call(inner, ws, ...rest);
  };
  return {
    capabilities: own(inner.capabilities),
    async createWorkspace(name) {
      const created = await inner.createWorkspace(name);
      guard.own(created.id);
      return created;
    },
    waitActive: own(inner.waitActive),
    listWorkspaceIds: () => inner.listWorkspaceIds(),
    async deleteWorkspace(id) {
      guard.assertOwned(id);
      if (!(await inner.listWorkspaceIds()).includes(id)) throw new WorkspaceRefused("that workspace is not in the account's list");
      await inner.deleteWorkspace(id);
    },
    addConversation: own(inner.addConversation),
    addMessage: own(inner.addMessage),
    addStep: own(inner.addStep),
    addToolCall: own(inner.addToolCall),
    waitExtracted: own(inner.waitExtracted),
    generateSkill: own(inner.generateSkill),
    getRun: own(inner.getRun),
    downloadSkill: own(inner.downloadSkill),
  } as NamsApi;
}

/** The workspace lifecycle, through the service's MCP tools. Injected so tests need no network. */
export interface WorkspaceTools {
  create(name: string, signal?: AbortSignal): Promise<{ id: string }>;
  isActive(id: string, signal?: AbortSignal): Promise<boolean>;
  list(signal?: AbortSignal): Promise<string[]>;
  delete(id: string, signal?: AbortSignal): Promise<void>;
  close?(): Promise<void>;
}

export interface NamsClientOptions {
  key: string;
  baseUrl?: string | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  tools: WorkspaceTools;
  /** Delay between polls. Default 5 s. */
  pollMs?: number | undefined;
  /** The longest any wait may take. Default 15 minutes. */
  maxWaitMs?: number | undefined;
  /**
   * Ends every request the loop makes when it aborts, so a stalled call cannot hold up the cancellation. Listing and deleting a
   * workspace do not use it: they must still run after an abort, under their own time limit.
   */
  signal?: AbortSignal | undefined;
  /** The time limit for listing and deleting, which run after an abort. Default 60 s. */
  cleanupTimeoutMs?: number | undefined;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Every string value stored under a key named `status` anywhere in a response. */
function statuses(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => statuses(x, out));
  else if (typeof v === "object" && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      if (k === "status" && typeof x === "string") out.push(x.toLowerCase());
      else statuses(x, out);
    }
  }
  return out;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new LoopCancelled());
    const t = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new LoopCancelled()); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createNamsClient(o: NamsClientOptions): NamsApi {
  const base = (o.baseUrl ?? "https://memory.neo4jlabs.com").replace(/\/$/, "");
  const doFetch = o.fetch ?? globalThis.fetch;
  const pollMs = o.pollMs ?? 5000;
  const maxWaitMs = o.maxWaitMs ?? 15 * 60_000;
  const cleanup = () => AbortSignal.timeout(o.cleanupTimeoutMs ?? 60_000);

  // The key is closed over here and is never a property of anything this function returns.
  async function request(method: string, path: string, ws: string, body?: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${o.key}`, "X-Workspace-Id": ws, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(o.signal ? { signal: o.signal } : {}),
      });
    } catch (e) {
      if (o.signal?.aborted) throw new LoopCancelled();
      throw new CandidateFailed(`the service could not be reached for ${method} ${path}`, e);
    }
    // The route and the status only: the body can carry anything the service said.
    if (!res.ok) throw new CandidateFailed(`the service answered HTTP ${res.status} to ${method} ${path}`);
    return res;
  }
  const json = async (method: string, path: string, ws: string, body?: unknown): Promise<Record<string, unknown>> => obj(await (await request(method, path, ws, body)).json().catch(() => ({})));

  async function until(done: () => Promise<boolean>, what: string, signal: AbortSignal): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      if (await done()) return;
      if (Date.now() >= deadline) throw new CandidateFailed(`${what} did not finish in time`);
      await sleep(pollMs, signal);
    }
  }

  return {
    capabilities: (ws) => json("GET", "/v1/skills/capabilities", ws),
    async createWorkspace(name) {
      return o.tools.create(name, o.signal);
    },
    async waitActive(id, signal) {
      await until(
        async () =>
          (await o.tools.isActive(id, o.signal)) &&
          (await doFetch(`${base}/v1/entities/count`, { headers: { Authorization: `Bearer ${o.key}`, "X-Workspace-Id": id }, ...(o.signal ? { signal: o.signal } : {}) }).then((r) => r.ok, () => false)),
        "the workspace's database",
        signal,
      );
    },
    listWorkspaceIds: () => o.tools.list(cleanup()),
    deleteWorkspace: (id) => o.tools.delete(id, cleanup()),
    async addConversation(ws, metadata) {
      const id = str((await json("POST", "/v1/conversations", ws, { metadata }))["id"]);
      if (!id) throw new CandidateFailed("the service gave no conversation id");
      return { id };
    },
    async addMessage(ws, conv, role, content) {
      await request("POST", `/v1/conversations/${conv}/messages`, ws, { role, content });
    },
    async addStep(ws, conv, tool) {
      const id = str((await json("POST", "/v1/reasoning/steps", ws, { conversationId: conv, actionTaken: tool, reasoning: `Claude Code ran ${tool} with the provided tool input` }))["id"]);
      if (!id) throw new CandidateFailed("the service gave no step id");
      return { id };
    },
    async addToolCall(ws, call, stepId) {
      await request("POST", "/v1/reasoning/tool-calls", ws, { toolName: call.tool, input: call.input, output: call.output, status: call.status, durationMs: call.durationMs, stepId });
    },
    async waitExtracted(ws, convs, signal) {
      for (const conv of convs) {
        await until(async () => {
          const found = statuses(await json("GET", `/v1/conversations/${conv}/extraction-status`, ws));
          if (found.some((s) => s.includes("fail") || s.includes("error"))) throw new CandidateFailed("the service reported that extraction failed");
          // Every message must be done, not merely none pending (the pilot's finding).
          return found.length > 0 && found.every((s) => s === "done");
        }, "extraction", signal);
      }
    },
    async generateSkill(ws, req) {
      const body = await json("POST", "/v1/skills/generate", ws, {
        scope: { type: "conversations", conversationIds: req.conversationIds },
        procedureFormat: req.procedureFormat,
        ...(req.nameHint === undefined ? {} : { nameHint: req.nameHint }),
      });
      const runId = str(body["runId"]) ?? str(body["run_id"]) ?? str(body["id"]);
      if (!runId) throw new CandidateFailed("the service gave no run id");
      return { runId };
    },
    async getRun(ws, runId) {
      const body = await json("GET", `/v1/skills/runs/${runId}`, ws);
      const result = obj(body["result"]);
      // Observed on a succeeded run (2026-10-04 probe): status, skillId, failCode, groundingScore and coverageScore at the top level.
      const grounding = body["groundingScore"] ?? result["groundingScore"];
      const coverage = body["coverageScore"] ?? result["coverageScore"];
      return {
        status: (str(body["status"]) ?? str(body["state"]) ?? "unknown").toLowerCase(),
        skillId: str(body["skillId"]) ?? str(body["skill_id"]) ?? str(result["skillId"]) ?? str(result["skill_id"]),
        gates: body["gates"] ?? (typeof grounding === "number" || typeof coverage === "number" ? { grounding: grounding ?? null, coverage: coverage ?? null } : undefined),
        failure: str(body["failCode"]) ?? str(body["fail_code"]) ?? str(body["failure"]) ?? str(body["error_code"]) ?? str(body["reason"]),
      };
    },
    async downloadSkill(ws, skillId) {
      return new Uint8Array(await (await request("GET", `/v1/skills/${skillId}/download`, ws)).arrayBuffer());
    },
  };
}

/**
 * The workspace lifecycle through the service's MCP tools, as `spikes/faithful-1/workspace.ts` does it. Not unit-tested
 * (it needs the service); the live probe exercises it. The MCP client loads only when a workspace is actually needed.
 */
export function createMcpWorkspaceTools(key: string, baseUrl = "https://memory.neo4jlabs.com"): WorkspaceTools {
  let client: import("@modelcontextprotocol/sdk/client/index.js").Client | undefined;
  async function connect() {
    if (client) return client;
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const c = new Client({ name: "critic-loop", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl.replace(/\/$/, "")}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } });
    await c.connect(transport as never); // the SDK's transport types disagree with exactOptionalPropertyTypes
    client = c;
    return c;
  }
  async function call(tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const c = await connect();
    const res = (await c.callTool({ name: tool, arguments: args }, undefined, signal ? { signal } : undefined)) as { content: { text?: string }[]; isError?: boolean };
    const text = res.content.map((x) => x.text ?? "").join("");
    if (res.isError) throw new CandidateFailed(`the service refused ${tool}`);
    // The tools may put a line of prose before the JSON ("Listed 3 workspaces"), so parse from the first brace.
    for (const from of [0, text.search(/[[{]/)]) {
      if (from < 0) break;
      try { return JSON.parse(text.slice(from)); } catch { /* try the next start */ }
    }
    return { text };
  }
  return {
    async create(name, signal) {
      const r = obj(await call("workspace_create", { name, db_mode: "managed" }, signal));
      let id = str(r["id"]) ?? str(r["workspace_id"]) ?? str(obj(r["workspace"])["id"]);
      if (!id) {
        // The reply may not carry the id in a shape we expect; the workspace exists by now, so find it by name.
        const list = obj(await call("workspace_list", {}, signal))["workspaces"];
        const mine = (Array.isArray(list) ? list : []).map(obj).filter((w) => w["name"] === name);
        if (mine.length !== 1) throw new CandidateFailed("the service gave no workspace id");
        id = str(mine[0]!["id"]);
      }
      if (!id) throw new CandidateFailed("the service gave no workspace id");
      return { id };
    },
    async isActive(id, signal) {
      return /"status":\s*"active"/.test(JSON.stringify(await call("workspace_get", { workspace_id: id }, signal)));
    },
    async list(signal) {
      const r = await call("workspace_list", {}, signal);
      const list = Array.isArray(r) ? r : obj(r)["workspaces"];
      return (Array.isArray(list) ? list : []).map((w) => str(obj(w)["id"]) ?? str(obj(w)["workspace_id"])).filter((x): x is string => x !== undefined);
    },
    async delete(id, signal) {
      await call("workspace_delete", { workspace_id: id }, signal);
    },
    async close() {
      await client?.close().catch(() => {});
    },
  };
}
