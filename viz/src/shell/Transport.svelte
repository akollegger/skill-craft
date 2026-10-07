<script lang="ts">
  import type { PlaybackAction } from "../state/playback.ts";

  // The playback controls as chunky icon buttons in a column: jump to the start, step back, play or pause, step forward, jump to the end.
  // Each icon is drawn from whole pixels on a ten by ten grid, in the text color, so it stays crisp at any size. The words are the label,
  // for a screen reader and a tooltip.
  let { playing, canPlay, last, dispatch }: { playing: boolean; canPlay: boolean; last: number; dispatch: (a: PlaybackAction) => void } = $props();

  // x, y, width, height of each rectangle
  type Rects = readonly (readonly [number, number, number, number])[];
  const TRIANGLE_LEFT: Rects = [[5, 4, 1, 2], [6, 3, 1, 4], [7, 2, 1, 6], [8, 1, 1, 8]];
  const TRIANGLE_RIGHT: Rects = [[4, 4, 1, 2], [3, 3, 1, 4], [2, 2, 1, 6], [1, 1, 1, 8]];
  const ICONS = {
    start: [[1, 1, 2, 8], ...TRIANGLE_LEFT],
    end: [[7, 1, 2, 8], ...TRIANGLE_RIGHT],
    // The chevrons are three pixels thick: a run of three in each row, stepping one pixel a row.
    back: [[6, 1, 3, 1], [5, 2, 3, 1], [4, 3, 3, 1], [3, 4, 3, 1], [3, 5, 3, 1], [4, 6, 3, 1], [5, 7, 3, 1], [6, 8, 3, 1]],
    forward: [[1, 1, 3, 1], [2, 2, 3, 1], [3, 3, 3, 1], [4, 4, 3, 1], [4, 5, 3, 1], [3, 6, 3, 1], [2, 7, 3, 1], [1, 8, 3, 1]],
    play: [[2, 1, 2, 8], [4, 2, 2, 6], [6, 3, 2, 4], [8, 4, 1, 2]],
    pause: [[2, 1, 2, 8], [6, 1, 2, 8]],
  } as const satisfies Record<string, Rects>;
  type Icon = keyof typeof ICONS;

  const buttons = $derived<{ icon: Icon; label: string; title: string; disabled?: boolean; act: PlaybackAction }[]>([
    { icon: "start", label: "Jump to start", title: "Jump to start (Home)", act: { type: "scrub", to: 0 } },
    { icon: "back", label: "Step back", title: "Step back (left arrow)", act: { type: "step", by: -1 } },
    { icon: playing ? "pause" : "play", label: playing ? "Pause" : "Play", title: `${playing ? "Pause" : "Play"} (space)`, disabled: !canPlay, act: { type: "toggle" } },
    { icon: "forward", label: "Step forward", title: "Step forward (right arrow)", act: { type: "step", by: 1 } },
    { icon: "end", label: "Jump to end", title: "Jump to end (End)", act: { type: "scrub", to: last } },
  ]);
</script>

<div class="flex flex-col gap-3" role="group" aria-label="Playback">
  {#each buttons as b (b.label)}
    <button type="button" class="transport-button" aria-label={b.label} title={b.title} disabled={b.disabled} onclick={() => dispatch(b.act)}>
      <svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true" class="h-full w-full fill-current">
        {#each ICONS[b.icon] as [x, y, w, h]}<rect {x} {y} width={w} height={h} />{/each}
      </svg>
    </button>
  {/each}
</div>
