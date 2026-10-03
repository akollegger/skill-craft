# Distilling a skill from memory, then fixing it: what a critic loop showed

Status: findings from a small spike, 2026-10-03. Plan: [critic-loop-spike.md](critic-loop-spike.md). Working
files: `spikes/critic-loop/`.

## The idea

An agent that works on a task leaves a record: the calls it made and what came back. One way to reuse that
experience is to *distill* a **skill** from it, a short document an agent can load before it starts, saying
how the task is done. A strong model works the task out once, the record is distilled, and a smaller model
reads the result and does the task without the exploring.

This project tests that idea in a toy setting (a simulated crafting table, [ADR-001](../adr/ADR-001-crafting-table-world.md)).
An earlier experiment found that the distillation step can produce a skill that looks sound and says
nothing useful. This spike asks what to do about it: **can a review loop turn a weak distilled skill into a
useful one, and what does the loop show about the process?**

## The setup, in brief

- **The task:** hold a `stone_pickaxe` at a 3x3 crafting table. It takes three crafts in order, with items
  placed in specific cells.
- **The record:** three runs by a strong model (Sonnet), 13 calls each, all identical.
- **The distilled skills:** two, produced by a memory service's distiller from those runs. Both pass the
  service's own quality checks (every step traceable to the record, the record well covered). Neither
  contains the recipe.
- **The loop:** a *critic* (a model) reviews a skill against a fixed list of questions and answers `accept`,
  `revise` or `reject`. A *reviser* (a model) edits the skill in place, as plain files, using only the record
  and the critic's points. A fresh critic reviews the result. At most three rounds. Critic and reviser each
  ran in a separate context and could read only the record and the skill text, never the world's data, so a
  fact they add is a fact the record held.
- **The test:** a smaller model (Haiku) attempts the task with a skill installed, three trials per skill,
  with a plain prompt that does not mention the skill.

## What happened

**1. The record held the recipe all along.** A model reading only the record could state the whole chain,
with the exact items, cells and outputs, and cite the calls each came from. The distilled skills left it out.
They kept the shape of the work (read the help, check the inventory, place, craft, verify) and dropped the one
fact that mattered.

**2. The critic's verdicts ordered the skills correctly, before anything was run.**

| Skill | Critic's verdict | Reached the goal | Calls (best possible: 11) |
|---|---|---|---|
| Distilled, prose form | reject (generic advice, no recipe) | 0 of 3 | 143 to 194, ran out of turns |
| Distilled, graph form | revise (placeholders where the recipe should be) | 1 of 3 | 81 for the one success |
| After three rounds of revision | accept | 3 of 3 | 11, 11, 11 |

The small model without any skill had reached this goal 0 of 5 times in an earlier calibration. Cost for three
runs: about $1.20 and $0.96 for the distilled skills (wandering to the turn limit) against $0.14 for the revised
one.

**3. The loop converged in three rounds, and the middle round earned its place.** Round 1 fixed the content
and drew three overreaching claims. In round 2 a fresh critic found a factual error the reviser had introduced:
it said sticks were placed right after being crafted, when the record showed three other placements in between.
A reviser that also judged its own work would likely have missed it. Round 3 had 15 of 17 claims directly
shown by the record, 2 mildly inferred and none wrong.

**4. The revised skill was found sooner.** The small model loaded the revised skill within 2 to 3 calls in
every run. It loaded the distilled skills late (after 20 to 92 calls) in 5 of 6 runs. A skill that arrives at
call 90 has little left to help with. The revision changed both the content and the description that decides
whether a skill is loaded, and these runs do not separate the two.

## What the loop taught us about distilling skills from memory

- **A well-grounded skill is not necessarily a useful one.** Quality checks that ask "is every step
  supported by the record?" and "is the record covered?" are satisfied by a generic workflow. The useful part,
  the non-obvious fact, is a small piece of the record, and a check that counts recurring patterns will
  not reward it. A check for *what the skill tells you that you did not already know* is a different check.
- **Efficient runs make thin material.** The strong model worked straight to the answer, so the record has no
  wrong turns, no alternatives and no error messages. The distiller had no contrast to learn from, and the
  revised skill has a long "not known" section: whether other arrangements work, whether quantities are exact,
  what a failed craft looks like. Recording a teacher that explores, or keeping its failed attempts, would give
  a distiller more to say.
- **The record cannot say where a world differs from common knowledge.** The teacher made no exploratory
  calls, so nothing shows what it knew in advance. A review question that asks whether a skill records "where
  this world differs from what the model already knows" cannot be answered from the record alone, and the
  loop rightly declined to guess.
- **State what is unknown, and say how to find out.** The revised skill states only what the record shows and
  lists the rest as not known, with cheap ways to test it. The critic accepted that, and it is also safer for
  the student than a confident claim the record does not support.
- **Keep the reviser and the critic apart.** The one factual error in the loop came from the reviser and was
  found by a critic that had not seen the earlier rounds.
- **Descriptions matter as much as bodies.** An agent decides whether to load a skill from its name and
  description. One that opens with a tool name, or says nothing about when to use it, may be loaded late or never.
- **A critic's verdict can be checked.** Here it predicted the ordering of install results, which is
  encouraging. Three trials per skill is too few to call it validated.

## What worked and what to improve

**Worked:**
- Reviewing before installing: each critic or reviser round used about 67,000 to 71,000 tokens and 35 to 55 seconds (dollar cost was not measured), and the verdicts predicted the ranking.
- Citing the source call for every added fact, which made each claim checkable.
- Editing in place as plain files, with the diff and a hash kept for each round.

**Worth improving, as requests to anyone building distillers or reviewers:**
- Let a distiller (or its caller) mark which facts are the point of the skill, so they are not averaged away
  into the routine.
- Add a check, or a review step, for content: does the skill hold a fact that is not generic?
- Keep failed attempts and error outputs from a teacher's record available to the distiller.
- Surface the description as a first-class thing to review and test.

## Limits of this evidence

- One task in one world, one strong and one small model, one distiller version, three trials per skill.
  Intervals are wide.
- The critic and the reviser are models. They may share blind spots with each other and with the teacher.
- The task belongs to a world with familiar recipes, so models do well on it unaided in other trials. The
  gap this skill repaired was Haiku's, on this goal, and the repair is shown only for the goal the skill was
  written from. It says nothing about transfer to goals the skill was not built from.
- The comparison without a skill is to earlier calibration trials, not a fresh baseline.
- The revised skill changed content and description together. Which one drove the gain is not separated.
- An `accept` from the critic means the skill's claims are grounded, which is not a measure of usefulness. The
  install trials are the measure.

## Next questions

- Does the gain survive separating the description from the body?
- Does a skill written this way transfer to a goal in the same family that was never recorded?
- Would a distiller given the same record and the revision's structure (fact first, unknowns listed) produce
  something like round 3 without a loop?
- What does the loop do on a task where the teacher has to explore, so the record has failures in it?
