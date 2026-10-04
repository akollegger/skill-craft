import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LoopRefused, SkillNotFound } from "../src/harness/errors.js";
import { installSkill } from "../src/harness/skill.js";
import { hasCitation, LIMITS, packageFromFiles, readPackage, skillSha256, writePackage } from "../src/loop/package.js";

const SKILL = "---\nname: demo-skill\ndescription: Use when demoing.\n---\n\n# Demo\n\nDo the thing.\n";
const tmp = () => mkdtempSync(join(tmpdir(), "skill-craft-pkg-"));

function folder(files: Record<string, string>): string {
  const dir = tmp();
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

describe("skill package", () => {
  it("reads a folder into a path-to-text map and writes it back identically", () => {
    const src = folder({ "SKILL.md": SKILL, "references/provenance.md": "# Where each fact comes from\n" });
    const pkg = readPackage(src);
    expect(Object.keys(pkg).sort()).toEqual(["SKILL.md", "references/provenance.md"]);
    const out = join(tmp(), "out");
    writePackage(out, pkg);
    expect(readFileSync(join(out, "SKILL.md"), "utf8")).toBe(SKILL);
    expect(readFileSync(join(out, "references/provenance.md"), "utf8")).toBe("# Where each fact comes from\n");
  });

  it("hashes SKILL.md the way the installer does", () => {
    const src = folder({ "SKILL.md": SKILL, "references/x.md": "x" });
    expect(skillSha256(readPackage(src))).toBe(installSkill(tmp(), src).sha256);
  });

  it.each([
    ["no SKILL.md", { "other.md": "x" }],
    ["no front matter name", { "SKILL.md": "---\ndescription: d\n---\nbody\n" }],
    ["a name with capitals", { "SKILL.md": "---\nname: Demo\ndescription: d\n---\nbody\n" }],
    ["no description", { "SKILL.md": "---\nname: demo-skill\n---\nbody\n" }],
    ["an empty description", { "SKILL.md": "---\nname: demo-skill\ndescription:\n---\nbody\n" }],
  ])("refuses a package with %s", (_why, files) => {
    expect(() => packageFromFiles(files)).toThrow(/cannot use the skill|loop refused/i);
  });

  it.each(["../escape.md", "/abs/path.md", "a/../../b.md"])("refuses the path %s", (path) => {
    expect(() => packageFromFiles({ "SKILL.md": SKILL, [path]: "x" })).toThrow(LoopRefused);
  });

  it("refuses a file that is not UTF-8 text", () => {
    expect(() => packageFromFiles({ "SKILL.md": SKILL, "bin.dat": new Uint8Array([0xff, 0xfe, 0x00, 0xc3]) })).toThrow(LoopRefused);
  });

  it("enforces the size limits and names them", () => {
    expect(() => packageFromFiles({ "SKILL.md": SKILL, "big.md": "x".repeat(LIMITS.fileBytes + 1) })).toThrow(LoopRefused);
    const many = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`f${i}.md`, "y".repeat(LIMITS.fileBytes)]));
    expect(() => packageFromFiles({ "SKILL.md": SKILL, ...many })).toThrow(/64 KB/);
    expect(LIMITS).toMatchObject({ packageBytes: 64 * 1024, fileBytes: 32 * 1024, recordingsChars: 150_000 });
  });

  it("is a SkillNotFound-free refusal for a folder with no SKILL.md on disk", () => {
    expect(() => readPackage(folder({ "x.md": "x" }))).toThrow(SkillNotFound);
  });

  it("detects run and call citations", () => {
    expect(hasCitation("from run 001 call 12")).toBe(true);
    expect(hasCitation("see call 7")).toBe(true);
    expect(hasCitation("calls 3-13")).toBe(true);
    expect(hasCitation("Place the log, then craft. Three crafts in order.")).toBe(false);
    expect(hasCitation("make 3 calls in a row")).toBe(false);
  });
});
