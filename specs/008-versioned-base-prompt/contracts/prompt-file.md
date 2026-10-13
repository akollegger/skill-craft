# Contract: prompt files and the listing

## Location and names

`prompts/<kind>/v<N>.<ext>`, kinds `base`, `arm-sentence`, `skill-tool`, `review-rubric`; `N` a positive integer without
leading zeros. `prompts/<kind>/CHANGELOG.md` has one `## v<N>` section per file. A version is never edited; a change is a
new file.

## Content

Plain UTF-8 text with no front matter, so the file's bytes are the prompt (the rubric is its existing JSON file).
Placeholders by kind are in data-model.md. Filling replaces every occurrence of a placeholder and trims leading and trailing
whitespace; the base prompt then gets the arm sentence after a newline, if any.

| Placeholder | Filled with |
|---|---|
| `{what}` | `one <item>` for a quantity of 1, else `<n> of <item>` |
| `{item}` | the goal's item id |
| `{turns}` / `{budget}` | the step budget / the call budget, as a decimal number |
| `{name}` | the installed skill's name |
| `{described}` | empty, or `: <the skill's description>` |

## Frozen outputs

Four tests hold today's outputs as literals: base v1 for a table of goals, quantities, budgets and sentences; the S2 sentence;
the skill tool's description with and without a description; and the rubric file's SHA-256. Each new file must reproduce its
old output byte for byte.

## Listing (`scripts/prompts.ts`)

Prints one line per kind and version: `kind  vN  sha256-prefix  changelog: yes|MISSING`. Exit 1 if any changelog entry is
missing, a kind has no versions, or a placeholder is unknown.

## Refusals (all before any run, loop or spend)

An unknown kind or version, an unreadable file, an unknown placeholder, both budget placeholders, no `{what}` in a base
prompt, a base version failing its word check, a version with no changelog section.
