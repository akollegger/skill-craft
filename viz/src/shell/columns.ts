/**
 * The list's columns, shared by the header and every row so they line up. Widths are in rem, so they scale with the frame like
 * everything else on the page, and the list is always a grid: a label lives in the header, not in each cell. A row has no column
 * for its name or for how it ended: it is a different run from the one above, the number of calls says how it ended by its color,
 * and both are in the row's tooltip.
 */
export const LIST_GRID =
  "grid grid-cols-[3.5rem_minmax(5rem,1fr)_minmax(8rem,1.4fr)_5rem_14rem_minmax(8rem,1.4fr)_3rem] gap-x-4";

/** A column's heading and the attributes it shows, so the header can mark the column the runs are grouped or sorted by. */
export interface ListColumn {
  label: string;
  attrs: readonly string[];
}

/** The columns, in order. The first is the goal thumbnail and has no heading; the last holds the skill's icon. */
export const LIST_COLUMNS: readonly ListColumn[] = [
  { label: "", attrs: [] },
  { label: "World", attrs: ["world"] },
  { label: "Goal", attrs: ["goalItem", "goalQty"] },
  { label: "Calls", attrs: ["actionCalls", "bestCalls", "extraCalls", "outcome"] },
  { label: "Tape", attrs: [] },
  { label: "Model", attrs: ["modelRan", "modelRequested"] },
  { label: "Skill", attrs: ["skill", "skillLoaded", "skillLoadedAfter"] },
];
