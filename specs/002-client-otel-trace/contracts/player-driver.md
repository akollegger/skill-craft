# Contract: the player driver and the recorder's inputs

## The seam

`src/harness/driver.ts` defines the types only:

```ts
type AgentDriver = (opts: DriverOptions, sink: DriverSink) => Promise<PlayerResult>;
```

- `DriverOptions`: the prompt, the world path and run-log path (for the `craft` MCP server), `maxTurns`,
  optional `model`, `record` (load user settings so NAMS hooks apply), and the run folder.
- `DriverSink`: the recorder's entry points: `onMessage(message)` for every streamed message, and
  `onToolStart(call)` / `onToolEnd(call)` for hook calls.
- `PlayerResult`: see [data-model.md](../data-model.md).

`src/harness/sdk-driver.ts` is the only file that imports the SDK. Tests use a scripted driver from
`test/helpers/fake-player.ts` that plays the real engine and emits SDK-shaped messages and hook calls.

## What the real driver passes to `query()`

| Option | Value |
|---|---|
| `mcpServers` | `craft`: stdio, the tsx binary and `src/mcp/server.ts`, env `SIM_WORLD` and `SIM_RUN_LOG` |
| `strictMcpConfig` | `true` |
| `tools` | `[]` (no built-in tools, so the agent cannot read the world file) |
| `allowedTools` | `["mcp__craft"]` |
| `maxTurns` | the run's budget |
| `model` | the run's model, if given |
| `persistSession` | `false` |
| `settingSources` | `[]`, or the user and project sources when `record` is set |
| `includePartialMessages` | `true` |
| `hooks` | `PreToolUse`, `PostToolUse` and `PostToolUseFailure`, each forwarding to the sink and returning `{}`; either post hook ends a call, and a call is recorded once |
| `cwd` | the run folder |

The environment is inherited unchanged; no telemetry variables are set.

## Result handling

- The result message's `subtype` `success` gives `ended: "stopped"`; `error_max_turns` gives `"budget"`;
  any other error subtype, or a throw with no result, gives `"error"`.
- The SDK throws after delivering an `error_max_turns` result. When a result was already delivered, the
  driver returns it and swallows that throw.
- `durationMs`, `turns`, `costUsd` and `usage` come from the result message; `text` from its `result`
  field when present; `modelsUsed` from the keys of its `modelUsage`; `initModel` from the `init`
  message's `model`; `requestedModel` from the option the harness passed.

## What the recorder reads

Named in [data-model.md](../data-model.md) under "Recorder inputs". Anything not listed is not read,
including assistant content blocks, thinking and system messages other than `init`.
