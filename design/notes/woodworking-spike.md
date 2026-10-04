# Woodworking spike: a perturbed world and a three-scenario demo

Status: draft plan, 2026-10-04. Branch `spike/woodworking-world`. A spike, so no ADR and no spec; if it
proves out, the world may be promoted to a Spec Kit feature.

## Goal

A short demo of three scenarios, each a world and a goal. In each, Sonnet (teacher) and Haiku (student)
play unaided; a skill is distilled from Sonnet's runs and reviewed by the critic loop; Haiku then plays
again with the skill. Scenarios need to be informative, not successful: a ceiling, a floor or a null
effect is a result.

| # | World | Prior fit | Goal | What it should show |
|---|---|---|---|---|
| 1 | `minecraft-inspired` | faithful | `wooden_pickaxe` | the control: familiar vocabulary and recipes (expect a ceiling) |
| 2 | `generated/forge-7` | invented | `glirol` | nothing to lean on; discovery is by trial (the pilot's world) |
| 3 | `woodworking` (new) | perturbed | `wooden_stool` | familiar structure, unfamiliar specifics |

Scenarios 1 and 2 already exist and are proven solvable. This spike builds scenario 3 and then runs all three.

## The world (scenario 3)

Raw material to planks to components to the assembled product, the same depth as the wooden pickaxe's
chain (log, plank, rod and seat, stool). Names are plain woodworking words. The chain resembles Minecraft's, so the deviations below are what make the world
*perturbed* and not faithful; the notes file names each one.

| Item | Kind |
|---|---|
| `log` | raw (the stock) |
| `plank` | made |
| `rod` | made |
| `seat` | made |
| `wooden_stool` | made (the goal) |

| Recipe | Kind | Inputs | Output | Against Minecraft |
|---|---|---|---|---|
| `r-planks` | shapeless | 1 `log` | 4 `plank` | same |
| `r-rods` | shaped | 2 `plank` in a column | 2 `rod` | Minecraft makes 4 sticks: **deviation** |
| `r-seat` | shaped | 3 `plank` in a row | 1 `seat` | no equivalent (a slab is 6 from this shape) |
| `r-wooden_stool` | shaped | `seat` centred over a bottom row of 3 `rod` | 1 `wooden_stool` | no equivalent |

A rod craft makes 2 rods, so 3 rods need two crafts (4 planks). The seat takes 3 planks: 7 planks, 2 logs,
one spare. The yield of 2 is the number a model with Minecraft memory is most likely to assume wrong.

**Stock.** 3 logs (as in the faithful world). The solver confirms the best run: 6 crafts, 19 calls, slack 5.
With 2 logs the slack would be 1; 3 is generous, so tighten it if unaided runs finish too easily.


**The stool's pattern is the intuitive one**, so the deviation is quantity alone. If Haiku still solves
it unaided at the best run's call count, the scenario is at a ceiling, which is a finding. Fallbacks, in
order: (a) the log makes 2 planks, not 4 (deeper chain, about 23 calls); (b) invert the stool; (c) a stool
that takes 4 rods, so "3-legged" no longer predicts the recipe. Pick one after seeing unaided results.

**Disclosure.** The goal's name tells a model "stool", and common sense says legs plus a seat. That is
disclosure by vocabulary, not by the tools, and is the point of a perturbed world. The notes file says so.

## Work plan

Tests first (Principle IV), then data. No engine, server or schema change.

1. **Tests** in `test/woodworking-world.test.ts`, modelled on `test/minecraft-world.test.ts`, written
   to fail first:
   - 5 items, 4 recipes, 3x3 table, `hints` as in the other worlds;
   - the goal is reachable and the solver's best run matches the numbers above (crafts, calls, slack);
   - shaped recipes are symmetric (matching does not mirror);
   - the notes file validates and declares `perturbed` with an `inspiration`;
   - a Minecraft-vocabulary sweep: no `stick`, `oak`, `slab`, `crafting_table` in the world, goals or notes;
   - the world loads in the server and passes the `tools-orient` leak sweep (no recipe in `look`, `help`,
     `inventory` or a refusal).
2. **World files:** `worlds/woodworking.json`, `woodworking.goals.json` (goal `wooden_stool` x1),
   `woodworking.notes.json` (`priorFit: perturbed`, `inspiration: everyday woodworking`, a note per recipe
   saying what is familiar and what is changed, omissions such as joinery, drying and tools). Update
   `worlds/README.md`. The agent-facing name is neutral (`workbench` style).
3. **Verify:** `pnpm dev scripts/solve.ts --world worlds/woodworking.json --goals-file worlds/woodworking.goals.json`,
   `scripts/smoke.ts` replay, then `pnpm typecheck && pnpm test`.
4. **Dry run** of `scripts/run-agent.ts` for the new world, to confirm the prompt and options carry no
   Minecraft assumptions. Nothing is spent.

## Experiment plan (needs go-ahead before each paid step)

All runs pin the model by id (`claude-sonnet-5-5`, `claude-haiku-4-5-20251001`), 5 trials per cell,
the same turn budget (80), no hooks.

| Stage | Cells | Notes |
|---|---|---|
| A. Unaided | 3 scenarios x 2 models x 5 trials = 30 runs | The baseline. Rough cost from earlier tables: cents per easy run, up to about $0.50 for a failed invented run; a few dollars to about $10 in total |
| B. Distil | 1 critic loop per scenario, from Sonnet's *reaching* runs | `scripts/critic-loop.ts --allow-workspace`, which creates and deletes a throwaway NAMS workspace: **a NAMS write, needs a go-ahead**, run in a subshell with `NAMS_WORKSPACE_ID` unset. A scenario where Sonnet never reaches the goal ends here and is reported |
| C. Skill arm | 3 scenarios x Haiku x 5 trials with `--skill loops/<label>/skill` | Compare to stage A |
| D. Report | `scripts/report.ts`, then a short note in `design/notes/` | Reach, extra calls, cost, time, skill loaded or not |

Since scenarios need not succeed, nothing here is gated on a gap: a scenario with Haiku already at the
ceiling reports "no room to improve", and the skill arm there tests whether the skill does harm.

## Open questions

1. Starting stock (3 logs proposed).
2. Which Sonnet runs feed the loop when several reach: all of them, or the best (fewest extra calls)?
3. Whether 5 trials per cell is enough for a demo; the report's intervals are wide at n=5.
4. Whether to promote the world to a spec afterwards.
