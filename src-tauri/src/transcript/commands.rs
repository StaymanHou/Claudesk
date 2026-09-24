//! M15 WP3 Phase 2 — the Tauri surface over [`super`]'s file IO.
//!
//! ⚠️ Deliberately thin. Per operator ruling **R-4**, Rust does file IO only and TypeScript
//! owns the verdict, so these commands return **raw lines** and never a decision. If a future
//! edit is tempted to add "…and tell me whether it chained" here, that is the fork R-4 closed
//! — the parse and the policy lookup belong on the TS side, where the single `resolvePolicy`
//! funnel already lives.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// One transcript read: the lines, plus which file they came from.
///
/// The path is returned rather than kept backend-side because the caller uses it to key
/// "have I already fired for this turn?" — and a caller that cannot name the file it read
/// cannot tell two sessions in one project apart, which is the collapse Phase 1 set out to fix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TranscriptTail {
    /// Absolute path of the file read, or `None` when no transcript exists yet.
    pub path: Option<String>,
    /// Raw JSONL lines, oldest first. Empty when there is nothing to read.
    pub lines: Vec<String>,
}

/// Resolve the user's home directory.
///
/// ⚠️ Uses Tauri's resolver rather than `std::env::var("HOME")` so a sandboxed or relocated
/// home is honored consistently with the rest of the app.
fn home_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().home_dir().ok()
}

/// F-b F.29 — the config root a project's transcripts live under: `<home>/.claude` for the
/// default profile, the profile's own dir for a listed one. `None` for a row naming a profile
/// that is not listed (or an unreadable list): there is no root to read, and guessing
/// `~/.claude` would read ANOTHER profile's transcripts for the same directory — the 4 dual-use
/// dirs make that a real collision, not a theoretical one.
///
/// Reads the row's STORED reference. The supervisor (this command's only caller) is off for
/// non-default profiles (ruling 4), so for its live path this resolves `~/.claude`; the
/// profile arm keeps the reader correct for any future caller.
pub(crate) fn config_root_for_project(
    home: &Path,
    reference: Result<Option<String>, crate::config_store::ConfigError>,
    list: impl FnOnce() -> Result<
        Vec<crate::config_store::profiles::Profile>,
        crate::config_store::ConfigError,
    >,
) -> Option<PathBuf> {
    use crate::config_store::profiles::{is_default_reference, resolve, ResolvedProfile};
    let reference = reference.ok()?;
    if is_default_reference(reference.as_deref()) {
        return Some(super::default_config_root(home));
    }
    match resolve(&list().ok()?, reference.as_deref()) {
        ResolvedProfile::Default => Some(super::default_config_root(home)),
        ResolvedProfile::Listed(p) => Some(p.config_dir),
        ResolvedProfile::Missing(_) => None,
    }
}

/// Choose which transcript file to read: the named session, else newest-modified.
///
/// ⚠️ **Extracted from [`transcript_tail`] at verify-codify so it can be TESTED.** The command
/// itself takes an `AppHandle` and is therefore unreachable from a unit test, which left the
/// selection rule — the part with actual branching, and the part the live run exercised — with
/// zero coverage. That is this repo's standing defect shape in miniature: *a mechanism correct
/// in itself behind a caller that nothing checks.*
///
/// ⚠️ The fallback is a real fallback, NOT a default: a named-but-missing session falls back to
/// newest-modified (a session whose file was rotated or never written must still be readable),
/// but a project with **no transcripts at all** returns `None` rather than a guess.
fn select_transcript(dir: &std::path::Path, session_id: Option<&str>) -> Option<PathBuf> {
    let named = session_id
        .filter(|s| !s.is_empty())
        .map(|s| dir.join(format!("{s}.jsonl")))
        .filter(|p| p.exists());
    match named {
        Some(p) => Some(p),
        None => super::list_transcripts(dir).into_iter().next(),
    }
}

/// Read the tail of a workspace's CC transcript.
///
/// `session_id` names the exact session when the caller has one (it now reaches the frontend
/// on every hook event — Phase 1). When it is `None` or names a file that does not exist, this
/// falls back to the project's **most recently modified** transcript.
///
/// ⚠️ **The fallback is a real fallback, not a default.** A workspace whose session predates
/// the `session_id` wiring, or which has not emitted a hook event yet, still needs to be
/// readable. But `None` is returned rather than a guess when the project has no transcripts at
/// all — an empty result the caller must handle, never a silently-wrong file.
#[tauri::command]
pub fn transcript_tail(
    app: AppHandle,
    project_path: String,
    session_id: Option<String>,
) -> TranscriptTail {
    let empty = TranscriptTail {
        path: None,
        lines: Vec::new(),
    };
    let Some(home) = home_dir(&app) else {
        return empty;
    };
    let data_dir = app.path().app_data_dir().ok();
    let root = match data_dir.as_deref() {
        Some(d) => config_root_for_project(
            &home,
            crate::config_store::read_project_profile(d, Path::new(&project_path)),
            || crate::config_store::profiles::read_profiles(d),
        ),
        // No app-data dir → no profile can be named; the default root is the only answer.
        None => Some(super::default_config_root(&home)),
    };
    let Some(root) = root else {
        return empty;
    };
    let dir = super::transcript_dir_for(&root, Path::new(&project_path));
    let Some(target) = select_transcript(&dir, session_id.as_deref()) else {
        return empty;
    };

    // ⚠️ An IO error degrades to "no lines" rather than surfacing an error to a caller that
    // fires on a turn boundary: the supervisor's binding failure direction is WITHHOLDING
    // (ruling R-6 condition 2), and "no evidence" correctly produces no fire.
    let lines = super::read_tail(&target).unwrap_or_default();
    TranscriptTail {
        path: Some(target.to_string_lossy().into_owned()),
        lines,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(name: &str, dir: &str) -> crate::config_store::profiles::Profile {
        crate::config_store::profiles::Profile {
            name: name.to_string(),
            config_dir: PathBuf::from(dir),
            provenance: crate::config_store::profiles::Provenance::Adopted,
        }
    }

    #[test]
    fn profile_config_root_default_is_home_dot_claude_and_never_reads_the_list() {
        let root = config_root_for_project(Path::new("/h"), Ok(None), || {
            panic!("a default row must not read the profile list")
        });
        assert_eq!(root, Some(PathBuf::from("/h/.claude")));
    }

    #[test]
    fn profile_config_root_follows_a_listed_profile() {
        let root = config_root_for_project(Path::new("/h"), Ok(Some("neo".into())), || {
            Ok(vec![profile("neo", "/u/.config/claude-neo")])
        });
        assert_eq!(root, Some(PathBuf::from("/u/.config/claude-neo")));
    }

    #[test]
    fn profile_config_root_is_none_for_unlisted_or_unreadable_never_home() {
        let unlisted =
            config_root_for_project(Path::new("/h"), Ok(Some("gone".into())), || Ok(vec![]));
        assert_eq!(unlisted, None);
        let unreadable = config_root_for_project(Path::new("/h"), Ok(Some("neo".into())), || {
            Err(crate::config_store::ConfigError::Io(std::io::Error::other(
                "bad",
            )))
        });
        assert_eq!(unreadable, None);
    }
    use std::path::Path;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("claudesk-transcript-cmd-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn a_named_session_wins_over_newest_modified() {
        // The disambiguator Phase 1 put on the wire is only useful if it actually STEERS the
        // read. Two sessions in one project is exactly the case `WorkspaceRegistry` cannot
        // tell apart by path, so "newest" would silently read the WRONG session's transcript.
        let dir = tmpdir("named");
        std::fs::write(dir.join("older.jsonl"), "{}\n").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.join("newer.jsonl"), "{}\n").unwrap();

        let picked = select_transcript(&dir, Some("older")).unwrap();
        assert!(
            picked.ends_with("older.jsonl"),
            "the NAMED session must win over the newest-modified one; got {picked:?}"
        );
    }

    #[test]
    fn falls_back_to_newest_when_the_named_session_has_no_file() {
        // A session whose file was rotated, or which has not written yet, must still be
        // readable — the fallback is what keeps the supervisor working on such a workspace.
        let dir = tmpdir("fallback");
        std::fs::write(dir.join("a.jsonl"), "{}\n").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.join("b.jsonl"), "{}\n").unwrap();

        let picked = select_transcript(&dir, Some("does-not-exist")).unwrap();
        assert!(picked.ends_with("b.jsonl"));
    }

    #[test]
    fn an_empty_session_id_is_treated_as_absent() {
        // ⚠️ `HookEvent.session_id` is `#[serde(default)]`, so a degraded payload yields "".
        // Joining that would probe `<dir>/.jsonl` — a file that never exists — and the
        // `.filter(exists)` would mask it. Pinned so the normalization stays deliberate.
        let dir = tmpdir("empty-id");
        std::fs::write(dir.join("only.jsonl"), "{}\n").unwrap();
        let picked = select_transcript(&dir, Some("")).unwrap();
        assert!(picked.ends_with("only.jsonl"));
    }

    #[test]
    fn no_transcripts_at_all_selects_nothing_rather_than_guessing() {
        // ⚠️ `None`, never a fabricated path. A caller that received a guess would read an
        // unrelated project's turn and could fire into it.
        let dir = tmpdir("none");
        assert!(select_transcript(&dir, Some("whatever")).is_none());
        assert!(select_transcript(&dir, None).is_none());
        assert!(select_transcript(Path::new("/no/such/dir"), None).is_none());
    }
}
