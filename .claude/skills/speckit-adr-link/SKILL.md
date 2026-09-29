---
name: "speckit-adr-link"
description: "Extension hook (after_specify): backlinks the newly created spec to the ADR(s) that seeded it, and appends the spec path to each ADR's specs list. Not intended for standalone use."
argument-hint: ""
compatibility: "Registered as extension 'adr', command 'speckit.adr.link', under hooks.after_specify in .specify/extensions.yml"
metadata:
  author: "zebra-space (adapted: RFC requirement removed)"
  extension: "adr"
  command: "speckit.adr.link"
user-invocable: true
disable-model-invocation: false
---

## Context

You are running as a **mandatory post-hook** for `/speckit-specify`, invoked from that command's Mandatory Post-Execution Hooks, after `spec.md` has already been written. The original `/speckit-specify` feature-description text is earlier in this same conversation turn.

## Purpose

Make the ADR → spec traceability chain concrete on disk, in both directions, once a spec actually exists.

## Outline

1. **Re-resolve the ADR set** the same way `speckit-adr-gate` did: scan the original `/speckit-specify` feature-description text for `ADR-(\d+)(-[\w-]*)?` tokens (bare, zero-padded, path, or `@`-mention form), and resolve each against `design/adr/`. The gate already validated these exist, so this should resolve cleanly; if something unexpectedly fails to resolve, skip it and note it in the completion report rather than failing the whole hook.

2. **Locate the new spec**: read `.specify/feature.json` for the `feature_directory` value written by `/speckit-specify` (e.g. `specs/004-user-auth`). The spec file is `<feature_directory>/spec.md`.

3. **Backlink spec.md → ADR(s)**: insert a line into the metadata block at the top of `spec.md`, alongside the existing `**Feature Branch**` / `**Created**` / `**Status**` / `**Input**` lines:
   ```
   **Derived From**: ADR-<NNN> (design/adr/ADR-<NNN>-<name>.md)[, ADR-<MMM> (design/adr/ADR-<MMM>-<name>.md), ...]
   ```
   List every resolved ADR, comma-separated.

4. **Backlink ADR(s) → spec**: for each resolved ADR file, read its `specs:` front-matter list and append `<feature_directory>` if not already present. One ADR may legitimately end up referenced by more than one spec over time — don't overwrite existing entries.

5. **Update the index**: in `design/adr/README.md`, add the feature directory to each linked ADR's `Specs` cell (comma-separated if it already has entries).

## Completion Report

Report:
- Which ADR(s) were linked, and the spec directory they were linked to.
- Any resolution mismatches noted in step 1 (should be rare).

## Done When

- [ ] `spec.md` has a `**Derived From**` line naming every resolved ADR.
- [ ] Each resolved ADR's `specs:` front-matter list includes the new feature directory.
