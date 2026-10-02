import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBundle, exportBundle } from "../../src/harness/export.js";
import { readBundle } from "../../src/harness/bundle.js";
import { attributesOf, outcomeOf, partialAttributes } from "../../src/viz/attributes.js";
import { attributesSchema } from "../../src/viz/contract.js";
import { finishedRun, stampScore } from "../helpers/finished-run.js";

const saved = (runDir: string) => JSON.parse(readFileSync(join(runDir, "score.json"), "utf8")) as { score: Record<string, any>; measured: { total?: Record<string, number> } };

describe("attributesOf", () => {
  it("describes a finished run with flat attributes from what the folder holds", async () => {
    const { runDir } = await finishedRun();
    const a = attributesOf(buildBundle(runDir));
    const s = saved(runDir);
    expect(attributesSchema.safeParse(a).success).toBe(true);
    expect(a).toMatchObject({
      label: "lab", run: "001", world: "export-world", rows: 3, cols: 3, goalItem: "e", goalQty: 1,
      modelRan: "fake-a", priorFit: "undeclared", outcome: "reached",
      actionCalls: s.score["actionCalls"], bestCalls: s.score["best"].minCalls, extraCalls: s.score["extraCalls"],
      crafts: s.score["craftsMade"], failedCrafts: s.score["failedCrafts"], refusals: 0, traceMatched: true,
    });
    expect(a["durationMs"]).toBe(s.measured.total?.["durationMs"]);
    for (const k of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens"]) expect(a[k], k).toBe(s.measured.total?.[k]);
    expect(a["costUsd"]).toBe(s.measured.total?.["costUsd"]);
  });

  it("gives the same attributes for a bundle as for the run it came from", async () => {
    const { runDir, dest } = await finishedRun();
    exportBundle(runDir, dest);
    expect(attributesOf(readBundle(dest))).toEqual(attributesOf(buildBundle(runDir)));
  });

  it("leaves out what a run lacks and never fills in a default", async () => {
    const { runDir } = await finishedRun();
    stampScore(runDir, {}, ["priorFit"]);
    const a = attributesOf(buildBundle(runDir));
    for (const k of ["priorFit", "promptNote", "skill", "skillLoaded", "skillLoadedAfter", "modelRequested"]) expect(a, k).not.toHaveProperty(k);
  });

  it("carries the prompt note and the skill's name, whether it was loaded and after how many calls", async () => {
    const { runDir } = await finishedRun();
    stampScore(runDir, { promptNote: "A skill is available.", skill: { name: "demo", sha256: "x", invoked: true, loadedAfterCalls: 5 } });
    expect(attributesOf(buildBundle(runDir))).toMatchObject({ promptNote: "A skill is available.", skill: "demo", skillLoaded: true, skillLoadedAfter: 5 });
    stampScore(runDir, { skill: { name: "demo", sha256: "x", invoked: false, loadedAfterCalls: null } });
    const a = attributesOf(buildBundle(runDir));
    expect(a).toMatchObject({ skill: "demo", skillLoaded: false });
    expect(a).not.toHaveProperty("skillLoadedAfter");
  });

  it("carries the skill through an exported bundle, and leaves it out of one that predates skills", async () => {
    const withSkill = await finishedRun();
    stampScore(withSkill.runDir, { promptNote: "A skill is available.", skill: { name: "demo", sha256: "x", invoked: true, loadedAfterCalls: 5 } });
    exportBundle(withSkill.runDir, withSkill.dest);
    expect(attributesOf(readBundle(withSkill.dest))).toMatchObject({ skill: "demo", skillLoaded: true, skillLoadedAfter: 5, promptNote: "A skill is available." });

    const older = await finishedRun();
    stampScore(older.runDir, {}, ["priorFit"]);
    exportBundle(older.runDir, older.dest);
    const a = attributesOf(readBundle(older.dest));
    for (const k of ["skill", "skillLoaded", "skillLoadedAfter", "promptNote", "priorFit"]) expect(a, k).not.toHaveProperty(k);
  });

  it("reports the requested model when there was one", async () => {
    const { runDir } = await finishedRun();
    stampScore(runDir, { model: { requested: "claude-haiku-4-5-20251001", resolved: ["claude-haiku-4-5-20251001", "other"] } });
    expect(attributesOf(buildBundle(runDir))).toMatchObject({ modelRequested: "claude-haiku-4-5-20251001", modelRan: "claude-haiku-4-5-20251001, other" });
  });

  it("takes cost and tokens from a matched trace only", async () => {
    const mismatch = await finishedRun({ player: { dropToolEnd: 1 } });
    const a = attributesOf(buildBundle(mismatch.runDir));
    expect(a["traceMatched"]).toBe(false);
    for (const k of ["durationMs", "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "costUsd"]) expect(a, k).not.toHaveProperty(k);
  });

  it("describes a run with zero calls", async () => {
    const { runDir } = await finishedRun({ player: { mode: "silent" } });
    // an empty log is a run that never called a tool
    const a = attributesOf(buildBundle(runDir));
    expect(a["actionCalls"]).toBeTypeOf("number");
    expect(a["outcome"]).toBeTypeOf("string");
  });
});

describe("outcomeOf", () => {
  const result = (ended: string, reached: boolean) => ({ ended, score: { reached } }) as never;
  it("names the five outcomes", () => {
    expect(outcomeOf(result("stopped", true))).toBe("reached");
    expect(outcomeOf(result("stopped", false))).toBe("gave up");
    expect(outcomeOf(result("budget", false))).toBe("out of turns");
    expect(outcomeOf(result("error", false))).toBe("error");
    expect(outcomeOf(result("budget", true))).toBe("reached");
  });

  it("matches what real runs of each kind ended as", async () => {
    const gaveUp = await finishedRun({ player: { mode: "wander" } });
    expect(attributesOf(buildBundle(gaveUp.runDir))["outcome"]).toBe("gave up");
    const budget = await finishedRun({ player: { mode: "budget" } });
    expect(attributesOf(buildBundle(budget.runDir))["outcome"]).toBe("out of turns");
  });
});

describe("partialAttributes", () => {
  it("gives label and run from the folder names, and outcome unfinished when there is no score", async () => {
    const { runDir } = await finishedRun();
    const a = partialAttributes(runDir, { unfinished: true });
    expect(a).toEqual({ label: "lab", run: "001", outcome: "unfinished" });
  });

  it("adds what a readable score.json still says for a run that cannot be opened", async () => {
    const { runDir } = await finishedRun();
    const a = partialAttributes(runDir, {});
    expect(a).toMatchObject({ label: "lab", run: "001", goalItem: "e", goalQty: 1, priorFit: "undeclared", modelRan: "fake-a", outcome: "reached" });
    expect(a).not.toHaveProperty("world"); // the world is what could not be found
  });

  it("copes with a score.json that is not JSON", async () => {
    const { runDir } = await finishedRun();
    (await import("node:fs")).writeFileSync(join(runDir, "score.json"), "not json");
    expect(partialAttributes(runDir, {})).toEqual({ label: "lab", run: "001" });
  });
});
