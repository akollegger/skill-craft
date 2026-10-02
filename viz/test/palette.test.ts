import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hex, palette, READ_ON, SOURCE } from "../src/palette.ts";

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe("the palette", () => {
  it("records where and when it was read", () => {
    expect(SOURCE).toMatch(/^https:\/\/neo4j\.design\//);
    expect(READ_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("holds only six-digit hex values", () => {
    for (const [name, value] of Object.entries(palette)) expect(value, name).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("is repeated exactly in the Tailwind theme", () => {
    // Tests run from the repository root; a CSS import would be processed away by the test runner.
    const css = readFileSync(join(process.cwd(), "viz/src/theme.css"), "utf8");
    const theme = Object.fromEntries([...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]!.toLowerCase()]));
    const expected = Object.fromEntries(Object.entries(palette).map(([name, value]) => [kebab(name), value.toLowerCase()]));
    expect(theme).toEqual(expected);
  });

  it("gives PixiJS a number", () => {
    expect(hex("darkBaltic")).toBe(0x014063);
  });
});
