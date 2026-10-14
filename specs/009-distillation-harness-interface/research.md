# Research: The Distillation Harness Interface

Each entry is a question the plan had to answer, what was chosen, why, and what else was considered. Entries marked *verify* rest on how
existing code behaves and are checked by the first test of the task that depends on them.

## R1. Mapping the NAMS pipeline onto a session

**Decision**: `obtainCandidate` (255 lines) does everything in one call. It is split along the interface's operations inside the
`nams-reviewed` adapter, reusing its helpers (`conversationMetadata`, `recordConversation`, `recordPlaceholder`, `stripRoot`,
`classify`) unchanged:

| Operation | Does |
|---|---|
| `open(experimentId)` | refuses without the workspace option; creates a managed workspace through the guarded client, waits until it is active, reads its capabilities; writes `workspace.json` first, as now |
| `record(run)` | adds a conversation, the prompt message and the recorded turns (per-turn reasoning, or placeholders for a run with none); keeps the conversation id by run id; a second `record` of the same id does nothing |
| `distill(request)` | waits for extraction over the named runs' conversations, generates one skill with `procedureFormat`, reads the service version while it runs, downloads and unpacks the skill, then runs `runLoop` (critic and reviser) over it; maps the outcome to a skill set of one or a refusal |
| `describe()` | the provenance (R6) |
| `close()` | deletes the workspace and rewrites `workspace.json` as retired, whatever happened; a failed delete is reported with the id and never hides a result |

**Rationale**: the helpers already hold the careful parts (metadata as strings only, the guard, the polling deadline, cancellation), so the
adapter changes the shape of the calls and not what they do. *Verify*: the scripted memory service (`test/helpers/fake-nams.ts`) gives the
same skill, rounds and recorded runs through the adapter as through the old command (SC-004).

**Alternatives**: rewriting the candidate step (risk to the workspace safety rules, no gain); keeping `obtainCandidate` as one call inside
`distill` and making `record` a no-op that stores runs in memory (simplest, but then `open` creates nothing and a failed record surfaces late,
and a harness whose `record` is a real cost, as it is for NAMS, is the case the interface is for).

## R2. Generating the JSON Schema

**Decision**: the contracts are zod definitions in `src/distill/schemas.ts`; `z.toJSONSchema` (zod 4.6, present) generates the files;
`scripts/schemas.ts` writes `schemas/run-record.v1.json` and `schemas/skill-set.v1.json` with sorted keys and a trailing newline; a test
generates each schema in memory and compares it with the committed file, so editing a definition without regenerating fails. The TypeScript
types are `z.infer` of the same definitions.

**Rationale**: one source for the types and the contract (FR-010), and the project already uses zod for every other schema. The schema
library is not part of the contract, as ADR-008 says: the JSON files are.

**Alternatives**: hand-written JSON Schema with a validator (two sources that drift); Effect's Schema (a second schema style for no gain; the
ADR left the question for the lifecycle, not the contract).

## R3. Where the code lives and what stays

**Decision**: `src/distill/` is new. `src/loop/` stays as the internals of `nams-reviewed` (candidate, loop, rubric, inputs, package, record,
process, verdict, zip, nams). `scripts/critic-loop.ts` and `src/loop/cli.ts` are replaced by `scripts/distill.ts` and `src/distill/cli.ts`;
the loop CLI's tests move to the new command's tests with the same scripted dependencies.

**Rationale**: moving files adds churn and risk without serving the spec; the adapter is the seam. A later feature can relocate them.

**Alternatives**: move `src/loop/*` under `src/distill/harnesses/nams-reviewed/` now (clean, but a large diff mixed into a behaviour-preserving
change).

## R4. Holding the no-oracle rule as data

**Decision**: the run record's zod object is strict (no unknown keys), a test lists its full property tree and compares it with a committed
allowlist literal, and a second test sweeps for forbidden names (`score`, `reached`, `solver`, `extraCalls`, `role`, `world`, `goals`,
`duration`, `durationMs`, `startMs`, `neededCalls`) at any depth of the generated JSON Schema. The harness prompts are tested the way
`test/loop-inputs.test.ts` tests the roles': built from named parts, with no parameter that takes a path, a world or a score.

**Rationale**: FR-008 and FR-015 need the rule to be the shape of the data and a failing test when someone widens it.

## R5. Building a run record

**Decision**: `toRunRecord(recording)` in `src/distill/run-record.ts` maps a `Recording` (from `replayRun`, which already replays the log on
a fresh game and regenerates outputs) to a `RunRecord`: `id` is the run's label in the command (`001`, ...), `prompt` the recorded prompt,
`models` and `settings` from the score, `turns` from `conversation.jsonl` (text and reasoning; a run with no conversation file gets one turn
per call group with no reasoning and `reasoning: "none"`), calls with their regenerated output and status, and `finalAnswer`. Timings, the
goal and the world path of `Recording` are dropped.

**Rationale**: reuses the replay checks (a log that does not replay is an error), and drops exactly what the contract excludes.
*Verify*: the NAMS adapter's conversation recording, rebuilt from a `RunRecord`, matches what the old step wrote from the `Recording`
(the metadata carries the model and settings, never a score).

**Alternatives**: a second replay in the harness (duplicate); passing `Recording` itself (leaks goal, world path and timings into the
contract).

## R6. Provenance and the cast

**Decision**: `describe()` returns the provenance record (data-model.md). The command writes it to `distills/<label>/harness.json`. The
legacy `loops/<label>/loop.json` is read by `readProvenance`, which converts it to the same shape with `harness: "nams-reviewed"` and the
role models from its `roles`. The cast is `cast.harness: { name, roles: { <role>: { model, settings } } }`; `castOf` in the report maps an
older `cast` with `distiller` and a `teacher`/`student` to a harness cast named `nams-reviewed` with roles `critic` and `reviser`.

**Rationale**: FR-019 and FR-020 ask for old records and casts to keep reading, and one converter keeps the report's check single.

## R7. How the report finds a distillation's record

**Decision**: the experiment summary gains `distillation: { record: <repository-relative path> }`. When it is present the report reads the
record (a `harness.json` or a legacy `loop.json`), checks the cast against it, prints it, and checks that each skill arm's run names a skill
whose SHA-256 is one the record lists (`skills[].sha256`, or `finalSkillSha256` for a legacy record). A legacy `review.json` that names a
loop path is read as `distillation.record`; its verdict is not enforced and a missing `review.json` is not an error. With no record, a skill
arm is reported with a line saying so.

**Rationale**: FR-021 removes the verdict gate but the report still needs to know which skill an arm used and who made it; the skill hash is
the join the report already used.

**Alternatives**: keep `review.json` as a required file (the thing the spec removes); drop the skill-hash check (loses the one guard that
a table is not read against a skill it did not use).

## R8. Process versions per harness

**Decision**: `src/loop/process.ts` keeps its constant as `nams-reviewed`'s process version and gains `bespoke-one-shot`'s; each is
explained in its own section of `design/notes/skill-process.md`, and the existing test that fails when the changelog lacks an entry runs
over both. The provenance records the harness's own version. This feature bumps `nams-reviewed` (what is recorded changes: a harness block)
and starts `bespoke-one-shot` at 1.

**Rationale**: the ADR gives each harness its own version; the changelog test already exists and only needs the loop over harnesses.

## R9. Mapping outcomes to refusals

**Decision**: `LoopCancelled` and an aborted signal give `cancelled`; a spend cap reached in a role call or the stated limit gives
`spend_limit`; the loop's `reject` verdict (the harness's own review found nothing usable) and a distiller that finished with no skill give
`no_skill`; any other typed failure (`CandidateFailed`, a role failure, a bad package) gives `failed`. Each refusal carries the spend so far
from the stages already recorded. A refusal is a value, not a thrown error; unexpected exceptions still propagate.

**Rationale**: FR-005 wants fixed codes and the spend; the existing errors already carry these distinctions.

## R10. The bespoke harness's call

**Decision**: one `RoleDriver` call. System: the `distiller` prompt (`prompts/distiller/v1.txt`, no placeholders). Prompt: the recordings as
text (`recordingText` over the runs, rendered from `RunRecord`s) fenced as the critic's are. Schema: `{ name, description, body,
references: [{ path, content }], evidence: [{ run, call }] }`; `check` rejects a body with no run and call citation (the existing
`hasCitation`), a bad name, and a package over the size limits, without echoing the answer. `packageFromFiles` builds the package
(`SKILL.md` with the front matter, then the references). The call is priced and capped with `--max-role-usd`. A recording set over the size
limit is refused with a fixed code before the call.

**Rationale**: the same machinery as the critic and reviser, so the role machinery, price quotes, retries and spend accounting come free.

**Alternatives**: let the model write the whole `SKILL.md` as free text (no validation seam, and the front matter is checked anyway).

## R11. A prompt kind for the distiller

**Decision**: `distiller` joins `KIND_NAMES` in `src/prompts/index.ts` (extension `.txt`, no placeholders, no word check), the prompt set
schema gains an optional `distiller` version, the listing shows it, and `scripts/prompts.ts` and the changelog test cover it. A change to its
wording bumps the bespoke harness's process version.

**Rationale**: the scheme was built for this (ADR-007's amendment names the distiller as the fifth kind).

## R12. The live comparison

**Decision**: `scripts/distill.ts` is run three times per harness over `runs/s2-fable-5-1/001` to `003` with labels
`cmp-<harness>-<n>`; each skill folder is given to a student with `--skill distills/<label>/skills/<name>` on `wooden_stool` with the
version 2 base prompt and 100 calls, 5 trials per student and skill; a report under `runs/reports/` lists each generation's provenance and
spend and each cell. The number of generations (3) and the spend caps are stated in the report; the Fable and NAMS parts need the user's
go-ahead.

**Rationale**: matches the spec's optional last story; three generations is the smallest count that shows variance.
