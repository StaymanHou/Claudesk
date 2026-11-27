//! The remote session's tests. The pure helpers are tested directly; the reconnect loop, the exit
//! latch, the overlay edges and the close's order are driven through [`FakePorts`], a recording
//! [`RemotePorts`] (M17 WP5, replacing the WP3/WP4 `include_str!` guards over this machinery).

use super::*;
use crate::remote_record::SessionRecordState;
use std::collections::VecDeque;
use std::sync::Weak;

#[test]
fn a_remote_terminal_end_is_classified_reconnect_or_ended() {
    // M17 WP3 Phase 5 — each arm on its own, so a mutant of any one fails here.
    use InnerExit::*;
    // A closed workspace always ends, even with ssh's error code and the link down.
    assert_eq!(
        classify_inner_exit(true, Some(SSH_ERROR_EXIT), false),
        Ended
    );
    assert_eq!(classify_inner_exit(true, Some(0), true), Ended);
    // ssh's own failure (a mux client whose master died): the pane may still be running.
    assert_eq!(classify_inner_exit(false, Some(255), true), Reconnect);
    // The link is not Up: reconnect, whatever the code.
    assert_eq!(classify_inner_exit(false, Some(0), false), Reconnect);
    assert_eq!(classify_inner_exit(false, None, false), Reconnect);
    // The remote command exited with the link Up: `/exit` ended tmux (0), or the session was
    // gone at attach ("can't find session", 1).
    assert_eq!(classify_inner_exit(false, Some(0), true), Ended);
    assert_eq!(classify_inner_exit(false, Some(1), true), Ended);
    assert_eq!(classify_inner_exit(false, None, true), Ended);
    // M17 WP5: an attach that found no session ended; a start that found one is its own kind.
    assert_eq!(
        classify_inner_exit(false, Some(crate::remote_cmd::EXIT_NO_SESSION), true),
        Ended
    );
    assert_eq!(
        classify_inner_exit(false, Some(crate::remote_cmd::EXIT_SESSION_EXISTS), true),
        SessionExists
    );
    // ...but with the link down it is still a drop, and a close still ends it.
    assert_eq!(
        classify_inner_exit(false, Some(crate::remote_cmd::EXIT_SESSION_EXISTS), false),
        Reconnect
    );
    assert_eq!(
        classify_inner_exit(true, Some(crate::remote_cmd::EXIT_SESSION_EXISTS), true),
        Ended
    );
}

#[test]
fn the_reconnect_notice_names_the_short_host_and_is_dim() {
    assert_eq!(short_host("me@mini.tail1234.ts.net"), "mini");
    assert_eq!(short_host("mini"), "mini");
    assert_eq!(short_host("a@b@host.lan"), "host");
    let line = reconnect_notice("me@mini.example.net");
    assert!(line.starts_with("\r\n\x1b[2m"), "{line:?}");
    assert!(line.contains("[Claudesk: connection to mini lost, reconnecting…]"));
    assert!(line.ends_with("\x1b[0m\r\n"));
    assert!(!line.contains("me@"), "no account in the pane: {line:?}");
}

#[test]
fn a_quick_reattach_failure_backs_off_and_only_a_new_drop_announces() {
    let s = Duration::from_secs;
    // The session's first terminal ending, or a re-attach that held: a NEW drop (notice, and
    // the first attempt at once).
    assert_eq!(next_reconnect(s(8), None), (Duration::ZERO, true));
    assert_eq!(
        next_reconnect(s(8), Some(STABLE_TERMINAL)),
        (Duration::ZERO, true)
    );
    // A re-attach that died quickly: back off, doubling from the minimum, capped; no notice.
    let quick = Some(Duration::from_millis(100));
    assert_eq!(
        next_reconnect(Duration::ZERO, quick),
        (RECONNECT_MIN_INTERVAL, false)
    );
    assert_eq!(next_reconnect(s(2), quick), (s(4), false));
    assert_eq!(next_reconnect(s(16), quick), (RECONNECT_DELAY_MAX, false));
    assert_eq!(
        next_reconnect(RECONNECT_DELAY_MAX, quick),
        (RECONNECT_DELAY_MAX, false)
    );
}

#[test]
fn the_reconnect_back_off_persists_across_consecutive_quick_failures() {
    // Drives the STORED state the way `on_inner_exit` does, call after call.
    let delay = Mutex::new(Duration::ZERO);
    let attached = Mutex::new(None);
    // The session's first terminal drops: a new drop, attempt at once.
    assert_eq!(reconnect_plan(&delay, &attached), (Duration::ZERO, true));
    // Each re-attach that dies quickly: the back-off doubles from the STORED value, silently.
    *attached.lock().unwrap() = Some(Instant::now());
    assert_eq!(
        reconnect_plan(&delay, &attached),
        (RECONNECT_MIN_INTERVAL, false)
    );
    assert_eq!(
        reconnect_plan(&delay, &attached),
        (RECONNECT_MIN_INTERVAL * 2, false)
    );
    assert_eq!(
        reconnect_plan(&delay, &attached),
        (RECONNECT_MIN_INTERVAL * 4, false)
    );
    // A re-attach that held (older than STABLE_TERMINAL) dropping again: a NEW drop, reset.
    *attached.lock().unwrap() = Instant::now().checked_sub(STABLE_TERMINAL);
    assert_eq!(reconnect_plan(&delay, &attached), (Duration::ZERO, true));
    assert_eq!(*delay.lock().unwrap(), Duration::ZERO);
}

/// M17 WP4 (AC-5.2): a reattach after a link drop never changes the session's retained drive
/// mode, so `cc_drive_mode` keeps answering the SPAWN-time mode and the stale-readout logic
/// stays truthful. The mode lives on the `Registry` entry, written once in `spawn`; the
/// reattach path holds only `RemoteShared`, whose `app` could reach the `Registry`. A SOURCE
/// question (a real reattach needs a PTY and an AppHandle): no reattach body names the
/// registry (`SessionRegistry`, or the `Registry` alias `commands.rs` uses) or the mode. Verified
/// live at P3.4 as well.

#[test]
fn attach_still_held_requires_the_same_live_terminal() {
    let at = Instant::now();
    let later = at + Duration::from_millis(5);
    assert!(attach_still_held(false, true, Some(at), at));
    assert!(
        !attach_still_held(true, true, Some(at), at),
        "the workspace closed"
    );
    assert!(
        !attach_still_held(false, false, Some(at), at),
        "the terminal died"
    );
    assert!(
        !attach_still_held(false, true, Some(later), at),
        "a later re-attach confirms itself"
    );
    assert!(!attach_still_held(false, true, None, at));
    assert!(
        ATTACH_CONFIRM >= Duration::from_millis(500),
        "longer than a failed attach"
    );
    assert!(ATTACH_CONFIRM < STABLE_TERMINAL);
}

// ── The fake ports ─────────────────────────────────────────────────────────────────────────

/// What a fake terminal's start does.
#[derive(Clone, Copy)]
enum Start {
    /// Starts, and when it later ends its process exited with this code.
    Ok(Option<u32>),
    /// Fails to start.
    Fail,
}

/// What [`FakePorts::wait_up`] does.
#[derive(Clone, Copy)]
enum Wait {
    /// The link is Up: return at once.
    Up,
    /// The link was stopped.
    Stopped,
    /// Wait until the workspace is closed (polling `cancelled`), then report stopped.
    UntilCancelled,
    /// Close the workspace from inside the wait, then report Up: the close lands between the
    /// wait and the spawn.
    CloseThenUp,
}

struct FakeTerm {
    name: usize,
    code: Option<u32>,
    log: Arc<Mutex<Vec<String>>>,
}

impl RemoteTerminal for FakeTerm {
    fn send_input(&self, _: &[u8]) -> Result<(), CcError> {
        Ok(())
    }
    fn resize(&self, c: u16, r: u16) -> Result<(), CcError> {
        self.log
            .lock()
            .unwrap()
            .push(format!("resize {} {c}x{r}", self.name));
        Ok(())
    }
    fn kill(&self) -> Result<(), CcError> {
        self.log.lock().unwrap().push(format!("kill {}", self.name));
        Ok(())
    }
    fn hang_up(&self) -> Result<(), CcError> {
        self.log
            .lock()
            .unwrap()
            .push(format!("hang_up {}", self.name));
        Ok(())
    }
    fn mark_ready(&self) {
        self.log
            .lock()
            .unwrap()
            .push(format!("ready {}", self.name));
    }
    fn exit_code_within(&self, _: Duration) -> Option<u32> {
        self.code
    }
}

struct FakePorts {
    log: Arc<Mutex<Vec<String>>>,
    link_up: AtomicBool,
    wait: Mutex<Wait>,
    /// The next starts, in order; when empty, a start succeeds with code 255.
    starts: Mutex<VecDeque<Start>>,
    /// Every argv a terminal was started with.
    argvs: Mutex<Vec<Vec<String>>>,
    /// The session, so [`Wait::CloseThenUp`] can close it.
    shared: Mutex<Weak<RemoteShared>>,
    end: Mutex<Option<CloseExecError>>,
}

impl RemotePorts for FakePorts {
    fn link_up(&self) -> bool {
        self.link_up.load(Ordering::SeqCst)
    }
    fn wait_up(&self, cancelled: &dyn Fn() -> bool) -> Result<PathBuf, String> {
        self.log.lock().unwrap().push("wait_up".into());
        match *self.wait.lock().unwrap() {
            Wait::Up => Ok(PathBuf::from("/AD/ssh/abcd1234")),
            Wait::Stopped => Err("stopped".into()),
            Wait::UntilCancelled => {
                while !cancelled() {
                    thread::sleep(Duration::from_millis(5));
                }
                Err("stopped".into())
            }
            Wait::CloseThenUp => {
                if let Some(s) = self.shared.lock().unwrap().upgrade() {
                    s.killed.store(true, Ordering::SeqCst);
                }
                Ok(PathBuf::from("/AD/ssh/abcd1234"))
            }
        }
    }
    fn spawn_terminal(
        &self,
        _: &Arc<RemoteShared>,
        argv: &[String],
    ) -> Result<Box<dyn RemoteTerminal>, CcError> {
        let mut argvs = self.argvs.lock().unwrap();
        argvs.push(argv.to_vec());
        let name = argvs.len();
        let start = self
            .starts
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(Start::Ok(Some(SSH_ERROR_EXIT)));
        match start {
            Start::Ok(code) => {
                self.log.lock().unwrap().push(format!("spawn {name}"));
                Ok(Box::new(FakeTerm {
                    name,
                    code,
                    log: Arc::clone(&self.log),
                }))
            }
            Start::Fail => {
                self.log.lock().unwrap().push(format!("spawn-fail {name}"));
                Err(CcError::Spawn("no pty".into()))
            }
        }
    }
    fn emit_exit(&self) {
        self.log.lock().unwrap().push("exit".into());
    }
    fn emit_notice(&self, line: &str) {
        self.log.lock().unwrap().push(format!("notice {line:?}"));
    }
    fn link_edge(&self, edge: LinkEdge) {
        self.log.lock().unwrap().push(format!("edge {edge:?}"));
    }
    fn begin_close(&self) -> Option<ClosingGuard> {
        self.log.lock().unwrap().push("begin_close".into());
        None
    }
    fn end_session(&self) -> Result<(), CloseExecError> {
        self.log.lock().unwrap().push("end_session".into());
        match self.end.lock().unwrap().take() {
            Some(e) => Err(e),
            None => Ok(()),
        }
    }
    fn record(&self, state: SessionRecordState) {
        self.log.lock().unwrap().push(format!("record {state:?}"));
    }
    fn close_not_ended(&self, reason: CloseNotEndedReason) {
        self.log
            .lock()
            .unwrap()
            .push(format!("close_not_ended {reason:?}"));
    }
}

const TEST_TIMINGS: RemoteTimings = RemoteTimings {
    reap_window: Duration::ZERO,
    spawn_retry: Duration::ZERO,
    attach_confirm: Duration::from_millis(60),
};

/// A started remote session over [`FakePorts`] (its first terminal is `spawn 1`), plus the log.
fn session(
    starts: &[Start],
    wait: Wait,
) -> (RemoteCcSession, Arc<FakePorts>, Arc<Mutex<Vec<String>>>) {
    let log = Arc::new(Mutex::new(Vec::new()));
    let ports = Arc::new(FakePorts {
        log: Arc::clone(&log),
        link_up: AtomicBool::new(true),
        wait: Mutex::new(wait),
        starts: Mutex::new(starts.iter().copied().collect()),
        argvs: Mutex::new(Vec::new()),
        shared: Mutex::new(Weak::new()),
        end: Mutex::new(None),
    });
    let shared = RemoteShared::new(
        Box::new(SharedPorts(Arc::clone(&ports))),
        "me@mini.example.net",
        "com.claudesk.app.dev",
        "cd-12345678",
        TEST_TIMINGS,
    );
    *ports.shared.lock().unwrap() = Arc::downgrade(&shared);
    shared
        .start(&["ssh".into(), "new".into()])
        .expect("first terminal");
    (
        RemoteCcSession {
            shared,
            _hold: None,
        },
        ports,
        log,
    )
}

/// [`FakePorts`] behind an `Arc`, so the test keeps a handle on the ports the session owns.
struct SharedPorts(Arc<FakePorts>);

impl RemotePorts for SharedPorts {
    fn link_up(&self) -> bool {
        self.0.link_up()
    }
    fn wait_up(&self, cancelled: &dyn Fn() -> bool) -> Result<PathBuf, String> {
        self.0.wait_up(cancelled)
    }
    fn spawn_terminal(
        &self,
        s: &Arc<RemoteShared>,
        argv: &[String],
    ) -> Result<Box<dyn RemoteTerminal>, CcError> {
        self.0.spawn_terminal(s, argv)
    }
    fn emit_exit(&self) {
        self.0.emit_exit()
    }
    fn emit_notice(&self, line: &str) {
        self.0.emit_notice(line)
    }
    fn link_edge(&self, edge: LinkEdge) {
        self.0.link_edge(edge)
    }
    fn begin_close(&self) -> Option<ClosingGuard> {
        self.0.begin_close()
    }
    fn end_session(&self) -> Result<(), CloseExecError> {
        self.0.end_session()
    }
    fn record(&self, state: SessionRecordState) {
        self.0.record(state)
    }
    fn close_not_ended(&self, reason: CloseNotEndedReason) {
        self.0.close_not_ended(reason)
    }
}

/// The current terminal's end, as its reader thread reports it.
fn terminal_ends(s: &RemoteCcSession) {
    on_inner_exit(Arc::clone(&s.shared));
}

fn entries(log: &Arc<Mutex<Vec<String>>>) -> Vec<String> {
    log.lock().unwrap().clone()
}

fn count(log: &Arc<Mutex<Vec<String>>>, entry: &str) -> usize {
    entries(log).iter().filter(|e| *e == entry).count()
}

// ── The loop, driven ─────────────────────────────────────────────────────────────────────────

#[test]
fn a_drop_reattaches_with_tmux_attach_and_reports_lost_then_attached() {
    let (s, ports, log) = session(&[Start::Ok(Some(SSH_ERROR_EXIT))], Wait::Up);
    s.mark_ready();
    terminal_ends(&s); // the first terminal: ssh failed (255) under an Up link
    let after_drop = entries(&log);
    assert_eq!(
        count(&log, "exit"),
        0,
        "a drop never ends the session: {after_drop:?}"
    );
    let lost = after_drop
        .iter()
        .position(|e| e == "edge Lost")
        .expect("Lost");
    let notice = after_drop
        .iter()
        .position(|e| e.starts_with("notice ") && e.contains("connection to mini lost"))
        .expect("the notice, short host only");
    let wait = after_drop
        .iter()
        .position(|e| e == "wait_up")
        .expect("waits");
    let spawn = after_drop
        .iter()
        .position(|e| e == "spawn 2")
        .expect("re-attaches");
    assert!(
        lost < notice && notice < wait && wait < spawn,
        "{after_drop:?}"
    );
    // The re-attach: `tmux attach` to the SAME session, exact match, never `new -A`.
    let argv = ports.argvs.lock().unwrap()[1].join(" ");
    assert!(
        argv.contains("attach -t") && argv.contains("=cd-12345678"),
        "{argv}"
    );
    assert!(!argv.contains(" new "), "{argv}");
    // The new terminal is live at once (the frontend is listening).
    assert!(after_drop.contains(&"ready 2".to_string()));
    // Not Attached until the attach has held; then Attached, once.
    assert_eq!(count(&log, "edge Attached"), 0);
    thread::sleep(TEST_TIMINGS.attach_confirm * 3);
    assert_eq!(count(&log, "edge Attached"), 1, "{:?}", entries(&log));
}

#[test]
fn an_attach_that_dies_before_it_held_never_reports_attached() {
    let (s, _ports, log) = session(&[], Wait::Up);
    terminal_ends(&s); // drop → re-attach (spawn 2, code 255 by default)
    assert!(entries(&log).contains(&"spawn 2".to_string()));
    s.shared.inner.lock().unwrap().take(); // spawn 2 dies at once
    thread::sleep(TEST_TIMINGS.attach_confirm * 3);
    assert_eq!(count(&log, "edge Attached"), 0, "{:?}", entries(&log));
}

#[test]
fn the_notice_is_written_only_once_the_frontend_listens() {
    let (s, _ports, log) = session(&[], Wait::Up);
    terminal_ends(&s); // not ready yet
    assert!(!entries(&log).iter().any(|e| e.starts_with("notice ")));
}

#[test]
fn a_session_whose_cc_exited_ends_once_and_never_reattaches() {
    // `/exit` ended tmux: the remote command exited 0 with the link Up.
    let (s, _ports, log) = session(&[Start::Ok(Some(0))], Wait::Up);
    terminal_ends(&s);
    terminal_ends(&s); // a late second report changes nothing (the once-latch)
    s.shared.emit_exit();
    assert_eq!(count(&log, "exit"), 1, "{:?}", entries(&log));
    assert_eq!(count(&log, "edge Ended"), 1);
    assert!(!entries(&log)
        .iter()
        .any(|e| e == "wait_up" || e == "spawn 2"));
}

#[test]
fn a_down_link_reconnects_whatever_the_exit_code() {
    let (s, ports, log) = session(&[Start::Ok(Some(0))], Wait::Up);
    ports.link_up.store(false, Ordering::SeqCst);
    terminal_ends(&s);
    assert_eq!(count(&log, "exit"), 0);
    assert!(entries(&log).contains(&"spawn 2".to_string()));
}

#[test]
fn a_closed_workspace_ends_without_reconnecting() {
    let (s, _ports, log) = session(&[Start::Ok(Some(SSH_ERROR_EXIT))], Wait::Up);
    s.kill().unwrap();
    terminal_ends(&s); // the killed terminal's ssh exits 255
    assert_eq!(count(&log, "exit"), 1);
    assert!(!entries(&log)
        .iter()
        .any(|e| e == "wait_up" || e == "spawn 2"));
}

#[test]
fn a_close_during_the_wait_for_the_link_ends_the_session() {
    let (s, _ports, log) = session(&[], Wait::UntilCancelled);
    let shared = Arc::clone(&s.shared);
    let waiter = thread::spawn(move || on_inner_exit(shared));
    while !entries(&log).contains(&"wait_up".to_string()) {
        thread::sleep(Duration::from_millis(2));
    }
    s.kill().unwrap();
    waiter.join().unwrap();
    assert_eq!(count(&log, "exit"), 1, "{:?}", entries(&log));
    assert!(!entries(&log).contains(&"spawn 2".to_string()));
}

#[test]
fn a_close_between_the_wait_and_the_spawn_starts_no_terminal() {
    // The under-lock cancel: the link came Up, but the workspace closed before the terminal.
    let (s, _ports, log) = session(&[], Wait::CloseThenUp);
    terminal_ends(&s);
    assert_eq!(count(&log, "exit"), 1, "{:?}", entries(&log));
    assert!(!entries(&log).contains(&"spawn 2".to_string()));
    assert!(s.shared.inner.lock().unwrap().is_none());
}

#[test]
fn a_stopped_link_ends_the_session() {
    let (s, _ports, log) = session(&[], Wait::Stopped);
    terminal_ends(&s);
    assert_eq!(count(&log, "exit"), 1);
    assert_eq!(count(&log, "edge Ended"), 1);
}

#[test]
fn five_terminals_in_a_row_that_fail_to_start_end_the_session() {
    let first = Start::Ok(Some(SSH_ERROR_EXIT));
    let mut starts = vec![first];
    starts.extend([Start::Fail; MAX_SPAWN_FAILURES as usize]);
    let (s, ports, log) = session(&starts, Wait::Up);
    terminal_ends(&s);
    let fails = entries(&log)
        .iter()
        .filter(|e| e.starts_with("spawn-fail"))
        .count();
    assert_eq!(fails, MAX_SPAWN_FAILURES as usize, "{:?}", entries(&log));
    assert_eq!(count(&log, "exit"), 1);
    assert_eq!(
        ports.argvs.lock().unwrap().len(),
        1 + MAX_SPAWN_FAILURES as usize
    );
}

#[test]
fn a_start_that_fails_then_succeeds_reattaches() {
    let (s, _ports, log) = session(
        &[
            Start::Ok(Some(SSH_ERROR_EXIT)),
            Start::Fail,
            Start::Fail,
            Start::Ok(Some(SSH_ERROR_EXIT)),
        ],
        Wait::Up,
    );
    terminal_ends(&s);
    assert_eq!(count(&log, "exit"), 0, "{:?}", entries(&log));
    assert!(entries(&log).contains(&"spawn 4".to_string()));
    assert!(s.shared.inner.lock().unwrap().is_some());
}

#[test]
fn a_new_terminal_gets_the_last_size() {
    let (s, _ports, log) = session(&[], Wait::Up);
    s.resize(140, 39).unwrap();
    terminal_ends(&s);
    assert!(
        entries(&log).contains(&"resize 2 140x39".to_string()),
        "{:?}",
        entries(&log)
    );
}

#[test]
fn the_back_off_is_read_from_the_sessions_own_state() {
    // A re-attach that dies quickly backs off from the STORED delay; `on_inner_exit` feeds
    // `reconnect` from `reconnect_plan` over the session's own fields.
    let (s, _ports, _log) = session(&[], Wait::Up);
    terminal_ends(&s); // first drop: a new drop, attempt at once, spawn 2 attached
    assert_eq!(*s.shared.retry_delay.lock().unwrap(), Duration::ZERO);
    *s.shared.attached_at.lock().unwrap() = Some(Instant::now()); // spawn 2 just attached
                                                                  // spawn 2 dies at once: backs off (the stored delay grows), with no new notice.
    let shared = Arc::clone(&s.shared);
    let t = thread::spawn(move || on_inner_exit(shared));
    thread::sleep(Duration::from_millis(50));
    assert_eq!(
        *s.shared.retry_delay.lock().unwrap(),
        RECONNECT_MIN_INTERVAL
    );
    s.kill().unwrap(); // end the back-off wait
    t.join().unwrap();
}

// ── The close ────────────────────────────────────────────────────────────────────────────────

#[test]
fn a_close_marks_itself_kills_the_terminal_then_ends_the_remote_session() {
    // R-1 + the respawn race: the close is marked for its whole length, and the remote session is
    // ended AFTER the terminal's own `/exit`.
    let (s, _ports, log) = session(&[], Wait::Up);
    s.kill().unwrap();
    let e = entries(&log);
    let begin = e
        .iter()
        .position(|x| x == "begin_close")
        .expect("marks the close");
    let local = e
        .iter()
        .position(|x| x == "kill 1")
        .expect("kills the terminal");
    let end = e
        .iter()
        .position(|x| x == "end_session")
        .expect("ends the remote session");
    assert!(begin < local && local < end, "{e:?}");
}

#[test]
fn a_close_whose_remote_end_fails_still_closes() {
    let (s, ports, log) = session(&[], Wait::Up);
    *ports.end.lock().unwrap() = Some(CloseExecError::LinkNotUp);
    assert!(s.kill().is_ok());
    assert!(entries(&log).contains(&"kill 1".to_string()));
}

/// The reattach can reach the outside world ONLY through [`RemotePorts`] (it holds no
/// `AppHandle`), so it cannot change the session's retained drive mode, which lives on the
/// session registry's entry (M17 WP4 AC-5.2). A SOURCE question about the trait's surface: no
/// method of it, nor of the app's implementation, names the registry or the mode. The rest of the
/// old guard is now structural: `RemoteShared` has no `app` field to reach anything else through.
#[test]
fn the_reattachs_only_way_out_names_no_registry_or_drive_mode() {
    let src = include_str!("../remote.rs");
    let block = |sig: &str| -> String {
        let start = src
            .find(sig)
            .unwrap_or_else(|| panic!("{sig} moved; re-scope this guard"));
        let body = &src[start..];
        body[..body.find("\n}\n").expect("terminates")]
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    for sig in [
        "pub(crate) trait RemotePorts: Send + Sync {",
        "impl RemotePorts for AppPorts {",
        "pub(crate) struct RemoteShared {",
    ] {
        let code = block(sig);
        let idents: Vec<&str> = code
            .split(|c: char| !(c.is_alphanumeric() || c == '_'))
            .collect();
        for forbidden in [
            "drive_mode",
            "Registry",
            "SessionRegistry",
            "DriveMode",
            "CLAUDESK_DRIVE_MODE",
            "AppHandle",
        ] {
            assert!(
                !idents.contains(&forbidden),
                "{sig} mentions {forbidden}: a reattach must not reach the retained mode"
            );
        }
    }
    // Positive control: the guard sees the AppHandle where it IS (the app's ports).
    assert!(block("struct AppPorts {").contains("app: AppHandle,"));
}

// ── The local record (M17 WP5 AC-1.2) ────────────────────────────────────────────────────────

fn records(log: &Arc<Mutex<Vec<String>>>) -> Vec<String> {
    entries(log)
        .into_iter()
        .filter(|e| e.starts_with("record "))
        .collect()
}

#[test]
fn cc_exiting_on_its_own_records_the_session_ended() {
    let (s, _ports, log) = session(&[Start::Ok(Some(0))], Wait::Up);
    terminal_ends(&s);
    assert_eq!(records(&log), ["record Ended"]);
}

#[test]
fn a_drop_records_nothing_the_session_is_still_running() {
    let (s, _ports, log) = session(&[], Wait::Up);
    terminal_ends(&s);
    assert!(records(&log).is_empty(), "{:?}", entries(&log));
    // ...and neither does a reconnect that gives up: the session may still run on the host.
    let (s, _ports, log) = session(&[], Wait::Stopped);
    terminal_ends(&s);
    assert_eq!(count(&log, "exit"), 1);
    assert!(records(&log).is_empty(), "{:?}", entries(&log));
}

#[test]
fn a_close_whose_end_ran_records_ended_and_one_that_could_not_records_end_pending() {
    let (s, _ports, log) = session(&[], Wait::Up);
    s.kill().unwrap();
    terminal_ends(&s); // the closed terminal's end adds nothing
    assert_eq!(records(&log), ["record Ended"]);

    let (s, ports, log) = session(&[], Wait::Up);
    *ports.end.lock().unwrap() = Some(CloseExecError::LinkNotUp);
    s.kill().unwrap();
    terminal_ends(&s);
    assert_eq!(records(&log), ["record EndPending"]);
}

// ── A start that found a session, an attach that found none (M17 WP5 AC-3.5) ─────────────────

#[test]
fn a_start_that_found_a_live_session_touches_nothing_and_says_so() {
    let exists = Some(crate::remote_cmd::EXIT_SESSION_EXISTS);
    let (s, _ports, log) = session(&[Start::Ok(exists)], Wait::Up);
    s.mark_ready();
    terminal_ends(&s);
    let e = entries(&log);
    assert!(
        records(&log).is_empty(),
        "the live session's record is untouched: {e:?}"
    );
    assert!(
        e.iter()
            .any(|x| x.contains("already running on mini") && x.contains("reconnect")),
        "{e:?}"
    );
    assert_eq!(count(&log, "exit"), 1);
    assert!(
        !e.contains(&"wait_up".to_string()),
        "never reconnects: {e:?}"
    );
}

#[test]
fn an_attach_that_found_no_session_records_it_ended_and_says_so() {
    let gone = Some(crate::remote_cmd::EXIT_NO_SESSION);
    let (s, _ports, log) = session(&[Start::Ok(gone)], Wait::Up);
    s.mark_ready();
    terminal_ends(&s);
    assert_eq!(records(&log), ["record Ended"]);
    assert!(entries(&log)
        .iter()
        .any(|x| x.contains("the session on mini has ended") && x.contains("resume")));
    assert_eq!(count(&log, "exit"), 1);
}

#[test]
fn a_notice_written_before_the_pane_listens_is_delivered_when_it_does() {
    let gone = Some(crate::remote_cmd::EXIT_NO_SESSION);
    let (s, _ports, log) = session(&[Start::Ok(gone)], Wait::Up);
    terminal_ends(&s); // ends before the frontend subscribed
    let notices = |log: &Arc<Mutex<Vec<String>>>| {
        entries(log)
            .iter()
            .filter(|x| x.starts_with("notice "))
            .count()
    };
    assert_eq!(notices(&log), 0);
    s.mark_ready();
    assert_eq!(notices(&log), 1, "{:?}", entries(&log));
    s.mark_ready();
    assert_eq!(notices(&log), 1, "delivered once");
}

#[test]
fn a_reconnect_on_open_attaches_and_a_start_starts() {
    // M17 WP5 (AC-3.2, AC-3.5), verified live at Phase 1.
    let argv = |attach| {
        session_argv(
            attach,
            Path::new("/AD/ssh/abcd1234"),
            "me@mini-host",
            "/Users/me",
            "com.claudesk.app.dev",
            "cd-12345678",
            "/Users/me/proj",
            Some("fsd"),
            &["claude".to_string(), "--continue".to_string()],
        )
        .join(" ")
    };
    let attach = argv(RemoteOpen::Attach(crate::remote_cmd::SessionMode::Unknown));
    assert!(
        attach.contains("attach -t") && attach.contains("=cd-12345678"),
        "{attach}"
    );
    assert!(
        !attach.contains(" new ") && !attach.contains("--continue"),
        "{attach}"
    );
    assert!(
        !attach.contains("CLAUDESK_DRIVE_MODE"),
        "an attach carries no spawn env: {attach}"
    );
    let start = argv(RemoteOpen::Start);
    assert!(
        start.contains(" new -s ") && start.contains("--continue"),
        "{start}"
    );
    assert!(start.contains("CLAUDESK_DRIVE_MODE=fsd"), "{start}");
}

// ── Detach (M17 WP5 Phase 3, AC-4) ───────────────────────────────────────────────────────────

#[test]
fn detach_hangs_up_the_terminal_and_touches_nothing_remote() {
    // AC-4.1: no `/exit` (the terminal's own `kill`), no close mark, no remote end, and AC-4.2: no
    // record write (the record stays `running`, so the next open labels Reconnect).
    let (s, _ports, log) = session(&[], Wait::Up);
    assert!(CcSession::can_detach(&s));
    let before = entries(&log).len();
    CcSession::detach(&s).unwrap();
    assert_eq!(entries(&log)[before..], ["hang_up 1".to_string()]);
    // The hung-up terminal's end is the session's end: never a reconnect, exactly one exit, and
    // still no record.
    terminal_ends(&s);
    let e = entries(&log);
    assert_eq!(count(&log, "exit"), 1, "{e:?}");
    assert!(
        !e.iter().any(|x| x.starts_with("spawn 2")),
        "no re-attach: {e:?}"
    );
    assert!(
        !e.iter().any(|x| x == "edge Lost"),
        "no reconnect overlay: {e:?}"
    );
    for remote in ["kill 1", "begin_close", "end_session"] {
        assert!(!e.contains(&remote.to_string()), "`{remote}`: {e:?}");
    }
    assert!(records(&log).is_empty(), "{e:?}");
}

#[test]
fn detach_with_the_link_down_cancels_the_reconnect_wait_and_touches_nothing_remote() {
    // AC-4.3: the link is down, the terminal is gone and the session waits to re-attach; a Detach
    // ends that wait (no re-attach ever spawns) and asks nothing of the host.
    let (s, ports, log) = session(&[], Wait::UntilCancelled);
    ports.link_up.store(false, Ordering::SeqCst);
    let shared = Arc::clone(&s.shared);
    let (done_tx, done) = std::sync::mpsc::channel();
    let t = thread::spawn(move || {
        on_inner_exit(shared);
        let _ = done_tx.send(());
    });
    while !entries(&log).contains(&"wait_up".to_string()) {
        thread::sleep(Duration::from_millis(2));
    }
    assert!(s.shared.inner.lock().unwrap().is_none(), "reconnecting");
    CcSession::detach(&s).unwrap();
    // Bounded: a Detach that did not cancel the wait FAILS here instead of hanging the suite.
    assert!(
        done.recv_timeout(Duration::from_secs(2)).is_ok(),
        "the Detach ended the reconnect wait"
    );
    t.join().unwrap();
    let e = entries(&log);
    assert!(
        !e.iter().any(|x| x.starts_with("spawn 2")),
        "no re-attach: {e:?}"
    );
    for remote in ["hang_up 1", "kill 1", "begin_close", "end_session"] {
        assert!(!e.contains(&remote.to_string()), "`{remote}`: {e:?}");
    }
    assert!(records(&log).is_empty(), "{e:?}");
}

/// M17 WP5 Phase 3 (P3.verify-self.1) — the REAL terminal's Detach seam. The detach tests above
/// drive `RemoteCcSession::detach` against a recording `FakeTerm`; what reaches the real `ssh`
/// terminal is `impl RemoteTerminal for PtyCcSession`, and a `PtyCcSession` cannot be built in a
/// test (it needs a live `AppHandle`). Its two teardown methods are one-line delegations, so they
/// are pinned by EXACT equality: any edit (e.g. `hang_up` → `CcSession::kill`, which would make a
/// real Detach cancel copy-mode and type `/exit`, found by a fresh verify-self runner) fails here.
/// What `PtyCcSession::hang_up` itself walks is pinned in `cc_session::tests::
/// hang_up_is_the_kill_sequence_without_the_clean_exit`.
#[test]
fn the_real_terminal_hangs_up_without_exit_and_kills_with_it() {
    let src = include_str!("../remote.rs");
    let start = src
        .find("impl RemoteTerminal for PtyCcSession {")
        .expect("the real terminal's impl moved; re-scope this guard");
    let block = &src[start..];
    let block = &block[..block.find("\n}\n").expect("terminates")];
    let body_of = |sig: &str| -> String {
        let at = block
            .find(sig)
            .unwrap_or_else(|| panic!("`{sig}` not in the real terminal's impl"));
        let rest = &block[at + sig.len()..];
        rest[..rest.find("\n    }").expect("method terminates")]
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect()
    };
    assert_eq!(
        body_of("fn hang_up(&self) -> Result<(), CcError> {"),
        "PtyCcSession::hang_up(self)",
        "Detach must reach the no-`/exit` teardown"
    );
    assert_eq!(
        body_of("fn kill(&self) -> Result<(), CcError> {"),
        "CcSession::kill(self)",
        "a close keeps its `/exit`"
    );
}

// ── Closed while offline (M17 WP5 Phase 4, AC-5.3) ─────────────────────────────────────────

#[test]
fn a_close_that_could_not_end_the_session_tells_the_app_once_and_one_that_did_does_not() {
    let told = |log: &Arc<Mutex<Vec<String>>>| {
        entries(log)
            .into_iter()
            .filter(|e| e.starts_with("close_not_ended"))
            .collect::<Vec<_>>()
    };
    // Ended: no notice.
    let (s, _ports, log) = session(&[], Wait::Up);
    s.kill().unwrap();
    terminal_ends(&s);
    assert_eq!(told(&log), Vec::<String>::new(), "{:?}", entries(&log));
    // Not delivered (the link is down) and failed: end-pending AND one notice, after the record,
    // carrying WHY (paydown-2026-11-27 WP8: the toast used to say "unreachable" for both).
    for (err, why) in [
        (CloseExecError::LinkNotUp, "close_not_ended Unreachable"),
        (
            CloseExecError::Run(crate::subprocess::RunError::TimedOut(1)),
            "close_not_ended Failed",
        ),
    ] {
        let (s, ports, log) = session(&[], Wait::Up);
        *ports.end.lock().unwrap() = Some(err);
        s.kill().unwrap();
        terminal_ends(&s);
        let e = entries(&log);
        assert_eq!(told(&log), vec![why.to_string()], "{e:?}");
        let rec = e
            .iter()
            .position(|x| x == "record EndPending")
            .expect("recorded");
        let notice = e.iter().position(|x| x == why).unwrap();
        assert!(rec < notice, "{e:?}");
    }
    // A Detach is not a close: no notice.
    let (s, _ports, log) = session(&[], Wait::Up);
    CcSession::detach(&s).unwrap();
    terminal_ends(&s);
    assert_eq!(told(&log), Vec::<String>::new());
}

/// The close-not-ended event's wire contract, pinned on both sides: the name the TS mirror listens
/// for, and the camelCase payload it reads.
#[test]
fn the_close_not_ended_event_matches_its_ts_mirror() {
    let ts = include_str!("../../../../src/state/remoteCloseNotEnded.ts");
    assert!(ts.contains(&format!(
        "REMOTE_CLOSE_NOT_ENDED_EVENT = \"{REMOTE_CLOSE_NOT_ENDED_EVENT}\""
    )));
    for (reason, wire) in [
        (CloseNotEndedReason::Unreachable, "unreachable"),
        (CloseNotEndedReason::Failed, "failed"),
    ] {
        let v = serde_json::to_value(RemoteCloseNotEnded {
            project_path: "ssh://me@mini-host/p".into(),
            host: "mini-host".into(),
            project: "p".into(),
            reason,
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({
                "projectPath": "ssh://me@mini-host/p",
                "host": "mini-host",
                "project": "p",
                "reason": wire,
            })
        );
    }
    assert!(ts.contains("projectPath: string;") && ts.contains("host: string;"));
    // paydown-2026-11-27 WP8 — the two new fields, with the reason's closed set spelled the same.
    assert!(ts.contains("project: string;"));
    assert!(ts.contains(r#"reason: "unreachable" | "failed";"#));
}

/// `project_label` names a remote project the way its picker row does: the path's last segment.
#[test]
fn project_label_is_the_paths_last_segment() {
    assert_eq!(project_label("/Users/me/work/proj"), "proj");
    assert_eq!(project_label("~/work/proj/"), "proj");
    assert_eq!(project_label("~"), "~");
    assert_eq!(project_label("/"), "/");
}
