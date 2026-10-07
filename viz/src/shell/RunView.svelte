<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { BundleData, CatalogEntry } from "../../../src/viz/contract.ts";
  import { effectsForStep, sceneAt } from "../scene/model.ts";
  import type { SceneFactory, SceneHandle } from "../scene/handle.ts";
  import { delayBefore, initial, keyAction, reduce, stepTimes, type PlaybackAction } from "../state/playback.ts";
  import { actionFrameIndices, frameForCalls, scrubTarget } from "../state/steps.ts";
  import { callKind, describeCall, type CallKind } from "./calls.ts";
  import { clockSizers, formatClock, scoreSizer } from "./clock.ts";
  import SkillIcon from "./SkillIcon.svelte";
  import Stats from "./Stats.svelte";
  import { spendStats } from "./stats.ts";
  import Transport from "./Transport.svelte";
  import { pipTone, TONE_BG, TONE_BORDER, TONE_TEXT, type Tone } from "./tone.ts";

  // `titled`: the frame's title strip already names the run (its world, goal, model and skill) and closes it, so the view drops its own heading
  // and close button. Two tables side by side are not titled: each keeps its own heading and close button.
  let { entry, bundle, createScene, onClose, titled = false }: { entry: CatalogEntry; bundle: BundleData; createScene: SceneFactory; onClose: () => void; titled?: boolean } = $props();

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
  let tableWidth = $state<number | undefined>();
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
    // Follow the table frame's width, so the score row above it is exactly as wide. (Not every test environment has a ResizeObserver.)
    const sized = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => void (tableWidth = host?.offsetWidth || undefined));
    if (host) sized?.observe(host);
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
      sized?.disconnect();
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
    refusal: "text-retro-dim italic",
    craft: "text-light-gray",
    place: "text-retro-muted",
    "take-back": "text-retro-dim",
    read: "text-retro-dim opacity-70",
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

  // The steps are the run's action calls, one pip each and all of them drawn, so the strip never changes size as it plays. Calls made wear
  // the playback colors; calls still to come are a muted gray. Clicking a pip shows the table after that call.
  const actionFrames = actionFrameIndices(frames);
  const steps = actionFrames.length;
  const callTitles = actionFrames.map((i) => describeCall(frames[i]!));
  const pips = $derived.by(() => {
    // At the end of a run that failed, its last call is red.
    const lost = atEnd && !reachedNow;
    return Array.from({ length: steps }, (_, i): Tone | "to-come" => (i < frame.actions ? pipTone(i, frame.actions, best, lost) : "to-come"));
  });
  const seek = (calls: number): void => dispatch({ type: "scrub", to: frameForCalls(actionFrames, calls) });

  // The counter is grabbable: pulling it sideways scrubs through the run, like a number field. Pointer only; the keyboard has the step
  // and jump controls.
  let pull: { x: number; calls: number } | undefined;
  const pullDown = (e: PointerEvent): void => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pull = { x: e.clientX, calls: frame.actions };
  };
  const pullMove = (e: PointerEvent): void => {
    if (pull) seek(scrubTarget(pull.calls, e.clientX - pull.x, steps));
  };
  const pullEnd = (): void => void (pull = undefined);

  const sceneText = $derived.by(() => {
    const s = sceneAt(frames, playback.index);
    const placed = s.cells.flatMap((row, r) => row.map((item, c) => (item ? `${item} at ${r},${c}` : null)).filter(Boolean));
    const held = s.hotbar.map((h) => `${h.item} ×${h.count}`);
    return `Table: ${placed.length ? placed.join(", ") : "empty"}. Held: ${held.length ? held.join(", ") : "nothing"}.`;
  });

  // The clock split into its digits and its unit ("4.2" and "s"); a minutes clock ("1:05") has no unit.
  const clock = $derived.by(() => {
    const t = formatClock(times[playback.index] ?? 0);
    return t.endsWith("s") ? { digits: t.slice(0, -1), unit: "s" } : { digits: t, unit: "" };
  });

  // Room reserved for the score and the clock, so their digits changing size as the run plays does not move the strip between them.
  const finalMs = times.reduce<number | null>((m, t) => (t === null ? m : Math.max(m ?? 0, t)), null);
  const clockRoom = clockSizers(finalMs).map((t) => (t.endsWith("s") ? { digits: t.slice(0, -1), unit: "s" } : { digits: t, unit: "" }));

  const total = measured.total;
</script>

<section
  bind:this={section}
  role="region"
  aria-label={`Run ${name}`}
  tabindex="0"
  onkeydown={onKeyDown}
  class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-retro-panel p-4 font-mono text-sm focus-visible:outline-2 focus-visible:outline-retro-muted"
>
  {#if !titled}
    <header class="flex items-start justify-between gap-4">
      <div>
        <h2 class="font-pixel text-xl text-highlight-yellow">Make {bundle.manifest.goal.qty} {bundle.manifest.goal.item}</h2>
        <p class="flex items-center gap-2 text-retro-muted">
          <span>{name} · {bundle.manifest.model.resolved.join(", ") || "model not recorded"}</span>
          <SkillIcon attributes={entry.attributes} />
        </p>
      </div>
      <button class="border border-retro-line px-2 py-1 hover:bg-retro-raised focus-visible:outline-2 focus-visible:outline-retro-muted" aria-label="Close table" onclick={onClose}>✕</button>
    </header>
  {/if}

  <!-- Three columns, the two at the sides as wide as each other so the table sits in the middle of what is left. Above the table, as wide as it
       is, the strip of pips; below that the controls at the left, the table, and at the right the score, the clock and the run's spend. The
       table's own cell is the room the scene sizes itself to, and its measured width is the strip's. -->
  <div class="grid grid-cols-[9rem_minmax(0,1fr)_9rem] gap-x-4 gap-y-3">
    <div
      role="group"
      aria-label={best === null ? `Calls made: ${frame.actions}` : `Progress against the best possible run: ${frame.actions} of ${best} calls`}
      class="col-start-2 flex min-h-[2.5rem] flex-wrap content-start gap-0.5 justify-self-center"
      style:width={tableWidth === undefined ? undefined : `${tableWidth}px`}
      style:max-width="100%"
    >
      <!-- One tab stop for the whole strip, on the latest call made (the first when none is): the arrow keys, Home and End step and jump from it as
           from anywhere, and the other pips are reached by pointer or by a screen reader's own navigation. -->
      {#each pips as pip, i (i)}
        <button
          type="button"
          data-pip={pip}
          data-step={i}
          title={callTitles[i]}
          aria-label={`Call ${i + 1}: ${callTitles[i]}`}
          aria-current={i === frame.actions - 1 ? "step" : undefined}
          tabindex={i === Math.max(0, frame.actions - 1) ? 0 : -1}
          class={`h-3 w-3 cursor-pointer border-0 p-0 focus-visible:outline-2 focus-visible:outline-retro-muted ${pip === "to-come" ? "bg-dark-gray" : `${TONE_BG[pip]}`} ${i === frame.actions - 1 ? "ring-2 ring-light-gray" : ""}`}
          onclick={() => seek(i + 1)}
        ></button>
      {/each}
    </div>

    <div class="col-start-1 row-start-2 justify-self-end">
      <Transport playing={playback.playing} canPlay={last > 0} {last} {dispatch} />
    </div>

    <div class="col-start-2 row-start-2 flex min-w-0 justify-center">
      <div bind:this={host} role="img" aria-label="The crafting table" class="table-frame min-h-32 w-fit max-w-full overflow-hidden"></div>
    </div>

    <div class="col-start-3 row-start-2 flex min-w-0 flex-col items-start gap-4">
      <span class="inline-grid">
        <span aria-hidden="true" class="font-score invisible col-start-1 row-start-1 text-8xl leading-none [text-box:trim-both_cap_alphabetic]">{scoreSizer(steps)}</span>
        <span
          aria-label="calls so far"
          aria-live="polite"
          title="Drag to scrub through the run"
          data-counter
          class={`font-score col-start-1 row-start-1 justify-self-start cursor-ew-resize touch-none select-none text-8xl leading-none [text-box:trim-both_cap_alphabetic] ${scoreTone} ${reachedNow && !reducedMotion ? "animate-pulse" : ""}`}
          onpointerdown={pullDown}
          onpointermove={pullMove}
          onpointerup={pullEnd}
          onpointercancel={pullEnd}>{frame.actions}</span>
      </span>
      <!-- The unit is dimmed and half the height of the digits: a lowercase "s" is 0.43em of Jersey 10 against the digits' 0.54em, so half the height is 0.625 of the font size, not 0.5. -->
      <span class="inline-grid">
        {#each clockRoom as room}
          <span aria-hidden="true" class="font-score invisible col-start-1 row-start-1 text-6xl leading-none [text-box:trim-both_cap_alphabetic]">{room.digits}{#if room.unit}<span class="text-[0.625em] leading-none">{room.unit}</span>{/if}</span>
        {/each}
        <span aria-label="time of this step" class={`font-score col-start-1 row-start-1 text-6xl leading-none [text-box:trim-both_cap_alphabetic] ${scoreTone}`}>{clock.digits}{#if clock.unit}<span class="text-[0.625em] leading-none opacity-60">{clock.unit}</span>{/if}</span>
      </span>
      <Stats stats={spendStats(total)} />
    </div>
  </div>
  <p class="sr-only">{sceneText}</p>
  {#if drawError}<p role="alert" class="text-mid-hibiscus">The table could not be drawn ({drawError}). The calls below still show everything the run did.</p>{/if}

  <!-- The whole sentence, for a screen reader; the score, the clock and the strip are what a sighted viewer reads. -->
  <p role="status" class="sr-only">{status}</p>

  <!-- A box as wide as the table that takes the room the table and the strip leave and scrolls inside it, so the page never does. The strip holds the height of
       three rows for every run, so the box is the same height for all but the longest. -->
  <ol
    aria-label="Calls, newest first"
    class="flex min-h-24 flex-1 flex-col self-center overflow-y-auto bg-retro-deep p-2 [scrollbar-color:var(--color-retro-line)_transparent] [scrollbar-width:thin]"
    style:width={tableWidth === undefined ? "100%" : `${tableWidth}px`}
    style:max-width="100%"
  >
    {#each tape as { f, i } (i)}
      <li data-kind={callKind(f)} class={`flex gap-3 ${KIND_CLASS[callKind(f)]}`}>
        <span class="w-14 text-retro-dim">{times[i] == null ? "" : formatClock(times[i]!)}</span>
        <span>{describeCall(f)}</span>
      </li>
    {/each}
  </ol>
</section>
