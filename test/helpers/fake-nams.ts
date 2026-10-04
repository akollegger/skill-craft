/**
 * A scripted `NamsApi` for tests, shaped from the OpenAPI spec and the pilot's notes (the live probe, task T021,
 * refines the canned answers). It keeps every call, so a test can assert exactly which workspace ids were touched.
 */
import type { NamsApi, RecordedCall, RunStatus } from "../../src/loop/nams.js";

export interface FakeNamsOptions {
  /** The zip `downloadSkill` returns. */
  zip?: Uint8Array;
  /** `getRun` answers in order; the last one repeats. Default: one completed run that names a skill. */
  runs?: RunStatus[];
  /** Methods that throw, with an error whose text must never reach a record. */
  failOn?: string[];
  /** Methods that wait until the signal aborts (a stuck service). */
  hangOn?: string[];
  /** Ids already in the account, such as the development workspace. */
  existing?: string[];
  /** The id the created workspace gets. */
  createdId?: string;
}

export interface FakeCall {
  method: string;
  ws?: string | undefined;
  detail?: unknown;
}

export const FAKE_SECRET = "SERVICE-ERROR-TEXT-DO-NOT-LEAK";

export class FakeNams implements NamsApi {
  calls: FakeCall[] = [];
  created: string[] = [];
  deleted: string[] = [];
  recorded: { ws: string; conv: string; kind: string; detail: unknown }[] = [];
  private accounts: Set<string>;
  private runIndex = 0;
  private convCount = 0;

  constructor(private readonly o: FakeNamsOptions = {}) {
    this.accounts = new Set(o.existing ?? []);
  }

  /** The ids that any call carried, other than listing. */
  touched(): string[] {
    return [...new Set(this.calls.filter((c) => c.ws !== undefined && c.method !== "listWorkspaceIds").map((c) => c.ws as string))];
  }

  private async enter(method: string, ws?: string, detail?: unknown, signal?: AbortSignal): Promise<void> {
    this.calls.push({ method, ws, detail });
    if (this.o.failOn?.includes(method)) throw new Error(`${method} failed: ${FAKE_SECRET}`);
    if (this.o.hangOn?.includes(method)) {
      await new Promise<void>((resolve) => (signal ? signal.addEventListener("abort", () => resolve(), { once: true }) : undefined));
      throw new Error("aborted");
    }
  }

  async capabilities(ws: string) { await this.enter("capabilities", ws); return { thresholds: { grounding: 0.9, coverage: 0.6 } }; }
  async createWorkspace(name: string) {
    await this.enter("createWorkspace", undefined, { name });
    const id = this.o.createdId ?? `ws-created-${this.created.length + 1}`;
    this.created.push(id);
    this.accounts.add(id);
    return { id };
  }
  async waitActive(id: string, signal: AbortSignal) { await this.enter("waitActive", id, undefined, signal); }
  async listWorkspaceIds() { await this.enter("listWorkspaceIds"); return [...this.accounts]; }
  async deleteWorkspace(id: string) { await this.enter("deleteWorkspace", id); this.deleted.push(id); this.accounts.delete(id); }
  async addConversation(ws: string, metadata: object) { await this.enter("addConversation", ws, metadata); const id = `conv-${++this.convCount}`; this.recorded.push({ ws, conv: id, kind: "conversation", detail: metadata }); return { id }; }
  async addMessage(ws: string, conv: string, role: "user" | "assistant", content: string) { await this.enter("addMessage", ws, { conv, role }); this.recorded.push({ ws, conv, kind: "message", detail: { role, content } }); }
  async addStep(ws: string, conv: string, tool: string) { await this.enter("addStep", ws, { conv, tool }); const id = `step-${this.recorded.length}`; this.recorded.push({ ws, conv, kind: "step", detail: { tool, id } }); return { id }; }
  async addToolCall(ws: string, call: RecordedCall, stepId: string) { await this.enter("addToolCall", ws, { stepId }); this.recorded.push({ ws, conv: "", kind: "toolCall", detail: { ...call, stepId } }); }
  async waitExtracted(ws: string, convs: string[], signal: AbortSignal) { await this.enter("waitExtracted", ws, { convs }, signal); }
  async generateSkill(ws: string, req: { conversationIds: string[]; procedureFormat: "graph" | "prose"; nameHint?: string }) { await this.enter("generateSkill", ws, req); return { runId: "run-1" }; }
  async getRun(ws: string, runId: string): Promise<RunStatus> {
    await this.enter("getRun", ws, { runId });
    // The sequence the probe saw: snapshot_pinned, packaging, then succeeded with the skill id and the two scores.
    const runs = this.o.runs ?? [{ status: "snapshot_pinned" }, { status: "packaging" }, { status: "succeeded", skillId: "skill-1", gates: { grounding: 1, coverage: 1 } }];
    return runs[Math.min(this.runIndex++, runs.length - 1)]!;
  }
  async downloadSkill(ws: string, skillId: string) { await this.enter("downloadSkill", ws, { skillId }); return this.o.zip ?? new Uint8Array(); }
}
