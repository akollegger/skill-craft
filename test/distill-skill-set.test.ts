// A skill set on disk (spec 009, FR-011): one root, a folder per skill in the layout of a .claude/skills/ directory, and a sidecar beside them.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LoopRefused } from "../src/harness/errors.js";
import { readSkillSet, writeSkillSet } from "../src/distill/skill-set.js";
import type { SkillSet } from "../src/distill/schemas.js";
import { skillName } from "../src/harness/skill.js";
import { LIMITS } from "../src/loop/package.js";

const md = (name: string, description = `Does ${name}.`, body = "body") => `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`;
const set = (): SkillSet => ({
  skills: [
    { name: "pair-first", description: "Try pairs first.", files: [{ path: "SKILL.md", content: md("pair-first", "Try pairs first.") }, { path: "references/evidence.md", content: "runs 001 call 4" }], tags: ["rule"], evidence: [{ run: "001", call: 4 }] },
    { name: "recipes", description: "Recipes found.", files: [{ path: "SKILL.md", content: md("recipes", "Recipes found.") }] },
  ],
});
const root = () => join(mkdtempSync(join(tmpdir(), "skill-craft-set-")), "skills");

describe("writeSkillSet", () => {
  it("writes a folder per skill with its files, and the sidecar beside the folders", () => {
    const dir = root();
    writeSkillSet(dir, set());
    expect(readdirSync(dir).sort()).toEqual(["pair-first", "recipes", "skill-set.json"]);
    expect(readFileSync(join(dir, "pair-first/SKILL.md"), "utf8")).toBe(md("pair-first", "Try pairs first."));
    expect(readFileSync(join(dir, "pair-first/references/evidence.md"), "utf8")).toBe("runs 001 call 4");
    const sidecar = JSON.parse(readFileSync(join(dir, "skill-set.json"), "utf8"));
    expect(sidecar.skills).toEqual([{ name: "pair-first", tags: ["rule"], evidence: [{ run: "001", call: 4 }] }, { name: "recipes" }]);
  });

  it("keeps tags and evidence out of every skill folder", () => {
    const dir = root();
    writeSkillSet(dir, set());
    for (const name of ["pair-first", "recipes"]) {
      expect(existsSync(join(dir, name, "skill-set.json"))).toBe(false);
      expect(readFileSync(join(dir, name, "SKILL.md"), "utf8")).not.toMatch(/rule|evidence/);
    }
  });

  it("gives a folder that installs as it is: SKILL.md with a usable name", () => {
    const dir = root();
    writeSkillSet(dir, set());
    expect(skillName(readFileSync(join(dir, "pair-first/SKILL.md"), "utf8"))).toBe("pair-first");
  });

  it("refuses a duplicate name, a path that leaves its folder and a file over the limit, and writes nothing", () => {
    const dup = set();
    dup.skills[1] = { ...dup.skills[1]!, name: "pair-first" };
    expect(() => writeSkillSet(root(), dup)).toThrow(/unique/);
    const escape = set();
    escape.skills[0]!.files.push({ path: "../outside.md", content: "x" });
    expect(() => writeSkillSet(root(), escape)).toThrow(LoopRefused);
    const big = set();
    big.skills[0]!.files.push({ path: "references/big.md", content: "x".repeat(LIMITS.fileBytes + 1) });
    const dir = root();
    expect(() => writeSkillSet(dir, big)).toThrow(LoopRefused);
    expect(existsSync(dir)).toBe(false);
  });

  it("refuses a skill whose SKILL.md name is not its own name", () => {
    const bad = set();
    bad.skills[0]!.files[0] = { path: "SKILL.md", content: md("something-else") };
    expect(() => writeSkillSet(root(), bad)).toThrow(/name/);
  });

  it("refuses a skill whose SKILL.md description is not its description", () => {
    const bad = set();
    bad.skills[0]!.files[0] = { path: "SKILL.md", content: md("pair-first", "A different description.") };
    expect(() => writeSkillSet(root(), bad)).toThrow(/description/);
  });
});

describe("readSkillSet", () => {
  it("reads back the same skills, tags and evidence", () => {
    const dir = root();
    writeSkillSet(dir, set());
    const back = readSkillSet(dir);
    expect(back.skills.map((s) => s.name).sort()).toEqual(["pair-first", "recipes"]);
    const pair = back.skills.find((s) => s.name === "pair-first")!;
    expect(pair.tags).toEqual(["rule"]);
    expect(pair.evidence).toEqual([{ run: "001", call: 4 }]);
    expect(pair.files.map((f) => f.path).sort()).toEqual(["SKILL.md", "references/evidence.md"]);
    expect(pair.description).toBe("Try pairs first.");
  });

  it("refuses a sidecar that names a folder that is not there, and a folder the sidecar does not name", () => {
    const dir = root();
    writeSkillSet(dir, set());
    const sidecar = JSON.parse(readFileSync(join(dir, "skill-set.json"), "utf8"));
    writeFileSync(join(dir, "skill-set.json"), JSON.stringify({ skills: [...sidecar.skills, { name: "ghost" }] }));
    expect(() => readSkillSet(dir)).toThrow(/ghost/);
    writeFileSync(join(dir, "skill-set.json"), JSON.stringify({ skills: [{ name: "recipes" }] }));
    expect(() => readSkillSet(dir)).toThrow(/pair-first/);
  });
});
