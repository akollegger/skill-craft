/**
 * Run the agent against the craft server through the Claude Agent SDK, score and measure each run, and summarise.
 * Usage: pnpm dev scripts/run-agent.ts --goal <item>[:<qty>] [--world <world.json>] [--runs 3] [--max-turns 40]
 *        [--timeout-minutes 30] [--label name] [--out runs] [--model m] [--skill <folder>] [--prompt-note <text>] [--record] [--dry-run]
 * By default the session is kept out of NAMS; --record lets nams-hooks record it. Ctrl-C ends the current
 * run, writes the summary and exits 130. The work is in src/harness/cli.ts.
 */
import { runAgentCli } from "../src/harness/cli.js";

const stop = new AbortController();
process.on("SIGINT", () => {
  if (stop.signal.aborted) process.exit(130); // a second Ctrl-C does not wait
  stop.abort();
});

const code = await runAgentCli(process.argv.slice(2), {
  signal: stop.signal,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
process.exit(code);
