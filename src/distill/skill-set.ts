// A skill set on disk (ADR-008, spec 009 FR-011): one root folder with a subfolder per skill, in the layout of a .claude/skills/ directory, and a
// sidecar `skill-set.json` beside the subfolders that holds each skill's tags and evidence. Nothing but a skill's own files goes in its folder, so a
// folder installs as it is.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { LoopRefused } from "../harness/errors.js";
import { skillName } from "../harness/skill.js";
import { packageFromFiles, readPackage, writePackage } from "../loop/package.js";
import { skillSetSchema, type Skill, type SkillSet } from "./schemas.js";

export const SIDECAR = "skill-set.json";

/** The description in SKILL.md's front matter, or "" when it has none. */
const frontMatterDescription = (md: string): string => /^description:\s*(.+)$/m.exec(/^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? "")?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";

interface SidecarEntry {
  name: string;
  tags?: string[];
  evidence?: { run: string; call?: number | undefined }[];
}

/** Check a set, then write it; nothing is written when any skill is refused. */
export function writeSkillSet(root: string, set: SkillSet): void {
  const parsed = skillSetSchema.safeParse(set);
  if (!parsed.success) throw new LoopRefused("the skill set is not a valid skill set");
  const names = parsed.data.skills.map((s) => s.name);
  if (new Set(names).size !== names.length) throw new LoopRefused("skill names must be unique within a set");

  const packages = parsed.data.skills.map((s) => {
    const pkg = packageFromFiles(Object.fromEntries(s.files.map((f) => [f.path, f.content])));
    const md = pkg["SKILL.md"];
    if (md === undefined) throw new LoopRefused(`skill '${s.name}' has no SKILL.md`);
    if (skillName(md) !== s.name) throw new LoopRefused(`skill '${s.name}' has a SKILL.md whose name is not its name`);
    if (frontMatterDescription(md) !== s.description.trim()) throw new LoopRefused(`skill '${s.name}' has a SKILL.md whose description is not its description`);
    return [s.name, pkg] as const;
  });

  mkdirSync(root, { recursive: true });
  for (const [name, pkg] of packages) writePackage(join(root, name), pkg);
  const sidecar: { skills: SidecarEntry[] } = {
    skills: parsed.data.skills.map((s) => ({ name: s.name, ...(s.tags === undefined ? {} : { tags: s.tags }), ...(s.evidence === undefined ? {} : { evidence: s.evidence }) })),
  };
  writeFileSync(join(root, SIDECAR), `${JSON.stringify(sidecar, null, 2)}\n`);
}

/** Read a written set back, refusing a sidecar and a set of folders that disagree. */
export function readSkillSet(root: string): SkillSet {
  const file = join(root, SIDECAR);
  if (!existsSync(file)) throw new LoopRefused("the skill set has no skill-set.json");
  let sidecar: { skills: SidecarEntry[] };
  try {
    sidecar = JSON.parse(readFileSync(file, "utf8")) as { skills: SidecarEntry[] };
  } catch {
    throw new LoopRefused("skill-set.json is not valid JSON");
  }
  const folders = readdirSync(root).filter((f) => statSync(join(root, f)).isDirectory());
  const named = new Set(sidecar.skills.map((s) => s.name));
  for (const n of named) if (!folders.includes(n)) throw new LoopRefused(`skill-set.json names '${n}', which has no folder`);
  for (const f of folders) if (!named.has(f)) throw new LoopRefused(`the folder '${f}' is not named in skill-set.json`);

  const skills: Skill[] = sidecar.skills.map((entry) => {
    const pkg = readPackage(join(root, entry.name));
    return {
      name: entry.name,
      description: frontMatterDescription(pkg["SKILL.md"] ?? ""),
      files: Object.entries(pkg).map(([path, content]) => ({ path, content })),
      ...(entry.tags === undefined ? {} : { tags: entry.tags }),
      ...(entry.evidence === undefined ? {} : { evidence: entry.evidence }),
    };
  });
  return skillSetSchema.parse({ skills });
}
