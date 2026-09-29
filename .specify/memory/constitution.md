<!--
Sync Impact Report
- Version change: (unratified template) → 1.0.1 (goals are not part of a world; Principle II
  wording corrected)
- Modified principles: none (initial ratification)
- Added principles: I. Deterministic, Replayable Environments; II. Data-Driven Worlds;
  III. Discovery Over Disclosure; IV. Test-First Rules; V. Simplicity; VI. Secrets Hygiene;
  VII. Decisions Before Specs
- Added sections: Technology & Constraints; Development Workflow
- Removed sections: none
- Templates reviewed (read at runtime, not modified here): plan-template.md, spec-template.md,
  tasks-template.md, checklist-template.md
- Deferred TODOs: none
-->
# skill-distill Constitution

skill-distill demonstrates skill distillation from Neo4j Agent Memory (NAMS): an agent works in a
simulated crafting-table environment, its runs are recorded, a skill is distilled from them, and
later runs with and without that skill are compared. The environment exists to make that
comparison honest and measurable.

## Core Principles

### I. Deterministic, Replayable Environments
The simulation MUST have no randomness and no wall-clock dependence. The same sequence of calls
against the same world MUST always produce the same results. Randomness is allowed only in
tooling that generates world files, and only from an explicit seed.

Rationale: runs are compared by tool calls and failures. That comparison is meaningless if the
environment itself varies between runs.

### II. Data-Driven Worlds
The engine MUST hold no knowledge of any specific world. Items, recipes, grid, stock and hint
level come from validated world files, and swapping a world MUST NOT require a code change.
World files MUST be validated against a schema and for referential integrity before use.

Rationale: fresh vocabulary and perturbed recipes are the main experimental controls, so they
must be inputs, not code.

### III. Discovery Over Disclosure
No tool may reveal a recipe, a solution, or the identity of an item beyond what the world file
puts in play. Error results MUST state the constraint that was violated and MUST NOT state the
fix. Worlds intended for experiments MUST use invented names and category-only descriptions so an
agent cannot answer from prior knowledge.

Rationale: if the agent can answer from what it already knows, memory has nothing to add.

### IV. Test-First Rules (NON-NEGOTIABLE)
Engine behaviour, recipe matching, world validation and the renamer MUST be specified by tests
before they are implemented. Every world file committed to the repository MUST be proven solvable
by an automated check, and the check MUST run in the test suite.

Rationale: an unsolvable or ambiguous world silently corrupts every run recorded against it.

### V. Simplicity
A mechanic earns its place only by what it adds to the with/without-memory comparison. Machinery
that adds logistics without adding something to learn MUST be removed. Prefer the smallest
design that keeps the comparison meaningful; new complexity requires a stated justification in the
relevant ADR.

Rationale: the first implementation buried the learnable procedure under gathering, tiers,
stations and fuel.

### VI. Secrets Hygiene
API keys MUST live only in `.env`, which MUST stay gitignored, with `.env.example` documenting
the names. Keys MUST NOT be printed, logged, written to committed files, or passed as command-line
arguments. Every session in this repository is recorded to NAMS, including tool inputs and
outputs, so command text MUST be treated as visible to everyone with access to that workspace.

Rationale: the recording hooks capture what is typed, and a leaked key or credential is not
recoverable.

### VII. Decisions Before Specs
Architecturally significant choices MUST be recorded as ADRs under `design/adr/` before
implementation. Every speckit feature MUST reference the ADR it implements. ADRs are standalone;
no parent RFC is required.

Rationale: the design of the environment changed once already; recording the decision and its
rejected alternatives keeps later changes deliberate.

## Technology & Constraints

- TypeScript in strict mode, ES modules, on Node 22 or newer.
- pnpm for package management; vitest for tests; zod for schemas and validation.
- The environment is exposed to agents as an MCP server built on the official MCP SDK.
- World files are JSON. Generated worlds are committed only as named examples.
- The NAMS skills API is a preview feature with no SDK. Calls that create, review or publish
  skills are outward-facing writes and MUST be run deliberately, not from automated loops.

## Development Workflow

- Design work happens on a feature branch, not on `main`, and goes through pull-request review.
- ADRs are authored with `/adr-create` and checked with `/adr-review` before moving from
  `proposed` to `accepted`.
- Features are specified with `/speckit-specify` referencing an accepted ADR, then planned and
  tasked with the corresponding speckit commands.
- `pnpm typecheck` and `pnpm test` MUST pass before a change is merged.
- A change that alters the environment's rules, a world's structure, or the tool surface MUST
  update or supersede the ADR that decided it.

## Governance

This constitution supersedes other practices in the repository. Amendments are made through a
pull request that states the change and its rationale, or through an ADR that supersedes the
affected principle. Reviewers verify that changes comply with the principles and that any added
complexity is justified.

The constitution is versioned semantically. MAJOR: a principle is removed or redefined
incompatibly. MINOR: a principle or section is added or materially expanded. PATCH:
clarifications and wording fixes.

**Version**: 1.0.1 | **Ratified**: 2026-09-29 | **Last Amended**: 2026-09-29
