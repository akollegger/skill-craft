# Contract: The Provider Table

What a provider integrator adds, what the harness refuses, and what a provider must show before it is admitted.
Fields are in [data-model.md](../data-model.md).

## Adding a provider

1. Add the provider's package to `package.json`.
2. Add one row to the table in `src/harness/providers.ts`.
3. Nothing is needed for cost. A cost comes from the provider if it reports one, else from a pin in `prices.json` if there is one, else from a market quote if the model has an alias to an OpenRouter id (FR-046, FR-051), else it is absent and the run records `costUsd: null` and its tokens.
4. Add the key's name to `.env.example`.

Nothing else changes: not the player, the roles, the trace, the scorer or the exporter (SC-003).

## Refusals (before any spend)

| Condition | Result |
|---|---|
| Spec whose prefix is not a row | `UnknownProvider`: `provider 'x' is not available; the providers are anthropic, fireworks` |
| Row with `routed: true` and no `pinnedBackend` | `BackendNotPinned`: `provider 'x' routes one model across backends; its table entry must pin the backend` |
| A pinned setting the row refuses for the model | `SettingRefused`: `model 'm' does not take setting 'temperature'` |
| The key's variable is unset when a run starts | the run ends with `DriverFailed: the player reported api_key_missing`; the message names the variable, never a value |

Messages are fixed text. None quotes a response body or a key.

## Admission probe

Admission is the result of one command, `pnpm dev spikes/fireworks/probe-tools.ts` with the provider's spec (and
`probe-schema.ts` for the answer check), which a person reads. For a model of the provider it records:

- a valid tool call to each craft tool, and whether several calls arrive in one turn;
- an answer that validates against the critic and reviser schemas under the provider's structured-output mode;
- whether reasoning arrives in a separate field, and whether it must be sent back between turns;
- which settings the provider refused (temperature, effort, thinking);
- the usage fields it reports (cache reads and writes, reasoning tokens);
- whether it has a usage report to compare against, and if so that one batch matched exactly.

The findings are written to the spike log or a design note, and the row's `settings` and `usageReport` fields come from them.
A provider without a usage report is admitted without the comparison (FR-014). The comparison is a procedure a person runs and records in `design/notes/provider-admission.md`; the harness does not enforce it in code.

## Routed providers

A router (one model name served by several backends) is admitted only when its row pins the backend: fallbacks disabled and the order
fixed, and the backend the response reports recorded in `model.backend`. No router is admitted by this feature. The rule is built
and tested with a scripted router so that admitting one later is a row and its probe.
