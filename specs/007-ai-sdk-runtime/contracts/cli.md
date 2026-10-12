# Contract: Command Line

## `scripts/run-agent.ts`

Added option:

```text
--settings <file>   JSON map from model spec to { temperature?, effort?, thinking? }; the run uses the entry for its model
```

- A model with no entry runs with every setting unset, and its score records `null` for each.
- `--dry-run` prints the settings each run would use and refuses (exit 1) a setting the provider refuses for that model.
- `--model` takes `<provider>/<model>` or a bare `claude-…`; an unknown provider is refused before anything is created.

Exit codes are unchanged: 0 ran, 1 a refusal or a failure, 130 cancelled.

## `scripts/critic-loop.ts`

No new option. `--critic-model` and `--reviser-model` take the same model specs, so a loop can use any admitted provider.

## `spikes/fireworks/probe-tools.ts`, `probe-schema.ts`

Take a model spec (`<provider>/<model>`) instead of a Fireworks short name, read the provider's row for its key and endpoint, and print
structure only: finish reasons, tool names, argument validity, schema validity, usage keys. Agent text and reasoning are counted, not printed.

## Live checks

```bash
LIVE_SDK=1 pnpm vitest run test/live-critic-loop.test.ts test/live-thinking-role.test.ts test/live-skill.test.ts test/live-cancel.test.ts
```

Each is skipped without `LIVE_SDK=1`, takes its keys from the environment, and writes a record under `design/notes/`.
