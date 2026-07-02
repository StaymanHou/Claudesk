//! M6 WP1 — file-based status-channel telemetry (the stuck-`Running` dot probe).
//!
//! The status path (`hook_socket` → `status_broadcaster::drain_loop` → `app.emit`)
//! today logs ONLY on the error path (`eprintln!`), and the installed/prod `.app` is
//! launchd-launched with **no visible stderr** — so the prior stuck-dot investigation
//! hit a no-logs wall. This module adds a best-effort append-mode file log under the
//! per-identity `app_data_dir()` (the same dir as `settings.json` + `hook.sock`, so it
//! is automatically `com.claudesk.app/` vs `com.claudesk.app.dev/` isolated) that is
//! **readable from the launchd-launched `.app`**.
//!
//! ## What it captures (the learning objective)
//! Per drained status event: event name + raw `cwd` + whether it mapped to a state
//! ([`event_to_state`](crate::status_broadcaster::event_to_state)) + whether its `cwd`
//! resolved to a registered workspace (id or `None`) + the final emitted/dropped
//! outcome. Plus the registry register/deregister canonical keys. Logging
//! `event_to_state` and `resolve_cwd` **separately** is the whole point: it
//! distinguishes a never-mapped non-lifecycle event from a `Stop` that arrived but
//! whose `cwd` matched no open workspace (the prime cwd-normalization-miss suspect).
//!
//! ## Discipline (mirrors the never-block-CC posture of the Perl hook)
//! - **Best-effort:** an IO failure (unwritable dir, full disk) is swallowed-and-
//!   continued — it NEVER panics and NEVER propagates into the drain loop. A probe
//!   that can break the status path is worse than no probe.
//! - **Append-mode:** one line per event, opened-and-closed per write (no held handle
//!   to leak across the drain thread's lifetime; the volume is one line per CC turn,
//!   not a hot loop).
//! - **KEPT as a standing prod diagnostic, size-capped** (debt-paydown D3, 2026-06-30).
//!   The earlier note here predicted WP2 would demote this to debug-only; the operator
//!   instead chose to KEEP it in prod (it's the channel that self-confirms a future
//!   status bug) but BOUND its growth so it can't grow forever. Before each append, if
//!   the live file exceeds [`MAX_LOG_BYTES`] it is rotated (`status-channel.log` →
//!   `status-channel.log.1`, replacing any prior `.1`) and a fresh live file started, so
//!   on-disk usage stays bounded to ~2× the cap (one live + one rotated generation). The
//!   rotation is itself best-effort — a rotate failure falls through to a normal append
//!   (a too-large log beats a broken status path).

use std::io::Write;
use std::path::{Path, PathBuf};

/// Basename of the status-channel log within the app-data directory.
pub const STATUS_LOG_FILE: &str = "status-channel.log";

/// Basename of the single rotated generation (`status-channel.log.1`).
pub const STATUS_LOG_ROTATED_FILE: &str = "status-channel.log.1";

/// Size cap (bytes) for the live status log before it rotates (D3 keep+cap). 5 MiB —
/// generous for the one-line-per-CC-turn volume (tens of thousands of events), small
/// enough that the worst case (live + one rotated generation) stays ~10 MiB on disk.
pub const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

/// A best-effort append-mode logger bound to a resolved log path. Constructed once at
/// drain-thread start from the `AppHandle`'s `app_data_dir()`; cloned cheaply (it is
/// just a `PathBuf`) into any call site that needs to log.
#[derive(Debug, Clone)]
pub struct StatusLog {
    path: PathBuf,
}

impl StatusLog {
    /// Bind the logger to `<data_dir>/status-channel.log`. Does no IO — the file is
    /// created lazily on the first [`write_line`](Self::write_line) (append + create).
    pub fn new(data_dir: &Path) -> Self {
        Self {
            path: data_dir.join(STATUS_LOG_FILE),
        }
    }

    /// The resolved log-file path (for documenting it to the operator).
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The rotated-generation path (`<live>.1`) — the single prior generation kept after
    /// a size-cap rotation.
    pub fn rotated_path(&self) -> PathBuf {
        self.path.with_file_name(STATUS_LOG_ROTATED_FILE)
    }

    /// Append one already-formatted line (a trailing newline is added). **Best-effort:**
    /// any IO error is swallowed — never panics, never propagates. The drain loop must
    /// not be slowed or broken by a logging failure.
    pub fn write_line(&self, line: &str) {
        // Open-append-close per write: low volume (one line per CC lifecycle event),
        // and not holding a handle keeps the failure surface to this one call.
        let _ = self.append(line);
    }

    /// The fallible inner write, kept separate so the swallow happens in exactly one
    /// place ([`write_line`](Self::write_line)) and the formatting/IO is unit-testable
    /// against a real (temp) path.
    fn append(&self, line: &str) -> std::io::Result<()> {
        // Size-cap (D3 keep+cap): rotate BEFORE the append if the live file is already
        // at/over the cap, so the file we open is fresh (or under-cap) and growth stays
        // bounded to ~one cap per generation. Rotation is best-effort — a failure here
        // falls through to a normal append (a too-large log beats a dropped status line).
        self.rotate_if_oversized();
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        writeln!(f, "{line}")
    }

    /// If the live log is at/over [`MAX_LOG_BYTES`], move it to the single rotated
    /// generation (`<live>.1`), replacing any prior one, so the next append starts a
    /// fresh live file. Best-effort: a stat or rename failure is swallowed (the caller's
    /// append then just grows the existing file — never a panic, never a dropped event).
    /// Factored out so the boundary is unit-testable with a small cap via [`rotate_at`].
    fn rotate_if_oversized(&self) {
        self.rotate_at(MAX_LOG_BYTES);
    }

    /// [`rotate_if_oversized`](Self::rotate_if_oversized) with an injectable cap (tests
    /// drive a tiny cap rather than writing 5 MiB). `>=` so a file exactly at the cap
    /// rotates. A missing/unstattable live file is a no-op (nothing to rotate).
    fn rotate_at(&self, cap_bytes: u64) {
        let oversized = std::fs::metadata(&self.path)
            .map(|m| m.len() >= cap_bytes)
            .unwrap_or(false);
        if oversized {
            // `rename` replaces an existing `.1` atomically on the same volume; a failure
            // (e.g. a transient lock) is swallowed — the append below still proceeds.
            let _ = std::fs::rename(&self.path, self.rotated_path());
        }
    }
}

/// Format one drained-event telemetry line. Pure (no IO) so it unit-tests directly.
///
/// Shape (single line, pipe-delimited, greppable):
/// `<ts_ms> STATUS event=<name> cwd=<raw> mapped=<state|none> resolved=<id|none> outcome=<emitted|dropped>`
///
/// - `mapped` is the [`event_to_state`](crate::status_broadcaster::event_to_state)
///   result rendered (`running`/`idle`/`awaiting_input`) or `none` (non-lifecycle /
///   informational notification).
/// - `resolved` is the workspace id the `cwd` matched, or `none` (no open workspace —
///   the cwd-miss case).
/// - `outcome` is `emitted` iff BOTH mapped AND resolved are present (the event would
///   produce a `WorkspaceStatusUpdate`); otherwise `dropped`.
///
/// `ts_ms` is the hook-side send time when present (telemetry only), else `-`.
pub fn format_event_line(
    ts_ms: Option<u64>,
    event_name: &str,
    raw_cwd: &str,
    mapped_state: Option<&str>,
    resolved_id: Option<&str>,
) -> String {
    let ts = ts_ms
        .map(|t| t.to_string())
        .unwrap_or_else(|| "-".to_string());
    let mapped = mapped_state.unwrap_or("none");
    let resolved = resolved_id.unwrap_or("none");
    let outcome = if mapped_state.is_some() && resolved_id.is_some() {
        "emitted"
    } else {
        "dropped"
    };
    format!(
        "{ts} STATUS event={event_name} cwd={raw_cwd} mapped={mapped} resolved={resolved} outcome={outcome}"
    )
}

/// Format one registry-mutation telemetry line (register / deregister). Pure.
///
/// Shape: `<ts:-> REGISTRY op=<register|deregister> id=<workspace_id|-> raw=<path> key=<canonical_key>`
///
/// The `key` is the canonicalized registry key — surfacing it on the register side
/// (and the resolve side via [`format_event_line`]'s `resolved`) makes a
/// canonicalization divergence in the launchd environment visible: a `register` key
/// that doesn't match a later `Stop`'s `cwd` is the cwd-match-miss smoking gun.
pub fn format_registry_line(
    op: &str,
    workspace_id: Option<&str>,
    raw_path: &str,
    key: &str,
) -> String {
    let id = workspace_id.unwrap_or("-");
    format!("- REGISTRY op={op} id={id} raw={raw_path} key={key}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn format_event_line_emitted_when_mapped_and_resolved() {
        let line = format_event_line(
            Some(1_718_000_000_000),
            "Stop",
            "/Users/x/proj",
            Some("idle"),
            Some("ws-1"),
        );
        assert_eq!(
            line,
            "1718000000000 STATUS event=Stop cwd=/Users/x/proj mapped=idle resolved=ws-1 outcome=emitted"
        );
    }

    #[test]
    fn format_event_line_dropped_on_cwd_miss() {
        // The prime suspect: a Stop arrived + mapped to idle, but its cwd resolved to
        // NO open workspace → dropped. This is the line WP2 needs to see.
        let line = format_event_line(None, "Stop", "/launchd/cwd", Some("idle"), None);
        assert_eq!(
            line,
            "- STATUS event=Stop cwd=/launchd/cwd mapped=idle resolved=none outcome=dropped"
        );
    }

    #[test]
    fn format_event_line_dropped_on_unmapped_event() {
        // A non-lifecycle event (or an informational notification) never maps to a
        // state → dropped, distinct from the cwd-miss case above by `mapped=none`.
        let line = format_event_line(None, "PreToolUse", "/p", None, Some("ws-1"));
        assert_eq!(
            line,
            "- STATUS event=PreToolUse cwd=/p mapped=none resolved=ws-1 outcome=dropped"
        );
    }

    #[test]
    fn format_registry_line_register_and_deregister() {
        assert_eq!(
            format_registry_line("register", Some("ws-1"), "/raw/path", "/canon/path"),
            "- REGISTRY op=register id=ws-1 raw=/raw/path key=/canon/path"
        );
        assert_eq!(
            format_registry_line("deregister", None, "/raw/path", "/canon/path"),
            "- REGISTRY op=deregister id=- raw=/raw/path key=/canon/path"
        );
    }

    #[test]
    fn write_line_appends_and_creates() {
        let dir = TempDir::new().unwrap();
        let log = StatusLog::new(dir.path());
        assert_eq!(log.path(), dir.path().join(STATUS_LOG_FILE));
        // File does not exist until the first write.
        assert!(!log.path().exists());

        log.write_line("line one");
        log.write_line("line two");

        let contents = std::fs::read_to_string(log.path()).unwrap();
        assert_eq!(contents, "line one\nline two\n");
    }

    #[test]
    fn rotate_at_is_a_noop_below_the_cap() {
        let dir = TempDir::new().unwrap();
        let log = StatusLog::new(dir.path());
        log.write_line("small"); // "small\n" = 6 bytes
                                 // Cap well above the current size → no rotation, live file untouched, no .1.
        log.rotate_at(1000);
        assert!(log.path().exists());
        assert!(!log.rotated_path().exists());
        assert_eq!(std::fs::read_to_string(log.path()).unwrap(), "small\n");
    }

    #[test]
    fn rotate_at_moves_live_to_rotated_when_at_or_over_cap() {
        let dir = TempDir::new().unwrap();
        let log = StatusLog::new(dir.path());
        log.write_line("0123456789"); // "0123456789\n" = 11 bytes
                                      // Cap below the current size → rotate: live becomes .1, live no longer exists.
        log.rotate_at(11);
        assert!(!log.path().exists());
        assert!(log.rotated_path().exists());
        assert_eq!(
            std::fs::read_to_string(log.rotated_path()).unwrap(),
            "0123456789\n"
        );
    }

    #[test]
    fn append_rotates_then_writes_fresh_when_over_cap() {
        // The integrated path through write_line: an oversized live file is rotated and
        // the new line lands in a FRESH live file (so growth is bounded per generation).
        let dir = TempDir::new().unwrap();
        let log = StatusLog::new(dir.path());
        // Seed the live file at/over the 5 MiB cap with one big line.
        let big = "x".repeat(MAX_LOG_BYTES as usize);
        log.write_line(&big);
        assert!(log.path().exists());
        // Next write sees the over-cap file, rotates it, and writes fresh.
        log.write_line("after rotate");
        // Live file now holds ONLY the post-rotation line; the big line is in .1.
        assert_eq!(
            std::fs::read_to_string(log.path()).unwrap(),
            "after rotate\n"
        );
        assert!(log.rotated_path().exists());
        assert!(std::fs::metadata(log.rotated_path()).unwrap().len() >= MAX_LOG_BYTES);
    }

    #[test]
    fn rotate_replaces_a_prior_rotated_generation() {
        // Only ONE rotated generation is kept — a second rotation overwrites .1 (so disk
        // stays bounded to ~2× the cap, never an unbounded .1/.2/.3 chain).
        let dir = TempDir::new().unwrap();
        let log = StatusLog::new(dir.path());
        std::fs::write(log.rotated_path(), b"OLD rotated\n").unwrap();
        log.write_line("0123456789");
        log.rotate_at(5); // over the tiny cap → rotate, replacing the OLD .1
        assert_eq!(
            std::fs::read_to_string(log.rotated_path()).unwrap(),
            "0123456789\n"
        );
    }

    #[test]
    fn write_line_swallows_io_failure_without_panicking() {
        // Best-effort discipline: an unwritable path must NOT panic or propagate. Point
        // the logger at a path whose parent is a FILE (so create/open fails), and assert
        // write_line returns normally (the drain loop must never be broken by logging).
        let dir = TempDir::new().unwrap();
        let not_a_dir = dir.path().join("iam_a_file");
        std::fs::write(&not_a_dir, b"x").unwrap();
        // <file>/status-channel.log — opening under a file-as-parent fails (ENOTDIR).
        let log = StatusLog::new(&not_a_dir);
        // Must not panic.
        log.write_line("this should be swallowed");
        // And nothing was created at the bogus path.
        assert!(!log.path().exists());
    }
}
