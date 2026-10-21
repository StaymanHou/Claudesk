// Where the probe reads and writes. ⚠️ `tmp/` is gitignored: full tails from every project live
// there, and only the redacted set under `workflow-system/product/` is committed.

import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REPO = resolve(__dirname, "../..");
export const OUT = join(REPO, "tmp", "adjudicator-probe");
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
