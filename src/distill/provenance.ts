// The record of how a skill set was made (ADR-008, spec 009): `harness.json`, written by the command from a harness's `describe()` and the outcome, and
// read by the report. A loop record made before the harness interface (`loop.json`) is read as the same record, made by the `nams-reviewed` harness.
// The record holds hashes, settings, identifiers and fixed codes, never recorded text or a model's free text.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LoopRefused, ReportRefused } from "../harness/errors.js";
import { skillSha256 } from "../loop/package.js";
import type { Recording } from "../loop/transcript.js";
import { recordingFormatOf } from "../loop/process.js";
import type { DistillResult } from "./harness.js";
import { distillationRecordSchema, type DistillationRecord, type Provenance } from "./schemas.js";

/** The record for a finished distillation. `recordings` are the runs it was given: their hashes are what the record names them by. */
export function buildDistillationRecord(provenance: Provenance, recordings: readonly Recording[], result: DistillResult, code: DistillationRecord["code"] = null): DistillationRecord {
  return {
    ...provenance,
    code,
    recordingFormat: recordingFormatOf(recordings),
    runs: recordings.map((r) => ({ id: r.label, runLogSha256: r.runLogSha256, scoreSha256: r.scoreSha256, models: r.models, settings: r.settings === null ? null : { temperature: r.settings.temperature ?? null, effort: r.settings.effort ?? null, thinking: r.settings.thinking ?? null } })),
    skills: result.ok ? result.skills.skills.map((s) => ({ name: s.name, sha256: skillSha256(Object.fromEntries(s.files.map((f) => [f.path, f.content]))) })) : [],
    outcome: result.ok ? "skill-set" : result.code,
    reason: result.ok ? "a skill set was produced" : `distillation was refused: ${result.code}`,
  };
}

export function writeDistillationRecord(path: string, record: DistillationRecord): void {
  if (!distillationRecordSchema.safeParse(record).success) throw new LoopRefused("the distillation record does not match its schema");
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}

type Json = Record<string, any>;

const settingsOf = (s: Json | null | undefined) => (s == null ? null : { temperature: s["temperature"] ?? null, effort: s["effort"] ?? null, thinking: s["thinking"] ?? null });
const roleOf = (r: Json) => ({ requested: String(r["requested"]), resolved: (r["resolved"] ?? []) as string[], settings: settingsOf(r["settings"]), price: (r["priceQuote"] ?? null) as DistillationRecord["roles"][string]["price"] });

/** A loop record made before the harness interface, as the record of a `nams-reviewed` distillation. */
function fromLegacyLoop(l: Json): DistillationRecord {
  const service = (l["distiller"]?.["service"] ?? null) as DistillationRecord["service"];
  const accepted = l["outcome"] === "accept";
  const final = typeof l["finalSkillSha256"] === "string" ? (l["finalSkillSha256"] as string) : null;
  const reason = String(l["reason"] ?? "");
  const outcome = l["cancelled"] === true ? "cancelled" : l["failed"] === true ? (/spend cap/i.test(reason) ? "spend_limit" : "failed") : accepted ? "skill-set" : "no_skill";
  return {
    harness: { name: "nams-reviewed", processVersion: String(l["process"]?.["version"] ?? "1") },
    code: l["process"] == null ? null : { commit: l["process"]["commit"] ?? null, dirty: l["process"]["dirty"] ?? null, changesSha256: l["process"]["changesSha256"] ?? null },
    roles: { critic: roleOf(l["roles"]["critic"]), reviser: roleOf(l["roles"]["reviser"]) },
    prompts: { "review-rubric": { version: String(l["rubric"]["kindVersion"] ?? l["rubric"]["version"]), sha256: String(l["rubric"]["sha256"]) } },
    service,
    retainedExternally: l["distiller"] != null,
    stages: ((l["stages"] ?? []) as Json[]).map((s) => ({ stage: String(s["stage"]), durationMs: Number(s["durationMs"] ?? 0), tokens: s["tokens"] ?? null, costUsd: s["costUsd"] ?? null, ...(s["model"] === undefined ? {} : { model: { requested: String(s["model"]["requested"]), resolved: s["model"]["resolved"] ?? null } }) })),
    spend: l["spend"],
    review: { rounds: ((l["rounds"] ?? []) as Json[]).map((r) => ({ n: Number(r["n"]), skillSha256: String(r["skillSha256"]), overall: r["overall"] })), outcome: accepted ? "accept" : "reject" },
    recordingFormat: l["recordingFormat"] === "conversation" || l["recordingFormat"] === "placeholder" || l["recordingFormat"] === "mixed" ? l["recordingFormat"] : null,
    runs: ((l["recordedRuns"] ?? []) as Json[]).map((r) => ({ id: String(r["label"]), runLogSha256: String(r["runLogSha256"]), scoreSha256: String(r["scoreSha256"]), models: (r["models"] ?? []) as string[], settings: settingsOf(r["settings"]) })),
    // The legacy record names the skill by its hash only; the skill's own name was not kept.
    skills: accepted && final !== null ? [{ name: "skill", sha256: final }] : [],
    outcome,
    reason,
  };
}

/** A `harness.json`, or a loop record made before the interface (`loop.json`); anything else is refused with fixed text. */
export function readDistillationRecord(path: string): DistillationRecord {
  if (!existsSync(path)) throw new ReportRefused(`no distillation record at ${path}`);
  let raw: Json;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as Json;
  } catch {
    throw new ReportRefused(`the distillation record at ${path} is not valid JSON`);
  }
  if (raw["harness"] !== undefined) {
    const parsed = distillationRecordSchema.safeParse(raw);
    if (!parsed.success) throw new ReportRefused("a distillation record does not match the expected shape");
    return parsed.data;
  }
  if (raw["rubric"] !== undefined && raw["roles"] !== undefined && raw["rounds"] !== undefined) {
    const converted = distillationRecordSchema.safeParse(fromLegacyLoop(raw));
    if (!converted.success) throw new ReportRefused("a loop record could not be read as a distillation record");
    return converted.data;
  }
  throw new ReportRefused("the file is neither a distillation record nor a loop record");
}
