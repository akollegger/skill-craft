<script lang="ts">
  import { outcomeWord, outcomeTone } from "./tone.ts";

  // How the run ended, in a word and in the color of the score beside it (see tone.ts). Blank until a run has an outcome to speak of.
  let { outcome, calls, best, large = false }: { outcome: string; calls: number | undefined; best: number | undefined; large?: boolean } = $props();
  const word = $derived(outcomeWord(outcome, calls, best));
</script>

{#if word !== ""}
  <span data-outcome class={`font-pixel whitespace-nowrap leading-none ${large ? "text-lg" : "text-xl"} ${outcomeTone(outcome, calls, best)}`}>{word}</span>
{/if}
