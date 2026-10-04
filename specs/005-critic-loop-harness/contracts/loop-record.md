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
- The accepted `skill/SKILL.md` hash equals the last round's `skillSha256` and the hash a student run's `score.json` records.
