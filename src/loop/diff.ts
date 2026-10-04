/**
 * A unified diff over lines, written here because the texts are tens of lines and a dependency is not worth it.
 * A final newline is treated as optional on both sides. Quadratic in the number of lines, which is fine at this size.
 */

const toLines = (text: string): string[] => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

type Op = { kind: " " | "-" | "+"; text: string };

/** The most cells the longest-common-subsequence table may have (16 MB as 32-bit counts). Beyond it the middle is replaced whole. */
const MAX_CELLS = 4_000_000;

function edits(all: string[], allB: string[]): Op[] {
  // Lines the two texts share at the start and the end need no table, which also keeps the table small for a small edit.
  let start = 0;
  while (start < all.length && start < allB.length && all[start] === allB[start]) start++;
  let endA = all.length;
  let endB = allB.length;
  while (endA > start && endB > start && all[endA - 1] === allB[endB - 1]) { endA--; endB--; }
  const head: Op[] = all.slice(0, start).map((text) => ({ kind: " ", text }));
  const tail: Op[] = all.slice(endA).map((text) => ({ kind: " ", text }));
  const a = all.slice(start, endA);
  const b = allB.slice(start, endB);
  // A coarse diff (every old line out, every new line in) is still a correct one, and cannot exhaust memory.
  const middle: Op[] = (a.length + 1) * (b.length + 1) > MAX_CELLS ? [...a.map((text): Op => ({ kind: "-", text })), ...b.map((text): Op => ({ kind: "+", text }))] : lcsOps(a, b);
  return [...head, ...middle, ...tail];
}

function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // lcs[i][j] is the length of the longest common subsequence of a[i..] and b[j..].
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ kind: " ", text: a[i]! }); i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) ops.push({ kind: "-", text: a[i++]! });
    else ops.push({ kind: "+", text: b[j++]! });
  }
  while (i < n) ops.push({ kind: "-", text: a[i++]! });
  while (j < m) ops.push({ kind: "+", text: b[j++]! });
  return ops;
}

export interface DiffOptions {
  oldLabel?: string;
  newLabel?: string;
  /** Lines of unchanged context around each change. Default 3. */
  context?: number;
}

/** The empty string when the texts are the same. */
export function unifiedDiff(oldText: string, newText: string, options: DiffOptions = {}): string {
  const context = options.context ?? 3;
  const ops = edits(toLines(oldText), toLines(newText));
  const changed = ops.map((o, i) => (o.kind === " " ? -1 : i)).filter((i) => i >= 0);
  if (changed.length === 0) return "";

  // Group changes whose context would touch into one hunk.
  const groups: [number, number][] = [];
  for (const idx of changed) {
    const last = groups.at(-1);
    if (last && idx - last[1] <= 2 * context + 1) last[1] = idx;
    else groups.push([idx, idx]);
  }

  const out = [`--- ${options.oldLabel ?? "a"}`, `+++ ${options.newLabel ?? "b"}`];
  for (const [first, last] of groups) {
    const from = Math.max(0, first - context);
    const to = Math.min(ops.length - 1, last + context);
    const slice = ops.slice(from, to + 1);
    const before = ops.slice(0, from);
    const oldStart = before.filter((o) => o.kind !== "+").length;
    const newStart = before.filter((o) => o.kind !== "-").length;
    const oldCount = slice.filter((o) => o.kind !== "+").length;
    const newCount = slice.filter((o) => o.kind !== "-").length;
    // A range of zero lines is numbered by the line before it; otherwise by its first line.
    const head = (start: number, count: number) => `${count === 0 ? start : start + 1},${count}`;
    out.push(`@@ -${head(oldStart, oldCount)} +${head(newStart, newCount)} @@`);
    for (const o of slice) out.push(`${o.kind}${o.text}`);
  }
  return `${out.join("\n")}\n`;
}
