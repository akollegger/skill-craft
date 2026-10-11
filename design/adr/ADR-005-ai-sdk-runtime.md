---
id: ADR-005
title: The AI SDK as the runtime for players and review roles
status: accepted
created: 2026-10-09
specs: [specs/007-ai-sdk-runtime]
---

# ADR-005: The AI SDK as the runtime for players and review roles

## 1. Context

The harness runs a *player* (the model that works a crafting-table goal through the `craft` MCP server) and, in the critic loop, two tool-less *roles* (a critic that reviews a distilled skill against a rubric, and a reviser that edits it). Both run through the Claude Agent SDK, which embeds Claude Code: its agent loop, its system prompt, its skill discovery, and its hooks. Only Claude models run in it.

The experiment protocol compares a strong *teacher* with a smaller *student* model, with and without a distilled skill. A student drawn from another provider widens that comparison, and Fireworks hosts open-weight models that can fill the role. A 20-run feasibility check on Fireworks (`spikes/fireworks/log.md`) found:

- Fourteen chat models on the account support tool calling, and the three tried (`nemotron-lightning-3p5-30b-a3b`, `gpt-oss-120b`, `glm-5p3`) drove the craft server's seven tools through the OpenAI-style tool loop with no schema translation. Each returned schema-valid JSON under `response_format: json_schema`. Reasoning arrives in a field separate from the answer, so it can be dropped before anything is written.
- Without skills, five runs per model on one goal (`glirol`, 40 turns, one prompt) gave: nemotron 1 of 5 reached, gpt-oss 2 of 5, glm-5p3 5 of 5, and `claude-sonnet-5-5` 0 of 5. Under that prompt, `claude-sonnet-5-5` reached the goal 0 of 5 times. That is a different model, world and goal from the earlier 0 of 5 for Haiku on the faithful stone pickaxe, so it does not replicate that result. The Claude runs averaged about 300k uncached input tokens each.
- Token counts the harness summed from `trace.jsonl` equal Fireworks' billed prompt, cached and completion tokens exactly, about 1.95M prompt tokens in all (`spikes/fireworks/reconcile.ts`).

The Agent SDK cannot drive these models, and one run folder format and measurement path should serve every model. The Vercel AI SDK (`ai`) is a library, not a framework: it provides a model-call and tool loop, an MCP client, structured output, and provider packages for Anthropic and Fireworks. The spike moved the whole harness onto it, Claude arms included.

## 2. Decision

### 2.1 One runtime for every model

The player and both review roles run through the AI SDK (`ai`, `@ai-sdk/mcp`, `@ai-sdk/anthropic`, `@ai-sdk/fireworks`). `src/harness/ai-driver.ts` is the only file that imports it. It implements the existing `AgentDriver` and `RoleDriver` seams, so the recorder (which writes `trace.jsonl` from the driver's events), the join of trace to run log, the scorer, the bundle exporter and the critic loop see no change in their types. `@anthropic-ai/claude-agent-sdk` is removed. A Claude arm and a Fireworks arm share one tool loop, so a difference between them comes from the model. This decision changes the runtime, not the choice of teacher or student; using a non-Claude student is an experiment decision recorded in ADR-003.

The player has the craft server's tools and, when a skill is installed, a `Skill` tool. The turn limit is the number of model calls. A run that reaches the limit while the model still wants a tool is a `budget` ending, as before.

### 2.2 Model identifiers

A model is named `<provider>/<model>`, where the provider is an entry in the harness's provider table and `claude-<id>` is accepted as shorthand for `anthropic/claude-<id>`. A run records the canonical form, so one rule covers every provider: `anthropic/claude-<id>` for Claude, `fireworks/<model>` for Fireworks. This holds for the model asked for, the model that ran, the trace and the keys of the price table. A bare Claude id in an earlier run folder is read as `anthropic/<id>`. A table entry holds the provider's prefix, the AI SDK package that creates its models, the environment variable that holds its key, and how a short model name expands to the provider's id (for Fireworks, `fireworks/<model>` becomes `accounts/fireworks/models/<model>`). The table starts with Anthropic and Fireworks. Adding a provider (OpenAI, OpenRouter, Google, or any endpoint that speaks the OpenAI protocol through `@ai-sdk/openai-compatible`) is one table entry and its price entries, once the provider passes the check below. Every run pins its model (ADR-003 §2.1 stands). The run records the model it asked for and the model that ran. The model that ran is the identifier the provider's response reports, not the requested name echoed back, so a provider that substitutes a model is visible and a label that mixes models is still flagged. A provider that routes one model name across several backends (OpenRouter) is admitted only with its backend pinned: fallbacks disabled and the provider order fixed in the table entry, and the backend the response reports recorded with the model. Without that, a run's model is not fixed and a label can silently mix backends. API keys come from the environment only (`ANTHROPIC_API_KEY`, `FIREWORKS_API_KEY`, and one variable per further provider).

A provider enters the table after a probe like the one in `spikes/fireworks/probe-tools.ts` and `probe-schema.ts`: a model of that provider drives the craft server's tools, and returns answers that validate against the verdict and revision schemas under the provider's structured-output mode. Providers differ in which JSON Schema features that mode accepts, whether reasoning blocks must be sent back between turns, and which settings (such as temperature) a reasoning model refuses, so the probe records what each one accepts.

### 2.3 Trace source

The driver reports each model call and tool call to the recorder as the same events the recorder already reads (request start, usage, request stop, tool start, tool end), so `trace.jsonl` keeps its shape (ADR-002 §2.4). Calls are not streamed, so `ttftMs` is `null` and a request's duration is its whole response time. Tokens are the four counts the trace has always held; input is the non-cached count and cache reads and writes are separate, with a count a provider does not report recorded as zero. A request the SDK retries after a failure counts once, when it succeeds, and the retry attempts are not in the trace. Agent text and reasoning are never recorded (ADR-002 §2.3).

### 2.4 Cost is computed

The player reports no cost. A run's `costUsd` is computed from its token counts and a price table, `prices.json` (US dollars per million tokens, keyed by the recorded model identifier, with optional cache-read and cache-write rates). A model without an entry has `costUsd: null`. A provider that reports each request's cost (OpenRouter does) could supply it instead of the table; whether the harness records the reported cost, the computed one, or both is left to the spec. A total over runs states how many runs were unpriced and does not count them as free. Fireworks publishes rates on a pricing page, not in its API, so entries for those models are added by hand, and the spot check in 2.6 compares token counts against billing.

### 2.5 Skills are a tool

An installed skill is copied into the run folder as before (`SKILL.md` and its files, with a recorded hash). The player is offered a `Skill` tool whose description carries the skill's name and one-line description and whose result is the skill's text. `skillInvoked` and `skillLoadedAfterCalls` are read from that tool's calls, by tool name and order only. No arm uses Claude Code's native skill discovery, so the skill arm is the same mechanism for every provider.

### 2.6 Recording, recall and the billing check

Experiment runs record nothing while they play, as ADR-003 §2.4 already requires, so the `--record` flag, which loaded Claude Code's user settings so that `nams-hooks` would record, is removed. A finished run is written to NAMS through its REST API (ADR-003 §2.4). The deferred memory arm (ADR-003 §2.2, S3: the student with recalled memory and no skill) is specified there as harness-side recall through the REST API before the run, with the result placed in the prompt. It does not depend on the player's runtime and stays deferred under this decision.

Where a provider offers a usage report, a batch of a model's runs is checked against the provider's billed token counts before the model is used in an experiment. For Fireworks this is `firectl billing get-usage` (`spikes/fireworks/reconcile.ts`). `firectl`, Fireworks' command-line tool, reports tokens per model but no per-model cost, and its cost-export commands do not run under an agent. A provider with no usage report is admitted without the check, and its token counts are the harness's own.

### 2.7 Review roles

A role call is one structured-output request with no tools. The role's prompt contains only the named parts built in `src/loop/inputs.ts` (ADR-003 §2.6). A role fails with a fixed `code: message` reason on a malformed answer, a provider error or a spend overrun. The spend cap is applied as a ceiling on output tokens derived from the price table, and checked again from the reported usage after the call.

### 2.8 Pinning and recalibration

Each model's thinking, effort and temperature settings are fixed before the first trial and recorded in the experiment summary, the file that fixes an experiment's route, arms and trial counts before anything runs. Calibration (ADR-003 §2.1) is rerun on this runtime before any goal is assigned a role. The harness's base prompt is part of that rerun: rewording it moved an unaided Haiku baseline from 0 of 5 to 4 of 5 (`design/notes/critic-loop-findings.md`), and choosing the wording is a separate open decision.

## 3. Alternatives Considered

- **Keep the Agent SDK and reach Fireworks through an Anthropic-compatible endpoint.** Rejected: it keeps the Claude Code loop and system prompt in the comparison, and whether a Fireworks endpoint accepts that protocol, with skills and plugins intact, was not established.
- **Use the AI SDK for Fireworks arms and the Agent SDK for Claude arms.** Rejected: the arms would differ in loop, system prompt and skill mechanism as well as in model, so a difference between them could not be assigned to the model.
- **A hand-written tool loop on the providers' raw APIs** (option 4 in `design/notes/agent-player-options.md`). Rejected: the loop, MCP client, structured output and per-provider message formats become code to maintain, and the AI SDK supplies each of them.
- **Mastra.** Rejected: it adds agents, workflows, evaluation and its own memory over the same AI SDK layer. Its memory would sit beside the NAMS memory under study.
- **Effect (`@effect/ai`).** Rejected: the codebase is not written in Effect, so adopting it changes the style of the whole harness for no capability the harness lacks.
- **OpenAI Agents SDK and LangGraph.js.** Rejected: the first is built around handoffs and sessions the harness does not use and reaches other providers through the AI SDK anyway; the second is a stateful graph runtime for a single loop.

## 4. Consequences

- **Earlier Claude Code baselines do not carry over.** The Claude Code system prompt, its default thinking and effort settings and its native skill discovery are gone, and temperature, thinking and effort are not set anywhere. Every calibration result so far was measured under Claude Code, so none of them is evidence about the new runtime (2.8).
- **Claude runs bill against the Anthropic API.** They need `ANTHROPIC_API_KEY`, not a Claude Code login. Prompt caching is off by default in the AI SDK; the spike's Claude runs paid full price for about 300k input tokens each. Enabling a cache breakpoint is follow-up work.
- **The trace loses first-token timing and retry attempts.** Latency analyses that used `ttftMs`, and any count of failed requests, need streaming or a retry hook. Nothing in the score uses either today.
- **`--max-turns` counts model calls.** Whether that equals the Agent SDK's turn count was not measured, so turn budgets in earlier experiments are not assumed equivalent.
- **Cost has two sources of error.** The price table is kept by hand, and the role spend cap is a pre-call ceiling plus a post-call check, not a stop during the call. A thinking model's reasoning tokens count against the ceiling; a small cap can truncate the structured answer, and this was not tried.
- **Not yet exercised live:** the critic loop end to end on the new roles, a real model loading a skill through the `Skill` tool, and cancelling a run (Ctrl-C and timeout) while the craft server is running.
- **Follow-up work:** report the provider's model identifier; make cost totals state unpriced runs; enable Anthropic prompt caching; count retries; add the price entries for Fireworks models in use; update the glossary entries for harness and hooks.
- **Not decided: pinning a routed provider.** The table entry for a provider such as OpenRouter must fix its backend (2.2), and how that is expressed through the AI SDK provider package, and whether it holds for every model the router offers, has not been tried.
- **Dependencies:** the harness adds `ai`, `@ai-sdk/mcp`, `@ai-sdk/anthropic` and `@ai-sdk/fireworks`. They are pinned to exact versions and upgraded deliberately, as the Agent SDK was.

## 5. Related

- Related ADRs: [ADR-003](ADR-003-experiment-protocol.md) (the protocol this runtime serves; §2.4 already keeps hooks off, and §2.2 defers the memory arm).
- Supersedes in part: [ADR-002](ADR-002-client-otel-trace.md) §2.2 (the Agent SDK as the trace source and its `query()` options), §2.4 (`ttftMs` is no longer measured), §2.5 (`costUsd` taken from the SDK's result) and §4 (the pre-1.0 package consequence), and [ADR-003](ADR-003-experiment-protocol.md) §2.1's first sentence (the player is Claude Code through the Agent SDK). Models and roles in ADR-003 §2.1 are unchanged. Both carry a matching amendment.
- Design notes: `design/notes/agent-player-options.md` (the player options considered before ADR-003), the spike log `spikes/fireworks/log.md`.
- Specs: specs/007-ai-sdk-runtime

## 6. Amendments

- **2026-10-10, model names are recorded in canonical form.** Section 2.2 named the accepted forms but left the recorded form open, and the spike recorded a Claude model bare (`claude-sonnet-5-5`) beside a prefixed Fireworks model. Runs now record `<provider>/<model>` for every provider. The early runs are few (Claude runs were expensive), so reading a bare Claude id as `anthropic/…` in them is cheap and no migration of run folders is made.
- **2026-10-11, two parity guards found by the first live checks.** Section 2.7 now includes: a role is asked again, up to three attempts in all, when its answer fails the caller's own schema, because a provider's structured-output mode does not enforce every limit (Anthropic's does not enforce string lengths) and the earlier runtime retried such answers; the follow-up names the problem by field path and limit, never by the answer's text. Section 2.8 now includes: a run ends as an error when a response's warnings say a pinned setting was not applied, because the SDK drops a setting a model does not take (a temperature on Claude Sonnet 5.5) with a warning and the run would not be the one recorded.
