# Quickstart: validating run observability

Run from the repository root.

## 1. Automated checks (no real agent, no cost)

```bash
pnpm typecheck
pnpm test
```

Expected: everything passes, including `otlp`, `assemble`, `receiver`, `measure`, `frames`, `export`
and `privacy` suites, and the existing 214 tests unchanged.

## 2. Dry run shows the telemetry setup, spends nothing

```bash
pnpm dev scripts/run-agent.ts --goal glirol --dry-run
```

Expected: the plan for each run; the child environment (see
[contracts/child-telemetry.md](contracts/child-telemetry.md)) is printed with the port shown as
`<port>`.

## 3. One real run (spends real Claude usage)

```bash
pnpm dev scripts/run-agent.ts --goal glirol --runs 1 --max-turns 20 --label otel-check
```

Expected in `runs/otel-check/001/`:

- `trace.jsonl` with request and tool lines; `seq` from 0; times as small integers.
- `score.json` with `measured.trace` equal to `matched`, and `measured.total.costUsd` and the token
  totals equal to the CLI's own numbers in `claude.json`.
- The printed run line shows time and tokens.

Confirm the metrics switch: `runs/otel-check/001/` holds no metrics data (nothing is stored from
`/v1/metrics`). If the CLI ignored `OTEL_METRICS_EXPORTER=none`, the receiver discarded them.

## 4. No personal data

```bash
grep -rIl -e "$(git config user.email)" runs/otel-check && echo LEAK || echo clean
```

Expected: `clean`. (The command prints only the file names that match, never the values.)

## 5. Export and replay without the sources

```bash
pnpm dev scripts/export-run.ts runs/otel-check/001 /tmp/otel-check-bundle
ls /tmp/otel-check-bundle
```

Expected: `bundle.json frames.jsonl score.json trace.jsonl`. Frame count equals the log's calls plus one.
Repeat the command: it refuses because the destination exists. Point it at a run folder without
`score.json`: it refuses as unfinished and leaves nothing behind.

## 6. A bad trace

`test/measure.test.ts` covers a missing call and altered arguments. Nothing to do by hand.
