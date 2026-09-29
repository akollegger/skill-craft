import { describe, expect, it } from "vitest";
import { rng } from "../src/sim/prng.js";

const take = (seed: number, n: number): number[] => {
  const next = rng(seed);
  return Array.from({ length: n }, () => next());
};

describe("prng", () => {
  it("gives the same sequence for the same seed", () => {
    expect(take(42, 20)).toEqual(take(42, 20));
  });

  it("gives different sequences for different seeds", () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it("stays within [0, 1)", () => {
    for (const v of take(7, 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
