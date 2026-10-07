import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vizCli } from "../../src/viz/cli.js";
import { finishedRun } from "../helpers/finished-run.js";

function page(): string {
  const dir = mkdtempSync(join(tmpdir(), "skill-craft-clipage-"));
  writeFileSync(join(dir, "index.html"), "<title>p</title>");
  mkdirSync(join(dir, "assets"));
  return dir;
}

function deps(over: Partial<Parameters<typeof vizCli>[1]> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, deps: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), pageDir: page(), ...over } };
}

describe("vizCli", () => {
  it("prints usage for no folder or too many", async () => {
    for (const argv of [[], ["a", "b"]]) {
      const { err, deps: d } = deps();
      expect(await vizCli(argv, d)).toBe(1);
      expect(err.join("\n")).toMatch(/usage: viz\.ts/);
    }
  });

  it("refuses a bad port, an unknown option and a missing folder", async () => {
    const f = await finishedRun();
    for (const [argv, text] of [[[f.out, "--port", "abc"], /--port must be/], [[f.out, "--port", "70000"], /--port must be/], [[f.out, "--bogus"], /usage: viz\.ts/], [[join(tmpdir(), "no-such-xyz")], /does not exist/]] as const) {
      const { err, deps: d } = deps();
      expect(await vizCli([...argv], d), argv.join(" ")).toBe(1);
      expect(err.join("\n")).toMatch(text);
    }
  });

  it("refuses when the page has not been built", async () => {
    const f = await finishedRun();
    const { err, deps: d } = deps({ pageDir: mkdtempSync(join(tmpdir(), "skill-craft-nopage-")) });
    expect(await vizCli([f.out, "--port", "0"], d)).toBe(1);
    expect(err.join("\n")).toMatch(/pnpm build:viz/);
  });

  it("serves until told to stop, saying what it found and where", async () => {
    const f = await finishedRun({ runs: 2 });
    const controller = new AbortController();
    const { out, err, deps: d } = deps({ signal: controller.signal });
    const done = vizCli([f.out, "--port", "0"], d);
    for (let i = 0; i < 100 && out.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
    expect(out[0]).toMatch(/2 runs found in .* \(2 can be opened\)/);
    const url = /serving (http:\/\/127\.0\.0\.1:\d+\/)/.exec(out[1] ?? "")?.[1];
    expect(url).toBeDefined();
    const catalog = (await (await fetch(`${url}catalog.json`)).json()) as { runs: unknown[] };
    expect(catalog.runs).toHaveLength(2);
    controller.abort();
    expect(await done).toBe(0);
    expect(err).toEqual([]);
    await expect(fetch(`${url}catalog.json`)).rejects.toThrow();
  });

  it("starts on a folder with no runs and says so", async () => {
    const controller = new AbortController();
    const { out, deps: d } = deps({ signal: controller.signal });
    const done = vizCli([mkdtempSync(join(tmpdir(), "skill-craft-empty-")), "--port", "0"], d);
    for (let i = 0; i < 100 && out.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
    expect(out[0]).toMatch(/^0 runs found/);
    controller.abort();
    expect(await done).toBe(0);
  });
});
