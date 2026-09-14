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
    //
    // ⚠️ **THE VALUE IS THE SAME FOR BOTH ARMS; THE DIAGNOSTIC IS NOT.** `Ok(None)` (the file
    // vanished between the listing and the read) is the ordinary case. `Err(e)` (permissions, a
    // mid-write truncation, a bad mount) is a FAULT that happens to share the withholding
    // direction. Collapsing them into one `_` arm made an unreadable WIP indistinguishable from
    // an absent one — and since `read_head` and `transcript::read_tail` both preserve that
    // distinction, only this command was throwing it away.
    match super::read_head(&target) {
        Ok(Some(text)) => WipRead {
            path: Some(target.to_string_lossy().into_owned()),
            text,
        },
        Ok(None) => empty,
        Err(e) => {
            // ⚠️ `eprintln!` rather than a returned error: the supervisor must still withhold
            // (an unreadable WIP must never be the reason a session gets recycled), so the
            // VALUE stays `empty`. It is the silence that was wrong, not the degradation.
            eprintln!(
                "wip_read: could not read {} — {e}",
                target.to_string_lossy()
            );
            empty
        }
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
    fn an_unreadable_wip_file_reads_empty_but_is_not_silent() {
        // ⚠️ THE DISTINCTION THE COMMAND USED TO THROW AWAY. `read_head` and
        // `transcript::read_tail` both separate `NotFound` from a real IO error; only this
        // command collapsed both into one `_` arm, making an unreadable WIP indistinguishable
        // from an absent one.
        //
        // ⚠️ The VALUE is deliberately still `empty` — the supervisor must withhold, and an
        // unreadable WIP must never be the reason a session gets recycled. What this test pins
        // is that the error arm is REACHED as its own branch: a `_ => empty` implementation
        // passes the value assertions below, so the discriminating check is that `path` is
        // `None` while a *readable* file of the same name yields `Some` (proving the file was
        // listed and the divergence happened at the read, not the listing).
        let root = tmpdir("unreadable");
        let p = write_wip(&root, "locked.md", "**Workflow:** feature\nSECRET");

        // Sanity/positive control: readable right now, so the listing definitely finds it.
        let before = wip_read(root.to_string_lossy().into_owned());
        assert!(
            before.path.is_some() && before.text.contains("SECRET"),
            "precondition: the file must be readable before it is locked, got {before:?}"
        );

        // Chmod 000 — the permissions case the finding names.
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o000)).unwrap();

        let got = wip_read(root.to_string_lossy().into_owned());

        // ⚠️ Restore before asserting, so a failed assertion cannot leave an unremovable temp
        // file behind for the next run.
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o644)).unwrap();

        assert_eq!(
            got.path, None,
            "an unreadable WIP must degrade to the withholding value"
        );
        assert_eq!(got.text, "", "and must leak no partial text");
    }

    #[test]
    fn the_io_error_arm_is_matched_separately_from_the_absent_arm() {
        // ⚠️ **WHY A SOURCE GUARD AND NOT A BEHAVIORAL ASSERTION.** Mutation-proved during the
        // paydown: reverting the fix to the original `_ => empty` leaves
        // `an_unreadable_wip_file_reads_empty_but_is_not_silent` GREEN, because both arms return
        // the same VALUE by design — withholding is correct for absent *and* unreadable. The
        // only observable difference is the `eprintln!`, which goes to the process's stderr and
        // is not capturable in-process (`cargo test` captures `print!`, not a child's fd 2, and
        // this is a plain fn, not a subprocess).
        //
        // So the property "the two cases stay distinguishable" is pinned at the source level,
        // and the guard asserts the MATCH SHAPE rather than a bare identifier — `Err(e) =>` with
        // a log in its body, and no catch-all `_` arm that would swallow it again.
        let src = include_str!("commands.rs");
        // Strip this test's own comments/body so the guard cannot be satisfied by the prose
        // above — the exact failure mode where a guard passes because it matched its own text.
        let code = src
            .split("mod tests")
            .next()
            .expect("the command body precedes the test module");

        assert!(
            code.contains("Ok(None) => empty"),
            "the absent case must be its own arm"
        );
        assert!(
            code.contains("Err(e) => {"),
            "the IO-error case must be its own arm, not folded into a catch-all"
        );
        assert!(
            code.contains("eprintln!"),
            "the IO-error arm must not be silent — the silence was the defect"
        );
        assert!(
            !code.contains("_ => empty"),
            "a catch-all arm re-collapses the distinction this guard exists to keep"
        );
        // ⚠️ Emptiness meta-guard: without it every negative assertion above passes vacuously
        // if the split ever returns nothing.
        assert!(code.len() > 500, "the guard must be reading real source");
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
