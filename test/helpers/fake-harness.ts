// A scripted distillation harness for tests (spec 009): it records what it was given, returns what it is told to, counts closes, and can be made to
// fail or to act at the start of each operation. It is a test double and is not registered as a product harness.
import { HarnessSession } from "../../src/distill/session.js";
import type { DistillRequest, DistillResult, Harness } from "../../src/distill/harness.js";
import type { Provenance, RunRecord, SkillSet } from "../../src/distill/schemas.js";

export const SKILL_SET: SkillSet = {
  skills: [{ name: "wooden-stool", description: "How to make a stool.", files: [{ path: "SKILL.md", content: "---\nname: wooden-stool\ndescription: How to make a stool.\n---\nbody\n" }] }],
};

export type Op = "open" | "record" | "distill" | "close";

export interface Script {
  /** What `distill` returns; default `SKILL_SET`. A function sees the request and the recorded runs it names. */
  result?: DistillResult | ((request: DistillRequest, runs: readonly RunRecord[]) => DistillResult);
  /** Runs at the start of an operation: a test can abort the signal, throw, or wait here. */
  onOp?: (op: Op, signal: AbortSignal) => void | Promise<void>;
}

export class ScriptedSession extends HarnessSession {
  readonly recordedRuns: RunRecord[] = [];
  readonly distillRequests: DistillRequest[] = [];
  closeCount = 0;

  constructor(private readonly script: Script) {
    super();
  }

  protected async onRecord(run: RunRecord, signal: AbortSignal): Promise<void> {
    await this.script.onOp?.("record", signal);
    this.recordedRuns.push(run);
  }

  protected async onDistill(request: DistillRequest, runs: readonly RunRecord[], signal: AbortSignal): Promise<DistillResult> {
    await this.script.onOp?.("distill", signal);
    this.distillRequests.push(request);
    const r = this.script.result ?? { ok: true as const, skills: SKILL_SET, stages: [] };
    return typeof r === "function" ? r(request, runs) : r;
  }

  protected async onClose(): Promise<void> {
    this.closeCount++;
    await this.script.onOp?.("close", new AbortController().signal);
  }

  describe(): Provenance {
    return {
      harness: { name: "scripted", processVersion: "1" },
      roles: {},
      prompts: {},
      service: null,
      retainedExternally: false,
      stages: [],
      spend: { costUsd: null, pricedStages: 0, unpricedStages: 0, tokens: { input: null, output: null, cacheRead: null, cacheCreation: null } },
    };
  }
}

export function scriptedHarness(script: Script = {}): { harness: Harness; sessions: ScriptedSession[] } {
  const sessions: ScriptedSession[] = [];
  const harness: Harness = {
    name: "scripted",
    async open(_experimentId, signal) {
      await script.onOp?.("open", signal);
      if (signal.aborted) throw new Error("scripted: aborted before open");
      const s = new ScriptedSession(script);
      sessions.push(s);
      return s;
    },
  };
  return { harness, sessions };
}
