# ADRs — Architecture Decision Records

An ADR records the technical **HOW** for one architecturally significant decision: the forces that
make it necessary, the decision itself, the alternatives rejected, and the consequences. ADRs here
are standalone; no parent RFC is needed. An ADR never creates anything under `specs/` itself. That
happens when a `/speckit-specify` call references it.

## Audience

A competent engineer who has just found the project: fluent in agent tooling and graph databases,
but new to this repository. Name each project-specific term on first use (for example, the
*crafting table* is the sim's 2-D grid where items are placed and combined).

Context opens on the technical forces, not on the paperwork. `/adr-create` holds the writing rules;
`/adr-review` checks them.

## Format

Created and updated via `/adr-create`. File: `design/adr/ADR-NNN-short-title.md`, `NNN` zero-padded.

| Front-matter field | Description |
|---|---|
| `id` | `ADR-NNN` |
| `title` | Short descriptive title |
| `status` | `proposed` \| `accepted` \| `rejected` \| `superseded` |
| `created` | ISO date (`YYYY-MM-DD`) |
| `specs` | Speckit feature directories derived from this ADR; maintained by the `speckit-adr-link` hook, do not hand-edit |

Required sections, numbered `##`: 1 Context, 2 Decision (numbered `###` subsections when it has
distinct facets), 3 Alternatives Considered, 4 Consequences, 5 Related. An accepted ADR that is
changed later gains a trailing `## 6. Amendments` section listing each dated change and why.

Use `/adr-review` before moving a draft to `accepted`.

## Glossary

Terms the ADRs use. Each ADR still introduces a term in a clause on first use; this list is for
looking one up. The last column names where the term is decided.

| Term | Meaning | Decided in |
|---|---|---|
| **crafting table** | The task environment: a grid (3x3 in the base world) where the agent places items; `craft` consumes the grid's contents and makes the item whose recipe they match | ADR-001 |
| **world** | A JSON file with the table size, stock, items, recipes and hint level. It holds no goals | ADR-001 |
| **stock** | The limited raw items a world starts with. Only `craft` spends it, so a wrong craft costs something | ADR-001 |
| **shapeless / shaped** | A shapeless recipe needs the right items in any arrangement; a shaped one needs them in the right arrangement | ADR-001 |
| **hint level** | A world setting: `exact` gives no signal for a mismatch, `partial` also says whether adding items could still make a match | ADR-001 |
| **goal** | An item (and quantity) to hold. Goals live in a sibling goals file, not in the world | ADR-001 |
| **best run** | The fewest calls (and crafts) that reach a goal, found by the solver | ADR-001 |
| **slack** | How many wasted crafts a run can absorb and still reach the goal. Zero slack means one wasted craft makes the goal unreachable | ADR-001 |
| **solver** | An exact search over craft orders that proves a goal reachable and gives its best run | ADR-001 |
| **renamer** | The generator tool that replaces item names with invented ones; `--perturb` also nudges recipes | ADR-001 |
| **run** | One agent session on one goal against a fresh game, with its own run folder | ADR-001, ADR-002 |
| **run log** | `run.jsonl`: every tool call of a run, refusals included, with no timestamps. Replaying it gives the score | ADR-001 |
| **trace** | `trace.jsonl`: the time, tokens and cost of a run, measured by the harness | ADR-002 |
| **replay bundle** | An exported run (frames, trace and score) that a static viewer plays back | ADR-002 |
| **harness** | The program that runs Claude Code against a world, scores and measures the run | ADR-002 |
| **action call** | A tool call that changes the world (`place`, `remove`, `clear`, `craft`), as opposed to `help`, `inventory` and `look` | ADR-001 |
| **arm** | One experimental condition: a model with a given kind of help (none, a skill, memory) | ADR-003 |
| **trial** | One run of one arm | ADR-003 |
| **teacher / student** | The stronger model that is recorded and whose runs a skill is distilled from, and the smaller model the skill is meant to help | ADR-003 |
| **gap goal / solved goal** | A goal the student mostly fails (at most 1 of 5 unaided trials), and one it mostly solves (at least 4 of 5). Roles come from measurement, not from the author | ADR-003 |
| **held-out goal** | A goal set aside before any teacher run: the teacher is never recorded on it and no skill is distilled from it. Success on it measures whether a skill transfers | ADR-003 |
| **repair / no harm** | After a skill is installed, the student's success on gap goals, and whether it still succeeds on solved goals | ADR-003 |
| **route** | How the teacher's recordings are chosen: escalating (only the goals the student fails) or preemptive (a wider set chosen in advance) | ADR-003 |
| **transfer** | Succeeding on a goal that the skill was not distilled from. Near transfer: the same recipe shape with different parameters | ADR-003 |
| **calibration** | Unaided trials of each model on every goal, 5 each, to assign goal roles and check that the student has something left to gain | ADR-003 |
| **prior fit** | How far a model's existing knowledge predicts a world's recipes: *invented* (none), *faithful* (a well-known source's vocabulary and recipes, a control), or *perturbed* (faithful with stated deviations) | constitution III, ADR-003 |
| **systematic / idiosyncratic deviation** | In a perturbed world, a rule applied across recipes (a skill can abstract it) versus a change to one recipe (memory can recall it) | ADR-001, ADR-003 |
| **critic** | A separate model that reviews a distilled skill against a rubric before any student sees it | ADR-003 |
| **turn budget** | The cap on the agent's turns in a run | ADR-003 |
| **NAMS** | Neo4j Agent Memory Service: stores conversations, tool calls and extracted entities, and distills skills from them | ADR-003 |
| **notes file** | `<world>.notes.json`: a world's declared prior fit, a note per recipe for a faithful world, and what it leaves out. Read by tests, the generator and the harness, never by the engine or the agent | constitution III, spec 003 |
| **experiment summary** | `runs/<experiment>/summary.json`, fixed before the first teacher or arm trial: route, primary measure, goal roles, arms, trial counts, turn budget, spend limit and the list of steps done by hand | spec 003 |
| **workspace** | An isolated NAMS store. Experiments record to a workspace no development session uses | ADR-003 |
| **hooks / recall** | The `nams-hooks` plugin records a Claude Code session to NAMS; at a session's start it also recalls entities that match the first prompt | ADR-003 |
| **skill** | A folder an agent can load: a `SKILL.md` plus reference files | ADR-003 |
| **distillation** | NAMS deriving a skill from recorded runs. Its grounding score checks that steps trace back to the memory, its coverage score that the recorded work is represented | ADR-003 |

## Index

| ADR | Title | Status | Specs |
|---|---|---|---|
| [ADR-001](ADR-001-crafting-table-world.md) | Grid-based crafting table as the distillation demo world | accepted | specs/001-crafting-table-sim |
| [ADR-002](ADR-002-client-otel-trace.md) | Measure run time and tokens on the client | accepted | specs/002-client-otel-trace |
| [ADR-003](ADR-003-experiment-protocol.md) | Experiment protocol: arms, models, isolation and skill review | accepted | specs/003-faithful-minecraft-world |
| [ADR-004](ADR-004-skillcraft-visualizer.md) | The skillcraft visualizer: a read-only view of a folder of runs | accepted | specs/004-skillcraft-visualizer |
