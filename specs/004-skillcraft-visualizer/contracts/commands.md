# Contract: the commands

## `viz`: serve a folder of runs

```bash
pnpm dev scripts/viz.ts <folder> [--port N]
```

- `<folder>` is any folder: a collection of experiments, one experiment's folder, a single run, or a folder of
  bundles. It is read and never written.
- Serves the built page and the contract on `http://127.0.0.1:<port>/` (default 4747; `--port 0` picks a free
  port). Prints the URL once listening and a one-line count of what it found.
- Refuses, printing a one-line cause and exiting non-zero, when: `<folder>` does not exist or is not a
  directory; the page has not been built (`pnpm build:viz`); the port is taken.
- A folder with no runs starts normally; the page says so and says what it looks for.
- Stops on `SIGINT`.

## `viz-export`: write a static tree

```bash
pnpm dev scripts/viz-export.ts <folder> <dest>
```

- Writes `catalog.json` and `bundles/<id>/…` (see the catalog contract) for every ready run in `<folder>`, and
  copies the built page into `<dest>` unless `--no-page` is given.
- Refuses when `<dest>` exists, or the page is needed and not built.
- Prints how many runs were exported and, for each run that was not, its path and reason. Exits zero when at
  least the command itself succeeded, even if some runs were skipped.
- Builds in a temporary sibling folder and renames on success, so a failure leaves nothing behind.

## Build and development

```bash
pnpm build:viz     # vite build -> dist-viz/
pnpm dev:viz <folder>   # runs scripts/dev-viz.ts: the Vite dev server with the local process's request handler mounted over <folder>; hot reload
```

`pnpm typecheck` also checks the page's TypeScript files in `viz/` (`.svelte` files are not type-checked yet; see research R2). `pnpm test` runs both test projects.
CI builds the page.
