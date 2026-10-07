import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Picker from "../src/shell/Picker.svelte";
import RunView from "../src/shell/RunView.svelte";
import SkillIcon from "../src/shell/SkillIcon.svelte";
import { groupRuns } from "../src/state/group.ts";
import type { SceneFactory } from "../src/scene/handle.ts";
import type { CatalogEntry } from "../../src/viz/contract.ts";
import { sampleBundle } from "./helpers/bundle.ts";

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  return () => vi.unstubAllGlobals();
});

const NOTE = "PROMPT-NOTE-SECRET: use the demo-skill skill";
const loadedEarly = { skill: "demo-skill", skillLoaded: true, skillLoadedAfter: 2, promptNote: NOTE };
const loadedLate = { skill: "demo-skill", skillLoaded: true, skillLoadedAfter: 47 };
const neverLoaded = { skill: "demo-skill", skillLoaded: false };
const none = {};

describe("where it appears", () => {
  const entry = (run: string, attributes: CatalogEntry["attributes"]): CatalogEntry => {
    const id = run.padStart(16, "0");
    return { id, kind: "run", status: "ready", attributes: { label: "lab", run, world: "w", outcome: "reached", actionCalls: 3, ...attributes }, preview: { strip: "pc", table: [["a"]] }, bundle: `bundles/${id}/` };
  };
  const runs = [entry("1", loadedLate), entry("2", neverLoaded), entry("3", none)];

  it.each(["grid", "list"] as const)("is on every %s item that has a skill and on no other", (presentation) => {
    render(Picker, { groups: groupRuns(runs, null), presentation, onOpen: () => {} });
    const markers = (id: string) => document.querySelectorAll(`[data-run-id="${id}"] [data-skill]`).length;
    expect(markers(runs[0]!.id)).toBe(1);
    expect(markers(runs[1]!.id)).toBe(1);
    expect(markers(runs[2]!.id)).toBe(0);
  });

  it("is in the heading of a table that has none of its own in the title strip, after the model", () => {
    const scene: SceneFactory = () => ({ show() {}, destroy() {} });
    render(RunView, { entry: entry("1", loadedLate), bundle: sampleBundle(), createScene: scene, onClose: () => {} });
    const icon = screen.getByRole("region", { name: /run/i }).querySelector("svg[data-skill]");
    expect(icon?.getAttribute("aria-label")).toMatch(/loaded after 47 calls/);
    expect(icon!.previousElementSibling?.textContent).toContain("claude-x");
  });

  it("is not in a table whose heading is in the title strip: the strip carries it", () => {
    const scene: SceneFactory = () => ({ show() {}, destroy() {} });
    render(RunView, { entry: entry("1", loadedLate), bundle: sampleBundle(), createScene: scene, onClose: () => {}, titled: true });
    expect(document.querySelector("[data-skill]")).toBeNull();
  });

  it("is not in the open view of a run with no skill", () => {
    const scene: SceneFactory = () => ({ show() {}, destroy() {} });
    render(RunView, { entry: entry("3", none), bundle: sampleBundle(), createScene: scene, onClose: () => {} });
    expect(document.querySelector("[data-skill]")).toBeNull();
  });

  it("never carries skill text anywhere on the page", () => {
    render(Picker, { groups: groupRuns([entry("1", loadedEarly)], null), presentation: "grid", onOpen: () => {} });
    expect(document.body.textContent).not.toContain("PROMPT-NOTE-SECRET");
  });
});

describe("the skill icon", () => {
  const icon = (attributes: CatalogEntry["attributes"], dash = false) => {
    const { container, unmount } = render(SkillIcon, { attributes, dash });
    const svg = container.querySelector("svg[data-skill]");
    const out = {
      label: svg?.getAttribute("aria-label") ?? "",
      visible: container.textContent?.replace(svg?.querySelector("title")?.textContent ?? "", "").trim() ?? "",
      loaded: svg?.hasAttribute("data-loaded") ?? false,
      pointed: svg?.querySelector("[data-pointed]") !== null && svg !== null,
      rects: [...(svg?.querySelectorAll("rect") ?? [])].map((r) => ["x", "y", "width", "height"].map((a) => Number(r.getAttribute(a)))),
      crisp: svg?.getAttribute("shape-rendering"),
      none: container.querySelector("[data-no-skill]") !== null,
    };
    unmount();
    return out;
  };

  it("is a picture, with the words in its label: the same sentence as the marker", () => {
    expect(icon(loadedLate).label).toMatch(/demo-skill.*loaded after 47 calls/);
    expect(icon(neverLoaded).label).toMatch(/demo-skill.*never loaded/);
    expect(icon(loadedEarly).label).toMatch(/prompt pointed at it/);
    expect(icon(loadedLate).visible).toBe("");
  });

  it("is drawn from whole art pixels on an eight-pixel square, crisp, with no curves", () => {
    const i = icon(loadedLate);
    expect(i.crisp).toBe("crispEdges");
    expect(i.rects.length).toBeGreaterThan(2);
    for (const r of i.rects) for (const n of r) expect(Number.isInteger(n)).toBe(true);
    for (const [x, y, w, h] of i.rects) expect(x! + w! <= 8 && y! + h! <= 8).toBe(true);
  });

  it("tells loaded from never loaded by shape and color, and marks a prompt that pointed at it with its own pixel", () => {
    expect(icon(loadedLate).rects).not.toEqual(icon(neverLoaded).rects);
    expect(icon(loadedLate).loaded).toBe(true);
    expect(icon(neverLoaded).loaded).toBe(false);
    expect(icon(loadedEarly).pointed).toBe(true);
    expect(icon(loadedLate).pointed).toBe(false);
  });

  it("is a dash in a list column when there is no skill, and nothing on a tile", () => {
    expect(icon(none, true)).toMatchObject({ none: true, visible: expect.stringMatching(/^-/) });
    expect(icon(none, false)).toMatchObject({ none: false, visible: "" });
  });

  it("never shows the prompt sentence", () => {
    expect(icon(loadedEarly).label).not.toContain("PROMPT-NOTE-SECRET");
  });
});
