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
//! ## The deleting path lives here — and ONLY behind the refuse-guard (WP3.5b Phase 2)
//! This module now carries the crate's single deleting call: [`run_uninstall`]'s removal of
//! the managed clone dir. Three fences around it, none optional:
//!
//! 1. **Type-enforced guard:** it consumes a [`guard::UninstallTarget`], whose only
//!    constructor is `refuse_guard` — so there is no compile-path to the delete that skips
//!    the refusal checks. [`run_uninstall_guarded`] is the composition the command layer
//!    calls.
//! 2. **Sanctioned-count scan:** `source_guard`'s crate-level delete guard permits exactly
//!    one `remove_dir` occurrence in this file (and one `remove_file` in `provenance`); any
//!    new deletion call fails it until consciously sanctioned.
//! 3. **Ordering:** script → clone-dir removal → record deletion **LAST** — the mirror of
//!    the install's write-last, pinned by behavioral failure-injection tests. A failed
//!    uninstall leaves the record describing what still exists.
//!
//! Install-side failures are still REPORTED, never cleaned up here (a failed clone's
//! `Cleanup::RemovePartialClone` remains a decision the caller surfaces — acting on it would
//! need a guard-approved target, which a failed install by definition lacks a record for).

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};

use thiserror::Error;

use super::guard::{self, UninstallTarget};
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

/// What went wrong during an uninstall, and — critically — what it left behind.
///
/// Same discipline as [`InstallError`]: each failing variant carries the subprocess's own
/// output where there is one, and every variant answers "does the record survive?" — it does,
/// for all of them. Only a fully successful run deletes the record (see [`run_uninstall`]).
#[derive(Debug, Error)]
pub enum UninstallError {
    /// The refuse-guard said no. **Nothing ran and nothing was changed** — this variant
    /// exists so the refusal reaches the user with its own explanation rather than as a
    /// generic failure.
    #[error("{}", .0.user_message())]
    Refused(guard::RefusalReason),

    /// `uninstall.sh` could not be spawned (not executable, for instance).
    #[error("could not run {script}: {msg}", script = guard::UNINSTALL_SCRIPT, msg = .0)]
    ScriptUnavailable(String),

    /// `uninstall.sh` ran and failed. The script is idempotent, so a retry finishes what
    /// this run started; the clone and the record both remain.
    #[error("{script} failed (exit {code}): {output}", script = guard::UNINSTALL_SCRIPT)]
    ScriptFailed { code: i32, output: String },

    /// The script succeeded but the clone directory could not be removed. A partial tree may
    /// remain; the record remains and still describes it.
    #[error("could not remove the download at {path}: {message}")]
    CloneRemoveFailed { path: String, message: String },

    /// Everything was removed but the record could not be deleted. Claudesk will keep
    /// claiming a managed install that is gone until the record file is removed — surfaced
    /// so the user can act, never swallowed.
    #[error("uninstalled, but the install record could not be deleted: {0}")]
    RecordDeleteFailed(String),

    /// The caller cancelled between steps. `script_ran` tells the truth about how far it
    /// got: `false` means nothing was changed at all; `true` means the symlinks are already
    /// removed while the download and the record remain (a re-run finishes the job).
    #[error("cancelled by the user")]
    Cancelled { script_ran: bool },
}

/// What a fully successful uninstall did.
#[derive(Debug, PartialEq, Eq)]
pub struct UninstallSuccess {
    /// The clone directory that was removed — the guard-approved **canonicalized
    /// observation**, reported back so containment assertions consume a production value
    /// (never a test-constructed literal; the WP3.5a constant-true-assert lesson).
    pub removed_clone_dir: std::path::PathBuf,
}

/// Build the `--dry-run` invocation of the clone's own `uninstall.sh`.
///
/// Pure, like [`clone_command`]. Takes the guard-approved target, not a bare path — even the
/// read-only preview goes through the refuse-guard, so preview and action cannot disagree
/// about what they are pointed at.
pub fn dry_run_command(target: &UninstallTarget) -> (String, Vec<String>) {
    (
        target
            .clone_dir()
            .join(guard::UNINSTALL_SCRIPT)
            .to_string_lossy()
            .into_owned(),
        vec!["--dry-run".to_string()],
    )
}

/// Build the real invocation of the clone's own `uninstall.sh`.
pub fn uninstall_command(target: &UninstallTarget) -> (String, Vec<String>) {
    (
        target
            .clone_dir()
            .join(guard::UNINSTALL_SCRIPT)
            .to_string_lossy()
            .into_owned(),
        Vec::new(),
    )
}

/// Run `uninstall.sh --dry-run` and return its real output — the wizard's removal preview.
///
/// **The script's output IS the preview** (operator decision, script finding 2): Claudesk
/// never composes its own removal list, so preview and action share one source of truth.
/// Callers should expect — and render honestly — the shapes real runs produce: `[remove]`,
/// `[skip]`, `[ok]` lines, the *dangling into-repo link* case, and the unconditional legacy
/// `claude-time` removals (upstream design rescuing pre-retirement installs).
///
/// Touches nothing: `--dry-run` is the script's own no-write mode, verified by hand against
/// the sandbox at WP3.5a verify-human and pinned by a fixture test here.
pub fn run_dry_run(
    target: &UninstallTarget,
    sink: &dyn OutputSink,
) -> Result<String, UninstallError> {
    let (program, args) = dry_run_command(target);
    let (code, output) = run_streaming(&program, &args, Some(target.clone_dir()), sink)
        .map_err(|e| UninstallError::ScriptUnavailable(e.to_string()))?;
    if code != 0 {
        return Err(UninstallError::ScriptFailed { code, output });
    }
    Ok(output)
}

/// Uninstall a guard-approved managed clone: run its `uninstall.sh`, remove the clone
/// directory, and delete the provenance record — **in that order, record LAST**.
///
/// The ordering mirrors the install's write-last and exists for the same structural reason:
/// there is no code path where the record is deleted and the removal then fails, so a failed
/// uninstall always leaves the record describing what still exists
/// (`SURFACE-2026-07-30-WP3.5B-UNINSTALL-MUST-CLEAR-THE-PROVENANCE-RECORD`).
///
/// `cancelled` is polled **between steps only** — before the script, and after the script
/// but before the directory removal. Never mid-subprocess (killing the script halfway is how
/// you get a half-unlinked substrate), and deliberately NOT between the directory removal
/// and the record deletion: once the clone is gone, a record claiming it would be a lie, so
/// those two steps are one unit as far as cancellation is concerned.
pub fn run_uninstall(
    target: &UninstallTarget,
    claudesk_root: &Path,
    sink: &dyn OutputSink,
    cancelled: &dyn Fn() -> bool,
) -> Result<UninstallSuccess, UninstallError> {
    if cancelled() {
        return Err(UninstallError::Cancelled { script_ran: false });
    }

    // ── 1. The script — the substrate-editing half, with its own into-repo-only guards ──
    let (program, args) = uninstall_command(target);
    let (code, output) = run_streaming(&program, &args, Some(target.clone_dir()), sink)
        .map_err(|e| UninstallError::ScriptUnavailable(e.to_string()))?;
    if code != 0 {
        return Err(UninstallError::ScriptFailed { code, output });
    }

    if cancelled() {
        return Err(UninstallError::Cancelled { script_ran: true });
    }

    // ── 2. Remove the clone dir — THE crate's one deleting call, guard-typed target only ──
    std::fs::remove_dir_all(target.clone_dir()).map_err(|e| UninstallError::CloneRemoveFailed {
        path: target.clone_dir().display().to_string(),
        message: e.to_string(),
    })?;

    // ── 3. Delete the record — LAST, and only after everything it described is gone ──────
    provenance::delete_record(claudesk_root)
        .map_err(|e| UninstallError::RecordDeleteFailed(e.to_string()))?;

    Ok(UninstallSuccess {
        removed_clone_dir: target.clone_dir().to_path_buf(),
    })
}

/// The composition the command layer calls: refuse-guard, then uninstall.
///
/// Exists so the guard is **structurally in the call path** — a caller with a record and a
/// home cannot reach [`run_uninstall`] except through [`guard::refuse_guard`], and the
/// refusal arrives as a first-class [`UninstallError::Refused`] the terminal reducer can
/// explain. Also what makes "a refused run deletes nothing" testable end-to-end.
pub fn run_uninstall_guarded(
    record: Option<&InstallRecord>,
    home: &Path,
    claudesk_root: &Path,
    sink: &dyn OutputSink,
    cancelled: &dyn Fn() -> bool,
) -> Result<UninstallSuccess, UninstallError> {
    let target = guard::refuse_guard(record, home).map_err(UninstallError::Refused)?;
    run_uninstall(&target, claudesk_root, sink, cancelled)
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

    // ─── WP3.5b Phase 2: the uninstall engine, against the sandbox ─────────────────────

    /// Stage a managed install inside the sandbox: a clone dir carrying an executable
    /// `uninstall.sh` with the given body, plus a provenance record describing it.
    fn staged_managed_clone(sandbox: &Sandbox, script_body: &str) -> InstallRecord {
        let clone = sandbox.vendor_dir().join("mccc");
        std::fs::create_dir_all(&clone).unwrap();
        let script = clone.join(guard::UNINSTALL_SCRIPT);
        std::fs::write(&script, script_body).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let record = InstallRecord {
            clone_path: clone,
            installed_at: "2026-07-31T12:00:00Z".to_string(),
            origin_url: "git@example.com:someone/repo.git".to_string(),
        };
        provenance::write_record(&sandbox.claudesk_root(), &record).unwrap();
        record
    }

    /// Every path currently under the sandbox boundary — for proving a refused or cancelled
    /// run changed NOTHING (a before/after set comparison, not a containment assert).
    fn all_paths_under(root: &Path) -> Vec<std::path::PathBuf> {
        let mut paths = Vec::new();
        let mut stack = vec![root.to_path_buf()];
        while let Some(dir) = stack.pop() {
            for entry in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
                let p = entry.path();
                if p.is_dir() && !p.is_symlink() {
                    stack.push(p.clone());
                }
                paths.push(p);
            }
        }
        paths.sort();
        paths
    }

    #[test]
    fn a_successful_uninstall_runs_the_script_removes_the_clone_and_deletes_the_record_last() {
        // ═══════════════════════════════════════════════════════════════════════════
        // THE composed end-to-end path, on production-reported observations: record
        // read back from disk → refuse_guard → script → clone-dir removal → record
        // deletion → resolve_state lands on Absent. (The WP3.5a codify gap said: never
        // assert this chain on hand-built inputs.)
        // ═══════════════════════════════════════════════════════════════════════════
        let sandbox = Sandbox::new();
        staged_managed_clone(
            &sandbox,
            "#!/bin/sh\necho '  [remove] skills/feature-build'\n",
        );
        let record = provenance::read_record(&sandbox.claudesk_root());
        let sink = CollectingSink::new();

        let ok = run_uninstall_guarded(
            record.as_ref(),
            &sandbox.home(),
            &sandbox.claudesk_root(),
            &sink,
            &never_cancelled,
        )
        .expect("a staged managed clone must uninstall cleanly");

        // The script really ran — its own output is the evidence.
        assert!(
            sink.lines()
                .iter()
                .any(|l| l.contains("[remove] skills/feature-build")),
            "the script's real output must reach the sink, got {:?}",
            sink.lines()
        );
        // The clone is gone, and the reported path is the guard's canonicalized observation.
        assert!(!sandbox.vendor_dir().join("mccc").exists());
        assert_eq!(
            ok.removed_clone_dir,
            sandbox
                .vendor_dir()
                .join("mccc")
                .parent()
                .unwrap()
                .canonicalize()
                .unwrap()
                .join("mccc"),
            "the removed path must be the canonicalized observation"
        );
        // The record is gone — deleted LAST, so its absence certifies everything before it.
        assert!(provenance::read_record(&sandbox.claudesk_root()).is_none());
        // And the composed state decision now reads Absent (no skills dir in the sandbox).
        let present = crate::workflow_substrate::skills_dir_exists(&sandbox.home());
        assert_eq!(
            crate::workflow_install::resolve_state(
                present,
                provenance::read_record(&sandbox.claudesk_root()).as_ref()
            ),
            crate::workflow_install::InstallState::Absent
        );
    }

    #[test]
    fn after_uninstall_the_leftover_empty_skills_dir_reads_absent_not_developer() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The BLOCKING regression from Phase 3 verify-self, pinned at the composition
        // that actually broke — presence + provenance together, seeded from the shape a
        // REAL uninstall leaves on disk.
        //
        // `uninstall.sh` removes the per-skill symlinks and leaves `~/.claude/skills/`
        // standing (it never created it). With presence as a bare `is_dir()`, that empty
        // directory answered `true` while the record was gone, so
        // `resolve_state(true, None)` → `Developer`: the panel claimed "installed ✓ …
        // Claudesk won't modify or remove it" about a substrate it had just removed.
        //
        // Why no existing test caught it: the sandbox fixture never creates
        // `.claude/skills`, so every post-removal assertion ran with presence=false and
        // the composition was never exercised in the state a real machine reaches. This
        // test creates the directory FIRST, then empties it the way the script does.
        // ═══════════════════════════════════════════════════════════════════════════
        let sandbox = Sandbox::new();
        // Stage the clone FIRST — presence is now marker-based, so the skills entry must be a
        // real symlink into a repo whose install.sh carries the workflow-system marker (a bare
        // directory named `feature-build` is a USER's own skill, not this substrate).
        staged_managed_clone(&sandbox, "#!/bin/sh\necho ok\n");
        let clone = sandbox.vendor_dir().join("mccc");
        std::fs::write(
            clone.join("install.sh"),
            "#!/usr/bin/env bash\nBEGIN_MARKER=\"<!-- BEGIN claude-workflow-system -->\"\n",
        )
        .unwrap();
        std::fs::create_dir_all(clone.join("skills").join("feature-build")).unwrap();
        let skills = sandbox.claude_dir().join("skills");
        std::fs::create_dir_all(&skills).unwrap();
        std::os::unix::fs::symlink(
            clone.join("skills").join("feature-build"),
            skills.join("feature-build"),
        )
        .unwrap();
        assert_eq!(
            crate::workflow_install::resolve_state(
                crate::workflow_substrate::skills_dir_exists(&sandbox.home()),
                provenance::read_record(&sandbox.claudesk_root()).as_ref()
            ),
            crate::workflow_install::InstallState::Managed,
            "precondition: a populated skills dir plus a record is Managed"
        );

        // What the real script does: remove the SYMLINKS it created, leave the directory.
        std::fs::remove_file(skills.join("feature-build")).unwrap();
        assert!(skills.is_dir(), "the script leaves the skills dir standing");

        let record = provenance::read_record(&sandbox.claudesk_root());
        std::fs::remove_file(provenance::record_path(&sandbox.claudesk_root())).unwrap();
        assert!(
            record.is_some(),
            "precondition: a record existed before removal"
        );

        assert_eq!(
            crate::workflow_install::resolve_state(
                crate::workflow_substrate::skills_dir_exists(&sandbox.home()),
                provenance::read_record(&sandbox.claudesk_root()).as_ref()
            ),
            crate::workflow_install::InstallState::Absent,
            "a completed uninstall must read Absent — an empty leftover skills dir must \
             NOT make it read Developer, which would claim an install that is gone AND \
             say Claudesk will never touch it"
        );
    }

    #[test]
    fn a_failed_script_keeps_the_clone_and_the_record() {
        let sandbox = Sandbox::new();
        staged_managed_clone(&sandbox, "#!/bin/sh\necho 'about to fail'\nexit 3\n");
        let record = provenance::read_record(&sandbox.claudesk_root());
        let sink = CollectingSink::new();

        let err = run_uninstall_guarded(
            record.as_ref(),
            &sandbox.home(),
            &sandbox.claudesk_root(),
            &sink,
            &never_cancelled,
        )
        .unwrap_err();

        assert!(
            matches!(err, UninstallError::ScriptFailed { code: 3, .. }),
            "got {err:?}"
        );
        assert!(
            sandbox.vendor_dir().join("mccc").exists(),
            "a failed script must leave the clone for a retry"
        );
        assert!(
            provenance::read_record(&sandbox.claudesk_root()).is_some(),
            "the record must survive a failed script — it describes what still exists"
        );
    }

    #[test]
    fn a_failed_clone_removal_keeps_the_record() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The delete-record-LAST ordering, pinned BEHAVIORALLY by failure injection
        // (never by source position — that tripwire was proven decorative and deleted).
        // The removal step is made to fail by a read-only parent dir; the record must
        // survive, still describing the remains.
        // ═══════════════════════════════════════════════════════════════════════════
        use std::os::unix::fs::PermissionsExt;
        let sandbox = Sandbox::new();
        staged_managed_clone(&sandbox, "#!/bin/sh\necho ok\n");
        let record = provenance::read_record(&sandbox.claudesk_root());
        let sink = CollectingSink::new();
        std::fs::set_permissions(sandbox.vendor_dir(), std::fs::Permissions::from_mode(0o555))
            .unwrap();

        let err = run_uninstall_guarded(
            record.as_ref(),
            &sandbox.home(),
            &sandbox.claudesk_root(),
            &sink,
            &never_cancelled,
        )
        .unwrap_err();

        std::fs::set_permissions(sandbox.vendor_dir(), std::fs::Permissions::from_mode(0o755))
            .unwrap();
        assert!(
            matches!(err, UninstallError::CloneRemoveFailed { .. }),
            "got {err:?}"
        );
        assert!(
            provenance::read_record(&sandbox.claudesk_root()).is_some(),
            "the record must NOT be deleted when the removal step fails — delete-last is \
             the structural guarantee, and this is its behavioral pin"
        );
    }

    #[test]
    fn a_record_delete_failure_surfaces_after_removal() {
        // The inverse injection: removal succeeds (vendor writable), the record unlink fails
        // (claudesk_root read-only — permissions are not recursive). The failure must
        // surface as its own variant, never be swallowed as success.
        use std::os::unix::fs::PermissionsExt;
        let sandbox = Sandbox::new();
        staged_managed_clone(&sandbox, "#!/bin/sh\necho ok\n");
        let record = provenance::read_record(&sandbox.claudesk_root());
        let sink = CollectingSink::new();
        std::fs::set_permissions(
            sandbox.claudesk_root(),
            std::fs::Permissions::from_mode(0o555),
        )
        .unwrap();

        let err = run_uninstall_guarded(
            record.as_ref(),
            &sandbox.home(),
            &sandbox.claudesk_root(),
            &sink,
            &never_cancelled,
        )
        .unwrap_err();

        std::fs::set_permissions(
            sandbox.claudesk_root(),
            std::fs::Permissions::from_mode(0o755),
        )
        .unwrap();
        assert!(
            matches!(err, UninstallError::RecordDeleteFailed(_)),
            "got {err:?}"
        );
        assert!(
            !sandbox.vendor_dir().join("mccc").exists(),
            "the clone removal itself succeeded"
        );
        assert!(
            provenance::read_record(&sandbox.claudesk_root()).is_some(),
            "the record file is still there — which is exactly what the error reports"
        );
    }

    #[test]
    fn a_refused_run_deletes_nothing_at_all() {
        // ═══════════════════════════════════════════════════════════════════════════
        // The refuse-guard bites IN the deleting path: a tempting, fully deletable
        // clone with NO record. Proven by a before/after set comparison over every
        // path in the sandbox — stronger than containment, which only bounds writes.
        // ═══════════════════════════════════════════════════════════════════════════
        let sandbox = Sandbox::new();
        let clone = sandbox.vendor_dir().join("mccc");
        std::fs::create_dir_all(&clone).unwrap();
        std::fs::write(clone.join(guard::UNINSTALL_SCRIPT), "#!/bin/sh\n").unwrap();
        let before = all_paths_under(sandbox.boundary());
        let sink = CollectingSink::new();

        let err = run_uninstall_guarded(
            None,
            &sandbox.home(),
            &sandbox.claudesk_root(),
            &sink,
            &never_cancelled,
        )
        .unwrap_err();

        assert!(
            matches!(err, UninstallError::Refused(guard::RefusalReason::NoRecord)),
            "got {err:?}"
        );
        assert_eq!(
            before,
            all_paths_under(sandbox.boundary()),
            "a refused run must leave the filesystem byte-for-byte alone"
        );
        assert!(sink.lines().is_empty(), "nothing ran, so nothing streamed");
    }

    #[test]
    fn cancel_before_the_script_changes_nothing() {
        let sandbox = Sandbox::new();
        staged_managed_clone(&sandbox, "#!/bin/sh\necho ok\n");
        let record = provenance::read_record(&sandbox.claudesk_root());
        let before = all_paths_under(sandbox.boundary());
        let sink = CollectingSink::new();

        let err = run_uninstall_guarded(
            record.as_ref(),
            &sandbox.home(),
            &sandbox.claudesk_root(),
            &sink,
            &|| true,
        )
        .unwrap_err();

        assert!(
            matches!(err, UninstallError::Cancelled { script_ran: false }),
            "got {err:?}"
        );
        assert_eq!(before, all_paths_under(sandbox.boundary()));
    }

    #[test]
    fn cancel_after_the_script_keeps_the_clone_and_the_record() {
        // Cancel polled BETWEEN steps: the script has run (its edits stand — it is
        // idempotent, a re-run finishes the job), but the clone and record survive, so the
        // state remains managed and retryable. There is deliberately NO cancel point after
        // the clone removal — a record describing a removed clone would be a lie.
        use std::sync::atomic::{AtomicUsize, Ordering};
        let sandbox = Sandbox::new();
        staged_managed_clone(&sandbox, "#!/bin/sh\necho 'script ran'\n");
        let record = provenance::read_record(&sandbox.claudesk_root());
        let sink = CollectingSink::new();
        let polls = AtomicUsize::new(0);
        let cancel_on_second_poll = || polls.fetch_add(1, Ordering::SeqCst) >= 1;

        let err = run_uninstall_guarded(
            record.as_ref(),
            &sandbox.home(),
            &sandbox.claudesk_root(),
            &sink,
            &cancel_on_second_poll,
        )
        .unwrap_err();

        assert!(
            matches!(err, UninstallError::Cancelled { script_ran: true }),
            "got {err:?}"
        );
        assert!(
            sink.lines().iter().any(|l| l == "script ran"),
            "the script genuinely ran before the cancel was honored"
        );
        assert!(sandbox.vendor_dir().join("mccc").exists());
        assert!(provenance::read_record(&sandbox.claudesk_root()).is_some());
    }

    #[test]
    fn dry_run_returns_the_scripts_output_and_touches_nothing() {
        // The preview contract: real script output (including the dangling-link shape), and
        // the script proves it was invoked WITH the flag by mutating only when it is absent.
        let sandbox = Sandbox::new();
        staged_managed_clone(
            &sandbox,
            "#!/bin/sh\nif [ \"$1\" != \"--dry-run\" ]; then touch mutated; fi\n\
             echo '  [remove] skills/foo (dry-run)'\n\
             echo '  [remove] hooks/claude-time-hook.pl (dry-run, dangling into-repo link)'\n",
        );
        let record = provenance::read_record(&sandbox.claudesk_root());
        let target = guard::refuse_guard(record.as_ref(), &sandbox.home()).unwrap();
        let before = all_paths_under(sandbox.boundary());
        let sink = CollectingSink::new();

        let output = run_dry_run(&target, &sink).expect("dry-run must succeed");

        assert!(output.contains("[remove] skills/foo"), "got: {output}");
        assert!(
            output.contains("dangling into-repo link"),
            "the preview must carry the real shapes the script emits, got: {output}"
        );
        assert!(
            !sandbox.vendor_dir().join("mccc").join("mutated").exists(),
            "the --dry-run flag must actually reach the script"
        );
        assert_eq!(
            before,
            all_paths_under(sandbox.boundary()),
            "a dry run must change nothing on disk"
        );
    }

    #[test]
    fn dry_run_command_passes_the_flag_as_one_argument() {
        let sandbox = Sandbox::new();
        staged_managed_clone(&sandbox, "#!/bin/sh\n");
        let record = provenance::read_record(&sandbox.claudesk_root());
        let target = guard::refuse_guard(record.as_ref(), &sandbox.home()).unwrap();

        let (program, args) = dry_run_command(&target);

        assert!(program.ends_with("/uninstall.sh"), "got {program}");
        assert_eq!(args, vec!["--dry-run".to_string()]);
    }

    #[test]
    fn uninstall_command_runs_the_script_by_absolute_path_with_no_flags() {
        let sandbox = Sandbox::new();
        staged_managed_clone(&sandbox, "#!/bin/sh\n");
        let record = provenance::read_record(&sandbox.claudesk_root());
        let target = guard::refuse_guard(record.as_ref(), &sandbox.home()).unwrap();

        let (program, args) = uninstall_command(&target);

        assert!(std::path::Path::new(&program).is_absolute());
        assert!(program.ends_with("/uninstall.sh"));
        assert!(args.is_empty(), "the real run passes no flags — {args:?}");
    }

    #[test]
    fn roots_are_injected_never_ambient() {
        // The same rule mod.rs and provenance.rs carry, on the module that spawns
        // subprocesses. The delete-token half of the old `this_module_ships_no_deleting_path`
        // guard moved to the crate-level guard in `source_guard.rs` at WP3.5b Phase 1 —
        // "no delete anywhere" expired as a per-module claim once a deleting WP started.
        let code =
            crate::workflow_install::source_guard::production_code(include_str!("runner.rs"));

        for forbidden in ["home_dir", "env::var", "std::env", "dirs::home"] {
            assert!(
                !code.contains(forbidden),
                "runner must not resolve roots ambiently (`{forbidden}`) — every root \
                 arrives as a parameter so the sandbox can contain every write."
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

    // `the_provenance_write_is_the_last_step_in_the_source` was DELETED at WP3.5b Phase 1,
    // per SURFACE-2026-07-29-QUALITY-WP3.5A-SOURCE-GUARD-CONSOLIDATION action (4). It was a
    // position tripwire twice proven to pass the regression it names (a write moved onto the
    // failure branch; a module-alias bypass); its 30-line disclaimer outweighed its value.
    // The REAL coverage was and remains the four behavioral tests asserting
    // `read_record(...).is_none()` after every failure path — those caught every mutation,
    // including the ones that beat the tripwire.
}
