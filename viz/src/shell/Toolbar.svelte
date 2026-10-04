<script lang="ts">
  import type { View } from "../state/view.ts";
  import Segmented from "./Segmented.svelte";

  let { view, onChange }: { view: View; onChange: (view: View) => void } = $props();

  const set = (patch: Partial<View>): void => onChange({ ...view, ...patch });

  // What can be sorted or grouped by is a short fixed list, not every attribute the runs carry. Choosing the sort that is already
  // chosen turns it round; choosing the group that is already chosen puts the runs back together.
  const SORTS = [
    { value: "actionCalls", label: "Calls" },
    { value: "durationMs", label: "Time" },
  ];
  const GROUPS = [
    { value: "world", label: "World" },
    { value: "goalItem", label: "Goal" },
  ];
  const sortBy = (attr: string): void => set({ sort: { attr, dir: view.sort?.attr === attr && view.sort.dir === "asc" ? "desc" : "asc" } });
  const groupBy = (attr: string): void => set({ group: view.group === attr ? null : attr });
</script>

<!-- One bar, full width in the list and in the grid, that stays at the top of the frame while the runs scroll. -->
<div class="sticky -top-4 z-20 -mx-4 -mt-4 flex h-16 items-end gap-6 bg-darkest-baltic px-4 pb-2 font-mono text-sm">
  <Segmented label="View" options={[{ value: "list", label: "List" }, { value: "grid", label: "Grid" }]} active={view.presentation} onPick={(p) => set({ presentation: p as View["presentation"] })} />
  <Segmented label="Sort" options={SORTS} active={view.sort?.attr ?? null} pip={view.sort?.dir ?? null} onPick={sortBy} />
  <Segmented label="Group" options={GROUPS} active={view.group} pip="square" onPick={groupBy} />
  <input
    type="search"
    aria-label="Search"
    placeholder="search"
    value={view.search}
    oninput={(e) => set({ search: e.currentTarget.value })}
    class="ml-auto min-w-0 flex-1 appearance-none border-0 bg-black px-3 py-1 text-light-gray shadow-[inset_2px_2px_0_rgba(0,0,0,0.6)] placeholder:text-baltic focus-visible:outline-2 focus-visible:outline-light-baltic [&::-webkit-search-cancel-button]:appearance-none"
  />
</div>
