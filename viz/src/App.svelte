<script lang="ts">
  import { onMount } from "svelte";
  import type { Catalog, CatalogEntry } from "../../src/viz/contract.ts";
  import { createClient, type LoadError } from "./contract/client.ts";
  import { createScenePool } from "./scene/pool.ts";
  import type { SceneFactory } from "./scene/handle.ts";
  import CompareBar from "./shell/CompareBar.svelte";
  import CompareRows from "./shell/CompareRows.svelte";
  import Empty from "./shell/Empty.svelte";
  import OpenRun from "./shell/OpenRun.svelte";
  import Picker from "./shell/Picker.svelte";
  import Sidebar from "./shell/Sidebar.svelte";
  import Toolbar from "./shell/Toolbar.svelte";
  import Unsupported from "./shell/Unsupported.svelte";
  import { describeAttributes } from "./state/attributes.ts";
  import { closeRun, initialSelection, openRun, tickRun } from "./state/selection.ts";
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
  const tickedEntries = $derived(selection.ticked.map((id) => byId.get(id)).filter((e): e is CatalogEntry => e !== undefined));

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
    for (const id of selection.ticked) selection = openRun(selection, id);
  };
</script>

{#snippet browse()}
  <div class="flex flex-col gap-3">
    <Toolbar {attributes} {view} onChange={(v) => (view = v)} />
    <CompareBar ticked={selection.ticked.length} onOpenBoth={openBoth} onClear={() => (selection = { ...selection, ticked: [] })} />
    {#if view.presentation === "list" && tickedEntries.length === 2}
      <CompareRows entries={tickedEntries} />
    {/if}
    {#if shown === 0}
      <p role="status" class="p-4 font-mono text-sm text-baltic">No run matches these filters.</p>
    {:else}
      <Picker {groups} presentation={view.presentation} showHeaders={view.group !== null} onOpen={open} ticked={selection.ticked} onTick={(e) => (selection = tickRun(selection, e.id))} />
    {/if}
  </div>
{/snippet}

<div class="grid min-h-screen grid-cols-[16rem_1fr] bg-black text-light-gray">
  {#if catalog}
    <Sidebar runs={catalog.runs} {shown} />
    <main class="overflow-auto p-4">
      {#if opened.length > 0}
        <div class={`grid gap-4 ${opened.length === 2 || beside ? "lg:grid-cols-2" : ""}`}>
          {#each opened as entry (entry.id)}
            <OpenRun {entry} {client} createScene={pool.factory} onClose={() => close(entry.id)} />
          {/each}
          {#if opened.length === 1 && !beside}
            <div><button class="rounded-sm border border-mid-baltic px-2 py-1 font-mono text-sm hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic" onclick={() => (beside = true)}>Open beside…</button></div>
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
    <main class="col-span-2"><Unsupported {error} /></main>
  {:else}
    <main class="col-span-2 p-6 font-mono text-sm text-baltic" role="status">Loading runs…</main>
  {/if}
</div>
