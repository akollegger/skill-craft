// Composing the text a run sends (spec 008): a versioned base prompt (or an ad hoc template) filled for a goal, the arm sentence if
// any, the budget it states, and the fingerprints that identify it. Pure: it reads prompt files and nothing else.
import { PromptRefused } from "../harness/errors.js";
import { checkPlaceholders, fill, fingerprint, loadVersion, type PromptValues } from "./index.js";

export interface ComposeInput {
  goal: { item: string; qty: number };
  /** The numbered base prompt to use (default `1`); exclusive with `template`. */
  version?: string | undefined;
  /** An ad hoc base template (the text of a `--prompt-file`); recorded as version `custom`. */
  template?: string | undefined;
  /** A free-text arm sentence, recorded as `custom`; exclusive with `armSentenceVersion`. */
  note?: string | undefined;
  armSentenceVersion?: string | undefined;
  /** The step limit; it is the budget the prompt states for a `{turns}` prompt, and the step limit for a call budget. */
  maxTurns: number;
  /** A call budget, for a prompt that states `{budget}`. */
  callBudget?: number | undefined;
}

export interface Composed {
  /** What the agent receives and `prompt.txt` holds (without its trailing newline). */
  text: string;
  /** `N`, or `custom`. */
  version: string;
  /** SHA-256 of the base prompt's template as written (a numbered version's file bytes), with no goal, budget or arm sentence filled in, so
   * one version is one value across goals and budgets. */
  baseSha256: string;
  /** SHA-256 of `text`. */
  sha256: string;
  budget: { kind: "steps" | "calls"; limit: number };
  armSentence?: { version: string; sha256: string };
}

export function composePrompt(input: ComposeInput): Composed {
  if (input.template !== undefined && input.version !== undefined) throw new PromptRefused("give a prompt version or a template, not both");
  if (input.note !== undefined && input.armSentenceVersion !== undefined) throw new PromptRefused("give an arm sentence version or free text, not both");

  let template: string;
  let version: string;
  if (input.template !== undefined) {
    checkPlaceholders("base", input.template, "the prompt template");
    template = input.template;
    version = "custom";
  } else {
    const v = loadVersion("base", input.version ?? "1");
    template = v.text;
    version = v.version;
  }

  const calls = /\{budget\}/.test(template);
  if (calls && input.callBudget === undefined) throw new PromptRefused("this prompt states a call budget; give --call-budget");
  if (!calls && input.callBudget !== undefined) throw new PromptRefused("this prompt states a step budget; give --max-turns, not --call-budget");

  const what = input.goal.qty === 1 ? `one ${input.goal.item}` : `${input.goal.qty} of ${input.goal.item}`;
  const values: PromptValues = { what, item: input.goal.item, ...(calls ? { budget: input.callBudget as number } : { turns: input.maxTurns }) };
  const base = fill(template, values);

  let sentence: { text: string; version: string; sha256: string } | undefined;
  if (input.armSentenceVersion !== undefined) {
    const s = loadVersion("arm-sentence", input.armSentenceVersion);
    sentence = { text: s.text.trim(), version: s.version, sha256: s.sha256 };
  } else if (input.note !== undefined) {
    sentence = { text: input.note, version: "custom", sha256: fingerprint(input.note) };
  }

  const text = sentence === undefined ? base : `${base}\n${sentence.text}`;
  return {
    text,
    version,
    baseSha256: fingerprint(template),
    sha256: fingerprint(text),
    budget: calls ? { kind: "calls", limit: input.callBudget as number } : { kind: "steps", limit: input.maxTurns },
    ...(sentence === undefined ? {} : { armSentence: { version: sentence.version, sha256: sentence.sha256 } }),
  };
}
