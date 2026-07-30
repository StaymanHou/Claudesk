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

/// Forwards each output line to the webview as a Tauri event.
struct EventSink {
    app: AppHandle,
}

impl OutputSink for EventSink {
    fn line(&self, line: &str) {
        // Best-effort: a closed window is not a reason to abort an install that is already
        // mutating `~/.claude/`. Losing a progress line is strictly better than leaving a
        // half-installed tree because the user closed the panel.
        let _ = self.app.emit(INSTALL_OUTPUT_EVENT, line);
    }
}

/// The message a panicked worker reports, so the UI has something honest to show.
///
/// Deliberately does NOT try to describe the panic: the payload the user needs is "this failed and
/// the gate is back off", and a panic message would be an internal detail with no user action
/// attached. The real diagnostic goes to stderr via Rust's default panic hook.
const PANIC_MESSAGE: &str =
    "The install stopped unexpectedly. Nothing was recorded, so you can safely retry.";

/// Releases the single-run lock and guarantees a terminal event, **even on an unwinding panic**.
///
/// This exists because the two things a stuck install costs are unrecoverable without a relaunch:
/// a wedged `running` flag refuses every later install, and a wizard with no terminal event has no
/// Close button. Both are `Drop`-shaped problems, so they get a `Drop` solution.
struct RunGuard {
    app: AppHandle,
    ctl: Arc<InstallControl>,
    /// Set once a real outcome has been emitted, so `Drop` stays silent on the happy path.
    reported: bool,
}

impl RunGuard {
    /// Emit the real outcome and mark the run reported.
    fn finish(&mut self, payload: InstallFinished) {
        self.reported = true;
        let _ = self.app.emit(INSTALL_FINISHED_EVENT, payload);
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

        // Unreported at drop means the closure did not reach `finish()` — i.e. it panicked. Send a
        // failure so the UI can leave `running`. `revert_gate: true` because a panicked install
        // must not leave the gate ON claiming a substrate; `substrate_installed: false` because we
        // genuinely do not know, and claiming an install we cannot prove is the one direction that
        // could later arm a delete.
        let _ = self.app.emit(
            INSTALL_FINISHED_EVENT,
            InstallFinished {
                ok: false,
                revert_gate: true,
                partial_clone_left: false,
                substrate_installed: false,
                error: Some(PANIC_MESSAGE.to_string()),
            },
        );
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
        };

        let sink = EventSink { app: app.clone() };
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
        let src = include_str!("commands.rs");
        let production = src.split("mod tests").next().unwrap_or(src);
        let code: String = production
            .lines()
            .filter(|l| {
                let t = l.trim_start();
                !t.starts_with("//") && !t.starts_with("*") && !t.starts_with("/*")
            })
            .collect::<Vec<_>>()
            .join("\n");

        // Exactly one HOME resolution, in `dirs_home`.
        assert_eq!(
            code.matches("env::var(\"HOME\")").count(),
            1,
            "there must be exactly ONE home resolution in this file (in dirs_home) — every \
             other path must be derived from it or passed in"
        );

        // And still no deleting path: WP3.5a is the additive half, commands layer included.
        for forbidden in ["remove_dir", "remove_file", "uninstall.sh"] {
            assert!(
                !code.contains(forbidden),
                "the commands layer must ship no deleting path (`{forbidden}` found) — \
                 uninstall is WP3.5b, refuse-guard first"
            );
        }

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
        // entire distinction between the fixed and broken versions.
        let src = include_str!("commands.rs");
        let production = src.split("mod tests").next().unwrap_or(src);

        let drop_impl = production
            .split("impl Drop for RunGuard")
            .nth(1)
            .expect("RunGuard must have a Drop impl — that is the panic boundary");
        let drop_body = drop_impl.split("\n}").next().unwrap_or(drop_impl);

        assert!(
            drop_body.contains("running.store(false"),
            "Drop must release the single-run lock, or a panic wedges every later install"
        );
        assert!(
            drop_body.contains("INSTALL_FINISHED_EVENT"),
            "Drop must emit a terminal event, or a panic leaves the wizard stuck in `running` \
             with no Close button"
        );
        // And the closure must NOT still be doing the release itself — that is the shipped bug.
        let spawn_body = production
            .split("std::thread::spawn")
            .nth(1)
            .unwrap_or_default();
        assert!(
            !spawn_body.contains("ctl.running.store(false"),
            "the worker closure must delegate the lock release to RunGuard's Drop, not do it \
             inline as its last statement (the shipped bug: a panic skipped it entirely)"
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
