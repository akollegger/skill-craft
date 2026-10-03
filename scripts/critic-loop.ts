/**
 * Review and revise a distilled skill with a critic and a reviser, up to three rounds, and write the loop record.
 * Usage: pnpm dev scripts/critic-loop.ts --runs <run folder>... (--candidate <folder> | --allow-workspace)
 *        [--format graph|prose] [--critic-model m] [--reviser-model m] [--max-rounds n] [--max-role-usd n]
 *        [--timeout-minutes n] [--out loops] [--label name] [--dry-run]
 * Ctrl-C ends the current round, writes the record for the rounds finished and exits 130. The work is in src/loop/cli.ts.
 */
import { runCriticLoopCli } from "../src/loop/cli.js";

const stop = new AbortController();
process.on("SIGINT", () => {
  if (stop.signal.aborted) process.exit(130); // a second Ctrl-C does not wait
  stop.abort();
});

const code = await runCriticLoopCli(process.argv.slice(2), {
  signal: stop.signal,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
process.exit(code);
