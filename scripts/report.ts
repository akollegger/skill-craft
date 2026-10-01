/**
 * Turn finished run folders into the results table of an experiment (spec 003): successes out of trials with
 * Wilson intervals, extra calls over the best run, cost, how often the skill was loaded, and what a
 * difference between rows can support. Prints markdown; writes nothing. The work is in src/harness/report.ts.
 * Usage: pnpm dev scripts/report.ts --experiment runs/<experiment> runs/<label>...
 */
import { reportCli } from "../src/harness/report.js";

process.exit(reportCli(process.argv.slice(2), { out: (text) => process.stdout.write(text), err: (line) => console.error(line) }));
