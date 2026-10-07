import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every source file of the page, relative to the repository root, which is where the tests run. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(svelte|ts|css|html)$/.test(name) ? [path] : [];
  });
}

describe("no curved corners (the look is 8-bit)", () => {
  const files = [...sources(join(process.cwd(), "viz/src")), join(process.cwd(), "viz/index.html")];

  it("finds the page's sources", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("uses no rounded class, border radius, rounded rectangle or curved shape anywhere in the page", () => {
    const forbidden: [string, RegExp][] = [
      ["a rounded-* class", /\brounded(-|\b)/],
      ["a border-radius", /border-radius|borderRadius/],
      ["a rounded rectangle", /roundRect/],
      ["a circle or ellipse", /\.(circle|ellipse|arc|arcTo)\(/],
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const [what, pattern] of forbidden) expect(pattern.test(text), `${file} has ${what}`).toBe(false);
    }
  });

  it("clears the theme's radius tokens, so a rounded class added later would draw nothing", () => {
    const css = readFileSync(join(process.cwd(), "viz/src/theme.css"), "utf8");
    expect(css).toMatch(/--radius-\*:\s*initial;/);
  });
});
