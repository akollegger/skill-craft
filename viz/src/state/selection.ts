/** The runs selected for comparison (shift-click) and the tables open, by catalog id. Neither is ever more than two. */
export interface Selection {
  selected: string[];
  open: string[];
}

export const MAX_TABLES = 2;

export const initialSelection = (): Selection => ({ selected: [], open: [] });

/** Select or deselect a run. A third selection drops the oldest, so the last two chosen are the pair. */
export function toggleSelected(s: Selection, id: string): Selection {
  if (s.selected.includes(id)) return { ...s, selected: s.selected.filter((t) => t !== id) };
  return { ...s, selected: [...s.selected, id].slice(-MAX_TABLES) };
}

/** Open a run into a table. With two already open, the new run takes the second place. */
export function openRun(s: Selection, id: string): Selection {
  if (s.open.includes(id)) return s;
  return { ...s, open: s.open.length < MAX_TABLES ? [...s.open, id] : [s.open[0]!, id] };
}

export const closeRun = (s: Selection, id: string): Selection => ({ ...s, open: s.open.filter((o) => o !== id) });
