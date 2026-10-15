# Contract: the skill set schema and layout

`schemas/skill-set.v1.json` (generated). A skill set is a non-empty list of skills; one skill is valid.

## On disk

```text
distills/<label>/skills/
├── skill-set.json          # per skill: name, tags, evidence (run ids and call numbers); never inside a skill folder
├── <skill-name>/
│   ├── SKILL.md            # front matter name and description, then the body
│   └── references/...      # optional
└── <another-skill>/...
```

The root has the layout of a `.claude/skills/` directory, so it can later be given to a run whole. Each skill folder installs as it is with
`run-agent --skill <folder>` today.

## Checks

- Every skill passes the existing package checks (`packageFromFiles`: paths inside the folder, UTF-8, size limits, a `SKILL.md` with a
  usable name and a description).
- Skill names are unique within a set; the sidecar names exactly the skill folders present.
- Reading a written set back gives the same skills, tags and evidence.
