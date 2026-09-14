//! M15 WP4 Phase 2 — the Tauri surface over [`super`]'s WIP-file IO.
//!
//! ⚠️ Deliberately thin, exactly like `transcript::commands`. Per ruling **R-4** Rust does file
//! IO only and TypeScript owns the verdict, so this returns **raw text** and never a decision.
//! If a future edit is tempted to add "…and tell me whether a later phase exists" here, that is
//! the fork R-4 closed — the phase parse belongs on the TS side next to `resolvePolicy`.

use serde::Serialize;

/// One WIP read: the text, plus which file it came from.
///
/// The path is returned rather than kept backend-side so the caller can say *which* WIP file the
/// boundary decision was based on — with several items open, "a recycle fired" is not
/// diagnosable without knowing which feature's phases were read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WipRead {
    /// Absolute path of the file read, or `None` when the project has no WIP file.
    pub path: Option<String>,
    /// The file's text, bounded by [`super::WIP_MAX_BYTES`]. Empty when there is nothing to read.
    pub text: String,
}

/// Read the project's active WIP file.
///
/// "Active" is the **most recently modified** `.md` in `workflow-system/state/wip/` — see
/// [`super::list_wip_files`] for why that beats an alphabetical pick.
///
/// ⚠️ Returns an empty [`WipRead`] rather than an error for every absent case (no `wip/` dir, an
/// empty one, an unreadable file). A project that does not use the workflow system is the
/// ordinary case here, not a fault, and the supervisor's binding failure direction is
/// WITHHOLDING — "no WIP" correctly produces no recycle.
#[tauri::command]
pub fn wip_read(project_path: String) -> WipRead {
    let empty = WipRead {
        path: None,
        text: String::new(),
    };
    let dir = super::wip_dir_for(std::path::Path::new(&project_path));
    let Some(target) = super::list_wip_files(&dir).into_iter().next() else {
        return empty;
    };
    // ⚠️ An IO error degrades to "nothing read" for the same reason `transcript_tail` does: the
    // caller fires on a turn boundary and must never be handed an error it would have to treat
    // as evidence.
    match super::read_head(&target) {
        Ok(Some(text)) => WipRead {
            path: Some(target.to_string_lossy().into_owned()),
            text,
        },
        _ => empty,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("claudesk-wip-cmd-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// Create `<root>/workflow-system/state/wip/<name>` with `body`.
    fn write_wip(root: &std::path::Path, name: &str, body: &str) -> PathBuf {
        let dir = super::super::wip_dir_for(root);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(name);
        std::fs::write(&p, body).unwrap();
        p
    }

    #[test]
    fn reads_the_newest_wip_file_when_several_are_open() {
        // ⚠️ THE CASE THAT MATTERS. Two WIP items open at once is normal, and reading the wrong
        // one gates the recycle on another feature's phase list — a silent wrong answer.
        let root = tmpdir("several");
        write_wip(&root, "a-old.md", "**Workflow:** feature\nOLD");
        std::thread::sleep(std::time::Duration::from_millis(20));
        write_wip(&root, "z-new.md", "**Workflow:** feature\nNEW");

        let got = wip_read(root.to_string_lossy().into_owned());
        assert!(
            got.text.contains("NEW"),
            "must read the newest-modified file, got {:?}",
            got.text
        );
        // ⚠️ Also asserts the alphabetical tiebreak is NOT what won: `a-old.md` sorts first by
        // name, so a name-sorted implementation would have returned OLD.
        assert!(!got.text.contains("OLD"));
    }

    #[test]
    fn a_project_with_no_wip_dir_reads_empty_not_an_error() {
        let root = tmpdir("nowip");
        let got = wip_read(root.to_string_lossy().into_owned());
        assert_eq!(got.path, None);
        assert_eq!(got.text, "");
    }

    #[test]
    fn an_empty_wip_dir_reads_empty() {
        let root = tmpdir("emptydir");
        std::fs::create_dir_all(super::super::wip_dir_for(&root)).unwrap();
        let got = wip_read(root.to_string_lossy().into_owned());
        assert_eq!(got.path, None);
    }

    #[test]
    fn the_returned_path_names_the_file_that_was_read() {
        let root = tmpdir("path");
        write_wip(&root, "only.md", "**Workflow:** feature\n");
        let got = wip_read(root.to_string_lossy().into_owned());
        assert!(
            got.path.as_deref().unwrap_or_default().ends_with("only.md"),
            "got {:?}",
            got.path
        );
    }

    #[test]
    fn a_non_markdown_file_is_not_treated_as_a_wip_item() {
        let root = tmpdir("nonmd");
        let dir = super::super::wip_dir_for(&root);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("notes.txt"), "not a wip item").unwrap();

        let got = wip_read(root.to_string_lossy().into_owned());
        assert_eq!(got.path, None, "only .md files are WIP items");
    }
}
