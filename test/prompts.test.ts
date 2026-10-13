// The prompt module (spec 008): versioned prompt files, their placeholders, fingerprints and changelogs.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PromptRefused } from "../src/harness/errors.js";
import { checkChangelog, fill, fingerprint, listVersions, loadVersion, PROMPTS_ROOT } from "../src/prompts/index.js";
import { checkSet, parsePromptSet } from "../src/prompts/set.js";

/** A throwaway prompts tree: files given as `kind/file` to content. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "skill-craft-prompts-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("loading a version", () => {
  it("reads the file's bytes and fingerprints them", () => {
    const root = tree({ "base/v1.txt": "Goal {what}. {item}. {turns}", "base/CHANGELOG.md": "## v1\nfirst\n" });
    const v = loadVersion("base", "1", root);
    expect(v.text).toBe("Goal {what}. {item}. {turns}");
    expect(v.sha256).toBe(createHash("sha256").update("Goal {what}. {item}. {turns}").digest("hex"));
    expect(v.version).toBe("1");
  });

  it("refuses an unknown kind, an unknown version and a malformed version", () => {
    const root = tree({ "base/v1.txt": "{what}", "base/CHANGELOG.md": "## v1\n" });
    expect(() => loadVersion("nope" as never, "1", root)).toThrow(PromptRefused);
    expect(() => loadVersion("base", "2", root)).toThrow(PromptRefused);
    for (const bad of ["01", "0", "-1", "1.5", "v1", ""]) expect(() => loadVersion("base", bad, root)).toThrow(PromptRefused);
  });

  it("refuses a placeholder outside the kind's list", () => {
    const root = tree({ "base/v1.txt": "{what} {nonsense}", "base/CHANGELOG.md": "## v1\n" });
    expect(() => loadVersion("base", "1", root)).toThrow(/placeholder/);
  });

  it("refuses a base prompt that holds both budget placeholders, or has no {what}", () => {
    const both = tree({ "base/v1.txt": "{what} {turns} {budget}", "base/CHANGELOG.md": "## v1\n" });
    expect(() => loadVersion("base", "1", both)).toThrow(/both/);
    const none = tree({ "base/v1.txt": "no goal here {turns}", "base/CHANGELOG.md": "## v1\n" });
    expect(() => loadVersion("base", "1", none)).toThrow(/\{what\}/);
  });

  it("allows {budget} in a base prompt, and the skill tool's two placeholders", () => {
    const root = tree({ "base/v1.txt": "{what} {item} {budget}", "base/CHANGELOG.md": "## v1\n", "skill-tool/v1.txt": "Load '{name}'{described}.", "skill-tool/CHANGELOG.md": "## v1\n" });
    expect(() => loadVersion("base", "1", root)).not.toThrow();
    expect(() => loadVersion("skill-tool", "1", root)).not.toThrow();
  });

  it("lists versions in numeric order", () => {
    const root = tree({ "base/v2.txt": "{what}", "base/v10.txt": "{what}", "base/v1.txt": "{what}", "base/CHANGELOG.md": "" });
    expect(listVersions("base", root)).toEqual(["1", "2", "10"]);
  });
});

describe("the changelog", () => {
  it("refuses a version with no section, and passes when every version has one", () => {
    const missing = tree({ "base/v1.txt": "{what}", "base/v2.txt": "{what}", "base/CHANGELOG.md": "## v1\nfirst\n" });
    expect(() => checkChangelog("base", missing)).toThrow(/v2/);
    const ok = tree({ "base/v1.txt": "{what}", "base/v2.txt": "{what}", "base/CHANGELOG.md": "## v1\na\n\n## v2\nb\n" });
    expect(() => checkChangelog("base", ok)).not.toThrow();
  });

  it("matches a heading whole: '## v10' is not an entry for v1", () => {
    const root = tree({ "base/v1.txt": "{what}", "base/CHANGELOG.md": "## v10\n" });
    expect(() => checkChangelog("base", root)).toThrow(/v1/);
  });

  it("holds for every committed kind", () => {
    for (const kind of ["base", "arm-sentence", "skill-tool", "review-rubric"] as const) expect(() => checkChangelog(kind, PROMPTS_ROOT)).not.toThrow();
  });
});

describe("filling", () => {
  it("replaces every occurrence of a placeholder and trims", () => {
    expect(fill("  {what} / {what} / {item} / {turns}\n", { what: "one x", item: "x", turns: 5 })).toBe("one x / one x / x / 5");
    expect(fill("{budget} calls", { budget: 100 })).toBe("100 calls");
  });

  it("fingerprints the exact text", () => {
    expect(fingerprint("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
  });
});

// The frozen outputs (SC-001): today's text, as it was before the prompts moved out of code.
const LEGACY = (what: string, item: string, turns: number, note?: string): string =>
  [
    `You are at a crafting table in an unfamiliar workshop. Your goal: end up holding ${what}.`,
    "Use only the craft tools, and start with help.",
    `Nobody can answer questions or give hints, so do not ask for any. Keep trying on your own until you hold ${item}, or until your budget of ${turns} turns is used up.`,
    "craft is irreversible and uses up whatever is on the table, so explore with place, remove, clear and look before you commit.",
    "When you hold it, say so in one line and stop.",
    ...(note === undefined ? [] : [note]),
  ].join("\n");

describe("base version 1", () => {
  const v1 = loadVersion("base", "1");
  const whatOf = (item: string, qty: number) => (qty === 1 ? `one ${item}` : `${qty} of ${item}`);
  const goals = [["glirol", 1], ["wooden_stool", 1], ["stone_pickaxe", 1], ["planks", 4], ["naeviozhum", 3]] as const;
  const turns = [1, 12, 40, 80, 100];
  const notes = [undefined, "A skill for this kind of task is available; load it before exploring."];

  it("reproduces the code's prompt byte for byte for a table of goals, quantities, budgets and sentences", () => {
    let cases = 0;
    for (const [item, qty] of goals) for (const t of turns) for (const note of notes) {
      const filled = fill(v1.text, { what: whatOf(item, qty), item, turns: t });
      const text = note === undefined ? filled : `${filled}\n${note}`;
      expect(text).toBe(LEGACY(whatOf(item, qty), item, t, note));
      cases++;
    }
    expect(cases).toBe(50);
  });

  it("holds none of the words a base prompt may not (skill, memory, learn)", () => {
    expect(v1.text).not.toMatch(/skill|memory|learn/i);
  });
});

describe("the other kinds' version 1 (SC-008)", () => {
  it("is the S2 sentence of ADR-003 §2.2", () => {
    expect(loadVersion("arm-sentence", "1").text.trim()).toBe("A skill for this kind of task is available; load it before exploring.");
  });

  it("is today's skill tool description, with and without a skill description", () => {
    const v1 = loadVersion("skill-tool", "1");
    const legacy = (name: string, description: string) => `Load the skill '${name}'${description === "" ? "" : `: ${description}`}. Returns its instructions.`;
    expect(fill(v1.text, { name: "wooden-stool", described: ": a recipe card" })).toBe(legacy("wooden-stool", "a recipe card"));
    expect(fill(v1.text, { name: "wooden-stool", described: "" })).toBe(legacy("wooden-stool", ""));
  });

  it("keeps the review rubric's bytes, so its hash and every earlier loop record stay valid", () => {
    const raw = readFileSync(join(PROMPTS_ROOT, "review-rubric/v1.json"));
    expect(createHash("sha256").update(raw).digest("hex")).toBe("a6e33cf720e4b20e8cc767666d49f29375452d86beec3e1e1cf8e8c2cadc5c5e");
  });
});

describe("the word check on base prompts (FR-015)", () => {
  const base = (text: string, version = "1") => tree({ [`base/v${version}.txt`]: text, "base/CHANGELOG.md": `## v${version}\n` });

  it("refuses skill, memory and learn in any base version", () => {
    for (const word of ["skill", "Skills", "memory", "learning"]) expect(() => loadVersion("base", "1", base(`{what} {turns} ${word}`)), word).toThrow(/word/);
  });

  it("refuses explore and unfamiliar from version 2 on, and allows them in version 1, which has them", () => {
    expect(() => loadVersion("base", "1", base("{what} {turns} explore, unfamiliar"))).not.toThrow();
    for (const word of ["explore", "Unfamiliar"]) expect(() => loadVersion("base", "2", base(`{what} {budget} ${word}`, "2")), word).toThrow(/word/);
  });

  it("does not apply to the arm sentence or the skill tool, which exist to mention a skill", () => {
    const root = tree({ "arm-sentence/v1.txt": "A skill is available; load it before exploring.", "arm-sentence/CHANGELOG.md": "## v1\n", "skill-tool/v1.txt": "Load the skill '{name}'{described}.", "skill-tool/CHANGELOG.md": "## v1\n" });
    expect(() => loadVersion("arm-sentence", "1", root)).not.toThrow();
    expect(() => loadVersion("skill-tool", "1", root)).not.toThrow();
  });

  it("holds for version 2 as committed, which states the goal and a call budget and nothing else about learning", () => {
    const v2 = loadVersion("base", "2");
    expect(v2.text).toContain("{budget}");
    expect(v2.text).toContain("including several made at once");
    expect(v2.text).not.toMatch(/skill|memory|learn|explor|unfamiliar|isolation|on your own/i);
    expect(fill(v2.text, { what: "one wooden_stool", item: "wooden_stool", budget: 100 })).toContain("You have 100 tool calls in total");
  });
});

describe("a prompt set (FR-004, FR-024)", () => {
  const set = { base: "2", callBudget: 100, armSentence: "1", skillTool: "1", reviewRubric: "1" };

  it("parses a set with a base and optional pins, and refuses an unknown key or a missing base", () => {
    expect(parsePromptSet(set)).toEqual(set);
    expect(parsePromptSet({ base: "1" })).toEqual({ base: "1" });
    expect(() => parsePromptSet({ armSentence: "1" })).toThrow(PromptRefused);
    expect(() => parsePromptSet({ base: "1", other: "x" })).toThrow(PromptRefused);
    expect(() => parsePromptSet({ base: "01" })).toThrow(PromptRefused);
  });

  it("finds nothing when what was used is what was pinned, and ignores a pinned kind that was not used", () => {
    expect(checkSet(set, { base: "2", callBudget: 100, armSentence: "1", skillTool: "1" })).toEqual([]);
    expect(checkSet(set, { base: "2", callBudget: 100 })).toEqual([]);
  });

  it("names the kind and both versions for a difference", () => {
    expect(checkSet(set, { base: "1", callBudget: 100 })).toEqual(["base prompt version 1 differs from the experiment's 2"]);
    expect(checkSet(set, { base: "2", callBudget: 100, skillTool: "3" })).toEqual(["skill tool version 3 differs from the experiment's 1"]);
    expect(checkSet(set, { base: "2", callBudget: 100, reviewRubric: "2" })).toEqual(["review rubric version 2 differs from the experiment's 1"]);
    expect(checkSet(set, { base: "2", callBudget: 50 })).toEqual(["call budget 50 differs from the experiment's 100"]);
  });

  it("does not check a kind the set does not pin", () => {
    expect(checkSet({ base: "2", callBudget: 100 }, { base: "2", callBudget: 100, armSentence: "9", skillTool: "9", reviewRubric: "9" })).toEqual([]);
  });

  it("refuses a call budget used without one pinned, and a pinned one used with a step budget", () => {
    expect(checkSet({ base: "2" }, { base: "2", callBudget: 100 })).toEqual(["a call budget of 100 is used but the experiment pins none"]);
    expect(checkSet({ base: "1", callBudget: 100 }, { base: "1" })).toEqual(["the experiment pins a call budget of 100 but this uses a step budget"]);
  });
});
