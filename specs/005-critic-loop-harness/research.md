# Research: Critic Loop in the Harness

Decisions that shape the plan. Each has the decision, why, and what was rejected. Evidence from the spike is in
`design/notes/critic-loop-findings.md` and `spikes/critic-loop/log.md`. Items marked **probe** cannot be settled
from documents and are settled by a guarded live check in the first tasks (they need the user's go-ahead because they
call write endpoints).

## R1. Critic and reviser sessions have no tools

**Decision** (recorded in the 2026-10-03 amendment to ADR-003): each role is one session with no tools, no MCP servers and no settings. The harness puts the
recordings and the skill text into the prompt. The critic answers with a schema-checked object, and the reviser returns
the revised files as text in a schema-checked object, which the harness writes.

**Rationale**: FR-010 says the roles must have no means to read the world, goals, solver output, earlier verdicts or a
held-out goal. With no file tool, no shell and no MCP server, there is nothing to read beyond the prompt, so
blindness is enforced by construction and tested by inspecting the prompt (SC-003). The spike's agents had a Read tool
and obeyed an instruction; this removes the instruction.

**Alternatives**: agents with a Read tool in a sandbox folder holding only the files they may see. Rejected: it relies
on the sandbox being right, adds path rules to test, and lets a role wander into the folder's other files.

## R2. A new seam, `RoleDriver`, implemented in `sdk-driver.ts`

**Decision**: add `RoleDriver = (options: RoleOptions) => Promise<RoleResult>` in `src/harness/role-driver.ts` (types
only). `RoleOptions` holds the prompt, an optional system prompt, the model, a JSON schema, a spend cap and an abort
signal. `RoleResult` holds the parsed answer (or a code), token counts, cost, duration, the requested model and the model
that ran. The SDK implementation `sdkRoleDriver` lives in `sdk-driver.ts`, with its option and result mapping in
`sdk-options.ts`, which keeps type-only SDK imports so tests stay light.

**Rationale**: AGENTS.md allows the SDK in one file. `AgentDriver` is shaped for a craft run (world path, run log, run
folder, skill plugin), so a role cannot use it without faking all of that.

**Alternatives**: extend `AgentDriver` with an optional "role" mode. Rejected: it widens a seam that tests, the recorder
and the export depend on, to serve a call that shares almost none of its fields.

## R3. Structured output through the SDK, checked again by zod

**Decision**: pass `outputFormat: { type: "json_schema", schema }` (SDK 0.3.285 has it) with the schema produced by
`z.toJSONSchema` from the zod schema, read `structured_output` from the result, and parse it with the same zod schema.
Set `tools: []`, `settingSources: []`, a small `maxTurns`, and `maxBudgetUsd` as the per-role spend cap (default
$1.00, a flag to change it). The role's free-form final text is discarded, never stored.

**Rationale**: FR-012, FR-013 and FR-024 want a typed answer validated before the loop uses it and a spend cap; the SDK supports it, and zod 4 is
already a dependency. The spend cap answers the one outstanding item from clarification (a runaway role).

**Alternatives**: ask for JSON in prose and parse it. Rejected: brittle, and a parse failure would carry the agent's own
text into an error. **probe**: confirm `error_max_structured_output_retries` and `error_max_budget_usd` map to typed errors
and that no assistant text leaks into the error reason.

## R4. Recording runs to NAMS: move the spike's REST write into the module

**Decision**: `candidate.ts` replays each run on a fresh game through the in-memory craft server, then writes, for each
run, one conversation with two messages (prompt, final answer), one reasoning step per distinct tool and one tool call per
call with input, output, status and duration, all into the one workspace the harness created. It is the behaviour of
`spikes/rest-ingest/ingest.ts`, plus: runs of different goals or worlds are refused before anything is created; refused
calls are written with status `failure`; a divergence or a mismatched trace stops the step.

**Rationale**: ADR-003 §2.4 and FR-001 to FR-003. The spike showed this path produces recordings equivalent to the hooks'.

**Alternatives**: record by running the player with the hooks on. Rejected by ADR-003: it recalls from the workspace.

## R5. Workspace lifecycle through the NAMS MCP tools, behind a guard

**Decision**: create with `workspace_create` (managed), wait until it is active and its database answers, delete with
`workspace_delete`, as `spikes/faithful-1/workspace.ts` does. The REST API has `POST /v1/workspaces` to create but no
delete, so the MCP tools stay the route for both, which keeps one path. The guard (FR-003, FR-004): the step keeps the
id it created in `loops/<label>/workspace.json` and in memory; it deletes only that id, and only after confirming it is
in the account's workspace list; it refuses to record into or delete any other id, including the one in
`NAMS_WORKSPACE_ID`. Deletion runs in a `finally`, on `SIGINT`, and on timeout. Creating and deleting need the flag
`--allow-workspace`; ids are printed, never the key.

**Rationale**: ADR-003 §2.4 and FR-003 to FR-005; the pilot showed no call clears a workspace in place.

**Alternatives**: a long-lived experiment workspace cleared between loops. Rejected: nothing clears one.

## R6. Generate and download: REST, with a small zip reader

**Decision**: `POST /v1/skills/generate` with `{ scope: { type: "conversations", conversationIds }, procedureFormat,
nameHint? }`; poll `GET /v1/skills/runs/{id}` until the run is terminal; read the new skill's id from the run; download it
with `GET /v1/skills/{id}/download` (a zip). Read the zip with a minimal reader on `node:zlib` (stored and deflate entries,
central directory, no encryption), and refuse anything else. The default format is `prose` (the faithful experiment's
three-runs-together passed in prose and failed coverage in graph); `--format graph` is available. On a failed
generation the step stops and reports the distiller's reasons with no retry (FR-007).

**Rationale**: matches the spike and the OpenAPI spec (`application/zip`). A reader is about 60 lines and removes a dependency.

**Alternatives**: `fflate` or `adm-zip`: rejected, see Complexity Tracking in the plan. `unzip`: rejected, platform difference.
**probe (go-ahead needed)**: the run-status values, where the skill id appears in the run response, what a gate failure looks
like, and the zip's file list. The OpenAPI response is an untyped object, so the first task is one real generation on a throwaway
workspace, recorded as a fixture for the stand-in.

## R7. The rubric and the roles' instructions are one versioned file

**Decision**: `src/loop/rubric/skill-review.v1.json` holds a version string, the six questions of ADR-003 §2.6 (each
with an id and the text the critic sees), and `criticInstructions` and `reviserInstructions`. The reviser's instructions
state seven rules: add only facts the recordings show, each cited as `run NNN call N`; state what the recordings do not
show as not known, with a cheap way to find out; lead `SKILL.md` with the discovered fact, then what the skill gives, when
to use it and how; keep citations out of `SKILL.md` and in the provenance file; drop generic advice a capable model
already follows; scope the description to the goal the body serves; add no knowledge from outside the recordings. The
critic's instructions state that the common-knowledge question is answered `cannot_determine` when the recordings do
not show what the teacher knew beforehand, and that a fact the recordings do not show is to be flagged. The loop loads it, validates it, and records its version and SHA-256 with every
verdict. The verdict schema is built from the question ids, so adding a question is a data change plus a version bump.
The "differs from common knowledge" question is worded to allow the answer `cannot_determine` (FR-014).

**Rationale**: spec Assumptions; the spike put the rubric in a prompt, which could not be versioned or diffed.

**Alternatives**: the rubric in the prompt string. Rejected: no version, easy to drift between rounds and experiments.

## R8. The two answer schemas

**Decision**, kept small (details in `contracts/role-io.md`):

- **Verdict**: `overall` (`accept`, `revise` or `reject`), `questions` (for each rubric id, a `value` of at most 40
  characters and a `reason` of at most 400), `reasons` (at most 800) and `proposedRevisions` (at most 10 strings of at most
  300). Keys must equal the rubric's ids exactly, and the loop branches only on `overall`.
- **Revision**: `skillMd` (the whole main file), `provenanceMd` (the whole provenance file) and `changes` (a list of
  `{ what, why, sourceCalls }`, where `sourceCalls` is a list of strings like `run 001 call 12`).

Citations are checked mechanically: every `sourceCalls` entry must name a run in the loop and a call number that exists in
its recording, and the harness appends an `## Uncited changes` section for entries with no source (FR-026).

**Rationale**: FR-012, FR-015, FR-016, FR-017, FR-026. Caps keep a role from returning a second skill inside a reason.

## R9. A skill package is a map of path to text

**Decision**: `package.ts` reads a folder or a zip into `Record<path, string>`, keeping only UTF-8 text files (at most 64 KB
in all and 32 KB for one file; recordings in one prompt at most 150,000 characters, checked in `inputs.ts`; either limit
refuses the loop at start with `LoopRefused`), and writes one back. The critic sees every text file in the package. A revised package is exactly two files:
`SKILL.md` and `references/provenance.md`. The distiller's other files (domain model, procedures, schema) are not carried
forward, as in the spike, and the loop record says so.

**Rationale**: the spike's accepted skill was a single main file plus provenance. The student reads only the main file
when the skill loads; extra generated files were noise (the findings' last point).

**Alternatives**: carry every file forward and let the reviser edit each. Rejected: it multiplies what can go wrong and adds
nothing the student uses.

## R10. A line diff in house

**Decision**: `diff.ts` computes a unified diff with an LCS table over lines. Inputs are tens of lines, so quadratic cost
does not matter. Tests cover add, remove, move, empty and identical inputs.

## R11. Where agent-authored text may live

**Decision** (recorded in the 2026-10-03 amendments to ADR-002 and ADR-003): only under `loops/<label>/`: verdicts, change lists, reviser output and the round texts. Never in a run folder,
trace, summary, score, replay bundle or `reason`. A role's free-form text and any reasoning are never kept, only the
schema's fields. The privacy test is extended: a scripted role puts a marker in every free-text field; the marker must appear
under `loops/` and nowhere in the run folders the loop read, and a failed role leaves no marker in any `reason`.
`loops/` is gitignored. The visualizer's folder scan reads `runs/`, so a sibling `loops/` folder cannot be mistaken for
a run.

**Rationale**: the spec's assumption and FR-018; AGENTS.md's privacy rule exists for what the agent says inside a run, and
this is a new, designated, separate place for what the critic and reviser write.

## R12. Round control

**Decision**: up to three critic reviews. On `accept`, end. On `reject`, end. On `revise` in rounds 1 and 2, run the reviser
and review its result in the next round with a fresh critic. A `revise` in round 3 is not acted on: the loop ends in `reject`
with the reason "round limit reached", because no fourth review would follow a third revision. The accepted skill is the text
the accepting critic reviewed.

**Rationale**: matches the spec's scenarios 2 and 3 and the spike (two revisions, accepted in round 3).

## R13. Inputs to each role, and a fresh critic

**Decision**: `inputs.ts` is the only place a role's prompt is assembled. The critic gets: the rubric text, the goal list,
the recordings and the current package. The reviser gets: the same, plus the current verdict. Neither gets a previous
verdict, a previous round's text, a path, or a world field. A test builds the inputs for round 3 and asserts no string from
rounds 1 and 2 appears, and that adding a forbidden string to any input source fails the test.

## R14. Model for each role

**Decision**: `--critic-model` and `--reviser-model`; each defaults to the teacher's model, read from the recordings'
`score.json` (`model.resolved`). If the runs name more than one model and neither flag is set, the loop refuses to start
(spec edge case). Both are recorded in the loop record, with the model that actually ran.

## R15. The command

**Decision**: `scripts/critic-loop.ts` over `src/loop/cli.ts`, same shape as `run-agent.ts`: arguments in, lines out, an
exit code back, `--dry-run` to print the plan (runs, models, rubric version, what would be created) without a call, and
Ctrl-C to end the current round and write the record. Two entries: runs only (needs `--allow-workspace`), or runs plus
`--candidate <folder>` to start from an existing package and make no NAMS call. See `contracts/cli.md`.

## R16. Installability

**Decision**: an accepted loop writes `loops/<label>/skill/` (SKILL.md and `references/provenance.md`). A rejected loop writes
no such folder. Round snapshots are stored as `rounds/NN/reviewed-skill.txt` and `rounds/NN/provenance.md`, not as a folder with a
`SKILL.md` (and not under any case variant of that name, since the default macOS filesystem ignores case: a first draft used `skill.md`, and a test showed it installed), so no rejected or intermediate text can be passed to `--skill` by accident. The existing installer already hashes
`SKILL.md` and the run's score records the hash (FR-020); the plan adds a test that the loop's accepted folder installs and
that the recorded hash equals the loop record's.

## R17. Measurements

**Decision**: each stage (recording, generation wait, download, each critic call, each reviser call) records start and end
from the harness clock, and for roles the tokens, cost and models from `RoleResult`; any figure the player does not report is
`null`, never zero. Nothing is added to the engine, the server or `run.jsonl`.

## R18. Interruption and failure

**Decision**: one abort signal flows to the NAMS calls and the role calls. On abort or error the step writes the record for the
rounds finished, then deletes the workspace in a `finally`. Errors are `HarnessError` subclasses with fixed messages (for
example `CandidateFailed`, `VerdictInvalid`, `RevisionInvalid`, `WorkspaceRefused`, `LoopCancelled`), and `isUserError` covers the
ones an operator can fix. A wrapped error's text is never written.
