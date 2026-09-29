# 04 — Skills key unblocked

Date: 2026-09-29

## What happened
- Dashboard key creation offers no fine-grained scopes, only two presets:
  1. "Connect an agent": read/write memory, entities, ontology in **My Workspace only**.
  2. "Manage workspaces": manages any workspace and its databases, plus all memory operations.
- The OpenAPI spec confirms scopes are derived server-side from key category
  (`workspace` vs `admin`), never requested by the client. It doesn't list per-category scopes.
- We tried option 1 (least privilege, workspace-bound). The result, saved as `NAMS_SKILLS_KEY` in `.env`:
  **skills endpoints now work**. So "Connect an agent" includes `skills:read` (write is untested).
- The original `NAMS_API_KEY` (older "Default" key) stays as is; the hooks use their own key.

## Read-only results with the new key (My Workspace, `c34de59e-...`)
- `GET /skills/capabilities`:
  `{"distillation":true, "composition":false, "autosuggest":false, "attestationConfigured":false, "groundingThreshold":0.9, "coverageThreshold":0.6}`
- `GET /skills`, `/skills/runs`: empty. `/skills/published`: empty (agentskills.io discovery schema 0.2.0).
  `/skills/governance`: all empty.
- Still 403: `GET /workspace` and key management (`/auth/api-keys` needs a user token or admin key).
  Consistent with a workspace-bound data key.

## What it means
- **Distillation is enabled** for this workspace. **Autosuggest (`/skills/scan`) is off**, so we
  can't ask NAMS to propose candidate scopes; we must choose the scope ourselves.
- **`attestationConfigured: false`**: publishing will work but skills will be flagged unsigned,
  and `/verify` won't show a valid signature. Fine for a demo; worth stating on stage.
- **Composition is off**, so no `extract-subprocedure` in the demo.
- `skills:write` is unverified; the first `POST /skills/generate` will tell us.

## Next
1. Choose the demo task and record it in a workspace where it is the dominant procedure.
2. Pick the scope (`entity` or `ontology_class` are recommended over `workspace`).
3. First write action (`POST /skills/generate`) needs explicit go-ahead.
