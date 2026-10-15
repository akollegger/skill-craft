// The two data contracts of a distillation harness (spec 009, ADR-008): the run record and the skill set, as zod definitions and as the
// JSON Schema files committed under schemas/. The run record holds only what the model and the world produced, as data.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jsonSchemaOf, runRecordSchema, skillSetSchema } from "../src/distill/schemas.js";

const committed = (name: string): string => readFileSync(`schemas/${name}`, "utf8");

/** Every property name at any depth of a JSON Schema, as a dotted path with `[]` for array items. */
function propertyTree(schema: unknown, prefix = ""): string[] {
  const out: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    for (const key of ["anyOf", "oneOf", "allOf"]) if (Array.isArray(n[key])) for (const sub of n[key] as unknown[]) walk(sub, path);
    if (n["items"] !== undefined) walk(n["items"], `${path}[]`);
    if (n["properties"] !== undefined && typeof n["properties"] === "object") {
      for (const [name, sub] of Object.entries(n["properties"] as Record<string, unknown>)) {
        const p = path === "" ? name : `${path}.${name}`;
        out.push(p);
        walk(sub, p);
      }
    }
    if (typeof n["additionalProperties"] === "object") walk(n["additionalProperties"], path);
  };
  walk(schema, prefix);
  return out;
}

const RUN_RECORD_PROPERTIES = [
  "id", "prompt", "models", "models.requested", "models.resolved", "settings", "settings.temperature", "settings.effort", "settings.thinking",
  "reasoning", "turns", "turns[].text", "turns[].reasoning", "turns[].calls", "turns[].calls[].id", "turns[].calls[].tool",
  "turns[].calls[].arguments", "turns[].calls[].status", "turns[].calls[].output", "turns[].calls[].refusal", "finalAnswer",
];

const FORBIDDEN = /^(score|reached|solver|bestRun|extraCalls|goalRole|role|world|goals|duration|durationMs|startMs|neededCalls)$/i;

const record = (over: Record<string, unknown> = {}) => ({
  id: "001",
  prompt: "Hold one c.",
  models: { requested: "anthropic/claude-haiku-5-5", resolved: ["anthropic/claude-haiku-5-5"] },
  settings: { temperature: null, effort: null, thinking: null },
  reasoning: "returned",
  turns: [{ text: "", reasoning: "try a pair", calls: [{ id: "toolu_1", tool: "place", arguments: { item: "a", row: 0, col: 0 }, status: "ok", output: "placed" }] }],
  finalAnswer: "I hold it.",
  ...over,
});

describe("the committed schema files", () => {
  it("equal what the definitions generate, so editing one side without the other fails", () => {
    expect(committed("run-record.v1.json")).toBe(`${JSON.stringify(jsonSchemaOf(runRecordSchema), null, 2)}\n`);
    expect(committed("skill-set.v1.json")).toBe(`${JSON.stringify(jsonSchemaOf(skillSetSchema), null, 2)}\n`);
  });
});

describe("the run record (FR-007, FR-008)", () => {
  it("has exactly the allowed properties, at every depth", () => {
    expect(propertyTree(JSON.parse(committed("run-record.v1.json"))).sort()).toEqual([...RUN_RECORD_PROPERTIES].sort());
  });

  it("has no property named for a score, a goal role, a solver path, a timing, a world or what was needed", () => {
    for (const name of propertyTree(JSON.parse(committed("run-record.v1.json")))) for (const part of name.replace(/\[\]/g, "").split(".")) expect(part, name).not.toMatch(FORBIDDEN);
  });

  it("is strict: a record with an excluded field is invalid", () => {
    expect(runRecordSchema.safeParse(record()).success).toBe(true);
    for (const extra of [{ score: {} }, { reached: true }, { solverPath: [] }, { extraCalls: 3 }, { goalRole: "gap" }, { world: "w.json" }, { durationMs: 5 }, { neededCalls: [1] }]) {
      expect(runRecordSchema.safeParse(record(extra)).success, JSON.stringify(extra)).toBe(false);
    }
    const timed = record();
    (timed.turns[0]!.calls[0] as Record<string, unknown>)["durationMs"] = 5;
    expect(runRecordSchema.safeParse(timed).success).toBe(false);
  });

  it("says whether reasoning was returned, and a turn may have none", () => {
    for (const r of ["returned", "partial", "none", "not-kept"]) expect(runRecordSchema.safeParse(record({ reasoning: r })).success).toBe(true);
    expect(runRecordSchema.safeParse(record({ reasoning: "some" })).success).toBe(false);
    const turns = [{ text: "x", calls: [] }];
    expect(runRecordSchema.safeParse(record({ turns, reasoning: "none" })).success).toBe(true);
  });

  it("records a failed call with the world's refusal", () => {
    const turns = [{ text: "", calls: [{ id: "c", tool: "craft", arguments: {}, status: "failed", output: "nothing matches", refusal: "no_match" }] }];
    expect(runRecordSchema.safeParse(record({ turns })).success).toBe(true);
  });
});

describe("the skill set (FR-009)", () => {
  const skill = (over: Record<string, unknown> = {}) => ({ name: "wooden-stool", description: "How to make a stool.", files: [{ path: "SKILL.md", content: "---\nname: wooden-stool\ndescription: How to make a stool.\n---\nbody\n" }], ...over });

  it("is valid with one skill, and invalid when empty", () => {
    expect(skillSetSchema.safeParse({ skills: [skill()] }).success).toBe(true);
    expect(skillSetSchema.safeParse({ skills: [] }).success).toBe(false);
    expect(skillSetSchema.safeParse({}).success).toBe(false);
  });

  it("accepts tags and evidence, and refuses unknown fields and a skill with no files or a bad name", () => {
    expect(skillSetSchema.safeParse({ skills: [skill({ tags: ["rule"], evidence: [{ run: "001", call: 4 }, { run: "002" }] })] }).success).toBe(true);
    expect(skillSetSchema.safeParse({ skills: [skill({ extra: 1 })] }).success).toBe(false);
    expect(skillSetSchema.safeParse({ skills: [skill({ files: [] })] }).success).toBe(false);
    expect(skillSetSchema.safeParse({ skills: [skill({ name: "Wooden Stool" })] }).success).toBe(false);
  });
});
