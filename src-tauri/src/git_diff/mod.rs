//! Git diff data — the changed-file list, per-file diff hunks, and recent-commit
//! history for the Milestone-2 Sublime-Merge-style diff viewer (WP4).
//!
//! This module supplies **data only** — `git2` (libgit2) computes the real git
//! diff and we ship **structured hunk data** to the frontend, which renders each
//! line as a styled +/- row (no `@codemirror/merge`, no per-file editor). The
//! three things the UI needs that the frontend can't get itself:
//!   1. **which files changed** (unstaged vs staged) — [`changed_files_core`];
//!   2. **the diff hunks** of a file or a commit — [`file_hunks_core`] /
//!      [`commit_diff_core`] (`git2::Patch` → hunks → lines);
//!   3. **recent commit history**, paginated — [`recent_commits_core`] (revwalk).
//!
//! ## Layout (mirrors [`crate::editor_fs`])
//! - **Pure core** functions take an injected `repo_root: &Path`, so they are
//!   unit-testable against a `TempDir` git repo with no Tauri runtime.
//! - **Tauri command wrappers** ([`commands`]) are the only IPC surface; they map
//!   [`GitDiffError`] to a `String` (the WP6/WP7 error-surfacing shape — a diff
//!   failure is visible in the UI, never swallowed).
//!
//! ## Scope (Milestone 2)
//! View-only: changed-file list + per-file/-commit diff hunks + commit history.
//! Interactive staging, rebase, blame, and conflict-resolution are explicitly out
//! of M2 scope — nothing here mutates the repo.

pub mod commands;

use std::path::Path;

use git2::{Commit, Delta, Diff, DiffLineType, Patch, Repository, Status, StatusOptions};
use serde::Serialize;
use thiserror::Error;

/// Errors from git-diff data gathering. IPC wrappers map this to a `String`.
#[derive(Debug, Error)]
pub enum GitDiffError {
    /// `repo_root` is not inside a git repository (no `.git` discovered).
    #[error("{0} is not a git repository")]
    NotARepo(String),
    /// Any other libgit2 failure (bad object, corrupt repo, IO).
    #[error("git error: {0}")]
    Git(#[from] git2::Error),
    /// The requested commit SHA could not be parsed or found in the repo.
    #[error("commit {0} not found")]
    BadCommit(String),
}

/// One changed file in the working tree or index, as the diff viewer's file list
/// needs it. `path` is repo-root-relative (the same key the frontend passes back
/// to [`file_hunks_core`] and to the editor's `read_file`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ChangedFile {
    /// Repo-root-relative path (forward-slashed, as libgit2 reports it).
    pub path: String,
    /// Coarse change kind for the UI badge.
    pub status: ChangedStatus,
    /// `true` = the change is staged (index vs HEAD); `false` = unstaged
    /// (working-tree vs index). A file with both staged and unstaged changes
    /// appears as two entries (one of each) — the diff viewer can show either side.
    pub staged: bool,
}

/// Coarse change kind. Maps libgit2's per-file status flags to the four cases the
/// diff viewer's badge distinguishes; `Untracked` is surfaced separately from
/// `Added` because it has no index entry yet (its base is empty either way).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangedStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
}

/// Open the repository that contains `repo_root`, discovering upward to the repo
/// root (so a workspace dir that is a subdirectory of the repo still works). A
/// path with no enclosing repo maps to [`GitDiffError::NotARepo`] rather than a
/// raw libgit2 error, so the UI can show a clean "not a git repo" state.
fn open_repo(repo_root: &Path) -> Result<Repository, GitDiffError> {
    Repository::discover(repo_root)
        .map_err(|_| GitDiffError::NotARepo(repo_root.display().to_string()))
}

/// List every changed file in `repo_root`'s repository, split into staged
/// (index-vs-HEAD) and unstaged (working-tree-vs-index) entries. Untracked files
/// are included (as unstaged `Untracked`). A clean tree returns an empty list.
///
/// A file changed in both the index and the working tree yields two `ChangedFile`
/// entries — one `staged: true`, one `staged: false` — so the viewer can diff
/// either side independently.
pub fn changed_files_core(repo_root: &Path) -> Result<Vec<ChangedFile>, GitDiffError> {
    let repo = open_repo(repo_root)?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts))?;
    let mut out = Vec::new();

    for entry in statuses.iter() {
        let s = entry.status();
        // Prefer the index path for the staged side; fall back to the workdir path.
        let path = entry.path().unwrap_or("").to_string();
        if path.is_empty() {
            continue;
        }

        // Staged side: index differs from HEAD.
        if let Some(status) = staged_status(s) {
            out.push(ChangedFile {
                path: path.clone(),
                status,
                staged: true,
            });
        }
        // Unstaged side: working tree differs from the index (incl. untracked).
        if let Some(status) = unstaged_status(s) {
            out.push(ChangedFile {
                path,
                status,
                staged: false,
            });
        }
    }

    Ok(out)
}

/// Map the index-vs-HEAD bits of a libgit2 status to a [`ChangedStatus`], or
/// `None` if nothing is staged for this file.
fn staged_status(s: Status) -> Option<ChangedStatus> {
    if s.contains(Status::INDEX_NEW) {
        Some(ChangedStatus::Added)
    } else if s.contains(Status::INDEX_DELETED) {
        Some(ChangedStatus::Deleted)
    } else if s.contains(Status::INDEX_RENAMED) {
        Some(ChangedStatus::Renamed)
    } else if s.contains(Status::INDEX_MODIFIED) || s.contains(Status::INDEX_TYPECHANGE) {
        Some(ChangedStatus::Modified)
    } else {
        None
    }
}

/// Map the working-tree-vs-index bits of a libgit2 status to a [`ChangedStatus`],
/// or `None` if the working tree matches the index.
fn unstaged_status(s: Status) -> Option<ChangedStatus> {
    if s.contains(Status::WT_NEW) {
        Some(ChangedStatus::Untracked)
    } else if s.contains(Status::WT_DELETED) {
        Some(ChangedStatus::Deleted)
    } else if s.contains(Status::WT_RENAMED) {
        Some(ChangedStatus::Renamed)
    } else if s.contains(Status::WT_MODIFIED) || s.contains(Status::WT_TYPECHANGE) {
        Some(ChangedStatus::Modified)
    } else {
        None
    }
}

// ── Diff hunk data ────────────────────────────────────────────────────────────
//
// The structured shapes the frontend renders directly (PA.1). A `FileDiff` is one
// changed file's hunks; a `Hunk` is a contiguous `@@ … @@` block; a `DiffLine` is
// one rendered row. `git2` computes these from the real git diff (PA.2/PA.4) so we
// ship git's exact hunks, not a JS recomputation.

/// One rendered diff line: a context line (unchanged, shown for surroundings), an
/// addition, or a deletion. Line numbers are `None` on the side where the line
/// doesn't exist (an added line has no `old_lineno`; a removed line has no
/// `new_lineno`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiffLine {
    pub origin: LineOrigin,
    /// The line text (without the +/-/space origin marker; trailing newline kept
    /// as git reports it).
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

/// The kind of a [`DiffLine`] — drives the row's color in the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineOrigin {
    Context,
    Add,
    Remove,
}

/// A contiguous diff hunk: its `@@ -a,b +c,d @@` header (as git emits it) and the
/// lines within.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Hunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

/// One changed file's full diff: identity (path/status/staged), a `binary` flag
/// (true → no line-level hunks, the UI shows a "binary file" notice), and the
/// hunks. Reused for both working-tree file diffs and per-commit file diffs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileDiff {
    pub path: String,
    pub status: ChangedStatus,
    pub staged: bool,
    pub binary: bool,
    pub hunks: Vec<Hunk>,
}

/// Map a libgit2 `Delta` (whole-file change kind from a `Diff`) to our coarse
/// [`ChangedStatus`]. Distinct from the `Status`-flag mapping above: a `Diff`
/// reports per-file `Delta`s, not working-tree status bits.
fn delta_to_status(delta: Delta) -> ChangedStatus {
    match delta {
        Delta::Added => ChangedStatus::Added,
        Delta::Deleted => ChangedStatus::Deleted,
        Delta::Renamed | Delta::Copied => ChangedStatus::Renamed,
        Delta::Untracked => ChangedStatus::Untracked,
        // Modified / Typechange / Conflicted / Unmodified / Ignored / Unreadable
        // all render as a content modification for the viewer's purposes.
        _ => ChangedStatus::Modified,
    }
}

/// Walk every delta in `diff` into a [`FileDiff`] (one per changed file), reading
/// hunks + lines via [`git2::Patch`]. `staged` is stamped onto each result (the
/// caller knows which side this diff represents). A binary delta yields a
/// `binary: true` FileDiff with no hunks. Shared by [`file_hunks_core`] (filtered
/// to one path) and [`commit_diff_core`] (all files).
fn diff_to_file_diffs(diff: &Diff, staged: bool) -> Result<Vec<FileDiff>, GitDiffError> {
    let mut out = Vec::new();
    let num_deltas = diff.deltas().len();

    for idx in 0..num_deltas {
        let delta = match diff.get_delta(idx) {
            Some(d) => d,
            None => continue,
        };
        // Path: prefer the new file's path, fall back to the old (deletes/renames).
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        if path.is_empty() {
            continue;
        }
        let status = delta_to_status(delta.status());
        // The delta's binary flag is only reliably set after libgit2 has examined
        // blob content, which happens when building the Patch. So we use the Patch
        // result as the source of truth: `Patch::from_diff` returns `None` for a
        // binary delta. (The pre-flag is an early-out for the common case but isn't
        // depended on — a `None` patch on a content change is treated as binary.)
        let flagged_binary = delta.flags().is_binary()
            || delta.new_file().is_binary()
            || delta.old_file().is_binary();
        // A content-bearing change (add/modify/delete/typechange) that produces NO
        // text hunks is binary: libgit2 emits no line-level patch for binary blobs.
        // (Pure renames/copies also have no hunks but map to Renamed, not these.)
        let content_change = matches!(
            delta.status(),
            Delta::Added | Delta::Modified | Delta::Deleted | Delta::Typechange
        );
        let patch = Patch::from_diff(diff, idx)?;
        let hunks = match &patch {
            Some(p) => patch_to_hunks(p)?,
            None => Vec::new(),
        };
        // Binary if libgit2 flagged it, OR a content change yielded zero hunks
        // (the case where tree_to_index didn't pre-set the flag but the blob is
        // binary). A genuinely-empty text change is rare and shows the notice
        // harmlessly.
        let binary = flagged_binary || (content_change && hunks.is_empty());
        out.push(FileDiff {
            path,
            status,
            staged,
            binary,
            hunks,
        });
    }

    Ok(out)
}

/// Read a single-file [`git2::Patch`] into our [`Hunk`] list: each hunk's header
/// plus every line, mapping git's line-origin to [`LineOrigin`]. EOF-newline
/// markers (ContextEOFNL / AddEOFNL / DeleteEOFNL) fold into their content kind so
/// a "\ No newline at end of file" doesn't surface as a stray row.
fn patch_to_hunks(patch: &Patch) -> Result<Vec<Hunk>, GitDiffError> {
    let mut hunks = Vec::new();
    let num_hunks = patch.num_hunks();

    for h in 0..num_hunks {
        let (hunk, _lines) = patch.hunk(h)?;
        let header = String::from_utf8_lossy(hunk.header()).into_owned();
        let num_lines = patch.num_lines_in_hunk(h)?;
        let mut lines = Vec::with_capacity(num_lines);

        for l in 0..num_lines {
            let line = patch.line_in_hunk(h, l)?;
            let origin = match line.origin_value() {
                DiffLineType::Addition | DiffLineType::AddEOFNL => LineOrigin::Add,
                DiffLineType::Deletion | DiffLineType::DeleteEOFNL => LineOrigin::Remove,
                // Context, ContextEOFNL, and any file-level markers render as context.
                _ => LineOrigin::Context,
            };
            lines.push(DiffLine {
                origin,
                content: String::from_utf8_lossy(line.content()).into_owned(),
                old_lineno: line.old_lineno(),
                new_lineno: line.new_lineno(),
            });
        }
        hunks.push(Hunk { header, lines });
    }

    Ok(hunks)
}

/// The diff hunks for a single working-tree file. `staged == false` diffs the
/// index against the working dir (`diff_index_to_workdir`, filtered to `path` via
/// the pathspec); `staged == true` diffs HEAD's tree against the index
/// (`diff_tree_to_index`). Returns one [`FileDiff`]; a path with no changes on that
/// side yields an empty-hunks FileDiff (status Modified).
pub fn file_hunks_core(
    repo_root: &Path,
    path: &str,
    staged: bool,
) -> Result<FileDiff, GitDiffError> {
    let repo = open_repo(repo_root)?;

    let mut opts = git2::DiffOptions::new();
    opts.pathspec(path)
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        // Without this, an untracked file appears as a delta with NO patch lines —
        // the UI would show "added" with an empty hunk list. We want its content.
        .show_untracked_content(true);

    let diff = if staged {
        // Staged side: HEAD tree → index.
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?
    } else {
        // Unstaged side: index → working dir.
        repo.diff_index_to_workdir(None, Some(&mut opts))?
    };

    let mut files = diff_to_file_diffs(&diff, staged)?;
    // The pathspec should leave exactly the one file; if git returned several
    // (pathspec can match a dir prefix), pick the exact-path match, else the first.
    if let Some(pos) = files.iter().position(|f| f.path == path) {
        Ok(files.swap_remove(pos))
    } else if !files.is_empty() {
        Ok(files.swap_remove(0))
    } else {
        // No change on this side for this path — return an empty diff, not an error.
        Ok(FileDiff {
            path: path.to_string(),
            status: ChangedStatus::Modified,
            staged,
            binary: false,
            hunks: Vec::new(),
        })
    }
}

// ── Commit history ──────────────────────────────────────────────────────────

/// One commit as the history list needs it. `time` is epoch seconds (the frontend
/// formats relative time); `is_head` marks the commit the current HEAD points at.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommitSummary {
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author: String,
    pub time: i64,
    pub is_head: bool,
}

/// Recent commits reachable from HEAD, newest-first, paginated: skip `offset`,
/// take `limit`. Backs the "Load more" affordance — a short/empty page means
/// end-of-history. An unborn HEAD (no commits) returns an empty vec, not an error.
pub fn recent_commits_core(
    repo_root: &Path,
    offset: usize,
    limit: usize,
) -> Result<Vec<CommitSummary>, GitDiffError> {
    let repo = open_repo(repo_root)?;

    // Unborn HEAD (fresh repo, no commits) → no history.
    let head_oid = match repo.head().ok().and_then(|h| h.target()) {
        Some(oid) => oid,
        None => return Ok(Vec::new()),
    };

    let mut walk = repo.revwalk()?;
    walk.push_head()?;
    // TOPOLOGICAL guarantees a child is always yielded before its parent (newest →
    // oldest from HEAD) deterministically — TIME alone tie-breaks unpredictably when
    // commits share a timestamp (e.g. scripted commits in the same second). TIME is
    // OR'd in so same-topological-rank commits still order by recency.
    walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;

    let mut out = Vec::with_capacity(limit);
    for oid in walk.skip(offset).take(limit) {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;
        out.push(commit_to_summary(&commit, oid == head_oid));
    }
    Ok(out)
}

/// Build a [`CommitSummary`] from a commit. The subject is the first line of the
/// message; author is the signature name; non-UTF-8 is lossily decoded.
fn commit_to_summary(commit: &Commit, is_head: bool) -> CommitSummary {
    let sha = commit.id().to_string();
    let short_sha = sha.chars().take(7).collect();
    // `summary()` returns Result<Option<&str>> (it UTF-8-validates). On Ok(Some) use
    // it; otherwise (non-UTF-8 or empty) fall back to a lossy first-line decode.
    let subject = match commit.summary_bytes() {
        Some(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        None => String::new(),
    };
    let author = commit.author().name().unwrap_or("(unknown)").to_string();
    CommitSummary {
        sha,
        short_sha,
        subject,
        author,
        time: commit.time().seconds(),
        is_head,
    }
}

/// The per-file diff of a commit against its first parent (the usual "what this
/// commit changed" view). A **root commit** (no parent) diffs against the empty
/// tree — i.e. everything is added. An unknown/unparseable `sha` is a typed error.
pub fn commit_diff_core(repo_root: &Path, sha: &str) -> Result<Vec<FileDiff>, GitDiffError> {
    let repo = open_repo(repo_root)?;

    let oid = git2::Oid::from_str(sha).map_err(|_| GitDiffError::BadCommit(sha.to_string()))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|_| GitDiffError::BadCommit(sha.to_string()))?;
    let commit_tree = commit.tree()?;

    // First parent's tree, or None for a root commit (→ diff vs empty tree).
    let parent_tree = match commit.parent_count() {
        0 => None,
        _ => Some(commit.parent(0)?.tree()?),
    };

    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None)?;
    // A committed diff has no "staged" notion — stamp false.
    diff_to_file_diffs(&diff, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::process::Command;
    use tempfile::TempDir;

    /// Run a git command in `dir`, asserting success. Uses the real `git` binary so
    /// the fixture state is exactly what a user would produce (libgit2 then reads
    /// it back) — the test verifies our *reading*, not git's writing.
    fn git(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .expect("git command runs");
        assert!(
            out.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    /// A repo with one committed file, deterministic identity + default branch.
    fn init_repo() -> TempDir {
        let dir = TempDir::new().unwrap();
        let p = dir.path();
        git(p, &["init", "-q", "-b", "main"]);
        git(p, &["config", "user.email", "test@example.com"]);
        git(p, &["config", "user.name", "Test"]);
        std::fs::write(p.join("committed.txt"), "line1\nline2\n").unwrap();
        git(p, &["add", "."]);
        git(p, &["commit", "-q", "-m", "initial"]);
        dir
    }

    #[test]
    fn clean_repo_has_no_changes() {
        let dir = init_repo();
        let files = changed_files_core(dir.path()).unwrap();
        assert!(
            files.is_empty(),
            "clean tree should report no changes: {files:?}"
        );
    }

    #[test]
    fn non_git_dir_is_not_a_repo_error() {
        let dir = TempDir::new().unwrap();
        let result = changed_files_core(dir.path());
        assert!(
            matches!(result, Err(GitDiffError::NotARepo(_))),
            "got {result:?}"
        );
    }

    #[test]
    fn unstaged_modification_is_listed_unstaged() {
        let dir = init_repo();
        std::fs::write(dir.path().join("committed.txt"), "line1\nCHANGED\n").unwrap();
        let files = changed_files_core(dir.path()).unwrap();
        assert_eq!(files.len(), 1, "{files:?}");
        assert_eq!(files[0].path, "committed.txt");
        assert_eq!(files[0].status, ChangedStatus::Modified);
        assert!(!files[0].staged);
    }

    #[test]
    fn staged_modification_is_listed_staged() {
        let dir = init_repo();
        std::fs::write(dir.path().join("committed.txt"), "line1\nSTAGED\n").unwrap();
        git(dir.path(), &["add", "committed.txt"]);
        let files = changed_files_core(dir.path()).unwrap();
        assert_eq!(files.len(), 1, "{files:?}");
        assert_eq!(files[0].status, ChangedStatus::Modified);
        assert!(files[0].staged);
    }

    #[test]
    fn untracked_file_is_listed_unstaged() {
        let dir = init_repo();
        std::fs::write(dir.path().join("new.txt"), "brand new\n").unwrap();
        let files = changed_files_core(dir.path()).unwrap();
        assert_eq!(files.len(), 1, "{files:?}");
        assert_eq!(files[0].path, "new.txt");
        assert_eq!(files[0].status, ChangedStatus::Untracked);
        assert!(!files[0].staged);
    }

    #[test]
    fn staged_and_unstaged_changes_yield_two_entries() {
        let dir = init_repo();
        // Stage one change, then make a further unstaged edit on top.
        std::fs::write(dir.path().join("committed.txt"), "line1\nSTAGED\n").unwrap();
        git(dir.path(), &["add", "committed.txt"]);
        std::fs::write(
            dir.path().join("committed.txt"),
            "line1\nSTAGED\nUNSTAGED\n",
        )
        .unwrap();

        let files = changed_files_core(dir.path()).unwrap();
        let staged: Vec<_> = files.iter().filter(|f| f.staged).collect();
        let unstaged: Vec<_> = files.iter().filter(|f| !f.staged).collect();
        assert_eq!(staged.len(), 1, "expected one staged entry: {files:?}");
        assert_eq!(unstaged.len(), 1, "expected one unstaged entry: {files:?}");
        assert_eq!(staged[0].status, ChangedStatus::Modified);
        assert_eq!(unstaged[0].status, ChangedStatus::Modified);
    }

    #[test]
    fn deleted_file_is_reported_deleted() {
        let dir = init_repo();
        std::fs::remove_file(dir.path().join("committed.txt")).unwrap();
        let files = changed_files_core(dir.path()).unwrap();
        assert_eq!(files.len(), 1, "{files:?}");
        assert_eq!(files[0].status, ChangedStatus::Deleted);
        assert!(!files[0].staged);
    }

    #[test]
    fn changed_files_works_from_repo_subdirectory() {
        let dir = init_repo();
        let sub = dir.path().join("nested");
        std::fs::create_dir(&sub).unwrap();
        std::fs::write(dir.path().join("committed.txt"), "line1\nCHANGED\n").unwrap();
        // discover() should walk up from the subdir to the repo root.
        let files = changed_files_core(&sub).unwrap();
        assert_eq!(files.len(), 1, "{files:?}");
        assert_eq!(files[0].path, "committed.txt");
    }

    // ── PA.6: hunks ──────────────────────────────────────────────────────────

    /// Count the add / remove lines across all hunks of a FileDiff.
    fn count_lines(fd: &FileDiff) -> (usize, usize) {
        let adds = fd
            .hunks
            .iter()
            .flat_map(|h| &h.lines)
            .filter(|l| l.origin == LineOrigin::Add)
            .count();
        let removes = fd
            .hunks
            .iter()
            .flat_map(|h| &h.lines)
            .filter(|l| l.origin == LineOrigin::Remove)
            .count();
        (adds, removes)
    }

    #[test]
    fn file_hunks_unstaged_modification_has_add_remove_context() {
        let dir = init_repo();
        // committed.txt was "line1\nline2\n"; change line2.
        std::fs::write(dir.path().join("committed.txt"), "line1\nCHANGED\n").unwrap();
        let fd = file_hunks_core(dir.path(), "committed.txt", false).unwrap();
        assert!(!fd.binary);
        assert!(!fd.hunks.is_empty(), "expected at least one hunk: {fd:?}");
        // The hunk header is git's @@ … @@ form.
        assert!(
            fd.hunks[0].header.starts_with("@@"),
            "header was {:?}",
            fd.hunks[0].header
        );
        let (adds, removes) = count_lines(&fd);
        assert_eq!(adds, 1, "one added line (CHANGED): {fd:?}");
        assert_eq!(removes, 1, "one removed line (line2): {fd:?}");
        // The added line's content is "CHANGED", with a new_lineno and no old_lineno.
        let added = fd
            .hunks
            .iter()
            .flat_map(|h| &h.lines)
            .find(|l| l.origin == LineOrigin::Add)
            .unwrap();
        assert!(added.content.contains("CHANGED"));
        assert!(added.new_lineno.is_some() && added.old_lineno.is_none());
    }

    #[test]
    fn file_hunks_staged_side_reads_index_vs_head() {
        let dir = init_repo();
        std::fs::write(dir.path().join("committed.txt"), "line1\nSTAGED\n").unwrap();
        git(dir.path(), &["add", "committed.txt"]);
        let fd = file_hunks_core(dir.path(), "committed.txt", true).unwrap();
        let (adds, removes) = count_lines(&fd);
        assert_eq!(adds, 1, "{fd:?}");
        assert_eq!(removes, 1, "{fd:?}");
        assert!(fd
            .hunks
            .iter()
            .flat_map(|h| &h.lines)
            .any(|l| l.origin == LineOrigin::Add && l.content.contains("STAGED")));
    }

    #[test]
    fn file_hunks_binary_file_is_flagged_not_lined() {
        let dir = init_repo();
        std::fs::write(dir.path().join("bin.dat"), [0u8, 1, 2, 0xff, 0xfe]).unwrap();
        git(dir.path(), &["add", "bin.dat"]);
        git(dir.path(), &["commit", "-q", "-m", "add binary"]);
        // Modify the binary so it shows as a staged change.
        std::fs::write(dir.path().join("bin.dat"), [0u8, 9, 9, 9, 0xff]).unwrap();
        git(dir.path(), &["add", "bin.dat"]);
        let fd = file_hunks_core(dir.path(), "bin.dat", true).unwrap();
        assert!(fd.binary, "binary file should be flagged: {fd:?}");
        assert!(fd.hunks.is_empty(), "binary file has no text hunks: {fd:?}");
    }

    #[test]
    fn file_hunks_untracked_file_shows_all_added() {
        let dir = init_repo();
        std::fs::write(dir.path().join("new.txt"), "alpha\nbeta\n").unwrap();
        let fd = file_hunks_core(dir.path(), "new.txt", false).unwrap();
        let (adds, removes) = count_lines(&fd);
        assert_eq!(adds, 2, "both lines added: {fd:?}");
        assert_eq!(removes, 0, "{fd:?}");
    }

    // ── PA.6: recent commits ─────────────────────────────────────────────────

    /// Add N extra commits on top of init_repo's one, newest = "commit N".
    fn add_commits(dir: &Path, n: usize) {
        for i in 1..=n {
            std::fs::write(dir.join("committed.txt"), format!("v{i}\n")).unwrap();
            git(dir, &["add", "committed.txt"]);
            git(dir, &["commit", "-q", "-m", &format!("commit {i}")]);
        }
    }

    #[test]
    fn recent_commits_newest_first_with_head_marker() {
        let dir = init_repo();
        add_commits(dir.path(), 2); // total 3 commits: initial, commit 1, commit 2
        let commits = recent_commits_core(dir.path(), 0, 10).unwrap();
        assert_eq!(commits.len(), 3, "{commits:?}");
        assert_eq!(commits[0].subject, "commit 2", "newest first");
        assert_eq!(commits[2].subject, "initial");
        // Only the tip is HEAD.
        assert!(commits[0].is_head);
        assert!(!commits[1].is_head && !commits[2].is_head);
        // short_sha is a 7-char prefix of sha.
        assert_eq!(commits[0].short_sha.len(), 7);
        assert!(commits[0].sha.starts_with(&commits[0].short_sha));
        assert_eq!(commits[0].author, "Test");
    }

    #[test]
    fn recent_commits_paginate_disjoint_contiguous() {
        let dir = init_repo();
        add_commits(dir.path(), 4); // 5 commits total
        let page1 = recent_commits_core(dir.path(), 0, 2).unwrap();
        let page2 = recent_commits_core(dir.path(), 2, 2).unwrap();
        assert_eq!(page1.len(), 2);
        assert_eq!(page2.len(), 2);
        // Disjoint: no SHA appears in both pages.
        for c in &page1 {
            assert!(!page2.iter().any(|d| d.sha == c.sha), "pages overlap");
        }
        // Contiguous newest-first ordering across the page boundary.
        assert_eq!(page1[0].subject, "commit 4");
        assert_eq!(page1[1].subject, "commit 3");
        assert_eq!(page2[0].subject, "commit 2");
        assert_eq!(page2[1].subject, "commit 1");
    }

    #[test]
    fn recent_commits_end_of_history_is_short_page() {
        let dir = init_repo(); // 1 commit
        let page = recent_commits_core(dir.path(), 0, 50).unwrap();
        assert_eq!(page.len(), 1, "only one commit exists");
        // Past the end → empty.
        let beyond = recent_commits_core(dir.path(), 5, 50).unwrap();
        assert!(beyond.is_empty());
    }

    #[test]
    fn recent_commits_unborn_head_is_empty_not_error() {
        let dir = TempDir::new().unwrap();
        git(dir.path(), &["init", "-q", "-b", "main"]);
        // No commits yet → unborn HEAD.
        let commits = recent_commits_core(dir.path(), 0, 10).unwrap();
        assert!(commits.is_empty(), "unborn HEAD → empty: {commits:?}");
    }

    // ── PA.6: commit diff ────────────────────────────────────────────────────

    #[test]
    fn commit_diff_vs_parent_shows_that_commits_change() {
        let dir = init_repo();
        add_commits(dir.path(), 1); // "commit 1" changed committed.txt → "v1\n"
        let commits = recent_commits_core(dir.path(), 0, 10).unwrap();
        let tip = &commits[0]; // "commit 1"
        let files = commit_diff_core(dir.path(), &tip.sha).unwrap();
        assert_eq!(files.len(), 1, "{files:?}");
        assert_eq!(files[0].path, "committed.txt");
        let (adds, _removes) = count_lines(&files[0]);
        assert!(adds >= 1, "the v1 line was added: {files:?}");
    }

    #[test]
    fn commit_diff_root_commit_is_all_added_no_panic() {
        let dir = init_repo(); // its single commit IS the root
        let commits = recent_commits_core(dir.path(), 0, 10).unwrap();
        let root = &commits[0];
        let files = commit_diff_core(dir.path(), &root.sha).unwrap();
        // The initial commit added committed.txt against the empty tree.
        assert!(files.iter().any(|f| f.path == "committed.txt"), "{files:?}");
        let cf = files.iter().find(|f| f.path == "committed.txt").unwrap();
        assert_eq!(cf.status, ChangedStatus::Added);
        let (adds, removes) = count_lines(cf);
        assert!(adds >= 1 && removes == 0, "all-added: {cf:?}");
    }

    #[test]
    fn commit_diff_unknown_sha_is_typed_error() {
        let dir = init_repo();
        let result = commit_diff_core(dir.path(), "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
        assert!(
            matches!(result, Err(GitDiffError::BadCommit(_))),
            "got {result:?}"
        );
    }

    #[test]
    fn commit_diff_malformed_sha_is_typed_error() {
        let dir = init_repo();
        let result = commit_diff_core(dir.path(), "not-a-sha");
        assert!(
            matches!(result, Err(GitDiffError::BadCommit(_))),
            "got {result:?}"
        );
    }
}
