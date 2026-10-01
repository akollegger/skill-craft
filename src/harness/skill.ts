import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SkillNotFound } from "./errors.js";

/** The plugin every installed skill goes under, so a skill is always named `run-skill:<name>`. */
export const SKILL_PLUGIN = "run-skill";

export interface InstalledSkill {
  /** The local plugin folder inside the run folder. */
  pluginDir: string;
  /** The skill's name from its SKILL.md. */
  name: string;
  /** `plugin:skill`, the form the SDK's `skills` option takes. */
  qualifiedName: string;
  /** Fingerprint of SKILL.md, so a run records exactly which skill it used. */
  sha256: string;
}

/** The skill's name, from the front matter. Only lowercase letters, digits and hyphens are allowed. */
export function skillName(markdown: string): string {
  const front = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? "";
  const raw = /^name:\s*(.+)$/m.exec(front)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!raw || !/^[a-z0-9][a-z0-9-]*$/.test(raw)) throw new SkillNotFound("its SKILL.md has no usable name (lowercase letters, digits and hyphens)");
  return raw;
}

/**
 * Package a skill folder as a local plugin inside a run's folder. The run folder then holds the exact skill
 * the run used, and the plugin keeps it apart from user and project skills.
 */
export function installSkill(runDir: string, source: string): InstalledSkill {
  const file = join(source, "SKILL.md");
  if (!existsSync(file)) throw new SkillNotFound(`${source} has no SKILL.md`);
  const markdown = readFileSync(file, "utf8");
  const name = skillName(markdown);

  const pluginDir = join(runDir, "skill-plugin");
  mkdirSync(join(pluginDir, ".claude-plugin"), { recursive: true });
  writeFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), `${JSON.stringify({ name: SKILL_PLUGIN, version: "0.0.0", description: "The skill under test" }, null, 2)}\n`);
  cpSync(source, join(pluginDir, "skills", name), { recursive: true });
  return { pluginDir, name, qualifiedName: `${SKILL_PLUGIN}:${name}`, sha256: createHash("sha256").update(markdown).digest("hex") };
}
