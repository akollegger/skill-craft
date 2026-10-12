import { describe, expect, it } from "vitest";
import type { Bundle, BundleManifest, BundleResult } from "../../src/harness/bundle.js";
import type { Frame } from "../../src/sim/frames.js";
import type { TraceLine } from "../../src/trace/lines.js";
import { buildBundle } from "../../src/harness/export.js";
import { frameSchema, manifestSchema, resultSchema, traceLineSchema, type BundleData, type FrameData, type ManifestData, type ResultData, type TraceLineData } from "../../src/viz/contract.js";
import { finishedRun, stampScore } from "../helpers/finished-run.js";

// Compile-time: what the Node side writes must be assignable to what the page reads. A field the page requires
// and the writer lacks, or a field of a different type, fails `pnpm typecheck` here. The reverse is not required:
// zod marks an optional field `T | undefined`, which the writer's `?: T` does not allow under exactOptionalPropertyTypes.
type Writes<Node, Page> = [Node] extends [Page] ? true : never;
const frame: Writes<Frame, FrameData> = true;
const manifest: Writes<BundleManifest, ManifestData> = true;
const result: Writes<BundleResult, ResultData> = true;
const trace: Writes<TraceLine, TraceLineData> = true;
const bundle: Writes<Bundle, BundleData> = true;

describe("the page's bundle schemas", () => {
  it("accept what the Node side writes (checked when this file compiles)", () => {
    expect([frame, manifest, result, trace, bundle]).toEqual([true, true, true, true, true]);
  });

  it("accept a real bundle in full, including a prior fit and a skill", async () => {
    const { runDir } = await finishedRun();
    stampScore(runDir, { priorFit: "faithful", promptNote: "Note.", skill: { name: "s", sha256: "x", invoked: true, loadedAfterCalls: 2 } });
    const b = buildBundle(runDir);
    expect(manifestSchema.parse(b.manifest)).toEqual(b.manifest);
    expect(resultSchema.parse(JSON.parse(JSON.stringify(b.result)))).toEqual(JSON.parse(JSON.stringify(b.result)));
    for (const f of b.frames) expect(frameSchema.parse(f)).toEqual(f);
    for (const t of b.trace) expect(traceLineSchema.parse(t)).toEqual(t);
    expect(b.trace.length).toBeGreaterThan(0);
  });
});
