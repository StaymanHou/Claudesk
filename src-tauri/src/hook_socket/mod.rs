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
//! Always: `hook_event_name`, `session_id`, `cwd`, `timestamp`(`<ms>`). Event-specific
//! optional fields:
//! - `prompt` + `prompt_length_chars` — `UserPromptSubmit` (`prompt` for the status
//!   snippet; `prompt_length_chars` for the time-row — **length only, never text**).
//! - `message` + `notification_type` — `Notification` (`notification_type` added
//!   QoL-WP2 to gate AwaitingInput on genuine input-needed types).
//! - `tool_name` + `tool_use_id` — `PreToolUse` / `PostToolUse` / `PostToolUseFailure`.
//! - `agent_type` — `SubagentStart` / `SubagentStop`.
//! - `source` — `SessionStart`.
//! - `origin` — every event from a REMOTE host's hook (M17 WP4), never a local one.
//!
//! The `tool_*` / `agent_type` / `source` / `prompt_length_chars` fields are the M9
//! WP2 time-analytics additions (`time_store` consumes them; the status machine reads
//! none of them). Keys are **snake_case end-to-end** — the Rust struct mirrors the
//! wire field names verbatim (NO `rename_all`), so the frontend (WP6) and the hook
//! agree with no camelCase drift (folds toward
//! `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`, which WP4's DTO
//! key-shape test fully closes).

// WP4's status broadcaster now drains the receiver held in `HookSocketState` and
// reads the `HookEvent` fields (`prompt`/`timestamp` via `status_broadcaster::
// to_update`), so the WP3-era module-wide dead-code allow is removed — the whole
// module is now live to the non-test build under `clippy -D warnings`.

pub mod commands;

use std::io::{BufRead, BufReader};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use std::sync::mpsc::Sender;
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;
use thiserror::Error;

use crate::status_log::{format_hooksock_timeout_line, now_ms, StatusLog};

/// How long an accepted connection may sit silent before the listener closes it and moves
/// on to the next `accept()` (2026-11-27, `SURFACE-…-HOOK-LISTENER-ONE-STUCK-CONNECTION-
/// DEAFENS-ALL`).
///
/// ⚠️ The loop is SERIAL on purpose, and this timeout is what makes serial safe. CC runs a
/// hook synchronously, so one session's events reach us as ordered, non-overlapping
/// connections, and the status machine relies on that order (a `Stop` vs. the next
/// `UserPromptSubmit`). A thread per connection could reorder two connections accepted
/// microseconds apart. Without a timeout, though, one client that never closes (seen
/// live: a channel forwarded from a remote host that delivered its line and then hung)
/// blocks the loop for every session on the machine. 128 more connections then queue in
/// the kernel's listen backlog, and every hook after that fails to connect.
///
/// It is an IDLE timeout per read, not a cap on the connection: a hook writes its one line
/// right after connecting (local hooks read their whole payload BEFORE connecting), so only
/// a stalled client ever reaches it. A line already received is delivered before the close.
pub const HOOK_READ_TIMEOUT: Duration = Duration::from_secs(2);

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

    // ---- M9 WP2 time-analytics fields (consumed by `time_store`, NOT the status
    // machine — `event_to_state` reads none of these). All snake_case verbatim, all
    // optional/`#[serde(default)]`, each present only on its own event(s). See
    // `docs/product/wp1-time-analytics-probe-outcome.md` §(d). ----
    /// Length (chars) of the user prompt — present only on `UserPromptSubmit`.
    /// **PRIVACY INVARIANT: length only, never the prompt text.** The Perl hook
    /// forwards `length($prompt)` here; the full `prompt` (above) is kept only for
    /// the status snippet and never reaches a time-analytics row.
    #[serde(default)]
    pub prompt_length_chars: Option<u64>,
    /// CC's tool-use id — present on `PreToolUse` / `PostToolUse` /
    /// `PostToolUseFailure`. The pairing key the reclassifier uses to compute a
    /// tool's duration (Pre→Post interval).
    #[serde(default)]
    pub tool_use_id: Option<String>,
    /// Tool name — present on `PreToolUse` / `PostToolUse` / `PostToolUseFailure`
    /// (CC's `tool_name`). Used for per-tool rollups.
    #[serde(default)]
    pub tool_name: Option<String>,
    /// Subagent type — present on `SubagentStart` / `SubagentStop` (CC sends it as
    /// `subagent_type`; the hook forwards it under `agent_type`). Pairs subagent
    /// start/stop intervals FIFO and labels subagent segments.
    #[serde(default)]
    pub agent_type: Option<String>,
    /// Session `source` tag — present on `SessionStart` (e.g. `startup`/`resume`).
    #[serde(default)]
    pub source: Option<String>,
    /// Session-end `reason` tag — present on `SessionEnd` (M9 WP6.5; e.g.
    /// `prompt_input_exit` on `/exit`, `other` on SIGTERM — live-captured 2026-07-08).
    /// The session-end model honors `SessionEnd` as an authoritative end; this tag is
    /// persisted to the row `meta` for debugging (the derivation does not branch on it
    /// in v1). Enum-ish tag, never content.
    #[serde(default)]
    pub reason: Option<String>,

    /// How many backgrounded jobs were still outstanding at turn end — present only on
    /// `Stop` (M13.5 WP2). `Some(0)` means "turn ended, nothing outstanding"; `Some(n>0)`
    /// means CC handed control back while work continues, which is the
    /// [`WorkspaceState::BackgroundWork`](crate::status_broadcaster::WorkspaceState)
    /// signal.
    ///
    /// **A COUNT, never the tasks.** CC's `Stop` payload carries a full
    /// `background_tasks: [{id, type, status, description, command}]` array, but
    /// `command`/`description` are arbitrary user shell text — the same privacy class as
    /// the raw prompt. The hook forwards only the length of that array (mirroring
    /// `prompt_length_chars`), which is strictly sufficient: the status machine asks only
    /// "is any work outstanding".
    ///
    /// ⚠️ `background_tasks` is **UNDOCUMENTED** in CC's public hooks reference (checked
    /// directly during M13.5 WP2 research). Treat it as a stale-able seam: `None` and `0`
    /// are handled identically, and the Perl side maps a missing or non-array value to
    /// `0`, so a CC-side change degrades to the pre-M13.5 behaviour rather than breaking
    /// the dot.
    #[serde(default)]
    pub background_task_count: Option<u64>,
    /// `Stop` only (M16.5 WP1): the `type` of each outstanding background task, in the
    /// payload's order (`"shell"`, …; `"?"` where CC sent no scalar type). A type is an
    /// enum-ish tag, so it is forwarded where `command`/`description` are not. Since M16.5
    /// WP4 `event_to_state` reads it: a `"monitor"` task (an artifact watch) is not work
    /// (`status_broadcaster::stop_leaves_background_work`).
    #[serde(default)]
    pub background_task_types: Option<Vec<String>>,

    /// M17 WP4 (AC-2.3): `hash8(host)` for an event from a REMOTE host's hook; `None` for a
    /// local one. The registry routes on it ([`crate::status_broadcaster::WorkspaceRegistry`]),
    /// and `time_store` refuses any event that carries it. An empty string reads as `None`
    /// (the same rule `session_id` follows downstream): an empty origin names no host.
    #[serde(default, deserialize_with = "empty_as_none")]
    pub origin: Option<String>,
}

/// `""` → `None` (M17 WP4). Absent is handled by `#[serde(default)]`; this sees present values.
fn empty_as_none<'de, D>(d: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v: Option<String> = Option::deserialize(d)?;
    Ok(v.filter(|s| !s.is_empty()))
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
/// don't read; `Timeout=>1` covers connect, not write). A connection that goes silent
/// without closing is dropped after [`HOOK_READ_TIMEOUT`], so it can hold the loop for
/// at most that long (see the constant for why the loop stays serial). A parse error on any line
/// is logged and skipped — the loop never panics and never breaks (a single
/// garbage line must not deafen the channel). Each parsed [`HookEvent`] is sent on
/// `tx`; a closed receiver (`SendError`) means the core is shutting down, so the
/// loop exits cleanly.
///
/// Single-consumer wrapper over [`spawn_listener_fanout`] — the historical M3
/// contract (one receiver). Returns the [`thread::JoinHandle`] so the caller can hold
/// it (or detach it).
///
/// `#[cfg(test)]`: production wires two consumers via [`spawn_listener_fanout`] (M9 WP2
/// Phase 3), so the single-sender form now has only test callers (the hook_socket +
/// broadcaster end-to-end tests). Kept as a convenience so those tests read cleanly.
#[cfg(test)]
pub fn spawn_listener(listener: UnixListener, tx: Sender<HookEvent>) -> thread::JoinHandle<()> {
    spawn_listener_fanout(listener, vec![tx], None)
}

/// Fan-out variant (M9 WP2 Phase 3): send each parsed [`HookEvent`] to **every**
/// sender in `txs` (a clone per sender — `HookEvent` is cheap to clone). This is the
/// tee that lets one socket stream feed BOTH the status broadcaster AND the
/// time-analytics writer, each holding its own single-consumer `mpsc::Receiver` (so
/// each consumer's semantics — blocking `recv`, clean-exit-on-drop — are unchanged;
/// only the send side multiplexes). A sender whose receiver has dropped is removed
/// from the set; the loop exits only once **all** receivers are gone (so tearing down
/// one consumer never deafens the other). Empty `txs` → the loop exits immediately.
///
/// `log` receives a `HOOKSOCK read-timeout` line whenever a connection is dropped for
/// silence (the production caller passes the per-identity `status-channel.log`).
pub fn spawn_listener_fanout(
    listener: UnixListener,
    txs: Vec<Sender<HookEvent>>,
    log: Option<StatusLog>,
) -> thread::JoinHandle<()> {
    thread::Builder::new()
        .name("claudesk-hook-socket".into())
        .spawn(move || accept_loop(listener, txs, HOOK_READ_TIMEOUT, log))
        .expect("failed to spawn hook-socket accept thread")
}

/// The accept-loop body — extracted so it reads top-to-bottom. Mirrors the WP1
/// probe's structure: accept → `BufReader::lines()` → trim-empty-skip → parse →
/// fan-out-send. Accept errors are logged and the loop continues (one bad accept must
/// not kill the listener); the loop ends only when EVERY sender's receiver has dropped
/// (all consumers gone). `read_timeout` is injected so tests need not wait the production
/// [`HOOK_READ_TIMEOUT`].
fn accept_loop(
    listener: UnixListener,
    mut txs: Vec<Sender<HookEvent>>,
    read_timeout: Duration,
    log: Option<StatusLog>,
) {
    if txs.is_empty() {
        return; // no consumers — nothing to deliver to.
    }
    for conn in listener.incoming() {
        let stream = match conn {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[claudesk] hook-socket accept error: {e}");
                continue;
            }
        };
        // ⚠️ Bound every read: a client that never closes must not hold the loop (see
        // HOOK_READ_TIMEOUT). Failing to set it leaves this one connection unbounded,
        // which is today's behaviour, so it is logged rather than fatal.
        if let Err(e) = stream.set_read_timeout(Some(read_timeout)) {
            if !peer_already_closed(&e) {
                eprintln!("[claudesk] hook-socket set_read_timeout failed: {e}");
            }
        }
        // Kept to name the peer if the connection times out (the reader owns the stream).
        let peer = stream.try_clone().ok();
        let mut delivered: u64 = 0;
        let mut last_activity = Instant::now();
        // Drain the whole connection promptly (read every line before looping)
        // so the hook's blocking write returns immediately — never block CC.
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            let raw = match line {
                Ok(l) => l,
                Err(e) if is_timeout(&e) => {
                    // Silent past the timeout: name the client and move on.
                    if let Some(log) = &log {
                        let (pid, name) = peer.as_ref().map_or((None, None), peer_info);
                        log.write_line(&format_hooksock_timeout_line(
                            now_ms(),
                            pid,
                            name.as_deref(),
                            delivered,
                            last_activity.elapsed().as_millis(),
                        ));
                    }
                    break;
                }
                Err(e) => {
                    eprintln!("[claudesk] hook-socket read error: {e}");
                    break; // connection broken — move to the next accept
                }
            };
            last_activity = Instant::now();
            if raw.trim().is_empty() {
                continue;
            }
            delivered += 1;
            match parse_line(&raw) {
                Ok(event) => {
                    // Fan out: send a clone to each live sender; drop any whose
                    // receiver has gone. `retain` keeps only senders that accepted
                    // the event. When the LAST receiver drops, `txs` empties and the
                    // loop exits cleanly (one consumer tearing down never deafens the
                    // other — that is the whole point of the fan-out).
                    txs.retain(|tx| tx.send(event.clone()).is_ok());
                    if txs.is_empty() {
                        // All consumers gone → nothing more to deliver. Exit cleanly.
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

/// `set_read_timeout` failed because the client had ALREADY CLOSED before we accepted.
///
/// ⚠️ This is the COMMON case, not an edge: a local hook connects, writes its line and closes
/// within a millisecond, so by `accept()` it is usually gone, and macOS's `setsockopt` then
/// returns `EINVAL` (found live at verify-self 2026-11-27: one stderr line per event). The
/// buffered line still reads and EOF follows, so the connection cannot stall the loop and
/// needs no timeout. Any other error is still reported.
fn peer_already_closed(e: &std::io::Error) -> bool {
    e.raw_os_error() == Some(libc::EINVAL)
}

/// A read that hit the socket's `SO_RCVTIMEO`. macOS reports it as `EAGAIN`
/// (`WouldBlock`); `TimedOut` is accepted too so the check does not hinge on one errno.
fn is_timeout(e: &std::io::Error) -> bool {
    matches!(
        e.kind(),
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
    )
}

/// The connected client's pid and process name, best-effort (`None` where unreadable).
/// Read only when a connection times out, while the client still holds it open, so the
/// hot path pays nothing. A local hook reads as `perl`; a channel forwarded from a remote
/// host reads as the local `ssh` process that carries it.
fn peer_info(stream: &UnixStream) -> (Option<i32>, Option<String>) {
    let pid = peer_pid(stream);
    (pid, pid.and_then(process_name))
}

/// `getsockopt(SOL_LOCAL, LOCAL_PEERPID)`: the pid of the process that connected.
fn peer_pid(stream: &UnixStream) -> Option<i32> {
    use std::os::fd::AsRawFd;
    let mut pid: libc::pid_t = 0;
    let mut len = libc::socklen_t::try_from(std::mem::size_of::<libc::pid_t>()).ok()?;
    // SAFETY: the fd is a live AF_UNIX socket owned by `stream` for this call; `pid` and
    // `len` are valid for writes and `len` holds `pid`'s exact size, so the kernel writes at
    // most that many bytes into it.
    let rc = unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_LOCAL,
            libc::LOCAL_PEERPID,
            std::ptr::addr_of_mut!(pid).cast(),
            &mut len,
        )
    };
    (rc == 0 && pid > 0).then_some(pid)
}

/// `proc_name(pid)`: the short process name (at most 32 bytes), or `None`.
fn process_name(pid: i32) -> Option<String> {
    let mut buf = [0u8; 64];
    let cap = u32::try_from(buf.len()).ok()?;
    // SAFETY: `buf` is valid for `cap` bytes of writes, and `proc_name` writes at most
    // `cap` bytes, returning how many it wrote (or <= 0 on failure).
    let n = unsafe { libc::proc_name(pid, buf.as_mut_ptr().cast(), cap) };
    let n = usize::try_from(n)
        .ok()
        .filter(|&n| n > 0 && n <= buf.len())?;
    Some(String::from_utf8_lossy(&buf[..n]).into_owned())
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

    // ---- M9 WP2: the 10-event / time-analytics wire fields ----

    #[test]
    fn parses_user_prompt_submit_length_only_field() {
        // The privacy invariant on the wire: UserPromptSubmit carries
        // `prompt_length_chars` (int) IN ADDITION TO `prompt` (kept for the status
        // snippet). The time-store path reads the length; the raw text never reaches
        // a row. Pin the length field deserializes into Option<u64> from snake_case.
        let line = r#"{"hook_event_name":"UserPromptSubmit","session_id":"s","cwd":"/p","prompt":"hello world","prompt_length_chars":11}"#;
        let ev = parse_line(line).unwrap();
        assert_eq!(ev.prompt_length_chars, Some(11));
        assert_eq!(ev.prompt.as_deref(), Some("hello world")); // status snippet still present
    }

    #[test]
    fn parses_pre_and_post_tool_use_pairing_fields() {
        // PreToolUse / PostToolUse / PostToolUseFailure carry tool_name + tool_use_id;
        // the reclassifier pairs Pre↔Post by tool_use_id to get a tool duration.
        let pre = r#"{"hook_event_name":"PreToolUse","session_id":"s","cwd":"/p","tool_name":"Edit","tool_use_id":"tu_123"}"#;
        let ev = parse_line(pre).unwrap();
        assert_eq!(ev.hook_event_name, "PreToolUse");
        assert_eq!(ev.tool_name.as_deref(), Some("Edit"));
        assert_eq!(ev.tool_use_id.as_deref(), Some("tu_123"));

        let fail = r#"{"hook_event_name":"PostToolUseFailure","session_id":"s","cwd":"/p","tool_name":"Bash","tool_use_id":"tu_9"}"#;
        let ev = parse_line(fail).unwrap();
        assert_eq!(ev.hook_event_name, "PostToolUseFailure");
        assert_eq!(ev.tool_name.as_deref(), Some("Bash"));
        assert_eq!(ev.tool_use_id.as_deref(), Some("tu_9"));
    }

    #[test]
    fn parses_subagent_and_session_fields() {
        let sub = r#"{"hook_event_name":"SubagentStart","session_id":"s","cwd":"/p","agent_type":"Explore"}"#;
        let ev = parse_line(sub).unwrap();
        assert_eq!(ev.hook_event_name, "SubagentStart");
        assert_eq!(ev.agent_type.as_deref(), Some("Explore"));

        let ses =
            r#"{"hook_event_name":"SessionStart","session_id":"s","cwd":"/p","source":"startup"}"#;
        let ev = parse_line(ses).unwrap();
        assert_eq!(ev.hook_event_name, "SessionStart");
        assert_eq!(ev.source.as_deref(), Some("startup"));

        // SessionEnd with no reason — parses cleanly, all time fields (incl. reason) None.
        let end = r#"{"hook_event_name":"SessionEnd","session_id":"s","cwd":"/p"}"#;
        let ev = parse_line(end).unwrap();
        assert_eq!(ev.hook_event_name, "SessionEnd");
        assert_eq!(ev.agent_type, None);
        assert_eq!(ev.source, None);
        assert_eq!(ev.tool_use_id, None);
        assert_eq!(ev.reason, None);
    }

    /// M17 WP4 (AC-2.3): a remote line carries `origin`; a local line has no key; an empty
    /// value names no host, so it reads as absent (a mutant that keeps `""` makes a local
    /// event look remote and routes it nowhere).
    #[test]
    fn origin_parses_and_an_empty_one_reads_as_absent() {
        let remote = parse_line(
            r#"{"hook_event_name":"Stop","session_id":"s","cwd":"/p","origin":"a1b2c3d4"}"#,
        )
        .unwrap();
        assert_eq!(remote.origin.as_deref(), Some("a1b2c3d4"));
        let local = parse_line(STOP_LINE).unwrap();
        assert_eq!(local.origin, None);
        let empty =
            parse_line(r#"{"hook_event_name":"Stop","session_id":"s","cwd":"/p","origin":""}"#)
                .unwrap();
        assert_eq!(empty.origin, None);
        let null =
            parse_line(r#"{"hook_event_name":"Stop","session_id":"s","cwd":"/p","origin":null}"#)
                .unwrap();
        assert_eq!(null.origin, None);
    }

    #[test]
    fn parses_session_end_reason_field() {
        // M9 WP6.5: SessionEnd carries a `reason` tag (the shape the updated
        // claudesk-hook.pl emits — see tests/hook_pl_output.rs::session_end_emits_reason,
        // live-captured values prompt_input_exit / other). Pin that the snake_case key
        // deserializes into the Option<String> field — the emit→parse→persist chain link
        // between the Perl hook and event_to_row's meta write.
        let line = r#"{"hook_event_name":"SessionEnd","session_id":"s","cwd":"/p","reason":"prompt_input_exit"}"#;
        let ev = parse_line(line).unwrap();
        assert_eq!(ev.hook_event_name, "SessionEnd");
        assert_eq!(ev.reason.as_deref(), Some("prompt_input_exit"));
    }

    #[test]
    fn time_analytics_fields_default_absent_on_status_events() {
        // A plain Stop line (no time-analytics fields) leaves all of them None —
        // the #[serde(default)] path, so one struct still parses every event kind.
        let ev = parse_line(STOP_LINE).unwrap();
        assert_eq!(ev.prompt_length_chars, None);
        assert_eq!(ev.tool_use_id, None);
        assert_eq!(ev.tool_name, None);
        assert_eq!(ev.agent_type, None);
        assert_eq!(ev.source, None);
    }

    #[test]
    fn time_analytics_fields_are_snake_case_verbatim() {
        // Guard the new fields against a camelCase drift the same way the core fields
        // are guarded: camelCase keys must NOT populate the snake_case fields.
        let camel = r#"{"hook_event_name":"PreToolUse","session_id":"s","cwd":"/p","toolName":"Edit","toolUseId":"tu_1","agentType":"X","promptLengthChars":5}"#;
        let ev = parse_line(camel).unwrap();
        assert_eq!(
            ev.tool_name, None,
            "toolName (camel) must not populate tool_name"
        );
        assert_eq!(ev.tool_use_id, None);
        assert_eq!(ev.agent_type, None);
        assert_eq!(ev.prompt_length_chars, None);
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

        let handle =
            thread::spawn(move || accept_loop(listener, vec![tx], HOOK_READ_TIMEOUT, None));

        let mut client = UnixStream::connect(&path).unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"Stop\",\"session_id\":\"s\",\"cwd\":\"/p\"}\n")
            .unwrap();
        // Best-effort: the server may already have closed the connection (that is the race
        // this test exercises), so `shutdown` can fail with NotConnected. The assertion that
        // matters is the `join` below. No sleep — it would only move the race.
        let _ = client.shutdown(std::net::Shutdown::Both);

        // The loop should return (the send fails on the dropped receiver) rather
        // than hang or panic — join completes.
        handle.join().expect("accept-loop thread must not panic");
    }

    // ---- M9 WP2 Phase 3: fan-out (one stream → two consumers) ----

    #[test]
    fn fanout_delivers_every_event_to_both_consumers() {
        // The core fan-out property: one socket stream, two receivers, each gets a
        // clone of EVERY event. This is what lets the status broadcaster and the
        // time-analytics writer both drain the same hook stream.
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("hook.sock");
        let listener = bind_listener(&path).unwrap();
        let (status_tx, status_rx) = mpsc::channel::<HookEvent>();
        let (time_tx, time_rx) = mpsc::channel::<HookEvent>();
        let handle = spawn_listener_fanout(listener, vec![status_tx, time_tx], None);

        let mut client = UnixStream::connect(&path).unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"s\",\"cwd\":\"/p\",\"prompt\":\"go\"}\n")
            .unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"Stop\",\"session_id\":\"s\",\"cwd\":\"/p\"}\n")
            .unwrap();
        client.shutdown(std::net::Shutdown::Both).unwrap();

        // BOTH consumers receive BOTH events, in order.
        for rx in [&status_rx, &time_rx] {
            let first = rx.recv_timeout(Duration::from_secs(5)).unwrap();
            assert_eq!(first.hook_event_name, "UserPromptSubmit");
            let second = rx.recv_timeout(Duration::from_secs(5)).unwrap();
            assert_eq!(second.hook_event_name, "Stop");
        }
        drop((status_rx, time_rx));
        drop(handle);
    }

    #[test]
    fn fanout_survives_one_consumer_dropping() {
        // Independence invariant: if ONE consumer's receiver drops, the OTHER keeps
        // receiving (the loop only exits when ALL receivers are gone). This is why
        // tearing down the time-store writer can never deafen the status dots.
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("hook.sock");
        let listener = bind_listener(&path).unwrap();
        let (status_tx, status_rx) = mpsc::channel::<HookEvent>();
        let (time_tx, time_rx) = mpsc::channel::<HookEvent>();
        let handle = spawn_listener_fanout(listener, vec![status_tx, time_tx], None);

        // Drop the time consumer up front — the status consumer must still work.
        drop(time_rx);

        let mut client = UnixStream::connect(&path).unwrap();
        client
            .write_all(
                b"{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"s\",\"cwd\":\"/p\"}\n",
            )
            .unwrap();
        client
            .write_all(b"{\"hook_event_name\":\"Stop\",\"session_id\":\"s\",\"cwd\":\"/p\"}\n")
            .unwrap();
        client.shutdown(std::net::Shutdown::Both).unwrap();

        // The surviving (status) consumer still gets both events.
        let first = status_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(first.hook_event_name, "UserPromptSubmit");
        let second = status_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(second.hook_event_name, "Stop");

        drop(status_rx);
        drop(handle);
    }

    // ---- 2026-11-27: one stuck connection must not deafen every session ----

    /// Short stand-in for [`HOOK_READ_TIMEOUT`] so the tests stay fast.
    const TEST_READ_TIMEOUT: Duration = Duration::from_millis(200);

    /// Write one event line for session `sid` on `client`.
    fn send_event(client: &mut UnixStream, event: &str, sid: &str) {
        let line = format!(
            "{{\"hook_event_name\":\"{event}\",\"session_id\":\"{sid}\",\"cwd\":\"/p\"}}\n"
        );
        client.write_all(line.as_bytes()).unwrap();
    }

    /// The live failure (prod, 2026-11-27): a forwarded channel delivered its line and never
    /// closed, and the serial loop waited on it for 39 minutes while every other session's
    /// events queued and then failed to connect. With the read timeout, a second client's
    /// event arrives while the first connection is STILL open. Without it, the
    /// `recv_timeout` below expires (bounded, so a regression fails instead of hanging).
    #[test]
    fn a_connection_that_never_closes_does_not_deafen_the_next_client() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("hook.sock");
        let listener = bind_listener(&path).unwrap();
        let (tx, rx) = mpsc::channel::<HookEvent>();
        thread::spawn(move || accept_loop(listener, vec![tx], TEST_READ_TIMEOUT, None));

        // Client A sends one line and then holds the connection open.
        let mut held = UnixStream::connect(&path).unwrap();
        send_event(&mut held, "PreToolUse", "held");
        let first = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(
            first.session_id, "held",
            "the held client's line is delivered"
        );

        // Client B connects and writes while A is still open.
        let mut next = UnixStream::connect(&path).unwrap();
        send_event(&mut next, "Stop", "next");
        let _ = next.shutdown(std::net::Shutdown::Both);
        let second = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("a held-open connection deafened the listener to the next client");
        assert_eq!(second.session_id, "next");
        assert_eq!(second.hook_event_name, "Stop");

        drop(held); // only now does client A close
    }

    /// The PRODUCTION entry point wires the real timeout and the log: `spawn_listener_fanout`
    /// (what `start_on_launch` calls) must drop a silent connection after
    /// [`HOOK_READ_TIMEOUT`] (2 s, operator-confirmed 2026-11-27) and record it. The other
    /// tests inject a short timeout into `accept_loop`, so they cannot see this wiring.
    #[test]
    fn the_production_listener_times_out_a_silent_client_at_two_seconds_and_logs_it() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("hook.sock");
        let listener = bind_listener(&path).unwrap();
        let log = StatusLog::new(dir.path());
        let log_path = log.path().to_path_buf();
        let (tx, rx) = mpsc::channel::<HookEvent>();
        let _handle = spawn_listener_fanout(listener, vec![tx], Some(log));

        let held = UnixStream::connect(&path).unwrap(); // connects, never writes
        let mut next = UnixStream::connect(&path).unwrap();
        send_event(&mut next, "Stop", "after-the-stall");
        let _ = next.shutdown(std::net::Shutdown::Both);
        let ev = rx
            .recv_timeout(Duration::from_secs(10))
            .expect("the production listener stayed deaf behind a silent client");
        assert_eq!(ev.session_id, "after-the-stall");

        let text = std::fs::read_to_string(&log_path).unwrap_or_default();
        let line = text
            .lines()
            .find(|l| l.contains("HOOKSOCK read-timeout"))
            .unwrap_or_else(|| panic!("no timeout line logged; log was: {text:?}"));
        let idle: u128 = line
            .split(" idle_ms=")
            .nth(1)
            .and_then(|v| v.trim().parse().ok())
            .unwrap_or_else(|| panic!("no idle_ms in {line}"));
        assert!(
            (2000..3000).contains(&idle),
            "the production timeout is 2 s; idle_ms={idle} in {line}"
        );
        drop(held);
    }

    /// The common local-hook shape: the client is gone before `accept()`. macOS then refuses
    /// the timeout with `EINVAL`, which must classify as benign (no stderr line per event),
    /// and the line it sent must still read normally.
    #[test]
    fn a_client_closed_before_accept_refuses_the_timeout_benignly_and_still_delivers() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("hook.sock");
        let listener = bind_listener(&path).unwrap();
        let mut client = UnixStream::connect(&path).unwrap();
        send_event(&mut client, "Stop", "gone");
        drop(client); // closed before the server accepts

        let (stream, _) = listener.accept().unwrap();
        let err = stream
            .set_read_timeout(Some(TEST_READ_TIMEOUT))
            .expect_err("macOS refuses SO_RCVTIMEO on a socket whose peer already closed");
        assert!(
            peer_already_closed(&err),
            "must classify as benign: {err:?}"
        );
        assert!(!peer_already_closed(&std::io::Error::from_raw_os_error(
            libc::EBADF
        )));

        let mut line = String::new();
        BufReader::new(stream).read_line(&mut line).unwrap();
        assert!(
            line.contains("\"session_id\":\"gone\""),
            "line still delivered: {line}"
        );
    }

    /// The timeout leaves a record naming the client, so the next stall is explainable from
    /// the log alone. The test process IS the peer, so `peer_pid` must be our own pid, and
    /// the name must resolve (`peer=?` means the lookup failed).
    #[test]
    fn a_timed_out_connection_is_logged_with_its_peer() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("hook.sock");
        let listener = bind_listener(&path).unwrap();
        let log = StatusLog::new(dir.path());
        let log_path = log.path().to_path_buf();
        let (tx, rx) = mpsc::channel::<HookEvent>();
        thread::spawn(move || accept_loop(listener, vec![tx], TEST_READ_TIMEOUT, Some(log)));

        let mut held = UnixStream::connect(&path).unwrap();
        send_event(&mut held, "PreToolUse", "held");
        rx.recv_timeout(Duration::from_secs(5)).unwrap();

        // Poll (bounded) for the timeout line; the connection stays open throughout.
        let deadline = Instant::now() + Duration::from_secs(5);
        let line = loop {
            let text = std::fs::read_to_string(&log_path).unwrap_or_default();
            if let Some(l) = text.lines().find(|l| l.contains("HOOKSOCK read-timeout")) {
                break l.to_string();
            }
            assert!(
                Instant::now() < deadline,
                "no HOOKSOCK read-timeout line was logged"
            );
            thread::sleep(Duration::from_millis(20));
        };
        assert!(
            line.contains(&format!(" peer_pid={} ", std::process::id())),
            "peer_pid must be the connecting process: {line}"
        );
        assert!(!line.contains(" peer=? "), "peer name must resolve: {line}");
        assert!(
            line.contains(" lines=1 "),
            "one line was delivered first: {line}"
        );
        assert!(
            line.split(' ').next().unwrap().parse::<i64>().unwrap() > 0,
            "the line leads with a wall-clock ms stamp: {line}"
        );
        drop(held);
    }
}
