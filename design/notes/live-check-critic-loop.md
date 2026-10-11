# Live check: the critic loop on the AI SDK roles

Run by `test/live-critic-loop.test.ts` (spec 007, T052).

- Teacher recording: `scripts/run-agent.ts --goal glirol --runs 5 --model fireworks/gpt-oss-120b`, the first run that reached the goal.
- Loop: `scripts/critic-loop.ts --candidate spikes/skill-pilot/craft-glirol --max-rounds 1`, critic and reviser `anthropic/claude-haiku-4-5-20251001`.
- Outcome: reject after 1 round(s).
- Role cost: $0.041 (models resolved to anthropic/claude-haiku-4-5-20251001).
- No NAMS call: candidate mode.
