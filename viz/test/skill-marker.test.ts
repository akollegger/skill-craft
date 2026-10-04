import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Picker from "../src/shell/Picker.svelte";
import RunView from "../src/shell/RunView.svelte";
import SkillIcon from "../src/shell/SkillIcon.svelte";
import SkillMarker from "../src/shell/SkillMarker.svelte";
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

const marker = (attributes: CatalogEntry["attributes"]) => {
  const { container, unmount } = render(SkillMarker, { attributes });
  const text = container.textContent?.trim() ?? "";
  const cls = container.querySelector("[data-skill]")?.className ?? "";
  unmount();
  return { text, cls };
};

describe("the skill marker", () => {
  it("says a skill was installed, whether it was loaded and after how many calls", () => {
    expect(marker(loadedLate).text).toMatch(/demo-skill.*loaded after 47 calls/);
    expect(marker(loadedEarly).text).toMatch(/loaded after 2 calls/);
    expect(marker(neverLoaded).text).toMatch(/demo-skill.*never loaded/);
  });

  it("says a skill loaded before the first call was there from the start", () => {
    expect(marker({ skill: "s", skillLoaded: true, skillLoadedAfter: 0 }).text).toMatch(/loaded before the first call/);
  });

  it("says when the prompt pointed at the skill", () => {
    expect(marker(loadedEarly).text).toMatch(/prompt pointed at it/);
    expect(marker(loadedLate).text).not.toMatch(/prompt pointed/);
  });

  it("tells loaded from never loaded by words and by look, not only by color", () => {
    const a = marker(loadedLate);
    const b = marker(neverLoaded);
    expect(a.text).not.toBe(b.text);
    expect(a.cls).not.toBe(b.cls);
  });

  it("shows nothing for a run with no skill, or one from before skills were recorded", () => {
    expect(marker(none).text).toBe("");
    expect(marker({ promptNote: NOTE }).text).toBe(""); // a note with no skill is not a skill marker
  });

  it("never shows the skill's text or the prompt sentence itself", () => {
    expect(marker(loadedEarly).text).not.toContain("PROMPT-NOTE-SECRET");
    expect(marker(loadedEarly).text).not.toContain("use the demo-skill skill");
  });
});

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

  it("is in the open view", () => {
    const scene: SceneFactory = () => ({ show() {}, destroy() {} });
    render(RunView, { entry: entry("1", loadedLate), bundle: sampleBundle(), createScene: scene, onClose: () => {} });
    expect(screen.getByRole("region", { name: /run/i }).querySelector("[data-skill]")?.textContent).toMatch(/loaded after 47 calls/);
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
