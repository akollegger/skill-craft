import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BESPOKE_PROCESS_VERSION } from "../src/distill/harnesses/bespoke-one-shot.js";
import { hasHarnessChangelogEntry, PROCESS_VERSION } from "../src/loop/process.js";

const NOTE = readFileSync("design/notes/skill-process.md", "utf8");

describe("each harness's process version (spec 009, R8)", () => {
  it("has an entry in the changelog for nams-reviewed and for bespoke-one-shot", () => {
    expect(hasHarnessChangelogEntry("nams-reviewed", PROCESS_VERSION, NOTE)).toBe(true);
    expect(hasHarnessChangelogEntry("bespoke-one-shot", BESPOKE_PROCESS_VERSION, NOTE)).toBe(true);
  });

  it("fails for a version a harness has no entry for, and does not borrow another harness's entry", () => {
    const text = "## v1\n\n## v2\n\n## bespoke-one-shot v1\n\n## v12\n";
    expect(hasHarnessChangelogEntry("nams-reviewed", "2", text)).toBe(true);
    expect(hasHarnessChangelogEntry("nams-reviewed", "3", text)).toBe(false);
    expect(hasHarnessChangelogEntry("bespoke-one-shot", "1", text)).toBe(true);
    expect(hasHarnessChangelogEntry("bespoke-one-shot", "2", text)).toBe(false);
    expect(hasHarnessChangelogEntry("other", "1", text)).toBe(false);
    expect(hasHarnessChangelogEntry("nams-reviewed", "1", "## v12\n")).toBe(false);
  });

  it("bumps nams-reviewed for the record it now writes, and starts bespoke-one-shot at 1", () => {
    expect(PROCESS_VERSION).toBe("3");
    expect(BESPOKE_PROCESS_VERSION).toBe("1");
  });
});
