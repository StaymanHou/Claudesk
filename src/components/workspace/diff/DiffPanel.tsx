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

import { useCallback, useEffect, useReducer, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CommitList } from "./CommitList";
import { FileDiffSection, type HunkLoad } from "./FileDiffSection";
import {
  type ChangedFile,
  type CommitSummary,
  type FileDiff,
  COMMIT_PAGE_SIZE,
  appendPage,
  diffViewReducer,
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

export function DiffPanel({ projectPath, active }: DiffPanelProps) {
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
  const [commitsCollapsed, setCommitsCollapsed] = useState(false);

  // ── selected-commit diff (bulk) ──
  const [commitDiff, setCommitDiff] = useState<{
    sha: string;
    files: FileDiff[];
  } | null>(null);
  const [commitDiffError, setCommitDiffError] = useState<string | null>(null);

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

  return (
    <div className="diff-panel" data-testid="diff-panel">
      <div className="diff-statusbar" data-testid="diff-statusbar">
        <span className="diff-status-title">
          {view.kind === "commit" ? "Viewing commit" : "Working Directory"}
        </span>
        <button
          type="button"
          className="diff-refresh-btn"
          data-testid="diff-refresh-btn"
          onClick={refresh}
          title="Re-scan the working tree + reload commits"
        >
          Refresh
        </button>
      </div>

      <div className="diff-scroll" data-testid="diff-scroll">
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
            {!commitDiffError && commitDiff?.sha === selectedSha && (
              <CommitFiles
                files={commitDiff.files}
                collapsed={collapsed}
                onToggleKey={(key) =>
                  setCollapsed((prev) => toggleCollapsed(prev, key))
                }
              />
            )}
            {!commitDiffError && commitDiff?.sha !== selectedSha && (
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
}: {
  files: FileDiff[];
  collapsed: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
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
          />
        );
      })}
    </>
  );
}
