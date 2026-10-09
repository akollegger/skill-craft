/**
 * Write a contact sheet of the sprite library for checking drawings by eye: every sprite and every shape in each material, with its name,
 * at two sizes on the table's two woods. A standalone HTML page. Usage: pnpm dev scripts/art-sheet.ts <dest.html>
 * The destination must be outside the repository, so a sheet is never committed by accident.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readLibrary } from "../src/viz/art/library.js";
import { isInside } from "../src/viz/paths.js";
import { renderSheet } from "../src/viz/art/sheet.js";

const dest = process.argv[2];
if (!dest) {
  console.error("usage: art-sheet.ts <dest.html>");
  process.exit(1);
}
if (isInside(process.cwd(), dest)) {
  console.error("the destination is inside the repository; write the sheet somewhere outside it");
  process.exit(1);
}

const source = readFileSync(new URL("../viz/src/palette.ts", import.meta.url), "utf8");
const block = source.slice(source.indexOf("export const palette = {"), source.indexOf("} as const;"));
const colors = Object.fromEntries([...block.matchAll(/^\s+(\w+): "(#[0-9A-Fa-f]{6})"/gm)].map((m) => [m[1]!, m[2]!]));

writeFileSync(dest, renderSheet(readLibrary(), colors));
console.log(dest);
