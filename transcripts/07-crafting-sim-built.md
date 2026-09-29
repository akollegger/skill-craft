# 07 — Crafting simulator built

Date: 2026-09-29
Status: working; not yet used to record runs.

## What exists
- `src/sim/` — schema (zod), deterministic `Game` engine, `planFor` (minimal action plan), world
  loader/validator, seeded renamer.
- `src/mcp/server.ts` — MCP server `craft` (stdio). World chosen by env `SIM_WORLD`; state lives in the server
  process, so each spawned session starts fresh.
- `worlds/ember-forge.json` — base world (17 items, 2 stations, 3 tool tiers, depth-4 chains, 4 tasks
  including a held-out "combines earlier results" task).
- `worlds/generated/ember-7.json`, `ember-8-perturbed.json` — re-skinned examples.
- `scripts/make-world.ts` (generate worlds), `scripts/smoke.ts` (spawn server over stdio, solve a task).
- `.mcp.json` registers `craft` with world `ember-7` (needs a Claude Code restart to load).
- 20 tests (engine rules, planner, validation, renamer, MCP tools via in-memory transport).

## Discovery-first design
Tools: `survey`, `recipe_lookup`, `recipes_using`, `inventory`, `gather`, `place_station`, `craft`.
No tool lists all recipes. The agent must walk the graph from a task goal. Errors are structured
(`wrong_tool_tier`, `no_station_nearby`, `missing_ingredient`, `missing_fuel`, ...) and hint at the
constraint, never the fix.
Swapping worlds: point `SIM_WORLD` at any JSON file, or run
`pnpm dev scripts/make-world.ts --seed N [--perturb] [--keep-descriptions] --out worlds/generated/x.json`.
The renamer invents names, and by default replaces descriptions with category-only text so prose
can't reveal what an item is. `--perturb` nudges some quantities (for the drift demo).

## Verified
- All tasks solvable by `planFor` and executable through the engine, in the base world and 20 renamed seeds.
- Stdio smoke: naive `gather` -> `wrong_tool_tier`; planner's 37-step solution completes the
  held-out task in 48 ticks.

## Notes / decisions
- `planFor` doubles as the yardstick: optimal actions vs. an agent's actions and errors.
- Bug found and fixed while testing: planner double-counted shared intermediates (reserve inputs
  as soon as they are obtained).
- TypeScript 7 doesn't auto-include `@types/node`; tsconfig sets `types: ["node"]`.

## Next
1. Restart Claude Code to load `craft`; check `mcp__craft__*` tools appear.
2. Pilot: 2 agent runs on different tasks; confirm calls appear in NAMS (`/v1/reasoning/trace/...`).
3. Try `POST /v1/skills/generate` with a narrow scope (needs user go-ahead).
