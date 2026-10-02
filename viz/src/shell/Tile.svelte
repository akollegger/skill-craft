<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";
  import CallStrip from "./CallStrip.svelte";
  import SkillMarker from "./SkillMarker.svelte";
  import Thumbnail from "./Thumbnail.svelte";

  let { entry, onOpen, ticked = false, onTick }: { entry: CatalogEntry; onOpen: (entry: CatalogEntry) => void; ticked?: boolean; onTick?: ((entry: CatalogEntry) => void) | undefined } = $props();

  const a = $derived(entry.attributes);
  const ready = $derived(entry.status === "ready");
  const name = $derived(a["label"] !== undefined && a["run"] !== undefined ? `${a["label"]} / ${a["run"]}` : String(a["label"] ?? a["run"] ?? entry.id));
  const why = $derived((entry.reason ?? "").replace(/^[A-Za-z]+: /, ""));
  const outcome = $derived(a["outcome"] === undefined ? "" : String(a["outcome"]));
  const tone = $derived(outcome === "reached" ? "text-light-forest" : outcome === "gave up" || outcome === "out of turns" ? "text-mid-marigold" : outcome === "error" ? "text-mid-hibiscus" : "text-light-baltic");
</script>

<li data-run-id={entry.id} aria-disabled={ready ? undefined : "true"} class="relative list-none">
  {#if ready && onTick}
    <input type="checkbox" checked={ticked} aria-label={`Compare ${name}`} class="absolute left-3 top-3 z-10 h-4 w-4 accent-highlight-yellow focus-visible:outline-2 focus-visible:outline-light-baltic" onchange={() => onTick(entry)} />
  {/if}
  <svelte:element
    this={ready ? "button" : "div"}
    type={ready ? "button" : undefined}
    data-open={ready ? "" : undefined}
    class="flex h-full w-48 flex-col gap-2 rounded-sm border border-dark-baltic bg-darkest-baltic p-2 text-left font-mono text-xs enabled:hover:border-light-baltic focus-visible:outline-2 focus-visible:outline-light-baltic"
    onclick={ready ? () => onOpen(entry) : undefined}
  >
    <span class="flex h-28 items-center justify-center rounded-sm bg-black">
      {#if entry.preview}<Thumbnail table={entry.preview.table} made={entry.preview.made} />{/if}
    </span>
    <span class="truncate text-highlight-yellow">{name}</span>
    <span class="flex items-baseline justify-between gap-2">
      <span class={tone}>{outcome}</span>
      {#if a["actionCalls"] !== undefined}<span>{a["actionCalls"]} calls{#if a["bestCalls"] !== undefined}&nbsp;(best {a["bestCalls"]}){/if}</span>{/if}
    </span>
    {#if a["modelRan"] !== undefined}<span class="truncate text-light-baltic">{a["modelRan"]}</span>{/if}
    {#if entry.preview}<CallStrip strip={entry.preview.strip} />{/if}
    <SkillMarker attributes={a} />
    {#if !ready}<span class="text-mid-hibiscus">can't open: {why}</span>{/if}
  </svelte:element>
</li>
