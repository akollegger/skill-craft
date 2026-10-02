/**
 * Serve a folder of runs, and the built page, on 127.0.0.1. The folder is only read.
 * Usage: pnpm dev scripts/viz.ts <folder> [--port N]
 * Refuses a folder that is missing, a page that has not been built (pnpm build:viz) and a port in use.
 */
import { vizCli } from "../src/viz/cli.js";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

process.exitCode = await vizCli(process.argv.slice(2), {
  out: (l) => console.log(l),
  err: (l) => console.error(l),
  signal: controller.signal,
});
