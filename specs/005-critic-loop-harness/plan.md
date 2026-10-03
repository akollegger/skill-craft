# Implementation Plan: Critic Loop in the Harness

**Branch**: `005-critic-loop-harness` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-critic-loop-harness/spec.md`

## Summary

Turn the critic-loop spike into a command. From the folders of one or more finished teacher runs, the harness
records them to a disposable NAMS workspace, has NAMS distill a candidate skill, downloads it, retires the
workspace, then runs up to three rounds of critic review and in-place revision, and writes a loop record. An
accepted skill is a plain folder that the existing `--skill` option installs.

The design choice that carries most of the spec: the critic and the reviser are **text-in, typed-answer-out**
sessions with **no tools**. The harness puts the recordings and the skill text in the prompt and reads the answer
back as a schema-checked object. An agent that has no file or shell tool cannot read the world, the goals, the
solver output or an earlier verdict, so blindness (FR-010) is a property of the call, not a rule in a prompt.
The reviser returns the revised files as text and the harness writes them. Both go through one new narrow seam
(`RoleDriver`) next to the existing `AgentDriver`, so tests use scripted roles and no test calls a model.

New code is a `src/loop/` module (no SDK, no engine change), one new function in `src/harness/sdk-driver.ts`, a
script, a gitignored `loops/` folder, and an extension of the privacy test. Nothing in `src/sim/`, `src/mcp/`,
`run.jsonl` or the run folder format changes.

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node 22+ (CI runs 22 and 24)

**Primary Dependencies**: zod 4 (schemas, and `z.toJSONSchema` for the SDK's structured-output option),
`@modelcontextprotocol/sdk` (the NAMS workspace tools and the in-memory craft server for replay),
`@anthropic-ai/claude-agent-sdk` (pinned; imported only in `src/harness/sdk-driver.ts`); no new dependency (R6, R10)

**Storage**: files. A loop writes one folder under `loops/<label>/` (gitignored); run folders are only read

**Testing**: vitest, scripted roles, a scripted stand-in for NAMS, a fixture zip; no test uses the network or a model.
The existing live-SDK test pattern (`test/live-sdk.test.ts`, skipped by default) gets one live role check

**Target Platform**: macOS and Linux developer machines and CI

**Project Type**: single project (library and CLI scripts); the loop is a script plus a module

**Performance Goals**: a loop on the 13-call stone-pickaxe recordings finishes in under 15 minutes excluding the
distiller's processing wait (SC-008); the spike's roles took 35 to 55 s each

**Constraints**: no randomness or clock in the engine or the run log (the loop's own timings use the clock, in the
harness, as the run measurement does); agent text and reasoning never reach a trace, summary, score, bundle or
`reason` (loop folders are the one designated place, R11); a `reason` is `code: fixed message`; keys only from
`.env` through the environment; the SDK imported in one file

**Scale/Scope**: 1 to a handful of recordings per loop, three rounds, two roles; skill packages of a few small files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Basis |
|---|---|---|
| I. Deterministic, replayable environments | Pass | No engine, server or run-log change. Replay for the recording and the transcript runs on a fresh game and fails on divergence, as scoring does. The clock appears only in the loop's own measurements |
| II. Data-driven worlds | Pass | No world knowledge in the loop. The recording step reads the world only through the craft server the run already used; the roles never see it (R1) |
| III. Discovery over disclosure | Pass | The roles are given only what the agent saw. Transcripts hold tool outputs, which are the surface the existing sweep already proves leak-free. The rubric question on common knowledge answers "cannot be determined" from recordings alone (FR-014) |
| IV. Test first | Pass | Every new module has its tests written first (see tasks to come): schemas, blindness of the role inputs, round control with scripted roles, the workspace guard, the zip reader, the diff, the privacy boundary |
| V. Simplicity | Pass, with two justified in-house utilities | No new mechanic. A minimal zip reader and a line diff are written in place of two dependencies (see Complexity Tracking). The roles have no tools, which removes machinery |
| VI. Secrets hygiene | Pass | The NAMS key is read from the environment and never printed, logged or put in an argument or a record. Workspace creation needs an explicit flag and prints only ids. Recordings contain run transcripts only |
| VII. Decisions before specs | Pass | ADR-003 (§2.4, §2.6, amended 2026-10-03) decides this; no new ADR is needed. Two open items it listed are settled in the spec's Assumptions and in research R7 and R11, and the ADR's follow-up list should be updated when this lands |

The check holds after Phase 1 design.

## Project Structure

### Documentation (this feature)

```text
specs/005-critic-loop-harness/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1 to R18
├── data-model.md        # Phase 1: entities, validation, the loop's states
├── quickstart.md        # Phase 1: how to see it work
├── contracts/
│   ├── cli.md           # the command, flags, exit codes, output lines
│   ├── role-io.md       # the RoleDriver seam, the critic and reviser answers
│   ├── loop-record.md   # the loops/<label>/ folder and loop.json
│   └── nams-seam.md     # the NamsApi seam and the calls behind it
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── harness/
│   ├── role-driver.ts       # types only: RoleDriver, RoleOptions, RoleResult
│   ├── sdk-driver.ts        # + sdkRoleDriver (the one place the SDK is imported)
│   ├── sdk-options.ts       # + roleOptionsFor, roleResultFrom (type-only SDK imports)
│   └── errors.ts            # + loop error classes (code: fixed message)
└── loop/                    # no SDK, no src/sim engine edits
    ├── rubric/skill-review.v1.json   # the versioned questions (R7)
    ├── rubric.ts            # load, validate, hash, version
    ├── verdict.ts           # zod schemas: Verdict (built from the rubric), RevisionOutput
    ├── package.ts           # a skill package as path->text; read a folder, write a folder, SKILL.md hash
    ├── transcript.ts        # run folder -> the recording text the agent saw (replay on a fresh game)
    ├── inputs.ts            # assemble each role's prompt; the blindness boundary lives here
    ├── diff.ts              # line-based unified diff
    ├── loop.ts              # the round controller (pure over RoleDriver; no I/O beyond the record writer)
    ├── record.ts            # loops/<label>/ writer, hashes, measurements, the privacy boundary
    ├── zip.ts               # read-only zip reader on node:zlib (R6)
    ├── nams.ts              # NamsApi seam: real client (REST + MCP workspace tools), guard, lifecycle
    ├── candidate.ts         # record runs, generate, wait, download -> a candidate package
    └── cli.ts               # the command as a function (argv in, lines out, exit code)

scripts/
└── critic-loop.ts           # thin wrapper over src/loop/cli.ts, like run-agent.ts

test/
├── loop-rubric.test.ts      loop-verdict.test.ts      loop-package.test.ts
├── loop-transcript.test.ts  loop-inputs.test.ts       loop-diff.test.ts
├── loop-rounds.test.ts      loop-record.test.ts       loop-zip.test.ts
├── loop-nams.test.ts        loop-candidate.test.ts    loop-cli.test.ts
├── role-options.test.ts     privacy.test.ts (extended) live-role.test.ts (skipped by default)
└── helpers/
    ├── fake-role.ts         # scripted RoleDriver
    └── fake-nams.ts         # scripted NamsApi

loops/                       # new, gitignored: one folder per loop
spikes/critic-loop/          # stays as the record of the spike; transcript.ts is superseded by src/loop/transcript.ts
```

**Structure Decision**: one `src/loop/` module, mirroring how `src/trace/` and `src/viz/` hold a feature's logic
behind a thin script. It imports nothing from the SDK and no engine internals; replay uses the same in-memory craft
server the REST-ingest spike and the transcript script already use. The only edits outside it are the role
seam in `src/harness/`, the loop error classes, `.gitignore`, `AGENTS.md` and the privacy test.

## Complexity Tracking

| Departure | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A read-only zip reader (`zip.ts`, about 60 lines) | NAMS returns a skill as a zip and the loop must read its files | A dependency adds supply-chain surface for one read; shelling out to `unzip` makes CI and Windows behaviour differ |
| A line diff (`diff.ts`, about 50 lines) | FR-017 records the diff between rounds; texts are tens of lines | A dependency for tens of lines; `git diff --no-index` needs git and a temp file |
| A second seam (`RoleDriver`) beside `AgentDriver` | The existing seam is built around the craft server, a run log and a run folder; a role has none of them | Reusing it would force a fake world and tool allowlist onto a call that has no tools |
