# Live check: a real model loading a skill through the Skill tool

Run by `test/live-skill.test.ts` (spec 007, T055).

- Command: `scripts/run-agent.ts --goal glirol --runs 3 --model anthropic/claude-haiku-4-5-20251001 --skill spikes/skill-pilot/craft-glirol --settings <thinking 31999 for Haiku>`.
- Loaded the skill in 1 of 3 runs; after -, -, 3 craft calls.
- Reached the goal in 3 of 3 runs (not a result: three runs on one goal).
- Cost: $0.169.
