# Live check: a thinking model as a role under a small cap

Run by `test/live-thinking-role.test.ts` (spec 007, T054).

- Model: `anthropic/claude-opus-5-5`.
- Spend cap $0.02 (an output ceiling of about 1000 tokens): a complete schema-valid answer; tokens {"input":256,"output":350,"cacheRead":0,"cacheCreation":0}.
- Spend cap $0.003 (a ceiling of about 150 tokens, tight enough to cut off reasoning): a fixed failure, `DriverFailed: the role reached its output limit`; tokens {"input":256,"output":150,"cacheRead":0,"cacheCreation":0}.
- Never a partial answer: a complete answer parsed against the schema, or the failure carried no answer.
