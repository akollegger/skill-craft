import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// Two projects: the Node code and its tests as before, and the page's logic and components under jsdom.
// The browser condition makes Svelte resolve its client build, so components can be mounted in tests.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "node", environment: "node", include: ["test/**/*.test.ts"] } },
      {
        plugins: [svelte()],
        resolve: { conditions: ["browser"] },
        test: { name: "viz", environment: "jsdom", include: ["viz/test/**/*.test.ts"] },
      },
    ],
  },
});
