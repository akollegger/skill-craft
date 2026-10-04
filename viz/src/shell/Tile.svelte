<script lang="ts">
  import type { CatalogEntry } from "../../../src/viz/contract.ts";
  import CallStrip from "./CallStrip.svelte";
  import Score from "./Score.svelte";
  import SkillIcon from "./SkillIcon.svelte";
  import { failed, scoreTone } from "./tone.ts";
  import Thumbnail from "./Thumbnail.svelte";

  let { entry, onOpen, selected = false, onSelect }: { entry: CatalogEntry; onOpen: (entry: CatalogEntry) => void; selected?: boolean; onSelect?: ((entry: CatalogEntry) => void) | undefined } = $props();

  const a = $derived(entry.attributes);
  const ready = $derived(entry.status === "ready");
  const name = $derived(a["label"] !== undefined && a["run"] !== undefined ? `${a["label"]} / ${a["run"]}` : String(a["label"] ?? a["run"] ?? entry.id));
  const why = $derived((entry.reason ?? "").replace(/^[A-Za-z]+: /, ""));
  const outcome = $derived(a["outcome"] === undefined ? "" : String(a["outcome"]));
  const goalItem = $derived(a["goalItem"] === undefined ? undefined : String(a["goalItem"]));
  // A plain click opens the run. Shift-click selects it for comparison; Shift+Enter and Shift+Space do too, since a keyboard
  // click carries the shift key, so the keyboard has the same two actions.
  function activate(e: MouseEvent): void {
    if (e.shiftKey && onSelect) {
      e.preventDefault();
      onSelect(entry);
    } else onOpen(entry);
  }
  const calls = $derived(typeof a["actionCalls"] === "number" ? a["actionCalls"] : undefined);
  const best = $derived(typeof a["bestCalls"] === "number" ? a["bestCalls"] : undefined);
</script>

<li data-run-id={entry.id} data-selected={selected ? "" : undefined} aria-disabled={ready ? undefined : "true"} class="relative list-none">
  <svelte:element
    this={ready ? "button" : "div"}
    title={name}
    type={ready ? "button" : undefined}
    data-open={ready ? "" : undefined}
    class={`flex h-full w-48 flex-col gap-2 p-3 text-left font-mono text-xs shadow-[inset_-3px_-3px_0_rgba(0,0,0,0.3),inset_3px_3px_0_rgba(255,255,255,0.08)] focus-visible:outline-2 focus-visible:outline-light-baltic ${selected ? "bg-mid-baltic ring-2 ring-inset ring-highlight-yellow" : "bg-dark-baltic enabled:hover:bg-mid-baltic"}`}
    onclick={ready ? activate : undefined}
  >
    <span class="sr-only">{name}{#if outcome !== ""}, {outcome}{/if}</span>
    <span class="flex items-center justify-between gap-2">
      <Thumbnail goal={goalItem} reached={outcome === "reached"} />
      <Score large calls={calls} tone={scoreTone(outcome, calls, best)} />
    </span>
    {#if a["modelRan"] !== undefined}<span class="truncate text-light-baltic">{a["modelRan"]}</span>{/if}
    {#if entry.preview}<CallStrip strip={entry.preview.strip} {best} failed={failed(outcome)} />{/if}
    <SkillIcon attributes={a} />
    {#if selected}<span class="sr-only">Selected for comparison</span>{/if}
    {#if !ready}<span class="text-mid-hibiscus">can't open: {why}</span>{/if}
  </svelte:element>
</li>
