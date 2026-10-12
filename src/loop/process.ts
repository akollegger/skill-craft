/**
 * The version of the procedure that makes a skill, and the facts about the code that ran it (ADR-003 §2.6, amended
 * 2026-10-12). The version is bumped when what is recorded, what the distiller is asked, the rubric or the roles'
 * instructions, the number of rounds or the roles' pinned settings change, and not for a change that alters no behaviour.
 * `design/notes/skill-process.md` says what each version means; a test fails when this constant has no entry there.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { REPO } from "../harness/paths.js";

export const PROCESS_VERSION = "1";

/** How the recording step writes a run to the memory service: `placeholder` steps (one per distinct tool), until per-turn reasoning exists. */
export const RECORDING_FORMAT = "placeholder";

export interface ProcessInfo {
  version: string;
  /** The commit the code was at, or null when git could not say. */
  commit: string | null;
  /** Whether the tree had changes (null when unknown), so a skill can say its code is not exactly the commit. */
  dirty: boolean | null;
  /** A hash of the changes (the diff against the commit and the list of changed files), when there were any. */
  changesSha256: string | null;
}

export type GitRunner = (args: readonly string[]) => string;

const runGit: GitRunner = (args) => execFileSync("git", [...args], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });

/** What is known of the code running now. Git is injected so a test does not run it; a failure gives nulls and never stops a loop. */
export function currentProcessInfo(git: GitRunner = runGit): ProcessInfo {
  let commit: string | null = null;
  let dirty: boolean | null = null;
  let changesSha256: string | null = null;
  try {
    commit = git(["rev-parse", "HEAD"]).trim() || null;
    const status = git(["status", "--porcelain"]);
    dirty = status.trim() !== "";
    if (dirty) changesSha256 = createHash("sha256").update(`${git(["diff", "HEAD"])}\n${status}`).digest("hex");
  } catch {
    // git could not answer; whatever was learned before the failure stays
  }
  return { version: PROCESS_VERSION, commit, dirty, changesSha256 };
}

/** Whether the changelog has an entry for a version: a heading `## v<version>`, matched whole. */
export function hasChangelogEntry(version: string, changelog: string): boolean {
  return new RegExp(`^## v${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(changelog);
}
