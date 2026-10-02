<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";

  let { runs, shown }: { runs: CatalogEntry[]; shown: number } = $props();

  const ready = $derived(runs.filter((r) => r.status === "ready").length);
</script>

<aside class="flex flex-col gap-4 border-r border-dark-baltic bg-darkest-baltic p-4 font-mono text-sm">
  <h1 class="font-pixel text-xl text-highlight-yellow">Skillcraft visualizer</h1>
  <p class="text-light-baltic">{runs.length} runs, {ready} can be opened</p>
  {#if shown !== runs.length}<p class="text-light-baltic">showing {shown}</p>{/if}
</aside>
