# 03 — Read-only API exploration

Date: 2026-09-29
Rule: GET requests only. Nothing was generated, created, reviewed or published.
The API key was loaded from `./.env` (`NAMS_API_KEY`) and never printed.

## Connection facts
- API: `https://memory.neo4jlabs.com/v1` (version "dev", environment production).
- The key is an **account-wide** key ("Default", label; expires 2026-12-28). Data-plane calls need
  the header `X-Workspace-Id: <id>` (the hooks plugin sends it). Without it: `401 no workspace identity`.
- Two workspaces on the account:
  | Name | Id | dbMode | Status |
  |------|----|--------|--------|
  | My Workspace | `c34de59e-4a13-47db-82e9-76f09c8863ea` | external | **active** (this is what the hooks record into) |
  | ABK Coding | `61f430b0-764e-4252-b756-f3d7ec9386d3` | managed | **pending** (`503 workspace_not_provisioned`) |

## Blocker: the key has no skills scopes
Every `/v1/skills/*` GET (`capabilities`, list, `runs`, `published`, `governance`) returns
`403 insufficient scope` in both workspaces. The key's `scopes` field is empty (`""`).
Docs say skills endpoints need `skills:read` and `skills:write`.
Options: create a new key with those scopes (in the dashboard, or `POST /v1/auth/api-keys`,
category "workspace" with a workspaceId; needs a user token or an admin key), or ask what the
dashboard offers. Creating a key is a write action, so it needs the user's go-ahead.

## What is recorded so far ("My Workspace")
- 1 conversation (this session), 7 messages, `metadata.harness = claude`, project dir = this repo.
- Extraction status: all messages `done`. 140 entities. Default ontology "NAMS Default" (POLE+O).
- Reasoning trace: 5 steps, 22 tool calls (13 Bash, 5 WebFetch, 2 ToolSearch, 2 Write, 1 WebSearch), all `success`.

## Observation that matters for distillation quality
- Tool calls are recorded richly: `toolName`, full `input`, `output`, `status`, `durationMs`, linked to a `stepId`.
- **Steps are shallow**: `actionTaken` is just "Ran Bash", `reasoning` is the generic string
  "Claude Code ran Bash with the provided tool input.", `result` is empty. The hooks don't capture
  the agent's actual reasoning. The graph/topology stage can work from tool calls, but the
  "judgment steps grounded in agent reasoning" from the blog may be thin with this plugin.
  Worth testing rather than assuming.
- Recording includes everything we run, including command text. Keep secrets out of commands.

## Housekeeping
- `./.env` is mode 644 (world-readable). Suggest `chmod 600 .env`, and add `.env` to `.gitignore`
  if this project becomes a git repo.

## Next
1. Get a key with `skills:read`/`skills:write` (user action or approval needed).
2. Then `GET /skills/capabilities` to confirm distillation is enabled and see thresholds.
3. Decide on demo workspace and task; record runs there.
