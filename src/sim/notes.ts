import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { WorldError } from "./errors.js";
import { loadWorld } from "./loader.js";
import { issueMessages, type World } from "./schema.js";

/**
 * How far a model's existing knowledge predicts a world's recipes (constitution, Principle III). A world
 * with no notes file is `undeclared`: older worlds and tests keep working, and the gap is visible.
 */
export type PriorFit = "invented" | "faithful" | "perturbed";
export type DeclaredPriorFit = PriorFit | "undeclared";

const notesSchema = z.strictObject({
  priorFit: z.enum(["invented", "faithful", "perturbed"]),
  /** The source a faithful or perturbed world's vocabulary comes from, in plain words. */
  inspiration: z.string().min(1).optional(),
  /** For a generated world: the repository path of the world it was renamed from. */
  derivedFrom: z.string().min(1).optional(),
  /** Recipe id to the familiar crafting it models. */
  recipes: z.record(z.string(), z.string().min(1)).optional(),
  /** Features of the source the world leaves out. */
  omissions: z.array(z.string().min(1)).optional(),
});

export type WorldNotes = z.infer<typeof notesSchema>;

/** `worlds/forge.json` is paired with `worlds/forge.notes.json`. */
export function notesPathFor(worldPath: string): string {
  return worldPath.replace(/\.json$/, ".notes.json");
}

// A faithful world is judged within the crafting-table mechanic and pins no game edition or version.
const VERSION_WORDS = /\b(edition|java|bedrock)\b|\b\d+\.\d+(\.\d+)?\b/i;

function textsOf(notes: WorldNotes): string[] {
  return [notes.inspiration, ...Object.values(notes.recipes ?? {}), ...(notes.omissions ?? [])].filter((t): t is string => t !== undefined);
}

/** Parse notes data and check it against the world it describes. Reports every problem together. */
export function parseNotes(data: unknown, world: World): WorldNotes {
  const parsed = notesSchema.safeParse(data);
  if (!parsed.success) throw new WorldError(issueMessages(parsed.error));
  const notes = parsed.data;
  const problems: string[] = [];

  const known = new Set(world.recipes.map((r) => r.id));
  for (const id of Object.keys(notes.recipes ?? {})) if (!known.has(id)) problems.push(`note for unknown recipe '${id}'`);

  if (notes.priorFit !== "invented" && notes.inspiration === undefined) problems.push(`a ${notes.priorFit} world needs \`inspiration\``);
  if (notes.priorFit === "faithful") {
    if ((notes.omissions ?? []).length === 0) problems.push("a faithful world needs `omissions`, the features of the source it leaves out");
    for (const id of known) if (notes.recipes?.[id] === undefined) problems.push(`recipe '${id}' has no note`);
  }
  for (const text of textsOf(notes)) {
    if (VERSION_WORDS.test(text)) problems.push(`notes name an edition or version of the source: "${text}"`);
  }

  if (problems.length > 0) throw new WorldError(problems);
  return notes;
}

export function loadNotes(path: string, world: World): WorldNotes {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new WorldError([`cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`]);
  }
  return parseNotes(data, world);
}

/** The world's declared prior fit, `undeclared` when it has no notes file. An invalid notes file throws. */
export function priorFitOf(worldPath: string): DeclaredPriorFit {
  const path = notesPathFor(worldPath);
  if (!existsSync(path)) return "undeclared";
  return loadNotes(path, loadWorld(worldPath)).priorFit;
}
