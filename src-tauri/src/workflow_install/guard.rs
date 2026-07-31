//! The refuse-guard (M10.9 WP3.5b task 3.5.2) — **production code, built BEFORE any
//! deleting path exists.**
//!
//! ## What this is
//! The single authority on *what the uninstall path is allowed to touch*. Every deleting
//! operation WP3.5b ships consumes an [`UninstallTarget`], and the **only** way to construct
//! one is [`refuse_guard`]. The field is private and there is no other constructor, so
//! "deletes go through the guard" is enforced by the compiler rather than remembered by
//! reviewers — a test-only guard cannot protect against a bug that ships
//! (`SURFACE-2026-07-28-MCCC-INSTALL-FEATURE-NEEDS-SANDBOXED-DEV-AND-VERIFY`, high).
//!
//! ## What it refuses, and why
//! The guard consumes ONLY the recorded provenance (never a caller-supplied path, never a
//! path inferred by resolving symlinks under `~/.claude/`) and hard-refuses when:
//!
//! - there is **no well-formed record** — absent, unreadable, and corrupt records all
//!   collapse to `None` upstream ([`super::provenance::read_record`]) precisely so this arm
//!   cannot distinguish cases that must not be distinguished. This is also the arm that
//!   covers a hand-clone sitting inside Claudesk's own vendor dir: location is not
//!   provenance, and an unrecorded substrate is never Claudesk's to remove.
//! - the recorded path **cannot be canonicalized** — a target that does not resolve on disk
//!   cannot be inspected, so it cannot be approved.
//! - the resolved target **is a protected root** (the home dir itself, or `~/.claude/`),
//!   **sits inside `~/.claude/`**, or **contains a protected root** (an ancestor of home —
//!   which includes the filesystem root). These are the paths whose loss is the operator's
//!   whole machine or their live workflow system.
//! - the resolved target **is not a directory**, or **does not carry `uninstall.sh`** — a
//!   managed clone always has the script (Claudesk cloned a repo that ships it), so its
//!   absence means this is not the directory the record described.
//!
//! ## Canonicalize BOTH sides, always
//! Every comparison below happens on canonicalized paths. `Path::starts_with` is a literal
//! component comparison: on macOS `/var` symlinks to `/private/var`, so an uncanonicalized
//! compare calls a contained path an escape — and, in the direction that matters here, a
//! symlink at the recorded location that RESOLVES to a protected root would pass a literal
//! compare while aiming a delete at the real thing. WP3.5a proved this live: a planted
//! symlink escape sailed past two `starts_with` containment asserts built on constructed
//! paths. The approved target inside [`UninstallTarget`] is therefore a **canonicalized
//! filesystem observation**, and downstream code must report *it*, not the record's literal.
//!
//! ## Belt-and-braces, not either/or
//! `uninstall.sh` itself refuses to remove symlinks that do not resolve into its own repo
//! (script finding 3, audited 2026-07-29). That second line of defense does not relax this
//! one: even a catastrophic provenance bug must degrade to "the script refuses" only after
//! *this* guard already refused. Both guards, not either.

use std::path::{Path, PathBuf};

use super::provenance::InstallRecord;

/// The uninstall script a managed clone must carry. The guard checks for its presence; the
/// runner (Phase 2) executes it. One constant so the two cannot drift.
pub const UNINSTALL_SCRIPT: &str = "uninstall.sh";

/// A target the refuse-guard has approved for uninstall.
///
/// The path inside is a **canonicalized observation** of the recorded clone dir. The field
/// is private and [`refuse_guard`] is the only constructor — the type system, not review
/// discipline, is what keeps every deleting path behind the guard.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UninstallTarget {
    clone_dir: PathBuf,
}

impl UninstallTarget {
    /// The approved, canonicalized clone directory.
    pub fn clone_dir(&self) -> &Path {
        &self.clone_dir
    }
}

/// Why the guard refused. Each arm is a distinct, testable value — the refusal is the
/// feature, so every arm carries its own unit test and its own user-explainable meaning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefusalReason {
    /// No well-formed provenance record. Claudesk cannot prove it installed this substrate,
    /// so it is not Claudesk's to remove — the `Developer` posture, enforced at the deleting
    /// layer. Covers absent, unreadable, AND corrupt records (collapsed upstream), and the
    /// vendor-dir hand-clone.
    NoRecord,
    /// The recorded path does not resolve on disk (gone, or IO error during resolution).
    RecordedPathUnresolvable { recorded: PathBuf },
    /// The recorded path resolves to the home directory itself.
    TargetIsHome { resolved: PathBuf },
    /// The recorded path resolves to `~/.claude/` or somewhere inside it. That tree is the
    /// live substrate — the thing `uninstall.sh` edits link-by-link with its own guards —
    /// never a directory Claudesk may treat as a removable clone.
    TargetInClaudeDir { resolved: PathBuf },
    /// The recorded path resolves to an ANCESTOR of a protected root (includes `/`).
    /// Removing it would remove the protected root with it.
    TargetContainsProtectedRoot { resolved: PathBuf },
    /// The recorded path resolves to something that is not a directory.
    NotADirectory { resolved: PathBuf },
    /// The resolved directory does not carry `uninstall.sh` — whatever this is, it is not
    /// the managed clone the record described.
    MissingUninstallScript { resolved: PathBuf },
}

impl RefusalReason {
    /// The user-facing explanation of a refusal.
    ///
    /// Lives with the type so the vocabulary and its rendering cannot drift apart; consumed
    /// by the terminal-state reducer. Every message states what was (not) done — a refusal
    /// deletes nothing, and saying so is part of the safety surface.
    pub fn user_message(&self) -> String {
        match self {
            RefusalReason::NoRecord => "Claudesk has no record of installing this workflow \
                 system, so it will not remove it. If you installed it yourself, remove it \
                 the same way you installed it. Nothing was changed."
                .to_string(),
            RefusalReason::RecordedPathUnresolvable { recorded } => format!(
                "The recorded install location ({}) no longer resolves on disk, so there is \
                 nothing Claudesk can safely remove. Nothing was changed.",
                recorded.display()
            ),
            RefusalReason::TargetIsHome { resolved } => format!(
                "The recorded install location resolves to your home directory ({}). \
                 Claudesk refuses to remove it. Nothing was changed.",
                resolved.display()
            ),
            RefusalReason::TargetInClaudeDir { resolved } => format!(
                "The recorded install location resolves into ~/.claude ({}), the live \
                 substrate itself. Claudesk refuses to remove it. Nothing was changed.",
                resolved.display()
            ),
            RefusalReason::TargetContainsProtectedRoot { resolved } => format!(
                "The recorded install location ({}) contains your home directory. Claudesk \
                 refuses to remove it. Nothing was changed.",
                resolved.display()
            ),
            RefusalReason::NotADirectory { resolved } => format!(
                "The recorded install location ({}) is not a directory. Nothing was changed.",
                resolved.display()
            ),
            RefusalReason::MissingUninstallScript { resolved } => format!(
                "The directory at {} does not contain uninstall.sh, so it does not look like \
                 the installed workflow system. Nothing was changed.",
                resolved.display()
            ),
        }
    }
}

/// Resolve a path for comparison, following symlinks where it exists; a path that does not
/// exist keeps its literal form (same failure direction as the sandbox fixture's helper:
/// unresolvable components are still caught by the comparisons they fail).
fn canonical(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

/// The refuse-guard: turn a provenance record into an approved [`UninstallTarget`], or
/// refuse with a [`RefusalReason`].
///
/// `home` arrives as a parameter — no ambient root resolution below the `commands` layer,
/// per the module's rule 1 (that is what makes the sandbox able to exercise every arm).
/// `record` is whatever [`super::provenance::read_record`] returned; passing `None` refuses.
///
/// The target is taken from the record and ONLY the record. There is deliberately no
/// parameter for "the path the caller thinks should be uninstalled" — a resolved filesystem
/// path is not provenance, and accepting one would reintroduce exactly the inference the
/// high-priority SURFACE forbids.
pub fn refuse_guard(
    record: Option<&InstallRecord>,
    home: &Path,
) -> Result<UninstallTarget, RefusalReason> {
    let record = record.ok_or(RefusalReason::NoRecord)?;

    // A canonicalization FAILURE here is a refusal, not a fallback: unlike the comparisons
    // below (where a literal form still gets compared), an unresolvable target cannot be
    // inspected for the script check, so it cannot be approved.
    let resolved =
        record
            .clone_path
            .canonicalize()
            .map_err(|_| RefusalReason::RecordedPathUnresolvable {
                recorded: record.clone_path.clone(),
            })?;

    // Both protected roots, canonicalized. `~/.claude` may legitimately not exist (nothing
    // installed yet) — its literal-form fallback still compares correctly against the
    // resolved target, and if it is a symlink (the operator's machine!) the canonical form
    // is the one a resolved target could collide with.
    let home_resolved = canonical(home);
    let claude_resolved = canonical(&home.join(".claude"));

    if resolved == home_resolved {
        return Err(RefusalReason::TargetIsHome { resolved });
    }
    if resolved == claude_resolved || resolved.starts_with(&claude_resolved) {
        return Err(RefusalReason::TargetInClaudeDir { resolved });
    }
    if home_resolved.starts_with(&resolved) || claude_resolved.starts_with(&resolved) {
        return Err(RefusalReason::TargetContainsProtectedRoot { resolved });
    }
    if !resolved.is_dir() {
        return Err(RefusalReason::NotADirectory { resolved });
    }
    if !resolved.join(UNINSTALL_SCRIPT).is_file() {
        return Err(RefusalReason::MissingUninstallScript { resolved });
    }

    Ok(UninstallTarget {
        clone_dir: resolved,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow_install::sandbox::Sandbox;
    use crate::workflow_install::source_guard;
    use std::fs;

    /// A record pointing at `clone_path`, shaped like a real install's.
    fn a_record(clone_path: PathBuf) -> InstallRecord {
        InstallRecord {
            clone_path,
            installed_at: "2026-07-31T12:00:00Z".to_string(),
            origin_url: "git@example.com:someone/repo.git".to_string(),
        }
    }

    /// A managed-looking clone dir inside the sandbox's vendor dir: a real directory
    /// carrying a real `uninstall.sh` file, the shape the guard approves.
    fn a_managed_clone(sandbox: &Sandbox) -> PathBuf {
        let dir = sandbox.vendor_dir().join("my-claude-code-customization");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(UNINSTALL_SCRIPT), "#!/usr/bin/env bash\n").unwrap();
        dir
    }

    #[test]
    fn no_record_is_refused() {
        // The Developer/absent posture at the deleting layer: no proof of installing means
        // nothing to approve — even though a perfectly deletable-looking dir exists.
        let sandbox = Sandbox::new();
        let _tempting = a_managed_clone(&sandbox);

        assert_eq!(
            refuse_guard(None, &sandbox.home()),
            Err(RefusalReason::NoRecord)
        );
    }

    #[test]
    fn a_hand_clone_in_the_vendor_dir_is_refused_without_a_record() {
        // ═══════════════════════════════════════════════════════════════════════════
        // Location is not provenance, at the layer where it arms a delete. The clone
        // sits in Claudesk's OWN vendor dir, carries the script, looks exactly like a
        // managed install — and is refused, because no record says Claudesk made it.
        // This is the arm protecting a user's hand-clone (and, upstream of it, the
        // operator's live repo, which reads Developer for the same reason).
        // ═══════════════════════════════════════════════════════════════════════════
        let sandbox = Sandbox::new();
        let hand_clone = a_managed_clone(&sandbox);
        assert!(
            hand_clone.starts_with(sandbox.vendor_dir()),
            "fixture must sit inside the vendor dir to exercise the tempting case"
        );

        assert_eq!(
            refuse_guard(None, &sandbox.home()),
            Err(RefusalReason::NoRecord),
            "an unrecorded clone must be refused even inside Claudesk's own vendor dir"
        );
    }

    #[test]
    fn a_recorded_path_that_no_longer_exists_is_refused() {
        let sandbox = Sandbox::new();
        let gone = sandbox.vendor_dir().join("deleted-by-hand");
        let record = a_record(gone.clone());

        assert_eq!(
            refuse_guard(Some(&record), &sandbox.home()),
            Err(RefusalReason::RecordedPathUnresolvable { recorded: gone })
        );
    }

    #[test]
    fn a_record_naming_home_itself_is_refused() {
        let sandbox = Sandbox::new();
        let record = a_record(sandbox.home());

        assert_eq!(
            refuse_guard(Some(&record), &sandbox.home()),
            Err(RefusalReason::TargetIsHome {
                resolved: sandbox.home().canonicalize().unwrap()
            })
        );
    }

    #[test]
    fn a_record_naming_the_claude_dir_is_refused() {
        let sandbox = Sandbox::new();
        let record = a_record(sandbox.claude_dir());

        assert_eq!(
            refuse_guard(Some(&record), &sandbox.home()),
            Err(RefusalReason::TargetInClaudeDir {
                resolved: sandbox.claude_dir().canonicalize().unwrap()
            })
        );
    }

    #[test]
    fn a_record_naming_a_path_inside_the_claude_dir_is_refused() {
        // e.g. a corrupted-then-"repaired" record naming ~/.claude/skills. Deleting it
        // would remove the user's real skills tree, so inside-.claude refuses wholesale.
        let sandbox = Sandbox::new();
        let skills = sandbox.claude_dir().join("skills");
        fs::create_dir_all(&skills).unwrap();
        let record = a_record(skills.clone());

        assert_eq!(
            refuse_guard(Some(&record), &sandbox.home()),
            Err(RefusalReason::TargetInClaudeDir {
                resolved: skills.canonicalize().unwrap()
            })
        );
    }

    #[test]
    fn a_record_naming_an_ancestor_of_home_is_refused() {
        // Removing an ancestor removes home with it. The filesystem root is the extreme
        // case of this same arm; the sandbox boundary is the testable one.
        let sandbox = Sandbox::new();
        let ancestor = sandbox.boundary().to_path_buf();
        let record = a_record(ancestor.clone());

        assert_eq!(
            refuse_guard(Some(&record), &sandbox.home()),
            Err(RefusalReason::TargetContainsProtectedRoot {
                resolved: ancestor.canonicalize().unwrap()
            })
        );
    }

    #[test]
    fn a_record_naming_a_file_is_refused() {
        let sandbox = Sandbox::new();
        let file = sandbox.vendor_dir().join("not-a-dir");
        fs::write(&file, b"bytes").unwrap();
        let record = a_record(file.clone());

        assert_eq!(
            refuse_guard(Some(&record), &sandbox.home()),
            Err(RefusalReason::NotADirectory {
                resolved: file.canonicalize().unwrap()
            })
        );
    }

    #[test]
    fn a_clone_dir_missing_the_uninstall_script_is_refused() {
        // Whatever this directory is, it is not the clone the record described — approving
        // it would hand Phase 2 a directory removal with no script to run first.
        let sandbox = Sandbox::new();
        let dir = sandbox.vendor_dir().join("script-went-missing");
        fs::create_dir_all(&dir).unwrap();
        let record = a_record(dir.clone());

        assert_eq!(
            refuse_guard(Some(&record), &sandbox.home()),
            Err(RefusalReason::MissingUninstallScript {
                resolved: dir.canonicalize().unwrap()
            })
        );
    }

    #[test]
    fn a_recorded_symlink_resolving_to_home_is_refused() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The symlink-escape arm, with the escape CREATED ON DISK — a lesson paid for
        // twice in WP3.5a: a containment assert on test-constructed paths passed a real
        // escape, and a meta-test with a non-existent escape path compared literal-vs-
        // canonical forms and failed for the wrong reason. The record's literal path
        // sits harmlessly inside the vendor dir; its RESOLUTION is the home dir. A
        // literal comparison approves it; the canonicalized one refuses it as home.
        // ═══════════════════════════════════════════════════════════════════════════
        let sandbox = Sandbox::new();
        let link = sandbox.vendor_dir().join("looks-like-a-clone");
        std::os::unix::fs::symlink(sandbox.home(), &link).unwrap();
        let record = a_record(link.clone());

        assert_eq!(
            refuse_guard(Some(&record), &sandbox.home()),
            Err(RefusalReason::TargetIsHome {
                resolved: sandbox.home().canonicalize().unwrap()
            }),
            "a symlink resolving to home must be refused AS home — the literal form of \
             the recorded path is irrelevant, only the observation counts"
        );
    }

    #[test]
    fn the_guard_approves_a_recorded_managed_clone() {
        let sandbox = Sandbox::new();
        let clone_dir = a_managed_clone(&sandbox);
        let record = a_record(clone_dir.clone());

        let target = refuse_guard(Some(&record), &sandbox.home())
            .expect("a recorded, script-carrying clone dir must be approved");

        assert_eq!(
            target.clone_dir(),
            clone_dir.canonicalize().unwrap(),
            "the approved target must be the canonicalized observation of the clone dir"
        );
    }

    #[test]
    fn the_approved_target_is_a_canonicalized_observation_not_the_records_literal() {
        // A record whose literal path is a symlink to a legitimate clone: approval must
        // hand downstream the RESOLVED directory, so everything later (the script spawn,
        // the removal, the UI's path list) reports what will actually be touched.
        let sandbox = Sandbox::new();
        let real = a_managed_clone(&sandbox);
        let link = sandbox.vendor_dir().join("alias");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let record = a_record(link);

        let target =
            refuse_guard(Some(&record), &sandbox.home()).expect("resolves to a real clone");

        assert_eq!(target.clone_dir(), real.canonicalize().unwrap());
        assert_ne!(
            target.clone_dir(),
            record.clone_path,
            "the target must be the observation, not an echo of the record"
        );
    }

    #[test]
    fn a_corrupt_record_on_disk_is_refused_end_to_end() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The COMPOSED chain, not the pairwise links: real corrupt bytes on disk →
        // `read_record` → `refuse_guard`. The pairwise versions live in three files
        // (corrupt→None in provenance, None→Developer in mod, None→refused here), and
        // WP3.5a's codify gap was exactly this shape — every `Managed` assertion fed
        // hand-built records, so no test proved the real chain end-to-end. A tempting,
        // fully deletable-looking clone sits there while the guard refuses.
        // ═══════════════════════════════════════════════════════════════════════════
        let sandbox = Sandbox::new();
        let _tempting = a_managed_clone(&sandbox);
        fs::write(
            crate::workflow_install::provenance::record_path(&sandbox.claudesk_root()),
            b"{ corrupt and unparseable",
        )
        .unwrap();

        let record = crate::workflow_install::provenance::read_record(&sandbox.claudesk_root());

        assert!(record.is_none(), "corrupt bytes must read as None");
        assert_eq!(
            refuse_guard(record.as_ref(), &sandbox.home()),
            Err(RefusalReason::NoRecord),
            "file corruption must never arm a delete — the composed chain must land on \
             refusal, same as no record at all"
        );
    }

    #[test]
    fn a_written_record_read_back_from_disk_is_approved_end_to_end() {
        // The happy-path composition: `write_record` → `read_record` → `refuse_guard`.
        // Proves the serialization round-trip actually feeds the guard what it approves —
        // the chain Phase 2's command layer will run verbatim.
        let sandbox = Sandbox::new();
        let clone_dir = a_managed_clone(&sandbox);
        crate::workflow_install::provenance::write_record(
            &sandbox.claudesk_root(),
            &a_record(clone_dir.clone()),
        )
        .unwrap();

        let record = crate::workflow_install::provenance::read_record(&sandbox.claudesk_root());

        let target = refuse_guard(record.as_ref(), &sandbox.home())
            .expect("a recorded managed clone read back from disk must be approved");
        assert_eq!(target.clone_dir(), clone_dir.canonicalize().unwrap());
    }

    #[test]
    fn roots_are_injected_never_ambient() {
        // The same rule every sibling module carries, on the module that AUTHORIZES
        // deletes: one ambient home resolution here and the sandbox can no longer
        // exercise the refusal arms against a fake home.
        let code = source_guard::production_code(include_str!("guard.rs"));

        for forbidden in ["home_dir", "env::var", "std::env", "dirs::home"] {
            assert!(
                !code.contains(forbidden),
                "guard must not resolve roots ambiently (`{forbidden}`) — home arrives as \
                 a parameter so every refusal arm is sandbox-testable"
            );
        }

        // Positive half, tail-anchored (truncation eats tails).
        assert!(
            code.contains("fn refuse_guard"),
            "the guard function must live here"
        );
    }
}
