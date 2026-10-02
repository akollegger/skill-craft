# Quickstart: Faithful Minecraft-Inspired World and Its Experiments

Runnable checks for the feature. Commands run from the repository root. Part A costs nothing. Part B
spends real Claude usage and writes to NAMS; read AGENTS.md first and get the user's go-ahead for each
NAMS write.

## A. The world, its counterpart and the tooling (free)

```bash
pnpm install
pnpm typecheck
pnpm test
```

Expected: the existing suites plus the new ones pass. `test/worlds.test.ts` solves and replays every goal
of `worlds/minecraft-inspired.json` and of the counterpart.

Best runs and slack for the faithful world:

```bash
pnpm dev scripts/solve.ts --world worlds/minecraft-inspired.json --goals-file worlds/minecraft-inspired.goals.json
```

Expected: three goals reachable; `iron_pickaxe` reports slack of at least 2.

Derive the counterpart and check it reproduces:

```bash
pnpm dev scripts/make-world.ts --base worlds/minecraft-inspired.json --seed 7 --out worlds/generated/minecraft-inspired-7.json
git status --short worlds/generated
```

Expected: no change to the committed files (identical output), and a notes file with
`priorFit: "invented"`.

See what a run will do without spending anything:

```bash
pnpm dev scripts/run-agent.ts --goal iron_pickaxe --world worlds/minecraft-inspired.json --runs 1 --max-turns 80 --model claude-haiku-4-5-20251001 --prompt-note "A skill for this kind of task is available; load it before exploring." --dry-run
```

Expected: the plan shows the prompt ending with the note, the prior fit `faithful`, and no skill.

## B. The experiments (spends usage; manual procedure)

Write `runs/faithful-1/summary.json` first, from [contracts/experiment-summary.md](contracts/experiment-summary.md).
Some fields are fixed before calibration (the models, arms, prompt note, labels, calibration trial count, turn
budget and spend limit) and some are added after calibration assigns the roles and before any teacher or arm
trial (`route`, `primary`, `roles` and the teacher and arm trial counts). Once a teacher or arm trial has run,
change nothing except `workspace` and `skill`, which are filled in as those steps happen.

1. **Calibration (unaided, unrecorded), both worlds.** For each model and each goal, 5 trials:

   ```bash
   pnpm dev scripts/run-agent.ts --goal iron_pickaxe --world worlds/minecraft-inspired.json --runs 5 --max-turns 80 --model claude-haiku-4-5-20251001 --label faithful-1-cal-faithful-haiku-iron
   ```

   Repeat for `claude-sonnet-5-5`, for the other two goals, and for the counterpart (its goal names are
   in `worlds/generated/minecraft-inspired-7.goals.json`). 60 runs in all.

1b. **Assign the roles.** Run the report over the calibration labels; it prints the role the rule gives each goal
   (stone is expected to be the gap). Write `route`, `primary` and `roles` into `runs/faithful-1/summary.json`
   before any teacher or arm trial, and set the arm trial counts.

2. **Teacher recordings (T0), escalating route.** 3 trials on each gap goal (stone) with the teacher model,
   unrecorded by the hooks (no `--record`). Then, after the user approves the NAMS writes: create a fresh
   managed workspace with the NAMS tools, note its id in the summary, and write each reached run to it:

   ```bash
   set -a; source ./.env; set +a
   NAMS_WORKSPACE_ID=<the new workspace id> pnpm exec tsx spikes/rest-ingest/ingest.ts runs/faithful-1-t0-stone/001
   ```

   Run the line in a subshell or a single command so the variable is not exported where a development
   session starts. Ingest refuses a run whose trace does not match its log.

3. **Distil one skill** from the conversations of the reached runs (a conversations scope). Wait until every
   message has finished extracting before generating. Download the skill.

4. **Review.** A human reads `SKILL.md`, its references and provenance against the ADR-003 rubric and
   writes `runs/faithful-1/review.json` ([data-model.md](data-model.md), Review record). On `revise`, use
   the NAMS levers (at most three rounds); on `reject`, stop and report it.

5. **Retire the workspace** once the results, skill package and run folders are saved, and only if its id
   is the one the summary records as created by the experiment.

6. **Student arms.** Haiku on each gap goal (10 trials) and on each solved and held-out goal (3 trials), for each arm. The commands below are for the gap goal, `stone_pickaxe`; repeat with `--runs 3` and a new label for the other goals:

   ```bash
   pnpm dev scripts/run-agent.ts --goal stone_pickaxe --world worlds/minecraft-inspired.json --runs 10 --max-turns 80 --model claude-haiku-4-5-20251001 --label faithful-1-s0-stone
   pnpm dev scripts/run-agent.ts --goal stone_pickaxe --world worlds/minecraft-inspired.json --runs 10 --max-turns 80 --model claude-haiku-4-5-20251001 --skill <reviewed skill folder> --label faithful-1-s1-stone
   pnpm dev scripts/run-agent.ts --goal stone_pickaxe --world worlds/minecraft-inspired.json --runs 10 --max-turns 80 --model claude-haiku-4-5-20251001 --skill <reviewed skill folder> --prompt-note "<the fixed sentence>" --label faithful-1-s2-stone
   ```

7. **Report.**

   ```bash
   pnpm dev scripts/report.ts --experiment runs/faithful-1 runs/faithful-1-*
   ```

   Expected: a table with an entry for every planned combination, each stamped with its prior fit; the
   comparison lines; and the list of manual steps. Save it to `design/notes/faithful-control-results.md`
   with a short reading of the two questions in the spec's SC-010.

## Checks that the guards held

- No development session's workspace id appears in any run's score or in the experiment summary.
- `grep` for the attribution text and for the words "Minecraft", "Java" and "Bedrock" in the world file
  finds nothing.
- Every skill run's score names the skill's SHA-256, and it equals the one in `review.json`.
- The experiment's spend is under the limit in the summary.
