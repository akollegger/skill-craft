import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CandidateFailed, LoopCancelled, LoopRefused, WorkspaceRefused } from "../src/harness/errors.js";
import { runExperiment } from "../src/harness/run.js";
import { obtainCandidate } from "../src/loop/candidate.js";
import { replayRun, type Recording } from "../src/loop/transcript.js";
import { fakePlayer } from "./helpers/fake-player.js";
import { FakeNams, FAKE_SECRET } from "./helpers/fake-nams.js";
import { makeZip } from "./helpers/zip.js";

const MIRROR = "test/fixtures/valid/mirror-pair.json";
const CHAIN = "test/fixtures/valid/chain-three.json";
const SKILL = "---\nname: craft-thing\ndescription: Use when you need the thing.\n---\n\n# Thing\n\nPlace A then B.\n";
const goodZip = () => makeZip([{ name: "craft-thing/SKILL.md", data: SKILL }, { name: "craft-thing/references/notes.md", data: "notes\n" }]);

async function run(world: string, goal: { item: string; qty: number }, mode: "solve" | "refuse", label: string): Promise<Recording> {
  const out = mkdtempSync(join(tmpdir(), "skill-craft-cand-"));
  const { dir } = await runExperiment({ world, goal, runs: 1, maxTurns: 12, out, label, driver: fakePlayer({ mode, goal }) });
  return replayRun(join(dir, "001"), label === "a" ? "001" : label === "b" ? "002" : "003");
}

function args(nams: FakeNams, runs: Recording[], over: Record<string, unknown> = {}) {
  const loopDir = mkdtempSync(join(tmpdir(), "skill-craft-loopdir-"));
  const lines: string[] = [];
  return {
    loopDir,
    lines,
    a: { runs, format: "prose" as const, allowWorkspace: true, nams, loopDir, signal: new AbortController().signal, pollMs: 1, maxWaitMs: 2000, out: (l: string) => lines.push(l), now: (() => { let t = 100; return () => (t += 3); })(), ...over },
  };
}

describe("obtainCandidate", () => {
  it("records every run to one workspace it created, generates once, downloads, and deletes that workspace", async () => {
    const [a, b] = [await run(MIRROR, { item: "c", qty: 1 }, "solve", "a"), await run(MIRROR, { item: "c", qty: 1 }, "solve", "b")];
    const fake = new FakeNams({ zip: goodZip() });
    const { a: x, loopDir } = args(fake, [a, b]);
    const r = await obtainCandidate(x);

    expect(fake.created).toHaveLength(1);
    expect(fake.deleted).toEqual(fake.created);
    expect(fake.touched()).toEqual(fake.created); // no other id was touched
    const convs = fake.recorded.filter((c) => c.kind === "conversation");
    expect(convs).toHaveLength(2);
    for (const rec of [a, b]) {
      const calls = fake.recorded.filter((c) => c.kind === "toolCall");
      expect(calls.length).toBeGreaterThanOrEqual(rec.calls.length);
    }
    const messages = fake.recorded.filter((c) => c.kind === "message").map((m) => (m.detail as any).role);
    expect(messages.filter((r) => r === "user")).toHaveLength(2); // one prompt each
    expect(messages.filter((r) => r === "assistant").length).toBeGreaterThanOrEqual(2);
    expect(fake.calls.filter((c) => c.method === "generateSkill")).toHaveLength(1);
    expect((fake.calls.find((c) => c.method === "generateSkill")!.detail as any).conversationIds).toHaveLength(2);

    // The package: the zip's one top-level folder is stripped.
    expect(Object.keys(r.pkg).sort()).toEqual(["SKILL.md", "references/notes.md"]);
    // The candidate's files and the generation record are saved.
    expect(readFileSync(join(loopDir, "candidate/SKILL.md"), "utf8")).toBe(SKILL);
    const gen = JSON.parse(readFileSync(join(loopDir, "generation.json"), "utf8"));
    expect(gen).toMatchObject({ runId: "run-1", skillId: "skill-1", format: "prose" });
    expect(gen.capabilities).toBeDefined();
    expect(r.info).toMatchObject({ workspace: { id: fake.created[0] }, generation: { runId: "run-1", skillId: "skill-1", format: "prose" } });
  });

  it("writes a refused call with status failure, and the trace's duration", async () => {
    const refused = await run(MIRROR, { item: "c", qty: 1 }, "refuse", "a");
    const fake = new FakeNams({ zip: goodZip() });
    await obtainCandidate(args(fake, [refused]).a);
    const calls = fake.recorded.filter((c) => c.kind === "toolCall").map((c) => c.detail as any);
    expect(calls.some((c) => c.status === "failure")).toBe(true);
    expect(calls.every((c) => typeof c.durationMs === "number" && c.durationMs >= 0)).toBe(true);
    expect(fake.recorded.filter((c) => c.kind === "step").length).toBeGreaterThan(0);
  });

  it("refuses runs of different goals or worlds, and a missing option, before any workspace is created", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const d = await run(MIRROR, { item: "d", qty: 1 }, "solve", "b");
    const other = await run(CHAIN, { item: "d", qty: 1 }, "solve", "c");
    const fake = new FakeNams();
    await expect(obtainCandidate(args(fake, [c, d]).a)).rejects.toBeInstanceOf(LoopRefused);
    await expect(obtainCandidate(args(fake, [d, other]).a)).rejects.toBeInstanceOf(LoopRefused);
    await expect(obtainCandidate(args(fake, [c], { allowWorkspace: false }).a)).rejects.toBeInstanceOf(LoopRefused);
    expect(fake.calls).toHaveLength(0);
  });

  it("deletes the workspace when the distiller fails, reports its reasons, and does not retry", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const fake = new FakeNams({ runs: [{ status: "pending" }, { status: "failed", failure: "low_coverage", gates: { grounding: 1, coverage: 0.5 } }] });
    const { a: x, loopDir } = args(fake, [c]);
    await expect(obtainCandidate(x)).rejects.toThrow(/the distiller reported failed \(low_coverage\)/);
    expect(fake.deleted).toEqual(fake.created);
    expect(fake.calls.filter((k) => k.method === "generateSkill")).toHaveLength(1);
    const gen = JSON.parse(readFileSync(join(loopDir, "generation.json"), "utf8"));
    expect(gen).toMatchObject({ status: "failed", failure: "low_coverage", gates: { coverage: 0.5 } });
  });

  it("deletes the workspace on a service error, and keeps the service's text out of the error", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const fake = new FakeNams({ failOn: ["generateSkill"] });
    try {
      await obtainCandidate(args(fake, [c]).a);
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CandidateFailed);
      expect(`${(e as Error).message}`).not.toContain(FAKE_SECRET);
    }
    expect(fake.deleted).toEqual(fake.created);
  });

  it("deletes the workspace on abort, and returns a cancellation", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const fake = new FakeNams({ hangOn: ["waitExtracted"] });
    const ctl = new AbortController();
    const p = obtainCandidate(args(fake, [c], { signal: ctl.signal }).a);
    setTimeout(() => ctl.abort(), 20);
    await expect(p).rejects.toBeInstanceOf(LoopCancelled);
    expect(fake.deleted).toEqual(fake.created);
    expect(fake.touched()).toEqual(fake.created);
  });

  it("never touches the development workspace, even if the service hands it back as the created one", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const fake = new FakeNams({ createdId: "dev-ws", existing: ["dev-ws"] });
    await expect(obtainCandidate(args(fake, [c], { forbiddenWorkspaceIds: ["dev-ws"] }).a)).rejects.toBeInstanceOf(WorkspaceRefused);
    expect(fake.deleted).toEqual([]);
    expect(fake.calls.filter((k) => k.method !== "createWorkspace" && k.method !== "listWorkspaceIds")).toHaveLength(0);
  });

  it("records the workspace in the loop folder before it is created, and marks it retired after deletion", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const failing = new FakeNams({ failOn: ["createWorkspace"] });
    const f = args(failing, [c]);
    await expect(obtainCandidate(f.a)).rejects.toBeInstanceOf(CandidateFailed);
    expect(JSON.parse(readFileSync(join(f.loopDir, "workspace.json"), "utf8"))).toMatchObject({ createdBy: "loop", id: null, retired: false });

    const ok = new FakeNams({ zip: goodZip() });
    const g = args(ok, [c]);
    await obtainCandidate(g.a);
    expect(JSON.parse(readFileSync(join(g.loopDir, "workspace.json"), "utf8"))).toMatchObject({ createdBy: "loop", id: ok.created[0], retired: true });
  });

  it("reports a failed deletion with the id and leaves it unretired, without hiding the candidate", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const fake = new FakeNams({ zip: goodZip(), failOn: ["deleteWorkspace"] });
    const x = args(fake, [c]);
    const r = await obtainCandidate(x.a);
    expect(Object.keys(r.pkg)).toContain("SKILL.md");
    expect(x.lines.join("\n")).toContain(fake.created[0]!);
    expect(x.lines.join("\n")).toMatch(/could not be deleted/);
    expect(JSON.parse(readFileSync(join(x.loopDir, "workspace.json"), "utf8")).retired).toBe(false);
  });

  it("returns a duration for each stage: create, each recording, extraction, generation, download and deletion", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const r = await obtainCandidate(args(new FakeNams({ zip: goodZip() }), [c]).a);
    expect(r.stages.map((s) => s.stage)).toEqual(["create-workspace", "record-run-001", "wait-extraction", "generate", "download", "delete-workspace"]);
    for (const s of r.stages) expect(s.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("makes and deletes its own workspace each time it is run on the same runs", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const fake = new FakeNams({ zip: goodZip() });
    await obtainCandidate(args(fake, [c]).a);
    await obtainCandidate(args(fake, [c]).a);
    expect(fake.created).toHaveLength(2);
    expect(new Set(fake.created).size).toBe(2);
    expect(fake.deleted.sort()).toEqual([...fake.created].sort());
    expect(existsSync(join(tmpdir()))).toBe(true);
  });
});

describe("an archive that holds a file named like the harness's own", () => {
  it("cannot overwrite the generation record: the harness writes it beside the package folder, and the package keeps its own file", async () => {
    const c = await run(MIRROR, { item: "c", qty: 1 }, "solve", "a");
    const zip = makeZip([{ name: "SKILL.md", data: SKILL }, { name: "generation.json", data: '{"runId":"FORGED"}' }]);
    const x = args(new FakeNams({ zip }), [c]);
    const r = await obtainCandidate(x.a);
    expect(r.pkg["generation.json"]).toBe('{"runId":"FORGED"}');
    expect(readFileSync(join(x.loopDir, "candidate/generation.json"), "utf8")).toBe('{"runId":"FORGED"}');
    expect(JSON.parse(readFileSync(join(x.loopDir, "generation.json"), "utf8"))).toMatchObject({ runId: "run-1", skillId: "skill-1" });
  });
});

describe("recording a run as the model lived it (spec 007 FR-029 to FR-031)", () => {
  const turn = (text: string, reasoning: string, ...calls: [number, string][]) => ({ seq: 0, text, reasoning, calls: calls.map(([n, tool]) => ({ id: `toolu_x_${n}`, tool })) });
  /** A recording of three calls over three turns plus a closing answer, with the conversation the model had. */
  function lived(turns: ReturnType<typeof turn>[], over: Partial<Recording> = {}): Recording {
    const calls = [[0, "help"], [1, "place"], [2, "craft"]] as const;
    return {
      label: "001", runDir: "runs/x/001", goal: { item: "c", qty: 1 }, world: "worlds/test.json", models: ["anthropic/claude-haiku-4-5-20251001"],
      prompt: "PROMPT-TEXT", runLogSha256: "a".repeat(64), scoreSha256: "b".repeat(64),
      settings: { temperature: null, effort: null, thinking: 31999 },
      calls: calls.map(([n, tool]) => ({ seq: n + 1, toolUseId: `toolu_x_${n}`, tool, args: { n }, ok: n !== 1, output: `{"out":${n}}`, durationMs: 4 + n })) as Recording["calls"],
      callCount: 3, finalAnswer: "FINAL-ANSWER", conversation: turns, ...over,
    };
  }
  const written = async (rec: Recording) => {
    const fake = new FakeNams({ zip: goodZip() });
    await obtainCandidate(args(fake, [rec]).a);
    return fake;
  };

  it("writes the prompt and each assistant message in order, a step per tool-calling turn with its reasoning, and each call under its own step", async () => {
    const rec = lived([turn("Start.", "Read the help first.", [0, "help"]), turn("", "Put the item down.", [1, "place"]), turn("Make it.", "Now craft.", [2, "craft"]), turn("FINAL-ANSWER", "")]);
    const fake = await written(rec);
    const events = fake.recorded.map((r) => (r.kind === "message" ? `${(r.detail as any).role}:${(r.detail as any).content}` : r.kind === "step" ? `step:${(r.detail as any).action}:${(r.detail as any).reasoning}` : r.kind === "toolCall" ? `call:${(r.detail as any).tool}` : r.kind));
    expect(events).toEqual([
      "conversation",
      "user:PROMPT-TEXT",
      "assistant:Start.", "step:help:Read the help first.", "call:help",
      "step:place:Put the item down.", "call:place",
      "assistant:Make it.", "step:craft:Now craft.", "call:craft",
      "assistant:FINAL-ANSWER",
    ]);
    const stepIds = fake.recorded.filter((r) => r.kind === "step").map((r) => (r.detail as any).id);
    expect(fake.recorded.filter((r) => r.kind === "toolCall").map((r) => (r.detail as any).stepId)).toEqual(stepIds);
  }, 30_000);

  it("writes tool names as the model saw them, refused calls as failures, and the trace's duration and the replayed output", async () => {
    const fake = await written(lived([turn("", "r", [0, "help"], [1, "place"]), turn("", "r", [2, "craft"]), turn("FINAL-ANSWER", "")]));
    const calls = fake.recorded.filter((r) => r.kind === "toolCall").map((r) => r.detail as any);
    expect(calls.map((c) => c.tool)).toEqual(["help", "place", "craft"]);
    expect(calls.map((c) => c.status)).toEqual(["success", "failure", "success"]);
    expect(calls.map((c) => c.durationMs)).toEqual([4, 5, 6]);
    expect(calls.map((c) => c.output)).toEqual(['{"out":0}', '{"out":1}', '{"out":2}']);
  }, 30_000);

  it("gives a turn with no reasoning its text, or a fixed line when it has neither, and never invents one", async () => {
    const fake = await written(lived([turn("Trying help.", "", [0, "help"]), turn("", "", [1, "place"]), turn("", "r3", [2, "craft"]), turn("FINAL-ANSWER", "")]));
    const reasons = fake.recorded.filter((r) => r.kind === "step").map((r) => (r.detail as any).reasoning);
    expect(reasons).toEqual(["Trying help.", "No reasoning was returned for this turn.", "r3"]);
    expect(JSON.stringify(fake.recorded)).not.toContain("Claude Code");
  }, 30_000);

  it("writes a step for a turn whose calls were not valid, with the tool it tried and no calls under it", async () => {
    const rec = lived([turn("", "Try a tool.", [9, "no-such-tool"]), turn("", "r", [0, "help"], [1, "place"], [2, "craft"]), turn("FINAL-ANSWER", "")]);
    const fake = await written(rec);
    const steps = fake.recorded.filter((r) => r.kind === "step").map((r) => (r.detail as any).action);
    expect(steps).toEqual(["no-such-tool", "help, place, craft"]);
    expect(fake.recorded.filter((r) => r.kind === "toolCall")).toHaveLength(3);
  }, 30_000);

  it("writes the closing answer once, as the last turn's text, and not again from the score", async () => {
    const fake = await written(lived([turn("", "r", [0, "help"], [1, "place"], [2, "craft"]), turn("FINAL-ANSWER", "")]));
    expect(JSON.stringify(fake.recorded).split("FINAL-ANSWER").length - 1).toBe(1);
  }, 30_000);

  it("names the model, its provider, its settings and whether reasoning came back, in the conversation's metadata", async () => {
    const all = await written(lived([turn("", "r1", [0, "help"], [1, "place"], [2, "craft"]), turn("FINAL-ANSWER", "")]));
    expect(all.recorded.find((r) => r.kind === "conversation")!.detail).toMatchObject({
      source: "critic-loop", run: "001", recordingFormat: "conversation", reasoning: "returned",
      model: "anthropic/claude-haiku-4-5-20251001", provider: "anthropic", settings: '{"temperature":null,"effort":null,"thinking":31999}',
    });
    const some = await written(lived([turn("", "r1", [0, "help"]), turn("", "", [1, "place"], [2, "craft"]), turn("FINAL-ANSWER", "")]));
    expect((some.recorded.find((r) => r.kind === "conversation")!.detail as any).reasoning).toBe("partial");
    const none = await written(lived([turn("", "", [0, "help"], [1, "place"], [2, "craft"]), turn("FINAL-ANSWER", "")]));
    expect((none.recorded.find((r) => r.kind === "conversation")!.detail as any).reasoning).toBe("none");
  }, 60_000);

  it("sends metadata whose every value is a string, as the service requires, for a recording with settings, with none, and with several models", async () => {
    const withSettings = await written(lived([turn("", "r", [0, "help"], [1, "place"], [2, "craft"]), turn("FINAL-ANSWER", "")]));
    const noSettings = await written(lived([turn("", "r", [0, "help"], [1, "place"], [2, "craft"]), turn("FINAL-ANSWER", "")], { settings: null }));
    const several = await written(lived([turn("", "r", [0, "help"], [1, "place"], [2, "craft"]), turn("FINAL-ANSWER", "")], { models: ["anthropic/claude-sonnet-5-5", "fireworks/gpt-oss-120b"] }));
    const none = await written(lived([], { conversation: null, models: [], settings: null }));
    for (const f of [withSettings, noSettings, several, none]) for (const v of Object.values(f.recorded.find((r) => r.kind === "conversation")!.detail as Record<string, unknown>)) expect(typeof v).toBe("string");
    expect((noSettings.recorded.find((r) => r.kind === "conversation")!.detail as any).settings).toBe("none recorded");
    const d = several.recorded.find((r) => r.kind === "conversation")!.detail as any;
    expect(d.model).toBe("anthropic/claude-sonnet-5-5+fireworks/gpt-oss-120b");
    expect(d.provider).toBe("anthropic+fireworks");
    expect((none.recorded.find((r) => r.kind === "conversation")!.detail as any).model).toBe("unknown");
  }, 60_000);

  it("holds nothing the harness concluded: no score, solver path, extra-call count or label of which calls were needed", async () => {
    const fake = await written(lived([turn("", "r", [0, "help"], [1, "place"], [2, "craft"]), turn("FINAL-ANSWER", "")]));
    const text = JSON.stringify(fake.recorded);
    for (const word of ["extraCalls", "minCalls", "callsToGoal", "reached", "best", "necessary", "wrong turn", "detour", "solver", "score"]) expect(text, word).not.toContain(word);
  }, 30_000);

  it("records a run with no conversation file as before, marked as having kept no reasoning, with no text naming Claude Code", async () => {
    const rec = lived([], { conversation: null });
    const fake = await written(rec);
    expect(fake.recorded.find((r) => r.kind === "conversation")!.detail).toMatchObject({ recordingFormat: "placeholder", reasoning: "not-kept" });
    const steps = fake.recorded.filter((r) => r.kind === "step").map((r) => r.detail as any);
    expect(steps.map((s) => s.action)).toEqual(["mcp__craft__help", "mcp__craft__place", "mcp__craft__craft"]);
    expect(steps.every((s) => s.reasoning === "No reasoning was recorded for this run.")).toBe(true);
    expect(fake.recorded.filter((r) => r.kind === "message").map((r) => (r.detail as any).role)).toEqual(["user", "assistant"]);
    expect(JSON.stringify(fake.recorded)).not.toContain("Claude Code");
  }, 30_000);
});

describe("the service's version in the candidate step (spec 007 FR-042)", () => {
  it("is read while generation runs, after it is requested and before its status is polled, and goes in the outcome", async () => {
    const fake = new FakeNams({ zip: goodZip(), version: { version: "1.3.0", released: "2026-10-12", commit: "27263eb", environment: "production" } });
    const r = await obtainCandidate(args(fake, [await run(MIRROR, { item: "c", qty: 1 }, "solve", "a")]).a);
    expect(r.info.service).toEqual({ name: "nams", version: "1.3.0", released: "2026-10-12", commit: "27263eb", environment: "production" });
    const order = fake.calls.map((c) => c.method);
    expect(order.indexOf("version")).toBeGreaterThan(order.indexOf("generateSkill"));
    expect(order.indexOf("version")).toBeLessThan(order.indexOf("getRun"));
  }, 30_000);

  it("is recorded as unknown with a fixed code when the call fails, and the step still finishes", async () => {
    const fake = new FakeNams({ zip: goodZip(), failOn: ["version"] });
    const r = await obtainCandidate(args(fake, [await run(MIRROR, { item: "c", qty: 1 }, "solve", "a")]).a);
    expect(r.info.service).toEqual({ name: "nams", unknown: "version_unavailable" });
    expect(JSON.stringify(r.info)).not.toContain(FAKE_SECRET);
    expect(r.pkg["SKILL.md"]).toBeDefined();
  }, 30_000);
});
