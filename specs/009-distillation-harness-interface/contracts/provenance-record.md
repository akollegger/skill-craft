# Contract: the provenance record

`distills/<label>/harness.json` (fields in data-model.md), written by the command from `describe()` and the outcome. Hashes, identifiers,
settings and fixed codes only: never recorded text, a role's free text, a key or a path outside the repository (paths are repository-relative).

## Reading older records

`readProvenance(path)` accepts a `harness.json` or a legacy `loops/<label>/loop.json`. A legacy record is converted: `harness.name =
"nams-reviewed"`, the roles from its `roles`, the service from `distiller.service`, `skills` from `finalSkillSha256` (one skill) when the
outcome was `accept`, `review.rounds` from its `rounds`, `prompts["review-rubric"]` from its `rubric`. A record with a `mode` of `candidate`
(a supplied skill, no distillation) is read with `service: null` and no recorded runs.

## The report prints

The harness, its process version, each role's model and settings, the prompt versions, the service's version and build commit, the stages
and spend, and, for a harness that reviewed, the rounds and verdicts (hashes and verdict values, never text).
