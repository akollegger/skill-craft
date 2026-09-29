import { describe, expect, it } from "vitest";
import { loadWorld } from "../src/sim/loader.js";
import { connect } from "./helpers/client.js";

describe("swapping worlds needs no code change", () => {
  it("shows each world's own table size and starting stock", async () => {
    const small = loadWorld("test/fixtures/valid/tiny-2x2.json");
    const large = loadWorld("test/fixtures/valid/large-6x6.json");

    const one = await connect(small);
    const two = await connect(large);

    expect((await one.call("help")).json?.["world"].grid).toEqual({ rows: 2, cols: 2 });
    expect((await two.call("help")).json?.["world"].grid).toEqual({ rows: 6, cols: 6 });
    expect((await one.call("inventory")).json).toEqual({ items: small.stock });
    expect((await two.call("inventory")).json).toEqual({ items: large.stock });
  });

  it("plays each world by its own rules", async () => {
    const { call } = await connect(loadWorld("test/fixtures/valid/tiny-2x2.json"));
    await call("place", { item: "a", row: 0, col: 0 });
    const res = await call("place", { item: "a", row: 1, col: 1 });
    expect(res.json).toMatchObject({ craftable: "b" });
    expect((await call("craft")).json).toEqual({ ok: true, crafted: { item: "b", qty: 1 } });
  });
});
