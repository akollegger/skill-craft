<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";
  import type { Group } from "../state/group.ts";
  import Row from "./Row.svelte";
  import Tile from "./Tile.svelte";

  let {
    groups,
    presentation,
    showHeaders,
    onOpen,
    ticked = [],
    onTick,
  }: { groups: Group[]; presentation: "grid" | "list"; showHeaders: boolean; onOpen: (entry: CatalogEntry) => void; ticked?: string[]; onTick?: ((entry: CatalogEntry) => void) | undefined } = $props();

  let collapsed = $state<Record<string, boolean>>({});
  let root: HTMLElement | undefined = $state();

  // Arrow keys move between the runs that can be opened, in the order shown; Enter and Space act on the focused
  // button as usual. The same order serves the list and the grid.
  function onKeyDown(e: KeyboardEvent): void {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    const buttons = [...(root?.querySelectorAll<HTMLElement>("[data-open]") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, at + step))]?.focus();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div bind:this={root} role="presentation" onkeydown={onKeyDown} class="flex flex-col gap-4">
  {#each groups as group (group.key)}
    <section>
      {#if showHeaders}
        <h3 class="font-pixel text-lg text-light-baltic">
          <button
            class="flex w-full items-baseline gap-2 rounded-sm px-3 py-1 text-left hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic"
            aria-expanded={!collapsed[group.key]}
            onclick={() => (collapsed[group.key] = !collapsed[group.key])}
          >
            <span aria-hidden="true">{collapsed[group.key] ? "▸" : "▾"}</span>
            <span>{group.label}</span>
            <span class="font-mono text-sm text-baltic">{group.runs.length}</span>
          </button>
        </h3>
      {/if}
      {#if !collapsed[group.key]}
        <ul class={presentation === "grid" ? "flex flex-wrap gap-3 p-2" : ""}>
          {#each group.runs as entry (entry.id)}
            {#if presentation === "grid"}
              <Tile {entry} {onOpen} {onTick} ticked={ticked.includes(entry.id)} />
            {:else}
              <Row {entry} {onOpen} {onTick} ticked={ticked.includes(entry.id)} />
            {/if}
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</div>
