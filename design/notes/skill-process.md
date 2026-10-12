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

## v2

Recording per model turn (ADR-003 §2.4, amended 2026-10-12; spec 007 FR-028 to FR-031). Everything else is as in v1.

1. **Recording.** A teacher run that kept a conversation (`conversation.jsonl`, written by the driver) is recorded as the model lived it: the prompt, each assistant message in order, one reasoning step for each turn that called tools, and each call under its step. A step holds the reasoning the provider returned for that turn (a summary, for some models); when none came back it holds the turn's text, and when there is neither a fixed line says none was returned. Nothing is invented. Tool names are written as the model saw them (`place`). Calls the craft server never received (an unknown tool, arguments that did not parse) are not tool calls in the recording; their step is kept.
2. **No harness judgement.** No score, solver path, extra-call count or label of which calls were needed is written.
3. **Metadata.** Each conversation names the model, provider, pinned settings, the recording format and whether reasoning came back (`returned`, `partial` or `none`).
4. **Older runs.** A run with no conversation file is recorded as in v1 (two messages, one step per distinct tool, the `mcp__craft__` prefix) with a fixed line saying no reasoning was recorded, and its conversation is marked `placeholder` and `not-kept`. A loop over a mix of the two records its format as `mixed`.

What changes in the record: `recordingFormat` is `conversation`, `placeholder` or `mixed`, taken from the runs.

The record also names the memory service that distilled the skill (`distiller.service`: version, release date, build commit, environment, or a code when its version call failed). That records what ran and changes none of the procedure, so it did not bump the version.

Still true: whether the distiller uses a step's reasoning is not established. Distilling twice from the same runs (T085) is how to find out.
