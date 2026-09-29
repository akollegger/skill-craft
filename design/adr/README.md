# ADRs — Architecture Decision Records

An ADR records the technical **HOW** for one architecturally significant decision: the forces that
make it necessary, the decision itself, the alternatives rejected, and the consequences. ADRs here
are standalone; no parent RFC is needed. An ADR never creates anything under `specs/` itself. That
happens when a `/speckit-specify` call references it.

## Audience

A competent engineer who has just found the project: fluent in agent tooling and graph databases,
but new to this repository. Name each project-specific term on first use (for example, the
*crafting table* is the sim's 2-D grid where items are placed and combined).

Context opens on the technical forces, not on the paperwork. `/adr-create` holds the writing rules;
`/adr-review` checks them.

## Format

Created and updated via `/adr-create`. File: `design/adr/ADR-NNN-short-title.md`, `NNN` zero-padded.

| Front-matter field | Description |
|---|---|
| `id` | `ADR-NNN` |
| `title` | Short descriptive title |
| `status` | `proposed` \| `accepted` \| `rejected` \| `superseded` |
| `created` | ISO date (`YYYY-MM-DD`) |
| `specs` | Speckit feature directories derived from this ADR; maintained by the `speckit-adr-link` hook, do not hand-edit |

Required sections, numbered `##`: 1 Context, 2 Decision (numbered `###` subsections when it has
distinct facets), 3 Alternatives Considered, 4 Consequences, 5 Related.

Use `/adr-review` before moving a draft to `accepted`.

## Index

| ADR | Title | Status | Specs |
|---|---|---|---|
| [ADR-001](ADR-001-crafting-table-world.md) | Grid-based crafting table as the distillation demo world | accepted | |
