# Contract: experiment summary

`runs/<experiment>/summary.json`, written by hand before the first trial. The report refuses to run
without it. JSON.

```json
{
  "experiment": "faithful-1",
  "priorFit": "faithful",
  "world": "worlds/minecraft-inspired.json",
  "counterpart": "worlds/generated/minecraft-inspired-7.json",
  "models": {
    "teacher": "claude-sonnet-5-5",
    "student": "claude-haiku-4-5-20251001",
    "settings": { "anthropic/claude-sonnet-5-5": { "thinking": "adaptive", "effort": "high" }, "anthropic/claude-haiku-4-5-20251001": { "thinking": "off", "temperature": 0 } }
  },
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

_Amended 2026-10-12 (ADR-003 §2.1, spec 007 FR-040): a summary may declare `cast` instead of `models`: `{ "teacher": { "model": "...", "settings": {} }, "student": { ... }, "distiller": { "service": "nams", "critic": { "model": "...", "settings": {} }, "reviser": { ... } } }`. Settings belong to the role, and one model may fill several roles. The `models` form above is still read as the same cast. Not yet implemented._

Rules:
- `counterpartGoals` maps each goal of the invented counterpart to the faithful goal it stands for (the renamer
  keeps goal order). The report shows and compares counterpart rows under the faithful goal.
- `labels` maps every run label folder the report may read to its stage (`calibration`) or its arm. The
  report refuses a folder that is not listed, so a stray folder cannot change a result. The world a row ran on
  comes from the prior fit stamped in each run, not from the label.
- Fixed before calibration: `experiment`, `priorFit`, `world`, `counterpart`, `models` (with the optional `models.settings`: thinking, effort and temperature pinned per model, added by spec 007; absent means none were pinned), `arms` (with the
  prompt note), `labels`, `counterpartGoals`, `goals`, the calibration trial count, `turnBudget`,
  `spendLimitUsd` and `manualSteps`.
- Added after calibration and before the first teacher or arm trial: `roles` (from the calibration rule in
  ADR-003), `route`, `primary`, and the teacher and arm trial counts. The report prints role proposals while
  `roles` is absent.
- Once a teacher or arm trial has run, only `workspace` and `skill` change, as those steps happen.
- `route` and `primary` are declared after calibration under the escalating route, and the report says so.
- `roles` covers every goal in `goals.set`; a held-out goal is also given the role calibration measured
  for it (a held-out goal that is `solved` makes transfer unmeasurable).
- `promptNote` is stored verbatim and must equal the `promptNote` recorded in the S2 runs' scores.
- `workspace.id` is the id of a workspace this experiment created. The retire step refuses any other id,
  including the one development sessions use.
- Every `manualSteps` entry names a step carried out by hand. The report lists them.
