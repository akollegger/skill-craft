# Quickstart: checking the visualizer

Prerequisites: `pnpm install`, Node 22.12 or newer, and run folders on disk (the repository's `runs/` is
enough; it is gitignored and holds the pilot, faithful-world and counterpart runs).

## 1. Data side

```bash
pnpm typecheck && pnpm test
pnpm dev scripts/viz-export.ts runs /tmp/viz-out --no-page
```

Expect: a count of exported runs, and one line per skipped run (unfinished, world missing, log does not
replay). `/tmp/viz-out/catalog.json` lists every run, including the skipped ones with their reason, and
`/tmp/viz-out/bundles/<id>/` holds four files per exported run.

## 2. Serve a folder

```bash
pnpm build:viz
pnpm dev scripts/viz.ts runs
```

Open the printed URL (the Claude desktop browser pane or any browser). Check against the spec:

| Check | Story | What to see |
|---|---|---|
| Group by `world` | 1 | each world once, with its runs; an unfinished or unreadable run shows its reason and cannot be opened |
| Point the process at one experiment folder, then at a single run folder | 1 | the runs inside are listed in each case |
| Group by `modelRan`, sort by `actionCalls`, filter `outcome is reached` | 3 | the list follows; runs lacking an attribute sit in a labelled group |
| Toggle grid and list | 3 | the same runs in the same order; the list adds column headers (World, Goal, Calls, Tape, Model, Skill) and each row is a flat bevelled block with no separator and no name column; no group headings: the grouped column's name has a yellow square and the sorted column's a stepped triangle; calls are a large numeral and the tape (at most three rows) uses the same colors as the playback pips: green within the best number of calls, yellow past it, red for a failed run's score and its last call; all help is under the frame |
| Open a finished run | 2 | start state, paused; step with the arrow keys; pips are green to the best count, yellow after, and a failed run's last is red; refusals look different from crafts (by text style, not color); the end shows the outcome |
| Shift-click two runs, Open both tables | 4 | selected runs get a yellow border and background and stay where they are (no checkboxes, no panel, no count); "Open both tables" appears with two selected; two tables, independent playback; works for different goals or worlds. Shift+Enter on a focused run selects it too |
| Look at runs that missed their goal | 3 | the thumbnail is the goal item in a wooden slot, greyed out; runs for one goal look alike |
| Open a run with a skill that was loaded late, one never loaded, one with no skill | 5 | three different pixel icons (solid, outline, extra corner pixel) and a dash in the list for none; the wording is only in the tooltip and the open view |
| Turn off the network, reload | all | the page still works (fonts and sprites are bundled) |

## 3. Static host

```bash
pnpm dev scripts/viz-export.ts runs /tmp/viz-site
cd /tmp/viz-site && python3 -m http.server 8099
```

Open `http://127.0.0.1:8099/` and repeat the Story 1, 2 and 4 checks. The list and the open runs match what
the local process showed for the same folder (SC-006).

## 4. The sample set

Run the checks above on the datasets listed in the spec's assumptions: the pilot's invented-world runs, the
faithful-world runs, the invented counterpart's, the runs with a skill installed, and the recorded teacher
runs. Note in `design/notes/pixel-observer.md` anything that read poorly on one dataset and well on another.

## 5. Privacy and offline

```bash
grep -rEl "minecraft-inspired|\"recipes\"" /tmp/viz-site/catalog.json /tmp/viz-site/bundles | head
grep -rEo "https?://[^\"' )]+" /tmp/viz-site/assets 2>/dev/null | sort -u | head
```

Expect no output from the first (no world file name or recipe list) and no fetched URLs from the second
(namespace and specification URLs inside library code are not fetched; the offline test lists those it
allows).
