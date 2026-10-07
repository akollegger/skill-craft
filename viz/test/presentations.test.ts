import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Picker from "../src/shell/Picker.svelte";
import Thumbnail from "../src/shell/Thumbnail.svelte";
import { groupRuns } from "../src/state/group.ts";
import { outcomeWord } from "../src/shell/tone.ts";
import type { CatalogEntry } from "../../src/viz/contract.ts";

const grid = (n: number): (string | null)[][] => Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => ((r + c) % 3 === 0 ? "stick" : null)));
let n = 0;
const run = (attributes: CatalogEntry["attributes"], strip = "pcrt.", table = grid(3)): CatalogEntry => {
  const id = (n++).toString(16).padStart(16, "0");
  return { id, kind: "run", status: "ready", attributes, preview: { strip, table }, bundle: `bundles/${id}/` };
};
const runs = [
  run({ label: "alpha", run: "001", world: "forge", outcome: "reached", actionCalls: 5, bestCalls: 3, modelRan: "claude-haiku", durationMs: 65_000 }),
  run({ label: "alpha", run: "002", world: "forge", outcome: "gave up", actionCalls: 90, modelRan: "claude-sonnet" }, "p".repeat(200)),
  run({ label: "beta", run: "001", world: "workshop", outcome: "out of turns", actionCalls: 40 }, "rrrr", grid(6)),
];
const picker = (presentation: "grid" | "list", onOpen = () => {}) => ({ groups: groupRuns(runs, null), presentation, onOpen });
const order = () => [...document.querySelectorAll("[data-run-id]")].map((e) => e.getAttribute("data-run-id"));

const requested: string[] = [];
let fills = 0;
beforeEach(() => {
  requested.length = 0;
  fills = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, kind: string) {
    requested.push(kind);
    return { fillStyle: "", clearRect() {}, fillRect() { fills++; }, imageSmoothingEnabled: false } as never;
  } as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("grid and list", () => {
  it("show the same runs in the same order", () => {
    render(Picker, picker("list"));
    const list = order();
    cleanup();
    render(Picker, picker("grid"));
    expect(order()).toEqual(list);
    expect(list).toEqual(runs.map((r) => r.id));
  });

  it("show outcome, calls, model and a thumbnail on a tile and on a row", () => {
    for (const presentation of ["grid", "list"] as const) {
      render(Picker, picker(presentation));
      const first = document.querySelector(`[data-run-id="${runs[0]!.id}"]`) as HTMLElement;
      for (const text of [presentation === "grid" ? "eventual craft" : "5 calls", "5 calls", presentation === "grid" ? "haiku" : "claude-haiku"]) expect(first.textContent, `${presentation} ${text}`).toContain(text);
      // The best run is never written out: the numeral, in its color, says how the run did.
      expect(first.textContent).not.toContain("best");
      expect(first.querySelector("canvas")).not.toBeNull();
      cleanup();
    }
  });

  it("says how each run ended in a word, in the color of its score", () => {
    render(Picker, picker("grid"));
    const word = (i: number) => (document.querySelector(`[data-run-id="${runs[i]!.id}"]`) as HTMLElement).querySelector("[data-outcome]") as HTMLElement;
    expect(word(0).textContent).toBe("eventual craft");
    expect(word(0).className).toMatch(/text-mid-marigold/); // reached in 5 calls, past the best 3: yellow, like its score
    expect(word(2).textContent).toBe("expired craft");
    expect(word(2).className).toMatch(/text-mid-hibiscus/); // a failure: red
  });

  it("names each ending as a craft: master within the ideal, eventual past it, abandoned, expired", () => {
    expect(outcomeWord("reached", 3, 3)).toBe("master craft");
    expect(outcomeWord("reached", 4, 3)).toBe("eventual craft");
    expect(outcomeWord("reached", 4, undefined)).toBe("master craft"); // no known ideal: nothing to be past
    expect(outcomeWord("gave up", 9, 3)).toBe("abandoned craft");
    expect(outcomeWord("out of turns", 9, 3)).toBe("expired craft");
    expect(outcomeWord("unfinished", 1, 3)).toBe("");
    expect(outcomeWord("error", 0, 3)).toBe("error");
  });

  it("draws the call tape in the list's Outcome column, one mark per call in the playback pips' colors, and none on a tile", () => {
    render(Picker, picker("list"));
    const first = document.querySelector(`[data-run-id="${runs[0]!.id}"]`) as HTMLElement;
    const marks = [...first.querySelectorAll("[data-kind]")];
    expect(marks.map((m) => m.getAttribute("data-kind"))).toEqual(["place", "craft", "refusal", "take-back", "no change"]);
    // The best run is 3 calls and this one reached its goal in 5: green up to 3, then yellow.
    expect(marks.map((m) => m.getAttribute("data-tone"))).toEqual(["ok", "ok", "ok", "over", "over"]);
    expect(within(first).getByRole("img", { name: /5 calls: 1 placements, 1 crafts, 1 refusals, 1 take-backs/ })).toBeTruthy();
    cleanup();
    render(Picker, picker("grid"));
    expect(document.querySelectorAll("[data-kind]")).toHaveLength(0);
  });

  it("makes the last mark of a failed run red, and cuts a very long tape to three rows that say how many calls the cut hides", () => {
    render(Picker, picker("list"));
    const failedRun = document.querySelector(`[data-run-id="${runs[2]!.id}"]`) as HTMLElement;
    expect([...failedRun.querySelectorAll("[data-kind]")].map((m) => m.getAttribute("data-tone"))).toEqual(["ok", "ok", "ok", "fail"]);
    const long = document.querySelector(`[data-run-id="${runs[1]!.id}"]`) as HTMLElement;
    const marks = long.querySelectorAll("[data-kind]").length;
    expect(marks + 6).toBe(96);
    expect(long.textContent).toContain(`+${200 - marks}`);
    expect(within(long).getByRole("img", { name: /^200 calls/ })).toBeTruthy();
  });

  it("gives the list's tapes one block, so every row is one height", () => {
    render(Picker, picker("list"));
    const grids = [...document.querySelectorAll('[role="img"][aria-label*="calls"]')].map((t) => t.className);
    expect(new Set(grids).size).toBe(1);
  });
});

describe("thumbnails", () => {
  it("are drawn into 2D canvases, once each, and never ask for WebGL", () => {
    render(Picker, picker("grid"));
    expect(document.querySelectorAll("canvas")).toHaveLength(3);
    expect(requested).toEqual(["2d", "2d", "2d"]);
    const after = fills;
    expect(after).toBeGreaterThan(0);
    render(Picker, picker("list")); // a second view of the same runs draws its own, still 2D
    expect(requested.every((k) => k === "2d")).toBe(true);
  });

  it("are not redrawn when the page re-renders around them", async () => {
    const view = render(Picker, picker("grid"));
    const drawn = fills;
    await view.rerender(picker("grid"));
    expect(fills).toBe(drawn);
  });

  it("are one size for every run: a 48-pixel slot in a tile, and 36 pixels in a row", () => {
    const { container } = render(Thumbnail, { goal: "stick", reached: true });
    const c = container.querySelector("canvas")!;
    expect([c.width, c.height]).toEqual([48, 48]);
    cleanup();
    const compact = render(Thumbnail, { goal: "stick", reached: true, compact: true }).container.querySelector("canvas")!;
    expect([compact.width, compact.height]).toEqual([36, 36]);
  });

  it("show the goal for every run, reached or not, so runs for one goal look alike", () => {
    const reached = render(Thumbnail, { goal: "stick", reached: true });
    expect(screen.getByRole("img", { name: /goal: stick, reached/i })).toBeTruthy();
    reached.unmount();
    render(Thumbnail, { goal: "stick", reached: false });
    expect(screen.getByRole("img", { name: /goal: stick, not reached/i })).toBeTruthy();
  });

  it("are an empty slot, with a label that says so, when a run does not name its goal", () => {
    const { container } = render(Thumbnail, {});
    expect(screen.getByRole("img", { name: /goal is not named/i })).toBeTruthy();
    expect(container.querySelector("canvas")!.width).toBe(48);
  });

  it("do not depend on how the run ended: the same goal draws the same slot size and the same pixels' places", () => {
    const places = (reached: boolean): string[] => {
      const seen: string[] = [];
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({ fillStyle: "", clearRect() {}, fillRect(x: number, y: number, w: number, h: number) { seen.push(`${x},${y},${w},${h}`); } })) as never);
      render(Thumbnail, { goal: "stick", reached });
      cleanup();
      return seen;
    };
    expect(places(false)).toEqual(places(true));
  });
});

describe("tiles", () => {
  it("are buttons, so the keyboard reaches them; arrows move between them and Enter is the button's own", async () => {
    const onOpen = vi.fn();
    render(Picker, picker("grid", onOpen));
    const tiles = screen.getAllByRole("button");
    expect(tiles).toHaveLength(3);
    for (const t of tiles) expect(t.tagName).toBe("BUTTON");
    tiles[0]!.focus();
    await fireEvent.keyDown(tiles[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tiles[1]);
    await fireEvent.keyDown(tiles[1]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tiles[0]);
    await fireEvent.click(tiles[2]!);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("show why a run cannot be opened, and have no button", () => {
    const broken: CatalogEntry = { id: "ffffffffffffffff", kind: "run", status: "unreadable", reason: "WorldMissing: the world file the run used is missing or does not load", attributes: { label: "x", run: "9" } };
    render(Picker, { groups: groupRuns([broken], null), presentation: "grid", onOpen: () => {} });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.body.textContent).toContain("the world file the run used is missing");
  });
});

describe("a tile's layout", () => {
  it("puts the thumbnail on the left and a large score on the right, in one row, with no name written out", () => {
    render(Picker, picker("grid"));
    const tile = document.querySelector(`[data-run-id="${runs[0]!.id}"]`) as HTMLElement;
    const canvas = tile.querySelector("canvas")!;
    const score = tile.querySelector(".font-score") as HTMLElement;
    expect(canvas.parentElement).toBe(score.parentElement!.parentElement); // the same row
    const row = canvas.parentElement!;
    expect(row.firstElementChild).toBe(canvas); // thumbnail first (left)
    expect(row.lastElementChild!.contains(score)).toBe(true); // score last (right)
    expect(score.className).toMatch(/text-6xl/); // larger than a list row's numeral
    expect(row.className).toMatch(/justify-between/);
    // The name is not drawn; it is the tile's tooltip and what a screen reader says first.
    expect(tile.querySelector("bdi")).toBeNull();
    expect(tile.querySelector("button")!.getAttribute("title")).toBe("alpha / 001");
  });

  it("puts the time under the score, in the right column beside the thumbnail, and nothing when it was not measured", () => {
    render(Picker, picker("grid"));
    const tile = document.querySelector(`[data-run-id="${runs[0]!.id}"]`) as HTMLElement;
    const score = tile.querySelector(".font-score") as HTMLElement;
    const time = [...score.parentElement!.children].find((c) => c.textContent === "1:05") as HTMLElement;
    expect(time).toBeTruthy();
    expect(score.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(time.className).toMatch(/text-3xl/);
    expect(score.parentElement!.className).toMatch(/justify-between/); // score at the top, time at the bottom
    expect(score.parentElement!.className).toMatch(/self-stretch/); // as tall as the thumbnail
    const bare = document.querySelector(`[data-run-id="${runs[2]!.id}"]`) as HTMLElement;
    expect(bare.querySelector(".font-score")!.parentElement!.children).toHaveLength(1);
  });

  it("colors the score like a list row's, and says nothing but the number", () => {
    render(Picker, picker("grid"));
    const tile = document.querySelector(`[data-run-id="${runs[0]!.id}"]`) as HTMLElement;
    expect(tile.querySelector(".font-score")!.className).toMatch(/text-mid-marigold/); // reached in 5 calls, past the best 3: yellow
  });
});


describe("a tile's lower rows", () => {
  it("has the outcome word, then the model in short, with the skill icon at the right of the same row", () => {
    const withSkill = [run({ label: "s", run: "1", outcome: "reached", actionCalls: 5, modelRan: "claude-haiku-4-5-20251001", skill: "demo", skillLoaded: true, skillLoadedAfter: 1 }, "pcr")];
    render(Picker, { groups: groupRuns(withSkill, null), presentation: "grid", onOpen: () => {} });
    const tile = document.querySelector(`[data-run-id="${withSkill[0]!.id}"]`) as HTMLElement;
    const word = tile.querySelector("[data-outcome]") as HTMLElement;
    const model = [...tile.querySelectorAll("span")].find((e) => e.textContent === "haiku-4-5") as HTMLElement;
    expect(model.getAttribute("title")).toBe("claude-haiku-4-5-20251001");
    expect(word.compareDocumentPosition(model) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(model.parentElement!.lastElementChild).toBe(tile.querySelector("svg[data-skill]"));
    expect(model.parentElement!.className).toMatch(/justify-between/);
  });

  it("is one height for every run: the outcome and model rows keep their height with no word and no skill", () => {
    render(Picker, picker("grid"));
    const rows = [...document.querySelectorAll("li[data-run-id] button .h-6")];
    expect(rows.length).toBeGreaterThan(2 * 1);
    const bare = [run({ label: "n", run: "1" })];
    cleanup();
    render(Picker, { groups: groupRuns(bare, null), presentation: "grid", onOpen: () => {} });
    expect(document.querySelectorAll("li[data-run-id] button .h-6")).toHaveLength(2); // the outcome row and the model row, even when empty
  });
});
