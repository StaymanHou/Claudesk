//! M15 WP3 Phase 4 — the headless `claude -p` spawn behind the supervisor's residual
//! adjudicator.
//!
//! ═══════════════════════════════════════════════════════════════════════════════
//! ⚠️ THIS MODULE SPAWNS A PROCESS AND RETURNS ITS STDOUT. IT DECIDES NOTHING.
//!
//! Per ruling **R-4**, Rust does IO and TypeScript owns every verdict. So the prompt is built
//! in TS, the answer is parsed in TS, and the binding "bias failures toward withholding" rule
//! (**R-6 condition 2**) is enforced in TS. What lives here is only the part that cannot: a
//! subprocess with a hard timeout.
//!
//! ⚠️ **EVERY FAILURE IS AN `Err`, NEVER AN EMPTY `Ok`.** A spawn failure that returned
//! `Ok("")` would reach the TS parser as an unparseable answer — which happens to withhold
//! correctly today, but by accident rather than by contract. Failing loudly here keeps the
//! withholding decision in the one place that documents it.
//!
//! ⚠️ **NO PER-SPAWN `PATH` HACK.** `env_path` captures the login-shell `PATH` at `.setup()`
//! and sets it process-wide, so `claude` resolves from a Finder/Dock-launched `.app` exactly
//! as it does from a terminal. Re-introducing a local `PATH` fix here would silently diverge
//! from that single source (see `CLAUDE.md` → "GUI-launched app inherits a minimal PATH").

pub mod commands;

use std::process::Command;

use crate::subprocess::{run_captured, RunError};

/// Why an adjudication attempt produced no answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdjudicateError {
    /// The `claude` binary could not be spawned — not installed, or not on `PATH`.
    NotFound(String),
    /// It ran but exceeded the caller's timeout. ⚠️ The child is killed before returning.
    TimedOut(u64),
    /// It ran and exited non-zero.
    Failed { code: Option<i32>, stderr: String },
    /// The spawn itself failed for some other reason (pipe, permissions, …).
    Spawn(String),
    /// It succeeded but wrote more than [`MAX_OUTPUT`] bytes to stdout. ⚠️ An error, never a
    /// truncated `Ok`: a verdict written after the cap would otherwise vanish from an answer
    /// that looks complete.
    OutputTooLarge(usize),
}

impl std::fmt::Display for AdjudicateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(p) => write!(f, "claude not found on PATH ({p})"),
            // ⚠️ The word "timed out" is load-bearing: the TS side classifies the diagnostic
            // (not the decision) by matching it. Both paths withhold either way.
            Self::TimedOut(ms) => write!(f, "claude -p timed out after {ms}ms"),
            Self::Failed { code, stderr } => write!(
                f,
                "claude -p exited {} ({})",
                code.map(|c| c.to_string())
                    .unwrap_or_else(|| "signal".into()),
                stderr.trim()
            ),
            Self::Spawn(e) => write!(f, "claude -p could not be spawned: {e}"),
            // ⚠️ Must not match the TS classifier `/timed? ?out/i` ("timeout", "time out", …).
            Self::OutputTooLarge(n) => write!(f, "claude -p wrote more than {n} bytes of output"),
        }
    }
}

/// The adjudicator's words for each [`RunError`] (the runner is shared; these strings are not).
/// ⚠️ Variant for variant, so the TS classifier still sees "timed out" on a timeout.
impl From<RunError> for AdjudicateError {
    fn from(e: RunError) -> Self {
        match e {
            RunError::NotFound(p) => Self::NotFound(p),
            RunError::TimedOut(ms) => Self::TimedOut(ms),
            RunError::Failed { code, stderr } => Self::Failed { code, stderr },
            RunError::Spawn(e) => Self::Spawn(e),
            RunError::OutputTooLarge(n) => Self::OutputTooLarge(n),
        }
    }
}

/// Run `claude -p` with `prompt` on stdin and return its stdout.
///
/// ⚠️ **The prompt goes over STDIN, not as an argv token.** A turn tail is arbitrary text of
/// unbounded length — it can exceed `ARG_MAX`, and it routinely contains quotes, newlines and
/// backticks. Passing it as an argument would fail on exactly the long, complex turns the
/// adjudicator exists to judge.
///
/// ⚠️ **The timeout kills the child.** A `wait_timeout` that merely stopped waiting would leak
/// a `claude` process per fire, and the supervisor fires across every open workspace.
pub fn run_adjudicator(
    model: &str,
    prompt: &str,
    timeout_ms: u64,
) -> Result<String, AdjudicateError> {
    run_captured(adjudicator_command(model), prompt, timeout_ms).map_err(AdjudicateError::from)
}

/// The `claude -p --model <model> --output-format json` invocation. Its own function so a test
/// can pin the argv without spawning `claude`.
///
/// ⚠️ `--output-format json` (M16.5 WP3 3.6) makes stdout a JSON envelope whose `modelUsage`
/// keys name the model that ACTUALLY answered. Rust still returns that stdout raw (R-4); the TS
/// side parses it and withholds when the resolved model is not the pin. A plain-text reply can
/// only say what was asked for, which is how an alias moved silently once.
fn adjudicator_command(model: &str) -> Command {
    let mut cmd = Command::new("claude");
    cmd.arg("-p")
        .arg("--model")
        .arg(model)
        .arg("--output-format")
        .arg("json");
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::subprocess::MAX_OUTPUT;

    #[test]
    fn timeout_message_carries_the_phrase_the_ts_side_classifies_on() {
        // ⚠️ The TS diagnostic distinguishes a timeout from other errors by matching /timed?
        // ?out/i on this message. Both withhold — this only keeps the DIAGNOSTIC accurate —
        // but a reworded message would silently mislabel every timeout as a generic error.
        let msg = AdjudicateError::TimedOut(20_000).to_string();
        assert!(
            ts_classifies_as_timeout(&msg),
            "message must match the TS classifier: {msg}"
        );
    }

    /// The TS classifier in `supervisor/adjudicator.ts`, `/timed? ?out/i`, ported exactly.
    fn ts_classifies_as_timeout(s: &str) -> bool {
        regex::Regex::new(r"(?i)timed? ?out")
            .expect("valid pattern")
            .is_match(s)
    }

    #[test]
    fn the_ported_classifier_matches_every_spelling_the_ts_one_does() {
        for hit in ["timed out", "Timeout", "time out", "TIMEDOUT"] {
            assert!(ts_classifies_as_timeout(hit), "{hit}");
        }
        for miss in ["output", "time-out", "timer"] {
            assert!(!ts_classifies_as_timeout(miss), "{miss}");
        }
    }

    #[test]
    fn not_found_is_distinguished_from_a_generic_spawn_failure() {
        // The two have very different operator remedies (install/PATH vs a real bug), so they
        // must not collapse into one error.
        let nf = AdjudicateError::NotFound("/usr/bin".into());
        let sp = AdjudicateError::Spawn("pipe broke".into());
        assert_ne!(nf, sp);
        assert!(nf.to_string().contains("not found"));
        assert!(sp.to_string().contains("could not be spawned"));
    }

    #[test]
    fn the_adjudicator_invokes_claude_print_mode_with_the_pinned_model() {
        // `run_adjudicator` is `run_captured(adjudicator_command(model), …)`, and `run_captured` is
        // covered in `crate::subprocess::captured`, so this argv is the only part of the `supervisor_adjudicate` path left
        // to pin. Without `-p`, `claude` opens its interactive TUI and never exits on its own.
        let cmd = adjudicator_command("claude-haiku-4-5");
        assert_eq!(cmd.get_program(), "claude");
        let args: Vec<_> = cmd.get_args().collect();
        assert_eq!(
            args,
            [
                "-p",
                "--model",
                "claude-haiku-4-5",
                "--output-format",
                "json"
            ]
        );
    }

    #[test]
    fn the_too_large_message_cannot_be_classified_as_a_timeout() {
        // The TS diagnostic buckets an error as a timeout by matching /timed? ?out/i.
        let msg = AdjudicateError::OutputTooLarge(MAX_OUTPUT).to_string();
        assert!(!ts_classifies_as_timeout(&msg), "{msg}");
    }

    #[test]
    fn every_run_error_maps_to_the_same_adjudicator_variant() {
        // The words differ by design; the variant must not, or a timeout would stop reading as one.
        assert_eq!(
            AdjudicateError::from(RunError::TimedOut(7)),
            AdjudicateError::TimedOut(7)
        );
        assert_eq!(
            AdjudicateError::from(RunError::NotFound("p".into())),
            AdjudicateError::NotFound("p".into())
        );
        assert_eq!(
            AdjudicateError::from(RunError::Failed {
                code: Some(3),
                stderr: "e".into()
            }),
            AdjudicateError::Failed {
                code: Some(3),
                stderr: "e".into()
            }
        );
        assert_eq!(
            AdjudicateError::from(RunError::Spawn("s".into())),
            AdjudicateError::Spawn("s".into())
        );
        assert_eq!(
            AdjudicateError::from(RunError::OutputTooLarge(9)),
            AdjudicateError::OutputTooLarge(9)
        );
    }
}
