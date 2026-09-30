# Contract: `trace.jsonl`

One file per run, in the run folder beside `run.jsonl`, written by the harness's recorder.

- Encoding: UTF-8 JSON Lines, one object per line, keys in the order shown in
  [data-model.md](../data-model.md), no trailing spaces.
- Appended as each line completes, so a reader can follow a live run. Lines are never rewritten.
- `seq` starts at 0 and increases by 1 per line, in completion order. A consumer that has read up to
  `n` reads lines with `seq > n`.
- A request line is written when its model message stops, so it precedes the tool lines for the calls
  it issued. Tool lines are in call order.
- Times are integer millisecond offsets from `t0` (the SDK's `init` message) on the harness's
  monotonic clock. No wall-clock time, date or timezone appears anywhere in the file.
- Allowed fields are exactly those of `RequestLine` and `ToolLine`. A test asserts that no other key
  appears and that none of a set of injected personal values or agent text appears anywhere in the file.
- A run that produced no measurements has no `trace.jsonl` (or an empty one); both mean `absent`.

## Example

```json
{"seq":0,"kind":"request","requestId":"msg_01","model":"claude-sonnet-5-5","turn":1,"startMs":42,"endMs":1770,"ttftMs":1266,"inputTokens":2,"outputTokens":61,"cacheReadTokens":0,"cacheCreationTokens":1943}
{"seq":1,"kind":"tool","toolUseId":"toolu_01","tool":"help","args":{},"startMs":1790,"endMs":1801}
```
