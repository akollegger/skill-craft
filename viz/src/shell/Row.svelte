<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";
  import CallStrip from "./CallStrip.svelte";
  import SkillMarker from "./SkillMarker.svelte";
  import Thumbnail from "./Thumbnail.svelte";

  let {
    entry,
    onOpen,
    ticked = false,
    onTick,
    inert = false,
  }: { entry: CatalogEntry; onOpen: (entry: CatalogEntry) => void; ticked?: boolean; onTick?: ((entry: CatalogEntry) => void) | undefined; inert?: boolean } = $props();

  const a = $derived(entry.attributes);
  const name = $derived(a["label"] !== undefined && a["run"] !== undefined ? `${a["label"]} / ${a["run"]}` : String(a["label"] ?? a["run"] ?? entry.id));
  const ready = $derived(entry.status === "ready");
  // The reason is `Code: fixed text`; a person needs the text.
  const why = $derived((entry.reason ?? "").replace(/^[A-Za-z]+: /, ""));
  const outcome = $derived(a["outcome"] === undefined ? "" : String(a["outcome"]));
  const tone = $derived(outcome === "reached" ? "text-light-forest" : outcome === "gave up" || outcome === "out of turns" ? "text-mid-marigold" : outcome === "error" ? "text-mid-hibiscus" : "text-light-baltic");
</script>

<li
  data-run-id={entry.id}
  class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-dark-baltic px-3 py-2 font-mono text-sm xl:grid xl:grid-cols-[1.5rem_3.5rem_minmax(14rem,2fr)_7rem_minmax(9rem,1.2fr)_6rem_8rem_minmax(7rem,1fr)_minmax(6rem,1fr)]"
  aria-disabled={ready ? undefined : "true"}
>
  {#if ready && onTick && !inert}
    <input type="checkbox" checked={ticked} aria-label={`Compare ${name}`} class="h-4 w-4 accent-highlight-yellow focus-visible:outline-2 focus-visible:outline-light-baltic" onchange={() => onTick(entry)} />
  {:else}<span></span>{/if}
  <span class="flex h-12 w-14 items-center justify-center">{#if entry.preview}<Thumbnail table={entry.preview.table} made={entry.preview.made} compact />{/if}</span>
  {#if ready && !inert}
    <button data-open class="min-w-32 rounded-sm px-1 text-left text-highlight-yellow underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-light-baltic" onclick={() => onOpen(entry)}>{name}</button>
  {:else}
    <span class="min-w-32 px-1 text-baltic">{name}</span>
  {/if}
  <span class="text-light-baltic">{a["world"] ?? ""}</span>
  <span>{#if a["goalItem"] !== undefined}make {a["goalQty"] ?? 1} {a["goalItem"]}{/if}</span>
  <span class={tone}>{outcome}</span>
  <span>{#if a["actionCalls"] !== undefined}{a["actionCalls"]} calls{#if a["bestCalls"] !== undefined}&nbsp;(best {a["bestCalls"]}){/if}{/if}</span>
  {#if entry.preview}<CallStrip strip={entry.preview.strip} />{:else}<span></span>{/if}
  <span class="flex min-w-0 flex-col gap-1"><span class="truncate text-baltic">{a["modelRan"] ?? ""}</span><SkillMarker attributes={a} /></span>
  {#if !ready}<span class="col-span-full text-mid-hibiscus">can't open: {why}</span>{/if}
</li>
