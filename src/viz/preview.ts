import type { Frame } from "../sim/frames.js";
import { isAction } from "../sim/score.js";
import type { Preview } from "./contract.js";

const sameTable = (a: Frame, b: Frame): boolean => JSON.stringify(a.grid) === JSON.stringify(b.grid) && JSON.stringify(a.held) === JSON.stringify(b.held);

/**
 * What a tile or a row shows without opening the run: one character per action call (`p` placement, `c` craft,
 * `r` refused call, `t` take-back, `.` an action that changed nothing), and the table as the run left it.
 * Reads are not in the strip. When the run reached its goal, `made` names the goal item. Everything comes from
 * frames, so it is deterministic and holds no recipe.
 */
export function previewOf(frames: readonly Frame[], goalItem?: string): Preview {
  let strip = "";
  frames.forEach((f, i) => {
    const prev = frames[i - 1];
    if (!prev || !isAction(f.tool)) return;
    if (!f.ok) strip += "r";
    else if (sameTable(f, prev)) strip += ".";
    else strip += f.tool === "place" ? "p" : f.tool === "craft" ? "c" : "t";
  });
  const last = frames.at(-1);
  return { strip, table: last ? last.grid.map((row) => [...row]) : [], ...(last?.reached && goalItem !== undefined ? { made: goalItem } : {}) };
}
