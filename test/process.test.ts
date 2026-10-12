import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { currentProcessInfo, hasChangelogEntry, PROCESS_VERSION, RECORDING_FORMAT } from "../src/loop/process.js";

const CHANGELOG = "design/notes/skill-process.md";

describe("the process version", () => {
  it("has an entry in the changelog, so the constant cannot name a version no document explains", () => {
    expect(hasChangelogEntry(PROCESS_VERSION, readFileSync(CHANGELOG, "utf8"))).toBe(true);
  });

  it("fails for a version with no entry, matching the whole version and not a prefix", () => {
    const text = "# log\n\n## v1\n\nThe first.\n\n## v12\n\nLater.\n";
    expect(hasChangelogEntry("1", text)).toBe(true);
    expect(hasChangelogEntry("12", text)).toBe(true);
    expect(hasChangelogEntry("2", text)).toBe(false);
    expect(hasChangelogEntry("99", text)).toBe(false);
  });

  it("names the recording format the loop's recording step writes today", () => {
    expect(RECORDING_FORMAT).toBe("placeholder");
  });
});

describe("currentProcessInfo", () => {
  const git = (answers: Record<string, string | Error>) => (args: readonly string[]): string => {
    const a = answers[args.join(" ")];
    if (a === undefined) throw new Error(`unexpected git ${args.join(" ")}`);
    if (a instanceof Error) throw a;
    return a;
  };

  it("names the commit, and says the tree was clean with no hash of changes", () => {
    const info = currentProcessInfo(git({ "rev-parse HEAD": "abc123\n", "status --porcelain": "", "diff HEAD": "" }));
    expect(info).toEqual({ version: PROCESS_VERSION, commit: "abc123", dirty: false, changesSha256: null });
  });

  it("says the tree had changes and hashes them, the same changes giving the same hash", () => {
    const answers = { "rev-parse HEAD": "abc123\n", "status --porcelain": " M src/a.ts\n?? new.ts\n", "diff HEAD": "diff --git a/src/a.ts b/src/a.ts\n+x\n" };
    const a = currentProcessInfo(git(answers));
    const b = currentProcessInfo(git(answers));
    expect(a.dirty).toBe(true);
    expect(a.changesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(b.changesSha256).toBe(a.changesSha256);
    expect(currentProcessInfo(git({ ...answers, "diff HEAD": "diff --git a/src/a.ts b/src/a.ts\n+y\n" })).changesSha256).not.toBe(a.changesSha256);
  });

  it("gives nulls, not a failure, when git cannot answer", () => {
    expect(currentProcessInfo(git({ "rev-parse HEAD": new Error("not a repo") }))).toEqual({ version: PROCESS_VERSION, commit: null, dirty: null, changesSha256: null });
  });
});
