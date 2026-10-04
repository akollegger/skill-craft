import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Picker from "../src/shell/Picker.svelte";
import { arrange, defaultView } from "../src/state/view.ts";
import type { CatalogEntry } from "../../src/viz/contract.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const many = (count: number): CatalogEntry[] =>
  Array.from({ length: count }, (_, i) => {
    const id = i.toString(16).padStart(16, "0");
    return {
      id, kind: "run", status: "ready", bundle: `bundles/${id}/`,
      attributes: { label: `exp-${i % 20}`, run: String(i).padStart(3, "0"), world: `world-${i % 5}`, outcome: i % 3 === 0 ? "reached" : "gave up", actionCalls: (i * 37) % 300, modelRan: i % 2 ? "haiku" : "sonnet", skillLoaded: i % 4 === 0 },
      preview: { strip: "pcrt".repeat(10), table: [["a", null, null], [null, "b", null], [null, null, "c"]] },
    } satisfies CatalogEntry;
  });

describe("a folder of hundreds of runs", () => {
  const runs = many(500);

  it("groups, sorts and searches 500 runs in well under 200 ms", () => {
    const t = performance.now();
    const groups = arrange(runs, { ...defaultView(), group: "world", sort: { attr: "actionCalls", dir: "desc" }, search: "exp" });
    const ms = performance.now() - t;
    expect(groups.reduce((n, g) => n + g.runs.length, 0)).toBeGreaterThan(400);
    expect(ms).toBeLessThan(200);
  });

  it("switches between grid and list without asking for a WebGL context", async () => {
    const asked: string[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (kind: string) {
      asked.push(kind);
      return { fillStyle: "", clearRect() {}, fillRect() {}, imageSmoothingEnabled: false } as never;
    } as never);
    const groups = arrange(runs.slice(0, 200), defaultView());
    const view = render(Picker, { groups, presentation: "grid", onOpen: () => {} });
    await view.rerender({ groups, presentation: "list", onOpen: () => {} });
    await view.rerender({ groups, presentation: "grid", onOpen: () => {} });
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked)).toEqual(new Set(["2d"]));
  });
});
