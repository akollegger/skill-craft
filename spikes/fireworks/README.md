# Spike: Fireworks models in skill-craft

Status: drafted, not started. Branch: `spike/fireworks-integration`.
Context: [agent-player-options](../../design/notes/agent-player-options.md) (options 4 and 6, and "model is a
second dimension"), [ADR-003](../../design/adr/ADR-003-experiment-protocol.md).

## Question

Can Fireworks-hosted open models serve as (a) the *student* player in the with/without-skill comparison and
(b) the critic and reviser roles in the critic loop, without changing the engine, the server, the run log or
the measurement rules?

## What this spike must not do

- Change the engine, `src/mcp/server.ts` or `run.jsonl` (the constitution and AGENTS.md rules hold).
- Write agent text or reasoning into a trace, summary or bundle (the privacy test must keep passing).
- Print, log or pass the key on a command line. `FIREWORKS_API_KEY` lives in `.env` only and is read from the
  environment.
- Change the base prompt. Every arm of an experiment shares one; a model difference must not be confused with a
  prompt difference.
- Run against `worlds/forge.json`. Use a generated world.

## Steps

Each step ends with a written finding in `log.md` (what was tried, what happened, what it means for the
decision). A step that fails is still a result.

### 1. Catalogue (read-only, needs the key)

List the models the account can call: `GET https://api.fireworks.ai/inference/v1/models`. Record, per candidate,
the id, context length, whether it supports tool/function calling, JSON-schema structured output, and the
per-token price. Pick two or three candidates: one small, one mid-size, one strong, all with tool calling.
Output: `models.md`. No spend beyond the listing.

### 2. Tool-calling probe (a few cents)

Against the OpenAI-compatible `chat/completions` endpoint, give each candidate the craft server's tool
definitions (taken from the MCP server over stdio, as `scripts/smoke.ts` does) and ask for one `look` call.
Check: valid tool-call JSON, correct argument shapes, multi-call turns, whether `reasoning` content is returned
separately, and the usage object. Output: `probe-tools.ts`, findings in `log.md`.

### 3. Does the Agent SDK work over a Fireworks endpoint? (cheap, time-boxed)

Check whether Fireworks offers an Anthropic-compatible endpoint, and if so, run `scripts/run-agent.ts --dry-run`
first and then one run with `ANTHROPIC_BASE_URL` pointed at it. Look at: whether the `Skill` tool and plugin
loading work, what `modelsUsed` and cost report (cost is likely wrong for non-Claude models), and whether
`maxTurns` classification still holds. If it works, a student player needs almost no new code. If not, stop
here and move to step 4. Time-box: one hour.

### 4. A minimal `AgentDriver` (the custom loop)

Prototype `fireworksDriver` behind the `AgentDriver` seam in `src/harness/driver.ts`, in a new file that
imports nothing from the Claude SDK:

- Connect to the craft server with the MCP client SDK (already a dependency), expose its tools as function tools.
- Loop until the model stops calling tools or `maxTurns` is reached (`stopped` or `budget`); anything else is
  `error` with a fixed `code: message` reason.
- Skill arm: inject the skill text into the system prompt, and report `skillInvoked` accordingly. Note in the
  results that this is not native skill loading.
- Report tokens, duration and cost computed from the price table in `models.md`; `null` where unknown, never zero.
- Call the sink's `onToolStart` and `onToolEnd` so `trace.jsonl` keeps its shape.

Test against `test/helpers/fake-player.ts`'s contract; no live call in tests.

### 5. A Fireworks `RoleDriver` (critic and reviser)

Implement `RoleDriver` (`src/harness/role-driver.ts`) with JSON-schema structured output and a per-call spend cap
(`maxUsd`). Check whether the role schemas in `src/loop/` validate on each candidate. Run the critic loop with
`--dry-run`, then one live round with `--max-rounds 1` and a small `--max-role-usd`.

### 6. Pilot (only if 4 passes)

Two or three runs per arm (student with no skill, student with the skill distilled from a Claude run), on one
generated world with its goals. Compare against the Claude arms already recorded. This is a feasibility check, not
a result: report the numbers with the run counts and do not average across models.

## Decisions the spike should feed

- Whether ADR-003 needs an amendment for a non-Claude student (player and model rows).
- Whether the skill must be consumed natively for the comparison to be valid, or whether prompt injection is an
  acceptable second arm.
- How cost is measured when the player is not Claude (price table in the repo, or tokens only).
- Whether the critic should be a different model family from the one that wrote the skill.

## Open questions

- Which models does the account have, and at what rate limits?
- Does Fireworks return reasoning content separately for the models of interest? (It must never be stored.)
- Is there an Anthropic-compatible endpoint (step 3)?

## Setup

Add to `.env` when ready (a name is already in `.env.example` on this branch):

```
FIREWORKS_API_KEY=
```

Load it in a script with `set -a; source ./.env; set +a`. Do not `cat` `.env`.

---

## Admitting a provider (spec 007, ADR-005 §2.2)

The probes here are how a provider enters the harness's provider table (`src/harness/providers.ts`). The full contract is
[specs/007-ai-sdk-runtime/contracts/provider-table.md](../../specs/007-ai-sdk-runtime/contracts/provider-table.md).

1. **Probe the tools.** `pnpm dev spikes/fireworks/probe-tools.ts worlds/generated/forge-7.json <provider>/<model>` makes a model
   through the table, gives it the craft server's tools and prints, per step: the finish reason, the tools called (and whether
   several arrived together), the usage fields the provider reports (cache reads and writes, reasoning tokens) and the model the
   provider says answered. It counts text and reasoning and prints neither.
2. **Probe the schemas.** `pnpm dev spikes/fireworks/probe-schema.ts <provider>/<model>` runs a critic and a reviser call through
   the harness's role driver with the real schemas and reports whether each answer parsed.
3. **Record the findings** in `design/notes/provider-admission.md`: tool calls, schema answers, the settings the provider refused
   (temperature, effort, thinking), how reasoning arrives (and whether it must be sent back between turns), the usage fields
   reported, and whether the provider has a usage report.
4. **Check the billing** where the provider has a usage report: `reconcile.ts snapshot`, run a batch, `reconcile.ts compare`, and
   require the harness's token counts to equal the billed ones. A provider with no usage report is admitted without this step. The
   check is a procedure a person runs and records; the harness does not enforce it.
5. **Add the row.** The package in `package.json`, one row in the table, the key's name in `.env.example`, and price entries in
   `prices.json`. Nothing else changes.
6. **A router** (one model name served from several backends) is admitted only with its backend pinned in the row: fallbacks off,
   the order fixed, and a `backend(meta)` hook that reads the backend a response reports. Without that the table refuses it.

Keys come from the environment (`set -a; source ./.env; set +a`). The probes read only whether a key variable is set, never its value.
