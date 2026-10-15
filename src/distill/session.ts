// The part of a session every harness shares (spec 009, FR-002 to FR-006): recording by id and once, refusing a request before any work, never
// returning an empty skill set, and closing once whatever happened. A harness extends it with what it does on record, distill and close.
import { HarnessRefused } from "../harness/errors.js";
import { checkRequest, type DistillRequest, type DistillResult, type Session } from "./harness.js";
import { runRecordSchema, skillSetSchema, type Provenance, type RunRecord } from "./schemas.js";

export abstract class HarnessSession implements Session {
  private readonly recorded = new Map<string, RunRecord>();
  private closed = false;
  private closing: Promise<void> | undefined;

  /** What a harness does with a run it has not seen: record it to its store. */
  protected abstract onRecord(run: RunRecord, signal: AbortSignal): Promise<void>;
  /** Produce skills from the runs the request names (already checked, in the order named). A refusal is returned, not thrown. */
  protected abstract onDistill(request: DistillRequest, runs: readonly RunRecord[], signal: AbortSignal): Promise<DistillResult>;
  /** Release what the session created. Called once. */
  protected abstract onClose(): Promise<void>;
  abstract describe(): Provenance;

  async record(run: RunRecord, signal: AbortSignal): Promise<void> {
    if (this.closed) throw new HarnessRefused("the session is closed");
    if (signal.aborted) throw new HarnessRefused("cancelled before the run was recorded");
    // The schema's own message is not shown: it could quote a field of the record.
    if (!runRecordSchema.safeParse(run).success) throw new HarnessRefused("what was given is not a run record");
    if (this.recorded.has(run.id)) return;
    await this.onRecord(run, signal);
    this.recorded.set(run.id, run);
  }

  async distill(request: DistillRequest, signal: AbortSignal): Promise<DistillResult> {
    if (this.closed) throw new HarnessRefused("the session is closed");
    checkRequest(request, new Set(this.recorded.keys()));
    // Nothing has run, so nothing has been spent.
    if (signal.aborted) return { ok: false, code: "cancelled", spendUsd: null, stages: [] };
    const runs = request.runIds.map((id) => this.recorded.get(id) as RunRecord);
    const result = await this.onDistill(request, runs, signal);
    if (result.ok && !skillSetSchema.safeParse(result.skills).success) return { ok: false, code: "failed", spendUsd: null, stages: result.stages };
    return result;
  }

  close(): Promise<void> {
    this.closed = true;
    this.closing ??= this.onClose();
    return this.closing;
  }
}
