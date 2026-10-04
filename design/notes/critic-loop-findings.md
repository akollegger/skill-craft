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

**5. Keeping the audit trail out of the skill.** The loop's rule that every added fact cites its source call
put run and call numbers, the starting stock and a long list of unknowns into the skill itself, so the student
read them too. A trimmed version (about 240 words against 643) organises the skill around what it does, when
to use it and how, and moves the citations to a separate file. The critic accepted it, and the small model
reached the goal in 3 of 3 runs, loading it within 2 calls, but took 1 to 3 more calls than the longer version
(12, 13 and 14 against 11). Three trials cannot say whether that difference is real. This round was prompted
by a reader's note and a review comment, not by the loop, which is capped at three rounds.

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
- **An audit trail is a different artifact from the skill.** Citations make a skill checkable, and they
  are noise to the agent that follows it. Keep them in a separate file.
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

## In the harness (2026-10-04)

The loop is now a command (`scripts/critic-loop.ts`, spec 005). It was run live three ways on the same three efficient Sonnet
recordings of the faithful-world `stone_pickaxe` goal.

| Run | Start | Rounds | Result | Role time and cost |
|---|---|---|---|---|
| `live-candidate` | the spike's graph skill | 1 | critic **rejected** it outright | 11.5 s, $0.07 |
| `live-candidate-2` | the same skill, critic instructions sharpened | revise, revise-and-accept in 2 | accepted | 35 s, $0.19 |
| `live-nams` | a fresh skill NAMS distilled from the three runs, through a throwaway workspace | revise, revise, accept in 3 | accepted | 59 s, $0.26 |

Students (Haiku, plain prompt, 3 trials each, unrecorded) with the accepted skills: `live-candidate-2` reached the goal 3 of 3 (11, 16 and
11 calls), and `live-nams` 3 of 3 (11, 11 and 15). Every run's `score.json` records the skill hash the loop recorded for its last round.

What the live runs showed that tests could not:

- **The first critic over-rejected.** Its reasons listed the whole fix (the recipe chain, cited to the recordings) and then said `reject`. The
  instructions said "reject when it cannot be fixed from the recordings", and the critic read `reject` as "this skill is poor". The
  instructions now say that a skill that is poor but fixable from the recordings is `revise`, and `reject` is only for recordings that do not
  hold what a useful skill needs. A verdict word needs a definition that cannot be read as a grade.
- **The distiller again returned a generic skill with no recipe** (`mcp-craft-workflow` the first time, another name later), from the same
  efficient runs. The loop turned it into one that leads with the three-craft chain, with citations in a separate provenance file.
- **Three real bugs only the service found:** a JSON Schema `$schema` key the SDK refuses, workspace-tool replies that put a line of prose
  before the JSON (a first attempt created a workspace it could not name, which was found and deleted by hand), and a caller that did not create
  its own folder. All are fixed and have tests.
- **Cost and speed.** A tool-less critic or reviser call took 8 to 14 seconds and $0.04 to $0.08 on Sonnet. The spike's file-reading agents used about
  67,000 tokens and 35 to 55 seconds each. Almost all of a full run's time is the service: about 5.5 minutes of extraction in a total of about 7.5.
- **Students did not always load the skill.** In two of the six student runs the skill was never loaded, and both still reached the goal
  (16 and 15 calls). Haiku had failed this goal in 0 of 5 unaided calibration trials, so either that baseline overstated the gap or the skill
  helps even when not loaded (unlikely). Three trials per skill cannot separate these, and the fresh no-skill baseline ADR-003 asks for is
  still not run.

Open from the spike and still open: description versus body, transfer to a goal the skill was not built from, and a failed-gate run, whose
shape from the service was not observed.

## The base prompt is an experimental variable (2026-10-04)

The harness's base prompt (`buildPrompt`, `src/harness/run.ts`) tells the agent it is in "an unfamiliar workshop", to "use only the craft
tools", that "nobody can answer questions or give hints", to "keep trying on your own", and to "explore ... before you commit". "Neutral" in
ADR-003 meant only that the prompt does not mention the skill. A reader pointed out that the wording discourages anything but thinking hard in
isolation, which is a poor frame for testing whether help (a skill) works. The check: Haiku on the faithful `stone_pickaxe` goal, 80 turns,
with a reworded base prompt (`spikes/critic-loop/prompt-reworded.txt`: the task, what `help` and the tools do, that no one is available to
answer questions, the turn budget, and nothing about isolation or exploring), five trials per arm, through a new `--prompt-file` option.

| Arm | Prompt | Reached | Calls to goal | Skill loaded | Cost |
|---|---|---|---|---|---|
| No skill (calibration, earlier) | original | 0 of 5 | none (166 to 223 calls) | - | $2.00 |
| No skill | reworded | 4 of 5 | 14, 17, 74, 187 | - | $0.94 |
| Skill from the live NAMS loop | reworded | 5 of 5 | 11, 11, 11, 11, 11 | 5 of 5, after 2 calls | $0.18 |

What it shows, and does not:

- **The unaided baseline moved from 0 of 5 to 4 of 5 on wording alone.** Under ADR-003's rule, 4 of 5 is a *solved* goal, not a gap goal. The two
  runs of 14 and 17 calls used what the model already knew about crafting. The original prompt's "unfamiliar workshop" and "explore" probably
  steered it away from that, which would also make a faithful (familiar) world look harder than it is. With five trials the intervals still
  overlap slightly (about 0.38 to 0.96 against 0.00 to 0.43), so this is a strong hint and not an established effect, and the old and new
  baselines were measured on different days.
- **The skill still helped, in speed and reliability.** Five of five at the best run's 11 calls, against 14 to 187 unaided, for a fifth of the
  cost. It did not rescue a failing goal here, because the goal was no longer failing.
- **Skill loading.** The skill was loaded in 5 of 5 under the reworded prompt. Under the original prompt, the good skills in this note were
  loaded in 10 of 12 runs. That is consistent with the original wording discouraging a load, but 0 of 5 against 2 of 12 is too little to say.
- **For the protocol.** ADR-003 says every arm uses one base prompt. The prompt therefore has to be chosen deliberately before any experiment,
  and the calibration (which found the gap) has to be repeated under it. The gap may need a harder or less familiar world, not a harsher prompt.
- **Cost of the check:** $1.13 for ten runs, against the $0.50 I had estimated; unaided runs that wander cost most.

