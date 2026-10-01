# Tasks: Faithful Minecraft-Inspired World and Its Experiments

**Input**: Design documents from `/specs/003-faithful-minecraft-world/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Principle IV requires tests before the code and data they cover. Write each story's tests first and confirm they fail before the world files, module or script exist.

**Organization**: Grouped by user story. Tasks marked **(spends usage)** run real Claude agents; tasks marked **(NAMS write)** change the NAMS account or workspace. Get the user's go-ahead before each of those, as AGENTS.md requires, and never print `.env` values.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task serves (US1 to US3)

## Path Conventions

Single project: `worlds/`, `src/sim/` (no MCP or SDK dependency), `src/harness/`, `scripts/`, `test/`. Imports of local files use the `.js` extension (NodeNext).

---

## Phase 1: Setup

**Purpose**: Know the baseline before changing anything. No dependency is added.

- [X] T001 Run `pnpm typecheck` and `pnpm test` on the branch and note the passing count, so later phases can show nothing regressed

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The notes file format and loader. The faithful world (US1), the harness's prior-fit stamp (US2) and the generator (US3) all depend on it.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [X] T002 [P] Write `test/notes.test.ts` (must fail first), covering [contracts/world-notes.md](contracts/world-notes.md): a valid faithful file parses; an invalid `priorFit` is rejected; a faithful file missing `inspiration`, `omissions` or any recipe note is rejected; a note for a recipe the world lacks is rejected; an unknown field is rejected; text naming "edition", "Java", "Bedrock" or a dotted version number is rejected; problems are reported together; `priorFitOf` returns `"undeclared"` when no file exists and throws when a file exists but is invalid
- [X] T003 Create `src/sim/notes.ts` (depends on T002): the zod schema, `loadNotes(path, world)` and `priorFitOf(worldPath)` per the contract, with errors reported as a `WorldError` list. No import of `src/mcp` or the SDK, and nothing in `src/sim/engine.ts`, `loader.ts` or `src/mcp/server.ts` imports it. Make T002 pass
- [X] T004 [P] Backfill `worlds/generated/forge-7.notes.json` and `worlds/generated/forge-8-perturbed.notes.json` as `{ "priorFit": "invented", "derivedFrom": "worlds/forge.json" }`, and add a case to `test/notes.test.ts` that every world under `worlds/generated/` has a valid notes file declaring `invented` or `perturbed`; make `test/worlds.test.ts` and `test/determinism.test.ts` skip `*.notes.json` when they list worlds

**Checkpoint**: `pnpm typecheck && pnpm test` pass; the notes module exists and is imported by nothing in the engine or server.

---

## Phase 3: User Story 1 - A faithful world the experiments can trust (Priority: P1) 🎯 MVP

**Goal**: The faithful world, its goals and notes, proven solvable and free of leaks, with the attribution in documentation only.

**Independent Test**: `pnpm test` passes with the world loaded; `scripts/solve.ts` on the world reports all three goals reachable and `iron_pickaxe` slack of at least 2.

### Tests for User Story 1 (write first, confirm they fail)

- [X] T005 [US1] Write `test/minecraft-world.test.ts` (must fail first): the world loads with 13 items and 10 recipes; the three pickaxe recipes share one arrangement and differ only in material, and the sword recipes share another; `wooden_pickaxe` and `stone_pickaxe` are the learn goals and `iron_pickaxe` the held-out goal in the goals file; the solver reports each goal reachable, and `iron_pickaxe` has slack of at least 2; every item description is category-only; every recipe id has a note and `omissions` is not empty (using `loadNotes`); neither the world, goals nor notes text, and in particular the world's `name`, contains "Java", "Bedrock", "edition", "Minecraft" outside the notes file's `inspiration` field, or a dotted version number; through `connect` from `test/helpers/client.ts`, `help`, `look`, `inventory` and a refusal (an unknown item, an out-of-bounds place, a craft with nothing to make) never contain a recipe id or item name in a recipe context, and none of their text contains the attribution wording of `worlds/README.md`

### Implementation for User Story 1

- [X] T006 [US1] Create `worlds/minecraft-inspired.json` per [data-model.md](data-model.md), Faithful world: `name` `workshop` (the file name says "minecraft-inspired"; the name the agent sees must not), 3x3 table, `hints` `exact`, stock `oak_log` 3, `cobblestone` 6, `iron_ingot` 6, the 13 items with category-only descriptions, and the 10 recipes of research R2 (planks, sticks, crafting table, slab, and a pickaxe and a sword in each of wooden, stone and iron; shaped patterns symmetric)
- [X] T007 [P] [US1] Create `worlds/minecraft-inspired.goals.json` with `wooden_pickaxe` and `stone_pickaxe` (notes `learn`) and `iron_pickaxe` (note `held-out`)
- [X] T008 [P] [US1] Create `worlds/minecraft-inspired.notes.json`: `priorFit` `faithful`, `inspiration` naming the game's crafting without an edition or version, a one-sentence note for every recipe, and the omissions of research R2
- [X] T009 [P] [US1] Create `worlds/README.md`: what each file beside a world is (world, goals, notes), the attribution (the world is inspired by Minecraft's crafting, Minecraft is a trademark of its owner, the project is not affiliated with or endorsed by it), and that no edition or version is pinned. Add one line linking it from the Worlds item of `README.md`
- [X] T010 [US1] Make T005 pass. Run `pnpm dev scripts/solve.ts --world worlds/minecraft-inspired.json --goals-file worlds/minecraft-inspired.goals.json`; if `iron_pickaxe` reports slack below 2, raise stock and rerun. Raise the lower bound in `test/worlds.test.ts` from 11 to 12 worlds if the count is asserted, and confirm the whole suite passes

**Checkpoint**: User Story 1 is complete and demonstrable alone: a solvable, leak-free, traceable faithful world.

---

## Phase 4: User Story 2 - Run every arm on the faithful world (Priority: P2)

**Goal**: The tooling the arms need (prompt note, prior-fit stamp, report), then the experiment itself by the manual procedure, with a results note.

**Independent Test**: Tooling tests pass with the scripted player; the report produces a table from synthetic run folders; then the experiment's table has an entry for every planned arm, model and goal, each stamped `faithful`.

### Tests for User Story 2 (write first, confirm they fail)

- [X] T011 [P] [US2] Write `test/prompt-note.test.ts` (must fail first): without a note the prompt is byte-identical to today's; with a note it ends with that note as its own last line; `prompt.txt` in the run folder equals the prompt the driver received; the dry-run plan shows the note; the note is not applied to a different run
- [X] T012 [P] [US2] Add cases to `test/harness.test.ts` (must fail first): with the scripted player, a run on a world with a valid notes file has `priorFit` in its `score.json` and in the label's `summary.json`; a world with no notes file is stamped `undeclared`; a world whose notes file is invalid ends the batch with a user-facing error before any run starts; `promptNote` appears in the score only when given
- [X] T013 [P] [US2] Write `test/report.test.ts` (must fail first) against [contracts/report.md](contracts/report.md), using synthetic run folders written by the test: the table has one row per arm, model, world and goal; Wilson 95% intervals match hand-computed values for 5/5, 0/5 and 7/10; `ceiling` is flagged at 90% and above; two rows with overlapping intervals are `within noise` and non-overlapping ones `supported`; a short row is shown with its actual count and a `short` flag; skill arms show the share that loaded the skill and the median call count at load; the manual steps are listed last; output is byte-identical on a second run and contains none of the synthetic agent text; the command exits non-zero for a missing summary, a missing run folder, a skill fingerprint that differs from `review.json`, and a `promptNote` that differs from its arm's

### Implementation for User Story 2 (tooling)

- [X] T014 [US2] Edit `src/harness/run.ts` (depends on T011, T012): add `promptNote?: string` to `AgentRunOptions`; extend `buildPrompt` so a note is appended as the last line; resolve the world's prior fit with `priorFitOf` once per batch; write `priorFit` and `promptNote` into each score and the summary; surface an invalid notes file as a user error alongside the existing typed errors in `src/harness/errors.ts`
- [X] T015 [US2] Edit `src/harness/cli.ts` and `scripts/run-agent.ts` (depends on T014): add `--prompt-note <text>`; print the prior fit and note in the dry-run plan and the run line; reject an empty note
- [X] T016 [US2] Create `src/harness/report.ts` and `scripts/report.ts` (depends on T013): read the experiment summary, `review.json` and the named run folders; compute the table, flags and comparisons per the contract; print markdown to standard output; exit non-zero on the listed failures. Keep the logic in `src/harness/report.ts` so the test can call it without spawning a process, and keep the SDK out of it. Make T013 pass
- [X] T017 [US2] Run `pnpm typecheck && pnpm test`; fix regressions

### The experiment for User Story 2 (manual procedure; follow [quickstart.md](quickstart.md) Part B)

- [X] T018 [US2] Confirm with the user the values the plan leaves open: turn budget (default 80), spend limit (default $60), trial counts, and the exact pointed sentence (default: "A skill for this kind of task is available; load it before exploring."). Write `runs/faithful-1/summary.json` per [contracts/experiment-summary.md](contracts/experiment-summary.md); do not change it after the first trial
- [X] T019 [US2] Dry-run each distinct command (a goal, a model, a skill and a note) with `--dry-run` and check the plan, the prior fit and the absence of recording
- [X] T020 [US2] **(spends usage)** Faithful calibration: 5 unaided trials for each of Sonnet and Haiku on each of the three goals (30 runs), labels `faithful-1-cal-faithful-<model>-<goal>`
- [X] T021 [US2] **(spends usage)** Teacher recordings: 3 Sonnet trials on each learn goal in the faithful world (6 runs), no `--record`, labels `faithful-1-t0-<goal>`. If no trial reaches a learn goal, stop and report it
- [ ] T022 [US2] **(NAMS write)** Create a fresh managed workspace with the NAMS tools, record its id in `runs/faithful-1/summary.json` as created by the experiment, then write each reached teacher run with `spikes/rest-ingest/ingest.ts` (workspace id passed to that command only). Wait until every message has finished extracting
- [ ] T023 [US2] **(NAMS write)** Generate one skill from the reached runs' conversations; download it into `runs/faithful-1/skill/`; record the skill id, version id and `SKILL.md` SHA-256 in the summary
- [ ] T024 [US2] Review the skill against the ADR-003 rubric (a human reads it, as the critic loop is not built) and write `runs/faithful-1/review.json`. On `revise`, apply a NAMS lever and review again, at most three rounds; on `reject`, skip T026 to T027 and report that distillation did not yield a usable skill
- [ ] T025 [US2] **(NAMS write)** Save the results so far: copy the reviewed skill to `spikes/faithful-1/skill/` and the run folders' summaries as needed, then retire the workspace, only after checking that its id is the one the summary records as created by the experiment (never the development workspace)
- [ ] T026 [US2] **(spends usage)** Student arms with Haiku, per [quickstart.md](quickstart.md) step 6: S0 (no help), S1 (`--skill`), S2 (`--skill` and `--prompt-note`), each with 10 trials on `iron_pickaxe` and 3 on each learn goal (48 runs), labels `faithful-1-s<arm>-<goal>`
- [ ] T027 [US2] Run `pnpm dev scripts/report.ts --experiment runs/faithful-1 runs/faithful-1-*`; save the table with a short reading to `design/notes/faithful-control-results.md`, answering the second question of the spec's SC-010 (whether the skill changes the student's result on the faithful world) and listing the manual steps

**Checkpoint**: User Story 2 is complete: the arms ran on the faithful world and the results note exists.

---

## Phase 5: User Story 3 - Faithful against invented, unaided (Priority: P3)

**Goal**: The invented counterpart, derived with the existing renamer, and the unaided comparison between the two worlds.

**Independent Test**: The counterpart is valid, solvable with the same best-run call counts and has no Minecraft names; regenerating it is byte-identical; the report compares the two worlds' unaided results.

### Tests for User Story 3 (write first, confirm they fail)

- [X] T028 [P] [US3] Write `test/counterpart.test.ts` (must fail first): `renameWorld` on the faithful world and goals with seed 7 yields a valid world whose recipe kinds, quantities, arrangements, table and stock quantities equal the base's; every goal is reachable with the same minimum crafts and calls; none of the base's item or recipe names appears anywhere in the output; the committed `worlds/generated/minecraft-inspired-7.json` and its goals file equal the regenerated output byte for byte; its notes file declares `invented` and `derivedFrom` `worlds/minecraft-inspired.json`
- [X] T029 [P] [US3] Add a case to `test/scripts.test.ts` (must fail first): `scripts/make-world.ts` with `--out` also writes `<out stem>.notes.json` containing `priorFit` `invented` and `derivedFrom` set to the `--base` path (repository-relative)

### Implementation for User Story 3

- [X] T030 [US3] Edit `scripts/make-world.ts` (depends on T029): write the notes file beside the world and goals file; keep output deterministic. Make T029 pass
- [X] T031 [US3] Run `pnpm dev scripts/make-world.ts --base worlds/minecraft-inspired.json --seed 7 --out worlds/generated/minecraft-inspired-7.json`; commit the three generated files; make T028 pass; confirm `pnpm test` finds and solves the new world through `test/worlds.test.ts`
- [X] T032 [US3] **(spends usage)** Counterpart calibration: 5 unaided trials for each of Sonnet and Haiku on each of the counterpart's three goals (30 runs), labels `faithful-1-cal-invented-<model>-<goal>`; goal names come from `worlds/generated/minecraft-inspired-7.goals.json`
- [ ] T033 [US3] Run the report over the calibration labels of both worlds; add the faithful-against-invented table and the `supported` or `within noise` line for each model to `design/notes/faithful-control-results.md`, answering the first question of the spec's SC-010 (whether the faithful world is easier for the models than the invented one) in one sentence supported by the counts

**Checkpoint**: All three stories are complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Update `AGENTS.md`: add `worlds/*.notes.json`, `worlds/README.md`, `src/sim/notes.ts` and `scripts/report.ts` to the layout and script lists; note that every experimental world carries a notes file and that a missing one is stamped `undeclared`; mention `--prompt-note`
- [ ] T035 [P] Update `README.md`: the Worlds item (notes file, faithful world), the scripts list (`report.ts`), and the harness section (`--prompt-note`, prior fit in the summary)
- [ ] T036 [P] Add `notes file` and `experiment summary` entries to the glossary in `design/adr/README.md`
- [ ] T037 Add a dated entry to ADR-003's Amendments recording the values the first experiment fixed (turn budget, trial counts, the pointed sentence, the stock and goal family) and removing them from "Not decided"; link `design/notes/faithful-control-results.md` from its Related section
- [ ] T038 Walk [quickstart.md](quickstart.md) Part A from a clean checkout and tick its "guards held" list: no development workspace id in any score or summary, no attribution or edition words in the world, every skill run names the reviewed fingerprint, spend under the limit
- [ ] T039 Run `pnpm typecheck && pnpm test`, compare with the T001 baseline, and confirm the CI workflow passes

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup; blocks all stories.
- **User Story 1 (Phase 3)**: after Foundational. It is the MVP and blocks the experiments.
- **User Story 2 (Phase 4)**: tooling (T011 to T017) needs Foundational only and can start beside US1; the experiment (T018 to T027) needs US1 and the tooling.
- **User Story 3 (Phase 5)**: needs Foundational and US1. Its tests and generator (T028 to T031) can run beside US2; T032 needs T031 and the spend decision of T018.
- **Polish (Phase 6)**: after the stories you intend to ship; T037 needs the experiment's results.

### Within each story

Tests are written and seen failing before the code they cover; world and notes files before the tests that read them go green; the experiment tasks run strictly in order (T018 to T027), because each consumes the previous one's output and several write to NAMS.

### Parallel opportunities

- T002 and T004 (Foundational).
- T007, T008, T009 once T006 exists.
- US2 tooling tests T011, T012, T013 together; then T014 before T015; T016 beside T014.
- US3 tests T028 and T029 together, and the whole of US3's tooling beside US2's tooling.
- T034, T035 and T036 (Polish).

```text
# After Foundational
Developer A: US1 (T005 to T010)
Developer B: US2 tooling tests and code (T011 to T017)
Developer C: US3 tests and generator (T028 to T030)
# Then, in order: T018 to T027, with T031 to T033 once the world exists
```

## Implementation Strategy

### MVP first

Complete Setup, Foundational and US1. That alone delivers a trusted, solvable, attributable faithful world, which every later world derives from. Stop and validate with `pnpm test` and the solver.

### Incremental delivery

1. US1: the world.
2. US2 tooling, then the experiment: the arms and the results note.
3. US3: the counterpart and the comparison.
4. Polish.

The experiment tasks spend money and write to NAMS, so run them only after the tooling tasks pass and the user has confirmed T018's values.

## Notes

- Paths in task descriptions are repository-relative.
- The skill, run folders and `runs/faithful-1/` are not committed (`runs/` is gitignored); the reviewed skill and results note are the committed record.
