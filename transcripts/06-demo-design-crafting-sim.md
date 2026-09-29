# 06 — Demo design: the crafting-table simulator

Date: 2026-09-29
Status: proposal, not built yet.

## Idea
A small Minecraft-style crafting simulator exposed as an **MCP server** ("craft"). The agent gets
tasks like "make a lamp" and must use parameterized tools. We record several runs with `nams-hooks`,
distil the recurring procedure into a skill, then show a fresh agent solving a *new* item faster
and with fewer errors when it has the skill.

## Why a sim works for this
- `nams-hooks` records every tool call (name, input, output, status) via PostToolUse `*`, so MCP
  tools are captured like any other. Reasoning steps are thin (see 03), so the procedure has to
  live in the tool calls. A sim makes them distinctive and parameterized.
- Deterministic: same task, same rules -> clean metrics (calls, errors, "game ticks").
- Cheap and fast to repeat; can be driven headlessly (`claude -p`) to generate many runs.
- Failures are designed in, which feeds the "anti-patterns" side of Consolidate.

## Tools (parameterized)
| Tool | Params | Notes |
|------|--------|-------|
| `recipe_lookup` | `item` | returns ingredients + whether a table/furnace is required |
| `inventory` | - | current items |
| `gather` | `resource`, `qty` | some resources need a tool tier (iron needs a stone pickaxe) |
| `place_station` | `station` (`crafting_table` / `furnace`) | required before station recipes |
| `craft` | `item`, `qty` | fails with specific errors: `missing_ingredient`, `no_station_nearby`, `wrong_tool_tier` |
| `smelt` | `item`, `fuel` | needs a furnace and fuel |

## Recipe tree (dependency depth is the point)
planks <- log; stick <- planks; torch <- coal + stick; wooden/stone/iron pickaxe <- sticks + material;
iron ingot <- smelt(iron ore, fuel); iron nugget <- iron ingot; **lantern** <- 8 iron nuggets + torch;
glowstone/redstone -> **redstone lamp**; more items for the held-out test.

## Traps that create a learnable procedure
1. Crafting without a nearby crafting table -> `no_station_nearby`.
2. Mining iron with a wood pickaxe -> `wrong_tool_tier` (need to build a stone pickaxe first).
3. Smelting with no fuel.
4. Gathering more/less than the recipe total -> `missing_ingredient` or waste.
The recurring good procedure: lookup recipe tree -> place station -> gather in dependency order ->
craft bottom-up -> verify inventory.

## Experiment plan
1. **Record**: 4-6 runs across different items (torch, stone pickaxe, lantern, redstone lamp);
   include some naive runs that hit traps and recover.
2. **Distil**: `POST /v1/skills/generate` with a narrow scope. Expect `Withheld` if scope is too wide.
3. **Inspect**: run outcome, `explain-provenance`, Cypher over the skill subgraph and `GROUNDED_IN`.
4. **Review + publish** (unsigned; attestation not configured).
5. **Held-out test**: new item (e.g. sea lantern or golden apple), fresh agent, with vs. without the
   downloaded `SKILL.md`. Compare calls, errors, ticks.
6. **Optional drift**: change a recipe in the sim (e.g. lantern now needs 9 nuggets), show `drift`
   flag the step and `repair` it.

## Open risks / questions
- **Scope**: we only have one usable workspace with unrelated data. Does `entity` /
  `ontology_class` scope isolate the sim runs? Entity extraction will create entities like
  "Lantern", "Torch" from tool text; need to see what the extractor produces.
- **Is 4-6 runs enough** for cluster frequency weighting and the 3-step minimum? Likely yes.
- **Does the distiller work from tool calls alone** given empty reasoning? Test early with a tiny
  pilot (2 runs) before building the full sim.
- Runs from headless `claude -p` create separate conversations with `harness=claude`; check they
  are recorded and distinguishable (maybe tag via prompt or project directory).
- Keep this design session out of the scope; it is in the same workspace.
