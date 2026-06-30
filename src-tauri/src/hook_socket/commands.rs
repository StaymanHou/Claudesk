//! Runtime wiring for the hook-socket listener: resolve the socket path, bind it,
//! spawn the accept-loop thread, and hold the receiver in managed state.
//!
//! The pure parse + IO-loop logic lives in [`super`]; this module adds only the
//! runtime-dependent pieces (the `AppHandle`-resolved socket path, the launch
//! wiring, the managed-state holder). Mirrors `hook_install::commands`' split.
//!
//! [`hook_socket_path`] is the **single source of truth** for the socket location
//! — both this listener and `hook_install` (which sets `CLAUDESK_HOOK_SOCK` in the
//! registered hook command) resolve through it, so the writer (the hook) and the
//! reader (this listener) can never disagree on the path.

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::thread::JoinHandle;

use tauri::{AppHandle, Emitter, Manager};

use super::{bind_listener, spawn_listener, HookEvent};

/// Basename of the Claudesk-owned hook socket under the app-data dir. Module-private —
/// the only consumer is `hook_socket_path` below (the old `hook_install` copy was retired
/// in favor of delegating to it); re-widen to `pub(crate)` only if another module needs it.
const HOOK_SOCKET_NAME: &str = "hook.sock";

/// Resolve the hook socket path: `<app-data>/hook.sock`. Always via
/// `app_data_dir()` — on macOS this resolves to the bundle *identifier*
/// (`~/Library/Application Support/com.claudesk.app/`), NOT the productName
/// `Claudesk/` (see SURFACE-2026-06-22-APP-DATA-DIR-IS-BUNDLE-IDENTIFIER-NOT-PRODUCTNAME).
/// Never hardcode the path string. The dir is created if absent so the bind can
/// place the socket file.
pub fn hook_socket_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("could not create app data dir {}: {e}", data_dir.display()))?;
    Ok(data_dir.join(HOOK_SOCKET_NAME))
}

/// Managed-state holder for the live listener: the accept-loop's [`JoinHandle`],
/// the resolved socket path (for cleanup on shutdown), and the [`Receiver`] end of
/// the event channel. WP4's broadcaster will take/drain the receiver; until then
/// it is held (dead-code-allowed in [`super`]). The handle is kept so the thread's
/// lifetime is tied to the holder; the path is kept so `CloseRequested` can unlink
/// the socket file.
pub struct HookSocketState {
    pub socket_path: PathBuf,
    pub receiver: Mutex<Option<Receiver<HookEvent>>>,
    _handle: JoinHandle<()>,
}

/// Start the hook-socket listener on launch: resolve the path, bind (clearing a
/// stale file), spawn the accept-loop thread, and return the managed-state holder
/// for `app.manage(...)`. Returns a human-readable error (the caller surfaces it —
/// never swallow, per the WP6/WP7-M2 IPC-error lesson; a failed bind leaves status
/// `Unknown`, never PTY-inferred). Called from the Tauri `setup` hook in `lib.rs`.
pub fn start_on_launch(app: &AppHandle) -> Result<HookSocketState, String> {
    let socket_path = hook_socket_path(app)?;
    let listener = bind_listener(&socket_path).map_err(|e| {
        format!(
            "could not bind hook socket at {}: {e}",
            socket_path.display()
        )
    })?;
    let (tx, rx) = mpsc::channel::<HookEvent>();
    let handle = spawn_listener(listener, tx);
    Ok(HookSocketState {
        socket_path,
        receiver: Mutex::new(Some(rx)),
        _handle: handle,
    })
}

/// Unlink the socket file on app shutdown (`WindowEvent::CloseRequested`), mirroring
/// the `cc_session::kill_all` reaping discipline. Best-effort: a missing file is
/// fine, and the next launch's `bind_listener` also clears a stale file (belt and
/// suspenders). Takes the resolved path from the managed [`HookSocketState`].
pub fn cleanup_socket(socket_path: &std::path::Path) {
    match std::fs::remove_file(socket_path) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => eprintln!(
            "[claudesk] could not remove hook socket {}: {e}",
            socket_path.display()
        ),
    }
}

/// Surface a listener-start failure to the frontend (and stderr), never swallow.
/// The status surfaces default to `Unknown` when the socket never binds.
pub fn emit_start_error(app: &AppHandle, err: &str) {
    eprintln!("[claudesk] hook-socket listener failed to start: {err}");
    let _ = app.emit("hook-socket-error", err);
}
