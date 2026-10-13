# skill-craft project plan

Status: draft, 2026-10-13. A plan, not a decision. The ADRs in `design/adr/` hold the detail; where this plan needs a decision that does not exist yet it names the ADR to write.

## 1. What we are studying

Agents are asked to do the same task again, or a variation of it. Without memory every attempt pays full price for discovery: tool calls, tokens, time and failed attempts. **Skill distillation** turns recorded experience (the model's messages and reasoning, its tool calls and what they returned) into a reusable skill, so a later attempt starts from what an earlier one learned. It is a sample-efficient form of learning from experience, and the question this project asks is an economic one.

> **H1 (cost).** Distilling a skill lowers the later cost of the same task and of its variations (tokens, dollars, time, failed attempts), by more than the distillation itself costs.
> **H2 (parity).** With a distilled skill a weaker, cheaper model reaches the success rate of a stronger one.
> **H3 (side effect).** Both hold with the task prompt unchanged: learning is a side effect of doing the work, not an instruction to the agent.

The framing is an agentic learning loop: do the task, record it, distill, reuse, and optionally review and revise. NAMS (the Neo4j Agent Memory Service) inspired the loop and is one possible distiller; it is not the thing under study. The thing under study is the loop.

## 2. The test mechanism

A simulated crafting table (ADR-001): a grid where items are placed and combined, with shapeless and shaped recipes and limited stock. It represents functional composition, needs discovery (tools never reveal recipes), is deterministic and exactly scorable (a solver gives the best run). A world declares its **prior fit** (ADR-001 and its amendment): *invented* (no prior applies), *perturbed* (familiar names with deviations), or *faithful* (a control that matches what models already know).

Worlds exercise different capacities, and what each world tests should be stated as a hypothesis (`design/notes/world-dial.md`):

| World | Prior fit | What it exercises | Status |
|---|---|---|---|
| `forge-7` goal `glirol` | invented | Order of search over a small space (survey 1: the one move that matters is two of the same base item) | built |
| `woodworking` goal `wooden_stool` | perturbed | A five-craft chain with a shaped final step (survey 2: parts are found, the final shape is the stall) | built |
| `forge-7` goals `vriobeno`, `pluzhouvio` | invented | Longer, deeper search (0/20 unaided on `vriobeno`) | built, not yet used well |
| `minecraft-inspired` | faithful | Recall of priors; no skill gap on this runtime | built (control) |
| one-step goal family | invented | Search order across a family of goals, so a skill can state a rule that covers several | designed, not built |
| shared-intermediates world (robot assembly or food) | invented | Reuse of intermediates across goals; catalogs and chains; partial skills | designed, not built |

## 3. The cast

An experiment names a **cast** (ADR-003, amended): a teacher (produces recordings), a distiller, and a student (uses the skill), each a model with settings; one model may fill several roles. The survey nominated three tiers (`runs/reports/2026-10-13-s4-skill-bakeoff.md`):

- **Weak:** `nemotron-3-ultra-nvfp4` (0/5 unaided on both tasks; 5/5 with a skill).
- **Strong:** `glm-5p3-flash` (5/5 on `glirol`, 4/5 on woodworking, cents per run; competent as critic and reviser).
- **Frontier:** `claude-fable-5-1` (tidiest on woodworking; the teacher for the first skill; expensive).

Any tier can run unaided, distill, or use a skill. `claude-haiku-5-5` is the cheap alternative weak model.

## 4. What exists

- **Simulation and tooling** (ADR-001, specs 001, 003): engine, MCP server, solver, world validation, re-skinner, a faithful world.
- **Measurement** (ADR-002, spec 002): client-side time, tokens and cost per run, replay bundles.
- **Runtime** (ADR-006, spec 007): the AI SDK drives players and review roles with Anthropic and Fireworks models; operational limits (step and tool timeouts, token and dollar caps, retry policy, fixed failure codes); cost recorded from the provider, a pin or an OpenRouter market quote, else null; recording of the model's per-turn messages and reasoning.
- **Critic loop** (ADR-003 §2.6, spec 005): up to three rounds of a critic and a reviser over a candidate skill, with a provenance record (`loop.json`, process version, distiller service version).
- **Visualizer and art** (ADR-004, ADR-005, specs 004, 006): read-only view of a folder of runs.
- **Surveys** (`runs/reports/`): nine models on two tasks, a search-strategy and a stage classifier, a first skill bake-off.

## 5. What we have learned

1. On `glirol` the outcome is decided by search order, not reasoning: all 24 hits tried two `lugli` side by side and none of the 11 misses did. A good skill states a search rule, not only a recipe.
2. On woodworking all nine models find the parts; 12 of 21 misses held every part and never found the final shape.
3. No model is reliable on both tasks unaided, so the weak tier has real room for a skill to help.
4. A skill distilled from three Fable runs (NAMS, refined by glm) took Haiku and Nemotron from 0/5 to 5/5, loaded in 10 of 10 runs, cutting cost per run 3 to 5 times.
5. The Claude models count tool calls as turns and stop early, so the "80 turns" prompt is ambiguous and their misses are not like-for-like.
6. A reworded base prompt moved a baseline from 0/5 to 4/5 earlier; the prompt is an open decision that blocks any cross-arm comparison.

## 6. What is not yet known

- Whether a skill **transfers**: every test so far reused the goal the skill came from, with a recipe card as the skill.
- Whether the cost of distilling and reviewing pays back, and after how many reuses (an illustration: a skill-using Nemotron run costs about $0.04 per success against $0.29 for Fable alone; the review loop cost $0.056 plus NAMS and the teacher's runs, so break-even looks like a handful of reuses, but the NAMS cost and the teacher's share are not yet accounted).
- Whether the distiller matters: NAMS, a bespoke prompt, or review rounds.
- Whether decomposing experience into several skills beats one, and what happens when only some are available.

## 7. A family of distillation harnesses

Today there is one path (NAMS generates, the critic and reviser refine). The study needs several implementations behind one seam, run on the same recordings, so the distiller is a variable and not an assumption.

**The seam.** A distiller takes recorded procedural memory (the model's messages and reasoning, tool calls and their outputs) read through a *source*, either the NAMS API or the local run folder, and returns zero or more skills with provenance. It never receives solver output, scores or labels of which calls were needed (the oracle judges, never helps).

| Distiller | What it is | Status |
|---|---|---|
| **D1: NAMS one-shot** | Record to a managed workspace, generate once, download | built (the candidate step) |
| **D2: bespoke one-shot** | One model reads the recordings through the source seam and writes a skill; no service | not built |
| **D3: distill then review** | D1 or D2 followed by the critic and reviser loop | built over D1 |
| **D4: decomposition** | Recordings to lessons (facts, chains, rules, cautions, strategies) with evidence, then packaged into several skills | designed (`multi-skill-distillation.md`), not built |

D1 and D2 on identical recordings isolate whether the service adds anything; D3 against its base isolates what review adds; D4 against D2 isolates decomposition. Each variant carries a process version and records what it used.

**Partial availability.** A library of several skills makes availability a factor: a student gets none, a random subset, a drop-one ablation, or all. That tests whether skills compose, whether a missing skill degrades gracefully, how much loading costs (descriptions, the skill-load rate) and what a catalog skill is worth when the goal is not in it.

## 8. Experiment design

An experiment fixes a world, a cast, a prompt and goals, and varies one factor.

- **Task relations** (the "not unique" assumption): *exact repeat*, *variation* (a changed quantity, a re-skinned world, a perturbed layout), and *new but related* (another goal sharing intermediates). A held-out goal is never in any recording.
- **Arms:** unaided baseline; with the skill from each distiller; partial-availability arms; memory-free control.
- **Measures:** success, calls to goal and extra calls, wasted crafts, tokens, dollars (provider, pin or market quote, else null), time, and skill-load rate. The headline is **cost to the first success** and **break-even reuse count**: distillation cost (recording, generation, review, roles) divided by the saving per later run.
- **Trials:** five per cell is a screen; a claim needs more cells and a seed policy, and results state how many runs were unpriced.
- **Isolation** (ADR-003 §2.4): a fresh managed workspace per experiment, hooks off, nothing from development sessions in recall.

## 9. Roadmap

| Phase | Goal | Exit criterion |
|---|---|---|
| **0. Settle the prompt** | Decide and freeze the base prompt (turns defined as model steps or as calls; the earlier reworded-prompt finding) and recalibrate the three tiers | One prompt, a recorded baseline per tier on every world used |
| **1. Distiller seam** | A source seam over the NAMS API and the local run folder; D2 as a second implementation; D1 and D2 on identical recordings | The same recordings yield a skill from each, with provenance, behind one interface |
| **2. Transfer worlds** | Build the one-step goal family and the shared-intermediates world; add a variation of woodworking | At least three tasks per world with a declared prior fit, each proven solvable |
| **3. Experiment runner** | Run an arm matrix (world, cast, distiller, goals) end to end, with a managed workspace per experiment | A single command produces the arms table with cost to first success and break-even |
| **4. First comparison** | D1, D2 and D3 on the same recordings, across exact repeat, variation and related goals, with the three tiers | A results table that answers H1 and H2 with stated caveats |
| **5. Decomposition and partial skills** | D4, a multi-skill library with load-by-name, partial-availability arms | A result on whether several skills beat one and what a missing skill costs |
| **6. Escalation and write-up** | Frontier-as-teacher and escalation policy; the findings brief for the memory service team | A report and a recommendation |

## 10. Decisions still to record

| ADR | Question | Blocks |
|---|---|---|
| New: base prompt | What does "turns" mean to the agent, and does the prompt stay fixed across arms | Phase 0 |
| New: distiller seam and harness family | The source seam, the interface, which variants exist, process versioning | Phase 1 |
| Amend ADR-003 | Cast tiers, unit of distillation (one skill or several), held-out design | Phases 4, 5 |
| New: experiment runner | Arms matrix, task relations, break-even metric, trial policy | Phase 3 |
| New: skill library and loading | Listing, loading by name, partial availability, recording skills offered and loaded | Phase 5 |
| Amend ADR-001 or new | The world dial and the new worlds' hypotheses | Phase 2 |

## 11. Risks

- **A skill that is a recipe card proves nothing about learning.** Transfer tests (Phase 4) are what make the claim; until then results read as instruction-following.
- **Search-order effects with five trials** can look like skill effects; use matched comparisons only as diagnostics and enough trials for claims.
- **Cost bookkeeping is partial:** NAMS charges and the teacher's runs are not yet attributed, so a break-even number would be optimistic.
- **Provider drift:** model lists, prices and backends change; every record carries the quote and the service version, and the surveys are dated.
- **Leakage:** held-out goals and oracle labels must stay out of every recording; the loop's input tests and the privacy test enforce it.
