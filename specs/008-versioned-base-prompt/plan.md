# Implementation Plan: Versioned Base Prompt with a Call Budget

**Branch**: `008-versioned-base-prompt` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-versioned-base-prompt/spec.md`

## Summary

Make every prompt in play a stored, versioned, fingerprinted text with one layout, one changelog format and one set of
checks, and give version 2 of the player's prompt a budget the agent can count: tool calls, enforced by the driver.
Today the player's prompt is built in code and says "turns" while the AI SDK stops after N responses; the arm sentence is
free text on a command line; the skill tool's description is a string in code; only the critic and reviser's rubric is a
versioned, hashed file. Nothing records or checks which of them an experiment used.

The work has five parts: (1) a prompt module, `src/prompts/`, with four kinds (`base`, `arm-sentence`, `skill-tool`,
`review-rubric`), each a series of immutable versions under `prompts/<kind>/` with a changelog, a loader, a placeholder
check, a filler and a fingerprint, and a listing command; version 1 of the base prompt reproduces today's bytes and the
rubric moves without changing its bytes; (2) recording the versions and fingerprints a run or review loop used, in the score,
the loop record, the summaries and the bundle; (3) a prompt set in the experiment summary, checked by the harness, the loop
and the report; (4) a call budget in the driver, wrapping each craft tool so a call past the budget is not sent to the
server and the run ends after that response; (5) the version 2 base prompt and the live comparison that measures it against
version 1 before an experiment adopts it.

Three refinements of the ADR's wording come from reading the code (research.md R5, R6, R9). The score records a hash of the
base text and a hash of the text sent, so the fixed sentence does not make every skill arm look like a different prompt. A
call budget is given with `--call-budget` and a step budget with `--max-turns`, so the meanings cannot be mixed. The rubric
is listed as one kind and not split, so its hash, and every earlier loop record, is unchanged.

No file in `src/sim/`, `src/mcp/` or `run.jsonl` changes. The AI SDK stays imported in one file.

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node 22+

**Primary Dependencies**: no new package. `ai` 7 (already pinned) for tool wrapping and `stopWhen`; Node's `crypto` for the fingerprint

**Storage**: files. `prompts/<kind>/v<N>.<ext>` and `prompts/<kind>/CHANGELOG.md` at the repository root; `score.json`, the
loop record, the batch `summary.json`, the experiment `summary.json` and the bundle manifest gain optional fields
(contracts/run-record.md)

**Testing**: vitest, scripted models and the scripted player (`test/helpers/fake-player.ts`); the call budget is tested
with the SDK's mock model issuing parallel calls. One live check, gated by `LIVE_SDK=1`, for the version 1 and 2 comparison

**Target Platform**: macOS and Linux developer machines and CI

**Project Type**: single TypeScript project (library plus scripts)

**Performance Goals**: none; the new work is a hash and a counter per call

**Constraints**: no change to `src/sim/`, `src/mcp/` or `run.jsonl`; version 1 byte-identical to today's prompt; an older
run folder is read unchanged and shown as unversioned; no model text in any record

**Scale/Scope**: four prompt kinds, five files to start (`base` v1 and v2, `arm-sentence` v1, `skill-tool` v1, `review-rubric` v1); the live comparison is 30 runs (3 models, 2 tasks, 5 trials) under version 2, against 30 existing version 1 runs

## Constitution Check

| Principle | Status |
|---|---|
| I. Deterministic, replayable environments | Pass. The budget counts calls in the order emitted; the engine and run log are untouched, and the run log still replays |
| II. Data-driven worlds | Pass. The prompt file is data; nothing about a world enters code |
| III. Discovery over disclosure | Pass. The over-budget line is fixed and names no item or recipe; the leak sweep is extended to it (FR-011, SC-004). A base prompt version is checked for any recipe or solution text |
| IV. Test-first rules | Pass. Each task lists its test first: the frozen outputs of each kind, placeholder validation, call budget crossings, the score and loop fields, the prompt set checks |
| V. Simplicity | Pass. No mechanic is added to the world. A loader, a hash, a counter and one summary field are the whole addition, and they serve the with/without comparison by making every prompt a checked variable. The prompt module replaces three separate places that held prompt text today |
| VI. Secrets hygiene | Pass. No key is read or written; the fingerprint is of public prompt text |
| VII. Decisions before specs | Pass once ADR-007 is accepted. It is `proposed`; T001 sets it `accepted` after this plan is reviewed |

Re-check after design: unchanged. No violation to justify.

## Project Structure

### Documentation (this feature)

```text
specs/008-versioned-base-prompt/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── prompt-file.md
│   ├── run-record.md
│   └── cli.md
└── tasks.md              # /speckit-tasks
```

### Source (repository root)

```text
prompts/
├── base/            v1.txt ({what} {item} {turns}), v2.txt ({what} {item} {budget}), CHANGELOG.md
├── arm-sentence/    v1.txt (the S2 sentence of ADR-003 §2.2), CHANGELOG.md
├── skill-tool/      v1.txt ({name} {described}), CHANGELOG.md
└── review-rubric/   v1.json (the existing rubric file, moved with identical bytes), CHANGELOG.md
src/prompts/                  # new, no SDK import: kinds, load, validate, fill, fingerprint, changelog check, prompt set check
scripts/prompts.ts            # new: list every kind, version and fingerprint; refuse a version with no changelog entry
src/harness/
├── run.ts                    # buildPrompt delegates to src/prompts; records the prompt block and budget; maps a budget end to stopped when the goal is held
├── cli.ts                    # --prompt-version, --call-budget, --arm-sentence, --experiment; refusals
├── ai-driver.ts              # wraps craft tools with the call budget; skill tool description from its prompt; stops after the response that uses the budget
├── ai-options.ts             # the budget stop condition and end classification (pure, tested)
├── driver.ts                 # DriverOptions.callBudget, skillToolText; PlayerResult.budgetRefused
├── export.ts, bundle.ts      # carry the prompt block
└── report.ts                 # the experiment's prompt set: check, print, notices
src/loop/rubric.ts            # DEFAULT_RUBRIC_PATH follows the move; loop record names the rubric's kind version; --experiment check
src/viz/contract.ts           # optional prompt block in the bundle manifest schema
test/                         # prompts.test.ts, call-budget.test.ts, plus extensions to cli, harness, report, export, loop, leak tests
design/adr/ADR-003-experiment-protocol.md, README.md (glossary), AGENTS.md   # brought in line
```

**Structure Decision**: one new module, `src/prompts/`, owns everything about a prompt file and a prompt set; the harness,
the loop and the report call it. It has no SDK import, so the loop (which must stay free of the SDK) can use it. Enforcement
stays in `ai-driver.ts` with its pure parts in `ai-options.ts`, as for the other limits.

## Complexity Tracking

None.
