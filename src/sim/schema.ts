import { z } from "zod";
import { WorldError } from "./errors.js";
import { trimPattern } from "./matcher.js";

export const idSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/, "ids are lowercase words such as `ore` or `iron-bar`");
export const qtySchema = z.number().int().positive();
const id = idSchema;
const qty = qtySchema;
const stack = z.strictObject({ item: id, qty });

const itemSchema = z.strictObject({ id, description: z.string() });

const shapelessSchema = z.strictObject({
  id,
  kind: z.literal("shapeless"),
  inputs: z.array(stack).min(1),
  output: stack,
});

const shapedSchema = z.strictObject({
  id,
  kind: z.literal("shaped"),
  pattern: z.array(z.array(id.nullable()).min(1)).min(1),
  output: stack,
});

export const worldSchema = z
  .strictObject({
    name: z.string().min(1),
    description: z.string(),
    grid: z.strictObject({ rows: z.number().int().positive(), cols: z.number().int().positive() }),
    hints: z.enum(["exact", "partial"]).default("exact"),
    stock: z.record(id, qty),
    items: z.array(itemSchema).min(1),
    recipes: z.array(z.discriminatedUnion("kind", [shapelessSchema, shapedSchema])).min(1),
  })
  .superRefine((world, ctx) => {
    world.recipes.forEach((recipe, index) => {
      if (recipe.kind !== "shaped") return;
      const width = recipe.pattern[0]?.length ?? 0;
      if (recipe.pattern.some((row) => row.length !== width)) {
        ctx.addIssue({ code: "custom", path: ["recipes", index, "pattern"], message: "pattern must be rectangular (every row the same length)" });
      } else if (recipe.pattern.every((row) => row.every((cell) => cell === null))) {
        ctx.addIssue({ code: "custom", path: ["recipes", index, "pattern"], message: "pattern must contain at least one item" });
      }
    });
  });

export type World = z.infer<typeof worldSchema>;
export type Item = World["items"][number];
export type Recipe = World["recipes"][number];
export type ShapelessRecipe = Extract<Recipe, { kind: "shapeless" }>;
export type ShapedRecipe = Extract<Recipe, { kind: "shaped" }>;
export type Hints = World["hints"];
export type Stack = z.infer<typeof stack>;

/** Format zod issues as `path: message`, one per problem. */
export function issueMessages(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`);
}

/**
 * Parse an unknown value into a World: checks the schema (rejecting unknown fields), applies the
 * default hint level, and trims shaped patterns to their bounding box. Semantic checks (references,
 * conflicts, limits) are in loader.ts. Throws WorldError listing every schema problem.
 */
export function parseWorld(data: unknown): World {
  const parsed = worldSchema.safeParse(data);
  if (!parsed.success) throw new WorldError(issueMessages(parsed.error));
  const world = parsed.data;
  return {
    ...world,
    recipes: world.recipes.map((r) => (r.kind === "shaped" ? { ...r, pattern: trimPattern(r.pattern) } : r)),
  };
}
