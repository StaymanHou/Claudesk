//! M18 WP6 — installing the workflow system on a REMOTE host account, over the host's
//! ControlMaster (`arch/claude-substrate.md` §R.3, §R.6).
//!
//! ## The shape: one script, run on the host, reporting through sentinel lines
//! The whole install is ONE login-shell script, streamed back over one ssh exec
//! ([`super::runner::run_streaming_abortable`] with the master's `ssh` as the program). The host
//! does the work and the decisions that need the host's own filesystem; Rust builds the script
//! (pure, here), reads its sentinel lines as they arrive, and decides what the ending MEANS
//! ([`resolve`], pure, here). The commands layer acts.
//!
//! Every value that enters the script is quoted ([`crate::remote_cmd::quote`]); the root is also
//! checked to be an absolute, normalized remote path before anything is built.
//!
//! ## What the script does, in order (every refusal writes nothing)
//! 1. `pgid:<n>` first, so Cancel can kill the run's process group ON THE HOST (operator ruling A,
//!    WP3 "Probe outcomes" (1): a local kill does not stop the remote side).
//! 2. The root must exist; the Developer-tools guard ([`DEV_TOOLS_GUARD`], the guarded form: the
//!    bare `xcode-select -p` passes on a no-tools host) must pass, or `result:no-devtools`.
//!    ⚠️ The guard is an `&&` chain, so its negation is GROUPED (`! { …; }`): a bare `! a && b
//!    && c` negates only `a`, and on a no-tools host the refusal never fired (caught at build by
//!    the stub-`xcode-select` test).
//! 3. **The host re-checks (D3).** `SUBSTRATE_PROBE` runs against the root; anything but
//!    `substrate:no`, or an existing record, is `result:already-present`. So a stale Settings
//!    readout can never make Install act on an installed account.
//! 4. **A leftover clone with no record is removed (D4)** — the app died after a clone, before
//!    `install.sh` ("Probe outcomes" (1)). Only when it is a real directory (not a symlink) whose
//!    physical path is EXACTLY `<physical root>/.claudesk/vendor/<name>`. Anything else is
//!    `result:stale-refused:<why>`, and nothing is removed. This is the module's one `rm -rf`
//!    (pinned by `source_guard`).
//! 5. `phase:clone`, then `git clone` of the public HTTPS URL (a host has no GitHub key), with the
//!    developer dir's own `git`, never a PATH lookup, non-interactively.
//! 6. `phase:install`, and from here the run cannot be split (D5, 6.3b,
//!    `SURFACE-2026-11-20-QUALITY-INSTALL-SH-WINDOW-UNGUARDED-AGAINST-STREAM-DEATH`): the shell
//!    ignores HUP, PIPE, TERM and INT, so neither a late Cancel's group kill nor a dead stream (an
//!    app quit) can stop `install.sh` between two links. `install.sh` writes to a log file, not
//!    the stream: it is `set -e`, so an echo into a dead pipe would end it even with SIGPIPE
//!    ignored. The log is printed afterwards.
//!    ⚠️ `install.sh` runs as a DIRECT child of the script's shell, never inside `( … )`: zsh
//!    resets an ignored trap in a subshell, so a `( cd … && ./install.sh )` let a TERM or HUP that
//!    arrived while `install.sh` ran kill it (exit 143) between two links (WP7 Phase 1; the WP6
//!    test passed only because its kill landed within ~2 ms, before zsh forked the subshell).
//! 7. The record is written LAST, only after `install.sh` exits 0: Rust's JSON, written by a
//!    constant-format `printf` to a temp file, then `mv`'d into place.
//! 8. `result:<arm>`.

use std::time::Duration;

use serde::Serialize;

use super::provenance::{InstallRecord, RECORD_FILENAME};
use super::{CLONE_DIR_NAME, DEFAULT_VENDOR_SUBPATH};
use crate::remote_cmd::{
    is_normalized_remote_path, login_shell, quote, substrate_probe_invocation, DEV_TOOLS_FIX,
    DEV_TOOLS_GUARD,
};
use crate::remote_substrate::HostSubstrate;

/// The repository a host clones. The PUBLIC HTTPS URL: a host account has no GitHub key (M18
/// grill fact). The local wizard's SSH URL is unchanged.
pub const REMOTE_ORIGIN_URL: &str =
    "https://github.com/StaymanHou/stayman-claude-code-customization.git";

/// The prefix of every line the run script prints for Claudesk rather than for the operator.
pub const RUN_SENTINEL: &str = "CLAUDESK-RUN:";

/// How long a remote install may run before its local ssh is killed: the local clone and install
/// deadlines together. Only a true hang reaches it (a clone takes ~4 s, `install.sh` ~0.5 s).
pub const REMOTE_INSTALL_DEADLINE: Duration = Duration::from_secs(1200);

/// The vendor dir's path under a root, `/`-joined: `.claudesk/vendor`, from the local wizard's
/// [`DEFAULT_VENDOR_SUBPATH`] (one source for both, and for the run script's paths).
fn vendor_subpath() -> String {
    DEFAULT_VENDOR_SUBPATH.join("/")
}

/// The clone's path under `root` on the host.
pub fn remote_clone_path(root: &str) -> String {
    format!("{root}/{}/{CLONE_DIR_NAME}", vendor_subpath())
}

/// The record a successful run writes on the host.
pub fn remote_record(root: &str, installed_at: &str) -> InstallRecord {
    InstallRecord {
        updated_at: None,
        clone_path: remote_clone_path(root).into(),
        installed_at: installed_at.to_string(),
        origin_url: REMOTE_ORIGIN_URL.to_string(),
    }
}

/// Whether `root` may enter a script: an absolute, normalized remote path, not `/`, with no
/// newline. Everything else is refused before anything is built.
pub fn valid_root(root: &str) -> bool {
    root != "/" && !root.contains('\n') && is_normalized_remote_path(root)
}

/// The script's text with every placeholder still in it. `__X__` placeholders are replaced by
/// [`install_script_from`], each with an already-quoted value or a constant fragment.
const TEMPLATE: &str = r#"echo "CLAUDESK-RUN:pgid:$(ps -o pgid= -p $$ | tr -d ' ')"
root=__ROOT__
vendor="$root/__VENDOR__"
clone="$vendor/__NAME__"
rec="$root/__DOTDIR__/__RECORD__"
log="$root/__DOTDIR__/install.log"
if [ ! -d "$root" ]; then echo 'CLAUDESK-RUN:result:no-root'; exit 0; fi
if ! { __GUARD__; }; then echo 'CLAUDESK-RUN:result:no-devtools'; exit 0; fi
p=$(__PROBE__)
case "$p" in
  *'CLAUDESK-OPEN:substrate:no'*) ;;
  *) echo 'CLAUDESK-RUN:result:already-present'; exit 0 ;;
esac
if [ -e "$rec" ] || [ -L "$rec" ]; then echo 'CLAUDESK-RUN:result:already-present'; exit 0; fi
if [ -e "$clone" ] || [ -L "$clone" ]; then
  if [ -L "$clone" ] || [ ! -d "$clone" ]; then echo 'CLAUDESK-RUN:result:stale-refused:not-a-folder'; exit 0; fi
  rp=$(cd -P -- "$root" && pwd -P)
  cp=$(cd -P -- "$clone" && pwd -P)
  if [ -z "$rp" ] || [ "$cp" != "$rp/__VENDOR__/__NAME__" ]; then echo 'CLAUDESK-RUN:result:stale-refused:outside-root'; exit 0; fi
  echo 'Removing a leftover clone from an earlier run that did not finish.'
  echo 'CLAUDESK-RUN:stale-removed'
  rm -rf -- "$cp"
  if [ -e "$cp" ]; then echo 'CLAUDESK-RUN:result:stale-refused:not-removed'; exit 0; fi
fi
mkdir -p -- "$vendor" || { echo 'CLAUDESK-RUN:result:no-write'; exit 0; }
echo 'CLAUDESK-RUN:phase:clone'
GIT_TERMINAL_PROMPT=0 "$d/usr/bin/git" clone -- __URL__ "$clone" </dev/null 2>&1
rc=$?
if [ "$rc" -ne 0 ]; then echo "CLAUDESK-RUN:result:clone-failed:$rc"; exit 0; fi
if [ ! -f "$clone/install.sh" ]; then echo 'CLAUDESK-RUN:result:no-install-script'; exit 0; fi
trap '' HUP PIPE TERM INT
echo 'CLAUDESK-RUN:phase:install'
cd -- "$clone" && HOME="$root" ./install.sh </dev/null >"$log" 2>&1
irc=$?
if [ "$irc" -eq 0 ]; then
  if printf '%s\n' __JSON__ >"$rec.tmp" && mv -f -- "$rec.tmp" "$rec"; then w=0; else w=1; fi
fi
cat -- "$log"
if [ "$irc" -ne 0 ]; then echo "CLAUDESK-RUN:result:install-failed:$irc"
elif [ "$w" -ne 0 ]; then echo 'CLAUDESK-RUN:result:record-failed'
else echo 'CLAUDESK-RUN:result:ok'; fi"#;

/// The run script for `root`, cloning `url`, writing `record` on success. `Err` when the root is
/// not a valid remote path. Production passes [`REMOTE_ORIGIN_URL`] (via [`install_command`]);
/// tests pass a local fixture repo.
pub fn install_script_from(
    root: &str,
    url: &str,
    record: &InstallRecord,
) -> Result<String, String> {
    if !valid_root(root) {
        return Err(format!(
            "the host's install root {root:?} is not an absolute, normalized path"
        ));
    }
    let json = serde_json::to_string(record).map_err(|e| e.to_string())?;
    // The probe reads the ROOT (normally the account's `$HOME`), always: in production the two
    // are the same, and under the debug sandbox override the probe must not read the real one.
    let probe = substrate_probe_invocation(Some(root));
    fill(
        TEMPLATE,
        &[
            ("__ROOT__", &quote(root)),
            ("__NAME__", CLONE_DIR_NAME),
            ("__VENDOR__", &vendor_subpath()),
            ("__DOTDIR__", DEFAULT_VENDOR_SUBPATH[0]),
            ("__RECORD__", RECORD_FILENAME),
            ("__GUARD__", DEV_TOOLS_GUARD),
            ("__PROBE__", &probe),
            ("__URL__", &quote(url)),
            ("__JSON__", &quote(&json)),
        ],
    )
}

/// Fill `template`'s placeholders in ONE pass over the template: an inserted value is never
/// scanned again. ⚠️ A chain of `str::replace` calls rescans every earlier value, so a root that
/// itself contains `__JSON__` had the quoted JSON spliced INTO its quotes, leaving the JSON (and
/// a `$(…)` in the root) unquoted, and the `$(…)` ran (caught at Phase 2 verify-self). A
/// placeholder in the template with no value is an `Err`, never left in the script.
pub(crate) fn fill(template: &str, values: &[(&str, &str)]) -> Result<String, String> {
    let mut out = String::with_capacity(template.len() * 2);
    let mut rest = template;
    while let Some(at) = rest.find("__") {
        out.push_str(&rest[..at]);
        let tail = &rest[at..];
        match values.iter().find(|(k, _)| tail.starts_with(k)) {
            Some((k, v)) => {
                out.push_str(v);
                rest = &tail[k.len()..];
            }
            None => {
                return Err(format!(
                    "unfilled placeholder in the run script at {:?}",
                    &tail[..tail.len().min(16)]
                ))
            }
        }
    }
    out.push_str(rest);
    Ok(out)
}

/// The remote command for an install into `root`: [`install_script_from`] with the public URL,
/// under the login-shell wrapper (the host's PATH, as every remote command here).
pub fn install_command(root: &str, record: &InstallRecord) -> Result<String, String> {
    Ok(login_shell(&install_script_from(
        root,
        REMOTE_ORIGIN_URL,
        record,
    )?))
}

/// The remote command Cancel runs: TERM to the run's whole process group, on the host. The pgid
/// is a number Rust parsed ([`parse_run_line`]), never text from the stream.
pub fn cancel_command(pgid: u32) -> String {
    format!("kill -TERM -- -{pgid}")
}

/// What Cancel needs to know about a remote run in flight, written by the run's worker as the
/// sentinels arrive and read by the Cancel command (a lock read).
#[derive(Debug, Default)]
pub(crate) struct RemoteRunState {
    /// The run's process group on the host, once the script's first line arrived.
    pub(crate) pgid: Option<u32>,
    /// The phase the stream last reported.
    pub(crate) phase: Option<Phase>,
    /// Cancel was requested, and not refused as too late.
    pub(crate) cancel_requested: bool,
}

/// What the run's abort poll decides, from the cancel state. Pure.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum AbortStep {
    /// Keep running: no Cancel, or Cancel came too late (the install phase).
    Continue,
    /// Kill the run's group on the host, then keep reading until the stream ends by itself.
    KillRemote(u32),
    /// Stop the local ssh: the script has not printed its pgid yet, so there is nothing to
    /// address on the host (its next write, the pgid line or the phase, then ends it).
    StopLocal,
}

pub(crate) fn abort_step(state: &RemoteRunState) -> AbortStep {
    if !state.cancel_requested || state.phase == Some(Phase::Install) {
        return AbortStep::Continue;
    }
    match state.pgid {
        Some(pgid) => AbortStep::KillRemote(pgid),
        None => AbortStep::StopLocal,
    }
}

/// The line shown when the host did not confirm the Cancel's group kill.
pub const CANCEL_UNCONFIRMED_NOTE: &str =
    "[Cancel: the host did not confirm the stop; waiting for the run to end.]";

/// One poll of a remote run's abort (every 20 ms, on the run's worker). Returns whether the local
/// ssh is to be stopped.
///
/// ⚠️ **Once the pgid is known it never stops the local side** (WP7 D2,
/// `SURFACE-2026-11-20-QUALITY-REMOTE-CANCEL-CAN-REPORT-NOTHING-INSTALLED-WRONGLY`). Stopping the
/// local ssh does NOT stop the host's run (WP3 "Probe outcomes" (1)): if the kill failed, or reached
/// the host after the clone ended and the install window's `trap` was set, the run carried on
/// unread, the re-probe read Absent (no record YET), and the result said "Nothing was installed"
/// moments before the host became Managed. So the kill is sent ONCE and the stream is read to its
/// end: a kill that landed in the clone ends it with no result (true: nothing installed), a late
/// one is ignored by the trap and the run reports its own `result:ok`. A kill that did not confirm
/// prints [`CANCEL_UNCONFIRMED_NOTE`] and still waits; the deadline bounds a true hang.
pub(crate) fn abort_poll(
    state: &std::sync::Mutex<RemoteRunState>,
    kill_sent: &std::cell::Cell<bool>,
    send_kill: &dyn Fn(u32) -> Result<(), String>,
    notify: &dyn Fn(&str),
) -> bool {
    let step = state
        .lock()
        .map(|r| abort_step(&r))
        .unwrap_or(AbortStep::Continue);
    match step {
        AbortStep::Continue => false,
        AbortStep::StopLocal => true,
        AbortStep::KillRemote(pgid) => {
            if !kill_sent.replace(true) && send_kill(pgid).is_err() {
                notify(CANCEL_UNCONFIRMED_NOTE);
            }
            false
        }
    }
}

/// The phase a run has reached.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    /// `git clone` is running. Cancel is honoured. (Before it, while the checks and any
    /// leftover-clone removal run, no phase has been reported: Cancel is honoured then too.)
    Clone,
    /// M18 WP7 — an Update's `git fetch`. Cancel is honoured, as during the clone (a killed fetch
    /// leaves the clone's work tree as it was).
    Fetch,
    /// `install.sh` and the record write (an Update's merge too). Cancel is NOT honoured
    /// (ruling A).
    Install,
}

/// How a run's script ended, as it reported it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunResult {
    Ok,
    NoRoot,
    /// The root exists, but Claudesk's own folder under it could not be created (permissions).
    NoWrite,
    NoDevTools,
    AlreadyPresent,
    /// A leftover clone could not be removed safely: `not-a-folder`, `outside-root` or
    /// `not-removed`.
    StaleRefused(String),
    CloneFailed(i32),
    NoInstallScript,
    InstallFailed(i32),
    RecordWriteFailed,
}

/// One sentinel line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunLine {
    Pgid(u32),
    Phase(Phase),
    StaleRemoved,
    Result(RunResult),
}

/// Read one output line: `Some` for a sentinel Claudesk understands, `None` for anything else (the
/// operator's output, or a malformed sentinel, which is then simply not acted on). A pgid must be
/// all digits and above 1: a group kill of 0 or 1 would mean something else entirely.
pub fn parse_run_line(line: &str) -> Option<RunLine> {
    let rest = line.trim().strip_prefix(RUN_SENTINEL)?;
    if let Some(n) = rest.strip_prefix("pgid:") {
        if n.is_empty() || !n.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        return n.parse().ok().filter(|&p: &u32| p > 1).map(RunLine::Pgid);
    }
    let code = |s: &str| s.parse::<i32>().ok();
    Some(match rest {
        "phase:clone" => RunLine::Phase(Phase::Clone),
        "phase:fetch" => RunLine::Phase(Phase::Fetch),
        "phase:install" => RunLine::Phase(Phase::Install),
        "stale-removed" => RunLine::StaleRemoved,
        "result:ok" => RunLine::Result(RunResult::Ok),
        "result:no-root" => RunLine::Result(RunResult::NoRoot),
        "result:no-write" => RunLine::Result(RunResult::NoWrite),
        "result:no-devtools" => RunLine::Result(RunResult::NoDevTools),
        "result:already-present" => RunLine::Result(RunResult::AlreadyPresent),
        "result:no-install-script" => RunLine::Result(RunResult::NoInstallScript),
        "result:record-failed" => RunLine::Result(RunResult::RecordWriteFailed),
        r => {
            if let Some(why) = r.strip_prefix("result:stale-refused:") {
                RunLine::Result(RunResult::StaleRefused(why.to_string()))
            } else if let Some(c) = r.strip_prefix("result:clone-failed:").and_then(code) {
                RunLine::Result(RunResult::CloneFailed(c))
            } else if let Some(c) = r.strip_prefix("result:install-failed:").and_then(code) {
                RunLine::Result(RunResult::InstallFailed(c))
            } else {
                return None;
            }
        }
    })
}

/// Which substrate operation a remote run is (WP7): the finished payload names it, so one event
/// serves all three.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteOp {
    Install,
    Update,
    Uninstall,
}

/// What a finished remote run MEANS, for the frontend. Built only by the reducers: [`resolve`]
/// (install) and `remote_ops::resolve_uninstall`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RemoteRunFinished {
    pub host: String,
    pub op: RemoteOp,
    /// True when the run did what it was for (install: Managed; uninstall: Absent).
    pub ok: bool,
    /// True when a Cancel stopped the run before anything was installed.
    pub cancelled: bool,
    /// Plain words for the entry. `None` on a clean success (the readout itself says Managed).
    pub message: Option<String>,
}

/// The host's state after the run, in a phrase.
fn state_words(after: Option<&HostSubstrate>) -> &'static str {
    match after {
        Some(HostSubstrate::Managed { .. }) => "installed by Claudesk (Managed)",
        Some(HostSubstrate::Developer { .. }) => {
            "Developer (installed, but with no Claudesk record)"
        }
        Some(HostSubstrate::Absent) => "Absent (nothing installed)",
        Some(HostSubstrate::Unknown) | None => "unknown: Claudesk couldn't re-check it",
    }
}

/// The ending → what it means. Pure. **The re-probe (`after`) is the authority on the host's
/// state** (D6): a script that reported `ok` but a host that does not read as Managed is not a
/// success, and a run that never reported (a late Cancel, a dropped connection) is judged by what
/// the host now IS. Every arm is written out: a new [`RunResult`] must decide here.
pub fn resolve(
    host: &str,
    result: Option<&RunResult>,
    exit: i32,
    cancel_requested: bool,
    after: Option<&HostSubstrate>,
) -> RemoteRunFinished {
    let managed = matches!(after, Some(HostSubstrate::Managed { .. }));
    let done = |ok: bool, cancelled: bool, message: Option<String>| RemoteRunFinished {
        host: host.to_string(),
        op: RemoteOp::Install,
        ok,
        cancelled,
        message,
    };
    let nothing_recorded = "Nothing was recorded, so you can retry.";
    let too_late = "Cancel came after install.sh had started, so the install finished.";
    match result {
        Some(RunResult::Ok) if managed && cancel_requested => {
            done(true, false, Some(too_late.to_string()))
        }
        Some(RunResult::Ok) if managed => done(true, false, None),
        Some(RunResult::Ok) if after.is_none() || after == Some(&HostSubstrate::Unknown) => done(
            true,
            false,
            Some(
                "Installed. Claudesk couldn't re-check the host afterwards; reopen Settings to \
                 refresh it."
                    .to_string(),
            ),
        ),
        Some(RunResult::Ok) => done(
            false,
            false,
            Some(format!(
                "install.sh finished, but the host now reads as {}.",
                state_words(after)
            )),
        ),
        Some(RunResult::NoRoot) => done(
            false,
            false,
            Some(format!(
                "The install folder doesn't exist on the host. {nothing_recorded}"
            )),
        ),
        Some(RunResult::NoWrite) => done(
            false,
            false,
            Some(format!(
                "Claudesk couldn't create its folder ({}) under the install folder on the host; \
                 check that account's permissions there. {nothing_recorded}",
                vendor_subpath()
            )),
        ),
        Some(RunResult::NoDevTools) => done(
            false,
            false,
            Some(format!(
                "The host has no developer tools, so git can't run there: {DEV_TOOLS_FIX}. \
                 Nothing was changed."
            )),
        ),
        Some(RunResult::AlreadyPresent) => done(
            false,
            false,
            Some(format!(
                "The host already has the workflow system (it reads as {}). Nothing was changed.",
                state_words(after)
            )),
        ),
        Some(RunResult::StaleRefused(why)) => done(
            false,
            false,
            Some(format!(
                "A leftover folder at the clone path could not be removed safely ({why}). Nothing \
                 was changed; remove it on the host by hand, then retry."
            )),
        ),
        Some(RunResult::CloneFailed(code)) => done(
            false,
            false,
            Some(format!(
                "git clone failed (exit {code}); its output is above. {nothing_recorded}"
            )),
        ),
        Some(RunResult::NoInstallScript) => done(
            false,
            false,
            Some(format!(
                "The cloned repository has no install.sh. {nothing_recorded}"
            )),
        ),
        Some(RunResult::InstallFailed(code)) => done(
            false,
            false,
            Some(format!(
                "install.sh failed (exit {code}); its output is above. No record was written, so \
                 the host now reads as {}.",
                state_words(after)
            )),
        ),
        Some(RunResult::RecordWriteFailed) => done(
            false,
            false,
            Some(
                "install.sh succeeded, but the install record could not be written, so the host \
                 reads as Developer and offers no Uninstall."
                    .to_string(),
            ),
        ),
        None if cancel_requested && managed => done(true, false, Some(too_late.to_string())),
        None if cancel_requested && after == Some(&HostSubstrate::Absent) => done(
            false,
            true,
            Some("Cancelled. Nothing was installed.".to_string()),
        ),
        None if cancel_requested => done(
            false,
            true,
            Some(format!(
                "Cancelled. The host now reads as {}.",
                state_words(after)
            )),
        ),
        None if managed => done(
            true,
            false,
            Some(
                "The connection ended before the run reported back, but the host reads as \
                 installed."
                    .to_string(),
            ),
        ),
        None => done(
            false,
            false,
            Some(format!(
                "The run ended without reporting a result (exit {exit}). The host now reads as \
                 {}.",
                state_words(after)
            )),
        ),
    }
}

#[cfg(test)]
#[path = "remote_runner_tests.rs"]
pub(crate) mod tests;
