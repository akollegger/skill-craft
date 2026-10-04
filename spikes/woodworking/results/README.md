# Results of the three-scenario demo

The run folders behind [design/notes/three-scenario-demo.md](../../../design/notes/three-scenario-demo.md),
copied from the gitignored `runs/` and `loops/` folders of the machine that ran them. Reproduce the note's table with
`pnpm dev spikes/woodworking/table.ts`.

## `trials/`: one folder per label, five runs each

| Label | Model | Scenario | Arm |
|---|---|---|---|
| `b-mc-*`, `b-forge-*`, `b-wood-*` | `-sonnet` or `-haiku` | pickaxe, `glirol`, stool | unaided (stage A) |
| `g-mc-*`, `g-forge-*`, `g-wood-*` | `-sonnet` or `-haiku` | pickaxe, `glirol`, stool | with the skill from `review-loops/f-*` (stage C) |

Each run folder holds `prompt.txt`, `mcp.json`, `run.jsonl` (the server's log), `trace.jsonl`, `score.json`, and
the label's `summary.json`. Agent text and reasoning are never in them (the harness's privacy test).
Paths inside the files (`SIM_RUN_LOG` in `mcp.json`, the run folders named in each `loop.json`) are the original
`runs/...` paths and do not resolve from here.

## `review-loops/`: the critic loops

| Folder | What it is | Outcome |
|---|---|---|
| `c-mc` | NAMS-distilled skill for the pickaxe, then the critic loop | accepted, round 2 |
| `c-forge`, `c-wood`, `d-forge`, `d-wood`, `e-wood` | NAMS-distilled attempts for `glirol` and the stool (`e-wood` waited 30 minutes) | all failed: extraction never started |
| `f-mc`, `f-forge`, `f-wood` | the run-derived skills, reviewed with `--candidate` | accepted (round 2, 1, 1) |

The accepted skills are the `skill/` folders in `f-*`; the authored versions before review are in
`../skills/`. The failed first attempt at stage A (30 runs that ended in an authentication error and measured
nothing) is not kept.
