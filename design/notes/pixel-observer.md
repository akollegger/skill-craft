# Design note: the visualizer

Status: scope settled (see "Scope and user goals"); the design inside that scope is still exploratory, and the
earlier choices below are held loosely.
Date: 2026-09-30, reframed 2026-10-02 after the first experiments and two rounds of feedback.
Feeds: an ADR on the visualizer, which comes next, and later a speckit feature. Neither is started.

## Why: scenarios, not requirements

These are situations in which someone would want to see what agents did in this world. They motivate the
work. None of them is the thing being designed, and a design that serves only one of them is the wrong design.

- A talk or demo, where an audience that has never seen the project follows what an agent did and what
  changed between two conditions. The first version of this note was written with this one in mind, as a
  "Pong demo": a small world, a score, a before and after that is readable in seconds.
- An experimenter asking why a run failed, or why it took 200 calls where another took 11.
- A reviewer comparing conditions across many runs: models, prior fit, with or without a skill.
- A reader of a shared bundle, later, who was not there.
- Someone watching a run in progress and deciding whether to stop it.
- Someone checking whether a distilled skill actually contains anything.

Scenarios will keep arriving and changing. The experiments themselves changed within a day of the first
mock: they found that familiar and invented worlds behave very differently, that a model's gap can be on an
unexpected goal, and that a skill can pass every gate and still be empty.

## What is being designed

A way to see what runs did and what they cost. A **run** is a model, under some conditions, playing a
goal in a world: a sequence of table states, with measurements and an outcome. The design question is which
operations on runs should exist, and which of them should be general rather than shaped to one use.

### What a run already carries

Every finished run folder holds these today, without any new recording:

| Group | Fields |
|---|---|
| Identity | label (the experiment folder) and index; the world file; the goal |
| Conditions | the model requested and the model that ran; the world's prior fit (or `undeclared`); an added prompt sentence, if any; whether a skill was installed, its name and fingerprint |
| Behaviour | the calls in order, with arguments and outcomes; a frame per call (the table, what is held, what `craft` would make); refusals; crafts made and failed |
| Result | outcome (reached, gave up, out of turns, error); calls to the goal over the best run; extra calls |
| Cost | time per request and per tool call, tokens of four kinds, cost as a run total; whether and after how many calls a skill was loaded |
| Optional, from an experiment summary | arm, goal role (gap, solved, held-out), the route |

Whatever the visualizer does should be expressible in terms of these. New fields should be able to join them
without changing the design.

### Principles worth testing, not rules

- **General before specific.** Prefer an operation that works on any attribute over one that works on the
  attribute we have today.
- **Attributes, not experiments.** The ADR-003 vocabulary is one set of attributes. The skillcraft visualizer should
  cope without it.
- **Layers that each stand alone.** Seeing one run is useful without browsing; browsing is useful without
  comparing.
- **Extension points over special cases.** Where something varies (how an item is drawn, what is
  revealed, which measure is shown), make it a choice and not a fork.
- **Watching, not controlling.** The skillcraft visualizer reads; it does not start runs or inject calls. This one
  looks sturdy, but it is also still a choice.

## Scope and user goals

Settled on 2026-10-02, at the level of what a person wants to do. The skillcraft visualizer is **a way to see what runs
did and what they cost**, for an arbitrary folder of runs. A person should be able to:

- see which worlds were used;
- see the runs of each world;
- see the details of a run;
- compare two runs.

The reason to build it, when a few terminal commands could list much of this, is that JSON files hide the
meaning of a run and are not pleasant to look at. A disk defragmenter or a process monitor is not strictly
necessary either; it earns its place by showing the structure of its domain in a way that suits it, and by being
something you enjoy leaving on a screen. The design goal is **an idiomatic visual representation that
highlights the logical domain in semantically meaningful ways**. For this domain the idiom is the crafting
table, with items placed on it over time, and how it looks matters as much as what it can do.

Choices made while discussing it:

- **A world is an attribute of a run.** It is a label to group and filter by. Drilling into a world's own
  details (stock, grid size, hint level) is not needed yet.
- **Hierarchy emerges from grouping.** A folder holds worlds and goals holds runs, but a hierarchy can also
  come from group, sort and filter on any attribute (compare the shortest runs across every world, for
  example). Group, sort and filter give the most flexibility at some cost in interface complexity; how much of
  that to expose is open. The Finder's Group By, Sort By and attribute search tokens are a familiar model, not
  a decision.
- **Comparison is a presentation, not a mode.** Two selected runs show side by side in the table view, or as
  rows in the list view. Runs sharing a goal in the same world is one reason to compare, not the definition;
  any two runs may be shown together.
- **Skills are surfaced from what is already recorded.** Whether a run had a skill installed, its name, whether the
  agent loaded it and after how many calls, and whether the prompt carried a pointing sentence. Showing where a
  skill came from is not needed.
- **Dropped for now:** associating teacher and student runs.
- **Out of scope for now:** live viewing (watching a run as it happens) and aggregates over many runs.
- **Input:** only what runs already carry, so the visualizer works on any folder without an experiment summary.

The four earlier features fit these goals, and are the starting point: finder-like navigation and selection
of runs; a grid for visual appeal and a list for detail; opening a run into the crafting-table view; two
tables side by side. The first mock is the baseline for the build and is not to be polished further; it will
change as the implementation teaches us (see "From here").

## Layers and the options inside them

Each layer lists alternatives and what each assumes. None is chosen. Layer 5 and the live part of layer 1 are
out of scope for now, and layer 4 is limited to showing that a run had a skill.

**1. One run: replay and live.**
- Shapes: a table you step through; a timeline of calls; both; the table plus a strip of what the agent saw.
- Open: what time means during replay (original pace, compressed, step only); how a live run signals that
  it is waiting; what to do with calls that change nothing (reads).

**2. A collection: browse, group, filter, sort.**
- Shapes: a grid of tiles; a list or leaderboard; a matrix with two attributes as axes; a faceted filter over
  any attribute; free text.
- Open: which attributes can be an axis or a facet; whether grouping can be nested; how to scale from a
  dozen runs to hundreds; what a "tile" shows when the runs differ in world or goal.
- Assumption to question: a leaderboard assumes runs are comparable by outcome, which is false across goals.

**3. Juxtaposing runs.**
- Shapes: two or more tables side by side with independent playheads; aligned by step, by state, or by time;
  a diff of what two runs did differently; an overlay of a run on the best run.
- Open: what "aligned" means when runs take different paths to the same place; whether more than two are
  useful; whether the pairing is chosen by the viewer or implied by the data.

**4. Artifacts attached to a run** (for now, only that a run had a skill, and how it was used).
- Examples: an installed skill and where it was loaded; a review verdict; the prompt as given.
- Shapes: a side panel; an event on the timeline (the skill was loaded here); a link out.
- Open: whether an artifact can be shown without revealing what the world hides (see the extension points).

**5. Aggregates over a selection.**
- Shapes: counts and rates with intervals; distributions of calls or cost; small multiples of runs; the
  outcome strip of each run in a grid.
- Open: where this stops being the visualizer and becomes a report. The report script already prints a
  table of this kind. A visual aggregate might be a different tool that shares the data model.

## Extension points to consider

- **How an item is drawn.** The first mock hashed each invented name to a small creature. A world with
  familiar names might want recognisable icons, or plain labels, or a pack supplied with the world. The
  creature scheme itself signals "unknown", which may or may not be wanted.
- **What is revealed.** Frames show every recipe a run exercised. Whether a viewer sees recipes, the
  skill's contents or the agent's text is a policy, and the policy could be a viewer setting, a property of
  the bundle, or both.
- **Which measure leads.** Calls, time, tokens, cost or none. Calls understate the gap between runs
  because context grows each turn; cost is a run total only.
- **Views as data.** A selection, grouping and layout could be saved and shared as data, so a particular
  way of looking is a bookmark and not a feature.

## Data to test against

A design that reads well on one dataset says little. Runs on disk differ in character, which is the point:

| Dataset | What it shows |
|---|---|
| The pilot's `forge-7` runs (`glirol`, `pluzhouvio`) | invented names, long wandering, a run that reaches the goal after 96 calls, ten that never do |
| Faithful-world runs | the same model finishing at the best run's length, and a weaker one failing on one goal in 166 to 223 calls |
| Invented counterpart runs | two models at the floor, with many calls and no success |
| Runs with a skill installed (`skill-glirol`, `skill-glirol-b`) | a skill loaded late, loaded never, or loaded and followed |
| The recorded teacher runs | short, error-free, and the source of skills that turned out empty |

## First exploration: runs you open

The sections below record the first mock's organising idea and its elements. They are one worked rendering,
useful for the visual language and for what it taught, and they carry assumptions that came from the motivating
scenario: runs framed as opponents in a match (the first mock) and then as files you open; a score styled
as a Pong numeral; a leaderboard; a pairwise Compare that only makes sense for two runs of one goal; one world and
one goal; item creatures that suit invented names; and a before and after as the central comparison.
The layers above are meant to be the broader frame in which this rendering is one option.

## How it is organised: runs, and tables you open

The first mock put two runs side by side, like a model arena. That framed the runs as opponents in
a match, which they are not: it is one agent under different memory conditions, and the UI has no
chat to drive. The organising idea is now **runs you open**, like files in a small Finder.

- The stage holds one **slot**. A slot is either the **run picker** or an open **table**.
- The skillcraft visualizer **opens on the picker**, always. A live run shows up there as a pulsing tile with its
  clock running. It does not open anything for you (no follow mode).
- Clicking a run opens its table. Closing a table (the coral dot in its title bar, or Esc) turns the
  slot back into the picker. That dot is the only window control; the yellow and green ones did
  nothing and are gone.
- A finished run opens at its **start state, paused**. Play runs it at the pace it originally had,
  with long pauses capped at two seconds; the scrubber skips ahead. A live run opens at the live
  edge and follows it.
- **Compare** adds a second slot, which starts as a picker. The dashed net and the Pong-style score
  appear only when two tables are open, so the comparison is a choice and not the default. The two
  tables are **independent**: separate playheads, no syncing. A meaningful comparison lines runs up
  by state (the same table, the same holdings), not by step number, because runs take different
  numbers of steps to reach the same place. How to do that is deferred.

The picker
- A sidebar with **All runs**, the experiment folders (one per harness `--label`), and smart groups:
  Live now, Got it, Didn't get it. Each shows a count.
- A **grid** of tiles or a **list**, chosen with a toggle, and a sort of run order, calls, or time.
  A tile has the score in large numerals, a thumbnail, the run's name, the **model** that ran, a
  **call strip**, its outcome in words, and its time. The thumbnail shows the item the run made if it got it, and
  where the table was left if not. The call strip is one small square per action call: amber for a
  placement, mint for a craft, coral for a refusal, lilac for a take-back. A direct run shows a
  short strip and a flailing run shows a long, mixed one, so runs can be told apart without
  opening them.
- The **list** view acts as a leaderboard. Columns are rank, run, model, outcome, calls, time and the call
  strip. Clicking the Calls or Time header sorts by it. Runs that got the goal rank first, ordered by
  the chosen key (calls, then time as the tiebreak, or the reverse); finished runs that did not get it
  follow, ordered the same way but unranked; runs still going come last. Only runs that got the goal
  have a rank number.
- Live runs pulse, and their tiles and rows update as calls arrive, with the clock running. Arrow
  keys move between items and Enter opens one.

## What an open table shows

| Element | What it is |
|---|---|
| Score | The number of action calls so far, in large pixel numerals like a Pong score. Mint when the goal is reached, coral when the turns ran out, amber when the agent stopped without it. |
| Time | The run's clock, in the same row as the score and styled like it. It ticks while a run is live, and shows the time of the current step during replay. Under a minute it reads `4.2s`, above it `1:05`. |
| Pips | One square per call. The first `best` are mint, calls beyond the best possible are coral, and the still-to-come part of the best run is an outline. |
| The board | The crafting table, drawn from the world's grid size and filling most of the canvas. Items appear as sprites. |
| Output slot | A ghost of what `craft` would make right now. It brightens and pulses when something is craftable, and stays an empty socket when nothing is. |
| The hotbar | What the agent holds, with counts. |
| The tape | The last nine calls in words, newest first, each with the clock time at which it happened. Refusals are coral, crafts are mint, free reads are dim. |
| Status | One plain sentence: "Working it out.", "Got it in 3 calls. The best possible is 3.", "Out of turns after 16 calls, without the item.", "Gave up after 6 calls, without the item." |
| Thinking bubble | Three dots while a live run is waiting for its next call. Without it a live view looks frozen. |
| Badge | `live` while calls are arriving, `replay` while playing back, `paused` when the viewer pauses, `finished` when idle at the end of a completed run. |

The header carries the goal ("Make one glirol") with its sprite and the Compare button. Each table has
its own controls: play or pause, step, restart, a scrubber, and "go live" when scrubbed away from a
live run. Space plays and pauses, the arrows step, `r` restarts, Esc closes, `c` compares.

## Architecture (one option)

The skillcraft visualizer is a **separate process** that reads the run logs. It is not part of the `craft` server.

```text
 agent ── MCP ──> craft server ──appends──> runs/<label>/<NNN>/run.jsonl
                                               │  (read only)
                                               ▼
     runs/ directory ─────────────>  visualizer process
   (run.jsonl, mcp.json, score.json)   discovers runs, replays each log through the
                                       engine, derives one frame per call
                                               │  Server-Sent Events on 127.0.0.1
                                               ▼
                                         browser page (static, self-contained)
```

Why a separate process
- **The agent cannot reach it.** The server runs inside the agent's session. A port there would be
  reachable by any player with Bash or WebFetch, which would break the rule that the agent never
  sees the log. A separate process on `127.0.0.1` is not a tool the agent has.
- **The simulation stays clean.** The server and engine gain no HTTP, no timers, no new
  dependencies, and stay deterministic.
- **Nothing new has to be recorded.** The log is complete and the simulation is deterministic, so
  replaying it on the world reproduces every table state, the inventory and the `craftable` preview
  at each call. `scoreRun` already replays this way.

Run discovery
- The harness already lays runs out as `runs/<label>/<NNN>/`. Each folder holds `run.jsonl`,
  `mcp.json` (which names the world), `prompt.txt` (the goal) and, once finished, `score.json`.
  That is enough to list runs, group them by label, and know each one's world, goal and outcome.
- **Live** means a run whose `run.jsonl` is still growing and which has no `score.json` yet. The
  visualizer tails the file and streams each new frame.
- The log has no timestamps by design, so the visualizer notes arrival time itself, in memory, for
  animation and the thinking bubble. Arrival time is never written back to the log.

Time and tokens are measured on the client
- Observability of an agent normally instruments the **client**: each model call with its token usage
  and latency, and each tool round trip as the client sees it. The `craft` server sees none of that,
  and the memory side already works this way (`nams-hooks` records tool calls from client-side hooks).
- So there are two records with different jobs. **`run.jsonl`** is what the world did: calls and
  outcomes, written by the server, with no clock, so a replay is byte-identical and `scoreRun` can
  treat it as independent ground truth. **The client trace** is what the run cost: turns, time and
  tokens. The server log is never given a timestamp.

The trace source is the Claude Agent SDK ([ADR-002](../adr/ADR-002-client-otel-trace.md), verified)
- The harness runs the player through the SDK in its own process and records from its streamed
  messages and tool hooks into `trace.jsonl` beside each run's log. The skillcraft visualizer reads that file, so
  live time and tokens need no polling of the CLI.
- A spike ran one real 20-request run through the SDK with OpenTelemetry export on as ground truth.
  **Tokens, time to first token, tool arguments and duration matched**: all 20 requests were
  identical token for token, and the run duration agreed within 6 ms.
- **Cost is a run total only.** The SDK does not report cost per request, so the score row shows a
  whole-run cost, and "to goal" is tokens and time.
- **No personal data in the stream.** The OTel posts carried the user's email, user id, account ids
  and organization id on every record (385 occurrences each in the spike); the SDK stream carried none.
  The recorder still keeps only an allowlist, and the agent's text and reasoning are never written.
- **In-process, no lag.** OTel events arrived 30 to 360 ms after they happened; SDK messages are
  received as they are produced.
- OpenTelemetry export remains a documented alternative in the ADR, for per-request cost or for a
  player that is not run through the SDK.

The CLI and the desktop app
- Runs the **harness** starts are in its own process, so nothing needs setting and the desktop app is
  irrelevant. This is the demo path.
- An **interactive Code-tab session** is not measured by either route without editing the user's
  global settings (the desktop app does not read the shell environment, and project settings ignore the
  exporter endpoint variables). It is out of scope for the demo.

Things to know about the numbers
- **Three plugins load in every harness run, and none of them touches the numbers.** They load even
  with `--setting-sources project`, and `plugin_loaded` events record where each came from:
  `clover` (a security plugin, from the `clover-security` marketplace) is pushed by the user's
  organization through remote managed settings (`enabled_via: org-policy`), which is why it loads
  and why it likely cannot be turned off. `cc-plugin-agents-md` and `cc-plugin-telemetry` are built
  into Claude Code's default bundle and register nothing. `nams-hooks` did not load in that mode.
- Clover registers hooks on `SessionStart` (two), `UserPromptSubmit`, and `PreToolUse` for
  `ExitPlanMode` and for `Edit|Write|MultiEdit`. The session-start hooks took about 0.2 to 0.3 s
  before the first model call (232 ms by event timestamps in one run), and the prompt hook 3 ms.
  All of them produced no output (`stdout_chars` and `additional_context_chars` were 0), so **no
  tokens are injected**, and the delay never falls inside a per-turn timing. The `PreToolUse`
  matchers cannot match `craft` calls, and the harness removes the built-in tools anyway.
  Clover's purpose (reviewing plans and file edits) is inferred from those hook points and its name,
  not from reading the plugin.
- So no isolation is needed. Report about 0.2 to 0.3 s of start-up time per run and move on.
- Scoring gains time and tokens **to the goal**, up to the turn that made the goal-reaching
  call, and the whole run's cost. In the mock only run 1's total (19.0 s) is real; its per-call times are spread across it,
  and the other runs' times are illustrative.

Frames
- A pure function turns a world and a list of log entries into frames. Each frame holds the call
  (tool, arguments, outcome), the grid, what is held, what `craft` would make, the action count, the
  refusal count and whether the goal is held. This is the piece worth writing test-first.

The page
- One static page, no framework, no build step, no network. Fonts and every sprite are generated or
  bundled, so it works offline on a conference machine.
- The canvas draws at 168 by 128 native pixels and scales by a whole number, so it stays crisp at
  any size.

## Visual language

**Direction (2026-10-02):** the palette will be a local one, transcribed from the Neo4j brand colors on the brand colors
page of the Needle design system (https://neo4j.design/40a8cff71/p/606e3d-brand-colors.md), and not the Neo4j
design-system package or its Tailwind preset (GPL-3.0). The shell uses Tailwind with a theme built from it. Fonts are
Pixelify Sans, Jersey 10 and Fira Code. The table after this paragraph is the first mock's own palette and is a
reference for roles, not for values.

| Group | Name | Hex |
|---|---|---|
| Primary | Dark Baltic | `#014063` |
| Primary | Mid Baltic | `#0A6190` |
| Primary | Baltic | `#4C99A4` |
| Primary | Light Baltic | `#8FE3E8` |
| Primary highlight | Highlight Periwinkle | `#6A82FF` |
| Primary highlight | Highlight Yellow | `#FAFF00` |
| Neutral | Black | `#181414` |
| Neutral | Darkest Baltic | `#002B43` |
| Neutral | Dark Gray | `#4F4E4D` |
| Neutral | Cream | `#F2EAD4` |
| Neutral | Light Gray | `#FCF9F6` |
| Secondary | Forest, Mid Forest, Light Forest | `#145439`, `#6FA646`, `#90CB62` |
| Secondary | Marigold, Mid Marigold, Light Marigold | `#FFA901`, `#FFC450`, `#FFCF72` |
| Secondary | Hibiscus, Mid Hibiscus, Light Hibiscus | `#D43300`, `#F96746`, `#FF8E6A` |

The page's own rules: gradients are backgrounds only, with Baltic or Forest, at 45 degrees and lightest at the top right;
the documented color combinations meet contrast guidance; the secondary palette is more saturated than its earth-tone
names suggest. Baltic is the core brand color. Which color plays which role (placement, craft, refusal, take-back,
goal reached), whether the backdrop is dark or light, and whether the pixel look suits this palette are open.

The first mock's own palette (a full dusk, not one accent on black):

| Name | Hex | Used for |
|---|---|---|
| Midnight | `#171233` | Outlines, shadows, deep background |
| Dusk | `#2a2150` | The canvas backdrop, panels |
| Lamp | `#ffb45e` | Highlights, placements, "stopped" |
| Mint | `#7ee8c7` | Success, craftable, the goal reached |
| Sakura | `#ff8fb1` | Accent, confetti |
| Coral | `#ff6b7a` | Refusals, wasted calls, out of turns, the close dot |
| Wood | `#b98a5e` `#8c5a3a` `#4d2e1c` | The board only |

Type
- **Pixelify Sans** for large text only: the brand, window titles, the goal. It is too hard to read
  at small sizes, so it stops at about 20 pixels.
- **Fira Code** (in place of the first mock's JetBrains Mono) for everything small: the tape, status, controls, sidebar, tiles and footer.
- **Jersey 10** for the score numerals. The scoreboard is the memorable element, so it gets its own
  face and the most space.
- All three are bundled with the page in the real build.

Sprites
- Each item name hashes to a seed, and the seed makes an 8 by 8 symmetric creature in one of eight
  palettes. The same name always gives the same sprite, invented names need no art, and the tape
  colors an item's name to match its sprite.

Backdrop: a flat dusk with a faint dot grid. The first mock had a window, lamp, plant, mug and
desk; they added charm but competed with the table, so they are gone.

Motion
- A placed item drops in with a short bounce and its tile glows. A removed item lifts and fades.
- A craft flashes the board, throws sparkles from the output slot, and flies the new item to the
  hotbar.
- A refused call shakes the board with a coral edge.
- Reaching the goal fires confetti once.
- Effects play only when a frame changes. A run that has finished does not replay them when the
  other pane advances (a bug in the first mock).
- Everything except state changes stops under `prefers-reduced-motion`.

Sound: none yet (see open question 4).

Accessibility: keyboard controls, visible focus, an `aria-live` score, and the tape as a real list.

Other grid sizes: tile size shrinks as the grid grows (26 pixels for 3 rows, down to a floor of 12),
and sprites drop to their 10 pixel size when tiles are small.

## The mock

`design/notes/pixel-observer/mock/index.html` is a single file that opens in a browser.

- **Six runs on one world** (`forge-7`, goal `glirol`). Run 1 is a real recording: headless Claude
  Code, 10 turns, which ran out of turns after 19.0 seconds. It plays as if arriving live, in real
  time, so open the mock and it is already in progress. The other
  five are scripted stand-ins played on a real engine: a give-up, a run with refused calls, and three
  that got it (one with a detour). They are labelled `stand-in` in the picker.
- The data is inlined by `mock/make-frames.ts`. Rerun it after changing the recorded log:
  `node --import tsx design/notes/pixel-observer/mock/make-frames.ts`.
- The fonts come from Google Fonts, so the mock needs a network. The real page must not.
- Press `x` to preview the refused-call effect, which the recorded run never triggers.

## Constraints from the constitution

- Determinism: frame derivation is a pure function of the world and the log, with no clock. Arrival
  time exists only in the browser.
- Discovery over disclosure: no recipe appears anywhere by default.
- Test-first: the frame function, run discovery and the tail-and-stream server get tests before code.
- Simplicity: no framework, no build step, no runtime dependency beyond Node's built-ins if that is
  achievable.
- Decisions before specs: the architecture above is significant enough for an ADR, and the speckit
  gate requires one before `/speckit-specify`.

## Earlier decisions, held loosely

These were settled during the first exploration. Each may still be right, and each was made while one scenario
was in view. They are listed so they can be questioned, not so they bind.

- Opens on the run picker. (Assumes a collection is the entry point.)
- A finished run opens at its start state, paused. (Live runs are out of scope for now.)
- Compare is a second slot with independent tables. (Assumes pairs.)
- Clock time on every step, and the total in the score row.
- Time and tokens are measured on the client; `run.jsonl` stays clock-free and is the ground truth of what the
  world did. The client trace comes from the Claude Agent SDK (ADR-002).
- Agent text, reasoning and raw messages are never stored; the trace holds an allowlist of fields.
- Hosting means replay: a run is exported as a bundle (frames, scrubbed trace, score; no world file) and a
  static viewer plays it; live stays local (ADR-002). ADR-003 adds that bundles of worlds with Minecraft
  names need their usage terms checked before they are published.
- The close dot is the only window control.
- The picker has a grid and a list. (Assumes ranking by outcome makes sense.)

## Open questions

Grouped by the layer they touch. The first set is the original thirteen; the second is new. The scope above
settles some of them, which are struck out below and kept so the reasoning stays visible.

**One run**
- Sound: ticks, a chime, a low note on refusal, muted by default? Worth it on stage, awkward in an office.
- The agent as a character: a small figure that thinks and shrugs, instead of three dots. More charm, more art.
- ~~Speech: showing what the agent says~~ (it shows reasoning, which the harness never stores, and live is out of scope).
- Best possible: pips show the target; a ghost of the best run replaying alongside might show it as motion.

**A collection**
- Many runs: do hundreds need search and collapsing folders?
- Ranking: only runs that reached the goal are ranked, by calls then time. Is one "best" number wanted, or is
  a choice of sort enough?
- ~~Naming and arms~~ Arms and teacher or student roles are not needed (the folder is the only input). Runs are
  numbered under their label, and the label, world, model, goal and skill presence are the attributes to group by.

**Juxtaposing**
- Comparing by state: line two runs up when their tables match and show where they diverge. This may change
  what a second slot is.

**Items and presentation**
- Sprite legibility: eight palettes and symmetric shapes may collide for similar names. Hover names, a
  legend, a bigger palette?
- The win: confetti and a mint numeral, or quieter?
- Full-screen mode with larger type, and exporting a run as a GIF or video?
- ~~Where it starts: a `--watch` flag on `run-agent`, a standalone `pnpm observe`, or both?~~ (no `--watch` while live is out of scope; how it starts is for the ADR.)

**What cost means.** Four kinds of tokens priced very differently, context that grows each turn, and a
fixed floor of about 4.3k tokens. The leaderboard needs one number to sort by; other views may not.

**New, from the experiments**
- The four user goals now frame the work. Are the layers above still a useful way to think about it, or are they extra?
- Which run attributes should be an axis or a facet, and which are only labels?
- How does a collection show runs of different worlds and goals together without implying they compete?
- ~~Is an aggregate view part of the visualizer?~~ Out of scope for now.
- How should an item look when its name is familiar, and should that be a choice of the world or of the viewer?
- ~~What is shown of a skill?~~ That a run had one, whether it was loaded and after how many calls; not its source.
- ~~Does the visualizer need to know what an arm or a goal role is?~~ No: the folder alone is the input.
- Should a view (selection, grouping, layout) be saveable and shareable as data?
- What makes a design here "general enough"? Is it that it reads well on all of the datasets above?

## From here

**Built (2026-10-02).** The visualizer follows ADR-004 and spec 004: a read-only page over a folder of runs, served
by a local process or from a static copy. This note's earlier sections stay as the record of the thinking; the
choices below were made while building and are held loosely.

What the build taught, in the order it was met:

- **The group-by menu lists every attribute the runs carry**, so grouping by tokens or cost is offered too. World,
  outcome, model, prior fit and whether a skill loaded make useful groups on the recorded runs; the others are
  numbers with few repeats. Hinting at the useful ones is open.
- **A thumbnail of the last table is empty for most successful runs**, since crafting clears the table. The tile now
  shows the goal item instead when the run reached it, and the last table otherwise.
- **The creatures hide which item is which.** On the faithful world's table and hotbar nothing says `oak_planks`;
  only the call list does. A legend or a label on hover is the next thing to try, and the world with familiar names
  is where it matters.
- **The scene stopped drawing after one step** when an effect outlived its sprite. Effects now end when the next frame is
  shown, and a failing effect is dropped instead of stopping the ticker. The check that found it was looking at the
  real page, which is why drawing is checked by hand for now.
- **Roles for the palette:** a dark backdrop (Black), panels in Darkest Baltic, text in Light Gray and Light Baltic,
  the goal and crafts in Light Forest, placements in Mid Marigold, refusals in Mid Hibiscus and take-backs in
  Highlight Periwinkle. Periwinkle reads at 4.4:1 on the panel, so calls are listed on the backdrop. The roles and a
  contrast test are in `viz/src/roles.ts`.
- **Rows are wide.** With nine columns a list row needs about 1280 pixels; below that it wraps, and the wrapped layout
  is plain. The grid reads better on a narrow screen. (Superseded 2026-10-04: the list is always a grid with column headers, in rem so it
  scales with the frame. See the amendment to ADR-004.)
- **Speed is not a concern at this size:** 200 runs scan in about 0.3 seconds, a table opens in about 0.1 seconds and 200
  tiles switch in under 20 milliseconds.
- **`svelte-check` does not support TypeScript 7,** so the TypeScript inside `.svelte` files is not type-checked yet.

Still open, to be worked out with use: item art for familiar names, how much of group, sort and filter to expose,
whether a view could be saved, comparing by state instead of by step, and sound.
