/**
 * The shapes an invented item can wear: eight families of geometric glyph, each with a few variants. A variant is the left half of an
 * 8 by 8 picture, four columns by eight rows, and the right half is its mirror image, so every glyph is symmetric left to right.
 * `b` is the body color, `a` the accent, `d` the dark outline color and `.` is empty. Which glyph an item gets is decided in `sprite.ts`.
 */
export interface GlyphFamily {
  name: string;
  variants: readonly (readonly string[])[];
}

export const FAMILIES: readonly GlyphFamily[] = [
  {
    name: "gem",
    variants: [
      ["...b", "..bb", ".bba", "bbaa", "bbaa", ".bba", "..bb", "...b"],
      ["...d", "..db", ".dbb", "dbba", "dbba", ".dbb", "..db", "...d"],
      ["..bb", ".bba", "bbaa", "bbab", "bbbb", ".bbb", "..bb", "...b"],
    ],
  },
  {
    name: "ring",
    variants: [
      ["..bb", ".b..", "b...", "b...", "b...", "b...", ".b..", "..bb"],
      ["..bb", ".b..", "b..a", "b.aa", "b.aa", "b..a", ".b..", "..bb"],
      [".bbb", "bb..", "b..a", "b.aa", "b.aa", "b..a", "bb..", ".bbb"],
    ],
  },
  {
    name: "cross",
    variants: [
      ["...b", "...b", "...b", "bbba", "bbba", "...b", "...b", "...b"],
      ["..bb", "..ba", "bbba", "bbaa", "bbaa", "bbba", "..ba", "..bb"],
      ["b...", ".b..", "..b.", "...a", "...a", "..b.", ".b..", "b..."],
    ],
  },
  {
    name: "pyramid",
    variants: [
      ["...a", "...a", "..ba", "..ba", ".bba", ".bba", "bbba", "bbba"],
      ["bbba", "bbba", ".bba", ".bba", "..ba", "..ba", "...a", "...a"],
      ["...b", "..ba", ".bba", "bbba", "...b", "..ba", ".bba", "bbba"],
    ],
  },
  {
    name: "block",
    variants: [
      [".bbb", "bbbb", "bbaa", "bbaa", "bbaa", "bbaa", "bbbb", ".bbb"],
      ["dddd", "dbbb", "dbba", "dbaa", "dbaa", "dbba", "dbbb", "dddd"],
      ["..bb", ".bbb", "bbaa", "bbaa", "bbaa", "bbaa", ".bbb", "..bb"],
    ],
  },
  {
    name: "bars",
    variants: [
      ["a.a.", "b.b.", "b.b.", "b.b.", "b.b.", "b.b.", "b.b.", "b.b."],
      ["...b", "..a.", ".b..", "a...", "...b", "..a.", ".b..", "a..."],
      ["bbbb", "bbbb", "....", "aaaa", "aaaa", "....", "bbbb", "bbbb"],
    ],
  },
  {
    name: "rune",
    variants: [
      ["bbbb", "b...", "b.bb", "b.b.", "b.b.", "b.bb", "b...", "bbbb"],
      ["bbbb", "bbbb", "bb..", "bb.a", "bb.a", "bb..", "bbbb", "bbbb"],
      ["dddd", "d...", "d.aa", "d.ab", "d.ab", "d.aa", "d...", "dddd"],
    ],
  },
  {
    name: "burst",
    variants: [
      ["...b", "b..b", ".b.b", "..ba", "..ba", ".b.b", "b..b", "...b"],
      ["...b", "...b", "..bb", "bbba", "bbba", "..bb", "...b", "...b"],
      ["...b", "b..b", ".bab", "..ba", "..ba", ".bab", "b..b", "...b"],
    ],
  },
];
