import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { LoopRefused, SkillNotFound } from "../harness/errors.js";
import { skillName } from "../harness/skill.js";

/** A skill package: relative path to UTF-8 text. */
export type SkillPackage = Record<string, string>;

/** The size limits the roles can be given; a package or recordings beyond them refuse the loop. */
export const LIMITS = { packageBytes: 64 * 1024, fileBytes: 32 * 1024, recordingsChars: 150_000 } as const;

const decoder = new TextDecoder("utf-8", { fatal: true });
const bytes = (text: string) => Buffer.byteLength(text, "utf8");

/** A run or call reference, such as `run 001 call 12` or `call 7`. */
const CITATION = /\b(?:run\s+\d+\s+calls?\s+\d+|calls?\s+\d+)\b/i;
export const hasCitation = (text: string): boolean => CITATION.test(text);

function checkPath(path: string): void {
  const clean = posix.normalize(path);
  if (path === "" || path.startsWith("/") || path.includes("\\") || clean.startsWith("..") || clean !== path || path.split("/").includes("..")) {
    throw new LoopRefused("a skill file has a path outside the skill folder");
  }
}

/** The front matter of SKILL.md, checked: a usable name, a non-empty description. */
function checkSkillMd(markdown: string): void {
  skillName(markdown); // throws SkillNotFound
  const front = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? "";
  const description = /^description:\s*(.*)$/m.exec(front)?.[1]?.trim();
  if (!description) throw new SkillNotFound("its SKILL.md has no description");
}

/** Build a package from file contents, refusing anything the loop cannot safely pass to a role. */
export function packageFromFiles(files: Record<string, string | Uint8Array>): SkillPackage {
  const pkg: SkillPackage = {};
  let total = 0;
  for (const [path, content] of Object.entries(files)) {
    checkPath(path);
    let text: string;
    if (typeof content === "string") text = content;
    else {
      try {
        text = decoder.decode(content);
      } catch {
        throw new LoopRefused("a skill file is not UTF-8 text");
      }
    }
    const size = bytes(text);
    if (size > LIMITS.fileBytes) throw new LoopRefused(`a skill file is over the 32 KB limit`);
    total += size;
    pkg[path] = text;
  }
  if (total > LIMITS.packageBytes) throw new LoopRefused("the skill package is over the 64 KB limit");
  const main = pkg["SKILL.md"];
  if (main === undefined) throw new SkillNotFound("the package has no SKILL.md");
  checkSkillMd(main);
  return pkg;
}

/** Read a skill folder. Symbolic links are refused, so a skill cannot point outside itself. */
export function readPackage(folder: string): SkillPackage {
  const files: Record<string, Uint8Array> = {};
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(folder, rel)).sort()) {
      const path = rel === "" ? name : `${rel}/${name}`;
      const stat = lstatSync(join(folder, path));
      if (stat.isSymbolicLink()) throw new LoopRefused("a skill folder holds a symbolic link");
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) files[path] = readFileSync(join(folder, path));
    }
  };
  walk("");
  return packageFromFiles(files);
}

export function writePackage(folder: string, pkg: SkillPackage): void {
  for (const [path, text] of Object.entries(pkg)) {
    checkPath(path);
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
}

/** The fingerprint of SKILL.md: the same one `installSkill` records for a run. */
export function skillSha256(pkg: SkillPackage): string {
  const main = pkg["SKILL.md"];
  if (main === undefined) throw new SkillNotFound("the package has no SKILL.md");
  return createHash("sha256").update(main).digest("hex");
}
