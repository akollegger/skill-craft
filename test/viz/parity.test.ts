import { createReadStream, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUNDLE_FILES, exportBundle } from "../../src/harness/export.js";
import { REPO } from "../../src/harness/paths.js";
import { startVizServer, type RunningViz } from "../../src/viz/server.js";
import { exportFolder } from "../../src/viz/export-folder.js";
import { finishedRun, stampScore } from "../helpers/finished-run.js";

let pageDir = "";

// The page is built here, into a temporary folder, so the test does not depend on an earlier build.
beforeAll(async () => {
  pageDir = mkdtempSync(join(tmpdir(), "skill-craft-built-"));
  await build({ configFile: resolve(REPO, "viz/vite.config.ts"), logLevel: "silent", build: { outDir: pageDir, emptyOutDir: true } });
}, 120_000);

/** A plain static file server with no knowledge of runs: what a static host is. */
function staticServer(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jsonl": "application/x-ndjson" };
  const server = http.createServer((req, res) => {
    const path = resolve(root, `.${new URL(req.url ?? "/", "http://x").pathname === "/" ? "/index.html" : new URL(req.url ?? "/", "http://x").pathname}`);
    if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    createReadStream(path).pipe(res);
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}/`, close: () => new Promise((r) => { server.close(() => r()); server.closeAllConnections(); }) })));
}

const get = async (url: string): Promise<string> => (await fetch(url)).text();

describe("the local process and a static host", () => {
  let local: RunningViz;
  let site: { url: string; close: () => Promise<void> };
  let ids: string[] = [];
  let siteDir = "";

  beforeAll(async () => {
    const f = await finishedRun({ label: "alpha", runs: 2 });
    await finishedRun({ dir: f.dir, world: f.world, label: "beta" });
    // a run from before the prior fit was stamped, exported as a bundle
    const older = await finishedRun({ dir: f.dir, world: f.world, label: "older" });
    stampScore(older.runDir, {}, ["priorFit"]);
    exportBundle(older.runDir, join(f.out, "shared", "older-bundle"));
    siteDir = join(f.dir, "site");
    exportFolder(f.out, siteDir, { pageDir });
    local = await startVizServer({ folder: f.out, pageDir, port: 0 });
    site = await staticServer(siteDir);
    ids = (JSON.parse(await get(`${local.url}catalog.json`)) as { runs: { id: string }[] }).runs.map((r) => r.id);
  }, 120_000);

  afterAll(async () => {
    await local?.close();
    await site?.close();
  });

  it("serve the same catalog, byte for byte", async () => {
    expect(await get(`${site.url}catalog.json`)).toBe(await get(`${local.url}catalog.json`));
    expect(ids.length).toBe(5);
  });

  it("serve the same four files for every run", async () => {
    for (const id of ids) {
      for (const name of BUNDLE_FILES) {
        expect(await get(`${site.url}bundles/${id}/${name}`), `${id}/${name}`).toBe(await get(`${local.url}bundles/${id}/${name}`));
      }
    }
  });

  it("serve the same page", async () => {
    expect(await get(site.url)).toBe(await get(local.url));
    const html = await get(site.url);
    for (const asset of [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]!)) {
      expect(await get(`${site.url}${asset}`), asset).toBe(await get(`${local.url}${asset}`));
    }
  });

  it("list a bundle exported before the prior fit was stamped with the attributes it has", async () => {
    const catalog = JSON.parse(await get(`${site.url}catalog.json`)) as { runs: { kind: string; attributes: Record<string, unknown> }[] };
    const older = catalog.runs.find((r) => r.kind === "bundle")!;
    expect(older.attributes).toMatchObject({ label: "older", run: "001", outcome: "reached" });
    expect(older.attributes).not.toHaveProperty("priorFit");
  });

  it("export every file of the page, so the site is complete", () => {
    const built = readdirSync(pageDir, { recursive: true }).map(String).sort();
    const exported = readdirSync(siteDir, { recursive: true }).map(String);
    for (const f of built) expect(exported, f).toContain(f);
  });
});

describe("the built page works offline", () => {
  // Strings that look like addresses inside library code but are namespaces, error-message links or schema ids; none
  // is ever requested.
  const NOT_FETCHED = [/^http:\/\/www\.w3\.org\//, /^http:\/\/www\.pixijs\.com\//, /^https:\/\/svelte\.dev\/e\//, /^https?:\/\/json-schema\.org\//];

  const files = (): string[] => readdirSync(pageDir, { recursive: true }).map(String).filter((f) => /\.(js|css|html)$/.test(f));

  it("loads nothing from an absolute address: scripts, styles, fonts and images are all relative", () => {
    const html = readFileSync(join(pageDir, "index.html"), "utf8");
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) expect(m[1], m[1]).not.toMatch(/^([a-z][a-z0-9+.-]*:)?\/\//i);
    for (const f of files().filter((f) => f.endsWith(".css"))) {
      for (const m of readFileSync(join(pageDir, f), "utf8").matchAll(/url\(([^)]*)\)/g)) expect(m[1], `${f} ${m[1]}`).not.toMatch(/^["']?(https?:)?\/\//);
    }
  });

  it("holds no absolute web address except namespaces and links inside messages", () => {
    const found = new Set<string>();
    for (const f of files()) for (const m of readFileSync(join(pageDir, f), "utf8").matchAll(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g)) found.add(m[0]);
    const unexpected = [...found].filter((u) => !NOT_FETCHED.some((re) => re.test(u)));
    expect(unexpected).toEqual([]);
  });

  it("bundles the three font families", () => {
    const fonts = readdirSync(join(pageDir, "assets")).filter((f) => f.endsWith(".woff2"));
    for (const family of ["pixelify-sans", "jersey-10", "fira-code"]) expect(fonts.some((f) => f.startsWith(family)), family).toBe(true);
  });
});
