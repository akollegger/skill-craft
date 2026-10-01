# Skill pilot: record, distill, install

Status: spike findings, 2026-10-01. Input to the experiment-protocol ADR. Branch `spike/skill-install`.
Everything below is from small samples (one to three runs per arm) on one world (`forge-7`) and one goal
(`glirol`), with `claude-sonnet-5-5`. Treat the numbers as leads, not results.

## What was done

1. Recorded a run to NAMS with `--record`, and found its conversation through the hooks' state file.
2. Generated a skill from that one conversation (`POST /v1/skills/generate`).
3. Installed the skill into fresh runs and measured whether it helped.

## Findings

### Recording

- The hooks store every tool call with input, full output, status and `durationMs` (99 of 99 in the run),
  two messages (the prompt and the final answer), and six "reasoning steps" that are placeholders
  ("Claude Code ran mcp__craft__place with the provided tool input"), one per distinct tool.
- Refused calls: no run in the pilot had a refusal, so whether they are recorded is still unknown. The plugin
  registers `PostToolUse` only, not `PostToolUseFailure`.
- A run maps to its conversation by the hooks' state file (`~/.nams/state/claude/session-*--sha256(sessionId).json`,
  which holds `conversationId`, `workspace` and the run folder as `projectDirectory`). That relies on the plugin's
  private format (version 0.1.0).

### Isolation: why recording needs its own workspace

- Recall at the start of a session reads the new conversation's context (empty) and runs a workspace-wide
  entity search by the prompt. In the shared workspace that search returned entities extracted from **our own
  design sessions**, including one that said glirol needs "one craft in the best run". That is a solution leak.
- Deleting a conversation (`DELETE /v1/conversations/{id}`) removes it and its messages only. The entities
  extracted from it survive. So clearing run conversations does not isolate runs; a separate workspace does.
- Experiment runs now record to the dedicated "Skill Distillation" workspace by passing `NAMS_WORKSPACE_ID`
  (the hooks read it from the environment) to that run only. The first recorded run there started with 0
  entities and an empty recall.

### Generating a skill

- `POST /v1/skills/generate` with `{ scope: { type: "conversations", conversationIds: [...] }, nameHint }`.
  `scope.type` is required; the valid values (workspace, conversations, entity, ontology_class, time) are in the
  docs' tool reference, not the OpenAPI spec. Returns a run id; the run finished in about 16 seconds.
- Extraction takes minutes (five and a half in the pilot), and the status can read `processing`, so wait for
  every message to be `done`, not merely for nothing to be `pending`.
- Gates: grounding 1.0 (gate 0.9) and coverage 1.0 (gate 0.6), `graph` format, coherence 0.5 over 4 step
  communities. A generated skill lands in review; approving and publishing are separate writes (not done).
- Content: `spikes/skill-pilot/craft-glirol/`. Steps 1 to 5 are the exploration routine (help, inventory, place,
  clear, remove). The recipe is in step 6's "why" ("two lugli side by side in the top row"), in the domain-model
  file and in the worked example. NAMS did extract the 3-call solution from a 96-call wander.
- The description begins with a tool name (`mcp__craft__place: use the Craft tools to ...`), which is a quirk
  of how the leading word is chosen.

### Installing a skill in a run

- The harness packages a skill folder as a local plugin in the run folder (`skill-plugin/`) and passes
  `plugins` and `skills: ["run-skill:<name>"]` to the SDK. `--skill <folder>` on `run-agent.ts`.
- With `tools: []` the agent has no `Skill` tool, so the skill is listed but cannot be loaded. A skill run uses
  `tools: ["Skill"]`, which keeps Read and Bash off, so the agent still cannot read the world file.
- The SDK's `skills` option does not hide the 20 bundled skills (design, debug, ...); they are listed in every
  session whether or not `skills` is set. They are generic and the same in every arm.
- The run records the skill's name and SHA-256, and whether and **when** the agent loaded it (the number of
  craft calls made before its first `Skill` call).

### Does the skill help?

| Run | Skill | Reached | Action calls | Cost | Time | Skill loaded |
|---|---|---|---|---|---|---|
| baseline, recorded (shared workspace, 40 turns) | no | no | 67 | $0.226 | 122 s | - |
| baseline, recorded (clean workspace, 80 turns) | no | yes | 96 | $0.369 | 186 s | - |
| skill | yes | yes | 69 | $0.235 | 83 s | yes (timing not yet recorded) |
| skill (second batch, run 1) | yes | no | 76 | $0.213 | 88 s | never |
| skill (second batch, run 2) | yes | yes | 49 | $0.143 | 57 s | after 47 calls |

Budgets differ between rows (40 and 80 turns), the first baseline recalled leaked entities, and the skill runs
were not recorded, so the rows are not a clean comparison.

What the runs do show:

- **The skill's content works.** In the last row the agent wandered for 47 calls, loaded the skill, and reached
  the goal two calls later.
- **Getting the agent to load it is the weak link.** One run never loaded it and one loaded it at call 47, so the
  savings are small. A 3-call solution sat unused in the agent's tools for most of two runs.
- **Likely causes** (not yet tested): the harness prompt says "Use only the craft tools" and "explore with place,
  remove, clear and look before you commit", which steers away from the `Skill` tool; and the skill's
  description is generic and begins with a tool name, so nothing signals that it holds the answer.

## Open questions for the protocol

1. Does the skill arm's prompt mention skills? A neutral prompt may suppress them (as here); mentioning them
   may flatter the skill. Whichever is chosen belongs in the protocol.
2. Does the skill lead with the discovered fact, or replay the teacher's routine? Here it replays the routine and
   buries the fact. That is a property of the distillation, and may be tunable (`procedureFormat`, `nameHint`,
   re-distilling with a `skillId`, or editing the description).
3. Transfer: a skill from the warm-up goal should help a held-out goal that needs intermediates. This one is
   specific to glirol, so it cannot show that.
4. Refused calls in NAMS (see above), and a teacher run that succeeds efficiently enough to give a clean skill.
5. Variance: three runs cannot separate a real effect from luck. The protocol needs several trials per arm.
