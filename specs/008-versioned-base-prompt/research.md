# Research: Versioned Base Prompt with a Call Budget

Each entry is a question the plan had to answer, what was chosen, why, and what else was considered. Entries marked
*verify* are checked by the first test of the task that depends on them, because they rest on how the AI SDK behaves.

## R1. Where the call budget is enforced

**Decision**: wrap each craft tool's `execute` in `ai-driver.ts` after `client.tools()`. The wrapper increments a counter
synchronously on entry; a call that finds the counter at the budget does not call the server and returns the fixed refusal
line. A `stopWhen` condition ends the run once the counter has reached the budget.

**Rationale**: the SDK starts the tool executions of one response in the order the model emitted them, so a counter
incremented on entry counts in emission order without a lock (*verify*: a test with the mock model emitting 5 calls
against a budget of 3). Wrapping sits next to the existing tool-timeout and invalid-call handling, and leaves the craft
server and `run.jsonl` untouched, as the ADR requires. The skill tool is added after the wrap and is not counted.

**Alternatives**: a counter in `onToolExecutionStart` (cannot stop a call, only observe it); an MCP-level proxy that
refuses past N (a second process, and the run log would then need to hold the refusals); a step limit scaled by an
estimate of calls per step (not exact).

## R2. The over-budget refusal text

**Decision**: one constant line, "The call budget is used up. This call was not run.", returned as the tool result. It
names no tool, item, grid or recipe.

**Rationale**: it satisfies discovery over disclosure by construction, and the leak sweep gains a case that asserts the
line is identical for every refused call.

**Alternatives**: echoing the call's arguments (reveals nothing new but varies the text); an error result (some models
retry on errors; a plain result with the run ending after the response is what the ADR decides).

## R3. How a run ends under a call budget

**Decision**: the driver ends the response in which the counter reaches the budget (the stop condition) and classifies it
`budget` when the last finish was a tool call. `run.ts` then replays the log it already scores: if the goal is held, the
run's `ended` becomes `stopped`. A response with no call ends the run as today.

**Rationale**: the driver cannot see the goal, and the harness already scores the log after every run (the "reached" flag),
so the rule "stopped if the goal is held, including on the last in-budget call" is one comparison there and needs no goal
knowledge in the driver.

**Alternatives**: giving the driver the goal (couples the SDK file to the solver); leaving the ending as `budget` when the
goal was reached on the last call (contradicts FR-013 and mislabels a success).

## R4. The step limit under a call budget

**Decision**: when a call budget is set, the step limit is the same number. Every response makes at least one call, or ends
the run, so a response count above N would mean a response with no calls and the run has already ended. Under a step
budget (version 1) the step limit and its `budget` ending are unchanged.

**Rationale**: one budget the agent sees and one limit the harness enforces; no second number to explain.

**Alternatives**: no step limit (an unbounded loop of refused calls is impossible because the run ends after the budget
response, but a defensive ceiling costs nothing).

## R5. What the fingerprint hashes

**Decision**: the score records two SHA-256 values: `baseSha256` of the filled base text before the fixed arm sentence is
appended, and `sha256` of the full text sent (the content of `prompt.txt` without its trailing newline). The report's
notice triggers on a difference in `baseSha256`; a difference in `sha256` alone is shown as "differs only in the fixed
sentence" and is listed, not warned about.

**Rationale**: the ADR says the arms may differ only by the fixed sentence and that the sentence is part of the hashed
text. With one hash, every skill-pointed arm differs from its baseline and the notice would always fire, so it would carry
no information. Two hashes keep the ADR's rule (the full hash covers the sentence) and make the check usable.

**Alternatives**: one hash and a notice that always fires on S2 arms (noise); hashing the note separately (a third value
with no use).

## R6. How a budget meaning is chosen and refused

**Decision**: a prompt file declares its budget meaning by its placeholder: `{turns}` means steps, `{budget}` means tool
calls. The CLI takes `--max-turns` for a step budget and `--call-budget` for a call budget; the one that does not match the
prompt's placeholder, or both, is refused before any spend. A template with neither placeholder takes `--max-turns` and
states no budget.

**Rationale**: FR-009 and the edge cases require that the two meanings cannot be mixed; the placeholder is the one place
the prompt text and the number are tied together, so the check is a lookup. It also keeps `--prompt-file` and older files
working with `{turns}` (FR-003).

**Alternatives**: one flag whose meaning follows the version (hidden coupling, easy to misread in a command history).

## R7. The prompt set and where it is checked

**Decision**: the experiment `summary.json` (read by `report.ts`) gains an optional `promptSet`: one version per kind the
experiment uses (`base`, and where used `armSentence`, `skillTool`, `reviewRubric`) and a `callBudget` for a call-budget
base prompt. Three places check it: `run-agent.ts` takes an optional `--experiment <folder>` and refuses an arm whose
resolved versions or call budget differ from the set before any spend; `critic-loop.ts` takes the same option and refuses a
rubric version that differs; the report refuses a run or loop whose recorded version differs, prints the set, lists
unpinned kinds, and warns on differing `baseSha256`.

**Rationale**: the harness runs one batch at a time and has no other way to learn the experiment's prompts; the experiment
folder is where the cast and arms are already declared. A kind the experiment does not use (no loop, so no rubric) is
simply not checked. Making the option optional keeps ad hoc runs unchanged (FR-024).

**Alternatives**: a registry file under `runs/` (a second source of truth); a named, saved prompt-set file (rejected in the
clarification); checking only in the report (catches a mismatch after the spend).

## R8. Old runs and custom text

**Decision**: a run folder whose `score.json` has no `prompt` block is read as unversioned. `--prompt-file` and a free-text
`--prompt-note` record the version `custom` with their fingerprints, so an ad hoc text is still checked for agreement within
an experiment but is never mistaken for a numbered version.

**Rationale**: FR-008 forbids reading an old run as version 1, since the prompt that ran may have been a template.

## R9. The layout and what a kind is

**Decision**: `prompts/<kind>/v<N>.<ext>` with `<kind>` in `base`, `arm-sentence`, `skill-tool`, `review-rubric`, `N` a
positive integer without leading zeros, and one `prompts/<kind>/CHANGELOG.md` with a `## v<N>` section per version, the same
heading rule `process.ts` uses for the process changelog. `src/prompts/` keeps the table of kinds (extension, placeholders,
whether a word check applies); adding a kind is a row there, its directory and its first version.

**Rationale**: one layout and one changelog format is what the clarification asks for. The heading rule already has a test
(`hasChangelogEntry`); reusing it means "a version with no changelog entry is refused" is not new machinery.

**Alternatives**: flat `prompts/<kind>-v<N>.txt` (a directory per kind gives each kind a changelog without a naming
convention); front matter in each file (it would change the bytes, which are the prompt).

## R10. The skill tool's description

**Decision**: `prompts/skill-tool/v1.txt` is today's string with two placeholders, `{name}` (the skill's name) and
`{described}` (empty, or `: <the skill's description>`), producing byte-identical output to the code's current template,
which a test freezes. The driver receives the filled text through `DriverOptions`, and records the kind's version and
fingerprint in the run's `prompt` block when a skill is installed. The default is version 1, stated explicitly as for the
base prompt, and `--skill-tool-version` selects another.

**Rationale**: the description is what the model sees when deciding whether to load a skill, so it is a variable (the
skill-load rate is a result of the study). The conditional in the code (`description === "" ? "" : ": …"`) stays in code and
the file holds only the words.

## R11. The arm sentence

**Decision**: `prompts/arm-sentence/v1.txt` holds the S2 sentence of ADR-003 §2.2. `--arm-sentence <N>` selects a version;
`--prompt-note <text>` stays for ad hoc text and records `custom`. The two are mutually exclusive. The word check does not
apply (the sentence exists to mention a skill).

**Rationale**: FR-020 keeps existing commands working while giving the one sentence the protocol allows a version.

## R12. Moving the review rubric

**Decision**: `git mv src/loop/rubric/skill-review.v1.json prompts/review-rubric/v1.json`, bytes unchanged, and
`DEFAULT_RUBRIC_PATH` follows. The loop record already names the rubric's `version` field and `sha256` (not its path), so
no earlier record changes; it gains the kind version. The rubric is not split and its JSON schema is unchanged.

**Rationale**: the clarification keeps it one kind. Moving the file puts every prompt in one tree. A test pins the moved
file's SHA-256 to its value before the move (`a6e33cf7…5c5e`), so any edit to it fails, and the rubric test's path constant follows.

**Alternatives**: leaving it in `src/loop/rubric/` and registering the path (two trees, a registry with exceptions).

## R13. Process version

**Decision**: a change to any role's wording is a new version of its kind and, because the rubric and the distiller's inputs
feed a skill, bumps `PROCESS_VERSION` under the existing rule. This feature changes no wording, so it does not bump it; a
test asserts that the rubric's and the other prompts' bytes at version 1 equal what the code produced before.

**Rationale**: FR-023. Version 2 of the base prompt is a player variable and does not touch how a skill is made, so it does
not bump the process version either.
