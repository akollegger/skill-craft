# Quickstart: Complete the AI SDK Runtime

Runnable checks for the feature. Commands run from the repository root. Part A costs nothing. Parts B and C spend model
usage and need `ANTHROPIC_API_KEY` and `FIREWORKS_API_KEY` in `.env` (load with `set -a; source ./.env; set +a`; never print them).

## A. Everything that needs no model (free)

```bash
pnpm install
pnpm typecheck
pnpm test
```

Expected: the existing suites plus the new ones pass. The new ones cover the provider table and its refusals, the reported model
reaching the trace, unpriced counts, the retry count with a scripted failing model, the cache option, pinned settings and their
refusals, and the privacy keys.

See what a run would do:

```bash
pnpm dev scripts/run-agent.ts --goal glirol --runs 1 --model fireworks/gpt-oss-120b --dry-run
pnpm dev scripts/run-agent.ts --goal glirol --runs 1 --model mistral/large --dry-run
```

Expected: the first prints the plan with the model and its settings (all unset); the second exits 1 with `provider 'mistral' is not available; the providers are anthropic, fireworks`.

## B. The live checks (about US$10 at most; each leaves a record)

1. **Caching, first.** One Claude run of 40 turns:

   ```bash
   pnpm dev scripts/run-agent.ts --goal glirol --runs 1 --max-turns 40 --model claude-sonnet-5-5 --label rt-cache
   ```

   Expected: at least 80% of the run's input tokens are cache reads in `score.json`. If not, use the fallback in research R4 before going on.

2. **Skill through the tool.**

   ```bash
   pnpm dev scripts/run-agent.ts --goal glirol --runs 3 --max-turns 40 --model claude-haiku-4-5-20251001 --skill spikes/skill-pilot/craft-glirol --label rt-skill
   ```

   Expected: each score records `skill.invoked` and `skill.loadedAfterCalls`.

3. **Critic loop end to end, and a thinking role under a small cap.** The loop needs a finished run that reached the goal.
   Sonnet reached `glirol` 0 of 5 times in the spike and `fireworks/glm-5p3` 5 of 5, so make one first (about US$0.05):

   ```bash
   pnpm dev scripts/run-agent.ts --goal glirol --runs 1 --max-turns 40 --model fireworks/glm-5p3 --label rt-teacher
   ```

   Then run the loop on it:

   ```bash
   pnpm dev scripts/critic-loop.ts --runs runs/rt-teacher/001 --candidate spikes/skill-pilot/craft-glirol --max-rounds 1 --critic-model claude-opus-5-5 --max-role-usd 0.05 --label rt-loop
   ```

   Expected: a loop record with an accept or reject and one round, or a role failure with the fixed `spend cap` reason. No truncated answer is accepted.

4. **Cancellation.**

   ```bash
   LIVE_SDK=1 pnpm vitest run test/live-cancel.test.ts
   ```

   Expected: five runs interrupted and five stopped by a very short `--timeout-minutes` end as cancelled with a summary, and `pgrep -f src/mcp/server.ts` finds nothing afterwards.

## C. Calibration rerun on the faithful world (about 30 runs, US$5 at most)

Use the commands in `specs/003-faithful-minecraft-world/quickstart.md` Part B step 1 for the faithful world only, with label prefix `rt-cal-`
and the teacher and student of ADR-003 §2.1. First write `runs/rt-cal/summary.json` from
`specs/003-faithful-minecraft-world/contracts/experiment-summary.md`, with the pinned settings in `models.settings`
(see [contracts/run-record.md](contracts/run-record.md)); the report reads it. Then run the report over the labels:

```bash
pnpm dev scripts/report.ts --experiment runs/rt-cal runs/rt-cal-*
```

Expected: each goal's role, a cost with its unpriced count, and the models that ran. Write the results to `design/notes/runtime-recalibration.md`.

## D. Billing check for a Fireworks batch

```bash
pnpm dev spikes/fireworks/reconcile.ts snapshot snap.json
# run a batch
pnpm dev spikes/fireworks/reconcile.ts compare snap.json runs/<label>
```

Expected: harness and billed tokens equal for every model.

## E. Find how a skill was made (free)

A student run that installed a skill records the skill's hash in `score.json` (`skill.sha256`), and an accepted loop records the same hash as `finalSkillSha256` in its `loops/<label>/loop.json`. To find the record from a run:

```bash
SHA=$(node -p "require('./runs/<label>/001/score.json').skill.sha256")
grep -l "\"finalSkillSha256\": \"$SHA\"" loops/*/loop.json
```

Expected: one `loop.json`. Its `distiller.service` names the memory service's version and build commit when the skill was distilled from the runs. Its `process` names the version and commit, `recordedRuns` the teacher runs with their hashes and settings, `roles` the models and settings that reviewed it, and `process.version` is explained in `design/notes/skill-process.md`. If `dirty` is true the code was not exactly the commit.

## F. What a model would be costed with (free)

```bash
pnpm dev spikes/fireworks/probe-prices.ts claude-haiku-4-5-20251001 claude-sonnet-5-5 fireworks/gpt-oss-120b fireworks/glm-5p3
```

Expected: a market quote for each model with an alias, naming the OpenRouter id, when the list was read and the rates per million tokens, and `no price` for a model with no alias (`glm-5p3`). The one request is a public `GET` to OpenRouter's model list with no key, and it is cached in `.cache/` (ignored by git) for a day. A model with a pin in `prices.json` shows the pin.

