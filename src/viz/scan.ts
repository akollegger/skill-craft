import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface Found {
  kind: "run" | "bundle";
  /** Absolute path of the run or bundle folder. */
  dir: string;
  /** Path relative to the scanned folder, with `/` separators; `.` when the scanned folder is itself the run. */
  rel: string;
}

const isRun = (dir: string): boolean => existsSync(join(dir, "run.jsonl")) || (existsSync(join(dir, "score.json")) && existsSync(join(dir, "mcp.json")));
const isBundle = (dir: string): boolean => existsSync(join(dir, "bundle.json"));

/**
 * Find the runs and the exported bundles anywhere under a folder: a collection of experiments, one experiment, a
 * single run, or a folder of bundles. A folder with `bundle.json` is a bundle; one with `run.jsonl` (or a
 * `score.json` beside an `mcp.json`) is a run, finished or not. Neither is searched further. Symbolic links are
 * not followed, and a bundle folder still being written (`*.tmp-*`) is skipped. Read-only, ordered by path.
 */
export function scanFolder(root: string): Found[] {
  const found: Found[] = [];
  const visit = (dir: string, rel: string): void => {
    if (isBundle(dir)) return void found.push({ kind: "bundle", dir, rel });
    if (isRun(dir)) return void found.push({ kind: "run", dir, rel });
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (name === "node_modules" || name.startsWith(".") || name.includes(".tmp-")) continue;
      const child = join(dir, name);
      const info = lstatSync(child, { throwIfNoEntry: false });
      if (!info || info.isSymbolicLink() || !info.isDirectory()) continue;
      visit(child, rel === "." ? name : `${rel}/${name}`);
    }
  };
  const info = lstatSync(root, { throwIfNoEntry: false });
  if (info?.isDirectory()) visit(root, ".");
  return found.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}
