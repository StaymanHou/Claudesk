// M17 WP6 — THE workspace-kind funnel (`arch/remote-workspaces.md` §G).
//
// One question, one place: "which surfaces may THIS workspace show?" A remote workspace (its key
// is `ssh://user@host/path`) runs its CC session on another machine, so every surface that reads
// the LOCAL filesystem, runs local git, launches a local app or spawns a local process is ABSENT on
// it: no DOM at all, never greyed out, never erroring (vision Core Principle 7; prior
// `a-workspace-is-its-cc-session`). The backend refuses those commands too
// (`src-tauri/src/workspace_surfaces`), so a site that forgets this funnel errors in plain words
// instead of reading the wrong machine.
//
// ⚠️ BESIDE THE WORKFLOW GATE, NEVER INSIDE IT. These surfaces are absent because of the
// workspace's KIND, not because of the workflow system, so this module never reads
// `useWorkflowFeaturesEnabled` / `isWorkflowApplicable`, and the gate never reads this. A surface
// that is both gated and kind-dependent (the supervisor) ANDs the two at its call site. That
// separation is what keeps `offInvariantGuard` (6 arms / 11 subjects since M18 WP4) and `workflowApplicableGuard`
// green with no edit.
//
// ⚠️ It keys on the project KEY, not a `remote` field: no component carries the project row
// (`Workspace` / `RightPanelHost` get `project_path` only), and the key's scheme already decides it
// (Rust `config_store::is_remote_key`).

/** The scheme every remote identity key starts with (Rust `config_store::REMOTE_KEY_PREFIX`). */
export const REMOTE_KEY_PREFIX = "ssh://";

/** Whether `projectPath` is a remote workspace's key. THE remote test for the frontend. */
export function isRemoteKey(projectPath: string): boolean {
  return projectPath.startsWith(REMOTE_KEY_PREFIX);
}

/** The `user@host` part of a remote key, or `null` for a local path. */
export function remoteAuthority(projectPath: string): string | null {
  if (!isRemoteKey(projectPath)) return null;
  return projectPath.slice(REMOTE_KEY_PREFIX.length).split("/")[0] ?? null;
}

/**
 * Which surfaces a workspace may show. `true` = present (behaves as it always has); `false` =
 * absent (render nothing, invoke nothing).
 *
 * Every field is a surface that is ABSENT on a remote workspace. The IN surfaces (the CC pane, the
 * Prompt panel, the Docs panel, the skill row, Recycle, Session-Start, the drive-mode cell, the
 * resume announce, Detach/Reconnect) are not listed: nothing about them depends on the kind here.
 */
export interface WorkspaceSurfaces {
  /** The editor panel (tab, slot, ⌘⇧E), and with it the media viewer, ⌘N, ⌘1–9, ⌘W tab ops. */
  readonly editor: boolean;
  /** The git diff panel (tab, slot, ⌘⇧D). */
  readonly diff: boolean;
  /** The second terminal panel (tab, slot, ⌘⇧T, ＋, ⌘T): a LOCAL login shell. */
  readonly terminal: boolean;
  /** The file-tree rail (inside the editor slot) and its create / delete / trash actions. */
  readonly fileTree: boolean;
  /** The ⌘P fuzzy file finder. */
  readonly finder: boolean;
  /** ⌘⇧F Find in Files (and Replace All). */
  readonly projectSearch: boolean;
  /** The Sublime Text launcher. */
  readonly sublimeText: boolean;
  /** The Sublime Merge launcher. */
  readonly sublimeMerge: boolean;
  /** Reveal in Finder. */
  readonly finderReveal: boolean;
  /** Open the active editor file in its default macOS app. */
  readonly defaultApp: boolean;
  /** The workflow supervisor (gated AND kind-dependent: callers AND it with the gate). */
  readonly supervisor: boolean;
  /** The prev/next turn-marker jump (operator ruling 2026-11-17: absent on remote, permanently). */
  readonly turnJump: boolean;
  /** The local fs watcher (`workspace_watch_start`). Off → the remote poller (`remote_poll_start`). */
  readonly fsWatch: boolean;
  // ⚠️ No `docsRead` (removed at M17 WP7): Docs reads either kind, because the backend routes
  // `docs_list` / `docs_read` / `docs_stat` by target. A flag true for both kinds gates nothing.
}

const LOCAL: WorkspaceSurfaces = Object.freeze({
  editor: true,
  diff: true,
  terminal: true,
  fileTree: true,
  finder: true,
  projectSearch: true,
  sublimeText: true,
  sublimeMerge: true,
  finderReveal: true,
  defaultApp: true,
  supervisor: true,
  turnJump: true,
  fsWatch: true,
});

const REMOTE: WorkspaceSurfaces = Object.freeze({
  editor: false,
  diff: false,
  terminal: false,
  fileTree: false,
  finder: false,
  projectSearch: false,
  sublimeText: false,
  sublimeMerge: false,
  finderReveal: false,
  defaultApp: false,
  supervisor: false,
  turnJump: false,
  fsWatch: false,
});

/** The surfaces of a LOCAL workspace: everything present. The default wherever none is passed. */
export const LOCAL_SURFACES: WorkspaceSurfaces = LOCAL;

/** The funnel: which surfaces the workspace keyed `projectPath` may show. */
export function workspaceSurfaces(projectPath: string): WorkspaceSurfaces {
  return isRemoteKey(projectPath) ? REMOTE : LOCAL;
}

/** A surface whose trigger cannot be absent (a native menu item, a chord) and so must SAY so. */
export type AnnouncedSurface =
  | "editor"
  | "diff"
  | "terminal"
  | "fileTree"
  | "finder"
  | "projectSearch"
  | "sublimeText"
  | "sublimeMerge"
  | "finderReveal";

const NOTICE_SUBJECT: Record<AnnouncedSurface, string> = {
  editor: "The editor",
  diff: "The diff viewer",
  terminal: "The terminal panel",
  fileTree: "New File",
  finder: "Go to File",
  projectSearch: "Find in Files",
  sublimeText: "Sublime Text",
  sublimeMerge: "Sublime Merge",
  finderReveal: "Reveal in Finder",
};

/**
 * M17 WP6 (AC-4) — what a menu item or chord for an ABSENT surface says. The native menu is
 * app-global and a chord is a key, so neither can be absent per workspace; a silent no-op would
 * read as broken (prior `a-silent-non-action-must-not-read-as-done`). One info toast, plain words.
 */
export function absentSurfaceNotice(surface: AnnouncedSurface): string {
  return `${NOTICE_SUBJECT[surface]} isn't available on a remote workspace.`;
}

/** The surface a native-menu launcher callback acts on, or `null` for any other callback. */
export function launcherSurfaceFor(
  callback: string,
): "sublimeText" | "sublimeMerge" | "finderReveal" | null {
  switch (callback) {
    case "openSublimeText":
      return "sublimeText";
    case "openSublimeMerge":
      return "sublimeMerge";
    case "revealInFinder":
      return "finderReveal";
    default:
      return null;
  }
}
