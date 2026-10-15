// The bespoke-one-shot harness (ADR-008, spec 009): a reference implementation with no outside service. `record` keeps the run; `distill` makes one model
// call, with no tools, whose prompt is built from named parts only (the distiller's instructions, and the recorded runs as text), and assembles the answer
// into one skill. Nothing else reaches the model: it has no parameter that takes a path, a world, a score or a goal's role.
import { z } from "zod";
import { reasonOf, HarnessError } from "../../harness/errors.js";
import type { PriceQuote } from "../../harness/pricing.js";
import type { ModelSettings } from "../../harness/providers.js";
import type { RoleDriver } from "../../harness/role-driver.js";
import { hasCitation, LIMITS, packageFromFiles } from "../../loop/package.js";
import { loadVersion, type PromptVersion } from "../../prompts/index.js";
import type { DistillRequest, DistillResult, Harness, Refusal } from "../harness.js";
import { registerHarness } from "../registry.js";
import { HarnessSession } from "../session.js";
import type { Provenance, RunRecord, Skill, Stage } from "../schemas.js";

export const BESPOKE_ONE_SHOT = "bespoke-one-shot";
/** This harness's own process version; a change to what it records, asks of the model or runs bumps it (design/notes/skill-process.md). */
export const BESPOKE_PROCESS_VERSION = "1";

export interface BespokeConfig {
  role: RoleDriver;
  /** The model that makes the skill, pinned by id. */
  model: string;
  /** Spend cap for the one call. */
  maxUsd: number;
  settings?: ModelSettings | undefined;
  price?: PriceQuote | undefined;
  now?: (() => number) | undefined;
  /** The `distiller` prompt version; default 1. */
  promptVersion?: string | undefined;
}

/** A run as text for the model: the prompt, each turn's reasoning (when the provider returned any) and text, every call and what came back, and the final answer. */
export function renderRun(run: RunRecord): string {
  const lines = [`# Run ${run.id}`, "", "## Prompt", "", run.prompt.trim(), "", "## What happened", ""];
  let call = 0;
  run.turns.forEach((turn, i) => {
    const said = turn.text.trim();
    if (turn.reasoning !== undefined || said !== "") {
      lines.push(`### Turn ${i + 1}`);
      if (turn.reasoning !== undefined) lines.push(`Reasoning: ${turn.reasoning.trim()}`);
      if (said !== "") lines.push(`Said: ${said}`);
      lines.push("");
    }
    for (const c of turn.calls) {
      call += 1;
      lines.push(`### Call ${call}: ${c.tool} ${JSON.stringify(c.arguments)}`, `Status: ${c.status === "ok" ? "ok" : "refused"}`, "```", c.output.trim(), "```", "");
    }
  });
  lines.push("## Final answer", "", run.finalAnswer.trim(), "");
  return lines.join("\n");
}

const nameRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const answerSchema = z.strictObject({
  name: z.string().regex(nameRegex).max(64),
  description: z.string().min(1).max(500),
  body: z.string().min(1),
  references: z.array(z.strictObject({ path: z.string().min(1), content: z.string() })).optional(),
  evidence: z.array(z.strictObject({ run: z.string(), call: z.number().int().optional() })).optional(),
});

/** The JSON Schema the model is given for its answer. */
const ANSWER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "body"],
  properties: {
    name: { type: "string", description: "lowercase letters, digits and hyphens" },
    description: { type: "string" },
    body: { type: "string" },
    references: { type: "array", items: { type: "object", additionalProperties: false, required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } } },
    evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["run"], properties: { run: { type: "string" }, call: { type: "integer" } } } },
  },
} as const;

/** Assemble a skill from a valid answer, through the package checks. Throws the package checks' own fixed text. */
function skillOf(a: z.infer<typeof answerSchema>): Skill {
  const main = `---\nname: ${a.name}\ndescription: ${a.description}\n---\n\n${a.body.trim()}\n`;
  const pkg = packageFromFiles({ "SKILL.md": main, ...Object.fromEntries((a.references ?? []).map((r) => [r.path, r.content])) });
  return { name: a.name, description: a.description, files: Object.entries(pkg).map(([path, content]) => ({ path, content })), ...(a.evidence === undefined ? {} : { evidence: a.evidence }) };
}

/**
 * The role driver's own check of an answer: it names fields and limits and never repeats what the model wrote, since the driver may show it back to the model.
 * Returns undefined for a valid answer.
 */
export function checkAnswer(answer: unknown): string | undefined {
  const parsed = answerSchema.safeParse(answer);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => (i.path.length === 0 ? "answer" : String(i.path[0]))))];
    return `fields not valid: ${fields.join(", ")} (name: lowercase letters, digits and hyphens; description: 1 to 500 characters; body: required; references and evidence: as in the schema)`;
  }
  if (!hasCitation(parsed.data.body)) return "body: every claim needs a citation in the form 'run 001 call 4'";
  try {
    skillOf(parsed.data);
  } catch {
    return "references: a path leaves the skill folder, or the package is over the size limit";
  }
  return undefined;
}

class BespokeSession extends HarnessSession {
  private stages: Stage[] = [];
  private resolved: string[] = [];
  private readonly prompt: PromptVersion;

  constructor(private readonly c: BespokeConfig) {
    super();
    this.prompt = loadVersion("distiller", c.promptVersion ?? "1");
  }

  protected async onRecord(): Promise<void> {
    // The run is kept by the session; this harness has no store of its own.
  }

  protected async onDistill(_request: DistillRequest, runs: readonly RunRecord[], signal: AbortSignal): Promise<DistillResult> {
    const c = this.c;
    const refuse = (code: Refusal["code"], reason?: string): Refusal => {
      const priced = this.stages.filter((s) => s.costUsd !== null);
      return { ok: false, code, spendUsd: priced.length === 0 ? null : priced.reduce((n, s) => n + (s.costUsd as number), 0), stages: this.stages, ...(reason === undefined ? {} : { reason }) };
    };
    const text = runs.map(renderRun).join("\n---\n\n");
    if (text.length > LIMITS.recordingsChars) return refuse("failed", `RecordingsTooLarge: the recordings exceed ${LIMITS.recordingsChars.toLocaleString("en-US")} characters`);

    const now = c.now ?? Date.now;
    const startedAt = now();
    let r;
    try {
      r = await c.role({ prompt: text, system: this.prompt.text.trim(), model: c.model, schema: ANSWER_JSON_SCHEMA as unknown as Record<string, unknown>, maxUsd: c.maxUsd, signal, check: checkAnswer, ...(c.settings === undefined ? {} : { settings: c.settings }), ...(c.price === undefined ? {} : { price: c.price }) });
    } catch (e) {
      if (signal.aborted) return refuse("cancelled");
      return refuse("failed", e instanceof HarnessError ? reasonOf(e) : "DriverFailed: the distiller call failed");
    }
    const endedAt = now();
    this.stages = [{ stage: "distill", durationMs: Math.max(0, endedAt - startedAt), tokens: r.tokens, costUsd: r.costUsd, model: { requested: r.requestedModel, resolved: r.resolvedModel } }];
    this.resolved = r.resolvedModel === null ? [] : [r.resolvedModel];

    if (!r.ok) {
      const reason = r.reason ?? "DriverFailed: the distiller call failed";
      if (signal.aborted || /^RunCancelled/.test(reason)) return refuse("cancelled", reason);
      return refuse(/spend cap/i.test(reason) ? "spend_limit" : "failed", reason);
    }
    // The driver's check ran inside the call; the answer is checked again here, since a harness trusts nothing it did not check.
    const problem = checkAnswer(r.answer);
    if (problem !== undefined) return refuse("failed", "AnswerInvalid: the distiller's answer did not pass the schema");
    return { ok: true, skills: { skills: [skillOf(answerSchema.parse(r.answer))] }, stages: this.stages };
  }

  protected async onClose(): Promise<void> {
    // Nothing was created outside the process.
  }

  describe(): Provenance {
    const c = this.c;
    const priced = this.stages.filter((s) => s.costUsd !== null);
    const sum = (key: "input" | "output" | "cacheRead" | "cacheCreation") => {
      const given = this.stages.flatMap((s) => (s.tokens === null || s.tokens[key] === null ? [] : [s.tokens[key] as number]));
      return given.length === 0 ? null : given.reduce((a, b) => a + b, 0);
    };
    const s = c.settings;
    return {
      harness: { name: BESPOKE_ONE_SHOT, processVersion: BESPOKE_PROCESS_VERSION },
      roles: { distiller: { requested: c.model, resolved: this.resolved, settings: s === undefined ? null : { temperature: s.temperature ?? null, effort: s.effort ?? null, thinking: s.thinking ?? null }, price: c.price ?? null } },
      prompts: { distiller: { version: this.prompt.version, sha256: this.prompt.sha256 } },
      service: null,
      // The recordings go to the model provider the project already calls, as a player or the critic does, and to no store that keeps them.
      retainedExternally: false,
      stages: this.stages,
      spend: { costUsd: priced.length === 0 ? null : priced.reduce((n, x) => n + (x.costUsd as number), 0), pricedStages: priced.length, unpricedStages: this.stages.length - priced.length, tokens: { input: sum("input"), output: sum("output"), cacheRead: sum("cacheRead"), cacheCreation: sum("cacheCreation") } },
    };
  }
}

export function bespokeOneShotHarness(config: BespokeConfig): Harness {
  return {
    name: BESPOKE_ONE_SHOT,
    async open(_experimentId: string, signal: AbortSignal) {
      if (signal.aborted) throw new HarnessErrorCancelled();
      return new BespokeSession(config);
    },
  };
}

class HarnessErrorCancelled extends HarnessError {
  constructor() {
    super("LoopCancelled", "the distillation was cancelled before it began");
  }
}

registerHarness(BESPOKE_ONE_SHOT, (config) => bespokeOneShotHarness(config as BespokeConfig));
