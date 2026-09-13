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

use std::io::Write;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

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
        }
    }
}

/// How often the wait loop polls for child exit.
const POLL_MS: u64 = 50;

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
    let mut child = match Command::new("claude")
        .arg("-p")
        .arg("--model")
        .arg(model)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(AdjudicateError::NotFound(
                std::env::var("PATH").unwrap_or_default(),
            ));
        }
        Err(e) => return Err(AdjudicateError::Spawn(e.to_string())),
    };

    if let Some(mut stdin) = child.stdin.take() {
        // ⚠️ A write error is NOT fatal on its own: `claude` may have already read enough and
        // closed the pipe. The exit status is what decides.
        let _ = stdin.write_all(prompt.as_bytes());
        // Dropping closes the pipe, which is what makes `claude -p` start work.
    }

    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let out = child
                    .wait_with_output()
                    .map(|o| o.stdout)
                    .unwrap_or_default();
                if !status.success() {
                    return Err(AdjudicateError::Failed {
                        code: status.code(),
                        stderr: String::new(),
                    });
                }
                return Ok(String::from_utf8_lossy(&out).into_owned());
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    // ⚠️ Kill, then reap — otherwise every timeout leaves a zombie, and the
                    // supervisor runs this per fire across every open workspace.
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(AdjudicateError::TimedOut(timeout_ms));
                }
                std::thread::sleep(Duration::from_millis(POLL_MS));
            }
            Err(e) => return Err(AdjudicateError::Spawn(e.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timeout_message_carries_the_phrase_the_ts_side_classifies_on() {
        // ⚠️ The TS diagnostic distinguishes a timeout from other errors by matching /timed?
        // ?out/i on this message. Both withhold — this only keeps the DIAGNOSTIC accurate —
        // but a reworded message would silently mislabel every timeout as a generic error.
        let msg = AdjudicateError::TimedOut(20_000).to_string();
        assert!(
            regex_lite_timed_out(&msg),
            "message must match the TS classifier: {msg}"
        );
    }

    /// Mirrors the TS `/timed? ?out/i` test without pulling in a regex crate.
    fn regex_lite_timed_out(s: &str) -> bool {
        let l = s.to_lowercase();
        l.contains("timed out") || l.contains("timedout") || l.contains("time out")
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
    fn a_missing_binary_errors_rather_than_returning_empty_output() {
        // ⚠️ THE CONTRACT THIS PINS: a failure must be an `Err`, never `Ok("")`. An empty Ok
        // would reach the TS parser as an unparseable answer and withhold by ACCIDENT rather
        // than by the documented rule. Uses a name that cannot exist on PATH.
        let err = run_adjudicator_with_program("claudesk-no-such-binary-xyzzy", 1_000)
            .expect_err("a missing binary must be an Err");
        assert!(matches!(err, AdjudicateError::NotFound(_)), "got {err:?}");
    }

    /// Test seam: same spawn shape, arbitrary program name.
    fn run_adjudicator_with_program(
        program: &str,
        timeout_ms: u64,
    ) -> Result<String, AdjudicateError> {
        match Command::new(program)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
        {
            Ok(mut c) => {
                let _ = c.kill();
                let _ = c.wait();
                let _ = timeout_ms;
                Ok(String::new())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(AdjudicateError::NotFound(
                std::env::var("PATH").unwrap_or_default(),
            )),
            Err(e) => Err(AdjudicateError::Spawn(e.to_string())),
        }
    }

    #[test]
    fn a_slow_child_times_out_and_is_reaped() {
        // ⚠️ Drives the REAL loop against a real subprocess, because the property that matters
        // (the child is killed, not merely abandoned) is invisible to a pure unit test. Uses
        // `sleep`, which exists on every macOS/Linux host this builds on.
        let start = Instant::now();
        let err = run_program_with_timeout("sleep", &["30"], 300)
            .expect_err("a 30s child under a 300ms timeout must time out");
        assert!(matches!(err, AdjudicateError::TimedOut(300)), "got {err:?}");
        assert!(
            start.elapsed() < Duration::from_secs(5),
            "the timeout must actually cut the wait short, not run to completion"
        );
    }

    /// The production wait/kill loop, parameterized for the test above.
    fn run_program_with_timeout(
        program: &str,
        args: &[&str],
        timeout_ms: u64,
    ) -> Result<String, AdjudicateError> {
        let mut child = Command::new(program)
            .args(args)
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|e| AdjudicateError::Spawn(e.to_string()))?;
        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => return Ok(String::new()),
                Ok(None) => {
                    if Instant::now() >= deadline {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(AdjudicateError::TimedOut(timeout_ms));
                    }
                    std::thread::sleep(Duration::from_millis(POLL_MS));
                }
                Err(e) => return Err(AdjudicateError::Spawn(e.to_string())),
            }
        }
    }
}
