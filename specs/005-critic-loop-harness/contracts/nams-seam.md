# Contract: the NAMS seam

`NamsApi` (in `src/loop/nams.ts`) is the only way the loop talks to the memory service. The real client uses `fetch` for
the REST calls and the MCP client for the workspace tools; tests use `test/helpers/fake-nams.ts`.

```ts
export interface NamsApi {
  capabilities(workspaceId?: string): Promise<unknown>;           // GET /v1/skills/capabilities
  createWorkspace(name: string): Promise<{ id: string }>;          // MCP workspace_create (managed)
  waitActive(id: string, signal: AbortSignal): Promise<void>;      // MCP workspace_get + an entity count on the workspace
  listWorkspaceIds(): Promise<string[]>;                           // MCP workspace_list
  deleteWorkspace(id: string): Promise<void>;                      // MCP workspace_delete
  addConversation(ws: string, metadata: object): Promise<{ id: string }>;                       // POST /v1/conversations
  addMessage(ws: string, conv: string, role: "user" | "assistant", content: string): Promise<void>;  // POST /v1/conversations/{id}/messages
  addStep(ws: string, conv: string, tool: string): Promise<{ id: string }>;                     // POST /v1/reasoning/steps
  addToolCall(ws: string, call: RecordedCall, stepId: string): Promise<void>;                   // POST /v1/reasoning/tool-calls
  waitExtracted(ws: string, convs: string[], signal: AbortSignal): Promise<void>;               // GET /v1/conversations/{id}/extraction-status
  generateSkill(ws: string, req: { conversationIds: string[]; procedureFormat: "graph" | "prose"; nameHint?: string }): Promise<{ runId: string }>;  // POST /v1/skills/generate
  getRun(ws: string, runId: string): Promise<{ status: string; skillId?: string; gates?: unknown; failure?: string }>;  // GET /v1/skills/runs/{id}
  downloadSkill(ws: string, skillId: string): Promise<Uint8Array>;  // GET /v1/skills/{id}/download
}
```

Every data call sends `Authorization: Bearer <NAMS_API_KEY>` and `X-Workspace-Id: <ws>`; the key is read from the
environment at construction and is not a field of anything returned, logged or recorded.

## The guard (`WorkspaceGuard`)

- holds the set of ids this step created (one id per step) and exposes `assertOwned(id)`
- `addConversation`, `addMessage`, `addStep`, `addToolCall`, `generateSkill`, `downloadSkill` and `deleteWorkspace` call
  `assertOwned` first; any other id throws `WorkspaceRefused` before a request is made
- the id in `NAMS_WORKSPACE_ID` (the experiment or development workspace) is refused even if it appears in the set
- `deleteWorkspace` also confirms the id is in `listWorkspaceIds()`
- deletion is attempted in a `finally`, on abort, and on timeout; a failed deletion is reported with the id and does not hide
  the loop's own result

## Probes (go-ahead needed, one throwaway workspace)

The OpenAPI response bodies for `GET /v1/skills/runs/{id}` and the skill download are untyped. Before the real client is
finished, one guarded live generation records: the run's status values, where the skill id appears, what a failed gate
returns, and the zip's file list. Those become the fixture `fake-nams.ts` replays, and this file is updated with the result.
