import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { RunCatalog, type Snapshot } from "./catalog.js";
import { VizRefused } from "./errors.js";
import { respond, type VizResponse } from "./supplier.js";

type Next = () => void;

export interface HandlerOptions {
  catalog: RunCatalog;
  /** The built page. Without it the handler answers only the data contract and passes everything else on. */
  pageDir?: string;
  /** Host header values to accept; anything else gets 421. Without it no check is made. */
  allowedHosts?: () => string[];
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

const send = (req: http.IncomingMessage, res: http.ServerResponse, r: VizResponse | { status: number; headers: Record<string, string>; body: Buffer | string }): void => {
  const length = Buffer.byteLength(r.body);
  res.writeHead(r.status, { ...r.headers, "content-length": String(length), "x-content-type-options": "nosniff" });
  res.end(req.method === "HEAD" ? undefined : r.body);
};

const plain = (status: number, body: string): VizResponse => ({ status, headers: { "content-type": "text/plain; charset=utf-8" }, body });

/** A page file for a request path, or undefined. The path must stay inside the page folder. */
function pageFile(pageDir: string, rawPath: string): { status: number; headers: Record<string, string>; body: Buffer } | undefined {
  const path = rawPath.split(/[?#]/, 1)[0] ?? "";
  if (/%|\\|\0/.test(path) || path.split("/").includes("..")) return undefined;
  const root = resolve(pageDir);
  const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
  if (file !== root && !file.startsWith(root + sep)) return undefined;
  const info = statSync(file, { throwIfNoEntry: false });
  if (!info?.isFile()) return undefined;
  return { status: 200, headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" }, body: readFileSync(file) };
}

/**
 * A connect-style request handler: the data contract over a folder of runs, and, with a page folder, the built page.
 * Mounted ahead of Vite's own middleware in development, so it passes on what it does not answer; standing alone it
 * answers 404. Read-only: anything but GET and HEAD gets 405.
 */
export function createRequestHandler(o: HandlerOptions) {
  let last: Snapshot | undefined;
  return (req: http.IncomingMessage, res: http.ServerResponse, next?: Next): void => {
    const done = (r: VizResponse) => send(req, res, r);
    if (o.allowedHosts && !o.allowedHosts().includes(String(req.headers.host ?? ""))) return done(plain(421, "unexpected host\n"));
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    try {
      // A new catalog request rescans the folder; the bundles that follow are served from that scan.
      if ((url.split(/[?#]/, 1)[0] ?? "") === "/catalog.json" || !last) last = o.catalog.scan();
      const data = respond(last, method, url);
      if (data) return done(data);
    } catch {
      return done(plain(500, "the folder could not be read\n"));
    }
    if (!o.pageDir) {
      if (next) return next();
      return done(plain(404, "not found\n"));
    }
    if (method !== "GET" && method !== "HEAD") return done({ status: 405, headers: { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" }, body: "read-only\n" });
    const file = pageFile(o.pageDir, url);
    if (file) return send(req, res, file);
    done(plain(404, "not found\n"));
  };
}

export interface RunningViz {
  url: string;
  port: number;
  address: string;
  close(): Promise<void>;
}

export interface StartOptions {
  folder: string;
  pageDir: string;
  port?: number;
}

/**
 * Serve a folder of runs and the built page on the loopback address. Refuses, with fixed text, a folder that is
 * missing or not a folder, a page that has not been built, and a port already in use.
 */
export async function startVizServer(o: StartOptions): Promise<RunningViz> {
  const info = statSync(o.folder, { throwIfNoEntry: false });
  if (!info) throw new VizRefused(`${o.folder} does not exist`);
  if (!info.isDirectory()) throw new VizRefused(`${o.folder} is not a folder`);
  if (!existsSync(join(o.pageDir, "index.html"))) throw new VizRefused("the page has not been built; run pnpm build:viz first");

  const port = o.port ?? 4747;
  const state = { port };
  const handler = createRequestHandler({
    catalog: new RunCatalog(o.folder),
    pageDir: o.pageDir,
    allowedHosts: () => [`127.0.0.1:${state.port}`, `localhost:${state.port}`],
  });
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", (e: NodeJS.ErrnoException) => reject(e.code === "EADDRINUSE" ? new VizRefused(`port ${port} is in use; choose another with --port`) : e));
    server.listen(port, "127.0.0.1", resolveListen);
  });
  const addr = server.address() as { address: string; port: number };
  state.port = addr.port;
  return {
    url: `http://127.0.0.1:${addr.port}/`,
    port: addr.port,
    address: addr.address,
    close: () => new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections(); }),
  };
}
