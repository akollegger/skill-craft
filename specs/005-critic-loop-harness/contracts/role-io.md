# Contract: the role seam and the two answers

## RoleDriver (`src/harness/role-driver.ts`, types only)

```ts
export interface RoleOptions {
  prompt: string;
  system?: string;
  model: string;                      // always pinned by id
  schema: Record<string, unknown>;    // JSON Schema for the answer
  maxUsd: number;                     // spend cap for this call
  signal: AbortSignal;
}

export interface RoleResult {
  ok: boolean;
  /** For ok: the answer exactly as returned, to be parsed by the caller's zod schema. */
  answer?: unknown;
  /** For not ok: `code: fixed message`; never the player's own text. */
  reason?: string;
  requestedModel: string;
  resolvedModel: string | null;
  tokens: { input: number | null; output: number | null; cacheRead: number | null; cacheCreation: number | null };
  costUsd: number | null;
  durationMs: number | null;
}

export type RoleDriver = (options: RoleOptions) => Promise<RoleResult>;
```

`sdkRoleDriver` (in `sdk-driver.ts`) runs one session with `tools: []`, no MCP servers, `settingSources: []`,
`outputFormat: json_schema`, a small `maxTurns` and `maxBudgetUsd = maxUsd`. It discards the session's free text.

## Critic prompt (assembled by `inputs.ts`)

Contains, in order: the rubric (version, questions and the critic's instructions), the goals the recordings covered, the recordings as text, and the
current package's files. Contains nothing else. Never contains: an earlier verdict, an earlier round's text, a path, the
world, recipes, goals files, solver output, a held-out goal or an evaluation result.

## Verdict (critic answer)

```json
{
  "overall": "accept | revise | reject",
  "questions": {
    "<rubric id>": { "value": "<=40 chars", "reason": "<=400 chars" }
  },
  "reasons": "<=800 chars",
  "proposedRevisions": ["<=300 chars", "... at most 10"]
}
```

`questions` has exactly the rubric's ids. The common-knowledge question's `value` may be `cannot_determine`.

## Reviser prompt

The critic's inputs (with the reviser's instructions in place of the critic's) plus the current verdict, and no earlier one.
It asks for the whole revised files.

## Revision (reviser answer)

```json
{
  "skillMd": "---\nname: ...\ndescription: ...\n---\n...",
  "provenanceMd": "...",
  "changes": [{ "what": "...", "why": "...", "sourceCalls": ["run 001 call 12"] }]
}
```

## Validation the loop applies

- zod parses the answer; failure is `VerdictInvalid` or `RevisionInvalid` with a fixed message
- `skillMd`: front matter with the candidate's `name` and a `description`; non-empty body; no citation pattern
- `changes`: at least one, so a rewrite cannot leave no record of what it changed
- `provenanceMd`: non-empty; the harness appends `## Change record` (every change and its checked sources) and, for any change with empty
  `sourceCalls`, `## Uncited changes`
- every `sourceCalls` entry names a run in the loop and a call number that exists in that run's recording
- `maxUsd` reached: the role result is `ok: false` with a fixed reason, and the loop stops (FR-024)
- a role result with `ok: false` stops the loop with its `reason`; the agent's text is never part of any error
