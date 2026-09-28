//! The Tauri surface over the supervisor activity record.
//!
//! ⚠️ Thin by design (ruling R-4): an append of an opaque line and a read of raw lines. No
//! decision and no parse; the TypeScript recorder owns the schema, and filters by workspace
//! on read.
//!
//! ⚠️ **Both commands are `async`.** A sync `#[tauri::command]` runs on the main thread, and the
//! read can load up to two 5 MiB generations. `tests/sync_commands_do_not_block.rs` exempts
//! async commands.

use super::{activity_log, append, read_last};
use crate::config_store::commands::resolve_data_dir;
use tauri::AppHandle;

/// Upper bound on a single read, so a caller cannot ask for the whole file through IPC.
const MAX_READ_LINES: usize = 2000;

/// Append one already-serialized record line to `supervisor-activity.log`.
///
/// ⚠️ The caller (the TS recorder) invokes this only while the workflow gate is ON; with the
/// gate OFF nothing calls it, so the file is never created (the M10.9 byte-identical rule).
#[tauri::command]
pub async fn supervisor_activity_append(app: AppHandle, line: String) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    append(&activity_log(&dir), &line)
}

/// The newest `limit` raw record lines (oldest first), capped at [`MAX_READ_LINES`].
#[tauri::command]
pub async fn supervisor_activity_read(app: AppHandle, limit: usize) -> Result<Vec<String>, String> {
    let dir = resolve_data_dir(&app)?;
    Ok(read_last(&activity_log(&dir), limit.min(MAX_READ_LINES)))
}
