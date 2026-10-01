# Quickstart: validating run observability

Run from the repository root.

## 1. Automated checks (no real agent, no cost)

```bash
pnpm typecheck
pnpm test
```

Expected: everything passes, including the `recorder`, `measure`, `frames`, `export` and `privacy`
suites, and the existing tests unchanged apart from the harness suite, which now drives a scripted
player.

## 2. Dry run shows the plan, spends nothing

```bash
pnpm dev scripts/run-agent.ts --goal glirol --dry-run
```

Expected: the plan for each run, including the options that will be passed to the SDK (see
[contracts/player-driver.md](contracts/player-driver.md)).

## 3. One real run (spends real Claude usage)

```bash
pnpm dev scripts/run-agent.ts --goal glirol --runs 1 --max-turns 20 --label sdk-check
```

Expected in `runs/sdk-check/001/`:

- `trace.jsonl` with request and tool lines; `seq` from 0; times as small integers; the first request
  starts within a few tens of milliseconds of zero.
- `score.json` with `measured.trace` equal to `matched`, and the token totals and cost equal to the
  totals stated in the player's final result.
- The printed run line shows time and tokens.

If the run reaches its turn budget, expect `ended` to be `budget`, not `error`, and the trace to still
be `matched`.

## 4. Nothing personal, nothing the agent said

```bash
grep -rIl -e "$(git config user.email)" runs/sdk-check && echo LEAK || echo clean
grep -c '"kind"' runs/sdk-check/001/trace.jsonl
```

Expected: `clean` (the first command prints file names only, never values), and a line count that
matches the number of requests plus tool calls. Open `trace.jsonl` and confirm it holds no prose.

## 5. Recording still works

```bash
pnpm dev scripts/run-agent.ts --goal glirol --runs 1 --max-turns 20 --label sdk-record --record
```

Expected: the run behaves as before with user settings loaded (the NAMS hooks apply). Only run this when
you want the session recorded to NAMS; it is the one check that the `--record` path loads user settings
through the SDK the way the CLI flag did.

## 6. Export and replay without the sources

```bash
pnpm dev scripts/export-run.ts runs/sdk-check/001 /tmp/sdk-check-bundle
ls /tmp/sdk-check-bundle
```

Expected: `bundle.json frames.jsonl score.json trace.jsonl`. Frame count equals the log's calls plus one.
Repeat the command: it refuses because the destination exists. Point it at a run folder without
`score.json`: it refuses as unfinished and leaves nothing behind.

## 7. A bad trace

`test/measure.test.ts` covers a missing call, altered arguments, and a token sum that disagrees with the
player's final result. Nothing to do by hand.

## 8. Cancel a run (optional)

Start a short real run and press Ctrl-C while it is going:

```bash
pnpm dev scripts/run-agent.ts --goal glirol --runs 2 --max-turns 20 --label sdk-cancel
```

Expected: the current run is recorded (its `score.json` ends as an error whose reason names the
cancellation), `summary.json` is written, the second run never starts, and the exit code is 130.
