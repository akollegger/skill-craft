# Role parse rate: AI SDK against the earlier runtime (tier 1)

Spec 007, task T052. Measured 2026-10-11. Equivalence with the Claude Code runtime is checked at two tiers and not proven by
either; this is tier 1 (a component), and `runtime-recalibration.md` is tier 2 (end to end).

## Why it was measured

The first live critic-loop check on the AI SDK roles failed: a Haiku critic's answer did not match the verdict schema
(`VerdictInvalid`). Verifying that the migration kept the roles working took four steps, in this order.

## 1. Diagnosis (structure only; no answer text was printed)

`spikes/role-eval/diagnose-verdict.ts` and `diagnose-reviser.ts`.

- The AI SDK sends Anthropic's **native structured output** (`output_config.format = json_schema`). The provider strips the
  schema keywords Anthropic does not support, so `minLength`, `maxLength` and `maxItems` are **not sent** (only `enum` is) and the
  decoder never enforces the loop's length limits. All six Haiku critic attempts failed on length limits (`too_big`) only.
- The earlier runtime's request shape was captured through a local forwarder that logged keys, tool names and counts, never content
  (`spikes/role-eval/` notes below). It differed from the AI SDK's in three ways:
  1. **Thinking was on**: `thinking: {type: enabled, budget_tokens: 31999}` with `max_tokens: 32000` for Haiku 4.5, and
     `thinking: {type: adaptive}` with `output_config: {effort: medium}` for Sonnet 5.5. The same held for the earlier *player*
     runs, so every Claude result from the Claude Code era was measured with thinking on. The AI SDK driver sent no thinking.
  2. **Structured output went through a `StructuredOutput` tool** with a `tool_result` round trip, so the answer was validated and
     could be corrected within the call. The AI SDK driver made a single call.
  3. A short Claude Code system stub and a few context blocks, which have no counterpart here.
- The reviser's failures were not about length. Without thinking, Haiku wrote `SKILL.md` without front matter and cited sources
  in a form other than `run NNN call N` in 19 of 20 answers.

## 2. The measurement

`spikes/role-eval/parse-rate.ts`: one fixed recording (a 33-call teacher run of `glirol`, `runs/rt-teacher/005` from the live
check), the real critic and reviser prompts, 20 calls per role per model, schema-valid rate with its 95% Wilson interval.
The earlier runtime was run from a checkout of commit `39c4fcf` (`--driver sdk`).

| Driver, model, role | First attempt valid | Final answer valid |
|---|---|---|
| earlier (Claude Agent SDK), Haiku, critic | not separable (retries are inside the SDK) | 20/20 = 100% [84, 100] |
| earlier (Claude Agent SDK), Haiku, reviser | not separable | 13/20 = 65% [43, 82] |
| AI SDK as first shipped, Haiku, critic | 8/20 = 40% [22, 61] | 20/20 = 100% [84, 100] (after the driver's retry) |
| AI SDK as first shipped, Haiku, reviser | 0/20 = 0% [0, 16] | **3/20 = 15% [5, 36]** |
| AI SDK as first shipped, gpt-oss-120b, critic | 20/20 = 100% [84, 100] | 20/20 = 100% |
| AI SDK as first shipped, gpt-oss-120b, reviser | 11/20 = 55% [34, 74] | 20/20 = 100% [84, 100] |
| **AI SDK with the fix, Haiku, critic** | 6/20 = 30% [15, 52] | **20/20 = 100% [84, 100]** |
| **AI SDK with the fix, Haiku, reviser** | 12/20 = 60% [39, 78] | **20/20 = 100% [84, 100]** |

The first shipped driver was **clearly below** the earlier runtime for the Haiku reviser (15% [5, 36] against 65% [43, 82]; the
intervals do not overlap). With the fix the AI SDK driver is at parity for the critic and at or above it for the reviser.

## 3. The fix (test first)

1. **A bounded retry on the caller's own schema** (FR-019): up to three attempts, the problem named by field path, limit and the
   schema's own fixed rule wording, never by the answer's text. It alone rescued the critic (40% to 100%) but not the reviser.
2. **Thinking and role settings** (FR-021): `thinking` accepts a token budget (refused for the models that removed budgets, and a
   temperature other than 1 is refused beside one, as Anthropic requires), roles take settings, and `critic-loop.ts --settings
   <file>` passes them, so a role runs the way its model was calibrated. The Haiku budget of 31,999 matches the earlier runtime.
3. Tried and not used: the provider's tool-based structured-output mode helped without thinking (2 of 6 first-attempt valid against
   0 of 20) but cannot be combined with thinking (the API refuses forced tool use with thinking).

## What this does and does not show

- **One recording, one candidate skill, one model for the comparison.** The earlier runtime was measured for Haiku only, and
  `gpt-oss-120b` only on the new driver. Sonnet roles were not measured.
- **20 calls per cell.** The intervals are about 20 points wide. "At or above" means the intervals do not show a shortfall; it
  does not show the two drivers are the same.
- The earlier driver returns one result per call with its retries inside the SDK, so its first-attempt rate cannot be compared with
  the AI SDK driver's first-attempt rate, only the final answers.
- Cost per call was similar: about US$0.05 to 0.07 on the AI SDK with thinking, 0.08 to 0.10 on the earlier runtime. About
  US$9 was spent on this verification in all (evals, diagnosis calls and the forwarder checks).
