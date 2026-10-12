import type { Attributes } from "../../../src/viz/contract.ts";

/** What a run records about its skill and nothing more; the skill's text, its source and the prompt's sentence stay out. */
export interface SkillFacts {
  name: string;
  loaded: boolean;
  pointed: boolean;
  /** "loaded after 3 calls", "never loaded", ... */
  when: string;
}

export function skillFacts(attributes: Attributes): SkillFacts | undefined {
  const name = attributes["skill"];
  if (typeof name !== "string") return undefined;
  const loaded = attributes["skillLoaded"] === true;
  const after = typeof attributes["skillLoadedAfter"] === "number" ? attributes["skillLoadedAfter"] : undefined;
  const when = !loaded ? "never loaded" : after === undefined ? "loaded" : after === 0 ? "loaded before the first call" : `loaded after ${after} ${after === 1 ? "call" : "calls"}`;
  return { name, loaded, pointed: attributes["promptNote"] !== undefined, when };
}

/** The sentence a screen reader and a tooltip give for the skill. */
export const skillText = (f: SkillFacts): string => `skill ${f.name}: ${f.when}${f.pointed ? ", prompt pointed at it" : ""}`;
