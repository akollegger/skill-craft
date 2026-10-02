# Research: Faithful Minecraft-Inspired World and Its Experiments

Decisions that the plan rests on. Each was checked against the repository.

## R1. Where the prior fit and recipe notes live

**Decision**: A sibling file `<world>.notes.json`, next to the world and its goals file.

**Rationale**: The world schema rejects unknown fields and the engine and server read only the world, so
a field there would mean a schema change that every run touches. The goals file is read by the solver and
tests, and mixing facts about vocabulary into it blurs its job. A sibling file is read only by tests, the
generator and the harness's summary writer, so the engine stays ignorant of it (Principle II).

**Alternatives**: a `priorFit` field in the world file (schema and server change, rejected); the goals
file (wrong owner); documentation only (cannot be checked by a test or stamped on a result).

## R2. The world's contents

**Decision**: Thirteen items and ten recipes on the 3x3 table, using only crafting that is the same across
the versions commonly played.

- Raw (stock): `oak_log`, `cobblestone`, `iron_ingot`.
- Made: `oak_planks`, `stick`, `crafting_table`, `oak_slab`, and a pickaxe and a sword in each of wooden,
  stone and iron.
- Recipes: planks (one log, shapeless, four planks); sticks (two planks in a column, four sticks); crafting
  table (a 2x2 of planks); slab (a row of three planks, six slabs); each pickaxe (three of the material in
  the top row and two sticks in the centre column); each sword (two of the material in a column over a
  stick).

The pickaxes are the goal family. The swords, the table and the slabs are decoys that spend the same
materials, so an exploratory craft has a cost, as a real player's would.

**Omissions, stated in the notes file**: gathering, smelting, durability and enchanting; recipes whose
shapes the game accepts mirrored (axes, hoes), since matching here is translation-only; recipes that take
any of several materials (any kind of planks), so oak stands for all; and any recipe that differs between
versions.

**Rationale**: Symmetric patterns avoid the mirrored-recipe case entirely. The family has three tiers
that share a shape and differ in material, which is the near transfer ADR-003 asks for.

**Alternatives**: axes and hoes in the family (mirrored shapes, rejected); a larger subset (more to
verify against the source, no gain for the comparison).

## R3. Stock and slack

**Decision**: Start from stock of 3 `oak_log`, 6 `cobblestone` and 6 `iron_ingot` (15 units). A scratch
world with these recipes was solved in planning:

| Goal | Crafts | Calls | Slack |
|---|---|---|---|
| wooden_pickaxe | 4 | 13 | 3 |
| stone_pickaxe | 3 | 11 | 3 |
| iron_pickaxe | 3 | 11 | 3 |

**Rationale**: Slack 3 meets the requirement of at least two wasted crafts on every goal and
leaves each goal reachable after a burned sword. The solver's cap is 5, so these values are exact. A test
asserts the requirement, so the stock can be tuned later without changing the rule.

**Alternatives**: tighter stock (slack 1 to 2, closer to the pilot's failure), larger stock (slack 4,
less cost to a wrong craft). Revisit if calibration shows the student at the ceiling.

## R4. File and world names

**Decision**: The file is `worlds/minecraft-inspired.json`, but the world's `name` field is `workshop`, because
`help` returns the name to the agent and the file name must not reach it. The counterpart is
`worlds/generated/minecraft-inspired-7.json` from seed 7.

**Rationale**: The name says "inspired", not "Minecraft", and names no edition. The generated name
follows the existing `forge-7` pattern.

## R5. Attribution

**Decision**: `worlds/README.md` credits the game as inspiration and states that the project is not
affiliated with or endorsed by its owner and that Minecraft is a trademark of its owner. The repository
README links to it. The text is not in the world file, the goals file or any tool output.

**Rationale**: The agent sees the world's description through `help`, and the constitution requires
category-only descriptions. A test searches the world file and every orientation and refusal output for
the attribution text and for the words "Minecraft", "Java", "Bedrock" and "edition".

## R6. The invented counterpart and the existing worlds' notes

**Decision**: Generate the counterpart with the existing `scripts/make-world.ts --base
worlds/minecraft-inspired.json --seed 7`. Extend the script to write a notes file with prior fit
`invented` and a `derivedFrom` field. Backfill notes files for `forge-7` and `forge-8-perturbed` as
`invented`. A world with no notes file is stamped `undeclared` in summaries, which keeps older worlds and
tests working.

**Rationale**: The renamer already reduces descriptions to a category, keeps structure and carries goals.
Principle III requires a declaration for experimental worlds, and a stamp that says `undeclared` makes a
missing one visible without breaking anything.

**Alternatives**: refuse to run an undeclared world (breaks the base world's tests and tools); infer the
prior fit from the names (unreliable).

## R7. The pointed prompt

**Decision**: Add `--prompt-note <text>` to `scripts/run-agent.ts`. The note is appended to the base prompt
as its last line, and the result is written to `prompt.txt` as it already is. The S2 note is ADR-003's
sentence, fixed verbatim in the experiment summary before the first trial: "A skill for this kind of task
is available; load it before exploring." The S1 arm passes no note.

**Rationale**: ADR-003 requires that an arm add at most one fixed sentence and that `prompt.txt` stores
it. Today the prompt is built in one place with no extension point.

**Alternatives**: a second prompt builder per arm (duplicates the base prompt and invites drift).

## R8. How the arms run without the experiment runner

**Decision**: A written procedure in the quickstart, using what exists: `scripts/run-agent.ts` for every
run, `spikes/rest-ingest/ingest.ts` for the teacher's recordings, a NAMS skill generation call, `--skill`
for installing the reviewed skill. The workspace is created and retired by hand through the NAMS tools.
Each NAMS write is an outward-facing action that needs the user's go-ahead when it happens. The guards the
ADR describes for the future runner are followed by the person running the steps and listed as a checklist.
The report lists the steps that were manual.

**Rationale**: Building the runner, recording and critic features first would delay the control the user
asked for. The spike already proved the path end to end on one run.

**Alternatives**: build the runner first (weeks of work before any result); run only the unaided
comparison (drops the arms the user asked for).

## R9. Trial counts, budget and spend

**Decision**:

| Stage | Runs | Model | Notes |
|---|---|---|---|
| Calibration, both worlds | 60 (done) | 30 Sonnet, 30 Haiku | 5 trials x 2 worlds x 3 goals per model; unaided, unrecorded; assigns the roles |
| Teacher recordings (T0), escalating route | 3 | Sonnet | 3 per gap goal; the 3 stone runs exist, and the 3 wooden runs made earlier are not used because wooden is not a gap goal |
| Student arms S0, S1, S2 | 48 | Haiku | per arm: 10 trials on each gap goal (primary), 3 on each solved goal, 3 on the held-out goal; fresh trials for S0 |
| Skill review | 1 to 3 | critic or human | a verdict per round |

Turn budget 80 for every run, the value the pilot's successful baseline used. Spend limit $60, written
into the experiment summary. Calibration cost $16.62. The teacher runs and the arms are expected to add
about $10 to $15 at pilot rates ($0.14 to $0.37 per run, less for Haiku on a solved goal), so the limit
leaves room for a repeat of a stage.

**Rationale**: Ten trials on the primary goals is ADR-003's assumed count and gives an interval that can
separate a repair from noise; three on solved and held-out goals is a no-harm and ceiling check, not a
measure of effect. The calibration size is the protocol's. The roles come from the calibration trials and
the arms use fresh trials, as ADR-003 requires.

**Route and primary measure**: the escalating route, with repair on the gap goals as primary. Both are
declared after calibration, which the escalating route needs (the gaps are found first), and the report
says so. The first calibration read: wooden 4/5, stone 0/5, iron 5/5 for Haiku, and 5/5 on every goal for
Sonnet. Applied to the rule, stone is the gap goal, wooden and iron are solved, and iron is the held-out
goal set aside beforehand, so transfer is expected to be unmeasurable.

## R10. The report

**Decision**: `scripts/report.ts` reads the run folders named on its command line (each has a
`summary.json` and per-run `score.json`) and prints a markdown table: arm, model, world, prior fit, goal,
successes out of trials, minimum, median and maximum extra calls, cost and tokens, and for skill arms the
share of runs that loaded the skill with the median call count at load. A row is flagged `ceiling` when
at least 90% of its trials succeed. A difference between two rows is marked `supported` only when their
95% Wilson score intervals for the success rate do not overlap, and `within noise` otherwise. The output
contains only measured quantities and fixed labels, and a trailing list of steps the experiment summary
marks as manual.

**Rationale**: The spec requires a stated rule for when a difference is supportable. Non-overlapping
intervals are conservative, easy to explain and deterministic.

**Alternatives**: Fisher's exact test (stronger at small counts, harder to read in a table); no test
(the spec forbids unsupported claims, so a rule is needed).

## R11. Reviewing the skill

**Decision**: Until the critic loop exists, a human reads the skill against the ADR-003 rubric and
records a verdict file in the experiment folder (`review.json`: the rubric answers, the overall verdict,
the reasons, and the SHA-256 of `SKILL.md`). The report reads the fingerprint from there.

**Rationale**: ADR-003 makes review part of the protocol and allows a human to stand in. A recorded file
keeps the run's skill text traceable, which the spec requires.
