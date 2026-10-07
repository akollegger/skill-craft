/** A run's clock: tenths of a second under a minute (`4.2s`), minutes and seconds above (`1:05`). */
export function formatClock(ms: number): string {
  if (ms < 60_000) return `${(Math.floor(ms / 100) / 10).toFixed(1)}s`;
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The score's reserved room: three of the widest digit, the same for every run, so opening or comparing runs never shifts the layout. The
 * pixel face's digits differ in width (a 1 is half a 2), so a number that changes as the run plays would otherwise resize whatever sits
 * beside it. A run of a thousand calls or more gets the room its digits need.
 */
export const scoreSizer = (steps: number): string => "8".repeat(Math.max(3, String(Math.max(0, steps)).length));

/**
 * The clock's reserved room, also the same for every run: the widest seconds form (`59.9s`) and the widest minutes form under ten minutes
 * (`9:59`), stacked, so the clock takes the wider. A run of ten minutes or more adds `88:88`.
 */
export function clockSizers(finalMs: number | null): string[] {
  const out = ["88.8s", "8:88"];
  if (finalMs !== null && finalMs >= 600_000) out.push("88:88");
  return out;
}
