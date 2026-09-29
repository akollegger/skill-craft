# Feature Specification: Crafting-Table Simulation

**Feature Branch**: `001-crafting-table-sim`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "Simplification of the sim, as detailed in @design/adr/ADR-001-crafting-table-world.md"

**Derived From**: ADR-001 (design/adr/ADR-001-crafting-table-world.md)

## User Scenarios & Testing *(mandatory)*

The people and agents who touch the simulation are: the **agent player**, an AI agent that works
inside a world through a small set of tools; the **world author**, who defines and varies worlds;
and the **experiment runner**, who gives agents goals and scores their runs. The simulation
replaces an earlier, more elaborate one (gathering, tool strength, stations, fuel) whose
logistics buried the part worth learning.

### User Story 1 - Discover what a combination makes (Priority: P1)

An agent player is placed in a world with a crafting table, a set of held items, and a goal it was
told in its prompt. It places items on the table and reads what the table says it could make. It
adjusts the arrangement until the table reports something useful, then commits to making it. It
repeats this, using made items as ingredients, until it holds the goal item.

**Why this priority**: This is the whole environment. Without it there is nothing to record,
distill or compare.

**Independent Test**: Run a scripted agent against a small world. It places items, reads
the reported result after each move, commits a craft, and ends up holding the expected item. This
delivers a playable world even with no scoring or world variation.

**Acceptance Scenarios**:

1. **Given** a world whose only recipe makes item C from A and B in any arrangement, **When** the
   agent places A and B on the table, **Then** the table reports that C can be made.
2. **Given** the table holds exactly the items and arrangement of a recipe, **When** the agent
   commits a craft, **Then** those items leave the table, the output item is added to what the
   agent holds, and the table is empty.
3. **Given** the table holds items that match no recipe, **When** the agent commits a craft,
   **Then** nothing is consumed and the agent is told there is nothing to make.
4. **Given** an item made by an earlier craft, **When** the agent places it on the table,
   **Then** it counts toward matching a later recipe like any other item.
5. **Given** a recipe that only works in a particular arrangement, **When** the agent places the
   right items in the wrong arrangement, **Then** the table reports nothing can be made, and
   **When** it rearranges them correctly, **Then** the table reports the output.

---

### User Story 2 - Wrong crafts have a cost (Priority: P1)

The agent starts with a fixed, limited stock of raw items and no way to obtain more. Exploring
arrangements is free and can be undone. Only committing a craft spends stock. A run that commits
the wrong crafts can run out of what it needs.

**Why this priority**: Exploration cost is what a remembered skill saves. Free exploration
with no scarcity would make guessing costless and the comparison meaningless.

**Independent Test**: In a small world with tight stock, commit a wrong craft and confirm the
raw items are gone and a goal that needed them is now unreachable, while placing, removing and
clearing items never changes the held quantities.

**Acceptance Scenarios**:

1. **Given** the agent holds a quantity of an item, **When** it places that item on the table,
   **Then** the held quantity drops by one, and **When** it removes it, **Then** the quantity is
   restored.
2. **Given** the agent holds none of an item, **When** it tries to place it, **Then** it is
   refused with a clear reason.
3. **Given** items on the table, **When** the agent clears the table, **Then** every item returns
   to what the agent holds.
4. **Given** a cell already holds an item, **When** the agent places another item there, **Then**
   it is refused; a cell never holds more than one item.
5. **Given** a position outside the table, **When** the agent places or removes there, **Then** it
   is refused with a clear reason.

---

### User Story 3 - Look without touching, and get oriented (Priority: P2)

The agent can ask what the world is and what each tool does, check what it holds, and view the
table as it stands, without changing anything. Each of these answers one question only.

**Why this priority**: A recorded run is only useful if each call has one clear purpose and the
agent is not forced to make a move just to see the state.

**Independent Test**: Call the orientation, holding and viewing tools repeatedly on a fresh
world and confirm the world state is identical afterward, and each answer contains only what it
is defined to contain.

**Acceptance Scenarios**:

1. **Given** a new world, **When** the agent asks for help, **Then** it gets a short description
   of the world (including the table size) and of each tool, and no recipes.
2. **Given** a world in any state, **When** the agent asks what it holds, **Then** it gets item
   names and quantities only, with nothing about the table or any goal.
3. **Given** a world in any state, **When** the agent views the table, **Then** it sees the
   table's contents and what a craft would make right now, and nothing changes.
4. **Given** the world tracks no goals, **When** the agent finishes a task, **Then** the world
   does not report success; the agent judges by what it holds.

---

### User Story 4 - Swap worlds without changing code (Priority: P2)

A world author writes or edits a world definition: the table size, starting stock, items, and
recipes (each either shapeless or shaped). Pointing the simulation at a different definition
gives a different world with no change to the simulation's code. A malformed or unwinnable
definition is rejected with a report of every problem found.

**Why this priority**: New vocabulary and altered recipes are the main experimental controls, so
they must be inputs.

**Independent Test**: Load several different valid world definitions in turn and play each. Load
a set of deliberately broken ones and confirm each is rejected with a specific reason.

**Acceptance Scenarios**:

1. **Given** two valid world definitions, **When** the simulation is started with each in turn,
   **Then** the agent sees the matching table size, stock and recipes for each, with no code change.
2. **Given** a definition where two recipes could match the same table state, **When** it is
   loaded, **Then** it is rejected and the conflicting recipes are named.
3. **Given** a definition with a shaped recipe larger than the table, **When** it is loaded,
   **Then** it is rejected.
4. **Given** a definition where a recipe needs an item that is neither in the stock nor the output
   of any recipe, **When** it is loaded, **Then** it is rejected.
5. **Given** a definition that refers to an item it never defines, **When** it is loaded, **Then**
   it is rejected and the unknown item is named.

---

### User Story 5 - Score a run against the best possible run (Priority: P2)

An experiment runner gives the agent a goal (an item and quantity) outside the world. Afterward
it asks for the best possible run for that goal: the fewest crafts, the fewest tool calls, and how
many wasted crafts the starting stock could absorb. The runner compares the agent's actual run to
that.

**Why this priority**: The comparison of runs with and without a skill depends on a fixed
yardstick.

**Independent Test**: For a small world with a known best solution, ask for the best run for a
goal and check the crafts, calls and slack match a hand-worked answer, and that replaying that
run reaches the goal.

**Acceptance Scenarios**:

1. **Given** a world and a reachable goal, **When** the best run is requested, **Then** the answer
   gives the minimum crafts, the minimum tool calls, and the slack.
2. **Given** a goal that cannot be reached from the starting stock, **When** the best run is
   requested, **Then** the answer says so and gives no run.
3. **Given** the best run for a goal, **When** it is replayed step by step against a fresh world,
   **Then** the agent ends up holding the goal item.
4. **Given** a completed run, **When** the runner reads the run log, **Then** it lists every tool
   call in order with its arguments and outcome, and the counts of calls and failed crafts match
   what happened.
5. **Given** an agent in a running world, **When** it looks for the run log, **Then** none of its
   tools provides it.

---

### User Story 6 - Tune difficulty with hints (Priority: P3)

A world can be set so the table reports only whether a craft would succeed, or additionally
whether the current arrangement could still become a match by adding more items (without saying
which recipe or item).

**Why this priority**: Difficulty tuning is useful but the environment works without it.

**Independent Test**: Load the same world with each hint setting and confirm the table reports
the extra signal only in the second.

**Acceptance Scenarios**:

1. **Given** the strict setting, **When** the table holds a partial match, **Then** the table
   reports only that nothing can be made.
2. **Given** the extra-signal setting, **When** the table holds a partial match, **Then** it also
   reports that the arrangement could still become a match, without naming what it needs.

---

### User Story 7 - Re-skin a world with invented names (Priority: P3)

A world author produces a variant of any world in which every item and station name is replaced
by an invented one and flavour text is reduced to a bare category, so an agent cannot infer a
recipe from a name. Optionally the variant also changes some quantities and patterns, so its
recorded results no longer match the original's. The same seed always gives the same variant.

**Why this priority**: It keeps prior knowledge from answering for the agent and supplies fresh
worlds for repeated trials, but a single hand-written world is enough for a first run.

**Independent Test**: Generate a variant from a base world and check that no original item name
survives, that the structure is otherwise identical, that the same seed gives the same output, and
that the variant is still solvable.

**Acceptance Scenarios**:

1. **Given** a base world and a seed, **When** a variant is generated, **Then** none of the base
   world's item names appear in it and its recipes have the same shapes and quantities.
2. **Given** the same base world and seed, **When** a variant is generated twice, **Then** the two
   outputs are identical.
3. **Given** the option to change quantities and patterns, **When** a variant is generated,
   **Then** it differs from the unchanged re-skin and is still valid and solvable.

---

### Edge Cases

- Committing a craft on an empty table: refused with nothing to make; nothing changes.
- Extra items on the table beyond a recipe's exact set: no match.
- A shaped recipe whose pattern has empty cells: the pattern matches wherever it fits on the
  table, but not rotated or mirrored.
- A recipe whose output the agent keeps making until stock runs out: each craft consumes the
  table contents, so stock is finite by construction.
- Placing an item the world has never heard of: refused as unknown.
- Clearing an already empty table: succeeds and changes nothing.
- The agent runs out of a needed item after wasted crafts: the goal may be unreachable, and the
  best-run answer for the original stock shows how much slack there was.
- Two runs started from the same world: independent, each starts from the initial stock.
- A world too large for the best-run search to finish: rejected at load with a size limit message.
- Repeating the identical sequence of calls: identical results every time.
- A refused call: still appears in the run log, with its refusal reason.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A world MUST define a table of a stated number of rows and columns, and each cell
  MUST hold at most one item.
- **FR-002**: A world MUST define a finite starting stock of items, and the agent MUST have no way
  to obtain items beyond what crafting produces from that stock.
- **FR-003**: A world MUST define its items and its recipes. Each recipe MUST produce an output
  item in a stated quantity and MUST be either shapeless (an exact set of items in any cells) or
  shaped (an exact arrangement that may sit at any position on the table but is not rotated or
  mirrored).
- **FR-004**: A recipe MUST match only when the table holds exactly the recipe's items (and, for a
  shaped recipe, exactly its arrangement). Extra items MUST prevent a match.
- **FR-005**: The agent MUST be able to place one unit of a held item in a chosen cell, remove the
  item from a chosen cell, and clear the whole table. Each moves items between what the agent holds
  and the table without creating or destroying any.
- **FR-006**: Committing a craft MUST consume the table's contents, add the matching recipe's
  output to what the agent holds, and leave the table empty. If nothing matches, it MUST change
  nothing and say so.
- **FR-007**: Placing, removing, clearing and viewing MUST NOT spend stock. Only committing a craft
  MAY.
- **FR-008**: Any tool that changes the table, and the view tool, MUST return the table's contents
  and what a craft would make at that moment, or that nothing can be made.
- **FR-009**: The agent MUST have one tool per purpose: orientation (world description with table
  size, plus each tool's purpose, and no recipes), holdings (item names and quantities only),
  viewing (table state only, no changes), place, remove, clear, and craft.
- **FR-010**: The world MUST NOT keep, report or evaluate goals. Goals are supplied to the agent
  from outside the world.
- **FR-011**: No tool MUST reveal a recipe, a solution, or which recipe a partial arrangement
  resembles. Refusals MUST state the violated constraint and MUST NOT state how to fix it.
- **FR-012**: Refusals MUST use distinct, stable reasons for: position outside the table, cell
  already occupied, item not held, nothing to make, and unknown item.
- **FR-013**: A world MUST set a hint level. At the strict level the table reports only what a
  craft would make. At the extra-signal level it also reports whether the current arrangement could
  still become a match by adding items, without naming which.
- **FR-014**: The simulation MUST be deterministic: the same world and the same sequence of calls
  MUST always give the same results, with no dependence on randomness or the clock.
- **FR-015**: Each run MUST start from the world's initial stock; state MUST NOT carry between
  runs, and the agent MUST NOT be able to reset the world.
- **FR-016**: Loading a world definition MUST validate it and reject it, reporting every problem
  found, if it is malformed, refers to an undefined item, has a shaped recipe that does not fit the
  table, has two recipes that can match the same table state, or has a recipe input that is neither
  in the stock nor produced by another recipe.
- **FR-017**: Switching to a different world MUST NOT require changing the simulation's code.
- **FR-018**: A best-run calculation MUST take a world and a goal (item and quantity) and return the
  minimum crafts, the minimum tool calls, and the slack, or state that the goal is unreachable.
- **FR-019**: Worlds MUST have a size limit that keeps the best-run calculation tractable, and a
  world over the limit MUST be rejected at load.
- **FR-020**: A world variant generator MUST replace every item name with an invented name, replace
  flavour text with a bare category by default, and be reproducible from a seed. It MUST offer an
  option that changes some quantities and patterns while keeping the world valid and solvable.
- **FR-021**: Every world definition committed to the repository MUST be proven solvable for its
  intended goals by an automated check.
- **FR-022**: The earlier gathering, tool-tier, station and fuel mechanics, their tools, and the
  earlier world definitions MUST be removed and replaced by this design, with generated example
  worlds regenerated.
- **FR-023**: The simulation MUST keep an ordered log of every tool call in a run, including
  refused calls, recording each call's arguments and outcome (success, or the refusal reason). The
  experiment runner MUST be able to read the log after the run. The agent MUST NOT be able to read
  it. The log is the ground truth for counting a run's calls and failed crafts, independent of
  whatever software drives the agent.

### Key Entities

- **World**: A self-contained definition of one environment: a description, the table size, the
  starting stock, the items, the recipes, and the hint level. Contains no goals.
- **Table**: The grid where items are placed; each cell holds at most one item.
- **Item**: A named thing that can be held, placed and used in recipes. Raw items begin in the
  stock; made items are recipe outputs.
- **Stock and holdings**: The quantity of each item the agent currently holds. The stock is the
  starting holdings of a run.
- **Recipe**: A rule turning an exact set of items (shapeless) or an exact arrangement (shaped)
  into an output item and quantity.
- **Preview**: What the agent sees after viewing or changing the table: the table contents, what a
  craft would make now (or nothing), and at the extra-signal level whether a match is still
  possible.
- **Goal**: An item and quantity the agent is asked to hold. It lives outside the world.
- **Run log**: The ordered record of every tool call in one run, with arguments and outcome,
  readable by the experiment runner and not by the agent.
- **Best run**: The reference answer for a world and goal: minimum crafts, minimum tool calls and
  slack.
- **World variant**: A re-skinned and optionally perturbed copy of a world, produced from a seed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Replaying any recorded sequence of calls against a fresh copy of the same world
  gives identical results on every replay, across at least 100 repetitions per tested sequence.
- **SC-002**: For every world in the repository and each of its intended goals, following the
  best run reaches the goal in exactly the reported number of tool calls.
- **SC-003**: A scripted player using only the agent-facing tools reaches the goal in every
  committed world without reading any file that the tools do not expose.
- **SC-004**: Ten distinct valid world definitions, differing in table size, stock, recipes and hint
  level, load and play correctly with no change to the simulation's code.
- **SC-005**: Every deliberately broken world in the test set is rejected, and the rejection names
  the specific problem, with no false rejections among valid worlds.
- **SC-006**: Across a suite of calls covering every tool in every state tested, no answer from
  the orientation, holdings or viewing tools contains recipe information, and no refusal message
  names a fix.
- **SC-007**: For 20 seeds, every generated variant contains none of the base world's item names,
  is valid, and is solvable for the same goals as the base.
- **SC-008**: The best-run calculation completes within 10 seconds for every world in the
  repository.
- **SC-009**: Viewing, holdings and orientation calls leave the world state unchanged in every
  tested state.
- **SC-010**: For a scripted run with a known number of calls and a known number of failed
  crafts, the run log's counts match a hand count exactly, and no agent-facing tool returns the
  log.

## Assumptions

- Goals, and the way they are given to the agent, belong to the experiment harness, which is a
  separate piece of work (see ADR-001 Section 2.6). This feature only provides the best-run
  calculation for a given goal.
- How the runner reads the run log (a file, a report, an endpoint) is a planning decision. What
  is fixed here is that it exists, is complete and ordered, and is out of the agent's reach.
- Recording runs, distilling skills and comparing runs with and without a skill are out of scope
  here. They belong to a later experiment-protocol decision.
- Shaped recipes match at any position on the table but never rotated or mirrored (ADR-001 Section
  2.2 and 3).
- More than one recipe may produce the same item, provided no two can match the same table state.
- The default hint level, when a world does not state one, is the strict level.
- A refusal never changes world state.
- The size limit on worlds (FR-019) is set during planning and chosen so the best-run calculation
  meets SC-008.
- The agent-facing tools are exposed to agents as tool calls in an agent session; the exact
  transport is a planning decision.
- Existing tests for the old mechanics are rewritten to the new rules. The world loader, variant
  generator, scripts and test scaffolding are adapted, not rewritten from scratch.
