# Worlds

Each world is a JSON file with sibling files that share its name:

| File | What it holds | Who reads it |
|---|---|---|
| `<name>.json` | The world: table size, stock, items and recipes | the simulation and the MCP server |
| `<name>.goals.json` | The goals the solver and tests use | tests, the solver and the generator; never the engine |
| `<name>.notes.json` | How far a model's prior knowledge predicts the recipes (the world's *prior fit*), a note per recipe for a faithful world, and what it leaves out | tests, the generator and the harness's summary writer; never the engine, never the agent |

`worlds/forge.json` keeps neutral ids and is only a base for generation. `worlds/generated/` holds
worlds renamed from a base with `scripts/make-world.ts`.

## minecraft-inspired

`minecraft-inspired.json` is a *faithful* world: its vocabulary and recipes follow familiar crafting
from the game Minecraft, within the crafting-table mechanic. It is the control for the invented and
perturbed worlds derived from it (ADR-003).

This world is inspired by Minecraft. Minecraft is a trademark of its owner, and this project is not
affiliated with or endorsed by it. The world takes the idea of crafting from the game and nothing else.

No game edition or version is named anywhere. The world uses crafting that is the same across the
versions commonly played, and its notes file lists what it leaves out. This credit lives here and not
in the world, goals or notes text that an agent could see.

## woodworking

`woodworking.json` is a *perturbed* world (a spike, branch `spike/woodworking-world`; plan in
`design/notes/woodworking-spike.md`). Its vocabulary is everyday woodworking and its structure is
familiar: logs make planks, planks make rods and a seat, and a seat over three rods makes a stool.
The specifics are not what a model would assume: a rod craft makes two rods, and the seat and stool
shapes must be found. Its notes file names each change. The goal is `wooden_stool`.
