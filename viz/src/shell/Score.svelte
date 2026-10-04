<script lang="ts">
  // The run's score: the calls it took, as a pixel numeral in the color of how it ended (see tone.ts).
  let { calls, tone, large = false }: { calls: number | undefined; tone: string; large?: boolean } = $props();
</script>

{#if calls !== undefined}
  <span class={`font-score whitespace-nowrap leading-none ${large ? "text-6xl" : "text-3xl"} ${tone}`}>{calls}<span class="sr-only">{" "}calls</span></span>
{/if}
