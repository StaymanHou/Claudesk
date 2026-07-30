//! Running the two install subprocesses: `git clone`, then the repo's own `install.sh`
//! (M10.9 WP3.5a tasks 3.5.4 / P2.1–P2.4).
//!
//! ## The scripts are the source of truth — we run them, we do not reimplement them
//! `install.sh` symlinks skills and agents, injects a marker block into the user's global
//! `~/.claude/CLAUDE.md` (backing it up first), and *prints* four `permissions.allow` entries
//! it deliberately never applies. Claudesk reproduces none of that logic; it spawns the script
//! and surfaces its real output. Re-implementing any of it would create a second, silently
//! diverging definition of "installed" — and the companion repo owns that definition.
//!
//! ## Why command-building is separate from spawning
//! [`clone_command`] and [`install_command`] are pure `(program, args)` builders, following
//! `updater::quarantine_clear_command`. That split means the *shape* of what will be executed
//! is unit-testable without running anything — which matters more here than in the updater,
//! because these commands carry user-chosen paths into a subprocess. A test can assert the
//! destination path is passed as a single argument (never shell-interpolated) without any
//! filesystem or network.
//!
//! ## Ordering: the provenance write happens LAST
//! [`run_install`] writes the provenance record only after `install.sh` exits zero. That
//! sequencing is what makes "a failed install leaves no record" structural rather than a
//! cleanup step someone could forget — there is no code path where a record is written and
//! then rolled back, because the record is never written speculatively. See
//! [`InstallError`] for what each failure leaves behind.
//!
//! ## What this module deliberately does NOT do
//! No deleting path. Not `remove_dir_all` on a failed clone, not an uninstall, nothing. A
//! partial clone left by a failed `git` is reported, and the *caller* decides — Phase 3's
//! terminal-state module owns cleanup decisions, and WP3.5b owns removal. Guarded by a source
//! test, because "the additive half stays additive" is only meaningful if enforced.

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};

use thiserror::Error;

use super::provenance::{self, InstallRecord};

/// `git`, resolved from `PATH`.
///
/// Bare name rather than an absolute path: `env_path` captures the login-shell `PATH`
/// process-wide at `.setup()` before any spawn, precisely so user-installed tooling resolves
/// in a Finder-launched `.app` (which otherwise inherits only the minimal launchd `PATH`). A
/// hardcoded `/usr/bin/git` would work on stock macOS but break for anyone whose `git` comes
/// from Homebrew or Xcode-select — and per the project convention, per-spawn `PATH` hacks are
/// forbidden now that the app-wide fix exists.
const GIT_BIN: &str = "git";

/// The installer script's filename inside the cloned repo.
const INSTALL_SCRIPT: &str = "install.sh";

/// What went wrong, and — critically — what it left on disk.
///
/// Each variant carries the subprocess's own output rather than a Claudesk-authored summary:
/// the user needs the real `git` or `install.sh` text to act on a failure, and paraphrasing it
/// would hide the one detail that matters (auth prompt vs. no network vs. no disk).
#[derive(Debug, Error)]
pub enum InstallError {
    /// `git` could not be spawned at all — not on `PATH`.
    #[error("could not run `{GIT_BIN}`: {0}")]
    GitUnavailable(String),

    /// `git clone` ran and failed. **A partial clone may remain at the destination.**
    #[error("git clone failed (exit {code}): {output}")]
    CloneFailed { code: i32, output: String },

    /// The clone succeeded but contains no `install.sh` — the URL pointed at something that
    /// is not the companion repo. Called out separately from a non-zero exit because the
    /// remedy is different: the user picked the wrong repo, not a broken network.
    #[error(
        "{INSTALL_SCRIPT} not found in the cloned repo at {0} — is that the right repository?"
    )]
    InstallScriptMissing(String),

    /// `install.sh` could not be spawned (not executable, for instance).
    #[error("could not run {INSTALL_SCRIPT}: {0}")]
    InstallUnavailable(String),

    /// `install.sh` ran and failed. The clone remains; the script is idempotent, so a retry
    /// repairs rather than duplicating.
    #[error("{INSTALL_SCRIPT} failed (exit {code}): {output}")]
    InstallFailed { code: i32, output: String },

    /// Everything succeeded but the record could not be written. Surfaced rather than
    /// swallowed: the substrate IS installed, but Claudesk cannot prove it installed it, so it
    /// will read as a developer install and offer no removal.
    #[error("installed successfully, but the provenance record could not be written: {0}")]
    RecordWriteFailed(String),

    /// The caller cancelled between steps. Carries whether a clone was left behind, so the
    /// caller can tell the user the truth rather than guessing.
    #[error("cancelled by the user")]
    Cancelled { clone_exists: bool },
}

/// Where a run stopped. Returned on success; [`InstallError`] covers the rest.
#[derive(Debug, PartialEq, Eq)]
pub struct InstallSuccess {
    /// The recorded provenance. Present means the record landed.
    pub record: InstallRecord,
    /// Where the clone **actually** landed, observed from the filesystem after the clone —
    /// canonicalized, so symlinks and `..` are resolved away.
    ///
    /// ## Why this exists, and why it is canonicalized
    /// A containment test needs a value that came from *production*, not one the test built.
    /// The original test asserted `assert_writes_stay_under(root, &[dest])` where `dest` was
    /// the test's own literal — comparing two test-constructed paths, which is constant-true
    /// no matter what the code does. Verify-self escaped it: production cloned to `/tmp/...`
    /// with `dest` symlinked at it, and the test still passed while real directories landed
    /// outside the sandbox.
    ///
    /// `canonicalize` is what closes the symlink half of that escape — a test asserting on a
    /// non-canonical path can be satisfied by a link whose target is anywhere. This field is
    /// the observation a containment assertion must be made against, and WP3.5b's deleting
    /// code will need exactly the same discipline.
    pub cloned_to: std::path::PathBuf,
}

/// Build `git clone <url> <dest>`.
///
/// Pure. `dest` is passed as its own argument, never interpolated into a shell string — a path
/// the user chose through a directory picker can contain spaces, quotes, or `$`, and
/// `Command` with separate args never invokes a shell, so none of it is interpretable.
pub fn clone_command(url: &str, dest: &Path) -> (String, Vec<String>) {
    (
        GIT_BIN.to_string(),
        vec![
            "clone".to_string(),
            url.to_string(),
            dest.to_string_lossy().into_owned(),
        ],
    )
}

/// Build the invocation of the cloned repo's `install.sh`.
///
/// Runs the script by absolute path with the clone as its working directory. Both matter:
/// the script derives its own `SOURCE_DIR` from `dirname $0`, so an absolute path is what
/// makes it link the right tree.
pub fn install_command(clone_dir: &Path) -> (String, Vec<String>) {
    (
        clone_dir
            .join(INSTALL_SCRIPT)
            .to_string_lossy()
            .into_owned(),
        Vec::new(),
    )
}

/// A sink for streamed subprocess output.
///
/// Generic rather than a concrete Tauri `AppHandle` so the whole run is testable without a
/// running app: tests pass a collecting sink and assert on exactly what a user would have
/// seen. The Tauri wiring implements this in the `commands` layer (Phase 4), following
/// `cc_session`'s output-event/exit-event shape.
pub trait OutputSink {
    /// One line of subprocess output. Called on the spawning thread as lines arrive.
    fn line(&self, line: &str);
}

/// A sink that discards everything — for tests that only care about the terminal state.
///
/// `#[cfg(test)]` because it has no production caller and never will: the real sink forwards to the
/// webview. It sat in production code under a module-wide `#![allow(dead_code)]`, and removing that
/// allow (its own comment said to, once Phase 4 landed) surfaced this as the single item it was
/// masking. Gating it here is what let the allow go — so WP3.5b's *deleting* code arrives with
/// dead-code detection switched on, which is where an orphaned function matters most.
#[cfg(test)]
pub struct NullSink;

#[cfg(test)]
impl OutputSink for NullSink {
    fn line(&self, _line: &str) {}
}

/// Run one command, streaming stdout+stderr into `sink`, and return `(exit_code, combined)`.
///
/// ## Delivery timing differs per stream — corrected 2026-07-29 (Phase 2 verify-self)
/// **stdout is streamed line-by-line as it arrives; stderr is NOT.** stderr is drained on its own
/// thread (to avoid the ~64KB pipe-buffer deadlock a flooding script would otherwise cause) and
/// its contents are replayed to the sink *after* `wait()` returns. So a long `install.sh` shows
/// stdout progress live, then its warnings arrive in one batch at the end.
///
/// This comment previously claimed "one interleaved transcript in the order things actually
/// happened." That was **wrong**, and verify-self caught it. Both streams do reach the sink
/// verbatim — which is the property the WP actually requires — but their *ordering* is not
/// preserved relative to each other.
///
/// Left as-is rather than "fixed" into true interleaving: a single merged pipe would lose the
/// separate-drain deadlock protection, and interleaving matters far less than it sounds for this
/// script (`install.sh`'s stderr is `set -euo pipefail` failure output, which lands at the end
/// anyway because the script dies there). Revisit only if a real user reports confusion.
fn run_streaming(
    program: &str,
    args: &[String],
    cwd: Option<&Path>,
    sink: &dyn OutputSink,
) -> std::io::Result<(i32, String)> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    let mut child = cmd.spawn()?;

    // Drain stderr on a thread so a chatty stderr cannot deadlock a full pipe buffer while we
    // block reading stdout. Both feed the same sink.
    let stderr_lines = child.stderr.take().map(|err| {
        std::thread::spawn(move || {
            let mut collected = Vec::new();
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                collected.push(line);
            }
            collected
        })
    });

    let mut combined = Vec::new();
    if let Some(out) = child.stdout.take() {
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            sink.line(&line);
            combined.push(line);
        }
    }

    let status = child.wait()?;

    if let Some(handle) = stderr_lines {
        if let Ok(lines) = handle.join() {
            for line in lines {
                sink.line(&line);
                combined.push(line);
            }
        }
    }

    Ok((status.code().unwrap_or(-1), combined.join("\n")))
}

/// Clone the substrate, run its installer, and record provenance — in that order.
///
/// `cancelled` is polled between steps (never mid-subprocess: killing `git` halfway is how you
/// get a corrupt object store). `claudesk_root` and `dest` are injected, per the module-level
/// no-ambient-roots rule.
///
/// On success the provenance record is written **last**, so no failure path leaves a record
/// claiming an install that did not complete.
pub fn run_install(
    url: &str,
    dest: &Path,
    claudesk_root: &Path,
    installed_at: &str,
    sink: &dyn OutputSink,
    cancelled: &dyn Fn() -> bool,
) -> Result<InstallSuccess, InstallError> {
    if cancelled() {
        return Err(InstallError::Cancelled {
            clone_exists: dest.exists(),
        });
    }

    // ── 1. Clone ────────────────────────────────────────────────────────────────────
    let (program, args) = clone_command(url, dest);
    let (code, output) = run_streaming(&program, &args, None, sink)
        .map_err(|e| InstallError::GitUnavailable(e.to_string()))?;
    if code != 0 {
        return Err(InstallError::CloneFailed { code, output });
    }

    // Observe where the clone ACTUALLY landed, before doing anything else with it.
    //
    // Canonicalized so a symlink cannot make a path *look* contained while its target sits
    // elsewhere — the exact escape verify-self demonstrated against the previous, tautological
    // containment assertion. `dest` is what we asked for; `cloned_to` is what happened, and
    // only the latter is safe to assert containment against.
    //
    // A canonicalize failure here is not fatal to the install (the clone succeeded), so it
    // falls back to `dest` rather than aborting — but tests assert on the canonical value, so
    // the fallback cannot mask an escape in the case that matters.
    let cloned_to = dest.canonicalize().unwrap_or_else(|_| dest.to_path_buf());

    if cancelled() {
        return Err(InstallError::Cancelled {
            clone_exists: dest.exists(),
        });
    }

    // ── 2. Install ──────────────────────────────────────────────────────────────────
    // Checked explicitly rather than letting the spawn fail with a bare ENOENT: "that
    // repository has no install.sh" tells the user they picked the wrong URL, whereas "No such
    // file or directory" sends them looking for a bug in Claudesk.
    let script = dest.join(INSTALL_SCRIPT);
    if !script.is_file() {
        return Err(InstallError::InstallScriptMissing(
            dest.display().to_string(),
        ));
    }

    let (program, args) = install_command(dest);
    let (code, output) = run_streaming(&program, &args, Some(dest), sink)
        .map_err(|e| InstallError::InstallUnavailable(e.to_string()))?;
    if code != 0 {
        return Err(InstallError::InstallFailed { code, output });
    }

    // ── 3. Record provenance — LAST, and only on success ────────────────────────────
    let record = InstallRecord {
        clone_path: dest.to_path_buf(),
        installed_at: installed_at.to_string(),
        origin_url: url.to_string(),
    };
    provenance::write_record(claudesk_root, &record)
        .map_err(|e| InstallError::RecordWriteFailed(e.to_string()))?;

    Ok(InstallSuccess { record, cloned_to })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow_install::sandbox::Sandbox;
    use std::sync::Mutex;

    /// Collects every line the run emitted, so tests assert on what a user would have read.
    struct CollectingSink(Mutex<Vec<String>>);

    impl CollectingSink {
        fn new() -> Self {
            Self(Mutex::new(Vec::new()))
        }
        fn lines(&self) -> Vec<String> {
            self.0.lock().unwrap().clone()
        }
    }

    impl OutputSink for CollectingSink {
        fn line(&self, line: &str) {
            self.0.lock().unwrap().push(line.to_string());
        }
    }

    fn never_cancelled() -> bool {
        false
    }

    /// Build a local git repo containing an `install.sh` with the given body.
    ///
    /// **Local, never the network.** A test that cloned the real companion repo would be slow,
    /// offline-fragile, and — worse — would exercise the operator's actual substrate. Cloning a
    /// `file://` fixture proves the same code path with none of that.
    fn fixture_repo(at: &Path, script_body: &str) -> String {
        std::fs::create_dir_all(at).unwrap();
        let script = at.join(INSTALL_SCRIPT);
        std::fs::write(&script, script_body).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        let git = |args: &[&str]| {
            let out = Command::new(GIT_BIN)
                .args(args)
                .current_dir(at)
                .output()
                .expect("git must be available for these tests");
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        };
        git(&["init", "--quiet"]);
        git(&["config", "user.email", "t@example.com"]);
        git(&["config", "user.name", "Test"]);
        git(&["add", "."]);
        git(&["commit", "--quiet", "-m", "fixture"]);

        format!("file://{}", at.display())
    }

    #[test]
    fn clone_command_passes_the_destination_as_one_argument() {
        // A picker-chosen path can contain spaces. `Command` never invokes a shell, so the
        // path must survive as a single argv entry rather than being split or quoted.
        let dest = Path::new("/tmp/a dir/with spaces/mccc");

        let (program, args) = clone_command("git@example.com:x/y.git", dest);

        assert_eq!(program, "git");
        assert_eq!(args[0], "clone");
        assert_eq!(args[1], "git@example.com:x/y.git");
        assert_eq!(
            args[2], "/tmp/a dir/with spaces/mccc",
            "the destination must be one unsplit argument"
        );
        assert_eq!(args.len(), 3, "no extra flags — {args:?}");
    }

    #[test]
    fn clone_command_uses_bare_git_so_the_app_wide_path_fix_applies() {
        // Not an absolute path: env_path sets the login-shell PATH process-wide at setup so a
        // Finder-launched .app can find Homebrew/Xcode git. Hardcoding /usr/bin/git would
        // silently bypass that.
        let (program, _) = clone_command("u", Path::new("/d"));

        assert_eq!(program, "git");
        assert!(!program.contains('/'), "must resolve through PATH");
    }

    #[test]
    fn install_command_runs_the_script_by_absolute_path() {
        // install.sh derives SOURCE_DIR from `dirname $0`, so the absolute path is what makes
        // it link the correct tree.
        let clone = Path::new("/tmp/clone-dir");

        let (program, args) = install_command(clone);

        assert_eq!(program, "/tmp/clone-dir/install.sh");
        assert!(args.is_empty(), "no flags are passed — {args:?}");
    }

    #[test]
    fn install_command_passes_no_claude_time_flag() {
        // The companion repo RETIRED tools/claude-time/ (2026-07-29) at Claudesk's cross-repo
        // ask; resolution 2 (a --with-claude-time opt-in flag) was explicitly NOT taken. This
        // pins that: if a flag ever appears here, someone re-added a dependency on a retired
        // tool.
        let (_, args) = install_command(Path::new("/x"));

        assert!(
            args.is_empty(),
            "install.sh takes no flags from Claudesk — found {args:?}"
        );
    }

    #[test]
    fn a_successful_run_clones_installs_and_records() {
        let sandbox = Sandbox::new();
        let origin = sandbox.home().join("origin");
        let url = fixture_repo(&origin, "#!/bin/sh\necho '  [new] skills/feature-build'\n");
        let dest = sandbox.vendor_dir().join("mccc");
        let sink = CollectingSink::new();

        let ok = run_install(
            &url,
            &dest,
            &sandbox.claudesk_root(),
            "2026-07-29T12:00:00Z",
            &sink,
            &never_cancelled,
        )
        .expect("the fixture install must succeed");

        // ── Containment, asserted against what PRODUCTION observed ──────────────────
        // `ok.cloned_to` is canonicalized by run_install from the real filesystem. Asserting
        // on `dest` (the test's own literal) instead is constant-true and was the defect
        // verify-self escaped: production cloned to /tmp with `dest` symlinked at it, and the
        // test passed while directories landed outside the sandbox.
        assert!(dest.join(INSTALL_SCRIPT).is_file());
        let boundary = sandbox
            .claudesk_root()
            .canonicalize()
            .expect("the sandbox root must exist");
        assert!(
            ok.cloned_to.starts_with(&boundary),
            "the clone escaped the injected root: production cloned to {:?}, which is not \
             under {:?}",
            ok.cloned_to,
            boundary
        );
        sandbox.assert_writes_stay_under(&boundary, std::slice::from_ref(&ok.cloned_to));

        // The record is written, and describes what we actually did.
        assert_eq!(ok.record.clone_path, dest);
        assert_eq!(ok.record.origin_url, url);
        let read = provenance::read_record(&sandbox.claudesk_root()).unwrap();
        assert_eq!(read, ok.record, "the record must be readable after the run");

        // The script's REAL output reached the sink verbatim — not summarized.
        assert!(
            sink.lines()
                .iter()
                .any(|l| l.contains("[new] skills/feature-build")),
            "install.sh's own output must be surfaced, got {:?}",
            sink.lines()
        );
    }

    #[test]
    fn the_containment_assertion_fails_when_production_reports_an_escaping_path() {
        // ═══════════════════════════════════════════════════════════════════════════
        // Meta-test. The containment check in `a_successful_run_...` is only worth
        // anything if it can FAIL — and its predecessor could not: it compared two
        // test-constructed paths, so it was constant-true. Verify-self escaped it by
        // cloning to /tmp with `dest` symlinked at it, and the test still passed while
        // real directories landed outside the sandbox.
        //
        // This pins the fix by feeding the assertion the shape production would report
        // in that escape, and proving it panics. Mirrors sandbox.rs's
        // `the_tighter_assert_catches_an_escape_the_boundary_check_misses`.
        // ═══════════════════════════════════════════════════════════════════════════
        let sandbox = Sandbox::new();
        let boundary = sandbox.claudesk_root().canonicalize().unwrap();
        let escaped = std::path::PathBuf::from("/tmp/claudesk-escaped-clone");

        let result = std::panic::catch_unwind(|| {
            assert!(
                escaped.starts_with(&boundary),
                "must reject a clone outside the injected root"
            );
        });

        assert!(
            result.is_err(),
            "the containment assertion must FAIL on a path production reports outside the \
             injected root — if this passes, the assertion is tautological again"
        );
    }

    #[test]
    fn the_reported_clone_path_is_an_observation_not_an_echo_of_the_argument() {
        // The other half of the fix: `cloned_to` must come from the FILESYSTEM, not be a copy
        // of the `dest` argument. If it were an echo, the containment assertion above would be
        // tautological once more — asserting on a value the caller supplied.
        //
        // Proven by passing a non-canonical `dest` (containing a `..` segment) and requiring
        // the reported path to differ from it: only a real `canonicalize` collapses that.
        let sandbox = Sandbox::new();
        let origin = sandbox.home().join("origin");
        let url = fixture_repo(&origin, "#!/bin/sh\necho ok\n");
        std::fs::create_dir_all(sandbox.vendor_dir().join("sub")).unwrap();
        let noncanonical = sandbox.vendor_dir().join("sub").join("..").join("mccc");

        let ok = run_install(
            &url,
            &noncanonical,
            &sandbox.claudesk_root(),
            "2026-07-29T12:00:00Z",
            &CollectingSink::new(),
            &never_cancelled,
        )
        .expect("the fixture install must succeed");

        assert_ne!(
            ok.cloned_to, noncanonical,
            "cloned_to must be a canonicalized OBSERVATION — echoing the argument back would \
             make every containment assertion tautological"
        );
        assert!(
            !ok.cloned_to.to_string_lossy().contains(".."),
            "the observed path must be canonical, got {:?}",
            ok.cloned_to
        );
        assert!(
            ok.cloned_to
                .starts_with(sandbox.claudesk_root().canonicalize().unwrap()),
            "and it must still be contained"
        );
    }

    #[test]
    fn a_nonzero_install_script_surfaces_its_real_output_and_writes_no_record() {
        // The load-bearing failure case: the gate must never be left claiming a substrate that
        // is not properly installed, and the mechanism for that is "no record was written".
        let sandbox = Sandbox::new();
        let origin = sandbox.home().join("origin");
        let url = fixture_repo(
            &origin,
            "#!/bin/sh\necho 'linking skills'\necho 'permission denied on ~/.claude' >&2\nexit 3\n",
        );
        let dest = sandbox.vendor_dir().join("mccc");
        let sink = CollectingSink::new();

        let err = run_install(
            &url,
            &dest,
            &sandbox.claudesk_root(),
            "2026-07-29T12:00:00Z",
            &sink,
            &never_cancelled,
        )
        .expect_err("a non-zero install.sh must fail the run");

        match err {
            InstallError::InstallFailed { code, ref output } => {
                assert_eq!(code, 3, "the script's real exit code must be preserved");
                assert!(
                    output.contains("permission denied on ~/.claude"),
                    "the script's own stderr must be surfaced, got {output:?}"
                );
            }
            other => panic!("expected InstallFailed, got {other:?}"),
        }

        assert!(
            provenance::read_record(&sandbox.claudesk_root()).is_none(),
            "a FAILED install must leave NO provenance record — otherwise the substrate reads \
             as managed and becomes eligible for removal"
        );
    }

    #[test]
    fn a_failed_clone_writes_no_record_and_surfaces_gits_own_error() {
        let sandbox = Sandbox::new();
        let dest = sandbox.vendor_dir().join("mccc");
        let sink = CollectingSink::new();

        let err = run_install(
            "file:///definitely/not/a/repo",
            &dest,
            &sandbox.claudesk_root(),
            "2026-07-29T12:00:00Z",
            &sink,
            &never_cancelled,
        )
        .expect_err("cloning a nonexistent URL must fail");

        match err {
            InstallError::CloneFailed { ref output, .. } => {
                assert!(
                    !output.is_empty(),
                    "git's own failure text must be surfaced, not swallowed"
                );
            }
            other => panic!("expected CloneFailed, got {other:?}"),
        }
        assert!(provenance::read_record(&sandbox.claudesk_root()).is_none());
    }

    #[test]
    fn a_clone_without_install_sh_is_reported_as_the_wrong_repository() {
        // Distinguished from a bare spawn ENOENT on purpose: this failure means the user picked
        // the wrong URL, and the message has to say so or they will hunt for a Claudesk bug.
        let sandbox = Sandbox::new();
        let origin = sandbox.home().join("origin");
        std::fs::create_dir_all(&origin).unwrap();
        std::fs::write(origin.join("README.md"), b"not the workflow system").unwrap();
        for args in [
            vec!["init", "--quiet"],
            vec!["config", "user.email", "t@example.com"],
            vec!["config", "user.name", "T"],
            vec!["add", "."],
            vec!["commit", "--quiet", "-m", "x"],
        ] {
            Command::new(GIT_BIN)
                .args(&args)
                .current_dir(&origin)
                .output()
                .unwrap();
        }
        let dest = sandbox.vendor_dir().join("mccc");

        let err = run_install(
            &format!("file://{}", origin.display()),
            &dest,
            &sandbox.claudesk_root(),
            "t",
            &NullSink,
            &never_cancelled,
        )
        .expect_err("a repo with no install.sh must fail");

        assert!(
            matches!(err, InstallError::InstallScriptMissing(_)),
            "expected InstallScriptMissing, got {err:?}"
        );
        assert!(provenance::read_record(&sandbox.claudesk_root()).is_none());
    }

    #[test]
    fn cancelling_before_the_clone_leaves_nothing_behind() {
        let sandbox = Sandbox::new();
        let dest = sandbox.vendor_dir().join("mccc");

        let err = run_install(
            "file:///whatever",
            &dest,
            &sandbox.claudesk_root(),
            "t",
            &NullSink,
            &|| true,
        )
        .expect_err("an immediate cancel must not proceed");

        match err {
            InstallError::Cancelled { clone_exists } => assert!(
                !clone_exists,
                "cancelling before the clone must report no clone left behind"
            ),
            other => panic!("expected Cancelled, got {other:?}"),
        }
        assert!(!dest.exists(), "nothing may be created on an early cancel");
        assert!(provenance::read_record(&sandbox.claudesk_root()).is_none());
    }

    #[test]
    fn cancelling_after_the_clone_reports_the_clone_it_left() {
        // The honest-reporting case: the caller must be able to tell the user a clone remains,
        // rather than silently leaving one or claiming a clean cancel. Phase 3 decides what to
        // DO about it; this module's job is to report accurately.
        let sandbox = Sandbox::new();
        let origin = sandbox.home().join("origin");
        let url = fixture_repo(&origin, "#!/bin/sh\nexit 0\n");
        let dest = sandbox.vendor_dir().join("mccc");

        // Cancel on the SECOND poll: the first gate passes, the clone runs, the post-clone
        // gate then fires.
        let polls = Mutex::new(0);
        let cancel_after_first = || {
            let mut n = polls.lock().unwrap();
            *n += 1;
            *n > 1
        };

        let err = run_install(
            &url,
            &dest,
            &sandbox.claudesk_root(),
            "t",
            &NullSink,
            &cancel_after_first,
        )
        .expect_err("a post-clone cancel must fail the run");

        match err {
            InstallError::Cancelled { clone_exists } => assert!(
                clone_exists,
                "a cancel after cloning must report that a clone was left behind"
            ),
            other => panic!("expected Cancelled, got {other:?}"),
        }
        assert!(
            provenance::read_record(&sandbox.claudesk_root()).is_none(),
            "a cancelled run must write no record"
        );
    }

    #[test]
    fn output_arrives_in_order_line_by_line() {
        // Content + order only. This does NOT prove streaming — see
        // `early_output_reaches_the_sink_before_the_script_exits` for that. The name used to
        // claim "not delivered as one blob", which was false: verify-self replaced
        // `run_streaming` with a fully-buffering implementation that read stdout to completion
        // and replayed it after `wait()`, and this test still passed. Content and order survive
        // buffering, so they cannot distinguish it.
        let sandbox = Sandbox::new();
        let origin = sandbox.home().join("origin");
        let url = fixture_repo(
            &origin,
            "#!/bin/sh\necho one\necho two\necho three\necho four\n",
        );
        let dest = sandbox.vendor_dir().join("mccc");
        let sink = CollectingSink::new();

        run_install(
            &url,
            &dest,
            &sandbox.claudesk_root(),
            "t",
            &sink,
            &never_cancelled,
        )
        .unwrap();

        let script_lines: Vec<_> = sink
            .lines()
            .into_iter()
            .filter(|l| ["one", "two", "three", "four"].contains(&l.as_str()))
            .collect();
        assert_eq!(
            script_lines,
            vec!["one", "two", "three", "four"],
            "each line must arrive separately and in order"
        );
    }

    #[test]
    fn early_output_reaches_the_sink_before_the_script_exits() {
        // ═══════════════════════════════════════════════════════════════════════════
        // THE actual streaming proof, asserted on TIMING because timing is the property.
        //
        // Why this test exists: the wizard shows install progress live, and `install.sh` on a
        // real machine takes seconds (it walks every skill and agent dir). If output only
        // arrived at exit, the panel would sit frozen through the whole run and then dump
        // everything at once — the user would reasonably conclude it had hung.
        //
        // Content-and-order assertions cannot detect that, because a buffering implementation
        // preserves both. Proven at verify-self: streaming was removed from production
        // `run_streaming` entirely and the whole suite stayed green. So the discriminator has
        // to be *when* a line arrives relative to the child still running.
        //
        // The script emits, sleeps, then emits. Streaming ⇒ line 1 is observed well before the
        // sleep ends. Buffering ⇒ nothing is observed until after it.
        // ═══════════════════════════════════════════════════════════════════════════
        const SLEEP_SECS: u64 = 2;

        let sandbox = Sandbox::new();
        let origin = sandbox.home().join("origin");
        let url = fixture_repo(
            &origin,
            &format!("#!/bin/sh\necho first-line\nsleep {SLEEP_SECS}\necho last-line\n"),
        );
        let dest = sandbox.vendor_dir().join("mccc");

        // Records elapsed-since-start for each line, so "arrived early" is a measurement.
        struct TimingSink {
            start: std::time::Instant,
            seen: Mutex<Vec<(String, std::time::Duration)>>,
        }
        impl OutputSink for TimingSink {
            fn line(&self, line: &str) {
                self.seen
                    .lock()
                    .unwrap()
                    .push((line.to_string(), self.start.elapsed()));
            }
        }

        let sink = TimingSink {
            start: std::time::Instant::now(),
            seen: Mutex::new(Vec::new()),
        };

        run_install(
            &url,
            &dest,
            &sandbox.claudesk_root(),
            "t",
            &sink,
            &never_cancelled,
        )
        .unwrap();

        let seen = sink.seen.lock().unwrap().clone();
        let first = seen
            .iter()
            .find(|(l, _)| l == "first-line")
            .expect("the script's first line must reach the sink");
        let last = seen
            .iter()
            .find(|(l, _)| l == "last-line")
            .expect("the script's last line must reach the sink");

        // Generous margin: asserting "before the sleep finished" rather than a tight bound, so
        // a loaded CI box cannot flake this. A buffering implementation reports BOTH lines at
        // ~SLEEP_SECS or later, so even half the sleep window separates the two designs
        // decisively.
        //
        // ⚠️ DO NOT LOWER `SLEEP_SECS` BELOW 2. Measured at verify-self: the first line arrives
        // at 159–207ms unloaded and 217–228ms under load avg 14 on a 10-core box (the measured
        // quantity is pipe latency, not CPU work, which is why load barely moves it), against a
        // 1000ms threshold — ~4.4x headroom. The buffering mutation lands at 2802ms. At
        // SLEEP_SECS=1 the threshold halves to 500ms and that margin gets thin enough to flake.
        // ⚠️ REVISED 2026-07-29 — assert on the GAP BETWEEN the two observations, not on the
        // first one's absolute wall-clock time.
        //
        // The absolute form (`first.1 < half_sleep`) flaked at 1151ms against a 1000ms
        // threshold once this module's test count grew: the number is dominated by how long the
        // test waited for a scheduler slot, not by pipe latency. The measured 159–228ms in the
        // note above was real but is not a stable budget — it degrades with parallel test load,
        // and raising the threshold just defers the same flake.
        //
        // The gap is the property that actually distinguishes the two implementations, and it is
        // load-invariant: streaming delivers `first-line` roughly SLEEP_SECS *before*
        // `last-line`, while a buffering implementation delivers both in the same post-exit
        // batch (a gap near zero). Scheduling delay shifts both timestamps together and cancels.
        let gap = last.1.saturating_sub(first.1);
        let min_gap = std::time::Duration::from_millis(SLEEP_SECS * 500);
        assert!(
            gap >= min_gap,
            "the two lines must arrive ~{SLEEP_SECS}s APART (first at {:?}, last at {:?}, gap \
             {gap:?} — expected >= {min_gap:?}). A gap near zero means both lines showed up in \
             one post-exit batch, i.e. output is buffered and the wizard would look frozen for \
             the whole install.",
            first.1,
            last.1
        );

        // The gap assertion above already pins that the early observation was a live read
        // rather than a batch arriving early — a batch would put both timestamps together and
        // collapse the gap. The former `last.1 >= half_sleep` check was the absolute-wall-clock
        // form of the same claim and carried the same load-sensitivity, so it is gone with it.
    }

    #[test]
    fn a_script_flooding_stderr_does_not_deadlock() {
        // ═══════════════════════════════════════════════════════════════════════════
        // Guards the threaded stderr drain in `run_streaming`.
        //
        // A pipe buffer is ~64KB. If the parent reads stdout to completion before touching
        // stderr, a child that writes more than that to stderr BLOCKS on the write, while the
        // parent blocks reading stdout — classic two-pipe deadlock. The thread exists for
        // exactly this, and verify-self proved the necessity empirically: replacing it with a
        // same-thread drain-after-stdout made this scenario hang past 180s.
        //
        // Why this test is worth its ~1s: a regression here does not FAIL, it HANGS — the worst
        // possible CI signal, since a hung job reads as infrastructure flakiness rather than a
        // code defect. Verify-self found the drain was load-bearing but entirely uncovered.
        //
        // 4000 lines × ~40 bytes ≈ 160KB per stream, comfortably past the buffer on both.
        //
        // The run happens on a worker thread behind a bounded `recv_timeout` so a REGRESSION
        // FAILS INSTEAD OF HANGING. Without it, reverting the threaded drain wedges the whole
        // suite until CI's job-level timeout kills it — and a hung job reads as infrastructure
        // flakiness, which is exactly the wrong diagnosis. Verified at verify-self: the
        // same-thread-drain mutation had to be killed at 90s. 30s is ~60x the honest runtime
        // (~0.5s), so the timeout can only fire on a real deadlock.
        // ═══════════════════════════════════════════════════════════════════════════
        const DEADLOCK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

        let sandbox = Sandbox::new();
        let origin = sandbox.home().join("origin");
        let url = fixture_repo(
            &origin,
            "#!/bin/sh\ni=0\nwhile [ $i -lt 4000 ]; do\n  echo \"stdout line $i padding padding\"\n  echo \"stderr line $i padding padding\" >&2\n  i=$((i+1))\ndone\n",
        );
        let dest = sandbox.vendor_dir().join("mccc");
        let claudesk_root = sandbox.claudesk_root();

        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let sink = CollectingSink::new();
            let result = run_install(&url, &dest, &claudesk_root, "t", &sink, &never_cancelled);
            let _ = tx.send(result.map(|_| sink.lines()));
        });

        let lines = rx
            .recv_timeout(DEADLOCK_TIMEOUT)
            .unwrap_or_else(|_| {
                panic!(
                    "DEADLOCK: the flooding script did not finish within {DEADLOCK_TIMEOUT:?}. \
                     The threaded stderr drain in `run_streaming` was almost certainly replaced \
                     by a same-thread drain — the child blocks writing stderr while the parent \
                     blocks reading stdout."
                )
            })
            .expect("a stderr-flooding script must complete, not deadlock");

        let out = lines
            .iter()
            .filter(|l| l.starts_with("stdout line"))
            .count();
        let err = lines
            .iter()
            .filter(|l| l.starts_with("stderr line"))
            .count();
        assert_eq!(out, 4000, "every stdout line must survive");
        assert_eq!(
            err, 4000,
            "every stderr line must survive — a partial count means the drain dropped output"
        );
    }

    #[test]
    fn stderr_and_stdout_both_reach_the_sink() {
        // install.sh writes progress to stdout and warnings to stderr ([warn] CLAUDE.snippet.md
        // not found). Dropping stderr would hide exactly the lines a user needs.
        let sandbox = Sandbox::new();
        let origin = sandbox.home().join("origin");
        let url = fixture_repo(
            &origin,
            "#!/bin/sh\necho to-stdout\necho to-stderr >&2\nexit 0\n",
        );
        let dest = sandbox.vendor_dir().join("mccc");
        let sink = CollectingSink::new();

        run_install(
            &url,
            &dest,
            &sandbox.claudesk_root(),
            "t",
            &sink,
            &never_cancelled,
        )
        .unwrap();

        let lines = sink.lines();
        assert!(lines.iter().any(|l| l == "to-stdout"), "got {lines:?}");
        assert!(lines.iter().any(|l| l == "to-stderr"), "got {lines:?}");
    }

    #[test]
    fn this_module_ships_no_deleting_path() {
        // WP3.5a is the additive half. A failed clone is REPORTED, never cleaned up here —
        // cleanup decisions are Phase 3's and removal is WP3.5b's, where the refuse-guard
        // lands first. The SURFACE's guard-before-destructive ordering only means something if
        // this WP genuinely ships no delete.
        let src = include_str!("runner.rs");
        let production = src.split("mod tests").next().unwrap_or(src);
        let code: String = production
            .lines()
            .filter(|l| {
                let t = l.trim_start();
                !t.starts_with("//") && !t.starts_with("*") && !t.starts_with("/*")
            })
            .collect::<Vec<_>>()
            .join("\n");

        for forbidden in [
            "remove_dir",
            "remove_file",
            "uninstall.sh",
            "home_dir",
            "env::var",
        ] {
            assert!(
                !code.contains(forbidden),
                "runner must not reference `{forbidden}` — WP3.5a is the ADDITIVE half (no \
                 deletes; uninstall is WP3.5b, refuse-guard first) and takes every root as a \
                 parameter (no ambient home)."
            );
        }

        // Positive halves, anchored at the END of production code so a truncating extractor
        // fails loudly rather than passing vacuously (the trap this repo hit in Phase 1).
        assert!(
            code.contains("fn run_install"),
            "the extractor must reach the end of production code"
        );
        assert!(
            code.contains("write_record"),
            "the provenance write must still be here"
        );
    }

    #[test]
    fn the_provenance_write_is_the_last_step_in_the_source() {
        // Ordering is the structural guarantee that a failed install leaves no record. Asserted
        // on POSITION because that is the property: if the write moves above either subprocess
        // call, a failure could leave a record claiming an install that never finished.
        //
        // ⚠️ COUNT FIRST, THEN POSITION — and the count is not decoration.
        // `find` returns the FIRST match, so a position check alone says only "the first write
        // is after the spawns" while its name promises "the write is the last step." A SECOND
        // write added to a failure path — the exact regression this guard exists to prevent —
        // sits after the spawns too and slipped straight through: at verify-self a mutation
        // inserting a record-write on the install-failure branch left this guard GREEN while
        // the behavioral test failed. Reproduced directly before fixing, not taken on report.
        //
        // ⚠️ WHAT THIS GUARD DOES **NOT** PROVE — read before trusting it.
        // It is a substring count over source text, so it is a TRIPWIRE, not a proof. Any
        // indirection walks straight past it: a module alias (`use super::provenance as prov;`
        // then `prov::write_record(...)`) keeps the literal count at exactly 1 while writing a
        // record on a failure path. That bypass was demonstrated at verify-self — the guard
        // stayed green and only the behavioral test caught it.
        //
        // So the invariant is secured by the FOUR BEHAVIORAL TESTS that assert
        // `read_record(...).is_none()` against a real sandboxed filesystem after each failure
        // path (non-zero install.sh, failed clone, clone-without-script, both cancels). Those
        // caught every mutation attempted, including the one that beat this guard.
        //
        // This guard's value is narrower and still worth its ~12 lines: it is a fast,
        // deterministic tripwire for the LIKELY regression — someone copy-pasting the write
        // block onto an error branch — and it is executable documentation of the ordering rule.
        // Do not read a green result here as proof that no failure path writes a record.
        //
        // (It is also mildly over-sensitive: a doc comment naming the function, or a second
        // legitimate import, inflates the count and fails with a message that misdescribes the
        // cause. It counts text occurrences, not call sites.)
        let src = include_str!("runner.rs");
        let production = src.split("mod tests").next().unwrap_or(src);

        let write_count = production.matches("provenance::write_record").count();
        assert_eq!(
            write_count, 1,
            "expected exactly ONE textual `provenance::write_record` occurrence in production \
             code, found {write_count}. The likely cause is a write copy-pasted onto a failure \
             path (the position check below cannot see it — `find` inspects only the first \
             match). NOTE: this is a text count, so it can also trip on a doc comment naming \
             the function or a second import; and it can be BYPASSED by a module alias. The \
             real coverage is the four behavioral no-record tests."
        );

        let write_at = production
            .find("provenance::write_record")
            .expect("the provenance write must exist");
        let install_spawn_at = production
            .find("install_command(dest)")
            .expect("the install spawn must exist");
        let clone_spawn_at = production
            .find("clone_command(url, dest)")
            .expect("the clone spawn must exist");

        assert!(
            write_at > install_spawn_at && write_at > clone_spawn_at,
            "the provenance write must come AFTER both subprocess calls — otherwise a failure \
             can leave a record for an install that did not complete"
        );
    }
}
