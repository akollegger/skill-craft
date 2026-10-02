import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Bundle, BundleResult } from "../harness/bundle.js";
import type { Attributes } from "./contract.js";

/** How a run ended, in words a person uses. A run that held the goal reached it, whatever else happened. */
export function outcomeOf(result: Pick<BundleResult, "ended"> & { score: Pick<BundleResult["score"], "reached"> }): string {
  if (result.score.reached) return "reached";
  if (result.ended === "budget") return "out of turns";
  if (result.ended === "error") return "error";
  return "gave up";
}

const put = (a: Attributes, name: string, value: string | number | boolean | null | undefined): void => {
  if (value !== undefined && value !== null) a[name] = value;
};

/**
 * A run's flat attributes from its replay bundle, built from a run folder or read from an exported bundle: both
 * give the same bundle, so both give the same attributes. A value the run lacks is left out, never defaulted.
 */
export function attributesOf(bundle: Bundle): Attributes {
  const { manifest, result } = bundle;
  const a: Attributes = {};
  // The manifest's label is `<experiment> / <number>`; a label that is not in that form is kept whole.
  const split = manifest.label.lastIndexOf(" / ");
  put(a, "label", split < 0 ? manifest.label : manifest.label.slice(0, split));
  put(a, "run", split < 0 ? undefined : manifest.label.slice(split + 3));
  put(a, "world", manifest.world.name);
  put(a, "rows", manifest.world.rows);
  put(a, "cols", manifest.world.cols);
  put(a, "goalItem", manifest.goal.item);
  put(a, "goalQty", manifest.goal.qty);

  put(a, "modelRequested", manifest.model.requested);
  if (manifest.model.resolved.length > 0) put(a, "modelRan", manifest.model.resolved.join(", "));
  put(a, "priorFit", manifest.priorFit);
  put(a, "promptNote", manifest.promptNote);
  if (manifest.skill) {
    put(a, "skill", manifest.skill.name);
    put(a, "skillLoaded", manifest.skill.loaded);
    put(a, "skillLoadedAfter", manifest.skill.loadedAfter);
  }

  const s = result.score;
  put(a, "outcome", outcomeOf(result));
  put(a, "actionCalls", s.actionCalls);
  put(a, "bestCalls", s.best?.minCalls);
  put(a, "extraCalls", s.extraCalls);
  put(a, "crafts", s.craftsMade);
  put(a, "failedCrafts", s.failedCrafts);
  put(a, "refusals", Object.values(s.refusals).reduce((x, y) => x + y, 0));

  put(a, "traceMatched", result.measured.trace === "matched");
  const t = result.measured.total;
  if (t) {
    put(a, "durationMs", t.durationMs);
    put(a, "inputTokens", t.inputTokens);
    put(a, "outputTokens", t.outputTokens);
    put(a, "cacheReadTokens", t.cacheReadTokens);
    put(a, "cacheCreationTokens", t.cacheCreationTokens);
    put(a, "costUsd", t.costUsd);
  }
  return a;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * What can be said of a run folder that cannot be opened: its label and number from the folder names, and
 * whatever a readable `score.json` still states. An unfinished run has no outcome to read, so it is "unfinished".
 */
export function partialAttributes(runDir: string, opts: { unfinished?: boolean }): Attributes {
  const a: Attributes = { label: basename(dirname(runDir)), run: basename(runDir) };
  if (opts.unfinished) {
    a["outcome"] = "unfinished";
    return a;
  }
  const path = join(runDir, "score.json");
  if (!existsSync(path)) return a;
  let saved: unknown;
  try {
    saved = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return a;
  }
  if (!isObj(saved)) return a;
  const score = isObj(saved["score"]) ? saved["score"] : undefined;
  const goal = score && isObj(score["goal"]) ? score["goal"] : undefined;
  if (goal && typeof goal["item"] === "string") a["goalItem"] = goal["item"];
  if (goal && typeof goal["qty"] === "number") a["goalQty"] = goal["qty"];
  if (typeof saved["priorFit"] === "string") a["priorFit"] = saved["priorFit"];
  if (typeof saved["promptNote"] === "string") a["promptNote"] = saved["promptNote"];
  const model = isObj(saved["model"]) ? saved["model"] : undefined;
  if (model && typeof model["requested"] === "string") a["modelRequested"] = model["requested"];
  if (model && Array.isArray(model["resolved"]) && model["resolved"].every((m) => typeof m === "string") && model["resolved"].length > 0) a["modelRan"] = model["resolved"].join(", ");
  if (score && typeof score["reached"] === "boolean" && typeof saved["ended"] === "string") a["outcome"] = outcomeOf({ ended: saved["ended"] as BundleResult["ended"], score: { reached: score["reached"] } });
  return a;
}
