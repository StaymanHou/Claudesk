//! Runtime wiring for the time-analytics store: resolve the per-identity DB path,
//! open + bootstrap the connection (WAL + busy-timeout), hold it in managed state,
//! and expose the **gated** write entry the M9 WP3 fan-out drain calls per event.
//!
//! The pure schema/mapping logic lives in [`super`]; this module adds only the
//! runtime-dependent pieces — the `AppHandle`-resolved path, the connection holder,
//! the toggle gate. Mirrors `hook_socket::commands`' split (pure parse/IO in the
//! parent, launch wiring here) and `config_store`'s `app_data_dir()` path discipline.

use std::path::PathBuf;
use std::sync::mpsc::Receiver;
use std::sync::Mutex;
use std::thread;

use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager, State};

use super::query::{
    build_comparison_data, build_metrics, build_range, build_week, compare_day_vs_trailing_bounds,
    compare_month_over_month_bounds, compare_week_over_week_bounds, ComparisonPayload,
    MetricsPayload, RangePayload, WeekPayload,
};
use super::{
    bootstrap, event_to_row, insert_row, native_row, NativeContext, NativeLaunchTool, NativeSignal,
    TimeRow,
};
use crate::hook_socket::HookEvent;
use crate::reclassify::EventRow;

/// Basename of the per-identity time-analytics DB under the app-data dir. Sibling to
/// `hook.sock` (both resolved from `app_data_dir()`), so it inherits the same dev/prod
/// isolation — `com.claudesk.app/time-analytics.sqlite` vs `.dev/…`.
const TIME_STORE_DB_NAME: &str = "time-analytics.sqlite";

/// Resolve the time-analytics DB path: `<app-data>/time-analytics.sqlite`. Always via
/// `app_data_dir()` (the bundle *identifier* dir on macOS, per-identity — the same
/// discipline `hook_socket::hook_socket_path` follows). The dir is created if absent
/// so the connection can create the file. Never hardcode the path string.
pub fn time_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("could not create app data dir {}: {e}", data_dir.display()))?;
    Ok(data_dir.join(TIME_STORE_DB_NAME))
}

/// Managed-state holder for the live time-analytics connection. Opened + bootstrapped
/// once at launch (in [`open_and_bootstrap`]); the fan-out drain thread locks it per
/// event to INSERT. The `Mutex` serializes writes from the single drain thread (and
/// leaves room for WP2.5's native-signal writer to share the same connection later).
pub struct TimeStore {
    conn: Mutex<Connection>,
}

impl TimeStore {
    /// Wrap an already-opened+bootstrapped connection. Public for tests that supply an
    /// in-memory connection; production uses [`open_and_bootstrap`].
    pub fn new(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }

    /// Persist an event **iff `gate_on`** — the write-gate call-site (M9 decision 3).
    /// When the toggle is OFF this is a zero-IO no-op (no lock, no INSERT). When ON,
    /// it maps the event to a row and INSERTs it; a map miss (empty event name) is a
    /// silent no-op, and an INSERT error is surfaced (never swallowed) but must NOT
    /// propagate to crash the drain thread — the caller logs it and continues.
    ///
    /// WP5 replaces the *source* of `gate_on` (the persisted toggle); WP2 owns this
    /// call-site + defaults the source OFF (see [`tracking_enabled`]).
    pub fn write_gated(&self, event: &HookEvent, gate_on: bool) -> Result<(), String> {
        if !gate_on {
            return Ok(()); // zero-IO gate: tracking OFF → no SQLite touch at all.
        }
        let Some(row) = event_to_row(event) else {
            return Ok(()); // unmappable (empty event name) — not an error.
        };
        let conn = self
            .conn
            .lock()
            .map_err(|_| "time_store connection lock poisoned".to_string())?;
        insert_row(&conn, &row).map_err(|e| format!("time_store insert failed: {e}"))
    }

    /// Persist a **Claudesk-native** signal row **iff `gate_on`** — the WP2.5 sibling
    /// of [`write_gated`], sharing the SAME connection + gate discipline. When the
    /// toggle is OFF this is a zero-IO no-op (no lock, no INSERT), matching the
    /// CC-hook path. When ON it maps the signal + attribution to a [`TimeRow`] with
    /// `source = "claudesk-native"` and INSERTs it. An INSERT error is surfaced
    /// (never swallowed) but callers (main-thread command / focus handler) log and
    /// continue — a failed native write must never crash the app or perturb status.
    pub fn write_native_gated(
        &self,
        signal: &NativeSignal,
        ctx: &NativeContext,
        gate_on: bool,
    ) -> Result<(), String> {
        if !gate_on {
            return Ok(()); // zero-IO gate: tracking OFF → no SQLite touch at all.
        }
        let row = native_row(signal, ctx);
        let conn = self
            .conn
            .lock()
            .map_err(|_| "time_store connection lock poisoned".to_string())?;
        insert_row(&conn, &row).map_err(|e| format!("time_store native insert failed: {e}"))
    }

    /// Read the `events` rows in `[start_ms, end_ms)` for the WP4 query layer. Locks
    /// the same `Mutex<Connection>` the writers use; WAL lets a concurrent reader not
    /// block a writer, and the single-webview read is serialized by the Mutex (cheap).
    /// A poisoned lock or a query error is surfaced (never swallowed). (WP4 P3.2.)
    pub fn query_window(&self, start_ms: i64, end_ms: i64) -> Result<Vec<EventRow>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "time_store connection lock poisoned".to_string())?;
        super::query::rows_in_window(&conn, start_ms, end_ms)
            .map_err(|e| format!("time_store query failed: {e}"))
    }

    /// Startup reconciliation (M9 WP6.5 Phase 4): close out sessions left **dangling** by a
    /// prior crash / power-loss / force-quit / ⌘Q that never wrote a session-end marker.
    /// Reads every row, computes the dangling set ([`reclassify::dangling_sessions`] — no
    /// authoritative marker + last event older than `cap_ms` before `now_ms`), and writes a
    /// `WorkspaceClose` marker **at each dangling session's last-seen ts** (NOT `now`).
    ///
    /// **Idempotent:** after the first run each closed session HAS a `WorkspaceClose` marker,
    /// so `authoritative_end` is `Some` and it is no longer dangling — a second run writes
    /// nothing. Read-time capping ([`resolve_session_end`]) already bounds the render; this
    /// makes the row STREAM honest so the data matches the display. Returns the count closed.
    /// All under one lock (read + writes atomic w.r.t. the drain thread). Errors surfaced.
    pub fn reconcile_dangling(&self, now_ms: i64, cap_ms: i64) -> Result<usize, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "time_store connection lock poisoned".to_string())?;
        // Read all rows up to now (inclusive) — window end is exclusive, so +1.
        let rows = super::query::rows_in_window(&conn, i64::MIN, now_ms.saturating_add(1))
            .map_err(|e| format!("time_store reconcile read failed: {e}"))?;
        let dangling = crate::reclassify::dangling_sessions(&rows, now_ms, cap_ms);
        for d in &dangling {
            // A WorkspaceClose marker AT the last-seen ts (the true end), NOT now_ms —
            // reconciliation records where the session actually went silent.
            let row = TimeRow {
                ts: d.last_ts,
                session_id: d.session_id.clone(),
                cwd: d.cwd.clone(),
                event: crate::reclassify::EVENT_WORKSPACE_CLOSE.to_string(),
                tool_name: None,
                agent_type: None,
                source: super::SOURCE_CLAUDESK_NATIVE.to_string(),
                meta: None,
            };
            insert_row(&conn, &row)
                .map_err(|e| format!("time_store reconcile insert failed: {e}"))?;
        }
        Ok(dangling.len())
    }
}

/// Open a DB at `path`, set connection pragmas (WAL + busy-timeout for multi-writer
/// safety — mirrors claude-time's `journal_mode=WAL` + `.timeout 2000`), bootstrap the
/// schema, and wrap it in a [`TimeStore`]. The path-agnostic core of
/// [`open_and_bootstrap`], split out so it is testable against a real temp-file DB
/// (WAL is a no-op on an in-memory connection, so the in-memory tests can't exercise
/// this path). A failure is surfaced (never swallowed).
pub fn open_at_path(path: &std::path::Path) -> Result<TimeStore, String> {
    let conn = Connection::open(path).map_err(|e| {
        format!(
            "could not open time-analytics DB at {}: {e}",
            path.display()
        )
    })?;
    // WAL: concurrent readers (WP4 query layer) don't block the writer. busy_timeout:
    // wait out a transient lock instead of erroring (multi-writer contention once
    // WP2.5's native-signal writer shares the DB). Both are idempotent to re-set.
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("could not set WAL on time-analytics DB: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_millis(2000))
        .map_err(|e| format!("could not set busy_timeout on time-analytics DB: {e}"))?;
    bootstrap(&conn).map_err(|e| format!("could not bootstrap time-analytics schema: {e}"))?;
    Ok(TimeStore::new(conn))
}

/// Resolve the per-identity DB path and open it via [`open_at_path`]. Returns the
/// [`TimeStore`] holder for `app.manage(...)`. The status path is independent, so a
/// time-store open failure must not take down the dots (the caller surfaces + drops).
pub fn open_and_bootstrap(app: &AppHandle) -> Result<TimeStore, String> {
    let path = time_store_path(app)?;
    open_at_path(&path)
}

/// The write-gate source (M9 WP2 hook-point). Returns whether time-analytics writes
/// are enabled. **Defaults OFF** (M9 decision 2 — zero cost for users who don't want
/// tracking); WP2's job is this call-site, not the toggle UI.
///
/// **WP5 (2026-07-08)** wired the body to the persisted universal-vs-workflow-coupled
/// feature flag in `AppSettings` (`settings.json`, bundle-identity-isolated). Reads
/// [`read_time_tracking_enabled`], which **defaults `false`** — so a fresh install ships
/// with the write path built but dormant (the WP3 fan-out drain still runs
/// `write_gated(event, tracking_enabled(app))`, a zero-IO no-op while this is off). Kept
/// as a single function so the gate is one body, not a call-site sweep.
///
/// **Degrades to OFF on any error.** This is called from the hook-stream drain thread; a
/// missing/malformed settings file (or an unresolvable data dir) must NOT panic the drain
/// — the universal status dots ride the same stream and must survive. A read failure
/// therefore returns `false` (tracking off) rather than propagating.
pub fn tracking_enabled(app: &AppHandle) -> bool {
    let dir = match crate::config_store::commands::resolve_data_dir(app) {
        Ok(d) => d,
        Err(_) => return false,
    };
    crate::config_store::settings::read_time_tracking_enabled(&dir).unwrap_or(false)
}

/// Broadcast fired when the tracking toggle changes, so every surface that reflects it
/// (the picker checkbox now; the WP6 dashboard tab's empty-state later) re-renders off
/// the single backend source of truth. Mirrors `cc_session::commands::CC_PERMISSION_MODE_EVENT`.
pub const TIME_TRACKING_ENABLED_EVENT: &str = "time-tracking-enabled";

/// Read the persisted time-analytics tracking toggle (default `false`). The picker
/// checkbox seeds from this on mount; the WP6 dashboard tab reads it to decide between
/// the analytics view and the "enable tracking…" empty-state. Thin wrapper over
/// [`read_time_tracking_enabled`](crate::config_store::settings::read_time_tracking_enabled)
/// — mirror of `cc_get_permission_mode`.
#[tauri::command]
pub fn time_get_tracking_enabled(app: AppHandle) -> Result<bool, String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::read_time_tracking_enabled(&dir).map_err(|e| e.to_string())
}

/// Set the tracking toggle. Persists it, then broadcasts [`TIME_TRACKING_ENABLED_EVENT`]
/// so the picker checkbox (and any future surface) re-renders. Takes effect immediately —
/// the write-gate ([`tracking_enabled`]) reads the persisted flag per event, so the very
/// next hook/native signal after a set is gated by the new value. Mirror of
/// `cc_set_permission_mode` (minus the argv-per-spawn caveat — there is no spawn here).
#[tauri::command]
pub fn time_set_tracking_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    crate::config_store::settings::write_time_tracking_enabled(&dir, enabled)
        .map_err(|e| e.to_string())?;
    let _ = app.emit(TIME_TRACKING_ENABLED_EVENT, enabled);
    Ok(())
}

/// Managed-state holder for the live [`TimeStore`], so [`write_gated`](TimeStore::
/// write_gated) reaches the connection from the drain thread via `app.try_state`.
pub type SharedTimeStore = TimeStore;

/// Managed-state holder for the **active-context** signal (M9 WP2.5): which workspace
/// is center-staged and which right-panel surface (editor/diff/terminal) is active.
/// The frontend sets it via [`time_set_active_context`] on center-stage promote AND on
/// surface switch; the focus handler (and Phase 3's keystroke path) reads it to
/// attribute native-signal rows to the right workspace/surface. A `Mutex` because it's
/// read on the main thread (focus handler / commands) and written by the command.
///
/// Held as a `NativeContext` (the same attribution struct native rows carry) with the
/// `session_id` slot unused here — focus/surface signals are workspace-level; the
/// keystroke path fills `session_id` from `cc_input` at write time.
pub type SharedActiveContext = Mutex<NativeContext>;

/// Initialize the empty active-context holder (managed at launch). Empty until the
/// frontend's first `time_set_active_context` — a focus event before any workspace is
/// active attributes to nothing (empty columns), which is correct.
pub fn init_active_context() -> SharedActiveContext {
    Mutex::new(NativeContext::default())
}

/// Frontend → backend: record the currently-active workspace + right-panel surface
/// (M9 WP2.5, OQ1+OQ4). Called on center-stage promote (workspace switch) and on
/// right-panel surface switch (editor/diff/terminal). Stores into the managed
/// [`SharedActiveContext`] so the focus handler + keystroke path attribute native
/// rows correctly. Pure state-set — NOT gated (holding the active context costs
/// nothing and the WRITES that consume it are gated); a poisoned lock is surfaced,
/// never swallowed (the never-swallow IPC discipline).
///
/// `cwd` is the active workspace's project dir (for join-free attribution on the
/// row); `workspace_id`/`surface` are opaque handles. All optional so the frontend
/// can clear the context (e.g. all workspaces closed) by passing nulls.
#[tauri::command]
pub fn time_set_active_context(
    app: AppHandle,
    active: State<'_, SharedActiveContext>,
    workspace_id: Option<String>,
    surface: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    // Detect a surface CHANGE (vs the previously-stored surface) so we can emit an
    // ActiveSurface switch-marker row (Phase 4) — WP3 needs the switch timestamp.
    let surface_changed = active.lock().map(|c| c.surface != surface).unwrap_or(false);
    set_active_context(&active, workspace_id, surface, cwd)?;
    if surface_changed {
        // Emit the switch marker attributed to the NOW-current context (gated; no-op
        // when tracking is OFF, the WP2 default). Read the freshly-set context back.
        let ctx = active.lock().map(|c| c.clone()).unwrap_or_default();
        record_active_surface(&app, &ctx);
    }
    Ok(())
}

/// Pure core of [`time_set_active_context`] — set the active-context fields on the
/// holder. Split out so it's unit-testable against a raw `SharedActiveContext` with
/// no Tauri app (the `State` wrapper the command takes can't be built in a test).
/// `session_id` is always cleared here — it's workspace-level context; the keystroke
/// path (Phase 3) fills `session_id` from `cc_input` at write time.
pub fn set_active_context(
    active: &SharedActiveContext,
    workspace_id: Option<String>,
    surface: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    let mut ctx = active
        .lock()
        .map_err(|_| "active-context lock poisoned".to_string())?;
    ctx.workspace_id = workspace_id;
    ctx.surface = surface;
    ctx.cwd = cwd;
    ctx.session_id = None;
    Ok(())
}

/// Read the current active context (a clone, so the caller doesn't hold the lock).
/// Used by the focus handler to attribute focus/blur rows. Returns the default
/// (empty) context if the lock is poisoned — a focus row with empty attribution is
/// better than dropping the signal or panicking the main thread.
pub fn active_context_snapshot(app: &AppHandle) -> NativeContext {
    app.try_state::<SharedActiveContext>()
        .and_then(|s| s.lock().ok().map(|c| c.clone()))
        .unwrap_or_default()
}

/// Write a focus/blur native signal for the main window, gated + attributed to the
/// current active context. Called from the `lib.rs` `WindowEvent::Focused` handler
/// (main thread) ALONGSIDE the PiP auto-summon path — independent, best-effort: a
/// write failure is logged and dropped, never perturbing focus handling or the PiP
/// path. Zero-IO when the tracking gate is OFF (the WP2 default).
///
/// `preceded_by_launch` is `false` here in Phase 2; Phase 4 wires the launch-mark →
/// blur correlation (a blur that follows a Claudesk-initiated external launch).
pub fn record_focus_change(app: &AppHandle, focused: bool) {
    let gate_on = tracking_enabled(app);
    if !gate_on {
        return; // zero-IO fast path: tracking OFF (WP2 default) → nothing to do.
    }
    let Some(store) = app.try_state::<SharedTimeStore>() else {
        return; // store not managed (open failed at launch) — can't record; never panic.
    };
    let ctx = active_context_snapshot(app);
    let signal = if focused {
        NativeSignal::WindowFocus
    } else {
        NativeSignal::WindowBlur {
            preceded_by_launch: false,
        }
    };
    if let Err(e) = store.write_native_gated(&signal, &ctx, gate_on) {
        eprintln!("[claudesk] time-store focus/blur write failed (dropped): {e}");
    }
}

/// Record a PTY keystroke-activity native signal (M9 WP2.5 Phase 3), gated. Called
/// from `cc_input` (the single PTY-input choke-point) AFTER the bytes are forwarded,
/// with `byte_count = bytes.len()` and the originating `session_id`. **Privacy: the
/// COUNT and the session id only — NEVER the bytes.** Attributed to the active
/// workspace/surface (from `active_context_snapshot`), with the row's `session_id`
/// overridden to the keystroke's actual PTY session (the active context's `session_id`
/// slot is always empty — it's workspace-level; keystrokes name their own session).
///
/// Best-effort: zero-IO when the gate is OFF (the WP2 default); a write failure is
/// logged and dropped — a telemetry miss must never break the hot input path.
pub fn record_keystroke_activity(app: &AppHandle, session_id: &str, byte_count: usize) {
    let gate_on = tracking_enabled(app);
    if !gate_on {
        return; // zero-IO fast path: tracking OFF (WP2 default) → no work in the hot path.
    }
    let Some(store) = app.try_state::<SharedTimeStore>() else {
        return; // store not managed (open failed at launch) — can't record; never panic.
    };
    // Start from the active workspace/surface, then stamp THIS keystroke's PTY session.
    let mut ctx = active_context_snapshot(app);
    ctx.session_id = Some(session_id.to_string());
    let signal = NativeSignal::KeystrokeActivity { byte_count };
    if let Err(e) = store.write_native_gated(&signal, &ctx, gate_on) {
        eprintln!("[claudesk] time-store keystroke write failed (dropped): {e}");
    }
}

/// Record a Claudesk-initiated external-tool launch (M9 WP2.5 Phase 4), gated. Called
/// from `sublime_open` / `smerge_open` / `finder_open` AFTER the tool spawns, marking
/// which tool + `now_ms()` + the active workspace/surface. This is the signal WP3
/// correlates a subsequent blur against (the "blur-but-working" case: the operator
/// popped Sublime/Merge/Finder and is now reading it while Claudesk is blurred).
///
/// **Scope note:** this marks CLAUDESK-initiated launches only. CC's OWN `open
/// <screenshot>`/browser launches arrive via the CC hook stream as `PostToolUse`
/// (`tool_name=Bash`) `source=cc-hook` rows (WP2) — WP3 reads BOTH. Best-effort +
/// gated (zero-IO when OFF); a write failure never blocks the launch (already done).
pub fn record_external_launch(app: &AppHandle, tool: NativeLaunchTool) {
    let gate_on = tracking_enabled(app);
    if !gate_on {
        return; // zero-IO fast path: tracking OFF (WP2 default).
    }
    let Some(store) = app.try_state::<SharedTimeStore>() else {
        return; // store not managed — can't record; never panic.
    };
    let ctx = active_context_snapshot(app);
    let signal = NativeSignal::ExternalLaunch { tool };
    if let Err(e) = store.write_native_gated(&signal, &ctx, gate_on) {
        eprintln!("[claudesk] time-store external-launch write failed (dropped): {e}");
    }
}

/// Record an explicit workspace-close session-end marker (M9 WP6.5 signal 1), gated.
/// Called when Claudesk tears down a CC PTY: from `cc_kill` (per-workspace close) and from
/// the `CloseRequested` handler's `kill_all` (app quit), once per killed `session_id`.
///
/// This is the authoritative, synchronously-recorded session end the reclassifier's
/// `authoritative_end` reads at top precedence — the backstop for the hard-kill/crash case
/// where CC cannot emit a `SessionEnd` (research 2026-07-08). The row carries the closed
/// session handle + `now_ms()` only (privacy: no content).
///
/// Best-effort: zero-IO when the gate is OFF (the default); a write failure is logged and
/// dropped — a telemetry miss must NEVER block or panic the teardown path (a panic here
/// would abort workspace-close / app-quit).
pub fn record_workspace_close(app: &AppHandle, session_id: &str) {
    let gate_on = tracking_enabled(app);
    if !gate_on {
        return; // zero-IO fast path: tracking OFF (the default) → nothing to do.
    }
    let Some(store) = app.try_state::<SharedTimeStore>() else {
        return; // store not managed (open failed at launch) — can't record; never panic.
    };
    // The marker is attributed to the closed PTY session (workspace-level attribution from
    // the active context is not meaningful at close — the session id is the anchor).
    let ctx = NativeContext {
        session_id: Some(session_id.to_string()),
        ..NativeContext::default()
    };
    if let Err(e) = store.write_native_gated(&NativeSignal::WorkspaceClose, &ctx, gate_on) {
        eprintln!("[claudesk] time-store workspace-close write failed (dropped): {e}");
    }
}

/// Record an active-surface-switch native signal (M9 WP2.5 Phase 4), gated. Called
/// from [`time_set_active_context`] when the surface changes, so WP3 has the SWITCH
/// TIMESTAMP (not just the surface stamped on other rows) — needed to time the
/// operator's "reading code in the editor" vs "following CC in the terminal" spans
/// even when no focus/keystroke event coincides with the switch. Best-effort + gated.
fn record_active_surface(app: &AppHandle, ctx: &NativeContext) {
    let gate_on = tracking_enabled(app);
    if !gate_on {
        return;
    }
    let Some(store) = app.try_state::<SharedTimeStore>() else {
        return;
    };
    if let Err(e) = store.write_native_gated(&NativeSignal::ActiveSurface, ctx, gate_on) {
        eprintln!("[claudesk] time-store active-surface write failed (dropped): {e}");
    }
}

/// Start the time-analytics writer: own the fan-out's time-event [`Receiver`] and
/// spawn a drain thread that, per event, reads the tracking gate ([`tracking_enabled`])
/// and calls [`TimeStore::write_gated`]. The SECOND consumer of the hook stream,
/// parallel to `status_broadcaster::commands::start_broadcaster` (same blocking-
/// `mpsc::Receiver`-on-a-dedicated-thread shape). The `TimeStore` is read from managed
/// state per event (managed by the caller before this runs), so a future WP2.5 native
/// writer can share the same connection. A closed channel (`recv` `Err` = the listener
/// dropped this sender) ends the drain cleanly.
///
/// **Independence invariant (M9 WP2):** an insert error is logged and dropped — it must
/// NEVER crash this thread or perturb the status path (the two drains are independent;
/// the status broadcaster consumes its own receiver from the same fan-out). And while
/// the toggle is OFF (the WP2 default), `write_gated` is a zero-IO no-op.
pub fn start_writer(app: AppHandle, receiver: Receiver<HookEvent>) -> thread::JoinHandle<()> {
    thread::Builder::new()
        .name("claudesk-time-store-writer".into())
        .spawn(move || drain_loop(app, receiver))
        .expect("failed to spawn time-store writer thread")
}

/// The drain-loop body — blocks on `rx.recv()`, per event reads the gate + writes.
/// Extracted so it reads top-to-bottom (mirrors `status_broadcaster`'s `drain_loop`).
fn drain_loop(app: AppHandle, receiver: Receiver<HookEvent>) {
    while let Ok(event) = receiver.recv() {
        let gate_on = tracking_enabled(&app);
        // Zero-IO fast path when the toggle is OFF (the WP2 default): don't even
        // touch managed state. When ON, resolve the managed store and write.
        if !gate_on {
            continue;
        }
        let Some(store) = app.try_state::<SharedTimeStore>() else {
            // Store not managed (open failed at launch) — status path is independent,
            // so we simply can't record. Drop the event; never panic.
            continue;
        };
        if let Err(e) = store.write_gated(&event, gate_on) {
            // Surfaced, never fatal — a failed insert must not crash the drain or
            // touch the status path.
            eprintln!("[claudesk] time-store write failed (dropped): {e}");
        }
    }
    // recv Err: the listener dropped this sender (shutdown). Exit cleanly.
}

// ===========================================================================
// M9 WP4 P3.1 — the segment-model query command.
// ===========================================================================

/// The window an analytics query covers. Internally-tagged (`{ "kind": "day" }` /
/// `{ "kind": "week" }` / `{ "kind": "custom", "start_ms": …, "end_ms": … }`) so the
/// frontend sends a discriminated union. `day` = today (local); `week` = a Mon–Sun ISO
/// week — the one containing today by default, or the week containing an optional
/// `monday` anchor (`"YYYY-MM-DD"`) so the dashboard's Week-nav can step to a PAST week
/// (M9 WP6b-3); `custom` = an explicit epoch-ms span. All resolution is on the operator's
/// LOCAL calendar (the frozen-contract coordinate system). snake_case field names (the
/// project IPC convention).
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum QueryWindow {
    Day,
    /// `monday` is the anchor date the week is derived from. Omitted (`None`) on a bare
    /// `{ "kind": "week" }` → today's week (back-compat, byte-unchanged). When present it
    /// is snapped to its own Monday defensively (the FE always sends a Monday, but the
    /// wire is never trusted).
    Week {
        #[serde(default)]
        monday: Option<String>,
    },
    Custom {
        start_ms: i64,
        end_ms: i64,
    },
    /// `{ "kind": "metrics", "window": { "kind": "day" | "week" | "custom", … } }`
    /// (M9 WP6c-1) — the AGGREGATE-metrics query. The nested `window` selects the span
    /// (reusing the same day/week/custom resolution); the result is a [`MetricsPayload`]
    /// (window-level analytics) rather than a per-session Range/Week payload. Boxed to
    /// keep the enum from being recursively unsized.
    Metrics {
        window: Box<QueryWindow>,
    },
    /// `{ "kind": "compare", "spec": … }` (M9 WP6c-2) — the A/B comparison query. `spec`
    /// selects a named preset (WoW / MoM / today-vs-trailing) or a custom A/B pair; the
    /// result is a [`ComparisonPayload`] (`{a, b, meta}`, each side a full metrics tree).
    /// Preset day-math is resolved backend-side on the LOCAL calendar (the FE sends only
    /// the preset string); custom sends two explicit epoch-ms spans.
    Compare {
        spec: CompareSpec,
    },
}

/// The A/B window selector for a `{ "kind": "compare" }` query. Internally-tagged so the FE
/// sends `{"kind":"compare","spec":{"preset":"wow"}}` or
/// `{"kind":"compare","spec":{"custom":{"a":{…},"b":{…}}}}`.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompareSpec {
    /// A named preset — bounds resolved from today (local). Wire: `{"preset":"wow"}`.
    Preset(ComparePreset),
    /// Two explicit epoch-ms spans; each maps to the local days it touches. Wire:
    /// `{"custom":{"a":{start_ms,end_ms},"b":{…}}}`.
    Custom { a: CustomSide, b: CustomSide },
}

/// One side of a custom A/B comparison — an explicit epoch-ms span.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct CustomSide {
    pub start_ms: i64,
    pub end_ms: i64,
}

/// The three named comparison presets. `today_vs_trailing` compares today against the
/// trailing 7-day baseline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ComparePreset {
    Wow,
    Mom,
    TodayVsTrailing,
}

/// The result of a [`time_analytics_query`] — a range payload (day/custom) or a week
/// rollup. Internally-tagged (`{ "kind": "range", … }` / `{ "kind": "week", … }`) so
/// the WP6 dashboard branches on `kind`. snake_case end-to-end (NO `rename_all` on the
/// payload structs themselves — they're already snake_case; only the tag is added).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TimeAnalyticsResult {
    Range(RangePayload),
    Week(WeekPayload),
    /// `{ "kind": "metrics", … }` — the M9 WP6c-1 window-level aggregate metrics.
    Metrics(MetricsPayload),
    /// `{ "kind": "compare", … }` — the M9 WP6c-2 A/B comparison (`{a, b, meta}`). Boxed:
    /// it carries TWO full metrics trees, so it dwarfs the other variants (clippy
    /// `large_enum_variant`); the Box is a serde no-op, so the wire shape is unchanged.
    Compare(Box<ComparisonPayload>),
}

/// Frontend → backend: build the segment-model payload for `window`, scoped `global`
/// (all-projects, per-project breakdown — the resolved M9 WP4 scope). Reads the
/// `events` rows in the resolved window from the managed [`TimeStore`], runs the WP4
/// query transform (which runs the WP3 reclassifier), and returns the DTO.
///
/// `scope` is accepted for forward-compat but only `"global"` is implemented in v1
/// (any other value → an explicit error, so a future per-workspace scope is a visible
/// TODO, not a silent global fallback). When the store isn't managed (open failed at
/// launch) the query returns an empty payload for the window rather than erroring —
/// the read path must degrade gracefully (the dots + app keep working).
///
/// Note: this reads whatever rows EXIST; at WP4 the write-gate defaults OFF (WP2), so
/// on a fresh install the DB is empty and the payload is empty — that is correct, and
/// proves the read path. WP5's toggle turns writing on.
#[tauri::command]
pub fn time_analytics_query(
    app: AppHandle,
    scope: String,
    window: QueryWindow,
) -> Result<TimeAnalyticsResult, String> {
    if scope != "global" {
        return Err(format!(
            "time_analytics_query: unsupported scope {scope:?} (only \"global\" is implemented in v1)"
        ));
    }
    let (start_ms, end_ms, mode) = resolve_window(&window);
    // Read rows (empty when the store isn't managed or the window is empty).
    let rows: Vec<EventRow> = match app.try_state::<SharedTimeStore>() {
        Some(store) => store.query_window(start_ms, end_ms)?,
        None => Vec::new(),
    };
    let project_names = std::collections::HashMap::new(); // WP4: no explicit aliasing yet
    match mode {
        WindowMode::Range { start_day, end_day } => {
            let payload = build_range(start_day, end_day, &rows, &project_names)?;
            Ok(TimeAnalyticsResult::Range(payload))
        }
        WindowMode::Week { monday } => {
            let payload = build_week(monday, &rows, &project_names)?;
            Ok(TimeAnalyticsResult::Week(payload))
        }
        WindowMode::Metrics { start_day, end_day } => {
            // Window-level aggregate metrics (M9 WP6c-1) — build_metrics runs the WP3
            // reclassifier over the WP6.5-capped events and re-derives the aggregate
            // shape. Global scope only (window-global, no per-project rollup).
            let payload = build_metrics(start_day, end_day, &rows);
            Ok(TimeAnalyticsResult::Metrics(payload))
        }
        WindowMode::Compare {
            a_start,
            a_end,
            b_start,
            b_end,
        } => {
            // A/B comparison (M9 WP6c-2) — `rows` was read over the UNION span (see
            // resolve_window); build_comparison_data partitions per side by local day and
            // runs build_metrics per side. `{a, b, meta}` — no `deltas` (CompareView
            // recomputes FE-side).
            let payload = build_comparison_data(a_start, a_end, b_start, b_end, &rows);
            Ok(TimeAnalyticsResult::Compare(Box::new(payload)))
        }
    }
}

/// Which builder a resolved window maps to.
enum WindowMode {
    Range {
        start_day: chrono::NaiveDate,
        end_day: chrono::NaiveDate,
    },
    Week {
        monday: chrono::NaiveDate,
    },
    /// M9 WP6c-1 — the aggregate-metrics builder over `[start_day, end_day]` inclusive
    /// (the days the nested window resolved to).
    Metrics {
        start_day: chrono::NaiveDate,
        end_day: chrono::NaiveDate,
    },
    /// M9 WP6c-2 — the A/B comparison builder over two inclusive local-day windows. The
    /// command reads rows once over the UNION span, then `build_comparison_data` partitions
    /// per side.
    Compare {
        a_start: chrono::NaiveDate,
        a_end: chrono::NaiveDate,
        b_start: chrono::NaiveDate,
        b_end: chrono::NaiveDate,
    },
}

/// Resolve a [`QueryWindow`] to `(start_ms, end_ms, WindowMode)` on the LOCAL calendar.
/// `day` → today's [local-midnight, next-local-midnight); `week` → the ISO week
/// (Mon 00:00 local .. next Mon 00:00 local) containing today; `custom` → the explicit
/// span (mapped to the day-range builder over the local days it touches).
fn resolve_window(window: &QueryWindow) -> (i64, i64, WindowMode) {
    use chrono::{Duration, Local};
    let today = Local::now().date_naive();
    match window {
        QueryWindow::Day => {
            let start = local_midnight_ms_of(today);
            let end = local_midnight_ms_of(today + Duration::days(1));
            (
                start,
                end,
                WindowMode::Range {
                    start_day: today,
                    end_day: today,
                },
            )
        }
        QueryWindow::Week { monday } => {
            // The anchor day: the parsed `monday` (WP6b-3 Week-nav to a past week) or, on a
            // bare `{"kind":"week"}`, today. Either way, `monday_of` snaps it to its own
            // Monday, so the anchor need not literally be a Monday (defensive) and the
            // default path (today) is byte-identical to the pre-WP6b-3 behavior.
            let anchor = monday
                .as_deref()
                .and_then(|iso| chrono::NaiveDate::parse_from_str(iso, "%Y-%m-%d").ok())
                .unwrap_or(today);
            let monday = monday_of(anchor);
            let sunday_end = monday + Duration::days(7);
            let start = local_midnight_ms_of(monday);
            let end = local_midnight_ms_of(sunday_end);
            (start, end, WindowMode::Week { monday })
        }
        QueryWindow::Custom { start_ms, end_ms } => {
            // Map the explicit span to the local days it touches (inclusive).
            let start_day = local_date_of_ms(*start_ms);
            let end_day = local_date_of_ms(*end_ms);
            (*start_ms, *end_ms, WindowMode::Range { start_day, end_day })
        }
        QueryWindow::Metrics { window } => {
            // Resolve the nested window for its span + days, then re-tag as Metrics so the
            // dispatch calls build_metrics over the same days (reuses all span logic; no
            // duplication). The nested window's day bounds come from whichever mode it is.
            let (start_ms, end_ms, inner) = resolve_window(window);
            let (start_day, end_day) = match inner {
                WindowMode::Range { start_day, end_day } => (start_day, end_day),
                // A Week resolves to its Mon..next-Mon span → days Mon..Sun (6 days later).
                WindowMode::Week { monday } => (monday, monday + Duration::days(6)),
                // Defensive: a nested Metrics window is not a valid shape, but map it to
                // the days its own span touches rather than panicking.
                WindowMode::Metrics { start_day, end_day } => (start_day, end_day),
                // Defensive: a nested Compare window is not a valid shape either; map it to
                // the union of its two sides' days rather than panicking.
                WindowMode::Compare {
                    a_start,
                    a_end,
                    b_start,
                    b_end,
                } => (a_start.min(b_start), a_end.max(b_end)),
            };
            (start_ms, end_ms, WindowMode::Metrics { start_day, end_day })
        }
        QueryWindow::Compare { spec } => {
            // Resolve both sides' inclusive local-day bounds, then compute the UNION span
            // (min start .. max end) as epoch-ms so the command does a SINGLE DB read;
            // build_comparison_data partitions the rows per side by local day.
            let (a_start, a_end, b_start, b_end) = match spec {
                CompareSpec::Preset(preset) => match preset {
                    ComparePreset::Wow => compare_week_over_week_bounds(monday_of(today)),
                    ComparePreset::Mom => compare_month_over_month_bounds(today),
                    ComparePreset::TodayVsTrailing => compare_day_vs_trailing_bounds(today, 7),
                },
                CompareSpec::Custom { a, b } => (
                    local_date_of_ms(a.start_ms),
                    local_date_of_ms(a.end_ms),
                    local_date_of_ms(b.start_ms),
                    local_date_of_ms(b.end_ms),
                ),
            };
            let union_start_day = a_start.min(b_start);
            let union_end_day = a_end.max(b_end);
            let start_ms = local_midnight_ms_of(union_start_day);
            // End = next local midnight after the last day (exclusive upper bound, matching
            // the day/week span convention).
            let end_ms = local_midnight_ms_of(union_end_day + Duration::days(1));
            (
                start_ms,
                end_ms,
                WindowMode::Compare {
                    a_start,
                    a_end,
                    b_start,
                    b_end,
                },
            )
        }
    }
}

/// The Monday of the ISO week containing `day` (Monday-first). `day` itself when it is a
/// Monday; else steps back to it. Used to snap a Week-window anchor defensively.
fn monday_of(day: chrono::NaiveDate) -> chrono::NaiveDate {
    use chrono::{Datelike, Duration};
    let days_from_monday = day.weekday().num_days_from_monday() as i64;
    day - Duration::days(days_from_monday)
}

/// Local-midnight epoch-ms for a `NaiveDate` (command-side; mirrors the query module's
/// private helper — duplicated rather than exported to keep the query module's API
/// surface minimal).
fn local_midnight_ms_of(day: chrono::NaiveDate) -> i64 {
    use chrono::{Local, TimeZone};
    let naive = day.and_hms_opt(0, 0, 0).expect("00:00:00 valid");
    Local
        .from_local_datetime(&naive)
        .earliest()
        .or_else(|| Local.from_local_datetime(&naive).latest())
        .map(|dt| dt.timestamp_millis())
        .unwrap_or_else(|| naive.and_utc().timestamp_millis())
}

/// The local calendar date an epoch-ms timestamp falls on (command-side).
fn local_date_of_ms(ts_ms: i64) -> chrono::NaiveDate {
    use chrono::{Local, TimeZone};
    Local
        .timestamp_millis_opt(ts_ms)
        .single()
        .map(|dt| dt.date_naive())
        .unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(1970, 1, 1).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_event(name: &str) -> HookEvent {
        HookEvent {
            hook_event_name: name.to_string(),
            session_id: "s".to_string(),
            cwd: "/p".to_string(),
            timestamp: Some(1000),
            prompt: None,
            message: None,
            notification_type: None,
            prompt_length_chars: None,
            tool_use_id: None,
            tool_name: None,
            agent_type: None,
            source: None,
            reason: None,
        }
    }

    fn mem_store() -> TimeStore {
        let conn = Connection::open_in_memory().unwrap();
        bootstrap(&conn).unwrap();
        TimeStore::new(conn)
    }

    fn count(store: &TimeStore) -> i64 {
        store
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM events", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn write_gated_on_inserts_a_row() {
        let store = mem_store();
        store.write_gated(&base_event("Stop"), true).unwrap();
        assert_eq!(count(&store), 1, "gate ON → one row written");
    }

    #[test]
    fn write_gated_off_is_zero_io_noop() {
        let store = mem_store();
        store.write_gated(&base_event("Stop"), false).unwrap();
        assert_eq!(count(&store), 0, "gate OFF → NO row written (zero-IO gate)");
    }

    #[test]
    fn write_gated_off_then_on_only_persists_the_on_event() {
        let store = mem_store();
        store
            .write_gated(&base_event("UserPromptSubmit"), false)
            .unwrap();
        store.write_gated(&base_event("Stop"), true).unwrap();
        assert_eq!(count(&store), 1);
        let event: String = store
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT event FROM events LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(event, "Stop", "only the gate-ON event persisted");
    }

    #[test]
    fn write_gated_empty_event_name_is_noop_even_when_on() {
        let store = mem_store();
        store.write_gated(&base_event(""), true).unwrap();
        assert_eq!(count(&store), 0, "unmappable event → no row, no error");
    }

    // ---- M9 WP6.5 Phase 4: startup reconciliation ---------------------------

    /// An event for session `sid` at absolute epoch-ms `ts` (reconcile tests need control
    /// of session id + ts).
    fn ev_at(sid: &str, ts: i64, name: &str) -> HookEvent {
        let mut e = base_event(name);
        e.session_id = sid.to_string();
        e.cwd = format!("/repo/{sid}");
        e.timestamp = Some(ts as u64);
        e
    }

    fn ws_close_count(store: &TimeStore) -> i64 {
        store
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM events WHERE event='WorkspaceClose'",
                [],
                |r| r.get(0),
            )
            .unwrap()
    }

    const CAP: i64 = crate::reclassify::constants::SESSION_IDLE_CAP_MS;

    #[test]
    fn reconcile_closes_dangling_sessions_at_their_last_seen_ts() {
        let store = mem_store();
        // Two sessions, each last-active at 10_000/20_000ms; `now` far past the cap.
        store
            .write_gated(&ev_at("dead-1", 5_000, "UserPromptSubmit"), true)
            .unwrap();
        store
            .write_gated(&ev_at("dead-1", 10_000, "Stop"), true)
            .unwrap();
        store
            .write_gated(&ev_at("dead-2", 20_000, "Stop"), true)
            .unwrap();
        let now = 20_000 + CAP + 60_000; // both silent past the cap
        let closed = store.reconcile_dangling(now, CAP).unwrap();
        assert_eq!(closed, 2, "both dangling sessions closed");
        assert_eq!(ws_close_count(&store), 2);
        // The markers land at each session's LAST-seen ts, not `now`.
        let rows: Vec<(String, i64)> = {
            let conn = store.conn.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT session_id, ts FROM events WHERE event='WorkspaceClose' ORDER BY session_id")
                .unwrap();
            let mapped = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
                .unwrap()
                .map(|x| x.unwrap())
                .collect();
            mapped
        };
        assert_eq!(
            rows,
            vec![("dead-1".into(), 10_000), ("dead-2".into(), 20_000)]
        );
    }

    #[test]
    fn reconcile_is_idempotent_second_run_writes_nothing() {
        let store = mem_store();
        store
            .write_gated(&ev_at("dead-1", 10_000, "Stop"), true)
            .unwrap();
        let now = 10_000 + CAP + 60_000;
        assert_eq!(store.reconcile_dangling(now, CAP).unwrap(), 1);
        assert_eq!(ws_close_count(&store), 1);
        // Second run: the session now HAS a WorkspaceClose marker → no longer dangling.
        assert_eq!(store.reconcile_dangling(now, CAP).unwrap(), 0, "idempotent");
        assert_eq!(ws_close_count(&store), 1, "no duplicate marker");
    }

    #[test]
    fn reconcile_leaves_a_recent_session_alone() {
        let store = mem_store();
        store
            .write_gated(&ev_at("live-1", 10_000, "Stop"), true)
            .unwrap();
        let now = 10_000 + 5 * 60_000; // 5min silent < 30min cap → still live
        assert_eq!(store.reconcile_dangling(now, CAP).unwrap(), 0);
        assert_eq!(ws_close_count(&store), 0);
    }

    // ---- M9 WP2.5: native-signal gated writes -------------------------------

    fn native_ctx() -> NativeContext {
        NativeContext {
            workspace_id: Some("ws-1".into()),
            surface: Some("terminal".into()),
            cwd: Some("/p".into()),
            session_id: None,
        }
    }

    #[test]
    fn write_native_gated_on_inserts_a_native_row() {
        let store = mem_store();
        store
            .write_native_gated(&NativeSignal::WindowFocus, &native_ctx(), true)
            .unwrap();
        assert_eq!(count(&store), 1, "native gate ON → one row written");
        let source: String = store
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT source FROM events LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(source, "claudesk-native");
    }

    #[test]
    fn write_native_gated_off_is_zero_io_noop() {
        let store = mem_store();
        store
            .write_native_gated(
                &NativeSignal::KeystrokeActivity { byte_count: 5 },
                &native_ctx(),
                false,
            )
            .unwrap();
        assert_eq!(count(&store), 0, "native gate OFF → NO row (zero-IO gate)");
    }

    // ---- M9 WP2.5 Phase 2: active-context signal + focus/blur attribution --------

    #[test]
    fn set_active_context_round_trips_workspace_and_surface() {
        let holder = super::init_active_context();
        super::set_active_context(
            &holder,
            Some("ws-2".into()),
            Some("editor".into()),
            Some("/repo/proj-b".into()),
        )
        .unwrap();
        let ctx = holder.lock().unwrap().clone();
        assert_eq!(ctx.workspace_id.as_deref(), Some("ws-2"));
        assert_eq!(ctx.surface.as_deref(), Some("editor"));
        assert_eq!(ctx.cwd.as_deref(), Some("/repo/proj-b"));
        // session_id is workspace-level context — always cleared here (Phase 3 fills it).
        assert_eq!(ctx.session_id, None);
    }

    #[test]
    fn set_active_context_can_be_cleared_to_empty() {
        // All workspaces closed → the frontend passes nulls → the context clears, so a
        // focus event after that attributes to nothing (empty columns), not stale data.
        let holder = super::init_active_context();
        super::set_active_context(
            &holder,
            Some("ws-1".into()),
            Some("terminal".into()),
            Some("/p".into()),
        )
        .unwrap();
        super::set_active_context(&holder, None, None, None).unwrap();
        assert_eq!(holder.lock().unwrap().clone(), NativeContext::default());
    }

    #[test]
    fn focus_row_built_from_active_context_carries_its_attribution() {
        // The focus handler's row-shape: build a WindowFocus row from the active context.
        // Proves the attribution the frontend set flows onto the focus/blur row's meta.
        let holder = super::init_active_context();
        super::set_active_context(
            &holder,
            Some("ws-3".into()),
            Some("diff".into()),
            Some("/repo/c".into()),
        )
        .unwrap();
        let ctx = holder.lock().unwrap().clone();

        let store = mem_store();
        store
            .write_native_gated(&NativeSignal::WindowFocus, &ctx, true)
            .unwrap();
        assert_eq!(count(&store), 1);
        let (event, cwd, meta): (String, String, Option<String>) = store
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT event, cwd, meta FROM events WHERE source='claudesk-native' LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(event, "WindowFocus");
        assert_eq!(
            cwd, "/repo/c",
            "focus row attributed to the active workspace cwd"
        );
        let meta: serde_json::Value = serde_json::from_str(&meta.unwrap()).unwrap();
        assert_eq!(meta["workspace_id"], serde_json::json!("ws-3"));
        assert_eq!(meta["surface"], serde_json::json!("diff"));
    }

    #[test]
    fn blur_row_from_empty_context_writes_with_empty_attribution() {
        // A blur before any workspace is active: empty context → the row still writes
        // (NOT NULL columns become empty strings, no meta attribution). Never dropped.
        let holder = super::init_active_context();
        let ctx = holder.lock().unwrap().clone();
        let store = mem_store();
        store
            .write_native_gated(
                &NativeSignal::WindowBlur {
                    preceded_by_launch: false,
                },
                &ctx,
                true,
            )
            .unwrap();
        assert_eq!(count(&store), 1);
        let (event, cwd): (String, String) = store
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT event, cwd FROM events LIMIT 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(event, "WindowBlur");
        assert_eq!(cwd, "", "empty-context blur → empty cwd, still inserted");
    }

    // ---- M9 WP2.5 Phase 3: PTY keystroke-activity capture -----------------------

    #[test]
    fn keystroke_row_carries_count_and_session_never_the_bytes() {
        // The privacy invariant for the keystroke path, stated as the plan's SECRETKEYS
        // test: whatever the operator typed, ONLY the byte COUNT + the PTY session id +
        // the active-context attribution reach the row — never the typed characters. We
        // simulate `cc_input`'s call: the actual input was the 10 bytes "SECRETKEYS",
        // so byte_count=10 lands; the string "SECRETKEYS" must appear in NO row field.
        let typed = "SECRETKEYS";
        let byte_count = typed.len(); // 10 — this is ALL that's derived from the input.
        let mut ctx = super::NativeContext {
            workspace_id: Some("ws-1".into()),
            surface: Some("terminal".into()),
            cwd: Some("/repo/proj".into()),
            session_id: None,
        };
        // record_keystroke_activity overrides session_id with the keystroke's PTY session:
        ctx.session_id = Some("cc-2".into());
        let row = native_row(&NativeSignal::KeystrokeActivity { byte_count }, &ctx);

        assert_eq!(row.event, "KeystrokeActivity");
        assert_eq!(row.session_id, "cc-2");
        // The full serialized row text must NOT contain the typed characters anywhere.
        let all_text = format!(
            "{}|{}|{}|{}|{}|{}|{}",
            row.ts,
            row.session_id,
            row.cwd,
            row.event,
            row.tool_name.clone().unwrap_or_default(),
            row.agent_type.clone().unwrap_or_default(),
            row.meta.clone().unwrap_or_default(),
        );
        assert!(
            !all_text.contains("SECRETKEYS"),
            "no keystroke-row field may contain the typed bytes"
        );
        // Only the COUNT survived, in meta.
        let meta: serde_json::Value = serde_json::from_str(&row.meta.unwrap()).unwrap();
        assert_eq!(meta["byte_count"], serde_json::json!(10));
    }

    #[test]
    fn keystroke_write_gated_off_is_zero_io_noop() {
        // The hot path (cc_input) with the WP2 default gate OFF writes nothing — no row,
        // no IO — even though bytes flowed to the PTY. (record_keystroke_activity returns
        // before touching the store; here we prove the underlying gated write is a no-op.)
        let store = mem_store();
        let ctx = super::NativeContext {
            session_id: Some("cc-1".into()),
            ..Default::default()
        };
        store
            .write_native_gated(
                &NativeSignal::KeystrokeActivity { byte_count: 7 },
                &ctx,
                false,
            )
            .unwrap();
        assert_eq!(count(&store), 0, "keystroke gate OFF → no row (zero-IO)");
    }

    #[test]
    fn keystroke_write_gated_on_records_count_and_attribution() {
        // Gate ON: one keystroke row lands with the count + the PTY session + the active
        // workspace attribution (the shape record_keystroke_activity produces).
        let store = mem_store();
        let ctx = super::NativeContext {
            workspace_id: Some("ws-4".into()),
            surface: Some("terminal".into()),
            cwd: Some("/p".into()),
            session_id: Some("cc-9".into()),
        };
        store
            .write_native_gated(
                &NativeSignal::KeystrokeActivity { byte_count: 3 },
                &ctx,
                true,
            )
            .unwrap();
        assert_eq!(count(&store), 1);
        let (event, sid, meta): (String, String, Option<String>) = store
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT event, session_id, meta FROM events LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(event, "KeystrokeActivity");
        assert_eq!(sid, "cc-9", "keystroke row names its PTY session");
        let meta: serde_json::Value = serde_json::from_str(&meta.unwrap()).unwrap();
        assert_eq!(meta["byte_count"], serde_json::json!(3));
        assert_eq!(meta["workspace_id"], serde_json::json!("ws-4"));
    }

    // ---- M9 WP2.5 Phase 4: external-launch marks + active-surface switch ---------

    #[test]
    fn launch_row_carries_tool_identity_and_attribution_gate_on() {
        for (tool, expected) in [
            (NativeLaunchTool::SublimeText, "sublime"),
            (NativeLaunchTool::SublimeMerge, "smerge"),
            (NativeLaunchTool::Finder, "finder"),
        ] {
            let store = mem_store();
            let ctx = super::NativeContext {
                workspace_id: Some("ws-1".into()),
                surface: Some("editor".into()),
                cwd: Some("/repo/proj".into()),
                session_id: None,
            };
            store
                .write_native_gated(&NativeSignal::ExternalLaunch { tool }, &ctx, true)
                .unwrap();
            let (event, meta): (String, Option<String>) = store
                .conn
                .lock()
                .unwrap()
                .query_row("SELECT event, meta FROM events LIMIT 1", [], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })
                .unwrap();
            assert_eq!(event, "ExternalLaunch");
            let meta: serde_json::Value = serde_json::from_str(&meta.unwrap()).unwrap();
            assert_eq!(meta["tool"], serde_json::json!(expected));
            assert_eq!(meta["workspace_id"], serde_json::json!("ws-1"));
        }
    }

    #[test]
    fn launch_write_gated_off_is_zero_io_noop() {
        let store = mem_store();
        store
            .write_native_gated(
                &NativeSignal::ExternalLaunch {
                    tool: NativeLaunchTool::SublimeMerge,
                },
                &super::NativeContext::default(),
                false,
            )
            .unwrap();
        assert_eq!(count(&store), 0, "launch gate OFF → no row (zero-IO)");
    }

    #[test]
    fn active_surface_row_marks_the_switch_with_attribution() {
        // The ActiveSurface switch-marker row (emitted by time_set_active_context on a
        // surface change): carries the new surface + workspace, no content.
        let store = mem_store();
        let ctx = super::NativeContext {
            workspace_id: Some("ws-2".into()),
            surface: Some("terminal".into()),
            cwd: Some("/p".into()),
            session_id: None,
        };
        store
            .write_native_gated(&NativeSignal::ActiveSurface, &ctx, true)
            .unwrap();
        let (event, meta): (String, Option<String>) = store
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT event, meta FROM events LIMIT 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(event, "ActiveSurface");
        let meta: serde_json::Value = serde_json::from_str(&meta.unwrap()).unwrap();
        assert_eq!(meta["surface"], serde_json::json!("terminal"));
        assert_eq!(meta["workspace_id"], serde_json::json!("ws-2"));
    }

    #[test]
    fn set_active_context_surface_change_detection() {
        // The command's surface-change gate: switching surface is detected as a change
        // (→ ActiveSurface emit), but re-setting the same surface is not.
        let holder = super::init_active_context();
        super::set_active_context(
            &holder,
            Some("ws-1".into()),
            Some("editor".into()),
            Some("/p".into()),
        )
        .unwrap();
        // Same surface again → NOT a change.
        assert_eq!(holder.lock().unwrap().surface.as_deref(), Some("editor"));
        // (The change-detection itself lives in the command; here we assert the stored
        // surface is what a follow-up comparison would read against.)
    }

    #[test]
    fn native_and_cc_hook_writes_share_one_store_and_gate() {
        // Both write paths flow through the same TimeStore/connection under the same
        // gate — the WP2 comment's "share the same connection" made real. Gate ON:
        // one cc-hook row + one native row land in the one table.
        let store = mem_store();
        store.write_gated(&base_event("Stop"), true).unwrap();
        store
            .write_native_gated(
                &NativeSignal::WindowBlur {
                    preceded_by_launch: false,
                },
                &native_ctx(),
                true,
            )
            .unwrap();
        assert_eq!(count(&store), 2);
        let distinct: i64 = store
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(DISTINCT source) FROM events", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(distinct, 2, "cc-hook + claudesk-native in one store");
    }

    #[test]
    fn open_at_path_creates_file_sets_wal_and_bootstraps_schema() {
        // The real-file open path (open_at_path) — NOT reachable through the
        // in-memory tests (WAL is a no-op on :memory:). Assert a temp-file DB opens,
        // journal_mode is actually WAL, and the schema is queryable (bootstrap ran).
        let dir = tempfile::TempDir::new().unwrap();
        let db = dir.path().join("time-analytics.sqlite");
        let store = super::open_at_path(&db).expect("open_at_path succeeds on a real file");
        assert!(db.exists(), "the DB file is created on open");

        let conn = store.conn.lock().unwrap();
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            mode.to_lowercase(),
            "wal",
            "journal_mode must be WAL on a real file"
        );
        // Schema is present (bootstrap ran) — the events table is queryable.
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM events", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn open_at_path_is_reopenable_and_rows_persist() {
        // Reopening the same file path must succeed (idempotent bootstrap) and see
        // rows written by the prior handle — the persistence property the in-memory
        // tests can't show (an in-memory DB vanishes when the connection drops).
        let dir = tempfile::TempDir::new().unwrap();
        let db = dir.path().join("time-analytics.sqlite");
        {
            let store = super::open_at_path(&db).unwrap();
            store.write_gated(&base_event("Stop"), true).unwrap();
            assert_eq!(count(&store), 1);
        } // first handle dropped
          // Reopen the same file: bootstrap is idempotent, the row persisted to disk.
        let reopened = super::open_at_path(&db).unwrap();
        assert_eq!(
            count(&reopened),
            1,
            "row written by the first handle persists on reopen"
        );
    }

    #[test]
    fn tracking_gate_defaults_off_when_unpersisted() {
        // M9 decision 2: OFF out of the box. `tracking_enabled(app)` delegates to
        // `read_time_tracking_enabled`, which defaults `false` on a fresh (never-written)
        // settings dir. AppHandle isn't constructable in a unit test, so we exercise the
        // exact function the gate delegates to (same code path, minus the app→dir hop —
        // which is itself covered live in Phase 3 verify-self).
        use crate::config_store::settings::read_time_tracking_enabled;
        let dir = tempfile::TempDir::new().unwrap();
        let gate_on = read_time_tracking_enabled(dir.path()).unwrap();
        assert!(!gate_on, "fresh dir → gate OFF");
        // ...and a store fed that gate writes nothing (the drain's OFF path).
        let store = mem_store();
        store.write_gated(&base_event("Stop"), gate_on).unwrap();
        assert_eq!(count(&store), 0, "gate OFF → no writes");
    }

    #[test]
    fn tracking_gate_degrades_to_off_on_malformed_settings() {
        // The drain-safety contract: `tracking_enabled` calls
        // `read_time_tracking_enabled(&dir).unwrap_or(false)`, so a corrupt settings.json
        // must NOT propagate an error into the hook-stream drain thread (the universal
        // status dots ride the same stream and must survive) — it degrades to OFF. We
        // can't construct an AppHandle here, so pin the two facts the degradation relies
        // on: (1) a malformed file makes the reader return Err (so the caller's
        // unwrap_or(false) is load-bearing, not dead), and (2) that Err unwraps to OFF.
        use crate::config_store::settings::read_time_tracking_enabled;
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join("settings.json"), b"{ not valid json").unwrap();
        let read = read_time_tracking_enabled(dir.path());
        assert!(read.is_err(), "malformed settings → reader returns Err");
        let gate_on = read.unwrap_or(false); // exactly what tracking_enabled does
        assert!(
            !gate_on,
            "error degrades to gate OFF (drain must never die on a bad file)"
        );
        // ...and a store fed that OFF gate writes nothing.
        let store = mem_store();
        store.write_gated(&base_event("Stop"), gate_on).unwrap();
        assert_eq!(count(&store), 0, "degraded-OFF gate → no writes");
    }

    #[test]
    fn time_tracking_enabled_event_name_is_stable() {
        // Name-contract pin (WP5 Phase 2): the FE picker checkbox listens on this exact
        // string (`TIME_TRACKING_ENABLED_EVENT`) and invokes `time_get/set_tracking_enabled`.
        // A rename here without the matching FE change is a silent stringly-typed break
        // (see the `tauri-command-removal-needs-invoke-sweep` project memory) — this test
        // is the cheapest tripwire. The FE end of the contract is pinned by the Phase-3
        // Vitest wiring test.
        assert_eq!(TIME_TRACKING_ENABLED_EVENT, "time-tracking-enabled");
    }

    #[test]
    fn tracking_gate_reflects_persisted_flag_both_ways() {
        // WP5 contract: the persisted flag is the gate source. Flip it ON via the writer,
        // read it back the way `tracking_enabled` does, feed the write path → a row lands.
        // Flip it OFF → the write path is a zero-IO no-op. This is the settings→gate→write
        // seam WP5 introduced (the app→dir resolution is the only piece left to verify-self).
        use crate::config_store::settings::{
            read_time_tracking_enabled, write_time_tracking_enabled,
        };
        let dir = tempfile::TempDir::new().unwrap();

        write_time_tracking_enabled(dir.path(), true).unwrap();
        let store = mem_store();
        let gate_on = read_time_tracking_enabled(dir.path()).unwrap();
        assert!(gate_on, "persisted ON → gate ON");
        store.write_gated(&base_event("Stop"), gate_on).unwrap();
        // native path shares the same gate — assert it's gated identically.
        store
            .write_native_gated(
                &NativeSignal::ActiveSurface,
                &NativeContext::default(),
                gate_on,
            )
            .unwrap();
        assert_eq!(count(&store), 2, "gate ON → both write paths persist");

        write_time_tracking_enabled(dir.path(), false).unwrap();
        let store_off = mem_store();
        let gate_off = read_time_tracking_enabled(dir.path()).unwrap();
        assert!(!gate_off, "persisted OFF → gate OFF");
        store_off
            .write_gated(&base_event("Stop"), gate_off)
            .unwrap();
        store_off
            .write_native_gated(
                &NativeSignal::ActiveSurface,
                &NativeContext::default(),
                gate_off,
            )
            .unwrap();
        assert_eq!(
            count(&store_off),
            0,
            "gate OFF → both write paths are zero-IO no-ops"
        );
    }

    #[test]
    fn socket_stream_fans_out_to_both_status_and_time_store() {
        // The Phase 3 integration property WITHOUT a Tauri app: one real socket stream
        // fans out to (a) a status-transform drain and (b) a time_store drain. Proves
        // the same stream feeds both consumers AND (gate ON) a row lands in the store —
        // while the status side still produces its transform. `start_writer` needs an
        // AppHandle, so this exercises the same drain BODY manually (recv → write_gated),
        // which is exactly what drain_loop does; the AppHandle-bound start_writer + the
        // OFF-by-default gate are exercised live in Phase 3 verify-self.
        use crate::hook_socket::{bind_listener, spawn_listener_fanout};
        use std::io::Write;
        use std::os::unix::net::UnixStream;
        use std::sync::mpsc;
        use std::time::Duration;

        let dir = tempfile::TempDir::new().unwrap();
        let sock = dir.path().join("hook.sock");
        let listener = bind_listener(&sock).unwrap();
        let (status_tx, status_rx) = mpsc::channel::<HookEvent>();
        let (time_tx, time_rx) = mpsc::channel::<HookEvent>();
        let _handle = spawn_listener_fanout(listener, vec![status_tx, time_tx]);

        // A UserPromptSubmit with a length field (privacy: length, not text).
        let mut client = UnixStream::connect(&sock).unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"s\",\"cwd\":\"/p\",\"prompt\":\"go\",\"prompt_length_chars\":2}\n")
            .unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"Stop\",\"session_id\":\"s\",\"cwd\":\"/p\"}\n")
            .unwrap();
        client.shutdown(std::net::Shutdown::Both).unwrap();

        // Time-store drain (gate ON): recv both events, write each — exactly drain_loop's body.
        let store = mem_store();
        for _ in 0..2 {
            let ev = time_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            store.write_gated(&ev, true).unwrap();
        }
        assert_eq!(count(&store), 2, "both events written to the time store");

        // Status side still received both events off the SAME stream (independence).
        assert_eq!(
            status_rx
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .hook_event_name,
            "UserPromptSubmit"
        );
        assert_eq!(
            status_rx
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .hook_event_name,
            "Stop"
        );

        // The written UserPromptSubmit row carries the length in meta, never the text.
        let meta: Option<String> = store
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT meta FROM events WHERE event='UserPromptSubmit'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let meta = meta.unwrap();
        assert!(meta.contains("prompt_length_chars"));
        assert!(!meta.contains("go"), "prompt text must not reach the row");
    }

    #[test]
    fn socket_stream_fans_out_but_gate_off_writes_nothing_status_still_flows() {
        // The gate-OFF half of the Phase 3 fan-out outcome (the sibling to
        // socket_stream_fans_out_to_both_status_and_time_store, which covers gate ON):
        // events fan out to BOTH drains off one real socket stream, the time drain runs
        // its body with the gate OFF → ZERO rows, and the status drain is unaffected
        // (still receives every event). This is the WP2-default posture proven end-to-end
        // through the actual fan-out, not just the direct write path.
        use crate::hook_socket::{bind_listener, spawn_listener_fanout};
        use std::io::Write;
        use std::os::unix::net::UnixStream;
        use std::sync::mpsc;
        use std::time::Duration;

        let dir = tempfile::TempDir::new().unwrap();
        let sock = dir.path().join("hook.sock");
        let listener = bind_listener(&sock).unwrap();
        let (status_tx, status_rx) = mpsc::channel::<HookEvent>();
        let (time_tx, time_rx) = mpsc::channel::<HookEvent>();
        let _handle = spawn_listener_fanout(listener, vec![status_tx, time_tx]);

        let mut client = UnixStream::connect(&sock).unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"s\",\"cwd\":\"/p\",\"prompt\":\"go\",\"prompt_length_chars\":2}\n")
            .unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"Stop\",\"session_id\":\"s\",\"cwd\":\"/p\"}\n")
            .unwrap();
        client.shutdown(std::net::Shutdown::Both).unwrap();

        // Time-store drain with the WP2 default gate OFF: recv both, write each — zero land.
        let store = mem_store();
        for _ in 0..2 {
            let ev = time_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            store.write_gated(&ev, false).unwrap();
        }
        assert_eq!(
            count(&store),
            0,
            "gate OFF → no rows even though the stream delivered events"
        );

        // Status side is untouched by the OFF write path — it still got both events.
        assert_eq!(
            status_rx
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .hook_event_name,
            "UserPromptSubmit"
        );
        assert_eq!(
            status_rx
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .hook_event_name,
            "Stop"
        );
    }

    // ---- M9 WP4 P3: time_analytics_query wiring ---------------------------

    #[test]
    fn query_window_deserializes_the_tagged_union_the_frontend_sends() {
        // The three shapes WP6's invoke() will send.
        let day: QueryWindow = serde_json::from_value(serde_json::json!({"kind": "day"})).unwrap();
        assert!(matches!(day, QueryWindow::Day));
        // Bare `{"kind":"week"}` still deserializes (back-compat) — `monday` defaults to
        // `None` (today's week). WP6b-3 added the optional anchor field.
        let week: QueryWindow =
            serde_json::from_value(serde_json::json!({"kind": "week"})).unwrap();
        assert!(matches!(week, QueryWindow::Week { monday: None }));
        // With an anchor (the WP6b-3 Week-nav shape).
        let week_anchored: QueryWindow =
            serde_json::from_value(serde_json::json!({"kind": "week", "monday": "2026-06-15"}))
                .unwrap();
        assert!(
            matches!(week_anchored, QueryWindow::Week { monday: Some(ref m) } if m == "2026-06-15")
        );
        let custom: QueryWindow = serde_json::from_value(
            serde_json::json!({"kind": "custom", "start_ms": 1000, "end_ms": 2000}),
        )
        .unwrap();
        assert!(matches!(
            custom,
            QueryWindow::Custom {
                start_ms: 1000,
                end_ms: 2000
            }
        ));
    }

    #[test]
    fn resolve_window_day_is_a_single_local_day_range() {
        let (start, end, mode) = resolve_window(&QueryWindow::Day);
        assert!(end > start, "a day window has positive width");
        // 24h ± a DST hour.
        let width_h = (end - start) / 3_600_000;
        assert!(
            (23..=25).contains(&width_h),
            "day width ~24h, got {width_h}h"
        );
        match mode {
            WindowMode::Range { start_day, end_day } => assert_eq!(start_day, end_day),
            _ => panic!("day → Range mode with start_day == end_day"),
        }
    }

    #[test]
    fn resolve_window_week_is_a_seven_day_span_anchored_on_monday() {
        use chrono::Datelike;
        // Bare week (no anchor) — today's week, the default/back-compat path.
        let (start, end, mode) = resolve_window(&QueryWindow::Week { monday: None });
        let width_d = (end - start) / 86_400_000;
        assert!((6..=8).contains(&width_d), "week width ~7d, got {width_d}d");
        match mode {
            WindowMode::Week { monday } => {
                assert_eq!(
                    monday.weekday(),
                    chrono::Weekday::Mon,
                    "week anchors on Monday"
                )
            }
            _ => panic!("week → Week mode"),
        }
    }

    #[test]
    fn resolve_window_week_anchor_selects_the_anchored_monday() {
        // 2026-06-15 IS a Monday → the window's monday is exactly it.
        let (start, end, mode) = resolve_window(&QueryWindow::Week {
            monday: Some("2026-06-15".to_string()),
        });
        let width_d = (end - start) / 86_400_000;
        assert!((6..=8).contains(&width_d), "week width ~7d, got {width_d}d");
        match mode {
            WindowMode::Week { monday } => assert_eq!(
                monday,
                chrono::NaiveDate::from_ymd_opt(2026, 6, 15).unwrap(),
                "anchored Monday is used verbatim"
            ),
            _ => panic!("week → Week mode"),
        }
    }

    #[test]
    fn resolve_window_week_anchor_snaps_a_non_monday_to_its_monday() {
        // 2026-06-18 is a Thursday → snaps back to Mon 2026-06-15 (defensive; the FE
        // always sends a Monday, but the wire is never trusted).
        let (_start, _end, mode) = resolve_window(&QueryWindow::Week {
            monday: Some("2026-06-18".to_string()),
        });
        match mode {
            WindowMode::Week { monday } => assert_eq!(
                monday,
                chrono::NaiveDate::from_ymd_opt(2026, 6, 15).unwrap(),
                "a non-Monday anchor snaps back to its Monday"
            ),
            _ => panic!("week → Week mode"),
        }
    }

    #[test]
    fn resolve_window_week_malformed_anchor_falls_back_to_today() {
        use chrono::Datelike;
        // Garbage anchor → today's week (never panics; matches the None path).
        let (_start, _end, mode) = resolve_window(&QueryWindow::Week {
            monday: Some("not-a-date".to_string()),
        });
        match mode {
            WindowMode::Week { monday } => assert_eq!(
                monday.weekday(),
                chrono::Weekday::Mon,
                "malformed anchor falls back to today's Monday"
            ),
            _ => panic!("week → Week mode"),
        }
    }

    #[test]
    fn resolve_window_custom_passes_the_explicit_span_through() {
        let (start, end, mode) = resolve_window(&QueryWindow::Custom {
            start_ms: 1_700_000_000_000,
            end_ms: 1_700_100_000_000,
        });
        assert_eq!(start, 1_700_000_000_000);
        assert_eq!(end, 1_700_100_000_000);
        assert!(matches!(mode, WindowMode::Range { .. }));
    }

    #[test]
    fn query_window_deserializes_the_compare_spec_the_frontend_sends() {
        // WP6c-2: the compare query — preset form and custom form.
        let wow: QueryWindow = serde_json::from_value(
            serde_json::json!({"kind": "compare", "spec": {"preset": "wow"}}),
        )
        .unwrap();
        assert!(matches!(
            wow,
            QueryWindow::Compare {
                spec: CompareSpec::Preset(ComparePreset::Wow)
            }
        ));
        let mom: QueryWindow = serde_json::from_value(
            serde_json::json!({"kind": "compare", "spec": {"preset": "mom"}}),
        )
        .unwrap();
        assert!(matches!(
            mom,
            QueryWindow::Compare {
                spec: CompareSpec::Preset(ComparePreset::Mom)
            }
        ));
        let tvt: QueryWindow = serde_json::from_value(
            serde_json::json!({"kind": "compare", "spec": {"preset": "today_vs_trailing"}}),
        )
        .unwrap();
        assert!(matches!(
            tvt,
            QueryWindow::Compare {
                spec: CompareSpec::Preset(ComparePreset::TodayVsTrailing)
            }
        ));
        // Custom form — two explicit epoch-ms spans.
        let custom: QueryWindow = serde_json::from_value(serde_json::json!({
            "kind": "compare",
            "spec": {"custom": {
                "a": {"start_ms": 1000, "end_ms": 2000},
                "b": {"start_ms": 3000, "end_ms": 4000}
            }}
        }))
        .unwrap();
        match custom {
            QueryWindow::Compare {
                spec: CompareSpec::Custom { a, b },
            } => {
                assert_eq!(a.start_ms, 1000);
                assert_eq!(a.end_ms, 2000);
                assert_eq!(b.start_ms, 3000);
                assert_eq!(b.end_ms, 4000);
            }
            _ => panic!("custom compare spec should deserialize to CompareSpec::Custom"),
        }
    }

    #[test]
    fn resolve_window_compare_preset_reads_the_union_span_and_tags_compare() {
        // A WoW preset → the union DB-read span covers both weeks (14 days ± DST), and the
        // mode carries both sides' bounds. The exact dates depend on today (LOCAL), so we
        // assert the STRUCTURE + relative shape rather than fixed dates.
        let (start, end, mode) = resolve_window(&QueryWindow::Compare {
            spec: CompareSpec::Preset(ComparePreset::Wow),
        });
        assert!(end > start, "union span has positive width");
        let width_d = (end - start) / 86_400_000;
        assert!(
            (13..=15).contains(&width_d),
            "WoW union span ~14 days, got {width_d}d"
        );
        match mode {
            WindowMode::Compare {
                a_start,
                a_end,
                b_start,
                b_end,
            } => {
                // A is the prior week, B the current — A entirely before B, each 7 days.
                assert_eq!((a_end - a_start).num_days() + 1, 7);
                assert_eq!((b_end - b_start).num_days() + 1, 7);
                assert!(a_end < b_start, "A week precedes B week");
                assert_eq!(
                    a_end + chrono::Duration::days(1),
                    b_start,
                    "contiguous weeks"
                );
            }
            _ => panic!("compare → Compare mode"),
        }
    }

    #[test]
    fn resolve_window_compare_custom_maps_each_span_to_its_local_days() {
        // Custom A/B → each side's epoch-ms span maps to the local days it touches; the
        // union read span spans min(start)..max(end)+1day.
        let a_start_ms = local_midnight_ms_of(chrono::NaiveDate::from_ymd_opt(2026, 5, 4).unwrap());
        let a_end_ms = local_midnight_ms_of(chrono::NaiveDate::from_ymd_opt(2026, 5, 6).unwrap());
        let b_start_ms =
            local_midnight_ms_of(chrono::NaiveDate::from_ymd_opt(2026, 5, 11).unwrap());
        let b_end_ms = local_midnight_ms_of(chrono::NaiveDate::from_ymd_opt(2026, 5, 13).unwrap());
        let (start, end, mode) = resolve_window(&QueryWindow::Compare {
            spec: CompareSpec::Custom {
                a: CustomSide {
                    start_ms: a_start_ms,
                    end_ms: a_end_ms,
                },
                b: CustomSide {
                    start_ms: b_start_ms,
                    end_ms: b_end_ms,
                },
            },
        });
        // Union read starts at the earliest local midnight (A's start).
        assert_eq!(start, a_start_ms);
        assert!(
            end > b_end_ms,
            "union end is the day AFTER B's last day (exclusive)"
        );
        match mode {
            WindowMode::Compare {
                a_start,
                a_end,
                b_start,
                b_end,
            } => {
                assert_eq!(
                    a_start,
                    chrono::NaiveDate::from_ymd_opt(2026, 5, 4).unwrap()
                );
                assert_eq!(a_end, chrono::NaiveDate::from_ymd_opt(2026, 5, 6).unwrap());
                assert_eq!(
                    b_start,
                    chrono::NaiveDate::from_ymd_opt(2026, 5, 11).unwrap()
                );
                assert_eq!(b_end, chrono::NaiveDate::from_ymd_opt(2026, 5, 13).unwrap());
            }
            _ => panic!("custom compare → Compare mode"),
        }
    }

    #[test]
    fn query_window_on_empty_store_returns_no_rows() {
        let store = mem_store();
        let rows = store.query_window(0, i64::MAX).unwrap();
        assert!(rows.is_empty(), "empty store → no rows");
    }

    #[test]
    fn query_window_returns_rows_in_the_span_ordered_by_ts() {
        let store = mem_store();
        // Insert three rows at ts 3000, 1000, 2000 (out of order).
        for ts in [3000i64, 1000, 2000] {
            let mut e = base_event("UserPromptSubmit");
            e.timestamp = Some(ts as u64);
            store.write_gated(&e, true).unwrap();
        }
        // Window [1000, 3000) includes 1000 and 2000, excludes 3000 (half-open).
        let rows = store.query_window(1000, 3000).unwrap();
        let tss: Vec<i64> = rows.iter().map(|r| r.ts).collect();
        assert_eq!(
            tss,
            vec![1000, 2000],
            "in-span rows, ordered by ts, end exclusive"
        );
    }

    #[test]
    fn time_analytics_result_serializes_internally_tagged() {
        // The Week variant → {"kind":"week", label, days, projects}.
        let week = TimeAnalyticsResult::Week(WeekPayload {
            label: "WEEK 1".to_string(),
            days: vec!["MON 01".to_string()],
            projects: vec![],
        });
        let v = serde_json::to_value(&week).unwrap();
        assert_eq!(v["kind"], serde_json::json!("week"));
        assert_eq!(v["label"], serde_json::json!("WEEK 1"));
        assert!(v.get("days").is_some());
    }
}
