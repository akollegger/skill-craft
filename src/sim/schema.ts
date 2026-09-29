import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9_-]*$/, "ids are lowercase words like `ember-ore`");
const qty = z.number().int().positive();

const stack = z.object({ item: id, qty });

export const itemSchema = z.object({
  id,
  description: z.string(),
  /** Present on raw materials that can be gathered by hand or with a tool. */
  gather: z
    .object({
      minTier: z.number().int().min(0),
      yield: qty.default(1),
    })
    .optional(),
  /** Present on tools; holding one raises the tier used when gathering. */
  toolTier: z.number().int().positive().optional(),
});

export const stationSchema = z.object({
  id,
  /** Item consumed from the inventory when the station is placed. */
  item: id,
});

export const recipeSchema = z.object({
  id,
  output: stack,
  inputs: z.array(stack).min(1),
  station: id.optional(),
  fuel: stack.optional(),
});

export const taskSchema = z.object({
  id,
  goal: stack,
  note: z.string().optional(),
});

export const worldSchema = z.object({
  name: z.string(),
  description: z.string(),
  items: z.array(itemSchema).min(1),
  stations: z.array(stationSchema),
  recipes: z.array(recipeSchema).min(1),
  tasks: z.array(taskSchema).min(1),
});

export type Stack = z.infer<typeof stack>;
export type Item = z.infer<typeof itemSchema>;
export type Station = z.infer<typeof stationSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type Task = z.infer<typeof taskSchema>;
export type World = z.infer<typeof worldSchema>;
