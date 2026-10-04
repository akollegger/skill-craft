<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { BundleData, CatalogEntry } from "../../../src/viz/contract.ts";
  import { effectsForStep, sceneAt } from "../scene/model.ts";
  import type { SceneFactory, SceneHandle } from "../scene/handle.ts";
  import { delayBefore, initial, keyAction, reduce, stepTimes, type PlaybackAction } from "../state/playback.ts";
  import { callKind, describeCall, type CallKind } from "./calls.ts";
  import { formatClock } from "./clock.ts";
  import SkillMarker from "./SkillMarker.svelte";
  import { pipTone, TONE_BG, TONE_BORDER, TONE_TEXT, type Tone } from "./tone.ts";

  let { entry, bundle, createScene, onClose }: { entry: CatalogEntry; bundle: BundleData; createScene: SceneFactory; onClose: () => void } = $props();

  const frames = bundle.frames;
  const last = frames.length - 1;
  const times = stepTimes(frames, bundle.trace);
  const { score, measured } = bundle.result;
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let playback = $state(initial(frames.length));
  const frame = $derived(frames[playback.index]!);
  const atEnd = $derived(playback.index === last);
  const name = $derived(bundle.manifest.label);
  const best = $derived(bundle.manifest.best?.minCalls ?? null);

  const dispatch = (a: PlaybackAction): void => void (playback = reduce(playback, a));

  // Playing: wait as long as the next call took (cut to two seconds), then step.
  $effect(() => {
    if (!playback.playing) return;
    const wait = delayBefore(times, playback.index + 1);
    const t = setTimeout(() => dispatch({ type: "step", by: 1 }), wait);
    return () => clearTimeout(t);
  });

  // The scene is told each frame shown, with the effects only if it is a single step forward.
  let host: HTMLDivElement | undefined = $state();
  let section: HTMLElement | undefined = $state();
  let scene: SceneHandle | undefined;
  let drawError = $state("");
  let shown = 0;
  let gone = false;
  const attach = (h: SceneHandle): void => {
    if (gone) return h.destroy();
    scene = h;
    shown = untrack(() => playback.index);
    h.show(frames, shown, []);
  };
  onMount(() => {
    section?.focus();
    // A scene that cannot start (no WebGL, say) must not take the rest of the view with it: the score, the tape and
    // the controls still work, and the view says what is missing.
    const failed = (e: unknown): void => void (drawError = e instanceof Error ? e.message : "the scene failed");
    try {
      const made = createScene(host!, { reducedMotion });
      if (made instanceof Promise) made.then(attach).catch(failed);
      else attach(made);
    } catch (e) {
      failed(e);
    }
    return () => {
      gone = true;
      scene?.destroy();
    };
  });
  $effect(() => {
    const to = playback.index;
    untrack(() => {
      scene?.show(frames, to, effectsForStep(frames, shown, to));
      shown = to;
    });
  });

  function onKeyDown(e: KeyboardEvent): void {
    const t = e.target;
    // A button already acts on space, and a slider on the arrows; the view must not act a second time.
    if (e.key === " " && (t instanceof HTMLButtonElement || t instanceof HTMLInputElement)) return;
    if (e.key.startsWith("Arrow") && t instanceof HTMLInputElement) return;
    const a = keyAction(e.key);
    if (!a) return;
    e.preventDefault();
    if (a.type === "close") onClose();
    else dispatch(a);
  }

  const tape = $derived(
    frames.slice(1, playback.index + 1).map((f, k) => ({ f, i: k + 1 })).slice(-9).reverse(),
  );
  const KIND_CLASS: Record<CallKind, string> = {
    // Not green, yellow or red: those say how the run is doing against the ideal (tone.ts), never what a call was.
    refusal: "text-baltic italic",
    craft: "text-light-gray",
    place: "text-light-baltic",
    "take-back": "text-baltic",
    read: "text-baltic opacity-70",
  };

  const reachedNow = $derived(frame.reached);
  const status = $derived.by(() => {
    if (reachedNow) return `Got it in ${score.callsToGoal} calls.${best === null ? "" : ` The best possible is ${best}.`}`;
    if (!atEnd) return "Working it out.";
    if (bundle.result.ended === "error") return `The run ended with an error after ${score.actionCalls} calls.`;
    if (bundle.result.ended === "budget") return `Out of turns after ${score.actionCalls} calls, without the item.`;
    return `Gave up after ${score.actionCalls} calls, without the item.`;
  });
  const scoreTone = $derived(
    reachedNow ? TONE_TEXT[best !== null && frame.actions > best ? "over" : "ok"] : atEnd ? TONE_TEXT.fail : "text-light-gray",
  );

  const PIP_CAP = 40;
  const pips = $derived.by(() => {
    const n = Math.min(PIP_CAP, Math.max(best ?? 0, frame.actions));
    // At the end of a run that failed, its last call is red; the pips are capped, so the last one drawn stands for it.
    const lost = atEnd && !reachedNow;
    return Array.from({ length: n }, (_, i): Tone | "to-come" => (i < frame.actions ? pipTone(i, Math.min(PIP_CAP, frame.actions), best, lost) : "to-come"));
  });

  const sceneText = $derived.by(() => {
    const s = sceneAt(frames, playback.index);
    const placed = s.cells.flatMap((row, r) => row.map((item, c) => (item ? `${item} at ${r},${c}` : null)).filter(Boolean));
    const held = s.hotbar.map((h) => `${h.item} ×${h.count}`);
    return `Table: ${placed.length ? placed.join(", ") : "empty"}. Held: ${held.length ? held.join(", ") : "nothing"}.`;
  });

  const total = measured.total;
</script>

<section
  bind:this={section}
  role="region"
  aria-label={`Run ${name}`}
  tabindex="0"
  onkeydown={onKeyDown}
  class="flex flex-col gap-3 border border-mid-baltic bg-darkest-baltic p-4 font-mono text-sm focus-visible:outline-2 focus-visible:outline-light-baltic"
>
  <header class="flex items-start justify-between gap-4">
    <div>
      <h2 class="font-pixel text-xl text-highlight-yellow">Make {bundle.manifest.goal.qty} {bundle.manifest.goal.item}</h2>
      <p class="text-light-baltic">
        {name} · {bundle.manifest.model.resolved.join(", ") || "model not recorded"}{#if entry.attributes["priorFit"] !== undefined} · prior fit {entry.attributes["priorFit"]}{/if}
      </p>
      <SkillMarker attributes={entry.attributes} />
    </div>
    <button class="border border-mid-baltic px-2 py-1 hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic" aria-label="Close table" onclick={onClose}>✕</button>
  </header>

  <div class="flex items-end gap-6">
    <div class="flex flex-col">
      <span aria-label="calls so far" aria-live="polite" class={`font-score text-8xl leading-none ${scoreTone} ${reachedNow && !reducedMotion ? "animate-pulse" : ""}`}>{frame.actions}</span>
    </div>
    <div class="flex flex-col gap-1">
      <span aria-label="time of this step" class="font-score text-4xl leading-none text-light-baltic">{formatClock(times[playback.index] ?? 0)}</span>
      <div role="img" aria-label={best === null ? `Calls made: ${frame.actions}` : `Progress against the best possible run: ${frame.actions} of ${best} calls`} class="flex flex-wrap gap-0.5">
        {#each pips as pip, i (i)}
          <span data-pip={pip} class={`h-2 w-2 border ${pip === "to-come" ? "border-baltic" : `${TONE_BORDER[pip]} ${TONE_BG[pip]}`}`}></span>
        {/each}
      </div>
    </div>
  </div>

  <div bind:this={host} role="img" aria-label="The crafting table" class="min-h-32 w-fit max-w-full overflow-hidden border border-mid-baltic"></div>
  <p class="sr-only">{sceneText}</p>
  {#if drawError}<p role="alert" class="text-mid-hibiscus">The table could not be drawn ({drawError}). The calls below still show everything the run did.</p>{/if}

  <p role="status" class="min-h-5 text-light-gray">{status}</p>

  <div class="flex items-center gap-2">
    <button class="border border-mid-baltic px-2 py-1 hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic" onclick={() => dispatch({ type: "restart" })}>Restart</button>
    <button class="border border-mid-baltic px-2 py-1 hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic" onclick={() => dispatch({ type: "step", by: -1 })}>Step back</button>
    <button class="border border-mid-baltic px-2 py-1 hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic disabled:opacity-40" disabled={last === 0} onclick={() => dispatch({ type: "toggle" })}>{playback.playing ? "Pause" : "Play"}</button>
    <button class="border border-mid-baltic px-2 py-1 hover:bg-dark-baltic focus-visible:outline-2 focus-visible:outline-light-baltic" onclick={() => dispatch({ type: "step", by: 1 })}>Step forward</button>
    <input
      type="range" min="0" max={last} value={playback.index} disabled={last === 0}
      aria-label="Position in the run"
      class="flex-1 accent-highlight-yellow focus-visible:outline-2 focus-visible:outline-light-baltic"
      oninput={(e) => dispatch({ type: "scrub", to: Number(e.currentTarget.value) })}
    />
  </div>

  <ol aria-label="Calls, newest first" class="flex flex-col bg-black p-2">
    {#each tape as { f, i } (i)}
      <li data-kind={callKind(f)} class={`flex gap-3 ${KIND_CLASS[callKind(f)]}`}>
        <span class="w-14 text-baltic">{times[i] == null ? "" : formatClock(times[i]!)}</span>
        <span>{describeCall(f)}</span>
      </li>
    {/each}
  </ol>

  <div role="group" aria-label="Totals for the whole run" class="flex flex-wrap gap-x-6 gap-y-1 text-light-baltic">
    {#if total}
      <span>cost ${total.costUsd.toFixed(3)}</span>
      <span>time {formatClock(total.durationMs)}</span>
      <span>{total.inputTokens} in · {total.outputTokens} out · {total.cacheReadTokens} cache read · {total.cacheCreationTokens} cache write</span>
    {:else}
      <span>No timing was recorded for this run.</span>
    {/if}
  </div>
</section>
