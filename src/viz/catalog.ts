import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readBundle, type Bundle } from "../harness/bundle.js";
import { ExportRefused, ReplayFailed } from "../harness/errors.js";
import { bundleFiles, buildBundle, BUNDLE_FILES, recordedWorldPath, type BundleFileName } from "../harness/export.js";
import { WorldError } from "../sim/errors.js";
import { attributesOf, partialAttributes } from "./attributes.js";
import { bundleProblem, CATALOG_FORMAT, entrySchema, type Catalog, type CatalogEntry, type ReasonCode } from "./contract.js";
import { previewOf } from "./preview.js";
import { scanFolder, type Found } from "./scan.js";

/** The first 16 hex characters of a SHA-256 of the kind and the path relative to the scanned folder. */
export const entryId = (kind: Found["kind"], rel: string): string => createHash("sha256").update(`${kind}:${rel}`).digest("hex").slice(0, 16);

/** Fixed text for each failure. Nothing from the failure's own message, a path or a stack reaches the catalog. */
const REASONS: Record<ReasonCode, string> = {
  Unfinished: "Unfinished: the run has no score.json yet",
  WorldMissing: "WorldMissing: the world file the run used is missing or does not load",
  ReplayFailed: "ReplayFailed: the run log does not replay on its world",
  BundleInvalid: "BundleInvalid: the bundle is missing a file, is not valid, or has a format this viewer does not know",
  RunInvalid: "RunInvalid: the run's files could not be read",
};

function reasonCodeFor(e: unknown): ReasonCode {
  if (e instanceof ExportRefused) return e.refusal === "unfinished" ? "Unfinished" : e.refusal === "world" ? "WorldMissing" : "RunInvalid";
  if (e instanceof ReplayFailed) return "ReplayFailed";
  if (e instanceof WorldError) return "WorldMissing";
  return "RunInvalid";
}

/** One scan's result: the catalog and the text of any entry's bundle files. */
export interface Snapshot {
  catalog: Catalog;
  /** One of a ready entry's four bundle files as text; undefined for an unknown id or name, or an entry that is not ready. */
  file(id: string, name: string): string | undefined;
}

interface Cached {
  key: string;
  entry: CatalogEntry;
  /** A run's bundle files, built once and served until the run's files change. */
  files?: Record<BundleFileName, string>;
  /** A bundle folder, whose files are read when asked for. */
  dir?: string;
}

/**
 * The state of the world file a run recorded, for the run's cache key: a world that was missing when the run was scanned and is restored
 * later, or one that is edited, must not leave a stale entry. 0 for no recorded world or a missing file.
 */
const worldStamp = (runDir: string): number => {
  try {
    const world = recordedWorldPath(runDir);
    return world === undefined ? 0 : mtime(world);
  } catch {
    return 0; // an unreadable mcp.json is the run's own failure to report, and its mtime is already in the key
  }
};

const mtime = (path: string): number => statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0;
const size = (path: string): number => statSync(path, { throwIfNoEntry: false })?.size ?? 0;

/**
 * Builds the catalog for a folder of runs. Each call to `scan` looks at the folder again, so a run that finishes
 * appears at the next call; a run's bundle is rebuilt only when its files have changed. The catalog has no
 * timestamp and no filesystem path, and is ordered by label, run and id, so the same folder gives the same bytes.
 */
export class RunCatalog {
  /** How many bundles have been built from run folders, for tests and for noticing a cache that does not hold. */
  builds = 0;
  private readonly cache = new Map<string, Cached>();

  constructor(private readonly root: string) {}

  scan(): Snapshot {
    const seen = new Map<string, Cached>();
    for (const found of scanFolder(this.root)) {
      const id = entryId(found.kind, found.rel);
      seen.set(id, this.entryFor(id, found));
    }
    this.cache.clear();
    for (const [id, c] of seen) this.cache.set(id, c);

    const runs = [...seen.values()].map((c) => c.entry).sort((a, b) => {
      const key = (e: CatalogEntry) => [String(e.attributes["label"] ?? ""), String(e.attributes["run"] ?? ""), e.id];
      const [ka, kb] = [key(a), key(b)];
      for (let i = 0; i < 3; i++) if (ka[i]! !== kb[i]!) return ka[i]! < kb[i]! ? -1 : 1;
      return 0;
    });
    const catalog: Catalog = { format: CATALOG_FORMAT, runs };
    return {
      catalog,
      file: (id, name) => {
        const c = seen.get(id);
        if (!c || c.entry.status !== "ready" || !(BUNDLE_FILES as readonly string[]).includes(name)) return undefined;
        if (c.files) return c.files[name as BundleFileName];
        if (c.dir) {
          const path = join(c.dir, name);
          return existsSync(path) ? readFileSync(path, "utf8") : name === "trace.jsonl" ? "" : undefined;
        }
        return undefined;
      },
    };
  }

  private entryFor(id: string, found: Found): Cached {
    const key = found.kind === "run"
      ? `${mtime(join(found.dir, "score.json"))}:${size(join(found.dir, "run.jsonl"))}:${mtime(join(found.dir, "mcp.json"))}:${worldStamp(found.dir)}`
      : `${mtime(join(found.dir, "bundle.json"))}:${size(join(found.dir, "frames.jsonl"))}:${mtime(join(found.dir, "score.json"))}`;
    const hit = this.cache.get(id);
    if (hit && hit.key === key) return hit;
    return found.kind === "run" ? this.runEntry(id, found, key) : this.bundleEntry(id, found, key);
  }

  private runEntry(id: string, found: Found, key: string): Cached {
    const failed = (code: ReasonCode): Cached => ({
      key,
      entry: entrySchema.parse({
        id, kind: "run", status: code === "Unfinished" ? "unfinished" : "unreadable", reason: REASONS[code],
        attributes: partialAttributes(found.dir, { unfinished: code === "Unfinished" }),
      }),
    });
    if (!existsSync(join(found.dir, "score.json"))) return failed("Unfinished");
    let bundle: Bundle;
    try {
      this.builds++;
      bundle = buildBundle(found.dir);
    } catch (e) {
      return failed(reasonCodeFor(e));
    }
    return {
      key,
      files: bundleFiles(bundle),
      entry: entrySchema.parse({ id, kind: "run", status: "ready", attributes: attributesOf(bundle), preview: previewOf(bundle.frames, bundle.manifest.goal.item), bundle: `bundles/${id}/` }),
    };
  }

  private bundleEntry(id: string, found: Found, key: string): Cached {
    try {
      const bundle = readBundle(found.dir);
      if (bundle.manifest.format !== 1 || bundleProblem(bundle) !== undefined) throw new Error("not a bundle this viewer reads");
      return {
        key,
        dir: found.dir,
        entry: entrySchema.parse({ id, kind: "bundle", status: "ready", attributes: attributesOf(bundle), preview: previewOf(bundle.frames, bundle.manifest.goal.item), bundle: `bundles/${id}/` }),
      };
    } catch {
      return {
        key,
        entry: entrySchema.parse({ id, kind: "bundle", status: "unreadable", reason: REASONS.BundleInvalid, attributes: partialAttributes(found.dir, {}) }),
      };
    }
  }
}
