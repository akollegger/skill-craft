---
id: ADR-007
title: The base prompt is a versioned experiment parameter, and its budget counts tool calls
status: proposed
created: 2026-10-13
specs: []
---

# ADR-007: The base prompt is a versioned experiment parameter, and its budget counts tool calls

## 1. Context

The agent receives one text, the *base prompt*, built by `buildPrompt` in `src/harness/run.ts`. It states the goal, the tools' character, that nobody can answer questions, and a budget: "until your budget of 80 turns is used up". The harness enforces that budget as a count of *steps*, one model response each, through the AI SDK's `isStepCount`. The prompt and the enforcement mean different things, and the difference shows in the data.

- **Models read "turns" as tool calls, and providers batch calls differently.** A model can request several tool calls in one response. Across the model survey's `glirol` and woodworking runs, `claude-sonnet-5-5` and `claude-haiku-5-5` issued a median of 2.4 to 2.6 calls per step, `claude-fable-5-1` and most Fireworks models 1.0 to 1.6. Every miss by Sonnet (4), Haiku (6) and Fable (2) ended with the model stopping on its own after 70 to 110 calls with 30 to 60 steps unused, and the final messages say the budget is nearly spent. No Fireworks miss ended that way; all ran to the step limit or errored. The same prompt gave a Claude model about 80 calls of exploration to give up on and a Fireworks model 80 calls to use, so results across providers were not like-for-like (`runs/reports/2026-10-13-s3-nine-models.md`).
- **The score counts calls, and a budget in steps does not.** The score records every craft-tool call (`totalCalls`) and the subset that changes the table (`actionCalls`, which `callsToGoal`, `extraCalls` and a world's `slack` use, ADR-002). A budget in steps leaves its size, as the agent experiences it, dependent on how a model batches.
- **The wording is a variable, and has moved a baseline.** Rewording the prompt (dropping "unfamiliar workshop", "use only the craft tools", "on your own", "explore") moved unaided Haiku on the faithful `stone_pickaxe` goal from 0 of 5 to 4 of 5 under Claude Code (`design/notes/critic-loop-findings.md`). On the AI SDK runtime the original wording gives the same 4 of 5, so that effect may have come from Claude Code's added context, not the wording (`design/notes/runtime-recalibration.md`). Which of the two is true is untested.
- **Every arm of an experiment must share the prompt.** A skill arm's only difference from its baseline should be the skill; a prompt that changes between arms, or between calibration and the arms, makes the comparison unreadable. The prompt is nonetheless stored only as a `prompt.txt` copy in each run, with no version and no check that arms agree.

The prompt does not teach the agent to learn: the project's premise is that distillation is a side effect of doing the task, so the prompt never mentions skills or memory (an arm may add one fixed sentence, ADR-003 §2.2). And an agent cannot count tokens or dollars, so a budget the agent can follow is one it can count itself.

## 2. Decision

### 2.1 The budget counts craft-tool calls

The base prompt states the budget as a number of **tool calls**: every call to a craft tool (`help`, `inventory`, `look`, `place`, `remove`, `clear`, `craft`), refused calls included. This is the score's `totalCalls`, not `actionCalls`: observation calls are what the Claude models were batching and stopping on, and a budget over action calls alone would leave a model free to loop on `look` indefinitely. The score keeps both counts, and `callsToGoal` and slack stay in action calls as before. The `Skill` tool, which loads a skill, is not a craft-tool call and does not count; it is recorded.

The driver enforces the number the prompt states:

- Calls are counted in the order the model emitted them within a response.
- A call past the budget is not sent to the craft server. It is answered with one fixed refusal line that reveals nothing about the world, it is absent from `run.jsonl`, and it is counted in a new `budgetRefused` field of `score.json`, not in `totalCalls`.
- The run ends after that response. It ends `budget` if the goal is not held and `stopped` if it is, including when the last call within the budget reached the goal.
- Every response makes at least one call, so a call budget of N ends a run in at most N responses; the separate step limit goes away, and a response with no call ends the run as it does today.
- The score records `calls` (`totalCalls`), `actionCalls`, `steps` and `budgetRefused`.

The budget's size is an experiment parameter, declared in the experiment summary as `callBudget`; the summary's older `turnBudget`, which counted steps, is read as a version-1 step budget and is not accepted for a version-2 prompt. The surveys suggest starting at 100 calls: the best runs need 3 (`glirol`) and 19 (woodworking) calls, and most successful unaided runs finished within 100 (a few took 123 to 133). The first calibration confirms the value; it is raised if more than 1 in 10 unaided runs of a tier that otherwise reaches the goal end at the budget.

### 2.2 The prompt is a versioned, hashed file

A base prompt is a file in `prompts/` (`base-v1.txt`, `base-v2.txt`, ...) with the placeholders `{what}`, `{item}` and, for a call budget, `{budget}`, and a changelog beside it saying what each version changed and why. `--prompt-file` already fills `{what}`, `{item}` and `{turns}`; `{turns}` stays valid and means steps, so existing prompt files still work. Version 1 is today's text, which `buildPrompt` currently builds in code, written out as `prompts/base-v1.txt` with `{turns}` and producing the same bytes; its runs are labelled as step-budget runs so the four surveys stay reproducible. A new version is a new file, never an edit.

An experiment names one prompt version in its summary. Every run records the version and the SHA-256 of the filled prompt in `score.json`, and the replay bundle carries them. The harness refuses to start an arm whose prompt version differs from the summary's, and the report refuses to put arms with different prompt hashes in one table without a notice. The only permitted difference between arms is the fixed sentence of ADR-003 §2.2, which is part of the hashed text.

### 2.3 Version 2: the reworded prompt with a call budget

Version 2 is the neutral wording from `spikes/critic-loop/prompt-reworded.txt` with the budget defined in calls:

> You are at a crafting table in a workshop. Your goal: end up holding {what}.
> The craft tools are available to you; help describes them. craft uses up whatever is on the table and cannot be undone, so place, remove, clear and look let you try arrangements first.
> No one is available to answer questions during this task. You have {budget} tool calls in total; every call to a craft tool counts, including several made at once. When you hold {item}, say so in one line and stop.

It states the task, how to learn the tools, what is irreversible, and the budget the agent can count; it says nothing about isolation, exploring, skills or learning. Its "including several made at once" tells every model how its calls are counted. That is the information the surveys showed models guessing wrong, and every arm sees the same sentence. Before an experiment adopts it, the three tiers (`nemotron-3-ultra-nvfp4`, `glm-5p3-flash`, `claude-fable-5-1`) run `glirol` and `wooden_stool` unaided, five trials each, under version 1 (already measured) and version 2, so the wording's effect is a recorded number and not an assumption. If version 2 moves a baseline, the experiment uses it and every comparison is made under it; both results stay in the record.

### 2.4 What does not change

The prompt carries no instruction to learn, no mention of memory or skills, and no hint of a solution (ADR-001's discovery rule). Arms differ by the fixed sentence at most. A prompt's wording is never tuned per model.

## 3. Alternatives Considered

- **Keep counting steps and say "steps" in the prompt.** Rejected: it fixes the ambiguity but leaves the budget's size in calls dependent on how often a model batches, so a model that parallelizes gets two to three times the exploration of one that does not, and the comparison across providers stays unequal.
- **Disable parallel tool calls, so a step and a call are the same.** Rejected for now: it would keep the step budget and the old wording, but it changes how each model works, depends on each provider honouring the setting, and adds responses, and so uncached input, to every run of the models that batch. Whether the surveys' results hold with serial calls is untested; it is a follow-up check, not a reason to leave the budget ambiguous.
- **Budget over action calls only.** Rejected: `help`, `inventory` and `look` would be free, so a model could spend an entire run observing without the budget ever ending it.
- **Budget in tokens or dollars.** Rejected: the agent cannot count either, prices are unavailable for some models (cost is null, never zero), and caching changes token use without changing what the agent did.
- **No budget in the prompt, a hidden harness limit.** Rejected: models then decide when to stop by their own guess, as the Claude models did here, and a run that ends at an unseen limit looks like a failure of the model.
- **A different budget per model.** Rejected: the prompt is fixed across arms and models, and per-model tuning would make the budget a variable the experiment cannot interpret.
- **Edit the prompt in place and rely on git history.** Rejected: runs are compared months apart and a run's folder must say which text it saw; a version and a hash do that without reading history.
- **Keep the original wording unexamined.** Rejected: the one measured effect of rewording is large and unexplained, and the later experiments depend on baselines that the wording may move.

## 4. Consequences

- All earlier calibration and survey results (steps budget, version 1) remain valid as such and are labelled. A baseline for each tier on each world must be remeasured under version 2 before any arm comparison.
- Claude models may reach more goals once the budget is something they can count, and cost more per run. Fireworks models, which mostly issue one call per step, will see a smaller budget in steps (100 calls is about 100 steps for them) than the 80 steps they had. Both effects are what the change is for.
- A call budget makes a run's budget comparable with the score's `callsToGoal` and `extraCalls`, and with a world's slack, which the step budget did not.
- Enforcing the budget inside the driver adds a code path (a refusal for calls past the budget, a stop after the response) that needs tests with parallel calls crossing the limit. A refusal line must not reveal recipes; the existing leak test covers refusals.
- The prompt files, their changelog and the recorded hash add a small amount of structure. In return, an arm that silently differs in wording is detectable.
- Version 2's effect on baselines is not known. If it is large, the choice of prompt becomes a headline result of the study (how sensitive agents are to framing) and not only a control.
- ADR-003 declares a "turn budget" and measures success "within the turn budget (the cap on agent turns)". Until ADR-003 and the glossary are amended, the two texts use the term differently; this ADR's accepted form amends them, and the glossary entry becomes *call budget*.
- Follow-up: a feature spec; updating `buildPrompt`, `--prompt-file`, the experiment summary and `score.json`; the ADR-003 amendment above; and a check of the surveys' results with serial tool calls.

## 5. Related

- Related ADRs: ADR-003 (§2.2 requires one base prompt for all arms; version 1 of that prompt is defined here, and the meaning of "turn budget" in §2.2, §2.5 and the glossary is amended), ADR-006 (the runtime that enforces the budget), ADR-001 (the discovery rule the prompt must respect), ADR-002 (the score and trace that record calls).
- Evidence: `runs/reports/2026-10-13-s3-nine-models.md`, `design/notes/critic-loop-findings.md`, `design/notes/runtime-recalibration.md`, `design/notes/turn-one-diff.md`.
- Specs: _(populated automatically by the speckit ADR-link hook once `/speckit-specify` references this ADR)_
