# 01 — Setup and blog review

Date: 2026-09-29

## Goal
Design a demo of skill distillation using Neo4j Agent Memory, as described in
https://neo4j.com/blog/genai/from-agent-memory-to-portable-skills/

## What we did
1. Added the plugin marketplace: `claude plugin marketplace add neo4j-labs/nams-plugins@latest`
   (repo: https://github.com/neo4j-labs/nams-plugins).
2. Inspected the `nams-hooks` plugin before installing. It hooks SessionStart,
   UserPromptSubmit, PostToolUse and Stop, and posts to the hosted NAMS service at
   `https://memory.neo4jlabs.com`. Config: `NAMS_API_KEY` (required),
   `NAMS_WORKSPACE_ID` (optional), `NAMS_BASE_URL`. Also reads `~/.nams/config.json`
   and `.nams/config.json`.
3. User installed and configured `nams-hooks@nams-plugins` (config via plugin userConfig,
   not a config file). Cognee memory plugin was disabled to avoid two memories.
4. Verified: `~/.nams/logs/claude/*.jsonl` shows `201` responses for
   `recordReasoningStep` (`/v1/reasoning/steps`) and `recordToolCall`
   (`/v1/reasoning/tool-calls`). Recording works.

## Blog post summary
Seven-stage pipeline: Scope -> Snapshot -> Consolidate -> Graph -> Synthesize -> Gates -> Persist.
- Input: `:AgentStep` and `:ToolCall` nodes (reasoning memory) plus messages and entities.
- Consolidate clusters recurring actions by frequency; splits successes from anti-patterns.
- Graph stage derives step topology (sequence / one-of / parallel / retry) deterministically.
- Synthesize (LLM) writes claims with source citations; unsourced claims are dropped.
- Gates: grounding >= 0.9, coverage >= 0.6, coherence, schema, PII.
- Output: spec-compliant `SKILL.md` with provenance, typed step graph, `GROUNDED_IN` edges.
  Lands pending human review.
- Governance: contradiction-drift detection; `repairStep` re-grounds affected steps, cuts patch version.
- Portable: Claude Code skill, NAMS MCP server, or REST.
- Evidence cited: Agent Instruction Protocol (arXiv 2606.04781), +14.1pp pass rate on SkillsBench.
- Scopes with fewer than 3 recorded steps degrade to prose.

## Draft demo shape
Record a repeatable task 3-5 times (including a failure and recovery) -> distill ->
review the pending skill -> load into a fresh agent -> compare with/without skill ->
optional: break a tool, show drift detection and `repairStep`.

## Open question (next)
**How is distillation triggered?** The blog doesn't say (UI button, REST endpoint, MCP tool?).
Exploring this is the next step and is itself part of the learning.

## Notes
- Recorded session data lives at `~/.nams/logs/claude/` and `~/.nams/state/claude/`.
- This session itself is being recorded to NAMS, so it can serve as source material.
