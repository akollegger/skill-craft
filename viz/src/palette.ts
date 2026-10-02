/**
 * The page's palette: the Neo4j brand colors, transcribed by hand from the brand colors page of the Needle
 * design system. It is a local copy and not the design-system package or its Tailwind preset (GPL-3.0), so it can
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
} as const;

export type PaletteName = keyof typeof palette;

/** A color as the number PixiJS takes. */
export const hex = (name: PaletteName): number => Number.parseInt(palette[name].slice(1), 16);
