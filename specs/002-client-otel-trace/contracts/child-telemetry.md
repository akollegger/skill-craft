# Contract: telemetry between the harness and the `claude` child

## What the harness sets on the child (added to its environment)

```
CLAUDE_CODE_ENABLE_TELEMETRY=1
CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
OTEL_LOGS_EXPORTER=otlp
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=none
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:<port>
OTEL_LOG_TOOL_DETAILS=1
OTEL_LOGS_EXPORT_INTERVAL=250
OTEL_TRACES_EXPORT_INTERVAL=250
```

Nothing else is added. The child is still started with `--setting-sources project` unless `--record`
is passed, as before. `<port>` is the receiver's port for this run only.

## What the receiver accepts

| Request | Handling |
|---|---|
| `POST /v1/logs` (JSON) | parsed for the allowlisted events; everything else dropped; answers 200 `{}` |
| `POST /v1/traces` (JSON) | parsed for the allowlisted spans; answers 200 `{}` |
| `POST /v1/metrics` | answers 200 `{}`; body discarded unread |
| anything else | 404 |
| body over 8 MB, or invalid JSON | 400 (or 413); the run continues and is flagged `mismatch` if lines are lost |

- Listens on `127.0.0.1`, port chosen by the OS. Never on another interface.
- No request body is written to disk or to any log, including on error paths; error messages name the
  route and a byte count only.
- The receiver ends when the child exits, after a short drain (about 500 ms) so the last exports are
  taken. A hung receiver never blocks the harness beyond that drain.

## Allowlisted records

Named in [data-model.md](../data-model.md) under "Ingest items". Anything not listed there is not read.
