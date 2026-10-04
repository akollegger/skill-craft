# Round 1 changes (graph-single-001 -> craft-stone-pickaxe)

Citations: "run 001 call N"; runs 002 and 003 are identical call for call (diff of transcripts).

## Added
- Working chain table (oak_log -> oak_planks x4 -> stick x4 -> stone_pickaxe x1) with items, cells, craftable previews, outputs. Answers critic "step 3 placeholders / NEEDED FACT: successful sequence", "leads with discovered fact". Cites: run 001 calls 3-4, 5-7, 8-13.
- Grid size, zero-based coordinates: run 001 call 1. Starting inventory and iron_ingot unused: run 001 call 2 (iron_ingot untouched in all calls).
- ASCII shape of craft 3: run 001 calls 8-12.
- "Verify before every craft" using `craftable` (answers critic "confirmation of what craftable means"): run 001 call 1 (preview text), calls 3, 6, 12 (names the output before each craft).
- Null-craftable states: run 001 calls 5, 8, 9, 10, 11 (answers "failure behaviour"; only null, no error text exists).
- Crafted intermediates go to inventory: inferred from run 001 calls 4-5, 7, 11 (items placed right after crafting that were not in the start inventory); stated as shown by those calls.
- "Not known" section: position sensitivity, quantities, consumption, errors; says how to test cheaply with look/place/remove/clear (tool purposes: run 001 call 1). Answers critic "mark measured fact vs inference; whether position matters; mismatched craft behaviour" (answered honestly as unknown).
- Done check: stop when stone_pickaxe x1 appears (run 001 call 13; strengthens "done when").

## Removed
- Mandatory "Read crafting help" and "Inspect inventory" steps, the exploration routine (critic: replays teacher routine).
- Tool call templates with `...` placeholders, empty "anti-patterns" heading, exemplar sentence, generator frontmatter fields (version, hashes, provenance ids), Claude Code-only wording.
- references/procedure.schema.json, references/exemplars.md, provenance.json (critic: plumbing the student does not need).

## Reordered
- Recipe chain first, then verification, then unknowns (was: help, inventory, place, craft).

## Description
- Rewritten: no "Claude Code:" or tool-name prefix; trigger = goal to hold a stone_pickaxe; payload = the recipe chain (critic "descriptionWillBeFound").
