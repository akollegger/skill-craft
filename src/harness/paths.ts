import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, found from this file so it does not depend on the working directory. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * A path as recorded in a run folder: relative to the repository when it is inside it, otherwise as given.
 * Recording the absolute path would put the operator's user name in a file that gets shared; a path outside
 * the repository has nothing portable to say, so it stays as it is.
 */
export function toRepoPath(path: string): string {
  const abs = resolve(path);
  const rel = relative(REPO, abs);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? abs : rel;
}

/** A recorded path as a real one. An absolute path, such as one in a run folder written earlier, is left alone. */
export function fromRepoPath(path: string): string {
  return isAbsolute(path) ? path : resolve(REPO, path);
}
