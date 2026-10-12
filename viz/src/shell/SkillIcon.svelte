<script lang="ts">
  import type { Attributes } from "../../../src/viz/contract.ts";
  import { skillFacts, skillText } from "./skill.ts";

  // A page of text in eight by eight art pixels: solid when the agent loaded the skill, an outline when it never did, and a
  // second color in the corner when the prompt pointed at it. The words are in the label, for a screen reader and a tooltip.
  // In a list column a run with no skill shows a dash; on a tile it shows nothing.
  let { attributes, dash = false }: { attributes: Attributes; dash?: boolean } = $props();
  const facts = $derived(skillFacts(attributes));
</script>

{#if facts !== undefined}
  <svg
    data-skill
    data-loaded={facts.loaded ? "" : undefined}
    role="img"
    aria-label={skillText(facts)}
    viewBox="0 0 8 8"
    shape-rendering="crispEdges"
    class={`h-6 w-6 ${facts.loaded ? "fill-light-forest" : "fill-mid-marigold"}`}
  >
    <title>{skillText(facts)}</title>
    {#if facts.loaded}
      <rect x="1" y="0" width="4" height="1" />
      <rect x="1" y="1" width="5" height="7" />
      <rect x="2" y="3" width="3" height="1" class="fill-retro-panel" />
      <rect x="2" y="5" width="3" height="1" class="fill-retro-panel" />
    {:else}
      <rect x="1" y="0" width="4" height="1" />
      <rect x="1" y="1" width="1" height="7" />
      <rect x="5" y="1" width="1" height="7" />
      <rect x="2" y="7" width="3" height="1" />
      <rect x="2" y="3" width="3" height="1" />
      <rect x="2" y="5" width="3" height="1" />
    {/if}
    {#if facts.pointed}<rect data-pointed x="6" y="0" width="2" height="2" class="fill-highlight-yellow" />{/if}
  </svg>
{:else if dash}
  <span data-no-skill class="text-retro-dim">-<span class="sr-only"> no skill</span></span>
{/if}
