# Distilling twice from the same runs: placeholder steps and real reasoning

Status: run 2026-10-12 (spec 007, T085, FR-032). One pair of skills, so a first look and not a result. Written to say first what the run verified, and second what the two skills look like.

## What the run verified

The loop recorded to the real memory service for the first time in the new format, end to end, in both variants (`t085b-reasoning`, `t085b-placeholder`):

- **The service accepted the per-turn recording** (a conversation, assistant messages, a step for each tool-calling turn with its reasoning, the calls under their steps), generated a skill (status `succeeded`), and the workspaces were created and deleted each time.
- **The service's version was read live and recorded:** `nams` 1.3.0, released 2026-10-12, environment production, with its build commit, in `loop.json` `distiller.service`.
- **The record named what ran:** process version 2, the commit and a dirty flag with the hash of the changes, the recording format (`conversation` against `placeholder`), the distiller request (3 conversations, prose), the gates, and the critic's cost ($0.077 each, none unpriced).
- **A failed attempt cleans up and records itself.** The first attempt (labels `t085-*`) failed on every conversation with HTTP 400 and still deleted its workspaces and wrote a loop record with the failure.

Two defects were found and fixed on the way. The service takes a conversation's metadata as an object of strings only, and the recording sent arrays, objects and nulls (the scripted service accepted them; it now rejects them as the real one does). And Sonnet 5.5 with adaptive thinking returned no reasoning at all until `display: "summarized"` was requested (ADR-006 amendment).

## Setup

- **Teacher:** `claude-haiku-4-5-20251001`, thinking budget 31,999 with the interleaved-thinking beta, on the faithful `stone_pickaxe` goal, `--max-turns 80`, 5 runs. Three reached the goal (19, 57 and 57 calls, with 0 to 3 refusals); two used all 80 turns. Only the three that reached it feed the distiller (ADR-003 §2.5). Haiku reasoned on every tool turn (80 of 80, 23 of 23, 34 of 34, 36 of 36 in the runs checked). The first choice, Sonnet, reached the goal in the optimal 11 calls every time but reasoned on about 1 tool turn in 7, so it could not show the effect.
- **The same three runs, recorded two ways.** `t085b-reasoning` read them with their `conversation.jsonl`. `t085b-placeholder` read copies of the same run folders without that file, so the recording step wrote placeholder steps.
- **Same everything else:** the service deployment, the prose format, the critic (Sonnet, adaptive thinking, medium effort), one review round, a $0.50 cap per role call.
- **Spend:** about US$1.25 in all (Haiku teacher runs $0.97, the unused Sonnet teacher runs $0.06, the two critic calls $0.15, probes $0.07).

## The two candidate skills

| | Placeholder steps | Per-turn reasoning |
|---|---|---|
| Name (from the service) | `mcp-craft-table-navigation` | `clear-crafting-discovery` |
| Gates | grounding 1.00, coverage 1.00 | grounding 1.00, coverage 0.70 |
| `procedures.md` | five generic steps: call help; look and inventory; place, remove and clear to test; craft once ready; check the inventory | four steps, two of them the recipe: one oak log to four planks, two planks vertically to four sticks, then three cobblestone in the top row and a stick in each of the middle and bottom centre cells |
| States the recipe | no | yes |
| Critic (rubric v1), overall | revise | revise |
| Critic, `generality` | "generic; no recipe facts" | "one recipe, stone_pickaxe only" |
| Critic, `leads_with_fact` | "no; generic procedure only" | "no, SKILL.md is empty pointers" |

Both `SKILL.md` files are short indexes that point to `references/procedures.md`, and both were judged to describe their content poorly by the critic. The ADR-003 loop was cut to one round, so neither skill was revised.

## What it shows, and what it does not

- **The skill distilled with reasoning states the recipe; the one distilled from placeholder steps is the generic exploration routine** that the pilot's skill was (help, look, inventory, place, remove, clear, craft). That matches the hypothesis that reasoning lets the distiller find what mattered, and it is one pair.
- **It does not show cause.** The distiller's output varies between calls; two generations from the same runs with the same recording might differ as much as these do. A second pair, or several generations per variant, would show whether the difference is stable. The coverage gate fell from 1.00 to 0.70 with the recipe present, which says the gate rewards generic content (as ADR-003 recorded) and not that the reasoning variant is worse.
- **It does not say the skill helps a student.** Neither skill was installed in a run.
- **The oracle was not involved.** Both recordings hold only what the model and the world produced.

## Next, if it is wanted

Two further generations per variant from the same runs would test stability (about ten minutes each of waiting, cents of spend). Installing each skill for the student (the cast's student) on the same goal would test use, and belongs to the experiment, not to this check.
