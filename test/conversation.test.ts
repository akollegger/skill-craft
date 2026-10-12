import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConversationWriter, readConversation } from "../src/harness/conversation.js";
import { ReplayFailed } from "../src/harness/errors.js";

const file = () => join(mkdtempSync(join(tmpdir(), "skill-craft-conv-")), "conversation.jsonl");

describe("the conversation file", () => {
  it("holds one line per model turn, in order, with the turn's text, reasoning and calls", () => {
    const path = file();
    const w = new ConversationWriter(path);
    w.onTurn({ text: "Let me look.", reasoning: "I should check the table first.", calls: [{ id: "t1", tool: "look" }] });
    w.onTurn({ text: "", reasoning: "", calls: [{ id: "t2", tool: "place" }, { id: "t3", tool: "craft" }] });
    w.onTurn({ text: "I hold it.", reasoning: "Done.", calls: [] });
    const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.seq)).toEqual([0, 1, 2]);
    expect(lines[0]).toEqual({ seq: 0, text: "Let me look.", reasoning: "I should check the table first.", calls: [{ id: "t1", tool: "look" }] });
    expect(readConversation(path)).toEqual(lines);
  });

  it("is not made until a turn is reported, and reads as absent then", () => {
    const path = file();
    new ConversationWriter(path);
    expect(readConversation(path)).toBeNull();
  });

  it("refuses a file that is not a conversation, with a fixed message that holds none of its text", () => {
    const path = file();
    writeFileSync(path, '{"seq":0,"text":"LEAK-ME","reasoning":5,"calls":"no"}\n');
    let error: unknown;
    try {
      readConversation(path);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ReplayFailed);
    expect((error as Error).message).not.toContain("LEAK-ME");
    writeFileSync(path, "{not json\n");
    expect(() => readConversation(path)).toThrow(ReplayFailed);
  });

  it("refuses turns out of order or repeated", () => {
    const path = file();
    writeFileSync(path, '{"seq":1,"text":"","reasoning":"","calls":[]}\n{"seq":0,"text":"","reasoning":"","calls":[]}\n');
    expect(() => readConversation(path)).toThrow(ReplayFailed);
  });
});
