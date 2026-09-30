# Quickstart: validating the crafting-table simulation

Runnable checks that prove the feature end to end. They assume the implementation exists. For
formats see [contracts/](contracts/); for the entities see [data-model.md](data-model.md).

## Prerequisites

- Node 22+ and pnpm; `pnpm install` has been run.
- A base world at `worlds/forge.json` with `worlds/forge.goals.json`.

## 1. Test suite

```bash
pnpm typecheck
pnpm test
```

Expected: both pass. The suite covers matching and conflicts, the engine's transitions and refusals,
world validation (valid and invalid fixtures), the solver, the re-skinner, the run log,
determinism, and the tool contract.

## 2. Best run for a goal

```bash
pnpm dev scripts/solve.ts --world worlds/forge.json --goals-file worlds/forge.goals.json
```

Expected: a JSON array with one object per goal, each `reachable: true` with `minCrafts`, `minCalls`,
`slack` and a `calls` list. For the base world: `bar` 1 craft, 3 calls; `rod` 2 crafts, 5 calls;
`lamp` 7 crafts, 22 calls. The whole command finishes in under 10 s (SC-008).

## 3. Replay the best run over the real server

```bash
pnpm dev scripts/smoke.ts worlds/forge.json lamp:1
```

Expected: `world-changing calls: 22 (best run: 22)` and `goal held: yes`; the count equals `minCalls`
from step 2 (SC-002).

## 4. Read the run log

```bash
SIM_RUN_LOG=/tmp/run.jsonl pnpm dev scripts/smoke.ts worlds/forge.json lamp:1
wc -l /tmp/run.jsonl
```

Expected: 23 lines, one per call in order, each a complete JSON object: the 22 `place` and `craft`
calls the smoke output counts, plus the final `inventory` check (SC-010). Use a path that does not
exist yet; a reused path is refused (below).

Then start a second server on the same log path and confirm it refuses:

```bash
SIM_WORLD=worlds/forge.json SIM_RUN_LOG=/tmp/run.jsonl pnpm dev src/mcp/server.ts
echo "exit status: $?"
```

Expected: a message on stderr naming `/tmp/run.jsonl`, a non-zero exit status, and `/tmp/run.jsonl`
unchanged (line count and content as before).

## 5. Refusals are visible and free

Using any MCP client against the server, try each of these on a fresh world and confirm the code:

| Action | Expected refusal |
|---|---|
| `place` at row 99 | `out_of_bounds` |
| `place` twice in the same cell | `cell_occupied` |
| `remove` from an empty cell | `cell_empty` |
| `place` an item the agent holds none of | `not_in_inventory` |
| `place` an item id that does not exist | `unknown_item` |
| `craft` on an empty table | `nothing_to_craft` |

`inventory` before and after each refusal is unchanged.

## 6. Swap the world

```bash
pnpm dev scripts/smoke.ts worlds/generated/forge-7.json <goal-item>:1
```

Expected: a different vocabulary, the same structure, and the goal reached with no code change
(User Story 4).

## 7. Re-skin

```bash
pnpm dev scripts/make-world.ts --seed 7 --out /tmp/a.json
pnpm dev scripts/make-world.ts --seed 7 --out /tmp/b.json
diff /tmp/a.json /tmp/b.json && echo identical
```

Expected: `identical`, and none of the base world's item names appear in either file (User Story 7).

## 8. Broken worlds are rejected

The invalid fixtures under `test/fixtures/invalid/` each name the problem they contain. Loading
each fails with that problem in the message (SC-005):

```bash
pnpm test test/loader.test.ts
```
