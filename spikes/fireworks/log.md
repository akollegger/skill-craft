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
