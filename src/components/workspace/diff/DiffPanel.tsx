// WP4 Phase B — DiffPanel: the Sublime-Merge-style git diff viewer in a
// workspace's right half (Editor↔Diff toggle in Workspace.tsx; WP5's RightPanelHost
// folds both into one panel host later).
//
// Layout (operator-confirmed 2026-06-20): a collapsible Commits section on top +
// a changed-files area below, one scrolling column. The files area shows EITHER
// the working-directory changes (default) or a selected commit's diff. Every file
// is a collapsible section with its hunks rendered inline as styled +/- lines
// (HunkView — no @codemirror/merge; the backend git2 computes the real hunks).
//
// Backend (WP4 Phase A): git_changed_files (working-dir file list) → per-file
// git_file_hunks (lazy, on first expand) ; git_recent_commits (paginated) ;
// git_commit_diff (a commit's per-file hunks, loaded in bulk). View-only — nothing
// here mutates the repo. Every IPC failure renders inline, never swallowed
// (the WP6/WP7 error-surfacing lesson).

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { CommitList } from "./CommitList";
import { FileDiffSection, type HunkLoad } from "./FileDiffSection";
import {
  type ChangedFile,
  type CommitSummary,
  type FileDiff,
  COMMIT_PAGE_SIZE,
  allCollapsed,
  appendPage,
  collapseAll,
  diffViewReducer,
  expandAll,
  fileKey,
  hasMore,
  initialDiffView,
  isCollapsed,
  toggleCollapsed,
} from "./diffModel";

interface DiffPanelProps {
  /** Workspace project dir — the repo root the backend gathers diff data from. */
  projectPath: string;
  /**
   * True when this workspace tab is visible AND the diff panel is the front panel.
   * Gates the on-becoming-active list/commit fetch so a backgrounded panel doesn't
   * spend IPC. REQUIRED (mirrors EditorPanel's `active`).
   */
  active: boolean;
  /**
   * Open a file in the workspace's editor (the parent flips the right panel to the
   * Editor tab + sets its open path). Always opens the CURRENT working-tree content
   * via the editor's `read_file` path — even from a commit's diff row. This is BY
   * DESIGN, not a limitation: "open" always means the live editable working-tree
   * file regardless of which view it was clicked from. Inspecting a file's content
   * AT a past commit (blob-at-rev) is intentionally out of scope — that's what
   * Sublime Merge is for (the permanent "Open in Sublime Merge" button). Decided at
   * WP5 spec; SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV dismissed as WAI.
   */
  onOpenInEditor?: (path: string) => void;
}

// Working-dir changed-file LIST fetch lifecycle.
type ListState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; files: ChangedFile[] }
  | { kind: "error"; message: string };

type ListEvent =
  | { type: "start" }
  | { type: "ok"; files: ChangedFile[] }
  | { type: "fail"; message: string };

function listReducer(_state: ListState, e: ListEvent): ListState {
  switch (e.type) {
    case "start":
      return { kind: "loading" };
    case "ok":
      return { kind: "loaded", files: e.files };
    case "fail":
      return { kind: "error", message: e.message };
    default:
      return _state;
  }
}

// Commit list + pagination as one reducer so the synchronous "loading" write
// stays out of a raw setState-in-effect (the repo's reducer-driven IPC pattern,
// mirrors editorLoad/editorSave). `lastPageLen` is the length of the most recent
// page fetched (null before the first), driving the "Load more" visibility.
// Per-file hunk loads, keyed by fileKey, as a reducer so every write is a
// `dispatch` (allowed inside effects; raw setState in an effect body trips
// react-hooks/set-state-in-effect). Mirrors the list/commits reducers.
type HunkLoadsState = Record<string, HunkLoad>;

type HunkLoadsEvent =
  | { type: "reset" }
  | { type: "loading"; key: string }
  | { type: "loaded"; key: string; diff: FileDiff }
  | { type: "failed"; key: string; message: string };

function hunkLoadsReducer(
  state: HunkLoadsState,
  e: HunkLoadsEvent,
): HunkLoadsState {
  switch (e.type) {
    case "reset":
      return {};
    case "loading": {
      const cur = state[e.key];
      // No-op if already loading/loaded (avoid clobbering an in-flight load).
      if (cur && cur.kind !== "idle" && cur.kind !== "error") return state;
      return { ...state, [e.key]: { kind: "loading" } };
    }
    case "loaded":
      return { ...state, [e.key]: { kind: "loaded", diff: e.diff } };
    case "failed":
      return { ...state, [e.key]: { kind: "error", message: e.message } };
    default:
      return state;
  }
}

interface CommitsState {
  commits: CommitSummary[];
  loading: boolean;
  lastPageLen: number | null;
}

type CommitsEvent =
  | { type: "load-start" } // first page (reset)
  | { type: "more-start" } // load-more (keep existing)
  | { type: "first-page"; page: CommitSummary[] }
  | { type: "next-page"; page: CommitSummary[] }
  | { type: "fail" };

const initialCommitsState: CommitsState = {
  commits: [],
  loading: false,
  lastPageLen: null,
};

function commitsReducer(state: CommitsState, e: CommitsEvent): CommitsState {
  switch (e.type) {
    case "load-start":
      return { commits: [], loading: true, lastPageLen: null };
    case "more-start":
      return { ...state, loading: true };
    case "first-page":
      return { commits: e.page, loading: false, lastPageLen: e.page.length };
    case "next-page":
      return {
        commits: appendPage(state.commits, e.page),
        loading: false,
        lastPageLen: e.page.length,
      };
    case "fail":
      return { ...state, loading: false, lastPageLen: 0 };
    default:
      return state;
  }
}

export function DiffPanel({
  projectPath,
  active,
  onOpenInEditor,
}: DiffPanelProps) {
  // ── working-dir file list ──
  const [list, dispatchList] = useReducer(listReducer, { kind: "idle" });
  const [refreshSeq, setRefreshSeq] = useState(0);
  const refresh = useCallback(() => setRefreshSeq((n) => n + 1), []);

  // ── view mode (working dir vs. a commit) ──
  const [view, dispatchView] = useReducer(diffViewReducer, initialDiffView);

  // ── per-file collapse set + lazy hunk loads (keyed by fileKey) ──
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [hunkLoads, dispatchHunks] = useReducer(hunkLoadsReducer, {});

  // ── commit list (paginated) ──
  const [commitsState, dispatchCommits] = useReducer(
    commitsReducer,
    initialCommitsState,
  );
  const { commits, loading: commitsLoading, lastPageLen } = commitsState;
  // Default COLLAPSED (WP8 item B): the commit history is secondary to the
  // working-dir changes, so it starts folded and the user expands it on demand.
  const [commitsCollapsed, setCommitsCollapsed] = useState(true);

  // ── selected-commit diff (bulk) ──
  const [commitDiff, setCommitDiff] = useState<{
    sha: string;
    files: FileDiff[];
  } | null>(null);
  const [commitDiffError, setCommitDiffError] = useState<string | null>(null);

  // ── WP8 item 2/A — stacked-sticky offsets ──
  // The Commits section pins at top:0; the commit banner + per-file headers must
  // pin BELOW it (and the file headers below the banner in commit view) so the
  // sticky layers stack instead of colliding at top:0 (which hid the file header
  // behind the z2 Commits panel and let the next file shove it off). We measure the
  // live heights of .diff-commits + .diff-commit-banner and publish them as CSS
  // custom properties on .diff-scroll; the CSS top: calc()s read them. A
  // ResizeObserver keeps them current as the Commits section collapses/expands or
  // the banner appears/disappears between working-dir and commit views.
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Fetch the working-dir changed-file list on becoming active / Refresh. Resets
  // the per-file lazy-load cache so re-opened files re-fetch fresh hunks.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    dispatchList({ type: "start" });
    invoke<ChangedFile[]>("git_changed_files", { root: projectPath })
      .then((files) => {
        if (cancelled) return;
        // Reset the per-file lazy-load cache as the new list lands so re-opened
        // files re-fetch fresh hunks.
        dispatchHunks({ type: "reset" });
        dispatchList({ type: "ok", files });
      })
      .catch((e: unknown) => {
        if (!cancelled) dispatchList({ type: "fail", message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [active, projectPath, refreshSeq]);

  // Fetch the first page of commits on becoming active / Refresh.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    dispatchCommits({ type: "load-start" });
    invoke<CommitSummary[]>("git_recent_commits", {
      root: projectPath,
      offset: 0,
      limit: COMMIT_PAGE_SIZE,
    })
      .then((page) => {
        if (!cancelled) dispatchCommits({ type: "first-page", page });
      })
      .catch(() => {
        // A commit-log failure is non-fatal to the working-dir view; the section
        // shows "No commits yet." The working-dir file list surfaces its own errors.
        if (!cancelled) dispatchCommits({ type: "fail" });
      });
    return () => {
      cancelled = true;
    };
  }, [active, projectPath, refreshSeq]);

  // Keep the stacked-sticky CSS vars in sync with the live heights of the Commits
  // section + (commit-view) banner. Re-runs when the structure that owns those
  // nodes changes (view switch adds/removes the banner; list/commit load mounts the
  // files area). The ResizeObserver then tracks height changes WITHIN a structure
  // (collapse/expand of the Commits body, banner subject wrap). Sets the vars on
  // .diff-scroll, which both top: calc()s read. Guarded for ResizeObserver
  // availability (always present in WKWebView/modern browsers; the guard keeps
  // jsdom + older runtimes from throwing).
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const commits = scroll.querySelector<HTMLElement>(".diff-commits");
      const banner = scroll.querySelector<HTMLElement>(".diff-commit-banner");
      scroll.style.setProperty(
        "--diff-commits-h",
        `${commits ? commits.offsetHeight : 0}px`,
      );
      scroll.style.setProperty(
        "--diff-commit-banner-h",
        `${banner ? banner.offsetHeight : 0}px`,
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    const commits = scroll.querySelector<HTMLElement>(".diff-commits");
    const banner = scroll.querySelector<HTMLElement>(".diff-commit-banner");
    if (commits) ro.observe(commits);
    if (banner) ro.observe(banner);
    return () => ro.disconnect();
    // Re-attach when the observed nodes can appear/disappear: `view.kind` switch toggles
    // the banner; `list.kind`/`commitDiff` mount the files area. `commitsCollapsed` is
    // belt-and-suspenders, NOT load-bearing — only `.diff-commits-body` mounts/unmounts
    // inside the already-observed `.diff-commits` parent, so the observer catches the
    // height change on its own. Kept for safety; don't mistake it for a required dep.
    // Height changes within a stable structure are caught by the observer.
  }, [view.kind, commitsCollapsed, list.kind, commitDiff]);

  const loadMoreCommits = useCallback(() => {
    dispatchCommits({ type: "more-start" });
    invoke<CommitSummary[]>("git_recent_commits", {
      root: projectPath,
      offset: commits.length,
      limit: COMMIT_PAGE_SIZE,
    })
      .then((page) => dispatchCommits({ type: "next-page", page }))
      .catch(() => dispatchCommits({ type: "fail" }));
  }, [projectPath, commits.length]);

  // Lazy-load one working-dir file's hunks (on first expand). No-op if already
  // loaded/loading. Sets the keyed HunkLoad state.
  const loadFileHunks = useCallback(
    (file: ChangedFile) => {
      const key = fileKey(file);
      dispatchHunks({ type: "loading", key });
      invoke<FileDiff>("git_file_hunks", {
        root: projectPath,
        path: file.path,
        staged: file.staged,
      })
        .then((diff) => dispatchHunks({ type: "loaded", key, diff }))
        .catch((e: unknown) =>
          dispatchHunks({ type: "failed", key, message: String(e) }),
        );
    },
    [projectPath],
  );

  // Toggle a file's collapse; on expanding a working-dir file with no hunks yet,
  // kick the lazy load.
  const toggleFile = useCallback(
    (file: ChangedFile) => {
      const key = fileKey(file);
      const wasCollapsed = isCollapsed(collapsed, key);
      setCollapsed((prev) => toggleCollapsed(prev, key));
      // Expanding (was collapsed → now open): ensure hunks are loaded.
      if (wasCollapsed) loadFileHunks(file);
    },
    [collapsed, loadFileHunks],
  );

  // Working-dir files default to EXPANDED, so eagerly load their hunks once the
  // list arrives (unless the user has collapsed them). Bounded by the changed-file
  // count, which is small in practice.
  useEffect(() => {
    if (list.kind !== "loaded") return;
    for (const file of list.files) {
      const key = fileKey(file);
      if (!isCollapsed(collapsed, key) && !hunkLoads[key]) {
        loadFileHunks(file);
      }
    }
    // Only react to a new file list; collapse/hunkLoads changes are handled by the
    // toggle path. (Including them would re-run on every expand.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  // Select a commit → switch the files area to its diff (bulk-loaded).
  const selectCommit = useCallback(
    (commit: CommitSummary) => {
      dispatchView({
        type: "view-commit",
        sha: commit.sha,
        subject: commit.subject,
      });
      setCommitDiff(null);
      setCommitDiffError(null);
      invoke<FileDiff[]>("git_commit_diff", {
        root: projectPath,
        sha: commit.sha,
      })
        .then((files) => setCommitDiff({ sha: commit.sha, files }))
        .catch((e: unknown) => setCommitDiffError(String(e)));
    },
    [projectPath],
  );

  const backToWorking = useCallback(
    () => dispatchView({ type: "view-working" }),
    [],
  );

  // Epoch-seconds reference for relative-time formatting. A lazy useState
  // initializer reads Date.now() exactly once at mount — the sanctioned place for
  // an impure read (render/useMemo are not; an effect setState trips
  // set-state-in-effect). Good enough: relative-time labels ("3h ago") needn't
  // tick live within a session.
  const [nowSecs] = useState(() => Math.floor(Date.now() / 1000));
  const selectedSha = view.kind === "commit" ? view.sha : null;
  const showLoadMore =
    lastPageLen != null && hasMore(lastPageLen, COMMIT_PAGE_SIZE);

  // The fileKeys of the files in the ACTIVE view (working-dir or the selected
  // commit's loaded diff). Drives the collapse-all/expand-all control. Commit-view
  // files key as `commit:<path>` (matching CommitFiles); working-dir files via
  // fileKey. Empty until the active view's files have loaded. Memoized so the
  // array identity is stable across renders (it's a useCallback dep below).
  // Is the loaded commit diff the one for the currently-selected commit? (async-staleness
  // guard: a stale in-flight diff for a previously-selected sha must not render). One flag
  // derived once, consumed by the commit-area render gate below (loaded vs. loading) and by
  // `commitFilesLoaded`.
  const commitReady = commitDiff?.sha === selectedSha;
  const commitFilesLoaded =
    view.kind === "commit" && commitReady ? commitDiff.files : null;
  // The working-dir file list (null unless loaded). Deriving it here lets the memo dep
  // narrow to just the value it reads (`listFiles`) instead of the whole `list` reducer
  // object, so a list-state transition that doesn't change the file set (e.g. idle→loading)
  // no longer re-derives the keys.
  const listFiles = list.kind === "loaded" ? list.files : null;
  const visibleKeys = useMemo(
    () =>
      commitFilesLoaded != null
        ? commitFilesLoaded.map((d) => `commit:${d.path}`)
        : listFiles != null
          ? listFiles.map(fileKey)
          : [],
    [commitFilesLoaded, listFiles],
  );

  // `everyCollapsed` is for the button LABEL (current render's `collapsed`); the setter
  // below re-evaluates `allCollapsed` against fresh `prev` because a queued toggle must
  // read the latest state, not this render's snapshot. The two `allCollapsed` calls are a
  // deliberate duplication (label vs. fresh-prev decision), not a drift bug.
  const everyCollapsed = allCollapsed(collapsed, visibleKeys);
  const toggleAllCollapsed = useCallback(() => {
    setCollapsed((prev) =>
      allCollapsed(prev, visibleKeys) ? expandAll() : collapseAll(visibleKeys),
    );
  }, [visibleKeys]);

  return (
    <div className="diff-panel" data-testid="diff-panel">
      <div className="diff-statusbar" data-testid="diff-statusbar">
        <span className="diff-status-title">
          {view.kind === "commit" ? "Viewing commit" : "Working Directory"}
        </span>
        <div className="diff-statusbar-actions">
          {visibleKeys.length > 0 && (
            <button
              type="button"
              className="diff-statusbar-btn"
              data-testid="diff-collapse-all"
              onClick={toggleAllCollapsed}
              title={
                everyCollapsed
                  ? "Expand all file sections"
                  : "Collapse all file sections"
              }
            >
              {everyCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
          <button
            type="button"
            className="diff-statusbar-btn diff-refresh-btn"
            data-testid="diff-refresh-btn"
            onClick={refresh}
            title="Re-scan the working tree + reload commits"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="diff-scroll" data-testid="diff-scroll" ref={scrollRef}>
        <CommitList
          commits={commits}
          collapsed={commitsCollapsed}
          loading={commitsLoading}
          showLoadMore={showLoadMore}
          nowSecs={nowSecs}
          selectedSha={selectedSha}
          onToggleCollapsed={() => setCommitsCollapsed((c) => !c)}
          onSelect={selectCommit}
          onLoadMore={loadMoreCommits}
        />

        {/* Files area: a selected commit's diff, or the working-dir changes. */}
        {view.kind === "commit" ? (
          <div className="diff-files-area" data-testid="diff-files-area">
            <div
              className="diff-commit-banner"
              data-testid="diff-commit-banner"
            >
              <button
                type="button"
                className="diff-back-btn"
                data-testid="diff-back-btn"
                onClick={backToWorking}
              >
                ← Working Directory
              </button>
              <span className="diff-commit-banner-subject">{view.subject}</span>
            </div>
            {commitDiffError && (
              <div className="diff-error" data-testid="diff-commit-error">
                <p className="diff-error-title">Could not load commit diff</p>
                <p className="diff-error-detail">{commitDiffError}</p>
              </div>
            )}
            {!commitDiffError && commitReady && (
              <CommitFiles
                files={commitDiff.files}
                collapsed={collapsed}
                onToggleKey={(key) =>
                  setCollapsed((prev) => toggleCollapsed(prev, key))
                }
                onOpenInEditor={onOpenInEditor}
              />
            )}
            {!commitDiffError && !commitReady && (
              <div className="diff-file-loading">Loading commit diff…</div>
            )}
          </div>
        ) : (
          <div className="diff-files-area" data-testid="diff-files-area">
            {list.kind === "error" && (
              <div className="diff-error" data-testid="diff-list-error">
                <p className="diff-error-title">Could not list changes</p>
                <p className="diff-error-detail">{list.message}</p>
              </div>
            )}
            {list.kind === "loaded" && list.files.length === 0 && (
              <div className="diff-empty" data-testid="diff-empty">
                <p className="placeholder-coming">No changes</p>
                <p className="placeholder-detail">
                  The working tree is clean — nothing to diff.
                </p>
              </div>
            )}
            {list.kind === "loaded" &&
              list.files.map((file) => {
                const key = fileKey(file);
                return (
                  <FileDiffSection
                    key={key}
                    path={file.path}
                    status={file.status}
                    staged={file.staged}
                    collapsed={isCollapsed(collapsed, key)}
                    load={hunkLoads[key] ?? { kind: "idle" }}
                    onToggle={() => toggleFile(file)}
                    onOpenInEditor={onOpenInEditor}
                  />
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

// A selected commit's files: hunks arrive in bulk (git_commit_diff), so each
// section is always "loaded" — no per-file lazy fetch. Collapse is shared with the
// working-dir view's set (keyed by fileKey, which folds staged=false for commit
// files since a committed diff has no staged notion).
function CommitFiles({
  files,
  collapsed,
  onToggleKey,
  onOpenInEditor,
}: {
  files: FileDiff[];
  collapsed: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
  onOpenInEditor?: (path: string) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="diff-empty">
        <p className="placeholder-detail">This commit changed no files.</p>
      </div>
    );
  }
  return (
    <>
      {files.map((diff) => {
        const key = `commit:${diff.path}`;
        return (
          <FileDiffSection
            key={key}
            path={diff.path}
            status={diff.status}
            staged={diff.staged}
            collapsed={isCollapsed(collapsed, key)}
            load={{ kind: "loaded", diff }}
            onToggle={() => onToggleKey(key)}
            onOpenInEditor={onOpenInEditor}
          />
        );
      })}
    </>
  );
}
