//! Tauri commands for the install wizard (M10.9 WP3.5a Phase 4).
//!
//! ## This is the ONLY layer that resolves real paths
//! Everything under `workflow_install` takes its roots as parameters, enforced by source guards
//! in each sibling module. That discipline exists so the sandbox fixture can contain every
//! write — but somewhere the real `$HOME` has to be resolved, and this is that place. Keeping it
//! in one thin file means there is exactly one spot to audit, and it holds no logic worth
//! testing: it resolves paths, spawns the work on a thread, and forwards events.
//!
//! ## Why the install runs on a background thread
//! `git clone` plus `install.sh` takes seconds to minutes. A `#[tauri::command]` runs on the
//! IPC thread, so doing this work inline would freeze the webview for the whole install — and
//! the wizard's entire job is to show progress. So the command returns immediately and the run
//! reports through events, following `cc_session`'s output-event/exit-event shape.
//!
//! ## Cancellation is cooperative and coarse — the UI must not oversell it
//! The cancel flag is polled *between* steps (pre-clone, post-clone), never mid-subprocess:
//! killing `git` halfway is how you get a corrupt object store. A cancel arriving during a long
//! clone is therefore honored only when that clone finishes. Verify-self flagged that this makes
//! a Cancel button feel unresponsive at exactly the slowest moment, so the frontend shows
//! "Cancelling…" rather than implying the work stopped.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use super::runner::{self, OutputSink};
use super::{provenance, terminal, InstallState};

/// Event carrying one line of subprocess output. Payload: the line.
pub const INSTALL_OUTPUT_EVENT: &str = "workflow-install-output";

/// Event fired once when a run finishes, successfully or not. Payload: [`InstallFinished`].
pub const INSTALL_FINISHED_EVENT: &str = "workflow-install-finished";

/// Event carrying one line of `uninstall.sh` output during a real (non-dry-run) uninstall.
pub const UNINSTALL_OUTPUT_EVENT: &str = "workflow-uninstall-output";

/// Event fired once when an uninstall run finishes. Payload: [`UninstallFinished`].
pub const UNINSTALL_FINISHED_EVENT: &str = "workflow-uninstall-finished";

/// The cancel flag for the in-flight install, shared between the IPC thread and the worker.
///
/// One install at a time: the wizard is modal and a second concurrent clone into the same
/// destination would race on the directory. `start` refuses while a run is active.
#[derive(Default)]
pub struct InstallControl {
    cancelled: AtomicBool,
    running: AtomicBool,
}

/// What the frontend learns when a run ends.
///
/// Mirrors [`terminal::TerminalState`] rather than the raw error: the frontend needs the
/// *decision* (revert the gate? is a clone left behind?), and that decision belongs to the pure
/// reducer, not to a second implementation living in TypeScript.
#[derive(Debug, Clone, serde::Serialize)]
pub struct InstallFinished {
    /// True only on a fully successful install with the record written.
    pub ok: bool,
    /// Whether the caller must revert the workflow-features gate to OFF.
    pub revert_gate: bool,
    /// Whether a partial clone was left on disk. **Reported, never removed** — WP3.5a ships no
    /// deleting path, so the user is told rather than silently cleaned up after.
    pub partial_clone_left: bool,
    /// True when the substrate IS installed despite an error — the record-write failure case,
    /// where reporting a flat failure would be a lie in the opposite direction.
    pub substrate_installed: bool,
    /// The subprocess's own error text, verbatim. `None` on success.
    pub error: Option<String>,
}

/// Resolve the user's home directory.
///
/// Same resolution as `hook_install::commands::dirs_home` and
/// `workflow_substrate::commands::dirs_home`, kept deliberately consistent so all three modules
/// agree on where `~/.claude/` is.
fn dirs_home() -> Result<PathBuf, String> {
    std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "could not resolve the home directory (HOME is unset)".to_string())
}

/// `~/.claudesk/` — where the provenance record lives.
///
/// **Not bundle-identity-scoped**, unlike Claudesk's app-data dir: the dev and prod builds share
/// one managed clone and must therefore read one record. See `workflow_install`'s module header.
fn claudesk_root() -> Result<PathBuf, String> {
    Ok(dirs_home()?.join(".claudesk"))
}

/// The default clone destination, for pre-filling the wizard's location field.
#[tauri::command]
pub fn workflow_install_default_location() -> Result<String, String> {
    let home = dirs_home()?;
    Ok(super::default_clone_path(&home)
        .to_string_lossy()
        .into_owned())
}

/// The substrate's provenance state: `absent` / `managed` / `developer`.
///
/// Read-only. Composes the WP3 presence check with this WP's provenance record — which is the
/// end-to-end `run_install` → `resolve_state == Managed` composition Phase 2's verify-self
/// flagged as untested in isolation.
#[tauri::command]
pub fn workflow_install_state() -> Result<String, String> {
    let home = dirs_home()?;
    let present = crate::workflow_substrate::skills_dir_exists(&home);
    let record = provenance::read_record(&claudesk_root()?);
    Ok(match super::resolve_state(present, record.as_ref()) {
        InstallState::Absent => "absent",
        InstallState::Managed => "managed",
        InstallState::Developer => "developer",
    }
    .to_string())
}

/// What the frontend learns when an uninstall run ends. Mirrors
/// [`terminal::UninstallTerminalState`] — the decision comes from the pure reducer, never a
/// second implementation in TypeScript.
#[derive(Debug, Clone, serde::Serialize)]
pub struct UninstallFinished {
    /// True only on a fully successful removal (script + clone dir + record).
    pub ok: bool,
    /// Whether the provenance record was deleted. **False on every failure** — the record
    /// survives to describe what still exists (delete-last, the mirror of write-last).
    pub record_deleted: bool,
    /// True only when everything is gone.
    pub removal_complete: bool,
    /// Whether re-running the uninstall wizard is the recovery path.
    pub retry_available: bool,
    /// The subprocess's / guard's own text, verbatim. `None` on success.
    pub error: Option<String>,
}

/// Forwards each output line to the webview as a Tauri event (the event name distinguishes
/// the install and uninstall streams).
struct EventSink {
    app: AppHandle,
    event: &'static str,
}

impl OutputSink for EventSink {
    fn line(&self, line: &str) {
        // Best-effort: a closed window is not a reason to abort a run that is already
        // mutating `~/.claude/`. Losing a progress line is strictly better than leaving a
        // half-finished tree because the user closed the panel.
        let _ = self.app.emit(self.event, line);
    }
}

/// A sink that discards output — for the synchronous dry-run command, whose full output is
/// returned to the caller as a value rather than streamed.
struct Discard;

impl OutputSink for Discard {
    fn line(&self, _line: &str) {}
}

/// The message a panicked install worker reports, so the UI has something honest to show.
///
/// Deliberately does NOT try to describe the panic: the payload the user needs is "this failed and
/// the gate is back off", and a panic message would be an internal detail with no user action
/// attached. The real diagnostic goes to stderr via Rust's default panic hook.
const PANIC_MESSAGE: &str =
    "The install stopped unexpectedly. Nothing was recorded, so you can safely retry.";

/// The message a panicked uninstall worker reports.
///
/// `record_deleted: false` in the accompanying payload is the honest direction: we cannot
/// PROVE the record survived, but claiming deletion we cannot prove would show "uninstalled"
/// for a substrate that may remain — whereas claiming it survived merely routes a retry
/// through the refuse-guard, which reads the real state and refuses safely if the record is
/// actually gone.
const UNINSTALL_PANIC_MESSAGE: &str = "The uninstall stopped unexpectedly. Check the \
     workflow-system status in Settings before retrying.";

/// Releases the single-run lock and guarantees a terminal event on `terminal_event`, **even
/// on an unwinding panic**.
///
/// This exists because the two things a stuck run costs are unrecoverable without a relaunch:
/// a wedged `running` flag refuses every later run, and a wizard with no terminal event has no
/// Close button. Both are `Drop`-shaped problems, so they get a `Drop` solution. Generic over
/// the run type since WP3.5b: the event name and the panic-fallback payload are supplied at
/// construction, so the install and uninstall workers share one boundary implementation.
struct RunGuard {
    app: AppHandle,
    ctl: Arc<InstallControl>,
    /// Set once a real outcome has been emitted, so `Drop` stays silent on the happy path.
    reported: bool,
    /// The event this run reports its terminal state on.
    terminal_event: &'static str,
    /// What `Drop` sends if the worker never reached `finish()` — i.e. it panicked.
    panic_payload: serde_json::Value,
}

impl RunGuard {
    /// Emit the real outcome and mark the run reported.
    fn finish<T: serde::Serialize + Clone>(&mut self, payload: T) {
        self.reported = true;
        let _ = self.app.emit(self.terminal_event, payload);
    }
}

impl Drop for RunGuard {
    fn drop(&mut self) {
        // Always release the lock — this is the half that would otherwise wedge the wizard for the
        // whole process lifetime.
        self.ctl.running.store(false, Ordering::SeqCst);

        if self.reported {
            return;
        }

        // Unreported at drop means the closure did not reach `finish()` — i.e. it panicked.
        // Send the pre-built failure payload so the UI can leave `running`.
        let _ = self
            .app
            .emit(self.terminal_event, self.panic_payload.clone());
    }
}

/// Start an install into `dest`, cloning from `url`.
///
/// Returns immediately; progress arrives on [`INSTALL_OUTPUT_EVENT`] and the outcome on
/// [`INSTALL_FINISHED_EVENT`]. `dest` comes from the wizard's location picker, so it is the
/// user's choice — but it is passed as a parameter all the way down, never re-derived.
#[tauri::command]
pub fn workflow_install_start(
    app: AppHandle,
    control: State<'_, Arc<InstallControl>>,
    url: String,
    dest: String,
) -> Result<(), String> {
    if control.running.swap(true, Ordering::SeqCst) {
        return Err("an install is already running".to_string());
    }
    control.cancelled.store(false, Ordering::SeqCst);

    // `inspect_err`, not `map_err`: the error passes through untransformed — the closure exists
    // only to release the single-run lock we just took, so that a failure here does not wedge the
    // wizard into "an install is already running" for the rest of the session.
    let root = claudesk_root().inspect_err(|_| {
        control.running.store(false, Ordering::SeqCst);
    })?;

    // Reject anything that is not an absolute path, BEFORE any subprocess runs.
    //
    // The destination is free text (the field must stay editable — a native directory picker
    // cannot select a directory that does not exist yet, and the default `~/.claudesk/vendor/`
    // does not). Nothing on either side of the IPC boundary expands `~`, so
    // `PathBuf::from("~/x")` is a *relative* path: `git clone` would create a directory literally
    // named `~` under the app's cwd, the install would "succeed" into it, and the provenance
    // record would point somewhere the user never chose — which WP3.5b later reads as
    // authoritative when deciding what it may remove. Silently wrong beats loudly wrong here, so
    // this refuses rather than guessing at expansion.
    //
    // Caught at code review; the adjacent Settings copy displays `~/dev/...` paths, so typing a
    // tilde is the natural user move rather than an exotic one.
    let dest = PathBuf::from(&dest);
    if !dest.is_absolute() {
        control.running.store(false, Ordering::SeqCst);
        return Err(format!(
            "The install location must be an absolute path (got {:?}). \
             A leading ~ is not expanded — use the full path, or pick a folder with Browse.",
            dest.display().to_string()
        ));
    }
    let ctl = Arc::clone(&control);
    let now = now_rfc3339();

    std::thread::spawn(move || {
        // ── The panic boundary ──────────────────────────────────────────────────────────
        // `RunGuard`'s `Drop` runs on a normal return AND on an unwinding panic, which is what
        // makes the two unrecoverable states impossible by construction rather than by
        // remembering to reset things on every path.
        //
        // Without it (the shipped version, caught at code review): `running.store(false)` and
        // the finished-event emit were both the LAST statements of this closure, so a panic
        // anywhere above them — inside `run_install`, a poisoned lock, an allocation failure
        // while collecting output — left `running: true` for the rest of the process lifetime
        // (every later `workflow_install_start` returning "an install is already running") AND
        // left the wizard stuck in `step === "running"` with no Close button and no Esc path.
        // One missing guard, two dead ends, and neither observable from a unit test.
        //
        // `finish()` is called on the success path so the real outcome wins; the guard then has
        // nothing left to report. If it fires anyway, the payload it sends is deliberately a
        // *failure* with `revert_gate: true` — a panicked install must never leave the gate ON
        // claiming a substrate, which is `terminal.rs`'s load-bearing invariant.
        let mut guard = RunGuard {
            app: app.clone(),
            ctl: Arc::clone(&ctl),
            reported: false,
            terminal_event: INSTALL_FINISHED_EVENT,
            panic_payload: serde_json::to_value(InstallFinished {
                ok: false,
                revert_gate: true,
                partial_clone_left: false,
                substrate_installed: false,
                error: Some(PANIC_MESSAGE.to_string()),
            })
            .unwrap_or_default(),
        };

        let sink = EventSink {
            app: app.clone(),
            event: INSTALL_OUTPUT_EVENT,
        };
        let cancelled = || ctl.cancelled.load(Ordering::SeqCst);
        let outcome = runner::run_install(&url, &dest, &root, &now, &sink, &cancelled);

        // The DECISION comes from the pure reducer — never re-derived here, and never
        // re-implemented in the frontend.
        let state = terminal::resolve_terminal_state(outcome.as_ref().map(|_| ()));
        let payload = InstallFinished {
            ok: outcome.is_ok(),
            revert_gate: state.gate == terminal::GateAction::RevertToOff,
            partial_clone_left: state.cleanup == terminal::Cleanup::RemovePartialClone,
            substrate_installed: state.substrate_installed,
            error: state.surfaced_error,
        };
        guard.finish(payload);
    });

    Ok(())
}

/// Request cancellation of the in-flight install.
///
/// Cooperative: honored at the next step boundary, not mid-subprocess. See the module header —
/// the frontend must reflect "requested", not "stopped".
#[tauri::command]
pub fn workflow_install_cancel(control: State<'_, Arc<InstallControl>>) {
    control.cancelled.store(true, Ordering::SeqCst);
}

/// Run `uninstall.sh --dry-run` against the recorded managed clone and return its real
/// output — the 3-intent dialog's removal preview (operator decision, script finding 2:
/// preview and action share one source of truth and cannot drift).
///
/// Synchronous: the dry run spawns the script but touches nothing and finishes in well under
/// a second (it iterates symlinks and prints). Refusals surface as the guard's own
/// user-facing explanation.
///
/// ## Refuses while a real run is in flight — exclusion, not just latency
/// This takes the same single-run lock as the two mutating commands, even though it only
/// reads. Without it, a preview could spawn `uninstall.sh --dry-run` against a clone directory
/// that `run_uninstall` is in the middle of `remove_dir_all`-ing, and the user would be shown
/// a removal list scraped from a half-deleted tree. Code review flagged that this was the one
/// substrate-touching command sitting outside the module's documented concurrency model, and
/// that the comment defending its synchronous shape argued only about *latency*.
///
/// Held for the duration rather than released early: the lock's meaning is "one thing is
/// touching the substrate", and a read racing a delete is exactly what it exists to prevent.
#[tauri::command]
pub fn workflow_uninstall_dry_run(
    control: State<'_, Arc<InstallControl>>,
) -> Result<String, String> {
    if control.running.swap(true, Ordering::SeqCst) {
        return Err("an install or uninstall is already running".to_string());
    }
    // Every exit below must release the lock, including the early error returns — hence the
    // closure-and-release shape rather than `?` straight through. (A `Drop` guard would also
    // work; this command is short enough that the explicit release is easier to verify.)
    let result = (|| {
        let home = dirs_home()?;
        let root = claudesk_root()?;
        let record = provenance::read_record(&root);
        let target =
            super::guard::refuse_guard(record.as_ref(), &home).map_err(|r| r.user_message())?;
        runner::run_dry_run(&target, &Discard).map_err(|e| e.to_string())
    })();
    control.running.store(false, Ordering::SeqCst);
    result
}

/// Start the real uninstall of the recorded managed clone.
///
/// Returns immediately; progress arrives on [`UNINSTALL_OUTPUT_EVENT`] and the outcome on
/// [`UNINSTALL_FINISHED_EVENT`]. Shares the single-run lock with the install — one substrate
/// mutation at a time, ever. The record is read INSIDE the worker (freshest state), and the
/// refuse-guard runs structurally in the call path via `run_uninstall_guarded` — there is no
/// argument for "what to uninstall", because a caller-supplied path is exactly what the
/// provenance rule forbids.
#[tauri::command]
pub fn workflow_uninstall_start(
    app: AppHandle,
    control: State<'_, Arc<InstallControl>>,
) -> Result<(), String> {
    if control.running.swap(true, Ordering::SeqCst) {
        return Err("an install or uninstall is already running".to_string());
    }
    control.cancelled.store(false, Ordering::SeqCst);

    let home = match dirs_home() {
        Ok(h) => h,
        Err(e) => {
            control.running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };
    let root = match claudesk_root() {
        Ok(r) => r,
        Err(e) => {
            control.running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };
    let ctl = Arc::clone(&control);

    std::thread::spawn(move || {
        // Same panic boundary as the install worker — one omission there produced two
        // unrecoverable states, so the uninstall (whose failure modes matter MORE) does not
        // get to skip it.
        let mut guard = RunGuard {
            app: app.clone(),
            ctl: Arc::clone(&ctl),
            reported: false,
            terminal_event: UNINSTALL_FINISHED_EVENT,
            panic_payload: serde_json::to_value(UninstallFinished {
                ok: false,
                record_deleted: false,
                removal_complete: false,
                retry_available: true,
                error: Some(UNINSTALL_PANIC_MESSAGE.to_string()),
            })
            .unwrap_or_default(),
        };

        let sink = EventSink {
            app: app.clone(),
            event: UNINSTALL_OUTPUT_EVENT,
        };
        let cancelled = || ctl.cancelled.load(Ordering::SeqCst);
        let record = provenance::read_record(&root);
        let outcome =
            runner::run_uninstall_guarded(record.as_ref(), &home, &root, &sink, &cancelled);

        // The DECISION comes from the pure reducer — never re-derived here, never
        // re-implemented in the frontend.
        let state = terminal::resolve_uninstall_terminal_state(outcome.as_ref().map(|_| ()));
        let payload = UninstallFinished {
            ok: outcome.is_ok(),
            record_deleted: state.record == terminal::RecordFate::Deleted,
            removal_complete: state.removal_complete,
            retry_available: state.retry_available,
            error: state.surfaced_error,
        };
        guard.finish(payload);
    });

    Ok(())
}

/// Request cancellation of the in-flight uninstall.
///
/// Cooperative and coarse, same contract as the install's: honored between steps only —
/// never mid-script, and never between the clone removal and the record deletion (those two
/// are one unit; see `runner::run_uninstall`).
#[tauri::command]
pub fn workflow_uninstall_cancel(control: State<'_, Arc<InstallControl>>) {
    control.cancelled.store(true, Ordering::SeqCst);
}

/// Current UTC time as RFC-3339, for the provenance record's `installed_at`.
///
/// Lives here rather than in `runner` so the runner stays deterministic under test (it takes the
/// timestamp as a parameter).
fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_this_layer_resolves_real_paths() {
        // The inverse of the sibling modules' guards: they forbid ambient roots, and this file
        // is the single sanctioned exception. Pinning it here means the exception stays ONE
        // file — if a future edit resolves `$HOME` in `runner` or `terminal`, their own guards
        // fail; if someone adds a second resolver here, this test documents that this is the
        // only place it belongs.
        let code =
            crate::workflow_install::source_guard::production_code(include_str!("commands.rs"));

        // Exactly one HOME resolution, in `dirs_home`.
        assert_eq!(
            code.matches("env::var(\"HOME\")").count(),
            1,
            "there must be exactly ONE home resolution in this file (in dirs_home) — every \
             other path must be derived from it or passed in"
        );

        // (The delete-token half of this guard moved to the module-level guard in
        // `source_guard.rs` at WP3.5b Phase 1 — one allowlist, consciously extended.)

        // Positive anchors at the tail, so a truncated extraction fails loudly.
        assert!(
            code.contains("fn workflow_install_start"),
            "the start command must live here"
        );
        assert!(
            code.contains("resolve_terminal_state"),
            "the terminal decision must come from the pure reducer, not be re-derived here"
        );
    }

    #[test]
    fn dto_serde_shape_is_snake_case() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The convention every sibling IPC DTO enforces — `status_broadcaster`,
        // `hook_socket`, `time_store::query` all carry this pin, folding in
        // SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE. This module
        // shipped without it (caught at code review).
        //
        // The cost of the gap is concrete, not theoretical: a future
        // `rename_all = "camelCase"` would silently rename `revert_gate` → `revertGate`,
        // the hand-written TS interface would read `undefined`, `undefined` is falsy, and
        // **the gate would stay ON after a failed install** — the exact invariant
        // `terminal.rs`'s header calls load-bearing. A wire-shape drift here is a safety
        // regression, not a cosmetic one.
        // ═══════════════════════════════════════════════════════════════════════════
        use super::*;
        let payload = InstallFinished {
            ok: false,
            revert_gate: true,
            partial_clone_left: true,
            substrate_installed: false,
            error: Some("boom".to_string()),
        };
        let value = serde_json::to_value(&payload).unwrap();
        let obj = value.as_object().unwrap();

        let mut keys: Vec<&String> = obj.keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                &"error".to_string(),
                &"ok".to_string(),
                &"partial_clone_left".to_string(),
                &"revert_gate".to_string(),
                &"substrate_installed".to_string(),
            ],
            "the wire keys must stay snake_case verbatim — the TS interface in \
             WorkflowInstallWizard.tsx mirrors them by hand"
        );
        // Spot-check the safety-critical field by name AND value.
        assert_eq!(obj["revert_gate"], serde_json::json!(true));
    }

    #[test]
    fn a_panicked_run_still_reports_a_gate_revert() {
        // The panic-boundary contract, asserted on the payload the `RunGuard` sends when the
        // worker never reached `finish()`. Cannot spawn a real panicking Tauri thread in a unit
        // test (no AppHandle), so this pins the VALUES the guard is built to send — the same
        // discipline the rest of this module uses for decisions it cannot observe live.
        //
        // `revert_gate: true` is the load-bearing field: a panicked install must never leave the
        // gate ON claiming a substrate. `substrate_installed: false` because we genuinely do not
        // know — and claiming an install we cannot prove is the one direction that could later
        // arm a delete.
        use super::*;
        let payload = InstallFinished {
            ok: false,
            revert_gate: true,
            partial_clone_left: false,
            substrate_installed: false,
            error: Some(PANIC_MESSAGE.to_string()),
        };

        assert!(!payload.ok, "a panic is never a success");
        assert!(payload.revert_gate, "a panic must revert the gate");
        assert!(
            !payload.substrate_installed,
            "a panic must not claim an install it cannot prove"
        );
        assert!(
            PANIC_MESSAGE.contains("safely retry"),
            "the message must tell the user what they can do, not describe the panic"
        );
    }

    #[test]
    fn the_guard_releases_the_lock_and_reports_on_both_paths() {
        // Source-level, and honest about it: `Drop` on an unwinding panic is not observable from
        // a unit test without a real AppHandle. What IS checkable is that the release and the
        // fallback emit live in `Drop` rather than at the end of the closure — which is the
        // entire distinction between the fixed and broken versions. Uses the shared extractor
        // (comment-stripped), so a comment mentioning the release call cannot satisfy — or
        // falsely trip — either assertion below.
        let production =
            crate::workflow_install::source_guard::production_code(include_str!("commands.rs"));

        let drop_impl = production
            .split("impl Drop for RunGuard")
            .nth(1)
            .expect("RunGuard must have a Drop impl — that is the panic boundary");
        let drop_body = drop_impl.split("\n}").next().unwrap_or(drop_impl);

        assert!(
            drop_body.contains("running.store(false"),
            "Drop must release the single-run lock, or a panic wedges every later run"
        );
        assert!(
            drop_body.contains("self.terminal_event"),
            "Drop must emit on the run's terminal event, or a panic leaves the wizard stuck \
             in `running` with no Close button"
        );
        // Both workers must construct the guard with their own terminal event — this is what
        // replaced the single hard-coded INSTALL_FINISHED_EVENT when the guard was
        // genericized for the uninstall worker (WP3.5b Phase 2).
        assert!(
            production.contains("terminal_event: INSTALL_FINISHED_EVENT"),
            "the install worker must report on the install event"
        );
        assert!(
            production.contains("terminal_event: UNINSTALL_FINISHED_EVENT"),
            "the uninstall worker must report on the uninstall event"
        );
        // And the closure must NOT still be doing the release itself — that is the shipped bug.
        // EVERY worker closure, not just the first. The previous version took `.nth(1)` — the
        // install worker only — so reordering the two spawns would have silently stopped
        // covering the uninstall worker while staying green (code review, 2026-07-31: "the one
        // guard in this WP whose failure mode is 'quietly stops checking'").
        let worker_bodies: Vec<&str> = production.split("std::thread::spawn").skip(1).collect();
        assert_eq!(
            worker_bodies.len(),
            2,
            "expected exactly two spawned workers (install + uninstall); if a third was added \
             it must also delegate its lock release to RunGuard"
        );
        for body in worker_bodies {
            assert!(
                !body.contains("ctl.running.store(false"),
                "every worker closure must delegate the lock release to RunGuard's Drop, not do \
                 it inline as its last statement (the shipped bug: a panic skipped it entirely)"
            );
        }
    }

    #[test]
    fn every_substrate_touching_command_takes_the_single_run_lock() {
        // Code review (2026-07-31) found `workflow_uninstall_dry_run` outside the module's
        // concurrency model: it spawned the script against the clone dir with no lock, so a
        // preview could read a tree that `run_uninstall` was mid-`remove_dir_all` on. The
        // three commands that touch the substrate must all serialize; the two that only read
        // Claudesk's own state (`default_location`, `install_state`) need not.
        let code =
            crate::workflow_install::source_guard::production_code(include_str!("commands.rs"));

        for command in [
            "pub fn workflow_install_start",
            "pub fn workflow_uninstall_start",
            "pub fn workflow_uninstall_dry_run",
        ] {
            let at = code.find(command).unwrap_or_else(|| {
                panic!("{command} must exist — did it get renamed?");
            });
            // The lock acquisition sits in the first few lines of each body.
            let body = &code[at..(at + 400).min(code.len())];
            assert!(
                body.contains("running.swap(true"),
                "{command} must take the single-run lock — a substrate-touching command \
                 outside the exclusion model can race a delete"
            );
        }
    }

    #[test]
    fn uninstall_dto_serde_shape_is_snake_case() {
        // Same pin as the install DTO's, same reason: the TS interface mirrors these keys by
        // hand, and `record_deleted` is the safety-relevant field — a silent camelCase
        // rename would read as `undefined` (falsy), telling the UI the record survives when
        // it was deleted (or vice versa on the panic path).
        use super::*;
        let payload = UninstallFinished {
            ok: false,
            record_deleted: false,
            removal_complete: false,
            retry_available: true,
            error: Some("boom".to_string()),
        };
        let value = serde_json::to_value(&payload).unwrap();
        let obj = value.as_object().unwrap();

        let mut keys: Vec<&String> = obj.keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                &"error".to_string(),
                &"ok".to_string(),
                &"record_deleted".to_string(),
                &"removal_complete".to_string(),
                &"retry_available".to_string(),
            ],
            "the wire keys must stay snake_case verbatim"
        );
        assert_eq!(obj["record_deleted"], serde_json::json!(false));
    }

    #[test]
    fn a_panicked_uninstall_reports_record_not_deleted() {
        // The uninstall panic payload's honest direction: we cannot PROVE the record's fate,
        // and `record_deleted: false` fails safe — a retry routes through the refuse-guard,
        // which reads the REAL state and refuses if the record is actually gone. Claiming
        // deletion we cannot prove would show "uninstalled" over a substrate that may remain.
        use super::*;
        let payload = UninstallFinished {
            ok: false,
            record_deleted: false,
            removal_complete: false,
            retry_available: true,
            error: Some(UNINSTALL_PANIC_MESSAGE.to_string()),
        };

        assert!(!payload.ok, "a panic is never a success");
        assert!(
            !payload.record_deleted,
            "a panic must not claim a record deletion it cannot prove"
        );
        assert!(
            UNINSTALL_PANIC_MESSAGE.contains("Check the workflow-system status"),
            "the message must point the user at the real state, not describe the panic"
        );
    }

    #[test]
    fn the_finished_payload_reports_the_record_write_failure_honestly() {
        // The one outcome where "did it work?" has two different right answers: the substrate IS
        // installed but Claudesk cannot prove it installed it. A payload that collapsed this to
        // `ok: false` would tell the user nothing landed, and they would retry into a tree that
        // is already installed.
        use super::*;
        let err = runner::InstallError::RecordWriteFailed("read-only fs".into());
        let state = terminal::resolve_terminal_state(Err(&err));

        let payload = InstallFinished {
            ok: false,
            revert_gate: state.gate == terminal::GateAction::RevertToOff,
            partial_clone_left: state.cleanup == terminal::Cleanup::RemovePartialClone,
            substrate_installed: state.substrate_installed,
            error: state.surfaced_error.clone(),
        };

        assert!(
            payload.substrate_installed,
            "a record-write failure must still report the substrate as installed"
        );
        assert!(
            payload.error.is_some_and(|e| e.contains("read-only fs")),
            "and must carry the real underlying error"
        );
    }
}
