# Contract: solver and world-generation commands

Run with `pnpm dev <script> [options]`. Output is JSON on stdout; diagnostics go to stderr.

## `scripts/solve.ts`: best run for a goal

```bash
pnpm dev scripts/solve.ts --world worlds/forge.json --goal frame:1
```

| Option | Meaning |
|---|---|
| `--world <path>` | World file (required) |
| `--goal <item>:<qty>` | Goal (required, repeatable). Or `--goals-file <path>` to solve every goal in a goals file. |

Output, one object per goal:

```json
{
  "goal": { "item": "frame", "qty": 1 },
  "reachable": true,
  "minCrafts": 3,
  "minCalls": 12,
  "slack": 1,
  "statesVisited": 148,
  "calls": [
    { "tool": "place", "args": { "item": "ore", "row": 0, "col": 0 } },
    { "tool": "place", "args": { "item": "ore", "row": 0, "col": 1 } },
    { "tool": "craft", "args": {} }
  ]
}
```

For an unreachable goal: `{ "goal": {…}, "reachable": false }`.

Exit status: 0 when every goal was solved (reachable or not); 1 on a load error or when the search
exceeds the state budget (the message names the budget).

`calls` is the minimum-call path. Replaying it against a fresh game reaches the goal in exactly
`minCalls` calls (SC-002).

## `scripts/make-world.ts`: re-skinned world

```bash
pnpm dev scripts/make-world.ts --base worlds/forge.json --seed 7 --out worlds/generated/forge-7.json
```

| Option | Meaning |
|---|---|
| `--base <path>` | Base world (default `worlds/forge.json`) |
| `--seed <int>` | Seed (default 1); the same seed always gives the same output |
| `--perturb` | Also change some quantities and patterns; the result is validated and solvable for the base goals |
| `--keep-descriptions` | Keep the base descriptions instead of category-only text |
| `--out <path>` | Output world file; the goals file is written beside it as `<name>.goals.json`. Without `--out`, the world goes to stdout and no goals file is written. |

Exit status 1, with a message, if a valid variant cannot be produced within the retry bound.

## `scripts/smoke.ts`: stdio replay

```bash
pnpm dev scripts/smoke.ts worlds/forge.json frame:1
```

Starts the server as a child process, replays the best run for the goal through the tools, and
prints the number of world-changing calls and whether the goal item is held. Exits non-zero if the
count differs from `minCalls` or the goal is not met.
