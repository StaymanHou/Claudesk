import { describe, expect, it } from "vitest";
import rightPanelHost from "../../RightPanelHost.tsx?raw";

// M16 WP2 Phase 3 — the media viewer's reload-on-disk-change has ONE event source: RightPanelHost's
// per-workspace `fs-change` listener, which hands the changed paths to
// `EditorSplit.checkDiskForPaths`. From there the behaviour is covered by a LIVE test
// (`mediaTabLive.test.tsx` → "a disk change re-stats an open image…", which fails if EditorSplit
// stops fanning the paths to each pane's `refreshMedia`). What that test cannot see is the first
// hop, because mounting RightPanelHost under jsdom needs its whole IPC surface. So this pins that
// hop in the source: inside the ONE `listen<FsChange>(FS_CHANGE_EVENT, …)` callback, the paths are
// passed on. `grep -c` confirmed both anchors occur exactly once in the file.

const code = rightPanelHost.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("fs-change reaches the editor (and so the media viewer)", () => {
  it("the fs-change listener passes its paths to checkDiskForPaths", () => {
    const start = code.indexOf("listen<FsChange>(FS_CHANGE_EVENT");
    expect(start).toBeGreaterThan(0);
    // The listener body runs up to its `.then(` registration.
    const body = code.slice(start, code.indexOf(".then(", start));
    expect(body).toContain("editorSplitRef.current?.checkDiskForPaths(paths)");
  });

  it("there is exactly one fs-change listener in the host (no second source to keep in sync)", () => {
    expect(code.match(/listen<FsChange>\(FS_CHANGE_EVENT/g)).toHaveLength(1);
  });
});
