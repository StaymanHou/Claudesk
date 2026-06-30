//! File index — the gitignore-honoring file list backing the Cmd+P fuzzy finder.
//!
//! Backs the Milestone-2 file finder (WP6). The finder needs the set of files in a
//! workspace's project dir to fuzzy-match against; this module walks that dir and
//! returns the list. It is **app-layer** infrastructure, not an editor feature —
//! CodeMirror edits a *document*, it does not index a *project* (the load-bearing
//! `research.md` scoping correction). The React overlay does the fuzzy match +
//! render; this module only supplies the candidate file list.
//!
//! ## Layout (mirrors [`crate::editor_fs`])
//! - **Pure core** ([`walk_index_core`]) takes an injected `root: &Path`, so it is
//!   unit-testable against a `TempDir` with no Tauri runtime.
//! - **Tauri command wrapper** ([`commands`]) is the only IPC surface; it maps
//!   [`FsIndexError`] to a `String`.
//!
//! ## Exclusion model — heavy-dir, NOT gitignore (M6 WP6 re-base)
//! The walk is a **manual DFS `read_dir`** ([`walk_project`]) with **gitignore not
//! honored at all** (the prior `ignore::WalkBuilder` was dropped — its `filter_entry`
//! can't yield-a-dir-row-but-skip-descent, the exact control a pruned heavy dir needs).
//! Gitignore was previously used as a proxy for "noise," but it's a leaky proxy: it
//! correctly hides heavy generated dirs (`node_modules/`, `target/`) yet ALSO hides
//! files the operator genuinely interacts with — `.env` (edit), `.session.md`
//! (presence + read), `.claude/*` (read). M6 WP6 re-bases the exclusion criterion from
//! "is gitignored" to "is a heavy/generated dir" — the thing gitignore was only ever a
//! proxy for. A directory is heavy iff it matches [`HEAVY_DIR_NAMES`] (a closed, universal
//! build-tooling name set) OR is *detected big* (its immediate child count exceeds
//! [`HEAVY_DIR_CHILD_THRESHOLD`] on a shallow `read_dir`). Heavy dirs are **listed as a
//! row but not descended into** (presence at ~zero cost); every other path — including
//! gitignored config — is shown. The `.git/` directory is still excluded explicitly (it
//! isn't a heavy dir by name, but its churn is never useful). **Symlinks are also skipped**
//! (an entry that is neither a file nor a dir is not emitted) — cycle-safe, but a symlinked
//! source dir an operator edits is silently invisible to tree/finder/search. The content search
//! ([`crate::project_search`]) and the fs watcher ([`crate::fs_watch`]) share this same
//! heavy-dir basis so tree / finder / search / watcher never disagree on visibility.
//!
//! ## Errors are surfaced, never swallowed
//! A non-existent or unreadable root returns a typed [`FsIndexError`] that the
//! command maps to a `String` for the UI — the finder shows the error rather than a
//! silently-empty list (the WP6 picker IPC error-surfacing lesson). An *empty* dir
//! is a legitimate empty list, distinct from an error.

pub mod commands;

use std::path::Path;

use serde::Serialize;
use thiserror::Error;

/// Errors from building the file index. IPC-facing wrappers map this to a `String`.
///
/// Only a *root-level* failure (missing/non-directory root) is an error — that's the
/// case the finder must surface instead of showing an empty list. Per-entry walk
/// failures (e.g. a permission-denied subdir) are skipped inside [`walk_index_core`]
/// so a partial index is still returned; they don't bubble up as this error.
#[derive(Debug, Error)]
pub enum FsIndexError {
    /// The workspace root does not exist or is not a directory.
    #[error("workspace root {root} is not a readable directory: {reason}")]
    BadRoot { root: String, reason: String },
}

/// One entry in the file-tree walk: a project-relative POSIX path plus whether it is
/// a directory (WP10's `FileTree` nests these into a tree, with dirs as collapsible
/// nodes and files as leaves). Serialized to JSON `{path, is_dir, pruned}` across IPC.
///
/// `pruned` (M6 WP6) is true iff this is a **heavy dir** (name-matched or detected-big)
/// whose contents were NOT walked — the FileTree renders it as a leaf-like "not indexed"
/// row so a genuinely-empty dir is distinguishable from a pruned heavy dir.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct TreeEntry {
    pub path: String,
    pub is_dir: bool,
    pub pruned: bool,
}

/// Reject a root that is not a readable directory (the surfaced-not-swallowed error
/// case shared by both walks). On success the caller proceeds to walk.
///
/// `pub(crate)` so sibling app-layer modules reuse the one root-validation contract
/// rather than forking it — WP7's `project_search` walks the same way the finder and
/// tree do (gitignore on, `.git/` excluded), so search/Cmd+P/tree never disagree
/// about what's in the project.
pub(crate) fn check_root(root: &Path) -> Result<(), FsIndexError> {
    if root.is_dir() {
        return Ok(());
    }
    Err(FsIndexError::BadRoot {
        root: root.display().to_string(),
        reason: if root.exists() {
            "not a directory".to_string()
        } else {
            "does not exist".to_string()
        },
    })
}

/// Closed, universal set of generated/dependency directory NAMES that are "heavy" —
/// always pruned (listed as a row but not descended into) regardless of size. This is
/// deliberately a list of *project-agnostic build-tooling facts*, NOT a list of "files
/// the operator wants" (that personal/open-ended allowlist was explicitly rejected at
/// WP6 plan time — it re-encodes the wrong-proxy mistake at finer grain). New names are
/// safe to add; they only ever *stop descent*, never hide a hand-authored file.
pub(crate) const HEAVY_DIR_NAMES: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".parcel-cache",
    "coverage",
    "venv",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".gradle",
    "vendor",
];

/// A directory whose immediate-child count exceeds this is "detected big" and pruned
/// even if its name isn't in [`HEAVY_DIR_NAMES`] — the project-specific long-tail guard
/// (operator: "this + detected big dirs"). 500 is comfortably above any hand-authored
/// source dir's direct-child count yet well below a dependency/cache dir's top level.
/// The check is SHALLOW (immediate children only) so it costs ~one `read_dir`, never a
/// recursive count.
///
/// Cost note: this detected-big check runs an extra `read_dir` on every non-name-matched
/// directory during the walk (doubling directory-open syscalls vs. the walk's own), but
/// it's short-circuited at threshold+1 children (`.take(THRESHOLD + 1)`) — acceptable for
/// the single-user target.
pub(crate) const HEAVY_DIR_CHILD_THRESHOLD: usize = 500;

/// Whether a directory base name is a known-heavy generated/dependency dir (pure; the
/// name-based half of the heavy-dir predicate).
pub(crate) fn is_heavy_dir_name(name: &str) -> bool {
    HEAVY_DIR_NAMES.contains(&name)
}

/// Whether `dir` (an absolute path to a directory) is "heavy" and should be pruned:
/// its base name is in [`HEAVY_DIR_NAMES`], OR a shallow `read_dir` shows more than
/// [`HEAVY_DIR_CHILD_THRESHOLD`] immediate children. A `read_dir` error (permissions,
/// race) → NOT heavy, so we never over-prune a dir we merely failed to stat.
///
/// `pub(crate)` so the watcher and search share the identical heaviness notion.
pub(crate) fn dir_is_heavy(dir: &Path) -> bool {
    if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
        if is_heavy_dir_name(name) {
            return true;
        }
    }
    // Detected-big: count immediate children only (shallow). Short-circuit as soon as
    // we pass the threshold so a genuinely-huge dir doesn't pay a full enumeration.
    match std::fs::read_dir(dir) {
        Ok(rd) => rd.take(HEAVY_DIR_CHILD_THRESHOLD + 1).count() > HEAVY_DIR_CHILD_THRESHOLD,
        Err(_) => false,
    }
}

/// One walked entry: its absolute path + project-relative POSIX path + whether it is a
/// directory + whether it is a *pruned heavy dir* (listed-but-not-descended). The shared
/// output of [`walk_project`]; the public walk functions + `project_search` project this
/// down to their own shape.
pub(crate) struct WalkedEntry {
    /// Absolute path on disk (so `project_search` can read file contents directly).
    pub abs: std::path::PathBuf,
    pub rel: String,
    pub is_dir: bool,
    /// True iff this is a heavy dir whose contents were NOT walked (it's a leaf row).
    pub pruned: bool,
}

/// The shared project walk (M6 WP6). **Gitignore honoring is fully DISABLED** — only the
/// heavy-dir predicate + the `.git` exclusion govern visibility, so gitignored-but-edited
/// files (`.env`, `.session.md`, `.claude/*`) are shown. A **heavy dir** (name in
/// [`HEAVY_DIR_NAMES`] or detected-big via [`dir_is_heavy`]) is YIELDED as its own row but
/// its contents are NOT descended into (presence at ~one `read_dir` cost). The `.git`
/// metadata dir is excluded entirely.
///
/// Manual DFS (not `ignore::Walk`'s own descent) because `ignore` 0.4's `filter_entry`
/// returning false skips a dir's OWN row too — but we need "yield the row, skip the
/// subtree." A plain `read_dir` walk gives that exact descent control: `.git` + heavy-dir
/// skipping live inline here, the `ignore` crate is not involved. Per-entry IO errors are
/// skipped (a partial listing beats nothing); the root must already be validated by
/// [`check_root`].
///
/// Entries are returned in arbitrary order; callers sort. `pub(crate)` so `project_search`
/// shares the identical traversal (heavy-dir/`.git`/dotfile contract) — search/Cmd+P/tree
/// never disagree.
pub(crate) fn walk_project(root: &Path) -> Vec<WalkedEntry> {
    let mut out: Vec<WalkedEntry> = Vec::new();
    // DFS stack of directories left to descend into (absolute paths). The root is
    // descended but never emitted as a row (rel_posix drops the empty rel path).
    let mut stack: Vec<std::path::PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            // Permission-denied / vanished subdir: skip it, keep the partial listing.
            continue;
        };
        for entry in rd.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            // The .git metadata dir is excluded entirely (no row, no descent).
            if name.as_os_str() == ".git" {
                continue;
            }
            let Ok(ft) = entry.file_type() else { continue };
            let is_dir = ft.is_dir();
            // Skip anything that's neither a file nor a dir (e.g. an unfollowed symlink).
            if !is_dir && !ft.is_file() {
                continue;
            }
            let Some(rel) = rel_posix(root, &path) else {
                continue;
            };
            if is_dir {
                let pruned = dir_is_heavy(&path);
                out.push(WalkedEntry {
                    abs: path.clone(),
                    rel,
                    is_dir: true,
                    pruned,
                });
                if !pruned {
                    // Descend only into non-heavy dirs.
                    stack.push(path);
                }
            } else {
                out.push(WalkedEntry {
                    abs: path,
                    rel,
                    is_dir: false,
                    pruned: false,
                });
            }
        }
    }
    out
}

/// Convert an absolute walk entry path to a project-relative POSIX string, or `None`
/// if it is the root itself (empty relative path) or escapes `root`.
///
/// `pub(crate)` so sibling modules (WP7 `project_search`) report match locations with
/// the same project-relative POSIX paths the finder and tree use.
pub(crate) fn rel_posix(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    // POSIX separators for display consistency (macOS is already `/`, but normalize
    // so the contract is platform-independent and test-stable).
    let s = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Walk `root` and return its files as sorted, project-relative POSIX paths.
///
/// Heavy-dir re-base (see [`walk_project`]): gitignore is NOT honored — every file is a
/// candidate EXCEPT those under a pruned heavy dir (`node_modules/`, `target/`, …, or a
/// detected-big dir), which are never descended into; `.git/` is excluded. Returns
/// **files only** (no directories) — the Cmd+P finder matches over filenames. Sorted for
/// a deterministic, stable order.
///
/// # Errors
/// [`FsIndexError::BadRoot`] if `root` does not exist or is not a directory.
pub fn walk_index_core(root: &Path) -> Result<Vec<String>, FsIndexError> {
    check_root(root)?;

    let mut files: Vec<String> = walk_project(root)
        .into_iter()
        // Directories (incl. heavy-dir rows) are not finder candidates; files only.
        .filter(|e| !e.is_dir)
        .map(|e| e.rel)
        .collect();

    files.sort();
    Ok(files)
}

/// Walk `root` and return **both files and directories** as sorted [`TreeEntry`]s
/// (each tagged `is_dir` + `pruned`), for the file-tree navigator.
///
/// Same exclusion rules as [`walk_index_core`] (shared [`walk_project`]: gitignore NOT
/// honored, heavy dirs pruned-but-listed, `.git/` excluded, dotfiles shown) — so the
/// tree, the Cmd+P finder, and search agree about the project's contents. Unlike
/// `walk_index_core` this EMITS directory entries too (including empty dirs and pruned
/// heavy-dir rows), so the frontend can build a full tree. The root entry itself is
/// skipped. Sorted by path for a deterministic order; the frontend nests the flat list.
///
/// # Errors
/// [`FsIndexError::BadRoot`] if `root` does not exist or is not a directory.
pub fn walk_tree_core(root: &Path) -> Result<Vec<TreeEntry>, FsIndexError> {
    check_root(root)?;

    let mut entries: Vec<TreeEntry> = walk_project(root)
        .into_iter()
        .map(|e| TreeEntry {
            path: e.rel,
            is_dir: e.is_dir,
            pruned: e.pruned,
        })
        .collect();

    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Build a small project tree under a TempDir and return it.
    /// Layout (M6 WP6 heavy-dir re-base):
    ///   src/main.rs
    ///   src/lib.rs
    ///   README.md
    ///   .env                   (gitignored, but EDITABLE → must be shown)
    ///   .session.md            (gitignored, but READ/PRESENCE → must be shown)
    ///   secret.txt             (gitignored → must STILL be shown under the new policy)
    ///   node_modules/dep.js    (heavy dir by NAME → row shown, contents pruned)
    ///   target/debug/bin       (heavy dir by NAME → row shown, contents pruned)
    ///   .git/config            (always excluded)
    ///   .gitignore             (lists .env, .session.md, secret.txt, node_modules/, target/)
    fn fixture() -> TempDir {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("src")).unwrap();
        fs::write(root.join("src/main.rs"), "fn main() {}").unwrap();
        fs::write(root.join("src/lib.rs"), "pub fn x() {}").unwrap();
        fs::write(root.join("README.md"), "# readme").unwrap();
        fs::write(root.join(".env"), "SECRET=1").unwrap();
        fs::write(root.join(".session.md"), "# session").unwrap();
        fs::write(root.join("secret.txt"), "shh").unwrap();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules/dep.js"), "module.exports={}").unwrap();
        fs::create_dir_all(root.join("target/debug")).unwrap();
        fs::write(root.join("target/debug/bin"), "ELF").unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".git/config"), "[core]").unwrap();
        fs::write(
            root.join(".gitignore"),
            ".env\n.session.md\nsecret.txt\nnode_modules/\ntarget/\n",
        )
        .unwrap();
        dir
    }

    #[test]
    fn gitignored_editable_files_are_now_shown() {
        // The whole point of WP6: gitignored-but-edited files are reachable.
        let dir = fixture();
        let files = walk_index_core(dir.path()).unwrap();
        assert!(files.contains(&".env".to_string()), "{files:?}");
        assert!(files.contains(&".session.md".to_string()), "{files:?}");
        assert!(files.contains(&"secret.txt".to_string()), "{files:?}");
    }

    #[test]
    fn heavy_dir_contents_are_pruned_but_files_outside_are_kept() {
        // Heavy dirs (by name) are NOT descended into — their contents are absent from
        // the file index, while everything else (incl. gitignored config) is present.
        let dir = fixture();
        let files = walk_index_core(dir.path()).unwrap();
        assert!(
            !files.iter().any(|f| f.starts_with("node_modules/")),
            "node_modules contents must be pruned: {files:?}"
        );
        assert!(
            !files.iter().any(|f| f.starts_with("target/")),
            "target contents must be pruned: {files:?}"
        );
        // But the non-heavy files are all there.
        assert!(files.contains(&"src/main.rs".to_string()), "{files:?}");
        assert!(files.contains(&".env".to_string()), "{files:?}");
    }

    #[test]
    fn git_metadata_dir_is_excluded() {
        let dir = fixture();
        let files = walk_index_core(dir.path()).unwrap();
        assert!(
            !files.iter().any(|f| f.starts_with(".git/")),
            "the .git dir must never appear in the index: {files:?}"
        );
    }

    #[test]
    fn kept_files_present_with_relative_posix_paths() {
        let dir = fixture();
        let files = walk_index_core(dir.path()).unwrap();
        // The .gitignore itself is a real file → it shows up.
        assert!(files.contains(&"README.md".to_string()), "{files:?}");
        assert!(files.contains(&"src/main.rs".to_string()), "{files:?}");
        assert!(files.contains(&"src/lib.rs".to_string()), "{files:?}");
        assert!(files.contains(&".gitignore".to_string()), "{files:?}");
    }

    // ── heavy-dir predicate (the pure half) ─────────────────────────────────

    #[test]
    fn heavy_dir_name_predicate() {
        assert!(is_heavy_dir_name("node_modules"));
        assert!(is_heavy_dir_name("target"));
        assert!(is_heavy_dir_name("__pycache__"));
        assert!(!is_heavy_dir_name("src"));
        assert!(!is_heavy_dir_name(".claude"));
        assert!(!is_heavy_dir_name(".env"));
    }

    #[test]
    fn dir_is_heavy_by_name_regardless_of_size() {
        let dir = TempDir::new().unwrap();
        let nm = dir.path().join("node_modules");
        fs::create_dir(&nm).unwrap();
        // Empty node_modules is still heavy (name match short-circuits the size check).
        assert!(dir_is_heavy(&nm));
    }

    #[test]
    fn dir_is_heavy_when_detected_big() {
        let dir = TempDir::new().unwrap();
        let big = dir.path().join("bigdir");
        fs::create_dir(&big).unwrap();
        // One over the threshold of immediate children → detected big.
        for i in 0..(HEAVY_DIR_CHILD_THRESHOLD + 1) {
            fs::write(big.join(format!("f{i}.txt")), "x").unwrap();
        }
        assert!(dir_is_heavy(&big));
    }

    #[test]
    fn dir_not_heavy_under_threshold_unknown_name() {
        let dir = TempDir::new().unwrap();
        let small = dir.path().join("mysrc");
        fs::create_dir(&small).unwrap();
        for i in 0..5 {
            fs::write(small.join(format!("f{i}.txt")), "x").unwrap();
        }
        assert!(!dir_is_heavy(&small));
    }

    #[test]
    fn detected_big_dir_is_pruned_in_walk() {
        // A non-name-matched but huge dir is listed as a row but not descended.
        let dir = TempDir::new().unwrap();
        let big = dir.path().join("generated");
        fs::create_dir(&big).unwrap();
        for i in 0..(HEAVY_DIR_CHILD_THRESHOLD + 1) {
            fs::write(big.join(format!("f{i}.txt")), "x").unwrap();
        }
        fs::write(dir.path().join("keep.txt"), "k").unwrap();
        let tree = walk_tree_core(dir.path()).unwrap();
        // The dir row is present and marked pruned; its contents are absent.
        let row = tree.iter().find(|e| e.path == "generated").unwrap();
        assert!(row.is_dir && row.pruned, "{tree:?}");
        assert!(
            !tree.iter().any(|e| e.path.starts_with("generated/")),
            "detected-big dir contents must be pruned: {tree:?}"
        );
        assert!(tree.iter().any(|e| e.path == "keep.txt"), "{tree:?}");
    }

    #[test]
    fn nested_file_uses_slash_separator_relative_to_root() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("a/b/c")).unwrap();
        fs::write(dir.path().join("a/b/c/deep.txt"), "x").unwrap();
        let files = walk_index_core(dir.path()).unwrap();
        assert_eq!(files, vec!["a/b/c/deep.txt".to_string()]);
    }

    #[test]
    fn result_is_sorted_deterministically() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("zebra.txt"), "z").unwrap();
        fs::write(dir.path().join("alpha.txt"), "a").unwrap();
        fs::write(dir.path().join("mid.txt"), "m").unwrap();
        let files = walk_index_core(dir.path()).unwrap();
        assert_eq!(
            files,
            vec![
                "alpha.txt".to_string(),
                "mid.txt".to_string(),
                "zebra.txt".to_string()
            ]
        );
    }

    #[test]
    fn directories_are_not_listed_only_files() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("emptydir")).unwrap();
        fs::write(dir.path().join("file.txt"), "x").unwrap();
        let files = walk_index_core(dir.path()).unwrap();
        assert_eq!(files, vec!["file.txt".to_string()]);
    }

    #[test]
    fn empty_dir_is_empty_list_not_error() {
        let dir = TempDir::new().unwrap();
        let files = walk_index_core(dir.path()).unwrap();
        assert!(files.is_empty(), "{files:?}");
    }

    #[test]
    fn nonexistent_root_is_typed_error_not_empty_list() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("no-such-subdir");
        let result = walk_index_core(&missing);
        assert!(
            matches!(result, Err(FsIndexError::BadRoot { .. })),
            "a missing root must surface as an error, never a silently-empty list: {result:?}"
        );
    }

    #[test]
    fn file_as_root_is_bad_root_error() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("notadir.txt");
        fs::write(&file, "x").unwrap();
        let result = walk_index_core(&file);
        assert!(
            matches!(result, Err(FsIndexError::BadRoot { .. })),
            "{result:?}"
        );
    }

    // ── walk_tree_core (WP10) ───────────────────────────────────────────────

    /// Look up an entry by path in a tree result; panics if absent.
    fn find<'a>(entries: &'a [TreeEntry], path: &str) -> &'a TreeEntry {
        entries
            .iter()
            .find(|e| e.path == path)
            .unwrap_or_else(|| panic!("expected {path} in {entries:?}"))
    }

    #[test]
    fn tree_includes_both_files_and_directories_tagged() {
        let dir = fixture();
        let tree = walk_tree_core(dir.path()).unwrap();
        // The `src` directory is present and tagged is_dir.
        assert!(find(&tree, "src").is_dir, "{tree:?}");
        // Files under it are present and tagged NOT is_dir.
        assert!(!find(&tree, "src/main.rs").is_dir, "{tree:?}");
        assert!(!find(&tree, "README.md").is_dir, "{tree:?}");
    }

    #[test]
    fn tree_includes_empty_directories() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("emptydir")).unwrap();
        fs::write(dir.path().join("file.txt"), "x").unwrap();
        let tree = walk_tree_core(dir.path()).unwrap();
        // The empty dir IS in the tree (this is why WP10 chose dirs-included over
        // building the tree from the files-only fs_index list).
        assert!(find(&tree, "emptydir").is_dir, "{tree:?}");
        assert!(!find(&tree, "file.txt").is_dir, "{tree:?}");
    }

    #[test]
    fn tree_shows_gitignored_prunes_heavy_excludes_git_dir() {
        // M6 WP6: gitignored-but-edited files are now SHOWN; heavy dirs are listed as a
        // row (marked pruned) but their contents are NOT walked; .git is fully excluded.
        let dir = fixture();
        let tree = walk_tree_core(dir.path()).unwrap();
        // Gitignored config files are present (the re-base's whole point).
        assert!(tree.iter().any(|e| e.path == ".env"), "{tree:?}");
        assert!(tree.iter().any(|e| e.path == ".session.md"), "{tree:?}");
        assert!(tree.iter().any(|e| e.path == "secret.txt"), "{tree:?}");
        // Heavy dirs: the dir ROW is present and marked pruned; contents are absent.
        let nm = find(&tree, "node_modules");
        assert!(nm.is_dir && nm.pruned, "{tree:?}");
        assert!(
            !tree.iter().any(|e| e.path.starts_with("node_modules/")),
            "node_modules contents must be pruned: {tree:?}"
        );
        let tgt = find(&tree, "target");
        assert!(tgt.is_dir && tgt.pruned, "{tree:?}");
        assert!(
            !tree.iter().any(|e| e.path.starts_with("target/")),
            "target contents must be pruned: {tree:?}"
        );
        // .git is fully excluded (no row, no contents).
        assert!(
            !tree
                .iter()
                .any(|e| e.path == ".git" || e.path.starts_with(".git/")),
            "the .git dir must never appear: {tree:?}"
        );
        // A normal dir is NOT marked pruned.
        assert!(!find(&tree, "src").pruned, "{tree:?}");
    }

    #[test]
    fn tree_shows_dotfiles() {
        let dir = fixture();
        let tree = walk_tree_core(dir.path()).unwrap();
        // Dotfiles appear (hidden(false)) — same rule as the finder.
        assert!(!find(&tree, ".gitignore").is_dir, "{tree:?}");
    }

    #[test]
    fn tree_is_sorted_by_path() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("zdir")).unwrap();
        fs::write(dir.path().join("zdir/inner.txt"), "i").unwrap();
        fs::write(dir.path().join("alpha.txt"), "a").unwrap();
        let tree = walk_tree_core(dir.path()).unwrap();
        let paths: Vec<&str> = tree.iter().map(|e| e.path.as_str()).collect();
        let mut sorted = paths.clone();
        sorted.sort_unstable();
        assert_eq!(paths, sorted, "tree must be sorted by path: {tree:?}");
    }

    #[test]
    fn tree_uses_relative_posix_paths_and_skips_root() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("a/b")).unwrap();
        fs::write(dir.path().join("a/b/deep.txt"), "x").unwrap();
        let tree = walk_tree_core(dir.path()).unwrap();
        let paths: Vec<&str> = tree.iter().map(|e| e.path.as_str()).collect();
        // The root entry (empty relative path) is skipped; nested entries use '/'.
        assert_eq!(paths, vec!["a", "a/b", "a/b/deep.txt"]);
        assert!(find(&tree, "a").is_dir && find(&tree, "a/b").is_dir);
        assert!(!find(&tree, "a/b/deep.txt").is_dir);
    }

    #[test]
    fn tree_empty_dir_is_empty_list_not_error() {
        let dir = TempDir::new().unwrap();
        let tree = walk_tree_core(dir.path()).unwrap();
        assert!(tree.is_empty(), "{tree:?}");
    }

    #[test]
    fn tree_nonexistent_root_is_typed_error() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("no-such-subdir");
        let result = walk_tree_core(&missing);
        assert!(
            matches!(result, Err(FsIndexError::BadRoot { .. })),
            "a missing root must surface as an error, not an empty tree: {result:?}"
        );
    }
}
