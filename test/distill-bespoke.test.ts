// The bespoke-one-shot harness (spec 009, US3): one tool-less model call over the recorded runs that returns one skill, with citations.
import { describe, expect, it } from "vitest";
import { bespokeOneShotHarness, BESPOKE_ONE_SHOT, type BespokeConfig } from "../src/distill/harnesses/bespoke-one-shot.js";
import { toRunRecord } from "../src/distill/run-record.js";
import type { RunRecord } from "../src/distill/schemas.js";
import { loadVersion } from "../src/prompts/index.js";
import { LIMITS } from "../src/loop/package.js";
import { fakeRole, type ScriptedAnswer } from "./helpers/fake-role.js";
import { recording } from "./helpers/loop-fixtures.js";

const live = () => new AbortController().signal;
const runs = (): RunRecord[] => [toRunRecord(recording("001", 4)), toRunRecord(recording("002", 3))];
const GOOD = { name: "pair-first", description: "Try pairs of one base item before mixing.", body: "Placing two of the same item worked (run 001 call 2).", references: [{ path: "references/notes.md", content: "notes\n" }], evidence: [{ run: "001", call: 2 }] };

function setup(script: ScriptedAnswer[], over: Partial<BespokeConfig> = {}) {
  const role = fakeRole(script);
  const config: BespokeConfig = { role: role.driver, model: "fireworks/glm-5p3-flash", maxUsd: 0.5, ...over };
  return { role, harness: bespokeOneShotHarness(config) };
}

async function distill(script: ScriptedAnswer[], over: Partial<BespokeConfig> = {}, rs: RunRecord[] = runs()) {
  const { role, harness } = setup(script, over);
  const s = await harness.open("exp", live());
  for (const r of rs) await s.record(r, live());
  const result = await s.distill({ runIds: rs.map((r) => r.id) }, live());
  await s.close();
  return { role, s, result };
}

describe("the call it makes (FR-013)", () => {
  it("is one role call with no tools, whose system is the distiller prompt and whose prompt is the recordings", async () => {
    const { role, result } = await distill([GOOD]);
    expect(role.calls).toHaveLength(1);
    const call = role.calls[0]!;
    expect(call.model).toBe("fireworks/glm-5p3-flash");
    expect(call.maxUsd).toBe(0.5);
    expect(call.system).toBe(loadVersion("distiller", "1").text.trim());
    expect(Object.keys(call)).not.toContain("tools");
    for (const r of runs()) {
      expect(call.prompt).toContain(`# Run ${r.id}`);
      expect(call.prompt).toContain(r.prompt.trim());
      expect(call.prompt).toContain(r.finalAnswer.trim());
      for (const c of r.turns.flatMap((t) => t.calls)) expect(call.prompt).toContain(c.output.trim());
    }
    expect(result.ok).toBe(true);
  });

  it("numbers calls the way a citation names them, per run", async () => {
    const { role } = await distill([GOOD]);
    expect(role.calls[0]!.prompt).toMatch(/### Call 1: place/);
    expect(role.calls[0]!.prompt).toMatch(/### Call 4: craft/);
  });

  it("shows the model's turns with the reasoning the provider returned, and invents none", async () => {
    const withReasoning: RunRecord = { ...runs()[0]!, id: "001", turns: [{ text: "trying a pair", reasoning: "two of a kind first", calls: runs()[0]!.turns.flatMap((t) => t.calls).slice(0, 1) }] };
    const { role } = await distill([GOOD], {}, [withReasoning]);
    expect(role.calls[0]!.prompt).toContain("two of a kind first");
    expect(role.calls[0]!.prompt).toContain("trying a pair");
    const none = await distill([GOOD], {}, [runs()[1]!]);
    expect(none.role.calls[0]!.prompt).not.toMatch(/reasoning/i);
  });

  it("passes the settings and the price the cast gave it", async () => {
    const price = { source: "market-quote" as const, openRouterId: "z-ai/glm-5.3-flash", fetchedAt: "2026-10-12T00:00:00.000Z", perMillion: { input: 0.02, output: 1.2 } };
    const { role } = await distill([GOOD], { settings: { temperature: 0.6 }, price });
    expect(role.calls[0]!.settings).toEqual({ temperature: 0.6 });
    expect(role.calls[0]!.price).toEqual(price);
  });
});

describe("what it is never given (FR-015, SC-003)", () => {
  it("holds no score, solver output, goal role, needed-calls label, world path, goals file or hash in its system or prompt", async () => {
    const { role } = await distill([GOOD]);
    const text = `${role.calls[0]!.system}\n${role.calls[0]!.prompt}`;
    for (const banned of ["worlds/test.json", "runLogSha256", "scoreSha256", "0".repeat(64), "reached", "solver", "best run", "extra calls", "slack", "held-out", "heldOut", "gap goal", "needed", "minCalls", "goals file"]) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it("has no parameter that takes a path, a world or a score: its config names only the role, the model, the cap, the settings and the price", () => {
    const keys: (keyof BespokeConfig)[] = ["role", "model", "maxUsd", "settings", "price", "now", "promptVersion"];
    const sample: BespokeConfig = { role: fakeRole([]).driver, model: "m", maxUsd: 1 };
    for (const k of Object.keys(sample)) expect(keys).toContain(k);
  });
});

describe("the answer (FR-013, research R10)", () => {
  it("becomes one skill: a SKILL.md with front matter and the body, the references, and the evidence, passing the package checks", async () => {
    const { result } = await distill([GOOD]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skills.skills).toHaveLength(1);
    const skill = result.skills.skills[0]!;
    expect(skill.name).toBe("pair-first");
    expect(skill.description).toBe(GOOD.description);
    const main = skill.files.find((f) => f.path === "SKILL.md")!;
    expect(main.content).toBe(`---\nname: pair-first\ndescription: ${GOOD.description}\n---\n\n${GOOD.body}\n`);
    expect(skill.files.map((f) => f.path).sort()).toEqual(["SKILL.md", "references/notes.md"]);
    expect(skill.evidence).toEqual([{ run: "001", call: 2 }]);
  });

  it("is checked by the role driver's check, which names fields and limits and echoes nothing of the answer", async () => {
    const { role } = await distill([GOOD]);
    const check = role.calls[0]!.check!;
    expect(check(GOOD)).toBeUndefined();
    const marker = "ANSWER-TEXT-0042";
    const bad = [
      { ...GOOD, body: `${marker} no citation here` },
      { ...GOOD, name: `Bad Name ${marker}` },
      { ...GOOD, description: "" },
      { ...GOOD, references: [{ path: "../escape.md", content: marker }] },
      { ...GOOD, references: [{ path: "references/big.md", content: marker.repeat(LIMITS.fileBytes) }] },
      { nothing: marker },
    ];
    for (const answer of bad) {
      const problem = check(answer);
      expect(typeof problem).toBe("string");
      expect(problem).not.toContain(marker);
    }
    expect(check(bad[0])).toMatch(/body/);
    expect(check(bad[1])).toMatch(/name/);
  });

  it("asks the role for an object with exactly those fields", async () => {
    const { role } = await distill([GOOD]);
    const schema = role.calls[0]!.schema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required.sort()).toEqual(["body", "description", "name"].sort());
    expect(Object.keys(schema.properties).sort()).toEqual(["body", "description", "evidence", "name", "references"]);
  });
});

describe("what it returns when it cannot (FR-005, research R9)", () => {
  it("is a failed refusal when the role fails, and when the answer never passes the check", async () => {
    const failed = await distill([{ fail: "DriverFailed: the player reported step_timeout" }]);
    expect(failed.result).toMatchObject({ ok: false, code: "failed" });
    const bad = await distill([() => ({ nothing: true })]);
    expect(bad.result).toMatchObject({ ok: false, code: "failed" });
  });

  it("is spend_limit when the role reached its cap, and cancelled when the signal was aborted", async () => {
    const cap = await distill([{ fail: "DriverFailed: the role reached its spend cap" }]);
    expect(cap.result).toMatchObject({ ok: false, code: "spend_limit" });
    const { harness } = setup([{ hang: true }]);
    const ctl = new AbortController();
    const s = await harness.open("e", ctl.signal);
    await s.record(runs()[0]!, ctl.signal);
    const p = s.distill({ runIds: ["001"] }, ctl.signal);
    setTimeout(() => ctl.abort(), 20);
    expect(await p).toMatchObject({ ok: false, code: "cancelled" });
  });

  it("refuses recordings over the size limit with a fixed reason, before any call", async () => {
    const big = runs()[0]!;
    const huge: RunRecord = { ...big, finalAnswer: "x".repeat(LIMITS.recordingsChars + 1) };
    const { role, result } = await distill([GOOD], {}, [huge]);
    expect(role.calls).toHaveLength(0);
    expect(result).toMatchObject({ ok: false, code: "failed", reason: expect.stringContaining("exceed") });
  });

  it("carries the spend so far from the stage that was priced", async () => {
    const { result } = await distill([() => ({ nothing: true })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.spendUsd).toBeCloseTo(0.01, 5);
  });
});

describe("what it says about itself (FR-017, FR-018)", () => {
  it("names the harness, the model and settings, the prompt's version and fingerprint, the stage and spend, and holds no recorded text", async () => {
    const price = { source: "market-quote" as const, openRouterId: "z-ai/glm-5.3-flash", fetchedAt: "2026-10-12T00:00:00.000Z", perMillion: { input: 0.02, output: 1.2 } };
    const { s } = await distill([GOOD], { settings: { temperature: 0.6 }, price });
    const d = s.describe();
    expect(d.harness.name).toBe(BESPOKE_ONE_SHOT);
    expect(d.roles["distiller"]).toMatchObject({ requested: "fireworks/glm-5p3-flash", resolved: ["fireworks/glm-5p3-flash"], settings: { temperature: 0.6, effort: null, thinking: null }, price });
    const v1 = loadVersion("distiller", "1");
    expect(d.prompts["distiller"]).toEqual({ version: "1", sha256: v1.sha256 });
    expect(d.retainedExternally).toBe(false);
    expect(d.service).toBeNull();
    expect(d.stages.map((x) => x.stage)).toEqual(["distill"]);
    expect(d.spend.costUsd).toBeCloseTo(0.01, 5);
    const text = JSON.stringify(d);
    for (const secret of [runs()[0]!.prompt, runs()[0]!.finalAnswer, GOOD.body, GOOD.description]) expect(text).not.toContain(secret.trim());
  });
});
