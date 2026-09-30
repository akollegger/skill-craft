# Contract: replay bundle and the export command

## Layout

```
<dest>/
├── bundle.json      # manifest (BundleManifest), including the run's ModelInfo
├── frames.jsonl     # one Frame per line, seq 0..N contiguous
├── trace.jsonl      # the run's trace, unchanged (may be absent when trace is "absent")
└── score.json       # { ended, turns, score, measured }
```

- No world file, no `run.jsonl`, no `mcp.json`, no prompt, no agent text or reasoning.
- Nothing lists recipes or item descriptions. Item ids appear only inside frames as placed, held,
  crafted or previewed by the run.
- Playable alone: a reader needs only these files.

## Reading

A reader (in `src/harness/bundle.ts`) offers:

- `readBundle(dir)` returning the manifest, the frames, the trace lines and the result;
- `framesAfter(bundle, n)` returning frames with `seq > n` in order (all frames for `n < 0`);
- the same for trace lines, using their `seq`.

## Export command

```bash
pnpm dev scripts/export-run.ts <run-dir> <dest>
```

- `<run-dir>` is a run folder: `runs/<label>/<NNN>`.
- Refuses, printing a one-line cause and exiting non-zero, when: the run has no `score.json`
  (unfinished); `<dest>` exists; the log does not replay on the world its `mcp.json` names; the world
  file is missing.
- Builds in a temporary sibling folder and renames on success, so a failure leaves nothing behind.
- Prints the destination and the frame count.

## Guarantees checked by tests

- Frame `n` equals an independent replay of log entries `1..n` on the world.
- A search of the bundle for the world's file name, every item description, every recipe id and the
  injected personal values finds nothing.
- Exporting a `mismatch` or `absent` run produces frames and a result with no measured figures.
