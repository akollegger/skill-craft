/**
 * One color language for how a run is going, used for the score, the playback pips and the tape of a list row or tile:
 *   green  a call within the ideal (the best known run's count), or a run that reached its goal in no more calls than that;
 *   yellow a call past the ideal, or a run that reached its goal in more calls;
 *   red    a run that failed, for whatever reason (gave up, out of turns, error): its score and its last call.
 * Nothing else on the page uses these three colors, so a color always says this and never what kind of call it was.
 */
export type Tone = "ok" | "over" | "fail";

export const TONE_TEXT: Record<Tone, string> = { ok: "text-light-forest", over: "text-mid-marigold", fail: "text-mid-hibiscus" };
export const TONE_BG: Record<Tone, string> = { ok: "bg-light-forest", over: "bg-mid-marigold", fail: "bg-mid-hibiscus" };
export const TONE_BORDER: Record<Tone, string> = { ok: "border-light-forest", over: "border-mid-marigold", fail: "border-mid-hibiscus" };

/** An outcome that is neither reached nor still unknown is a failure. An empty or unfinished outcome is not yet anything. */
export const failed = (outcome: string): boolean => outcome !== "" && outcome !== "reached" && outcome !== "unfinished";

/** The tone of a whole run, or undefined when its outcome is not known. */
export function runTone(outcome: string, calls: number | undefined, best: number | undefined): Tone | undefined {
  if (failed(outcome)) return "fail";
  if (outcome !== "reached") return undefined;
  return calls !== undefined && best !== undefined && calls > best ? "over" : "ok";
}

/** The text color of a run's call count; muted when the outcome is not known. */
export const scoreTone = (outcome: string, calls: number | undefined, best: number | undefined): string => {
  const t = runTone(outcome, calls, best);
  return t === undefined ? "text-retro-muted" : TONE_TEXT[t];
};

/**
 * The tone of the call at `index` (from 0) among `count` calls: green up to the ideal, yellow past it, and for a failed run the last
 * call is red. With no known ideal every call is green.
 */
export function pipTone(index: number, count: number, best: number | undefined | null, didFail: boolean): Tone {
  if (didFail && index === count - 1) return "fail";
  return best !== undefined && best !== null && index >= best ? "over" : "ok";
}

/**
 * The word for how a run ended, in the same terms as its color: a run that reached its goal within the ideal made a "master craft",
 * one that took more calls an "eventual craft"; one that gave up "abandoned" it and one that ran out of turns "expired". Empty when
 * there is nothing to say yet; an outcome with no name here (an error) is shown as it is.
 */
export function outcomeWord(outcome: string, calls?: number, best?: number): string {
  switch (outcome) {
    case "reached":
      return runTone(outcome, calls, best) === "over" ? "eventual craft" : "master craft";
    case "gave up":
      return "abandoned craft";
    case "out of turns":
      return "expired craft";
    case "unfinished":
      return "";
    default:
      return outcome;
  }
}

/** The text color of the outcome word: the run's own tone, muted for an outcome with no tone. */
export const outcomeTone = (outcome: string, calls: number | undefined, best: number | undefined): string => scoreTone(outcome, calls, best);
