import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fromRepoPath, REPO, toRepoPath } from "../src/harness/paths.js";

describe("toRepoPath", () => {
  it("records a path inside the repository relative to it", () => {
    expect(toRepoPath(join(REPO, "worlds/generated/forge-7.json"))).toBe("worlds/generated/forge-7.json");
    expect(toRepoPath(join(REPO, "node_modules/.bin/tsx"))).toBe("node_modules/.bin/tsx");
  });

  it("leaves a path outside the repository as it is, since there is nothing portable to say about it", () => {
    expect(toRepoPath("/var/folders/x/runs/t/001/run.jsonl")).toBe("/var/folders/x/runs/t/001/run.jsonl");
    expect(toRepoPath(resolve(REPO, "..", "elsewhere/world.json"))).toBe(resolve(REPO, "..", "elsewhere/world.json"));
  });

  it("does not turn the repository itself, or a sibling that shares its name as a prefix, into a relative path", () => {
    expect(toRepoPath(REPO)).toBe(REPO);
    expect(toRepoPath(`${REPO}-other/world.json`)).toBe(`${REPO}-other/world.json`);
  });

  it("gives a path with no user name in it for anything inside the repository", () => {
    expect(toRepoPath(join(REPO, "runs/a/001/run.jsonl"))).not.toContain(homedir());
  });
});

describe("fromRepoPath", () => {
  it("resolves a recorded relative path against the repository, whatever the working directory", () => {
    expect(fromRepoPath("worlds/generated/forge-7.json")).toBe(join(REPO, "worlds/generated/forge-7.json"));
  });

  it("leaves an absolute path alone, so run folders written before this still export", () => {
    expect(fromRepoPath("/var/folders/x/world.json")).toBe("/var/folders/x/world.json");
  });

  it("undoes toRepoPath", () => {
    for (const p of [join(REPO, "src/mcp/server.ts"), "/tmp/outside/world.json"]) expect(fromRepoPath(toRepoPath(p))).toBe(p);
  });
});
