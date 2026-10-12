import { describe, expect, it } from "vitest";
import { palette } from "../src/palette.ts";
import { roles, type Role } from "../src/roles.ts";

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
const hexOf = (role: Role) => palette[roles[role]];

describe("the color roles", () => {
  const text: Role[] = ["text", "textMuted", "accent", "placement", "craft", "refusal", "takeBack", "goal", "warning"];

  // A role may be limited to the surfaces it passes on; take-back (periwinkle) is for the backdrop only.
  const surfaces: Partial<Record<Role, ("backdrop" | "panel")[]>> = { takeBack: ["backdrop"] };

  it("every text role reads at 4.5:1 or better on every surface it is used on", () => {
    for (const role of text) {
      for (const surface of surfaces[role] ?? (["backdrop", "panel"] as const)) {
        expect(contrast(hexOf(role), hexOf(surface)), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("the roles that are limited to the backdrop would fail on the panel, which is why", () => {
    expect(contrast(hexOf("takeBack"), hexOf("panel"))).toBeLessThan(4.5);
  });

  it("the four kinds of call have four different colors", () => {
    expect(new Set([roles.placement, roles.craft, roles.refusal, roles.takeBack]).size).toBe(4);
  });

  it("uses only colors that are in the palette", () => {
    for (const name of Object.values(roles)) expect(palette).toHaveProperty(name);
  });

  it("names a dark backdrop", () => {
    expect(luminance(hexOf("backdrop"))).toBeLessThan(0.05);
  });
});
