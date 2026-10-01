# Contract: experiment summary

`runs/<experiment>/summary.json`, written by hand before the first trial. The report refuses to run
without it. JSON.

```json
{
  "experiment": "faithful-1",
  "priorFit": "faithful",
  "world": "worlds/minecraft-inspired.json",
  "counterpart": "worlds/generated/minecraft-inspired-7.json",
  "models": { "teacher": "claude-sonnet-5-5", "student": "claude-haiku-4-5-20251001" },
  "goals": { "learn": ["wooden_pickaxe", "stone_pickaxe"], "heldOut": "iron_pickaxe" },
  "arms": [
    { "label": "T0", "model": "teacher", "recorded": true },
    { "label": "S0", "model": "student", "recorded": false },
    { "label": "S1", "model": "student", "recorded": false, "skill": true },
    { "label": "S2", "model": "student", "recorded": false, "skill": true,
      "promptNote": "A skill for this kind of task is available; load it before exploring." }
  ],
  "trials": { "calibration": 5, "teacherPerLearnGoal": 3, "armHeldOut": 10, "armPerLearnGoal": 3 },
  "turnBudget": 80,
  "spendLimitUsd": 60,
  "manualSteps": ["record teacher runs", "generate skill", "review skill", "create workspace", "retire workspace"],
  "workspace": { "id": null, "createdBy": "experiment", "retired": null },
  "skill": null
}
```

Rules:
- Written once, before any trial. The fields `workspace` and `skill` are filled in later as the steps
  happen; no other field changes after the first trial.
- `promptNote` is stored verbatim and must equal the `promptNote` recorded in the S2 runs' scores.
- `workspace.id` is the id of a workspace this experiment created. The retire step refuses any other id,
  including the one development sessions use.
- Every `manualSteps` entry names a step carried out by hand. The report lists them.
