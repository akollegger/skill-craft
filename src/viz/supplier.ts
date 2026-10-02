import { BUNDLE_FILES } from "../harness/export.js";
import type { Catalog } from "./contract.js";
import type { Snapshot } from "./catalog.js";

export interface VizResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** The catalog as the text both suppliers serve and the export writes. */
export const catalogText = (catalog: Catalog): string => `${JSON.stringify(catalog, null, 2)}\n`;

const NOT_FOUND: VizResponse = { status: 404, headers: { "content-type": "text/plain; charset=utf-8" }, body: "not found\n" };
const METHOD_NOT_ALLOWED: VizResponse = { status: 405, headers: { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" }, body: "read-only\n" };

const ID = /^[0-9a-f]{16}$/;

/**
 * Answer a request for the data contract: `/catalog.json` and `/bundles/<id>/<file>`. Returns null for any other
 * path, which belongs to the page's own files. An id is looked up in the snapshot and never turned into a path,
 * so nothing a request says can name a file; a path that tries to (an encoded separator, a backslash, a dot
 * segment, a null byte) is simply not found.
 */
export function respond(snap: Snapshot, method: string, rawPath: string): VizResponse | null {
  const path = rawPath.split(/[?#]/, 1)[0] ?? "";
  const owned = path === "/catalog.json" || path.startsWith("/bundles/") || path === "/bundles";
  if (!owned) return null;
  if (method !== "GET" && method !== "HEAD") return METHOD_NOT_ALLOWED;

  if (path === "/catalog.json") {
    return { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: catalogText(snap.catalog) };
  }
  if (/%|\\|\0/.test(path)) return NOT_FOUND;
  const parts = path.split("/"); // ["", "bundles", id, file]
  if (parts.length !== 4 || parts[1] !== "bundles") return NOT_FOUND;
  const [, , id = "", name = ""] = parts;
  if (!ID.test(id) || !(BUNDLE_FILES as readonly string[]).includes(name)) return NOT_FOUND;
  const body = snap.file(id, name);
  if (body === undefined) return NOT_FOUND;
  return { status: 200, headers: { "content-type": name.endsWith(".jsonl") ? "application/x-ndjson" : "application/json", "cache-control": "no-cache" }, body };
}
