# 02 — How to trigger skill distillation (research)

Date: 2026-09-29

## Answer
Distillation is triggered over **REST**, **MCP**, or the **dashboard UI**. Preview feature;
**no Python/TypeScript SDK method yet**. It is a one-call async job: `POST /v1/skills/generate`.

## Where we found it (in order of usefulness)
1. Public OpenAPI spec: https://memory.neo4jlabs.com/openapi.json (title "NAMS Memory API", v1.0,
   unauthenticated GET). Interactive docs at `/docs`. Saved a copy in the session scratchpad.
2. Skills Quickstart: https://neo4j.com/labs/agent-memory/tutorials/skills-quickstart/
3. Skills API reference: https://neo4j.com/labs/agent-memory/reference/skills-api/
4. Concepts: https://neo4j.com/labs/agent-memory/explanation/skills/
5. Also seen in search: `neo4j-contrib/neo4j-skills` has a `neo4j-agent-memory-skill` (not yet read).
- The `nams-plugins` repo README says nothing about skills. The hooks' generated client only
  covers conversations/entities/reasoning; it has no skills calls.

## The lifecycle (all under `https://memory.neo4jlabs.com/v1`)
Auth: `Authorization: Bearer nams_...`; the key needs `skills:read` + `skills:write` scopes.

| Step | Call |
|------|------|
| Check features/thresholds | `GET /skills/capabilities` |
| (Optional) find candidate scopes | `POST /skills/scan` -> 202 runId |
| Distill | `POST /skills/generate` `{"name": "...", "scope": {"type": "workspace"}}` -> 202 `{runId, status:"queued"}` |
| Poll | `GET /skills/runs/{id}` -> `status`, `outcome` (`Created` / `Withheld` / `Failed`), `skillId` |
| Inspect | `GET /skills/{id}`, `GET /skills/{id}/explain-provenance` |
| Review | `POST /skills/{id}/review` `{"decision": "approve"}` (or bulk: `POST /skills/review/bulk`) |
| Publish | `POST /skills/{id}/publish` (adds JWS attestation) |
| Verify | `GET /skills/{id}/verify` |
| Download | `GET /skills/{id}/download` -> zip: `SKILL.md`, `provenance.json`, references |
| Drift / repair | `GET /skills/{id}/drift`, `POST /skills/{id}/steps/{stepId}/repair` |
| Edit | `POST /skills/{id}/edit` (dry run), `POST /skills/{id}/edit/commit` |

Scope types: `workspace`, `entity`, `ontology_class`.
States: `draft -> in_review -> published`; `rejected` is terminal.
MCP: 13 tools mirroring REST (e.g. `skill_generate`, `skill_run_status`); `skill_execute` is
dry-run planning only and off by default.

## Gates and defaults
grounding >= 0.9, coverage >= 0.6, min steps 3 (fewer -> prose), max artifact 1 MiB.
Composition (`extract-subprocedure`) is off by default.

## Implications for the demo
- **Scope matters most.** Docs: broad `workspace` scope on a mixed workspace often returns
  `Withheld` ("multiple procedures"). Our workspace will contain unrelated sessions (this
  setup session included), so use a narrow scope or a dedicated workspace for the demo.
  Quickstart prerequisite: "memory traces for a single, repeatable procedure".
- **NAMS distils, reviews and publishes; it does not run skills.** The loading agent executes them.
- `Withheld` is itself a demo-worthy moment (shows the gates working).
- The step graph comes from recorded tool calls, so recording via `nams-hooks` is the right input.

## Open items
- Confirm the exact `generate` request schema (scope fields for `entity` / `ontology_class`) in the spec.
- Confirm our API key has `skills:read`/`skills:write` (`GET /skills/capabilities` is read-only).
- Find out whether the dashboard UI has a "distil" button and where it lives.
- Decide: dedicated demo workspace vs. narrow scope in the existing one.
- Read `neo4j-contrib/neo4j-skills` `neo4j-agent-memory-skill`.
