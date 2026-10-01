import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SkillNotFound } from "../src/harness/errors.js";
import { installSkill } from "../src/harness/skill.js";

/** A minimal skill folder: SKILL.md with a front-matter name, and a reference file. */
function skillFolder(name = "demo-skill") {
  const dir = mkdtempSync(join(tmpdir(), "skill-src-"));
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: "Do the demo."\n---\n\n# Demo\n\nStep one.\n`);
  mkdirSync(join(dir, "references"));
  writeFileSync(join(dir, "references", "notes.md"), "notes\n");
  return dir;
}
const runDir = () => mkdtempSync(join(tmpdir(), "skill-run-"));

describe("installSkill", () => {
  it("builds a local plugin inside the run folder and names the skill as plugin:skill", () => {
    const run = runDir();
    const s = installSkill(run, skillFolder("demo-skill"));
    expect(s.pluginDir).toBe(join(run, "skill-plugin"));
    expect(s.name).toBe("demo-skill");
    expect(s.qualifiedName).toBe("run-skill:demo-skill");
    const manifest = JSON.parse(readFileSync(join(s.pluginDir, ".claude-plugin", "plugin.json"), "utf8")) as { name: string };
    expect(manifest.name).toBe("run-skill");
    expect(existsSync(join(s.pluginDir, "skills", "demo-skill", "SKILL.md"))).toBe(true);
    expect(existsSync(join(s.pluginDir, "skills", "demo-skill", "references", "notes.md"))).toBe(true);
  });

  it("fingerprints SKILL.md, so a run can say exactly which skill it used", () => {
    const a = installSkill(runDir(), skillFolder());
    const b = installSkill(runDir(), skillFolder());
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.sha256).toBe(b.sha256); // same content, same fingerprint
    const other = skillFolder();
    writeFileSync(join(other, "SKILL.md"), readFileSync(join(other, "SKILL.md"), "utf8") + "Step two.\n");
    expect(installSkill(runDir(), other).sha256).not.toBe(a.sha256);
  });

  it("refuses a folder with no SKILL.md, or a SKILL.md with no usable name", () => {
    const empty = mkdtempSync(join(tmpdir(), "skill-empty-"));
    expect(() => installSkill(runDir(), empty)).toThrow(SkillNotFound);
    const bad = mkdtempSync(join(tmpdir(), "skill-bad-"));
    writeFileSync(join(bad, "SKILL.md"), "---\ndescription: no name\n---\n");
    expect(() => installSkill(runDir(), bad)).toThrow(/name/);
    const weird = skillFolder("Not Valid!");
    expect(() => installSkill(runDir(), weird)).toThrow(/name/);
  });
});
