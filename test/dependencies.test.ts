import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR-006 §4: the AI SDK and its provider packages are pinned to exact versions and upgraded deliberately, as the Agent SDK was, so a lockfile
// refresh cannot change what a provider package sends.
describe("the runtime's dependencies", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };

  it("are pinned to exact versions, with no range", () => {
    for (const name of ["ai", "@ai-sdk/mcp", "@ai-sdk/anthropic", "@ai-sdk/fireworks"]) {
      expect(pkg.dependencies[name], name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
