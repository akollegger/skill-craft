# Spike plan: the critic loop on a weak distillation

Status: draft plan, 2026-10-03. Branch `spike/critic-loop`. Input to ADR-003 section 2.6 (the critic loop).
Nothing here has run. The spike makes no NAMS calls.

## Why this spike

This project demonstrates the concept of distilling a skill from memory traces. NAMS is a labs project that
can be improved, so the aim is to learn what the workflow looks like, what works, what does not and what to
change, and to share that with the NAMS team.

The faithful-world experiment ([results](faithful-control-results.md)) left a specific gap. Distilling
three efficient Sonnet runs on `stone_pickaxe` gave six skills that pass NAMS's gates (grounding 1.0,
coverage 1.0) and contain no recipe, and review rejected all six. ADR-003 section 2.6 has `revise` act
through NAMS (re-distill, edit, extract a sub-procedure). This spike takes a different route: **NAMS
distills the first skill, and the strong model revises it in place, as files.** NAMS is not used to revise
anything. The spike runs one full loop on the weakest input we have and records what each stage does.

## Questions

1. **Does the trace contain the recipe?** Can a strong model, reading only the recordings, state the
   stone-pickaxe recipe and cite the calls it came from? If not, no skill can contain it, and the finding is
   about the traces.
2. **Can a critic find the problem?** Does the rubric (ADR-003 2.6) produce a verdict that matches the one
   reviewer's reading (reject: generic workflow, no discovered fact)?
3. **What does the strong model change?** When it edits the distilled skill in place, what does it add, remove
   and reorder, and can each added fact be traced to a recorded call? The diff against what NAMS produced is
   the main finding for the NAMS team.
4. **Does the revised skill help?** Does an agent with it load it and use it? (A single check, not the
   experiment's arms.)
5. **How many rounds, and what does each cost?**

## Inputs

| Input | Where | Why |
|---|---|---|
| Efficient teacher runs | `runs/faithful-1-t0-stone` (3 Sonnet runs, 11 calls, no refusals) | The weakest input: the one that already failed. |
| Already-distilled skills | `spikes/faithful-1/skills/` (prose-combined, graph-single-001) | The loop can start from these without any new NAMS call. |

The runs are local (`runs/` is gitignored). Check that they are still present before starting.

## Steps

Each step records, in a findings log (`spikes/critic-loop/log.md`), what was read or sent, what came back,
how long it took and anything surprising. 

1. **Trace test.** The strong model reads `runs/faithful-1-t0-stone` (calls and outputs, not the world file or
   the solver) and writes the recipe it infers, citing call numbers. Compare to the world's recipe
   afterward. Question 1.
2. **Critic.** Run the critic over `prose-combined` and `graph-single-001` with the ADR-003 rubric and the
   recorded goal list. It is shown no held-out goal and no results. Compare its verdict to the existing review
   (`runs/faithful-1/review.json`). Question 2.
3. **Revise in place.** The strong model edits a copy of the skill folder (`spikes/critic-loop/rounds/`),
   guided by the critic's verdict and the recordings: lead with the discovered fact, drop the replayed
   exploration routine, fix the description so it triggers a load. Each added fact cites its source call.
   Up to three rounds, each ending in a new critic verdict. Keep the text, the SHA-256 and the diff per round.
   Question 3 and 5.
4. **Install check.** Run the student (Haiku) on `stone_pickaxe` with the revised skill installed, using the
   harness's `--skill <folder>`. A few trials after a `--dry-run`. Note whether it loads the skill and what it
   does. Question 4.
5. **Write the findings.**

The spike makes no NAMS calls. Approve and publish are not part of it.

## What to record

- The artifact in (skill text, SHA-256), the artifact out and the diff, per round.
- What the strong model added, removed or reordered, and for each added fact the recorded call it came from.
- Whether the result could be installed and loaded by the harness.
- Rounds taken, tokens and cost per round.

## Output

`design/notes/critic-loop-findings.md`, written for the NAMS team as well as for this project:

1. What the workflow looks like end to end.
2. What worked.
3. What did not, with the evidence.
4. Gaps to raise with NAMS, stated as requests, drawn from the diffs. Candidates: a skill that is well grounded
   and says nothing new; coverage rewarding a generic workflow; a description that starts with a tool name; no
   way to mark a fact as the point of the skill.
5. The ADR-003 2.6 amendment: `revise` performed by the strong model editing the skill, with each round's
   diff and hash retained.

## Boundaries

- The critic and the reviser read recordings and skill text only, not the world file, the goals file's
  recipes or the solver's output, so a fact they add is a fact the traces held.
- Neither sees a held-out goal or an evaluation result.
- Keys come from `.env` and are never printed or passed as arguments.
- Spike code and rounds live in `spikes/critic-loop/`, outside the product. No change to the engine, the
  server or the run log.

## Cost estimate

A few dollars at most: a model read of three small runs, up to three critic and revision rounds, and one
install check with a few Haiku runs. Confirm with `--dry-run` before spending.

## Open questions

- Should the critic and the reviser be separate runs? The plan assumes the same strong model plays both; the
  findings should say if that blurs the verdict.
