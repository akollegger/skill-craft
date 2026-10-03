# Round 4 changes (reviser: the session's main model, answering the user's note and PR review comment 2)

Not a critic-loop round: ADR-003 caps the loop at three, and this edit was prompted by the user (SKILL.md carried
audit detail the student does not need) and by a PR review comment (the description advertised goals the body
did not serve). A fresh critic reviewed the result afterward (`critic-round4.json`: accept).

- Restructured SKILL.md around three questions: capability, when to use it, how to use it.
- Moved every run/call citation and the list of what the recordings do not show to `references/provenance.md`.
- Removed from the body: starting inventory, the unused iron_ingot, the list of null states, the long "not known"
  section (now one sentence), and the speculation about crafted items landing in the inventory.
- Added: start each craft with an empty table, since craft uses up everything on it.
- Scoped the description and the "when" line to holding a stone_pickaxe (no oak_planks or stick goals).
