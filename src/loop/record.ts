/**
 * The loop record: the folder `loops/<label>/` (contracts/loop-record.md). It is the one designated place for text
 * written by the critic and the reviser. Only the schema's fields are written, never a role's free-form text, and
 * nothing is written into a run folder. Round snapshots are named `reviewed-skill.txt`, which is no case variant of `SKILL.md` (the default macOS filesystem ignores case), so only an accepted loop's
 * `skill/` folder can be installed.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { LoopRefused } from "../harness/errors.js";
import { toRepoPath } from "../harness/paths.js";
import type { NamsStage } from "./candidate.js";
import type { LoopResult, Stage } from "./loop.js";
import { writePackage } from "./package.js";

export interface RecordOptions {
  /** The folder made by `createLoopFolder`. */
  dir: string;
  label: string;
  mode: "runs" | "candidate";
  /** The run folders the loop read. */
  runs: string[];
  /** The models the roles were asked to use. */
  models: { critic: string; reviser: string };
  /** Stages that happened before the loop (recording, generation, download), kept ahead of the roles' stages. */
  stages?: ReadonlyArray<Stage | NamsStage> | undefined;
  /** What the candidate step produced: run ids, the format, the service's thresholds. Runs mode only. */
  candidate?: unknown;
}

/** A run folder as recorded: repository-relative inside the repository, and only its name outside it (an absolute path holds a user name). */
const runPath = (path: string): string => {
  const p = toRepoPath(path);
  return isAbsolute(p) ? `(outside the repository)/${basename(path)}` : p;
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const pad = (n: number) => String(n).padStart(2, "0");

/** Make the loop's folder. It must not exist, and must not be inside a run folder the loop reads. */
export function createLoopFolder(out: string, label: string, runs: readonly string[]): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) throw new LoopRefused("the label may hold letters, digits, dots, dashes and underscores only");
  const dir = resolve(out, label);
  for (const run of runs) {
    const r = resolve(run);
    if (dir === r || dir.startsWith(r + sep)) throw new LoopRefused("the loop folder would be inside a run folder");
  }
  if (existsSync(dir)) throw new LoopRefused(`${toRepoPath(dir)} already exists; choose a new --label`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeLoopRecord(result: LoopResult, o: RecordOptions): void {
  const stages = [...(o.stages ?? []), ...result.stages];
  const isRole = (s: Stage | NamsStage): s is Stage => (s as Stage).model !== undefined;
  const resolved = (prefix: string) => [...new Set(stages.flatMap((s) => (s.stage.startsWith(prefix) && isRole(s) && s.model.resolved !== null ? [s.model.resolved] : [])))].sort();

  for (const round of result.rounds) {
    const dir = join(o.dir, "rounds", pad(round.n));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "reviewed-skill.txt"), round.pkg["SKILL.md"] ?? "");
    const provenance = round.pkg["references/provenance.md"];
    if (provenance !== undefined) writeFileSync(join(dir, "provenance.md"), provenance);
    writeFileSync(join(dir, "verdict.json"), json({ rubric: result.rubric, verdict: round.verdict }));
    if (round.revision) {
      writeFileSync(join(dir, "revision.json"), json({ changes: round.revision.changes, revisedSha256: round.revision.revisedSha256 }));
      writeFileSync(join(dir, "diff.patch"), round.revision.diff);
    }
  }

  if (result.outcome === "accept" && result.final) writePackage(join(o.dir, "skill"), result.final);

  writeFileSync(
    join(o.dir, "loop.json"),
    json({
      label: o.label,
      mode: o.mode,
      runs: o.runs.map(runPath),
      rubric: result.rubric,
      models: {
        critic: { requested: o.models.critic, resolved: resolved("critic") },
        reviser: { requested: o.models.reviser, resolved: resolved("reviser") },
      },
      ...(o.candidate === undefined ? {} : { candidate: o.candidate }),
      rounds: result.rounds.map((r) => ({
        n: r.n,
        skillSha256: r.skillSha256,
        overall: r.verdict.overall,
        ...(r.revision ? { revisedSha256: r.revision.revisedSha256 } : {}),
      })),
      outcome: result.outcome,
      reason: result.reason,
      failed: result.failed,
      stages,
      cancelled: result.cancelled,
    }),
  );
}
