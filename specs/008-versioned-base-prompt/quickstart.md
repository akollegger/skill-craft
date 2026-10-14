# Quickstart: validating the feature

Prerequisites: `pnpm install`; `.env` with `ANTHROPIC_API_KEY` and `FIREWORKS_API_KEY` for step 7 only.

1. **Checks.** `pnpm typecheck && pnpm test`. The new tests cover the frozen outputs (SC-001), placeholder and changelog
   refusals, the call budget at every crossing position (SC-003), the score and loop-record fields, and the prompt set checks (SC-009).
2. **List the prompts.** `pnpm dev scripts/prompts.ts` shows the four kinds, each version, its fingerprint and
   `changelog: yes` (SC-008).
3. **Dry run shows the prompt set.** `pnpm dev scripts/run-agent.ts --world worlds/woodworking.json --goal wooden_stool --prompt-version 2 --call-budget 100 --arm-sentence 1 --skill loops/wood-fable-glm/skill --dry-run --model fireworks/glm-5p3-flash`
   prints the base version, both hashes, the arm sentence and skill tool versions, and `budget: calls 100`.
4. **Mixed meanings are refused.** The same command with `--max-turns 80` instead of `--call-budget`, or with both, exits 1
   before any call.
5. **A pinned experiment refuses a stray arm.** With an experiment folder whose `summary.json` pins `promptSet.base` to `2`,
   `--experiment <folder> --prompt-version 1` exits 1 before any call; the same for a `critic-loop.ts` with another rubric version.
6. **A scripted run.** `pnpm test test/call-budget.test.ts` shows 5 parallel calls against a budget of 3: three executed, two
   refused with the fixed line, `budgetRefused: 2`, `ended: budget`, and the run log holding three calls.
7. **The comparison (live, costs usage).** For each of `fireworks/nemotron-3-ultra-nvfp4`, `fireworks/glm-5p3-flash`,
   `anthropic/claude-fable-5-1` and each of `wooden_stool` (woodworking) and `glirol` (forge-7), five trials:
   `pnpm dev scripts/run-agent.ts --world <world> --goal <goal> --runs 5 --prompt-version 2 --call-budget 100 --max-output-tokens 16384 --max-usd 2 --model <model> --settings /tmp/fw-survey.json --label p2-<model>-<goal> --out runs`
   (the settings file pins temperature 0.6 on Fireworks models and adaptive thinking on Fable). Then write
   `runs/reports/<date>-p2-prompt-version-2.md`: success and cost per model, task and version, beside the version 1 runs
   `runs/s1-*` and `runs/s2-*`.
8. **Old runs still read.** `pnpm dev scripts/report.ts` on an experiment holding `runs/s1-*` shows them as unversioned and
   changes nothing (SC-007).

Expected: step 7 states whether version 2 moved any baseline (SC-005) and whether Fable's misses used at least 90% of the
call budget (SC-006).
