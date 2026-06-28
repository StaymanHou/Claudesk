//! Runtime wiring for the status broadcaster: take WP3's held `mpsc::Receiver`,
//! drain it on a dedicated thread, and emit each mapped [`WorkspaceStatusUpdate`]
//! on the `workspace-status` Tauri event channel.
//!
//! The pure transform ([`super::to_update`], [`super::event_to_state`],
//! [`super::WorkspaceRegistry`]) lives in [`super`]; this module adds only the
//! runtime-dependent pieces — the `AppHandle`-bound `emit`, the drain thread, and
//! the managed [`SharedRegistry`]. Mirrors `hook_socket::commands`' split (pure
//! parse/IO-loop in the parent, launch wiring here).
//!
//! ## Receiver hand-off (the WP3→WP4 seam)
//! WP3's `HookSocketState.receiver` is a `Mutex<Option<Receiver<HookEvent>>>` — the
//! event stream parked there, undrained. [`start_broadcaster`] does
//! `receiver.lock().take()` to OWN the receiver, then spawns a `std::thread` that
//! loops `rx.recv()`. A blocking `mpsc::Receiver` is the same shape as WP3's
//! blocking `UnixListener` — a dedicated thread is the simplest correct owner (WP1's
//! listener verdict, applied to the consumer side). The thread holds a cloned
//! `AppHandle` for `emit`. A closed channel (`recv` `Err`) means the socket listener
//! shut down → the drain thread exits cleanly.

use std::path::Path;
use std::sync::mpsc::Receiver;
use std::thread;

use tauri::{AppHandle, Emitter, Manager, State};

use super::{
    canonical_key, event_to_state, state_label, to_update, SharedRegistry, WorkspaceRegistry,
};
use crate::hook_socket::HookEvent;
use crate::status_log::{format_event_line, StatusLog};

/// The Tauri event name every status surface (M4 filmstrip, M5 PiP, M6 menu-bar)
/// subscribes to. The single broadcast channel — defined here, mirrored verbatim by
/// WP6's frontend `listen("workspace-status", …)`.
pub const STATUS_EVENT: &str = "workspace-status";

/// Start the broadcaster: own the `HookEvent` receiver and spawn the drain thread
/// that maps each event through the [`WorkspaceRegistry`] and emits the resulting
/// [`WorkspaceStatusUpdate`](super::WorkspaceStatusUpdate) on [`STATUS_EVENT`].
///
/// The `app` carries the managed [`SharedRegistry`] (registered via
/// [`init_registry`] before this is called); the drain thread reads it per event so
/// a future WP6 register/deregister command and the broadcaster share one instance.
/// Returns the drain thread's [`JoinHandle`](thread::JoinHandle) — the caller may
/// hold it (its lifetime is tied to the running app) or detach it.
///
/// Errors are returned as a human-readable string for the caller to surface (never
/// swallow — the WP6/WP7-M2 IPC-error lesson); the only failure here is the receiver
/// already having been taken (a double-start bug), which we treat as an error rather
/// than a panic.
pub fn start_broadcaster(app: AppHandle, receiver: Receiver<HookEvent>) -> thread::JoinHandle<()> {
    // M6 WP1: resolve the status-channel log path ONCE at thread start (not per event).
    // `app_data_dir()` is per-identity (`com.claudesk.app` vs `.dev`), so the log is
    // isolated like settings.json / hook.sock. A failure to resolve the dir → no
    // logger (None); telemetry is best-effort and must never block the drain thread.
    let status_log = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| StatusLog::new(&dir));
    // Startup breadcrumb so the operator (and WP2's repro) knows exactly where to read,
    // including from the launchd-launched prod `.app` where stderr is invisible.
    if let Some(log) = &status_log {
        log.write_line(&format!(
            "- STATUS broadcaster-start log={}",
            log.path().display()
        ));
    }
    thread::Builder::new()
        .name("claudesk-status-broadcaster".into())
        .spawn(move || drain_loop(app, receiver, status_log))
        .expect("failed to spawn status-broadcaster drain thread")
}

/// The drain-loop body — extracted so it reads top-to-bottom and so the per-event
/// transform path is obvious. Blocks on `rx.recv()`; for each event, locks the
/// managed registry, runs the pure [`to_update`] transform, and emits the result if
/// the event mapped to a state AND its cwd resolved to an open workspace (otherwise
/// the event is silently dropped — not an error). A `recv` `Err` (sender dropped =
/// socket listener gone) ends the loop cleanly.
fn drain_loop(app: AppHandle, receiver: Receiver<HookEvent>, status_log: Option<StatusLog>) {
    while let Ok(event) = receiver.recv() {
        // Resolve + transform under a short registry lock, then drop the lock before
        // emitting (emit must not hold the registry mutex). The canonical `to_update`
        // is the single source of truth for the emit; M6 WP1 ALSO computes the two
        // decisions SEPARATELY (mapped state, resolved id) for telemetry, so a line
        // can distinguish a never-mapped event from a Stop that arrived but whose cwd
        // matched no open workspace (the cwd-match-miss prime suspect).
        let (mapped, resolved, update) = {
            let registry = match app.try_state::<SharedRegistry>() {
                Some(r) => r,
                None => {
                    // Registry not managed (should not happen — init_registry runs
                    // in setup before start_broadcaster). Drop the event rather
                    // than panic; status stays Unknown, never inferred.
                    eprintln!(
                        "[claudesk] status-broadcaster: registry not in state; dropping event"
                    );
                    if let Some(log) = &status_log {
                        log.write_line(&format_event_line(
                            event.timestamp,
                            &event.hook_event_name,
                            &event.cwd,
                            event_to_state(&event).map(state_label),
                            None,
                        ));
                    }
                    continue;
                }
            };
            let reg = match registry.lock() {
                Ok(r) => r,
                Err(poisoned) => poisoned.into_inner(), // a poisoned lock is still readable
            };
            let mapped = event_to_state(&event);
            let resolved = reg.resolve_cwd(&event.cwd);
            let update = to_update(&event, &reg);
            (mapped, resolved, update)
        };

        // M6 WP1: one telemetry line per drained event (best-effort; never blocks).
        if let Some(log) = &status_log {
            log.write_line(&format_event_line(
                event.timestamp,
                &event.hook_event_name,
                &event.cwd,
                mapped.map(state_label),
                resolved.as_deref(),
            ));
        }

        if let Some(update) = update {
            if let Err(e) = app.emit(STATUS_EVENT, &update) {
                eprintln!("[claudesk] status-broadcaster: emit failed: {e}");
            }
        }
    }
    // recv returned Err: the hook-socket sender was dropped (listener shut down).
    // Exit cleanly — nothing more will arrive.
}

/// The managed [`SharedRegistry`] WP4 registers at launch. Empty until WP6 wires
/// workspace-open → `register` / close → `deregister`; the broadcaster emits nothing
/// until a workspace's project path is registered (an unmatched cwd is dropped). Kept
/// here so the registry's construction lives with its consumer.
pub fn init_registry() -> SharedRegistry {
    std::sync::Mutex::new(WorkspaceRegistry::new())
}

/// Register an open workspace's project path → `workspace_id` so the broadcaster's
/// cwd→workspace match can resolve hook events fired from that project dir. Called
/// by the frontend on workspace-open (M3 WP6). The path is canonicalized inside
/// [`WorkspaceRegistry::register`], matching how `resolve_cwd` canonicalizes the
/// incoming hook `cwd`.
///
/// A poisoned lock is surfaced as an error rather than swallowed (the never-swallow
/// IPC lesson) — a failed registration means status stays Unknown for that
/// workspace, which the frontend shows honestly.
#[tauri::command]
pub fn workspace_register(
    app: AppHandle,
    registry: State<'_, SharedRegistry>,
    project_path: String,
    workspace_id: String,
) -> Result<(), String> {
    // M6 WP1: log the canonical registry key on register so a later Stop's
    // resolved/missed cwd can be compared against the key actually stored — the
    // canonicalization seam is the cwd-match-miss prime suspect.
    log_registry_mutation(&app, "register", Some(&workspace_id), &project_path);
    let mut reg = registry
        .lock()
        .map_err(|_| "workspace registry lock poisoned".to_string())?;
    reg.register(Path::new(&project_path), workspace_id);
    Ok(())
}

/// Deregister a closed workspace by its project path (M3 WP6, workspace-close). A
/// path not present is a no-op (the underlying `HashMap::remove`); a poisoned lock
/// is surfaced, never swallowed.
#[tauri::command]
pub fn workspace_deregister(
    app: AppHandle,
    registry: State<'_, SharedRegistry>,
    project_path: String,
) -> Result<(), String> {
    // M6 WP1: log the deregister canonical key (a workspace closing should remove the
    // mapping a subsequent Stop would have resolved against).
    log_registry_mutation(&app, "deregister", None, &project_path);
    let mut reg = registry
        .lock()
        .map_err(|_| "workspace registry lock poisoned".to_string())?;
    reg.deregister(Path::new(&project_path));
    Ok(())
}

/// M6 WP1 helper: best-effort telemetry of a registry mutation — resolves the status
/// log from `app_data_dir()` and writes one `REGISTRY` line with the canonicalized key
/// (the same `canonical_key` the registry stores/resolves on). Swallows a missing
/// data-dir; never errors the command.
fn log_registry_mutation(app: &AppHandle, op: &str, workspace_id: Option<&str>, raw_path: &str) {
    if let Ok(dir) = app.path().app_data_dir() {
        let key = canonical_key(Path::new(raw_path));
        StatusLog::new(&dir).write_line(&crate::status_log::format_registry_line(
            op,
            workspace_id,
            raw_path,
            &key,
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    use crate::hook_socket::{bind_listener, spawn_listener};
    use crate::status_broadcaster::{to_update, WorkspaceState};
    use std::io::Write;
    use std::os::unix::net::UnixStream;

    // The drain loop's emit is AppHandle-bound, so the end-to-end test exercises the
    // full WP3→WP4 transform PATH without a Tauri app: bind a real socket (WP3
    // plumbing), write hook lines, and assert the broadcaster's pure transform
    // (to_update over the registry) yields the expected updates. The emit itself is
    // a single `app.emit` line covered by the Tauri runtime, not unit-tested here
    // (the design property: to_update is the only logic, emit is plumbing).
    #[test]
    fn end_to_end_socket_to_transform_registered_emitted_unregistered_dropped() {
        let dir = tempfile::TempDir::new().unwrap();
        let sock = dir.path().join("hook.sock");
        let listener = bind_listener(&sock).unwrap();
        let (tx, rx) = mpsc::channel::<HookEvent>();
        let _handle = spawn_listener(listener, tx);

        // Registry with one registered workspace (a real temp dir so canonicalize
        // succeeds on both register and resolve sides).
        let ws_dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(ws_dir.path(), "ws-1".to_string());
        let ws_cwd = ws_dir.path().to_string_lossy().to_string();

        // Write three lines through the real socket: a registered-cwd
        // UserPromptSubmit (→ Running, emitted), a registered-cwd Notification
        // (→ AwaitingInput, emitted), and an unregistered-cwd Stop (dropped).
        let mut client = UnixStream::connect(&sock).unwrap();
        client
            .write_all(
                format!(
                    "{{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"s\",\"cwd\":\"{ws_cwd}\",\"prompt\":\"go\"}}\n"
                )
                .as_bytes(),
            )
            .unwrap();
        client
            .write_all(
                format!(
                    "{{\"hook_event_name\":\"Notification\",\"session_id\":\"s\",\"cwd\":\"{ws_cwd}\",\"message\":\"perm?\"}}\n"
                )
                .as_bytes(),
            )
            .unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"Stop\",\"session_id\":\"s\",\"cwd\":\"/unregistered/path\"}\n")
            .unwrap();
        client.shutdown(std::net::Shutdown::Both).unwrap();

        // Drain the receiver the way the broadcaster would (transform per event),
        // collecting the updates that WOULD be emitted.
        let mut emitted = Vec::new();
        // Expect exactly 3 events to arrive on the channel (all parse); the
        // transform drops the unregistered one.
        for _ in 0..3 {
            let ev = rx
                .recv_timeout(Duration::from_secs(5))
                .expect("event should arrive");
            if let Some(update) = to_update(&ev, &reg) {
                emitted.push(update);
            }
        }
        // No fourth event.
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());

        // Exactly two updates emitted (the registered UPS + Notification); the
        // unregistered Stop produced no update.
        assert_eq!(
            emitted.len(),
            2,
            "two registered events should emit; the unregistered Stop is dropped"
        );
        assert_eq!(emitted[0].workspace_id, "ws-1");
        assert_eq!(emitted[0].state, WorkspaceState::Running);
        assert_eq!(emitted[0].last_output_snippet.as_deref(), Some("go"));
        assert_eq!(emitted[1].workspace_id, "ws-1");
        assert_eq!(emitted[1].state, WorkspaceState::AwaitingInput);
        assert_eq!(emitted[1].last_output_snippet.as_deref(), Some("perm?"));
    }

    #[test]
    fn init_registry_starts_empty() {
        let reg = init_registry();
        assert_eq!(reg.lock().unwrap().len(), 0);
    }

    // The workspace_register / workspace_deregister commands are thin lock+call
    // wrappers over WorkspaceRegistry::register/deregister (themselves tested in
    // mod.rs). State<'_, _> injection needs a live Tauri app, so these tests
    // exercise the exact lock-then-mutate path the commands run by operating on a
    // raw SharedRegistry (what init_registry returns + what the app manages),
    // proving the register→resolve→deregister→miss lifecycle through the same
    // Mutex<WorkspaceRegistry> the commands lock.
    #[test]
    fn register_then_resolve_then_deregister_lifecycle() {
        let dir = tempfile::TempDir::new().unwrap();
        let shared = init_registry();
        let cwd = dir.path().to_string_lossy().to_string();

        // Register (the workspace_register command body).
        {
            let mut reg = shared.lock().unwrap();
            reg.register(Path::new(&cwd), "ws-1".to_string());
        }
        // A hook event from that cwd now resolves to the workspace.
        assert_eq!(
            shared.lock().unwrap().resolve_cwd(&cwd),
            Some("ws-1".to_string())
        );

        // Deregister (the workspace_deregister command body).
        {
            let mut reg = shared.lock().unwrap();
            reg.deregister(Path::new(&cwd));
        }
        // Now it misses — the event would be dropped (status stays Unknown).
        assert_eq!(shared.lock().unwrap().resolve_cwd(&cwd), None);
    }

    #[test]
    fn hook_event_from_a_subdirectory_resolves_to_the_workspace() {
        // WP2 (stuck-Running dot) at the consuming-surface level: a hook event whose cwd
        // is a SUBDIRECTORY of the registered workspace root must resolve to that
        // workspace through the SAME Mutex<WorkspaceRegistry> the drain_loop +
        // workspace_register commands lock. Before the fix, resolve_cwd's exact-match
        // dropped a subdir-cwd Stop → the idle transition was lost → dot stuck Running.
        // This proves the fix end-to-end at the registry seam the live pipeline uses
        // (the full hook→socket→emit chain's live confirmation is DEFERRED-TO-RELEASE).
        let dir = tempfile::TempDir::new().unwrap();
        let subdir = dir.path().join("src-tauri");
        std::fs::create_dir(&subdir).unwrap();
        let shared = init_registry();
        {
            let mut reg = shared.lock().unwrap();
            reg.register(dir.path(), "ws-1".to_string());
        }
        // A Stop fired with the subdir as cwd resolves to ws-1 (was None before WP2).
        assert_eq!(
            shared
                .lock()
                .unwrap()
                .resolve_cwd(&subdir.to_string_lossy()),
            Some("ws-1".to_string()),
            "a hook event from a workspace subdir must resolve to that workspace"
        );
    }

    #[test]
    fn deregister_unknown_path_is_a_noop() {
        let shared = init_registry();
        // Deregistering a path that was never registered must not error/panic —
        // HashMap::remove on an absent key is a no-op (the command returns Ok).
        let mut reg = shared.lock().unwrap();
        reg.deregister(Path::new("/never/registered"));
        assert_eq!(reg.len(), 0);
    }
}
