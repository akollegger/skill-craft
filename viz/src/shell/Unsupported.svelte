<script lang="ts">
  import type { LoadError } from "../contract/client.ts";

  let { error }: { error: LoadError } = $props();

  const message = $derived(
    error.kind === "unsupported-format"
      ? `This page reads catalog format 1, and the data is format ${String(error.format)}. Use a build of the visualizer that matches the data.`
      : error.kind === "http"
        ? `The catalog could not be loaded (${error.status}). Check that the page is served together with its catalog.json.`
        : error.kind === "network"
          ? "The catalog could not be reached. Check that the visualizer's process is still running."
          : `The catalog is not in a form this page understands: ${error.message}`,
  );
</script>

<div role="alert" class="max-w-prose p-6 font-mono text-sm text-mid-hibiscus">
  <p class="font-pixel text-xl text-light-gray">Can't show these runs.</p>
  <p class="mt-2">{message}</p>
</div>
