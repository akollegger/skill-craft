<script lang="ts">
  import { cellSizeFor, defaultItemArt, paintTable, tableSize } from "../art/index.ts";

  let { table, made, label = "The table at the end of the run", compact = false }: { table: (string | null)[][]; made?: string | undefined; label?: string; compact?: boolean } = $props();

  // A run that got its goal shows the item it made, large; any other shows where the table was left.
  const shown = $derived(made === undefined ? table : [[made]]);
  // A row has less room than a tile: half-size cells for small grids, so a table fits a 56-pixel box.
  const longest = $derived(Math.max(table.length, ...table.map((r) => r.length)));
  const cell = $derived(made !== undefined ? (compact ? 48 : 72) : compact ? (longest <= 3 ? 16 : 8) : cellSizeFor(longest));
  const size = $derived(tableSize(shown, cell));
  let canvas: HTMLCanvasElement | undefined = $state();

  // Drawn once into a 2D canvas, and again only if the table itself changes: a list of hundreds holds no WebGL context.
  $effect(() => {
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintTable(ctx, shown, defaultItemArt, cell);
  });
</script>

<canvas
  bind:this={canvas}
  width={size.width}
  height={size.height}
  role="img"
  aria-label={made === undefined ? label : `The item the run made: ${made}`}
  class="rounded-sm bg-black"
  style="image-rendering: pixelated"
></canvas>
