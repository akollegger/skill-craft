/** The runs ticked for comparison and the tables open, by catalog id. Neither is ever more than two. */
export interface Selection {
  ticked: string[];
  open: string[];
}

export const MAX_TABLES = 2;

export const initialSelection = (): Selection => ({ ticked: [], open: [] });

/** Tick or untick a run. A third tick drops the oldest, so the last two chosen are the pair. */
export function tickRun(s: Selection, id: string): Selection {
  if (s.ticked.includes(id)) return { ...s, ticked: s.ticked.filter((t) => t !== id) };
  return { ...s, ticked: [...s.ticked, id].slice(-MAX_TABLES) };
}

/** Open a run into a table. With two already open, the new run takes the second place. */
export function openRun(s: Selection, id: string): Selection {
  if (s.open.includes(id)) return s;
  return { ...s, open: s.open.length < MAX_TABLES ? [...s.open, id] : [s.open[0]!, id] };
}

export const closeRun = (s: Selection, id: string): Selection => ({ ...s, open: s.open.filter((o) => o !== id) });
