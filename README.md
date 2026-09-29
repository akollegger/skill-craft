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
cannot look recipes up, and worlds use invented item names so prior knowledge does not help.

If a distilled skill helps, it shows up as fewer tool calls and fewer wasted crafts on a later run.

The design is recorded in [ADR-001](design/adr/ADR-001-crafting-table-world.md).

## Status

Early. The design is decided and the code is being reworked to match it.

- `src/` currently holds a first iteration (gathering, tool tiers, stations) that ADR-001
  replaces. It still builds and its tests pass, but it is not the target design.
- Not built yet: the crafting-table engine, the experiment harness, and the record, distill and
  compare workflow.

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

`.env` holds `NAMS_API_KEY` and `NAMS_SKILLS_KEY`. Keys stay in `.env`; do not paste them into
commands or chat.

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
| `src/sim/` | Simulation core: world schema, engine, planner, world loader, renamer |
| `src/mcp/` | MCP server (`craft`) that exposes a world to an agent |
| `worlds/` | World definitions (JSON); `worlds/generated/` holds re-skinned examples |
| `scripts/` | `make-world.ts` generates a re-skinned world; `smoke.ts` runs the server over stdio |
| `test/` | vitest suites |
| `design/adr/` | Architecture Decision Records and their index |
| `transcripts/` | Notes from the initial NAMS exploration (historical) |
| `.specify/` | Spec Kit configuration, constitution and templates |

Common commands: `pnpm test`, `pnpm typecheck`, `pnpm build`, and
`pnpm dev scripts/make-world.ts --seed 7 --out worlds/generated/example.json`.

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
