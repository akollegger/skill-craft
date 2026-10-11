# Operational robustness of the AI SDK runtime

Status: written 2026-10-11, after a review of the driver's failure handling (spec 007, FR-022 to FR-027, tasks T074 to T079).
Why it matters: a throttled, hung or crashing run looks like a model failure in calibration data, and a lost cost looks like a cheap run.

## What a run now does

| Situation | Result | Spend kept |
|---|---|---|
| A step does not return within 5 min (settable) | error `step_timeout`, not retried | yes |
| A craft tool does not answer within 1 min | error `tool_timeout` | yes |
| The craft server dies | error `server_lost` after the first call that cannot reach it | yes |
| Five steps in a row with only invalid tool calls | error `tool_loop` | yes |
| The run's time limit or a cancel | `RunTimedOut` / `RunCancelled`, as before | **yes (was lost)** |
| A token or dollar cap is crossed while the model wants a tool | budget stop, `SpendCap` | yes |
| 429 asking for a wait of a minute or more | error `rate_limited` at once, one request | yes |
| 429, 529, 408 with a short wait | retried twice by the SDK, then `rate_limited` or `provider_unavailable` | yes |
| A dropped connection | retried, then `provider_unreachable` | yes |
| Prompt over the context window (400/413) | `context_length_exceeded`, not retried | yes |
| A response cut off at an output limit | `output_limit` | yes |

Only the code is ever written to disk. `score.json` gains `limits` (the caps and timeouts the run ran under, defaults filled in) and `invalidToolCalls`.

## How it was checked

Fault-injection tests on the scripted provider with the real craft server: `test/ai-driver-faults.test.ts`, `test/harness-limits.test.ts`, and unit tests in `test/ai-options.test.ts`. The dead-server case kills the craft process mid-run. No real provider has returned a 429 or 529 to this code, and the stall and cap paths have not run against a live model (task T079, only with the owner's go-ahead).

## Left open

- **Retry count.** `MAX_RETRIES = 2` with the SDK's 2 s and 4 s waits may be too few for Fireworks under parallel runs. Measure before changing it.
- **Long runs.** The player resends its whole history every step and has no pruning, so a long run ends with `context_length_exceeded` after spending tokens.
- **Roles.** A role has a spend cap but no per-call stall timeout; the loop's own timer is the bound.
- **A server that is alive but stuck** is caught only by the tool timeout.
- **No default output ceiling** is set, because a thinking budget needs a ceiling above it; use `--max-total-tokens` to bound a run.
