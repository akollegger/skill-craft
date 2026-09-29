---
name: "adr-create"
description: "Create or update an Architecture Decision Record: the technical HOW for one decision. Standalone; no parent RFC is required. Never creates or modifies speckit specs/features itself."
argument-hint: "The decision to record, or 'update ADR-005 ...' to revise"
compatibility: "Requires design/adr/ directory (created automatically on first use)"
metadata:
  author: "zebra-space (adapted: RFC requirement removed)"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty). If empty, ask the user what the decision is.

## Purpose

An ADR elaborates the technical **HOW** for one architecturally-significant decision: context, the decision itself, alternatives considered and rejected, and consequences. It is concrete enough to hand to `/speckit-specify` as a feature seed. This is the Develop half of the double-diamond — diverge across options, converge on one, in a single document.

**Scope guard**: this skill only creates/updates the ADR file. It **never** invokes `/speckit-specify`, `/speckit-plan`, or creates anything under `specs/`. Handing an ADR to implementation is a separate, explicit step the user takes later.

## Voice and audience

Write for a competent engineer who has just found the project: fluent in the general problem domain, but with no knowledge of its history, its files, or any sibling document. An ADR carries project-specific detail by design, so name that detail rather than assuming it — a reader meeting `SolveResult` or `ExtractedCsp` for the first time needs one clause saying what it is. If the project's `design/adr/README.md` states an audience, prefer that — it's more specific.

Design documents drift toward being written for their own authors, which reads to everyone else like overhearing a private argument. Four rules, in priority order:

1. **The topic is the grammatical subject — not the project, not the document.** Write about components, data shapes, constraints, failure modes. Not about "this project," "this ADR," "this subsection," or "the omission." Meta-talk ("this section decides…", "as discussed above") is navigation, not content: one pointer where a reader genuinely needs it, never as a substitute for saying the thing.

2. **Context opens on the forces, not the paperwork.** Name the technical situation and what makes a decision necessary before citing any sibling ADR. Self-check: strip every `§`-reference and document number out of section 1. If what remains no longer explains why a decision is needed, rewrite it.

3. **Never defend a choice against an objection nobody raised.** Two constructions look identical and are not:
   - *Contrastive* — draws a boundary, carries information: "a callable tool, not the system itself." Keep these.
   - *Defensive* — answers an imagined accusation: "deliberate rather than stylistic," "economical rather than careless," "not just a hypothetical." Cut these. State the decision and let it stand.

   The tell: the negated half names a *fault* ("careless," "stylistic," "arbitrary," "a strawman") instead of a real alternative. In Alternatives Considered, "Rejected: <specific reason>" is complete — a rejected option needs a reason, not a rebuttal of imagined pushback.

4. **Context and Consequences are evidence, not confession.** Argue from artifacts: a file, a quoted line, a benchmark, an observed failure, a cost being paid now. Consequences should state trade-offs and follow-up work plainly ("this leaves X unhandled; revisit if Y changes") without either apologizing for them or pre-justifying them.

Cross-references are navigation, never load-bearing: every sentence must still parse and mean the same thing with its `(§2.3)` parenthetical removed.

## Outline

1. **Require a non-main branch before making any changes**:
   - Run `git branch --show-current` (skip this whole check silently if not inside a git
     repository).
   - Determine the repository's main branch: prefer the short name from
     `git symbolic-ref refs/remotes/origin/HEAD`; fall back to `main` if that's unavailable.
   - If the current branch **is** the main branch, **STOP** — do not create or edit any file.
     Tell the user: ADRs should be authored on a feature branch, not directly on the main
     branch, so this design work goes through the same PR-based review as everything else. Ask
     them to create/switch to a branch (e.g. `git checkout -b <short-descriptive-name>`) and
     re-invoke `/adr-create`.
   - Otherwise, proceed — this applies to both create and update.

2. **Determine create vs. update**: scan `$ARGUMENTS` for an `ADR-<N>` reference (bare, zero-padded, filename, or `@design/adr/ADR-005-*.md` path) and resolve it against `design/adr/`, ignoring leading zeros. If it resolves, this is an **update**. If an `ADR-<N>` token is present but resolves to nothing, tell the user and stop rather than guessing a number. With no `ADR-<N>` token, this is a **create**.

3. **For create**: determine the next sequential number.
   - `mkdir -p design/adr` if it doesn't exist.
   - Scan `design/adr/` for `ADR-(\d+)-*.md`, take the max, add 1, zero-pad to 3 digits.
   - Generate a concise short name (2-4 words, kebab-case) for the decision.
   - Target file: `design/adr/ADR-<NNN>-<short-name>.md`.

4. **Write the ADR** with this structure:

   ```markdown
   ---
   id: ADR-<NNN>
   title: <Title>
   status: proposed
   created: <DATE>
   specs: []
   ---

   # ADR-<NNN>: <Title>

   ## 1. Context

   Technical context, constraints, and forces at play, with the specifics needed to build the decision. Per "Voice and audience" rule 2, open on the forces themselves; cite sibling ADRs only after a reader knows what is being decided and why.

   ## 2. Decision

   The specific technical decision. Concrete enough to seed a speckit feature: name the components, data shapes, interfaces, or approach precisely. If the decision has more than one genuinely distinct facet (e.g. format, location, and a migration/seeding plan), break this section into numbered `### 2.1 ...`, `### 2.2 ...` subsections rather than one flat block — numbered subsections keep cross-references unambiguous.

   ## 3. Alternatives Considered

   Technical options evaluated and why each was rejected.

   ## 4. Consequences

   Trade-offs, risks, and follow-up work this decision implies.

   ## 5. Related

   - Related ADRs: _(any ADR this one depends on, extends, or supersedes)_
   - Specs: _(populated automatically by the speckit ADR-link hook once `/speckit-specify` references this ADR)_
   ```

   Number every top-level `##` section sequentially (renumber if a section is later removed for not applying); this keeps cross-references from other ADRs or spec.md unambiguous.

5. **For update**: apply requested edits directly (e.g. status transitions `proposed` → `accepted` / `rejected` / `superseded`). Do **not** manually edit the `specs:` front-matter list — that's maintained by the speckit ADR-link hook.

6. **Maintain the index**: `design/adr/README.md` holds a living index table (`ADR | Title | Status | Specs`).
   - If `design/adr/README.md` doesn't exist yet, create it (format doc + an empty index table) before continuing.
   - Create: append a new row for this ADR.
   - Update: refresh this ADR's existing row in place — don't duplicate or reorder other rows.

## Completion Report

Report:
- The ADR file path (created or updated).
- Its `status`.
- If newly created and status is accepted-enough to build: suggest the next step — `/speckit-specify` referencing this ADR, e.g. `ADR-<NNN>: <feature description>` or `@design/adr/ADR-<NNN>-<short-name>.md: <feature description>`.
