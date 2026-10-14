# Contract: the run record schema

`schemas/run-record.v1.json` (generated; see data-model.md for the fields). Strict: an unknown key is invalid.

## Validation

- A record built by `toRunRecord` from a replayed run validates; a record with any excluded field (a score, reached flag, solver path,
  extra-call count, goal role, needed-calls label, world or goals file, timing) does not.
- `reasoning` is `returned` when every turn has reasoning, `none` when none does, `partial` otherwise; a turn's `reasoning` is absent when
  the provider returned none, and a harness must not invent it.

## The tests

1. Drift: the committed file equals what the zod definition generates (sorted keys, trailing newline).
2. Property list: the schema's full property tree equals a committed allowlist literal.
3. Forbidden names: no property at any depth is named `score`, `reached`, `solver`, `bestRun`, `extraCalls`, `goalRole`, `role`, `world`,
   `goals`, `duration`, `durationMs`, `startMs`, `neededCalls`.
4. Round trip: a run record from a real replayed fixture validates, and the NAMS adapter's conversation built from it matches the old step's.

A breaking change is `run-record.v2.json`, never an edit.
