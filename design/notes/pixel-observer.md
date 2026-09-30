# Design note: the pixel observer

Status: exploratory, with a working mock. Nothing here is decided.
Date: 2026-09-30 (revised after two rounds of feedback)
Feeds: an ADR on the observer's architecture, then a speckit feature.

## Why

The project's argument is that an agent with a distilled skill gets to the answer faster than one
without. A table of numbers makes that argument. A screen that shows it makes the demo. The model is
the Pong demo that got DeepMind funded: a small world, a score, and an unmistakable difference
between "before" and "after" that anyone in the room can read in seconds.

So the observer is **live first**. You watch an agent work at the crafting table as its calls
arrive, then scrub back through the run afterward. It is lofi pixel art on purpose: warm, a little
funny, and not a dashboard.

## Goals and non-goals

Goals
- Show a run as it happens, and replay it afterward.
- Let you browse the runs that exist, open any of them, and put two side by side when comparing.
- Make invented items feel like distinct little creatures, so a viewer can follow "the agent placed
  this one, then that one" without reading names.
- Keep the crafting table the star. Nothing decorative competes with it.

Non-goals
- It does not control anything. There is no chat, no way to start a run or inject a call. It watches.
- It does not show recipes. A viewer who knows the answer spoils the demo for everyone else. A
  recipe view may exist later, off by default.
- It is not an analytics dashboard. `scripts/score.ts` and `summary.json` already answer "how many
  and how often".
- It is not the run harness. It watches; `scripts/run-agent.ts` runs.

## How it is organised: runs, and tables you open

The first mock put two runs side by side, like a model arena. That framed the runs as opponents in
a match, which they are not: it is one agent under different memory conditions, and the UI has no
chat to drive. The organising idea is now **runs you open**, like files in a small Finder.

- The stage holds one **slot**. A slot is either the **run picker** or an open **table**.
- The observer **opens on the picker**, always. A live run shows up there as a pulsing tile with its
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
  A tile has the score in large numerals, a thumbnail, the run's name, a **call strip**, its
  outcome in words, and its time. The thumbnail shows the item the run made if it got it, and
  where the table was left if not. The call strip is one small square per action call: amber for a
  placement, mint for a craft, coral for a refusal, lilac for a take-back. A direct run shows a
  short strip and a flailing run shows a long, mixed one, so runs can be told apart without
  opening them.
- The **list** view acts as a leaderboard. Columns are rank, run, outcome, calls, time and the call
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

## Architecture (recommended)

The observer is a **separate process** that reads the run logs. It is not part of the `craft` server.

```text
 agent ── MCP ──> craft server ──appends──> runs/<label>/<NNN>/run.jsonl
                                               │  (read only)
                                               ▼
     runs/ directory ─────────────>  observer process
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
  observer tails the file and streams each new frame.
- The log has no timestamps by design, so the observer notes arrival time itself, in memory, for
  animation and the thinking bubble. Arrival time is never written back to the log.

Time and tokens are measured on the client
- Observability of an agent normally instruments the **client**: each model call with its token usage
  and latency, and each tool round trip as the client sees it. The `craft` server sees none of that,
  and the memory side already works this way (`nams-hooks` records tool calls from client-side hooks).
- So there are two records with different jobs. **`run.jsonl`** is what the world did: calls and
  outcomes, written by the server, with no clock, so a replay is byte-identical and `scoreRun` can
  treat it as independent ground truth. **The client trace** is what the run cost: turns, time and
  tokens. The server log is never given a timestamp.

The trace source is Claude Code's OpenTelemetry export (verified)
- Tested on real runs, exporting OTLP over HTTP/JSON to a local receiver. The harness sets these on
  each `claude -p` child: `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`
  (for spans), `OTEL_LOGS_EXPORTER`, `OTEL_TRACES_EXPORTER` and `OTEL_METRICS_EXPORTER` set to
  `otlp`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:<port>`,
  `OTEL_LOG_TOOL_DETAILS=1` (to get tool arguments), and short export intervals
  (`OTEL_LOGS_EXPORT_INTERVAL` and `OTEL_TRACES_EXPORT_INTERVAL` of 250 ms).
- **Tokens and cost are exact.** Each `claude_code.api_request` event carries `input_tokens`,
  `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cost_usd`, `duration_ms` and a
  `request_id`. Summed over a run they equal the CLI's own totals exactly, for tokens and for cost.
- **Durations.** The `claude_code.llm_request` span adds `ttft_ms`. `claude_code.tool.execution`
  gives each tool call's duration (4 to 17 ms here). The `claude_code.interaction` span is the whole
  run. So a turn splits cleanly into the model's thinking time and the tool's time.
- **Joining.** `tool_use_id` is identical in the spans, the log events and the CLI stream. Spans
  give the full tool name (`mcp__craft__place`); the `tool_result` log event gives the arguments in
  `tool_input`. Both join to `run.jsonl` by order, tool and arguments.
- **Near-live.** With a 250 ms interval, events reached the receiver 30 to 360 ms after they
  happened (median about 240 ms). The default is 5 s, so the interval must be set. In `-p` mode
  everything is also flushed on exit.
- **The harness hosts the receiver** ([ADR-002](../adr/ADR-002-client-otel-trace.md)). It listens on
  `127.0.0.1`, writes a scrubbed `trace.jsonl` beside each run's log, and totals the run into
  `score.json`. The observer reads those files, so live time and tokens need no polling of the CLI.
- **Do not keep the raw posts.** Every log record carries the user's email, user id, account ids and
  organization id (seen in the capture; the docs say email and organization id are always included,
  and the account ids can be turned off with `OTEL_METRICS_INCLUDE_ACCOUNT_UUID`). `runs/` is
  gitignored, but run folders get shared when a demo is shared. The harness's receiver derives the trace
  (turn, times, the four token counts, cost, `tool_use_id`, tool name and arguments) and drop the
  personal attributes on ingest.
- The CLI's stream-json output (with `--include-partial-messages`) gives the same tokens with no
  infrastructure, and remains the fallback.

The CLI and the desktop app
- Runs the **harness** starts are child processes, so it sets the variables directly and the desktop
  app is irrelevant. This is the demo path.
- An **interactive Code-tab session** is different. The desktop app does not read the shell
  environment, and project `.claude/settings.json` deliberately ignores the exporter endpoint
  variables. The `env` block in `~/.claude/settings.json` (or managed settings) is the only way, and it
  would apply to every session the user runs. The user's settings have no `env` block today, so this is
  an explicit opt-in and is not needed for the demo.
- MCP servers and hooks do not receive the `OTEL_*` variables, so the `craft` server is unaffected.

Things to know about the numbers
- **One request is off the books.** The spans show a fifth, auxiliary request after the turn ends
  (about 127 input and 63 output tokens, apparently the post-turn summary). It is not in the CLI's
  totals, the `api_request` events or the metrics. It is small, but real cost.
- **`mcp_tool.name` on `api_request` labels the previous tool's result**, not the call that turn made.
  Attribute tokens to calls through `tool_use_id` and the spans instead.
- **Log events call every MCP tool `mcp_tool`.** The full name is in the spans.
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
- Scoring gains time, tokens and cost **to the goal**, up to the turn that made the goal-reaching
  call. In the mock only run 1's total (19.0 s) is real; its per-call times are spread across it,
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

Palette (a full dusk, not one accent on black)

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
- **JetBrains Mono** for everything small: the tape, status, controls, sidebar, tiles and footer.
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

## Decided so far

- Opens on the run picker; no follow mode.
- A finished run opens at its start state, paused.
- Compare is a second slot, with independent tables. A per-state comparison is deferred.
- Clock time on every step and the total in the score row.
- Time and tokens are measured on the client. `run.jsonl` stays clock-free and remains the ground
  truth of what the world did.
- The client trace comes from Claude Code's OpenTelemetry export, which was tested: exact tokens and
  cost, per-request and per-tool durations, near-live delivery, and the harness hosts the receiver (ADR-002).
- Raw OTLP posts are not stored, because they carry the user's identity; a scrubbed trace is.
- No baseline isolation is needed. The organization's plugin adds about 0.2 to 0.3 s of start-up per
  run and no tokens; that is reported, not removed.
- Hosting means replay: a run is exported as a bundle (frames, scrubbed trace, score; no world file)
  and a static viewer plays it, so visitors can explore. Live stays local (ADR-002).
- The close dot is the only window control.
- The picker has a grid and a list, and the list works as a leaderboard sorted by calls or time.

## Open questions

1. **What "cost" means.** Tokens come in four kinds priced very differently, and context grows each
   turn, so calls understate the gap between runs. A fixed floor of about 4.3k tokens (system prompt
   and tool schemas) also narrows it. The skill arm adds its text and the memory arm adds recalled
   context on every prompt. Do we show raw counts, the CLI's cost in dollars, or a derived figure? The
   leaderboard needs one number to sort by.
2. **Ranking.** Only runs that got the goal are ranked, by calls then time, or by time then calls.
   Should a run that got it with more calls but faster ever outrank a slower, leaner one? Is "best" a
   single number the leaderboard should show, or is a choice of sort enough?
3. **Comparing by state.** Line two runs up when their tables match, and show where they diverge.
   This is the meaningful comparison, and it is deferred. It may change what the second slot is.
4. **Sound.** A soft tick per placement, a chime on craft, a low note on refusal, muted by default.
   Worth it for talks and video, awkward for a shared office.
5. **The win.** Confetti and a mint numeral, or quieter? A talk wants a bigger payoff than a desk
   monitor.
6. **Best possible.** Pips show the target. A faint "ghost" of the best run replaying alongside would
   show it as motion. Which is clearer?
7. **The agent as a character.** A small pixel figure that thinks, reaches and shrugs on a refusal,
   in place of the abstract bubble. More charm, more art to draw.
8. **Speech.** Streaming the CLI's output would let the bubble show what the agent says ("trying
   pairs"). That is compelling, but it shows reasoning and couples the observer to the harness.
9. **Sprite legibility.** Eight palettes and symmetric shapes may collide for similar names. Hover
   names, a legend, or a bigger palette?
10. **Many runs.** A grid or list works for a dozen runs. With hundreds, does it need search and
    collapsing folders?
11. **Naming and arms.** Runs are numbered under their label (`baseline / 001`). The player note
    proposes baseline, memory and skill arms. Does the harness need an `--arm` flag, and a human name,
    so the picker can group and label runs?
12. **Presentation.** A full-screen mode with larger type for talks, and exporting a run as a GIF or
    video for the write-up?
13. **Where it starts.** A `--watch` flag on `run-agent`, a standalone `pnpm observe`, or both?

## Path to implementation

1. Iterate this note and the mock until the look and the questions above settle.
2. Write the observer ADR: a separate read-only process, frames derived by replay, runs discovered from the
   harness's folders, live by tailing the log.
3. `/speckit-specify` referencing that ADR, then plan, tasks and implementation.
4. Build order: the frame function, run discovery, the static page from the mock, the
   tail-and-stream server, then the two-slot comparison layout.
