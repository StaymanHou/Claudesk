//! A child process run to completion with its output captured: stdin written, stdout and stderr
//! drained while it runs, a hard deadline that kills its whole process group, and output capped
//! at [`MAX_OUTPUT`].
//!
//! Callers: `adjudicator` (`claude -p`, M15) and `remote_cmd` / `remote_link` (one-shot `ssh`
//! execs, M17). Each picks the program and args and maps [`RunError`] to its own words. Moved
//! here from `adjudicator` at M17 WP3 so the ssh side stops borrowing an unrelated subsystem's
//! types (the WP2 review's `…-SSH-RUNNER-BORROWS-ADJUDICATOR-TYPES`).

use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use super::{in_own_group, kill_and_reap, StopOnDrop, DRAIN_GRACE, MAX_OUTPUT};

/// Why a captured run produced no output.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunError {
    /// The program could not be spawned because it does not exist (not installed, or not on
    /// `PATH`). Carries the `PATH` searched.
    NotFound(String),
    /// It ran but exceeded the timeout (ms). ⚠️ The child is killed before returning.
    TimedOut(u64),
    /// It ran and exited non-zero (`code` is `None` when a signal ended it).
    Failed { code: Option<i32>, stderr: String },
    /// The spawn itself failed for some other reason (pipe, permissions, a thread spawn, …).
    Spawn(String),
    /// It succeeded but wrote more than [`MAX_OUTPUT`] bytes to stdout. ⚠️ An error, never a
    /// truncated `Ok`: output past the cap would otherwise vanish from a result that looks whole.
    OutputTooLarge(usize),
}

impl std::fmt::Display for RunError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(p) => write!(f, "not found on PATH ({p})"),
            Self::TimedOut(ms) => write!(f, "timed out after {ms}ms"),
            Self::Failed { code, stderr } => write!(
                f,
                "exited {} ({})",
                code.map(|c| c.to_string())
                    .unwrap_or_else(|| "signal".into()),
                stderr.trim()
            ),
            Self::Spawn(e) => write!(f, "could not be spawned: {e}"),
            Self::OutputTooLarge(n) => write!(f, "wrote more than {n} bytes of output"),
        }
    }
}

/// How often the wait loop polls for child exit.
const POLL_MS: u64 = 50;

/// Spawn `cmd`, write `prompt` to its stdin, and wait up to `timeout_ms` for its stdout.
///
/// The adjudicator (`claude -p`) and the M17 remote execs (`ssh`) both run through this one loop;
/// each caller chooses only the program and its args, and maps [`RunError`] to its own words.
///
/// ⚠️ **All three pipes are serviced on their OWN threads, and the deadline starts before any of
/// them.** With the prompt written on this thread and both output pipes read only after exit,
/// this would hang past `timeout_ms` or forever:
/// - a child that wrote more than a pipe buffer (64 KB) before exiting blocked on its own write
///   and never exited;
/// - a child that never read stdin blocked `write_all` before the deadline even started.
///
/// Each shape has a test below.
///
/// ⚠️ What the group kill cannot reach is listed once, in `crate::subprocess`. Specific to here:
/// - **A parked drain or writer** (its pipe held by a quiet grandchild) holds at most one capped
///   buffer, or one copy of the prompt (uncapped, as the prompt is the caller's own input).
/// - **A grandchild writing to the same pipe** during the grace is mixed into the output. If it
///   floods past [`MAX_OUTPUT`], the result is [`RunError::OutputTooLarge`], not the
///   answer.
///
pub fn run_captured(mut cmd: Command, prompt: &str, timeout_ms: u64) -> Result<String, RunError> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    // Its own process group, so a timeout can kill everything it started.
    let mut child = match in_own_group(&mut cmd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(RunError::NotFound(
                std::env::var("PATH").unwrap_or_default(),
            ));
        }
        Err(e) => return Err(RunError::Spawn(e.to_string())),
    };

    // ⚠️ Every thread spawn below can fail, and a failure after the child exists must not leave
    // it running: `reap` kills and waits before the error returns.
    let reap = |child: &mut Child, e: std::io::Error| {
        kill_and_reap(child);
        RunError::Spawn(e.to_string())
    };
    if let Some(mut stdin) = child.stdin.take() {
        let bytes = prompt.as_bytes().to_vec();
        let writer = std::thread::Builder::new().spawn(move || {
            // ⚠️ A write error is NOT fatal on its own: `claude` may have already read enough
            // and closed the pipe, and a killed child breaks it. The exit status decides.
            let _ = stdin.write_all(&bytes);
            // Dropping closes the pipe, which is what makes `claude -p` start work.
        });
        if let Err(e) = writer {
            return Err(reap(&mut child, e));
        }
    }
    // Set when this function returns on ANY path, which is what ends a drain that a grandchild
    // keeps fed (and so gives that grandchild its SIGPIPE).
    let stop = StopOnDrop::default();
    let stdout_drain = match Drain::spawn(child.stdout.take(), &stop) {
        Ok(d) => d,
        Err(e) => return Err(reap(&mut child, e)),
    };
    let stderr_drain = match Drain::spawn(child.stderr.take(), &stop) {
        Ok(d) => d,
        Err(e) => return Err(reap(&mut child, e)),
    };

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    // ⚠️ Kill the whole group, then reap. Otherwise every timeout leaves a zombie and
                    // anything the child started (`claude`'s hooks and MCP servers, an `ssh`'s
                    // ProxyCommand), and the callers run this per fire / per remote exec.
                    kill_and_reap(&mut child);
                    return Err(RunError::TimedOut(timeout_ms));
                }
                std::thread::sleep(Duration::from_millis(POLL_MS));
            }
            Err(e) => {
                kill_and_reap(&mut child);
                return Err(RunError::Spawn(e.to_string()));
            }
        }
    };

    // ⚠️ The child has exited, and the drains have been reading all along, so everything IT
    // wrote is in their buffers or about to be. A grandchild it left behind (`cmd &`) can still
    // hold a pipe open, so EOF may never come. Wait for both drains, but only for a short grace,
    // and keep whatever arrived. Waiting for EOF instead discarded a good answer, lost the
    // stderr of a failure, and overran the timeout ~3x.
    let (out, err) = collect_both(&stdout_drain, &stderr_drain, Instant::now() + DRAIN_GRACE);
    if !status.success() {
        // The one diagnostic an operator gets for a failing `claude -p`. A cut
        // stderr says so; it is a diagnostic, so its head is still worth returning.
        let mut stderr = String::from_utf8_lossy(&err).into_owned();
        if stderr_drain.overflowed() {
            stderr.push_str(&format!("\n[stderr truncated at {MAX_OUTPUT} bytes]"));
        }
        return Err(RunError::Failed {
            code: status.code(),
            stderr,
        });
    }
    if stdout_drain.overflowed() {
        return Err(RunError::OutputTooLarge(MAX_OUTPUT));
    }
    Ok(String::from_utf8_lossy(&out).into_owned())
}

/// One pipe, read continuously on its own thread from the moment the child spawns.
///
/// ⚠️ **The thread must never stop reading while the child runs.** A pipe the reader stops
/// emptying fills (64 KB), and then the CHILD blocks on its own write and never exits. That
/// deadlock is what a `sync_channel` nobody drained during the wait produced (~45–205 KB of the
/// child's own output was enough). So memory is bounded by DISCARDING past [`MAX_OUTPUT`], never by
/// backpressure on the pipe.
struct Drain {
    buf: std::sync::Arc<std::sync::Mutex<Vec<u8>>>,
    done: std::sync::Arc<std::sync::atomic::AtomicBool>,
    /// Set when bytes past [`MAX_OUTPUT`] were discarded, so a cut result is never mistaken
    /// for a whole one.
    overflowed: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl Drain {
    fn spawn<R: std::io::Read + Send + 'static>(
        pipe: Option<R>,
        stop: &StopOnDrop,
    ) -> std::io::Result<Drain> {
        use std::sync::atomic::Ordering;
        let d = Drain {
            buf: Default::default(),
            done: Default::default(),
            overflowed: Default::default(),
        };
        let (buf, done, overflowed, stop) = (
            d.buf.clone(),
            d.done.clone(),
            d.overflowed.clone(),
            stop.flag(),
        );
        std::thread::Builder::new().spawn(move || {
            if let Some(mut p) = pipe {
                let mut chunk = [0u8; 8192];
                while !stop.load(Ordering::SeqCst) {
                    let n = match p.read(&mut chunk) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => n,
                    };
                    if let Ok(mut b) = buf.lock() {
                        let room = MAX_OUTPUT.saturating_sub(b.len());
                        if n > room {
                            overflowed.store(true, Ordering::SeqCst);
                        }
                        b.extend_from_slice(&chunk[..n.min(room)]);
                    }
                }
            }
            done.store(true, Ordering::SeqCst);
        })?;
        Ok(d)
    }

    fn is_done(&self) -> bool {
        self.done.load(std::sync::atomic::Ordering::SeqCst)
    }

    fn take(&self) -> Vec<u8> {
        self.buf
            .lock()
            .map(|mut b| std::mem::take(&mut *b))
            .unwrap_or_default()
    }

    fn overflowed(&self) -> bool {
        self.overflowed.load(std::sync::atomic::Ordering::SeqCst)
    }
}

/// Wait until both drains reach EOF or `until` passes, whichever is first, then take what each
/// has read (at most [`MAX_OUTPUT`] bytes apiece).
fn collect_both(out: &Drain, err: &Drain, until: Instant) -> (Vec<u8>, Vec<u8>) {
    while !(out.is_done() && err.is_done()) && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(5));
    }
    (out.take(), err.take())
}

#[cfg(test)]
mod tests {
    use super::*;

    // These drive `run_captured` — the SAME spawn/stdin/wait/kill code the adjudicator and the
    // remote execs run — with `sh -c <script>` standing in for the real program. (They moved here
    // with the loop from `adjudicator` at M17 WP3.)
    fn sh(script: &str) -> Command {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg(script);
        cmd
    }

    #[test]
    fn the_prompt_reaches_stdin_and_stdout_comes_back() {
        // `cat` echoes stdin, so the Ok value is the prompt only if it was written AND the pipe
        // was closed (otherwise `cat` never exits and this times out instead).
        let out = run_captured(sh("cat"), "judge this turn", 5_000).expect("cat must succeed");
        assert_eq!(out, "judge this turn");
    }

    #[test]
    fn a_non_zero_exit_is_failed_with_its_code() {
        let err = run_captured(sh("exit 3"), "", 5_000).expect_err("exit 3 must be an Err");
        assert!(
            matches!(err, RunError::Failed { code: Some(3), .. }),
            "got {err:?}"
        );
    }

    #[test]
    fn a_non_zero_exit_carries_the_captured_stderr() {
        // The stderr is what the `Display` impl renders; an empty one prints `()` and tells the
        // operator nothing about why `claude -p` failed.
        let err = run_captured(sh("echo boom >&2; exit 3"), "", 5_000)
            .expect_err("exit 3 must be an Err");
        match &err {
            RunError::Failed { code, stderr } => {
                assert_eq!(*code, Some(3));
                assert_eq!(stderr.trim(), "boom");
            }
            other => panic!("expected Failed, got {other:?}"),
        }
        assert!(err.to_string().contains("boom"), "Display: {err}");
    }

    #[test]
    fn a_child_that_fills_its_stderr_pipe_still_completes() {
        // 200 KB is well past a pipe buffer (64 KB on macOS). If stderr is not drained WHILE the
        // child runs, the child blocks on its write, never exits, and this times out instead.
        let start = Instant::now();
        let out = run_captured(sh("head -c 200000 /dev/zero >&2; echo done"), "", 5_000)
            .expect("a noisy-but-successful child must be Ok");
        assert_eq!(out.trim(), "done");
        assert!(
            start.elapsed() < Duration::from_secs(4),
            "{:?}",
            start.elapsed()
        );
    }

    #[test]
    fn a_child_that_fills_its_stdout_pipe_returns_all_of_it() {
        // ⚠️ 1 MiB, not 200 KB. A reader that stalls during the wait lets the child write the
        // pipe buffer plus whatever the reader has queued before it blocks. That was ~205 KB for
        // a bounded-channel reader, so a 200 KB fixture passed it by 4.8 KB and pinned
        // nothing. The size must be far past ANY plausible in-flight buffer.
        let out = run_captured(sh("head -c 1048576 /dev/zero | tr '\\0' x"), "", 5_000)
            .expect("a large stdout must be Ok");
        assert_eq!(out.len(), 1_048_576);
    }

    #[test]
    fn a_failing_child_with_a_large_stderr_keeps_its_code_and_its_stderr() {
        let err = run_captured(
            sh("head -c 1048576 /dev/zero | tr '\\0' e >&2; exit 5"),
            "",
            5_000,
        )
        .expect_err("exit 5 must be an Err");
        match err {
            RunError::Failed { code, stderr } => {
                assert_eq!(code, Some(5));
                assert_eq!(stderr.len(), 1_048_576);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    #[test]
    fn many_small_writes_are_all_collected() {
        // Small writes mean small reads, so a stall shows up at far fewer bytes (44–89 KB of
        // `echo` lines deadlocked the bounded-channel version).
        let out = run_captured(
            sh("i=0; while [ $i -lt 20000 ]; do echo line; i=$((i+1)); done"),
            "",
            10_000,
        )
        .expect("20000 lines must be Ok");
        assert_eq!(out.lines().count(), 20_000);
    }

    #[test]
    fn a_large_prompt_is_echoed_back_whole() {
        // Writer and reader run at once: `cat` can only consume the prompt if its output is
        // being drained at the same time.
        let prompt = "p".repeat(1024 * 1024);
        let out = run_captured(sh("cat"), &prompt, 5_000).expect("cat must succeed");
        assert_eq!(out.len(), prompt.len());
    }

    #[test]
    fn a_child_that_never_reads_stdin_still_times_out_on_schedule() {
        // 2 MiB is far past the pipe buffer, so a `write_all` on the calling thread blocks
        // until the child reads, which `sleep` never does. The deadline must cover the write.
        //
        // Run on its own thread with a deadline: the regression this pins is a HANG, and a hung
        // test stalls the whole gate instead of failing it.
        let prompt = "x".repeat(2 * 1024 * 1024);
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(run_captured(sh("sleep 30"), &prompt, 1_000));
        });
        let result = rx
            .recv_timeout(Duration::from_secs(4))
            .expect("run_captured hung past its own 1s timeout (the stdin write is not bounded)");
        assert_eq!(result, Err(RunError::TimedOut(1_000)));
    }

    #[test]
    fn a_grandchild_holding_the_pipes_does_not_discard_a_failing_exit() {
        // `sleep 6 &` inherits both pipes, so neither reaches EOF when the shell exits. The exit
        // code and the stderr already written must still come back, well inside the timeout
        // plus the drain grace.
        let start = Instant::now();
        let err = run_captured(sh("echo boom >&2; sleep 6 & exit 3"), "", 1_000)
            .expect_err("exit 3 must be an Err");
        assert_eq!(
            err,
            RunError::Failed {
                code: Some(3),
                stderr: "boom\n".into()
            }
        );
        assert!(
            start.elapsed() < Duration::from_millis(1_400),
            "{:?}",
            start.elapsed()
        );
    }

    #[test]
    fn a_grandchild_holding_a_pipe_does_not_discard_a_successful_answer() {
        // The child succeeded; only its background grandchild still holds stderr.
        let start = Instant::now();
        let out = run_captured(sh("sleep 6 >/dev/null & echo answer"), "", 1_000)
            .expect("a successful exit must be Ok even with a pipe still held");
        assert_eq!(out, "answer\n");
        assert!(
            start.elapsed() < Duration::from_millis(1_400),
            "{:?}",
            start.elapsed()
        );
    }

    #[test]
    fn a_grandchild_flooding_a_pipe_cannot_stretch_the_wait_or_the_memory() {
        // `yes` never stops writing, so a drain loop that only checks the grace between empty
        // reads never sees it, and an unbounded buffer grows without limit: 1.58s and a 1.9 GB
        // `Ok` were measured before the bound.
        //
        // On its own thread with a deadline: a regression here HANGS (the drain never reaches
        // EOF), and a hung test stalls the gate instead of failing it (a mutant did exactly that).
        let start = Instant::now();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(run_captured(sh("yes zzflood & echo answer"), "", 1_000));
        });
        let result = rx
            .recv_timeout(Duration::from_secs(3))
            .expect("run_captured hung on a flooding grandchild");
        // Past the cap the answer cannot be trusted to be whole, so it is an error, not a
        // truncated `Ok`.
        assert_eq!(result, Err(RunError::OutputTooLarge(MAX_OUTPUT)));
        assert!(
            start.elapsed() < Duration::from_millis(1_400),
            "{:?}",
            start.elapsed()
        );
    }

    #[test]
    fn a_timeout_kills_the_grandchildren_too() {
        // Killing only the direct child left its `sleep` running (measured), adopted
        // by launchd. `claude` starts hook and MCP subprocesses, so one leaked per timed-out fire.
        let dir = tempfile::TempDir::new().expect("tempdir");
        let pidfile = dir.path().join("pid");
        let script = format!("sleep 30 & echo $! > '{}'; wait", pidfile.display());
        let err = run_captured(sh(&script), "", 500).expect_err("must time out");
        assert_eq!(err, RunError::TimedOut(500));
        let pid: i32 = std::fs::read_to_string(&pidfile)
            .expect("the script recorded its grandchild")
            .trim()
            .parse()
            .expect("a pid");
        let gone = (0..40).any(|_| {
            // SAFETY: signal 0 only checks that the pid exists; nothing is delivered.
            let alive = unsafe { libc::kill(pid, 0) } == 0;
            if alive {
                std::thread::sleep(Duration::from_millis(25));
            }
            !alive
        });
        if !gone {
            // SAFETY: the pid is our own test's grandchild; clean it up before failing.
            unsafe { libc::kill(pid, libc::SIGKILL) };
        }
        assert!(gone, "grandchild {pid} outlived the timeout");
    }

    #[test]
    fn collection_gives_up_at_its_deadline_and_keeps_what_arrived() {
        // A drain that never reaches EOF (a grandchild still holds the pipe) must not hold
        // collection past `until`, and what it already read must come back.
        let open = Drain {
            buf: std::sync::Arc::new(std::sync::Mutex::new(b"partial".to_vec())),
            done: Default::default(),
            overflowed: Default::default(),
        };
        let closed = Drain {
            buf: Default::default(),
            done: std::sync::Arc::new(true.into()),
            overflowed: Default::default(),
        };
        let start = Instant::now();
        let (out, err) = collect_both(&open, &closed, start + Duration::from_millis(100));
        assert!(
            start.elapsed() < Duration::from_millis(300),
            "{:?}",
            start.elapsed()
        );
        assert_eq!(
            (out.as_slice(), err.as_slice()),
            (&b"partial"[..], &b""[..])
        );
    }

    #[test]
    fn a_drain_caps_its_memory_keeps_reading_and_stops_when_told() {
        // An endless writer: the buffer stays capped, the thread keeps READING (so a real child
        // is never blocked on a full pipe), and it ends once the call's stop flag drops.
        struct Endless(std::sync::Arc<std::sync::atomic::AtomicUsize>);
        impl std::io::Read for Endless {
            fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                self.0
                    .fetch_add(buf.len(), std::sync::atomic::Ordering::SeqCst);
                buf.fill(b'x');
                Ok(buf.len())
            }
        }
        let read = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let stop = StopOnDrop::default();
        let d = Drain::spawn(Some(Endless(read.clone())), &stop).expect("thread spawns");
        std::thread::sleep(Duration::from_millis(200));
        let kept = d.buf.lock().expect("lock").len();
        assert_eq!(kept, MAX_OUTPUT, "the cap was not reached, or not enforced");
        // ⚠️ Well PAST the cap, not merely past it: a drain that quits at the cap still performs
        // one read beyond it, and `> MAX_OUTPUT` passed that mutant.
        let kept_reading = (0..100).any(|_| {
            std::thread::sleep(Duration::from_millis(10));
            read.load(std::sync::atomic::Ordering::SeqCst) > 3 * MAX_OUTPUT
        });
        assert!(
            kept_reading,
            "the drain stopped reading at the cap, which would block a real child"
        );
        drop(stop);
        let stopped = (0..40).any(|_| {
            std::thread::sleep(Duration::from_millis(10));
            d.is_done()
        });
        assert!(stopped, "the drain ignored its stop flag");
    }

    #[test]
    fn output_exactly_at_the_cap_is_whole_and_one_byte_past_it_is_an_error() {
        let at = run_captured(
            sh(&format!("head -c {MAX_OUTPUT} /dev/zero | tr '\\0' x")),
            "",
            10_000,
        )
        .expect("exactly the cap is still a whole answer");
        assert_eq!(at.len(), MAX_OUTPUT);
        let past = run_captured(
            sh(&format!(
                "head -c {} /dev/zero | tr '\\0' x",
                MAX_OUTPUT + 1
            )),
            "",
            10_000,
        );
        assert_eq!(past, Err(RunError::OutputTooLarge(MAX_OUTPUT)));
    }

    #[test]
    fn a_cut_stderr_says_it_was_cut() {
        let err = run_captured(
            sh(&format!(
                "head -c {} /dev/zero | tr '\\0' e >&2; exit 5",
                MAX_OUTPUT + 10
            )),
            "",
            10_000,
        )
        .expect_err("exit 5 must be an Err");
        match err {
            RunError::Failed { code, stderr } => {
                assert_eq!(code, Some(5));
                assert!(stderr.ends_with(&format!("[stderr truncated at {MAX_OUTPUT} bytes]")));
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    #[test]
    fn a_missing_binary_errors_rather_than_returning_empty_output() {
        // ⚠️ THE CONTRACT THIS PINS: a failure must be an `Err`, never `Ok("")`. An empty Ok
        // would reach the TS parser as an unparseable answer and withhold by ACCIDENT rather
        // than by the documented rule. Uses a name that cannot exist on PATH.
        let err = run_captured(Command::new("claudesk-no-such-binary-xyzzy"), "", 1_000)
            .expect_err("a missing binary must be an Err");
        assert!(matches!(err, RunError::NotFound(_)), "got {err:?}");
    }

    #[test]
    fn a_slow_child_times_out_and_is_reaped() {
        // ⚠️ `exec` so the killed pid IS the sleeper; a plain `sh -c 'sleep 30'` would leave the
        // sleep orphaned after its shell died. Without the kill, the reaping `wait()` blocks for
        // the full 30s, which the elapsed bound catches.
        let start = Instant::now();
        let err = run_captured(sh("exec sleep 30"), "", 300)
            .expect_err("a 30s child under a 300ms timeout must time out");
        assert!(matches!(err, RunError::TimedOut(300)), "got {err:?}");
        assert!(
            start.elapsed() < Duration::from_secs(5),
            "the timeout must kill the child, not wait for it to finish"
        );
    }
}
