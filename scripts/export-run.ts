/**
 * Export a finished run as a replay bundle: frames, trace and result, with no world file and nothing personal.
 * Usage: pnpm dev scripts/export-run.ts <run-dir> <dest>
 * Refuses an unfinished run, an existing destination, a missing world file and a log that does not replay,
 * and leaves nothing behind when it refuses.
 */
import { HarnessError, isUserError } from "../src/harness/errors.js";
import { exportBundle } from "../src/harness/export.js";

const [runDir, dest] = process.argv.slice(2);
if (!runDir || !dest) {
  console.error("usage: export-run.ts <run-dir> <dest>");
  process.exit(1);
}

try {
  const { frames } = exportBundle(runDir, dest);
  console.log(`${dest} (${frames} frames)`);
} catch (e) {
  console.error(isUserError(e) || e instanceof HarnessError ? (e as Error).message : "unexpected error");
  process.exit(1);
}
