<script lang="ts">
  import type { Stat } from "./stats.ts";

  // A run's spend as small stats, one a line: the figure and, for the token counts, a pixel icon. The cost and the time need none, since
  // their figures say what they are. The words are each line's tooltip and its label for a screen reader.
  let { stats }: { stats: readonly Stat[] } = $props();

  // x, y, width, height of each rectangle, on a seven by seven grid
  type Rects = readonly (readonly [number, number, number, number])[];
  const BARS: Rects = [[0, 2, 7, 1], [0, 4, 7, 1], [0, 6, 7, 1]];
  const ICONS: Partial<Record<Stat["icon"], Rects>> = {
    in: [[3, 0, 1, 3], [1, 3, 5, 1], [2, 4, 3, 1], [3, 5, 1, 1]],
    out: [[3, 0, 1, 1], [2, 1, 3, 1], [1, 2, 5, 1], [3, 3, 1, 4]],
    cacheRead: BARS,
    cacheWrite: [[3, 0, 1, 1], ...BARS],
  };
</script>

{#if stats.length > 0}
  <ul class="m-0 flex list-none flex-col gap-1 p-0 text-xs leading-none text-retro-dim" aria-label="What the run spent">
    {#each stats as s (s.icon)}
      <li class="flex items-center gap-2" title={s.label}>
        <span class="sr-only">{s.label}: </span>
        <svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true" class="h-[0.6rem] w-[0.6rem] flex-none fill-current">
          {#each ICONS[s.icon] ?? [] as [x, y, w, h]}<rect {x} {y} width={w} height={h} />{/each}
        </svg>
        <span>{s.text}</span>
      </li>
    {/each}
  </ul>
{/if}
