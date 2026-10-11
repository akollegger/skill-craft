import { execFileSync } from "node:child_process";

/** Craft server processes that are descendants of this test process: the ones a driver started and must clean up. */
export function ownServers(): { pid: number; cmd: string }[] {
  const rows = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,command="], { encoding: "utf8" })
    .split("\n")
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] as string }));
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const mine = (pid: number): boolean => {
    for (let p = byPid.get(pid)?.ppid; p !== undefined && p > 1; p = byPid.get(p)?.ppid) if (p === process.pid) return true;
    return false;
  };
  return rows.filter((r) => r.cmd.includes("src/mcp/server.ts") && mine(r.pid)).map((r) => ({ pid: r.pid, cmd: r.cmd }));
}

export const ownServerProcesses = (): string[] => ownServers().map((r) => r.cmd);

export const noServersSoon = async (): Promise<string[]> => {
  for (let i = 0; i < 40; i++) {
    const left = ownServerProcesses();
    if (left.length === 0) return left;
    await new Promise((r) => setTimeout(r, 100));
  }
  return ownServerProcesses();
};
