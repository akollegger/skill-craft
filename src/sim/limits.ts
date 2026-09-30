// Size limits that keep the exact solver tractable (research Decisions 1 and 2). One place, so they
// can be tuned after benchmarking.

/** Most items a world may define. */
export const MAX_ITEMS = 30;
/** Most recipes a world may define. */
export const MAX_RECIPES = 40;
/** Most cells a table may have (rows x cols). */
export const MAX_TABLE_CELLS = 36;
/** Most units of stock a world may start with, summed over all items. */
export const MAX_STOCK_UNITS = 120;
/** Most distinct inventory states the solver may visit for one goal. */
export const SOLVER_STATE_BUDGET = 250_000;
/** Slack is reported up to this many wasted crafts; a value at the cap means "at least the cap". */
export const SLACK_CAP = 5;
