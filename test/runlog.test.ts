import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/engine.js";
import { createRunLog, RunLog, RunLogInUseError, summarize } from "../src/sim/runlog.js";
import { connect } from "./helpers/client.js";
import { makeWorld } from "./helpers/worlds.js";

const tmp = () => mkdtempSync(join(tmpdir(), "skill-craft-"));

/** A fixed script with refusals in it. */
function script(game: Game): void {
  game.place("a", 0, 0);
  game.place("a", 0, 0); // cell_occupied
  game.craft(); // nothing_to_craft
  game.place("a", 0, 1);
  game.craft(); // makes d
}

describe("run log entries", () => {
  it("records every call in order, refusals included", () => {
    const game = new Game(makeWorld());
    script(game);
    expect(game.log.entries).toEqual([
      { seq: 1, tool: "place", args: { item: "a", row: 0, col: 0 }, ok: true },
      { seq: 2, tool: "place", args: { item: "a", row: 0, col: 0 }, ok: false, error: "cell_occupied" },
      { seq: 3, tool: "craft", args: {}, ok: false, error: "nothing_to_craft" },
      { seq: 4, tool: "place", args: { item: "a", row: 0, col: 1 }, ok: true },
      { seq: 5, tool: "craft", args: {}, ok: true, crafted: { item: "d", qty: 1 } },
    ]);
  });

  it("logs the read-only tools too, with empty arguments", () => {
    const game = new Game(makeWorld());
    game.look();
    game.inventory();
    game.remove(1, 1); // cell_empty
    game.clear();
    expect(game.log.entries.map((e) => [e.tool, e.ok, e.error])).toEqual([
      ["look", true, undefined],
      ["inventory", true, undefined],
      ["remove", false, "cell_empty"],
      ["clear", true, undefined],
    ]);
  });

  it("writes keys in a fixed order", () => {
    const game = new Game(makeWorld());
    script(game);
    const keys = game.log.entries.map((e) => Object.keys(JSON.parse(JSON.stringify(e))));
    expect(keys[0]).toEqual(["seq", "tool", "args", "ok"]);
    expect(keys[1]).toEqual(["seq", "tool", "args", "ok", "error"]);
    expect(keys[4]).toEqual(["seq", "tool", "args", "ok", "crafted"]);
  });

  it("gives byte-identical logs when the same calls are replayed", () => {
    const one = new Game(makeWorld());
    const two = new Game(makeWorld());
    script(one);
    script(two);
    expect(one.log.toJsonl()).toBe(two.log.toJsonl());
    expect(one.log.toJsonl().split("\n").filter(Boolean)).toHaveLength(5);
  });

  it("holds no timestamps", () => {
    const game = new Game(makeWorld());
    script(game);
    expect(game.log.toJsonl()).not.toMatch(/time|date|at"/i);
  });
});

describe("run log file", () => {
  it("writes one JSON line per call", () => {
    const path = join(tmp(), "run.jsonl");
    const game = new Game(makeWorld(), { log: createRunLog(path) });
    script(game);
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => JSON.parse(l))).toEqual(JSON.parse(JSON.stringify(game.log.entries)));
  });

  it("refuses to start on a file that already holds data, and leaves it untouched (SC-011)", () => {
    for (const content of ['{"seq":1}\n', Array.from({ length: 200 }, (_, i) => JSON.stringify({ seq: i + 1 })).join("\n") + "\n"]) {
      const path = join(tmp(), "used.jsonl");
      writeFileSync(path, content);
      expect(() => createRunLog(path)).toThrow(RunLogInUseError);
      expect(() => createRunLog(path)).toThrow(path);
      expect(readFileSync(path, "utf8")).toBe(content);
    }
  });

  it("accepts a path that does not exist yet or an existing empty file", () => {
    const dir = tmp();
    expect(() => createRunLog(join(dir, "new.jsonl"))).not.toThrow();
    const empty = join(dir, "empty.jsonl");
    writeFileSync(empty, "");
    expect(() => createRunLog(empty)).not.toThrow();
  });

  it("keeps the log in memory only when no path is given", () => {
    const log = createRunLog();
    log.append({ tool: "look", args: {}, ok: true });
    expect(log.entries).toHaveLength(1);
  });

  it("makes the server exit non-zero, naming the path, when the log is already used", () => {
    const path = join(tmp(), "used.jsonl");
    writeFileSync(path, '{"seq":1}\n');
    const res = spawnSync(process.execPath, ["--import", "tsx", "src/mcp/server.ts"], {
      env: { ...process.env, SIM_WORLD: "test/fixtures/valid/tiny-2x2.json", SIM_RUN_LOG: path },
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(path);
    expect(readFileSync(path, "utf8")).toBe('{"seq":1}\n');
  });
});

describe("run log through the server (SC-010)", () => {
  it("counts a scripted run exactly as a hand count does", async () => {
    const log = createRunLog();
    const { call } = await connect(makeWorld(), { log });
    await call("help"); // 1
    await call("place", { item: "a", row: 0, col: 0 }); // 2
    await call("place", { item: "a", row: 0, col: 1 }); // 3
    await call("craft"); // 4 makes d
    await call("craft"); // 5 fails: nothing_to_craft
    await call("place", { item: "zzz", row: 0, col: 0 }); // 6 fails: unknown_item
    await call("inventory"); // 7

    expect(log.entries.map((e) => e.tool)).toEqual(["help", "place", "place", "craft", "craft", "place", "inventory"]);
    expect(summarize(log.entries)).toEqual({
      calls: 7,
      worldChanging: 5,
      craftsMade: 1,
      failedCrafts: 1,
      refusals: { nothing_to_craft: 1, unknown_item: 1 },
    });
  });

  it("records arguments as received and offers the agent no way to read the log", async () => {
    const log = new RunLog();
    const { client, call } = await connect(makeWorld(), { log });
    await call("place", { item: "b", row: 2, col: 1 });
    expect(log.entries[0]?.args).toEqual({ item: "b", row: 2, col: 1 });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names.some((n) => /log/i.test(n))).toBe(false);
  });
});
