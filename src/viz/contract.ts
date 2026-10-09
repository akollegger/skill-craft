import { z } from "zod";
import { FAMILIES, HALF, MARKS, PALETTE_COUNT, SPRITE_SIZE } from "./glyphs.js";

/**
 * The catalog the visualizer's page reads, and its parts. This file is shared with the page, so it imports
 * nothing from Node (a test enforces that). Unknown fields are ignored when parsing, so a newer producer does
 * not break an older reader; an unknown `format` is reported on its own.
 */
export const CATALOG_FORMAT = 1;

/** A run's attributes are flat: each is text, a number or a flag, and an attribute a run lacks is absent. */
export const attributeValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const attributesSchema = z.record(z.string(), attributeValueSchema);
export type AttributeValue = z.infer<typeof attributeValueSchema>;
export type Attributes = z.infer<typeof attributesSchema>;

/** What a tile or a row shows without opening the run: one character per action call, and the last table. */
export const previewSchema = z.object({
  strip: z.string(),
  table: z.array(z.array(z.string().nullable())),
  /** The goal item, when the run reached it: a tile shows what was made, since the table is empty after the last craft. */
  made: z.string().optional(),
});
export type Preview = z.infer<typeof previewSchema>;

/** Why a run cannot be opened: the code of the failure, then fixed text that never carries a wrapped error. */
export const REASON_CODES = ["Unfinished", "WorldMissing", "ReplayFailed", "BundleInvalid", "RunInvalid"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
const reasonPattern = new RegExp(`^(${REASON_CODES.join("|")}): .+`);

export const entrySchema = z
  .object({
    /** First 16 hex characters of a SHA-256 of the kind and the path relative to the scanned folder. */
    id: z.string().regex(/^[0-9a-f]{16}$/),
    kind: z.enum(["run", "bundle"]),
    status: z.enum(["ready", "unfinished", "unreadable"]),
    reason: z.string().regex(reasonPattern).optional(),
    attributes: attributesSchema,
    preview: previewSchema.optional(),
    /** Relative address prefix of the run's bundle, such as `bundles/<id>/`. */
    bundle: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const ok = e.status === "ready";
    const need = (present: boolean, field: string, wanted: boolean) => {
      if (present !== wanted) ctx.addIssue({ code: "custom", path: [field], message: wanted ? `${field} is required on a ready entry` : `${field} is only for a ready entry` });
    };
    need(e.preview !== undefined, "preview", ok);
    need(e.bundle !== undefined, "bundle", ok);
    need(e.reason !== undefined, "reason", !ok);
    // The page fetches this address, so it is exactly the relative one the contract promises: never an absolute or cross-origin URL.
    if (ok && e.bundle !== undefined && e.bundle !== `bundles/${e.id}/`) {
      ctx.addIssue({ code: "custom", path: ["bundle"], message: `bundle must be bundles/${e.id}/` });
    }
  });
export type CatalogEntry = z.infer<typeof entrySchema>;

// ---------------------------------------------------------------------------------------------------------
// Item art. A world's art says how each item the runs show is drawn: finished rows over a legend, or a generated glyph. It travels in a bundle's
// manifest (the items of that run) and in the catalog (the items of any ready run of a world), so the page draws the same sprite everywhere
// without the world, the library or the art file. Library names never appear in it. See specs/006-sprite-library/contracts/art.md.

const drawnEntry = z.object({ rows: z.array(z.string().length(SPRITE_SIZE)).length(SPRITE_SIZE) });
const glyphEntry = z
  .object({
    family: z.number().int().min(0).max(FAMILIES.length - 1),
    variant: z.number().int().min(0),
    palette: z.number().int().min(0).max(PALETTE_COUNT - 1),
    marks: z.array(z.number().int().min(0).max(HALF * SPRITE_SIZE - 1)).length(MARKS),
  })
  .refine((g) => g.variant < (FAMILIES[g.family]?.variants.length ?? 0), { message: "variant out of range for its family" })
  .refine((g) => new Set(g.marks).size === g.marks.length, { message: "marks must be distinct" });

export const worldArtSchema = z
  .object({
    /** One character to a palette name, or null for a transparent pixel. A name the page does not know is drawn transparent. */
    legend: z.record(z.string().length(1), z.string().nullable()),
    items: z.record(z.string(), z.union([drawnEntry, glyphEntry])),
  })
  .superRefine((art, ctx) => {
    for (const [name, entry] of Object.entries(art.items)) {
      if (!("rows" in entry)) continue;
      for (const row of entry.rows) {
        for (const ch of row) {
          if (!(ch in art.legend)) ctx.addIssue({ code: "custom", path: ["items", name], message: `row character ${JSON.stringify(ch)} is not in the legend` });
        }
      }
    }
  });
export type WorldArt = z.infer<typeof worldArtSchema>;

export const catalogSchema = z.object({
  format: z.literal(CATALOG_FORMAT),
  runs: z.array(entrySchema),
  /** How each world's items are drawn, by the world's name; absent when no ready run has art. */
  art: z.record(z.string(), worldArtSchema).optional(),
});
export type Catalog = z.infer<typeof catalogSchema>;

export type ParsedCatalog =
  | { ok: true; catalog: Catalog }
  | { ok: false; error: "unsupported-format"; format: unknown }
  | { ok: false; error: "invalid"; message: string };

/** Parse a catalog read from JSON. A format this reader does not know is not an error in the data. */
export function parseCatalog(json: unknown): ParsedCatalog {
  if (typeof json === "object" && json !== null && "format" in json && (json as { format: unknown }).format !== CATALOG_FORMAT) {
    return { ok: false, error: "unsupported-format", format: (json as { format: unknown }).format };
  }
  const r = catalogSchema.safeParse(json);
  if (r.success) return { ok: true, catalog: r.data };
  return { ok: false, error: "invalid", message: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
}

// ---------------------------------------------------------------------------------------------------------
// The replay bundle, as the page reads it. These mirror the Node types in src/sim/frames.ts, src/trace and
// src/harness/bundle.ts; test/viz/contract-types.test.ts fails to compile if they drift apart. Unknown fields
// are ignored, so a newer bundle still reads.

const item = z.string();

export const frameSchema = z.object({
  seq: z.number(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  ok: z.boolean(),
  error: z.string().optional(),
  crafted: z.object({ item, qty: z.number() }).optional(),
  grid: z.array(z.array(item.nullable())),
  craftable: item.nullable(),
  partial: z.boolean().optional(),
  held: z.record(z.string(), z.number()),
  actions: z.number(),
  refusals: z.number(),
  reached: z.boolean(),
});
export type FrameData = z.infer<typeof frameSchema>;

const requestLine = z.object({
  seq: z.number(), kind: z.literal("request"), requestId: z.string(), model: z.string().nullable(), turn: z.number(),
  startMs: z.number(), endMs: z.number(), ttftMs: z.number().nullable(),
  inputTokens: z.number(), outputTokens: z.number(), cacheReadTokens: z.number(), cacheCreationTokens: z.number(),
});
const toolLine = z.object({ seq: z.number(), kind: z.literal("tool"), toolUseId: z.string(), tool: z.string(), args: z.record(z.string(), z.unknown()), startMs: z.number(), endMs: z.number() });
export const traceLineSchema = z.discriminatedUnion("kind", [requestLine, toolLine]);
export type TraceLineData = z.infer<typeof traceLineSchema>;

export const manifestSchema = z.object({
  format: z.literal(1),
  label: z.string(),
  world: z.object({ name: z.string(), rows: z.number(), cols: z.number() }),
  goal: z.object({ item, qty: z.number() }),
  best: z.object({ minCrafts: z.number(), minCalls: z.number(), slack: z.number() }).nullable(),
  frames: z.number(),
  trace: z.enum(["matched", "mismatch", "absent"]),
  model: z.object({ requested: z.string().nullable(), resolved: z.array(z.string()) }),
  priorFit: z.string().optional(),
  promptNote: z.string().optional(),
  skill: z.object({ name: z.string(), loaded: z.boolean(), loadedAfter: z.number().nullable() }).optional(),
  /** How the items of this run's frames and goal are drawn. Absent in bundles made before item art. */
  art: worldArtSchema.optional(),
});
export type ManifestData = z.infer<typeof manifestSchema>;

const tokens = { inputTokens: z.number(), outputTokens: z.number(), cacheReadTokens: z.number(), cacheCreationTokens: z.number() };
export const resultSchema = z.object({
  ended: z.enum(["stopped", "budget", "error"]),
  reason: z.string().optional(),
  turns: z.number().nullable(),
  score: z.object({
    goal: z.object({ item, qty: z.number() }),
    reached: z.boolean(),
    totalCalls: z.number(),
    actionCalls: z.number(),
    callsToGoal: z.number(),
    craftsMade: z.number(),
    failedCrafts: z.number(),
    refusals: z.record(z.string(), z.number()),
    best: z.object({ minCrafts: z.number(), minCalls: z.number(), slack: z.number() }).nullable(),
    extraCalls: z.number().nullable(),
    extraCrafts: z.number().nullable(),
    reachedSeq: z.number().nullable(),
  }),
  measured: z.object({
    trace: z.enum(["matched", "mismatch", "absent"]),
    reason: z.string().optional(),
    total: z.object({ durationMs: z.number(), costUsd: z.number(), ...tokens }).optional(),
    toGoal: z.object({ durationMs: z.number(), ...tokens }).optional(),
  }),
});
export type ResultData = z.infer<typeof resultSchema>;

export interface BundleData {
  manifest: ManifestData;
  frames: FrameData[];
  trace: TraceLineData[];
  result: ResultData;
}

/**
 * Checks a bundle read from disk against what the page will require of it, so a folder with a malformed bundle lists it as unreadable and
 * does not offer it as ready only for the page to refuse it on opening. Returns what is wrong, or undefined for a bundle that reads.
 * The manifest, the result, every trace line and every frame must match their schemas, and the frames' `seq` must run 0, 1, 2 and so on.
 */
export function bundleProblem(bundle: { manifest: unknown; frames: readonly unknown[]; trace: readonly unknown[]; result: unknown }): string | undefined {
  const m = manifestSchema.safeParse(bundle.manifest);
  if (!m.success) return "bundle.json does not match the manifest schema";
  if (bundle.frames.length === 0) return "the bundle has no frames";
  for (const [i, f] of bundle.frames.entries()) {
    const p = frameSchema.safeParse(f);
    if (!p.success) return `frame ${i} does not match the frame schema`;
    if (p.data.seq !== i) return `frame ${i} has seq ${p.data.seq}`;
  }
  for (const [i, t] of bundle.trace.entries()) if (!traceLineSchema.safeParse(t).success) return `trace line ${i} is not a trace line`;
  if (!resultSchema.safeParse(bundle.result).success) return "score.json does not match the result schema";
  return undefined;
}
