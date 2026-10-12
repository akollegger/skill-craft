<script lang="ts">
  import SortPip from "./SortPip.svelte";

  // A row of buttons joined into one block, one of them lit, in place of a native select. The lit one can carry a pip: a square
  // (the column the runs are grouped by) or a triangle (the one they are sorted by, up for ascending), the same as in the list header.
  export interface Option {
    value: string;
    label: string;
  }
  let {
    label,
    options,
    active = null,
    pip = null,
    onPick,
  }: { label: string; options: Option[]; active?: string | null; pip?: "square" | "asc" | "desc" | null; onPick: (value: string) => void } = $props();
</script>

<div role="group" aria-label={label} class="flex items-center gap-2">
  <span aria-hidden="true" class="text-retro-dim">{label}</span>
  <span class="flex gap-1">
    {#each options as o (o.value)}
      <button
        type="button"
        data-option={o.value}
        aria-pressed={active === o.value}
        class={`flex items-center gap-2 px-3 py-1 shadow-[inset_-2px_-2px_0_rgba(0,0,0,0.3),inset_2px_2px_0_rgba(255,255,255,0.08)] focus-visible:outline-2 focus-visible:outline-retro-muted ${active === o.value ? "bg-retro-line text-highlight-yellow" : "bg-retro-raised text-light-gray hover:bg-retro-line"}`}
        onclick={() => onPick(o.value)}
      >
        {o.label}
        {#if active === o.value && pip === "square"}<span data-group-pip class="h-2 w-2 bg-highlight-yellow"></span>{/if}
        {#if active === o.value && (pip === "asc" || pip === "desc")}<SortPip dir={pip} />{/if}
      </button>
    {/each}
  </span>
</div>
