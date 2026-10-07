/**
 * Run the page with hot reload over a folder of runs: Vite's dev server, with the local process's request handler
 * mounted ahead of Vite's own middleware so the page and the data are served together.
 * Usage: pnpm dev:viz <folder>
 */
import { statSync } from "node:fs";
import { createServer } from "vite";
import { RunCatalog } from "../src/viz/catalog.js";
import { createRequestHandler } from "../src/viz/server.js";
import { resolve } from "node:path";
import { REPO } from "../src/harness/paths.js";

const folder = process.argv[2];
if (!folder) {
  console.error("usage: dev-viz.ts <folder>");
  process.exit(1);
}
const info = statSync(folder, { throwIfNoEntry: false });
if (!info?.isDirectory()) {
  console.error(info ? `${folder} is not a folder` : `${folder} does not exist`);
  process.exit(1);
}

const handler = createRequestHandler({ catalog: new RunCatalog(folder) });
const server = await createServer({
  configFile: resolve(REPO, "viz/vite.config.ts"),
  server: { host: "127.0.0.1" },
  plugins: [{ name: "viz-data", configureServer: (s) => void s.middlewares.use(handler) }],
});
await server.listen();
server.printUrls();

process.once("SIGINT", () => void server.close().then(() => process.exit(0)));
