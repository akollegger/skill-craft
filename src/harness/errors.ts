import { WorldError } from "../sim/errors.js";
import { RunLogInUseError } from "../sim/runlog.js";

/**
 * A failure that ends a run or refuses an experiment. The message is fixed text: the wrapped `cause` is kept
 * in memory for debugging but is never part of the message, so nothing in it can reach a file on disk.
 */
export class HarnessError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = code;
    this.code = code;
  }
}

export class RunFolderExists extends HarnessError {
  constructor(dir: string) {
    super("RunFolderExists", `${dir} already exists; choose a new --label`);
  }
}

export class UnknownGoalItem extends HarnessError {
  constructor(item: string) {
    super("UnknownGoalItem", `goal wants unknown item '${item}'`);
  }
}

export class ReplayFailed extends HarnessError {
  constructor(detail: string, cause?: unknown) {
    super("ReplayFailed", `run log does not replay: ${detail}`, { cause });
  }
}

export class DriverFailed extends HarnessError {
  constructor(cause?: unknown) {
    super("DriverFailed", "the player failed", { cause });
  }
}

export class RunTimedOut extends HarnessError {
  constructor(ms: number) {
    super("RunTimedOut", `no result after ${+(ms / 60_000).toFixed(2)} min`);
  }
}

/** An export that cannot go ahead: the run is unfinished, the destination is taken, or the world is gone. */
export class ExportRefused extends HarnessError {
  /** Which refusal this is, so a caller can tell them apart without reading the message. */
  readonly refusal: "unfinished" | "world" | "destination" | "other";

  constructor(why: string, refusal: "unfinished" | "world" | "destination" | "other" = "other") {
    super("ExportRefused", `cannot export: ${why}`);
    this.refusal = refusal;
  }
}

/** A skill that cannot be installed: no SKILL.md, or no usable name in it. */
export class SkillNotFound extends HarnessError {
  constructor(why: string) {
    super("SkillNotFound", `cannot use the skill: ${why}`);
  }
}

/** Anything outside the player that stops a run, such as a file that cannot be written. */
export class RunFailed extends HarnessError {
  constructor(cause?: unknown) {
    super("RunFailed", "the run could not be completed", { cause });
  }
}

export class RunCancelled extends HarnessError {
  constructor() {
    super("RunCancelled", "the run was cancelled");
  }
}

/** The text recorded on a failed run: `code: fixed message`. An error that is not ours is a driver failure. */
export function reasonOf(e: unknown): string {
  const h = e instanceof HarnessError ? e : new DriverFailed(e);
  return `${h.code}: ${h.message}`;
}

/** Mistakes the operator can fix, as opposed to a run that failed. Matched by class, never by message text. */
export function isUserError(e: unknown): boolean {
  return e instanceof LoopRefused || e instanceof WorkspaceRefused || e instanceof RunFolderExists || e instanceof ExportRefused || e instanceof SkillNotFound || e instanceof ReportRefused || e instanceof UnknownGoalItem || e instanceof WorldError || e instanceof RunLogInUseError;
}

/** A results report that cannot be trusted or built: a missing summary, a stray folder, a mismatched skill or note. */
export class ReportRefused extends HarnessError {
  constructor(why: string) {
    super("ReportRefused", `cannot report: ${why}`);
  }
}

// The critic loop (spec 005). Every message is fixed text: nothing a role wrote is ever part of one.

/** A loop that cannot start: bad inputs, a size limit, a missing option. The operator can fix it. */
export class LoopRefused extends HarnessError {
  constructor(why: string) {
    super("LoopRefused", `loop refused: ${why}`);
  }
}

/** The distiller gave no usable skill, or the step that fetches one failed. */
export class CandidateFailed extends HarnessError {
  constructor(why: string, cause?: unknown) {
    super("CandidateFailed", `no candidate skill: ${why}`, { cause });
  }
}

/** A request to touch a NAMS workspace the step did not create. */
export class WorkspaceRefused extends HarnessError {
  constructor(why: string) {
    super("WorkspaceRefused", `workspace refused: ${why}`);
  }
}

/** The critic's answer did not match the verdict schema. The cause (the schema's issues) stays in memory. */
export class VerdictInvalid extends HarnessError {
  constructor(cause?: unknown) {
    super("VerdictInvalid", "the critic's answer does not match the verdict schema", { cause });
  }
}

/** The reviser's answer was not a usable revision. */
export class RevisionInvalid extends HarnessError {
  constructor(cause?: unknown) {
    super("RevisionInvalid", "the reviser's answer is not a valid revision", { cause });
  }
}

/** A role call failed. `reason` is already `code: fixed message` from the role driver. */
export class RoleFailed extends HarnessError {
  constructor(reason: string) {
    super("RoleFailed", `a role call failed: ${reason}`);
  }
}

export class LoopCancelled extends HarnessError {
  constructor() {
    super("LoopCancelled", "the loop was cancelled");
  }
}
