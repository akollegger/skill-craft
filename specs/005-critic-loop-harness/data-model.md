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
- `callCount`, used to check a cited call number exists

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
only; at most 64 KB in all and 32 KB for any one file; no absolute paths or `..`. `sha256` is the hash of `SKILL.md` (the same fingerprint the
installer uses). A *revised* package is exactly `SKILL.md` and `references/provenance.md`; `SKILL.md` must not match
the citation pattern (`run <digits> call <digits>` or `call <digits>`).

## Rubric

`version`, `sha256` of the file, `questions[]` (`id`, `text`), `criticInstructions` and `reviserInstructions`. Ids are
unique, lowercase, and become the keys of the verdict. Six questions at version 1. One file, one version and one hash
cover the questions and the instructions to both roles. The reviser's instructions state the rules in FR-015, FR-016 and
FR-026; the critic's state the `cannot_determine` rule (FR-014).

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
`sourceCalls` entry looks like `run NNN call N`, names a run in the loop, and names a call number that exists in that
run's recording. At least one change is required. The harness appends a `## Change record` section to the provenance file (every change and its checked sources). A change with an empty `sourceCalls` is allowed: the harness appends an `## Uncited changes` section
listing it to the provenance file, below the reviser's own text, for the next critic to judge (FR-026). Invalid output
is `RevisionInvalid`.

## Round

- `n` (1 to 3), `skillSha256` (what the critic reviewed), `verdict`, and, if revised, `revision`, `diff` (unified, from
  the text this round's critic reviewed to the text the reviser produced), `revisedSha256` (the next round's
  `skillSha256`)
- `critic`, `reviser`: stage measurements (see below)

## Stage measurement

`stage`, `startedAt`, `endedAt`, `durationMs`, and for roles `model`, `requestedModel`, `tokens` (input, output,
cache read, cache creation, each possibly null), `costUsd` (possibly null). Null means the player did not report it.

## Loop record

The folder `loops/<label>/` (see `contracts/loop-record.md`); its `loop.json` holds: `label`, `rubric` (`version`, `sha256`), `models` (`critic`, `reviser`, each requested and resolved), `mode`
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
