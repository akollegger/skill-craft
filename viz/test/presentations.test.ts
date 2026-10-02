import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Picker from "../src/shell/Picker.svelte";
import Thumbnail from "../src/shell/Thumbnail.svelte";
import { groupRuns } from "../src/state/group.ts";
import type { CatalogEntry } from "../../src/viz/contract.ts";

const grid = (n: number): (string | null)[][] => Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => ((r + c) % 3 === 0 ? "stick" : null)));
let n = 0;
const run = (attributes: CatalogEntry["attributes"], strip = "pcrt.", table = grid(3)): CatalogEntry => {
  const id = (n++).toString(16).padStart(16, "0");
  return { id, kind: "run", status: "ready", attributes, preview: { strip, table }, bundle: `bundles/${id}/` };
};
const runs = [
  run({ label: "alpha", run: "001", world: "forge", outcome: "reached", actionCalls: 5, bestCalls: 3, modelRan: "claude-haiku" }),
  run({ label: "alpha", run: "002", world: "forge", outcome: "gave up", actionCalls: 90, modelRan: "claude-sonnet" }, "p".repeat(200)),
  run({ label: "beta", run: "001", world: "workshop", outcome: "out of turns", actionCalls: 40 }, "rrrr", grid(6)),
];
const picker = (presentation: "grid" | "list", onOpen = () => {}) => ({ groups: groupRuns(runs, null), presentation, showHeaders: false, onOpen });
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

  it("show outcome, calls, model, the call strip and a thumbnail on a tile and on a row", () => {
    for (const presentation of ["grid", "list"] as const) {
      render(Picker, picker(presentation));
      const first = document.querySelector(`[data-run-id="${runs[0]!.id}"]`) as HTMLElement;
      for (const text of ["reached", "5 calls", "best 3", "claude-haiku"]) expect(first.textContent, `${presentation} ${text}`).toContain(text);
      expect(within(first).getByRole("img", { name: /5 calls: 1 placements, 1 crafts, 1 refusals, 1 take-backs/ })).toBeTruthy();
      expect(first.querySelector("canvas")).not.toBeNull();
      cleanup();
    }
  });

  it("draws one mark per action call, in a color of its own for each kind", () => {
    render(Picker, picker("grid"));
    const first = document.querySelector(`[data-run-id="${runs[0]!.id}"]`) as HTMLElement;
    const marks = [...first.querySelectorAll("[data-kind]")];
    expect(marks.map((m) => m.getAttribute("data-kind"))).toEqual(["place", "craft", "refusal", "take-back", "no change"]);
    expect(new Set(marks.map((m) => m.className)).size).toBe(5);
  });

  it("cuts a very long strip but still counts every call", () => {
    render(Picker, picker("grid"));
    const long = document.querySelector(`[data-run-id="${runs[1]!.id}"]`) as HTMLElement;
    expect(long.querySelectorAll("[data-kind]").length).toBeLessThan(200);
    expect(long.textContent).toContain("+40");
    expect(within(long).getByRole("img", { name: /^200 calls/ })).toBeTruthy();
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

  it("scale to the grid: a 3×3 and a 6×6 table are both readable, and a large one still has cells of 8 pixels", () => {
    const size = (rows: number) => {
      const { container, unmount } = render(Thumbnail, { table: grid(rows) });
      const c = container.querySelector("canvas")!;
      const out = [c.width, c.height, c.width / rows];
      unmount();
      return out;
    };
    expect(size(3)).toEqual([72, 72, 24]);
    expect(size(6)).toEqual([96, 96, 16]);
    expect(size(9)).toEqual([72, 72, 8]);
    for (const rows of [2, 3, 4, 5, 6, 7, 9]) expect(size(rows)[2]).toBeGreaterThanOrEqual(8);
  });

  it("are smaller in a row, so a table fits its box", () => {
    const { container } = render(Thumbnail, { table: grid(3), compact: true });
    const c = container.querySelector("canvas")!;
    expect([c.width, c.height]).toEqual([48, 48]);
    expect(c.width).toBeLessThanOrEqual(56);
    cleanup();
    expect((render(Thumbnail, { table: grid(6), compact: true }).container.querySelector("canvas")!).width).toBe(48);
  });

  it("show the item made, large, for a run that reached its goal, and the table otherwise", () => {
    const { container } = render(Thumbnail, { table: grid(3), made: "stick" });
    const c = container.querySelector("canvas")!;
    expect([c.width, c.height]).toEqual([72, 72]);
    expect(screen.getByRole("img", { name: /item the run made: stick/i })).toBeTruthy();
  });

  it("have a text label", () => {
    render(Thumbnail, { table: grid(3) });
    expect(screen.getByRole("img", { name: /table/i })).toBeTruthy();
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
    render(Picker, { groups: groupRuns([broken], null), presentation: "grid", showHeaders: false, onOpen: () => {} });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.body.textContent).toContain("the world file the run used is missing");
  });
});
