<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";
  import type { Group } from "../state/group.ts";
  import type { Sort } from "../state/view.ts";
  import ListHeader from "./ListHeader.svelte";
  import Row from "./Row.svelte";
  import Tile from "./Tile.svelte";

  let {
    groups,
    presentation,
    onOpen,
    selected = [],
    onSelect,
    group = null,
    sort = null,
  }: { groups: Group[]; presentation: "grid" | "list"; onOpen: (entry: CatalogEntry) => void; selected?: string[]; onSelect?: ((entry: CatalogEntry) => void) | undefined; group?: string | null; sort?: Sort | null } = $props();

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
  {#if presentation === "list"}<ListHeader {group} {sort} />{/if}
  {#each groups as group (group.key)}
    <section>
      <ul class={presentation === "grid" ? "flex flex-wrap gap-3 p-2" : "flex flex-col gap-1"}>
        {#each group.runs as entry (entry.id)}
          {#if presentation === "grid"}
            <Tile {entry} {onOpen} {onSelect} selected={selected.includes(entry.id)} />
          {:else}
            <Row {entry} {onOpen} {onSelect} selected={selected.includes(entry.id)} />
          {/if}
        {/each}
      </ul>
    </section>
  {/each}
</div>
