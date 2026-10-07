import type { FrameData } from "../../../src/viz/contract.ts";

export type CallKind = "place" | "craft" | "refusal" | "take-back" | "read";

const ACTIONS = new Set(["place", "remove", "clear", "craft"]);

/** What a frame's call was, for telling calls apart at a glance: a refused action is a refusal whatever it tried. */
export function callKind(f: FrameData): CallKind {
  if (!ACTIONS.has(f.tool)) return "read";
  if (!f.ok) return "refusal";
  if (f.tool === "place") return "place";
  if (f.tool === "craft") return "craft";
  return "take-back";
}

/** A call in words, as the agent made it. Names only items and the error code the world gave; never a recipe. */
export function describeCall(f: FrameData): string {
  const a = f.args;
  const at = `${String(a["row"])},${String(a["col"])}`;
  const what =
    f.tool === "place" ? `place ${String(a["item"])} at ${at}`
    : f.tool === "remove" ? `take back from ${at}`
    : f.tool === "clear" ? "take back everything"
    : f.tool === "craft" ? (f.crafted ? `craft ${f.crafted.item} ×${f.crafted.qty}` : "craft")
    : f.tool;
  return f.ok ? what : `${what} — refused: ${f.error ?? "refused"}`;
}
