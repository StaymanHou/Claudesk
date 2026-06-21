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

/// Walk `root` and return its files as sorted, project-relative POSIX paths.
///
/// Honors `.gitignore` / `.ignore` (via [`ignore::WalkBuilder`]) and excludes the
/// `.git/` directory. Returns **files only** (no directories), each path relative to
/// `root` with `/` separators (the finder displays + matches these). The list is
/// sorted for a deterministic, stable order.
///
/// # Errors
/// [`FsIndexError::BadRoot`] if `root` does not exist or is not a directory.
pub fn walk_index_core(root: &Path) -> Result<Vec<String>, FsIndexError> {
    if !root.is_dir() {
        return Err(FsIndexError::BadRoot {
            root: root.display().to_string(),
            reason: if root.exists() {
                "not a directory".to_string()
            } else {
                "does not exist".to_string()
            },
        });
    }

    let mut files: Vec<String> = Vec::new();
    // gitignore + .ignore + global gitignore honored (defaults). We deliberately
    // turn `hidden` OFF so dotfiles (.gitignore, .prettierignore, .env.example, …)
    // appear in the finder — the operator edits those, and Sublime's Cmd+P shows
    // them. The `.git` metadata dir is the one dotfile we always exclude (gitignore
    // rules don't cover it), via the explicit filter below.
    let walker = ignore::WalkBuilder::new(root)
        .hidden(false)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build();

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            // A per-entry error (e.g. a permission-denied subdir) is skipped rather
            // than failing the whole index — the finder is more useful with a
            // partial list than with nothing. A root-level failure is caught above.
            Err(_) => continue,
        };
        // Directories (incl. the root itself) are not finder candidates.
        let is_file = entry.file_type().is_some_and(|ft| ft.is_file());
        if !is_file {
            continue;
        }
        let Ok(rel) = entry.path().strip_prefix(root) else {
            continue;
        };
        // POSIX separators for display + matching consistency (macOS is already `/`,
        // but normalize so the contract is platform-independent and test-stable).
        let rel_posix = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        if !rel_posix.is_empty() {
            files.push(rel_posix);
        }
    }

    files.sort();
    Ok(files)
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
}
