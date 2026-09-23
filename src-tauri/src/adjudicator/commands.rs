//! M15 WP3 Phase 4 — the Tauri surface over the adjudicator spawn.
//!
//! ⚠️ Thin by design (ruling R-4): returns raw stdout or a stringified error, and makes no
//! decision. The withholding rule lives in TypeScript, where it is documented alongside the
//! ruling that requires it.

use super::{run_adjudicator, AdjudicateError};

/// Run the pinned adjudicator and return its raw stdout.
///
/// ⚠️ Returns `Result` rather than an `Option`/empty string so a failure reaches the caller as
/// a REJECTION. The TS side turns every rejection into `AWAITING` (R-6 condition 2); an empty
/// `Ok` would also withhold today, but by accident of parsing rather than by contract.
///
/// ⚠️ `model` is passed in rather than hardcoded here so the pin has exactly ONE home
/// (`ADJUDICATOR_MODEL` in `supervisor/adjudicator.ts`). Two copies of a pinned constant is
/// how a pin silently stops pinning.
///
/// ⚠️ **`async` + `spawn_blocking`, never a sync command.** A sync `#[tauri::command]` runs on the
/// MAIN thread, and `run_adjudicator` waits on `claude -p` for up to `timeout_ms`, so as a sync
/// command every adjudication froze the whole UI for as long as `claude` ran (paydown
/// 2026-09-23 WP9). `spawn_blocking` rather than a bare `async fn` body, because the wait is
/// long enough to starve an async-runtime worker. `tests/sync_commands_do_not_block.rs` fails
/// if this goes back to sync.
#[tauri::command]
pub async fn supervisor_adjudicate(
    model: String,
    prompt: String,
    timeout_ms: u64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_adjudicator(&model, &prompt, timeout_ms).map_err(|e: AdjudicateError| e.to_string())
    })
    .await
    .map_err(|e| format!("adjudicator worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn the_async_command_resolves_to_a_rejection_through_its_worker() {
        // Drives the REAL command, including the `spawn_blocking` hop and its error mapping,
        // which the `run_command` tests do not reach. A 1ms timeout means a real `claude` on PATH
        // is group-killed before it does anything, and a missing one fails with NotFound. Either
        // way the TS side must receive a rejection (every rejection withholds), and promptly.
        let start = Instant::now();
        let result = tauri::async_runtime::block_on(supervisor_adjudicate(
            "sonnet".into(),
            "codify probe".into(),
            1,
        ));
        let err = result.expect_err("a 1ms adjudication cannot succeed");
        assert!(!err.is_empty());
        assert!(
            err.contains("timed out") || err.contains("not found"),
            "unexpected rejection: {err}"
        );
        assert!(
            start.elapsed() < Duration::from_secs(3),
            "{:?}",
            start.elapsed()
        );
    }
}
