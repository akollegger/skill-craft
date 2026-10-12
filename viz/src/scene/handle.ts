import type { FrameData } from "../../../src/viz/contract.ts";
import type { ItemArt } from "../art/index.ts";
import type { Effect } from "./model.ts";

/** What the open view needs from a table scene: show a frame with the effects its step calls for, and let go. */
export interface SceneHandle {
  show(frames: readonly FrameData[], index: number, effects: readonly Effect[]): void;
  destroy(): void;
}

/** Makes a scene inside a host element, drawing items with the run's own art when it is given. The real one draws with PixiJS; tests pass a stub, since jsdom has no WebGL. */
export type SceneFactory = (host: HTMLElement, options: { reducedMotion: boolean; art?: ItemArt }) => SceneHandle | Promise<SceneHandle>;
