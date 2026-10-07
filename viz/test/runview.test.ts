import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunView from "../src/shell/RunView.svelte";
import { formatClock } from "../src/shell/clock.ts";
import type { SceneFactory, SceneHandle } from "../src/scene/handle.ts";
import { emptyBundle, sampleBundle, sampleEntry } from "./helpers/bundle.ts";
import { defaultItemArt } from "../src/art/index.ts";

function stubScene() {
  const shows: { index: number; effects: unknown[] }[] = [];
  let destroyed = 0;
  const factory: SceneFactory = () => ({ show: (_frames: unknown, index: number, effects: unknown[]) => void shows.push({ index, effects }), destroy: () => void destroyed++ }) as SceneHandle;
  return { factory, shows, destroyed: () => destroyed };
}

const open = (over: Partial<Parameters<typeof render<typeof RunView>>[1]> = {}) => {
  const scene = stubScene();
  const onClose = vi.fn();
  const view = render(RunView, { entry: sampleEntry, bundle: sampleBundle(), createScene: scene.factory, onClose, ...over });
  return { scene, onClose, ...view };
};
const step = async (n = 1) => { for (let i = 0; i < n; i++) await fireEvent.click(screen.getByRole("button", { name: /step forward/i })); };
const score = () => screen.getByLabelText(/calls so far/i).textContent?.trim();

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the open run's item art", () => {
  const drawn = { legend: { ".": null, a: "woodFace" }, items: { d: { rows: Array(8).fill("aaaaaaaa") } } };

  it("gives its scene the art its bundle carries, so the table draws what the thumbnail draws", () => {
    const seen: { art?: (n: string) => { pixels: (number | null)[]; palette: number } }[] = [];
    const factory: SceneFactory = (_host, options) => {
      seen.push(options as never);
      return { show() {}, destroy() {} } as SceneHandle;
    };
    const bundle = sampleBundle();
    bundle.manifest.art = drawn;
    render(RunView, { entry: sampleEntry, bundle, createScene: factory, onClose: vi.fn() });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.art!("d").palette).toBe(-1); // drawn, not a glyph
    expect(seen[0]!.art!("d").pixels.every((p) => p !== null)).toBe(true);
  });

  it("falls back to the name-only art for a bundle with none", () => {
    const seen: { art?: (n: string) => unknown }[] = [];
    const factory: SceneFactory = (_host, options) => {
      seen.push(options as never);
      return { show() {}, destroy() {} } as SceneHandle;
    };
    render(RunView, { entry: sampleEntry, bundle: sampleBundle(), createScene: factory, onClose: vi.fn() });
    expect(seen[0]!.art!("d")).toEqual(defaultItemArt("d"));
  });
});

describe("the open run", () => {
  it("opens at its start state, paused, with the goal and the best possible call count", () => {
    open();
    expect(score()).toBe("0");
    expect(screen.getByRole("button", { name: /^play$/i })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Make 1 d");
    expect(screen.getByRole("group", { name: /best possible/i }).getAttribute("aria-label")).toContain("3");
    expect(screen.getByRole("status").textContent).toContain("Working it out.");
    expect(within(screen.getByRole("list", { name: /calls/i })).queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByRole("slider")).toBeNull(); // the counter and the pips replace the slider
  });

  it("shows the state at the playhead as it is stepped", async () => {
    open();
    await step();
    expect(score()).toBe("1");
    expect(within(screen.getByRole("list", { name: /calls/i })).getAllByRole("listitem")).toHaveLength(1);
    await step(3);
    expect(score()).toBe("3");
    expect(within(screen.getByRole("list", { name: /calls/i })).getAllByRole("listitem")).toHaveLength(4);
  });

  it("lists the calls newest first, at most nine", async () => {
    open();
    await step(6);
    const items = within(screen.getByRole("list", { name: /calls/i })).getAllByRole("listitem");
    expect(items[0]!.textContent).toContain("take back");
    expect(items.at(-1)!.textContent).toContain("place a");
  });

  it("makes refusals, crafts, placements, take-backs and reads look different", async () => {
    open();
    await step(6);
    const items = within(screen.getByRole("list", { name: /calls/i })).getAllByRole("listitem");
    const byKind = Object.fromEntries(items.map((li) => [li.getAttribute("data-kind"), li.className]));
    expect(Object.keys(byKind).sort()).toEqual(["craft", "place", "read", "refusal", "take-back"]);
    expect(new Set(Object.values(byKind)).size).toBe(5);
    expect(items.find((li) => li.getAttribute("data-kind") === "refusal")!.textContent).toContain("unknown_item");
  });

  it("shows the call count against the best run, and the time of the step", async () => {
    open();
    await step(5);
    expect(screen.getByRole("group", { name: /best possible/i }).getAttribute("aria-label")).toMatch(/4 of 3/);
    expect(screen.getByLabelText(/time of this step/i).textContent).toBe("8.2s");
  });

  it("says plainly when the goal is reached, and announces it", async () => {
    open();
    await step(4);
    expect(screen.getByRole("status").textContent).toContain("Got it");
    expect(screen.getByLabelText(/calls so far/i).getAttribute("aria-live")).toBe("polite");
  });

  it("shows the outcome and the cost at the end of the run", async () => {
    open();
    await step(6);
    expect(screen.getByRole("status").textContent).toMatch(/Got it in 3 calls\. The best possible is 3\./);
    const spent = screen.getByRole("list", { name: /spent/i });
    expect(spent.textContent).toContain("$0.058");
    expect(spent.textContent).toContain("1:05");
  });

  it("shows what the run spent as small stats under the score and the clock, with no label words on screen and the words for a tooltip", () => {
    open();
    const items = [...screen.getByRole("list", { name: /spent/i }).querySelectorAll("li")] as HTMLElement[];
    expect(items.length).toBe(6); // cost, time, and four token counts
    expect(items.map((i) => i.getAttribute("title"))).toEqual(["Cost", "Time for the whole run", "Input tokens", "Output tokens", "Cache read tokens", "Cache write tokens"]);
    // The words are there for a screen reader and hidden from the eye.
    for (const i of items) expect(i.querySelector(".sr-only")).not.toBeNull();
    const counter = screen.getByLabelText(/calls so far/i);
    const stats = screen.getByRole("list", { name: /spent/i });
    expect(counter.closest("div")).toBe(stats.parentElement); // the same column
    expect(counter.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no stats, and no footer, for a run whose time and tokens were not measured", () => {
    open({ bundle: emptyBundle() });
    expect(screen.queryByRole("list", { name: /spent/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/No timing/);
  });

  it("puts the controls at the left of the table and the score at its right, in side columns of equal width, with the pips above the table", () => {
    open();
    const grid = screen.getByRole("group", { name: /playback/i }).closest(".grid") as HTMLElement;
    expect(grid.className).toMatch(/grid-cols-\[(\S+)_minmax\(0,1fr\)_\1\]/); // the same width at both sides, the middle taking what is left
    const cells = [...grid.children] as HTMLElement[];
    const at = (el: Element) => cells.findIndex((c) => c.contains(el));
    const table = screen.getByRole("img", { name: /crafting table/i });
    const controls = screen.getByRole("group", { name: /playback/i });
    const counter = screen.getByLabelText(/calls so far/i);
    const pips = document.querySelector("[data-pip]")!;
    expect(at(controls)).toBeLessThan(at(table));
    expect(at(table)).toBeLessThan(at(counter));
    expect(at(pips)).toBeLessThan(at(table)); // above it
    expect(cells[at(pips)]!.className).toMatch(/col-start-2/); // in the table's column
  });

  it("says a run that never reached the goal gave up, ran out of turns, or failed", async () => {
    for (const [ended, text] of [["stopped", /Gave up after 5 calls, without the item/], ["budget", /Out of turns after 5 calls, without the item/], ["error", /ended with an error after 5 calls/]] as const) {
      const { unmount } = open({ bundle: sampleBundle({ ended, reached: false }) });
      await step(6);
      expect(screen.getByRole("status").textContent, ended).toMatch(text);
      unmount();
    }
  });

  it("opens a run with zero calls at its start state and shows its outcome", () => {
    open({ bundle: emptyBundle() });
    expect(score()).toBe("0");
    expect((screen.getByRole("button", { name: /^play$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/Gave up after 0 calls/);
  });

  it("shows no recipe: only the calls the run made", async () => {
    open();
    await step(6);
    expect(document.body.textContent).not.toMatch(/recipe/i);
    expect(document.body.textContent).not.toMatch(/shapeless|shaped/i);
  });

  it("shows the run's name and its model", () => {
    open();
    expect(document.body.textContent).toContain("lab / 001");
    expect(document.body.textContent).toContain("claude-x");
  });
});

describe("controls", () => {
  it("steps back, restarts and scrubs", async () => {
    open();
    await step(3);
    await fireEvent.click(screen.getByRole("button", { name: /step back/i }));
    expect(score()).toBe("2");
    await fireEvent.click(screen.getByRole("button", { name: /jump to end/i }));
    expect(score()).toBe("5");
    await fireEvent.click(screen.getByRole("button", { name: /jump to start/i }));
    expect(score()).toBe("0");
  });

  it("plays at the pace the calls had, with long pauses cut", async () => {
    vi.useFakeTimers();
    open();
    await fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    expect(screen.getByRole("button", { name: /^pause$/i })).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2000); // the first call took 4.2 s: capped at 2 s
    expect(score()).toBe("1");
    await vi.advanceTimersByTimeAsync(1000);
    expect(score()).toBe("2");
    await fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(score()).toBe("2");
  });

  it("answers the keyboard: arrows step, space plays, r restarts, Escape closes", async () => {
    const { onClose } = open();
    const root = screen.getByRole("region", { name: /run/i });
    await fireEvent.keyDown(root, { key: "ArrowRight" });
    await fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(score()).toBe("2");
    await fireEvent.keyDown(root, { key: "ArrowLeft" });
    expect(score()).toBe("1");
    await fireEvent.keyDown(root, { key: " " });
    expect(screen.getByRole("button", { name: /^pause$/i })).toBeTruthy();
    await fireEvent.keyDown(root, { key: "r" });
    expect(score()).toBe("0");
    await fireEvent.keyDown(root, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has every control reachable by keyboard: native buttons, none with a negative tabindex, and the pips as one tab stop", () => {
    open();
    const controls = [...document.querySelectorAll("button, input, [tabindex]")].filter((c) => !c.hasAttribute("data-pip")) as HTMLElement[];
    expect(controls.length).toBeGreaterThanOrEqual(6);
    for (const c of controls) expect(c.tabIndex, c.outerHTML.slice(0, 60)).toBeGreaterThanOrEqual(0);
    expect(screen.getByRole("button", { name: /close/i })).toBeTruthy();
    // The pips are buttons with a name, and only one of them is in the tab order.
    const pips = [...document.querySelectorAll("[data-pip]")] as HTMLElement[];
    expect(pips.every((p) => p.tagName === "BUTTON" && /^Call \d+: /.test(p.getAttribute("aria-label") ?? ""))).toBe(true);
    expect(pips.filter((p) => p.tabIndex === 0)).toHaveLength(1);
  });

  it("closes with the close button", async () => {
    const { onClose } = open();
    await fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("the scene", () => {
  it("is told the frames, the position and the effects of each single step, and none for a scrub", async () => {
    const { scene } = open();
    await step();
    expect(scene.shows.at(-1)).toMatchObject({ index: 1, effects: [{ kind: "place", item: "a" }] });
    await fireEvent.click(screen.getByRole("button", { name: /jump to end/i }));
    expect(scene.shows.at(-1)).toMatchObject({ index: sampleBundle().frames.length - 1, effects: [] });
  });

  it("is destroyed when the view closes", () => {
    const { scene, unmount } = open();
    unmount();
    expect(scene.destroyed()).toBe(1);
  });
});

describe("motion", () => {
  const decor = () => document.querySelectorAll('[class*="animate-"]').length;

  it("adds decorative motion when the goal is reached, unless motion is reduced", async () => {
    open();
    await step(4);
    expect(decor()).toBeGreaterThan(0);
    cleanup();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));
    open();
    await step(4);
    expect(decor()).toBe(0);
    expect(screen.getByRole("status").textContent).toContain("Got it"); // the state change still shows
    expect(score()).toBe("3");
  });
});

describe("formatClock", () => {
  it("reads seconds to a tenth under a minute, and minutes and seconds above", () => {
    expect(formatClock(0)).toBe("0.0s");
    expect(formatClock(4200)).toBe("4.2s");
    expect(formatClock(59_940)).toBe("59.9s");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(600_000)).toBe("10:00");
  });
});

describe("the steps and the counter", () => {
  const pips = () => [...document.querySelectorAll("[data-pip]")] as HTMLElement[];

  it("draws a pip for every action call, none cut off, the calls made in the playback colors and the rest muted gray", async () => {
    open();
    expect(pips()).toHaveLength(5);
    expect(pips().every((p) => p.getAttribute("data-pip") === "to-come" && /bg-dark-gray/.test(p.className))).toBe(true);
    await step(5); // four action calls made; the best run is 3
    expect(pips().map((p) => p.getAttribute("data-pip"))).toEqual(["ok", "ok", "ok", "over", "to-come"]);
    expect(pips()[4]!.className).toMatch(/bg-dark-gray/);
  });

  it("keeps the one tab stop on the latest call made and names it as the current step", async () => {
    open();
    await step(2);
    const current = pips().filter((p) => p.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(pips().filter((p) => p.tabIndex === 0)).toEqual(current);
    expect(pips().indexOf(current[0]!)).toBe(Number(score()) - 1);
  });

  it("marks the latest call made, so a step shows as a move along the strip", async () => {
    open();
    expect(pips().some((p) => /ring-/.test(p.className))).toBe(false);
    await step(2);
    const marked = pips().filter((p) => /ring-/.test(p.className));
    expect(marked).toHaveLength(1);
    expect(pips().indexOf(marked[0]!)).toBe(Number(score()) - 1);
  });

  it("shows the table after a call when its pip is clicked", async () => {
    open();
    await fireEvent.click(pips()[3]!);
    expect(score()).toBe("4");
    await fireEvent.click(pips()[0]!);
    expect(score()).toBe("1");
  });

  it("tells each pip's call in its tooltip", () => {
    open();
    expect(pips()[0]!.getAttribute("title")).toMatch(/place/);
  });

  it("does not scrub from the pips: pulling across them moves nothing", async () => {
    open();
    await step(2);
    const before = score();
    await fireEvent.pointerDown(pips()[0]!, { clientX: 0, pointerId: 1 });
    await fireEvent.pointerMove(pips()[0]!, { clientX: 200, pointerId: 1 });
    await fireEvent.pointerUp(pips()[0]!, { clientX: 200, pointerId: 1 });
    expect(score()).toBe(before);
  });

  it("scrubs when the counter is pulled: right goes forward, left goes back, and a release stops it", async () => {
    open();
    await step(1);
    const start = Number(score());
    const counter = document.querySelector("[data-counter]") as HTMLElement;
    await fireEvent.pointerDown(counter, { clientX: 100, pointerId: 1 });
    await fireEvent.pointerMove(counter, { clientX: 124, pointerId: 1 }); // 24 pixels is two calls of five, at 12 pixels each
    expect(score()).toBe(String(start + 2));
    await fireEvent.pointerMove(counter, { clientX: 100, pointerId: 1 });
    expect(score()).toBe(String(start));
    await fireEvent.pointerMove(counter, { clientX: 76, pointerId: 1 });
    expect(score()).toBe("0"); // pulled back past the start: stops at it
    await fireEvent.pointerUp(counter, { clientX: 76, pointerId: 1 });
    await fireEvent.pointerMove(counter, { clientX: 400, pointerId: 1 });
    expect(score()).toBe("0"); // released: no longer following the pointer
  });

  it("jumps to the start and the end with its buttons and with Home and End", async () => {
    open();
    const region = screen.getByRole("region", { name: /run/i });
    await fireEvent.keyDown(region, { key: "End" });
    expect(score()).toBe("5");
    await fireEvent.keyDown(region, { key: "Home" });
    expect(score()).toBe("0");
    await step(3);
    await fireEvent.click(screen.getByRole("button", { name: /jump to start/i }));
    expect(score()).toBe("0");
    await fireEvent.click(screen.getByRole("button", { name: /jump to end/i }));
    expect(score()).toBe("5");
  });

  it("stops playing when it jumps", async () => {
    open();
    await fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    await fireEvent.click(screen.getByRole("button", { name: /jump to start/i }));
    expect(screen.getByRole("button", { name: /^play$/i })).toBeTruthy();
  });
});
