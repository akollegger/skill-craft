<script lang="ts">
  import type { AttributeValue } from "../../../src/viz/contract.ts";
  import { attributeLabel, type AttributeInfo } from "../state/attributes.ts";
  import { opsFor, type Filter, type Op, type View } from "../state/view.ts";

  let { attributes, view, onChange }: { attributes: AttributeInfo[]; view: View; onChange: (view: View) => void } = $props();

  const set = (patch: Partial<View>): void => onChange({ ...view, ...patch });

  // The filter being built; it joins the view when "Add filter" is pressed.
  let draftAttr = $state("");
  let draftOp = $state<Op>("is");
  // A number input binds a number, a text input a string, and an empty number input null: read it as text.
  let draftValue = $state<string | number | null>("");
  const draftText = $derived(String(draftValue ?? ""));
  const info = $derived(attributes.find((a) => a.name === draftAttr));
  const ops = $derived(opsFor(info?.kind ?? "text"));

  function chooseAttr(name: string): void {
    draftAttr = name;
    draftOp = opsFor(attributes.find((a) => a.name === name)?.kind ?? "text")[0]!;
    draftValue = "";
  }

  function valueOf(): AttributeValue | undefined {
    if (draftOp === "missing") return undefined;
    if (info?.kind === "number") return draftText.trim() === "" ? undefined : Number(draftText);
    if (info?.kind === "flag") return draftText === "true";
    return draftText;
  }
  const canAdd = $derived(draftAttr !== "" && (draftOp === "missing" || (info?.kind === "flag" ? draftText !== "" : draftText.trim() !== "" && !(info?.kind === "number" && Number.isNaN(Number(draftText))))));

  function addFilter(): void {
    const value = valueOf();
    const f: Filter = value === undefined ? { attr: draftAttr, op: draftOp } : { attr: draftAttr, op: draftOp, value };
    set({ filters: [...view.filters, f] });
    draftValue = "";
  }

  const describeFilter = (f: Filter): string => `${attributeLabel(f.attr)} ${f.op === "missing" ? "is missing" : `${f.op} ${typeof f.value === "boolean" ? (f.value ? "yes" : "no") : String(f.value)}`}`;
  const field = "border border-mid-baltic bg-black px-2 py-1 text-light-gray focus-visible:outline-2 focus-visible:outline-light-baltic";
  const button = "border border-mid-baltic px-2 py-1 hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic disabled:opacity-40";
</script>

<div class="flex flex-col gap-3 border-b border-dark-baltic pb-3 font-mono text-sm">
  <div class="flex flex-wrap items-end gap-4">
    <label class="flex flex-col gap-1 text-baltic">
      <span>Group by</span>
      <select class={field} value={view.group ?? ""} onchange={(e) => set({ group: e.currentTarget.value === "" ? null : e.currentTarget.value })}>
        <option value="">nothing</option>
        {#each attributes as a (a.name)}<option value={a.name}>{attributeLabel(a.name)}</option>{/each}
      </select>
    </label>

    <label class="flex flex-col gap-1 text-baltic">
      <span>Sort by</span>
      <span class="flex gap-1">
        <select class={field} value={view.sort?.attr ?? ""} onchange={(e) => set({ sort: e.currentTarget.value === "" ? null : { attr: e.currentTarget.value, dir: view.sort?.dir ?? "asc" } })}>
          <option value="">catalog order</option>
          {#each attributes as a (a.name)}<option value={a.name}>{attributeLabel(a.name)}</option>{/each}
        </select>
        <button class={button} disabled={view.sort === null} aria-label={`Sort direction: ${view.sort?.dir === "desc" ? "descending" : "ascending"}`} onclick={() => view.sort && set({ sort: { ...view.sort, dir: view.sort.dir === "asc" ? "desc" : "asc" } })}>
          {view.sort?.dir === "desc" ? "↓" : "↑"}
        </button>
      </span>
    </label>

    <label class="flex flex-col gap-1 text-baltic">
      <span>Search</span>
      <input type="search" class={field} value={view.search} placeholder="any text" oninput={(e) => set({ search: e.currentTarget.value })} />
    </label>

    <div role="group" aria-label="Presentation" class="flex gap-1">
      {#each ["list", "grid"] as const as p (p)}
        <button class={`${button} ${view.presentation === p ? "bg-dark-baltic text-highlight-yellow" : ""}`} aria-pressed={view.presentation === p} onclick={() => set({ presentation: p })}>{p === "list" ? "List" : "Grid"}</button>
      {/each}
    </div>
  </div>

  <div class="flex flex-wrap items-end gap-2" role="group" aria-label="Add a filter">
    <label class="flex flex-col gap-1 text-baltic">
      <span>Filter attribute</span>
      <select class={field} value={draftAttr} onchange={(e) => chooseAttr(e.currentTarget.value)}>
        <option value="">choose…</option>
        {#each attributes as a (a.name)}<option value={a.name}>{attributeLabel(a.name)}</option>{/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-baltic">
      <span>Filter operator</span>
      <select class={field} bind:value={draftOp} disabled={draftAttr === ""}>
        {#each ops as o (o)}<option value={o}>{o === "missing" ? "is missing" : o}</option>{/each}
      </select>
    </label>
    {#if draftOp !== "missing"}
      <label class="flex flex-col gap-1 text-baltic">
        <span>Filter value</span>
        {#if info?.kind === "flag"}
          <select class={field} bind:value={draftValue}>
            <option value="">choose…</option>
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
        {:else}
          <input class={field} type={info?.kind === "number" ? "number" : "text"} list="values" bind:value={draftValue} disabled={draftAttr === ""} />
          {#if info?.kind === "text"}
            <datalist id="values">{#each info.values.slice(0, 50) as v (String(v))}<option value={String(v)}></option>{/each}</datalist>
          {/if}
        {/if}
      </label>
    {/if}
    <button class={button} disabled={!canAdd} onclick={addFilter}>Add filter</button>
  </div>

  {#if view.filters.length > 0}
    <ul aria-label="Active filters" class="flex flex-wrap gap-2">
      {#each view.filters as f, i (i)}
        <li class="flex items-center gap-1 bg-dark-baltic px-2 py-1 text-light-baltic">
          <span>{describeFilter(f)}</span>
          <button class="px-1 hover:text-highlight-yellow focus-visible:outline-2 focus-visible:outline-light-baltic" aria-label={`Remove filter: ${describeFilter(f)}`} onclick={() => set({ filters: view.filters.filter((_, j) => j !== i) })}>✕</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
