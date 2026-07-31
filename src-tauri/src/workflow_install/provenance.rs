//! The provenance record: what Claudesk installed, where, and when (M10.9 WP3.5a task 3.5.3).
//!
//! ## Why a file next to the clone, and not `settings.json`
//! The record deliberately does **not** live in Claudesk's per-identity `settings.json`.
//! `~/.claudesk/vendor/` is not bundle-identity-scoped, so `com.claudesk.app` and
//! `com.claudesk.app.dev` share one clone. A per-identity record would give them divergent
//! views of one directory — dev believing it unmanaged while prod believes it managed — in a
//! feature whose entire safety model is *only touch what we recorded*. So the record lives
//! beside the thing it describes, under `~/.claudesk/`, and both builds read the same file.
//!
//! ## Reading is deliberately lossy in ONE direction
//! [`read_record`] returns `Option`, not `Result`, and collapses *absent*, *unreadable*, and
//! *corrupt* into a single `None`. That is not laziness — it is the module's safety posture
//! expressed in a type. The caller ([`super::resolve_state`]) treats `None` as "Claudesk
//! cannot prove it installed this", which resolves to
//! [`super::InstallState::Developer`] — the state offering **no** removal. Handing the caller
//! a `Result` would invite it to distinguish cases that must not be distinguished: a corrupt
//! record is not a reason to guess, and "guess" here means arming a delete.
//!
//! Writing, by contrast, returns a real `Result`: a failed write must be surfaced, because it
//! means the install just performed is unrecorded and the user needs to know.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// The record's filename, written under `~/.claudesk/`.
pub const RECORD_FILENAME: &str = "install-record.json";

/// What Claudesk recorded about an install it performed.
///
/// Every field is captured **at install time** from what Claudesk itself did — never
/// reconstructed later by resolving a path. That is the rule this whole module exists to
/// enforce; see the parent module's header, rule 2.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstallRecord {
    /// Where Claudesk cloned the substrate. The path as Claudesk created it.
    pub clone_path: PathBuf,
    /// RFC-3339 UTC timestamp of the install.
    pub installed_at: String,
    /// The origin the clone came from, so a later reader can tell *what* was installed.
    pub origin_url: String,
}

/// The record's path under an injected `claudesk_root` (normally `~/.claudesk/`).
///
/// Takes the root as a parameter — there is no ambient home resolution anywhere in this
/// module, per the parent's rule 1 and the guard that enforces it.
pub fn record_path(claudesk_root: &Path) -> PathBuf {
    claudesk_root.join(RECORD_FILENAME)
}

/// Read the record, or `None` if it is absent, unreadable, or corrupt.
///
/// **All three failure modes collapse to `None` on purpose** — see the module header. The
/// caller must not be able to tell them apart, because every one of them means the same
/// thing: Claudesk cannot prove it installed this, so it must not offer to remove it.
pub fn read_record(claudesk_root: &Path) -> Option<InstallRecord> {
    let bytes = fs::read(record_path(claudesk_root)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Write the record, creating `claudesk_root` if needed.
///
/// Returns a real error, unlike [`read_record`]: a write that fails leaves an install
/// unrecorded, and the caller must surface that rather than proceed as though the install
/// were tracked.
///
/// Called **only after `install.sh` exits zero** (Phase 2, task P2.4) — sequencing the write
/// last is what makes "a failed install leaves no record" structural rather than a cleanup
/// step that could be skipped.
pub fn write_record(claudesk_root: &Path, record: &InstallRecord) -> io::Result<()> {
    fs::create_dir_all(claudesk_root)?;
    let json = serde_json::to_vec_pretty(record)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    fs::write(record_path(claudesk_root), json)
}

/// Delete the record (M10.9 WP3.5b task P2.2) — **sequenced LAST in the uninstall run**, the
/// mirror of the install's write-last: a failed uninstall leaves the record describing what
/// still exists, and only a fully successful removal forgets it
/// (`SURFACE-2026-07-30-WP3.5B-UNINSTALL-MUST-CLEAR-THE-PROVENANCE-RECORD`).
///
/// The ordering is pinned by behavioral failure-injection tests in `runner`, NOT by a source
/// position guard — the position-tripwire approach was proven decorative twice in WP3.5a and
/// deleted at this WP's Phase 1.
///
/// Idempotent on an already-missing record: the goal state is "no record", and a record that
/// disappeared between the guard's read and this call (e.g. a concurrent hand-cleanup) means
/// the goal is already met, not that the uninstall failed. Every other error is real and must
/// surface — a record that CANNOT be deleted leaves Claudesk claiming an install that is gone.
pub fn delete_record(claudesk_root: &Path) -> io::Result<()> {
    match fs::remove_file(record_path(claudesk_root)) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn a_record(clone_path: PathBuf) -> InstallRecord {
        InstallRecord {
            clone_path,
            installed_at: "2026-07-29T12:00:00Z".to_string(),
            origin_url: "git@example.com:someone/repo.git".to_string(),
        }
    }

    #[test]
    fn round_trips_field_for_field() {
        let root = TempDir::new().unwrap();
        let record = a_record(root.path().join("vendor").join("mccc"));

        write_record(root.path(), &record).unwrap();
        let read = read_record(root.path()).expect("a record just written must read back");

        assert_eq!(read, record, "the record must survive a round trip exactly");
    }

    #[test]
    fn absent_record_reads_as_none() {
        let root = TempDir::new().unwrap();

        assert!(read_record(root.path()).is_none());
    }

    #[test]
    fn corrupt_record_reads_as_none_rather_than_erroring() {
        // The safety-critical degrade. A truncated or hand-edited file must not surface an
        // error the caller might try to "recover" from — it reads as None, which resolves to
        // Developer, which offers no removal.
        let root = TempDir::new().unwrap();
        fs::write(record_path(root.path()), b"{ not valid json").unwrap();

        assert!(
            read_record(root.path()).is_none(),
            "a corrupt record must read as None (→ Developer), never as a usable record"
        );
    }

    #[test]
    fn a_record_missing_required_fields_reads_as_none() {
        // Well-formed JSON, wrong shape — e.g. a future/older schema. Same posture: not
        // usable, so not Managed.
        let root = TempDir::new().unwrap();
        fs::write(record_path(root.path()), br#"{"clone_path":"/x"}"#).unwrap();

        assert!(read_record(root.path()).is_none());
    }

    #[test]
    fn write_creates_the_root_when_absent() {
        // First install on a fresh machine: ~/.claudesk/ does not exist yet.
        let parent = TempDir::new().unwrap();
        let root = parent.path().join("claudesk-root-does-not-exist-yet");
        let record = a_record(root.join("vendor"));

        write_record(&root, &record).unwrap();

        assert!(read_record(&root).is_some());
    }

    #[test]
    fn write_overwrites_a_previous_record() {
        // Install → uninstall-by-hand → install again. The newest install is the truth.
        let root = TempDir::new().unwrap();
        write_record(root.path(), &a_record(PathBuf::from("/first"))).unwrap();

        let second = a_record(PathBuf::from("/second"));
        write_record(root.path(), &second).unwrap();

        assert_eq!(read_record(root.path()).unwrap(), second);
    }

    #[test]
    fn delete_removes_an_existing_record() {
        let root = TempDir::new().unwrap();
        write_record(root.path(), &a_record(PathBuf::from("/somewhere"))).unwrap();

        delete_record(root.path()).unwrap();

        assert!(
            read_record(root.path()).is_none(),
            "a deleted record must read as None — the state a fresh machine has"
        );
        assert!(
            !record_path(root.path()).exists(),
            "the file itself must be gone, not emptied or renamed"
        );
    }

    #[test]
    fn delete_is_idempotent_when_no_record_exists() {
        // The goal state is "no record". A second delete — or a delete racing a hand-cleanup —
        // finds the goal already met and must not report failure.
        let root = TempDir::new().unwrap();

        assert!(delete_record(root.path()).is_ok());
    }

    #[test]
    fn delete_surfaces_a_real_io_error_rather_than_swallowing_it() {
        // A record that CANNOT be deleted leaves Claudesk claiming an install that is gone —
        // the caller must know. Provoked with a read-only parent dir (the record's unlink
        // fails), then restored so the TempDir can clean itself up.
        use std::os::unix::fs::PermissionsExt;
        let root = TempDir::new().unwrap();
        write_record(root.path(), &a_record(PathBuf::from("/somewhere"))).unwrap();
        fs::set_permissions(root.path(), fs::Permissions::from_mode(0o555)).unwrap();

        let result = delete_record(root.path());

        fs::set_permissions(root.path(), fs::Permissions::from_mode(0o755)).unwrap();
        assert!(
            result.is_err(),
            "an undeletable record must surface as an error, never as success"
        );
        assert!(
            read_record(root.path()).is_some(),
            "the record must still be there after the failed delete"
        );
    }

    #[test]
    fn every_write_stays_inside_the_injected_root() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The containment proof the high-priority sandbox SURFACE demands: the fixture
        // must be PROVEN to contain writes, not assumed to.
        //
        // Asserted structurally rather than by watching the filesystem: every path this
        // module can construct comes from `record_path(root)`, so if that is inside the
        // injected root, nothing this module writes can escape it. A test that merely
        // checked "the real ~/.claudesk/ wasn't touched" would pass on a machine where
        // it happens not to exist, which is the vacuous version of this check.
        // ═══════════════════════════════════════════════════════════════════════════
        // The injected root is nested inside an enclosing tempdir THIS TEST OWNS, so the
        // "nothing landed beside the root" scan below reads a directory with exactly one
        // expected entry.
        //
        // Why not `TempDir::new()` directly: its parent is the machine-global `$TMPDIR`
        // (`/var/folders/.../T`, ~170 unrelated entries on a normal macOS session). Scanning
        // that made the assertion fail whenever ANY other process happened to leave a file
        // named `install-record.json` there — reproduced during this phase's verify-self, where
        // the test failed with this module completely untouched and dumped 172 OS entries into
        // the failure message. A guard keyed on ambient machine state is worse than no guard:
        // it fails for reasons unrelated to the code and trains readers to ignore it.
        let enclosure = TempDir::new().unwrap();
        let root = enclosure.path().join("claudesk-root");
        let record = a_record(root.clone());

        write_record(&root, &record).unwrap();

        let written = record_path(&root);
        assert!(
            written.starts_with(&root),
            "the record path must be inside the injected root, got {written:?}"
        );

        // And nothing landed beside the root — now a closed set, not the system tempdir.
        let siblings: Vec<_> = fs::read_dir(enclosure.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name())
            .filter(|name| name != "claudesk-root")
            .collect();
        assert!(
            siblings.is_empty(),
            "the write escaped the injected root into its enclosure: {siblings:?}"
        );
    }

    #[test]
    fn the_real_home_is_never_referenced_by_this_module() {
        // Companion to the parent module's `roots_are_injected_never_ambient`, applied to the
        // layer that actually writes files. The parent guards the decision logic; this guards
        // the IO. The extractor is the shared one in `source_guard.rs` — its split-on-`mod
        // tests` discipline and the truncation meta-test live there now, once, for every file.
        let code =
            crate::workflow_install::source_guard::production_code(include_str!("provenance.rs"));

        for forbidden in ["home_dir", "env::var", "std::env", "dirs::home"] {
            assert!(
                !code.contains(forbidden),
                "provenance IO must not resolve roots ambiently (`{forbidden}`) — the root \
                 arrives as a parameter so the sandbox contains every write."
            );
        }

        assert!(
            code.contains("claudesk_root: &Path"),
            "the root must appear as an injected parameter"
        );
    }
}
