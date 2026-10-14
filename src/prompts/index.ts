// Versioned prompts (spec 008, ADR-007): every prompt in play is a file under `prompts/<kind>/v<N>.<ext>` with a changelog entry, a
// fingerprint and a list of placeholders. This module only reads and fills them; it imports no SDK and no craft server, so the harness
// and the critic loop can both use it.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PromptRefused } from "../harness/errors.js";
import { REPO } from "../harness/paths.js";

export const PROMPTS_ROOT = join(REPO, "prompts");

export const KIND_NAMES = ["base", "arm-sentence", "skill-tool", "review-rubric"] as const;
export type PromptKind = (typeof KIND_NAMES)[number];

interface KindSpec {
  ext: "txt" | "json";
  /** The placeholders a file of this kind may hold; a text file with any other is refused. A JSON file is not scanned. */
  placeholders: readonly string[];
}

export const KINDS: Record<PromptKind, KindSpec> = {
  base: { ext: "txt", placeholders: ["what", "item", "turns", "budget"] },
  "arm-sentence": { ext: "txt", placeholders: [] },
  "skill-tool": { ext: "txt", placeholders: ["name", "described"] },
  "review-rubric": { ext: "json", placeholders: [] },
};

export interface PromptVersion {
  kind: PromptKind;
  /** `N` from the file name. */
  version: string;
  text: string;
  /** SHA-256 of the file's bytes. */
  sha256: string;
}

export const fingerprint = (text: string | Uint8Array): string => createHash("sha256").update(text).digest("hex");

const isVersion = (v: string): boolean => /^[1-9]\d*$/.test(v);
const kindOf = (kind: string): KindSpec => {
  const spec = (KINDS as Record<string, KindSpec | undefined>)[kind];
  if (spec === undefined) throw new PromptRefused(`unknown prompt kind '${kind}'`);
  return spec;
};

/** Every version of a kind found under `root`, in numeric order. */
export function listVersions(kind: PromptKind, root: string = PROMPTS_ROOT): string[] {
  const spec = kindOf(kind);
  const dir = join(root, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => new RegExp(`^v([1-9]\\d*)\\.${spec.ext}$`).exec(f)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort((a, b) => Number(a) - Number(b));
}

/** The placeholders a text holds, in order of first appearance. */
const placeholdersIn = (text: string): string[] => [...new Set([...text.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1] as string))];

/** Check a text file against its kind's rules: only the kind's placeholders, and for a base prompt a goal and at most one budget. */
export function checkPlaceholders(kind: PromptKind, text: string, label: string): void {
  const spec = kindOf(kind);
  if (spec.ext !== "txt") return;
  const found = placeholdersIn(text);
  const unknown = found.find((p) => !spec.placeholders.includes(p));
  if (unknown !== undefined) throw new PromptRefused(`${label} holds the placeholder {${unknown}}, which a ${kind} prompt does not take`);
  if (kind === "base") {
    if (!found.includes("what")) throw new PromptRefused(`${label} must name the whole goal with {what}`);
    if (found.includes("turns") && found.includes("budget")) throw new PromptRefused(`${label} holds both {turns} and {budget}; a prompt states one budget`);
  }
}

/** Words a base prompt may not hold: it never speaks of skills, memory or learning (ADR-007 section 2.4), and from version 2 on it does not frame the task as isolated exploration. */
const BANNED_ALWAYS = /skill|memory|learn/i;
const BANNED_FROM_V2 = /explore|unfamiliar/i;

function checkWords(kind: PromptKind, version: string, text: string, label: string): void {
  if (kind !== "base") return;
  const hit = BANNED_ALWAYS.exec(text) ?? (Number(version) >= 2 ? BANNED_FROM_V2.exec(text) : null);
  if (hit !== null) throw new PromptRefused(`${label} holds the word '${hit[0]}', which a base prompt of this version may not`);
}

/** One version of a kind, read from `root`. */
export function loadVersion(kind: PromptKind, version: string, root: string = PROMPTS_ROOT): PromptVersion {
  const spec = kindOf(kind);
  if (!isVersion(version)) throw new PromptRefused(`'${version}' is not a prompt version (a positive whole number without leading zeros)`);
  const path = join(root, kind, `v${version}.${spec.ext}`);
  if (!existsSync(path)) throw new PromptRefused(`there is no ${kind} prompt version ${version}`);
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  checkPlaceholders(kind, text, `${kind} version ${version}`);
  checkWords(kind, version, text, `${kind} version ${version}`);
  return { kind, version, text, sha256: fingerprint(bytes) };
}

/** Whether a changelog has the section `## v<version>`, matched whole (the rule the process changelog uses). */
export const hasChangelogSection = (version: string, changelog: string): boolean => new RegExp(`^## v${version}\\s*$`, "m").test(changelog);

/** Refuse a kind with no versions or with a version that has no changelog section. */
export function checkChangelog(kind: PromptKind, root: string = PROMPTS_ROOT): void {
  const versions = listVersions(kind, root);
  if (versions.length === 0) throw new PromptRefused(`the ${kind} prompt has no versions`);
  const path = join(root, kind, "CHANGELOG.md");
  const changelog = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const v of versions) if (!hasChangelogSection(v, changelog)) throw new PromptRefused(`the ${kind} changelog has no section for v${v}`);
}

export type PromptValues = Partial<Record<"what" | "item" | "turns" | "budget" | "name" | "described", string | number>>;

/** Replace every occurrence of each given placeholder, then trim. */
export function fill(template: string, values: PromptValues): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) if (value !== undefined) out = out.replaceAll(`{${key}}`, String(value));
  return out.trim();
}

/**
 * Every kind, version and fingerprint under `root` as printable lines, and what is wrong: a kind with no versions, a version with no
 * changelog section, a file the loader refuses. A problem never stops the listing, so one bad file does not hide the rest.
 */
export function listPrompts(root: string = PROMPTS_ROOT): { lines: string[]; problems: string[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const kind of KIND_NAMES) {
    const versions = listVersions(kind, root);
    if (versions.length === 0) problems.push(`the ${kind} prompt has no versions`);
    const path = join(root, kind, "CHANGELOG.md");
    const changelog = existsSync(path) ? readFileSync(path, "utf8") : "";
    for (const v of versions) {
      const entry = hasChangelogSection(v, changelog);
      let sha = "?".repeat(12);
      try {
        sha = loadVersion(kind, v, root).sha256.slice(0, 12);
      } catch (e) {
        problems.push(e instanceof Error ? e.message : String(e));
      }
      if (!entry) problems.push(`the ${kind} changelog has no section for v${v}`);
      lines.push(`${kind.padEnd(14)} v${v.padEnd(3)} ${sha}  changelog: ${entry ? "yes" : "MISSING"}`);
    }
  }
  return { lines, problems };
}
