import { describe, expect, it } from "vitest";
import { isInside } from "../../src/viz/paths.js";

describe("isInside", () => {
  it("is true for the folder itself and for anything under it", () => {
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b/c")).toBe(true);
    expect(isInside("/a/b", "/a/b/c/d.html")).toBe(true);
  });

  it("is true for a name that only starts with two dots", () => {
    expect(isInside("/a/b", "/a/b/..sheets")).toBe(true);
    expect(isInside("/a/b", "/a/b/..sheets/x.html")).toBe(true);
    expect(isInside("/a/b", "/a/b/..")).toBe(false); // the parent itself
  });

  it("is false for a sibling, a parent and a path that merely shares a prefix", () => {
    expect(isInside("/a/b", "/a/c")).toBe(false);
    expect(isInside("/a/b", "/a")).toBe(false);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
    expect(isInside("/a/b", "/a/b/../c")).toBe(false);
  });
});
