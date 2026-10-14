# Contract: the cast and the report

## Experiment summary

```json
"cast": { "harness": { "name": "nams-reviewed", "roles": { "critic": { "model": "anthropic/claude-sonnet-5-5", "settings": {} }, "reviser": { "model": "..." } } },
          "teacher": { "model": "..." }, "student": { "model": "..." } },
"distillation": { "record": "distills/wood-fable-glm/harness.json" },
"promptSet": { "base": "2", "callBudget": 100, "distiller": "1" }
```

An older `cast` with `distiller: { service, critic, reviser }` is read as `harness: { name: "nams-reviewed", roles: { critic, reviser } }`.

## What the report does

1. Reads `distillation.record` (or a legacy `review.json`'s `loop` path); with none, a skill arm is reported with a line "no distillation
   record named" and nothing is refused.
2. When a record is read: checks the harness name against `cast.harness.name`, and each role's requested model, answering model and
   settings against the cast's role entry, and refuses a difference naming it; states which roles share a model (including with the teacher
   or student).
3. Checks that each skill-arm run's `skill.sha256` is one of the record's `skills[].sha256`, and refuses a run that is not.
4. Prints the provenance (contracts/provenance-record.md), including review rounds and verdicts when the harness reviewed.
5. Never requires `review.json` and never refuses a skill arm for a verdict value; the `accept`/`revise`/`reject` gate is gone.
6. Checks `promptSet.distiller` against the record's `prompts.distiller` like the other kinds.
