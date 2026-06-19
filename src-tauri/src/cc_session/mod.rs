//! Embedded Claude Code session — PTY-backed CC running inside a workspace.
//!
//! WP7. Replaces the WP5 mock terminal with a real `claude --dangerously-skip-permissions`
//! process spawned in a `portable-pty` (the WP2-proven mechanism), bridged to the
//! frontend xterm.js pane via Tauri events.
//!
//! ## Layout (mirrors `config_store/`'s pure-core / IPC-shell split)
//! - **[`CcSession`] trait** — Claudesk's stable seam for "how we drive CC"
//!   (`docs/product/arch.md:110`, `CLAUDE.md` → "`CcSession` trait is a stable
//!   seam"). Phase 1 has the one impl, [`PtyCcSession`]; Phase 2 will add
//!   `state_events()` + `recycle()`; a future `SdkCcSession` could swap in.
//! - **[`PtyCcSession`]** — the concrete `portable-pty` impl. A reader thread pumps
//!   PTY output → base64 → a `cc-output-<sid>` Tauri event; on EOF it emits
//!   `cc-exit-<sid>`. Input/resize/kill go through the master handle.
//! - **[`SessionRegistry`]** — owns the live sessions keyed by id. Its id-minting
//!   and insert/get/remove logic is unit-testable without spawning a real `claude`.
//! - **[`commands`]** — thin Tauri command wrappers (the only IPC surface); resolve
//!   the registry from `State`, map [`CcError`] → `String` for IPC.
//!
//! ## Load-bearing constraint (`SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF`)
//! CC's TUI runs in raw mode: `\n` (LF) is a literal character, `\r` (CR, `0x0d`)
//! is Enter. Every Claudesk-originated slash command MUST end in `\r`.
//! [`slash_command_bytes`] is the single helper that enforces this; the shutdown
//! path (`/exit\r`) and any Phase 2 injection go through it.

pub mod commands;

use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine as _;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};
use thiserror::Error;

/// The external CLI Claudesk drives.
const CC_CMD: &str = "claude";
/// Yolo mode by default (`docs/product/arch.md` Key Decisions). A Phase 4 setting
/// will let the user opt out.
const CC_ARG_YOLO: &str = "--dangerously-skip-permissions";
/// Chunk size for the PTY reader. WP2 saw multi-KB redraws; 4 KB matches the probe.
const READ_CHUNK: usize = 4096;

/// User-facing guidance shown when `claude` is not on `PATH`. The frontend overlay
/// renders this verbatim, so it must read as actionable help, not an OS error code.
const CC_NOT_FOUND_MSG: &str = "Claude Code (`claude`) was not found on your PATH. \
Install it and make sure `claude` runs in your shell, then click Retry. \
Install docs: https://docs.claude.com/en/docs/claude-code/setup";

/// Errors crossing the `cc_session` boundary. Tauri commands map these to `String`.
#[derive(Debug, Error)]
pub enum CcError {
    /// `claude` is not on `PATH`. Carries the friendly, actionable guidance the
    /// frontend overlay shows verbatim (NOT a raw `os error 2`). The single
    /// most-common spawn failure on a fresh machine, so it gets its own variant.
    #[error("{0}")]
    CcNotFound(String),
    /// `claude` could not be spawned for some other reason (pty open failed, etc.).
    #[error("failed to spawn Claude Code: {0}")]
    Spawn(String),
    /// No live session with the given id (already exited, or never existed).
    #[error("no such session: {0}")]
    UnknownSession(String),
    /// A write/resize/kill on the PTY failed.
    #[error("PTY I/O error: {0}")]
    Io(String),
    /// The registry mutex was poisoned (a holder panicked).
    #[error("session registry lock poisoned")]
    Lock,
}

/// Map a raw spawn-failure string to the right [`CcError`].
///
/// `portable_pty::spawn_command` surfaces a missing binary as an opaque error whose
/// message embeds the underlying OS "not found" text (on macOS: `No such file or
/// directory (os error 2)`). Showing that raw string to the user is useless; this
/// classifier promotes the not-found case to [`CcError::CcNotFound`] with actionable
/// guidance, and leaves every other spawn failure as [`CcError::Spawn`]. Pure (string
/// in, error out) so it is unit-testable without spawning a real `claude`.
fn classify_spawn_error(raw: &str) -> CcError {
    let lower = raw.to_lowercase();
    // macOS/Linux: "No such file or directory" / "os error 2"; be liberal so a
    // portable-pty message-shape change doesn't silently regress to the raw string.
    if lower.contains("no such file or directory")
        || lower.contains("os error 2")
        || lower.contains("not found")
        || lower.contains("cannot find")
    {
        CcError::CcNotFound(CC_NOT_FOUND_MSG.to_string())
    } else {
        CcError::Spawn(raw.to_string())
    }
}

/// Compose the bytes for a slash command, enforcing the CR-not-LF rule.
///
/// CC's raw-mode TUI treats `\n` as a literal character and `\r` (CR, `0x0d`) as
/// Enter — so a command must end in CR to actually execute. Writing `/cmd\n`
/// silently types-but-doesn't-run (`SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF`).
/// This is the single chokepoint for that rule; callers never hand-append the
/// terminator.
pub fn slash_command_bytes(command: &str) -> Vec<u8> {
    // Strip any caller-supplied trailing newline/CR so we don't double-terminate,
    // then append exactly one CR.
    let trimmed = command.trim_end_matches(['\r', '\n']);
    let mut bytes = trimmed.as_bytes().to_vec();
    bytes.push(b'\r');
    bytes
}

/// Claudesk's seam for driving a Claude Code session. Never bypass this trait when
/// talking to CC (`CLAUDE.md`). Phase 2 extends it with `state_events()` (hook-channel
/// status fan-out) and `recycle()` (Recycle Session) — reserved here, not implemented.
pub trait CcSession: Send {
    /// Write raw bytes to the PTY (xterm keystrokes, or `slash_command_bytes(..)`).
    fn send_input(&self, bytes: &[u8]) -> Result<(), CcError>;
    /// Resize the PTY (propagates SIGWINCH; CC redraws). WP2-confirmed.
    fn resize(&self, cols: u16, rows: u16) -> Result<(), CcError>;
    /// Terminate the session: `/exit\r` first, then SIGKILL after a grace window.
    fn kill(&self) -> Result<(), CcError>;

    // --- Phase 2 forward-look (NOT implemented in Phase 1) ---
    // fn state_events(&self) -> Receiver<WorkspaceStatusUpdate>;  // hook-channel status
    // fn recycle(&self) -> Result<(), CcError>;                   // Recycle Session
}

/// A live CC process in a `portable-pty`. Holds the master end (for resize), a
/// single writer (for input), and the child handle (for kill).
pub struct PtyCcSession {
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
}

impl PtyCcSession {
    /// Spawn `claude --dangerously-skip-permissions` with `cwd = project_path` and
    /// start the reader thread that streams output to `cc-output-<id>` events.
    ///
    /// `TERM`/`COLORTERM` are set explicitly: WP2 ran under a terminal that exported
    /// `TERM`, but a Tauri app has none, so CC would not detect a color TTY without
    /// this (`wp2-cc-pty-probe.md:67,176`).
    fn spawn(app: AppHandle, id: String, project_path: &str) -> Result<Self, CcError> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| CcError::Spawn(e.to_string()))?;

        let mut cmd = CommandBuilder::new(CC_CMD);
        cmd.arg(CC_ARG_YOLO);
        cmd.cwd(project_path);
        // Make CC believe it's on a color-capable TTY (no inherited TERM here).
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = pair
            .slave
            .spawn_command(cmd)
            // The "claude not on PATH" case lands here — classify so the user sees
            // actionable guidance, not a bare `os error 2`.
            .map_err(|e| classify_spawn_error(&e.to_string()))?;
        // The child owns the slave end now; drop ours so EOF propagates on exit.
        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| CcError::Spawn(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| CcError::Spawn(e.to_string()))?;

        Self::spawn_reader_thread(app, id, reader);

        Ok(Self {
            master: pair.master,
            writer: Mutex::new(writer),
            child: Mutex::new(child),
        })
    }

    /// Pump PTY → `cc-output-<id>` (base64) until EOF, then emit `cc-exit-<id>`.
    ///
    /// Reader-thread lifecycle (same invariant the WP2 harness documents): the loop
    /// ends on `read() == 0` (EOF), which the master delivers once the child exits
    /// and the last slave handle is dropped. The thread self-terminates; no join.
    fn spawn_reader_thread(app: AppHandle, id: String, mut reader: Box<dyn std::io::Read + Send>) {
        let output_event = format!("cc-output-{id}");
        let exit_event = format!("cc-exit-{id}");
        thread::spawn(move || {
            let engine = base64::engine::general_purpose::STANDARD;
            let mut buf = [0u8; READ_CHUNK];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let encoded = engine.encode(&buf[..n]);
                        // A failed emit means the frontend went away; keep draining
                        // the PTY so the child isn't blocked on a full buffer.
                        let _ = app.emit(&output_event, encoded);
                    }
                    Err(_) => break,
                }
            }
            let _ = app.emit(&exit_event, ());
        });
    }
}

impl CcSession for PtyCcSession {
    fn send_input(&self, bytes: &[u8]) -> Result<(), CcError> {
        let mut writer = self.writer.lock().map_err(|_| CcError::Lock)?;
        writer
            .write_all(bytes)
            .map_err(|e| CcError::Io(e.to_string()))?;
        writer.flush().map_err(|e| CcError::Io(e.to_string()))?;
        Ok(())
    }

    fn resize(&self, cols: u16, rows: u16) -> Result<(), CcError> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| CcError::Io(e.to_string()))
    }

    fn kill(&self) -> Result<(), CcError> {
        // Preferred path: ask CC to exit cleanly with one deterministic CR-terminated
        // write (WP2: `/exit\r` exits in <5s, no two-keystroke race). Then poll, and
        // SIGKILL as a fallback so we never leak an orphaned `claude`.
        let _ = self.send_input(&slash_command_bytes("/exit"));

        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            {
                let mut child = self.child.lock().map_err(|_| CcError::Lock)?;
                match child.try_wait() {
                    Ok(Some(_)) => return Ok(()),
                    Ok(None) => {}
                    Err(e) => return Err(CcError::Io(e.to_string())),
                }
            }
            if Instant::now() >= deadline {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }

        // Grace window elapsed — force kill.
        let mut child = self.child.lock().map_err(|_| CcError::Lock)?;
        child.kill().map_err(|e| CcError::Io(e.to_string()))?;
        Ok(())
    }
}

/// Owns the live sessions. Registered as `State<Mutex<SessionRegistry>>` in `lib.rs`;
/// command handlers lock it to reach a session. Id minting and the map operations are
/// pure enough to unit-test without spawning `claude`.
pub struct SessionRegistry {
    next_id: usize,
    sessions: HashMap<String, Box<dyn CcSession>>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            next_id: 0,
            sessions: HashMap::new(),
        }
    }

    /// Mint the next session id (monotonic, deterministic — test-friendly, matches the
    /// `cc-<n>` shape the frontend expects, no `Date`/`random`).
    fn mint_id(&mut self) -> String {
        self.next_id += 1;
        format!("cc-{}", self.next_id)
    }

    /// Insert an already-constructed session under a fresh id, returning the id.
    /// Test-only: lets tests register a fake session without spawning a real PTY.
    #[cfg(test)]
    fn insert(&mut self, make: impl FnOnce(String) -> Box<dyn CcSession>) -> String {
        let id = self.mint_id();
        self.sessions.insert(id.clone(), make(id.clone()));
        id
    }

    /// Spawn a real CC session for `project_path` and register it.
    pub fn spawn(&mut self, app: AppHandle, project_path: &str) -> Result<String, CcError> {
        let id = self.mint_id();
        let session = PtyCcSession::spawn(app, id.clone(), project_path)?;
        self.sessions.insert(id.clone(), Box::new(session));
        Ok(id)
    }

    pub fn input(&self, id: &str, bytes: &[u8]) -> Result<(), CcError> {
        self.get(id)?.send_input(bytes)
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), CcError> {
        self.get(id)?.resize(cols, rows)
    }

    /// Kill a session and drop it from the registry. Unknown id is an error.
    pub fn kill(&mut self, id: &str) -> Result<(), CcError> {
        let session = self
            .sessions
            .remove(id)
            .ok_or_else(|| CcError::UnknownSession(id.to_string()))?;
        session.kill()
    }

    /// Kill every live session (window-close shutdown). Best-effort: a failure on one
    /// session does not stop the others. Returns the count terminated.
    pub fn kill_all(&mut self) -> usize {
        let ids: Vec<String> = self.sessions.keys().cloned().collect();
        let mut killed = 0;
        for id in ids {
            if let Some(session) = self.sessions.remove(&id) {
                if session.kill().is_ok() {
                    killed += 1;
                }
            }
        }
        killed
    }

    fn get(&self, id: &str) -> Result<&dyn CcSession, CcError> {
        self.sessions
            .get(id)
            .map(|b| b.as_ref())
            .ok_or_else(|| CcError::UnknownSession(id.to_string()))
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.sessions.len()
    }
}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    // --- slash_command_bytes: the load-bearing CR-not-LF rule ---

    #[test]
    fn slash_command_appends_cr_not_lf() {
        let bytes = slash_command_bytes("/exit");
        assert_eq!(bytes, b"/exit\r");
        // The terminator is CR (0x0d), never LF (0x0a).
        assert_eq!(*bytes.last().unwrap(), 0x0d);
        assert!(!bytes.contains(&0x0a));
    }

    #[test]
    fn slash_command_does_not_double_terminate() {
        // A caller that already appended a newline must not produce `/exit\n\r`.
        assert_eq!(slash_command_bytes("/exit\n"), b"/exit\r");
        assert_eq!(slash_command_bytes("/exit\r"), b"/exit\r");
        assert_eq!(slash_command_bytes("/exit\r\n"), b"/exit\r");
    }

    #[test]
    fn slash_command_preserves_arguments() {
        assert_eq!(slash_command_bytes("/session-resume"), b"/session-resume\r");
        assert_eq!(slash_command_bytes("/model opus"), b"/model opus\r");
    }

    // --- classify_spawn_error: friendly "claude not on PATH" mapping (P1.1) ---

    #[test]
    fn not_found_spawn_error_maps_to_cc_not_found() {
        // The exact shape portable-pty surfaces on macOS when `claude` is absent.
        let err = classify_spawn_error("No such file or directory (os error 2)");
        assert!(matches!(err, CcError::CcNotFound(_)));
        // The message must name Claude Code and point at install guidance — NOT the
        // raw OS string the user can't act on.
        let msg = err.to_string();
        assert!(msg.contains("claude"), "message should name claude: {msg}");
        assert!(msg.contains("PATH"), "message should mention PATH: {msg}");
        assert!(
            msg.contains("docs.claude.com"),
            "message should link install docs: {msg}"
        );
        assert!(
            !msg.contains("os error 2"),
            "the raw OS error must not leak through: {msg}"
        );
    }

    #[test]
    fn not_found_classification_is_case_insensitive_and_liberal() {
        // Guard against a portable-pty message-shape drift: any of these markers
        // should still be recognized as the not-found case.
        for raw in [
            "No such file or directory",
            "os error 2",
            "command not found: claude",
            "cannot find the file specified",
        ] {
            assert!(
                matches!(classify_spawn_error(raw), CcError::CcNotFound(_)),
                "expected CcNotFound for {raw:?}"
            );
        }
    }

    #[test]
    fn other_spawn_errors_stay_generic_spawn() {
        // A genuine, non-not-found failure keeps the raw detail under Spawn so we
        // don't mislabel (e.g.) a permission or pty-open failure as "not on PATH".
        let err = classify_spawn_error("permission denied (os error 13)");
        assert!(matches!(err, CcError::Spawn(_)));
        assert!(err.to_string().contains("permission denied"));
    }

    #[test]
    fn cc_not_found_ipc_string_is_the_friendly_message_verbatim() {
        // IPC contract: the command layer maps CcError → String via `to_string()`,
        // and XtermPane's error overlay renders that string verbatim. So the
        // CcNotFound `to_string()` must equal the friendly guidance with NO wrapping
        // prefix (the `#[error("{0}")]` derive guarantees this today; a future
        // `#[error("cc error: {0}")]` slip would silently reintroduce noise in the
        // overlay — this test is the guard for that user-facing invariant).
        let ipc_string = classify_spawn_error("os error 2").to_string();
        assert_eq!(ipc_string, CC_NOT_FOUND_MSG);
        // And the generic Spawn variant DOES carry its descriptive prefix (the two
        // variants are intentionally shaped differently for the overlay).
        let spawn_string = classify_spawn_error("permission denied").to_string();
        assert!(spawn_string.starts_with("failed to spawn Claude Code:"));
    }

    // --- SessionRegistry: id minting + map ops, with a fake session (no real PTY) ---

    /// A test double counting kills; never touches a PTY.
    struct FakeSession {
        killed: Arc<AtomicUsize>,
    }
    impl CcSession for FakeSession {
        fn send_input(&self, _bytes: &[u8]) -> Result<(), CcError> {
            Ok(())
        }
        fn resize(&self, _cols: u16, _rows: u16) -> Result<(), CcError> {
            Ok(())
        }
        fn kill(&self) -> Result<(), CcError> {
            self.killed.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }

    fn reg_with_fakes(n: usize) -> (SessionRegistry, Arc<AtomicUsize>, Vec<String>) {
        let killed = Arc::new(AtomicUsize::new(0));
        let mut reg = SessionRegistry::new();
        let ids = (0..n)
            .map(|_| {
                let killed = killed.clone();
                reg.insert(move |_id| Box::new(FakeSession { killed }))
            })
            .collect();
        (reg, killed, ids)
    }

    #[test]
    fn mints_monotonic_cc_ids() {
        let (_reg, _killed, ids) = reg_with_fakes(3);
        assert_eq!(ids, vec!["cc-1", "cc-2", "cc-3"]);
    }

    #[test]
    fn input_and_resize_reach_known_session() {
        let (reg, _killed, ids) = reg_with_fakes(1);
        assert!(reg.input(&ids[0], b"hi").is_ok());
        assert!(reg.resize(&ids[0], 100, 30).is_ok());
    }

    #[test]
    fn unknown_session_is_an_error() {
        let (mut reg, _killed, _ids) = reg_with_fakes(0);
        assert!(matches!(
            reg.input("cc-999", b"x"),
            Err(CcError::UnknownSession(_))
        ));
        assert!(matches!(
            reg.resize("cc-999", 80, 24),
            Err(CcError::UnknownSession(_))
        ));
        assert!(matches!(
            reg.kill("cc-999"),
            Err(CcError::UnknownSession(_))
        ));
    }

    #[test]
    fn kill_removes_session_and_invokes_kill() {
        let (mut reg, killed, ids) = reg_with_fakes(1);
        assert_eq!(reg.len(), 1);
        reg.kill(&ids[0]).unwrap();
        assert_eq!(reg.len(), 0);
        assert_eq!(killed.load(Ordering::SeqCst), 1);
        // Second kill of the same id is now unknown.
        assert!(matches!(reg.kill(&ids[0]), Err(CcError::UnknownSession(_))));
    }

    #[test]
    fn kill_all_drains_every_session() {
        let (mut reg, killed, _ids) = reg_with_fakes(4);
        assert_eq!(reg.len(), 4);
        let killed_count = reg.kill_all();
        assert_eq!(killed_count, 4);
        assert_eq!(reg.len(), 0);
        assert_eq!(killed.load(Ordering::SeqCst), 4);
    }
}
