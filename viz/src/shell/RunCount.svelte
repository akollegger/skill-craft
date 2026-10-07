<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";

  let { runs, shown }: { runs: CatalogEntry[]; shown: number } = $props();

  const noun = (n: number) => `${n} ${n === 1 ? "run" : "runs"}`;
  const total = $derived(runs.length);
</script>

<!-- Only the count: the help is under the frame. -->
<footer aria-label="Run count" class="pt-2 font-mono text-xs text-retro-muted">
  {shown === total ? noun(total) : `Showing ${shown} of ${noun(total)}`}
</footer>
