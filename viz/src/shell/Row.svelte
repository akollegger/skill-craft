<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";
  import CallStrip from "./CallStrip.svelte";
  import SkillIcon from "./SkillIcon.svelte";
  import Score from "./Score.svelte";
  import Thumbnail from "./Thumbnail.svelte";
  import { LIST_GRID } from "./columns.ts";
  import { failed, scoreTone } from "./tone.ts";

  let {
    entry,
    onOpen,
    selected = false,
    onSelect,
  }: { entry: CatalogEntry; onOpen: (entry: CatalogEntry) => void; selected?: boolean; onSelect?: ((entry: CatalogEntry) => void) | undefined } = $props();

  const a = $derived(entry.attributes);
  // The name is not a column: each row is its own run. It is the row's tooltip and what a screen reader says first.
  const name = $derived(a["label"] !== undefined && a["run"] !== undefined ? `${a["label"]} / ${a["run"]}` : String(a["label"] ?? a["run"] ?? entry.id));
  const ready = $derived(entry.status === "ready");
  // The reason is `Code: fixed text`; a person needs the text.
  const why = $derived((entry.reason ?? "").replace(/^[A-Za-z]+: /, ""));
  const outcome = $derived(a["outcome"] === undefined ? "" : String(a["outcome"]));
  const goalItem = $derived(a["goalItem"] === undefined ? undefined : String(a["goalItem"]));
  const calls = $derived(typeof a["actionCalls"] === "number" ? a["actionCalls"] : undefined);
  const best = $derived(typeof a["bestCalls"] === "number" ? a["bestCalls"] : undefined);
  // A goal of one is just the item; a goal of more says how many.
  const goal = $derived(goalItem === undefined ? "" : Number(a["goalQty"] ?? 1) > 1 ? `${a["goalQty"]} ${goalItem}` : goalItem);
  // A plain click opens the run. Shift-click selects it for comparison; Shift+Enter and Shift+Space do too, since a keyboard
  // click carries the shift key.
  function activate(e: MouseEvent): void {
    if (e.shiftKey && onSelect) {
      e.preventDefault();
      onSelect(entry);
    } else onOpen(entry);
  }
  // Each row is a flat block with a chunky bevel, like the mock's, and a selected one is lit.
  const BLOCK = "shadow-[inset_-3px_-3px_0_rgba(0,0,0,0.3),inset_3px_3px_0_rgba(255,255,255,0.08)]";
</script>

<li data-run-id={entry.id} data-selected={selected ? "" : undefined} aria-disabled={ready ? undefined : "true"} class="list-none">
  <svelte:element
    this={ready ? "button" : "div"}
    type={ready ? "button" : undefined}
    data-open={ready ? "" : undefined}
    title={name}
    class={`${LIST_GRID} w-full select-none items-center px-3 py-2 text-left font-mono text-sm focus-visible:outline-2 focus-visible:outline-light-baltic ${BLOCK} ${selected ? "bg-mid-baltic ring-2 ring-inset ring-highlight-yellow" : "bg-dark-baltic"} ${ready ? "enabled:hover:bg-mid-baltic" : ""}`}
    onclick={ready ? activate : undefined}
  >
    <span class="sr-only">{name}. </span>
    <span class="flex items-center justify-center"><Thumbnail goal={goalItem} reached={outcome === "reached"} compact /></span>
    <span class="truncate text-light-baltic">{a["world"] ?? ""}</span>
    <span class="truncate">{#if goal !== ""}<span class="sr-only">Goal:{" "}</span>{goal}{/if}</span>
    <span><Score {calls} tone={scoreTone(outcome, calls, best)} />{#if outcome !== ""}<span class="sr-only">, {outcome}</span>{/if}</span>
    {#if entry.preview}<CallStrip strip={entry.preview.strip} {best} failed={failed(outcome)} />{:else}<span></span>{/if}
    <span class="truncate text-baltic">{a["modelRan"] ?? ""}</span>
    <span class="flex items-center"><SkillIcon attributes={a} dash /></span>
    {#if selected}<span class="sr-only">Selected for comparison</span>{/if}
    {#if !ready}<span class="col-span-full text-mid-hibiscus">can't open: {why}</span>{/if}
  </svelte:element>
</li>
