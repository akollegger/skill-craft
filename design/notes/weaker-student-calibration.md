# A weaker student on Fireworks: calibration on the faithful world

Status: run 2026-10-12 (AI SDK runtime, spec 007). Written after the Haiku rerun showed the faithful world has no gap goal for Haiku on this runtime (`runtime-recalibration.md`).

## Setup

Faithful world (`worlds/minecraft-inspired.json`), the original base prompt, `--max-turns 80`, 5 trials per cell (ADR-003 §2.1), no settings pinned (the Fireworks row takes only a temperature, and the Claude runs left it at the default). Labels `rt-cal-fw-faithful-<model>-<goal>`. Fireworks is unpriced here, so the cells have tokens and no dollars. Intervals are 95% Wilson.

## Results

| Model | wooden_pickaxe | stone_pickaxe | iron_pickaxe |
|---|---|---|---|
| `fireworks/gpt-oss-120b` | 5/5 [57, 100] | 5/5 [57, 100] | 5/5 [57, 100] |
| `fireworks/nemotron-lightning-3p5-30b-a3b` | **0/5** [0, 43] | **0/5** [0, 43] | **0/5** [0, 43] |

- **`gpt-oss-120b` is not weak here.** It reached every goal in every trial, in 11 to 20 calls (the best run is 11), about 0.8M tokens for the 15 runs. The faithful world is the one with a prior (Minecraft vocabulary), so this says little about a world with none; in the spike, on the invented `forge-7`, it reached `glirol` 2 of 5.
- **`nemotron-lightning-3p5-30b-a3b` failed every trial,** about 1.05M tokens for the 15 runs. Under ADR-003's rule (a gap goal is at most 1 of 5) all three goals are gap goals for it.

## How nemotron fails

Of its 15 runs, 8 ended as errors with the fixed code `output_limit` and 7 ended on their own (`stopped`) without the goal. None used its turn budget.

- The errors are one response that ran to the provider's output ceiling (32,768 tokens) after 3 to 24 ordinary tool turns, with each earlier response a few tens to a couple of hundred tokens.
- The `stopped` runs ended with a very long closing message (up to 36,878 characters in one) and no goal, after 6 to 28 calls, several of them crafts.
- So the failure is a runaway generation after a few turns of normal play, and a wrong or missing recipe in the runs that did craft. Which of the two a skill could repair is not known. The runaway generation may come from the model, or from how the runtime sends its earlier reasoning back to the provider; the second was not checked.

## What it means

- A weak student with gap goals exists on the faithful world, and it costs cents to run. That would let the experiment's repair measure run without changing the world.
- **It is a different student from the ADR-003 pair** (Haiku). Using it needs an ADR-003 amendment naming the student, and the teacher: Sonnet reached all three goals in every earlier trial, and `gpt-oss-120b` just did as well, on Fireworks.
- Whether nemotron's failures are of the kind a skill repairs is the open question. A skill that states the recipe could repair the crafting failures; it cannot repair a response that runs on without end. A trial with a skill installed, a few runs, would show how many of the 15 failures were which.
