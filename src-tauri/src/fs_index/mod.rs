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
//! ## .gitignore honoring
//! The walk uses [`ignore::WalkBuilder`] (ripgrep's walker), which honors
//! `.gitignore`, `.ignore`, and the global gitignore by default — so the index is
//! the files the operator actually edits (no `node_modules`, `target/`, build
//! output). The `.git/` directory is excluded explicitly (it isn't matched by
//! gitignore rules). `ignore` is the deliberate choice so WP7's ripgrep-style
//! content search reuses the same walker.
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
/// nodes and files as leaves). Serialized to JSON `{path, is_dir}` across IPC.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct TreeEntry {
    pub path: String,
    pub is_dir: bool,
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

/// The shared `ignore` walker config for both `fs_index` walks: gitignore / `.ignore`
/// / global gitignore honored (defaults), `hidden` OFF so dotfiles (`.gitignore`,
/// `.prettierignore`, `.env.example`, …) appear (the operator edits those; Sublime's
/// Cmd+P shows them), and the `.git` metadata dir always excluded (gitignore rules
/// don't cover it). Both `walk_index_core` (files-only) and `walk_tree_core`
/// (files + dirs) build on this identical exclusion set so the finder and the tree
/// never disagree about what's in the project.
///
/// `pub(crate)` so WP7's `project_search` content search walks the identical file set
/// (same gitignore/`.git`/dotfile contract) — the single biggest reason `ignore` was
/// chosen over a hand-rolled walker (see `Cargo.toml`).
pub(crate) fn project_walker(root: &Path) -> ignore::Walk {
    ignore::WalkBuilder::new(root)
        .hidden(false)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build()
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
/// Honors `.gitignore` / `.ignore` and excludes the `.git/` directory (see
/// [`project_walker`]). Returns **files only** (no directories) — the Cmd+P finder
/// matches over filenames. Sorted for a deterministic, stable order.
///
/// # Errors
/// [`FsIndexError::BadRoot`] if `root` does not exist or is not a directory.
pub fn walk_index_core(root: &Path) -> Result<Vec<String>, FsIndexError> {
    check_root(root)?;

    let mut files: Vec<String> = Vec::new();
    for result in project_walker(root) {
        // A per-entry error (e.g. a permission-denied subdir) is skipped rather than
        // failing the whole index — the finder is more useful with a partial list
        // than with nothing. A root-level failure is caught by check_root above.
        let Ok(entry) = result else { continue };
        // Directories (incl. the root itself) are not finder candidates.
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        if let Some(s) = rel_posix(root, entry.path()) {
            files.push(s);
        }
    }

    files.sort();
    Ok(files)
}

/// Walk `root` and return **both files and directories** as sorted [`TreeEntry`]s
/// (each tagged `is_dir`), for WP10's file-tree navigator.
///
/// Same exclusion rules as [`walk_index_core`] (shared [`project_walker`]: gitignore
/// honored, `.git/` excluded, dotfiles shown) — so the tree and the Cmd+P finder
/// agree about the project's contents. Unlike `walk_index_core` this EMITS directory
/// entries too (including empty dirs), so the frontend can build a full tree. The
/// root entry itself is skipped. Sorted by path for a deterministic order; the
/// frontend nests the flat list into a tree.
///
/// # Errors
/// [`FsIndexError::BadRoot`] if `root` does not exist or is not a directory.
pub fn walk_tree_core(root: &Path) -> Result<Vec<TreeEntry>, FsIndexError> {
    check_root(root)?;

    let mut entries: Vec<TreeEntry> = Vec::new();
    for result in project_walker(root) {
        let Ok(entry) = result else { continue };
        let Some(ft) = entry.file_type() else {
            continue;
        };
        // Keep files and dirs; skip anything that's neither (e.g. a symlink the
        // walker didn't follow). The root entry has an empty relative path and is
        // dropped by rel_posix.
        let is_dir = ft.is_dir();
        if !is_dir && !ft.is_file() {
            continue;
        }
        if let Some(path) = rel_posix(root, entry.path()) {
            entries.push(TreeEntry { path, is_dir });
        }
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Build a small project tree under a TempDir and return it.
    /// Layout:
    ///   src/main.rs
    ///   src/lib.rs
    ///   README.md
    ///   ignored_dir/junk.txt   (gitignored)
    ///   secret.txt             (gitignored)
    ///   .git/config            (always excluded)
    ///   .gitignore             (lists ignored_dir/ and secret.txt)
    fn fixture() -> TempDir {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("src")).unwrap();
        fs::write(root.join("src/main.rs"), "fn main() {}").unwrap();
        fs::write(root.join("src/lib.rs"), "pub fn x() {}").unwrap();
        fs::write(root.join("README.md"), "# readme").unwrap();
        fs::create_dir(root.join("ignored_dir")).unwrap();
        fs::write(root.join("ignored_dir/junk.txt"), "junk").unwrap();
        fs::write(root.join("secret.txt"), "shh").unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".git/config"), "[core]").unwrap();
        fs::write(root.join(".gitignore"), "ignored_dir/\nsecret.txt\n").unwrap();
        dir
    }

    #[test]
    fn gitignored_entries_are_excluded() {
        let dir = fixture();
        let files = walk_index_core(dir.path()).unwrap();
        assert!(
            !files.iter().any(|f| f.contains("ignored_dir")),
            "{files:?}"
        );
        assert!(!files.iter().any(|f| f == "secret.txt"), "{files:?}");
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
        // The .gitignore itself is a real file and not ignored → it shows up.
        assert!(files.contains(&"README.md".to_string()), "{files:?}");
        assert!(files.contains(&"src/main.rs".to_string()), "{files:?}");
        assert!(files.contains(&"src/lib.rs".to_string()), "{files:?}");
        assert!(files.contains(&".gitignore".to_string()), "{files:?}");
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
    fn tree_honors_gitignore_and_excludes_git_dir() {
        let dir = fixture();
        let tree = walk_tree_core(dir.path()).unwrap();
        assert!(
            !tree.iter().any(|e| e.path.contains("ignored_dir")),
            "gitignored dir must be absent: {tree:?}"
        );
        assert!(
            !tree.iter().any(|e| e.path == "secret.txt"),
            "gitignored file must be absent: {tree:?}"
        );
        assert!(
            !tree
                .iter()
                .any(|e| e.path == ".git" || e.path.starts_with(".git/")),
            "the .git dir must never appear: {tree:?}"
        );
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
