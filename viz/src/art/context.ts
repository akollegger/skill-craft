import type { WorldArt } from "../../../src/viz/contract.ts";

/**
 * The context key the page's root sets so a thumbnail can look up how its world's items are drawn in the catalog, without every list row and
 * tile passing the catalog down. A thumbnail with no lookup (or no art for its world) draws the name-only sprite.
 */
export const WORLD_ART = Symbol("worldArt");
export type WorldArtLookup = (world: string) => WorldArt | undefined;
