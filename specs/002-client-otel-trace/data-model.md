# Data Model: Run Observability

Shapes are TypeScript-flavoured for precision; the persisted forms are JSON. Field names are fixed by
the contracts.

## Trace lines (`trace.jsonl`, one JSON object per line)

```ts
type TraceLine = RequestLine | ToolLine;

interface RequestLine {
  seq: number;              // 0,1,2,... in completion order
  kind: "request";
  requestId: string;
  turn: number;             // 1-based count of request lines emitted so far, kept by the builder
  startMs: number;          // offset from the run's t0 (user_prompt event); integer ms
  endMs: number;
  ttftMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

interface ToolLine {
  seq: number;
  kind: "tool";
  toolUseId: string;
  tool: string;             // server prefix removed: "place", not "mcp__craft__place"
  args: Record<string, unknown>;
  startMs: number;
  endMs: number;
  ok: boolean;
}
```

Rules
- A line is written only when both halves have arrived (research D1). Halves never written alone.
- Only tools whose full name starts with `mcp__craft__` become tool lines.
- `startMs` and `endMs` are offsets, never wall-clock. If a span starts before `t0`, the offset is
  clamped to 0.
- Nothing outside these fields is stored (FR-005).

## Ingest items (in memory only, never persisted)

Output of `otlp.ts`; input of the builder. Each holds only allowlisted fields.

| Item | Source | Fields kept |
|---|---|---|
| `promptEvent` | log `user_prompt` | `timeMs` |
| `apiRequest` | log `api_request` | `requestId`, tokens (4), `costUsd`, `querySource` |
| `llmSpan` | span `claude_code.llm_request` | `requestId`, start and end (ms), `ttftMs`, tokens (4) |
| `toolResult` | log `tool_result` | `toolUseId`, `input` (parsed JSON), `success` |
| `toolSpan` | span `claude_code.tool` | `toolUseId`, `toolName`, start and end (ms) |
| `interaction` | span `claude_code.interaction` | start and end (ms) |

All times are converted from Unix nanoseconds to integer milliseconds. Every other record and every
other attribute, including all resource attributes, is dropped by construction.

## Measured figures (added to a run's `score.json`)

```ts
interface Figures {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

interface Measured {
  trace: "matched" | "mismatch" | "absent";
  reason?: string;          // present for "mismatch": the first disagreement, no personal data
  total?: Figures;          // present when matched
  toGoal?: Figures;         // present when matched and the goal was reached
}
```

State: `absent` (no trace lines at all) -> `matched` or `mismatch`, decided once at the end of the run.

## Run score addition

`RunScore` gains `reachedSeq: number | null`: the run-log `seq` of the entry after which the goal was
first held; `0` if held before any call; `null` if never. Existing fields are unchanged.

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
}
// bundle score.json: { ended, turns, score, measured }   (no agent text, no cost from the CLI JSON)
```

## Relationships

`run.jsonl` (server) <-> `trace.jsonl` (harness) by order; `score.json` summarises both;
`frames.jsonl` derives from `run.jsonl` and the world; a bundle packages `frames.jsonl`, `trace.jsonl`
and a reduced `score.json`.
