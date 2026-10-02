<script lang="ts">
  let { strip }: { strip: string } = $props();

  // One mark per action call. Long runs are cut so a tile or row stays a size; the label still counts them all.
  const CAP = 160;
  const COLOR: Record<string, string> = {
    p: "bg-mid-marigold",
    c: "bg-light-forest",
    r: "bg-mid-hibiscus",
    t: "bg-highlight-periwinkle",
    ".": "bg-baltic opacity-60",
  };
  const KIND: Record<string, string> = { p: "place", c: "craft", r: "refusal", t: "take-back", ".": "no change" };
  const count = (ch: string) => [...strip].filter((x) => x === ch).length;
  const label = $derived(
    strip.length === 0
      ? "No calls"
      : `${strip.length} calls: ${count("p")} placements, ${count("c")} crafts, ${count("r")} refusals, ${count("t")} take-backs`,
  );
  const marks = $derived([...strip.slice(0, CAP)]);
</script>

<span role="img" aria-label={label} class="flex flex-wrap items-center gap-px">
  {#each marks as ch, i (i)}
    <span data-kind={KIND[ch] ?? "other"} class={`inline-block h-2 w-1 ${COLOR[ch] ?? "bg-baltic"}`}></span>
  {/each}
  {#if strip.length > CAP}<span class="ml-1 text-xs text-baltic">+{strip.length - CAP}</span>{/if}
</span>
