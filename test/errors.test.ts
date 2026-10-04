import { describe, expect, it } from "vitest";
import { DriverFailed, ExportRefused, HarnessError, isUserError, ReplayFailed, RunCancelled, RunFailed, RunFolderExists, RunTimedOut, UnknownGoalItem, reasonOf } from "../src/harness/errors.js";
import { CandidateFailed, LoopCancelled, LoopRefused, RevisionInvalid, RoleFailed, VerdictInvalid, WorkspaceRefused } from "../src/harness/errors.js";
import { WorldError } from "../src/sim/errors.js";
import { RunLogInUseError } from "../src/sim/runlog.js";

describe("HarnessError", () => {
  const all: [string, HarnessError][] = [
    ["RunFolderExists", new RunFolderExists("runs/x/001")],
    ["UnknownGoalItem", new UnknownGoalItem("ghost")],
    ["ReplayFailed", new ReplayFailed("run log entry 3 (craft) does not replay")],
    ["DriverFailed", new DriverFailed(new Error("secret detail"))],
    ["RunTimedOut", new RunTimedOut(30 * 60_000)],
    ["RunCancelled", new RunCancelled()],
    ["RunFailed", new RunFailed(new Error("disk full"))],
    ["ExportRefused", new ExportRefused("the destination already exists")],
  ];

  it.each(all)("%s has a stable code and a message", (code, e) => {
    expect(e).toBeInstanceOf(HarnessError);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(code);
    expect(e.message.length).toBeGreaterThan(5);
  });

  it("keeps the wrapped error as the cause, but not in the message", () => {
    const cause = new Error("/Users/someone/secret");
    const e = new DriverFailed(cause);
    expect(e.cause).toBe(cause);
    expect(e.message).not.toContain("secret");
  });

  it("wraps a non-Error rejection", () => {
    expect(new DriverFailed("a string").cause).toBe("a string");
  });

  it("states the limit in minutes for a timeout", () => {
    expect(new RunTimedOut(90 * 60_000).message).toContain("90 min");
  });

  it("names the folder, the item and the log line in user-facing messages", () => {
    expect(new RunFolderExists("runs/x/001").message).toBe("runs/x/001 already exists; choose a new --label");
    expect(new UnknownGoalItem("ghost").message).toBe("goal wants unknown item 'ghost'");
  });
});

describe("reasonOf", () => {
  it("is the code and the fixed message, never the cause's text", () => {
    expect(reasonOf(new DriverFailed(new Error("/Users/someone/secret")))).toBe("DriverFailed: the player failed");
  });

  it("wraps an unknown error as a driver failure without its text", () => {
    expect(reasonOf(new Error("/Users/someone/secret"))).toBe("DriverFailed: the player failed");
    expect(reasonOf("oops")).toBe("DriverFailed: the player failed");
  });
});

describe("isUserError", () => {
  it("is true for mistakes the operator can fix", () => {
    for (const e of [new RunFolderExists("d"), new ExportRefused("x"), new UnknownGoalItem("x"), new WorldError(["bad world"]), new RunLogInUseError("p")]) expect(isUserError(e)).toBe(true);
  });

  it("is false for failures of a run and for unknown errors", () => {
    for (const e of [new DriverFailed(new Error("x")), new RunTimedOut(1000), new ReplayFailed("d"), new Error("x"), "x"]) expect(isUserError(e)).toBe(false);
  });
});

describe("the critic loop's errors", () => {
  const loop: [string, HarnessError][] = [
    ["CandidateFailed", new CandidateFailed("the distiller produced no skill")],
    ["VerdictInvalid", new VerdictInvalid(new Error("zod issue with agent text"))],
    ["RevisionInvalid", new RevisionInvalid(new Error("agent text in cause"))],
    ["RoleFailed", new RoleFailed("DriverFailed: the player reported rate_limit")],
    ["WorkspaceRefused", new WorkspaceRefused("not created by this step")],
    ["LoopCancelled", new LoopCancelled()],
    ["LoopRefused", new LoopRefused("the recordings exceed 150,000 characters")],
  ];

  it.each(loop)("%s has its code, a fixed message and the cause kept apart", (code, e) => {
    expect(e).toBeInstanceOf(HarnessError);
    expect(e.code).toBe(code);
    expect(e.message.length).toBeGreaterThan(5);
    expect(e.message).not.toMatch(/agent text/);
    expect(reasonOf(e)).toBe(`${code}: ${e.message}`);
  });

  it("keeps the role's own reason text out of anything but the fixed reason it was given", () => {
    const e = new RoleFailed("DriverFailed: the player reported rate_limit");
    expect(e.message).toBe("a role call failed: DriverFailed: the player reported rate_limit");
  });

  it("treats a refusal and a refused workspace as user errors, and the rest as failures", () => {
    expect(isUserError(new LoopRefused("x"))).toBe(true);
    expect(isUserError(new WorkspaceRefused("x"))).toBe(true);
    for (const e of [new CandidateFailed("x"), new VerdictInvalid(), new RevisionInvalid(), new RoleFailed("x"), new LoopCancelled()]) expect(isUserError(e)).toBe(false);
  });
});
