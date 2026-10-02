import type { SceneFactory, SceneHandle } from "./handle.ts";

/**
 * Each PixiJS scene holds a WebGL context and browsers cap how many can be live, so at most `max` tables draw at
 * once. The page keeps to that by replacing the second table when a third is opened; the pool is the guard that
 * makes it impossible to go over, and says so when something tries.
 */
export function createScenePool(make: SceneFactory, max = 2): { factory: SceneFactory; live(): number } {
  let live = 0;
  const factory: SceneFactory = async (host, options) => {
    if (live >= max) throw new Error(`only ${max === 2 ? "two" : max} tables can be drawn at once`);
    live++; // counted before the scene is ready, so two starts at once cannot both pass
    let scene: SceneHandle;
    try {
      scene = await make(host, options);
    } catch (e) {
      live--;
      throw e;
    }
    let released = false;
    return {
      show: (frames, index, effects) => scene.show(frames, index, effects),
      destroy: () => {
        if (released) return;
        released = true;
        live--;
        scene.destroy();
      },
    };
  };
  return { factory, live: () => live };
}
