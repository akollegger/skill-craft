# 05 — Read-only Cypher via the API

Date: 2026-09-29

## Endpoint
`POST /v1/query` body `{"cypher": "...", "params": {...}}` -> `{columns, rows, stats}`.
Runs in Neo4j READ access mode against the workspace's graph; writes are rejected (400).
Works with `NAMS_SKILLS_KEY` + `X-Workspace-Id` header. Errors: 400 (bad Cypher / write), 502 (backend down).

## First queries (My Workspace, snapshot at ~13:35 UTC)
- Total nodes: **300** (stats confirm nothing was created or changed).
- Labels (multi-label nodes counted once per label): Entity 185, Object 150, Alias 61, Concept 50,
  SoftwareTool 32, **ToolCall 29**, Event 19, API 19, Message 15, Organization 7, Decision 6,
  **AgentStep 5**, Location 5, ProgrammingLanguage 4, Service 4, Person 4, PipelineMeta 3,
  Database 2, Framework 2, **Conversation 1**, Observation 1.
- Relationships: EXTRACTED_FROM 426, MENTIONS 411, RELATED_TO 192, ALIAS_OF 61, SAME_AS 51,
  **USED_TOOL 29**, **HAS_MESSAGE 15**, INFLUENCED 15, RELATES_TO 14, **HAS_STEP 5**, EXPOSES 4,
  HAS_OBSERVATION 1, BUILT_WITH 1.

## Reading
- The reasoning graph matches the blog: `(:Conversation)-[:HAS_STEP]->(:AgentStep)-[:USED_TOOL]->(:ToolCall)`.
  Most of the graph (~85%) is long-term memory: entities extracted from our messages.
- The distiller's scope, if `workspace`, would include all of that; a narrow scope matters.
- No skill nodes yet (no skills exist).

## Useful follow-ups
- Inspect AgentStep -> ToolCall shape and properties.
- After a distillation run, query the skill subgraph and `GROUNDED_IN` edges to show provenance in the demo.
