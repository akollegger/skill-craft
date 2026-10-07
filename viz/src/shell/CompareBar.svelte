<script lang="ts">
  // Only the actions, and only when there is something to act on: how to select is in the footer.
  let { selected, onOpenBoth, onClear }: { selected: number; onOpenBoth: () => void; onClear: () => void } = $props();

  const button = "border border-retro-line px-2 py-1 hover:bg-retro-raised focus-visible:outline-2 focus-visible:outline-retro-muted";
</script>

{#if selected > 0}
  <div class="flex items-center gap-3 font-mono text-sm text-retro-dim">
    {#if selected === 2}<button class={button} onclick={onOpenBoth}>Open both tables</button>{/if}
    <button class={button} onclick={onClear}>Clear selection</button>
  </div>
{/if}
