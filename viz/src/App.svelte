<script lang="ts">
  import { onMount } from "svelte";
  import type { Catalog, CatalogEntry } from "../../src/viz/contract.ts";
  import { createClient, type LoadError } from "./contract/client.ts";
  import { createScenePool } from "./scene/pool.ts";
  import type { SceneFactory } from "./scene/handle.ts";
  import CompareBar from "./shell/CompareBar.svelte";
  import Empty from "./shell/Empty.svelte";
  import Hints from "./shell/Hints.svelte";
  import OpenRun from "./shell/OpenRun.svelte";
  import Picker from "./shell/Picker.svelte";
  import RunCount from "./shell/RunCount.svelte";
  import Toolbar from "./shell/Toolbar.svelte";
  import Unsupported from "./shell/Unsupported.svelte";
  import { describeAttributes } from "./state/attributes.ts";
  import { closeRun, initialSelection, openRun, toggleSelected } from "./state/selection.ts";
  import { arrange, defaultView, type View } from "./state/view.ts";

  // PixiJS is loaded only when a table is first opened, so the list stays light.
  const lazyScene: SceneFactory = async (host, options) => (await import("./scene/TableScene.ts")).tableScene(host, options);
  let { createScene = lazyScene }: { createScene?: SceneFactory } = $props();
  // At most two tables draw at once: a browser caps the WebGL contexts a page may hold.
  const pool = createScenePool((host, options) => createScene(host, options), 2);

  const client = createClient();
  let catalog = $state<Catalog | undefined>();
  let error = $state<LoadError | undefined>();
  let view = $state<View>(defaultView());
  let selection = $state(initialSelection());
  let beside = $state(false);

  const attributes = $derived(describeAttributes(catalog?.runs ?? []));
  const groups = $derived(catalog ? arrange(catalog.runs, view) : []);
  const shown = $derived(groups.reduce((n, g) => n + g.runs.length, 0));
  const byId = $derived(new Map((catalog?.runs ?? []).map((r) => [r.id, r])));
  const opened = $derived(selection.open.map((id) => byId.get(id)).filter((e): e is CatalogEntry => e !== undefined));

  onMount(async () => {
    const loaded = await client.catalog();
    if (loaded.ok) {
      catalog = loaded.value;
      // Worlds are the first thing to see; a folder without them opens ungrouped.
      if (loaded.value.runs.some((r) => r.attributes["world"] !== undefined)) view = { ...view, group: "world" };
    } else error = loaded.error;
  });

  const open = (entry: CatalogEntry): void => {
    selection = openRun(selection, entry.id);
    beside = false;
  };
  const close = (id: string): void => {
    selection = closeRun(selection, id);
    beside = false;
  };
  const openBoth = (): void => {
    selection = { ...selection, open: [] };
    for (const id of selection.selected) selection = openRun(selection, id);
  };
</script>

{#snippet browse()}
  <div class="flex flex-col gap-3">
    <Toolbar {attributes} {view} onChange={(v) => (view = v)} />
    <CompareBar selected={selection.selected.length} onOpenBoth={openBoth} onClear={() => (selection = { ...selection, selected: [] })} />
    {#if shown === 0}
      <p role="status" class="p-4 font-mono text-sm text-baltic">No run matches these filters.</p>
    {:else}
      <Picker {groups} presentation={view.presentation} group={view.group} sort={view.sort} onOpen={open} selected={selection.selected} onSelect={(e) => (selection = toggleSelected(selection, e.id))} />
    {/if}
    <RunCount runs={catalog?.runs ?? []} {shown} />
  </div>
{/snippet}

<div class="page text-light-gray">
  <header class="page-title"><h1 class="font-pixel text-xl text-highlight-yellow">Skillcraft</h1></header>
  <div class="stage">
    <div class="frame">
      {#if catalog}
        <main class="frame-body p-4">
          {#if opened.length > 0}
            <div class={`grid gap-4 ${opened.length === 2 || beside ? "grid-cols-2" : ""}`}>
              {#each opened as entry (entry.id)}
                <OpenRun {entry} {client} createScene={pool.factory} onClose={() => close(entry.id)} />
              {/each}
              {#if opened.length === 1 && !beside}
                <div><button class="border border-mid-baltic px-2 py-1 font-mono text-sm hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic" onclick={() => (beside = true)}>Open beside…</button></div>
              {:else if opened.length === 1 && beside}
                <div>{@render browse()}</div>
              {/if}
            </div>
          {:else if catalog.runs.length === 0}
            <Empty />
          {:else}
            {@render browse()}
          {/if}
        </main>
      {:else if error}
        <main class="frame-body"><Unsupported {error} /></main>
      {:else}
        <main class="frame-body p-6 font-mono text-sm text-baltic" role="status">Loading runs…</main>
      {/if}
    </div>
  </div>
  <Hints runs={catalog?.runs ?? []} />
</div>
