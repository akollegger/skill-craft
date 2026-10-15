# Changelog: distiller prompt

The instructions of the `bespoke-one-shot` harness (ADR-008, spec 009): one model call over recorded runs that returns one skill. A change to its wording is a new version here and a new process version for that harness. It carries no placeholders: the recordings are given in the call's prompt.

## v1

Neutral instructions: use only what the recordings support; say what was found and how, what failed and what refusals said; state a rule only with the recordings that show it; cite every claim by run and call; name the skill, describe when to load it, and list the evidence. It names no world, goal or finding of this project.
