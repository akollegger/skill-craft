# The process that makes a skill: versions

Status: living changelog. The version constant is `PROCESS_VERSION` in `src/loop/process.ts`, and a test fails when it has no entry here.
Each skill's `loop.json` records the version, the commit and what actually ran (ADR-003 §2.6, amended 2026-10-12; spec 007 FR-033 to FR-038). When the record and this note disagree, the record is what happened; this note says what a version means.

## When to bump the version

Bump it when any of these change: what a recorded run sends to the memory service, what the distiller is asked (scope, format, the conversations given to it), the rubric or the roles' instructions (the rubric also has its own version and hash), the number of rounds, or the roles' pinned settings by default. Do not bump it for a fix that changes none of them.

## v1

The loop as spec 005 built it, on the AI SDK runtime (ADR-005).

1. **Recording.** Each finished teacher run that reached its goal is replayed on a fresh game through the craft server and written to a workspace the harness creates: one conversation, two messages (the prompt and the final answer), one reasoning step per distinct tool whose text is a fixed placeholder, and one tool call per call with input, output, status and duration. The recording format is `placeholder`. Tool names are written with the `mcp__craft__` prefix.
2. **Distillation.** One skill is requested from all the conversations together (`scope` conversations), in the format given on the command line (`prose` by default). The service's gates and capabilities are recorded.
3. **Review.** Up to three rounds of a critic and a reviser, each a fresh model call with no tools, given only the rubric, the goals the recordings cover, the recordings, the current skill and (to the reviser) the current verdict. A role's answer that fails the schema's limits is asked for again, up to three attempts. The critic and the reviser run under the settings pinned for their models, if any.
4. **Result.** The loop accepts (the version students receive) or rejects. The accepted skill's hash is the key student runs record.

What it cannot do: tell a necessary call from a wrong turn, since a step carries no reasoning.

## Planned: v2

Recording per model turn: the model's messages and reasoning, a step for each tool-calling turn, tool names as the model saw them (ADR-003 §2.4, amended 2026-10-12; spec 007 FR-028 to FR-032). Not built; this entry is added when it is.
