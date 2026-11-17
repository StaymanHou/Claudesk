import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// M17 WP6 (AC-12) — `workspaceSurfacesGuard`: every place the frontend can REACH an OUT surface
// (a command the backend refuses for a remote key, an OUT component mount, a local-app launch)
// sits behind the workspace-kind funnel (`state/workspaceSurfaces.ts`).
//
// ── Two questions, two instruments (docs/lessons/source-text-guards.md) ────────────────────────
// • DOM — "is the surface ABSENT on a remote workspace?" — is RENDERED, not guarded here:
//   `remoteRightPanelLive.test.tsx` (real RightPanelHost), `remoteWorkspaceHeaderLive.test.tsx`
//   (live Workspace), `remoteWatcherSkip.test.tsx`, `src/__tests__/remoteMenuLaunchers.test.tsx`
//   (real App). Each has a LOCAL positive control.
// • SOURCE — "can a NEW reach appear without anyone deciding how it is gated?" — is this file.
//   1. The FLOOR: every production file whose executable code names an OUT command or mounts /
//      launches an OUT surface must be listed in `SITES`, and every listed file must still do so.
//      A new reach fails here until someone records how it is gated.
//   2. The PINS: for each gate site, the nearest funnel flag before the mount / call must be the
//      flag for that surface. Removing a gate, or moving the mount out from under it, fails here.
//
// ⚠️ The subject list was seeded from a repo-wide scan (2026-11-17) of comment-stripped code for
// the 26 refused commands (Rust `tests/remote_refusal_is_first.rs` REFUSED) plus the OUT
// components and launch helpers. It is a FLOOR: the scan below IS that grep, re-run every time.

const SRC = join(__dirname, "..", "..");

/** The commands the backend refuses for a remote key (mirror of the Rust REFUSED list). */
const OUT_COMMANDS = [
  "read_file",
  "write_file",
  "stat_file",
  "delete_file",
  "trash_path",
  "create_dir",
  "stat_media",
  "open_in_default_app",
  "docs_list",
  "docs_read",
  "git_changed_files",
  "git_file_hunks",
  "git_recent_commits",
  "git_commit_diff",
  "git_file_statuses",
  "fs_index",
  "fs_tree",
  "workspace_watch_start",
  "project_search",
  "project_replace",
  "sublime_open",
  "smerge_open",
  "finder_open",
  "wip_read",
  "transcript_tail",
  "term_spawn",
];

const MOUNT =
  /<(EditorSplit|DiffPanel|TerminalPane|FileTree|FileFinder|ProjectSearch|DocsPanel|MediaView)\b|\b(openSublime|openSublimeMerge|openFinder|openInDefaultApp)\s*\(/g;
const COMMAND = new RegExp(`["'\`](${OUT_COMMANDS.join("|")})["'\`]`, "g");

/** Strip comments; keep `"ssh://…"`-style strings intact (a `//` right after a quote or colon). */
function code(file: string): string {
  return readFileSync(join(SRC, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");
}

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "__tests__" || name === "probe") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push(relative(SRC, p));
      }
    }
  };
  walk(SRC);
  return out;
}

/** Files that reach an OUT surface, found the same way every run. */
function reachingFiles(): string[] {
  return productionFiles()
    .filter((f) => {
      const c = code(f);
      return c.match(COMMAND) !== null || c.match(MOUNT) !== null;
    })
    .sort();
}

/**
 * How each reaching file is gated. `gate` = this file consults the funnel itself (pinned below);
 * `behind` = only ever mounted / called from a pinned gate site; `exempt` = reaches an OUT command
 * on a remote workspace by design, with the reason (the backend refusal is its backstop).
 */
const SITES: Record<string, string> = {
  "App.tsx":
    "gate — menu launchers consult workspaceSurfaces(path)[launcher] (pin: App)",
  "components/workspace/RightPanelHost.tsx":
    "gate — every OUT mount / launcher / file op (pins: RightPanelHost)",
  "state/useWorkspaceStatus.ts":
    "gate — workspace_watch_start behind .fsWatch (pin)",
  "components/workspace/diff/DiffPanel.tsx":
    "behind <DiffPanel (surfaces.diff)",
  "components/workspace/docs/DocsPanel.tsx":
    "behind <DocsPanel (surfaces.docsRead)",
  "components/workspace/editor/EditorSplit.tsx":
    "behind <EditorSplit (surfaces.editor)",
  "components/workspace/editor/PaneTabs.tsx":
    "inside EditorSplit (surfaces.editor)",
  "components/workspace/editor/MediaCard.tsx":
    "inside EditorSplit's media view (surfaces.editor)",
  "components/workspace/editor/mediaIpc.ts":
    "helpers called from EditorSplit/MediaCard and RightPanelHost's default-app button (surfaces.editor / .defaultApp)",
  "components/workspace/filetree/FileTree.tsx":
    "behind {fileTreeRail} in the editor slot (surfaces.editor)",
  "components/workspace/finder/FileFinder.tsx":
    "behind <FileFinder (surfaces.finder)",
  "components/workspace/search/ProjectSearch.tsx":
    "behind <ProjectSearch (surfaces.projectSearch)",
  "components/workspace/TerminalPane.tsx":
    "behind <TerminalPane (surfaces.terminal)",
  "components/workspace/XtermPane.tsx":
    "names term_spawn only in its `spawnCommand` prop type; it spawns what its mounter passes (TerminalPane, behind surfaces.terminal)",
  "sublime/sublimeLaunch.ts":
    "helpers called only from pinned gate sites (App, RightPanelHost)",
  "finder/finderLaunch.ts":
    "helpers called only from pinned gate sites (App, RightPanelHost)",
  "state/supervisor/useSupervisor.ts":
    "behind Workspace's `enabled: workflowFeaturesEnabled && surfaces.supervisor` (pin: Workspace)",
  "components/workspace/recycleSession.ts":
    "exempt — Recycle is an IN surface owned by WP7.4; its stat_file read swallows errors (returns null) and the backend refusal makes it plain words",
};

/** A gate pin: in `file`, the nearest `surfaces.<flag>` / `s.<flag>` before `token` is `flag`. */
interface Pin {
  file: string;
  token: string;
  flag: string;
  /** A tighter bound where a neighbouring gate for the SAME flag could otherwise stand in. */
  max?: number;
}

const PINS: Pin[] = [
  // RightPanelHost — mounts.
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "<EditorSplit ref={editorSplitRef}",
    flag: "editor",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "{fileTreeRail}",
    flag: "editor",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "<DiffPanel",
    flag: "diff",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "<TerminalPane",
    flag: "terminal",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "<DocsPanel",
    flag: "docsRead",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "<FileFinder",
    flag: "finder",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "<ProjectSearch",
    flag: "projectSearch",
  },
  // RightPanelHost — tabs (their absence is what keeps the panels unselectable by click).
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: 'data-testid="panel-tab-editor"',
    flag: "editor",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: 'data-testid="panel-tab-diff"',
    flag: "diff",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: 'data-testid="panel-tab-terminal"',
    flag: "terminal",
  },
  // RightPanelHost — launchers.
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "openSublime(projectPath)",
    flag: "sublimeText",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "openSublimeMerge(projectPath)",
    flag: "sublimeMerge",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "openFinder(projectPath)",
    flag: "finderReveal",
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "openInDefaultApp(projectPath",
    flag: "defaultApp",
  },
  // RightPanelHost — file-op confirms (the tree's delete / delete-folder).
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "spec={deleteFileSpec(",
    flag: "fileTree",
    max: 120,
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "spec={deleteFolderSpec(",
    flag: "fileTree",
    max: 120,
  },
  // RightPanelHost — defense-in-depth gates whose openers are already absent on a remote workspace
  // (so no DOM test can reach them; the mutation proof found each survived without a pin).
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "spec={replaceAllSpec(",
    flag: "projectSearch",
    max: 200,
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token: "listen<FsChange>(FS_CHANGE_EVENT",
    flag: "fsWatch",
    max: 200,
  },
  {
    file: "components/workspace/RightPanelHost.tsx",
    token:
      'setHighlightTarget(target); setPanel((cur) => selectPanel(cur, "editor"));',
    flag: "editor",
    max: 120,
  },
  // Workspace — header.
  {
    file: "components/workspace/Workspace.tsx",
    token: "<SupervisorHeaderControl",
    flag: "supervisor",
  },
  {
    file: "components/workspace/Workspace.tsx",
    token: 'data-testid="workspace-turn-prev"',
    flag: "turnJump",
  },
  {
    file: "components/workspace/Workspace.tsx",
    token: 'data-testid="workspace-turn-next"',
    flag: "turnJump",
  },
  {
    file: "components/workspace/Workspace.tsx",
    token: "getProjectSupervisorEnabled(workspace.project_path)",
    flag: "supervisor",
  },
  // The background watcher.
  {
    file: "state/useWorkspaceStatus.ts",
    token: '"workspace_watch_start"',
    flag: "fsWatch",
  },
];

/** How far back (flattened chars) the gate may sit from what it gates. */
const MAX_GATE_DISTANCE = 2500;

function nearestFlag(
  c: string,
  token: string,
): { flag: string; distance: number } | null {
  const at = c.indexOf(token);
  if (at === -1) return null;
  const before = c.slice(0, at);
  const flags = [
    ...before.matchAll(
      /\b(?:surfaces|s)\.(\w+)\b|workspaceSurfaces\([^)]*\)\.(\w+)/g,
    ),
  ];
  const last = flags.at(-1);
  if (!last || last.index === undefined) return null;
  return { flag: last[1] ?? last[2], distance: at - last.index };
}

describe("workspaceSurfacesGuard — the floor", () => {
  it("scans a real tree, and the scan sees what it should (anti-vacuity)", () => {
    const files = reachingFiles();
    expect(productionFiles().length).toBeGreaterThan(100);
    expect(files).toContain("components/workspace/RightPanelHost.tsx");
    expect(files).toContain("components/workspace/TerminalPane.tsx"); // via spawnCommand="term_spawn"
    expect(files).toContain("components/workspace/editor/mediaIpc.ts"); // via invoker("stat_media")
  });

  it("every production file that reaches an OUT surface is listed in SITES (a new reach must decide its gate)", () => {
    expect(reachingFiles().filter((f) => !(f in SITES))).toEqual([]);
  });

  it("every SITES entry still reaches an OUT surface (no stale entries)", () => {
    const reaching = new Set(reachingFiles());
    expect(Object.keys(SITES).filter((f) => !reaching.has(f))).toEqual([]);
  });

  it("the OUT command list mirrors the backend's REFUSED list", () => {
    const rust = readFileSync(
      join(SRC, "..", "src-tauri", "tests", "remote_refusal_is_first.rs"),
      "utf8",
    );
    const block = rust.slice(
      rust.indexOf("const REFUSED"),
      rust.indexOf("const EXEMPT"),
    );
    const refused = [...block.matchAll(/"([a-z_]+)",/g)]
      .map((m) => m[1])
      .sort();
    expect([...OUT_COMMANDS].sort()).toEqual(refused);
  });
});

describe("workspaceSurfacesGuard — the gate pins", () => {
  for (const pin of PINS) {
    it(`${pin.file}: ${pin.token} sits behind surfaces.${pin.flag}`, () => {
      const c = code(pin.file);
      expect(
        c.split(pin.token).length - 1,
        "token must occur exactly once",
      ).toBe(1);
      const near = nearestFlag(c, pin.token);
      expect(near?.flag).toBe(pin.flag);
      expect(near!.distance).toBeLessThan(pin.max ?? MAX_GATE_DISTANCE);
    });
  }

  it("App: the menu launchers consult the funnel before launching", () => {
    const c = code("App.tsx");
    const gate = c.indexOf("!workspaceSurfaces(path)[launcher]");
    expect(gate).toBeGreaterThan(-1);
    for (const call of [
      "openSublime(path)",
      "openSublimeMerge(path)",
      "openFinder(path)",
    ]) {
      const at = c.indexOf(call);
      expect(at, call).toBeGreaterThan(gate);
    }
  });

  it("Workspace: the supervisor loop is enabled only when the kind has one (AND, beside the gate)", () => {
    expect(code("components/workspace/Workspace.tsx")).toContain(
      "enabled: workflowFeaturesEnabled && surfaces.supervisor,",
    );
  });

  it("the matcher rejects a near miss (anti-vacuity)", () => {
    const c = "{surfaces.diff && (<X/>)} <EditorSplit";
    expect(nearestFlag(c, "<EditorSplit")?.flag).toBe("diff");
  });
});
