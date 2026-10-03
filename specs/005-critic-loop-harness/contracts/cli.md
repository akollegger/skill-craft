# Contract: the `critic-loop` command

`pnpm dev scripts/critic-loop.ts [flags]`, a thin wrapper over `runCriticLoopCli(argv, deps)` in `src/loop/cli.ts`
(`deps` carry the role driver, the NAMS client, an abort signal and `out`/`err` writers, so tests use scripted ones).

## Flags

| Flag | Meaning | Default |
|---|---|---|
| `--runs <folder>...` | One or more finished run folders of the same goal and world (repeat the flag). Required | none |
| `--candidate <folder>` | Start from this skill package; make no NAMS call | none (distill from the runs) |
| `--allow-workspace` | Permit creating and deleting a NAMS workspace for this step. Required unless `--candidate` is given | off |
| `--format graph|prose` | The distiller's procedure format | `prose` |
| `--critic-model <id>` | Model for the critic | the teacher's model in the runs |
| `--reviser-model <id>` | Model for the reviser | the teacher's model in the runs |
| `--max-rounds <n>` | At most this many critic reviews, 1 to 3 | `3` |
| `--max-role-usd <n>` | Spend cap for one role call | `1.00` |
| `--timeout-minutes <n>` | Cap on the whole loop; the generation wait counts | `45` |
| `--out <folder>` | Parent folder for the loop folder | `loops` |
| `--label <name>` | Name of the loop folder, which must not exist | from the goal and the time |
| `--dry-run` | Print the plan and make no call | off |

## Refusals before any call (exit 1, one line each)

- no `--runs`, or a run folder that is unfinished, does not replay, or has a trace that does not match its log
- runs of different goals or worlds
- recordings from more than one model and no `--critic-model` or `--reviser-model`
- neither `--candidate` nor `--allow-workspace`
- the recordings exceed 150,000 characters, or the candidate package exceeds 64 KB (32 KB for a file); the message names the limit
- `--label` already exists
- `NAMS_API_KEY` missing when a workspace is needed (the message names the variable, never a value)

## Output lines

```text
recording  run 001 -> conversation <id>            (runs mode)
generating skill run <id> ... ready
round 1  critic claude-... : revise    $0.2 / 38 s
round 1  reviser claude-...: revised   $0.3 / 41 s   sha256 <12 hex>
round 2  critic ...        : accept
outcome accept   skill: loops/<label>/skill
files: loops/<label>
```

A reject prints `outcome reject  (<reason>)` and no `skill:` line. Workspace ids are printed when created and deleted.

## Exit codes

`0` the loop finished (accept or reject); `1` a refusal, a user error or a failed loop; `130` cancelled with Ctrl-C (the
record for finished rounds is written and the workspace is deleted first).

## Installing the result

`pnpm dev scripts/run-agent.ts ... --skill loops/<label>/skill` is the unchanged existing option.
