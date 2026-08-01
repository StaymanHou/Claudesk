//! Tauri command wrappers over the pure [`super::discover`] docs-discovery function.
//!
//! Thin by design: authenticate the frontend-supplied workspace `root` against the known
//! project list, then delegate. Errors map to a `String` so they cross IPC and are
//! surfaced by the UI rather than swallowed (the WP6/WP7 error-surfacing lesson).
//!
//! ## Root is validated, not trusted
//! `root` arrives from the renderer and is **not** taken on faith: the project list is
//! resolved server-side from the real `app_data_dir()` and checked via
//! [`crate::editor_fs::validate_root`], exactly as the six editor-fs commands do. A `root`
//! that is neither a known project nor a descendant of one is rejected. `AppHandle` is
//! injected by Tauri (never passed from JS).
//!
//! ⚠️ **Scope of the tests below:** they exercise the path-confinement half
//! ([`read_file_core`]) directly, since constructing an `AppHandle` needs a Tauri runtime.
//! The root-*authentication* half ([`validate_frontend_root`]) is therefore asserted by
//! this comment rather than pinned by a unit test — it is covered live at verify-self,
//! and shares its implementation with the six editor-fs commands that exercise it in
//! production. Stated explicitly so the claim is not mistaken for a tested one.
//!
//! ## Why this reuses `editor_fs` rather than re-implementing
//! The discoverable doc set is a strict SUBSET of the project tree the editor can already
//! read, so `docs_read` introduces no new trust surface — it is a read of a file the
//! editor could open anyway. Reusing [`crate::editor_fs::read_file_core`] means the
//! path-confinement guard (including the WP7 symlink handling) has exactly one
//! implementation. Re-implementing it here would be a second security boundary to keep in
//! sync, which is how such guards drift.

use std::path::{Path, PathBuf};

use tauri::AppHandle;

use super::{discover, DocEntry};
use crate::config_store::{self, commands::resolve_data_dir};
use crate::editor_fs::{read_file_core, validate_root};

/// Authenticate a frontend-supplied `root` against the known project list, returning the
/// canonicalized root to confine against. Mirrors `editor_fs::commands`'
/// `validate_frontend_root` (which is private to that module).
fn validate_frontend_root(app: &AppHandle, root: &str) -> Result<PathBuf, String> {
    let data_dir = resolve_data_dir(app)?;
    let known_roots: Vec<PathBuf> = config_store::read_projects(&data_dir)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|p| p.path)
        .collect();
    validate_root(&known_roots, Path::new(root)).map_err(|e| e.to_string())
}

/// List the conventional workflow docs present under the workspace `root`.
///
/// Returns [`DocEntry`] values in discovery order; the frontend applies the workflow
/// ordering. Absent docs are silently omitted and a project with no workflow docs at all
/// returns an empty list — neither is an error. Only an unknown/hostile `root` fails.
#[tauri::command]
pub fn docs_list(app: AppHandle, root: String) -> Result<Vec<DocEntry>, String> {
    let root = validate_frontend_root(&app, &root)?;
    Ok(discover(&root))
}

/// Read one doc's raw text under the workspace `root` (read-only).
///
/// `path` is the [`DocEntry::rel_path`] handed out by [`docs_list`]. Confined to `root`
/// by the same guard as the editor's own reads — a path escaping the workspace, a missing
/// file, or non-UTF-8 content each come back as a `String` error for the UI to surface.
#[tauri::command]
pub fn docs_read(app: AppHandle, root: String, path: String) -> Result<String, String> {
    let root = validate_frontend_root(&app, &root)?;
    read_file_core(&root, Path::new(&path)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::editor_fs::EditorFsError;
    use tempfile::TempDir;

    // The command layer needs a Tauri `AppHandle`, so these tests exercise the seam the
    // commands delegate to — the same confinement guard, called the same way. The
    // command wrappers themselves are thin (validate → delegate) and are covered live at
    // verify-self. What matters to pin here is that a docs-shaped read CANNOT escape the
    // root, because that is the security-relevant half.

    #[test]
    fn docs_read_seam_rejects_path_escaping_the_root() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir_all(root.join("workflow-system/product")).unwrap();
        std::fs::write(root.join("workflow-system/product/vision.md"), "# v").unwrap();
        // A secret alongside, but OUTSIDE, the project root.
        std::fs::write(dir.path().join("secret.txt"), "TOP SECRET").unwrap();

        let escaped = read_file_core(&root, Path::new("../secret.txt"));

        assert!(
            matches!(escaped, Err(EditorFsError::OutsideWorkspace { .. })),
            "a `..` traversal out of the project root must be rejected, got {escaped:?}"
        );
    }

    #[test]
    fn docs_read_seam_reads_a_discovered_doc() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("workflow-system/product")).unwrap();
        std::fs::write(
            dir.path().join("workflow-system/product/vision.md"),
            "# Vision\n\nBody.\n",
        )
        .unwrap();

        // Exactly the round-trip the frontend performs: discover → read by rel_path.
        let entries = discover(dir.path());
        assert_eq!(entries.len(), 1);
        let text = read_file_core(dir.path(), Path::new(&entries[0].rel_path)).unwrap();

        assert_eq!(text, "# Vision\n\nBody.\n");
    }

    #[test]
    fn docs_read_seam_rejects_an_absolute_path_outside_the_root() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir_all(&root).unwrap();

        let escaped = read_file_core(&root, Path::new("/etc/passwd"));

        assert!(
            matches!(escaped, Err(EditorFsError::OutsideWorkspace { .. })),
            "an absolute path outside the root must be rejected, got {escaped:?}"
        );
    }
}
