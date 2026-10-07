<script lang="ts">
  import { onMount } from "svelte";
  import type { Catalog, CatalogEntry } from "../../src/viz/contract.ts";
  import { createClient, type LoadError } from "./contract/client.ts";
  import { createScenePool } from "./scene/pool.ts";
  import type { SceneFactory } from "./scene/handle.ts";
  import CompareBar from "./shell/CompareBar.svelte";
  import Empty from "./shell/Empty.svelte";
  import OpenRun from "./shell/OpenRun.svelte";
  import Picker from "./shell/Picker.svelte";
  import SkillIcon from "./shell/SkillIcon.svelte";
  import RunCount from "./shell/RunCount.svelte";
  import Toolbar from "./shell/Toolbar.svelte";
  import Unsupported from "./shell/Unsupported.svelte";
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
  };
  const close = (id: string): void => {
    selection = closeRun(selection, id);
  };
  // The title strip says where the page is: "Runs" for the list and the grid; for one table, the run's world, goal and model, taken from the
  // catalog so it is there before the table has loaded; for two, that they are compared. Its red lamp closes whatever is open.
  const title = $derived.by(() => {
    if (opened.length === 0) return undefined;
    if (opened.length > 1) return { world: "", goal: "", model: "", text: "Comparing two runs" };
    const a = opened[0]!.attributes;
    const qty = Number(a["goalQty"] ?? 1);
    return {
      text: "",
      world: a["world"] === undefined ? "" : String(a["world"]),
      goal: a["goalItem"] === undefined ? "" : `Make ${qty} ${a["goalItem"]}`,
      model: typeof a["modelRan"] === "string" ? a["modelRan"] : "",
    };
  });
  const closeAll = (): void => {
    for (const e of opened) selection = closeRun(selection, e.id);
  };
  const openBoth = (): void => {
    selection = { ...selection, open: [] };
    for (const id of selection.selected) selection = openRun(selection, id);
  };
</script>

{#snippet browse()}
  <div class="flex flex-col gap-3">
    <Toolbar {view} onChange={(v) => (view = v)} />
    <CompareBar selected={selection.selected.length} onOpenBoth={openBoth} onClear={() => (selection = { ...selection, selected: [] })} />
    {#if shown === 0}
      <p role="status" class="p-4 font-mono text-sm text-retro-dim">No run matches this search.</p>
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
      <div class="frame-title">
        <button type="button" class="frame-dot frame-dot-close" aria-label="Close table" disabled={title === undefined} onclick={closeAll}></button>
        {#if title === undefined}
          <span class="frame-name">Runs</span>
        {:else if title.text !== ""}
          <span class="frame-name">{title.text}</span>
        {:else}
          <span class="frame-name frame-goal">{title.goal}</span>
          <span class="frame-sub">{[title.world, title.model].filter((x) => x !== "").join(" · ")}</span>
          {#if opened.length === 1}<SkillIcon attributes={opened[0]!.attributes} />{/if}
        {/if}
      </div>
      {#if catalog}
        <main class="frame-body p-4">
          {#if opened.length > 0}
            <div class={`grid h-full grid-rows-[minmax(0,1fr)] gap-4 ${opened.length === 2 ? "grid-cols-2" : ""}`}>
              {#each opened as entry (entry.id)}
                <OpenRun {entry} {client} createScene={pool.factory} onClose={() => close(entry.id)} titled={opened.length === 1} />
              {/each}
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
        <main class="frame-body p-6 font-mono text-sm text-retro-dim" role="status">Loading runs…</main>
      {/if}
    </div>
  </div>
</div>
