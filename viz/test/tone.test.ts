import { describe, expect, it } from "vitest";
import { failed, pipTone, runTone, scoreTone, TONE_BG, TONE_TEXT } from "../src/shell/tone.ts";

const GREEN = "text-light-forest";
const YELLOW = "text-mid-marigold";
const RED = "text-mid-hibiscus";

describe("the color of a call count", () => {
  it("is green for a run that reached its goal in no more calls than the ideal, and yellow for more", () => {
    expect(scoreTone("reached", 11, 11)).toBe(GREEN); // equal to the ideal is still green
    expect(scoreTone("reached", 7, 11)).toBe(GREEN);
    expect(scoreTone("reached", 12, 11)).toBe(YELLOW);
    expect(scoreTone("reached", 206, 11)).toBe(YELLOW);
  });

  it("is green for a run that reached its goal when no ideal is known", () => {
    expect(scoreTone("reached", 40, undefined)).toBe(GREEN);
  });

  it("is red for a run that failed, for whatever reason and whatever its count", () => {
    for (const o of ["gave up", "out of turns", "error"]) {
      expect(scoreTone(o, 3, 11), o).toBe(RED);
      expect(scoreTone(o, 90, 11), o).toBe(RED);
    }
  });

  it("is muted when the outcome is not known", () => {
    expect(scoreTone("", 5, 11)).toBe("text-retro-muted");
    expect(scoreTone("unfinished", 5, 11)).toBe("text-retro-muted");
    expect(runTone("", 5, 11)).toBeUndefined();
    expect(failed("unfinished")).toBe(false);
  });
});

describe("the color of a call among a run's calls", () => {
  const tones = (count: number, best: number | undefined, didFail: boolean) => Array.from({ length: count }, (_, i) => pipTone(i, count, best, didFail));

  it("is green up to the ideal and yellow past it", () => {
    expect(tones(5, 3, false)).toEqual(["ok", "ok", "ok", "over", "over"]);
  });

  it("makes the last call of a failed run red, and only that one", () => {
    expect(tones(5, 3, true)).toEqual(["ok", "ok", "ok", "over", "fail"]);
    expect(tones(2, 3, true)).toEqual(["ok", "fail"]); // a failure inside the ideal is still red at its end
  });

  it("is all green when no ideal is known and the run did not fail", () => {
    expect(tones(4, undefined, false)).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("agrees with the score's colors", () => {
    expect(TONE_TEXT.ok).toBe(GREEN);
    expect(TONE_TEXT.over).toBe(YELLOW);
    expect(TONE_TEXT.fail).toBe(RED);
    expect(Object.values(TONE_BG)).toEqual(["bg-light-forest", "bg-mid-marigold", "bg-mid-hibiscus"]);
  });
});
