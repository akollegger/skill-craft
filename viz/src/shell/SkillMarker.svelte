<script lang="ts">
  import type { Attributes } from "../../../src/viz/contract.ts";

  let { attributes }: { attributes: Attributes } = $props();

  // What is recorded and nothing more: the skill's name, whether the agent loaded it and after how many calls, and
  // whether the prompt carried a sentence pointing at it. The skill's text, its source and the sentence stay out.
  const name = $derived(typeof attributes["skill"] === "string" ? attributes["skill"] : undefined);
  const loaded = $derived(attributes["skillLoaded"] === true);
  const after = $derived(typeof attributes["skillLoadedAfter"] === "number" ? attributes["skillLoadedAfter"] : undefined);
  const pointed = $derived(attributes["promptNote"] !== undefined);
  const when = $derived(after === undefined ? "loaded" : after === 0 ? "loaded before the first call" : `loaded after ${after} ${after === 1 ? "call" : "calls"}`);
</script>

{#if name !== undefined}
  <span
    data-skill
    class={`inline-flex items-center gap-1 rounded-sm border px-1 text-xs ${loaded ? "border-light-forest text-light-forest" : "border-mid-marigold border-dashed text-mid-marigold"}`}
  >
    <span aria-hidden="true">{loaded ? "✓" : "○"}</span>
    <span>skill {name}: {loaded ? when : "never loaded"}{#if pointed}, prompt pointed at it{/if}</span>
  </span>
{/if}
