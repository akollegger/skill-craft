# Changelog: base prompt

The player's prompt. A version is never edited; a change is a new file and a new section here. `{turns}` is a step budget (one model
response each) and `{budget}` a tool-call budget (ADR-007).

## v1

Today's prompt, moved out of code unchanged (spec 008). `{what}`, `{item}` and a step budget `{turns}`. It says "unfamiliar workshop",
"use only the craft tools" and "explore", wording whose effect on a baseline is untested (design/notes/critic-loop-findings.md). Every run
before 2026-10-13 used it; its budget is steps, which models read as tool calls (runs/reports/2026-10-13-s3-nine-models.md).

## v2

The neutral wording from `spikes/critic-loop/prompt-reworded.txt` with a budget the agent can count (ADR-007 §2.3): `{what}`, `{item}` and a tool-call budget `{budget}`, stated as every craft-tool call including several made at once. It drops "unfamiliar", "use only the craft tools", "on your own" and "explore", and says nothing about isolation, skills or learning. Its effect on a baseline is measured before an experiment adopts it (spec 008, User Story 3).
