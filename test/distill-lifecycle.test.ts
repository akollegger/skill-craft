// The session a harness gives (spec 009, FR-001 to FR-006): record, distill, describe, close, and what happens when things go wrong.
import { describe, expect, it } from "vitest";
import { HarnessRefused } from "../src/harness/errors.js";
import { getHarness, harnessNames, registerHarness } from "../src/distill/registry.js";
import { REFUSAL_CODES, type Refusal } from "../src/distill/harness.js";
import type { RunRecord } from "../src/distill/schemas.js";
import { SKILL_SET, scriptedHarness, type Op } from "./helpers/fake-harness.js";

const run = (id: string): RunRecord => ({
  id,
  prompt: "Hold one c.",
  models: { requested: "m", resolved: ["m"] },
  settings: null,
  reasoning: "none",
  turns: [{ text: "ok", calls: [{ id: `${id}-1`, tool: "look", arguments: {}, status: "ok", output: "table" }] }],
  finalAnswer: "done",
});
const live = () => new AbortController().signal;
const refusal = (code: Refusal["code"]): Refusal => ({ ok: false, code, spendUsd: 0.25, stages: [] });

describe("the harness errors", () => {
  it("is a user error with fixed text", () => {
    const e = new HarnessRefused("an unknown harness");
    expect(e.message).toBe("harness refused: an unknown harness");
    expect(e.code).toBe("HarnessRefused");
  });
});

describe("the registry (FR-001)", () => {
  it("returns a registered harness by name and refuses an unknown one, naming the known ones", () => {
    const { harness } = scriptedHarness();
    registerHarness("scripted-for-test", () => harness);
    expect(getHarness("scripted-for-test")).toBe(harness);
    expect(harnessNames()).toContain("scripted-for-test");
    expect(() => getHarness("nope")).toThrow(HarnessRefused);
    expect(() => getHarness("nope")).toThrow(/scripted-for-test/);
  });
});

describe("a session", () => {
  it("records two runs, distills over both, describes itself and closes", async () => {
    const { harness, sessions } = scriptedHarness();
    const s = await harness.open("exp-1", live());
    await s.record(run("001"), live());
    await s.record(run("002"), live());
    const r = await s.distill({ runIds: ["001", "002"] }, live());
    expect(r).toMatchObject({ ok: true, skills: SKILL_SET });
    expect(s.describe().harness.name).toBe("scripted");
    await s.close();
    expect(sessions[0]!.recordedRuns.map((x) => x.id)).toEqual(["001", "002"]);
    expect(sessions[0]!.distillRequests).toEqual([{ runIds: ["001", "002"] }]);
    expect(sessions[0]!.closeCount).toBe(1);
  });

  it("records a run id once: the second record changes nothing", async () => {
    const { harness, sessions } = scriptedHarness();
    const s = await harness.open("e", live());
    await s.record(run("001"), live());
    await s.record({ ...run("001"), finalAnswer: "different" }, live());
    expect(sessions[0]!.recordedRuns).toHaveLength(1);
    expect(sessions[0]!.recordedRuns[0]!.finalAnswer).toBe("done");
  });

  it("refuses a record that is not a run record, without echoing it", async () => {
    const { harness, sessions } = scriptedHarness();
    const s = await harness.open("e", live());
    await expect(s.record({ ...run("001"), score: { reached: true } } as unknown as RunRecord, live())).rejects.toThrow(HarnessRefused);
    await expect(s.record({ ...run("001"), prompt: 5 } as unknown as RunRecord, live())).rejects.toThrow(/not a run record/);
    expect(sessions[0]!.recordedRuns).toHaveLength(0);
  });

  it("refuses an empty list of ids, and an id that was not recorded, before any work", async () => {
    const { harness, sessions } = scriptedHarness();
    const s = await harness.open("e", live());
    await s.record(run("001"), live());
    await expect(s.distill({ runIds: [] }, live())).rejects.toThrow(HarnessRefused);
    await expect(s.distill({ runIds: ["001", "009"] }, live())).rejects.toThrow(/was not recorded/);
    expect(sessions[0]!.distillRequests).toHaveLength(0);
  });

  it("can distill again over a different set of ids, each independent", async () => {
    const { harness, sessions } = scriptedHarness({ result: (req) => ({ ok: true, skills: SKILL_SET, stages: [{ stage: `over-${req.runIds.join("+")}`, durationMs: 1, tokens: null, costUsd: null }] }) });
    const s = await harness.open("e", live());
    for (const id of ["001", "002", "003"]) await s.record(run(id), live());
    const a = await s.distill({ runIds: ["001"] }, live());
    const b = await s.distill({ runIds: ["002", "003"] }, live());
    expect(a.ok && a.stages[0]!.stage).toBe("over-001");
    expect(b.ok && b.stages[0]!.stage).toBe("over-002+003");
    expect(sessions[0]!.distillRequests).toHaveLength(2);
  });

  it("passes on a spend limit and a skill-count hint, which a harness may ignore", async () => {
    const { harness, sessions } = scriptedHarness();
    const s = await harness.open("e", live());
    await s.record(run("001"), live());
    await s.distill({ runIds: ["001"], maxUsd: 0.5, maxSkills: 3 }, live());
    expect(sessions[0]!.distillRequests[0]).toEqual({ runIds: ["001"], maxUsd: 0.5, maxSkills: 3 });
  });
});

describe("what distill returns (FR-005)", () => {
  it("returns each refusal code with the spend so far, as a value", async () => {
    for (const code of REFUSAL_CODES) {
      const { harness } = scriptedHarness({ result: refusal(code) });
      const s = await harness.open("e", live());
      await s.record(run("001"), live());
      expect(await s.distill({ runIds: ["001"] }, live())).toEqual(refusal(code));
    }
  });

  it("never returns an empty skill set: an empty or invalid set becomes a failed refusal", async () => {
    for (const skills of [{ skills: [] }, { skills: [{ name: "Bad Name", description: "", files: [] }] }, {}]) {
      const { harness } = scriptedHarness({ result: { ok: true, skills: skills as never, stages: [] } });
      const s = await harness.open("e", live());
      await s.record(run("001"), live());
      expect(await s.distill({ runIds: ["001"] }, live())).toMatchObject({ ok: false, code: "failed" });
    }
  });

  it("returns a set of several skills, and a set of one", async () => {
    const two = { skills: [SKILL_SET.skills[0]!, { ...SKILL_SET.skills[0]!, name: "other-skill" }] };
    const { harness } = scriptedHarness({ result: { ok: true, skills: two, stages: [] } });
    const s = await harness.open("e", live());
    await s.record(run("001"), live());
    const r = await s.distill({ runIds: ["001"] }, live());
    expect(r.ok && r.skills.skills).toHaveLength(2);
  });
});

describe("closing (FR-006, SC-005)", () => {
  it("releases once and is safe to call twice", async () => {
    const { harness, sessions } = scriptedHarness();
    const s = await harness.open("e", live());
    await s.close();
    await s.close();
    expect(sessions[0]!.closeCount).toBe(1);
  });

  it("refuses a record or a distill after close", async () => {
    const { harness } = scriptedHarness();
    const s = await harness.open("e", live());
    await s.record(run("001"), live());
    await s.close();
    await expect(s.record(run("002"), live())).rejects.toThrow(/closed/);
    await expect(s.distill({ runIds: ["001"] }, live())).rejects.toThrow(/closed/);
  });

  for (const op of ["record", "distill"] as const) {
    it(`still closes after a failure in ${op}`, async () => {
      const { harness, sessions } = scriptedHarness({ onOp: (o) => { if (o === op) throw new Error("scripted failure"); } });
      const s = await harness.open("e", live());
      try {
        await s.record(run("001"), live());
        await s.distill({ runIds: ["001"] }, live());
      } catch {
        // the caller closes in a finally
      } finally {
        await s.close();
      }
      expect(sessions[0]!.closeCount).toBe(1);
    });
  }

  it("is closed after a cancellation at each operation", async () => {
    const stop = new AbortController();
    stop.abort();
    // open
    const opened = scriptedHarness();
    await expect(opened.harness.open("e", stop.signal)).rejects.toThrow();
    expect(opened.sessions).toHaveLength(0);
    // record
    const rec = scriptedHarness();
    const s1 = await rec.harness.open("e", live());
    await expect(s1.record(run("001"), stop.signal)).rejects.toThrow(/cancelled/);
    await s1.close();
    expect(rec.sessions[0]!.closeCount).toBe(1);
    expect(rec.sessions[0]!.recordedRuns).toHaveLength(0);
    // distill: a cancelled refusal and no work
    const dis = scriptedHarness();
    const s2 = await dis.harness.open("e", live());
    await s2.record(run("001"), live());
    expect(await s2.distill({ runIds: ["001"] }, stop.signal)).toEqual({ ok: false, code: "cancelled", spendUsd: null, stages: [] });
    expect(dis.sessions[0]!.distillRequests).toHaveLength(0);
    await s2.close();
    expect(dis.sessions[0]!.closeCount).toBe(1);
  });

  it("is closed after a cancellation in the middle of an operation", async () => {
    const stop = new AbortController();
    const ops: Op[] = [];
    const { harness, sessions } = scriptedHarness({ onOp: (op) => { ops.push(op); if (op === "distill") stop.abort(); }, result: refusal("cancelled") });
    const s = await harness.open("e", stop.signal);
    await s.record(run("001"), stop.signal);
    expect(await s.distill({ runIds: ["001"] }, stop.signal)).toMatchObject({ ok: false, code: "cancelled" });
    await s.close();
    expect(sessions[0]!.closeCount).toBe(1);
    expect(ops).toEqual(["open", "record", "distill", "close"]);
  });
});
