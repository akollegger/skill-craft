import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunView from "../src/shell/RunView.svelte";
import { formatClock } from "../src/shell/clock.ts";
import type { SceneFactory, SceneHandle } from "../src/scene/handle.ts";
import { emptyBundle, sampleBundle, sampleEntry } from "./helpers/bundle.ts";

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

describe("the open run", () => {
  it("opens at its start state, paused, with the goal and the best possible call count", () => {
    open();
    expect(score()).toBe("0");
    expect(screen.getByRole("button", { name: /^play$/i })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Make 1 d");
    expect(screen.getByRole("img", { name: /best possible/i }).getAttribute("aria-label")).toContain("3");
    expect(screen.getByRole("status").textContent).toContain("Working it out.");
    expect(within(screen.getByRole("list", { name: /calls/i })).queryAllByRole("listitem")).toHaveLength(0);
    expect((screen.getByRole("slider", { name: /position/i }) as HTMLInputElement).value).toBe("0");
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
    expect(screen.getByRole("img", { name: /best possible/i }).getAttribute("aria-label")).toMatch(/4 of 3/);
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
    const totals = screen.getByRole("group", { name: /totals/i }).textContent ?? "";
    expect(totals).toContain("$0.058");
    expect(totals).toContain("1:05");
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

  it("shows the run's name and its conditions, including the prior fit", () => {
    open();
    expect(document.body.textContent).toContain("lab / 001");
    expect(document.body.textContent).toContain("claude-x");
    expect(document.body.textContent).toContain("faithful");
  });
});

describe("controls", () => {
  it("steps back, restarts and scrubs", async () => {
    open();
    await step(3);
    await fireEvent.click(screen.getByRole("button", { name: /step back/i }));
    expect(score()).toBe("2");
    const slider = screen.getByRole("slider", { name: /position/i });
    await fireEvent.input(slider, { target: { value: "5" } });
    expect(score()).toBe("4");
    await fireEvent.click(screen.getByRole("button", { name: /restart/i }));
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

  it("has every control reachable by keyboard: native buttons and a slider, none with a negative tabindex", () => {
    open();
    const controls = [...document.querySelectorAll("button, input, [tabindex]")] as HTMLElement[];
    expect(controls.length).toBeGreaterThanOrEqual(6);
    for (const c of controls) expect(c.tabIndex, c.outerHTML.slice(0, 60)).toBeGreaterThanOrEqual(0);
    expect(screen.getByRole("button", { name: /close/i })).toBeTruthy();
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
    await fireEvent.input(screen.getByRole("slider", { name: /position/i }), { target: { value: "4" } });
    expect(scene.shows.at(-1)).toMatchObject({ index: 4, effects: [] });
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
