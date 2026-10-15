# Quickstart: validating the feature

Prerequisites: `pnpm install`; `.env` with `ANTHROPIC_API_KEY`, `FIREWORKS_API_KEY` and `NAMS_API_KEY` for steps 6 and 7 only (a subshell that
unsets `NAMS_WORKSPACE_ID`, as the loop's quickstart did).

1. **Checks.** `pnpm typecheck && pnpm test`. New suites cover the schemas (drift, property list, forbidden names), the lifecycle with a scripted
   harness (every outcome, cancellation at each operation, `close` always), `nams-reviewed` against the scripted service (SC-004), the bespoke
   harness with a scripted role, the command, and the report.
2. **Schemas are current.** `pnpm dev scripts/schemas.ts` rewrites nothing (`git diff schemas/` is empty).
3. **Prompts.** `pnpm dev scripts/prompts.ts` lists five kinds, including `distiller v1`, each with a changelog entry.
4. **Dry runs.** `pnpm dev scripts/distill.ts --harness bespoke-one-shot --runs runs/s2-fable-5-1/001 runs/s2-fable-5-1/002 runs/s2-fable-5-1/003 --distiller-model fireworks/glm-5p3-flash --dry-run`
   shows the harness, runs, model and prompt versions and spends nothing; the same with `--harness nams-reviewed` and no `--allow-workspace`
   exits 1 before any call; an unknown harness name exits 1.
5. **Report.** `pnpm dev scripts/report.ts` over a fixture experiment with no `review.json` and a `distillation.record` prints the provenance
   and does not refuse; with a mismatched model it is refused naming the difference.
6. **Bespoke, live (small spend).** The step 4 command without `--dry-run` writes `distills/<label>/` with one skill folder, `skill-set.json`
   and `harness.json`; the record holds hashes and settings and no recorded text.
7. **NAMS, live (writes to the account).** With `--allow-workspace`, `nams-reviewed` records, generates, reviews and deletes its workspace;
   `harness.json` matches the old loop record's content in the new shape.
8. **The comparison (optional, live, costs usage).** Three generations per harness over the three Fable recordings, each skill given to
   `claude-haiku-5-5` and `nemotron-3-ultra-nvfp4` on `wooden_stool`, five trials each (`--prompt-version 2 --call-budget 100`), then a report
   under `runs/reports/` (research R12). Get the go-ahead before the NAMS and Fable-priced parts.

Expected: steps 1 to 5 pass with no spend; step 6 yields a valid skill set; step 7 reproduces the old command's outcome; step 8 states the number
of generations and trials as a caveat (SC-009).
