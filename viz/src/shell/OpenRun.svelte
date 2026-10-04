<script lang="ts">
  import { onMount } from "svelte";
  import type { BundleData, CatalogEntry } from "../../../src/viz/contract.ts";
  import type { Client, LoadError } from "../contract/client.ts";
  import type { SceneFactory } from "../scene/handle.ts";
  import RunView from "./RunView.svelte";

  let { entry, client, createScene, onClose }: { entry: CatalogEntry; client: Client; createScene: SceneFactory; onClose: () => void } = $props();

  let bundle = $state<BundleData | undefined>();
  let error = $state<LoadError | undefined>();
  const name = $derived(`${entry.attributes["label"] ?? ""} / ${entry.attributes["run"] ?? entry.id}`);

  onMount(async () => {
    const loaded = await client.bundle(entry);
    if (loaded.ok) bundle = loaded.value;
    else error = loaded.error;
  });

  const why = $derived(
    !error ? "" : error.kind === "unsupported-format" ? `It is in format ${String(error.format)}, which this page does not read.`
    : error.kind === "http" ? `The server answered ${error.status}.`
    : error.kind === "network" ? "The server could not be reached."
    : error.message,
  );
</script>

{#if bundle}
  <RunView {entry} {bundle} {createScene} {onClose} />
{:else if error}
  <div role="alert" class="flex max-w-prose flex-col gap-3 p-6 font-mono text-sm">
    <p class="font-pixel text-xl text-light-gray">Can't open {name}.</p>
    <p class="text-mid-hibiscus">{why}</p>
    <button class="w-fit border border-mid-baltic px-2 py-1 hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic" onclick={onClose}>Back to the runs</button>
  </div>
{:else}
  <p role="status" class="p-6 font-mono text-sm text-baltic">Opening {name}…</p>
{/if}
