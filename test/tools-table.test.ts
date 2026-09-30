import { describe, expect, it } from "vitest";
import { connect } from "./helpers/client.js";
import { makeWorld } from "./helpers/worlds.js";

describe("remove and clear tools", () => {
  it("are listed and return previews", async () => {
    const { client, call } = await connect(makeWorld());
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("remove");
    expect(names).toContain("clear");

    await call("place", { item: "a", row: 0, col: 0 });
    const removed = await call("remove", { row: 0, col: 0 });
    expect(removed.json).toMatchObject({ ok: true, craftable: null });
    expect(removed.json?.["grid"].flat().every((c: unknown) => c === null)).toBe(true);

    await call("place", { item: "a", row: 1, col: 1 });
    const cleared = await call("clear");
    expect(cleared.isError).toBe(false);
    expect(cleared.json?.["grid"].flat().every((c: unknown) => c === null)).toBe(true);
  });

  it("report each refusal with the documented shape", async () => {
    const { call } = await connect(makeWorld());
    await call("place", { item: "c", row: 0, col: 0 });
    const cases: [string, Record<string, unknown>, string][] = [
      ["place", { item: "a", row: 5, col: 0 }, "out_of_bounds"],
      ["place", { item: "a", row: 0, col: 0 }, "cell_occupied"],
      ["place", { item: "c", row: 1, col: 1 }, "not_in_inventory"],
      ["place", { item: "nope", row: 1, col: 1 }, "unknown_item"],
      ["remove", { row: 2, col: 2 }, "cell_empty"],
      ["remove", { row: -1, col: 0 }, "out_of_bounds"],
    ];
    for (const [tool, args, code] of cases) {
      const res = await call(tool, args);
      expect(res.isError, `${tool} ${code}`).toBe(true);
      expect(Object.keys(res.json ?? {})).toEqual(["ok", "error", "message"]);
      expect(res.json?.["error"]).toBe(code);
    }
    await call("clear");
    const nothing = await call("craft");
    expect(nothing.json?.["error"]).toBe("nothing_to_craft");
  });

  it("rejects a non-integer row as an input error, not a game refusal", async () => {
    const { call, game } = await connect(makeWorld());
    const res = await call("place", { item: "a", row: "x", col: 0 });
    expect(res.isError).toBe(true);
    expect(res.json?.["error"]).toBeUndefined();
    expect(game.count("a")).toBe(4);
  });
});
