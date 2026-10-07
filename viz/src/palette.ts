/**
 * The page's palette: the Neo4j brand colors, transcribed by hand from the brand colors page of the Needle
 * design system, plus a few shades derived from them (`DERIVED`) where the page needs a tone the brand does not name. It is a local copy and not the design-system package or its Tailwind preset (GPL-3.0), so it can
 * drift from the brand's; `SOURCE` and `READ_ON` say where and when it was read. The Tailwind theme
 * (`theme.css`) repeats these values and a test keeps the two equal. Which color plays which role is decided
 * with the page, not here.
 */
export const SOURCE = "https://neo4j.design/40a8cff71/p/606e3d-brand-colors.md";
export const READ_ON = "2026-10-02";

export const palette = {
  // Primary
  darkBaltic: "#014063",
  midBaltic: "#0A6190",
  baltic: "#4C99A4",
  lightBaltic: "#8FE3E8",
  // Primary highlight
  highlightPeriwinkle: "#6A82FF",
  highlightYellow: "#FAFF00",
  // Neutral
  black: "#181414",
  darkestBaltic: "#002B43",
  darkGray: "#4F4E4D",
  cream: "#F2EAD4",
  lightGray: "#FCF9F6",
  // Secondary
  forest: "#145439",
  midForest: "#6FA646",
  lightForest: "#90CB62",
  marigold: "#FFA901",
  midMarigold: "#FFC450",
  lightMarigold: "#FFCF72",
  hibiscus: "#D43300",
  midHibiscus: "#F96746",
  lightHibiscus: "#FF8E6A",
  // Derived, not brand values: a wood ramp from Marigold (hue about 33 to 41), lightest to darkest. The brand colors are an
  // anchor, not a constraint (decided 2026-10-04): the crafting table is wood, and the brand has no brown.
  woodHighlight: "#F6CB6F",
  woodFace: "#DD992C",
  woodShade: "#9D6725",
  woodFrame: "#69401C",
  woodDeep: "#362112",
  // Derived, not brand values: the Baltic blues with the saturation pulled partway down (about two thirds of the brand) and the hue nudged a few degrees toward
  // indigo, so the page reads as a dusky retro screen and not a bright console (decided 2026-10-06). Deepest to lightest.
  // Each stands in for one Baltic: Deep for the black backdrop, Panel for Darkest Baltic, Raised for Dark Baltic, Line
  // for Mid Baltic, Dim for Baltic, Muted for Light Baltic. The highlight colors are left as the brand has them.
  retroDeep: "#081b2b",
  retroPanel: "#0d2b42",
  retroRaised: "#184667",
  retroLine: "#3c7eaa",
  retroDim: "#80afc6",
  retroMuted: "#aed2e0",
  // Derived, not brand values: a blue-gray for the playback controls, the retro hue with most of the saturation taken out (decided
  // 2026-10-06), so they read as a quiet instrument beside the table and not as another blue panel. Deepest to lightest.
  slateDeep: "#222C35",
  slateShade: "#3B4B59",
  slateFace: "#5F7486",
  slateHighlight: "#9BAFBF",
} as const;

/** The wood names in `palette`, derived from Marigold (the retro blues are in `RETRO`). */
export const DERIVED = ["woodHighlight", "woodFace", "woodShade", "woodFrame", "woodDeep"] as const satisfies readonly (keyof typeof palette)[];

/** The blue-grays of the playback controls, deepest to lightest. */
export const SLATE = ["slateDeep", "slateShade", "slateFace", "slateHighlight"] as const satisfies readonly (keyof typeof palette)[];

/** The retro blues, deepest to lightest. */
export const RETRO = ["retroDeep", "retroPanel", "retroRaised", "retroLine", "retroDim", "retroMuted"] as const satisfies readonly (keyof typeof palette)[];

export type PaletteName = keyof typeof palette;

/** A color as the number PixiJS takes. */
export const hex = (name: PaletteName): number => Number.parseInt(palette[name].slice(1), 16);
