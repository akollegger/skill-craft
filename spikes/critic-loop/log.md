# Critic-loop spike log (steps 1 to 3)

Plan: `design/notes/critic-loop-spike.md`. No NAMS calls. Each role ran as a separate agent that read only
the files named in its prompt (recordings and skill text, never the world, goals or solver).

| Stage | Artifact | Verdict / result |
|---|---|---|
| Step 1 trace test | `trace-test.md` | The recordings show the full chain and placements. Not shown: other arrangements, exact quantities, leftovers, failures, exploration. |
| Step 2 critic, round 0 | `critic-round0.json` (skills from `spikes/faithful-1/skills/`) | prose-combined: reject. graph-single-001: revise (placeholders where the recipe should be). |
| Step 3 round 1 | `rounds/round1/` sha256 `7b977c5a...74c5` | revise (minor): 3 overreaching claims, no WRONG. |
| Step 3 round 2 | `rounds/round2/` sha256 `d1152bab...c047` | revise: 1 WRONG claim (sticks placement, introduced in round 1 by the reviser), over-hedged quantities. |
| Step 3 round 3 | `rounds/round3/` sha256 `ac6abbc1...8662` | accept: 15 of 17 claims SHOWN, 2 mild INFERRED, none WRONG. |

Full hashes: `shasum -a 256 rounds/*/craft-stone-pickaxe/SKILL.md`. Transcripts come from `transcript.ts`, which
replays a run log through the craft server.

## Observations for the findings note

- The recipe was in the traces all along; the six NAMS skills omitted it. The distiller kept the
  exploration-shaped workflow and dropped the one fact that mattered.
- The reviser introduced a factual error (round 1) that a fresh critic caught in round 2. Critic and reviser as
  separate contexts earned their keep.
- The traces cannot say how this world differs from common knowledge. The agent made no exploratory calls, so
  nothing shows what it knew in advance. A critic asking "records difference from common knowledge" cannot be
  satisfied from the recordings alone.
- Efficient teacher runs give a skill author nothing about failure modes, alternatives or error output, so the
  revised skill's "Not known" section is long. That is honest, and also what a distiller could have said.
- Three rounds ended in accept, but the accept is the critic's, not a measure of usefulness. Step 4, the
  install check, is what tests that.

## Step 4: install check (2026-10-03)

Haiku (`claude-haiku-4-5-20251001`), faithful world, goal `stone_pickaxe`, 80-turn budget, round-3 skill installed
(`--skill spikes/critic-loop/rounds/round3/craft-stone-pickaxe`), neutral prompt (no pointer to the skill), 3 trials,
not recorded to NAMS. Output: `runs/critic-loop-s1/` (gitignored).

| Run | Reached | Calls (best 11) | Skill loaded after | Cost | Time |
|---|---|---|---|---|---|
| 001 | yes | 11 (+0) | 3 calls | $0.047 | 28.1 s |
| 002 | yes | 11 (+0) | 3 calls | $0.047 | 25.5 s |
| 003 | yes | 11 (+0) | 2 calls | $0.043 | 24.8 s |

3 of 3 at the best run's call count, for $0.137. For comparison, unaided Haiku on the same goal in calibration
reached it 0 of 5 times (166 to 223 calls in the runs read; $2.00 for the 5). Caveats: 3 trials, and the
comparison is to calibration trials, not a fresh baseline (ADR-003's S0 uses fresh trials because a goal chosen
for failing can improve by chance). The skill is also the faithful-world stone recipe, so this shows the skill
repairs the gap it was written from; it says nothing about transfer.

## Step 4b: the original NAMS skills, same conditions

Same setup as step 4 (Haiku, faithful world, `stone_pickaxe`, 80 turns, neutral prompt, 3 trials, unrecorded), with
the skills as NAMS distilled them. Output: `runs/critic-loop-orig-<skill>/` (gitignored).

| Skill | Reached | Calls to goal | Skill loaded after (calls) | Cost |
|---|---|---|---|---|
| prose-combined (critic: reject) | 0 of 3 | none; 143 to 194 calls, budget hit | 30, 72, 20 | $1.20 |
| graph-single-001 (critic: revise) | 1 of 3 | 81 (+70 over best 11) | 3, 38, 92 | $0.96 |
| round 3 (critic: accept) | 3 of 3 | 11, 11, 11 (+0) | 3, 3, 2 | $0.14 |

The critic's verdicts ordered the skills the way the install check did. Two things changed between the original
and round 3: the content (the recipe chain) and the description. The originals were loaded late or not at the
start in 5 of 6 runs; round 3 was loaded within 3 calls every time. A skill that is found late is a skill
that has not yet helped, so the description rewrite may account for part of the gain. This spike did not
separate the two (that would need round 3's body under the old description, or the reverse).
