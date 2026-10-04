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
  const { dir } = await runExperiment({ world, goal, runs: 1, maxTurns: 12, out, label, record: false, driver: fakePlayer({ mode, goal }) });
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
      const calls = fake.recorded.filter((c) => c.kind === "toolCall").filter((c) => (c.detail as any).tool.startsWith("mcp__craft__"));
      expect(calls.length).toBeGreaterThanOrEqual(rec.calls.length);
    }
    const messages = fake.recorded.filter((c) => c.kind === "message").map((m) => (m.detail as any).role);
    expect(messages.sort()).toEqual(["assistant", "assistant", "user", "user"]);
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

  it("writes a refused call with status failure, one step per distinct tool, and the trace's duration", async () => {
    const refused = await run(MIRROR, { item: "c", qty: 1 }, "refuse", "a");
    const fake = new FakeNams({ zip: goodZip() });
    await obtainCandidate(args(fake, [refused]).a);
    const calls = fake.recorded.filter((c) => c.kind === "toolCall").map((c) => c.detail as any);
    expect(calls.some((c) => c.status === "failure")).toBe(true);
    expect(calls.every((c) => typeof c.durationMs === "number" && c.durationMs >= 0)).toBe(true);
    const steps = fake.recorded.filter((c) => c.kind === "step").map((s) => (s.detail as any).tool);
    expect(new Set(steps).size).toBe(steps.length);
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
