//! Editor file IO — read/write a file inside a workspace's project directory.
//!
//! Backs the Milestone-2 lite editor (WP2). The editor opens and saves files that
//! live under a workspace's project root; this module is the only filesystem path
//! for that. We use a dedicated Rust module rather than `tauri-plugin-fs` so the
//! IO follows the repo's `command → pure-fn → typed-error → String` convention
//! (cf. [`crate::config_store`]) and so every failure is surfaced explicitly
//! across IPC (the WP6/WP7 error-surfacing lesson) instead of swallowed.
//!
//! ## Layout
//! - **Pure core** ([`read_file_core`], [`write_file_core`]) takes an injected
//!   `root: &Path` (the workspace project dir) plus the requested file path, so it
//!   is unit-testable against a `TempDir` with no Tauri runtime.
//! - **Tauri command wrappers** ([`commands`]) are the only IPC surface; they map
//!   [`EditorFsError`] to a `String`.
//!
//! ## Safety: the workspace-root guard
//! Both operations confine the target to `root`. A path that escapes the
//! workspace (via `..`, an absolute path elsewhere, or a symlink pointing out) is
//! rejected with [`EditorFsError::OutsideWorkspace`]. The editor only ever edits
//! files belonging to the open project; this guard makes that an invariant, not a
//! convention, so a malformed or hostile path can't read/write arbitrary disk.
//!
//! ## Durability
//! Writes are atomic: `contents → <file>.tmp → fs::rename`, matching
//! [`crate::config_store`]. A crash mid-write leaves the existing file untouched.

pub mod commands;

use std::path::{Path, PathBuf};

use thiserror::Error;

/// Errors from editor file IO. IPC-facing wrappers map this to a `String`.
#[derive(Debug, Error)]
pub enum EditorFsError {
    #[error("file I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("file is not valid UTF-8 text: {0}")]
    NotUtf8(String),
    #[error("path {requested} is outside the workspace root {root}")]
    OutsideWorkspace { requested: String, root: String },
}

/// Resolve `requested` against `root` and confirm the result stays inside `root`.
///
/// Returns the path to operate on (absolute). The containment check is the
/// security boundary: we canonicalize `root` (it must exist) and the *parent* of
/// the resolved target (for a not-yet-existing file on write, the file itself may
/// not exist but its directory must), then assert the resolved target's directory
/// is `root` or a descendant. Canonicalizing resolves `..` and symlinks, so a
/// symlink inside `root` that points outside is also rejected.
fn resolve_within(root: &Path, requested: &Path) -> Result<PathBuf, EditorFsError> {
    let root_canon = root.canonicalize().map_err(|e| {
        EditorFsError::Io(std::io::Error::new(e.kind(), format!("root {root:?}: {e}")))
    })?;

    // The absolute target before canonicalization: absolute requested paths are
    // honored as-is; relative ones join onto root.
    let joined = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        root_canon.join(requested)
    };

    // Canonicalize the directory that will hold the file (it must exist for both
    // read and write — write to a missing dir is an error anyway). The filename
    // is re-attached afterwards so a not-yet-existing file is allowed on write.
    let file_name = joined
        .file_name()
        .ok_or_else(|| EditorFsError::OutsideWorkspace {
            requested: requested.display().to_string(),
            root: root.display().to_string(),
        })?;
    let parent = joined.parent().unwrap_or(&root_canon);
    let parent_canon = parent.canonicalize().map_err(|e| {
        EditorFsError::Io(std::io::Error::new(
            e.kind(),
            format!("parent dir {parent:?}: {e}"),
        ))
    })?;

    if !parent_canon.starts_with(&root_canon) {
        return Err(EditorFsError::OutsideWorkspace {
            requested: requested.display().to_string(),
            root: root.display().to_string(),
        });
    }
    Ok(parent_canon.join(file_name))
}

/// Read a UTF-8 text file under `root`. Rejects paths escaping the workspace and
/// non-UTF-8 (binary) content with typed errors.
pub fn read_file_core(root: &Path, requested: &Path) -> Result<String, EditorFsError> {
    let target = resolve_within(root, requested)?;
    let bytes = std::fs::read(&target)?;
    String::from_utf8(bytes)
        .map_err(|e| EditorFsError::NotUtf8(format!("{} ({e})", target.display())))
}

/// Atomically write `contents` to a file under `root`: write `<file>.tmp` then
/// `rename` over the target. Rejects paths escaping the workspace. The target's
/// parent directory must already exist.
pub fn write_file_core(root: &Path, requested: &Path, contents: &str) -> Result<(), EditorFsError> {
    let target = resolve_within(root, requested)?;
    let mut tmp = target.clone().into_os_string();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, contents.as_bytes())?;
    std::fs::rename(&tmp, &target)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn read_ok_returns_contents() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("hello.txt"), "hi there").unwrap();
        let out = read_file_core(dir.path(), Path::new("hello.txt")).unwrap();
        assert_eq!(out, "hi there");
    }

    #[test]
    fn read_missing_file_is_io_error() {
        let dir = TempDir::new().unwrap();
        let result = read_file_core(dir.path(), Path::new("nope.txt"));
        assert!(matches!(result, Err(EditorFsError::Io(_))));
    }

    #[test]
    fn read_non_utf8_is_typed_error_not_lossy() {
        let dir = TempDir::new().unwrap();
        // Invalid UTF-8 byte sequence (0xff is never valid in UTF-8).
        std::fs::write(dir.path().join("bin.dat"), [0xff, 0xfe, 0x00, 0x01]).unwrap();
        let result = read_file_core(dir.path(), Path::new("bin.dat"));
        assert!(matches!(result, Err(EditorFsError::NotUtf8(_))));
    }

    #[test]
    fn read_path_escaping_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        // Create a sibling file outside the workspace root.
        let outside = dir.path().parent().unwrap().join("outside-secret.txt");
        std::fs::write(&outside, "secret").unwrap();
        // A workspace rooted at dir/ws; try to climb out with ..
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        let result = read_file_core(&ws, Path::new("../outside-secret.txt"));
        assert!(
            matches!(result, Err(EditorFsError::OutsideWorkspace { .. })),
            "got {result:?}"
        );
        let _ = std::fs::remove_file(outside);
    }

    #[test]
    fn read_absolute_path_outside_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        let other = TempDir::new().unwrap();
        std::fs::write(other.path().join("elsewhere.txt"), "x").unwrap();
        let result = read_file_core(dir.path(), &other.path().join("elsewhere.txt"));
        assert!(matches!(
            result,
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
    }

    #[test]
    fn read_absolute_path_inside_root_is_allowed() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("in.txt"), "inside").unwrap();
        // canonicalize the root so the absolute path matches post-canonicalization.
        let canon = dir.path().canonicalize().unwrap();
        let out = read_file_core(dir.path(), &canon.join("in.txt")).unwrap();
        assert_eq!(out, "inside");
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = TempDir::new().unwrap();
        write_file_core(dir.path(), Path::new("note.md"), "# Title\nbody").unwrap();
        let out = read_file_core(dir.path(), Path::new("note.md")).unwrap();
        assert_eq!(out, "# Title\nbody");
    }

    #[test]
    fn write_overwrites_existing_atomically() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("f.txt"), "old").unwrap();
        write_file_core(dir.path(), Path::new("f.txt"), "new contents").unwrap();
        let out = read_file_core(dir.path(), Path::new("f.txt")).unwrap();
        assert_eq!(out, "new contents");
        // No stray .tmp left behind after a successful rename.
        assert!(!dir.path().join("f.txt.tmp").exists());
    }

    #[test]
    fn write_to_missing_parent_dir_is_io_error() {
        let dir = TempDir::new().unwrap();
        // The subdir does not exist → resolve_within's parent canonicalize fails.
        let result = write_file_core(dir.path(), Path::new("no-such-dir/f.txt"), "x");
        assert!(matches!(result, Err(EditorFsError::Io(_))));
    }

    #[test]
    fn write_path_escaping_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        let result = write_file_core(&ws, Path::new("../escapee.txt"), "nope");
        assert!(matches!(
            result,
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
        // Nothing was written outside.
        assert!(!dir.path().join("escapee.txt").exists());
    }

    #[test]
    fn write_in_nested_existing_dir_round_trips() {
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("src");
        std::fs::create_dir(&sub).unwrap();
        write_file_core(dir.path(), Path::new("src/lib.rs"), "fn main() {}").unwrap();
        let out = read_file_core(dir.path(), Path::new("src/lib.rs")).unwrap();
        assert_eq!(out, "fn main() {}");
    }
}
