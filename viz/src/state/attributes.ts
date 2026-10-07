// Plainer words for a few names people look for; every other name is shown as its camelCase words.
const PLAIN: Record<string, string> = { actionCalls: "calls", costUsd: "cost", durationMs: "time", modelRan: "model", extraCalls: "extra calls", goalItem: "goal" };

export const attributeLabel = (name: string): string => PLAIN[name] ?? name.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
