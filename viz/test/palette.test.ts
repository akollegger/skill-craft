import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DERIVED, hex, palette, READ_ON, SOURCE } from "../src/palette.ts";

/** Hue in degrees of a #RRGGBB color. */
function hue(value: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(((h * 60) + 360) % 360);
}

/** Relative luminance, 0 to 1. */
const luminance = (value: string): number => {
  const lin = (i: number) => { const c = Number.parseInt(value.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
};

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

  it("derives its wood ramp from Marigold: warm hues, each step darker than the last", () => {
    expect(DERIVED.length).toBeGreaterThan(0);
    for (const name of DERIVED) expect(hue(palette[name]), name).toBeGreaterThanOrEqual(20), expect(hue(palette[name]), name).toBeLessThanOrEqual(45);
    const lums = DERIVED.map((n) => luminance(palette[n]));
    for (let i = 1; i < lums.length; i++) expect(lums[i]!, DERIVED[i]).toBeLessThan(lums[i - 1]!);
    // The anchor is real: the lightest step is close to a brand Marigold in hue.
    expect(Math.abs(hue(palette.woodHighlight) - hue(palette.marigold))).toBeLessThanOrEqual(6);
  });

  it("gives PixiJS a number", () => {
    expect(hex("darkBaltic")).toBe(0x014063);
  });
});
