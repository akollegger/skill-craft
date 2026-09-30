# Contract: `trace.jsonl`

One file per run, in the run folder beside `run.jsonl`, written by the harness's receiver.

- Encoding: UTF-8 JSON Lines, one object per line, keys in the order shown in
  [data-model.md](../data-model.md), no trailing spaces.
- Appended as each line completes, so a reader can follow a live run. Lines are never rewritten.
- `seq` starts at 0 and increases by 1 per line, in completion order. A consumer that has read up to
  `n` reads lines with `seq > n`.
- Times are integer millisecond offsets from the run's `t0` (the `user_prompt` event). No wall-clock
  time, date or timezone appears anywhere in the file.
- Allowed fields are exactly those of `RequestLine` and `ToolLine`. A test asserts that no other key
  appears and that none of a set of injected personal values appears anywhere in the file.
- A run that produced no measurements has no `trace.jsonl` (or an empty one); both mean `absent`.

## Example

```json
{"seq":0,"kind":"tool","toolUseId":"toolu_01","tool":"help","args":{},"startMs":1810,"endMs":1821,"ok":true}
{"seq":1,"kind":"request","requestId":"req_01","turn":1,"startMs":10,"endMs":1909,"ttftMs":1760,"inputTokens":2,"outputTokens":61,"cacheReadTokens":3014,"cacheCreationTokens":1312,"costUsd":0.0064648}
```

(A tool line can complete before the request that issued it is paired; `seq` is completion order, so
readers that need call order sort tool lines by `startMs`.)
