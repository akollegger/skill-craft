<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";

  let { runs = [] }: { runs?: CatalogEntry[] } = $props();

  // A run can be listed without being shown as a table: it may still be going, or its files may not read.
  const unavailable = $derived(runs.filter((r) => r.status !== "ready").length);
</script>

<!-- All the help, in the dark under the frame: nothing inside the frame explains itself. -->
<footer aria-label="Hints" class="hints">
  <p>Click a run to open it. Shift-click two runs, or press Shift+Enter on each, to compare them. ■ marks the column the list is grouped by, ▲ the one it is sorted by.</p>
  {#if unavailable > 0}<p>{unavailable} can't be opened as a table (unfinished, or the record can't be read); each says why.</p>{/if}
</footer>
