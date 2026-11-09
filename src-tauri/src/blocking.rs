//! The one hop from an `async` command onto a blocking worker.
//!
//! An `async` `#[tauri::command]` body runs on an async-runtime worker, so slow blocking work in
//! it (a subprocess wait, a Finder round trip, a CPU-bound build) holds that worker. Such work
//! moves onto the blocking pool here, and a worker that panicked comes back as an error string
//! the frontend can show, worded the same way for every command.
//! (`tests/sync_commands_do_not_block.rs` explains the main-thread half of this rule.)

/// Run `work` on the blocking pool and return its result. A panic inside `work` becomes
/// `Err("<what> stopped unexpectedly: …")`.
pub async fn on_blocking_worker<T, F>(what: &'static str, work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("{what} stopped unexpectedly: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_the_work_result_both_ways() {
        let ok = tauri::async_runtime::block_on(on_blocking_worker("x", || Ok(7)));
        assert_eq!(ok, Ok(7));
        let err: Result<(), String> =
            tauri::async_runtime::block_on(on_blocking_worker("x", || Err("nope".to_string())));
        assert_eq!(
            err,
            Err("nope".to_string()),
            "the work's own error passes through untouched"
        );
    }

    #[test]
    fn a_panicking_worker_becomes_a_named_error() {
        let result: Result<(), String> =
            tauri::async_runtime::block_on(on_blocking_worker("the trash move", || panic!("boom")));
        let err = result.expect_err("a panic must not look like success");
        assert!(
            err.starts_with("the trash move stopped unexpectedly: "),
            "got {err:?}"
        );
    }

    #[test]
    fn the_work_runs_off_the_calling_thread() {
        let caller = std::thread::current().id();
        let worker = tauri::async_runtime::block_on(on_blocking_worker("x", || {
            Ok(std::thread::current().id())
        }))
        .unwrap();
        assert_ne!(worker, caller);
    }
}
