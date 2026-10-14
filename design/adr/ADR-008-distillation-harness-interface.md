---
id: ADR-008
title: The distillation harness: record finished runs, produce a set of skills on demand
status: proposed
created: 2026-10-14
specs: []
---

# ADR-008: The distillation harness: record finished runs, produce a set of skills on demand

## 1. Context

A *distillation harness* is everything between a recorded run (a model's messages and reasoning, its tool calls and what they returned) and a skill an agent can load. It is several steps, and systems differ in which steps they have. The Neo4j Agent Memory Service (NAMS) takes a recording into a workspace, extracts a graph and generates a skill from it. A critic and reviser model can then review and edit that skill over up to three rounds. Another system, such as Cognee (an open-source memory engine), would ingest runs into its own store and produce skills in its own way.

The project has one such pipeline and hardwires it. `scripts/critic-loop.ts` calls `obtainCandidate` (create a managed workspace, record, generate, download, delete) and then `runLoop` (critic and reviser rounds). `loop.json` records the distiller as a NAMS-only `DistillerService`, the report's loop check reads that shape, and the experiment cast names "the memory service, with the critic and reviser as its review stage". The review rounds are one harness's internal way of improving a skill, not a stage of the experiment.

The harness is a variable that moves results, and nothing in the code can vary it.

- **What it writes changes with what it is given.** Three Haiku runs on the faithful `stone_pickaxe` goal were recorded to NAMS twice, with placeholder steps and with each turn's reasoning. The first skill was the generic exploration routine (help, look, inventory, place, craft); the second stated the recipe. The service's output varies between calls, so one pair shows a difference and not a cause (`design/notes/distillation-with-reasoning.md`).
- **What it writes decides what a student can do.** A skill NAMS distilled from three Fable runs on `wooden_stool` and the critic loop refined was a recipe card, and it took `claude-haiku-5-5` and `nemotron-3-ultra-nvfp4` from 0 of 5 to 5 of 5 (`runs/reports/2026-10-13-s4-skill-bakeoff.md`). On `glirol` the winning move is one search rule (try two of the same base item before mixing), and every run that missed never tried it (`runs/reports/2026-10-13-s1-glirol-search-strategy.md`). Whether a harness states a rule or only a recipe is the difference between a skill that transfers and one that does not.
- **A run teaches more than one thing.** A search finds a catalog of recipes, chains between them and sometimes a rule across them (`design/notes/multi-skill-distillation.md`). A harness may therefore produce one skill or several.
- **Harnesses keep state and have their own ingest.** NAMS and Cognee each hold what they are given in their own store and produce skills on request. A contract that is to work for them cannot assume a particular store, a particular language, or that a harness produces its skills in one call from a pile of runs.

The pieces a harness needs on this side already exist: `replayRun` in `src/loop/transcript.ts` turns a run folder into a `Recording`; `RoleDriver` runs a tool-less model call with a structured answer; the prompt scheme (`prompts/<kind>/v<N>`) versions a harness's instructions. One rule binds every harness. A recording holds only what the model and the world produced: no score, solver path, extra-call count, goal role or label of which calls were needed, because those exist to judge an agent and a memory that carried them would hold hints the agent never had.

## 2. Decision

### 2.1 A harness is a session over finished runs

A harness is named, and `open(experimentId)` gives a *session*: that experiment's isolated store, identified by an experiment id string. A session has four operations. `scripts/distill.ts` opens and closes one session per invocation; a session that lives longer, with `distill` called repeatedly, is a use of the library.

| Operation | Meaning |
|---|---|
| `record(run)` | Take in one finished run (2.2). Idempotent by the run's id. Only finished runs; there is no streaming of steps |
| `distill(request)` | Produce a skill set (2.2) from the runs named by `request.runIds`, which must be recorded and non-empty. May be called many times in a session with different sets of ids, each independent. The request may carry a spend limit and a hint of how many skills are wanted, which a harness may ignore. It returns a skill set or a refusal (below) |
| `describe()` | The harness's provenance record (2.4) |
| `close()` | Release everything the session created, whatever happened, including cancellation. A harness never touches state it did not create |

`distill` returns either a skill set or a refusal with a fixed code (`no_skill`, `spend_limit`, `cancelled` or `failed`) and the spend so far; it never returns an empty set. A refusal is a recorded result, as a role call's failure is, and ends no experiment by itself: the experiment reports that distillation did not yield a skill set.

A harness never chooses which runs to learn from. The experiment names them by id, so which runs count as experience, and the rule that no run on a held-out goal (a goal set aside so that no skill is distilled from it, ADR-003) is ever recorded, stay with the caller. A run record holds the model's text and reasoning. A harness that sends run records off the machine says so in `describe()` and runs only with an explicit operator option, as `nams-reviewed` does with `--allow-workspace`, and never touches a store it did not create.

The interface is a TypeScript type in `src/distill/` with an `AbortSignal` on each operation; harnesses are selected by name from a table of constructors, as providers are from the provider table.

### 2.2 Two data contracts, as JSON Schema

The contract is two data shapes, committed as versioned JSON Schema files (`schemas/run-record.v1.json`, `schemas/skill-set.v1.json`) and generated from the zod definitions the TypeScript types derive from; a test fails when a committed file differs from the generated one. The schema library is an implementation choice and the JSON files are the contract. A breaking change is a new file, never an edit.

**Run record** (what `record` receives): an `id` unique within the session; the task's `prompt` text; the models that ran (as requested and as answered) and their pinned settings; the model's turns in order, each with its text, the reasoning the provider returned for it (absent when it returned none) and its calls; a `reasoning` field saying whether the run's turns returned all, some or none; and the final answer. A call has its id, tool name, arguments, status (`ok` or `failed`), the output text the agent saw (regenerated by replay) and, for a failure, the world's refusal. It has no score, no reached flag, no solver path, no extra-call count, no goal role, no label of which calls were needed, no world or goals file, and no timing.

**Skill set** (what `distill` returns): a non-empty list of skills. A list of one is an ordinary result and a harness is never required to produce more. A skill has a `name`, a `description`, its files (relative path to UTF-8 text, a `SKILL.md` with front matter plus optional references, within the existing size limits), optional `tags` and optional `evidence` (the run ids and call numbers it was derived from). Written to disk, a skill set is one root folder with a subfolder for each skill, in the layout of a `.claude/skills/` directory, so the root can later be given to a run as a whole; each skill folder installs as it is, and the tags and evidence go in a sidecar `skill-set.json` beside the subfolders, never inside one.

### 2.3 What a harness may do inside, and review is its own matter

Nothing about a harness's internals is fixed. It may keep a graph, run model calls, or review and revise its own output. Its spend and stages are reported through `describe()`. The existing critic and reviser, up to three rounds, are one harness's way of improving a skill; they are not part of the interface and no wrapper for reuse is provided.

The experiment protocol does not require a skill to be reviewed before a student receives it. Distillation is one step of an experiment: recorded runs go in, a skill set comes out, and what a harness does between is its own. A harness that reviews says so in `describe()` (the rounds and the verdicts); the report prints it and does not refuse an arm for lacking it. ADR-003's review gate is dropped for that reason, and its section on the critic loop is reduced to a pointer to the harness that now holds it.

### 2.4 Provenance

`describe()` returns a record with the harness's `name`, its process version, the models and pinned settings it used for each role it has, the versions and fingerprints of any prompts (ADR-007), the version and build commit of any external service, its stages with duration, tokens and cost (null, never zero, when unpriced), and anything else the harness considers part of how its skills were made. It holds hashes, settings and identifiers, never recorded text, and it is written to the record file of the distillation (today's `loop.json`), with each recorded run named by its run-log and score hashes as today. Each harness owns a process version and a changelog entry for each change to what it records, what it asks of a model, or how many rounds it runs, as the single process version does now. A record made before this change is read as the harness `nams-reviewed`.

### 2.5 The first harnesses

All in-process TypeScript, and each produces its skills from recorded runs: a skill someone wrote by hand is not a harness's output, and a student installs one with `--skill <folder>` without any harness.

- **`nams-reviewed`:** the present pipeline as one harness. `record` records a run to a managed workspace the session created; `distill` generates one skill from the named runs through NAMS and runs the critic and reviser over it, returning a skill set of one; `close` deletes the workspace. It keeps the workspace guard (never a workspace it did not create, never `NAMS_WORKSPACE_ID`) and the `--allow-workspace` requirement. NAMS is not asked to produce more skills than it does.
- **`bespoke-one-shot`:** a reference implementation with no external service. `record` keeps the run; `distill` makes one tool-less `RoleDriver` call whose prompt is built from named parts only (a new `distiller` prompt kind, the fifth under ADR-007, versioned like the others and pinnable in an experiment's prompt set; the task's prompt and the recordings rendered as text) and whose structured answer becomes one skill. Its instructions ask for what the recordings support and nothing else, with citations to run and call.

`scripts/distill.ts --harness <name> --runs <run folders>...` replaces `scripts/critic-loop.ts`: it builds a run record from each folder, records them, distills over all of them and writes the skill set, the sidecar and the provenance record. The output folder's name and layout are a spec matter, and earlier `loops/` records stay readable. A student installs one skill folder with `--skill <folder>` as before; how a student receives a whole root of skills, and any subset of it, is a separate decision.

### 2.6 The cast

An experiment's `cast` has `harness: { name, roles: { <role>: { model, settings } } }` where it names the distiller today, a role being whatever model call the harness makes (a critic, a reviser, a distiller). The report checks the harness's provenance against the cast as it checks the critic and reviser now: the name and each role's requested and answering model and settings. A model may fill a harness's roles and the teacher or student role, which is self-improvement; the report states which roles share a model. An older cast with `distiller` is read as `nams-reviewed`.

## 3. Alternatives Considered

- **A single function from recordings to one skill.** Rejected: it has no place for a harness's state or its ingest, makes the review rounds a stage outside it, and cannot return several skills. The systems that would plug in keep state and ingest runs separately from asking for skills.
- **Stateless `distill(runs[])` with the whole runs in each call.** Rejected: recording has its own cost in NAMS, and several different sets of skills from one recording is a normal use.
- **The harness selects its own runs from everything recorded.** Rejected: that moves the held-out boundary inside the harness. Explicit run ids keep it with the experiment.
- **Tags or a query language on runs.** Rejected: a tag could carry an oracle label, and a query language is a decision about every harness's store.
- **A subprocess protocol now.** Deferred: the JSON schemas are the language-neutral contract, and a stdin and stdout adapter over them is added when a harness in another language needs it.
- **Record steps as they happen.** Rejected for now: a finished run folder is what exists, replay regenerates the outputs, and a streaming operation can be added when a harness needs it.
- **Leave `critic-loop.ts` as it is and add a second command beside it.** Rejected: provenance, the cast and the report's check would each fork on the same condition, and a third harness would fork them again.
- **Reusable critic and reviser middleware any harness wraps.** Rejected for now: the loop is small, and each harness that wants review writes its own.
- **Require a harness to return several skills.** Rejected: a skill set of one is valid, and a harness that returns one should not have to invent more.

## 4. Consequences

- The experiment protocol shrinks: ADR-003's review gate goes, and the report no longer refuses a skill arm whose review verdict is not `accept`, so `review.json` stops being required. What a harness did to its skill is read from its provenance instead.
- The candidate step, the critic loop, `critic-loop.ts` (including its `--candidate` mode, which has no counterpart because no skill is supplied), the loop record, the report's loop check and the cast schema change to this shape. The record change is additive for old records, which read as `nams-reviewed`.
- The size limit on recordings (`LIMITS.recordingsChars`, 150,000 characters) belongs to the harnesses that pass recordings to a model, and no longer to the contract.
- Someone integrating another system implements the TypeScript interface, and the JSON schemas are what they build against; a non-TypeScript integration waits for the subprocess adapter.
- `record` and `distill` are separate costs, so a comparison of harnesses on identical runs reports both per harness. A harness's output varies between calls, so a comparison uses several generations per harness before it reads a difference.
- A model that is both a harness's reviser and the student, or both its critic and its distiller, may reinforce its own mistakes. The cast allows it and the report says so.
- The evaluation of a skill set against the world (precision, coverage, whether a rule holds on unseen recipes) uses the oracle and stays outside every harness.
- Follow-up: a feature spec; the interface, the schemas and the two harnesses with a scripted role and a scripted service in tests (a scripted harness is a test double, not a product one); the first comparison of `nams-reviewed` and `bespoke-one-shot` on Fable's `wooden_stool` recordings; amendments to ADR-003 on acceptance that reduce its scope: §2.6 (the critic loop) becomes a pointer to the `nams-reviewed` harness, the cast and the distiller's input in §2.1 and §2.4 to §2.5 become "a harness (ADR-008) fed the runs the experiment names", and the earlier amendment bullet "Not decided here: harness-based distillation" is marked resolved; a decision for a bespoke harness that produces several skills; and a decision for how a student loads and partially receives a set of skills.

## 5. Related

- Related ADRs: ADR-003 (§2.1 cast, §2.4 what a recording holds and the no-oracle rule, §2.6 the review loop and its amendments, including the process record; this ADR reduces its scope and drops the review gate), ADR-006 (the runtime roles run on), ADR-007 (the prompt scheme a harness's instructions join).
- Evidence and notes: `design/notes/multi-skill-distillation.md`, `design/notes/distillation-with-reasoning.md`, `design/notes/skill-process.md`, `design/notes/critic-loop-findings.md`, `runs/reports/2026-10-13-s4-skill-bakeoff.md`, `runs/reports/2026-10-13-s1-glirol-search-strategy.md`, `design/project-plan.md` §7.
- Specs: _(populated automatically by the speckit ADR-link hook once `/speckit-specify` references this ADR)_
