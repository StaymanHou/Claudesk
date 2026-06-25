//! Claudesk CC-hook socket listener — the receive side of the status channel.
//!
//! WP2 deployed the Perl hook (`resources/claudesk-hook.pl`) and registered it in
//! `~/.claude/settings.json`. On every Claude Code lifecycle event the hook writes
//! one newline-delimited JSON line to a Claudesk-owned `AF_UNIX` socket at
//! `<app-data>/hook.sock` (path passed to the hook via `CLAUDESK_HOOK_SOCK`).
//! Milestone 3's "central nervous system" reads each workspace's idle/running/
//! awaiting-input state from this channel — never by scraping PTY output (see
//! `CLAUDE.md` → "PTY byte-injection for input; hook channel for state").
//!
//! WP3 is the production listener that the WP1 probe
//! (`examples/hook_socket_probe.rs`) proved end-to-end with a real `claude`:
//! - **Phase 1 (this module's core):** the typed [`HookEvent`] + the pure
//!   [`parse_line`] seam — testable over the verbatim WP1 payloads with no IO.
//! - **Phase 2 (the listener):** bind the socket (clearing a stale file first),
//!   accept the connection stream on a dedicated `std::thread` (NOT tokio — WP1's
//!   verdict), and deliver parsed events into the core via an `mpsc` channel (the
//!   seam WP4's broadcaster consumes).
//!
//! No broadcast/normalization here — that is WP4. A missing/failed socket leaves
//! status `Unknown` (arch.md failure mode), never inferred.
//!
//! ## Wire contract (the line the hook writes, parsed here)
//! `{"hook_event_name":..,"session_id":..,"cwd":..,"timestamp":<ms>,"prompt"?:..,"message"?:..,"notification_type"?:..}`
//! `prompt` is present only on `UserPromptSubmit`; `message` + `notification_type`
//! only on `Notification` (the latter added QoL-WP2 to gate AwaitingInput on genuine
//! input-needed types). Keys are **snake_case end-to-end** — the Rust struct mirrors
//! the wire field names verbatim (NO `rename_all`), so the frontend (WP6) and the
//! hook agree with no camelCase drift (folds toward
//! `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`, which WP4's DTO
//! key-shape test fully closes).

// WP4's status broadcaster now drains the receiver held in `HookSocketState` and
// reads the `HookEvent` fields (`prompt`/`timestamp` via `status_broadcaster::
// to_update`), so the WP3-era module-wide dead-code allow is removed — the whole
// module is now live to the non-test build under `clippy -D warnings`.

pub mod commands;

use std::io::{BufRead, BufReader};
use std::os::unix::net::UnixListener;
use std::path::Path;
use std::sync::mpsc::Sender;
use std::thread;

use serde::Deserialize;
use thiserror::Error;

/// A single CC lifecycle event, parsed from one JSON line off the hook socket.
///
/// Field names are the verbatim snake_case wire keys — do not add
/// `#[serde(rename_all)]`. `timestamp` is the hook-side send time in epoch ms
/// (telemetry; not load-bearing for the WP4 state machine). `prompt` and
/// `message` are event-specific and absent on the others, so every field that may
/// be missing carries `#[serde(default)]` and one struct parses all three M3
/// events. Mirrors the WP1 probe's struct (minus the probe-only `#[serde(flatten)]
/// extra` surprise-capture — production drops unmodeled fields silently).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct HookEvent {
    /// `UserPromptSubmit` | `Stop` | `Notification` (the three M3 events).
    #[serde(default)]
    pub hook_event_name: String,
    /// CC session id — stable across an event pair (submit/stop share one).
    #[serde(default)]
    pub session_id: String,
    /// The project dir CC is running in. WP4 maps this to a known workspace.
    #[serde(default)]
    pub cwd: String,
    /// Hook-side send time, epoch ms. Optional telemetry, not load-bearing.
    #[serde(default)]
    pub timestamp: Option<u64>,
    /// Full user prompt — present only on `UserPromptSubmit`.
    #[serde(default)]
    pub prompt: Option<String>,
    /// Notification text — present only on `Notification`.
    #[serde(default)]
    pub message: Option<String>,
    /// Notification subtype — present only on `Notification` (QoL-WP2). Distinguishes
    /// a genuine input request (`permission_prompt`, `elicitation_dialog`) from an
    /// informational nudge (`idle_prompt`, `auth_success`, …). The broadcaster gates
    /// AwaitingInput on this (see `status_broadcaster::event_to_state`).
    #[serde(default)]
    pub notification_type: Option<String>,
}

/// Errors from the socket listener's IO/lifecycle (bind, remove-stale, accept).
///
/// A **parse** failure is deliberately NOT one of these — a garbage line is
/// skip-and-continue inside the accept-loop (never panic, never break it), so
/// [`parse_line`] returns `serde_json::Error` directly and the loop logs+drops it.
#[derive(Debug, Error)]
pub enum HookSocketError {
    #[error("hook socket I/O error: {0}")]
    Io(#[from] std::io::Error),
}

/// Parse one line off the hook socket into a [`HookEvent`].
///
/// The single pure, testable parse seam — kept separate from the IO loop so it
/// unit-tests over the verbatim WP1 payloads with no socket. The caller is
/// responsible for skipping empty/whitespace-only lines *before* calling this
/// (an empty line is not valid JSON and would error here); the accept-loop's
/// `line.trim().is_empty()` guard handles that, mirroring the WP1 probe.
///
/// On a malformed line this returns `Err` — the loop logs and continues; it never
/// panics the accept thread.
pub fn parse_line(line: &str) -> Result<HookEvent, serde_json::Error> {
    serde_json::from_str(line)
}

/// Bind the `AF_UNIX` listener at `socket_path`, first removing a stale socket
/// file left by a prior unclean exit (`bind` fails with `EADDRINUSE` otherwise —
/// the WP1 probe hit this). The stale-file removal ignores `NotFound` (nothing to
/// clean) but propagates any other removal error. Injected path → unit-testable
/// against a `TempDir`.
pub fn bind_listener(socket_path: &Path) -> Result<UnixListener, HookSocketError> {
    // Remove a stale socket file from a prior run; absence is fine.
    match std::fs::remove_file(socket_path) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(HookSocketError::Io(e)),
    }
    Ok(UnixListener::bind(socket_path)?)
}

/// Spawn the accept-loop on a **dedicated `std::thread`** (NOT tokio — the WP1
/// listener-design verdict; the socket is a long-lived blocking stream and a
/// thread is the simplest correct owner). Each accepted connection is drained of
/// every newline-delimited line *promptly* before looping — the never-block-CC
/// invariant (the WP2 Perl hook's `print $sock $line` can stall if we accept but
/// don't read; `Timeout=>1` covers connect, not write). A parse error on any line
/// is logged and skipped — the loop never panics and never breaks (a single
/// garbage line must not deafen the channel). Each parsed [`HookEvent`] is sent on
/// `tx`; a closed receiver (`SendError`) means the core is shutting down, so the
/// loop exits cleanly.
///
/// Returns the [`thread::JoinHandle`] so the caller can hold it (or detach it).
pub fn spawn_listener(listener: UnixListener, tx: Sender<HookEvent>) -> thread::JoinHandle<()> {
    thread::Builder::new()
        .name("claudesk-hook-socket".into())
        .spawn(move || accept_loop(listener, tx))
        .expect("failed to spawn hook-socket accept thread")
}

/// The accept-loop body — extracted so it reads top-to-bottom. Mirrors the WP1
/// probe's structure: accept → `BufReader::lines()` → trim-empty-skip → parse →
/// send. Accept errors are logged and the loop continues (one bad accept must not
/// kill the listener); a `tx.send` failure (receiver dropped) ends the loop.
fn accept_loop(listener: UnixListener, tx: Sender<HookEvent>) {
    for conn in listener.incoming() {
        let stream = match conn {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[claudesk] hook-socket accept error: {e}");
                continue;
            }
        };
        // Drain the whole connection promptly (read every line before looping)
        // so the hook's blocking write returns immediately — never block CC.
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            let raw = match line {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[claudesk] hook-socket read error: {e}");
                    break; // connection broken — move to the next accept
                }
            };
            if raw.trim().is_empty() {
                continue;
            }
            match parse_line(&raw) {
                Ok(event) => {
                    if tx.send(event).is_err() {
                        // Receiver dropped → core shutting down. Exit cleanly.
                        return;
                    }
                }
                Err(e) => {
                    // Skip-and-continue: a garbage line is logged, never fatal.
                    eprintln!("[claudesk] hook-socket parse error (skipped): {e}");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Verbatim WP1 payload literals (docs/product/wp1-hook-socket-probe-outcome.md) ----
    // Pinned exactly as a real `claude` emitted them (UserPromptSubmit + Stop
    // observed live; Notification inference-grade from the claude-time reference +
    // offline parse — live capture is the WP6 residual). The production hook
    // standardized the send-timestamp field on `timestamp` (epoch ms); the WP1
    // probe lines carry no timestamp, so these exercise the `Option`-absent path,
    // and a separate test pins the with-`timestamp` shape the WP2 hook emits.

    const UPS_LINE: &str = r#"{"hook_event_name":"UserPromptSubmit","session_id":"cdf522c4-30a5-4d2a-92aa-af823773422d","cwd":"/Users/stayman/Personal/projects/claudesk/src-tauri","prompt":"Reply with exactly the word: pong"}"#;
    const STOP_LINE: &str = r#"{"hook_event_name":"Stop","session_id":"10ace7be-6c6c-4081-aa17-7eaac5cc42f5","cwd":"/Users/stayman/Personal/projects/claudesk/src-tauri"}"#;
    const NOTIFICATION_LINE: &str = r#"{"hook_event_name":"Notification","session_id":"abc","cwd":"/tmp/proj","message":"Claude needs your permission"}"#;

    #[test]
    fn parses_user_prompt_submit_with_prompt() {
        let ev = parse_line(UPS_LINE).unwrap();
        assert_eq!(ev.hook_event_name, "UserPromptSubmit");
        assert_eq!(ev.session_id, "cdf522c4-30a5-4d2a-92aa-af823773422d");
        assert_eq!(
            ev.cwd,
            "/Users/stayman/Personal/projects/claudesk/src-tauri"
        );
        assert_eq!(
            ev.prompt.as_deref(),
            Some("Reply with exactly the word: pong")
        );
        assert_eq!(ev.message, None);
    }

    #[test]
    fn parses_stop_without_prompt_or_message() {
        let ev = parse_line(STOP_LINE).unwrap();
        assert_eq!(ev.hook_event_name, "Stop");
        assert_eq!(ev.session_id, "10ace7be-6c6c-4081-aa17-7eaac5cc42f5");
        assert_eq!(
            ev.cwd,
            "/Users/stayman/Personal/projects/claudesk/src-tauri"
        );
        assert_eq!(ev.prompt, None);
        assert_eq!(ev.message, None);
    }

    #[test]
    fn parses_notification_with_message() {
        let ev = parse_line(NOTIFICATION_LINE).unwrap();
        assert_eq!(ev.hook_event_name, "Notification");
        assert_eq!(ev.session_id, "abc");
        assert_eq!(ev.cwd, "/tmp/proj");
        assert_eq!(ev.message.as_deref(), Some("Claude needs your permission"));
        assert_eq!(ev.prompt, None);
        // No notification_type on the legacy line → None (the field defaults absent).
        assert_eq!(ev.notification_type, None);
    }

    #[test]
    fn parses_notification_type_when_present() {
        // QoL-WP2: the production hook forwards `notification_type` on Notification
        // events (the live capture showed `permission_prompt`). Pin that the
        // snake_case key deserializes into the Option<String> field.
        let line = r#"{"hook_event_name":"Notification","session_id":"s","cwd":"/p","message":"Claude needs your permission","notification_type":"permission_prompt"}"#;
        let ev = parse_line(line).unwrap();
        assert_eq!(ev.hook_event_name, "Notification");
        assert_eq!(ev.notification_type.as_deref(), Some("permission_prompt"));
        assert_eq!(ev.message.as_deref(), Some("Claude needs your permission"));
    }

    #[test]
    fn parses_production_hook_line_with_timestamp() {
        // The shape the WP2 production hook (claudesk-hook.pl) actually emits:
        // it adds `timestamp` (int epoch ms) to every event. Pin that the field
        // deserializes into `Option<u64>` from the snake_case key verbatim.
        let line =
            r#"{"hook_event_name":"Stop","session_id":"s","cwd":"/p","timestamp":1718000000000}"#;
        let ev = parse_line(line).unwrap();
        assert_eq!(ev.timestamp, Some(1_718_000_000_000));
    }

    #[test]
    fn serde_shape_is_snake_case_verbatim() {
        // Guard against a future `rename_all`/field-rename drift: the wire keys are
        // snake_case and the struct must mirror them exactly, so WP6's TS type can
        // copy the field names verbatim. A camelCase line must NOT populate the
        // fields (proves we are not silently accepting renamed keys).
        let snake = r#"{"hook_event_name":"Stop","session_id":"s","cwd":"/p"}"#;
        let camel = r#"{"hookEventName":"Stop","sessionId":"s","cwd":"/p"}"#;

        let from_snake = parse_line(snake).unwrap();
        assert_eq!(from_snake.hook_event_name, "Stop");
        assert_eq!(from_snake.session_id, "s");

        // camelCase keys are simply unknown fields → defaults (empty strings),
        // confirming the struct keys on the snake_case names, not the camelCase.
        let from_camel = parse_line(camel).unwrap();
        assert_eq!(from_camel.hook_event_name, "");
        assert_eq!(from_camel.session_id, "");
        assert_eq!(from_camel.cwd, "/p"); // cwd is the same in both casings
    }

    #[test]
    fn garbage_line_is_an_error_not_a_panic() {
        // The accept-loop's contract: a malformed line returns Err so the loop
        // logs-and-continues. parse_line must never panic on junk.
        assert!(parse_line("{ not json").is_err());
        assert!(parse_line("plain text").is_err());
        assert!(parse_line("[1,2,3]").is_err()); // valid JSON, wrong shape (array)
    }

    #[test]
    fn empty_or_whitespace_line_errors_caller_skips() {
        // parse_line is not responsible for the empty-line skip — the loop guards
        // `line.trim().is_empty()` first. Document that contract: empty input here
        // is an error (not valid JSON), so calling parse_line on it is a caller bug.
        assert!(parse_line("").is_err());
        assert!(parse_line("   ").is_err());
    }

    // ---- Phase 2: listener bind + accept-loop ----

    use std::io::Write;
    use std::os::unix::net::UnixStream;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn bind_succeeds_over_a_stale_socket_file() {
        // An unclean prior exit can leave a socket file at the path; bind must
        // remove it first (else EADDRINUSE — the WP1 probe hit this).
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("hook.sock");

        // First bind creates the socket file; dropping the listener leaves the
        // file on disk (Unix sockets are not auto-unlinked on drop).
        let first = bind_listener(&path).unwrap();
        drop(first);
        assert!(path.exists(), "stale socket file should remain after drop");

        // Second bind must clean the stale file and succeed.
        let second = bind_listener(&path);
        assert!(
            second.is_ok(),
            "bind must remove the stale socket file and rebind"
        );
    }

    #[test]
    fn end_to_end_two_events_delivered_garbage_skipped_loop_survives() {
        // Bind on a temp path, spawn the accept-loop thread, connect a client and
        // write two valid lines + one garbage line between them. The receiver must
        // get exactly the two parsed events (garbage skipped) and the loop must
        // survive the bad line to deliver the second event.
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("hook.sock");
        let listener = bind_listener(&path).unwrap();
        let (tx, rx) = mpsc::channel::<HookEvent>();
        let handle = spawn_listener(listener, tx);

        // Connect and send: valid → garbage → valid, newline-delimited.
        let mut client = UnixStream::connect(&path).unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"s1\",\"cwd\":\"/p\",\"prompt\":\"hi\"}\n")
            .unwrap();
        client.write_all(b"{ not json at all\n").unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"Stop\",\"session_id\":\"s1\",\"cwd\":\"/p\"}\n")
            .unwrap();
        // Close the write half so the accept-loop's line iterator ends and the
        // thread can move on (and our recv won't block past delivery).
        client.shutdown(std::net::Shutdown::Both).unwrap();

        // First event: the UserPromptSubmit (garbage between is dropped).
        let first = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(first.hook_event_name, "UserPromptSubmit");
        assert_eq!(first.prompt.as_deref(), Some("hi"));

        // Second event proves the loop survived the garbage line.
        let second = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(second.hook_event_name, "Stop");

        // No third event — exactly two delivered, the garbage was skipped.
        assert!(
            rx.recv_timeout(Duration::from_millis(200)).is_err(),
            "only two valid events should be delivered"
        );

        // Dropping rx ends the loop on the next send; the thread is detached for
        // the test's purposes (the listener has no more connections incoming).
        drop(rx);
        drop(handle); // detach — test process exit reaps it
    }

    #[test]
    fn loop_exits_cleanly_when_receiver_is_dropped() {
        // If the core (WP4) drops the receiver, a subsequent send fails and the
        // accept-loop returns rather than panicking. Exercise via accept_loop
        // directly with a pre-closed receiver and a connection carrying one line.
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("hook.sock");
        let listener = bind_listener(&path).unwrap();
        let (tx, rx) = mpsc::channel::<HookEvent>();
        drop(rx); // receiver gone before any event arrives

        let handle = thread::spawn(move || accept_loop(listener, tx));

        let mut client = UnixStream::connect(&path).unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"Stop\",\"session_id\":\"s\",\"cwd\":\"/p\"}\n")
            .unwrap();
        client.shutdown(std::net::Shutdown::Both).unwrap();

        // The loop should return (the send fails on the dropped receiver) rather
        // than hang or panic — join completes.
        handle.join().expect("accept-loop thread must not panic");
    }
}
