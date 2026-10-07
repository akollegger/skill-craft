# Design note: the base prompt in a replay bundle

Status: proposed follow-up for the visualizer work (ADR-004, spec `004-skillcraft-visualizer`); not decided, nothing changed
in code. Date: 2026-10-04.
Origin: the critic-loop work ([PR #12](https://github.com/akollegger/skill-craft/pull/12), merged into `main` and then into
this branch on 2026-10-04). Its findings note, `design/notes/critic-loop-findings.md`, section "The base prompt is an experimental
variable", has the evidence.

## Why this matters now

The prompt a run was given is a condition of the run, like the world, the goal and the model. We treated it as fixed, and it is not.
On the faithful `stone_pickaxe` goal, rewording only the base prompt moved unaided Haiku from 0 of 5 to 4 of 5, and skill loading from
10 of 12 runs to 5 of 5 (small numbers, but large enough to matter). A viewer that shows two such runs with the same world, goal and
model, and no sign that their prompts differ, hides the one thing that changed.

## What a bundle carries today

On this branch the manifest gains `priorFit`, `promptNote` (the one fixed sentence an arm may add) and `skill { name, loaded, loadedAfter }`
(ADR-002 amendment of 2026-10-02, tasks T008 to T010 and T058 to T059 here). It does not carry the base prompt. `prompt.txt` stays in the
run folder and is not exported. `promptNote` alone cannot tell a run on the original prompt from one on a reworded prompt.

## Proposal

1. **Add the prompt text to the manifest** as `prompt`, and a short fingerprint as `promptSha256` (SHA-256 of `prompt.txt`), so a viewer can
   group runs that used the same prompt and mark where two groups differ. `promptNote` stays as it is; the prompt text already includes it.
2. **Show it as a condition** next to the world, goal and model, in the opened view, and as a "different prompt" marker when runs in one
   comparison do not share a fingerprint.
3. **Add `skill.sha256`** to the manifest's skill attributes. `score.json` already records it, and it lets a viewer tie a run to one
   revision of a skill, such as a round of a critic loop (`loops/<label>/loop.json` records each round's hash).
4. **Privacy.** The prompt is written by the experimenter, not the agent, and holds no recipe, item description or world file. The rule that a
   bundle carries no agent text or reasoning is unchanged. The privacy test (T010) gains a case that the new fields hold only the prompt text and a
   hash.

## Places that change

- ADR-002 §2.6 and its amendment (what a manifest may carry), and ADR-004's conditions table (the row that lists the prompt sentence).
- `src/harness/export.ts` and `src/harness/bundle.ts` (`BundleManifest`), the visualizer's `buildBundle` and the shared `src/viz/contract.ts`.
- Tests: `test/viz/bundle-build.test.ts` (T008), the privacy case (T010), `test/viz/attributes.test.ts` (T059), and a page test for the marker.
- The page: the opened view's conditions list and the comparison marker.

## Questions to settle

- Show the full prompt in the page, or only a fingerprint with the text on demand? It is a few lines, so showing it seems fine.
- Runs made before `--prompt-file` have a `prompt.txt` that is the original prompt, so their fingerprints all agree. Runs from older folders without
  `prompt.txt` get no `prompt` attribute, as with the other optional attributes.
- Does a comparison need to warn when prompts differ, or is a marker enough? ADR-003 says every arm shares one base prompt, so a difference inside
  an experiment is a mistake worth flagging, and across experiments it is information.

## Where the two lines of work stand

- The critic-loop work is merged into this branch (merge commit `a995670`), so `run-agent.ts --prompt-file` (`run.ts`, `cli.ts`; `{what}` is
  required, since it carries the quantity) and the "Critic loop rules" section of `AGENTS.md` are already here. The `AGENTS.md` conflict was
  resolved by keeping both sides. None of it changes `score.json`'s keys or the bundle.
- A run made with `--prompt-file` records the prompt actually sent in its `prompt.txt`, so the proposal's `prompt` and `promptSha256` can be
  read from that file with no change to how runs are written.
- Critic-loop records live in `loops/` (gitignored), beside `runs/`, so the folder scan never reads them.
