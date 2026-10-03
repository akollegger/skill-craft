# Quickstart: seeing the critic loop work

Run from the repository root. Steps 1 and 2 need no key and spend nothing. Steps 3 to 5 need a go-ahead
(Claude usage, and for step 4 a NAMS workspace).

## 1. Tests and type check

```bash
pnpm typecheck
pnpm test
```

Expected: both pass. The loop's tests use scripted roles and a scripted NAMS stand-in, so no model or network is called.

## 2. The plan, without a call

```bash
pnpm dev scripts/critic-loop.ts --runs runs/faithful-1-t0-stone/001 runs/faithful-1-t0-stone/002 runs/faithful-1-t0-stone/003 --candidate spikes/faithful-1/skills/graph-single-001/craft-stone-pickaxe --dry-run
```

Expected: a printed plan naming the three runs, the goal, the critic and reviser models (the teacher's, from the runs), the
rubric version, three rounds at most, and that no NAMS call will be made. Nothing is written.

## 3. A loop from an existing candidate (models only)

```bash
pnpm dev scripts/critic-loop.ts --runs runs/faithful-1-t0-stone/001 runs/faithful-1-t0-stone/002 runs/faithful-1-t0-stone/003 --candidate spikes/faithful-1/skills/graph-single-001/craft-stone-pickaxe --label loop-demo
```

Expected: up to three rounds of `critic` and `reviser` lines, an `outcome`, and a `loops/loop-demo/` folder holding
`loop.json`, `rounds/01/...` and, on accept, `skill/`. This reproduces the spike's loop (about 10 minutes, a few dollars at most).
A loop that ends in `reject` has no `skill/` folder.

## 4. A loop from the runs alone (needs `--allow-workspace`)

```bash
set -a; source ./.env; set +a
pnpm dev scripts/critic-loop.ts --runs runs/faithful-1-t0-stone/001 runs/faithful-1-t0-stone/002 runs/faithful-1-t0-stone/003 --allow-workspace --label loop-nams
```

Expected: the workspace id printed when created and again when deleted, a candidate downloaded under
`loops/loop-nams/candidate/`, then the rounds as in step 3. Afterward the account lists no workspace the step created.
Do not export `NAMS_WORKSPACE_ID` in the shell that runs this.

## 5. Use the accepted skill

```bash
pnpm dev scripts/run-agent.ts --goal stone_pickaxe --world worlds/minecraft-inspired.json --runs 3 --max-turns 80 --model claude-haiku-4-5-20251001 --skill loops/loop-demo/skill --label loop-demo-student
```

Expected: the student reaches the goal, loads the skill within a few calls, and each run's `score.json` records the
skill's hash, which equals the last round's `skillSha256` in `loops/loop-demo/loop.json` (SC-005, SC-008).

## What to check against the spec

- SC-002: the workspace guard tests refuse any id the step did not create.
- SC-003: the input tests fail if an earlier verdict or a forbidden string is added to a role's prompt.
- SC-006: `loops/<label>/skill/SKILL.md` has no `run N call N` text; `references/provenance.md` does.
- SC-007: the privacy test finds agent-authored text only under `loops/`.
