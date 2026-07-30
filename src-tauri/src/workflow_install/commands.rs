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
    let dest = PathBuf::from(dest);
    let ctl = Arc::clone(&control);
    let now = now_rfc3339();

    std::thread::spawn(move || {
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
        let _ = app.emit(INSTALL_FINISHED_EVENT, payload);
        ctl.running.store(false, Ordering::SeqCst);
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
