<script lang="ts">
  import type { Sort } from "../state/view.ts";
  import { LIST_COLUMNS, LIST_GRID } from "./columns.ts";

  // The column the runs are grouped by carries a square, and the one they are sorted by a stepped triangle (up for ascending): the
  // group's value is then read from the rows, so no group needs a heading.
  let { group = null, sort = null }: { group?: string | null; sort?: Sort | null } = $props();
</script>

<div aria-hidden="true" data-list-header class={`${LIST_GRID} px-3 py-1 font-mono text-xs uppercase text-baltic`}>
  {#each LIST_COLUMNS as col (col.label + col.attrs.join())}
    <span data-column class="flex items-center gap-1">
      {col.label}
      {#if group !== null && col.attrs.includes(group)}<span data-group-pip class="h-2 w-2 bg-highlight-yellow"></span>{/if}
      {#if sort !== null && col.attrs.includes(sort.attr)}
        <svg data-sort-pip data-dir={sort.dir} viewBox="0 0 7 4" shape-rendering="crispEdges" class="h-[0.6rem] w-[1.05rem] fill-light-baltic">
          {#each [0, 1, 2, 3] as step (step)}
            {@const w = 1 + step * 2}
            <rect x={(7 - w) / 2} y={sort.dir === "asc" ? step : 3 - step} width={w} height="1" />
          {/each}
        </svg>
      {/if}
    </span>
  {/each}
</div>
