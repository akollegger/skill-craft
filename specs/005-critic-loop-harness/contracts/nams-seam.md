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

## Probe results (2026-10-04)

One real run of the candidate step on a throwaway managed workspace (`spikes/critic-loop/probe-generate.ts`): three faithful-world
stone_pickaxe runs, prose format. The workspace was created, recorded into, generated from, downloaded from and deleted, and the
account afterwards listed only its two original workspaces. Shapes are in `test/fixtures/nams/` (values invented).

- **Workspace tools.** `workspace_create` replies with JSON that has `id`. `workspace_list` and `workspace_create` put a line of prose
  (such as "Listed 3 workspaces") before the JSON, so the reply is parsed from its first brace. A first attempt that did not do this
  created a workspace and could not read its id; that one was found by name and deleted by hand, and the parser was fixed.
  `workspace_get` reports readiness (`status: active`), and `GET /v1/entities/count` answered `{count: 0}` once the database was up.
- **Capabilities.** `{ attestationConfigured, autosuggest, composition, coverageThreshold: 0.6, distillation, groundingThreshold: 0.9 }`.
- **Recording.** Conversation, message, step and tool-call creates all answer `201` with an `id` (tool-calls also echo `status`, `stepId`,
  `toolName`). A conversation's message list is `[user, assistant]`.
- **Extraction.** `GET /v1/conversations/{id}/extraction-status` answers `{ messages: [{ id, role, status, attempts, error, lastRunAt }], summary }`
  with message statuses `pending`, `processing` and `done`. `summary` counts by status and can briefly read `done` and `pending` together, so the
  client reads each message's status and waits until every one is `done`. Three runs took about 345 s.
- **Generate.** `POST /v1/skills/generate` answers `202 { runId, status: "queued" }`.
- **Run.** `GET /v1/skills/runs/{runId}` answers `{ id, kind: "distill", status, progress, skillId, skillVersionId, groundingScore, coverageScore, failCode, error, completedAt, ... }`.
  Status words seen: `snapshot_pinned`, `packaging`, `succeeded`. Until success `skillId` is `""` and the scores are null; on success `skillId`
  holds the id, the two scores are numbers (1 and 1 here) and `error` is `""`. A failed run was not provoked: its status word, `failCode` and
  scores are assumed from the same record (`run-failed-assumed.json`).
- **Download.** `GET /v1/skills/{skillId}/download` answers `application/zip`. The archive's files sit at its root: `SKILL.md`,
  `references/procedures.md`, `references/domain-model.md`, `references/exemplars.md`, `provenance.json`. Its `SKILL.md` front matter carries extra
  fields (version, source-workspace-hash, distilled-at, grounding-score, nams-provenance-id, procedure-format).
- **Timing** (stages, seconds): create and wait for the database 40.6; record the three runs 19.3, 5.6 and 5.4; wait for extraction 345.2;
  generate 23.3; download 0.5; delete 8.5. About 7.5 minutes in all.
- **The candidate itself.** The distiller again produced a generic skill (`mcp-craft-workflow`) with no recipe: a search of its files finds no
  cobblestone, stick or plank. This is the same finding as the faithful-world experiment, and exactly the input the loop is for.
