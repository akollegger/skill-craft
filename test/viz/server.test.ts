import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunCatalog } from "../../src/viz/catalog.js";
import { VizRefused } from "../../src/viz/errors.js";
import { createRequestHandler, startVizServer, type RunningViz } from "../../src/viz/server.js";
import { finishedRun } from "../helpers/finished-run.js";

const running: RunningViz[] = [];
afterEach(async () => {
  while (running.length) await running.pop()!.close();
});

function pageDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-page-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>page</title>");
  writeFileSync(join(dir, "assets", "app.js"), "export {};");
  writeFileSync(join(dir, "assets", "app.css"), "body{}");
  writeFileSync(join(dir, "assets", "font.woff2"), "wOF2");
  return dir;
}

async function start(extra: { port?: number } = {}) {
  const f = await finishedRun({ label: "alpha" });
  const page = pageDir();
  const server = await startVizServer({ folder: f.out, pageDir: page, port: extra.port ?? 0 });
  running.push(server);
  return { ...f, page, server };
}

/** A raw request, so the test controls the Host header and the exact path. */
function raw(port: number, path: string, headers: Record<string, string> = {}, method = "GET"): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("startVizServer", () => {
  it("binds the loopback address only and reports its port and URL", async () => {
    const { server } = await start();
    expect(server.address).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);
  });

  it("serves the page and its assets with the right content types", async () => {
    const { server } = await start();
    const index = await raw(server.port, "/");
    expect(index.status).toBe(200);
    expect(index.headers["content-type"]).toContain("text/html");
    expect(index.body).toContain("<title>page</title>");
    expect((await raw(server.port, "/assets/app.js")).headers["content-type"]).toContain("text/javascript");
    expect((await raw(server.port, "/assets/app.css")).headers["content-type"]).toContain("text/css");
    expect((await raw(server.port, "/assets/font.woff2")).headers["content-type"]).toBe("font/woff2");
  });

  it("serves the catalog and a bundle by the contract's addresses", async () => {
    const { server } = await start();
    const cat = JSON.parse((await raw(server.port, "/catalog.json")).body) as { runs: { id: string }[] };
    expect(cat.runs).toHaveLength(1);
    const b = await raw(server.port, `/bundles/${cat.runs[0]!.id}/frames.jsonl`);
    expect(b.status).toBe(200);
    expect(b.body.split("\n")[0]).toContain('"seq":0');
  });

  it("answers HEAD without a body", async () => {
    const { server } = await start();
    const r = await raw(server.port, "/catalog.json", {}, "HEAD");
    expect(r.status).toBe(200);
    expect(r.body).toBe("");
    expect(Number(r.headers["content-length"])).toBeGreaterThan(10);
  });

  it("accepts its own address as the Host and rejects any other with 421", async () => {
    const { server } = await start();
    for (const host of [`127.0.0.1:${server.port}`, `localhost:${server.port}`]) expect((await raw(server.port, "/catalog.json", { Host: host })).status, host).toBe(200);
    for (const host of ["evil.example", `evil.example:${server.port}`, `127.0.0.1:${server.port + 1}`, "127.0.0.1"]) expect((await raw(server.port, "/catalog.json", { Host: host })).status, host).toBe(421);
  });

  it("is read-only", async () => {
    const { server } = await start();
    for (const method of ["POST", "PUT", "DELETE"]) expect((await raw(server.port, "/catalog.json", {}, method)).status, method).toBe(405);
    expect((await raw(server.port, "/", {}, "POST")).status).toBe(405);
  });

  it("does not serve anything outside the page folder or the derived data", async () => {
    const { server, page } = await start();
    writeFileSync(join(page, "..", "secret-outside.txt"), "SECRET-OUTSIDE");
    for (const path of ["/../secret-outside.txt", "/%2e%2e/secret-outside.txt", "/..%2fsecret-outside.txt", "/assets/../../secret-outside.txt", "/%00", "/assets/%2e%2e%2f%2e%2e%2fsecret-outside.txt", "/package.json", "/specs/004-skillcraft-visualizer/spec.md"]) {
      const r = await raw(server.port, path);
      expect(r.body, path).not.toContain("SECRET-OUTSIDE");
      expect(r.status, path).toBe(404);
    }
  });

  it("scans the folder again for each catalog request, so a run that finishes appears", async () => {
    const { server, dir, world } = await start();
    const count = async () => (JSON.parse((await raw(server.port, "/catalog.json")).body) as { runs: unknown[] }).runs.length;
    expect(await count()).toBe(1);
    await finishedRun({ dir, world, label: "beta" });
    expect(await count()).toBe(2);
  });

  it("refuses a folder that does not exist or is not a folder", async () => {
    const page = pageDir();
    await expect(startVizServer({ folder: join(tmpdir(), "no-such-folder-xyz"), pageDir: page, port: 0 })).rejects.toThrow(VizRefused);
    const file = join(page, "index.html");
    await expect(startVizServer({ folder: file, pageDir: page, port: 0 })).rejects.toThrow(/not a folder/);
  });

  it("refuses to start without the built page, saying how to build it", async () => {
    const f = await finishedRun();
    const empty = mkdtempSync(join(tmpdir(), "skill-craft-nopage-"));
    await expect(startVizServer({ folder: f.out, pageDir: empty, port: 0 })).rejects.toThrow(/pnpm build:viz/);
  });

  it("refuses a port that is taken", async () => {
    const { server, out, page } = await start();
    await expect(startVizServer({ folder: out, pageDir: page, port: server.port })).rejects.toThrow(/port .* in use/);
  });
});

describe("createRequestHandler as middleware", () => {
  it("answers the contract's paths and passes every other path on", async () => {
    const f = await finishedRun();
    const handler = createRequestHandler({ catalog: new RunCatalog(f.out) });
    const server = http.createServer((req, res) => handler(req, res, () => { res.statusCode = 418; res.end("next"); }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      expect((await raw(port, "/catalog.json")).status).toBe(200);
      const passed = await raw(port, "/assets/app.js");
      expect(passed.status).toBe(418);
      expect(passed.body).toBe("next");
      expect((await raw(port, "/catalog.json", { Host: "anything.example" })).status).toBe(200); // the host belongs to whoever mounts it
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
