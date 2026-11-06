// Where the probe reads and writes.
//
// ⚠️ `OUT` is a PRIVATE directory OUTSIDE the repo: it holds full turn tails from every project on
// this machine, so it is never committed. Only the redacted set under `workflow-system/product/` is.
// What it holds, and how to restore or rebuild it, is in `OUT/PROVENANCE.md`.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REPO = resolve(__dirname, "../..");
export const OUT = join(
  homedir(),
  "Library",
  "Application Support",
  "claudesk-tooling",
  "adjudicator-probe",
);
export const PROJECTS = join(homedir(), ".claude", "projects");
export const ACTIVITY_LOG = join(
  homedir(),
  "Library",
  "Application Support",
  "com.claudesk.app",
  "supervisor-activity.log",
);
export const M15_DIR = join(
  REPO,
  "workflow-system",
  "product",
  "archive",
  "milestone-15-workflow-supervisor",
);
export const COMMITTED_SET = join(
  REPO,
  "workflow-system",
  "product",
  "wp2-adjudicator-set.json",
);

/**
 * A workflow item's file, wherever it is now: `state/wip/` while the item is open, `state/archive/`
 * once finalize has moved it. A probe that records a sha in a WIP must keep finding it after close.
 */
export function wipOrArchive(name: string, root: string = REPO): string {
  const state = join(root, "workflow-system", "state");
  const candidates = [join(state, "wip", name), join(state, "archive", name)];
  const found = candidates.find((p) => existsSync(p));
  if (found === undefined)
    throw new Error(`${name} is in neither ${candidates.join(" nor ")}`);
  return found;
}
