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
#[tauri::command]
pub fn supervisor_adjudicate(
    model: String,
    prompt: String,
    timeout_ms: u64,
) -> Result<String, String> {
    run_adjudicator(&model, &prompt, timeout_ms).map_err(|e: AdjudicateError| e.to_string())
}
