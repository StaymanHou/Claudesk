//! M17 — a remote CC session: a replaceable `ssh -tt` terminal under one session id, re-attached
//! to the same tmux session when the host link drops (arch `remote-workspaces.md` §E).
//!
//! ⚠️ **Everything this session does to the outside world goes through [`RemotePorts`]** (M17 WP5,
//! `SURFACE-2026-11-16-QUALITY-M17WP3-RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM`): the link's state,
//! waiting for it, starting a terminal, the exit / notice / overlay emits and the close's remote
//! calls. The app's ports ([`AppPorts`]) wire them to the `AppHandle` and the `LinkRegistry`; the
//! tests drive the reconnect loop through a recording fake. Before WP5 this machinery was pinned by
//! `include_str!` source guards, which encode only the shapes they know.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine as _;
use tauri::{AppHandle, Emitter, Manager};

use super::{borrow_env, CcError, CcSession, ExitHook, PtyCcSession, CC_SPAWN_ENV_REMOVE};
use crate::remote_link::{CloseExecError, ClosingGuard, LinkRegistry};
use crate::remote_record::SessionRecordState;
use crate::status_broadcaster::LinkEdge;

/// Everything a remote spawn needs, resolved by the caller (`cc_spawn_remote`) before the
/// registry lock is taken: the link is already Up.
pub struct RemoteSpawn {
    pub links: Arc<LinkRegistry>,
    pub target: crate::remote_cmd::ValidTarget,
    pub link: crate::remote_link::LinkInfo,
    /// The session's hold on the host link, taken WITH the link by `ensure_and_hold` (one lock),
    /// never afterwards: a separate hold step could count on a link that was stopped in between.
    pub hold: crate::remote_link::LinkHold,
    /// The row's key (`ssh://host/path`) exactly as the caller has it. The link overlay is keyed
    /// on it, never on a key rebuilt from `target` (a rebuilt key that differed would silently
    /// match no row: `SURFACE-2026-11-16-QUALITY-M17WP4-OVERLAY-KEY-DERIVED-TWICE`).
    pub project_path: String,
    /// The tmux session name (`remote_cmd::tmux_session` of the row's key).
    pub session: String,
    /// The LOCAL cwd for the ssh process (the user's home: the project folder is remote).
    pub local_cwd: String,
    /// Whether the remote holds a transcript for this project's physical path (M17 WP4): the
    /// remote answer to the `--continue` guard, asked by the caller before the registry lock.
    pub has_transcript: bool,
    /// M17 WP5: ATTACH to the live session (a reconnect on open) instead of starting one.
    pub attach: bool,
    /// For an attach: the live session's spawn mode, read over the link (`Some(None)`: spawned
    /// with none; `None`: unknown, a session started before WP5 stored it).
    pub running_mode: Option<Option<String>>,
}

/// What a remote session's `kill()` needs to cancel copy-mode over the master.
///
/// ⚠️ A plain struct called FROM `kill()`, not a closure built in `spawn`: the cancel blocks on an
/// ssh exec, and `kill()` is where blocking already lives (it runs on a worker: `cc_kill`'s thread,
/// `kill_all`'s per-session threads). A closure built inside `spawn` made
/// `tests/sync_commands_do_not_block.rs` attribute the ssh wait to `spawn` itself.
#[derive(Clone)]
pub struct RemoteExit {
    pub(super) links: Arc<LinkRegistry>,
    pub(super) target: crate::remote_cmd::ValidTarget,
    pub(super) session: String,
}

impl RemoteExit {
    /// Best effort: with the link not Up the cancel sends nothing and returns at once
    /// (`CloseExecError::LinkNotUp`), and the close continues.
    pub(super) fn cancel_before_exit(&self) {
        if let Err(e) = self.links.cancel_copy_mode(&self.target, &self.session) {
            eprintln!("[claudesk] remote close: could not cancel copy-mode: {e}");
        }
    }

    /// Before a Claudesk injection (`cc_inject`): wait for the pane's bracketed-paste mode, then
    /// leave copy-mode. ⚠️ Blocks (one ssh exec, up to the readiness bound).
    pub fn prepare_inject(&self) -> Result<(), String> {
        self.links
            .prepare_inject(&self.target, &self.session, crate::remote_cmd::READY_POLLS)
    }
}

/// M17 WP3 Phase 5 — what a remote terminal's END means, decided when its local `ssh` exits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InnerExit {
    /// The link dropped under a pane that is still running on the remote: re-attach.
    Reconnect,
    /// The session really ended (CC exited, the workspace was closed): emit `cc-exit-<id>`.
    Ended,
    /// M17 WP5: a START found the tmux session already live (it appeared after the open check
    /// decided to start). Nothing was started or joined; the session is untouched.
    SessionExists,
}

/// `ssh`'s own failure exit code: a connection error, including a mux client whose master died.
pub const SSH_ERROR_EXIT: u32 = 255;

/// Classify a remote terminal's end (pure, so each arm is mutation-provable).
///
/// - `killed` (Claudesk closed the workspace) always ends it: nothing to reconnect to.
/// - Exit code 255 is ssh failing, not the remote command finishing, so the pane may still be
///   running: reconnect.
/// - The link not being Up means the same, whatever the code.
/// - [`EXIT_SESSION_EXISTS`](crate::remote_cmd::EXIT_SESSION_EXISTS) with the link Up: a start
///   refused to join a live session.
/// - Otherwise (the remote command exited with the link Up: `/exit` ended the tmux session, or
///   the session was gone when we attached) it ended.
pub fn classify_inner_exit(killed: bool, exit_code: Option<u32>, link_up: bool) -> InnerExit {
    if killed {
        InnerExit::Ended
    } else if exit_code == Some(SSH_ERROR_EXIT) || !link_up {
        InnerExit::Reconnect
    } else if exit_code == Some(crate::remote_cmd::EXIT_SESSION_EXISTS) {
        InnerExit::SessionExists
    } else {
        InnerExit::Ended
    }
}

/// `me@mini.example.net` → `mini`: the host as a person would say it.
pub fn short_host(host: &str) -> &str {
    let h = host.rsplit_once('@').map_or(host, |(_, h)| h);
    h.split('.').next().unwrap_or(h)
}

/// The dim line written into a remote pane while it reconnects (P5.4). ⚠️ Claudesk's own bytes on
/// the `cc-output-<id>` path, never parsed back; tmux's redraw on re-attach replaces it.
pub fn reconnect_notice(host: &str) -> String {
    format!(
        "\r\n\x1b[2m[Claudesk: connection to {} lost, reconnecting…]\x1b[0m\r\n",
        short_host(host)
    )
}

/// The dim line written when an attach found the session gone (M17 WP5): it ended while Claudesk
/// was away, so reopening resumes it (`--continue` / `/session-restore`), never reconnects.
pub fn session_gone_notice(host: &str) -> String {
    format!(
        "\r\n\x1b[2m[Claudesk: the session on {} has ended. Reopen the project to resume it.]\x1b[0m\r\n",
        short_host(host)
    )
}

/// The dim line written when a start found a session already running (M17 WP5, AC-3.5): nothing
/// was started, and reopening reconnects to it.
pub fn session_exists_notice(host: &str) -> String {
    format!(
        "\r\n\x1b[2m[Claudesk: a session for this project is already running on {}. Reopen the \
         project to reconnect to it.]\x1b[0m\r\n",
        short_host(host)
    )
}

/// How long to wait, after EOF, for a remote terminal's `ssh` to be reaped so its exit code can be
/// classified.
const INNER_REAP_WINDOW: Duration = Duration::from_secs(2);

/// The first back-off after a re-attached terminal fails quickly, so a link that reports Up while
/// every attach still fails cannot spin. Doubles per quick failure up to [`RECONNECT_DELAY_MAX`].
pub const RECONNECT_MIN_INTERVAL: Duration = Duration::from_secs(2);
/// The longest wait between two re-attach attempts (the link worker's own cap).
pub const RECONNECT_DELAY_MAX: Duration = Duration::from_secs(30);
/// A re-attached terminal that lived at least this long was a real connection, so its end is a NEW
/// drop (notice, immediate attempt); a shorter one is a failed attempt (back off, no new notice).
pub const STABLE_TERMINAL: Duration = Duration::from_secs(10);
/// How many terminals in a row may fail to START before a reconnect gives up and ends the session.
pub const MAX_SPAWN_FAILURES: u32 = 5;

/// How long a re-attached terminal must hold before the link overlay clears (M17 WP4,
/// P4.verify-self.F1). An attach that fails dies in milliseconds (`ssh` exits 255 at once when the
/// master behind a stale Up is gone), so reporting `Attached` at SPAWN cleared the overlay for a
/// failed attempt and replaced the last hue with Unknown. Only a terminal still in place after this
/// window counts as attached.
pub const ATTACH_CONFIRM: Duration = Duration::from_millis(1500);

/// The waits a remote session uses. Production uses [`RemoteTimings::PRODUCTION`]; a test shortens
/// them so the loop runs in milliseconds. Each is a real wait, not a timeout on a check.
#[derive(Debug, Clone, Copy)]
pub(crate) struct RemoteTimings {
    /// See [`INNER_REAP_WINDOW`].
    pub reap_window: Duration,
    /// The wait before re-trying a terminal that failed to START ([`RECONNECT_MIN_INTERVAL`]).
    pub spawn_retry: Duration,
    /// See [`ATTACH_CONFIRM`].
    pub attach_confirm: Duration,
}

impl RemoteTimings {
    pub const PRODUCTION: Self = Self {
        reap_window: INNER_REAP_WINDOW,
        spawn_retry: RECONNECT_MIN_INTERVAL,
        attach_confirm: ATTACH_CONFIRM,
    };
}

/// Whether the re-attach made at `at` still holds (pure, M17 WP4): the workspace is open, a
/// terminal is in place, and it is the SAME re-attach (a later one has its own confirmation).
pub fn attach_still_held(
    killed: bool,
    terminal_present: bool,
    attached_at: Option<Instant>,
    at: Instant,
) -> bool {
    !killed && terminal_present && attached_at == Some(at)
}

/// The wait before the next re-attach and whether this end is a NEW drop (pure). `lived` is how
/// long the ending terminal ran if it was itself a re-attach, `None` for the session's first
/// terminal (whose end is always a new drop).
pub fn next_reconnect(prev_delay: Duration, lived: Option<Duration>) -> (Duration, bool) {
    match lived {
        Some(l) if l < STABLE_TERMINAL => (
            (prev_delay * 2).clamp(RECONNECT_MIN_INTERVAL, RECONNECT_DELAY_MAX),
            false,
        ),
        _ => (Duration::ZERO, true),
    }
}

/// The local argv of a RE-attach: `ssh -tt` over the master into `tmux attach -t =<session>`.
/// ⚠️ `attach`, never `new -A`: a session that died while the link was down is never silently
/// restarted with a fresh CC (arch §E).
pub fn reattach_argv(ctl: &Path, host: &str, identifier: &str, session: &str) -> Vec<String> {
    crate::remote_link::terminal_argv(
        ctl,
        host,
        &crate::remote_cmd::tmux_attach_command(
            crate::remote_cmd::tmux_server(identifier),
            session,
        ),
    )
}

/// The local argv of a remote session's FIRST terminal (M17 WP5): a reconnect on open ATTACHES
/// ([`reattach_argv`]); every other spawn STARTS ([`remote_terminal_argv`], which refuses a session
/// that is already live). Pure, so the choice is tested.
#[allow(clippy::too_many_arguments)]
pub fn session_argv(
    attach: bool,
    ctl: &Path,
    host: &str,
    home: &str,
    identifier: &str,
    session: &str,
    path: &str,
    drive_mode: Option<&str>,
    cc_argv: &[String],
) -> Vec<String> {
    if attach {
        reattach_argv(ctl, host, identifier, session)
    } else {
        remote_terminal_argv(
            ctl, host, home, identifier, session, path, drive_mode, cc_argv,
        )
    }
}

/// M17 WP5 (AC-5.3) — the app event a close emits when it could not end the remote session.
pub const REMOTE_CLOSE_NOT_ENDED_EVENT: &str = "remote-close-not-ended";

/// [`REMOTE_CLOSE_NOT_ENDED_EVENT`]'s payload (wire camelCase).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCloseNotEnded {
    /// The row's `ssh://` key.
    pub project_path: String,
    /// The host as a person would say it.
    pub host: String,
}

/// One terminal of a remote session: what [`RemoteShared`] needs from it. The real one is a
/// [`PtyCcSession`] running `ssh -tt`.
pub(crate) trait RemoteTerminal: Send {
    fn send_input(&self, bytes: &[u8]) -> Result<(), CcError>;
    fn resize(&self, cols: u16, rows: u16) -> Result<(), CcError>;
    /// The terminal's own close (cancel copy-mode, `/exit`, signals).
    fn kill(&self) -> Result<(), CcError>;
    /// M17 WP5 (Detach) — end the terminal WITHOUT `/exit` (signals only): the local `ssh` client
    /// ends, the tmux client detaches, and the remote session keeps running.
    fn hang_up(&self) -> Result<(), CcError>;
    fn mark_ready(&self);
    /// The terminal process's exit code, waiting up to `window` for it to be reaped.
    fn exit_code_within(&self, window: Duration) -> Option<u32>;
}

impl RemoteTerminal for PtyCcSession {
    fn send_input(&self, bytes: &[u8]) -> Result<(), CcError> {
        CcSession::send_input(self, bytes)
    }
    fn resize(&self, cols: u16, rows: u16) -> Result<(), CcError> {
        CcSession::resize(self, cols, rows)
    }
    fn kill(&self) -> Result<(), CcError> {
        CcSession::kill(self)
    }
    fn hang_up(&self) -> Result<(), CcError> {
        PtyCcSession::hang_up(self)
    }
    fn mark_ready(&self) {
        CcSession::mark_ready(self)
    }
    fn exit_code_within(&self, window: Duration) -> Option<u32> {
        PtyCcSession::exit_code_within(self, window)
    }
}

/// Everything a remote session does OUTSIDE itself. The app's ports are [`AppPorts`]; a test
/// supplies a recording fake, so the reconnect loop, the once-latch, the overlay edges and the
/// close's order are driven for real rather than read from source.
pub(crate) trait RemotePorts: Send + Sync {
    /// Whether the host's link is Up right now (classifying a terminal's end).
    fn link_up(&self) -> bool;
    /// Block until the link is Up again and return its ControlPath; `Err` when it was stopped or
    /// `cancelled()` turned true. ⚠️ Blocks: called on the ending terminal's reader thread.
    fn wait_up(&self, cancelled: &dyn Fn() -> bool) -> Result<PathBuf, String>;
    /// Start a terminal running `argv` whose end runs [`on_inner_exit`] for `shared`.
    fn spawn_terminal(
        &self,
        shared: &Arc<RemoteShared>,
        argv: &[String],
    ) -> Result<Box<dyn RemoteTerminal>, CcError>;
    /// Tell the frontend the session ended (`cc-exit-<id>`). Called once, by
    /// [`RemoteShared::emit_exit`]'s latch.
    fn emit_exit(&self);
    /// Write Claudesk's own `line` into the pane (the reconnect notice).
    fn emit_notice(&self, line: &str);
    /// Report an attach/detach edge for the link overlay.
    fn link_edge(&self, edge: LinkEdge);
    /// Mark this session's tmux session as closing until the guard drops (`None` in a test).
    fn begin_close(&self) -> Option<ClosingGuard>;
    /// End the remote tmux session (R-1). `Err(LinkNotUp)`: nothing was sent.
    fn end_session(&self) -> Result<(), CloseExecError>;
    /// Write what Claudesk now knows about the remote session to its local record
    /// (`remote_record`), which the picker's label and the open decision read.
    fn record(&self, state: SessionRecordState);
    /// M17 WP5 (AC-5.3): an explicit close could NOT end the remote session (the link was down,
    /// or the end failed), so it is still running and the next open will ask. Tells the app,
    /// which says so in a toast. (A quit takes the same path; the app is going away, so nothing
    /// shows, which is what AC-5.3 asks for.)
    fn close_not_ended(&self);
}

/// The app's [`RemotePorts`]: the `AppHandle` for emits, the `LinkRegistry` for the link.
struct AppPorts {
    app: AppHandle,
    id: String,
    output_event: String,
    links: Arc<LinkRegistry>,
    target: crate::remote_cmd::ValidTarget,
    session: String,
    local_cwd: String,
    local_env: Vec<(String, String)>,
    link_sink: crate::status_broadcaster::LinkEdgeSink,
    /// The row's key and the app-data dir its record lives in (`None`: no record is written).
    key: String,
    data_dir: Option<PathBuf>,
}

impl RemotePorts for AppPorts {
    fn link_up(&self) -> bool {
        self.links.state(self.target.host()) == Some(crate::remote_link::LinkState::Up)
    }

    fn wait_up(&self, cancelled: &dyn Fn() -> bool) -> Result<PathBuf, String> {
        self.links
            .wait_up(self.target.host(), cancelled)
            .map(|l| l.control_path)
    }

    fn spawn_terminal(
        &self,
        shared: &Arc<RemoteShared>,
        argv: &[String],
    ) -> Result<Box<dyn RemoteTerminal>, CcError> {
        let mut term = PtyCcSession::spawn_argv_with_exit(
            self.app.clone(),
            self.id.clone(),
            argv,
            &self.local_cwd,
            &borrow_env(&self.local_env),
            "/exit",
            CC_SPAWN_ENV_REMOVE,
            ExitHook::Remote(Arc::clone(shared)),
        )?;
        term.remote_exit = Some(RemoteExit {
            links: Arc::clone(&self.links),
            target: self.target.clone(),
            session: self.session.clone(),
        });
        Ok(Box::new(term))
    }

    fn emit_exit(&self) {
        let _ = self.app.emit(&format!("cc-exit-{}", self.id), ());
    }

    fn emit_notice(&self, line: &str) {
        let engine = base64::engine::general_purpose::STANDARD;
        let _ = self
            .app
            .emit(&self.output_event, engine.encode(line.as_bytes()));
    }

    fn link_edge(&self, edge: LinkEdge) {
        (self.link_sink)(edge)
    }

    fn begin_close(&self) -> Option<ClosingGuard> {
        Some(self.links.begin_close(&self.session))
    }

    fn end_session(&self) -> Result<(), CloseExecError> {
        self.links
            .end_session(&self.target, &self.session)
            .map(|_| ())
    }

    fn close_not_ended(&self) {
        let _ = self.app.emit(
            REMOTE_CLOSE_NOT_ENDED_EVENT,
            RemoteCloseNotEnded {
                project_path: self.key.clone(),
                host: short_host(self.target.host()).to_string(),
            },
        );
    }

    fn record(&self, state: SessionRecordState) {
        if let Some(dir) = &self.data_dir {
            if !crate::remote_record::record_state(dir, &self.key, state) {
                eprintln!(
                    "[claudesk] remote record: could not write {state:?} for {}",
                    self.key
                );
            }
        }
    }
}

/// M17 WP3 Phase 5 — a remote CC session: a replaceable `ssh -tt` terminal under ONE session id,
/// output event and link hold. When the terminal's `ssh` ends, [`classify_inner_exit`] decides:
/// `Ended` emits `cc-exit-<id>` as a local session would; `Reconnect` waits for the link to be Up
/// again (the link worker retries on its own) and attaches a new terminal to the SAME tmux session
/// (`attach`, never `new -A`), so the pane resumes in the same xterm.
pub struct RemoteCcSession {
    shared: Arc<RemoteShared>,
    /// The session's hold on its host link, kept across terminals; released when the session is
    /// dropped (after `kill`), so the last one stops the link. `None` only in a test.
    _hold: Option<crate::remote_link::LinkHold>,
}

pub(crate) struct RemoteShared {
    ports: Box<dyn RemotePorts>,
    /// The ssh destination (for the attach argv and the notice).
    host: String,
    /// The identifier the remote state dir and tmux server derive from.
    identifier: String,
    /// The tmux session name.
    session: String,
    timings: RemoteTimings,
    /// The current terminal; `None` while reconnecting. ⚠️ A new terminal is spawned and stored
    /// under this lock, so its exit hook cannot classify before it is stored.
    inner: Mutex<Option<Box<dyn RemoteTerminal>>>,
    /// The last size the frontend asked for, applied to every new terminal.
    size: Mutex<Option<(u16, u16)>>,
    /// The frontend is listening (`mark_ready` was called): a new terminal goes live at once.
    ready: AtomicBool,
    /// A notice written before the frontend listened, delivered by `mark_ready` (a first terminal
    /// that ends at once ends before the pane has subscribed).
    pending_notice: Mutex<Option<String>>,
    /// The workspace was closed (or detached): no reconnect, and a wait in progress is cancelled.
    killed: AtomicBool,
    /// `cc-exit-<id>` has been emitted (exactly once).
    exited: AtomicBool,
    /// When the current terminal was RE-attached (`None` for the session's first terminal).
    attached_at: Mutex<Option<Instant>>,
    /// The current back-off between re-attach attempts ([`next_reconnect`]).
    retry_delay: Mutex<Duration>,
}

impl RemoteShared {
    pub(crate) fn new(
        ports: Box<dyn RemotePorts>,
        host: &str,
        identifier: &str,
        session: &str,
        timings: RemoteTimings,
    ) -> Arc<Self> {
        Arc::new(Self {
            ports,
            host: host.to_string(),
            identifier: identifier.to_string(),
            session: session.to_string(),
            timings,
            inner: Mutex::new(None),
            size: Mutex::new(None),
            ready: AtomicBool::new(false),
            pending_notice: Mutex::new(None),
            killed: AtomicBool::new(false),
            exited: AtomicBool::new(false),
            attached_at: Mutex::new(None),
            retry_delay: Mutex::new(Duration::ZERO),
        })
    }

    /// Start the session's FIRST terminal (the spawn's argv).
    pub(crate) fn start(self: &Arc<Self>, argv: &[String]) -> Result<(), CcError> {
        let mut g = self.inner.lock().map_err(|_| CcError::Lock)?;
        *g = Some(self.spawn_terminal(argv)?);
        Ok(())
    }

    /// THE one place a remote session's end is reported, at most once. Any link overlay goes off
    /// with it (M17 WP4): a session that gave up reconnecting must not stay dimmed.
    fn emit_exit(&self) {
        if !self.exited.swap(true, Ordering::SeqCst) {
            self.ports.emit_exit();
            self.ports.link_edge(LinkEdge::Ended);
        }
    }

    /// The reconnect notice: only while the frontend listens (a drop before it subscribed has
    /// nothing on screen to annotate).
    fn emit_notice(&self) {
        if self.ready.load(Ordering::SeqCst) {
            self.ports.emit_notice(&reconnect_notice(&self.host));
        }
    }

    /// A notice that must be SEEN (why the pane ended): written now, or kept for `mark_ready`.
    fn emit_final_notice(&self, line: String) {
        if self.ready.load(Ordering::SeqCst) {
            self.ports.emit_notice(&line);
        } else if let Ok(mut p) = self.pending_notice.lock() {
            *p = Some(line);
        }
    }

    /// Spawn a terminal running `argv` whose end runs [`on_inner_exit`], at the current size and
    /// readiness. Called with `inner` LOCKED by the caller.
    fn spawn_terminal(
        self: &Arc<Self>,
        argv: &[String],
    ) -> Result<Box<dyn RemoteTerminal>, CcError> {
        let term = self.ports.spawn_terminal(self, argv)?;
        if let Some((cols, rows)) = self.size.lock().ok().and_then(|g| *g) {
            let _ = term.resize(cols, rows);
        }
        if self.ready.load(Ordering::SeqCst) {
            term.mark_ready();
        }
        Ok(term)
    }
}

/// A remote terminal's output ended. Runs on its (finished) reader thread.
pub(crate) fn on_inner_exit(shared: Arc<RemoteShared>) {
    // The dead terminal is taken OUT before its exit code is awaited, so `cc_input`/`cc_resize`
    // (sync commands) never wait on `inner` through the reap window.
    let term = shared.inner.lock().ok().and_then(|mut g| g.take());
    let code = term
        .as_ref()
        .and_then(|t| t.exit_code_within(shared.timings.reap_window));
    drop(term);
    let link_up = shared.ports.link_up();
    let killed = shared.killed.load(Ordering::SeqCst);
    match classify_inner_exit(killed, code, link_up) {
        InnerExit::Ended => {
            // Not closed by Claudesk: CC exited (or the session was gone at a re-attach), so the
            // remote session has ended. A close writes its own record (`kill`), from whether its
            // remote end ran.
            if !killed {
                shared.ports.record(SessionRecordState::Ended);
                if code == Some(crate::remote_cmd::EXIT_NO_SESSION) {
                    shared.emit_final_notice(session_gone_notice(&shared.host));
                }
            }
            shared.emit_exit()
        }
        InnerExit::SessionExists => {
            // Nothing was started; the live session (and its record) are untouched.
            shared.emit_final_notice(session_exists_notice(&shared.host));
            shared.emit_exit()
        }
        InnerExit::Reconnect => {
            // M17 WP4 (AC-6.1): not attached from here until a re-attach holds.
            shared.ports.link_edge(LinkEdge::Lost);
            let (delay, new_drop) = reconnect_plan(&shared.retry_delay, &shared.attached_at);
            reconnect(shared, delay, new_drop)
        }
    }
}

/// The STATEFUL half of a reconnect decision: read how long the ending terminal lived (if it was
/// itself a re-attach), apply [`next_reconnect`] to the stored back-off, store the new back-off,
/// and return `(delay, new_drop)`.
fn reconnect_plan(
    retry_delay: &Mutex<Duration>,
    attached_at: &Mutex<Option<Instant>>,
) -> (Duration, bool) {
    let lived = attached_at
        .lock()
        .ok()
        .and_then(|g| *g)
        .map(|t| t.elapsed());
    match retry_delay.lock() {
        Ok(mut d) => {
            let next = next_reconnect(*d, lived);
            *d = next.0;
            next
        }
        Err(_) => (RECONNECT_MIN_INTERVAL, false),
    }
}

/// Sleep `d` in short slices, returning early (`false`) when the workspace is closed.
fn sleep_unless_killed(shared: &RemoteShared, d: Duration) -> bool {
    let end = Instant::now() + d;
    while Instant::now() < end {
        if shared.killed.load(Ordering::SeqCst) {
            return false;
        }
        thread::sleep((end - Instant::now()).min(Duration::from_millis(100)));
    }
    !shared.killed.load(Ordering::SeqCst)
}

/// Report `Attached` for the re-attach made at `at` once it has held for the confirmation window
/// ([`attach_still_held`]), on its own thread so the reconnect returns at once. A re-attach that
/// died meanwhile reports nothing: its `on_inner_exit` already kept the overlay on.
fn confirm_attached(shared: Arc<RemoteShared>, at: Instant) {
    let spawned = thread::Builder::new()
        .name("claudesk-remote-attach-confirm".into())
        .spawn(move || {
            thread::sleep(shared.timings.attach_confirm);
            let present = shared.inner.lock().is_ok_and(|g| g.is_some());
            let attached_at = shared.attached_at.lock().ok().and_then(|g| *g);
            if attach_still_held(
                shared.killed.load(Ordering::SeqCst),
                present,
                attached_at,
                at,
            ) {
                shared.ports.link_edge(LinkEdge::Attached);
            }
        });
    if let Err(e) = spawned {
        eprintln!("[claudesk] remote reconnect: could not confirm the attach: {e}");
    }
}

/// Wait `delay`, then for the link, and attach a new terminal to the same tmux session. Gives up
/// (ending the session) when the workspace is closed, the link is stopped, or
/// [`MAX_SPAWN_FAILURES`] terminals in a row fail to start. Only a NEW drop writes the notice; a
/// failed attempt's retry does not.
fn reconnect(shared: Arc<RemoteShared>, delay: Duration, new_drop: bool) {
    if new_drop {
        shared.emit_notice();
    }
    let cancelled = || shared.killed.load(Ordering::SeqCst);
    let mut spawn_failures = 0;
    let mut delay = delay;
    loop {
        if !sleep_unless_killed(&shared, delay) {
            shared.emit_exit();
            return;
        }
        let Ok(ctl) = shared.ports.wait_up(&cancelled) else {
            shared.emit_exit();
            return;
        };
        let argv = reattach_argv(&ctl, &shared.host, &shared.identifier, &shared.session);
        let Ok(mut g) = shared.inner.lock() else {
            shared.emit_exit();
            return;
        };
        // A close that landed while we waited for the link: checked UNDER the lock `kill` reads
        // the terminal through, so a close never misses a terminal stored after it looked.
        if cancelled() {
            drop(g);
            shared.emit_exit();
            return;
        }
        match shared.spawn_terminal(&argv) {
            Ok(term) => {
                *g = Some(term);
                let at = Instant::now();
                if let Ok(mut a) = shared.attached_at.lock() {
                    *a = Some(at);
                }
                drop(g);
                // Attached again once the attach HOLDS; then the dot reads Unknown until the next
                // event.
                confirm_attached(shared, at);
                return;
            }
            Err(e) => {
                drop(g);
                spawn_failures += 1;
                eprintln!("[claudesk] remote reconnect: could not start the terminal: {e}");
                if spawn_failures >= MAX_SPAWN_FAILURES {
                    shared.emit_exit();
                    return;
                }
                delay = shared.timings.spawn_retry;
            }
        }
    }
}

impl RemoteCcSession {
    pub(super) fn spawn(
        app: AppHandle,
        id: String,
        argv: &[String],
        remote: RemoteSpawn,
        local_env: Vec<(String, String)>,
    ) -> Result<Self, CcError> {
        let link_sink = crate::status_broadcaster::commands::link_edge_sink(
            app.clone(),
            remote.project_path.clone(),
            short_host(remote.target.host()).to_string(),
        );
        let identifier = remote.links.identifier().to_string();
        let data_dir = app.path().app_data_dir().ok();
        let ports = AppPorts {
            key: remote.project_path.clone(),
            data_dir,
            output_event: format!("cc-output-{id}"),
            app,
            id,
            links: remote.links,
            target: remote.target.clone(),
            session: remote.session.clone(),
            local_cwd: remote.local_cwd,
            local_env,
            link_sink,
        };
        let shared = RemoteShared::new(
            Box::new(ports),
            remote.target.host(),
            &identifier,
            &remote.session,
            RemoteTimings::PRODUCTION,
        );
        shared.start(argv)?;
        Ok(Self {
            shared,
            _hold: Some(remote.hold),
        })
    }
}

impl CcSession for RemoteCcSession {
    fn send_input(&self, bytes: &[u8]) -> Result<(), CcError> {
        let g = self.shared.inner.lock().map_err(|_| CcError::Lock)?;
        match g.as_ref() {
            Some(t) => t.send_input(bytes),
            None => Err(CcError::Io(format!(
                "reconnecting to {}",
                short_host(&self.shared.host)
            ))),
        }
    }

    fn resize(&self, cols: u16, rows: u16) -> Result<(), CcError> {
        if let Ok(mut s) = self.shared.size.lock() {
            *s = Some((cols, rows));
        }
        let g = self.shared.inner.lock().map_err(|_| CcError::Lock)?;
        match g.as_ref() {
            Some(t) => t.resize(cols, rows),
            None => Ok(()),
        }
    }

    /// Close: mark killed FIRST (so the terminal's end is classified `Ended`, and a reconnect wait
    /// in progress gives up), then the terminal's own kill (cancel copy-mode, `/exit`, signals),
    /// then END the remote session (R-1: a CC busy past its 0.5 s `/exit` window would otherwise
    /// run on after the close). The whole close is marked on the link registry
    /// (`begin_close`), so a respawn of the same tmux session waits for it.
    ///
    /// ⚠️ While the link is not Up nothing touches the remote: there may be no terminal, and the
    /// end sends nothing and returns at once (`CloseExecError::LinkNotUp`), so the remote session
    /// keeps running. That is what keeps a link-down quit from freezing on the main thread.
    fn kill(&self) -> Result<(), CcError> {
        self.shared.killed.store(true, Ordering::SeqCst);
        let _closing = self.shared.ports.begin_close();
        let local = {
            let g = self.shared.inner.lock().map_err(|_| CcError::Lock)?;
            match g.as_ref() {
                Some(t) => t.kill(),
                None => Ok(()),
            }
        };
        // M17 WP5: the record says whether the close's END happened. Not delivered (the link is
        // down, or the end failed) → `end-pending`, and the next open asks (R-4).
        match self.shared.ports.end_session() {
            Ok(()) => self.shared.ports.record(SessionRecordState::Ended),
            Err(e) => {
                eprintln!("[claudesk] remote close: could not end the remote session: {e}");
                self.shared.ports.record(SessionRecordState::EndPending);
                self.shared.ports.close_not_ended();
            }
        }
        local
    }

    fn can_detach(&self) -> bool {
        true
    }

    /// M17 WP5 (AC-4.1–4.3): leave the remote CC running. Marked closed FIRST, like `kill`, so the
    /// terminal's end is classified `Ended` (never a reconnect) and a reconnect wait in progress
    /// gives up; then the terminal hangs up WITHOUT `/exit` (the tmux client detaches). Nothing
    /// else: no copy-mode cancel, no `begin_close`, no end-session, and NO record write, so the
    /// record stays `running` and the next open labels Reconnect. It touches nothing remote, so
    /// it works with the link down (no terminal: nothing to hang up). The link hold goes when the
    /// session is dropped, like a close.
    fn detach(&self) -> Result<(), CcError> {
        self.shared.killed.store(true, Ordering::SeqCst);
        let g = self.shared.inner.lock().map_err(|_| CcError::Lock)?;
        match g.as_ref() {
            Some(t) => t.hang_up(),
            None => Ok(()),
        }
    }

    fn mark_ready(&self) {
        self.shared.ready.store(true, Ordering::SeqCst);
        let pending = self
            .shared
            .pending_notice
            .lock()
            .ok()
            .and_then(|mut p| p.take());
        if let Some(line) = pending {
            self.shared.ports.emit_notice(&line);
        }
        if let Ok(g) = self.shared.inner.lock() {
            if let Some(t) = g.as_ref() {
                t.mark_ready();
            }
        }
    }
}

/// The most remote CC sessions on one host. The mini allows `MaxSessions 10` per connection, and
/// the side-channel execs (cancel, `test -d`) need a slot or two (arch §B).
pub const MAX_REMOTE_SESSIONS_PER_HOST: usize = 8;

/// The local argv of a remote CC terminal: `ssh -tt` over the master into
/// `remote_cmd::tmux_new_command`. `cc_argv` is `build_cc_argv`'s output (its `claude` is
/// replaced by the deployed launcher). Pure, so the whole string is pinned by a test.
#[allow(clippy::too_many_arguments)]
pub fn remote_terminal_argv(
    ctl: &Path,
    host: &str,
    home: &str,
    identifier: &str,
    session: &str,
    path: &str,
    drive_mode: Option<&str>,
    cc_argv: &[String],
) -> Vec<String> {
    let dir = crate::remote_link::remote_state_dir(home, identifier);
    let cmd = crate::remote_cmd::tmux_new_command(
        crate::remote_cmd::tmux_server(identifier),
        &format!("{dir}/tmux.conf"),
        session,
        path,
        &format!("{dir}/cc-launch"),
        drive_mode,
        cc_argv.get(1..).unwrap_or(&[]),
    );
    crate::remote_link::terminal_argv(ctl, host, &cmd)
}

/// Why a ninth remote session on one host is refused, in plain words. `None` = admitted.
pub fn remote_cap_refusal(host: &str, live: usize) -> Option<String> {
    (live >= MAX_REMOTE_SESSIONS_PER_HOST).then(|| {
        format!(
            "{host} already has {live} open workspaces, the most one host can carry. Close one \
             there first."
        )
    })
}

#[cfg(test)]
mod tests;
