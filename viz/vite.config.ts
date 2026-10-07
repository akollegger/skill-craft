import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

// Relative base so the build works from any path, local process or static host. The dev data middleware is
// mounted by scripts/dev-viz.ts, not here, so this file stays a plain build configuration.
export default defineConfig({
  root,
  base: "./",
  plugins: [svelte(), tailwindcss()],
  build: { outDir: fileURLToPath(new URL("../dist-viz", import.meta.url)), emptyOutDir: true },
});
