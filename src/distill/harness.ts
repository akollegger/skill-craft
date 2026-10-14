// The distillation harness interface (ADR-008, spec 009): a harness is a named process that opens a session over one experiment's store, takes in
// finished runs, and on demand produces a set of skills from the runs the caller names. What it does between is its own: a graph, model calls, review
// rounds. It never chooses which runs to learn from.
import { HarnessRefused } from "../harness/errors.js";
import type { Provenance, RunRecord, SkillSet, Stage } from "./schemas.js";

export type { Provenance, RunRecord, SkillSet, Stage } from "./schemas.js";

/** Why a harness returned no skill set. A refusal is a value, a recorded result, and ends no experiment by itself. */
export const REFUSAL_CODES = ["no_skill", "spend_limit", "cancelled", "failed"] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export interface DistillRequest {
  /** The recorded runs to learn from, named by the caller; never empty. */
  runIds: string[];
  /** A spend limit for the call. A harness that cannot enforce one may ignore it. */
  maxUsd?: number | undefined;
  /** A hint of how many skills are wanted. A harness may ignore it. */
  maxSkills?: number | undefined;
}

export interface Refusal {
  ok: false;
  code: RefusalCode;
  /** What was spent before the refusal, or null when nothing was priced or nothing ran. */
  spendUsd: number | null;
  stages: Stage[];
  /** Why, as fixed text of the form `code: message`; never anything a model wrote. Optional: the code is the contract. */
  reason?: string | undefined;
}

export type DistillResult = { ok: true; skills: SkillSet; stages: Stage[] } | Refusal;

export interface Session {
  /** Take in one finished run. Idempotent by the run's id; there is no streaming of steps. */
  record(run: RunRecord, signal: AbortSignal): Promise<void>;
  /** Produce skills from the named runs; a skill set or a refusal, never an empty set. May be called again with other ids. */
  distill(request: DistillRequest, signal: AbortSignal): Promise<DistillResult>;
  /** What the harness has done so far and how: its provenance. */
  describe(): Provenance;
  /** Release everything the session created, after any outcome including cancellation. Safe to call twice. */
  close(): Promise<void>;
}

export interface Harness {
  readonly name: string;
  /** Open a session over one experiment's isolated store. A harness that writes to an account needs its explicit option here. */
  open(experimentId: string, signal: AbortSignal): Promise<Session>;
}

/** Refuse a request before any work: no ids, or an id that was not recorded. Fixed text; the id is a run label the caller chose. */
export function checkRequest(request: DistillRequest, recorded: ReadonlySet<string>): void {
  if (request.runIds.length === 0) throw new HarnessRefused("a distill request must name at least one recorded run");
  const unknown = request.runIds.find((id) => !recorded.has(id));
  if (unknown !== undefined) throw new HarnessRefused(`run '${unknown}' was not recorded in this session`);
}
