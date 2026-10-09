import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vizExportCli } from "../../src/viz/cli.js";
import { finishedRun } from "../helpers/finished-run.js";

/** Run a script the way a user would: `node --import tsx <script> ...args` from the repo root. */
function run(script: string, args: string[]) {
  const res = spawnSync(process.execPath, ["--import", "tsx", script, ...args], { encoding: "utf8", timeout: 60_000 });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-expage-"));
  writeFileSync(join(dir, "index.html"), "<title>p</title>");
  return dir;
}

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, deps: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
};

describe("scripts/art-sheet.ts", () => {
  it("writes the sheet outside the repository and refuses a destination inside it, including one named like `..sheets`", () => {
    const outside = join(mkdtempSync(join(tmpdir(), "skill-craft-sheet-")), "sheet.html");
    const ok = run("scripts/art-sheet.ts", [outside]);
    expect(ok.status).toBe(0);
    expect(readFileSync(outside, "utf8")).toMatch(/^<!doctype html>/i);
    for (const inside of ["sheet.html", "..sheets/sheet.html", "."]) {
      const bad = run("scripts/art-sheet.ts", [inside]);
      expect(bad.status, inside).toBe(1);
      expect(bad.stderr).toMatch(/inside the repository/);
    }
    expect(existsSync("sheet.html")).toBe(false);
  });
});

describe("vizExportCli", () => {
  it("prints usage for missing or extra arguments and an unknown option", async () => {
    for (const argv of [[], ["a"], ["a", "b", "c"], ["a", "b", "--bogus"]]) {
      const c = capture();
      expect(vizExportCli(argv, c.deps), argv.join(" ")).toBe(1);
      expect(c.err.join("\n")).toMatch(/usage: viz-export\.ts/);
    }
  });

  it("exports with the page, says how many runs, and lists the ones it left out", async () => {
    const f = await finishedRun({ runs: 2 });
    rmSync(join(f.runDir, "score.json"));
    const dest = join(f.dir, "site");
    const c = capture();
    expect(vizExportCli([f.out, dest], { ...c.deps, pageDir: page() })).toBe(0);
    expect(c.out[0]).toBe(`${dest}: 1 runs exported, 1 left out`);
    expect(c.out[1]).toMatch(/^left out lab\/001: Unfinished: /);
    expect(existsSync(join(dest, "index.html"))).toBe(true);
    expect(c.err).toEqual([]);
  });

  it("leaves the page out with --no-page, and does not need it to be built", async () => {
    const f = await finishedRun();
    const dest = join(f.dir, "site");
    const c = capture();
    expect(vizExportCli([f.out, dest, "--no-page"], { ...c.deps, pageDir: join(f.dir, "not-built") })).toBe(0);
    expect(existsSync(join(dest, "index.html"))).toBe(false);
    expect(existsSync(join(dest, "catalog.json"))).toBe(true);
  });

  it("refuses when the page is needed and not built, saying how to build it or leave it out", async () => {
    const f = await finishedRun();
    const c = capture();
    expect(vizExportCli([f.out, join(f.dir, "site")], { ...c.deps, pageDir: join(f.dir, "not-built") })).toBe(1);
    expect(c.err.join("\n")).toMatch(/pnpm build:viz/);
    expect(existsSync(join(f.dir, "site"))).toBe(false);
  });

  it("refuses an existing destination and a missing folder", async () => {
    const f = await finishedRun();
    mkdirSync(join(f.dir, "site"));
    const a = capture();
    expect(vizExportCli([f.out, join(f.dir, "site"), "--no-page"], a.deps)).toBe(1);
    expect(a.err.join("\n")).toMatch(/already exists/);
    const b = capture();
    expect(vizExportCli([join(f.dir, "nope"), join(f.dir, "site2"), "--no-page"], b.deps)).toBe(1);
    expect(b.err.join("\n")).toMatch(/does not exist/);
  });
});

describe("the scripts", () => {
  it("viz-export.ts exports a folder when run as a command, and exits 1 with usage when given nothing", async () => {
    const f = await finishedRun();
    const dest = join(f.dir, "site");
    const ok = run("scripts/viz-export.ts", [f.out, dest, "--no-page"]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("1 runs exported");
    expect(JSON.parse(readFileSync(join(dest, "catalog.json"), "utf8")).runs).toHaveLength(1);
    const none = run("scripts/viz-export.ts", []);
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/usage: viz-export\.ts/);
  }, 30_000); // each script is a new process that loads TypeScript; two of them outlast the default timeout under load

  it("viz.ts exits 1 with usage when given nothing, and with a clear cause for a missing folder", () => {
    const none = run("scripts/viz.ts", []);
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/usage: viz\.ts/);
    const missing = run("scripts/viz.ts", [join(tmpdir(), "no-such-folder-xyz"), "--port", "0"]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/does not exist/);
  }, 30_000);
});
