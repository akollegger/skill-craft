import { describe, expect, it } from "vitest";
import { unifiedDiff } from "../src/loop/diff.js";

const lines = (t: string) => (t === "" ? [] : t.replace(/\n$/, "").split("\n"));

/** A small patch applier for unified diffs, so the tests check the diff's meaning and not its spelling. */
function apply(oldText: string, patch: string): string {
  const old = lines(oldText);
  const out: string[] = [];
  let pos = 0;
  const rows = patch.split("\n");
  for (let i = 0; i < rows.length; i++) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(rows[i]!);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] === undefined ? 1 : Number(m[2]);
    const start = b === 0 ? a : a - 1;
    out.push(...old.slice(pos, start));
    pos = start;
    for (i++; i < rows.length && !rows[i]!.startsWith("@@"); i++) {
      const row = rows[i]!;
      if (row === "") continue;
      const text = row.slice(1);
      if (row[0] === " ") { expect(old[pos]).toBe(text); out.push(text); pos++; }
      else if (row[0] === "-") { expect(old[pos]).toBe(text); pos++; }
      else if (row[0] === "+") out.push(text);
    }
    i--;
  }
  out.push(...old.slice(pos));
  return out.length === 0 ? "" : `${out.join("\n")}\n`;
}

const CASES: [string, string, string][] = [
  ["an added line", "a\nb\nc\n", "a\nb\nx\nc\n"],
  ["a removed line", "a\nb\nc\n", "a\nc\n"],
  ["a changed line", "a\nb\nc\n", "a\nB\nc\n"],
  ["two lines swapped", "a\nb\nc\nd\ne\nf\ng\nh\n", "a\nb\nc\nf\ne\nd\ng\nh\n"],
  ["empty to text", "", "one\ntwo\n"],
  ["text to empty", "one\ntwo\n", ""],
  ["a long file with edits far apart", Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n") + "\n", Array.from({ length: 40 }, (_, i) => (i === 2 ? "changed 2" : i === 35 ? "changed 35" : `line ${i}`)).join("\n") + "\n"],
];

describe("unifiedDiff", () => {
  it("is empty for identical inputs", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n")).toBe("");
    expect(unifiedDiff("", "")).toBe("");
  });

  it.each(CASES)("applying the diff to the old text gives the new text: %s", (_n, oldText, newText) => {
    const d = unifiedDiff(oldText, newText);
    expect(d).toContain("@@");
    expect(apply(oldText, d)).toBe(newText);
  });

  it("is deterministic and carries the labels", () => {
    const [, o, n] = CASES[0]!;
    const a = unifiedDiff(o, n, { oldLabel: "round-1/skill.md", newLabel: "round-2/skill.md" });
    expect(a).toBe(unifiedDiff(o, n, { oldLabel: "round-1/skill.md", newLabel: "round-2/skill.md" }));
    expect(a.split("\n").slice(0, 2)).toEqual(["--- round-1/skill.md", "+++ round-2/skill.md"]);
  });

  it("splits far-apart edits into separate hunks and keeps three lines of context", () => {
    const [, o, n] = CASES[6]!;
    const d = unifiedDiff(o, n);
    expect(d.match(/^@@/gm)).toHaveLength(2);
  });
});

describe("unifiedDiff on large inputs", () => {
  it("does not allocate a quadratic table for two long texts with nothing in common, and still gives a correct diff", () => {
    const a = Array.from({ length: 8000 }, (_, i) => `old line ${i}`).join("\n") + "\n";
    const b = Array.from({ length: 8000 }, (_, i) => `new line ${i}`).join("\n") + "\n";
    const before = process.memoryUsage().heapUsed;
    const d = unifiedDiff(a, b);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(200 * 1024 * 1024);
    expect(apply(a, d)).toBe(b);
  });

  it("keeps a small edit in a long text small and exact", () => {
    const lines = Array.from({ length: 6000 }, (_, i) => `line ${i}`);
    const b = [...lines];
    b[3000] = "changed";
    const a = `${lines.join("\n")}\n`;
    const out = `${b.join("\n")}\n`;
    const d = unifiedDiff(a, out);
    expect(d.match(/^[-+]/gm)!.length).toBeLessThan(10);
    expect(apply(a, d)).toBe(out);
  });
});
