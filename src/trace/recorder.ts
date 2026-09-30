import { appendFileSync } from "node:fs";
import type { DriverSink, PlayerMessage, ToolEnd, ToolStart } from "../harness/driver.js";
import type { RequestLine, ToolLine, TraceLine } from "./lines.js";

const CRAFT_PREFIX = "mcp__craft__";

export interface RecorderOptions {
  /** Where trace lines are appended as they complete. */
  path: string;
  /** Milliseconds on a monotonic clock. Injected so tests control time. */
  now?: () => number;
}

interface PendingRequest {
  id: string | null;
  model: string | null;
  arrival: number;
  ttftMs: number | null;
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number } | null;
  bad: boolean;
}

interface OpenCall {
  tool: string;
  args: Record<string, unknown>;
  startMs: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Turns the events a player emits into numbered trace lines. It reads only the fields in the data model's
 * "Recorder inputs" table; everything else, including the agent's text and reasoning and every identifier,
 * is never looked at, so it cannot be written. All state is per instance.
 */
export class TraceRecorder implements DriverSink {
  /** Items that were malformed and left out. */
  skipped = 0;
  private readonly path: string;
  private readonly now: () => number;
  private t0: number | null = null;
  private seq = 0;
  private turn = 0;
  private pending: PendingRequest | null = null;
  private readonly calls = new Map<string, OpenCall>();

  constructor(options: RecorderOptions) {
    this.path = options.path;
    this.now = options.now ?? (() => performance.now());
  }

  /** Tool calls that started and have not ended. */
  get openCalls(): number {
    return this.calls.size;
  }

  onMessage(message: PlayerMessage): void {
    const at = this.now();
    if (this.t0 === null) this.t0 = at;
    const m = message as unknown as Record<string, unknown>;
    if (m["type"] === "system" && m["subtype"] === "init") {
      this.t0 = at;
      return;
    }
    if (m["type"] !== "stream_event" || !isObject(m["event"])) return;
    const event = m["event"];
    if (event["type"] === "message_start") this.startRequest(m, event, at);
    else if (event["type"] === "message_delta") this.deltaRequest(event);
    else if (event["type"] === "message_stop") this.stopRequest(at);
  }

  onToolStart(call: ToolStart): void {
    const at = this.now();
    if (this.t0 === null) this.t0 = at;
    if (typeof call.toolName !== "string" || !call.toolName.startsWith(CRAFT_PREFIX)) return; // not ours: ignored, not malformed
    if (typeof call.toolUseId !== "string" || call.toolUseId === "") {
      this.skipped++;
      return;
    }
    this.calls.set(call.toolUseId, {
      tool: call.toolName.slice(CRAFT_PREFIX.length),
      args: isObject(call.input) ? call.input : {},
      startMs: this.offset(at),
    });
  }

  onToolEnd(call: ToolEnd): void {
    const at = this.now();
    if (typeof call.toolUseId !== "string") return;
    const open = this.calls.get(call.toolUseId);
    if (!open) return; // a tool we did not record, or one already skipped
    this.calls.delete(call.toolUseId);
    const line: Omit<ToolLine, "seq"> = { kind: "tool", toolUseId: call.toolUseId, tool: open.tool, args: open.args, startMs: open.startMs, endMs: this.offset(at) };
    this.write(line);
  }

  private startRequest(m: Record<string, unknown>, event: Record<string, unknown>, at: number): void {
    const message = isObject(event["message"]) ? event["message"] : {};
    const id = typeof message["id"] === "string" && message["id"] !== "" ? message["id"] : null;
    this.pending = {
      id,
      model: typeof message["model"] === "string" ? message["model"] : null,
      arrival: at,
      ttftMs: typeof m["ttft_ms"] === "number" ? m["ttft_ms"] : null,
      tokens: null,
      bad: false,
    };
    if (id === null) this.markBad(this.pending);
  }

  private deltaRequest(event: Record<string, unknown>): void {
    const p = this.pending;
    if (!p) return;
    const usage = event["usage"];
    const counts = isObject(usage) ? ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].map((k) => usage[k]) : [];
    // All four counts must be real numbers. Defaulting a missing one to zero would let a malformed request
    // agree with a result that omits the same field, and be called a match.
    if (counts.length !== 4 || !counts.every((v): v is number => typeof v === "number" && Number.isFinite(v))) {
      if (p.tokens === null) this.markBad(p); // a later incomplete update does not undo a complete one
      return;
    }
    p.tokens = { input: counts[0] as number, output: counts[1] as number, cacheRead: counts[2] as number, cacheCreation: counts[3] as number };
  }

  private stopRequest(at: number): void {
    const p = this.pending;
    this.pending = null;
    if (!p || p.bad || p.id === null || p.tokens === null) return;
    const line: Omit<RequestLine, "seq"> = {
      kind: "request",
      requestId: p.id,
      model: p.model,
      turn: ++this.turn,
      startMs: Math.max(0, this.offset(p.arrival - (p.ttftMs ?? 0))),
      endMs: this.offset(at),
      ttftMs: p.ttftMs,
      inputTokens: p.tokens.input,
      outputTokens: p.tokens.output,
      cacheReadTokens: p.tokens.cacheRead,
      cacheCreationTokens: p.tokens.cacheCreation,
    };
    this.write(line);
  }

  private markBad(p: PendingRequest): void {
    if (!p.bad) {
      p.bad = true;
      this.skipped++;
    }
  }

  private offset(t: number): number {
    return Math.max(0, Math.round(t - (this.t0 ?? t)));
  }

  private write(line: Omit<RequestLine, "seq"> | Omit<ToolLine, "seq">): void {
    const full = { seq: this.seq++, ...line } as TraceLine;
    appendFileSync(this.path, `${JSON.stringify(full)}\n`);
  }
}
