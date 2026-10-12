# Contract: the catalog and the bundles

What the page reads. Two suppliers provide it identically: the local process (derived from a folder) and a
static host (an exported tree). The page uses relative addresses and no other source.

## Address space

```text
./                          the page (index.html and its assets)
./catalog.json              the Catalog
./bundles/<id>/bundle.json  manifest (ADR-002 BundleManifest plus the optional fields in data-model.md)
./bundles/<id>/frames.jsonl one Frame per line, seq 0..N contiguous
./bundles/<id>/trace.jsonl  trace lines (empty file when the trace did not match)
./bundles/<id>/score.json   { ended, reason?, turns, score, measured }
```

`<id>` is the catalog entry's `id`. Only `ready` entries have bundles.

## Rules for every supplier

- Responses are read-only: `GET` and `HEAD` only; anything else is `405`.
- Content types: `application/json` for `.json`, `application/x-ndjson` for `.jsonl`; the page's files by
  extension.
- An unknown path, or an `<id>` not in the catalog, is `404`. An address never selects a file by a
  filesystem path: ids are looked up in the catalog.
- `catalog.json` carries no timestamp and no filesystem path. Entries are ordered by `label`, then `run`,
  then `id`, so the same folder gives the same bytes.
- Nothing in the catalog or any bundle names a world file, lists a recipe, or carries an item description,
  agent text or reasoning. Item ids appear only inside `frames.jsonl` and `preview.table`, as placed, held,
  crafted or previewed by the run.
- A `bundle.json` or catalog with an unknown `format` is shown by the page as an unsupported-version message.
  Unknown fields are ignored.

## Local supplier (the `viz` process)

- Binds `127.0.0.1` only. Rejects a request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`
  with `421`.
- `GET /catalog.json` rescans the folder (the result is cached per run, research R5) and returns the catalog.
- `GET /bundles/<id>/<file>` returns the file for a `ready` run from the in-memory bundle built by
  `buildBundle`, or streams the file from a bundle folder for `kind: "bundle"` entries after checking that
  the file is one of the four names.
- Static page files come from `dist-viz/`; anything else is `404`. If `dist-viz/` is missing the process
  refuses to start and says how to build it.

## Static supplier (the export)

`viz-export` writes `catalog.json` and `bundles/<id>/…` for every `ready` entry into a destination folder,
using the same builders; entries that are not ready are kept in the catalog with their reason and have no
bundle. Copying the built page's files beside them gives a complete static site. The export is read-only with
respect to the source folder, builds in a temporary sibling and renames on success, and refuses a destination
that already exists.

Item art (an optional `art` on the catalog and on the manifest) is specified in
[specs/006-sprite-library/contracts/art.md](../../006-sprite-library/contracts/art.md).

## Guarantees checked by tests

- The catalog and every bundle from the local supplier equal those in an export of the same folder, byte
  for byte.
- A search of the catalog and bundles for the world file's name, every item description and every recipe id
  finds nothing.
- Frames in a bundle equal an independent replay of the run's log on its world.
- Requests with a path containing `..`, an encoded separator, an unknown id, or a method other than `GET` or
  `HEAD` never read outside the derived data.
