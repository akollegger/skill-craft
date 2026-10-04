<script lang="ts">
  import type { Attributes } from "../../../src/viz/contract.ts";
  import { skillFacts, skillText } from "./skill.ts";

  let { attributes }: { attributes: Attributes } = $props();
  const facts = $derived(skillFacts(attributes));
</script>

{#if facts !== undefined}
  <span
    data-skill
    class={`inline-flex items-center gap-1 border px-1 text-xs ${facts.loaded ? "border-light-forest text-light-forest" : "border-mid-marigold border-dashed text-mid-marigold"}`}
  >
    <span aria-hidden="true">{facts.loaded ? "✓" : "○"}</span>
    <span>{skillText(facts)}</span>
  </span>
{/if}
