# Provider admission findings

Findings for the two providers in the table (`src/harness/providers.ts`), by the procedure in
[spikes/fireworks/README.md](../../spikes/fireworks/README.md) (spec 007, ADR-005 §2.2). Probed 2026-10-11 with
`probe-tools.ts`, `probe-schema.ts` and `probe-settings.ts`; the Fireworks tool and schema findings were first made in the
spike (`spikes/fireworks/log.md`, step 2) and are confirmed here through the harness's own runtime.

## anthropic (key `ANTHROPIC_API_KEY`)

| Check | Result |
|---|---|
| Tool calls | `claude-haiku-4-5-20251001` called `look` and `inventory` together in one turn, then answered. All seven craft tools are reachable |
| Schema answers | critic and reviser answers both parsed against the real schemas (cost about US$0.005 each) |
| Reasoning | no separate reasoning field on Haiku 4.5 (thinking is off by default) |
| Usage fields | `input`, `noCache`, `cacheRead`, `cacheWrite` and `out` reported; cache fields were 0 in the probe because it does not set the cache option (a real run does: 94% cache reads, T037) |
| Model that answered | reported as `claude-haiku-4-5-20251001`, recorded `anthropic/claude-haiku-4-5-20251001` |
| Usage report | none used. The table's `usageReport` is null, so the billing check does not apply |

**Settings** (one tiny call each; "ignored" means the SDK accepted the call but dropped the setting with a warning):

| Setting | `claude-sonnet-5-5` | `claude-haiku-4-5-20251001` | The table says |
|---|---|---|---|
| temperature 0 | **ignored** (the model takes none) | accepted | refuses on Sonnet 5.5, accepts on Haiku 4.5 ✔ |
| thinking adaptive | accepted | **rejected (400)** | accepts on Sonnet 5.5, refuses on Haiku 4.5 ✔ |
| thinking off | **ignored** (thinking cannot be disabled) | accepted | refuses on Sonnet 5.5, accepts on Haiku 4.5 ✔ |
| effort high | accepted | **rejected (400)** | accepts on Sonnet 5.5, refuses on Haiku 4.5 ✔ |

The table's rules matched the provider in all eight cases. The important finding is the word "ignored": for Sonnet 5.5 the
SDK does not fail a call that pins `temperature` or `thinking: off`. It drops the setting and logs a warning, so a run would
go on without a setting it recorded as pinned. Two guards follow from it: the table refuses these before any spend, and the
driver ends a run (`setting_ignored`) when a response's warnings say a pinned setting was not applied, which covers a model
the table does not know.

## fireworks (key `FIREWORKS_API_KEY`)

| Check | Result |
|---|---|
| Tool calls | `gpt-oss-120b` called the tools one per turn and answered; `glm-5p3` called two at once (spike). All seven craft tools are reachable |
| Schema answers | critic and reviser answers both parsed (`gpt-oss-120b`); `nemotron-lightning-3p5-30b-a3b` and `glm-5p3` returned valid JSON in the spike |
| Reasoning | arrives in a separate field and is counted, never stored (`reasoning` tokens reported; 55 on the first turn of the probe) |
| Usage fields | `input`, `noCache`, `cacheRead` and `out` reported; no cache-write figure (recorded as zero, as the trace holds it); cache reads grow turn to turn without being asked for |
| Model that answered | reported as `accounts/fireworks/models/gpt-oss-120b`, recorded `fireworks/gpt-oss-120b` |
| Usage report | `firectl billing get-usage`: tokens per model and API key; no per-model cost. The harness's counts matched it exactly over about 1.95M prompt tokens (spike) and again in the baseline batch |

**Settings:** only `temperature` is mapped, and the probe accepted it. `thinking` and `effort` show "accepted" in the probe
only because the row does not send them; the table says the row does not take them, and refuses them up front.
