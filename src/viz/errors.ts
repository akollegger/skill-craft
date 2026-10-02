import { HarnessError } from "../harness/errors.js";

/** The visualizer cannot start or export: a missing folder or page, a taken port or destination. Fixed text only. */
export class VizRefused extends HarnessError {
  constructor(why: string) {
    super("VizRefused", why);
  }
}
