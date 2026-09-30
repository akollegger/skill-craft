# Design note: who plays the game?

Status: exploratory. Intended to feed a later ADR (working title: the experiment-protocol ADR, covering the
player and the protocol). Nothing here is decided.
Date: 2026-09-29

## Question

The crafting-table simulation ([ADR-001](../adr/ADR-001-crafting-table-world.md)) needs a player:
the agent that works in a world, whose runs are recorded to NAMS, and from whose recordings a
skill is distilled. What should that player be?

## What the choice has to satisfy

- **Recording.** Runs must reach NAMS as tool calls the distiller can learn from. The
  `nams-hooks` plugin records tool calls in full but records reasoning only as placeholders.
- **Repeatability.** Comparing arms needs many short runs, a pinned model and a fixed prompt, not
  one run.
- **Clean procedure.** The recorded steps should be the game's tools. Extra calls (shell, tool
  search) become noise in the distilled procedure.
- **Skill consumption.** The distilled `SKILL.md` must be loadable by the player, ideally the way
  Claude Code loads skills.
- **Independent measurement.** Call and failure counts must not depend on the player. The
  simulation's run log (spec FR-023) is the ground truth.

## Options

| Player | Strengths | Weaknesses |
|---|---|---|
| **1. Interactive Claude Code session** | The setup the blog describes. Hooks and native skills already work. Best for narrating a live demo. | A human is in the loop, so it is slow and unrepeatable. No distribution of results. |
| **2. Headless Claude Code** (`claude -p`, scripted) | Uses the real hook pipeline and loads skills natively. Scriptable for N trials per arm. Reports turns and cost. | Large system prompt. Built-in tools can add noise calls. Model behaviour varies between runs. |
| **3. Custom agent on the Claude Agent SDK** | Full control over tool allowlist, system prompt, turn limits, parallel trials. Structured results. Can load plugins, so hooks should still record (unverified). | More code. Less "stock". Hook behaviour under the SDK needs confirming. |
| **4. Raw Messages API loop** | Cheapest and most controllable: fixed model and temperature, prompt caching. Could record the model's real reasoning text as NAMS reasoning steps, fixing the placeholder problem. | Recording to NAMS must be built. Skills are injected into the prompt by hand, losing the "loads as a skill" story. |
| **5. Scripted non-LLM players** (random, exhaustive, the solver's optimal run) | Deterministic and free. Baselines, and a way to test the distill pipeline without model variance. | A skill learned from a script does not show an agent learning. |
| **6. Other harnesses** (Codex, Gemini CLI, OpenCode with NAMS hooks) | Shows portability: distill from one agent, consume the skill in another. | Best as a later consumer arm, not the first player. |

## Leaning

- Headless Claude Code (option 2) as the learner and as the player in every evaluated arm.
- Interactive Claude Code (option 1) for narrating one run live.
- Scripted players (option 5) as baselines.
- Move to the Agent SDK (option 3) only if parallel trials or tighter control are needed.
- Keep the simulation's run log as the measurement so the player can be swapped without changing
  results.

## Arms

`nams-hooks` injects recalled memory into the prompt each turn, which is a different intervention
from a distilled skill. That suggests three arms, not two:

1. **Baseline.** Hooks not recalling, no skill.
2. **Memory.** Recall on, no skill.
3. **Skill.** Recall off, distilled skill installed.

This compares agent memory with skill distillation, not only with versus without.

**Model is a second dimension.** The aim of distillation is to let a strong model work a task out,
then hand the result to a smaller model that follows instructions. So the comparison that matters is
often across models: a frontier model with no help (the teacher), a smaller model with no help, and the
smaller model with the distilled skill. Tokens, cost and time are only comparable within one model, so
each run records the model requested and the model that ran (spec 002), and a label that mixes models is
flagged, not averaged. The arms above each get run per model of interest.

## Risks to check in a pilot

- **Noise calls.** Earlier traces held many `ToolSearch` and `Bash` calls. Claude Code may defer
  MCP tools behind a tool-search step that is itself recorded. The player needs a restricted tool
  list so the recorded procedure is only the game's tools.
- **Arm separation in NAMS.** One workspace is usable so far, so recalled memory can leak between
  arms. Runs need scoping or tagging.
- **Model variance.** Pin the model for each arm (the run records which one ran) and run several trials
  per arm; report a distribution. Runs started without choosing a model use the default, which can change
  between sessions, so pin explicitly for experiments.
- **Hooks under headless and SDK modes.** Confirm the hooks fire and record.
- **Reasoning capture.** Placeholder reasoning limits what a distilled skill can say about
  judgment. Option 4 fixes this at the cost of more build.
- **Goal in the conversation.** The goal appears only in the prompt, not in tool calls (ADR-001
  Section 4). The distiller has to connect them.

## What would settle it

A two-run pilot with headless Claude Code, a restricted tool list and the current hooks, then
inspect the recorded trace and the distillation result. If the trace is clean and the distiller
produces a grounded skill, option 2 stands. If not, the trace will show whether the fix is a
tighter player (option 3), richer recording (option 4), or a change to the tool outputs.

## Interim tooling

Until the decision is made, `scripts/run-agent.ts` (with `src/harness/`) runs the leaning option:
Claude Code run through the Claude Agent SDK, built-in tools removed, one run log per run, scored by
replaying the log and measured for time, tokens and cost (ADR-002). It
keeps sessions out of NAMS by default, so it does not yet exercise the memory and skill arms; that
waits on the ADR. A first real run showed the baseline can fail by giving up or asking for a hint
rather than by getting the answer wrong, so the harness prompt forbids questions, sets a turn budget,
and reports `stopped` and `budget` endings separately.

## Next step

When the pilot has run, write the experiment-protocol ADR covering the player, the arms, the metrics and the isolation
rules.
