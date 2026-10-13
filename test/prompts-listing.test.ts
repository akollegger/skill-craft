// The prompts command (spec 008, FR-019): every kind, version and fingerprint, and a failure for a missing changelog entry.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listPrompts, PROMPTS_ROOT } from "../src/prompts/index.js";

const tree = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "skill-craft-listing-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
};

describe("listPrompts", () => {
  it("lists the committed kinds and versions, each with a fingerprint and a changelog entry, and reports no problem", () => {
    const { lines, problems } = listPrompts(PROMPTS_ROOT);
    expect(problems).toEqual([]);
    for (const kind of ["base", "arm-sentence", "skill-tool", "review-rubric"]) expect(lines.some((l) => l.startsWith(kind))).toBe(true);
    expect(lines.filter((l) => l.startsWith("base"))).toHaveLength(2);
    for (const l of lines) expect(l).toMatch(/^[a-z-]+\s+v\d+\s+[0-9a-f]{12}\s+changelog: yes$/);
  });

  it("reports a version with no changelog entry, a kind with no versions, and an unknown placeholder", () => {
    const root = tree({ "base/v1.txt": "{what} {turns}", "base/v2.txt": "{what} {bogus}", "base/CHANGELOG.md": "## v1\n" });
    const { lines, problems } = listPrompts(root);
    expect(lines.find((l) => l.startsWith("base") && l.includes("v1"))).toContain("changelog: yes");
    expect(problems.join("\n")).toMatch(/bogus/);
    expect(problems.join("\n")).toMatch(/arm-sentence prompt has no versions/);
    const noEntry = listPrompts(tree({ "base/v1.txt": "{what} {turns}", "base/CHANGELOG.md": "" }));
    expect(noEntry.lines[0]).toContain("changelog: MISSING");
    expect(noEntry.problems.join("\n")).toMatch(/no section for v1/);
  });
});
