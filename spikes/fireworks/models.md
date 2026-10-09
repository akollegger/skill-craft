# Fireworks model catalogue (spike step 1)

Source: `GET /inference/v1/models` (20 entries) plus `GET /v1/accounts/fireworks/models/<id>` for details,
read with `list-models.ts`. Read-only; no inference was run. Listed 2026-10-09.

## Findings

- 20 entries: 14 chat base models, 3 routers (`auto`, `firerouter/auto`, `*-fast` variants), 2 embedding/reranker
  models. Every chat model reports `supports_tools: true`.
- **No prices in either API.** The listing has no pricing field and the model detail's `pricing` is null. Cost
  must come from a hand-kept price table (from the Fireworks pricing page), or be reported as `null`.
- **Structured output** (JSON schema) support is not in the metadata; it is tested in step 2/5.
- The routers pick a model per request, so a run on one would not record a fixed model. Do not use them in
  an experiment; use pinned ids only (ADR-003).
- Ids use the form `accounts/fireworks/models/<name>`.

## Chat models with tool calling

| Model id (after `accounts/fireworks/models/`) | Total / active params | Context | Vision |
|---|---|---|---|
| nemotron-lightning-3p5-30b-a3b | 30B / 3B | 262k | no |
| gpt-oss-120b | 117B / (MoE) | 131k | no |
| glm-5p3-flash | 320B / 18B | 1M | yes |
| minimax-m3 | 428B / 23B | 512k | no |
| deepseek-v4p1-flash | 552B / (MoE) | 1M | yes |
| nemotron-3-ultra-nvfp4 | 549B / 55B | 262k | no |
| glm-5p2, glm-5p3 | 743B / (MoE) | 1M | no |
| inkling | 975B / (MoE) | 1M | yes |
| qwen3p8-2p4t-a95b | 2.4T / 95B | 262k | no |
| kimi-k3, ember-1 (Kimi K3, shorter reasoning) | 2.8T / (MoE) | 1M | yes |
| qwen3p8-max | not reported | not reported | yes |

Routers (not usable as pinned models): `routers/glm-5p2-fast`, `routers/glm-5p3-fast`, `routers/kimi-k3-fast`,
`auto`, `firerouter/auto`.

## Candidates for the next steps

Small, mid and strong, all with tool calling, spread across families:

| Role | Model | Why |
|---|---|---|
| Small student | `nemotron-lightning-3p5-30b-a3b` | 3B active: the closest to "a smaller model that follows instructions" |
| Mid | `gpt-oss-120b` | The oldest and best documented of the set; a stable reference for tool calling |
| Strong / critic | `glm-5p3` (or `kimi-k3`) | Frontier-scale; a different family from the Claude teacher |

`glm-5p3-flash` (18B active) is a second mid-size option if the small model cannot play the game at all.
Active-parameter counts marked "(MoE)" were not reported by the API.
