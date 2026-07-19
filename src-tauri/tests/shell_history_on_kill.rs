//! End-to-end regression guard for M10.5 WP3's load-bearing invariant: killing a
//! right-panel shell session with **SIGHUP** preserves the shell's command history,
//! while **SIGKILL** loses it.
//!
//! ## Why this test exists (the Defect-B anchor)
//! The operator's zsh (system-default `/etc/zshrc`) has `SHARE_HISTORY` /
//! `INC_APPEND_HISTORY` **off**, so zsh writes `HISTFILE` **only on a clean/hangup
//! exit** — never incrementally. Before WP3, closing Claudesk terminated the shell in
//! a way that skipped that save, so closing without typing `exit` silently dropped the
//! terminal's command history. WP3 fixes this by making `PtyCcSession::kill()` deliver
//! **SIGHUP** (to the whole process group) with a grace window: SIGHUP triggers the
//! shell's on-exit history save; SIGTERM/SIGKILL do not.
//!
//! The `cc_session::tests` unit tests assert the kill *sequence policy* (SIGHUP-first,
//! group-targeted, bounded timing). This test proves the *effect* the policy exists to
//! produce, against a **real interactive `zsh -l -i` under a real PTY** — the one thing
//! a pure unit test can't demonstrate. A regression to SIGTERM (which compiles fine)
//! would silently re-break history; this test would catch it.
//!
//! ## Why an integration test (not `#[cfg(test)]`)
//! The behavior is a separate interactive process (a login shell) reacting to a POSIX
//! signal and running its exit handler — only reachable end-to-end. Mirrors the
//! `hook_pl_output.rs` precedent (drive the real external process the way production
//! does). Spawned via `portable-pty` exactly like production, so the shell is a
//! `setsid` session/group leader and we can signal its group the same way
//! `PtyCcSession::signal_group` does (`kill(-pgid, sig)`). Skips cleanly if `zsh` is
//! absent (it is bundled on macOS, the only supported platform).

use std::io::{Read, Write};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

fn zsh_available() -> bool {
    std::path::Path::new("/bin/zsh").exists()
}

/// Mirror of `cc_session::signal_group`: send `sig` to the process GROUP led by `pgid`
/// (`kill(-pgid, sig)`). The child spawned below is a `setsid` group leader, so `pgid`
/// == the child PID and this reaches the shell + any descendant.
fn signal_group(pgid: libc::pid_t, sig: libc::c_int) {
    unsafe {
        libc::kill(-pgid, sig);
    }
}

/// Outcome of one history-preservation trial.
enum HistOutcome {
    Saved,
    Lost,
}

/// Spawn a real interactive login `zsh` under a PTY (so it `setsid`s into its own group,
/// exactly like a Claudesk right-panel terminal), point its `HISTFILE` at `histfile`,
/// run one real command (entering it into history the way a user's keystroke does), then
/// signal its process group with `sig` and report whether the command reached `HISTFILE`.
///
/// **We EXECUTE a real `echo <marker>` command** (CR-terminated — CR is Enter in raw mode)
/// rather than `print -s`: only an *executed* command enters the history list that the
/// on-exit save flushes to `HISTFILE`. `print -s` pushes to the in-memory list by a
/// different path that the SIGHUP exit-save does not persist — using it here would make
/// the test wrongly report LOST even though the shipped fix is correct (the actual
/// user-behavior — running commands — was verified saving under SIGHUP at verify-human).
fn history_trial(home: &Path, marker: &str, sig: libc::c_int, grace: Duration) -> HistOutcome {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty");

    let mut cmd = CommandBuilder::new("/bin/zsh");
    cmd.arg("-l");
    cmd.arg("-i");
    // Isolate via HOME, NOT via a HISTFILE env var — this is load-bearing. macOS's
    // `/etc/zshrc` unconditionally reassigns `HISTFILE=${ZDOTDIR:-$HOME}/.zsh_history`
    // when the interactive login shell sources it, which OVERRIDES any `HISTFILE` env
    // we pass. If we set HISTFILE, the shell instead saves to the REAL `~/.zsh_history`
    // and this test reads an empty file → false LOST (even though the fix is correct).
    // Setting HOME makes `/etc/zshrc` resolve `$HOME/.zsh_history` to OUR temp dir, so we
    // read the file the shell actually wrote. (Root-caused in WP3 verify-codify via a
    // self-driven portable-pty harness that captured the shell's PTY output.)
    cmd.env("HOME", home.to_str().unwrap());
    cmd.env("HISTSIZE", "1000");
    cmd.env("SAVEHIST", "1000");

    let mut child = pair.slave.spawn_command(cmd).expect("spawn zsh");
    let pgid = child.process_id().expect("live child has a pid") as libc::pid_t;
    drop(pair.slave);

    let mut writer = pair.master.take_writer().expect("take writer");
    // Drain the PTY master on a background thread so the shell never blocks writing its
    // prompt/output into a full pty buffer (that would wedge it before/after the signal).
    // The reader ends on EOF once the shell exits and the master's last handle drops.
    let mut reader = pair.master.try_clone_reader().expect("clone reader");
    let drainer = thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
        }
    });

    // Let the shell reach its interactive prompt.
    thread::sleep(Duration::from_millis(800));
    // Run a real command (CR = Enter in raw mode) so it enters the executed-history list
    // that the shell's on-exit save flushes to HISTFILE — the way a user's typed command does.
    let _ = writer.write_all(format!("echo {marker}\r").as_bytes());
    let _ = writer.flush();
    thread::sleep(Duration::from_millis(400));

    // Signal the group with the signal under test, then wait the grace window for the
    // shell's exit handler (if any) to run its history save. Poll try_wait — never a
    // blocking wait() (which can hang if the pty isn't fully drained).
    signal_group(pgid, sig);
    let deadline = Instant::now() + grace;
    let mut reaped = false;
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            reaped = true;
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }
    // Backstop: ensure the process is gone regardless of the signal, so the test never
    // leaks a shell (SIGKILL the group; harmless if already dead).
    if !reaped {
        signal_group(pgid, libc::SIGKILL);
        // Bounded reap so we don't block forever.
        let hard = Instant::now() + Duration::from_millis(500);
        while Instant::now() < hard {
            if let Ok(Some(_)) = child.try_wait() {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
    }
    drop(writer);
    drop(pair.master);
    let _ = drainer.join();
    // Small settle so a SIGHUP-triggered async save lands on disk before we read.
    thread::sleep(Duration::from_millis(150));

    // Read the file the shell actually wrote: $HOME/.zsh_history (per the /etc/zshrc
    // HISTFILE resolution above), NOT a HISTFILE we tried to force.
    match std::fs::read_to_string(home.join(".zsh_history")) {
        Ok(contents) if contents.contains(marker) => HistOutcome::Saved,
        _ => HistOutcome::Lost,
    }
}

#[test]
fn sighup_to_group_saves_shell_history_but_sigkill_loses_it() {
    if !zsh_available() {
        eprintln!("/bin/zsh not available — skipping shell-history kill test");
        return;
    }

    // Each trial gets its own isolated HOME (so the shell's rc chain + $HOME/.zsh_history
    // are fully separate and the real ~/.zsh_history is never touched).
    let hup_home = tempfile::TempDir::new().unwrap();
    let kill_home = tempfile::TempDir::new().unwrap();

    // SIGHUP (WP3's chosen signal) with a grace window → the shell runs its on-exit
    // history save. This is exactly what `PtyCcSession::kill()`'s HupGroupThenGrace step
    // does. The 300ms grace mirrors `DEFAULT_KILL_TIMING.hup_grace`.
    let hup = history_trial(
        hup_home.path(),
        "WP3_HIST_UNDER_SIGHUP",
        libc::SIGHUP,
        Duration::from_millis(300),
    );
    assert!(
        matches!(hup, HistOutcome::Saved),
        "SIGHUP to the shell's process group MUST preserve command history \
         (this is the Defect-B fix; a regression to SIGTERM would fail here)"
    );

    // SIGKILL — the un-catchable signal — cannot trigger the save. This is the red
    // baseline the fix improves on: it proves the test actually discriminates (i.e. the
    // SAVED result above is caused by the signal choice, not by incremental history).
    let killed = history_trial(
        kill_home.path(),
        "WP3_HIST_UNDER_SIGKILL",
        libc::SIGKILL,
        Duration::from_millis(300),
    );
    assert!(
        matches!(killed, HistOutcome::Lost),
        "SIGKILL cannot run the shell's exit handler, so history must NOT be saved — \
         if this 'passes' as Saved, the shell has incremental history on and the test \
         no longer discriminates the signal choice"
    );
}
