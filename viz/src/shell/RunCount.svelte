<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";

  let { runs, shown }: { runs: CatalogEntry[]; shown: number } = $props();

  const noun = (n: number) => `${n} ${n === 1 ? "run" : "runs"}`;
  const total = $derived(runs.length);
  // A run can be listed without being shown as a table: it may still be going, or its files may not read.
  const unavailable = $derived(runs.filter((r) => r.status !== "ready").length);
</script>

<footer aria-label="Run count" class="border-t border-dark-baltic pt-2 font-mono text-sm text-light-baltic">
  {shown === total ? noun(total) : `Showing ${shown} of ${noun(total)}`}{#if unavailable > 0}. {unavailable} can't be opened as a table (unfinished, or the record can't be read); each says why.{/if}
</footer>
