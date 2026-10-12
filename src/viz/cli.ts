import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { HarnessError } from "../harness/errors.js";
import { REPO } from "../harness/paths.js";
import { RunCatalog } from "./catalog.js";
import { VizRefused } from "./errors.js";
import { exportFolder } from "./export-folder.js";
import { startVizServer } from "./server.js";

export interface VizDeps {
  out: (line: string) => void;
  err: (line: string) => void;
  /** Aborting it stops the server and ends the command. */
  signal?: AbortSignal | undefined;
  /** The built page. Default: `dist-viz` in the repository. */
  pageDir?: string | undefined;
}

export const VIZ_USAGE = "usage: viz.ts <folder> [--port N]   (--port 0 picks a free port; default 4747)";

/** Where the built page is, unless a caller says otherwise. */
export const DEFAULT_PAGE_DIR = resolve(REPO, "dist-viz");

/** The `viz` command as a function: arguments in, lines out, an exit code back. The script is a thin wrapper. */
export async function vizCli(argv: string[], deps: VizDeps): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { port: { type: "string", default: "4747" } } });
    const [folder] = positionals;
    if (!folder || positionals.length > 1) throw new VizRefused(VIZ_USAGE);
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new VizRefused("--port must be a whole number from 0 to 65535");

    const server = await startVizServer({ folder, pageDir: deps.pageDir ?? DEFAULT_PAGE_DIR, port });
    const runs = new RunCatalog(folder).scan().catalog.runs;
    const ready = runs.filter((r) => r.status === "ready").length;
    deps.out(`${runs.length} runs found in ${folder} (${ready} can be opened)`);
    deps.out(`serving ${server.url}`);

    await new Promise<void>((done) => {
      if (deps.signal?.aborted) return done();
      deps.signal?.addEventListener("abort", () => done(), { once: true });
    });
    await server.close();
    return 0;
  } catch (e) {
    if (e instanceof VizRefused) deps.err(e.message);
    else if (e instanceof TypeError && /Unknown option|argument/i.test(e.message)) deps.err(`${e.message}\n${VIZ_USAGE}`);
    else deps.err(e instanceof HarnessError ? `${e.code}: ${e.message}` : "unexpected error");
    return 1;
  }
}

export const EXPORT_USAGE = "usage: viz-export.ts <folder> <dest> [--no-page]";

/**
 * The `viz-export` command: write a folder of runs as a static tree, and copy the built page beside it unless told
 * not to. Prints how many runs it wrote and each one it could not, with the reason. Skipped runs are not a failure.
 */
export function vizExportCli(argv: string[], deps: Pick<VizDeps, "out" | "err" | "pageDir">): number {
  try {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { "no-page": { type: "boolean", default: false } } });
    const [folder, dest] = positionals;
    if (!folder || !dest || positionals.length > 2) throw new VizRefused(EXPORT_USAGE);
    const r = exportFolder(folder, dest, values["no-page"] ? {} : { pageDir: deps.pageDir ?? DEFAULT_PAGE_DIR });
    deps.out(`${dest}: ${r.exported} runs exported${r.skipped.length > 0 ? `, ${r.skipped.length} left out` : ""}`);
    for (const s of r.skipped) deps.out(`left out ${s.label}/${s.run}: ${s.reason}`);
    return 0;
  } catch (e) {
    if (e instanceof VizRefused) deps.err(e.message);
    else if (e instanceof TypeError && /Unknown option|argument/i.test(e.message)) deps.err(`${e.message}\n${EXPORT_USAGE}`);
    else deps.err(e instanceof HarnessError ? `${e.code}: ${e.message}` : "unexpected error");
    return 1;
  }
}
