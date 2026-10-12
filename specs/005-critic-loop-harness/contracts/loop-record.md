# Contract: the loop folder

```text
loops/<label>/
├── loop.json                  # the record (below)
├── workspace.json             # runs mode only: { id, name, createdBy: "loop", retired }
├── generation.json            # runs mode only: runId, skillId, format, status, failure, gates, capabilities as returned.
│                              #   Beside the package folder, not in it: the archive is untrusted and may hold a file of that name
├── candidate/                 # runs mode: the package exactly as downloaded (its own files, whatever they are called)
│   └── ...
├── rounds/
│   └── 01/
│       ├── reviewed-skill.txt # the SKILL.md text the critic reviewed (no case variant of SKILL.md: not installable)
│       ├── provenance.md      # the provenance file reviewed, if any
│       ├── verdict.json       # the critic's verdict plus rubric version and sha256
│       ├── revision.json      # if revised: changes[] and the new sha256
│       └── diff.patch         # if revised: unified diff from this round's text to the revised text
└── skill/                     # only when the outcome is accept
    ├── SKILL.md
    └── references/provenance.md
```

_Amended 2026-10-12 (spec 007 FR-033 to FR-037): `loop.json` also holds the fields below, written next to the original ones. They are hashes, settings and identifiers, never recorded text. A value that is not known is `null`, and a loop with no recorded runs has `recordedRuns: []`._

```json
{
  "process": { "version": "1", "commit": "<40 hex> | null", "dirty": true, "changesSha256": "<hex> | null" },
  "recordedRuns": [
    { "label": "001", "run": "runs/faithful-1-t0-stone/001", "runLogSha256": "...", "scoreSha256": "...", "models": ["anthropic/claude-sonnet-5-5"], "settings": { "temperature": null, "effort": "medium", "thinking": "adaptive" } }
  ],
  "recordingFormat": "placeholder | null",
  "roles": {
    "critic": { "requested": "...", "resolved": ["..."], "settings": { "temperature": null, "effort": null, "thinking": null } },
    "reviser": { "requested": "...", "resolved": ["..."], "settings": null }
  },
  "spend": { "costUsd": 0.0, "pricedStages": 0, "unpricedStages": 0, "tokens": { "input": null, "output": null, "cacheRead": null, "cacheCreation": null } },
  "finalSkillSha256": "<hex> | null",
  "candidate": { "generation": { "runId": "...", "skillId": "...", "format": "prose", "status": "...", "gates": {}, "request": { "scope": "conversations", "conversations": 1, "procedureFormat": "prose" } }, "capabilities": {} }
}
```

`process.version` is `PROCESS_VERSION` in `src/loop/process.ts`, explained in `design/notes/skill-process.md`. `dirty` is true when the tree
had changes, and `changesSha256` hashes the diff against the commit and the list of changed files (an untracked file's contents are not
in it). `recordingFormat` is null when a candidate was given. `candidate` is present only when the candidate was distilled from the runs.

The list below is the original.

## loop.json

```json
{
  "label": "...",
  "mode": "runs | candidate",
  "runs": ["runs/faithful-1-t0-stone/001", "..."],
  "rubric": { "version": "1", "sha256": "..." },
  "models": {
    "critic": { "requested": "...", "resolved": ["..."] },
    "reviser": { "requested": "...", "resolved": ["..."] }
  },
  "rounds": [
    { "n": 1, "skillSha256": "...", "overall": "revise", "revisedSha256": "..." },
    { "n": 2, "skillSha256": "...", "overall": "accept" }
  ],
  "outcome": "accept | reject",
  "reason": "round limit reached | <code: fixed message> | ...",
  "stages": [
    { "stage": "record-run-001 | wait-extraction | generate | download | critic-1 | reviser-1", "durationMs": 0, "model": "...", "tokens": { "input": null, "output": null, "cacheRead": null, "cacheCreation": null }, "costUsd": null }
  ],
  "cancelled": false
}
```

## Rules

- The folder and `workspace.json` are created before the workspace is, so a crash cannot lose the id; `retired` is set
  after deletion.
- Paths are repository-relative when inside the repository, as `toRepoPath` does; no user name appears in a record.
- No timestamps in the per-round files; times and durations live in `stages`.
- The loop reads run folders and never writes into them or into any other loop's folder.
- Agent-authored text appears only in `rounds/*` and `skill/`, and only as the schema's fields.
- A rejected loop has no `skill/`; round snapshots use `reviewed-skill.txt` (not any case variant of `SKILL.md`, since macOS ignores case), so none of them installs through `--skill`.
- `references/provenance.md` ends with harness-generated sections after the reviser's own text: `## Change record` (every change with the
  sources the harness checked) and, when any change had no source, `## Uncited changes`.
- A run folder outside the repository is recorded as `(outside the repository)/<name>`, never as an absolute path.
- The accepted `skill/SKILL.md` hash equals the last round's `skillSha256`, `finalSkillSha256`, and the `skill.sha256` a student run's `score.json` records. That last one finds the record that made a skill: search `loops/*/loop.json` for it (quickstart E in spec 007).
- The provenance never goes inside `skill/`, so a student given the skill is not given how it was made.
