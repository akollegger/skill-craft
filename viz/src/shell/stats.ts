import { formatClock } from "./clock.ts";

/** A token count in few characters: as it is up to 9999, then `17.0k`, `641k`, `1.2m`. */
export function compactCount(n: number): string {
  if (n < 10_000) return String(n);
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

/** What a run spent, as it is measured. */
export interface Spend {
  costUsd: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** One small stat: the figure shown, the icon that stands for what it is, and the words for a tooltip and a screen reader. */
export interface Stat {
  icon: "cost" | "time" | "in" | "out" | "cacheRead" | "cacheWrite";
  text: string;
  label: string;
}

/** A run's spend as a short list of stats, none for a run whose time and tokens were not measured. */
export function spendStats(total: Spend | undefined | null): Stat[] {
  if (!total) return [];
  return [
    { icon: "cost", text: `$${total.costUsd.toFixed(3)}`, label: "Cost" },
    { icon: "time", text: formatClock(total.durationMs), label: "Time for the whole run" },
    { icon: "in", text: compactCount(total.inputTokens), label: "Input tokens" },
    { icon: "out", text: compactCount(total.outputTokens), label: "Output tokens" },
    { icon: "cacheRead", text: compactCount(total.cacheReadTokens), label: "Cache read tokens" },
    { icon: "cacheWrite", text: compactCount(total.cacheCreationTokens), label: "Cache write tokens" },
  ];
}
