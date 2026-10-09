import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BUNDLE_FILES } from "../harness/export.js";
import { RunCatalog } from "./catalog.js";
import { isInside } from "./paths.js";
import { VizRefused } from "./errors.js";
import { catalogText } from "./supplier.js";

export interface ExportOptions {
  /** The built page to copy beside the data, so the destination is a complete static site. */
  pageDir?: string | undefined;
}

export interface ExportResult {
  dest: string;
  exported: number;
  /** Runs that stay in the catalog with a reason but have no bundle. */
  skipped: { label: string; run: string; reason: string }[];
}

/**
 * Write a folder of runs as a static tree: `catalog.json` and `bundles/<id>/` with the four bundle files for every
 * run that can be opened, exactly as the local process serves them, and optionally the built page. Read-only with
 * respect to the source. It builds in a temporary sibling folder and renames on success, so a failure leaves nothing
 * behind. Refuses an existing destination and one inside the source, where the next scan would find its own output.
 */
export function exportFolder(source: string, dest: string, opts: ExportOptions = {}): ExportResult {
  const info = statSync(source, { throwIfNoEntry: false });
  if (!info) throw new VizRefused(`${source} does not exist`);
  if (!info.isDirectory()) throw new VizRefused(`${source} is not a folder`);
  if (existsSync(dest)) throw new VizRefused(`${dest} already exists`);
  if (isInside(source, dest)) throw new VizRefused("the destination is inside the folder being exported");
  if (opts.pageDir !== undefined && !existsSync(join(opts.pageDir, "index.html"))) throw new VizRefused("the page has not been built; run pnpm build:viz first, or export without the page");

  const snap = new RunCatalog(source).scan();
  const temp = `${dest}.tmp-${process.pid}`;
  try {
    mkdirSync(temp, { recursive: true });
    writeFileSync(join(temp, "catalog.json"), catalogText(snap.catalog));
    let exported = 0;
    const skipped: ExportResult["skipped"] = [];
    for (const e of snap.catalog.runs) {
      if (e.status !== "ready") {
        skipped.push({ label: String(e.attributes["label"] ?? ""), run: String(e.attributes["run"] ?? e.id), reason: e.reason ?? "" });
        continue;
      }
      const dir = join(temp, "bundles", e.id);
      mkdirSync(dir, { recursive: true });
      for (const name of BUNDLE_FILES) writeFileSync(join(dir, name), snap.file(e.id, name) ?? "");
      exported++;
    }
    if (opts.pageDir !== undefined) cpSync(opts.pageDir, temp, { recursive: true });
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(temp, dest);
    return { dest, exported, skipped };
  } catch (e) {
    rmSync(temp, { recursive: true, force: true });
    throw e;
  }
}
