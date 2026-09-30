import { describe, expect, it } from "vitest";
import { connect } from "./helpers/client.js";
import { makeWorld } from "./helpers/worlds.js";

describe("place and craft tools", () => {
  it("lists place and craft", async () => {
    const { client } = await connect(makeWorld());
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("place");
    expect(names).toContain("craft");
  });

  it("place returns a preview with the grid and what could be made", async () => {
    const { call } = await connect(makeWorld());
    await call("place", { item: "a", row: 0, col: 0 });
    const res = await call("place", { item: "a", row: 0, col: 1 });
    expect(res.isError).toBe(false);
    expect(Object.keys(res.json ?? {})).toEqual(["ok", "grid", "craftable"]);
    expect(res.json).toMatchObject({ ok: true, craftable: "d" });
    expect(res.json?.["grid"][0]).toEqual(["a", "a", null]);
  });

  it("craft returns what was made", async () => {
    const { call } = await connect(makeWorld());
    await call("place", { item: "a", row: 0, col: 0 });
    await call("place", { item: "a", row: 0, col: 1 });
    const res = await call("craft");
    expect(res.isError).toBe(false);
    expect(res.json).toEqual({ ok: true, crafted: { item: "d", qty: 1 } });
  });

  it("marks a refusal with a stable code and the error flag", async () => {
    const { call } = await connect(makeWorld());
    const res = await call("place", { item: "a", row: 99, col: 0 });
    expect(res.isError).toBe(true);
    expect(Object.keys(res.json ?? {})).toEqual(["ok", "error", "message"]);
    expect(res.json).toMatchObject({ ok: false, error: "out_of_bounds" });

    const nothing = await call("craft");
    expect(nothing.isError).toBe(true);
    expect(nothing.json).toMatchObject({ ok: false, error: "nothing_to_craft" });
  });
});
