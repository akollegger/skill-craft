/**
 * Make a set of skills from finished runs with a named distillation harness (ADR-008, spec 009), and write the skill set, its sidecar and the record of how it was made.
 * Usage: pnpm dev scripts/distill.ts --harness <name> --runs <run folder>... [--allow-workspace]
 *        [--critic-model m] [--reviser-model m] [--format graph|prose] [--max-rounds n] [--max-role-usd n]
 *        [--timeout-minutes n] [--out distills] [--label name] [--settings <file>] [--experiment <folder>] [--dry-run]
 * Ctrl-C ends the current call, writes the record for what finished and exits 130. The work is in src/distill/cli.ts.
 */
import { runDistillCli } from "../src/distill/cli.js";

const stop = new AbortController();
process.on("SIGINT", () => {
  if (stop.signal.aborted) process.exit(130); // a second Ctrl-C does not wait
  stop.abort();
});

const code = await runDistillCli(process.argv.slice(2), {
  signal: stop.signal,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
process.exit(code);
