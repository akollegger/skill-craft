/**
 * Write a folder of runs as a static site: catalog.json and bundles/<id>/ for every run that can be opened, and the
 * built page beside them. The folder is only read.
 * Usage: pnpm dev scripts/viz-export.ts <folder> <dest> [--no-page]
 * Refuses an existing destination, one inside the folder, and a page that has not been built (use --no-page).
 */
import { vizExportCli } from "../src/viz/cli.js";

process.exitCode = vizExportCli(process.argv.slice(2), { out: (l) => console.log(l), err: (l) => console.error(l) });
