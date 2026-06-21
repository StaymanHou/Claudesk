//! Tauri command wrapper over the pure [`super::search_core`] function.
//!
//! Thin: take the workspace `root` + the [`SearchQuery`] mode flags, run the pure
//! core, and map [`super::ProjectSearchError`] to a `String` so it crosses the IPC
//! boundary (Tauri requires command errors to be `Serialize`). The ⌘⇧F overlay passes
//! the workspace project dir as `root` and renders the returned [`FileMatches`].
//!
//! Errors come back as a `String` for the overlay to surface inline — a bad root or an
//! invalid regex is an error the operator sees, never a silently-empty result list
//! (the WP6 picker IPC error-surfacing lesson). A no-match search legitimately
//! returns `[]`.

use std::path::Path;

use super::{replace_core, search_core, FileMatches, ReplaceSummary, SearchQuery};

/// Run a project-wide content search over the workspace `root`.
///
/// `query` carries the pattern + the four mode toggles (regex / case-sensitive /
/// whole-word). Returns per-file matches sorted by path; errors (root missing /
/// not a directory, invalid regex) come back as a `String` the overlay shows inline.
#[tauri::command]
pub fn project_search(root: String, query: SearchQuery) -> Result<Vec<FileMatches>, String> {
    search_core(Path::new(&root), &query).map_err(|e| e.to_string())
}

/// Replace every match of `query` with `replacement` across the workspace `root`
/// (WP7 Phase 3 — project-wide Replace All).
///
/// Same `query` shape as `project_search`, plus the replacement text (with `$1`/`${name}`
/// capture-group support in regex mode; literal in substring mode). Returns a
/// `{files_changed, matches_replaced}` summary; a bad root / invalid regex / per-file
/// write failure comes back as a `String` the overlay surfaces inline.
#[tauri::command]
pub fn project_replace(
    root: String,
    query: SearchQuery,
    replacement: String,
) -> Result<ReplaceSummary, String> {
    replace_core(Path::new(&root), &query, &replacement).map_err(|e| e.to_string())
}
