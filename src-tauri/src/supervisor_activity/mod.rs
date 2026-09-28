//! The supervisor activity record: a durable, agent-readable log of every turn-end decision.
//!
//! One JSONL line per decision, appended to `<app-data>/supervisor-activity.log`, with the same
//! best-effort 5 MiB / one-generation rotation as the status-channel log (it reuses
//! [`StatusLog`]). Dev and prod are separated by their per-identity app-data dirs.
//!
//! ⚠️ File IO only (ruling R-4). The record's shape, its reasons and the decision it describes
//! are all TypeScript-side (`src/state/supervisor/activityRecord.ts`); this module neither
//! parses nor validates a line, so the schema has exactly one home.

pub mod commands;

use crate::status_log::StatusLog;
use std::path::Path;

/// Basename of the activity record within the app-data directory.
pub const ACTIVITY_LOG_FILE: &str = "supervisor-activity.log";

/// Bind the rotating logger to `<data_dir>/supervisor-activity.log`.
pub fn activity_log(data_dir: &Path) -> StatusLog {
    StatusLog::at(data_dir.join(ACTIVITY_LOG_FILE))
}

/// Append one record line. A line containing a newline is refused, because it would split
/// into two records and corrupt the one-line-per-decision contract that readers rely on.
pub fn append(log: &StatusLog, line: &str) -> Result<(), String> {
    if line.contains('\n') || line.contains('\r') {
        return Err("activity record line must not contain a newline".into());
    }
    log.try_write_line(line).map_err(|e| e.to_string())
}

/// The newest `limit` lines, oldest first, drawing on the rotated generation when the live
/// file holds fewer. A missing file is an empty record, not an error.
pub fn read_last(log: &StatusLog, limit: usize) -> Vec<String> {
    let read = |p: &Path| std::fs::read_to_string(p).unwrap_or_default();
    let live = read(log.path());
    let mut lines: Vec<String> = live
        .lines()
        .filter(|l| !l.is_empty())
        .map(str::to_owned)
        .collect();
    if lines.len() < limit {
        let rotated = read(&log.rotated_path());
        let mut older: Vec<String> = rotated
            .lines()
            .filter(|l| !l.is_empty())
            .map(str::to_owned)
            .collect();
        older.append(&mut lines);
        lines = older;
    }
    let start = lines.len().saturating_sub(limit);
    lines.split_off(start)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn append_creates_the_file_and_read_returns_lines_in_order() {
        let dir = TempDir::new().unwrap();
        let log = activity_log(dir.path());
        assert_eq!(log.path(), dir.path().join(ACTIVITY_LOG_FILE));
        assert!(
            read_last(&log, 10).is_empty(),
            "missing file reads as empty"
        );

        append(&log, r#"{"n":1}"#).unwrap();
        append(&log, r#"{"n":2}"#).unwrap();
        append(&log, r#"{"n":3}"#).unwrap();
        assert_eq!(
            read_last(&log, 10),
            vec![r#"{"n":1}"#, r#"{"n":2}"#, r#"{"n":3}"#]
        );
        assert_eq!(read_last(&log, 2), vec![r#"{"n":2}"#, r#"{"n":3}"#]);
    }

    #[test]
    fn a_line_with_a_newline_is_refused_and_nothing_is_written() {
        let dir = TempDir::new().unwrap();
        let log = activity_log(dir.path());
        assert!(append(&log, "a\nb").is_err());
        assert!(append(&log, "a\rb").is_err());
        assert!(!log.path().exists());
    }

    #[test]
    fn read_spans_the_rotated_generation_when_the_live_file_is_short() {
        let dir = TempDir::new().unwrap();
        let log = activity_log(dir.path());
        std::fs::write(log.rotated_path(), "old1\nold2\n").unwrap();
        append(&log, "new1").unwrap();
        assert_eq!(read_last(&log, 2), vec!["old2", "new1"]);
        assert_eq!(read_last(&log, 10), vec!["old1", "old2", "new1"]);
        // Enough in the live file alone: the rotated generation is not consulted.
        append(&log, "new2").unwrap();
        assert_eq!(read_last(&log, 2), vec!["new1", "new2"]);
    }
}
