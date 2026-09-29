# Contract: run log

An ordered record of every tool call in one run, written by the server process. It is for the
experiment runner. No tool returns it.

## Location

When the environment variable `SIM_RUN_LOG` is set, the server writes each call to that file. One server
process is one run, so a harness gives each run its own path. When unset, the log is kept in memory
only (used by tests and available on the game object).

The file is created on the first call and appended one line at a time. Each line is a complete
JSON object, so a run that ends abruptly leaves a readable log.

**One log per run.** At startup, if `SIM_RUN_LOG` names a file that already exists and is not
empty, the server prints a message naming the path to stderr and exits with a non-zero status
before serving any call. It never appends to, truncates or overwrites an earlier run's log. A
restart of the server (a reconnect, a crash, a second launch) is a new run and so needs a
new path; the harness gives each run its own. Reusing a path fails loudly instead of mixing two
runs, whose `seq` values would restart at 1 partway through the file.

## Record

```json
{"seq":1,"tool":"place","args":{"item":"ore","row":0,"col":0},"ok":true}
{"seq":2,"tool":"place","args":{"item":"ore","row":0,"col":1},"ok":true}
{"seq":3,"tool":"craft","args":{},"ok":true,"crafted":{"item":"bar","qty":1}}
{"seq":4,"tool":"place","args":{"item":"ore","row":0,"col":0},"ok":false,"error":"not_in_inventory"}
```

| Field | Present | Meaning |
|---|---|---|
| `seq` | always | 1-based call number |
| `tool` | always | `help`, `inventory`, `look`, `place`, `remove`, `clear` or `craft` |
| `args` | always | Arguments as received; `{}` when none |
| `ok` | always | `true` for success, `false` for a refusal |
| `error` | when `ok` is false | The refusal code |
| `crafted` | on a successful `craft` | `{ item, qty }` |

Key order is fixed as shown. There are no timestamps, so replaying the same call sequence gives a
byte-identical log.

## Counting

Derived from the log by the runner:
- **World-changing calls**: entries with `tool` `place` or `craft` (comparable to the solver's
  `minCalls`).
- **All calls**: number of entries.
- **Failed crafts**: entries with `tool` `craft` and `ok` false.
- **Refusals**: entries with `ok` false, grouped by `error`.
- **Crafts made**: entries with `tool` `craft` and `ok` true.

## Not logged

Arguments rejected by the input schema (wrong types, missing fields) never reach the engine, so
they are not logged.
