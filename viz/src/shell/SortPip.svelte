<script lang="ts">
  // A triangle in art pixels: rows one, three, five and seven wide, so its edges step. Up is ascending.
  let { dir }: { dir: "asc" | "desc" } = $props();
</script>

<svg data-sort-pip data-dir={dir} viewBox="0 0 7 4" shape-rendering="crispEdges" aria-hidden="true" class="h-[0.6rem] w-[1.05rem] fill-light-baltic">
  {#each [0, 1, 2, 3] as step (step)}
    {@const w = 1 + step * 2}
    <rect x={(7 - w) / 2} y={dir === "asc" ? step : 3 - step} width={w} height="1" />
  {/each}
</svg>
