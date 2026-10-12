import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { REPO } from "../../src/harness/paths.js";

/** Live checks spend real model usage, so each runs only with LIVE_SDK=1. */
export const live = process.env["LIVE_SDK"] === "1";

/**
 * True when a provider's key variable is set. A live check that needs a provider whose key is absent is skipped,
 * not failed. Only whether the variable is set is read; its value is never looked at, kept or printed.
 */
export const hasKey = (name: string): boolean => (process.env[name] ?? "") !== "";

/** `describe.skipIf(skipUnlessKey("X"))`: skip a block when the live flag is off or the key is missing. */
export const skipUnlessKey = (name: string): boolean => !live || !hasKey(name);

/** Write a check's record under `design/notes/` (what ran, what it cost, what happened). Returns the path. */
export function writeCheckRecord(file: string, text: string): string {
  const path = join(REPO, "design", "notes", file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
  return path;
}

/** Run one of the repository's scripts as a child process, as an operator would (keys come from the environment). */
export function scriptArgs(script: string, args: string[]): string[] {
  return ["--import", "tsx", script, ...args];
}

/** Craft server processes whose parent is gone (reparented to init): the ones a cancelled run must not leave behind. */
export function orphanServers(): string[] {
  const out = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,command="], { encoding: "utf8" });
  return out
    .split("\n")
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null && m[2] === "1" && (m[3] as string).includes("src/mcp/server.ts"))
    .map((m) => `${m[1]} ${m[3]}`);
}
