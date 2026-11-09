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
/// ⚠️ **`async` + `spawn_blocking`, never a sync command.** `run_adjudicator` waits on `claude -p`
/// for up to `timeout_ms`, and a sync command would hold the main thread for all of it.
/// `spawn_blocking` rather than a bare `async fn` body, because the wait is long enough to starve
/// an async-runtime worker. `tests/sync_commands_do_not_block.rs` fails if this goes back to sync
/// (its module doc carries the main-thread rationale).
#[tauri::command]
pub async fn supervisor_adjudicate(
    model: String,
    prompt: String,
    timeout_ms: u64,
) -> Result<String, String> {
    on_worker(move || run_adjudicator(&model, &prompt, timeout_ms)).await
}

/// Run one adjudication on a blocking worker and turn every failure into the rejection string the
/// TS side withholds on. Split out so a test drives this exact hop with a deterministic program.
async fn on_worker<F>(work: F) -> Result<String, String>
where
    F: FnOnce() -> Result<String, AdjudicateError> + Send + 'static,
{
    crate::blocking::on_blocking_worker("the adjudicator", move || {
        work().map_err(|e| e.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn the_worker_hop_turns_each_failure_into_a_rejection() {
        // The command's own `spawn_blocking` hop and error mapping, driven with programs whose
        // outcome does not depend on what is installed (the old test forked the real `claude`
        // when it was on PATH, and accepted either of two outcomes).
        let missing = tauri::async_runtime::block_on(on_worker(|| {
            super::super::run_command(
                std::process::Command::new("/nonexistent/claudesk-wp4-no-such-binary"),
                "x",
                1_000,
            )
        }));
        let err = missing.expect_err("a missing binary cannot succeed");
        assert!(err.contains("not found"), "got {err}");

        let start = Instant::now();
        let slow = tauri::async_runtime::block_on(on_worker(|| {
            let mut sleep = std::process::Command::new("/bin/sleep");
            sleep.arg("5");
            super::super::run_command(sleep, "x", 50)
        }));
        let err = slow.expect_err("a 50ms limit on a 5s sleep cannot succeed");
        assert!(err.contains("timed out"), "got {err}");
        assert!(
            start.elapsed() < Duration::from_secs(3),
            "{:?}",
            start.elapsed()
        );
    }
}
