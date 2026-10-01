# skill-craft

A demo of **skill distillation** from agent memory, built on the Neo4j Agent Memory Service (NAMS).
An agent works in a small simulated environment, a crafting table where items combine into new
items. Its runs are recorded to NAMS, a skill is distilled from those recordings, and later runs
with and without that skill are compared.

Background: [From Agent Memory to Portable Skills](https://neo4j.com/blog/genai/from-agent-memory-to-portable-skills/).

## The idea

The crafting table is a grid. The agent places items on it, and the table reports whether the
current arrangement makes something. Some recipes only need the right items (shapeless). Others
need the right items in the right arrangement (shaped). Raw items are limited, and crafting
consumes them, so wrong guesses cost something. The agent has to discover what can be built. It
cannot look recipes up. Each experimental world declares how far prior knowledge applies: invented
names (none), a familiar vocabulary with deviations, or a faithful copy used as a control.

If a distilled skill helps, it shows up as fewer tool calls and fewer wasted crafts on a later run.

The design is recorded in [ADR-001](design/adr/ADR-001-crafting-table-world.md).

## Status

The simulation is built and tested: the crafting-table engine, the `craft` MCP server, world
validation, an exact solver that scores runs, a run log, and a world re-skinner. An interim harness runs
Claude Code against it, measures each run's time, tokens and cost, and exports a run as a replay bundle
([ADR-002](design/adr/ADR-002-client-otel-trace.md)).

Not built yet: the record, distill and compare workflow, and the observer. Those wait on a decision about
which agent plays and how arms are compared (see [design/notes/agent-player-options.md](design/notes/agent-player-options.md)).

## Requirements

- Node 22 or newer and [pnpm](https://pnpm.io).
- For the NAMS steps: a NAMS account, an API key, and the `nams-hooks` Claude Code plugin.

## Setup

```bash
pnpm install
cp .env.example .env    # then fill in your keys; .env is gitignored
pnpm typecheck
pnpm test
```

`.env` holds `NAMS_API_KEY` (one key, with the memory, entities, reasoning and skills scopes) and
`NAMS_WORKSPACE_ID` (the dedicated experiment workspace, kept apart from the one development sessions
record to). Keys stay in `.env`; do not paste them into commands or chat.

## The simulation

The `craft` MCP server exposes one world to an agent through seven single-purpose tools: `help`,
`inventory`, `look`, `place`, `remove`, `clear` and `craft`. Coordinates are zero-based. `place`,
`remove`, `clear` and `look` return a preview: the table's contents and what `craft` would make
right now. Only `craft` spends stock. The contract is in
[specs/001-crafting-table-sim/contracts/tools.md](specs/001-crafting-table-sim/contracts/tools.md).

```bash
# Run the server for a world (an MCP client such as Claude Code starts it this way via .mcp.json)
SIM_WORLD=worlds/generated/forge-7.json pnpm exec tsx src/mcp/server.ts

# Record every call to a fresh file (the server refuses to start on a file that already has data)
SIM_WORLD=worlds/forge.json SIM_RUN_LOG=runs/run-001.jsonl pnpm exec tsx src/mcp/server.ts
```

- **Worlds** are JSON files (`worlds/forge.json` is the base). A world sets the table size, the
  starting stock, the items, the recipes (shapeless or shaped) and a hint level. It holds no goals;
  each committed world has a sibling `<name>.goals.json` for tests and the solver.
- **Best run.** `pnpm dev scripts/solve.ts --world worlds/forge.json --goals-file worlds/forge.goals.json`
  prints the fewest crafts, the fewest tool calls, the slack and a replayable call list for each goal.
- **Re-skin.** `pnpm dev scripts/make-world.ts --seed 7 --out worlds/generated/forge-7.json`
  writes a variant with invented item names and its goals. `--perturb` also changes some
  quantities and patterns. Use a generated world for anything an agent will play.
- **Replay.** `pnpm dev scripts/smoke.ts worlds/forge.json lamp:1` spawns the server and replays the
  best run over stdio.
- **Run log.** With `SIM_RUN_LOG` set, every call is appended as one JSON line, refusals included,
  with no timestamps. `summarize` in `src/sim/runlog.ts` derives call and failure counts.

### Running an agent against it

`scripts/run-agent.ts` runs Claude Code against the `craft` server through the Claude Agent SDK, gives
each run its own run log, scores and measures it, and summarises. The goal reaches the agent only through
the prompt, which tells it that nobody can answer questions and gives it a turn budget.

```bash
# See the exact SDK options first; this spends nothing and creates nothing
pnpm dev scripts/run-agent.ts --goal glirol --runs 3 --dry-run

# Run it: three attempts at the warm-up goal on a generated world, 40 turns each
pnpm dev scripts/run-agent.ts --goal glirol --runs 3 --max-turns 40 --label baseline
```

Each run gets a folder under `runs/<label>/` (gitignored) with `prompt.txt`, `mcp.json`, `run.jsonl`
(the server's log, with no clock), `trace.jsonl` (model requests and tool calls with times and tokens,
measured by the harness), `score.json`, and a `summary.json` for the label. Built-in tools are removed,
so the agent cannot read the world file. Sessions stay out of NAMS unless you pass `--record`. Each run
has a time limit (`--timeout-minutes`, default 30), and Ctrl-C ends the current run, writes the summary
and exits 130. One failing run never stops the rest.

A run ends `stopped` (the agent gave up or asked for help), `budget` (it used every turn) or `error`,
with a `reason` for an error. `score.json` also records the model requested and the model that ran, and
a label whose runs used different models is flagged in its summary, since their figures are not one
comparable set. The trace is checked against the run log and the player's own totals: if they disagree
the run is marked `mismatch` and its measured figures are left out.

To share a finished run, export it as a replay bundle. It holds the frames, the trace and the result,
with no world file, no recipes and nothing that identifies whoever ran it:

```bash
pnpm dev scripts/export-run.ts runs/baseline/001 /tmp/baseline-001
```

The score counts **action calls**: `place`, `remove`, `clear` and `craft`. `help`, `inventory` and
`look` are free. `callsToGoal` is the action calls up to the moment the goal was first held, and
`extraCalls` is that minus the best run's minimum.

To score logs you already have: `pnpm dev scripts/score.ts --world worlds/generated/forge-7.json --goal glirol --log runs/x/001/run.jsonl`.

This harness follows the leaning in the player design note; the experiment-protocol decision (ADR)
is still to be written. Agent text and reasoning are never written to a trace or a bundle.

### Recording sessions to NAMS

Sessions are recorded with the [nams-hooks](https://github.com/neo4j-labs/nams-plugins) plugin:

```bash
claude plugin marketplace add neo4j-labs/nams-plugins@latest
claude plugin install nams-hooks@nams-plugins
```

The plugin prompts for the API key. Everything typed and every tool call in a recorded session
goes to NAMS, so treat command text as visible to your workspace.

### Distilling a skill

Distillation is a REST call (`POST /v1/skills/generate`) followed by polling, review and publish.
The [Skills Quickstart](https://neo4j.com/labs/agent-memory/tutorials/skills-quickstart/) and the
public OpenAPI spec at `https://memory.neo4jlabs.com/openapi.json` describe the flow. The skills
key needs `skills:read` and `skills:write`; a "Connect an agent" key from the NAMS dashboard
provides them.

## Layout

| Path | Contents |
|---|---|
| `src/sim/` | Simulation core: schema, matcher, engine, run log, solver, loader, goals, re-skinner (no MCP dependency) |
| `src/mcp/` | The `craft` MCP server that exposes a world to an agent |
| `worlds/` | World definitions and goals (JSON); `worlds/generated/` holds re-skinned examples |
| `src/harness/` | Interim run harness: prompt, SDK options and driver, errors, the command, export and bundle reader |
| `src/trace/` | Run measurement: the recorder, trace lines, and joining the trace to the run log |
| `scripts/` | `solve.ts`, `make-world.ts`, `smoke.ts`, `run-agent.ts`, `score.ts`, `export-run.ts` |
| `test/` | vitest suites, plus `fixtures/valid` (ten worlds) and `fixtures/invalid` (sixteen broken worlds) |
| `design/adr/` | Architecture Decision Records and their index |
| `design/notes/` | Exploratory design notes that may become ADRs |
| `specs/` | Spec Kit feature specs, plans and tasks |
| `.specify/` | Spec Kit configuration, constitution and templates |

Common commands: `pnpm test`, `pnpm typecheck`, `pnpm build`.

## How work is organized

Decisions come first, as ADRs. Features are specified with Spec Kit and must reference an
accepted ADR. The project's rules live in the
[constitution](.specify/memory/constitution.md).

1. `/adr-create` records a decision; `/adr-review` checks it.
2. `/speckit-specify ADR-NNN: ...` starts a feature. A hook blocks the request if it does not
   reference an existing ADR.
3. `/speckit-plan`, `/speckit-tasks` and `/speckit-implement` follow.

## License

Not yet chosen.
