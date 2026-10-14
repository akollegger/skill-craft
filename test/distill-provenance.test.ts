// The record of how a skill set was made (spec 009, FR-017, FR-020): written by the command, read by the report, and still readable for old loop records.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDistillationRecord, readDistillationRecord, writeDistillationRecord } from "../src/distill/provenance.js";
import { distillationRecordSchema, type Provenance } from "../src/distill/schemas.js";
import { LoopRefused, ReportRefused } from "../src/harness/errors.js";
import { skillSha256 } from "../src/loop/package.js";
import { recording } from "./helpers/loop-fixtures.js";

const SHA = (c: string) => c.repeat(64);

/** What writeLoopRecord wrote before this feature (src/loop/record.ts), for a loop that distilled through NAMS and accepted in two rounds. */
const legacyLoop = (over: Record<string, unknown> = {}) => ({
  label: "old-loop",
  mode: "runs",
  runs: ["runs/t0/001", "runs/t0/002"],
  process: { version: "2", commit: "0123456789abcdef0123456789abcdef01234567", dirty: false, changesSha256: null },
  recordedRuns: [
    { label: "001", run: "runs/t0/001", runLogSha256: SHA("1"), scoreSha256: SHA("2"), models: ["anthropic/claude-sonnet-5-5"], settings: { temperature: null, effort: "high", thinking: "adaptive" } },
    { label: "002", run: "runs/t0/002", runLogSha256: SHA("3"), scoreSha256: SHA("4"), models: ["anthropic/claude-sonnet-5-5"], settings: null },
  ],
  recordingFormat: "conversation",
  distiller: { service: { name: "nams", version: "1.3.0", released: "2026-10-12", commit: "27263eb242308738644e4fbaa817d3f8fbd31574", environment: "production" } },
  rubric: { version: "1", sha256: SHA("a"), kindVersion: "1" },
  roles: {
    critic: { requested: "anthropic/claude-sonnet-5-5", resolved: ["anthropic/claude-sonnet-5-5"], settings: { temperature: null, effort: "medium", thinking: "adaptive" }, priceQuote: null },
    reviser: { requested: "fireworks/glm-5p3-flash", resolved: ["fireworks/glm-5p3-flash"], settings: null, priceQuote: { source: "market-quote", openRouterId: "z-ai/glm-5.3-flash", fetchedAt: "2026-10-12T00:00:00.000Z", perMillion: { input: 0.02, output: 1.2 } } },
  },
  spend: { costUsd: 0.056, pricedStages: 3, unpricedStages: 0, tokens: { input: 100, output: 50, cacheRead: 10, cacheCreation: null } },
  finalSkillSha256: SHA("b"),
  rounds: [{ n: 1, skillSha256: SHA("c"), overall: "revise", revisedSha256: SHA("b") }, { n: 2, skillSha256: SHA("b"), overall: "accept" }],
  outcome: "accept",
  reason: "accepted",
  failed: false,
  cancelled: false,
  stages: [
    { stage: "create-workspace", startedAt: 1, endedAt: 2, durationMs: 1 },
    { stage: "critic-1", startedAt: 3, endedAt: 9, durationMs: 6, model: { requested: "anthropic/claude-sonnet-5-5", resolved: "anthropic/claude-sonnet-5-5" }, tokens: { input: 10, output: 5, cacheRead: 0, cacheCreation: 0 }, costUsd: 0.01 },
  ],
  ...over,
});

const dir = () => mkdtempSync(join(tmpdir(), "skill-craft-prov-"));
const put = (name: string, value: unknown): string => {
  const path = join(dir(), name);
  writeFileSync(path, JSON.stringify(value));
  return path;
};

describe("reading a loop record made before this feature (FR-020)", () => {
  it("is read as the nams-reviewed harness, with its roles, rubric, service, rounds, spend and final skill", () => {
    const r = readDistillationRecord(put("loop.json", legacyLoop()));
    expect(r.harness).toEqual({ name: "nams-reviewed", processVersion: "2" });
    expect(r.roles["critic"]).toMatchObject({ requested: "anthropic/claude-sonnet-5-5", resolved: ["anthropic/claude-sonnet-5-5"], settings: { effort: "medium" }, price: null });
    expect(r.roles["reviser"]?.price).toMatchObject({ source: "market-quote", openRouterId: "z-ai/glm-5.3-flash" });
    expect(r.prompts["review-rubric"]).toEqual({ version: "1", sha256: SHA("a") });
    expect(r.service).toMatchObject({ name: "nams", version: "1.3.0" });
    expect(r.retainedExternally).toBe(true);
    expect(r.review).toEqual({ rounds: [{ n: 1, skillSha256: SHA("c"), overall: "revise" }, { n: 2, skillSha256: SHA("b"), overall: "accept" }], outcome: "accept" });
    expect(r.spend).toMatchObject({ costUsd: 0.056, pricedStages: 3 });
    expect(r.runs.map((x) => x.id)).toEqual(["001", "002"]);
    expect(r.runs[0]).toMatchObject({ runLogSha256: SHA("1"), scoreSha256: SHA("2") });
    expect(r.skills).toEqual([{ name: "skill", sha256: SHA("b") }]);
    expect(r.outcome).toBe("skill-set");
    expect(r.stages.map((s) => s.stage)).toEqual(["create-workspace", "critic-1"]);
    expect(distillationRecordSchema.safeParse(r).success).toBe(true);
  });

  it("reads a rejected or failed loop as having produced no skill set", () => {
    const rejected = readDistillationRecord(put("loop.json", legacyLoop({ outcome: "reject", reason: "the critic rejected it", finalSkillSha256: null, rounds: [{ n: 1, skillSha256: SHA("c"), overall: "reject" }] })));
    expect(rejected.skills).toEqual([]);
    expect(rejected.outcome).toBe("no_skill");
    const failed = readDistillationRecord(put("loop.json", legacyLoop({ outcome: "reject", failed: true, finalSkillSha256: null, reason: "DriverFailed: x" })));
    expect(failed.outcome).toBe("failed");
    const cancelled = readDistillationRecord(put("loop.json", legacyLoop({ outcome: "reject", cancelled: true, finalSkillSha256: null })));
    expect(cancelled.outcome).toBe("cancelled");
  });

  it("reads a record made for a supplied skill (mode candidate) with no service and no recorded runs", () => {
    const r = readDistillationRecord(put("loop.json", legacyLoop({ mode: "candidate", distiller: null, recordedRuns: [], recordingFormat: null })));
    expect(r.service).toBeNull();
    expect(r.retainedExternally).toBe(false);
    expect(r.runs).toEqual([]);
  });

  it("refuses a file that is neither a harness record nor a loop record, with fixed text", () => {
    expect(() => readDistillationRecord(put("x.json", { hello: "world" }))).toThrow(ReportRefused);
    expect(() => readDistillationRecord(join(dir(), "missing.json"))).toThrow(/no distillation record/);
    const bad = join(dir(), "bad.json");
    writeFileSync(bad, "{not json");
    expect(() => readDistillationRecord(bad)).toThrow(/not valid JSON/);
  });
});

const provenance = (): Provenance => ({
  harness: { name: "bespoke-one-shot", processVersion: "1" },
  roles: { distiller: { requested: "fireworks/glm-5p3-flash", resolved: ["fireworks/glm-5p3-flash"], settings: null, price: null } },
  prompts: { distiller: { version: "1", sha256: SHA("d") } },
  service: null,
  retainedExternally: false,
  stages: [{ stage: "distill", durationMs: 12, tokens: { input: 10, output: 5, cacheRead: null, cacheCreation: null }, costUsd: 0.002, model: { requested: "fireworks/glm-5p3-flash", resolved: "fireworks/glm-5p3-flash" } }],
  spend: { costUsd: 0.002, pricedStages: 1, unpricedStages: 0, tokens: { input: 10, output: 5, cacheRead: null, cacheCreation: null } },
});

describe("writing a distillation record", () => {
  const recs = [recording("001"), recording("002")];
  const skills = { skills: [{ name: "craft-thing", description: "d", files: [{ path: "SKILL.md", content: "---\nname: craft-thing\ndescription: d\n---\nbody\n" }] }] };

  it("holds the provenance, each run by hash, each skill by hash, and the outcome", () => {
    const rec = buildDistillationRecord(provenance(), recs, { ok: true, skills, stages: [] });
    expect(rec.runs).toEqual(recs.map((r) => ({ id: r.label, runLogSha256: r.runLogSha256, scoreSha256: r.scoreSha256, models: r.models, settings: r.settings })));
    expect(rec.skills).toEqual([{ name: "craft-thing", sha256: skillSha256({ "SKILL.md": skills.skills[0]!.files[0]!.content }) }]);
    expect(rec.outcome).toBe("skill-set");
    expect(rec.reason).toBe("a skill set was produced");
  });

  it("records a refusal's code as the outcome, with a fixed reason", () => {
    const rec = buildDistillationRecord(provenance(), recs, { ok: false, code: "spend_limit", spendUsd: 0.4, stages: [] });
    expect(rec.outcome).toBe("spend_limit");
    expect(rec.skills).toEqual([]);
    expect(rec.reason).toBe("distillation was refused: spend_limit");
  });

  it("holds no recorded text, no key and no absolute path, and round-trips through the file", () => {
    const rec = buildDistillationRecord(provenance(), recs, { ok: true, skills, stages: [] });
    const path = join(dir(), "harness.json");
    writeDistillationRecord(path, rec);
    const text = readFileSync(path, "utf8");
    for (const secret of [recs[0]!.prompt, recs[0]!.finalAnswer, recs[0]!.calls[0]!.output, "body", process.env["HOME"] ?? "/Users/"]) expect(text).not.toContain(secret.trim());
    expect(readDistillationRecord(path)).toEqual(rec);
  });

  it("refuses to write a record that does not match the schema", () => {
    const rec = buildDistillationRecord(provenance(), recs, { ok: true, skills, stages: [] });
    expect(() => writeDistillationRecord(join(dir(), "x.json"), { ...rec, extra: 1 } as never)).toThrow(LoopRefused);
  });
});
