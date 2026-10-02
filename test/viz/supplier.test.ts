import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLE_FILES, exportBundle } from "../../src/harness/export.js";
import { RunCatalog } from "../../src/viz/catalog.js";
import { respond } from "../../src/viz/supplier.js";
import { DESCRIPTIONS, finishedRun, WORLD_FILE_NAME } from "../helpers/finished-run.js";

async function setup() {
  const f = await finishedRun({ label: "alpha", runs: 2 });
  exportBundle(f.runDir, join(f.out, "shared", "one"));
  const snap = new RunCatalog(f.out).scan();
  const ready = snap.catalog.runs.filter((e) => e.status === "ready");
  return { ...f, snap, ready };
}

describe("respond", () => {
  it("answers catalog.json with the catalog", async () => {
    const { snap } = await setup();
    const r = respond(snap, "GET", "/catalog.json")!;
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(r.body)).toEqual(snap.catalog);
  });

  it("answers each bundle file of a ready run and a ready bundle", async () => {
    const { snap, ready } = await setup();
    expect(ready.map((e) => e.kind).sort()).toEqual(["bundle", "run", "run"]);
    for (const e of ready) {
      for (const name of BUNDLE_FILES) {
        const r = respond(snap, "GET", `/bundles/${e.id}/${name}`)!;
        expect(r.status, `${e.id}/${name}`).toBe(200);
        expect(r.headers["content-type"]).toBe(name.endsWith(".jsonl") ? "application/x-ndjson" : "application/json");
        expect(r.body).toBe(snap.file(e.id, name));
      }
    }
  });

  it("ignores a query string", async () => {
    const { snap, ready } = await setup();
    expect(respond(snap, "GET", "/catalog.json?x=1")!.status).toBe(200);
    expect(respond(snap, "GET", `/bundles/${ready[0]!.id}/bundle.json?y=2`)!.status).toBe(200);
  });

  it("does not own paths outside its address space", async () => {
    const { snap } = await setup();
    for (const p of ["/", "/index.html", "/assets/app.js", "/bundle"]) expect(respond(snap, "GET", p), p).toBeNull();
  });

  it("refuses ids it does not hold, other file names, and anything that tries to leave the derived data", async () => {
    const { snap, ready, runDir } = await setup();
    const id = ready[0]!.id;
    const bad = [
      "/bundles/0000000000000000/bundle.json",
      `/bundles/${id}/run.jsonl`,
      `/bundles/${id}/mcp.json`,
      `/bundles/${id}/`,
      `/bundles/${id}`,
      `/bundles/${id}/../../catalog.json`,
      `/bundles/../catalog.json`,
      `/bundles/${id}/..%2f..%2fcatalog.json`,
      `/bundles/${id}/%2e%2e/bundle.json`,
      `/bundles/${id}\\bundle.json`,
      `/bundles/${id}/bundle.json%00.txt`,
      `/bundles/${runDir}/bundle.json`,
      "/bundles//bundle.json",
    ];
    for (const p of bad) {
      const r = respond(snap, "GET", p);
      expect(r?.status, p).toBe(404);
    }
  });

  it("answers only GET and HEAD on what it owns", async () => {
    const { snap, ready } = await setup();
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const r = respond(snap, method, "/catalog.json")!;
      expect(r.status, method).toBe(405);
      expect(r.headers["allow"]).toBe("GET, HEAD");
      expect(respond(snap, method, `/bundles/${ready[0]!.id}/bundle.json`)!.status).toBe(405);
    }
    expect(respond(snap, "HEAD", "/catalog.json")!.status).toBe(200);
  });

  it("does not offer bundle files for a run that is not ready", async () => {
    const f = await finishedRun({ label: "broken" });
    rmSync(join(f.runDir, "score.json"));
    const snap = new RunCatalog(f.out).scan();
    const e = snap.catalog.runs[0]!;
    expect(e.status).toBe("unfinished");
    expect(respond(snap, "GET", `/bundles/${e.id}/bundle.json`)!.status).toBe(404);
  });

  it("holds no world file name and no item description in anything it answers", async () => {
    const { snap, ready } = await setup();
    const all = [respond(snap, "GET", "/catalog.json")!, ...ready.flatMap((e) => BUNDLE_FILES.map((n) => respond(snap, "GET", `/bundles/${e.id}/${n}`)!))].map((r) => r.body).join("\n");
    expect(all).not.toContain(WORLD_FILE_NAME);
    for (const d of Object.values(DESCRIPTIONS)) expect(all, d).not.toContain(d);
  });
});
