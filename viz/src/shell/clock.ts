/** A run's clock: tenths of a second under a minute (`4.2s`), minutes and seconds above (`1:05`). */
export function formatClock(ms: number): string {
  if (ms < 60_000) return `${(Math.floor(ms / 100) / 10).toFixed(1)}s`;
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
