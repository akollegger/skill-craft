import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Whether `target` is `base` itself or somewhere inside it. A name that merely starts with two dots (`..sheets`) is inside, and a path that
 * leaves by `..` (alone or followed by a separator) is not; a path on another drive is not either.
 */
export function isInside(base: string, target: string): boolean {
  const rel = relative(resolve(base), resolve(target));
  return rel === "" || !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}
