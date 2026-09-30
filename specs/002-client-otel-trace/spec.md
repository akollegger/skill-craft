# Feature Specification: Run Observability

**Feature Branch**: `002-client-otel-trace`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "observability as detailed in ADR-002"

**Derived From**: ADR-002 (design/adr/ADR-002-client-otel-trace.md)

## User Scenarios & Testing *(mandatory)*

The people who use this feature are the **experiment runner**, who runs an agent on a goal and wants
to know what the run cost; the **demo viewer**, who compares runs on a screen or in a shared folder;
and the **sharer**, who hands a run to someone else, in a folder or as a bundle for hosted viewing, and
must not leak personal details or the world's recipes. Today
a run is scored by counting calls, which is a loose stand-in for time and tokens: context grows on
every turn, so a run with a few extra calls can cost far more than its call count suggests.

### User Story 1 - See what a run cost (Priority: P1)

The experiment runner starts a run through the harness. When it ends, the run's result reports how long
the run took, how many tokens of each kind it used, and what it cost in dollars, next to the existing
call counts. The same figures are also given up to the moment the goal was first reached, so a run that
kept going after succeeding is not charged for the extra work.

**Why this priority**: This is the point of the feature. Without real time and token figures the
with-and-without-memory comparison rests on call counts alone.

**Independent Test**: Run a scripted agent through the harness with a stand-in for the agent's
measurements. The result reports totals equal to the measurements' sum, and "to goal" figures equal to
the sum up to the goal-reaching call.

**Acceptance Scenarios**:

1. **Given** a finished run with recorded measurements, **When** its result is produced, **Then** it
   reports total duration, the four token counts (input, output, cache read, cache creation) and cost.
2. **Given** a run that reached the goal and then made more calls, **When** its result is produced,
   **Then** the "to goal" figures include every model request that ended at or before the
   goal-reaching call, including the request that issued it, and nothing later.
3. **Given** a run that never reached the goal, **When** its result is produced, **Then** the totals
   are reported and the "to goal" figures are absent.
4. **Given** the agent's measurements sum to the totals the agent's own tool reports, **When** the run
   is scored, **Then** the figures match those totals exactly.

---

### User Story 2 - Nothing personal in a run folder (Priority: P1)

The sharer copies a run folder to send to a colleague or publish. The folder holds calls, outcomes,
times and token counts, and nothing that identifies the person who ran it: no email address, user id,
account id or organization id, and no unfiltered copy of what the agent's tooling reported.

**Why this priority**: The raw measurements carry the runner's identity on every record. A run folder
is meant to be shared, so a leak here is one copied folder away.

**Independent Test**: Feed the receiver measurements that carry personal attributes, then search
everything the harness wrote for those values. None appear.

**Acceptance Scenarios**:

1. **Given** measurements carrying an email, user id, account ids and organization id, **When** a run
   completes, **Then** none of those values appear in any file in the run folder or in any log the
   harness writes.
2. **Given** an attribute the harness does not recognise, **When** it arrives, **Then** it is dropped,
   not stored.
3. **Given** a run in progress, **When** the harness is inspected, **Then** no unfiltered copy of the
   incoming measurements exists on disk.

---

### User Story 3 - The trace is a step-by-step record (Priority: P2)

The demo viewer opens a finished run and sees not just totals but each model request and each tool
call, in order, with when it started and ended. A viewer can pick up where it left off after a
disconnect by asking for everything after the last item it saw.

**Why this priority**: The observer needs per-step time to show a clock on each step and to split
thinking time from tool time. Totals alone serve the score, so this comes second.

**Independent Test**: Produce a trace from stand-in measurements and check the order, the numbering,
and that the times are offsets from the start of the run.

**Acceptance Scenarios**:

1. **Given** a completed run, **When** its trace is read, **Then** every model request and every tool
   call appears once, in the order received, each with a running number starting at zero.
2. **Given** a consumer that has read items up to number n, **When** it asks for items after n,
   **Then** it gets exactly the later ones.
3. **Given** a trace, **When** its times are examined, **Then** they are offsets from the run's first
   event and contain no wall-clock time or date.

---

### User Story 4 - A bad trace never corrupts the score (Priority: P2)

The experiment runner runs an agent whose measurements are incomplete or disagree with what the world
recorded (a missing call, different arguments). The run is still scored on calls as before. Its
measured figures are left out and the result says the trace did not match.

**Why this priority**: The call log is the ground truth of what the world did; measurements are
trusted only as far as they agree with it.

**Independent Test**: Give the scorer a trace with one call missing, and another with one call's
arguments changed. Both yield a call-based score, a "mismatch" marker, and no measured figures.

**Acceptance Scenarios**:

1. **Given** a trace with a different number of calls than the run log, **When** the run is scored,
   **Then** the result marks the trace as a mismatch, omits measured figures, and keeps the call-based
   score unchanged.
2. **Given** a trace whose call arguments differ from the log at the same position, **When** the run
   is scored, **Then** the same happens.
3. **Given** two identical consecutive calls, **When** the trace is joined, **Then** they pair by order
   and the run is not treated as a mismatch.
4. **Given** a run with no measurements at all, **When** it is scored, **Then** the result carries the
   call-based score and no measured figures, and no error.

---

### User Story 5 - Export a run as a replay bundle (Priority: P2)

The sharer picks a finished run and exports it as a **replay bundle**: one self-contained folder
holding every step of the run as a numbered frame (the table's contents, what the agent held, and what
the table said it could make after each call), the run's trace, and its result. Anyone with a page that
can play bundles can replay the run, pause, step and scrub through it, with no simulation, no world
file and no access to the original machine. The bundle reveals only what the run itself did.

**Why this priority**: Hosted viewing is replay of exported runs. The observer needs frames to draw
anything, and this is the only path from a run on disk to someone else's screen, so ingest is not
complete until it can leave the machine. It sits behind the measurements because a bundle without
them would drop time and tokens.

**Independent Test**: Export a finished run, delete the original run folder and the world file, and
check the bundle alone reproduces every step: one frame per logged call, in order, with the same
contents an independent replay of the run gives, plus the trace and the result.

**Acceptance Scenarios**:

1. **Given** a finished run, **When** it is exported, **Then** the bundle holds one numbered frame per
   call in the run log, in order, each showing the table, the held items and what could be made.
2. **Given** a bundle, **When** its frames are compared with replaying the run log on its world,
   **Then** they are identical.
3. **Given** a bundle, **When** its files are searched for the world's recipes, item descriptions
   beyond those the run met, or the world file, **Then** none are present.
4. **Given** a bundle, **When** it is searched for personal identifiers or unfiltered measurements,
   **Then** none appear.
5. **Given** a run whose trace did not match, **When** it is exported, **Then** the bundle holds the
   frames and the result with its mismatch marker, and no measured figures.
6. **Given** a run with no measurements, **When** it is exported, **Then** the bundle holds frames and
   the call-based result, and viewers show no times.
7. **Given** a consumer that has read frames up to number n, **When** it asks for frames after n,
   **Then** it gets exactly the later ones.
8. **Given** a run that did not replay cleanly, **When** it is exported, **Then** the export fails and
   says why, and no partial bundle is left behind.

---

### Edge Cases

- The agent process exits before flushing its last measurements: the run is scored with what arrived
  and any shortfall is visible as a mismatch, not silently accepted.
- Model requests the agent's tooling makes outside the run's loop (auxiliary requests) are excluded
  from totals, as they are excluded from the tool's own totals.
- Two runs happen at once: each run's measurements stay in that run's folder.
- A run is rerun into a folder that already has a trace: it is refused, as a used run log is.
- A measurement arrives with a missing or malformed field: that item is skipped and the run is
  flagged, and the harness does not crash.
- The receiver cannot bind a port: the run does not start, and the cause is reported.
- A run is exported while still running: export is refused; only finished runs are exported.
- A bundle is exported to a folder that already has one: it is refused rather than overwritten.
- A run's frames show the recipes the run exercised (crafted outputs appear in them); the bundle
  omits everything the run did not touch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The harness MUST collect time and token measurements for each run from the agent's
  own reporting, while the run's call log continues to hold no timestamps.
- **FR-002**: Each run MUST have its own collection point, so one run's measurements never mix with
  another's, and a run's folder is self-contained.
- **FR-003**: The harness MUST write a per-run trace of model requests and tool calls, each with a
  running number, a kind, and times as offsets from the run's first event.
- **FR-004**: A model request line MUST record its id, turn, start and end offsets, time to first
  token, the four token counts, and cost. A tool line MUST record its id, tool name, arguments, start
  and end offsets, and whether it succeeded.
- **FR-005**: The harness MUST keep only an allowlist of fields and MUST drop everything else on
  arrival, including email, user id, account ids and organization id.
- **FR-006**: The harness MUST NOT persist unfiltered incoming measurements anywhere, including
  debug output.
- **FR-007**: Each tool line MUST be joined to the run log by order, checked against tool name (without
  the server prefix) and arguments.
- **FR-008**: A run's result MUST report total duration, the four token totals and cost, and the same
  figures up to and including the model request that issued the goal-reaching call.
- **FR-009**: When the trace does not join to the log, the result MUST record a mismatch, omit
  measured figures, and leave every call-based figure unchanged.
- **FR-010**: Requests made outside the agent's own loop MUST be excluded from totals.
- **FR-011**: The harness MUST work when no measurements arrive, scoring on calls alone.
- **FR-012**: The simulation server, the engine and the run log MUST NOT gain a clock or any
  measurement.
- **FR-013**: The harness MUST set the agent's reporting so measurements arrive within about a second
  of when they happen, so a viewer can follow a run as it progresses.
- **FR-014**: The harness MUST derive one frame per run log entry by replaying the log on the run's
  world. A frame holds the table's contents, the items held, and the preview of what could be made
  after that call. Frame derivation MUST be a function of the simulation library, with no server or network
  dependency, so export and the observer's live view call the same code.
- **FR-015**: The harness MUST export a finished run as a replay bundle holding the frames, each with a
  number starting at zero, the trace, and the run's result.
- **FR-016**: A bundle MUST NOT contain the world file, any recipe the run did not exercise, or any
  personal identifier, and MUST NOT contain unfiltered measurements.
- **FR-017**: A bundle MUST be playable on its own. Reading it MUST NOT need the world, the run log or
  the simulation.
- **FR-018**: A consumer MUST be able to ask a bundle for its frames after a given number and receive
  exactly the later ones.
- **FR-019**: Export MUST fail, leaving no partial bundle, when the run is unfinished or its log does
  not replay, and MUST refuse to overwrite an existing bundle.
- **FR-020**: Tests for the collection, the field filtering, the join, the score figures, frame derivation and
  bundle export MUST be
  written before the code they cover, using stand-in measurements and no real agent.

### Key Entities

- **Trace**: The per-run, ordered record of model requests and tool calls with times and token
  figures. Distinct from the run log, which records only what the world did.
- **Model request**: One call to the model, with its id, turn, time span, time to first token, four
  token counts and cost.
- **Tool call (trace side)**: One tool round trip as the agent saw it, joined to a run log entry.
- **Run result**: The per-run scored summary; gains duration, token totals, cost, their "to goal"
  counterparts, and a trace status (matched, mismatch, or absent).
- **Frame**: The state of a run after one call: the table, the held items and the preview.
- **Replay bundle**: A self-contained export of one run: numbered frames, the trace and the result.
- **Allowlist**: The fixed set of fields that may be stored from incoming measurements.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a real run, the reported token totals and cost equal the agent tool's own totals
  exactly.
- **SC-002**: After a run with personal identifiers present in the incoming measurements, a search of
  everything the harness wrote finds none of them.
- **SC-003**: A viewer following a run sees each new step's time within about one second of it
  happening.
- **SC-004**: A run whose trace disagrees with its log in any of the ways listed in User Story 4 is
  reported as a mismatch every time, and its call-based score is identical to what it was before this
  feature.
- **SC-005**: Running the full existing test suite after this feature shows no change in the
  simulation's behaviour, and the run log gains no new field.
- **SC-006**: A bundle exported from a run reproduces every step of it with the original run folder and
  world file deleted, and its frames are identical to an independent replay of the log.
- **SC-007**: A search of a bundle finds no personal identifier, no world file, and no recipe the run
  did not exercise.
- **SC-008**: The experiment runner can tell, from one run's result alone, how long it took, what it
  cost, and how much of that was spent reaching the goal.

## Assumptions

- The agent player is Claude Code run headlessly (as in the interim harness). Its own reporting is
  the source; other players need their own source and are out of scope.
- Interactive sessions and the desktop app cannot be measured this way and are out of scope.
- Deriving frames and exporting bundles belong to this feature, because ingest is not complete until a
  run can leave the machine. Frame derivation is a producer-side function, next to run scoring, since the frame is the bundle's
  published contract. The observer calls it and does not own it.
- The page that plays a bundle, and where bundles are hosted, belong to the observer feature and are
  out of scope here. This feature ends at a bundle that any such page can read.
- The fallback of deriving the same trace from the agent's streamed output is not built until needed.
- A relaying collector is deferred (ADR-002); the harness's own collection point is the only path.
- What single figure the leaderboard sorts by is an open observer question, not decided here; this
  feature reports the figures.
- Cost is the figure the agent's tooling reports in dollars; no independent pricing is added.
- The trace is trusted as the agent reported it; unlike the run log it cannot be checked by replay.
