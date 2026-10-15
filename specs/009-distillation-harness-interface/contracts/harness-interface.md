# Contract: the harness interface

TypeScript in `src/distill/harness.ts` (shapes in data-model.md); the exchanged data is the two JSON Schemas.

## Operations

| Operation | Contract |
|---|---|
| `registry.get(name)` | returns a harness, or throws a user error naming the known harnesses; `nams-reviewed` and `bespoke-one-shot` |
| `open(experimentId, signal)` | isolated store for that experiment; a harness that writes to an account needs its explicit option here and refuses without it |
| `record(run, signal)` | finished run only; idempotent by `run.id`; no streaming |
| `distill(request, signal)` | `runIds` non-empty and recorded, else refused before any work; independent of earlier calls; returns a skill set or a refusal; never an empty set |
| `describe()` | the provenance record, valid at any point (before `distill` it says nothing was produced) |
| `close()` | releases everything the session created, after any outcome including cancellation; touches nothing it did not create; safe to call twice |

## Rules

- A harness is never given a way to choose runs: only ids the caller named are distilled.
- A harness input never holds the fields the run record excludes, and a harness prompt is built from named parts only.
- A refusal is a returned value with a fixed code; an unexpected exception is not turned into one.
- A harness that sends run records to a third-party store that keeps them states it in `describe()` (`retainedExternally: true`) and runs only with its operator option; a harness that only calls a model provider the project already calls needs none.
- Each harness owns a process version and a changelog entry for each change to what it records, asks of a model or runs.

## Test double

Tests define a scripted harness (records what it was given, returns a configured skill set or refusal, counts `close` calls); it is not a
registered product harness.
