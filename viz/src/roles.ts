import type { PaletteName } from "./palette.ts";

/**
 * Which palette color plays which role (decided 2026-10-02 while building the page; held loosely). The backdrop is
 * dark: the Baltic family reads well on it and the first mock's look was a dusk. Text roles must meet 4.5:1 against
 * the surface they sit on, which `roles.test.ts` checks; a color that fails there (Baltic on Dark Baltic, say) is not
 * used for text on that surface. Periwinkle (take-back) reads at 5.4:1 on the backdrop but 4.4:1 on the panel, so
 * calls are listed on the backdrop, never on the panel.
 */
export const roles = {
  // Surfaces
  backdrop: "retroDeep",
  panel: "retroPanel",
  raised: "retroRaised",
  // Text
  text: "lightGray",
  textMuted: "retroMuted",
  accent: "highlightYellow",
  // Calls: placement, craft, refusal, take-back; a read is dimmed Baltic
  placement: "midMarigold",
  craft: "lightForest",
  refusal: "midHibiscus",
  takeBack: "highlightPeriwinkle",
  // The goal reached, and a warning such as a skill that never loaded
  goal: "lightForest",
  warning: "midMarigold",
} as const satisfies Record<string, PaletteName>;

export type Role = keyof typeof roles;
