# Data Model: Critic Loop in the Harness

Entities from the spec, with fields and the rules that make them valid. Names are the loop's own; the
on-disk shapes are in `contracts/loop-record.md`.

## Recording

One finished run as the agent saw it.

- `runDir`: the run folder it came from (read only)
- `goal`: item and quantity, from the run's prompt and `score.json`
- `world`: the world path as recorded in `mcp.json`
- `model`: the model that ran, from `score.json`
- `prompt`, `calls[]` (`seq`, `tool`, `args`, `ok`, `output`), `finalAnswer`

Rules: the run log replays on a fresh game with each call's `ok`, `crafted` and `error` equal to the logged
values; the trace matches the log one to one. Recordings in one loop share `goal` and `world`.

## Candidate

The first package the distiller produced.

- `package`: a Skill package
- `runs[]`: the run folders recorded
- `workspaceId`, `conversationIds[]`, `generation` (`runId`, `skillId`, `format`)
- `service`: the capabilities response (thresholds), saved verbatim

Or, when started with `--candidate <folder>`, only `package` and a note that no service was used.

## Skill package

A map of relative path to UTF-8 text.

Rules: has `SKILL.md` with a front matter `name` (lowercase letters, digits, hyphens) and a `description`; text files
only; total size under a cap; no absolute paths or `..`. `sha256` is the hash of `SKILL.md` (the same fingerprint the
installer uses). A *revised* package is exactly `SKILL.md` and `references/provenance.md`; `SKILL.md` must not match
the citation pattern (`run <digits> call <digits>` or `call <digits>`).

## Rubric

`version`, `sha256` of the file, and `questions[]` (`id`, `text`). Ids are unique, lowercase, and become the keys of
the verdict. Six questions at version 1.

## Verdict

- `overall`: `accept` | `revise` | `reject`
- `questions`: for each rubric id, `{ value, reason }` (value at most 40 characters, reason at most 400)
- `reasons`: at most 800 characters
- `proposedRevisions`: at most 10 strings of at most 300 characters

Rules: the `questions` keys equal the rubric ids exactly; a value for the common-knowledge question may be
`cannot_determine`. A verdict that fails the schema is an error (`VerdictInvalid`), never a verdict.

## Revision

- `skillMd`, `provenanceMd`: whole files
- `changes[]`: `{ what, why, sourceCalls[] }`

Rules: `skillMd` passes the package rules above and keeps the candidate's `name`; `provenanceMd` is non-empty; every
`sourceCalls` entry looks like `run NNN call N` and names a run in the loop (a fact with no source is allowed and is
listed as uncited in the provenance file for the next critic to judge). Invalid output is `RevisionInvalid`.

## Round

- `n` (1 to 3), `skillSha256` (what the critic reviewed), `verdict`, and, if revised, `revision`, `diff` (unified, to the
  previous round's text), `revisedSha256`
- `critic`, `reviser`: stage measurements (see below)

## Stage measurement

`stage`, `startedAt`, `endedAt`, `durationMs`, and for roles `model`, `requestedModel`, `tokens` (input, output,
cache read, cache creation, each possibly null), `costUsd` (possibly null). Null means the player did not report it.

## Loop record

`label`, `rubric` (`version`, `sha256`), `models` (`critic`, `reviser`, each requested and resolved), `mode`
(`runs` or `candidate`), `candidate` summary, `rounds[]`, `outcome` (`accept` | `reject`), `reason`
(`code: fixed message` for a failed loop; a fixed phrase for a normal reject such as `round limit reached`),
`stages[]`, `cancelled`.

## States of a loop

```text
start ──(runs only)──▶ recording ──▶ generating ──▶ downloading ──▶ reviewing(n=1)
start ──(--candidate)──────────────────────────────────────────────▶ reviewing(n=1)

reviewing(n) ── accept ───────────────────────────────▶ done: accept   (writes skill/)
reviewing(n) ── reject ───────────────────────────────▶ done: reject
reviewing(n) ── revise, n < 3 ──▶ revising(n) ──▶ reviewing(n+1)
reviewing(3) ── revise ───────────────────────────────▶ done: reject (round limit reached)

any state ── error or abort ──▶ done: error/cancelled (record for finished rounds is written)
recording, generating, downloading ── always ──▶ the created workspace is deleted
generating ── no skill produced ──▶ done: reject (reasons recorded, no retry)
```
