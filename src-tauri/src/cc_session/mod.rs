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
use std::sync::{Arc, Mutex};
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
/// Fallback shell for the WP9 second-terminal panel when `$SHELL` is unset (macOS
/// default login shell since Catalina). Used by [`resolve_shell_argv`].
const DEFAULT_SHELL: &str = "/bin/zsh";

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

/// The explicit color-TTY env both the CC and shell spawns set. A Tauri app has no
/// inherited `TERM`, so the spawned process must be told it's on a color-capable TTY
/// (the WP2 finding — `wp2-cc-pty-probe.md:67,176`). Shared so the two spawn paths
/// can't drift.
fn color_tty_env() -> [(&'static str, &'static str); 2] {
    [("TERM", "xterm-256color"), ("COLORTERM", "truecolor")]
}

/// Resolve the argv for the WP9 second-terminal panel's login shell.
///
/// Prefers the user's `$SHELL` (so they get their normal prompt, aliases, and
/// rc files); falls back to [`DEFAULT_SHELL`] when it is unset or blank. The
/// shell is launched as an **interactive login** shell (`-l -i`) so it sources
/// the login + interactive rc chain (`.zprofile`/`.zshrc`, `.bash_profile`/`.bashrc`)
/// — without this an interactive panel would have a bare environment and no aliases.
///
/// Pure (env string in → argv out) so it is unit-testable without spawning a real
/// shell; the env read happens at the call site (`spawn_shell`) and is injected here.
pub fn resolve_shell_argv(env_shell: Option<String>) -> Vec<String> {
    let shell = match env_shell {
        Some(s) if !s.trim().is_empty() => s,
        _ => DEFAULT_SHELL.to_string(),
    };
    vec![shell, "-l".to_string(), "-i".to_string()]
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
    /// Frontend has attached its output listener: flush any pre-subscription backlog and
    /// switch to live streaming (closes the WP9 shell-prompt race). Idempotent.
    fn mark_ready(&self);

    // --- Phase 2 forward-look (NOT implemented in Phase 1) ---
    // fn state_events(&self) -> Receiver<WorkspaceStatusUpdate>;  // hook-channel status
    // fn recycle(&self) -> Result<(), CcError>;                   // Recycle Session
}

/// Shared between a session and its reader thread. `Some(buf)` = pre-subscription
/// BUFFERING mode (the frontend hasn't attached its `cc-output-<sid>` listener yet, so
/// the reader appends here instead of emitting into the void); `None` = LIVE mode (emit
/// straight to the Tauri event). [`PtyCcSession::mark_ready`] flips Some→None and flushes.
///
/// This closes the WP9 shell-prompt race: a shell emits its prompt exactly ONCE at
/// startup, before the frontend can subscribe (it only learns the session id after
/// `term_spawn` returns). Without buffering those bytes are lost and the pane stays blank.
/// CC happened to survive only because it emits continuously.
type OutputBacklog = Arc<Mutex<Option<Vec<String>>>>;

/// Per-chunk routing decision for the reader thread (pure, lock-scoped here so it is
/// unit-testable without a real PTY or AppHandle). If the backlog is `Some` (buffering),
/// append `chunk` there and return `None` (nothing to emit live yet). If `None` (live),
/// return `Some(chunk)` for the caller to emit. A poisoned lock returns `None` (drop).
fn route_chunk(backlog: &Mutex<Option<Vec<String>>>, chunk: String) -> Option<String> {
    match backlog.lock() {
        Ok(mut guard) => match guard.as_mut() {
            Some(pending) => {
                pending.push(chunk);
                None
            }
            None => Some(chunk),
        },
        Err(_) => None,
    }
}

/// Take the buffered backlog and flip the session to live mode (`Some`→`None`).
/// Returns the chunks to flush in order (empty if already live or never buffered).
/// Pure + lock-scoped → unit-testable without an AppHandle.
fn drain_backlog(backlog: &Mutex<Option<Vec<String>>>) -> Vec<String> {
    match backlog.lock() {
        Ok(mut guard) => guard.take().unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// A live PTY-backed process (CC, or a WP9 shell). Holds the master end (for resize),
/// a single writer (for input), the child handle (for kill), and the clean-exit
/// command to attempt before the SIGKILL fallback.
pub struct PtyCcSession {
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
    /// The command `kill()` writes (CR-terminated) to ask the process to exit cleanly
    /// before the SIGKILL grace window. `/exit` for CC's TUI; `exit` for a shell
    /// (a shell would print "command not found" for `/exit` and force the full
    /// 3s SIGKILL wait on every window close — the WP9 P1.5 decision).
    exit_command: &'static str,
    /// Pre-subscription output backlog (see [`OutputBacklog`]). Shared with the reader
    /// thread; flushed + switched to live by [`Self::mark_ready`].
    backlog: OutputBacklog,
    /// The `cc-output-<id>` event name (for flushing the backlog in `mark_ready`).
    output_event: String,
    /// Handle to emit the flushed backlog on `mark_ready`.
    app: AppHandle,
}

impl PtyCcSession {
    /// Spawn `claude --dangerously-skip-permissions` with `cwd = project_path`.
    ///
    /// Builds CC's argv + the explicit color-TTY env, then delegates to the generic
    /// [`Self::spawn_argv`] core. The `TERM`/`COLORTERM` overrides are required: WP2
    /// ran under a terminal that exported `TERM`, but a Tauri app has none, so CC
    /// would not detect a color TTY without this (`wp2-cc-pty-probe.md:67,176`).
    fn spawn(app: AppHandle, id: String, project_path: &str) -> Result<Self, CcError> {
        Self::spawn_argv(
            app,
            id,
            &[CC_CMD.to_string(), CC_ARG_YOLO.to_string()],
            project_path,
            &color_tty_env(),
            "/exit",
        )
    }

    /// Spawn the WP9 second-terminal panel's interactive login shell with
    /// `cwd = project_path`. Resolves the argv from `$SHELL` (via
    /// [`resolve_shell_argv`]) and reuses the same color-TTY env + generic
    /// [`Self::spawn_argv`] core as the CC spawn — the shared "drive a PTY process"
    /// path, so the `CcSession` seam is not bypassed (`CLAUDE.md`).
    fn spawn_shell(app: AppHandle, id: String, project_path: &str) -> Result<Self, CcError> {
        let argv = resolve_shell_argv(std::env::var("SHELL").ok());
        Self::spawn_argv(app, id, &argv, project_path, &color_tty_env(), "exit")
    }

    /// Generic PTY-process spawn core: open a pty, launch `argv` with `cwd` + `env`,
    /// and start the reader thread that streams output to `cc-output-<id>` events.
    ///
    /// This is the single chokepoint both [`Self::spawn`] (CC) and
    /// [`Self::spawn_shell`] (WP9 terminal) delegate to; the (a)-vs-(c) decision
    /// (spec WP9) was (b) — keep the public `cc_spawn` command + tests untouched while
    /// giving the internals a generic argv core. `argv[0]` is the program; the rest
    /// are args. A missing program is classified via [`classify_spawn_error`].
    fn spawn_argv(
        app: AppHandle,
        id: String,
        argv: &[String],
        cwd: &str,
        env: &[(&str, &str)],
        exit_command: &'static str,
    ) -> Result<Self, CcError> {
        let (program, args) = argv
            .split_first()
            .ok_or_else(|| CcError::Spawn("empty argv".to_string()))?;

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| CcError::Spawn(e.to_string()))?;

        let mut cmd = CommandBuilder::new(program);
        for arg in args {
            cmd.arg(arg);
        }
        cmd.cwd(cwd);
        for (k, v) in env {
            cmd.env(k, v);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            // The "claude not on PATH" (or shell-not-found) case lands here — classify
            // so the user sees actionable guidance, not a bare `os error 2`.
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

        // Start in BUFFERING mode (Some(empty)) — output accumulates here until the
        // frontend attaches its listener and calls `cc_ready` (→ mark_ready), which
        // flushes + switches to live. Closes the shell-prompt race.
        let backlog: OutputBacklog = Arc::new(Mutex::new(Some(Vec::new())));
        let output_event = format!("cc-output-{id}");

        Self::spawn_reader_thread(
            app.clone(),
            id,
            reader,
            Arc::clone(&backlog),
            output_event.clone(),
        );

        Ok(Self {
            master: pair.master,
            writer: Mutex::new(writer),
            child: Mutex::new(child),
            exit_command,
            backlog,
            output_event,
            app,
        })
    }

    /// Pump PTY → `cc-output-<id>` (base64) until EOF, then emit `cc-exit-<id>`.
    ///
    /// Reader-thread lifecycle (same invariant the WP2 harness documents): the loop
    /// ends on `read() == 0` (EOF), which the master delivers once the child exits
    /// and the last slave handle is dropped. The thread self-terminates; no join.
    ///
    /// Per chunk: if `backlog` is still `Some` (frontend not yet subscribed), APPEND the
    /// encoded chunk there; once `mark_ready` has set it to `None`, emit live. This
    /// guarantees no output is lost between spawn and the frontend's `listen()` attaching.
    fn spawn_reader_thread(
        app: AppHandle,
        id: String,
        mut reader: Box<dyn std::io::Read + Send>,
        backlog: OutputBacklog,
        output_event: String,
    ) {
        let exit_event = format!("cc-exit-{id}");
        thread::spawn(move || {
            let engine = base64::engine::general_purpose::STANDARD;
            let mut buf = [0u8; READ_CHUNK];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let encoded = engine.encode(&buf[..n]);
                        // Buffer until the frontend is ready, then emit live (route_chunk
                        // is the pure decision; mark_ready takes the same lock to flush+
                        // flip, so there's no lost/duplicated chunk at the seam). A failed
                        // emit means the frontend went away; keep draining the PTY anyway.
                        if let Some(live) = route_chunk(&backlog, encoded) {
                            let _ = app.emit(&output_event, live);
                        }
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
        // Preferred path: ask the process to exit cleanly with one deterministic
        // CR-terminated write (WP2: `/exit\r` exits CC in <5s, no two-keystroke race;
        // a shell exits on `exit\r`). Then poll, and SIGKILL as a fallback so we never
        // leak an orphaned child. `exit_command` is per-session-kind (`/exit` CC /
        // `exit` shell) so a shell doesn't eat the full SIGKILL grace window.
        let _ = self.send_input(&slash_command_bytes(self.exit_command));

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

    /// Frontend has attached its `cc-output-<id>` listener and is ready to receive.
    /// Flush the buffered backlog (emit each chunk in order) and switch the reader thread
    /// to live mode (`backlog` → `None`). Idempotent: a second call is a no-op (backlog
    /// already taken). The consumer of the spawn-time buffering — closes the shell race.
    fn mark_ready(&self) {
        // drain_backlog flips Some→None (reader switches to live) and returns the
        // buffered chunks; emit them in order so the frontend sees nothing-lost output.
        for chunk in drain_backlog(&self.backlog) {
            let _ = self.app.emit(&self.output_event, chunk);
        }
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

    /// Spawn the WP9 second-terminal panel's shell for `project_path` and register it
    /// in the SAME registry (so `cc_input`/`cc_resize`/`cc_kill` + the window-close
    /// `kill_all` reaping all apply unchanged — the shell session is just another
    /// `CcSession`).
    pub fn spawn_shell(&mut self, app: AppHandle, project_path: &str) -> Result<String, CcError> {
        let id = self.mint_id();
        let session = PtyCcSession::spawn_shell(app, id.clone(), project_path)?;
        self.sessions.insert(id.clone(), Box::new(session));
        Ok(id)
    }

    pub fn input(&self, id: &str, bytes: &[u8]) -> Result<(), CcError> {
        self.get(id)?.send_input(bytes)
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), CcError> {
        self.get(id)?.resize(cols, rows)
    }

    /// Mark a session ready (frontend listener attached): flush its output backlog.
    pub fn ready(&self, id: &str) -> Result<(), CcError> {
        self.get(id)?.mark_ready();
        Ok(())
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
    ///
    /// PARALLELIZED (M4 WP2): each `kill()` blocks up to a 3s SIGKILL grace window
    /// ([`PtyCcSession::kill`]). At N>1 a sequential loop would serialize to N×3s of
    /// window-close latency. Instead we drain every session out of the map, spawn one
    /// thread per session to run its `kill()`, and join them — so the N grace windows
    /// OVERLAP and total close latency is ~one window (~3s), not N×. The registry's own
    /// `Mutex` (held by the `CloseRequested` caller) is released the moment this returns;
    /// the threads are joined inside this call so no kill is orphaned. Sessions are
    /// `Send` (the [`CcSession`] supertrait), so moving each `Box` into its thread is sound.
    pub fn kill_all(&mut self) -> usize {
        // Drain ownership of every session out of the map first (so the threads own
        // them outright — no shared borrow of `self` across threads).
        let sessions: Vec<Box<dyn CcSession>> = self.sessions.drain().map(|(_, s)| s).collect();

        let handles: Vec<thread::JoinHandle<bool>> = sessions
            .into_iter()
            .map(|session| thread::spawn(move || session.kill().is_ok()))
            .collect();

        // Join all — the slowest grace window bounds the total, not the sum. A thread
        // that panicked (join Err) simply isn't counted (best-effort).
        handles
            .into_iter()
            .filter_map(|h| h.join().ok())
            .filter(|&ok| ok)
            .count()
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

    // --- resolve_shell_argv: WP9 second-terminal shell resolution (pure) ---

    #[test]
    fn shell_argv_prefers_env_shell() {
        let argv = resolve_shell_argv(Some("/usr/local/bin/fish".to_string()));
        assert_eq!(argv, vec!["/usr/local/bin/fish", "-l", "-i"]);
    }

    #[test]
    fn shell_argv_falls_back_when_unset_or_blank() {
        // Unset → default.
        assert_eq!(resolve_shell_argv(None), vec![DEFAULT_SHELL, "-l", "-i"]);
        // Blank / whitespace-only → default (not an empty program path).
        assert_eq!(
            resolve_shell_argv(Some("".to_string())),
            vec![DEFAULT_SHELL, "-l", "-i"]
        );
        assert_eq!(
            resolve_shell_argv(Some("   ".to_string())),
            vec![DEFAULT_SHELL, "-l", "-i"]
        );
    }

    #[test]
    fn shell_argv_launches_interactive_login() {
        // The flags are load-bearing: without -l -i the panel shell has no aliases /
        // rc files. Guard that both are present and the program is argv[0].
        let argv = resolve_shell_argv(Some("/bin/bash".to_string()));
        assert_eq!(argv[0], "/bin/bash");
        assert!(argv.contains(&"-l".to_string()));
        assert!(argv.contains(&"-i".to_string()));
    }

    // --- output backlog: the WP9 shell-prompt-race fix (route_chunk + drain_backlog) ---

    #[test]
    fn route_chunk_buffers_while_pending_then_emits_live() {
        let backlog: Mutex<Option<Vec<String>>> = Mutex::new(Some(Vec::new()));
        // Buffering mode: chunks are appended, nothing returned to emit live.
        assert_eq!(route_chunk(&backlog, "a".to_string()), None);
        assert_eq!(route_chunk(&backlog, "b".to_string()), None);
        assert_eq!(
            backlog.lock().unwrap().as_deref(),
            Some(["a".to_string(), "b".to_string()].as_slice())
        );
    }

    #[test]
    fn drain_backlog_returns_buffered_in_order_and_flips_to_live() {
        let backlog: Mutex<Option<Vec<String>>> = Mutex::new(Some(vec![
            "1".to_string(),
            "2".to_string(),
            "3".to_string(),
        ]));
        // Flush returns the buffered chunks in order...
        assert_eq!(drain_backlog(&backlog), vec!["1", "2", "3"]);
        // ...and flips the session to live (None).
        assert!(backlog.lock().unwrap().is_none());
        // Now route_chunk emits live (returns the chunk) instead of buffering.
        assert_eq!(
            route_chunk(&backlog, "live".to_string()),
            Some("live".to_string())
        );
    }

    #[test]
    fn drain_backlog_is_idempotent() {
        let backlog: Mutex<Option<Vec<String>>> = Mutex::new(Some(vec!["x".to_string()]));
        assert_eq!(drain_backlog(&backlog), vec!["x"]);
        // A second drain (e.g. a duplicate cc_ready) yields nothing and stays live.
        assert!(drain_backlog(&backlog).is_empty());
        assert!(backlog.lock().unwrap().is_none());
    }

    #[test]
    fn no_chunk_is_lost_across_the_buffer_to_live_seam() {
        // The race the fix closes: a chunk that arrives, then the frontend readies, then
        // more chunks. Every chunk is accounted for exactly once (buffered then flushed,
        // or emitted live) — none dropped, none duplicated.
        let backlog: Mutex<Option<Vec<String>>> = Mutex::new(Some(Vec::new()));
        assert_eq!(route_chunk(&backlog, "prompt".to_string()), None); // buffered pre-ready
        let flushed = drain_backlog(&backlog); // frontend readied → flush
        assert_eq!(flushed, vec!["prompt"]);
        // Post-ready chunks go live.
        assert_eq!(
            route_chunk(&backlog, "typed".to_string()),
            Some("typed".to_string())
        );
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

    /// A test double counting kills; never touches a PTY. `kill_delay` lets a test
    /// simulate the real per-session SIGKILL grace window so `kill_all`'s parallelism
    /// is observable (deterministic — a fixed sleep, not wall-clock-dependent state).
    struct FakeSession {
        killed: Arc<AtomicUsize>,
        kill_delay: Duration,
    }
    impl CcSession for FakeSession {
        fn send_input(&self, _bytes: &[u8]) -> Result<(), CcError> {
            Ok(())
        }
        fn resize(&self, _cols: u16, _rows: u16) -> Result<(), CcError> {
            Ok(())
        }
        fn kill(&self) -> Result<(), CcError> {
            // Simulate the grace window. In kill_all this runs on a per-session thread,
            // so N of these overlap rather than summing.
            thread::sleep(self.kill_delay);
            self.killed.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
        fn mark_ready(&self) {}
    }

    /// A test double whose `kill()` always FAILS — for asserting `kill_all`'s
    /// best-effort semantics (a failing kill must not stop the others, and must not
    /// be counted as terminated).
    struct FailingSession;
    impl CcSession for FailingSession {
        fn send_input(&self, _bytes: &[u8]) -> Result<(), CcError> {
            Ok(())
        }
        fn resize(&self, _cols: u16, _rows: u16) -> Result<(), CcError> {
            Ok(())
        }
        fn kill(&self) -> Result<(), CcError> {
            Err(CcError::Io("simulated kill failure".to_string()))
        }
        fn mark_ready(&self) {}
    }

    fn reg_with_fakes(n: usize) -> (SessionRegistry, Arc<AtomicUsize>, Vec<String>) {
        reg_with_delayed_fakes(n, Duration::from_millis(0))
    }

    fn reg_with_delayed_fakes(
        n: usize,
        kill_delay: Duration,
    ) -> (SessionRegistry, Arc<AtomicUsize>, Vec<String>) {
        let killed = Arc::new(AtomicUsize::new(0));
        let mut reg = SessionRegistry::new();
        let ids = (0..n)
            .map(|_| {
                let killed = killed.clone();
                reg.insert(move |_id| Box::new(FakeSession { killed, kill_delay }))
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

    #[test]
    fn kill_all_runs_grace_windows_in_parallel_not_serially() {
        // The M4 WP2 fix: each session's kill() blocks a grace window; at N>1 the
        // windows must OVERLAP (~one window total), not serialize to N× the window.
        // 4 sessions × 200ms each: serial would be ~800ms; parallel is ~200ms. Assert
        // the total is comfortably under the serial sum (< 500ms leaves wide margin for
        // thread spawn/join overhead while still proving overlap, not 4× serialization).
        let per_session = Duration::from_millis(200);
        let (mut reg, killed, _ids) = reg_with_delayed_fakes(4, per_session);
        assert_eq!(reg.len(), 4);

        let start = Instant::now();
        let killed_count = reg.kill_all();
        let elapsed = start.elapsed();

        // All four were killed and drained...
        assert_eq!(killed_count, 4);
        assert_eq!(reg.len(), 0);
        assert_eq!(killed.load(Ordering::SeqCst), 4);
        // ...and the wall-clock proves the windows overlapped (parallel), not summed.
        assert!(
            elapsed < Duration::from_millis(500),
            "kill_all took {elapsed:?} for 4×200ms sessions — expected ~200ms (parallel), \
             not ~800ms (serial). The grace windows are not overlapping."
        );
        // Sanity: it did at least take roughly one grace window (the sleeps ran).
        assert!(
            elapsed >= per_session,
            "kill_all returned in {elapsed:?}, faster than a single 200ms grace window — \
             the kill() sleeps did not actually run."
        );
    }

    #[test]
    fn kill_all_is_best_effort_a_failing_kill_does_not_block_or_count() {
        // Best-effort under the parallel refactor: register 3 succeeding fakes + 1 that
        // fails its kill(). All 4 must be DRAINED from the registry, the 3 successes must
        // run (and the failing one's thread must not deadlock the join), and the returned
        // count reflects ONLY the successes (the `filter(|&ok| ok)` branch).
        let killed = Arc::new(AtomicUsize::new(0));
        let mut reg = SessionRegistry::new();
        for _ in 0..3 {
            let killed = killed.clone();
            reg.insert(move |_id| {
                Box::new(FakeSession {
                    killed,
                    kill_delay: Duration::from_millis(0),
                })
            });
        }
        reg.insert(|_id| Box::new(FailingSession));
        assert_eq!(reg.len(), 4);

        let killed_count = reg.kill_all();

        // The failing session is NOT counted as terminated...
        assert_eq!(killed_count, 3);
        // ...but every session (incl. the failing one) is drained from the registry...
        assert_eq!(reg.len(), 0);
        // ...and the 3 successes all ran (the failing one didn't short-circuit them).
        assert_eq!(killed.load(Ordering::SeqCst), 3);
    }
}
