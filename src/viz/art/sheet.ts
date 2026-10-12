import { BACKGROUNDS, showing } from "./contrast.js";
import { allReferences, resolveReference, type Library } from "./library.js";

const escape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One sprite as an SVG of one rectangle per opaque pixel. The page needs no script and no outside file, so a sheet opens anywhere. */
function svg(rows: readonly (readonly (string | null)[])[], colors: Readonly<Record<string, string>>, px: number): string {
  const rects = rows.flatMap((row, y) => row.flatMap((name, x) => (name === null ? [] : [`<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[name] ?? "#ff00ff"}"/>`])));
  return `<svg viewBox="0 0 16 16" width="${px}" height="${px}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}

/**
 * A contact sheet of the library for checking drawings by eye: every reference, with its name, at two sizes (32 and 128 pixels, the table draws at 16) on the table's dark slot and its lighter grid cell, the two backgrounds the scores are measured against. A color name the palette does not have shows as magenta, so a wrong name is
 * hard to miss. Under each name are two numbers, how well the sprite shows on the dark slot and on the grid cell (see `contrast.ts`). Pure: the same library gives the same page.
 */
export function renderSheet(library: Library, colors: Readonly<Record<string, string>>): string {
  const dark = colors[BACKGROUNDS.slot] ?? "#362112";
  const light = colors[BACKGROUNDS.cell] ?? "#F7DCA1";
  const cells = allReferences(library).map((ref) => {
    const sprite = resolveReference(library, ref)!;
    return `<figure><div class="row"><span style="background:${dark}">${svg(sprite, colors, 32)}</span><span style="background:${light}">${svg(sprite, colors, 32)}</span></div><div class="row"><span style="background:${dark}">${svg(sprite, colors, 128)}</span><span style="background:${light}">${svg(sprite, colors, 128)}</span></div><figcaption>${escape(ref)}<br><small>slot ${showing(sprite, colors, colors[BACKGROUNDS.slot] ?? dark).toFixed(2)} cell ${showing(sprite, colors, colors[BACKGROUNDS.cell] ?? light).toFixed(2)}</small></figcaption></figure>`;
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sprite library</title>
<style>body{margin:16px;background:#181414;color:#F2EAD4;font:14px ui-monospace,monospace}main{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}.row{display:flex}.row span{display:block;padding:8px}svg{display:block}figcaption{padding:4px 8px}</style></head>
<body><h1>Sprite library: ${cells.length} sprites</h1><main>
${cells.join("\n")}
</main></body></html>
`;
}
