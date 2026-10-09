# Fireworks spike log

## Step 1: catalogue (2026-10-09)

See [models.md](models.md). 14 chat models, all with tool calling; no prices in either API.

## Step 2: tool-calling probe (2026-10-09)

`probe-tools.ts` gave each candidate the craft server's seven tools (read over stdio from `worlds/generated/forge-7.json`)
and asked it to look, check inventory and say "done". `probe-schema.ts` asked for a schema-valid verdict.

| Model | Tool calls | Turns | Structured output | Reasoning returned |
|---|---|---|---|---|
| nemotron-lightning-3p5-30b-a3b | valid, one call per turn | 3 | schema-valid | `reasoning_content`, every turn |
| gpt-oss-120b | valid, one call per turn | 3 | schema-valid | `reasoning_content` on tool turns |
| glm-5p3 | valid, two parallel calls in one turn | 2 | schema-valid | `reasoning_content` on the tool turn |

Findings:

- The OpenAI-style `tools` / `tool_calls` / `role: tool` loop works as is with the MCP tool schemas; no schema
  translation was needed. All argument JSON parsed.
- A tool-call turn took 0.3 to 1.7 s. Calls with no reasoning tokens were quickest.
- **Reasoning arrives in a separate `reasoning_content` field** on most turns. It is separate from `content`, so a
  driver can drop it before anything is written (the privacy rule), and only the token counts are kept. Passing
  the whole assistant message back on the next turn worked, so the field need not be stripped for the call to work.
- **Usage is reported per call**: `prompt_tokens`, `completion_tokens`, `reasoning_tokens` (some models), and
  `cached_tokens`. The cache is automatic for two models (a hit on turn 2); glm-5p3 showed none. Cache reads map
  to `cacheReadTokens`; there is no cache-creation figure, so that is `null`.
- `response_format: json_schema` with `strict: true` gave valid answers on all three, so a `RoleDriver` needs no
  prompt-based JSON fallback for these models.
- Not tested: a real game, a long run, rate limits, and how the models behave when a call is refused.

Implication for step 3: nothing here needs the Agent SDK. The custom loop (step 4) looks small. Step 3 (an
Anthropic-compatible endpoint) is now only worth the hour if there is a reason to keep the native `Skill` tool.

## Decision and step 4: move the harness to the AI SDK (2026-10-09)

Build-vs-adopt: adopted the Vercel AI SDK (`ai` 7, `@ai-sdk/mcp`, `@ai-sdk/anthropic`, `@ai-sdk/fireworks`). Mastra
wraps the same layer and brings its own memory; Effect would be a style rewrite; the Claude Agent SDK cannot drive
Fireworks. Step 3 (an Anthropic-compatible endpoint) was skipped as unnecessary.

Moved everything, Claude arms included, so every arm shares one loop and only the model changes:

- `src/harness/ai-driver.ts` replaces `sdk-driver.ts` (player and role driver); `ai-options.ts` holds the tested
  mapping; `models.ts` parses `claude-…` / `fireworks/<model>` and prices tokens from `prices.json`.
- The trace is unchanged: the driver reports the request and tool events in the shape `TraceRecorder` already reads.
- A skill is a `Skill` tool that returns its text (no native Claude Code skill), so `skillInvoked` and
  `skillLoadedAfterCalls` still work.
- Removed: `@anthropic-ai/claude-agent-sdk`, `--record` (the NAMS hooks were Claude Code hooks), `sdk-options.ts`.
- Cost is now computed, not reported: null for a model with no `prices.json` entry (Fireworks has none yet).

First live run: `fireworks/nemotron-lightning-3p5-30b-a3b`, goal glirol on forge-7, 40 turns. It ran end to end
(80 trace lines, 40 log entries, 48 s, 10.4k input / 4.5k output tokens, 218k cache-read) and did not reach the
goal (36 calls against a best of 3) - a plausible baseline for a 3B-active model, not yet a result.
