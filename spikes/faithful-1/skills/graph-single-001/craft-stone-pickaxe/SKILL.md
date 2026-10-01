---
name: craft-stone-pickaxe
description: "Claude Code: explore a crafting table and assemble a stone pickaxe using the craft tools. Use when the goal is to obtain and hold a stone_pickaxe in an unfamiliar workshop."
version: 1.0.0
source-workspace-hash: ws_846c72f4bf336e77
distilled-at: 2026-10-01T20:04:47Z
grounding-score: 1.00
nams-provenance-id: prov_run-116b0560-21df-4133-8f3e-13ecb1c6b3b2
source-memory-types: [short-term, long-term, reasoning]
procedure-format: graph
---

# Craft Stone Pickaxe

Claude Code: explore a crafting table and assemble a stone pickaxe using the craft tools. Use when the goal is to obtain and hold a stone_pickaxe in an unfamiliar workshop.

## Procedure (execution graph)
Steps run in order; each is grounded in workspace memory (see `provenance.json`).

1. **Read crafting help** _(tool: mcp__craft__help)_
   Call mcp__craft__help to discover the available craft-tool operations.
   - why: Help establishes how to explore and craft in the unfamiliar workshop before taking action.
   - outputs: coordinates, preview, tools, world
   - expect: success
   - done when: The mcp__craft__help call returns success.
   _evidence: 5abd8179-d362-442c-ae36-31a248d58d97, 3ba0810c-f27e-4664-a40a-3a70fd973798, 0b5c86e7-55ea-481b-a731-6d3f384f2f9d, 22961bd3-9286-4bf7-a007-1890c5581a3a_

2. **Inspect inventory** _(tool: mcp__craft__inventory)_
   Call mcp__craft__inventory to determine the current materials and held objects.
   - why: Inventory inspection reveals what is available before materials are placed or consumed.
   - after: step-001
   - outputs: items
   - expect: success
   - done when: The mcp__craft__inventory call returns success.
   _evidence: c528a938-d1f1-44ed-b60e-51dba4c3ce0a, 9d930652-39ca-40c2-8da4-887099063b93, 0b5c86e7-55ea-481b-a731-6d3f384f2f9d, f3d83edd-f951-4451-8860-17d2fb9df161_

3. **Arrange materials** _(tool: mcp__craft__place)_
   Use mcp__craft__place to put the required materials into the crafting-table layout.
   - why: The successful trace uses place operations to prepare the table before the irreversible craft action.
   - after: step-002
   - inputs: col, item, row
   - outputs: craftable, grid, ok
   - expect: success
   - done when: The required materials are placed on the table in the intended layout and the mcp__craft__place call returns success.
   _evidence: c74ddb50-a900-4ebf-9233-231e56e57f2a, 70768165-d4c5-4002-b9b3-feab8e8b6572, 33160d0b-ebb4-4b61-b402-06673feaf3aa, 2ec4e29d-8082-44f3-86fa-9357f91cbf02, 391c4f13-c4d2-42a2-85d3-55a8c49ee5e9, bb5ed783-2c74-4d12-bcce-160aa335e19d, fa2052d7-86c6-4909-9acb-3f6bea85373e, 355d3167-5b82-4df6-bd67-fc2849f7a61a, b21f4658-4b0b-452d-8847-1bf33e047742, 0b5c86e7-55ea-481b-a731-6d3f384f2f9d, 9c2dc97a-62a5-4c21-a61a-bff6af383cd3_

4. **Craft the pickaxe** _(tool: mcp__craft__craft)_
   Invoke mcp__craft__craft to consume the prepared table contents and produce the target item.
   - why: Craft is the committed action that converts the prepared table contents into the requested stone_pickaxe.
   - after: step-003
   - outputs: crafted, ok
   - expect: success
   - done when: The mcp__craft__craft call returns success and the stone_pickaxe is held.
   _evidence: ff666652-6098-4adc-a0ec-57230524d0e7, 9881401f-ee83-4c24-9ba3-3c13e2aa16ba, 87dd8d70-d58e-42d8-b184-71eaaf74fc70, da02b272-d61c-414c-8089-e9c153434879, 0b5c86e7-55ea-481b-a731-6d3f384f2f9d, 36d63162-0927-45c4-ba15-687d55724f74_


## Domain model
Key entities and terms are defined in `references/domain-model.md`.

## Worked examples
Representative (redacted) cases are in `references/exemplars.md`.

> Distilled from NAMS workspace memory. Every claim is grounded — see `provenance.json`.
