<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";
  import Row from "./Row.svelte";

  let { entries }: { entries: CatalogEntry[] } = $props();
</script>

<!-- The ticked runs as adjacent rows with the list's own columns, so their attributes line up. -->
<div role="group" aria-label="Comparing" class="rounded-sm border border-mid-baltic bg-black">
  <ul>
    {#each entries as entry (entry.id)}
      <Row {entry} onOpen={() => {}} inert />
    {/each}
  </ul>
</div>
