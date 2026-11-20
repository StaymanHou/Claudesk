// M18 WP7 Phase 1 (`SURFACE-2026-11-20-QUALITY-REMOTE-CLONE-PATH-DUPLICATED-IN-TS`): the consent
// step names the host clone path, which the Rust run script builds from `DEFAULT_VENDOR_SUBPATH`
// and `CLONE_DIR_NAME` (`workflow_install/mod.rs`). The TS copy is pinned to them here, so a
// rename on either side fails a test instead of drifting.
//
// A source-text guard over two DECLARATIONS agreeing (root CLAUDE.md: structure, never runtime).
// Each extraction anchors on the single declaration line, which is unique in the file.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REMOTE_CLONE_PATH } from "../remoteInstall";

const rustSrc = readFileSync(
  fileURLToPath(
    new URL("../../../src-tauri/src/workflow_install/mod.rs", import.meta.url),
  ),
  "utf8",
);

function only(re: RegExp): RegExpMatchArray {
  const all = [...rustSrc.matchAll(new RegExp(re.source, "g"))];
  expect(all).toHaveLength(1);
  return all[0];
}

describe("REMOTE_CLONE_PATH", () => {
  it("is the Rust vendor subpath + clone dir name, under ~", () => {
    const name = only(/pub const CLONE_DIR_NAME: &str = "([^"]+)";/)[1];
    const sub = only(
      /pub const DEFAULT_VENDOR_SUBPATH: \[&str; 2\] = \["([^"]+)", "([^"]+)"\];/,
    );
    expect(REMOTE_CLONE_PATH).toBe(`~/${sub[1]}/${sub[2]}/${name}`);
  });
});
