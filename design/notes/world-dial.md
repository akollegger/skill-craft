# The world dial: choosing worlds for the hypothesis

Status: exploratory, 2026-10-13, revised the same day around the top-level hypothesis. A note, not a decision, apart from the one recorded under "Decided". It may become an amendment to ADR-003 (what a world set is for, hypotheses declared before calibration) and the first worlds beyond ADR-001's three prior fits. Nothing here is built.

## The hypothesis the worlds serve

Skill distillation lowers the cost of later work, in tokens, price and time, and can let a weaker model reach parity with a stronger one. A world is useful to that hypothesis to the extent that it provides three things:

1. **A task where the stronger model beats the weaker one for a reason a recording can repair.** If the stronger model's advantage is recall or procedure, a teacher's successful run carries it. If the advantage is raw search or persistence, a recording of a lucky search carries only the answer it found.
2. **Tasks that recur or share substructure.** A skill saves cost only on later work. A skill used once moves cost to earlier.
3. **A comparison in cost per success,** counting what the skill cost to make.

## What the calibration says so far

On the current runtime no world we have measured shows a strong-over-weak gap that a skill could close:

- **Faithful:** Haiku solves stone about 80% of the time and iron about 70%. The Claude Code era gap is gone.
- **Invented `glirol` (one craft):** `gpt-oss-120b` solves it 4 of 5 and `glm-5p3` 5 of 5.
- **Invented `vriobeno` (two crafts):** none of four models reached it (0 of 20), Sonnet included, and Sonnet stopped with turns unused, saying it had no promising combination left.

In an invented world a stronger model's edge is search discipline, which a recording of one search does not hand over, and a recipe skill helps only the goal it was recorded on. That is why the world set should be chosen by where the stronger model's advantage comes from, not by how strange the vocabulary is.

## What a world is

The engine's table is a function of up to nine placed items that produces nothing or one output (ADR-001). A craft consumes what is on the table, stock is limited, a refusal states the constraint and never the fix, and the engine knows nothing about any world: a world is data. Any workflow with inputs and outputs can be written as such a function and composed. Two properties of the function matter for what a world asks of a model:

- **Whether position carries meaning.** A shapeless recipe is a set (item selection only). A shaped recipe is ordered (item selection plus layout).
- **What the items are.** They can be things, or actions, or both. An action placed with data items, like `ID + verify => verified-ID`, is the same shape as `lugli + lugli => glirol`. An action that is itself crafted and then used as the operator of a later craft is a closure, which makes choosing the right combining operator for a fold (a row of items plus an operator) part of the reasoning.

No mechanic is added, so ADR-001 stands.

## What decides whether a skill can help

The source of a stronger model's advantage, in order of how well a recording can carry it:

| Source of the advantage | Carried by a skill? | Where it shows |
|---|---|---|
| **Knowledge** (recalling a recipe, a domain fact) | Yes, as facts | faithful, a known domain |
| **Procedure** (the right steps in the right order, preconditions, operators) | Yes, as a checklist | workflow worlds |
| **Strategy** (how to search: which combinations to try, systematic coverage, when to stop) | Only as a strategy lesson, which transfers across goals and worlds where a recipe does not | invented worlds |
| **Reasoning depth** (inference over several steps) | Weakly | long chains with real structure |

A world is worth building when its gap is of a kind in the first rows, or when a strategy lesson can be shown to carry across goals.

## Recurrence and shared modules

Cost falls across tasks only if later tasks reuse something. The world family worth building has a portfolio of goals over one graph, where later goals reuse earlier intermediates, as in robot assembly (a servo module or a sensor pack used by several robots) or food (a stock, a dough or a sauce used by several dishes). Cost of task *k* given the skills from the tasks before it is a learning curve, and it is the self-improvement framing of the project. A catalog or a lessons store is where reusable modules would live (`multi-skill-distillation.md`). Reuse needs only two or three levels of intermediates, not long chains. A graph with explicit intermediates is a different world from the same function built in one flat composition, which is a comparison in its own right (below).

## The dial

A description of where a world sits, which is a way of setting the source of the advantage and not a goal in itself. Two axes, and the cells they make:

| | Terms invented | Terms common | Terms structural |
|---|---|---|---|
| **Construction arbitrary** | invented world: obvious search | nonsensical world: deceptive search | |
| **Construction known** | renamed faithful: alien names on a known structure | faithful, perturbed | shape world: compositional |

Secondary settings: arity and whether layout matters; whether actions are items; depth and branching; stock slack; whether goals share intermediates. A real-domain world (a workflow, a robot assembly, food) moves both axes to the end where terms and construction are both true to the domain, which is where knowledge and procedure advantages live.

## What is measured

For each pair of a weaker and a stronger model on a world:

- **Cost per success,** unaided and with a skill, in tokens, price and time. Price carries its source (a provider-reported cost, a pin, or a market quote), and runs costed from different sources are not summed as one figure.
- **Parity:** a weaker model with a skill reaches the stronger model's unaided success rate, and its cost per success is at or below the stronger model's.
- **The cost of making the skill:** the teacher runs, the distillation, and the review, in the same units.
- **Break-even:** the number of later tasks after which the saving has repaid the cost of the skill.
- **Across a portfolio,** the learning curve: cost of task *k* given the skills from earlier tasks.
- **Search behaviour,** from the run log alone: distinct arrangements tried, repeated arrangements, stock burned, how much of the item space was covered. These are metrics for judging a run, never for an agent or a memory, in the same way the solver is.

## Hypothesis template

For each world, written before its calibration (ADR-003 declares the primary measure before the first trial; hypotheses join it):

1. the source of a stronger model's advantage here (knowledge, procedure, strategy, depth), and whether a recording can carry it;
2. the reasoning the world requires, and the dominant failure;
3. what is distillable from it: a fact, a chain, a rule, a warning or a strategy (the lesson kinds of `multi-skill-distillation.md`);
4. the calibration signature expected for each pair of models;
5. whether goals share intermediates, and the expected learning curve;
6. which held-out goal shows a skill's effect: covered by a catalog entry, reachable only through a generalization, or neither;
7. the expected cost per success unaided and with a skill, and the break-even;
8. the confound to control, and if the world is part of a matched comparison, what is held fixed.

## The worlds

**Workflow (loan application, robot assembly, food).** The closest to the hypothesis.
Advantage: procedure and knowledge. A strong model knows the process and a weak one does not. Reasoning: backward chaining from the goal through preconditions, ordering, constraint satisfaction on categories, and choosing the right operator. Failure: skipping a prerequisite, or building a plausible output that does not satisfy a constraint. Distillable: a procedure or checklist, the most natural skill shape and the one closest to real agent use. Recurrence is natural: the same process runs again with different inputs. A prior-heavy workflow (a standard loan process) is the faithful analogue, and a policy that deviates from the standard one is its perturbed analogue. Confounds: contamination from the real domain, and leakage from a refusal that names the missing step.

**Shared intermediates (robot assembly, food).**
Several goals each need some of the same intermediates. In robot assembly, a drive module, a sensor pack and a frame are built once and go into a rover, an arm and a walker. In food, a stock, a dough and a sauce are made once and go into several dishes. Advantage: knowing which intermediates are worth making and what each contributes. Reasoning: planning across two or three levels, where one intermediate serves more than one goal. Failure: building a goal's intermediates again for each goal, or building one that no goal needs. Distillable: the modules and their order, as chains and rules, the catalog of the multi-skill note. This is where a learning curve shows: the first goal pays for the intermediates, and later goals reuse them. Two or three levels are likely within the current solver; deeper graphs wait on the recipe-graph solver.

**Shape (`3 horizontal dots => horizontal line`; `vertical line + horizontal line => plus`).**
Advantage: finding a generating rule. Reasoning: abstraction and composition across orientation and scale. Failure: bookkeeping about space on a grid described in text, not logic. Distillable: a rule, the most generalizable kind. A skill that states the rule should solve held-out compounds that a catalog cannot. Confound: spatial encoding, so the world needs a spatial-bookkeeping check of its own.

**Invented (`lugli + lugli => glirol`).**
Advantage: strategy only. Reasoning: enumeration and bookkeeping. Failure: unsystematic search, or stopping early. Distillable: facts, and strategy lessons. Signature: a one-craft goal is solved (`glirol`: `gpt-oss-120b` 4 of 5, `glm-5p3` 5 of 5) and a goal several steps deep is not (`vriobeno`: 0 of 20). A recipe skill helps only its own goal, so this world serves the hypothesis only if a strategy lesson transfers across goals. Confound: depth and branching set the difficulty.

**Nonsensical (`chocolate + diamonds => pretzel`).**
Advantage: setting a misleading prior aside. Failure: anchoring on combinations the names suggest, and misreading refusals. Distillable: facts, and a warning that a name does not predict a recipe. Signature: a strong-prior model does *worse* here than in an invented world on the same recipe graph. Relevant to the hypothesis mainly as the case where a skill must override a prior, and as a diagnostic.

**Renamed faithful (invented names on the faithful structure).**
Advantage: analogical mapping. The earlier counterpart world was reached in 0 of 30 trials by both Claude models, against 24 of 30 in the faithful world (ADR-003 amendment), because shaped five-cell recipes are out of reach by brute force. A simpler structure is needed for a fair test.

**Faithful and perturbed** keep their roles from ADR-003: recall as the control, and recall against a deviating rule.

## A one-step goal family: separating search strategy from reasoning (proposal)

**The question.** Is what decides success in an invented world the model's search policy (which combinations it tries, how systematically, when it stops) or its depth of inference? A one-step recipe has no chain to infer, so any difference in success between goals, models and runs is a difference in search coverage. The family is also the one setting where something transfers in an invented vocabulary: not a recipe, which helps only its own goal, but a strategy lesson.

**The family.** One-step goals over one set of starting items, each a fresh invented target, differing only in what the recipe's input looks like. `glirol` is the first member: two of the same item, side by side in the top row (a shaped recipe, from the pilot's skill). `vriobeno`, a two-craft goal that no model reached (0 of 20), stays in the goal set as a labelled depth probe and is not replaced.

| Goal | Input | What it needs from a search |
|---|---|---|
| same-item pair (`glirol`) | two of one item, shaped | try doubles; try layouts |
| distinct pair, shapeless | two different items, any arrangement | try pairs of different items; no layout search |
| distinct pair, shaped | two different items, adjacent in a fixed layout | pairs and layouts |
| triple | two of one item and one of another | combine doubles with a third |

The starting items seen in the invented runs' final messages are `lugli`, `doudrur`, `tepitil` and `thegen`, so a distinct pair has six unordered candidates and the whole space is small enough to enumerate. A goal that every model finds quickly is not diagnostic, in which case more item types are added until it is.

**What is varied and what is held fixed.** The intervention is on the world and not on the prompt, which stays the fixed base prompt. Held fixed: the tools, the prompt, the starting stock, and the budget. Varied: the goal's input class. A second variation uses the same graph with the starting items listed in a different order (an isomorphism on presentation order, in the sense of the matched comparisons below): a strategy that follows the listing order would then succeed on one ordering and fail on another, which separates strategy from luck of presentation. Whether `glirol` was found by good strategy or by order is not known.

**Measuring strategy without changing the prompt.** From each run's log alone, the harness classifies the search: which input classes were tried and when (singles, same-item pairs, distinct pairs, triples), whether arrangements were repeated, how much of the space was covered before stopping, and the stop rule (a model that stops with turns unused, as Sonnet did on `vriobeno`). These are judge-side metrics, never given to an agent or a memory.

**Hypotheses, declared before calibration.**

- **H1.** A run's success on a one-step goal is explained by whether its search covered that goal's input class, not by which model it was.
- **H2.** Stronger and weaker models differ little in the search classes they use on one-step goals. If so, there is no capability gap for a skill to close here, and the family measures strategy and not parity.
- **H3 (the distillation test).** A strategy lesson distilled from successful runs on one input class raises a weaker model's *coverage* on another class it has not seen: transfer across goals in an invented world.
- **H4 (the control).** A recipe skill from one goal gives no lift on another.

**What would falsify it.** If success follows model size more than coverage, the advantage is capability and not strategy. If every model covers every class quickly, the family is too easy. If a strategy lesson does not transfer (H3), skills in an invented world are recipes and nothing more, which would end the invented world's claim on the hypothesis.

**Where it is built.** As world data: a new generated world (not an edit to `forge-7`) with the family's recipes, and a goals file, each goal proven solvable by the solver with its stock slack. No engine change. Cost is low: one-step goals with small search spaces run in cents on the Fireworks models.

## Workflow worlds in the engine

- **Things and actions are items.** Documents and derived artifacts are things; `verify`, `underwrite`, `approve` and `merge` are actions placed beside the things they act on.
- **A decision is a lookup recipe.** Numbers are discretized into categories (`income-high`, `debt-low`) and a decision table is a recipe over them. An incomplete or invalid combination is a refusal, which is the function's "nothing".
- **A fold** is a row of items plus a combining action. The grid's nine cells bound the arity, so a larger process is built from intermediate items, which is how people chunk it.
- **Order-free inputs** use shapeless recipes and add no layout search. Ordered operations use shaped ones.
- **Refusals** follow the discovery-over-disclosure rule, so a message states a constraint and does not name the missing step. In a world with real vocabulary this needs care per world, and the leak test would need to cover it.

## Decided

**Actions are consumable tokens with stock** (2026-10-13). Placing an action on the table and crafting spends it, like any other item, so the stock of an action is a budget of operations. This needs no engine change, and ADR-001's removal of catalysts and tool tiers stands. A world's author sets each action's stock to cover the solving path plus some slack, and the solver's stock-slack figure checks it, as it does for crafts.

## Matched comparisons, as diagnostics

A comparison between worlds should vary one thing, and these are optional tools, not the first round. They matter only if a question about a skill and a prior arises (a skill ignored when it contradicts what a model believes), or if modularity is the question.

| Comparison | Held fixed | Varied | Isolates |
|---|---|---|---|
| **Isomorphic** | the recipe graph (items, recipes with layout and output quantity, stock, goals, solver-optimal calls) | labels only, as a one-to-one renaming | what the prior contributes |
| **Refactored** (same function, different decomposition) | inputs, output, vocabulary | internal structure: a flat composition against explicit intermediate modules (a robot built straight from parts, against one built from a named drive module and sensor pack; a dish built from raw ingredients, against one built from a named stock and sauce) | modularity and chunking |
| **Depth family** | vocabulary and style | chain length | the effect of depth |

Isomorphism is a property of the worlds being compared and does not limit the world set: different families can have any graph, depth and decomposition. For an isomorphic comparison the vocabularies are invented names, everyday names assigned with a deliberately mismatched mapping, and structural or true names; a name's length, tokenization and semantic associations are not held fixed and cannot be, and the prompt text that mentions names changes with them. The renamer already renames a world's items.

## Risks

- **A gap that is not repairable.** A world can show a strong model beating a weak one for a reason a recording cannot carry (search discipline, persistence). The template's first field exists to catch this before calibration.
- **Long chains stress the tooling.** The constitution requires every committed world to be proven solvable by a test. The solver today is a state search, and it handled a goal of 22 calls. A chain of hundreds of crafts needs a solver that plans over the recipe graph, using each craft's determinism, or the best-run figure cannot be produced. Turn budgets (80 today) and the cost of a run scale with depth, and stock slack must cover a longer solving path plus exploration.
- **Contamination.** A well-known domain may be in training data, so a high score can be recall. This is why the perturbed analogue is part of each real-domain world.
- **Cost is an estimate.** A figure from a market quote is not what a host charged, and runs costed from different sources are not one comparable figure. Parity and break-even are stated with their cost source, and in tokens and time as well.
- **Text-encoded space.** A grid shown in text is a weak input for spatial reasoning, and a failure there says little about composition.
- **Construct validity.** A hypothesis about reasoning is tested only through behaviour, so each hypothesis needs an observable prediction written down first.

## A possible order

0. **Free: classify the search in runs that exist.** The invented-world calibration runs and the Sonnet `vriobeno` runs are on disk. Classify each run's search from its log (singles, same-item pairs, distinct pairs, coverage, stop rule) and see how much strategy varies between models and between runs of one model, before building anything.
1. **Survey for a gap that exists today.** Calibrate a stronger model and the weaker ones on the worlds already in the repository (faithful, woodworking, the perturbed `forge-8`) and read cost per success, to see where a strong model beats a weak one and by how much. That decides which kind of world to build first.
2. Write the hypothesis template for those worlds from what is measured, to check it is usable.
3. Build one workflow world with consumable action tokens, and a perturbed variant. It is the nearest to the hypothesis, and it needs no new solver.
3a. Build the one-step goal family in a new generated world, and test H1 to H4 (the strategy question and the transfer of a strategy lesson), in parallel with step 3 if cost allows: it is cheap.
4. Build a portfolio with shared intermediates in robot assembly or food, two or three levels deep and within the current solver. Deeper graphs follow once the solver plans over the recipe graph and budgets are set for the depth.
5. Matched comparisons and the shape world as diagnostics, when a question calls for them.
6. Decide: an ADR-003 amendment for the world set and for hypotheses declared before calibration.

## Open questions

- Which workflow first: the loan application (a decision-table-heavy process), a robot assembly (a graph of subassemblies), or food (a faithful analogue with real recipes)?
- Does a world's notes file carry its hypothesis (it is never read by the engine), or does it live in the experiment summary?
- Can a strategy lesson transfer across goals or worlds, and is that enough for the invented world to serve the hypothesis? The one-step goal family tests it directly (H3).
- How are "strategy classes" defined so that the classification is reproducible, and how many runs per cell make a class distribution readable?
- For a refactored pair, how is "explicit intermediate modules" kept from becoming a hint, given that named intermediates tell the agent how to decompose?
- How many actions' stock is enough to leave a workflow solvable after an exploratory craft or two?
- How is parity stated when the stronger and weaker models are costed from different sources?
