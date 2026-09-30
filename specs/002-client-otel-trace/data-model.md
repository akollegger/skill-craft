# Data Model: Run Observability

Shapes are TypeScript-flavoured for precision; the persisted forms are JSON. Field names are fixed by
the contracts.

## Trace lines (`trace.jsonl`, one JSON object per line)

```ts
type TraceLine = RequestLine | ToolLine;

interface RequestLine {
  seq: number;              // 0,1,2,... in completion order
  kind: "request";
  requestId: string;        // the model message id
  model: string | null;     // the model that served it, from message_start; null if absent
  turn: number;             // 1-based count of request lines recorded so far
  startMs: number;          // offset from t0 (the SDK's init message); integer ms
  endMs: number;
  ttftMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface ToolLine {
  seq: number;
  kind: "tool";
  toolUseId: string;
  tool: string;             // server prefix removed: "place", not "mcp__craft__place"
  args: Record<string, unknown>;
  startMs: number;
  endMs: number;
}
```

Rules
- A request line is written at `message_stop`, a tool line when either post hook fires; nothing is
  written half-done. A message with a missing or malformed field is skipped and counted.
- Only tools whose full name starts with `mcp__craft__` become tool lines.
- `startMs` and `endMs` are offsets on the harness clock, never wall-clock. A request that would start
  before `t0` is clamped to 0.
- Nothing outside these fields is stored (FR-005). Assistant text, thinking and the session id are never
  read into a line.
- No cost field: the player's final result states cost as a run total only. No success flag: `run.jsonl` records each
  call's outcome.

## Recorder inputs (in memory only, never persisted)

What the recorder reads from the player; everything else is ignored, including the `result` message, whose figures reach the harness only through the driver's `PlayerResult`.

| Input | Fields read |
|---|---|
| `init` system message | arrival time (sets `t0`) |
| stream `message_start` | arrival time, `ttft_ms`, message id, model |
| stream `message_delta` | final usage: the four token counts |
| stream `message_stop` | arrival time |
| `PreToolUse` hook | `tool_name`, `tool_use_id`, `tool_input`, arrival time |
| `PostToolUse` or `PostToolUseFailure` hook | `tool_use_id`, arrival time (either one ends the call) |

## Measured figures (added to a run's `score.json`)

```ts
interface TotalFigures {
  durationMs: number;       // the result's duration_ms
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;          // the result's total_cost_usd
}

interface GoalFigures {     // up to and including the goal-reaching call; no cost
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface ModelInfo {
  requested: string | null; // the --model value, or null when none was given
  resolved: string[];       // the model(s) that ran: the result's modelUsage keys, else the init model; sorted
}

interface Measured {
  trace: "matched" | "mismatch" | "absent";
  reason?: string;          // for "mismatch": the first disagreement; contains no personal data
  total?: TotalFigures;     // present when matched
  toGoal?: GoalFigures;     // present when matched and the goal was reached
}
```

State: `absent` (no trace lines and no result figures) -> `matched` or `mismatch`, decided once when the
run ends. `mismatch` reasons include a count or argument difference against the run log, a token sum
that differs from the result's own `usage`, lines with no result (`run ended without a result`), and
skipped malformed items (`2 malformed items skipped`), and request-line models that differ from the
result's `modelUsage` keys (`models: trace a, result b`).

`ModelInfo` is computed by the harness from `PlayerResult` (`modelsUsed`, else `initModel`) and is
present whatever the trace status.

## Run score addition

`RunScore` gains `reachedSeq: number | null`: the run-log `seq` of the entry after which the goal was
first held; `0` if held before any call; `null` if never. Existing fields are unchanged.

## Player result (what a driver returns)

```ts
interface PlayerResult {
  ended: "stopped" | "budget" | "error";
  turns: number | null;
  costUsd: number | null;
  durationMs: number | null;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number } | null;
  requestedModel: string | null;  // what the harness asked for
  initModel: string | null;       // the model in the session's init message
  modelsUsed: string[];           // the keys of the result's modelUsage
  text: string;             // the agent's final message; kept in score.json, never in a bundle
}
```

## Frame (`frames.jsonl`)

```ts
interface Frame {
  seq: number;              // 0 = start state, then the run log's seq
  tool: string;             // "start" for seq 0
  args: Record<string, unknown>;
  ok: boolean;
  error?: string;
  crafted?: { item: string; qty: number };
  grid: (string | null)[][];
  craftable: string | null;
  partial?: boolean;        // only in worlds whose hints are "partial"
  held: Record<string, number>;
  actions: number;          // action calls so far
  refusals: number;
  reached: boolean;
}
```

Validation: frames are contiguous from 0; frame n equals the state after replaying entries 1..n.

## Replay bundle

Folder of four files (see [contracts/replay-bundle.md](contracts/replay-bundle.md)):

```ts
interface BundleManifest {
  format: 1;
  label: string;            // the run's label and index, e.g. "forge-7-glirol / 001"
  world: { name: string; rows: number; cols: number };
  goal: { item: string; qty: number };
  best: { minCrafts: number; minCalls: number; slack: number } | null;
  frames: number;           // count, including the start frame
  trace: "matched" | "mismatch" | "absent";
  model: ModelInfo;
}
// bundle score.json: { ended, turns, score, measured }   (no agent text)
```

## Relationships

`run.jsonl` (server) <-> `trace.jsonl` (harness recorder) by order; `score.json` summarises both;
`frames.jsonl` derives from `run.jsonl` and the world; a bundle packages `frames.jsonl`, `trace.jsonl`
and a reduced `score.json`.
