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
  "route": "escalating",
  "primary": "repair",
  "goals": { "set": ["wooden_pickaxe", "stone_pickaxe", "iron_pickaxe"], "heldOut": ["iron_pickaxe"] },
  "roles": { "wooden_pickaxe": "solved", "stone_pickaxe": "gap", "iron_pickaxe": "solved" },
  "arms": [
    { "label": "T0", "model": "teacher", "recorded": true },
    { "label": "S0", "model": "student", "recorded": false },
    { "label": "S1", "model": "student", "recorded": false, "skill": true },
    { "label": "S2", "model": "student", "recorded": false, "skill": true,
      "promptNote": "A skill for this kind of task is available; load it before exploring." }
  ],
  "counterpartGoals": { "drinefoun": "wooden_pickaxe", "zibael": "stone_pickaxe", "plaevratael": "iron_pickaxe" },
  "labels": {
    "faithful-1-cal-faithful-haiku-iron": { "stage": "calibration" },
    "faithful-1-t0-stone": { "arm": "T0" },
    "faithful-1-s0-iron": { "arm": "S0" },
    "faithful-1-s1-iron": { "arm": "S1" },
    "faithful-1-s2-iron": { "arm": "S2" }
  },
  "trials": { "calibration": 5, "teacherPerRecordedGoal": 3, "armGap": 10, "armSolved": 3, "armHeldOut": 3 },
  "turnBudget": 80,
  "spendLimitUsd": 60,
  "manualSteps": ["record teacher runs", "generate skill", "review skill", "create workspace", "retire workspace"],
  "workspace": { "id": null, "createdBy": "experiment", "retired": null },
  "skill": null
}
```

Rules:
- `counterpartGoals` maps each goal of the invented counterpart to the faithful goal it stands for (the renamer
  keeps goal order). The report shows and compares counterpart rows under the faithful goal.
- `labels` maps every run label folder the report may read to its stage (`calibration`) or its arm. The
  report refuses a folder that is not listed, so a stray folder cannot change a result. The world a row ran on
  comes from the prior fit stamped in each run, not from the label.
- Written before any teacher or arm trial. `roles` is added after calibration and before the first teacher
  or arm trial, from the calibration rule in ADR-003. The fields `workspace` and `skill` are filled in
  later as the steps happen; no other field changes once a teacher or arm trial has run.
- `route` and `primary` are declared after calibration under the escalating route, and the report says so.
- `roles` covers every goal in `goals.set`; a held-out goal is also given the role calibration measured
  for it (a held-out goal that is `solved` makes transfer unmeasurable).
- `promptNote` is stored verbatim and must equal the `promptNote` recorded in the S2 runs' scores.
- `workspace.id` is the id of a workspace this experiment created. The retire step refuses any other id,
  including the one development sessions use.
- Every `manualSteps` entry names a step carried out by hand. The report lists them.
