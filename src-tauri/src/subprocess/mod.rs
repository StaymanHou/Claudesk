//! Process-group primitives shared by every subprocess runner here: `workflow_install::runner`
//! (git, `install.sh`, `uninstall.sh`) and `adjudicator` (`claude -p`).
//!
//! The shape both follow: the child leads its own process group, its pipes are read on their own
//! threads from the moment it spawns, and on a deadline (or an error after the spawn) the whole
//! group is SIGKILLed and the child reaped. After a normal exit, output still in flight is read
//! for [`DRAIN_GRACE`] more, because something the child left behind can hold a pipe open and EOF
//! may never come.
//!
//! The readers themselves differ on purpose and stay with their callers: the adjudicator keeps a
//! capped byte buffer it reads after exit, the install runner delivers each line live to a sink.
//!
//! ⚠️ **What a group kill does NOT do** (each measured, not assumed):
//! - **It does not reach processes that left the group.** A grandchild that calls `setsid`, or a
//!   background job under shell job control (`set -m`), is in another group and survives. Catching
//!   it would need descendant tracking.
//! - **It does not run on a NORMAL exit.** A clean exit's background jobs are the child's
//!   business; the kill runs only on the deadline, the drain-grace and the error paths.
//! - **A reader whose pipe a quiet grandchild holds stays parked** until that grandchild exits.
//!   No caller waits on it, and [`StopOnDrop`] ends it at its next read.
//!
//! ⚠️ Memory is bounded by DISCARDING past [`MAX_OUTPUT`], never by backpressure on the pipe: a
//! pipe nobody empties fills at 64 KB, and the child then blocks on its own write and never exits.

use std::os::unix::process::CommandExt;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// How long after the child exits to keep reading output that is still in flight. Past it, a
/// pipe is held by something the child left behind, and the caller stops waiting.
pub const DRAIN_GRACE: Duration = Duration::from_millis(250);

/// The most output a runner keeps. A grandchild can hold a pipe and write without end, and an
/// unbounded buffer turned that into a measured 1.9 GB allocation. Past it, output is dropped.
pub const MAX_OUTPUT: usize = 4 * 1024 * 1024;

/// Make `cmd`'s child the leader of a new process group, so [`kill_group`] reaches everything it
/// starts (short of what the module doc lists).
pub fn in_own_group(cmd: &mut Command) -> &mut Command {
    cmd.process_group(0)
}

/// SIGKILL the process group `pgid` (the child leads it, via [`in_own_group`]).
///
/// Works after the leader has been reaped too: a group lives while any member does, and the
/// members still alive are exactly what this is for.
pub fn kill_group(pgid: u32) {
    if let Ok(pgid) = libc::pid_t::try_from(pgid) {
        // SAFETY: a negative pid addresses the process group `pgid`. A failure (the group is
        // already gone) is harmless.
        unsafe {
            libc::kill(-pgid, libc::SIGKILL);
        }
    }
}

/// Kill the child's whole group, then reap the child, so neither a zombie nor anything it started
/// is left behind.
pub fn kill_and_reap(child: &mut Child) {
    kill_group(child.id());
    let _ = child.kill();
    let _ = child.wait();
}

/// Set on drop. Shared by the reader threads of one run, so every return path, the early error
/// ones included, tells them to stop.
#[derive(Default)]
pub struct StopOnDrop(Arc<AtomicBool>);

impl StopOnDrop {
    /// The flag a reader thread polls.
    pub fn flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.0)
    }

    /// Tell the readers to stop now, before the drop. Each then sends at most the line it is
    /// reading, so a caller that drains after this drains a finite queue.
    pub fn stop_now(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

impl Drop for StopOnDrop {
    fn drop(&mut self) {
        self.stop_now();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    use std::time::Instant;

    /// True once `pid` no longer exists (reaped, or never was). Polls, because an orphaned
    /// grandchild is reaped by launchd asynchronously after the kill.
    fn gone_within(pid: libc::pid_t, limit: Duration) -> bool {
        // Checks at least once, so a zero `limit` is a single check rather than none.
        let start = Instant::now();
        loop {
            // SAFETY: signal 0 checks existence and delivers nothing.
            if unsafe { libc::kill(pid, 0) } != 0 {
                return true;
            }
            if start.elapsed() >= limit {
                return false;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    /// Spawn `script` in its own group with stdout piped, and return the child plus the first
    /// line it prints.
    fn spawn_printing(script: &str) -> (Child, String) {
        let mut cmd = Command::new("/bin/sh");
        cmd.arg("-c").arg(script).stdout(Stdio::piped());
        let mut child = in_own_group(&mut cmd).spawn().expect("spawn sh");
        let mut line = String::new();
        BufReader::new(child.stdout.as_mut().expect("stdout"))
            .read_line(&mut line)
            .expect("read the first line");
        (child, line.trim().to_string())
    }

    #[test]
    fn the_child_leads_its_own_process_group() {
        let (mut child, _) = spawn_printing("echo ready; sleep 30");
        let pid = libc::pid_t::try_from(child.id()).expect("pid fits");
        // SAFETY: getpgid only reads.
        let pgid = unsafe { libc::getpgid(pid) };
        kill_and_reap(&mut child);
        assert_eq!(
            pgid, pid,
            "the child must lead a NEW group, or a group kill hits ours"
        );
    }

    #[test]
    fn kill_and_reap_takes_the_grandchild_down_with_the_child() {
        // The shell prints its background job's pid, then waits on it.
        let (mut child, line) = spawn_printing("sleep 30 & echo $!; wait");
        let grandchild: libc::pid_t = line.parse().expect("the grandchild's pid");
        assert!(
            !gone_within(grandchild, Duration::ZERO),
            "control: the grandchild is alive"
        );
        kill_and_reap(&mut child);
        assert!(
            gone_within(grandchild, Duration::from_secs(3)),
            "the group kill must reach a grandchild in the child's group"
        );
    }

    #[test]
    fn kill_and_reap_leaves_no_zombie() {
        let (mut child, _) = spawn_printing("echo ready; sleep 30");
        let pid = libc::pid_t::try_from(child.id()).expect("pid fits");
        kill_and_reap(&mut child);
        // A zombie still answers signal 0; a reaped pid does not.
        assert!(
            gone_within(pid, Duration::ZERO),
            "the child must be reaped, not left a zombie"
        );
    }

    #[test]
    fn kill_group_reaches_members_after_the_leader_is_reaped() {
        let (mut child, line) = spawn_printing("sleep 30 & echo $!");
        let grandchild: libc::pid_t = line.parse().expect("the grandchild's pid");
        let _ = child.wait(); // the leader exits on its own and is reaped
        assert!(
            !gone_within(grandchild, Duration::ZERO),
            "control: the grandchild outlived it"
        );
        kill_group(child.id());
        assert!(gone_within(grandchild, Duration::from_secs(3)));
    }

    #[test]
    fn stop_on_drop_sets_its_flag_on_every_drop() {
        let stop = StopOnDrop::default();
        let flag = stop.flag();
        assert!(!flag.load(Ordering::SeqCst));
        drop(stop);
        assert!(flag.load(Ordering::SeqCst));
    }
}
