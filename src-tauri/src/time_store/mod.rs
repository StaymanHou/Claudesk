//! Claudesk time-analytics store — the write side of M9 (absorb `claude-time`).
//!
//! This is the **second, gated consumer** of the [`HookEvent`](crate::hook_socket::
//! HookEvent) stream (the first is `status_broadcaster`, which drives the live dots).
//! Where the status path maps an event to a dot state and drops the rest, this path
//! persists EVERY event as a row in a per-identity SQLite DB — but **only when the
//! tracking toggle is ON** (M9 decision 3; the toggle itself is WP5, WP2 builds the
//! gate call-site + defaults it OFF). The reclassifier (WP3) reads these rows.
//!
//! ## Why Rust owns the write (not the Perl hook)
//! `claude-time`'s hook wrote SQLite directly via a `sqlite3` subprocess. Claudesk
//! keeps the Perl hook a pure socket-forwarder (no `sqlite3` dep, no per-event
//! process spawn) and does the INSERT here — one long-lived connection, WAL, typed
//! errors. See `CLAUDE.md` + `docs/product/wp1-time-analytics-probe-outcome.md` §(d).
//!
//! ## Schema (one `events` table, WP2.5-ready)
//! `events(ts, session_id, cwd, event, tool_name, agent_type, source, meta)` —
//! `claude-time`'s shape PLUS a **`source` discriminator column** so WP2.5 can write
//! Claudesk-native-signal rows (`source = "claudesk-native"`) into the SAME table;
//! the CC-hook rows this module writes carry `source = "cc-hook"`. `meta` is a JSON
//! blob holding the event-specific extras (`prompt_length_chars` / `tool_use_id` /
//! `source` tag). Keeping one table + a `source` column (vs. a sibling table) means
//! WP3/WP4 read one stream (WBS "Native-signal schema shape" lean).
//!
//! ## Privacy invariant
//! A row NEVER stores prompt text or tool I/O — only `prompt_length_chars` (a
//! length) reaches `meta`. [`event_to_row`] reads `HookEvent::prompt_length_chars`,
//! never `HookEvent::prompt`. Pinned by [`tests::row_never_carries_prompt_text`].
//!
//! ## Layout (mirrors `config_store` / `hook_socket`)
//! - Pure functions here ([`event_to_row`], [`bootstrap`], [`insert_row`]) operate on
//!   a `rusqlite::Connection` so they unit-test against an in-memory DB with no app.
//! - The `AppHandle`-bound path resolution + the managed holder + the gated drain
//!   live in [`commands`].

pub mod commands;

use rusqlite::Connection;
use serde_json::json;

use crate::hook_socket::HookEvent;

/// The `source` tag stamped on every row this module writes — the CC-hook event
/// stream. WP2.5 will write native-signal rows with a different tag into the same
/// table; the discriminator lets WP3/WP4 tell the two apart.
pub const SOURCE_CC_HOOK: &str = "cc-hook";

/// Schema DDL — idempotent (`IF NOT EXISTS`). Mirrors `claude-time`'s `events` table
/// plus the `source` discriminator column (M9 WP2.5-ready). Run by [`bootstrap`].
///
/// `WAL` + a busy-timeout are set on the *connection* in [`commands`], not here (they
/// are connection pragmas, not schema). The two indexes mirror `claude-time`'s
/// (session+ts for per-session scans, ts for day/range scans).
const SCHEMA_SQL: &str = "\
CREATE TABLE IF NOT EXISTS events (
  ts          INTEGER NOT NULL,
  session_id  TEXT NOT NULL,
  cwd         TEXT NOT NULL,
  event       TEXT NOT NULL,
  tool_name   TEXT,
  agent_type  TEXT,
  source      TEXT NOT NULL,
  meta        TEXT
);
CREATE INDEX IF NOT EXISTS idx_session_ts ON events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_ts ON events(ts);
";

/// One persisted time-analytics row, mapped from a [`HookEvent`]. Column-parallel to
/// the `events` table. `meta` is the serialized JSON blob (or `None` when the event
/// has no extras). Built by [`event_to_row`]; written by [`insert_row`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimeRow {
    pub ts: i64,
    pub session_id: String,
    pub cwd: String,
    pub event: String,
    pub tool_name: Option<String>,
    pub agent_type: Option<String>,
    /// Row source discriminator — [`SOURCE_CC_HOOK`] for every row this module writes.
    pub source: String,
    /// JSON blob of event-specific extras, or `None`. Never contains prompt text.
    pub meta: Option<String>,
}

/// Map a [`HookEvent`] to the [`TimeRow`] to persist, or `None` if the event carries
/// no `hook_event_name` (a malformed/empty event we never store).
///
/// The `meta` blob is assembled from the event's time-analytics fields — the SAME
/// keys `claude-time`'s hook emitted (`prompt_length_chars` / `tool_use_id` /
/// `source`) — so the reclassifier reads the identical shape. **Privacy: only
/// `prompt_length_chars` (the LENGTH) is read; `HookEvent::prompt` (the text) is
/// never touched here.** `source = "cc-hook"` is stamped unconditionally.
///
/// `ts` uses the hook-side `timestamp` (epoch ms) when present, else 0 — the caller
/// (the drain thread) does not re-stamp; the hook's send-time is the event time.
pub fn event_to_row(event: &HookEvent) -> Option<TimeRow> {
    if event.hook_event_name.is_empty() {
        return None;
    }

    // Assemble meta from whichever extras this event carries. Mirrors claude-time's
    // per-event meta: UserPromptSubmit → {prompt_length_chars}; Pre/Post tool events →
    // {tool_use_id}; SessionStart → {source}. Multiple keys can co-exist harmlessly.
    let mut meta = serde_json::Map::new();
    if let Some(len) = event.prompt_length_chars {
        // LENGTH only — never the prompt text (the privacy invariant).
        meta.insert("prompt_length_chars".into(), json!(len));
    }
    if let Some(tuid) = &event.tool_use_id {
        meta.insert("tool_use_id".into(), json!(tuid));
    }
    if let Some(src) = &event.source {
        meta.insert("source".into(), json!(src));
    }
    let meta = if meta.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(meta).to_string())
    };

    Some(TimeRow {
        ts: event.timestamp.map(|t| t as i64).unwrap_or(0),
        session_id: event.session_id.clone(),
        cwd: event.cwd.clone(),
        event: event.hook_event_name.clone(),
        tool_name: event.tool_name.clone(),
        agent_type: event.agent_type.clone(),
        source: SOURCE_CC_HOOK.to_string(),
        meta,
    })
}

/// Create the `events` table + indexes if absent (idempotent). Called once when the
/// connection opens (in [`commands::TimeStore`]). `execute_batch` runs the multi-
/// statement DDL in one call.
pub fn bootstrap(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(SCHEMA_SQL)
}

/// INSERT one [`TimeRow`]. Parameterized (no string interpolation — SQL-injection-
/// safe by construction, unlike claude-time's hand-quoted `sql_q`). The caller gates
/// on the tracking toggle BEFORE calling this ([`commands::write_gated`]).
pub fn insert_row(conn: &Connection, row: &TimeRow) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO events (ts, session_id, cwd, event, tool_name, agent_type, source, meta)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            row.ts,
            row.session_id,
            row.cwd,
            row.event,
            row.tool_name,
            row.agent_type,
            row.source,
            row.meta,
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A `HookEvent` builder for the tests (the struct has no `Default`). Only the
    /// fields a given test cares about are overridden after construction.
    fn base_event(name: &str) -> HookEvent {
        HookEvent {
            hook_event_name: name.to_string(),
            session_id: "sess-1".to_string(),
            cwd: "/repo/proj-a".to_string(),
            timestamp: Some(1_718_000_000_000),
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

    /// Open an in-memory DB with the schema bootstrapped — the pure-core test rig.
    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        bootstrap(&conn).unwrap();
        conn
    }

    fn row_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM events", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn bootstrap_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        bootstrap(&conn).unwrap();
        // Second bootstrap over the same connection is a no-op (IF NOT EXISTS).
        bootstrap(&conn).unwrap();
        // The table exists and is queryable.
        assert_eq!(row_count(&conn), 0);
    }

    #[test]
    fn user_prompt_submit_row_carries_length_in_meta_not_text() {
        let mut ev = base_event("UserPromptSubmit");
        ev.prompt = Some("this is the secret prompt text".to_string());
        ev.prompt_length_chars = Some(30);
        let row = event_to_row(&ev).unwrap();

        assert_eq!(row.event, "UserPromptSubmit");
        assert_eq!(row.source, SOURCE_CC_HOOK);
        assert_eq!(row.ts, 1_718_000_000_000);
        let meta = row.meta.expect("UserPromptSubmit has meta");
        let parsed: serde_json::Value = serde_json::from_str(&meta).unwrap();
        assert_eq!(parsed["prompt_length_chars"], json!(30));
        // The prompt TEXT must appear NOWHERE in the row.
        assert!(!meta.contains("secret"), "meta must not carry prompt text");
    }

    #[test]
    fn row_never_carries_prompt_text() {
        // The privacy invariant, stated as a test: whatever the prompt is, no field
        // of the mapped row contains it. Only the length reaches meta.
        let mut ev = base_event("UserPromptSubmit");
        ev.prompt = Some("PROMPTBODY-DO-NOT-PERSIST".to_string());
        ev.prompt_length_chars = Some(25);
        let row = event_to_row(&ev).unwrap();
        let all_text = format!(
            "{}|{}|{}|{}|{}|{}",
            row.session_id,
            row.cwd,
            row.event,
            row.tool_name.unwrap_or_default(),
            row.agent_type.unwrap_or_default(),
            row.meta.unwrap_or_default(),
        );
        assert!(
            !all_text.contains("PROMPTBODY"),
            "no row field may contain the prompt text"
        );
    }

    #[test]
    fn pre_tool_use_row_carries_tool_fields() {
        let mut ev = base_event("PreToolUse");
        ev.tool_name = Some("Edit".to_string());
        ev.tool_use_id = Some("tu_1".to_string());
        let row = event_to_row(&ev).unwrap();
        assert_eq!(row.tool_name.as_deref(), Some("Edit"));
        let meta: serde_json::Value = serde_json::from_str(&row.meta.unwrap()).unwrap();
        assert_eq!(meta["tool_use_id"], json!("tu_1"));
    }

    #[test]
    fn subagent_row_carries_agent_type_no_meta() {
        let mut ev = base_event("SubagentStart");
        ev.agent_type = Some("Explore".to_string());
        let row = event_to_row(&ev).unwrap();
        assert_eq!(row.agent_type.as_deref(), Some("Explore"));
        // No prompt_length/tool_use_id/source → no meta blob.
        assert_eq!(row.meta, None);
    }

    #[test]
    fn session_start_row_carries_source_in_meta() {
        let mut ev = base_event("SessionStart");
        ev.source = Some("startup".to_string());
        let row = event_to_row(&ev).unwrap();
        let meta: serde_json::Value = serde_json::from_str(&row.meta.unwrap()).unwrap();
        assert_eq!(meta["source"], json!("startup"));
    }

    #[test]
    fn empty_event_name_maps_to_none() {
        let ev = base_event("");
        assert_eq!(event_to_row(&ev), None);
    }

    #[test]
    fn stop_row_has_no_meta_and_cc_hook_source() {
        // A plain Stop → a row with the core fields, source=cc-hook, no meta.
        let ev = base_event("Stop");
        let row = event_to_row(&ev).unwrap();
        assert_eq!(row.event, "Stop");
        assert_eq!(row.source, SOURCE_CC_HOOK);
        assert_eq!(row.meta, None);
        assert_eq!(row.tool_name, None);
        assert_eq!(row.agent_type, None);
    }

    #[test]
    fn insert_row_writes_exactly_one_row_with_expected_columns() {
        let conn = mem_db();
        let mut ev = base_event("UserPromptSubmit");
        ev.prompt_length_chars = Some(11);
        let row = event_to_row(&ev).unwrap();
        insert_row(&conn, &row).unwrap();

        assert_eq!(row_count(&conn), 1);
        let (event, source, cwd, meta): (String, String, String, Option<String>) = conn
            .query_row(
                "SELECT event, source, cwd, meta FROM events LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(event, "UserPromptSubmit");
        assert_eq!(source, SOURCE_CC_HOOK);
        assert_eq!(cwd, "/repo/proj-a");
        assert!(meta.unwrap().contains("prompt_length_chars"));
    }

    #[test]
    fn multiple_inserts_accumulate() {
        let conn = mem_db();
        for name in ["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"] {
            let row = event_to_row(&base_event(name)).unwrap();
            insert_row(&conn, &row).unwrap();
        }
        assert_eq!(row_count(&conn), 4);
        // Every row is source=cc-hook (the WP2.5 discriminator, populated).
        let distinct_sources: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT source) FROM events",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(distinct_sources, 1);
    }
}
