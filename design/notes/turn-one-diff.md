# Turn-1 diff: what the model is sent, old runtime against new

Status: 2026-10-12, with the old runtime's extra text captured (see "What the extra blocks said"). Free to produce: no model was called. Old shapes are from the request-shape forwarder used during the migration (shape only: keys, counts, sizes, never content); new shapes from a local sink that logs the same fields and answers 400, with the real driver, the calibration settings and a made-up key.

| Field | Claude Code runtime (old) | AI SDK runtime (new) | Note |
|---|---|---|---|
| System prompt | 2 blocks, 143 chars: a billing/version header line and "You are a Claude agent, built on Anthropic's Claude Agent SDK." | none | Known and recorded in ADR-006 Consequences |
| First user message | Sonnet: 2 text blocks (570 + 468). Haiku: 6 blocks (983 + 176 + 86 + 569 + 65 + 468) | 1 block (468 = the base prompt) | The 468-char block is our prompt in both. The rest is Claude Code's own context, listed below |
| Tool names | `mcp__craft__look` ... | `look` ... | The model sees different names |
| Tool schemas | `{"type":"object","properties":{}}` (33 chars) | same plus `additionalProperties:false` (62) | Harmless |
| Thinking, Haiku | enabled, budget 31999 | enabled, budget 31999 | Matches |
| Thinking, Sonnet | adaptive, effort medium | adaptive, effort medium | Matches |
| `max_tokens`, Haiku | 32000 | 64000 | Output cap only |
| `max_tokens`, Sonnet | 128000 | 128000 | Matches |
| Other keys | `metadata`, `context_management` | `cache_control` (top level), `tool_choice: auto` | `context_management` is Claude Code's; effect on long runs unknown |
| Settings sources | none loaded (`settingSources: []`), no built-in tools, craft server has no MCP `instructions` | not applicable | So the extra old blocks are not a CLAUDE.md or server text |

## What the extra blocks said

Captured by pointing the old Agent SDK at a local sink that logged the system and first user message and answered 400 (no model was called; the key was a made-up one). The texts are Claude Code's own and are not reproduced here.

- **Both models** got a block giving the account's email address and saying it is "context attached automatically". The email is the operator's own. It reached the player's context on every old run and is not in any file the harness wrote.
- **Haiku 4.5 also got** four more blocks: an environment block (working directory, git status, platform, shell, OS version, and a scratchpad directory it was told to use for temporary files, although it had no tools), a line naming its model and knowledge cutoff, a line stating a token budget (15,000,000 tokens left), and today's date.
- **Sonnet 5.5 got none of those four.** Claude Code adds them per model, so the old context differed between the two models, and the old Haiku was told things the old Sonnet was not.
- The date, token budget, working directory and OS vary from run to run, so the old context was not a fixed baseline.

## What it means

- Nothing here shows the new request is wrong, and thinking and effort match what the old runtime sent.
- Two differences could plausibly move a model's behaviour: Claude Code's extra context blocks in the first user message, and the tool names. Neither can be tied to Haiku's stone and iron differences from shapes alone.
- Of the old extra text, only the Haiku blocks look able to change behaviour: the self-identification, the stated token budget and the environment block. The email and date block is inert for a crafting task. Sonnet's cells match across runtimes, which fits Sonnet having had almost none of it; Haiku's wooden cell matches and its stone and iron cells differ, which fits (but does not show) Haiku having had the extra text.
- The skill arm is not covered: no old capture had a skill, so how the native skill listing reached the model (probably one of the extra blocks) is not compared with the Skill tool's description.

## To close it

Done: the extra blocks were captured. What remains is a test, a real spend: Haiku on the stone cell with the old Haiku context added to the prompt, and with the `mcp__craft__` tool-name prefix, against the current runtime. Adding the text would be a change to the base prompt, which ADR-003 keeps fixed across arms, so it is a diagnostic, not a candidate fix.

## Addendum 2026-10-12: the request headers

The shapes above left out headers. The old runtime's `anthropic-beta` header (feature names only) held, for Haiku: `interleaved-thinking-2025-05-14`, `thinking-token-count-2026-05-13`, `context-management-2025-06-27`, `extended-cache-ttl-2025-04-11`, `prompt-caching-scope-2026-01-05` and Claude Code's own flags; for Sonnet the same plus `effort-2025-11-24`, `mid-conversation-system-2026-04-07` and `per-turn-control-2026-07-01`. The AI SDK sent none of them. The first matters for behaviour: with a thinking budget, Haiku reasons between tool results only when `interleaved-thinking-2025-05-14` is sent, and it is now sent (ADR-006 amendment; `design/notes/runtime-recalibration.md`). The others are untried here.

