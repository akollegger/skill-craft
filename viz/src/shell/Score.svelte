<script lang="ts">
  // The run's score: the calls it took, as a pixel numeral in the color of how it ended (see tone.ts).
  // Cut the line box to the digits (cap height to baseline), so a numeral lines up by its ink with whatever sits beside it.
  const TRIM = "[text-box:trim-both_cap_alphabetic]";
  let { calls, tone, large = false, trim = false }: { calls: number | undefined; tone: string; large?: boolean; trim?: boolean } = $props();
</script>

{#if calls !== undefined}
  <span class={`font-score whitespace-nowrap leading-none ${large ? "text-6xl" : "text-3xl"} ${trim ? TRIM : ""} ${tone}`}>{calls}<span class="sr-only">{" "}calls</span></span>
{/if}
