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
