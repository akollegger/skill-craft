import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgentCli } from "../src/harness/cli.js";
import type { AgentDriver, DriverSink } from "../src/harness/driver.js";
import { runExperiment } from "../src/harness/run.js";
import { readTrace } from "../src/trace/lines.js";
import { fakePlayer, type FakePersonal } from "./helpers/fake-player.js";

// Invented values, distinctive enough that finding one anywhere is a leak.
const PERSONAL: FakePersonal = {
  email: "zed.quill@invented.example",
  userId: "user_INVENTED_4471",
  accountIds: ["acct_INVENTED_aa11", "acct_INVENTED_bb22"],
  organizationId: "org_INVENTED_9090",
  sessionId: "sess-INVENTED-7777",
};
const CHATTER = "SECRET-CHATTER-reasoning-0042";
const SECRETS = [PERSONAL.email, PERSONAL.userId, ...PERSONAL.accountIds, PERSONAL.organizationId, PERSONAL.sessionId, CHATTER];

const GOAL = { item: "c", qty: 1 };
const WORLD = "test/fixtures/valid/mirror-pair.json";

/** Every file under a directory, relative path to text. */
function filesUnder(root: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(join(root, rel))) {
    const path = join(rel, name);
    if (statSync(join(root, path)).isDirectory()) Object.assign(out, filesUnder(root, path));
    else out[path] = readFileSync(join(root, path), "utf8");
  }
  return out;
}

/** Wrap a driver to keep everything it sent through the sink, as the positive control. */
function spied(inner: AgentDriver, seen: string[]): AgentDriver {
  return (o, sink) => {
    const tee: DriverSink = {
      onMessage: (m) => { seen.push(JSON.stringify(m)); sink.onMessage(m); },
      onToolStart: (c) => { seen.push(JSON.stringify(c)); sink.onToolStart(c); },
      onToolEnd: (c) => { seen.push(JSON.stringify(c)); sink.onToolEnd(c); },
    };
    return inner(o, tee);
  };
}

describe("nothing personal and nothing the agent said reaches a file", () => {
  it("keeps identifiers, reasoning and chatter out of every file in the run and label folders", async () => {
    const seen: string[] = [];
    let n = 0;
    // A solving run, a refusing run and a crashed run (whose error message carries the email).
    const driver: AgentDriver = (o, s) => {
      const mode = (["solve", "refuse", "crash"] as const)[n++ % 3] as "solve" | "refuse" | "crash";
      return spied(fakePlayer({ mode, goal: GOAL, personal: PERSONAL, agentText: CHATTER, models: ["fake-a"] }), seen)(o, s);
    };
    const out = mkdtempSync(join(tmpdir(), "skill-craft-privacy-"));
    await runExperiment({ world: WORLD, goal: GOAL, runs: 3, maxTurns: 12, out, label: "p", record: false, driver });

    // Positive control: the player really did send every secret, so finding none on disk means something.
    const sent = seen.join("\n");
    for (const secret of SECRETS) expect(sent, `control: ${secret}`).toContain(secret);

    const files = filesUnder(out);
    expect(Object.keys(files).length).toBeGreaterThan(10);
    for (const [path, text] of Object.entries(files)) for (const secret of SECRETS) expect(text, `${path} holds ${secret}`).not.toContain(secret);
  });

  it("never writes the operator's PATH or environment into a run folder", async () => {
    const out = mkdtempSync(join(tmpdir(), "skill-craft-privacy-"));
    await runExperiment({ world: WORLD, goal: GOAL, runs: 1, maxTurns: 12, out, label: "p", record: false, driver: fakePlayer({ mode: "solve", goal: GOAL }) });
    const path = process.env["PATH"] as string;
    expect(path.length).toBeGreaterThan(10);
    for (const [name, text] of Object.entries(filesUnder(out))) expect(text, name).not.toContain(path);
  });

  it("writes only the files the design names, and no copy of the player's messages", async () => {
    const out = mkdtempSync(join(tmpdir(), "skill-craft-privacy-"));
    await runExperiment({ world: WORLD, goal: GOAL, runs: 1, maxTurns: 12, out, label: "p", record: false, driver: fakePlayer({ mode: "solve", goal: GOAL, personal: PERSONAL, agentText: CHATTER }) });
    expect(Object.keys(filesUnder(out)).sort()).toEqual(
      ["p/001/mcp.json", "p/001/prompt.txt", "p/001/run.jsonl", "p/001/score.json", "p/001/trace.jsonl", "p/summary.json"].sort(),
    );
  });

  it("writes only allowlisted keys in trace lines", async () => {
    const out = mkdtempSync(join(tmpdir(), "skill-craft-privacy-"));
    await runExperiment({ world: WORLD, goal: GOAL, runs: 1, maxTurns: 12, out, label: "p", record: false, driver: fakePlayer({ mode: "solve", goal: GOAL, personal: PERSONAL, agentText: CHATTER }) });
    const request = ["seq", "kind", "requestId", "model", "turn", "startMs", "endMs", "ttftMs", "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens"].sort();
    const tool = ["seq", "kind", "toolUseId", "tool", "args", "startMs", "endMs"].sort();
    const lines = readTrace(join(out, "p", "001", "trace.jsonl"));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(Object.keys(l).sort()).toEqual(l.kind === "request" ? request : tool);
  });

  it("keeps identifiers out of the error reasons, even when the player's error message carries them", async () => {
    const out = mkdtempSync(join(tmpdir(), "skill-craft-privacy-"));
    const r = await runExperiment({ world: WORLD, goal: GOAL, runs: 1, maxTurns: 12, out, label: "p", record: false, driver: fakePlayer({ mode: "crash", personal: PERSONAL }) });
    expect(r.reports[0]?.reason).toBe("DriverFailed: the player failed");
    for (const secret of SECRETS) expect(JSON.stringify(r.reports[0])).not.toContain(secret);
  });

  it("prints nothing personal to the terminal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skill-craft-privacy-"));
    const out: string[] = [];
    const err: string[] = [];
    let n = 0;
    const driver: AgentDriver = (o, s) => fakePlayer({ mode: (["solve", "crash"] as const)[n++ % 2] as "solve" | "crash", goal: GOAL, personal: PERSONAL, agentText: CHATTER })(o, s);
    await runAgentCli(["--world", WORLD, "--out", dir, "--goal", "c", "--runs", "2", "--label", "t"], { driver, out: (s) => out.push(s), err: (s) => err.push(s) });
    const text = [...out, ...err].join("\n");
    expect(text.length).toBeGreaterThan(50);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });

  it("keeps score.json and summary.json to the keys the design names", async () => {
    const out = mkdtempSync(join(tmpdir(), "skill-craft-privacy-"));
    await runExperiment({ world: WORLD, goal: GOAL, runs: 2, maxTurns: 12, out, label: "p", record: false, driver: fakePlayer({ mode: "crash", personal: PERSONAL }) });
    const score = JSON.parse(readFileSync(join(out, "p", "001", "score.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(score).sort()).toEqual(["costUsd", "ended", "measured", "model", "reason", "score", "text", "turns"].sort());
    const summary = JSON.parse(readFileSync(join(out, "p", "summary.json"), "utf8")) as { runs: Record<string, unknown>[] } & Record<string, unknown>;
    expect(Object.keys(summary).sort()).toEqual(["aggregate", "cancelled", "goal", "maxTurns", "mixedModels", "models", "record", "runs", "timeoutMs", "world"].sort());
    for (const run of summary.runs) expect(run).not.toHaveProperty("text"); // the agent's final message stays in score.json only
  });
});
