# Live check: cancelling a real run

Run by `test/live-cancel.test.ts` (spec 007, T056).

- Model: `fireworks/nemotron-lightning-3p5-30b-a3b` (cheap), goal glirol.
- Five runs interrupted with SIGINT after 6 s: each exited 130, wrote a summary with `cancelled: true` and a `RunCancelled` reason.
- Five runs with `--timeout-minutes 0.05`: each wrote a summary whose run reason starts `RunTimedOut`.
- After all ten, no craft server process was left running (none reparented to init).
