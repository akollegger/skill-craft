<script lang="ts">
  let { ticked, onOpenBoth, onClear }: { ticked: number; onOpenBoth: () => void; onClear: () => void } = $props();

  const button = "rounded-sm border border-mid-baltic px-2 py-1 hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic disabled:opacity-40";
</script>

<div class="flex items-center gap-3 font-mono text-sm text-baltic">
  <span>{ticked === 0 ? "Tick two runs to compare them." : ticked === 1 ? "1 run ticked. Tick one more." : "2 runs ticked."}</span>
  <button class={button} disabled={ticked !== 2} onclick={onOpenBoth}>Open both tables</button>
  <button class={button} disabled={ticked === 0} onclick={onClear}>Clear ticks</button>
</div>
