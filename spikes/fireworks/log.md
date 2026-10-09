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

## Billing cross-check with firectl (2026-10-09)

`firectl billing get-usage` gives per-model token counts (prompt, cached, completion), grouped by UTC day and
optionally by API key. `spikes/fireworks/reconcile.ts` snapshots those counts before a batch and, after it, compares the
difference with the tokens summed from the run folders' `trace.jsonl`:

    pnpm dev spikes/fireworks/reconcile.ts snapshot snap.json
    ... run the batch ...
    pnpm dev spikes/fireworks/reconcile.ts compare snap.json runs/<label>...

Result on `fireworks/gpt-oss-120b`, one 15-turn run: prompt 28159/28159, cached 20538/20538, completion 762/762
(harness/billed), an exact match, so the harness's token and cache accounting is right for Fireworks.

What firectl does not give:

- **No per-model dollar cost.** Rated cost exists only as an account-level daily total, which on this account
  ($1,360+ a day) is dominated by spend that is not ours, so it cannot be used for rough price math.
- `billing export-usage-costs` and `billing list-invoices` are blocked when run by an agent. A person can run them
  in a terminal; the first gives costs by model or API key. `reconcile.ts compare ... --cost <model>=<usd>` turns a
  cost read that way into a blended $/million-token rate, to be copied into `prices.json` by hand.

## Baseline arm comparison (2026-10-09)

Five runs per model, no skill, goal glirol on `worlds/generated/forge-7.json`, 40 turns, the harness's base prompt,
all run at once. Labels `base-<model>` under `runs/` (gitignored). A feasibility look, not a result: five runs a
model, one goal, one prompt, no pinned temperature.

| Model | Reached | Out of budget / gave up | Median calls to goal (best 3) | Time per run | Cost |
|---|---|---|---|---|---|
| fireworks/nemotron-lightning-3p5-30b-a3b | 1/5 | 4 / 0 | 15 | 12-30 s | n/a (no price) |
| fireworks/gpt-oss-120b | 2/5 | 3 / 0 | 21.5 | 9-34 s | n/a |
| fireworks/glm-5p3 | 5/5 | 0 / 0 | 26 | 29-129 s | n/a |
| claude-sonnet-5-5 | 0/5 | 3 / 2 | - | 70-87 s | $3.28 total |

- The Claude baseline of 0/5 agrees with the earlier finding that this base prompt leaves Claude at 0/5 (see the
  open base-prompt decision). The open models do not behave like Claude here: glm-5p3 reached the goal every time,
  after 18-29 calls. Whether that is better exploration or less caution about the irreversible `craft` is not
  known; Claude crafted 2-3 times per run and did not reach the goal.
- **Claude cost is dominated by uncached input**: about 300k input tokens per run and no cache reads, against 90-90%
  cache reads on Fireworks. The AI SDK does not turn on Anthropic prompt caching by itself (it needs a cache
  breakpoint in the request). Enabling it in `ai-driver.ts` should cut Claude cost a lot and is worth doing before more
  Claude runs. It does not change what the model does.
- **Billing cross-check passed for all three Fireworks models**, exactly (prompt, cached and completion tokens), over
  about 1.95M prompt tokens.
- Nemotron and gpt-oss ran out of budget on most runs by repeating cheap calls (36-37 calls, almost no crafts);
  worth a look at one trace before reading anything into "small model fails".
