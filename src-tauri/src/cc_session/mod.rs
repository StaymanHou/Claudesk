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
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine as _;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;

/// The external CLI Claudesk drives.
const CC_CMD: &str = "claude";
/// CC's `--permission-mode` flag. A CC session's permission behavior is chosen once
/// per process via this flag (see [`build_cc_argv`]); the value is one of
/// [`CcPermissionMode`]'s wire strings.
const CC_ARG_PERMISSION_MODE: &str = "--permission-mode";
/// CC's `--model` flag (M11.5 WP1). Passed ONLY when a project sets an override — see
/// the asymmetry note on [`build_cc_argv`]. `claude --help`: *"Provide an alias for the
/// latest model (e.g. 'fable', 'opus', or 'sonnet') or a model's full name (e.g.
/// 'claude-fable-5')."*
const CC_ARG_MODEL: &str = "--model";
/// CC's `-c`/`--continue` flag — **M12 WP3 Phase 4, the auto-resume argv arm.**
///
/// ⚠️ **This is deliberately a SPAWN FLAG and not an injected slash command.** Phase 1's
/// probe established that a bare `/resume` typed into the TUI opens an **interactive modal
/// session picker** ("Resume session", "1 of 17", a search box, "Esc to cancel") rather than
/// resuming anything, which would strand the user in a keyboard modal on every unclean
/// re-open — strictly worse than firing nothing. There is no `/continue` slash command
/// either; CC's autocomplete lists one entry, `/resume (continue)`, for the same picker.
///
/// `--continue` was verified live to restore the prior conversation **non-interactively** and
/// land at a ready prompt. Because it is present at `execvp` time, this arm needs **no
/// injection and no settle delay** — which is why it is the *safe* arm and why the
/// milestone's riskiest mechanism (composing input on the app's own initiative) covers only
/// the `/session-restore` arm.
const CC_ARG_CONTINUE: &str = "--continue";

/// The Claude Code permission mode a spawned CC session runs under — the full
/// `--permission-mode` choice set from `claude --help` (friend-requested, replacing the
/// earlier yolo on/off boolean). The setting is app-global, persisted in
/// `AppSettings.cc_permission_mode`, read at spawn time (a change takes effect on the
/// NEXT `cc_spawn`, since the flag is fixed once per CC process).
///
/// Serializes camelCase to match CC's own `--permission-mode` values **byte-for-byte**
/// (`"default"`, `"plan"`, `"acceptEdits"`, `"auto"`, `"dontAsk"`, `"bypassPermissions"`)
/// — the serialized string is passed straight to the CLI, and the TS union in
/// `src/cc/permissionMode.ts` mirrors these same strings across the IPC boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum CcPermissionMode {
    /// Normal permission prompts (CC's out-of-the-box behavior). The Claudesk default
    /// when unset / first run.
    #[default]
    #[serde(rename = "default")]
    Default,
    /// Plan mode — CC plans without making edits until approved.
    #[serde(rename = "plan")]
    Plan,
    /// Auto-accept file edits; still prompts for other actions.
    #[serde(rename = "acceptEdits")]
    AcceptEdits,
    /// Auto mode — CC auto-selects permission decisions without prompting (broader than
    /// `acceptEdits`, which only auto-accepts edits; still bounded by CC's own policy, unlike
    /// `bypassPermissions`).
    #[serde(rename = "auto")]
    Auto,
    /// Suppress permission prompts — CC proceeds without asking. Narrower than
    /// `bypassPermissions` (which removes the checks entirely); this just stops the prompting.
    #[serde(rename = "dontAsk")]
    DontAsk,
    /// Bypass all permission checks — the old "yolo" behavior
    /// (`--dangerously-skip-permissions` equivalent).
    #[serde(rename = "bypassPermissions")]
    BypassPermissions,
}

impl CcPermissionMode {
    /// The wire string CC's `--permission-mode` flag expects (identical to the serde
    /// rename). Kept as an explicit method so [`build_cc_argv`] doesn't round-trip through
    /// serde just to get the CLI token.
    pub fn as_flag_value(self) -> &'static str {
        match self {
            CcPermissionMode::Default => "default",
            CcPermissionMode::Plan => "plan",
            CcPermissionMode::AcceptEdits => "acceptEdits",
            CcPermissionMode::Auto => "auto",
            CcPermissionMode::DontAsk => "dontAsk",
            CcPermissionMode::BypassPermissions => "bypassPermissions",
        }
    }
}
/// Chunk size for the PTY reader. WP2 saw multi-KB redraws; 4 KB matches the probe.
const READ_CHUNK: usize = 4096;
/// Fallback shell for the WP9 second-terminal panel when `$SHELL` is unset (macOS
/// default login shell since Catalina). Used by [`resolve_shell_argv`].
const DEFAULT_SHELL: &str = "/bin/zsh";

/// Timing + signal policy for [`PtyCcSession::kill`] (M10.5 WP3). Extracted as a value
/// so the *sequence* — how long we wait for a clean exit, then which signals in what
/// order — is asserted in a unit test without a real PTY or wall-clock (`Instant`).
///
/// **Why SIGHUP, not SIGTERM (the load-bearing choice):** an interactive login shell
/// (`zsh -l -i`, the WP9 terminal) writes its command history to `HISTFILE` only on a
/// *clean or hangup* exit — the operator's zsh has `SHARE_HISTORY`/`INC_APPEND_HISTORY`
/// off (system-default `/etc/zshrc`), so history is NOT saved incrementally. Verified
/// (M10.5 WP3) against a real `zsh -l -i` idle at the prompt: **SIGHUP saves history**
/// (its default hangup handler runs the save, ~20ms); **SIGTERM / SIGINT / SIGKILL lose
/// it**. So closing a workspace/app without typing `exit` must deliver **SIGHUP** (with a
/// grace window for the save) — otherwise the user silently loses their shell history
/// (the primary bug this WP fixes). SIGHUP is also the semantically-correct "your
/// terminal closed" signal every login shell (zsh, bash) is built to handle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct KillTiming {
    /// How long to poll `try_wait` after writing `exit_command\r`, giving an *idle*
    /// interactive session a chance to exit cleanly on its own (the fastest, nicest path
    /// — and the shell saves its own history). A *busy* session won't read the command;
    /// we fall through to signals fast. Was 3000ms pre-WP3 (wasted on every busy close).
    exit_poll: Duration,
    /// How long to poll `try_wait` after `killpg(SIGHUP)` before escalating to SIGKILL.
    /// Sized for the ~20ms history save + generous margin.
    hup_grace: Duration,
}

/// The default kill timing. `exit_poll` 500ms (down from 3000ms — a busy session never
/// reads the exit command, so the old full 3s grace was pure latency on every close);
/// `hup_grace` 300ms (~15× the observed ~20ms zsh history-save). Worst-case forced path
/// is ~800ms, well under the ≤~1s target.
const DEFAULT_KILL_TIMING: KillTiming = KillTiming {
    exit_poll: Duration::from_millis(500),
    hup_grace: Duration::from_millis(300),
};

/// One step in the [`PtyCcSession::kill`] sequence — the *pure* description the executor
/// walks, so the ordered sequence is unit-testable without spawning a process. See
/// [`kill_steps`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KillStep {
    /// Write `exit_command\r` and poll `try_wait` for `exit_poll` — return on reap.
    CleanExitAttempt(Duration),
    /// `killpg(pgid, SIGHUP)` to the whole process group, then poll `try_wait` for
    /// `hup_grace` — return on reap. Saves shell history + reaps subagents.
    HupGroupThenGrace(Duration),
    /// `killpg(pgid, SIGKILL)` to the whole process group — anything that ignored SIGHUP.
    KillGroup,
    /// Final `try_wait`/`wait` to reap the leader zombie so the reader thread hits EOF and
    /// `cc-exit-<id>` fires.
    ReapLeader,
}

/// The ordered kill sequence for a given timing (pure — no I/O). The executor in
/// [`PtyCcSession::kill`] walks exactly this, short-circuiting on an early reap. Kept
/// separate from the executor so a test can assert the *policy* (order + durations)
/// independent of any real PTY.
fn kill_steps(timing: KillTiming) -> [KillStep; 4] {
    [
        KillStep::CleanExitAttempt(timing.exit_poll),
        KillStep::HupGroupThenGrace(timing.hup_grace),
        KillStep::KillGroup,
        KillStep::ReapLeader,
    ]
}

/// Send `sig` to the **process group** led by `pgid` (a `killpg`, i.e. `kill(-pgid, sig)`).
/// `pgid` is the child's PID, which equals its PGID because portable-pty spawns the child
/// as a `setsid` session/group leader — so this reaches CC/the shell AND every descendant
/// in the group (subagents, backgrounded jobs) in one signal. Best-effort: a failure
/// (e.g. the group already gone — ESRCH) is ignored, matching the kill path's best-effort
/// contract; the subsequent `try_wait`/SIGKILL step resolves the outcome. macOS-only.
fn signal_group(pgid: libc::pid_t, sig: libc::c_int) {
    // Negative pid => the process group whose id is |pid| (POSIX `kill(2)` / `killpg(3)`).
    unsafe {
        libc::kill(-pgid, sig);
    }
}

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
    // The to_lowercase() is what makes the lowercase literal markers below safe — they
    // match case-insensitively against the lowered string, not by coincidence of the
    // raw message's casing.
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

/// The explicit environment both the CC and shell spawns set. Shared so the two
/// spawn paths can't drift.
///
/// Two concerns, both driven by the fact that a Tauri app inherits a bare env:
/// - **Color TTY** (`TERM`/`COLORTERM`): a Tauri app has no inherited `TERM`, so the
///   spawned process must be told it's on a color-capable TTY (the WP2 finding —
///   `wp2-cc-pty-probe.md:67,176`).
/// - **UTF-8 locale** (`LANG`/`LC_ALL`): a Finder/Dock-launched `.app` inherits the
///   minimal **launchd** env, where `LANG` is **unset** → the spawned `claude`/shell
///   (and any child TUI) defaults to `LC_CTYPE=C` (ASCII/POSIX), which mangles UTF-8
///   output as `�` (M10.5 WP4, root cause C — confirmed via `launchctl getenv LANG`
///   returning empty). This only bites the installed build — `pnpm tauri:dev` inherits
///   the launching terminal's login-shell `LANG`, so it never reproduces in dev.
///   `LC_ALL` forces the locale over any inherited `LC_*`; `en_US.UTF-8` is present on
///   all macOS.
///
/// ⚠️ **DO NOT append to this array — it is deliberately fixed-size and SHARED with the raw
/// login shell.** Three callers: the CC spawn, [`PtyCcSession::spawn_shell`], and a test.
/// Widening it to carry a CC-only variable (the M12 WP4b trap) leaks that variable into the
/// user's interactive shell, which is not a CC session. CC-only environment is composed at
/// the CC call site by [`cc_spawn_env`] instead. Pinned by
/// [`tests::color_tty_env_carries_nothing_beyond_color_and_locale`].
fn color_tty_env() -> [(&'static str, &'static str); 4] {
    [
        ("TERM", "xterm-256color"),
        ("COLORTERM", "truecolor"),
        ("LANG", "en_US.UTF-8"),
        ("LC_ALL", "en_US.UTF-8"),
    ]
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

/// Build the argv for a CC spawn from the persisted permission mode + per-project model.
///
/// Every mode maps to an explicit `--permission-mode <value>` pair (including
/// `Default` — passing `--permission-mode default` is a harmless no-op that keeps the
/// mapping uniform and makes the chosen mode visible in the process args). Pure
/// (mode in → argv out) so the mapping is unit-testable without spawning a real
/// `claude`; the setting read happens at the call site ([`SessionRegistry::spawn`]).
///
/// **⚠️ `--model` is deliberately ASYMMETRIC with `--permission-mode`: it is omitted
/// ENTIRELY when unset, never passed with a placeholder value.** This is not an
/// oversight or an inconsistency to "fix". `--permission-mode` can be uniform because
/// every one of its states — `default` included — has a spellable flag value. The model
/// override's unset state means *"whatever CC itself is configured to use"*, and there
/// is no flag value that expresses deference: `--model default` would name a model that
/// does not exist, and `--model ""` is an invalid value. Omission is the only encoding
/// of "don't override", so an unset project must produce argv with no `--model` token at
/// all. Pinned by tests in this module.
///
/// A blank/whitespace value is treated as unset (defense in depth — `set_default_model`
/// already normalizes on the way in, but a hand-edited or older-build `projects.json`
/// could still carry one, and it must never become an argv token CC would reject).
fn build_cc_argv(mode: CcPermissionMode, model: Option<&str>, resume: ResumeArm) -> Vec<String> {
    let mut argv = vec![
        CC_CMD.to_string(),
        CC_ARG_PERMISSION_MODE.to_string(),
        mode.as_flag_value().to_string(),
    ];
    if let Some(model) = model.map(str::trim).filter(|m| !m.is_empty()) {
        argv.push(CC_ARG_MODEL.to_string());
        argv.push(model.to_string());
    }
    // M12 WP3 Phase 4 — the auto-resume argv arm. Appended LAST so the flags that shape the
    // session (permission mode, model) are unaffected by whether this open resumes.
    if resume == ResumeArm::Continue {
        argv.push(CC_ARG_CONTINUE.to_string());
    }
    argv
}

/// Whether this spawn should continue the project's previous conversation.
///
/// ⚠️ **A named type rather than a `bool` parameter, deliberately.** `build_cc_argv(mode,
/// model, true)` at a call site says nothing about what is true, and this codebase has
/// already paid for a silently-wrong argument once in this milestone (M12 WP3 Phase 3's
/// `onOpen` arity: a dropped action that **type-checked cleanly**, because TS parameter counts
/// are contravariant). A two-variant enum cannot be passed the wrong way round without
/// naming the variant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumeArm {
    /// Pass `--continue`: resume the project's previous conversation.
    Continue,
    /// Ordinary spawn — no resume flag.
    Fresh,
}

/// Which picker door opened this workspace — i.e. whether the spawn is **authorized** to fire
/// the auto-resume argv arm.
///
/// ⚠️ **This exists because the frontend's no-fire decision did not reach the backend, and the
/// `⏵` door fired `--continue` anyway** (found live at M12 WP3 Phase 4 verify-self, reproduced
/// 3×). The frontend was entirely correct — `actionForIntent(action, "no-fire")` returns `null`
/// and is mutation-proven — but `cc_spawn` took only `project_path`, so [`SessionRegistry::spawn`]
/// re-derived the arm from the flag alone and had no way to know which door was used. A user who
/// deliberately chose *"open without resuming"* got a resumed conversation.
///
/// ⚠️ **The decision is passed IN, never re-decided here.** It would be tempting to let the
/// frontend resolve the whole argv arm and send a flag — that is wrong: firing must **consume**
/// the flag (read-and-clear), and a frontend-resolved arm would make the consume a separate call
/// that could diverge from what actually spawned. So the backend still owns *resolution*; the
/// frontend owns only *authorization*.
///
/// A named type rather than a `bool`, for the reason [`ResumeArm`] documents at length.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OpenIntent {
    /// The row (title box) was clicked — fire the announced auto-resume command.
    Fire,
    /// The `⏵` second door was clicked — open the workspace and fire **nothing**.
    NoFire,
}

impl Default for OpenIntent {
    /// Absent intent means **fire**, preserving every pre-M12 caller's behavior.
    ///
    /// ⚠️ Defaulting to `NoFire` would be the safer-looking choice and is wrong: it would
    /// silently disable auto-resume for any caller that forgot the parameter, which is the
    /// failure mode this milestone's own WP1 verdict calls out as *"losing the flag silently
    /// disables auto-resume"* — a defect with no error and no symptom except a feature that
    /// stopped working.
    fn default() -> Self {
        Self::Fire
    }
}

/// Whether this spawn should consume the unclean flag and pass `--continue`.
///
/// Extracted as a pure function for the reason this phase learned the hard way: the property
/// *"the no-fire door does not fire the argv arm"* was **proven in TypeScript and unenforced at
/// the boundary**, so the suite was green exactly where the feature was broken. A source-order
/// or frontend-side assertion cannot express this; a value can.
///
/// ⚠️ **`NoFire` must short-circuit BEFORE the consume, not after.** Deciding the arm and then
/// discarding it would still spend the flag, so the announcement would vanish and the *next*
/// open — the one the user actually wanted to resume — would find nothing. The no-fire door must
/// leave the signal exactly as it found it.
fn should_consume_for_resume(intent: OpenIntent) -> bool {
    intent == OpenIntent::Fire
}

/// Decide the model a spawn should use, given the *outcome* of trying to read it.
///
/// Extracted from [`SessionRegistry::spawn`] specifically so this decision is testable:
/// `spawn` needs a live `AppHandle` and a real PTY, so nothing in it can be unit-tested,
/// and "degrades to inherit-the-default on ANY failure" is exactly the kind of fallback
/// rule that must be asserted as a **value** rather than left where only a running app
/// can observe it. (Same lesson as M10.9 WP2: extract the decision, assert the value.)
///
/// The input encodes every reachable state at the call site:
/// - `None` — the app-data dir could not be resolved, so no read was attempted;
/// - `Some(Err(_))` — `projects.json` is present but unreadable, malformed, or otherwise
///   failed to parse;
/// - `Some(Ok(None))` — read fine; this project has no override (or has no record);
/// - `Some(Ok(Some(m)))` — read fine; this project overrides the model.
///
/// Only the last yields an override. **Every** degraded state collapses to `None` =
/// inherit CC's own default, because a config problem must never block a spawn: opening
/// with CC's default model is a mild surprise, whereas a workspace that refuses to open
/// is a dead click.
fn resolve_spawn_model(
    read: Option<Result<Option<String>, crate::config_store::ConfigError>>,
) -> Option<String> {
    read.and_then(Result::ok).flatten()
}

/// The env var carrying the workspace's drive mode to the `UserPromptSubmit` hook (M12 WP4b).
///
/// ⚠️ **The model cannot read environment variables** — this var is not "telling CC the mode."
/// It is a *gate* on Claudesk's own hook script, which reads it and emits an
/// `additionalContext` line. That indirection is the whole mechanism, and it is also what
/// makes a plain-terminal `claude` byte-identical: no var → the hook emits nothing.
pub const DRIVE_MODE_ENV: &str = "CLAUDESK_DRIVE_MODE";

/// Compose the environment for a **CC** spawn: the shared color/locale set, plus the M12
/// drive-mode var **only when the gate is on and the project has a mode**.
///
/// Extracted as a pure function for the same reason as [`resolve_spawn_model`] and
/// [`should_set_unclean_flag`] below: `SessionRegistry::spawn` needs a real `AppHandle`, so
/// the gate×mode matrix cannot be asserted where it happens. A property no test can go red on
/// is one a future tidy-up silently breaks — and here the property protects *every plain-CLI
/// user of Claude Code*, not just this app.
///
/// **Inertness is by ABSENCE, which is deliberate** (WP4a Verdict (c)): the gate is enforced
/// here, spawn-side, and never in the hook. Gate off → the var is simply not set, so the hook
/// stays silent through the exact same path that keeps it silent for someone who has never
/// heard of Claudesk. Rejected alternative: having the hook read the gate itself — a settings
/// read per turn on CC's critical path, plus a second source of truth that can disagree with
/// this one.
///
/// ⚠️ **Returns an owned `Vec`, and must NOT be folded into [`color_tty_env`]** — that array
/// is shared with the raw login-shell spawn, which must never receive this var.
fn cc_spawn_env(
    drive_mode: Option<crate::config_store::DriveMode>,
    gate_enabled: bool,
) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = color_tty_env()
        .iter()
        .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
        .collect();

    // Both conditions, in one place. An unset mode and an off gate are the same outcome —
    // no var — so there is exactly one inert path to reason about rather than two.
    if gate_enabled {
        if let Some(mode) = drive_mode {
            // Serialize through the enum's own serde vocabulary so this can never drift from
            // what the hook's allowlist accepts (M12 WP4b Phase 1 pinned those strings against
            // `transitions.md`). ⚠️ A hand-written match here would be a second vocabulary to
            // keep in sync — exactly the class of bug Phase 1 existed to remove.
            if let Ok(wire) = serde_json::to_string(&mode) {
                env.push((
                    DRIVE_MODE_ENV.to_string(),
                    wire.trim_matches('"').to_string(),
                ));
            }
        }
    }

    env
}

/// Resolve the M12 gate from the spawn site's settings read, **failing closed**.
///
/// Extracted for the same reason as [`resolve_spawn_model`]: the read happens inside
/// `SessionRegistry::spawn`, which needs a real `AppHandle`, so "an unreadable settings file
/// gates OFF" cannot be asserted where it happens.
///
/// ⚠️ **The failure direction is the point, and it is the opposite of the model read's.** A
/// missing model degrades to "CC's default" because the cost is a mild surprise. A missing
/// gate must degrade to **OFF** because the cost of guessing wrong the other way is injecting
/// workflow context into a session that never opted into the workflow layer. `unwrap_or(false)`
/// on **both** the outer `Option` (no app-data dir) and the inner `Result` (unreadable or
/// malformed settings). Copied from `announce/commands.rs:33`, the established fail-closed
/// precedent for this same gate.
fn resolve_gate_enabled(read: Option<Result<bool, crate::config_store::ConfigError>>) -> bool {
    read.and_then(Result::ok).unwrap_or(false)
}

/// Resolve the **exact env a CC spawn will receive** from the two raw settings reads.
///
/// This is the single function the spawn path calls, and it exists to make the *wiring* — not
/// just the composition — drivable by a test.
///
/// ⚠️ **Why this shape, and it is worth reading before "simplifying" it.** The wiring was first
/// guarded by a source-text scan, and that guard was **measured vacuous three times in a row**:
/// `contains("cc_spawn_env(")` is satisfied by the function's own `fn` declaration; a
/// whitespace-exact match stopped biting the moment the signature was refactored; and the
/// literal-argument form was satisfied by **the assertion line inside the guard itself** (the
/// needle appears in the test's own source, which survives comment-stripping). Each version
/// passed while a mutant routed the CC spawn around the gate and the var never reached CC.
///
/// A source-text predicate can only encode shapes you thought of
/// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`), so the property is
/// expressed structurally instead: **there is exactly one path from the raw reads to the env**,
/// and [`tests::the_resolved_cc_env_honors_the_gate_end_to_end`] drives it with real degraded
/// inputs. `SessionRegistry::spawn` calls only this.
fn resolve_cc_spawn_env(
    gate_read: Option<Result<bool, crate::config_store::ConfigError>>,
    mode_read: Option<
        Result<Option<crate::config_store::DriveMode>, crate::config_store::ConfigError>,
    >,
) -> Vec<(String, String)> {
    let gate_enabled = resolve_gate_enabled(gate_read);
    // Degrades to `None` on any read error, matching the model posture: a config problem must
    // never block a spawn, so an unparseable mode costs the signal, not the workspace.
    let drive_mode = mode_read.and_then(Result::ok).flatten();
    cc_spawn_env(drive_mode, gate_enabled)
}

/// The env the **raw WP9 login shell** is spawned with — the color/locale set, and nothing else.
///
/// ⚠️ **This exists to make the SHELL side's env source assertable, mirroring [`borrow_env`] on
/// the CC side.** Before M12 WP4b, `spawn_shell` called [`color_tty_env`] inline, and the only
/// protection against the CC-only `CLAUDESK_DRIVE_MODE` reaching a login shell was
/// [`tests::color_tty_env_carries_nothing_beyond_color_and_locale`] — which pins what is *in*
/// that array but says nothing about **which** env `spawn_shell` passes. A change routing the
/// CC env here (exactly the leak constraint 5 forbids, and the one verified live at
/// P2.verify-human.3) would have passed the entire suite. Same caller-vs-primitive gap that
/// P2.7 closed for the CC spawn, closed here for the shell.
///
/// Keep this returning [`color_tty_env`] verbatim. It is a **seam, not a policy point** — if a
/// var ever genuinely belongs on both spawns it goes in `color_tty_env` (deliberately, with
/// that guard's expected list updated); if it is CC-only it goes in [`cc_spawn_env`]. Composing
/// anything *here* is the leak this function was added to make visible.
fn shell_spawn_env() -> [(&'static str, &'static str); 4] {
    color_tty_env()
}

/// Borrow an owned env for [`PtyCcSession::spawn_argv`], which takes `&[(&str, &str)]`.
///
/// ⚠️ **Exists to make the CC spawn's env observable, and that is its whole point.** It is the
/// last transformation the composed env undergoes before reaching `CommandBuilder`, so
/// asserting on its input pins **which** env the CC spawn actually hands to the PTY — the
/// property that three retired source-text guards over this call site each failed to express
/// (see [`resolve_cc_spawn_env`]'s doc comment). Inlining this back into
/// [`PtyCcSession::spawn`] re-hides the seam and makes the caller unprovable again; a test can
/// then only re-assert the primitive, which was never the thing in doubt.
///
/// Kept deliberately dumb — it must have no opinion about *what* is in the env, so that
/// "the CC spawn receives `cc_spawn_env`'s output, not [`color_tty_env`]'s" stays a statement
/// about the **caller** rather than something this function could accidentally launder.
fn borrow_env(env: &[(String, String)]) -> Vec<(&str, &str)> {
    env.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect()
}

/// Whether a spawn attempt should DEFAULT-SET the M12 unclean-exit flag (P2.7).
///
/// Extracted for one reason: **the ordering guarantee has to be provable, not just true.**
/// `SessionRegistry::spawn` needs a real `AppHandle`, so "a failed spawn leaves no flag"
/// cannot be asserted where it happens — and a property that no test can go red on is one
/// a future tidy-up silently breaks. Grouping the flag write with the config reads a few
/// lines above looks like harmless cleanup and would invert this. Same shape, and the same
/// motivation, as [`resolve_spawn_model`] directly above.
///
/// The inputs encode every reachable state at the call site:
/// - `spawn_ok == false` — the PTY spawn returned `Err`, so **no flag**, whatever else is
///   true. Marking a project unclean for a session that never existed would fire a
///   `/resume` on the next open for work nobody started.
/// - `data_dir.is_none()` — no app-data dir resolved, so there is nowhere to write.
///
/// ⚠️ The `spawn_ok` term is load-bearing and must be checked FIRST-class rather than
/// relied upon implicitly via an early `?` return: the `?` is correct today, but it makes
/// the guarantee a property of *statement order* — invisible to tests, and exactly what
/// [`spawn_failure_must_not_set_the_flag`](tests::spawn_failure_must_not_set_the_flag)
/// mutation-proves.
fn should_set_unclean_flag(spawn_ok: bool, data_dir: Option<&Path>) -> bool {
    spawn_ok && data_dir.is_some()
}

/// Claudesk's seam for driving a Claude Code session. Never bypass this trait when
/// talking to CC (`CLAUDE.md`). Phase 2 extends it with `state_events()` (hook-channel
/// status fan-out) and `recycle()` (Recycle Session) — reserved here, not implemented.
pub trait CcSession: Send {
    /// Write raw bytes to the PTY (xterm keystrokes, or `slash_command_bytes(..)`).
    fn send_input(&self, bytes: &[u8]) -> Result<(), CcError>;
    /// Resize the PTY (propagates SIGWINCH; CC redraws). WP2-confirmed.
    fn resize(&self, cols: u16, rows: u16) -> Result<(), CcError>;
    /// Terminate the session (M10.5 WP3): brief clean-exit attempt (`exit_command\r`),
    /// then a SIGHUP-first **process-group** teardown — `killpg(SIGHUP)` (saves an
    /// interactive shell's history + reaps subagents) → short grace → `killpg(SIGKILL)`
    /// → reap. NOT an immediate SIGKILL (the pre-WP3 comment claimed that; the library's
    /// `child.kill()` was really SIGHUP→SIGKILL to a single PID). See [`KillTiming`].
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

/// Flip the session to live mode AND flush the buffered chunks **while still holding the
/// lock**, calling `emit` for each in order. Holding the lock across the flush closes the
/// ordering window the plain drain-then-emit had: with the guard held, a reader-thread
/// chunk can't acquire the lock to take the `None`/live path and emit AHEAD of a buffered
/// chunk still being flushed. The reader simply blocks on `route_chunk`'s `lock()` until
/// the flush completes, then emits after — preserving produce order at the seam. The flush
/// is microseconds (a handful of startup chunks), so the brief reader stall is immaterial.
/// (m2-wp9 MINOR #1.) A poisoned lock drops the flush, matching `route_chunk`/`drain`.
fn drain_backlog_emitting(backlog: &Mutex<Option<Vec<String>>>, mut emit: impl FnMut(String)) {
    if let Ok(mut guard) = backlog.lock() {
        if let Some(pending) = guard.take() {
            for chunk in pending {
                emit(chunk);
            }
        }
    }
}

/// A live PTY-backed process (CC, or a WP9 shell). Holds the master end (for resize),
/// a single writer (for input), the child handle (for kill), and the clean-exit
/// command to attempt before the SIGHUP-first process-group teardown (M10.5 WP3).
pub struct PtyCcSession {
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
    /// The command `kill()` writes (CR-terminated) to ask the process to exit cleanly
    /// before escalating to signals. `/exit` for CC's TUI; `exit` for a shell (a shell
    /// would print "command not found" for `/exit" — the WP9 P1.5 per-session-kind
    /// decision). An *idle* session exits on this; a busy one falls through to the
    /// SIGHUP-first group teardown fast (M10.5 WP3 shortened the poll from 3s → 500ms).
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
    /// Poll `child.try_wait()` for up to `window`, returning `Ok(true)` the moment the
    /// child is reaped, `Ok(false)` if the window elapses first. A `try_wait` error or a
    /// poisoned lock propagates. Shared by the [`CcSession::kill`] steps so the poll
    /// cadence (100ms) lives in one place. Inherent (not a trait method) — the kill
    /// executor uses it internally.
    fn poll_reaped(&self, window: Duration) -> Result<bool, CcError> {
        let deadline = Instant::now() + window;
        loop {
            {
                let mut child = self.child.lock().map_err(|_| CcError::Lock)?;
                match child.try_wait() {
                    Ok(Some(_)) => return Ok(true),
                    Ok(None) => {}
                    Err(e) => return Err(CcError::Io(e.to_string())),
                }
            }
            if Instant::now() >= deadline {
                return Ok(false);
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    /// Spawn `claude` under the given permission `mode` with `cwd = project_path`,
    /// optionally overriding the model (`model = None` inherits CC's own default).
    ///
    /// Builds CC's argv via [`build_cc_argv`] (mapping the mode to `--permission-mode`
    /// and an override to `--model`) plus the explicit color-TTY env, then delegates to
    /// the generic [`Self::spawn_argv`] core. The `TERM`/`COLORTERM` overrides are
    /// required because WP2 ran under a terminal that exported `TERM`, but a Tauri app
    /// has none, so CC would not detect a color TTY without this
    /// (`wp2-cc-pty-probe.md:67,176`).
    /// `env` (M12 WP4b) is the **already-composed** CC environment — build it with
    /// [`cc_spawn_env`], which decides whether `CLAUDESK_DRIVE_MODE` is present.
    ///
    /// ⚠️ **Takes the composed env rather than `(drive_mode, gate_enabled)` deliberately.**
    /// Passing the two ingredients pushed this signature to 8 parameters (clippy
    /// `too_many_arguments`), and the lint was pointing at something real: two parameters that
    /// are one concept give a caller a way to supply the mode and forget the gate. With the
    /// composition done by one function, "gate off ⇒ no var" cannot be re-decided here — and
    /// [`tests::the_cc_spawn_wires_the_gate_through_the_fail_closed_resolver`] guards that this
    /// receives `cc_spawn_env`'s output rather than the shell-shared [`color_tty_env`] array.
    fn spawn(
        app: AppHandle,
        id: String,
        project_path: &str,
        mode: CcPermissionMode,
        model: Option<&str>,
        resume: ResumeArm,
        env: &[(String, String)],
    ) -> Result<Self, CcError> {
        Self::spawn_argv(
            app,
            id,
            &build_cc_argv(mode, model, resume),
            project_path,
            &borrow_env(env),
            "/exit",
        )
    }

    /// Spawn the WP9 second-terminal panel's interactive login shell with
    /// `cwd = project_path`. Resolves the argv from `$SHELL` (via
    /// [`resolve_shell_argv`]) and reuses the same color-TTY env + generic
    /// [`Self::spawn_argv`] core as the CC spawn — the shared "drive a PTY process"
    /// path, so the `CcSession` seam is not bypassed (`CLAUDE.md`).
    ///
    /// **M10.5-WP2 — deliberately NO "running command" signal on this raw shell.** The
    /// active-close / active-quit guard (design prior
    /// `explicit-selectable-mode-over-inferred-mode`) keys "active" off the reliable M3
    /// CC status ONLY. Detecting whether *this* raw PTY shell has a foreground command
    /// running would need job-control introspection (`tcgetpgrp` vs the shell's pgid,
    /// backgrounded-job edge cases) — a broad, fragile surface for a low-certainty
    /// payoff. So a raw terminal's busyness is intentionally out of scope for v1: do NOT
    /// add foreground-process detection here by reflex. (If ever wanted, it's a new
    /// signal, not a bug fix.) See `workflow-system/state/archive/m10.5-wp2-active-close-confirmation.md` Phase 3.
    /// (Path corrected at the 2026-08-12 paydown sweep: the `workflow/` root moved to
    /// `workflow-system/state/` in the 2026-07-28 layout migration, breaking this pointer.)
    fn spawn_shell(app: AppHandle, id: String, project_path: &str) -> Result<Self, CcError> {
        let argv = resolve_shell_argv(std::env::var("SHELL").ok());
        Self::spawn_argv(app, id, &argv, project_path, &shell_spawn_env(), "exit")
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
        // SIGHUP-first, process-GROUP teardown (M10.5 WP3). The ordered policy is the pure
        // `kill_steps(DEFAULT_KILL_TIMING)` value (unit-tested independently); this executor
        // WALKS that exact sequence, short-circuiting the moment the child is reaped. The
        // old path claimed "SIGKILL fallback" but `child.kill()` was actually
        // SIGHUP→250ms→SIGKILL to a SINGLE PID after a wasted 3s grace — which (a) took ~5s
        // on every busy close, (b) couldn't reap a subagent in the group, and (c) too-often
        // lost the shell's history (see the per-step notes in `KillStep` / `KillTiming`).
        //
        // The child is a `setsid` session/process-group leader (portable-pty), so its PID
        // == PGID; we signal the whole group. `process_id()` is `Some` for a live child; if
        // somehow `None` (near-unreachable post-spawn), the SIGKILL step falls back to the
        // library's single-PID kill — best-effort, never worse than pre-WP3 for REAPING. Note
        // the None path skips the SIGHUP-with-grace step, so an interactive shell's on-exit
        // history save would be lost on that (near-unreachable) branch.
        let pgid = {
            let child = self.child.lock().map_err(|_| CcError::Lock)?;
            child.process_id().map(|p| p as libc::pid_t)
        };

        for step in kill_steps(DEFAULT_KILL_TIMING) {
            match step {
                // 1) Ask to exit cleanly, poll briefly. An IDLE interactive session exits
                //    here (fastest, and the shell saves its own history); a BUSY one won't
                //    read it and we fall through.
                KillStep::CleanExitAttempt(window) => {
                    let _ = self.send_input(&slash_command_bytes(self.exit_command));
                    if self.poll_reaped(window)? {
                        return Ok(());
                    }
                }
                // 2) SIGHUP the group (saves an interactive shell's history — SIGTERM/SIGKILL
                //    don't — AND reaches subagents/children a single-PID kill can't), then
                //    grace so the save lands.
                KillStep::HupGroupThenGrace(grace) => {
                    if let Some(pgid) = pgid {
                        signal_group(pgid, libc::SIGHUP);
                    }
                    if self.poll_reaped(grace)? {
                        return Ok(());
                    }
                }
                // 3) SIGKILL the group (force) for anything that trapped/ignored SIGHUP.
                KillStep::KillGroup => match pgid {
                    Some(pgid) => signal_group(pgid, libc::SIGKILL),
                    None => {
                        let mut child = self.child.lock().map_err(|_| CcError::Lock)?;
                        let _ = child.kill();
                    }
                },
                // 4) Reap the leader so the reader thread hits EOF (→ `cc-exit-<id>`) and no
                //    zombie lingers. Bounded; SIGKILL makes it quick.
                KillStep::ReapLeader => {
                    let _ = self.poll_reaped(DEFAULT_KILL_TIMING.hup_grace)?;
                }
            }
        }
        Ok(())
    }

    /// Frontend has attached its `cc-output-<id>` listener and is ready to receive.
    /// Flush the buffered backlog (emit each chunk in order) and switch the reader thread
    /// to live mode (`backlog` → `None`). Idempotent: a second call is a no-op (backlog
    /// already taken). The consumer of the spawn-time buffering — closes the shell race.
    fn mark_ready(&self) {
        // Flip Some→None (reader switches to live) and flush the buffered chunks in order,
        // ALL under one backlog-lock hold (drain_backlog_emitting) so a reader-thread chunk
        // produced during the flush can't emit ahead of a buffered one (m2-wp9 MINOR #1 —
        // the prior drain-then-emit released the lock before flushing, leaving that window).
        drain_backlog_emitting(&self.backlog, |chunk| {
            let _ = self.app.emit(&self.output_event, chunk);
        });
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
    ///
    /// Reads TWO persisted settings at spawn time, both of which take effect on the
    /// *next* spawn rather than retroactively (argv is fixed once per process):
    /// - the **app-global** `cc_permission_mode` (default [`CcPermissionMode::Default`])
    ///   → CC's `--permission-mode`;
    /// - the **per-project** `default_model` for `project_path` (M11.5 WP1) → CC's
    ///   `--model`, omitted entirely when unset so CC applies its own default.
    ///
    /// **Both reads degrade to the inherit-the-default value on ANY failure** (no
    /// app-data dir, unreadable or malformed `projects.json`, no record for this path).
    /// A config problem must never block a spawn: a workspace that opens with CC's
    /// default model is a mild surprise, whereas a workspace that refuses to open is a
    /// dead click. This is why the store's reader returns `Result` and the degradation
    /// decision lives *here*, at the call site, rather than being swallowed downstream.
    ///
    /// `intent` is which picker door opened the workspace (M12 WP3 P4.6). The auto-resume argv
    /// arm fires only for [`OpenIntent::Fire`]; the `⏵` door neither resumes **nor consumes the
    /// flag**, so the announcement survives for the next open.
    pub fn spawn(
        &mut self,
        app: AppHandle,
        project_path: &str,
        intent: OpenIntent,
    ) -> Result<String, CcError> {
        let data_dir = app.path().app_data_dir().ok();
        let mode = data_dir
            .as_deref()
            .and_then(|dir| crate::config_store::settings::read_cc_permission_mode(dir).ok())
            .unwrap_or_default();
        // M12 WP4b — THE DRIVE-MODE SIGNAL. Both raw reads happen HERE (this is where
        // `data_dir` lives, same reason as the model read below) and are handed to ONE resolver
        // that owns every decision: fail-closed gate, degrade-to-None mode, and whether the
        // `CLAUDESK_DRIVE_MODE` var is present at all.
        //
        // ⚠️ Do NOT inline the gate/mode resolution back into this function. It lives in
        // `resolve_cc_spawn_env` so a test can drive the WIRING with real degraded inputs —
        // three successive source-text guards over this call site were each measured vacuous
        // (see that function's doc comment). One resolver = one path to assert.
        //
        // ⚠️ The gate is FAIL-CLOSED: an unreadable settings file gates OFF, never on. A missed
        // signal costs one re-asked question; leaking the var into a session that never opted
        // into the workflow layer is the failure that matters. Drive mode is on the GATED side
        // of WP3's per-arm split — `--continue` is a stock CC flag and stays ungated, but this
        // arm names a companion-workflow concept.
        let cc_env = resolve_cc_spawn_env(
            data_dir
                .as_deref()
                .map(crate::config_store::settings::read_workflow_features_enabled),
            data_dir.as_deref().map(|dir| {
                crate::config_store::read_default_drive_mode(dir, Path::new(project_path))
            }),
        );
        let model = resolve_spawn_model(
            data_dir
                .as_deref()
                .map(|dir| crate::config_store::read_default_model(dir, Path::new(project_path))),
        );
        // M12 WP3 Phase 4 — THE AUTO-RESUME ARGV ARM. Resolved HERE, in the backend, and
        // resolved by CONSUMING the flag rather than merely reading it.
        //
        // ⚠️ Why the backend decides and not the frontend, which already computed a
        // `pending_action`: the fire must **consume** the flag (read-and-clear, so a
        // `--continue` fires at most once per unclean exit). If the frontend decided, the
        // consume would be a separate call that could diverge from what actually spawned —
        // the flag cleared for a spawn that failed, or a spawn resuming on a flag that was
        // never cleared. One function reads, decides, clears, and spawns.
        //
        // ⚠️ ORDERING vs the DEFAULT-SET below is subtle and load-bearing: this consume runs
        // BEFORE `should_set_unclean_flag` re-sets the flag for the session being started.
        // That sequence is correct and intentional — consume clears the PREVIOUS session's
        // flag (the signal we are acting on), then the set marks THIS session as in-flight.
        // Reversing them would consume the flag this very spawn just set, so nothing would
        // ever resume. `consume_before_set_or_nothing_ever_resumes` pins it.
        //
        // ⚠️ `consume_and_persist` canonicalizes via `key_for` internally. A reader that
        // skips that silently matches nothing — no error, just a flag that never fires.
        // ⚠️ P4.6 — GATED ON THE OPEN INTENT. The `⏵` no-fire door reaches this same function,
        // and before the gate existed it resumed anyway: the frontend's `pending_action` governs
        // only the *inject* arm, so an unauthorized argv arm was invisible to it. The gate is
        // checked BEFORE `consume_and_persist` (via the `&&` short-circuit) so a no-fire open
        // leaves the flag intact — spending it here would delete the very announcement the user
        // declined to act on, and the NEXT open would find nothing to resume.
        let resume = match data_dir.as_deref() {
            Some(dir)
                if should_consume_for_resume(intent)
                    && crate::session_state::consume_and_persist(dir, project_path) =>
            {
                ResumeArm::Continue
            }
            _ => ResumeArm::Fresh,
        };

        let id = self.mint_id();
        let spawned = PtyCcSession::spawn(
            app,
            id.clone(),
            project_path,
            mode,
            model.as_deref(),
            resume,
            &cc_env,
        );

        // M12 WP2 — DEFAULT-SET the unclean-exit flag, so a crash (which runs no code at
        // all) leaves it set for free and the next open can offer `/resume`. Only a clean
        // exit clears it.
        //
        // ⚠️ ORDERING IS LOAD-BEARING: a flag set for a spawn that then FAILED would fire a
        // `/resume` on the next open for a session that never existed. The spawn result is
        // therefore passed to `should_set_unclean_flag` as an explicit term and the `?` is
        // deferred to *after* this block — so the guarantee is a property of the predicate
        // (which a test can drive) rather than of statement order (which it cannot). See
        // P2.7 / the verify-auto F9 back-loop: the earlier version was correct but nothing
        // would have gone red if someone moved it above the `?`.
        //
        // Best-effort, matching the `read_cc_permission_mode` / `read_default_model`
        // degradation posture documented above: a workspace that opens without its flag
        // recorded costs one missed auto-resume, whereas a workspace that refuses to open
        // is a dead click. The failure direction is deliberately "no auto-fire".
        if should_set_unclean_flag(spawned.is_ok(), data_dir.as_deref()) {
            if let Some(dir) = data_dir.as_deref() {
                crate::session_state::set_and_persist(dir, project_path);
            }
        }

        let session = spawned?;
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
    /// session does not stop the others. Returns the **ids of the sessions killed OK**
    /// (M9 WP6.5: the `CloseRequested` handler writes an explicit session-end marker per
    /// killed id; callers wanting the count use `.len()`).
    ///
    /// PARALLELIZED (M4 WP2): each `kill()` blocks up to a ~800ms forced-kill window
    /// ([`PtyCcSession::kill`] — 500ms exit-poll + 300ms SIGHUP grace, per `DEFAULT_KILL_TIMING`).
    /// At N>1 a sequential loop would serialize to N×800ms of window-close latency. Instead we
    /// drain every session out of the map, spawn one thread per session to run its `kill()`, and
    /// join them — so the N grace windows OVERLAP and total close latency is ~one window
    /// (~800ms), not N×. The registry's own
    /// `Mutex` (held by the `CloseRequested` caller) is released the moment this returns;
    /// the threads are joined inside this call so no kill is orphaned. Sessions are
    /// `Send` (the [`CcSession`] supertrait), so moving each `Box` into its thread is sound.
    pub fn kill_all(&mut self) -> Vec<String> {
        // Drain ownership of every session out of the map first (so the threads own
        // them outright — no shared borrow of `self` across threads). Keep the id paired
        // with its session so we can report which ids killed OK.
        let sessions: Vec<(String, Box<dyn CcSession>)> = self.sessions.drain().collect();

        let handles: Vec<thread::JoinHandle<Option<String>>> = sessions
            .into_iter()
            .map(|(id, session)| thread::spawn(move || session.kill().is_ok().then_some(id)))
            .collect();

        // Join all — the slowest grace window bounds the total, not the sum. A thread that
        // panicked (join Err) or whose kill failed contributes no id (best-effort).
        handles
            .into_iter()
            .filter_map(|h| h.join().ok().flatten())
            .collect()
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
        // ⚠️ `/session-restore`, NOT `/session-resume` (fixed M12 WP2). The skill was
        // renamed at WP5/M9 *specifically* to avoid colliding with the built-in `/resume`
        // that M12's other decision arm fires. The old name read as authoritative about a
        // command that does not exist — exactly the kind of stale reference a future
        // reader would copy. `ls ~/.claude/skills/` → session-capture, session-handoff,
        // session-reflect, session-restore, session-start.
        assert_eq!(
            slash_command_bytes("/session-restore"),
            b"/session-restore\r"
        );
        assert_eq!(slash_command_bytes("/model opus"), b"/model opus\r");
    }

    // --- color_tty_env: the shared spawn env (color TTY + UTF-8 locale) ---

    #[test]
    fn color_tty_env_carries_color_tty_and_utf8_locale() {
        // Both spawn paths (CC + WP9 shell) share this; a maintainer must not silently
        // drop the locale (M10.5 WP4 root cause C — a launchd `.app` has no `LANG`, so
        // without this the spawned process gets `LC_CTYPE=C` and mangles UTF-8 → `�`).
        let env = color_tty_env();
        let get = |k: &str| {
            env.iter()
                .find(|(name, _)| *name == k)
                .map(|(_, v)| *v)
                .unwrap_or_else(|| panic!("color_tty_env missing {k}"))
        };
        // Color-TTY concern (WP2).
        assert_eq!(get("TERM"), "xterm-256color");
        assert_eq!(get("COLORTERM"), "truecolor");
        // UTF-8 locale concern (WP4): both LANG and LC_ALL, both UTF-8.
        assert!(
            get("LANG").to_uppercase().contains("UTF-8"),
            "LANG must be a UTF-8 locale, got {:?}",
            get("LANG")
        );
        assert!(
            get("LC_ALL").to_uppercase().contains("UTF-8"),
            "LC_ALL must be a UTF-8 locale (forces the locale over inherited LC_*), got {:?}",
            get("LC_ALL")
        );
    }

    /// `color_tty_env()` is SHARED BY BOTH SPAWN PATHS — the CC session (`spawn`, :612) and
    /// the WP9 raw login shell (`spawn_shell`, :634). Anything added here reaches **both**.
    ///
    /// ⚠️ **This test exists because M12 WP4a predicted the exact wrong fix a WP4b builder
    /// will reach for, and measured that nothing catches it.** WP4b must set
    /// `CLAUDESK_DRIVE_MODE` on the CC spawn. The obvious move — append it to
    /// `color_tty_env()` — compiles, reads naturally, and **leaks the var into the raw
    /// login shell**, which is not a CC session and must never receive it. Measured
    /// 2026-08-06: injecting `CLAUDESK_DRIVE_MODE` into this array passed **all 809 tests**.
    ///
    /// The correct shape is to **compose a `Vec` at the CC call site**, leaving this
    /// function and the shell spawn untouched.
    ///
    /// The guard is an **exact-set** assertion rather than a "does not contain
    /// CLAUDESK_DRIVE_MODE" check on purpose: a denylist only catches the one name someone
    /// thought of, and the property is *"this env is exactly the color+locale concern"* —
    /// not *"this env lacks one particular var."* Adding a genuinely shared var here is
    /// legitimate; it just has to be a deliberate edit to this list, with the shell spawn
    /// considered.
    #[test]
    fn color_tty_env_carries_nothing_beyond_color_and_locale() {
        let mut names: Vec<&str> = color_tty_env().iter().map(|(k, _)| *k).collect();
        names.sort_unstable();
        assert_eq!(
            names,
            vec!["COLORTERM", "LANG", "LC_ALL", "TERM"],
            "color_tty_env() reaches BOTH the CC spawn and the raw login shell. If you are \
             adding a CC-only var (e.g. M12's CLAUDESK_DRIVE_MODE), compose a Vec at the CC \
             call site instead — appending here leaks it into the shell. If the var really \
             is shared by both, add it to this expected list deliberately."
        );
    }

    // --- cc_spawn_env: the M12 WP4b drive-mode var (pure, gate × mode) ---

    /// Helper: look up a var in a composed env, or `None` if absent.
    fn env_var<'a>(env: &'a [(String, String)], key: &str) -> Option<&'a str> {
        env.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }

    #[test]
    fn cc_spawn_env_sets_the_drive_mode_var_only_when_gate_on_and_mode_set() {
        use crate::config_store::DriveMode;

        // The full 2×2 of the two independent inputs. Both "off" arms and the no-mode arm are
        // the load-bearing half: they are what keeps a plain-CLI user's `claude` byte-identical.
        let cases = [
            (Some(DriveMode::Autopilot), true, Some("autopilot")),
            (Some(DriveMode::Autopilot), false, None),
            (None, true, None),
            (None, false, None),
        ];

        for (mode, gate, expected) in cases {
            let env = cc_spawn_env(mode, gate);
            assert_eq!(
                env_var(&env, DRIVE_MODE_ENV),
                expected,
                "cc_spawn_env(mode={mode:?}, gate={gate}) should yield {expected:?} for \
                 {DRIVE_MODE_ENV}. An off gate or an unset mode must produce NO var at all — \
                 inertness is by absence (WP4a Verdict (c)), which is the same mechanism that \
                 keeps a plain-terminal `claude` unaffected."
            );
        }
    }

    #[test]
    fn cc_spawn_env_emits_the_transitions_md_wire_value_for_all_four_modes() {
        use crate::config_store::DriveMode;

        // ⚠️ Expected values are the literal strings from `transitions.md:165`, NOT computed
        // from the enum — the same discipline as Phase 1's serializer pin. Two of these four
        // are not the kebab-case form of their variant name, so a value derived Rust-side can
        // be self-consistently wrong while this test still passes.
        for (mode, wire) in [
            (DriveMode::StepByStep, "stepping"),
            (DriveMode::Orchestrated, "orchestrated"),
            (DriveMode::Autopilot, "autopilot"),
            (DriveMode::FullAutopilot, "fsd"),
        ] {
            let env = cc_spawn_env(Some(mode), true);
            assert_eq!(
                env_var(&env, DRIVE_MODE_ENV),
                Some(wire),
                "{mode:?} must reach the hook as {wire:?} — the value the hook's known-mode \
                 allowlist accepts. A mismatch makes the feature silently do nothing for this \
                 mode (measured: 0 bytes)."
            );
            // No quoting artifacts: the var must carry a bare token, not a JSON string.
            let value = env_var(&env, DRIVE_MODE_ENV).unwrap();
            assert!(
                !value.contains('"'),
                "the var value {value:?} contains a quote — serde's JSON quoting leaked into \
                 the environment; the hook compares against bare tokens."
            );
        }
    }

    #[test]
    fn cc_spawn_env_always_carries_the_shared_color_and_locale_vars() {
        use crate::config_store::DriveMode;

        // The drive-mode var is ADDITIVE. A regression that replaced the env rather than
        // extending it would break color output and UTF-8 (the M10.5 WP4 mojibake bug) while
        // every drive-mode assertion above still passed.
        for (mode, gate) in [
            (Some(DriveMode::Autopilot), true),
            (Some(DriveMode::Autopilot), false),
            (None, true),
            (None, false),
        ] {
            let env = cc_spawn_env(mode, gate);
            for shared in ["TERM", "COLORTERM", "LANG", "LC_ALL"] {
                assert!(
                    env_var(&env, shared).is_some(),
                    "cc_spawn_env(mode={mode:?}, gate={gate}) dropped the shared var \
                     {shared:?}; the drive-mode var must EXTEND the color/locale env, not \
                     replace it."
                );
            }
        }
    }

    #[test]
    fn cc_spawn_env_with_gate_off_is_exactly_the_shared_env() {
        use crate::config_store::DriveMode;

        // The strongest statement of the OFF invariant: not merely "no drive-mode var", but
        // "byte-identical to what a build without this feature would compose." Asserted as a
        // whole-value comparison so a future third var cannot slip in behind an off gate.
        let baseline: Vec<(String, String)> = color_tty_env()
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect();

        assert_eq!(
            cc_spawn_env(Some(DriveMode::Autopilot), false),
            baseline,
            "with the gate OFF the CC env must equal color_tty_env() exactly"
        );
        assert_eq!(
            cc_spawn_env(None, true),
            baseline,
            "with no mode set the CC env must equal color_tty_env() exactly"
        );
    }

    #[test]
    fn resolve_gate_enabled_fails_closed_on_every_degraded_read() {
        use crate::config_store::ConfigError;

        // The only arm that enables the feature is an explicit, successful `true`.
        assert!(resolve_gate_enabled(Some(Ok(true))), "explicit true → ON");

        // Everything else is OFF. ⚠️ Asserted arm-by-arm rather than as one loop so a future
        // reader sees each degraded input named: no app-data dir, an explicit false, an I/O
        // error, and a parse error (malformed settings.json).
        assert!(!resolve_gate_enabled(None), "no app-data dir → OFF");
        assert!(
            !resolve_gate_enabled(Some(Ok(false))),
            "explicit false → OFF"
        );
        assert!(
            !resolve_gate_enabled(Some(Err(ConfigError::Io(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "unreadable settings",
            ))))),
            "unreadable settings → OFF, never ON"
        );
        assert!(
            !resolve_gate_enabled(Some(Err(ConfigError::Parse(
                serde_json::from_str::<bool>("{oh no").unwrap_err()
            )))),
            "malformed settings → OFF, never ON"
        );
    }

    /// Drives the WIRING with real degraded inputs — the property three source-text guards
    /// each failed to express.
    ///
    /// ⚠️ **This test replaced a `?raw`-style scan that was measured vacuous three times**, and
    /// the history is the reason it looks like this. `contains("cc_spawn_env(")` was satisfied by
    /// that function's own `fn` declaration; a whitespace-exact match on the call site stopped
    /// biting the moment the signature was refactored; and the literal-argument form was
    /// satisfied by **this test's own assertion line** (the needle appears in the guard's source,
    /// which survives comment-stripping). All three passed while a mutant routed the CC spawn
    /// around the gate and `CLAUDESK_DRIVE_MODE` never reached CC.
    ///
    /// The fix is `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`: the
    /// resolution now lives in one importable function, and this asserts its **return value**
    /// for every degraded input the spawn site can actually produce. A source-text predicate can
    /// only encode shapes you thought of; a value assertion cannot be satisfied by prose.
    #[test]
    fn the_resolved_cc_env_honors_the_gate_end_to_end() {
        use crate::config_store::{ConfigError, DriveMode};

        // Two constructors, not one: the gate read is `Result<bool, _>` and the mode read is
        // `Result<Option<DriveMode>, _>`, so a single generic helper does not typecheck.
        let unreadable = || {
            ConfigError::Io(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "unreadable",
            ))
        };
        let gate_err = || Some(Err(unreadable()));
        let mode_err = || Some(Err(unreadable()));
        let has_var = |env: &[(String, String)]| env.iter().any(|(k, _)| k == DRIVE_MODE_ENV);

        // The one arm that emits: gate explicitly on, mode present.
        let on = resolve_cc_spawn_env(Some(Ok(true)), Some(Ok(Some(DriveMode::Autopilot))));
        assert_eq!(
            env_var(&on, DRIVE_MODE_ENV),
            Some("autopilot"),
            "gate ON + mode set must emit the var — this is the only arm that does"
        );

        // Every other reachable combination must be inert. Each is a real state of the two
        // reads at the spawn site: no app-data dir (None), a successful read, or an error.
        for (label, gate, mode) in [
            (
                "gate off, mode set",
                Some(Ok(false)),
                Some(Ok(Some(DriveMode::Autopilot))),
            ),
            (
                "gate unreadable, mode set",
                gate_err(),
                Some(Ok(Some(DriveMode::Autopilot))),
            ),
            (
                "no app-data dir for gate",
                None,
                Some(Ok(Some(DriveMode::Autopilot))),
            ),
            ("gate on, no mode", Some(Ok(true)), Some(Ok(None))),
            ("gate on, mode unreadable", Some(Ok(true)), mode_err()),
            ("gate on, no app-data dir for mode", Some(Ok(true)), None),
            ("both degraded", gate_err(), mode_err()),
        ] {
            let env = resolve_cc_spawn_env(gate, mode);
            assert!(
                !has_var(&env),
                "[{label}] must NOT carry {DRIVE_MODE_ENV}. Inertness is by absence (WP4a \
                 Verdict (c)); a degraded read must fail toward silence, never toward injecting \
                 workflow context into a session that did not opt in."
            );
            // And the spawn still gets a usable env — degradation must not blank color/locale.
            for shared in ["TERM", "COLORTERM", "LANG", "LC_ALL"] {
                assert!(
                    env_var(&env, shared).is_some(),
                    "[{label}] dropped the shared var {shared:?}; a config problem must cost \
                     the signal, not the workspace"
                );
            }
        }
    }

    /// **THE CROSS-LANGUAGE CALLER PROOF** (M12 WP4b P4.3) — constraint 9, discharged.
    ///
    /// Every other test in this feature proves ONE SIDE: Rust-side tests prove `cc_spawn_env`
    /// composes `CLAUDESK_DRIVE_MODE=<wire>`; `hook_pl_output.rs` proves the Perl script emits
    /// for hard-coded literals; and the vocabulary test compares the two lists by reading the
    /// allowlist as TEXT, without running anything.
    ///
    /// None of those runs the value Rust actually composes THROUGH the script Rust actually
    /// ships. They can all pass while the two halves never meet — the "proven module behind a
    /// caller that does not honor it" failure this milestone hit seven times. This is the
    /// single assertion that crosses the boundary: take the env **the real spawn path would
    /// hand the PTY**, feed it to the **real hook script** as a subprocess, and require the
    /// model-facing sentence to come back naming that mode.
    ///
    /// Both directions are asserted, because only the pair is meaningful: gate ON must produce
    /// the sentence, and gate OFF must produce **byte-empty stdout** through the same path. An
    /// ON-only test would pass against a hook that emits unconditionally.
    #[test]
    fn the_spawn_env_feeds_a_value_the_real_hook_accepts() {
        use crate::config_store::DriveMode;
        use std::io::Write as _;
        use std::process::{Command, Stdio};

        let hook =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/claudesk-hook.pl");
        if Command::new("perl").arg("--version").output().is_err() {
            return; // perl is macOS-bundled; skip cleanly if somehow absent
        }

        // Drive the REAL script with an env composed by the REAL spawn-env function.
        let run = |env: &[(String, String)]| -> String {
            let mut cmd = Command::new("perl");
            cmd.arg(&hook)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                // Remove BOTH vars first: this test runs inside a Claudesk workspace, so the
                // ambient environment already carries CLAUDESK_DRIVE_MODE. Inheriting it would
                // make the gate-OFF arm pass for the wrong reason.
                .env_remove("CLAUDESK_DRIVE_MODE")
                .env_remove("CLAUDESK_HOOK_SOCK");
            for (k, v) in env {
                cmd.env(k, v);
            }
            let mut child = cmd.spawn().expect("spawn perl hook");
            child
                .stdin
                .take()
                .unwrap()
                .write_all(
                    br#"{"hook_event_name":"UserPromptSubmit","session_id":"s","cwd":"/p","prompt":"hi"}"#,
                )
                .unwrap();
            let out = child.wait_with_output().expect("hook exits");
            assert!(out.status.success(), "the hook must always exit 0");
            String::from_utf8(out.stdout).expect("stdout is utf-8")
        };

        for mode in [
            DriveMode::StepByStep,
            DriveMode::Orchestrated,
            DriveMode::Autopilot,
            DriveMode::FullAutopilot,
        ] {
            let wire = serde_json::to_string(&mode)
                .unwrap()
                .trim_matches('"')
                .to_string();

            // GATE ON: the composed env must make the real hook emit, naming this mode.
            let stdout = run(&cc_spawn_env(Some(mode), true));
            let v: serde_json::Value = serde_json::from_str(stdout.trim()).unwrap_or_else(|e| {
                panic!(
                    "the env the spawn path composes for {mode:?} did NOT make the real hook \
                     emit valid JSON ({e}). stdout was {stdout:?}. The Rust and Perl halves have \
                     stopped agreeing — each side's own tests would still pass."
                )
            });
            let ctx = v["hookSpecificOutput"]["additionalContext"]
                .as_str()
                .expect("additionalContext is a string");
            assert!(
                ctx.contains(&wire),
                "the hook emitted {ctx:?}, which does not name the wire value {wire:?} that \
                 cc_spawn_env composed for {mode:?}"
            );

            // GATE OFF, same path: byte-empty. Inertness must survive the round trip too.
            assert!(
                run(&cc_spawn_env(Some(mode), false)).is_empty(),
                "with the gate OFF the composed env must make the real hook emit NOTHING for \
                 {mode:?}"
            );
        }
    }

    #[test]
    fn the_cc_spawn_wires_the_gate_through_the_fail_closed_resolver() {
        use crate::config_store::DriveMode;

        // ⚠️ THE CALLER TEST (P2.7). Every other WP4b assertion proves a PRIMITIVE
        // (`cc_spawn_env`, `resolve_gate_enabled`, `resolve_cc_spawn_env`). None of them can
        // see whether `Registry::spawn` actually HANDS that env to the PTY — and this exact
        // call site has now produced the "proven module behind a caller that does not honor
        // it" failure THREE times, each behind a source-text guard that passed while a mutant
        // routed the spawn around the gate. Constraint 9 of this WP exists for it.
        //
        // ⚠️ This test was NAMED in `PtyCcSession::spawn`'s doc comment before it existed —
        // a rustdoc intra-doc link to a missing item does not fail `cargo test`, so the
        // reference passed every gate while pinning nothing. Found at the 2026-08-07
        // verify-self integration-boundary check. If this test is ever deleted, delete that
        // doc reference in the same commit rather than leaving it to lie again.
        //
        // Expressed as a VALUE assertion on what reaches the PTY, not a source-text scan, per
        // `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`: `borrow_env` is
        // the last hop before `CommandBuilder`, so its input IS the CC spawn's env.
        let resolved = resolve_cc_spawn_env(Some(Ok(true)), Some(Ok(Some(DriveMode::Autopilot))));
        let delivered = borrow_env(&resolved);

        // (a) The signal survives the caller's translation.
        assert!(
            delivered
                .iter()
                .any(|(k, v)| *k == DRIVE_MODE_ENV && *v == "autopilot"),
            "the CC spawn must deliver {DRIVE_MODE_ENV}=autopilot to the PTY; got {delivered:?}"
        );

        // (b) ⚠️ The mutant this exists to catch: reverting the spawn's argument to the
        // shell-shared `color_tty_env()`. That array can NEVER carry the var (its own guard
        // pins it to exactly 4 color/locale names), so a caller that reverts delivers an env
        // that fails (a) — which is precisely what the three retired source-text guards let
        // through.
        let shell_shared_owned: Vec<(String, String)> = color_tty_env()
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect();
        let shell_shared = borrow_env(&shell_shared_owned);
        assert_ne!(
            delivered, shell_shared,
            "the CC spawn is delivering the raw color_tty_env() array — the drive-mode signal \
             never reaches CC. Compose via cc_spawn_env at the CC call site."
        );

        // (c) The OFF direction, same path: gate off must deliver the shell-shared env
        // EXACTLY, so a caller cannot leak the var past a closed gate.
        let off = resolve_cc_spawn_env(Some(Ok(false)), Some(Ok(Some(DriveMode::Autopilot))));
        assert_eq!(
            borrow_env(&off),
            shell_shared,
            "with the gate OFF the CC spawn must deliver exactly the color/locale env"
        );
    }

    #[test]
    fn the_raw_login_shell_never_receives_the_drive_mode_var() {
        use crate::config_store::DriveMode;

        // ⚠️ CODIFIES P2.verify-human.3, which was verified LIVE on 2026-08-07 (the operator ran
        // `echo "DRIVE_MODE=[$CLAUDESK_DRIVE_MODE]"` in the dev app's right-panel shell → `[]`,
        // in the SAME app instance whose CC process carried the var). That check is
        // **operator-only by instrument limitation**: macOS `ps -E` reports ZERO env tokens for
        // an interactive login shell, so an agent grepping the shell's environment gets an empty
        // result for BOTH "absent" and "unreadable" — which produced a false ABSENT during the
        // verify-human run, caught only by a token-count control. This test is the automated
        // stand-in that CI can actually run.
        //
        // ⚠️ Why the existing guard was NOT enough. `color_tty_env_carries_nothing_beyond_color_
        // and_locale` pins what is IN the shared array; it says nothing about WHICH env
        // `spawn_shell` passes. Routing the CC env to the shell — the precise leak constraint 5
        // forbids — passed the whole suite before this test existed. Asserting on
        // `shell_spawn_env()` makes it a statement about the SHELL CALL SITE's source.
        let shell = shell_spawn_env();
        assert!(
            !shell.iter().any(|(k, _)| *k == DRIVE_MODE_ENV),
            "the raw login shell must never receive {DRIVE_MODE_ENV}; got {shell:?}"
        );

        // ⚠️ …but the assertion above is about a FUNCTION'S OUTPUT, not about what the shell
        // spawn actually passes. `shell_spawn_env()` returns `color_tty_env()` verbatim, which
        // `color_tty_env_carries_nothing_beyond_color_and_locale` already pins — so on its own
        // this adds no information, and would stay green if `spawn_shell` were edited to hand
        // `cc_spawn_env(...)` to `spawn_argv` instead. The primitive is proven; the CALLER is
        // the seam. (`SURFACE-2026-08-07-QUALITY-WP4B-SHELL-SEAM-ASSERTS-THE-PRIMITIVE-NOT-THE-CALLER`.)
        //
        // Source-level because the call site's argument is not observable from a unit test:
        // `spawn_argv` reaches `CommandBuilder` and a real PTY. Whitespace is flattened so a
        // Prettier-equivalent rustfmt reflow cannot silently stop it matching.
        let src = include_str!("mod.rs");
        let production = src.split("mod tests").next().unwrap_or(src);
        let flat = production.split_whitespace().collect::<Vec<_>>().join(" ");
        assert!(
            flat.contains("&shell_spawn_env(), \"exit\""),
            "spawn_shell must pass shell_spawn_env() to spawn_argv — if this call site now \
             composes or forwards a different env, the value assertion above is proving a \
             property of an unused function"
        );
        assert!(
            !flat.contains("&cc_spawn_env(") || flat.matches("&cc_spawn_env(").count() == 1,
            "cc_spawn_env is reaching more than one spawn call site — the shell spawn must \
             never be one of them"
        );

        // And the positive control, so this cannot pass by the var having vanished everywhere:
        // the CC spawn under the same conditions DOES carry it. Without this, deleting the
        // feature outright would leave the assertion above green.
        let cc = cc_spawn_env(Some(DriveMode::Autopilot), true);
        assert!(
            cc.iter().any(|(k, _)| k == DRIVE_MODE_ENV),
            "positive control failed: the CC spawn should carry {DRIVE_MODE_ENV} with gate ON \
             + mode set. If this fires, the test above proves nothing."
        );

        // The split itself, stated as one assertion: same moment, two spawns, different envs.
        assert_ne!(
            cc.len(),
            shell.len(),
            "CC and the login shell must not receive identical envs when a drive mode is set"
        );
    }

    // --- build_cc_argv: permission-mode mapping (pure) ---

    #[test]
    fn cc_argv_passes_permission_mode_for_every_variant() {
        // Each mode maps to `claude --permission-mode <wire-value>`, and the wire value
        // is exactly the CLI token CC accepts.
        for (mode, expected) in [
            (CcPermissionMode::Default, "default"),
            (CcPermissionMode::Plan, "plan"),
            (CcPermissionMode::AcceptEdits, "acceptEdits"),
            (CcPermissionMode::Auto, "auto"),
            (CcPermissionMode::DontAsk, "dontAsk"),
            (CcPermissionMode::BypassPermissions, "bypassPermissions"),
        ] {
            let argv = build_cc_argv(mode, None, ResumeArm::Fresh);
            assert_eq!(
                argv,
                vec![
                    CC_CMD.to_string(),
                    CC_ARG_PERMISSION_MODE.to_string(),
                    expected.to_string(),
                ],
                "argv for {mode:?} should pass --permission-mode {expected}"
            );
        }
    }

    // --- build_cc_argv: per-project --model override (M11.5 WP1, pure) ---
    //
    // The property under test is an ASYMMETRY, deliberately unlike --permission-mode:
    // unset must produce NO --model token at all, because "inherit CC's default" has no
    // spellable flag value. See build_cc_argv's doc comment.

    #[test]
    fn cc_argv_omits_model_entirely_when_unset() {
        let argv = build_cc_argv(CcPermissionMode::Default, None, ResumeArm::Fresh);
        assert!(
            !argv.iter().any(|a| a == CC_ARG_MODEL),
            "unset must emit no --model token (not `--model default`, not an empty value), got {argv:?}"
        );
    }

    #[test]
    fn cc_argv_still_passes_permission_mode_when_model_is_unset() {
        // Guards the asymmetry from being "tidied up" in either direction: the model's
        // omit-when-unset rule must not be generalized onto --permission-mode, which is
        // uniform on purpose.
        let argv = build_cc_argv(CcPermissionMode::Default, None, ResumeArm::Fresh);
        assert_eq!(
            argv,
            vec![
                CC_CMD.to_string(),
                CC_ARG_PERMISSION_MODE.to_string(),
                "default".to_string(),
            ],
            "an unset model must leave the permission-mode argv exactly as it was pre-WP1"
        );
    }

    #[test]
    fn consume_before_set_or_nothing_ever_resumes() {
        // ⚠️ THE ORDERING PROPERTY, and it is genuinely subtle. `Registry::spawn` does two
        // opposite things to the same flag in one function: it CONSUMES the previous
        // session's flag (the signal we act on) and then DEFAULT-SETS the flag for the
        // session it is starting. Reversed, the consume would eat the flag this very spawn
        // just set — so `resume` would be `Continue` on every open AND nothing would ever be
        // a genuine resume signal. Both orders "work" in the sense of not crashing, which is
        // exactly why this needs a test rather than a comment.
        //
        // Source-position guard (CLAUDE.md: structure, never runtime) used narrowly, because
        // the alternative is spawning a real `claude` process. Comments are stripped so the
        // prose above cannot satisfy the assertion on the code's behalf — a hole this repo
        // has hit three times.
        // ⚠️ The anchor is the bare `pub fn spawn(` — NOT the full signature. P4.6 added an
        // `intent` parameter and reflowed the signature across lines, which broke the previous
        // full-signature literal. That failed LOUDLY (the `expect` below panics), which is the
        // good failure mode for a source guard — but the lesson is to anchor on the smallest
        // stable token, since a signature is exactly the thing a future change reflows.
        let src = include_str!("mod.rs");
        let body = src
            .split("pub fn spawn(")
            .nth(1)
            .expect("Registry::spawn must exist");
        let body = &body[..body.find("\n    }\n").expect("spawn must terminate")];
        let code: String = body
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        let consume_at = code
            .find("consume_and_persist(")
            .expect("the fire path must consume the flag");
        let set_at = code
            .find("should_set_unclean_flag(")
            .expect("the default-set must still be here");
        assert!(
            consume_at < set_at,
            "consume must precede the default-set, or the spawn eats the flag it just set \
             and no open is ever a genuine resume"
        );
    }

    // --- M12 WP3 Phase 4: the auto-resume ARGV arm ---

    #[test]
    fn the_continue_flag_is_absent_on_a_fresh_spawn() {
        let argv = build_cc_argv(CcPermissionMode::Default, None, ResumeArm::Fresh);
        assert!(
            !argv.iter().any(|a| a == "--continue"),
            "a fresh spawn must not resume: {argv:?}"
        );
    }

    #[test]
    fn the_continue_flag_is_present_on_a_resuming_spawn() {
        let argv = build_cc_argv(CcPermissionMode::Default, None, ResumeArm::Continue);
        assert!(
            argv.iter().any(|a| a == "--continue"),
            "the resume arm must pass --continue: {argv:?}"
        );
    }

    #[test]
    fn the_continue_flag_never_becomes_a_slash_command() {
        // ⚠️ Phase 1 Verdict 2: a bare `/resume` typed into the TUI opens an INTERACTIVE
        // session picker rather than resuming, and there is no `/continue` slash command at
        // all. This arm must stay a CLI flag. If someone "unifies" the two arms into one
        // injected string, this fails.
        let argv = build_cc_argv(CcPermissionMode::Default, None, ResumeArm::Continue);
        for arg in &argv {
            assert!(
                !arg.starts_with('/'),
                "argv must contain no slash commands, found {arg:?} in {argv:?}"
            );
        }
        assert!(argv.contains(&"--continue".to_string()));
    }

    #[test]
    fn the_resume_arm_does_not_disturb_the_other_flags() {
        // The resume flag is appended LAST so permission mode + model are byte-identical
        // whether or not this open resumes. Without this, a regression that inserted the
        // flag mid-argv could shift `--model`'s value into the wrong position.
        let fresh = build_cc_argv(CcPermissionMode::Auto, Some("opus"), ResumeArm::Fresh);
        let resuming = build_cc_argv(CcPermissionMode::Auto, Some("opus"), ResumeArm::Continue);
        assert_eq!(
            resuming[..fresh.len()],
            fresh[..],
            "the resuming argv must be the fresh argv plus a suffix"
        );
        assert_eq!(resuming.len(), fresh.len() + 1);
        assert_eq!(resuming.last().unwrap(), "--continue");
    }

    // --- M12 WP3 P4.6: the open INTENT gates the argv arm ---
    //
    // ⚠️ These exist because the property they assert was **proven in TypeScript and unenforced
    // here**, and the feature shipped broken with a fully green suite.
    // `actionForIntent(argv, "no-fire") === null` is mutation-proven in `announceRow.test.ts`, and
    // it was never the missing piece: `cc_spawn` took no intent, so `Registry::spawn` resolved the
    // arm from the flag alone and the `⏵` door resumed anyway. Reproduced live 3×.
    //
    // The lesson these tests encode: when a decision is made on one side of an IPC boundary and
    // acted on the other, **assert the boundary**. Re-asserting the pure function would have
    // passed before the fix.

    #[test]
    fn the_no_fire_door_does_not_consume_the_flag() {
        // The gate must short-circuit BEFORE `consume_and_persist`, not discard its result after.
        // Consuming on a no-fire open would spend the signal the user just declined to act on,
        // so the announcement would vanish and the NEXT open — the one they actually wanted to
        // resume — would find nothing.
        assert!(
            !should_consume_for_resume(OpenIntent::NoFire),
            "the no-fire door must neither resume nor consume the flag"
        );
        assert!(
            should_consume_for_resume(OpenIntent::Fire),
            "the row door must consume and resume"
        );
    }

    #[test]
    fn the_intent_gate_is_evaluated_before_the_consume() {
        // Source-position guard, used narrowly for the same reason as
        // `consume_before_set_or_nothing_ever_resumes`: the alternative is spawning a real
        // `claude`. What it pins is the `&&` SHORT-CIRCUIT — that the gate is the left operand,
        // so a no-fire open never reaches the consume at all. Written as an ordering assertion
        // rather than a substring match on one spelling, because `a && b` vs `b && a` both
        // compile and both "work" for the resume decision while differing on whether the flag
        // survives. Comments are stripped so the prose above cannot satisfy it.
        let src = include_str!("mod.rs");
        let body = src
            .split("pub fn spawn(")
            .nth(1)
            .expect("Registry::spawn must exist");
        let body = &body[..body.find("\n    }\n").expect("spawn must terminate")];
        let code: String = body
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        let gate_at = code
            .find("should_consume_for_resume(")
            .expect("the argv arm must be gated on the open intent");
        let consume_at = code
            .find("consume_and_persist(")
            .expect("the fire path must consume the flag");
        assert!(
            gate_at < consume_at,
            "the intent gate must precede (and short-circuit) the consume, or a no-fire open \
             spends the flag it declined to act on"
        );
    }

    #[test]
    fn an_absent_wire_intent_defaults_to_fire() {
        // `cc_spawn`'s parameter is `Option<OpenIntent>` so existing callers need no change.
        // ⚠️ The default direction is load-bearing: `NoFire` would look safer and is wrong —
        // it would silently disable auto-resume for any caller that omitted the field, a defect
        // with no error and no symptom except a feature that stopped working.
        assert_eq!(OpenIntent::default(), OpenIntent::Fire);
        assert!(should_consume_for_resume(OpenIntent::default()));
    }

    #[test]
    fn the_wire_form_of_open_intent_is_kebab_case() {
        // Pins the serde contract against the TS union `"fire" | "no-fire"`. The two sides are
        // separately declared, so nothing but a test couples them — and a silent mismatch would
        // make every `⏵` click deserialize-fail or fall back to firing.
        assert_eq!(
            serde_json::from_str::<OpenIntent>("\"no-fire\"").unwrap(),
            OpenIntent::NoFire
        );
        assert_eq!(
            serde_json::from_str::<OpenIntent>("\"fire\"").unwrap(),
            OpenIntent::Fire
        );
        // camelCase / snake_case spellings must NOT deserialize — if they did, a frontend typo
        // would silently pick a variant instead of erroring.
        assert!(serde_json::from_str::<OpenIntent>("\"noFire\"").is_err());
        assert!(serde_json::from_str::<OpenIntent>("\"no_fire\"").is_err());
    }

    #[test]
    fn cc_argv_passes_exactly_one_model_pair_when_set() {
        let argv = build_cc_argv(CcPermissionMode::Default, Some("opus"), ResumeArm::Fresh);
        assert_eq!(
            argv,
            vec![
                CC_CMD.to_string(),
                CC_ARG_PERMISSION_MODE.to_string(),
                "default".to_string(),
                CC_ARG_MODEL.to_string(),
                "opus".to_string(),
            ]
        );
        assert_eq!(
            argv.iter().filter(|a| *a == CC_ARG_MODEL).count(),
            1,
            "exactly one --model pair"
        );
    }

    #[test]
    fn cc_argv_accepts_an_alias_or_a_full_model_id_verbatim() {
        // The probe established an open value set; Claudesk forwards, CC adjudicates.
        for value in ["fable", "opus", "sonnet", "claude-fable-5"] {
            let argv = build_cc_argv(CcPermissionMode::Auto, Some(value), ResumeArm::Fresh);
            let idx = argv.iter().position(|a| a == CC_ARG_MODEL).unwrap();
            assert_eq!(argv[idx + 1], value, "value must be forwarded unaltered");
        }
    }

    #[test]
    fn cc_argv_treats_blank_or_whitespace_model_as_unset() {
        // Defense in depth: set_default_model normalizes on the way in, but a
        // hand-edited or older-build projects.json could still carry whitespace, and it
        // must never reach CC as an argv token.
        for blank in ["", "   ", "\t", "\n"] {
            let argv = build_cc_argv(CcPermissionMode::Default, Some(blank), ResumeArm::Fresh);
            assert!(
                !argv.iter().any(|a| a == CC_ARG_MODEL),
                "{blank:?} must be treated as unset, got {argv:?}"
            );
        }
    }

    #[test]
    fn cc_argv_trims_a_padded_model_value() {
        let argv = build_cc_argv(
            CcPermissionMode::Default,
            Some("  opus  "),
            ResumeArm::Fresh,
        );
        let idx = argv.iter().position(|a| a == CC_ARG_MODEL).unwrap();
        assert_eq!(argv[idx + 1], "opus");
    }

    #[test]
    fn cc_argv_model_composes_with_every_permission_mode() {
        // The two flags are independent; neither read may clobber the other.
        for mode in [
            CcPermissionMode::Default,
            CcPermissionMode::Plan,
            CcPermissionMode::AcceptEdits,
            CcPermissionMode::Auto,
            CcPermissionMode::DontAsk,
            CcPermissionMode::BypassPermissions,
        ] {
            let argv = build_cc_argv(mode, Some("opus"), ResumeArm::Fresh);
            assert_eq!(argv[0], CC_CMD);
            assert_eq!(argv[1], CC_ARG_PERMISSION_MODE);
            assert_eq!(argv[2], mode.as_flag_value());
            assert_eq!(argv[3], CC_ARG_MODEL);
            assert_eq!(argv[4], "opus");
        }
    }

    #[test]
    fn cc_argv_model_flag_matches_the_documented_cli_token() {
        assert_eq!(CC_ARG_MODEL, "--model");
    }

    /// Codifies the argv shapes that were accepted by the REAL `claude` CLI at
    /// Phase 1 verify-human (2026-07-31, leaf `P1.verify-human.1`), so a regression in
    /// composition is caught here rather than only on a live spawn.
    ///
    /// **Deliberately asserts the composed argv as a whole string vector, not just the
    /// flag tokens.** Verify-human ran three arms and all three replied normally:
    /// - `claude --permission-mode default --model opus`         → `OK`
    /// - `claude --permission-mode default`  (no `--model`)      → `OK-NOMODEL`
    /// - `claude --permission-mode default --model claude-fable-5` → `OK-FULLID`
    ///
    /// **This test does NOT invoke `claude`, on purpose.** A test that shelled out to the
    /// real CLI would need network + auth + tokens and would fail on any machine or CI
    /// runner without an authenticated `claude` — buying flakiness in exchange for
    /// re-checking a fact about an external tool we do not control. What is *ours* to keep
    /// correct is the argv we compose, which is what this pins. The live end-to-end proof
    /// (`ps -o args=` on the spawned process, citing `cc_spawn`) is Phase 3's outcome.
    #[test]
    fn cc_argv_composes_the_exact_shapes_the_real_cli_accepted_at_verify_human() {
        // Arm 1 — alias override.
        assert_eq!(
            build_cc_argv(CcPermissionMode::Default, Some("opus"), ResumeArm::Fresh),
            vec!["claude", "--permission-mode", "default", "--model", "opus"]
        );
        // Arm 2 — the inherit path. The load-bearing arm: proves omit-when-unset yields a
        // shape the CLI genuinely accepts, not merely one our tests agree on.
        assert_eq!(
            build_cc_argv(CcPermissionMode::Default, None, ResumeArm::Fresh),
            vec!["claude", "--permission-mode", "default"]
        );
        // Arm 3 — full model ID.
        assert_eq!(
            build_cc_argv(
                CcPermissionMode::Default,
                Some("claude-fable-5"),
                ResumeArm::Fresh
            ),
            vec![
                "claude",
                "--permission-mode",
                "default",
                "--model",
                "claude-fable-5"
            ]
        );
    }

    #[test]
    fn cc_argv_permission_mode_flag_matches_the_documented_cli_token() {
        // Sibling of the `--model` pin above; both flag spellings are external contracts
        // with the `claude` CLI, so neither should be silently renameable.
        assert_eq!(CC_ARG_PERMISSION_MODE, "--permission-mode");
    }

    // --- resolve_spawn_model: the never-block-a-spawn degradation rule (pure) ---
    //
    // `SessionRegistry::spawn` itself needs a live AppHandle + a real PTY, so it cannot
    // be unit-tested at all (nothing in this codebase constructs an AppHandle in a test).
    // The degradation DECISION is extracted precisely so it can be asserted as a value
    // here rather than being observable only on a running app.

    #[test]
    fn spawn_model_uses_the_override_when_the_read_succeeds() {
        let read = Some(Ok(Some("opus".to_string())));
        assert_eq!(resolve_spawn_model(read), Some("opus".to_string()));
    }

    #[test]
    fn spawn_model_is_none_when_the_project_has_no_override() {
        let read = Some(Ok(None));
        assert_eq!(resolve_spawn_model(read), None);
    }

    #[test]
    fn spawn_model_degrades_to_none_when_the_app_data_dir_is_unresolvable() {
        // No read was even attempted — must not block the spawn.
        assert_eq!(resolve_spawn_model(None), None);
    }

    #[test]
    fn spawn_model_degrades_to_none_on_a_malformed_projects_json() {
        // A parse error must inherit CC's default, NOT propagate and fail the spawn:
        // opening with the default model is a mild surprise; a workspace that refuses
        // to open is a dead click.
        let parse_err = serde_json::from_str::<serde_json::Value>("{ not json").unwrap_err();
        let read = Some(Err(crate::config_store::ConfigError::Parse(parse_err)));
        assert_eq!(resolve_spawn_model(read), None);
    }

    #[test]
    fn spawn_model_degrades_to_none_on_an_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let read = Some(Err(crate::config_store::ConfigError::Io(io_err)));
        assert_eq!(resolve_spawn_model(read), None);
    }

    // --- should_set_unclean_flag: the M12 WP2 spawn-ordering guarantee (pure, P2.7) ---
    //
    // These exist because the guarantee was previously true only by STATEMENT ORDER (the
    // flag write sat after a `?`), which no test can go red on. verify-auto caught that the
    // Observable outcome demanded a mutation-provable guard and none existed.

    #[test]
    fn spawn_failure_must_not_set_the_flag() {
        // THE load-bearing case. A flag set for a spawn that failed would fire `/resume` on
        // the next open for a session that never existed — acting on the user's workflow
        // off the back of a dead click.
        let dir = std::path::PathBuf::from("/tmp/some-data-dir");
        assert!(
            !should_set_unclean_flag(false, Some(&dir)),
            "a FAILED spawn must never set the unclean flag, even with a resolvable data dir"
        );
    }

    #[test]
    fn spawn_success_sets_the_flag() {
        let dir = std::path::PathBuf::from("/tmp/some-data-dir");
        assert!(
            should_set_unclean_flag(true, Some(&dir)),
            "a successful spawn is DEFAULT-UNCLEAN — that is the whole design: a crash runs \
             no code, so the flag must already be set before any work begins"
        );
    }

    #[test]
    fn no_data_dir_means_no_flag_even_on_a_successful_spawn() {
        // Nowhere to write. Degrades to "no flag" (→ no auto-fire), the safe direction,
        // rather than blocking the spawn — same posture as the two config reads above.
        assert!(!should_set_unclean_flag(true, None));
    }

    #[test]
    fn a_failed_spawn_with_no_data_dir_sets_nothing() {
        assert!(!should_set_unclean_flag(false, None));
    }

    #[test]
    fn cc_permission_mode_default_is_default_variant() {
        assert_eq!(CcPermissionMode::default(), CcPermissionMode::Default);
    }

    #[test]
    fn cc_permission_mode_serde_matches_cli_tokens() {
        // The serde wire string, the CLI flag value, and CC's `--permission-mode` choice
        // set must all agree — this is the cross-boundary contract (TS union ↔ persisted
        // JSON ↔ CLI token).
        for (mode, wire) in [
            (CcPermissionMode::Default, "\"default\""),
            (CcPermissionMode::Plan, "\"plan\""),
            (CcPermissionMode::AcceptEdits, "\"acceptEdits\""),
            (CcPermissionMode::Auto, "\"auto\""),
            (CcPermissionMode::DontAsk, "\"dontAsk\""),
            (CcPermissionMode::BypassPermissions, "\"bypassPermissions\""),
        ] {
            assert_eq!(serde_json::to_string(&mode).unwrap(), wire);
            let back: CcPermissionMode = serde_json::from_str(wire).unwrap();
            assert_eq!(back, mode);
            // The bare (unquoted) token equals the flag value.
            assert_eq!(format!("\"{}\"", mode.as_flag_value()), wire);
        }
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

    /// Collect what `drain_backlog_emitting` flushes, for assertions.
    fn drain_collect(backlog: &Mutex<Option<Vec<String>>>) -> Vec<String> {
        let mut out = Vec::new();
        drain_backlog_emitting(backlog, |c| out.push(c));
        out
    }

    #[test]
    fn drain_backlog_emits_buffered_in_order_and_flips_to_live() {
        let backlog: Mutex<Option<Vec<String>>> = Mutex::new(Some(vec![
            "1".to_string(),
            "2".to_string(),
            "3".to_string(),
        ]));
        // Flush emits the buffered chunks in order...
        assert_eq!(drain_collect(&backlog), vec!["1", "2", "3"]);
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
        assert_eq!(drain_collect(&backlog), vec!["x"]);
        // A second drain (e.g. a duplicate cc_ready) yields nothing and stays live.
        assert!(drain_collect(&backlog).is_empty());
        assert!(backlog.lock().unwrap().is_none());
    }

    #[test]
    fn no_chunk_is_lost_across_the_buffer_to_live_seam() {
        // The race the fix closes: a chunk that arrives, then the frontend readies, then
        // more chunks. Every chunk is accounted for exactly once (buffered then flushed,
        // or emitted live) — none dropped, none duplicated.
        let backlog: Mutex<Option<Vec<String>>> = Mutex::new(Some(Vec::new()));
        assert_eq!(route_chunk(&backlog, "prompt".to_string()), None); // buffered pre-ready
        let flushed = drain_collect(&backlog); // frontend readied → flush
        assert_eq!(flushed, vec!["prompt"]);
        // Post-ready chunks go live.
        assert_eq!(
            route_chunk(&backlog, "typed".to_string()),
            Some("typed".to_string())
        );
    }

    #[test]
    fn drain_emitting_holds_the_lock_across_the_whole_flush() {
        // m2-wp9 MINOR #1: the flush must happen under the lock so a concurrent reader
        // can't interleave a live chunk between buffered ones. We can't easily race a
        // thread deterministically here, but we CAN prove the invariant the fix relies on:
        // the backlog is still observably held/locked-and-mutated as a single critical
        // section — re-entrant access from the emit closure sees the guard already taken.
        let backlog: Mutex<Option<Vec<String>>> =
            Mutex::new(Some(vec!["a".to_string(), "b".to_string()]));
        drain_backlog_emitting(&backlog, |_chunk| {
            // While the flush runs, the lock is held: a try_lock from "another path"
            // (simulating the reader thread's route_chunk) must fail to acquire it, so it
            // can't take the live path and emit ahead of the remaining buffered chunks.
            assert!(
                backlog.try_lock().is_err(),
                "backlog lock must stay held across the flush"
            );
        });
        // After the flush the session is live and the lock is free again.
        assert!(backlog.lock().unwrap().is_none());
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
        let (mut reg, killed, ids) = reg_with_fakes(4);
        assert_eq!(reg.len(), 4);
        let killed_ids = reg.kill_all();
        assert_eq!(killed_ids.len(), 4);
        assert_eq!(reg.len(), 0);
        assert_eq!(killed.load(Ordering::SeqCst), 4);
        // M9 WP6.5 id-fidelity: the returned ids must be EXACTLY the inserted set — the
        // WorkspaceClose markers on app-quit are keyed on these ids, so a regression that
        // kept the count but returned wrong/empty ids would silently misattribute (or
        // drop) markers. A count check alone would miss it.
        use std::collections::BTreeSet;
        let got: BTreeSet<&str> = killed_ids.iter().map(String::as_str).collect();
        let want: BTreeSet<&str> = ids.iter().map(String::as_str).collect();
        assert_eq!(
            got, want,
            "kill_all must return exactly the killed session ids"
        );
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
        let killed_ids = reg.kill_all();
        let elapsed = start.elapsed();

        // All four were killed and drained...
        assert_eq!(killed_ids.len(), 4);
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

        let killed_ids = reg.kill_all();

        // The failing session is NOT reported as terminated...
        assert_eq!(killed_ids.len(), 3);
        // ...but every session (incl. the failing one) is drained from the registry...
        assert_eq!(reg.len(), 0);
        // ...and the 3 successes all ran (the failing one didn't short-circuit them).
        assert_eq!(killed.load(Ordering::SeqCst), 3);
    }

    // --- M10.5 WP3: the kill SEQUENCE (pure policy, no real PTY / wall-clock) ---

    #[test]
    fn kill_sequence_is_clean_exit_then_sighup_group_then_sigkill_group_then_reap() {
        // The load-bearing assertion for WP3: the kill sequence tries a clean exit FIRST,
        // then escalates SIGHUP-to-the-GROUP (which saves an interactive shell's history +
        // reaps subagents — SIGTERM/SIGKILL would lose history), grants a grace, then
        // SIGKILL-to-the-GROUP, then reaps the leader. Order + step kinds are the policy;
        // the executor in `PtyCcSession::kill()` walks exactly this.
        let steps = kill_steps(DEFAULT_KILL_TIMING);
        assert_eq!(
            steps,
            [
                KillStep::CleanExitAttempt(DEFAULT_KILL_TIMING.exit_poll),
                KillStep::HupGroupThenGrace(DEFAULT_KILL_TIMING.hup_grace),
                KillStep::KillGroup,
                KillStep::ReapLeader,
            ]
        );
    }

    #[test]
    fn kill_timing_shortened_exit_poll_and_bounded_forced_path() {
        // Regression guard for the reproduced ~5s hang: the clean-exit poll must NOT be the
        // old 3s (a busy session never reads `exit_command`, so that was pure latency on
        // every close). 500ms + a 300ms SIGHUP grace bounds the forced path to ≤~800ms —
        // under the ≤~1s acceptance target. If someone bumps these back up, this fails.
        assert_eq!(DEFAULT_KILL_TIMING.exit_poll, Duration::from_millis(500));
        assert_eq!(DEFAULT_KILL_TIMING.hup_grace, Duration::from_millis(300));
        assert!(
            DEFAULT_KILL_TIMING.exit_poll < Duration::from_secs(3),
            "exit poll must be shorter than the pre-WP3 3s grace"
        );
        let forced_path = DEFAULT_KILL_TIMING.exit_poll + DEFAULT_KILL_TIMING.hup_grace;
        assert!(
            forced_path <= Duration::from_millis(1000),
            "forced kill path must stay within ~1s (got {forced_path:?})"
        );
    }

    #[test]
    fn sighup_is_the_first_escalation_signal_not_sigterm() {
        // Pin the SIGNAL choice: the first escalation after the clean-exit attempt is
        // SIGHUP (which lets zsh/bash persist history on exit), NOT SIGTERM (which does
        // not). This is the single decision that fixes the lost-shell-history defect; a
        // regression to SIGTERM would compile fine but silently re-break history, so this
        // asserts it directly at the policy level.
        let steps = kill_steps(DEFAULT_KILL_TIMING);
        assert!(
            matches!(steps[1], KillStep::HupGroupThenGrace(_)),
            "first escalation must be SIGHUP-to-group, got {:?}",
            steps[1]
        );
    }
}
