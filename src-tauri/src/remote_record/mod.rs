//! M17 WP5 — the LOCAL record of each remote workspace's CC session: what Claudesk last knew about
//! it, read with no network.
//!
//! A remote session lives in a tmux session on the host, which outlives Claudesk's connection. Only
//! a connection can say whether it is still alive, so the picker's label is read from here instead
//! (operator ruling, WP5 spec Q1: "assume it by a locally stored state from last time ... knowing
//! that the state might be outdated"; prior `a-display-prediction-may-be-stale-when-the-click-decides`).
//! The click's open check over the link is the authority (`remote_link::commands::remote_open_check`);
//! this record is its input only for telling a session Claudesk left running from one it does not
//! know about.
//!
//! | state | written when |
//! |---|---|
//! | `running` | a remote spawn succeeded (default-set, like the unclean flag: a crash leaves it) |
//! | `ended` | the remote session was ENDED: a close whose remote end ran, or CC exited on its own |
//! | `end-pending` | an explicit close or quit whose remote end could not be delivered (link down) |
//!
//! A Detach and a passive drop leave the record as it is (`running`). Removing a row clears it.
//!
//! Stored at `<app_data>/remote-sessions.json`, keyed by the row's `ssh://` key, written atomically
//! (tmp + rename) like `session-state.json`. Every read failure degrades to "no record", which the
//! open decision treats as an unknown session (it asks), never as one Claudesk left running.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// The record's file in the app-data dir.
pub const RECORD_FILE: &str = "remote-sessions.json";
const RECORD_TMP_FILE: &str = "remote-sessions.json.tmp";

/// What Claudesk last knew about a remote session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SessionRecordState {
    /// Claudesk started it and did not end it (open, detached, dropped, or Claudesk crashed).
    Running,
    /// It was ended (closed with the link up, or CC exited).
    Ended,
    /// The operator closed or quit, but the end could not be delivered: it is probably still
    /// running, against the operator's intent. The next open asks.
    EndPending,
}

/// One remote session's record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionRecord {
    pub state: SessionRecordState,
    /// The drive mode the session was SPAWNED under (`None`: none). A reconnect keeps it, so the
    /// picker can say when the row's stored mode differs from the one the session runs under.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drive_mode: Option<String>,
}

/// The on-disk map: remote key → record. `BTreeMap` for a stable, diffable file.
pub type RecordMap = BTreeMap<String, SessionRecord>;

/// Read the map. Any failure (missing, unreadable, malformed) is an empty map.
pub fn read(data_dir: &Path) -> RecordMap {
    match std::fs::read(data_dir.join(RECORD_FILE)) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => RecordMap::new(),
    }
}

fn write(data_dir: &Path, map: &RecordMap) -> Result<(), std::io::Error> {
    let tmp = data_dir.join(RECORD_TMP_FILE);
    let json = serde_json::to_vec_pretty(map)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(&tmp, &json)?;
    std::fs::rename(&tmp, data_dir.join(RECORD_FILE))
}

/// The record for `key`, if any.
pub fn get(data_dir: &Path, key: &str) -> Option<SessionRecord> {
    read(data_dir).remove(key)
}

/// Record that `key`'s session was started (or reconnected to) under `drive_mode`.
pub fn record_running(data_dir: &Path, key: &str, drive_mode: Option<&str>) -> bool {
    update(data_dir, key, |_| {
        Some(SessionRecord {
            state: SessionRecordState::Running,
            drive_mode: drive_mode.map(str::to_string),
        })
    })
}

/// Move `key`'s record to `state`, keeping its drive mode. A key with no record gets one (with no
/// mode): an end-intent must be remembered even when the spawn's write was lost.
pub fn record_state(data_dir: &Path, key: &str, state: SessionRecordState) -> bool {
    update(data_dir, key, |old| {
        Some(SessionRecord {
            state,
            drive_mode: old.and_then(|r| r.drive_mode),
        })
    })
}

/// Forget `key` (its row was removed).
pub fn clear(data_dir: &Path, key: &str) -> bool {
    if !read(data_dir).contains_key(key) {
        return true;
    }
    update(data_dir, key, |_| None)
}

/// Read → transform `key`'s entry → write. Best-effort: `false` when the write failed (callers log
/// and continue; a lost write costs a less accurate label or one extra question, never a wrong
/// action, because the open check decides).
fn update(
    data_dir: &Path,
    key: &str,
    f: impl FnOnce(Option<SessionRecord>) -> Option<SessionRecord>,
) -> bool {
    let mut map = read(data_dir);
    if let Some(r) = f(map.remove(key)) {
        map.insert(key.to_string(), r);
    }
    write(data_dir, &map).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const KEY: &str = "ssh://me@mini/Users/me/p";

    #[test]
    fn a_spawn_records_running_with_its_mode_and_an_end_keeps_the_mode() {
        let d = TempDir::new().unwrap();
        assert_eq!(get(d.path(), KEY), None, "no record before the first spawn");
        assert!(record_running(d.path(), KEY, Some("autopilot")));
        assert_eq!(
            get(d.path(), KEY),
            Some(SessionRecord {
                state: SessionRecordState::Running,
                drive_mode: Some("autopilot".into())
            })
        );
        assert!(record_state(d.path(), KEY, SessionRecordState::EndPending));
        let r = get(d.path(), KEY).unwrap();
        assert_eq!(r.state, SessionRecordState::EndPending);
        assert_eq!(r.drive_mode.as_deref(), Some("autopilot"));
        assert!(record_state(d.path(), KEY, SessionRecordState::Ended));
        assert_eq!(get(d.path(), KEY).unwrap().state, SessionRecordState::Ended);
        // A respawn replaces the mode with the new spawn's.
        assert!(record_running(d.path(), KEY, None));
        assert_eq!(get(d.path(), KEY).unwrap().drive_mode, None);
    }

    #[test]
    fn an_end_intent_is_kept_even_without_a_spawn_record() {
        let d = TempDir::new().unwrap();
        assert!(record_state(d.path(), KEY, SessionRecordState::EndPending));
        assert_eq!(
            get(d.path(), KEY).unwrap().state,
            SessionRecordState::EndPending
        );
    }

    #[test]
    fn clearing_forgets_only_that_key() {
        let d = TempDir::new().unwrap();
        record_running(d.path(), KEY, None);
        record_running(d.path(), "ssh://me@mini/other", None);
        assert!(clear(d.path(), KEY));
        assert_eq!(get(d.path(), KEY), None);
        assert!(get(d.path(), "ssh://me@mini/other").is_some());
        assert!(clear(d.path(), KEY), "clearing an absent key is a no-op");
    }

    #[test]
    fn a_damaged_file_reads_as_no_record() {
        let d = TempDir::new().unwrap();
        std::fs::write(d.path().join(RECORD_FILE), b"{not json").unwrap();
        assert_eq!(get(d.path(), KEY), None);
        // ...and the next write replaces it.
        assert!(record_running(d.path(), KEY, None));
        assert!(get(d.path(), KEY).is_some());
    }

    #[test]
    fn the_wire_form_is_kebab_case() {
        let json = serde_json::to_string(&SessionRecordState::EndPending).unwrap();
        assert_eq!(json, "\"end-pending\"");
    }
}
