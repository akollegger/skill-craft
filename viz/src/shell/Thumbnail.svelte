<script lang="ts">
  import { defaultItemArt, paintGoalSlot, slotSize } from "../art/index.ts";

  // A thumbnail is the goal, not where the run ended: the item the run was asked to make, in a dark socket with a one-pixel stroke. A run that
  // reached it shows the item in full color and any other shows it dimmed, so runs for one goal look alike and a list groups by sight.
  let { goal, reached = false, compact = false, fill = false }: { goal?: string | undefined; reached?: boolean; compact?: boolean; fill?: boolean } = $props();

  const scale = $derived(compact ? 3 : 4);
  const size = $derived(slotSize(scale));
  let canvas: HTMLCanvasElement | undefined = $state();

  // `fill`: drawn at the pixel size above but shown as tall as the row it sits in (the tile's score and time), staying square.
  // Drawn once into a 2D canvas, and again only if the goal or the outcome changes: a list of hundreds holds no WebGL context.
  $effect(() => {
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintGoalSlot(ctx, goal === undefined ? undefined : defaultItemArt(goal), { scale, reached });
  });
</script>

<canvas
  bind:this={canvas}
  width={size}
  height={size}
  role="img"
  aria-label={goal === undefined ? "The goal is not named" : `The goal: ${goal}, ${reached ? "reached" : "not reached"}`}
  class={fill ? "h-auto w-auto self-stretch" : ""}
  style={`image-rendering: pixelated${fill ? "; aspect-ratio: 1" : ""}`}
></canvas>
