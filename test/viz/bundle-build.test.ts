import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBundle } from "../../src/harness/bundle.js";
import { ExportRefused, ReplayFailed } from "../../src/harness/errors.js";
import { buildBundle, exportBundle } from "../../src/harness/export.js";
import { finishedRun, stampScore } from "../helpers/finished-run.js";

describe("buildBundle", () => {
  it("returns what exportBundle writes, in memory", async () => {
    const { runDir, dest } = await finishedRun();
    const built = buildBundle(runDir);
    exportBundle(runDir, dest);
    const written = readBundle(dest);
    expect(built.manifest).toEqual(written.manifest);
    expect(built.frames).toEqual(written.frames);
    expect(built.trace).toEqual(written.trace);
    expect(built.result).toEqual(written.result);
  });

  it("writes no file", async () => {
    const { runDir, dir } = await finishedRun();
    const before = JSON.stringify(readdirSyncDeep(dir));
    buildBundle(runDir);
    expect(JSON.stringify(readdirSyncDeep(dir))).toBe(before);
  });

  it("refuses with the same causes as the export", async () => {
    const unfinished = await finishedRun();
    rmSync(join(unfinished.runDir, "score.json"));
    expect(() => buildBundle(unfinished.runDir)).toThrow(ExportRefused);
    expect(() => buildBundle(unfinished.runDir)).toThrow(/unfinished/);

    const noWorld = await finishedRun();
    rmSync(noWorld.world);
    expect(() => buildBundle(noWorld.runDir)).toThrow(/world file/);

    const broken = await finishedRun();
    const log = join(broken.runDir, "run.jsonl");
    writeFileSync(log, readFileSync(log, "utf8").replace('"ok":true', '"ok":false'));
    expect(() => buildBundle(broken.runDir)).toThrow(ReplayFailed);
  });

  it("carries the prior fit, prompt note and skill when score.json has them", async () => {
    const { runDir } = await finishedRun();
    stampScore(runDir, {
      priorFit: "faithful",
      promptNote: "A skill is available.",
      skill: { name: "demo-skill", sha256: "abc", invoked: true, loadedAfterCalls: 4 },
    });
    const { manifest } = buildBundle(runDir);
    expect(manifest.priorFit).toBe("faithful");
    expect(manifest.promptNote).toBe("A skill is available.");
    expect(manifest.skill).toEqual({ name: "demo-skill", loaded: true, loadedAfter: 4 });
    expect(JSON.stringify(manifest)).not.toContain("abc"); // the fingerprint is not part of the manifest
  });

  it("records an installed skill that was never loaded with a null loadedAfter", async () => {
    const { runDir } = await finishedRun();
    stampScore(runDir, { skill: { name: "demo-skill", sha256: "abc", invoked: false, loadedAfterCalls: null } });
    expect(buildBundle(runDir).manifest.skill).toEqual({ name: "demo-skill", loaded: false, loadedAfter: null });
  });

  it("omits the optional fields when the run does not have them", async () => {
    const { runDir } = await finishedRun();
    stampScore(runDir, {}, ["priorFit"]);
    const { manifest } = buildBundle(runDir);
    expect(manifest).not.toHaveProperty("priorFit");
    expect(manifest).not.toHaveProperty("promptNote");
    expect(manifest).not.toHaveProperty("skill");
  });
});

describe("a bundle exported before the optional fields", () => {
  it("still reads", async () => {
    const { runDir, dest } = await finishedRun();
    stampScore(runDir, {}, ["priorFit"]);
    exportBundle(runDir, dest);
    const b = readBundle(dest);
    expect(b.manifest.format).toBe(1);
    expect(b.manifest.priorFit).toBeUndefined();
    expect(b.frames.length).toBeGreaterThan(1);
  });
});

const readdirSyncDeep = (dir: string): string[] => readdirSync(dir, { recursive: true }).map(String).sort();
