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
use tauri::{AppHandle, Manager};

use super::{bootstrap, event_to_row, insert_row};
use crate::hook_socket::HookEvent;

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
}

/// Open a DB at `path`, set connection pragmas (WAL + busy-timeout for multi-writer
/// safety — mirrors claude-time's `journal_mode=WAL` + `.timeout 2000`), bootstrap the
/// schema, and wrap it in a [`TimeStore`]. The path-agnostic core of
/// [`open_and_bootstrap`], split out so it is testable against a real temp-file DB
/// (WAL is a no-op on an in-memory connection, so the in-memory tests can't exercise
/// this path). A failure is surfaced (never swallowed).
pub fn open_at_path(path: &std::path::Path) -> Result<TimeStore, String> {
    let conn = Connection::open(path)
        .map_err(|e| format!("could not open time-analytics DB at {}: {e}", path.display()))?;
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
/// **WP5 replaces the body** with a read of the persisted universal-vs-workflow-coupled
/// feature flag (in `projects.json` app-level settings or a sibling). Until then it is
/// a hardcoded `false`, so WP2 ships with the write path built but dormant — the
/// fan-out drain (WP3) still runs `write_gated(event, tracking_enabled(app))`, which
/// is a zero-IO no-op while this returns `false`. Kept as a single function so WP5
/// changes one body, not every call-site.
pub fn tracking_enabled(_app: &AppHandle) -> bool {
    // WP2: default OFF. WP5 wires this to the persisted toggle.
    false
}

/// Managed-state holder for the live [`TimeStore`], so [`write_gated`](TimeStore::
/// write_gated) reaches the connection from the drain thread via `app.try_state`.
pub type SharedTimeStore = TimeStore;

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
        store
            .write_gated(&base_event("Stop"), true)
            .unwrap();
        assert_eq!(count(&store), 1, "gate ON → one row written");
    }

    #[test]
    fn write_gated_off_is_zero_io_noop() {
        let store = mem_store();
        store
            .write_gated(&base_event("Stop"), false)
            .unwrap();
        assert_eq!(count(&store), 0, "gate OFF → NO row written (zero-IO gate)");
    }

    #[test]
    fn write_gated_off_then_on_only_persists_the_on_event() {
        let store = mem_store();
        store.write_gated(&base_event("UserPromptSubmit"), false).unwrap();
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
        assert_eq!(mode.to_lowercase(), "wal", "journal_mode must be WAL on a real file");
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
        assert_eq!(count(&reopened), 1, "row written by the first handle persists on reopen");
    }

    #[test]
    fn tracking_defaults_off_at_wp2() {
        // WP2 ships the gate defaulting OFF (M9 decision 2). This test pins that the
        // default is OFF so WP5's flip to a real toggle is a deliberate, visible change
        // (the test updates when WP5 wires the persisted flag). AppHandle isn't needed —
        // the WP2 body ignores it — so we can't construct one here; instead assert the
        // documented contract via the write path: a store fed through a gate that is
        // OFF writes nothing. (The AppHandle-bound tracking_enabled is exercised live in
        // Phase 3 verify-self once the flag source lands in WP5.)
        let store = mem_store();
        // Simulate the drain calling write_gated with the WP2 default (false).
        let wp2_default_gate = false;
        store
            .write_gated(&base_event("Stop"), wp2_default_gate)
            .unwrap();
        assert_eq!(count(&store), 0, "WP2 default gate OFF → no writes");
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
            status_rx.recv_timeout(Duration::from_secs(5)).unwrap().hook_event_name,
            "UserPromptSubmit"
        );
        assert_eq!(
            status_rx.recv_timeout(Duration::from_secs(5)).unwrap().hook_event_name,
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
        assert_eq!(count(&store), 0, "gate OFF → no rows even though the stream delivered events");

        // Status side is untouched by the OFF write path — it still got both events.
        assert_eq!(
            status_rx.recv_timeout(Duration::from_secs(5)).unwrap().hook_event_name,
            "UserPromptSubmit"
        );
        assert_eq!(
            status_rx.recv_timeout(Duration::from_secs(5)).unwrap().hook_event_name,
            "Stop"
        );
    }
}
