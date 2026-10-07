import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allReferences, readLibrary } from "../../src/viz/art/library.js";
import { renderSheet } from "../../src/viz/art/sheet.js";

const paletteColors = (): Record<string, string> => {
  const source = readFileSync(new URL("../../viz/src/palette.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("export const palette = {"), source.indexOf("} as const;"));
  return Object.fromEntries([...block.matchAll(/^\s+(\w+): "(#[0-9A-Fa-f]{6})"/gm)].map((m) => [m[1]!, m[2]!]));
};

describe("the contact sheet", () => {
  const lib = readLibrary();
  const html = renderSheet(lib, paletteColors());

  it("is a standalone page that names every reference the library resolves", () => {
    expect(html).toMatch(/^<!doctype html>/i);
    for (const ref of allReferences(lib)) expect(html, ref).toContain(`>${ref}<`);
  });

  it("draws each sprite at two sizes on two backgrounds, with no script and no outside address", () => {
    const refs = allReferences(lib).length;
    expect((html.match(/<svg /g) ?? []).length).toBe(refs * 4);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("is the same every time", () => {
    expect(renderSheet(lib, paletteColors())).toBe(html);
  });

  it("escapes names so a library entry cannot add markup", () => {
    const hostile = { ...lib, sprites: { ...lib.sprites, "x<script>": lib.sprites["stick"]! } };
    expect(renderSheet(hostile, paletteColors())).not.toContain("<script>");
  });
});
