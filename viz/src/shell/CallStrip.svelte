<script lang="ts">
  import { pipTone, TONE_BG, TONE_TEXT } from "./tone.ts";

  // The marks wear the playback pips' colors (see tone.ts): green up to the ideal, yellow past it, and a failed run's last call red.
  // What kind of call each was is in the label and in the open view, not in a color.
  let { strip, best, failed = false }: { strip: string; best?: number | undefined; failed?: boolean } = $props();

  // One mark per action call, in a block of three rows of thirty-two, always the height of three rows, so every run's tape is one shape in a tile and in a list row. A
  // longer run is cut and the cut says how many calls it hides, in the last cell; the label still counts them all.
  const COLUMNS = 32;
  const CAP = COLUMNS * 3;
  const MORE = 6; // the cells the "+N" takes
  const KIND: Record<string, string> = { p: "place", c: "craft", r: "refusal", t: "take-back", ".": "no change" };
  const count = (ch: string) => [...strip].filter((x) => x === ch).length;
  const label = $derived(
    strip.length === 0
      ? "No calls"
      : `${strip.length} calls: ${count("p")} placements, ${count("c")} crafts, ${count("r")} refusals, ${count("t")} take-backs`,
  );
  const tone = (i: number) => pipTone(i, strip.length, best, failed);
  const cut = $derived(strip.length > CAP);
  const marks = $derived([...strip.slice(0, cut ? CAP - MORE : CAP)]);
</script>

<span role="img" aria-label={label} class="grid h-[calc(1.5rem+2px)] w-max grid-cols-[repeat(32,0.25rem)] content-start gap-px">
  {#each marks as ch, i (i)}
    <span data-kind={KIND[ch] ?? "other"} data-tone={tone(i)} class={`inline-block h-2 w-1 ${TONE_BG[tone(i)]}`}></span>
  {/each}
  {#if cut}<span class={`col-span-6 whitespace-nowrap text-xs leading-none ${failed ? TONE_TEXT.fail : TONE_TEXT[tone(marks.length)]}`}>+{strip.length - marks.length}</span>{/if}
</span>
