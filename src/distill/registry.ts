// The table of harness names to constructors, as providers are chosen from the provider table (ADR-008, spec 009 FR-001).
import { HarnessRefused } from "../harness/errors.js";
import type { Harness } from "./harness.js";

export type HarnessFactory = (config?: unknown) => Harness;

const table = new Map<string, HarnessFactory>();

export function registerHarness(name: string, factory: HarnessFactory): void {
  table.set(name, factory);
}

export const harnessNames = (): string[] => [...table.keys()].sort();

/** A harness by name; an unknown name is refused, naming the known ones, before any work or spend. */
export function getHarness(name: string, config?: unknown): Harness {
  const factory = table.get(name);
  if (factory === undefined) throw new HarnessRefused(`unknown harness '${name}'; known: ${harnessNames().join(", ") || "none"}`);
  return factory(config);
}

/** Refuse an unknown name without building anything, so a command can check it before it reads a run or spends. */
export function assertHarnessKnown(name: string): void {
  if (!table.has(name)) throw new HarnessRefused(`unknown harness '${name}'; known: ${harnessNames().join(", ") || "none"}`);
}
