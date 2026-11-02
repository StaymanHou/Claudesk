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

use super::{
    replace_in_scope, search_core, FileMatches, ReplaceScope, ReplaceSummary, SearchQuery,
};

/// Run a project-wide content search over the workspace `root`.
///
/// `query` carries the pattern + the four mode toggles (regex / case-sensitive /
/// whole-word). Returns per-file matches sorted by path; errors (root missing /
/// not a directory, invalid regex) come back as a `String` the overlay shows inline.
#[tauri::command]
pub fn project_search(root: String, query: SearchQuery) -> Result<Vec<FileMatches>, String> {
    search_core(Path::new(&root), &query).map_err(|e| e.to_string())
}

/// Replace matches of `query` with `replacement` under the workspace `root`.
///
/// Same `query` shape as `project_search`, plus the replacement text (with `$1`/`${name}`
/// capture-group support in regex mode; literal in substring mode). `scope` picks what is
/// replaced (M16.5 WP6): absent or `{kind:"all"}` is the project-wide Replace All (WP7
/// Phase 3); `{kind:"file", path}` is one file; `{kind:"match", path, line, start, end,
/// line_text}` is one search result. Returns a `{files_changed, matches_replaced}`
/// summary; a bad root / invalid regex / read or write failure / stale result comes back
/// as a `String` the overlay surfaces inline.
#[tauri::command]
pub fn project_replace(
    root: String,
    query: SearchQuery,
    replacement: String,
    scope: Option<ReplaceScope>,
) -> Result<ReplaceSummary, String> {
    let scope = scope.unwrap_or(ReplaceScope::All);
    replace_in_scope(Path::new(&root), &query, &replacement, &scope).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    //! The consuming surface itself (M16.5 WP6): the `project_replace` command the frontend
    //! invokes. `replace_in_scope` is covered in `super::super::tests`; these pin what only
    //! the wrapper decides — an absent `scope` is Replace All, and errors cross as `String`.
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn q(pattern: &str) -> SearchQuery {
        SearchQuery {
            pattern: pattern.to_string(),
            regex: false,
            case_sensitive: true,
            whole_word: false,
        }
    }

    fn two_files() -> TempDir {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), "tok tok\n").unwrap();
        fs::write(dir.path().join("b.txt"), "tok\n").unwrap();
        dir
    }

    fn root(dir: &TempDir) -> String {
        dir.path().to_string_lossy().into_owned()
    }

    #[test]
    fn absent_scope_is_replace_all() {
        let dir = two_files();
        let s = project_replace(root(&dir), q("tok"), "X".to_string(), None).unwrap();
        assert_eq!((s.files_changed, s.matches_replaced), (2, 3));
        assert_eq!(
            fs::read_to_string(dir.path().join("a.txt")).unwrap(),
            "X X\n"
        );
        assert_eq!(fs::read_to_string(dir.path().join("b.txt")).unwrap(), "X\n");
    }

    #[test]
    fn file_scope_through_the_command_leaves_other_files() {
        let dir = two_files();
        let scope = Some(ReplaceScope::File {
            path: "a.txt".to_string(),
        });
        let s = project_replace(root(&dir), q("tok"), "X".to_string(), scope).unwrap();
        assert_eq!((s.files_changed, s.matches_replaced), (1, 2));
        assert_eq!(
            fs::read_to_string(dir.path().join("b.txt")).unwrap(),
            "tok\n"
        );
    }

    #[test]
    fn match_scope_from_a_search_row_round_trips_through_the_commands() {
        let dir = two_files();
        let results = project_search(root(&dir), q("tok")).unwrap();
        let a = results.iter().find(|f| f.file == "a.txt").unwrap();
        let m = &a.matches[1];
        let scope = Some(ReplaceScope::Match {
            path: a.file.clone(),
            line: m.line,
            start: m.start,
            end: m.end,
            line_text: m.line_text.clone(),
        });
        project_replace(root(&dir), q("tok"), "X".to_string(), scope).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("a.txt")).unwrap(),
            "tok X\n"
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("b.txt")).unwrap(),
            "tok\n"
        );
    }

    #[test]
    fn a_stale_row_comes_back_as_the_inline_error_string() {
        let dir = two_files();
        let scope = Some(ReplaceScope::Match {
            path: "b.txt".to_string(),
            line: 1,
            start: 0,
            end: 3,
            line_text: "tok EDITED".to_string(),
        });
        let err = project_replace(root(&dir), q("tok"), "X".to_string(), scope).unwrap_err();
        assert_eq!(err, "b.txt changed since the search; search again");
        assert_eq!(
            fs::read_to_string(dir.path().join("b.txt")).unwrap(),
            "tok\n"
        );
    }
}
