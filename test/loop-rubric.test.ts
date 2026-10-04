import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRubric, DEFAULT_RUBRIC_PATH } from "../src/loop/rubric.js";

const raw = () => JSON.parse(readFileSync(DEFAULT_RUBRIC_PATH, "utf8")) as Record<string, any>;
function written(obj: unknown): string {
  const p = join(mkdtempSync(join(tmpdir(), "skill-craft-rubric-")), "r.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

describe("the shipped rubric", () => {
  const r = loadRubric();

  it("is version 1 with six questions that have unique lowercase ids", () => {
    expect(r.version).toBe("1");
    expect(r.questions).toHaveLength(6);
    const ids = r.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(6);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z_]*$/);
    expect(ids).toContain("common_knowledge");
  });

  it("states each of the reviser's seven rules", () => {
    const t = r.reviserInstructions;
    for (const phrase of [
      "run NNN call N", //                 facts the recordings show, each cited
      "not known", //                      what the recordings do not show
      "lead", //                           lead with the discovered fact
      "provenance", //                     citations live in the provenance file
      "generic advice", //                 drop what a capable model already does
      "description", //                    scope the description to the body
      "outside the recordings", //         no outside knowledge
    ]) expect(t.toLowerCase()).toContain(phrase.toLowerCase());
  });

  it("tells the critic to answer cannot_determine and to flag facts the recordings do not show", () => {
    expect(r.criticInstructions).toContain("cannot_determine");
    expect(r.criticInstructions.toLowerCase()).toContain("do not show");
  });

  it("hashes the whole file, so a changed question or instruction changes the hash", () => {
    const a = loadRubric();
    expect(a.sha256).toBe(r.sha256);
    const b = raw();
    b["questions"][0].text += " Changed.";
    expect(loadRubric(written(b)).sha256).not.toBe(r.sha256);
    const c = raw();
    c["reviserInstructions"] += " Changed.";
    expect(loadRubric(written(c)).sha256).not.toBe(r.sha256);
  });

  it.each([
    ["a duplicate id", (o: any) => { o.questions[1].id = o.questions[0].id; }],
    ["no version", (o: any) => { delete o.version; }],
    ["an empty question", (o: any) => { o.questions[2].text = ""; }],
    ["an upper-case id", (o: any) => { o.questions[0].id = "Generality"; }],
    ["no instructions", (o: any) => { delete o.criticInstructions; }],
  ])("refuses a rubric with %s", (_why, mutate) => {
    const o = raw();
    mutate(o);
    expect(() => loadRubric(written(o))).toThrow(/rubric/i);
  });
});
