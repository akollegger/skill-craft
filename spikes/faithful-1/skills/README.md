# Skills distilled from the faithful-world teacher runs (spec 003)

NAMS distilled these from three Sonnet runs on `stone_pickaxe` in the faithful world (11 action calls each,
no refusals, the best run every time). Both pass NAMS's gates (grounding 1.0, coverage 1.0). Neither states
the recipe: a search finds no sticks, planks, cobblestone or oak. They were rejected on review, so no skill
arm was run.

| Folder | Scope | Format | Notes |
|---|---|---|---|
| `prose-combined/` | all three runs | prose | `SKILL.md` SHA-256 `210aa60fa0c9e23fb149fdaabf98d370761518b611a0d4116e4f31fe6f8bb810` |
| `graph-single-001/` | run 001 alone | graph | four generic steps: help, inventory, place, craft |

The same three runs together in graph format failed the coverage gate (0.50 against 0.60). See
`design/notes/faithful-control-results.md`.
