import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import type { TurnReport } from "./driver.js";
import { ReplayFailed } from "./errors.js";

/**
 * The model's messages and reasoning for one run, one line per turn, in the run folder. It exists for the memory
 * service's recording and is read by nothing else: no trace, score, summary, bundle or reason holds its text
 * (ADR-003 §2.4 and ADR-002, amended 2026-10-12). The file is made when the first turn is reported.
 */
export const CONVERSATION_FILE = "conversation.jsonl";

const turnSchema = z.object({
  seq: z.number().int().min(0),
  text: z.string(),
  reasoning: z.string(),
  calls: z.array(z.object({ id: z.string(), tool: z.string() })),
});

export type ConversationTurn = z.infer<typeof turnSchema>;

export class ConversationWriter {
  private seq = 0;

  constructor(private readonly path: string) {}

  onTurn(turn: TurnReport): void {
    const line: ConversationTurn = { seq: this.seq++, text: turn.text, reasoning: turn.reasoning, calls: turn.calls.map((c) => ({ id: c.id, tool: c.tool })) };
    appendFileSync(this.path, `${JSON.stringify(line)}\n`);
  }
}

/** The turns, or null when the run kept none. A file that is not a conversation is refused, with fixed text that holds none of it. */
export function readConversation(path: string): ConversationTurn[] | null {
  if (!existsSync(path)) return null;
  const turns: ConversationTurn[] = [];
  for (const [i, line] of readFileSync(path, "utf8").split("\n").filter(Boolean).entries()) {
    let parsed: ConversationTurn;
    try {
      parsed = turnSchema.parse(JSON.parse(line));
    } catch {
      throw new ReplayFailed("the conversation file is not a conversation");
    }
    if (parsed.seq !== i) throw new ReplayFailed("the conversation file's turns are out of order");
    turns.push(parsed);
  }
  return turns;
}
