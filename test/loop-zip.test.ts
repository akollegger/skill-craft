import { describe, expect, it } from "vitest";
import { CandidateFailed } from "../src/harness/errors.js";
import { readZip } from "../src/loop/zip.js";
import { makeZip } from "./helpers/zip.js";

const text = (u: Uint8Array) => new TextDecoder().decode(u);

describe("readZip", () => {
  it("reads stored and deflated entries into a path-to-bytes map and skips directories", () => {
    const zip = makeZip([
      { name: "skill/", data: "", method: 0 },
      { name: "skill/SKILL.md", data: "---\nname: x\n---\nbody\n".repeat(20), method: 8 },
      { name: "skill/references/notes.md", data: "stored text", method: 0 },
    ]);
    const files = readZip(zip);
    expect(Object.keys(files).sort()).toEqual(["skill/SKILL.md", "skill/references/notes.md"]);
    expect(text(files["skill/references/notes.md"]!)).toBe("stored text");
    expect(text(files["skill/SKILL.md"]!)).toContain("name: x");
  });

  it("reads an empty archive as no files", () => {
    expect(readZip(makeZip([]))).toEqual({});
  });

  it("refuses an encrypted entry, a zip64 archive and a truncated archive, each with a fixed message", () => {
    for (const bad of [makeZip([{ name: "a.md", data: "x", encrypted: true }]), makeZip([{ name: "a.md", data: "x" }], { zip64: true }), makeZip([{ name: "a.md", data: "x" }], { truncate: 12 })]) {
      try {
        readZip(bad);
        throw new Error("did not throw");
      } catch (e) {
        expect(e).toBeInstanceOf(CandidateFailed);
        expect((e as Error).message).toMatch(/^no candidate skill: the skill download is not a usable zip/);
      }
    }
  });

  it("refuses an entry whose method is not stored or deflate", () => {
    const zip = Buffer.from(makeZip([{ name: "a.md", data: "x", method: 0 }]));
    // The method field sits at offset 8 of the local header and offset 10 of the central entry; set both to 12 (bzip2).
    zip.writeUInt16LE(12, 8);
    const cd = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt16LE(12, cd + 10);
    expect(() => readZip(new Uint8Array(zip))).toThrow(CandidateFailed);
  });

  it.each(["../escape.md", "/abs.md", "a/../../b.md"])("refuses the entry name %s", (name) => {
    expect(() => readZip(makeZip([{ name, data: "x" }]))).toThrow(CandidateFailed);
  });

  it("refuses an entry whose bytes do not match its recorded checksum", () => {
    const zip = Buffer.from(makeZip([{ name: "a.md", data: "hello world", method: 0 }]));
    const at = zip.indexOf(Buffer.from("hello world"));
    zip[at] = zip[at]! ^ 0xff;
    expect(() => readZip(new Uint8Array(zip))).toThrow(CandidateFailed);
  });
});
