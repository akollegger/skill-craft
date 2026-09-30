/** Thrown when a world definition is invalid. Carries every problem found, not just the first. */
export class WorldError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`invalid world:\n- ${problems.join("\n- ")}`);
    this.name = "WorldError";
    this.problems = problems;
  }
}
