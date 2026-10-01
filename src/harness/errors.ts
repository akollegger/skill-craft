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
  constructor(why: string) {
    super("ExportRefused", `cannot export: ${why}`);
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
  return e instanceof RunFolderExists || e instanceof ExportRefused || e instanceof SkillNotFound || e instanceof UnknownGoalItem || e instanceof WorldError || e instanceof RunLogInUseError;
}
