//! What a finished install run means for the gate, the disk, and the user (M10.9 WP3.5a task
//! 3.5.6a / P3.1–P3.4).
//!
//! ## Why this is a separate, pure module
//! Root `CLAUDE.md` names this class explicitly: async control flow with revert semantics must be
//! **a pure function asserted as a value, never a `?raw` source guard**. WP2 paid for that lesson
//! twice — one source-text guard passed while the behavior was broken, another silently stopped
//! matching after a formatter reflow. So the decision "what does this outcome mean?" is extracted
//! here, where a table test can assert it as data, and [`runner`](super::runner) is left doing
//! only mechanics: spawn, stream, report what happened.
//!
//! The split is worth stating plainly because it is easy to erode: **`runner` reports, `terminal`
//! decides, the caller acts.** A `runner` that started deciding whether to revert the gate, or a
//! `terminal` that started spawning, would put policy back inside async code where only an
//! integration test can reach it.
//!
//! ## The invariant this module exists to protect
//! **The gate is never left ON claiming a substrate that is not there.** Every non-success outcome
//! resolves to [`GateAction::RevertToOff`]. That is the whole reason a wizard failure cannot be
//! shrugged off: the gate is what makes M11's Docs tab and M12's auto-resume appear, and those
//! features have nothing to act on without the substrate. A lying gate is worse than a failed
//! install, because the failure is at least legible.
//!
//! ## Cleanup is DECIDED here and PERFORMED by the caller
//! [`TerminalState::cleanup`] says whether a partial clone should be removed — it does not remove
//! it. WP3.5a ships no deleting path at all (guarded by a source test in `runner`), so the
//! *decision* can live here while the *act* waits for a layer that is allowed to delete. Phase 4's
//! command layer performs it; until then a `Cleanup::RemovePartialClone` is surfaced to the user as
//! "a partial clone remains at `<path>`" rather than silently actioned. Honest, and it keeps the
//! additive half additive.

use super::runner::{InstallError, UninstallError};

/// What must happen to `workflow_features_enabled` after a run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateAction {
    /// The install succeeded and was recorded. The gate may stay on.
    LeaveOn,
    /// Anything else. The gate must go back off — see the module header's invariant.
    RevertToOff,
}

/// What, if anything, is left on disk that should not be.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cleanup {
    /// Nothing to do: either nothing was created, or what was created is wanted.
    None,
    /// A partial or unwanted clone is present and should be removed.
    ///
    /// **Decided here, performed by the caller** (see the module header). WP3.5a has no deleting
    /// path, so today this surfaces to the user as a stated fact rather than an action.
    RemovePartialClone,
}

/// The resolved meaning of a finished run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalState {
    /// What to do with the gate.
    pub gate: GateAction,
    /// What to do about anything left on disk.
    pub cleanup: Cleanup,
    /// The message to show the user.
    ///
    /// For failures this carries the **subprocess's own output** — `git`'s stderr or
    /// `install.sh`'s text — because that is the only thing that distinguishes "no network" from
    /// "auth prompt" from "no disk". A Claudesk-authored paraphrase would drop exactly the detail
    /// the user needs. `None` on success.
    pub surfaced_error: Option<String>,
    /// Whether the substrate is installed *despite* an error.
    ///
    /// True only for [`InstallError::RecordWriteFailed`] — the one outcome where the two disagree.
    /// The UI needs this to avoid telling someone to retry an install they already have.
    pub substrate_installed: bool,
}

/// Reduce a finished run to its meaning. **Pure** — no IO, no clock, no filesystem.
///
/// `outcome` is `Ok(())` on a fully successful run (clone + install + record), or the
/// [`InstallError`] the runner reported.
pub fn resolve_terminal_state(outcome: Result<(), &InstallError>) -> TerminalState {
    let err = match outcome {
        Ok(()) => {
            return TerminalState {
                gate: GateAction::LeaveOn,
                cleanup: Cleanup::None,
                surfaced_error: None,
                substrate_installed: true,
            }
        }
        Err(e) => e,
    };

    // Every arm below reverts the gate. That uniformity is deliberate and is the invariant —
    // written as an explicit per-arm value rather than a shared default so that adding a variant
    // forces a decision instead of silently inheriting `RevertToOff`.
    match err {
        // `git` isn't on PATH. Nothing ran, nothing was created.
        InstallError::GitUnavailable(msg) => TerminalState {
            gate: GateAction::RevertToOff,
            cleanup: Cleanup::None,
            surfaced_error: Some(msg.clone()),
            substrate_installed: false,
        },

        // The clone failed — network, auth, bad URL, or a full disk. `git` cleans up after itself
        // on most failures, but not reliably on a disk-full or a kill, so a partial tree may
        // remain and the user must be told.
        InstallError::CloneFailed { .. } => TerminalState {
            gate: GateAction::RevertToOff,
            cleanup: Cleanup::RemovePartialClone,
            surfaced_error: Some(err.to_string()),
            substrate_installed: false,
        },

        // A complete clone of the WRONG repository. Cleanup is warranted: the user picked a bad
        // URL, and leaving an unrelated repo in Claudesk's vendor dir would later read as a
        // developer install and confuse the substrate surface.
        InstallError::InstallScriptMissing(_) => TerminalState {
            gate: GateAction::RevertToOff,
            cleanup: Cleanup::RemovePartialClone,
            surfaced_error: Some(err.to_string()),
            substrate_installed: false,
        },

        // The script exists but could not be executed (not executable, bad interpreter). The clone
        // is intact and correct, so removing it would throw away a good download for a fixable
        // problem.
        InstallError::InstallUnavailable(msg) => TerminalState {
            gate: GateAction::RevertToOff,
            cleanup: Cleanup::None,
            surfaced_error: Some(msg.clone()),
            substrate_installed: false,
        },

        // `install.sh` ran and exited non-zero. **No cleanup** — the script is idempotent, so the
        // clone is a valid starting point for a retry, and deleting it would force a re-download
        // for nothing. Note the substrate may be PARTIALLY linked here; the script's own re-run
        // repairs that, which is why Claudesk must not try to.
        InstallError::InstallFailed { .. } => TerminalState {
            gate: GateAction::RevertToOff,
            cleanup: Cleanup::None,
            surfaced_error: Some(err.to_string()),
            substrate_installed: false,
        },

        // The one split outcome: the substrate IS installed, but unrecorded.
        //
        // Gate still reverts — not because the substrate is missing, but because Claudesk cannot
        // prove it owns it, so the honest state is `Developer`, and the gate should reflect a
        // deliberate user choice rather than a half-finished wizard. `substrate_installed: true`
        // is what stops the UI telling the user to install something they already have.
        InstallError::RecordWriteFailed(_) => TerminalState {
            gate: GateAction::RevertToOff,
            cleanup: Cleanup::None,
            surfaced_error: Some(err.to_string()),
            substrate_installed: true,
        },

        // The user cancelled. Cleanup depends on whether a clone actually landed — the runner
        // reports that rather than this module guessing, since only the runner knows how far it
        // got.
        InstallError::Cancelled { clone_exists } => TerminalState {
            gate: GateAction::RevertToOff,
            cleanup: if *clone_exists {
                Cleanup::RemovePartialClone
            } else {
                Cleanup::None
            },
            surfaced_error: Some(if *clone_exists {
                "Install cancelled. A partial download was left behind.".to_string()
            } else {
                "Install cancelled.".to_string()
            }),
            substrate_installed: false,
        },
    }
}

/// What happened to the provenance record after an uninstall run.
///
/// A first-class value rather than a bool because it is THE safety-relevant fact of the
/// uninstall half: only a fully successful removal may forget the record
/// (`SURFACE-2026-07-30-WP3.5B-UNINSTALL-MUST-CLEAR-THE-PROVENANCE-RECORD`), and every
/// failure keeps it describing what still exists.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordFate {
    /// The record survives — every non-success outcome.
    Kept,
    /// The record was deleted — the fully-successful outcome only.
    Deleted,
}

/// The resolved meaning of a finished uninstall run.
///
/// Note what is NOT here: a gate action. Unlike the install half (where a failure must
/// revert an optimistic enable), the uninstall's gate movement belongs to the 3-intent
/// dialog — the user's button choice sets the gate, and the run's outcome does not
/// second-guess it (spec assumption 2: the gate lands disabled even on a failed uninstall;
/// the record staying `Kept` is what keeps a retry reachable).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UninstallTerminalState {
    /// What happened to the provenance record.
    pub record: RecordFate,
    /// The message to show the user — the subprocess's own text where there is one, the
    /// refuse-guard's explanation for a refusal. `None` on success.
    pub surfaced_error: Option<String>,
    /// True only when everything is gone: script ran, clone removed, record deleted.
    pub removal_complete: bool,
    /// Whether re-running the uninstall wizard is the recovery path. False on success
    /// (nothing to retry), on a refusal (re-running re-refuses — the message says what to
    /// do instead), and on a record-delete failure (the remaining fix is removing one file,
    /// which the message states; a re-run would be refused as unresolvable).
    pub retry_available: bool,
}

/// Reduce a finished uninstall run to its meaning. **Pure** — no IO, no clock.
///
/// Per-arm, no wildcard, no shared default: adding an [`UninstallError`] variant fails to
/// compile until someone decides its row — the compiler's exhaustive `match` is the ONLY
/// reliable coverage enforcement for a decision table
/// (`SURFACE-2026-07-29-REMEMBER-TO-REGISTER-GUARDS-ARE-NOT-GUARDS`: three attempts at a
/// counted/enumerated coverage guard were each defeated by the same act of forgetting).
pub fn resolve_uninstall_terminal_state(
    outcome: Result<(), &UninstallError>,
) -> UninstallTerminalState {
    let err = match outcome {
        Ok(()) => {
            return UninstallTerminalState {
                record: RecordFate::Deleted,
                surfaced_error: None,
                removal_complete: true,
                retry_available: false,
            }
        }
        Err(e) => e,
    };

    match err {
        // The refuse-guard said no. Nothing ran; the record (if any) is untouched. The
        // guard's own message explains — it is the one place refusal language lives.
        UninstallError::Refused(reason) => UninstallTerminalState {
            record: RecordFate::Kept,
            surfaced_error: Some(reason.user_message()),
            removal_complete: false,
            retry_available: false,
        },

        // The script could not be spawned. Nothing was changed; fix the cause and retry.
        UninstallError::ScriptUnavailable(msg) => UninstallTerminalState {
            record: RecordFate::Kept,
            surfaced_error: Some(msg.clone()),
            removal_complete: false,
            retry_available: true,
        },

        // The script ran and failed. It is idempotent — a retry finishes what it started.
        // The clone and record both remain, so the state stays managed and re-offerable.
        UninstallError::ScriptFailed { .. } => UninstallTerminalState {
            record: RecordFate::Kept,
            surfaced_error: Some(err.to_string()),
            removal_complete: false,
            retry_available: true,
        },

        // The script succeeded but the clone dir would not delete. A partial tree may
        // remain; the record remains and still describes it — delete-last is what makes
        // this arm safe rather than lying.
        UninstallError::CloneRemoveFailed { .. } => UninstallTerminalState {
            record: RecordFate::Kept,
            surfaced_error: Some(err.to_string()),
            removal_complete: false,
            retry_available: true,
        },

        // Everything is gone except the record. The one arm where "kept" is a PROBLEM to
        // surface rather than a safety property: Claudesk will keep reading `managed` for a
        // substrate that no longer exists until the record file is removed. Not retryable
        // through the wizard (the recorded path no longer resolves, so the guard would
        // refuse); the message carries what remains.
        UninstallError::RecordDeleteFailed(_) => UninstallTerminalState {
            record: RecordFate::Kept,
            surfaced_error: Some(err.to_string()),
            removal_complete: false,
            retry_available: false,
        },

        // Cancelled between steps. `script_ran` decides the honest message: before the
        // script nothing changed at all; after it, the symlinks are gone while the download
        // and record remain (idempotent re-run finishes the job).
        UninstallError::Cancelled { script_ran } => UninstallTerminalState {
            record: RecordFate::Kept,
            surfaced_error: Some(if *script_ran {
                "Uninstall cancelled after the script ran — the workflow links are removed, \
                 but the download and the install record remain. Run uninstall again to \
                 finish."
                    .to_string()
            } else {
                "Uninstall cancelled. Nothing was changed.".to_string()
            }),
            removal_complete: false,
            retry_available: true,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One row of the terminal-state table: an outcome and everything it must mean.
    struct Row {
        name: &'static str,
        outcome: Result<(), InstallError>,
        gate: GateAction,
        cleanup: Cleanup,
        substrate_installed: bool,
        /// A fragment the surfaced message must contain — the subprocess's own text where there
        /// is one. Empty means "no message expected".
        message_contains: &'static str,
    }

    fn table() -> Vec<Row> {
        vec![
            Row {
                name: "success",
                outcome: Ok(()),
                gate: GateAction::LeaveOn,
                cleanup: Cleanup::None,
                substrate_installed: true,
                message_contains: "",
            },
            Row {
                name: "git not on PATH",
                outcome: Err(InstallError::GitUnavailable(
                    "No such file or directory (os error 2)".to_string(),
                )),
                gate: GateAction::RevertToOff,
                cleanup: Cleanup::None,
                substrate_installed: false,
                message_contains: "os error 2",
            },
            Row {
                name: "clone failed (network/auth/disk)",
                outcome: Err(InstallError::CloneFailed {
                    code: 128,
                    output: "fatal: could not read Username".to_string(),
                }),
                gate: GateAction::RevertToOff,
                cleanup: Cleanup::RemovePartialClone,
                substrate_installed: false,
                message_contains: "could not read Username",
            },
            Row {
                name: "wrong repository (no install.sh)",
                outcome: Err(InstallError::InstallScriptMissing(
                    "/tmp/vendor/mccc".to_string(),
                )),
                gate: GateAction::RevertToOff,
                cleanup: Cleanup::RemovePartialClone,
                substrate_installed: false,
                message_contains: "right repository",
            },
            Row {
                name: "install.sh not executable",
                outcome: Err(InstallError::InstallUnavailable(
                    "Permission denied (os error 13)".to_string(),
                )),
                gate: GateAction::RevertToOff,
                cleanup: Cleanup::None,
                substrate_installed: false,
                message_contains: "os error 13",
            },
            Row {
                name: "install.sh exited non-zero",
                outcome: Err(InstallError::InstallFailed {
                    code: 3,
                    output: "  [skip] skills/foo (exists but is not a symlink)".to_string(),
                }),
                gate: GateAction::RevertToOff,
                cleanup: Cleanup::None,
                substrate_installed: false,
                message_contains: "is not a symlink",
            },
            Row {
                name: "installed but record unwritable",
                outcome: Err(InstallError::RecordWriteFailed(
                    "Read-only file system (os error 30)".to_string(),
                )),
                gate: GateAction::RevertToOff,
                cleanup: Cleanup::None,
                substrate_installed: true, // ← the split outcome
                message_contains: "installed successfully",
            },
            Row {
                name: "cancelled before the clone landed",
                outcome: Err(InstallError::Cancelled {
                    clone_exists: false,
                }),
                gate: GateAction::RevertToOff,
                cleanup: Cleanup::None,
                substrate_installed: false,
                message_contains: "cancelled",
            },
            Row {
                name: "cancelled after the clone landed",
                outcome: Err(InstallError::Cancelled { clone_exists: true }),
                gate: GateAction::RevertToOff,
                cleanup: Cleanup::RemovePartialClone,
                substrate_installed: false,
                message_contains: "partial download",
            },
        ]
    }

    #[test]
    fn the_terminal_state_table_holds_for_every_outcome() {
        // ═══════════════════════════════════════════════════════════════════════════
        // THE table test. Asserted as VALUES, not as source text — root `CLAUDE.md:190-192`
        // names this exact class (async control flow with revert semantics), and WP2 paid
        // twice for `?raw` guards that passed while the behavior was broken.
        //
        // Every row is a full specification: gate, cleanup, substrate-installed, and a
        // fragment of the message. Nothing is checked by omission.
        // ═══════════════════════════════════════════════════════════════════════════
        for row in table() {
            let state = resolve_terminal_state(row.outcome.as_ref().map(|_| ()));

            assert_eq!(state.gate, row.gate, "[{}] wrong gate action", row.name);
            assert_eq!(
                state.cleanup, row.cleanup,
                "[{}] wrong cleanup decision",
                row.name
            );
            assert_eq!(
                state.substrate_installed, row.substrate_installed,
                "[{}] wrong substrate_installed",
                row.name
            );

            if row.message_contains.is_empty() {
                assert!(
                    state.surfaced_error.is_none(),
                    "[{}] expected no message, got {:?}",
                    row.name,
                    state.surfaced_error
                );
            } else {
                let msg = state
                    .surfaced_error
                    .as_deref()
                    .unwrap_or_else(|| panic!("[{}] expected a message, got None", row.name));
                assert!(
                    msg.to_lowercase()
                        .contains(&row.message_contains.to_lowercase()),
                    "[{}] message must contain {:?}, got {msg:?}",
                    row.name,
                    row.message_contains
                );
            }
        }
    }

    /// A stable name per `InstallError` variant, via an **exhaustive** match.
    ///
    /// The exhaustiveness is the whole mechanism: adding a variant to `InstallError` fails to
    /// compile here until it is named, and [`the_table_covers_every_error_variant`] then fails
    /// until the table gains a row for that name. Compiler forces the arm; the test forces the row.
    fn variant_name(err: &InstallError) -> &'static str {
        match err {
            InstallError::GitUnavailable(_) => "GitUnavailable",
            InstallError::CloneFailed { .. } => "CloneFailed",
            InstallError::InstallScriptMissing(_) => "InstallScriptMissing",
            InstallError::InstallUnavailable(_) => "InstallUnavailable",
            InstallError::InstallFailed { .. } => "InstallFailed",
            InstallError::RecordWriteFailed(_) => "RecordWriteFailed",
            InstallError::Cancelled { .. } => "Cancelled",
        }
    }

    /// One CONSTRUCTED instance of every `InstallError` variant.
    ///
    /// ⚠️ **This must be a list of real values, never a list of name strings.** A hand-written
    /// `[&str; N]` of names is defeated by the very mutation this guard exists to catch: adding a
    /// variant and its `variant_name` arm while forgetting the list leaves `expected` short, so the
    /// missing table row goes undetected. That is not hypothetical — it is exactly how my first
    /// rebuild of this guard failed the 8th-variant experiment (2026-07-29), reproducing the defect
    /// it was written to fix.
    ///
    /// Values work because `variant_name`'s match is **exhaustive**: a new variant fails to compile
    /// until it is named there, and the reviewer adding it lands here to construct an instance.
    /// There is still a human step, but the compiler now stands between them and forgetting it —
    /// which the name-list version did not.
    fn one_of_every_error_variant() -> Vec<InstallError> {
        vec![
            InstallError::GitUnavailable(String::new()),
            InstallError::CloneFailed {
                code: 1,
                output: String::new(),
            },
            InstallError::InstallScriptMissing(String::new()),
            InstallError::InstallUnavailable(String::new()),
            InstallError::InstallFailed {
                code: 1,
                output: String::new(),
            },
            InstallError::RecordWriteFailed(String::new()),
            InstallError::Cancelled {
                clone_exists: false,
            },
        ]
    }

    #[test]
    fn the_table_covers_every_error_variant() {
        // Guards the table against the real decay mode: a NEW `InstallError` variant added in a
        // later phase, never given a row, silently inheriting whatever its match arm does.
        //
        // ⚠️ THIS TEST WAS THEATRE AND WAS REBUILT (verify-self, 2026-07-29).
        // The original counted rows against a `KNOWN_ERROR_VARIANTS = 7` constant with `>=`.
        // Because `Cancelled` contributes TWO rows (clone_exists true/false), the table already
        // had 8 error rows against 7 variants — so the assertion carried a unit of **permanent
        // slack** and passed with a variant entirely uncovered. Proven, not theorized: a subagent
        // added an 8th variant with a match arm and NO table row, and all 52 tests stayed green.
        // It also degraded monotonically — a second boolean-carrying variant would buy another
        // unit of slack, tolerating two uncovered variants.
        //
        // **The first REBUILD of this guard was ALSO defeated** — worth recording, because the
        // second failure is more instructive than the first. It compared the table's covered names
        // against a hand-written `ALL_ERROR_VARIANTS: [&str; 7]`. The 8th-variant experiment added
        // the variant, its `resolve_terminal_state` arm, and its `variant_name` arm (the compiler
        // demanded all three) — but not the name-list entry. `expected` stayed at 7, the missing
        // row went undetected, and the guard passed. I had rebuilt the same class of defect I was
        // fixing: a hand-maintained list with nothing forcing it into agreement.
        //
        // **And the SECOND rebuild was defeated too** — the version you are reading. It compares
        // the table against `one_of_every_error_variant()`, which is *also* hand-maintained: the
        // 8th-variant experiment omitted the new variant there as well, `expected` stayed at 7, and
        // the guard passed again. Three attempts, same hole.
        //
        // ⚠️ **SO BE CLEAR ABOUT WHAT THIS TEST DOES AND DOES NOT DO.** The honest conclusion after
        // three tries: **no test inside this module can force table coverage.** Every formulation
        // needs some human-maintained enumeration of the variants (a count, a name list, a value
        // list), and the single omission this guard exists to catch — "added a variant, forgot to
        // register it" — defeats each one identically, because forgetting the table row and
        // forgetting the enumeration are the *same* act of forgetting.
        //
        // What it DOES do, and what is genuinely worth its lines:
        //   • catches a table row DELETED while the enumeration keeps its entry (a real regression
        //     shape, and the direction that actually recurs in review);
        //   • catches a typo'd/renamed variant via the reverse `unknown` check below;
        //   • catches duplicates in the fixture via the length assertion.
        //
        // What FORCES a new variant to be handled is the **compiler**, not this test: adding one
        // breaks `resolve_terminal_state`'s exhaustive match and `variant_name`'s, so it cannot be
        // ignored — it simply might be handled without a *table row* proving its policy values.
        // Anyone adding a variant: add the row and the fixture entry. This test will not remind you.
        //
        // The transferable lesson (filed as a backlog SURFACE): **a "did you remember X?" guard
        // whose own mechanism also has to be remembered is not a guard.** Prefer moving the burden
        // to the compiler, or state the limit in the open — as here — rather than shipping a third
        // formulation of the same illusion.
        use std::collections::BTreeSet;

        let covered: BTreeSet<&str> = table()
            .iter()
            .filter_map(|r| r.outcome.as_ref().err().map(variant_name))
            .collect();
        let expected: BTreeSet<&str> = one_of_every_error_variant()
            .iter()
            .map(variant_name)
            .collect();

        // Catches the "constructed one variant twice / omitted one" slip in the fixture itself:
        // a `Vec` of values silently tolerates duplicates, and a duplicate would shrink
        // `expected` without any other signal.
        assert_eq!(
            expected.len(),
            one_of_every_error_variant().len(),
            "one_of_every_error_variant() has duplicate variants — every entry must be distinct, \
             or `expected` under-counts and the coverage check goes slack"
        );

        let missing: Vec<_> = expected.difference(&covered).collect();
        assert!(
            missing.is_empty(),
            "these InstallError variants have NO table row and so inherit their behavior \
             untested: {missing:?}. Add a row to `table()` — do not relax this assertion."
        );

        // The reverse direction, so a typo'd or deleted variant name cannot hide: every covered
        // name must be one the exhaustive `variant_name` match actually produces.
        let unknown: Vec<_> = covered.difference(&expected).collect();
        assert!(
            unknown.is_empty(),
            "the table covers names absent from one_of_every_error_variant(): {unknown:?} — likely a typo, \
             or a variant removed from `variant_name` without updating the list"
        );
    }

    #[test]
    fn every_non_success_outcome_reverts_the_gate() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The module's load-bearing invariant, asserted independently of the table so it
        // cannot be weakened by editing a single row.
        //
        // Why it matters: the gate is what makes M11's Docs tab and M12's auto-resume
        // appear. A gate left ON after a failed install promises features that have nothing
        // to act on — worse than the failure itself, because the failure is at least legible.
        // ═══════════════════════════════════════════════════════════════════════════
        for row in table() {
            let is_success = row.outcome.is_ok();
            let state = resolve_terminal_state(row.outcome.as_ref().map(|_| ()));

            if is_success {
                assert_eq!(state.gate, GateAction::LeaveOn, "[{}]", row.name);
            } else {
                assert_eq!(
                    state.gate,
                    GateAction::RevertToOff,
                    "[{}] EVERY failure must revert the gate — a gate left ON claims a \
                     substrate that is not there",
                    row.name
                );
            }
        }
    }

    #[test]
    fn only_a_failed_record_write_reports_the_substrate_as_installed_despite_an_error() {
        // The split outcome, pinned in both directions. If any other error arm ever set
        // `substrate_installed: true`, the UI would suppress the install affordance for someone
        // who genuinely has no substrate — stranding them with no way forward.
        for row in table() {
            let state = resolve_terminal_state(row.outcome.as_ref().map(|_| ()));
            let is_record_write_failure =
                matches!(row.outcome, Err(InstallError::RecordWriteFailed(_)));

            if row.outcome.is_err() && !is_record_write_failure {
                assert!(
                    !state.substrate_installed,
                    "[{}] only RecordWriteFailed may report the substrate as installed while \
                     erroring",
                    row.name
                );
            }
        }
    }

    #[test]
    fn a_cancel_reports_cleanup_only_when_a_clone_actually_landed() {
        // Honesty about disk state. Reporting a leftover clone that isn't there sends the user
        // hunting for a directory that does not exist; NOT reporting one that is there leaves
        // silent junk in their vendor dir.
        let before = resolve_terminal_state(Err(&InstallError::Cancelled {
            clone_exists: false,
        }));
        assert_eq!(before.cleanup, Cleanup::None);
        assert!(
            !before
                .surfaced_error
                .as_deref()
                .unwrap()
                .contains("partial"),
            "must not mention a partial download when none exists"
        );

        let after = resolve_terminal_state(Err(&InstallError::Cancelled { clone_exists: true }));
        assert_eq!(after.cleanup, Cleanup::RemovePartialClone);
        assert!(
            after.surfaced_error.as_deref().unwrap().contains("partial"),
            "must state that a partial download remains"
        );
    }

    #[test]
    fn a_nonzero_install_script_does_not_trigger_cleanup() {
        // Deliberate and worth pinning: `install.sh` is idempotent, so its clone is a valid
        // retry starting point. Deleting it would force a re-download to fix a problem the
        // script's own re-run repairs. This is the one arm where "failure" and "delete it" come
        // apart, so a future refactor is likely to get it wrong.
        let state = resolve_terminal_state(Err(&InstallError::InstallFailed {
            code: 1,
            output: "boom".to_string(),
        }));

        assert_eq!(
            state.cleanup,
            Cleanup::None,
            "a non-zero install.sh must NOT trigger cleanup — the script is idempotent and the \
             clone is a valid retry base"
        );
        assert_eq!(state.gate, GateAction::RevertToOff);
    }

    #[test]
    fn the_surfaced_message_carries_the_subprocess_output_verbatim() {
        // The scripts are the source of truth. A Claudesk paraphrase would drop the one detail
        // that distinguishes no-network from auth-prompt from no-disk.
        let state = resolve_terminal_state(Err(&InstallError::InstallFailed {
            code: 3,
            output: "  [skip] skills/feature-build (exists but is not a symlink)".to_string(),
        }));

        let msg = state.surfaced_error.unwrap();
        assert!(
            msg.contains("[skip] skills/feature-build (exists but is not a symlink)"),
            "the script's own text must survive into the message, got {msg:?}"
        );
    }

    // ─── WP3.5b Phase 2: the uninstall half of the table ───────────────────────────────

    /// One row of the uninstall terminal-state table.
    ///
    /// Completeness note (the honest one, per
    /// SURFACE-2026-07-29-REMEMBER-TO-REGISTER-GUARDS-ARE-NOT-GUARDS): no in-module test can
    /// force this list to cover every variant — forgetting the row and forgetting the
    /// enumeration are the same act of forgetting. The load-bearing enforcement is the
    /// resolver's own per-arm exhaustive `match`, which fails to COMPILE when a variant is
    /// added without a decision. This table asserts the decided VALUES.
    struct UninstallRow {
        name: &'static str,
        outcome: Result<(), UninstallError>,
        record: RecordFate,
        removal_complete: bool,
        retry_available: bool,
        message_contains: &'static str,
    }

    fn uninstall_table() -> Vec<UninstallRow> {
        use crate::workflow_install::guard::RefusalReason;
        vec![
            UninstallRow {
                name: "success",
                outcome: Ok(()),
                record: RecordFate::Deleted,
                removal_complete: true,
                retry_available: false,
                message_contains: "",
            },
            UninstallRow {
                name: "refused (no record)",
                outcome: Err(UninstallError::Refused(RefusalReason::NoRecord)),
                record: RecordFate::Kept,
                removal_complete: false,
                retry_available: false,
                message_contains: "Nothing was changed",
            },
            UninstallRow {
                name: "script not executable",
                outcome: Err(UninstallError::ScriptUnavailable(
                    "Permission denied (os error 13)".to_string(),
                )),
                record: RecordFate::Kept,
                removal_complete: false,
                retry_available: true,
                message_contains: "os error 13",
            },
            UninstallRow {
                name: "script exited non-zero",
                outcome: Err(UninstallError::ScriptFailed {
                    code: 2,
                    output: "uninstall.sh: unknown argument".to_string(),
                }),
                record: RecordFate::Kept,
                removal_complete: false,
                retry_available: true,
                message_contains: "unknown argument",
            },
            UninstallRow {
                name: "clone removal failed",
                outcome: Err(UninstallError::CloneRemoveFailed {
                    path: "/tmp/vendor/mccc".to_string(),
                    message: "Permission denied (os error 13)".to_string(),
                }),
                record: RecordFate::Kept,
                removal_complete: false,
                retry_available: true,
                message_contains: "could not remove the download",
            },
            UninstallRow {
                name: "record delete failed (everything else gone)",
                outcome: Err(UninstallError::RecordDeleteFailed(
                    "Read-only file system (os error 30)".to_string(),
                )),
                record: RecordFate::Kept,
                removal_complete: false,
                retry_available: false,
                message_contains: "install record could not be deleted",
            },
            UninstallRow {
                name: "cancelled before the script",
                outcome: Err(UninstallError::Cancelled { script_ran: false }),
                record: RecordFate::Kept,
                removal_complete: false,
                retry_available: true,
                message_contains: "Nothing was changed",
            },
            UninstallRow {
                name: "cancelled after the script",
                outcome: Err(UninstallError::Cancelled { script_ran: true }),
                record: RecordFate::Kept,
                removal_complete: false,
                retry_available: true,
                message_contains: "Run uninstall again to finish",
            },
        ]
    }

    #[test]
    fn the_uninstall_terminal_state_table_holds_for_every_outcome() {
        for row in uninstall_table() {
            let state = resolve_uninstall_terminal_state(row.outcome.as_ref().map(|_| ()));

            assert_eq!(state.record, row.record, "record fate for '{}'", row.name);
            assert_eq!(
                state.removal_complete, row.removal_complete,
                "removal_complete for '{}'",
                row.name
            );
            assert_eq!(
                state.retry_available, row.retry_available,
                "retry_available for '{}'",
                row.name
            );
            match &state.surfaced_error {
                None => assert!(
                    row.message_contains.is_empty(),
                    "'{}' expected a message containing {:?}, got none",
                    row.name,
                    row.message_contains
                ),
                Some(msg) => assert!(
                    msg.contains(row.message_contains),
                    "'{}' message must contain {:?}, got {msg:?}",
                    row.name,
                    row.message_contains
                ),
            }
        }
    }

    #[test]
    fn only_full_success_deletes_the_record() {
        // The uninstall half's single most important property, asserted across the whole
        // table at once: RecordFate::Deleted appears on the Ok row and NOWHERE else.
        for row in uninstall_table() {
            let state = resolve_uninstall_terminal_state(row.outcome.as_ref().map(|_| ()));
            assert_eq!(
                state.record == RecordFate::Deleted,
                row.outcome.is_ok(),
                "'{}': the record may be Deleted on success and ONLY on success",
                row.name
            );
        }
    }

    #[test]
    fn a_refusal_surfaces_the_guards_own_explanation() {
        use crate::workflow_install::guard::RefusalReason;
        let state = resolve_uninstall_terminal_state(Err(&UninstallError::Refused(
            RefusalReason::TargetIsHome {
                resolved: std::path::PathBuf::from("/Users/someone"),
            },
        )));

        let msg = state.surfaced_error.unwrap();
        assert!(
            msg.contains("home directory") && msg.contains("/Users/someone"),
            "the refusal must reach the user as the guard's own explanation, got {msg:?}"
        );
        assert_eq!(state.record, RecordFate::Kept);
    }
}
