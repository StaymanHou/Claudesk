//! M17 — **THE builder of every remote command string** (`arch/remote-workspaces.md` §C).
//!
//! A remote command crosses one or more shell interpreters on another host. On a shared host a
//! path or mode string that is not quoted correctly for EVERY layer it crosses is remote code
//! execution, so this module is the only place a remote command is put together.
//!
//! ## The rule (restated at WP2 from arch §C's ⚠️ OPEN point)
//!
//! **No *variable* value enters a remote command outside [`quote`].** A variable value is anything
//! that came from the operator or the project list (a path, a host, a session name, a drive mode,
//! CC's argv), and it is quoted once **per shell layer it crosses**: [`quote`] once per layer: nested
//! [`quote`] calls where a quoted value sits inside a script that is itself quoted (e.g.
//! [`login_shell`]).
//!
//! A **compile-time constant fragment** in this module (no variable data in it) may contain an
//! expansion that must happen REMOTELY, such as [`AUTH_CHECK`]'s `$(cat ~/.claudesk/…)`. That is
//! why the rule is about *variable* values: a constant cannot carry an injection, and it is quoted
//! as a whole for the outer layers so its `$(…)` survives to the innermost shell.
//!
//! ## WP3's spawn command (recorded here so the decision travels with the module)
//!
//! Arch §C leaves (a) a constant fragment vs (b) a deployed launcher open for the token export in
//! the tmux inner command. **WP2's recommendation is (b), a deployed launcher**
//! (`~/.claudesk/<identifier>/cc-launch`): WP3.7 already deploys `tmux.conf` to that directory, so
//! the launcher costs one more file in the same deploy. The spawn string then carries no expansion
//! at all, and "the token is never in the command string" becomes trivially testable. (a) remains
//! legal under the rule above if WP3 chooses it.
//!
//! ## What does NOT go through here
//!
//! Claudesk's own argv to `/usr/bin/ssh` is NOT a shell (it is `Command::arg`), so the host is not
//! quoted. It is VALIDATED instead ([`validate_host`]), because a host beginning with `-` would be
//! parsed by ssh as an OPTION (`-oProxyCommand=…` runs a LOCAL command).

pub mod commands;
pub mod preflight;

/// The remote file holding the long-lived `claude setup-token` token (arch §C.1, operator ruling
/// 2026-11-14). Read only ON the remote, by a constant fragment; Claudesk never reads, writes or
/// transports it.
pub const TOKEN_FILE: &str = "~/.claudesk/cc-oauth-token";

/// Quote `s` for ONE POSIX shell layer: wrap it in single quotes, writing each embedded `'` as
/// `'\''`. Inside single quotes no character is special (`$`, backticks, `\`, `"`, newlines), so
/// the shell hands the value through byte-exact. Works the same in `sh`, `bash` and `zsh` (the
/// remote login shell is the operator's, and arch §C runs `zsh -lc`).
///
/// The empty string becomes `''` (an empty argument, never a missing one).
pub fn quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for c in s.chars() {
        if c == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(c);
        }
    }
    out.push('\'');
    out
}

/// `zsh -lc <script>` for the remote login shell: `script` is quoted for that one layer, so any
/// value `script` itself quoted is now quoted twice, once per shell it crosses.
///
/// `zsh -l` because `tmux` and `claude` are not on the mini's NON-login PATH (probed, research).
pub fn login_shell(script: &str) -> String {
    format!("zsh -lc {}", quote(script))
}

/// Constant fragment: print the remote `$HOME`. The first preflight exec, which also proves the
/// host resolves and accepts the key. The `$HOME` expands remotely (it is a constant).
pub const PRINT_HOME: &str = "printf '%s' \"$HOME\"";

/// M18 WP2 — constant fragment (no variable value): when `claude` is not on the login shell's
/// PATH, look in `$HOME/.local/bin`, where Claude Code's native installer puts it.
///
/// ⚠️ Why it is needed: Claudesk runs every remote command under `zsh -lc`, a NON-interactive login
/// shell, which reads `~/.zprofile` but not `~/.zshrc`. An account set up interactively often adds
/// `~/.local/bin` to PATH only in `~/.zshrc`, so `claude` is invisible to the preflight and to
/// `cc-launch` (`SURFACE-2026-11-17-REMOTE-CLAUDE-ONLY-ON-INTERACTIVE-PATH`; hit on the mini's
/// fresh account 2026-11-17). Claudesk never edits a dotfile: when this fallback misses too, the
/// preflight names the `~/.zprofile` fix (`preflight::parse_check_lines`).
///
/// Shared by the preflight ([`preflight_script`], ahead of its tools loop and [`AUTH_CHECK`]) and the
/// deployed launcher (`remote_link::cc_launcher`, ahead of `exec claude`).
pub const CLAUDE_PATH_FALLBACK: &str =
    "command -v claude >/dev/null 2>&1 || PATH=\"$HOME/.local/bin:$PATH\"";

/// Constant fragment: the auth check (arch §H). With the token exported, `claude auth status`
/// must say `loggedIn: true`. ⚠️ The token's `$(cat …)` expands ON THE REMOTE; nothing but
/// `ok:auth` / `fail:auth` comes back, so the token never leaves the host.
pub const AUTH_CHECK: &str = "CLAUDE_CODE_OAUTH_TOKEN=\"$(cat ~/.claudesk/cc-oauth-token)\" \
claude auth status --json 2>/dev/null | grep -q '\"loggedIn\": *true' \
&& echo ok:auth || echo fail:auth";

/// The one preflight check script (arch §H), run under [`login_shell`]. `path` is the only
/// variable value and enters through [`quote`]. Prints one `ok:<check>` line per passing check
/// and stops at the first `fail:<check>[:<detail>]` line. Just before `ok:tools` it prints
/// `claude-at:<where claude resolved>`, so a token failure can name a fix that works over a plain
/// `ssh -t` (M18 WP6: `claude` may be reachable only through [`CLAUDE_PATH_FALLBACK`]). Always exits 0, so a non-zero exit
/// means ssh (255) or the shell itself failed, never a check.
pub fn preflight_script(path: &str) -> String {
    format!(
        "p={path}\n\
{CLAUDE_PATH_FALLBACK}\n\
for t in tmux claude perl; do command -v \"$t\" >/dev/null 2>&1 || {{ echo \"fail:tools:$t\"; exit 0; }}; done\n\
echo \"claude-at:$(command -v claude)\"\n\
echo ok:tools\n\
[ -d \"$p\" ] || {{ echo fail:path; exit 0; }}\n\
echo ok:path\n\
[ -s {TOKEN_FILE} ] || {{ echo fail:token; exit 0; }}\n\
echo ok:token\n\
{AUTH_CHECK}\n",
        path = quote(path),
    )
}

/// Why a host string is refused before any process is spawned.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostError {
    Empty,
    /// Starts with `-`: ssh would parse it as an option (`-oProxyCommand=…` = LOCAL code).
    LeadingDash,
    /// A character outside the allowed set (whitespace, a control character, `/`, a quote, …).
    BadChar(char),
}

impl std::fmt::Display for HostError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "enter a host, like user@host or an ~/.ssh/config alias"),
            Self::LeadingDash => write!(f, "a host cannot start with \"-\""),
            Self::BadChar(c) => write!(
                f,
                "a host can contain letters, digits and @ . _ - : [ ] % only (found {c:?})"
            ),
        }
    }
}

/// Validate an ssh destination as the operator typed it: `user@host`, a `~/.ssh/config` alias, an
/// IP, or `user@[v6]`. A strict allow-list, deliberately: `ssh://` URIs, options and anything
/// shell-shaped are refused. Returns the trimmed host.
pub fn validate_host(host: &str) -> Result<String, HostError> {
    let host = host.trim();
    if host.is_empty() {
        return Err(HostError::Empty);
    }
    if host.starts_with('-') {
        return Err(HostError::LeadingDash);
    }
    if let Some(c) = host
        .chars()
        .find(|c| !(c.is_ascii_alphanumeric() || "@._-:[]%".contains(*c)))
    {
        return Err(HostError::BadChar(c));
    }
    Ok(host.to_string())
}

/// Normalize a remote path as typed, to the ONE form a remote row's identity key is built from.
/// `~` / `~/…` are expanded with the REMOTE `home` (read by the preflight's [`PRINT_HOME`]); the
/// result must be absolute and free of control characters. Empty and `.` segments are dropped
/// (`/a//b/./c/` → `/a/b/c`), so every spelling of one folder gives one key.
///
/// ⚠️ **A `..` segment is REFUSED, not resolved.** Resolving it lexically (`/a/x/../b` → `/a/b`)
/// is wrong when `x` is a symlink on the remote, and resolving it for real needs a remote
/// `cd -P`. Refusing is honest and costs the operator one retype.
///
/// Idempotent: a normalized path is a fixed point, which is how the store checks a stored row
/// ([`is_normalized_remote_path`]).
pub fn normalize_remote_path(path: &str, home: &str) -> Result<String, String> {
    let path = path.trim();
    let expanded = if path == "~" {
        home.to_string()
    } else if let Some(rest) = path.strip_prefix("~/") {
        format!("{}/{}", home.trim_end_matches('/'), rest)
    } else {
        path.to_string()
    };
    if !expanded.starts_with('/') {
        return Err(format!(
            "use an absolute path (like /Users/<you>/project) or one starting with ~/, got {path:?}"
        ));
    }
    if expanded.chars().any(char::is_control) {
        return Err("the path contains a control character".into());
    }
    let mut segments = Vec::new();
    for seg in expanded.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                return Err(format!(
                    "the path cannot contain \"..\"; type the folder's real path, got {path:?}"
                ))
            }
            other => segments.push(other),
        }
    }
    Ok(format!("/{}", segments.join("/")))
}

/// Whether `path` is already in [`normalize_remote_path`]'s form: absolute and a fixed point of
/// it. The store's check for a remote row (it never sees `~`, which the add path expanded).
pub fn is_normalized_remote_path(path: &str) -> bool {
    path.starts_with('/') && normalize_remote_path(path, "/").as_deref() == Ok(path)
}

/// First 8 hex digits of `sha256(s)`. Stable across Rust and app versions (unlike `std`'s
/// hasher), which matters: a tmux session name derived from it must still match after an upgrade
/// (the reconnect finds the session by name). Used for session names and ControlPaths.
pub fn hash8(s: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(s.as_bytes());
    digest.iter().take(4).map(|b| format!("{b:02x}")).collect()
}

/// The `origin` a remote host's hook tags every event with (M17 WP4, arch §D):
/// `hash8(host)`, the same value that names the host's ControlPath. The local registry routes
/// an origin-tagged event only among that host's remote workspaces.
pub fn hook_origin(host: &str) -> String {
    hash8(host)
}

/// The tmux server (`-L`) for this app build: dev and prod never share one (arch §A).
pub fn tmux_server(identifier: &str) -> &'static str {
    if identifier.ends_with(".dev") {
        "claudesk-dev"
    } else {
        "claudesk"
    }
}

/// The tmux session name of the workspace keyed `remote_key` (arch §A): `cd-<hash8>`.
pub fn tmux_session(remote_key: &str) -> String {
    format!("cd-{}", hash8(remote_key))
}

/// Exit code of a START whose tmux session already exists (M17 WP5, AC-3.5): the start refuses
/// rather than attaching. Distinct from tmux's own 1, so the terminal's end is classified
/// `SessionExists`, never "CC exited".
pub const EXIT_SESSION_EXISTS: u32 = 3;
/// Exit code of an ATTACH whose tmux session does not exist (M17 WP5): the session has ended.
pub const EXIT_NO_SESSION: u32 = 4;
/// The tmux user option holding the drive mode a session was SPAWNED under (M17 WP5, A9), read back
/// by the open check so a reconnect registers the mode the session really runs under.
pub const MODE_OPTION: &str = "@cd_mode";
/// [`MODE_OPTION`]'s value for a session spawned with no drive mode. An UNSET option (a session
/// started before WP5) is different: its mode is unknown.
pub const NO_MODE: &str = "none";

/// The remote command that STARTS a workspace's CC session (arch §C; WP3 option (b)), run by
/// [`login_shell`] because `tmux` is not on the host's non-login PATH:
///
/// ```text
/// tmux -L <server> has-session -t =<session> 2>/dev/null && exit 3
/// exec tmux -L <server> -f <conf> new -s <session> -c <path> <inner> \; set-option -q @cd_mode <mode>
/// ```
///
/// `<inner>` is the command tmux hands to its default shell: `exec env
/// [CLAUDESK_DRIVE_MODE=<mode>] <launcher> <cc_args…>`. The deployed launcher does the token
/// export, the inline TUI and `unset TMUX`, so NOTHING here expands: every value is quoted for
/// each shell it crosses (inner shell, then the `zsh -lc` script, then the login shell), and the
/// paths are absolute (from the link's `$HOME`), with no `~`.
///
/// ⚠️ M17 WP5: a start NEVER attaches (no `new -A`). Whether to attach is the open check's
/// decision (a live session Claudesk left running is reconnected with [`tmux_attach_command`]); a
/// session that appeared between that check and this start exits [`EXIT_SESSION_EXISTS`] instead
/// of being joined silently. tmux's own `duplicate session` refusal (a race inside the window
/// between the two tmux calls) exits 1, which reads as ended: the next open asks.
pub fn tmux_new_command(
    server: &str,
    conf: &str,
    session: &str,
    path: &str,
    launcher: &str,
    drive_mode: Option<&str>,
    cc_args: &[String],
) -> String {
    let mut inner = String::from("exec env ");
    if let Some(mode) = drive_mode {
        inner.push_str(&quote(&format!("CLAUDESK_DRIVE_MODE={mode}")));
        inner.push(' ');
    }
    inner.push_str(&quote(launcher));
    for a in cc_args {
        inner.push(' ');
        inner.push_str(&quote(a));
    }
    login_shell(&format!(
        "tmux -L {srv} has-session -t {exact} 2>/dev/null && exit {EXIT_SESSION_EXISTS}\n\
exec tmux -L {srv} -f {} new -s {} -c {} {} \\; set-option -q {} {}",
        quote(conf),
        quote(session),
        quote(path),
        quote(&inner),
        quote(MODE_OPTION),
        quote(drive_mode.unwrap_or(NO_MODE)),
        srv = quote(server),
        exact = quote(&format!("={session}")),
    ))
}

/// The remote command that ATTACHES to a workspace's live tmux session: a reconnect after the link
/// came back (M17 WP3 Phase 5) or a reconnect on open (M17 WP5).
///
/// ⚠️ `attach`, never `new -A`: a session that died while the link was down must NOT be silently
/// restarted with a fresh CC. A missing session exits [`EXIT_NO_SESSION`] (checked first, so the
/// end is classified without reading tmux's output). The `=` makes the match exact, so
/// `cd-1234abcd` never attaches to `cd-1234abcd-x`.
pub fn tmux_attach_command(server: &str, session: &str) -> String {
    login_shell(&format!(
        "tmux -L {srv} has-session -t {exact} 2>/dev/null || exit {EXIT_NO_SESSION}\n\
exec tmux -L {srv} attach -t {exact}",
        srv = quote(server),
        exact = quote(&format!("={session}")),
    ))
}

/// The remote command that takes a workspace's pane OUT of tmux copy-mode, so the keys Claudesk
/// types next reach CC (arch §C.1/§E: a scrolled-up pane swallows input). Tolerant by design:
/// when the pane is not in a mode tmux refuses with "not in a mode", which is success here, so
/// the command always exits 0 unless ssh or the shell failed.
pub fn tmux_cancel_copy_mode_command(server: &str, session: &str) -> String {
    login_shell(&format!(
        "tmux -L {} send-keys -t {} -X cancel 2>/dev/null; exit 0",
        quote(server),
        quote(&format!("={session}:")),
    ))
}

/// How long [`tmux_end_session_command`] lets CC finish its `/exit` before killing the session,
/// in 0.2 s polls (5 s).
pub const END_POLLS: u32 = 25;

/// The shell script of [`tmux_end_session_command`]: wait up to `polls` × 0.2 s for the session
/// to end on its own (CC handling the `/exit` the close sent), then `kill-session` it. Prints
/// `ended=exited` or `ended=killed`. Pure, so a test runs it against a fake `tmux`.
pub fn tmux_end_session_script(server: &str, session: &str, polls: u32) -> String {
    let t = quote(&format!("={session}"));
    let srv = quote(server);
    format!(
        "i=0\n\
while [ \"$i\" -lt {polls} ] && tmux -L {srv} has-session -t {t} 2>/dev/null; do \
i=$((i+1)); sleep 0.2; done\n\
if tmux -L {srv} has-session -t {t} 2>/dev/null; then \
tmux -L {srv} kill-session -t {t} 2>/dev/null; echo ended=killed; \
else echo ended=exited; fi\n\
exit 0"
    )
}

/// M17 WP4 — the remote command that makes an explicit close END the remote session (R-1): run
/// after the close's `/exit`, it waits for CC to exit and kills the session if CC did not. Without
/// it, a CC that is busy past the close's 0.5 s `/exit` window keeps running in tmux after the
/// workspace closed, and a respawn's `new -A` under the same name ATTACHES to it.
pub fn tmux_end_session_command(server: &str, session: &str) -> String {
    login_shell(&tmux_end_session_script(server, session, END_POLLS))
}

/// How long [`tmux_prepare_inject_command`] waits for the pane to be ready, in 0.2 s polls (15 s).
pub const READY_POLLS: u32 = 75;

/// The remote command run before EVERY Claudesk-originated injection into a remote pane (M17 WP3
/// P4.2; arch §C.1/§E), in ONE exec:
/// 1. take the pane out of copy-mode, tolerantly (as [`tmux_cancel_copy_mode_command`]).
///    ⚠️ FIRST: in copy-mode `#{bracket_paste_flag}` reads 0, so a scrolled-up but ready pane
///    looked not-ready and was refused (caught live, WP3 P4.2 `live_prepare_inject`);
/// 2. wait (up to `max_polls` × 0.2 s) for the PANE's bracketed-paste mode, `#{bracket_paste_flag}`
///    = 1. tmux forwards a paste envelope intact only then, so a multi-line send is one turn
///    (probed P4.1; ⚠️ the client-side `ESC[?2004h` is NOT a signal: tmux sends it on every
///    attach). It reads a pane MODE flag, never CC's output;
/// 3. cancel copy-mode once more (the operator may have scrolled during the wait), then print
///    `ready=1` or `ready=0` (timed out) and exit 0, so a non-zero exit means ssh failed.
pub fn tmux_prepare_inject_command(server: &str, session: &str, max_polls: u32) -> String {
    login_shell(&format!(
        "t={t}; f=0; i=0\n\
tmux -L {srv} send-keys -t \"$t\" -X cancel 2>/dev/null\n\
while [ \"$i\" -lt {max_polls} ]; do \
f=$(tmux -L {srv} display -p -t \"$t\" '#{{bracket_paste_flag}}' 2>/dev/null); \
[ \"$f\" = 1 ] && break; i=$((i+1)); sleep 0.2; done\n\
tmux -L {srv} send-keys -t \"$t\" -X cancel 2>/dev/null\n\
echo \"ready=$f\"; exit 0",
        t = quote(&format!("={session}:")),
        srv = quote(server),
    ))
}

/// The readiness answer in [`tmux_prepare_inject_command`]'s output: the LAST `ready=` line
/// (rc-file noise before it is ignored). `None` = no answer (the exec did not get that far).
pub fn parse_ready(out: &str) -> Option<bool> {
    out.lines()
        .rev()
        .find_map(|l| l.trim().strip_prefix("ready="))
        .map(|v| v == "1")
}

/// Prefix of every line [`spawn_facts_command`] prints, so rc-file noise is never read as an answer.
pub const SPAWN_SENTINEL: &str = "CLAUDESK-SPAWN:";

/// M17 WP5 (AC-8.2) — the remote spawn's ONE exec, replacing WP4's two sequential ones (realpath,
/// then transcript) and WP5 Phase 1's third (the reconnect's mode read). It prints:
///
/// - `real:<p>` — the PHYSICAL path of `path` (`cd -P` + `pwd -P`), empty when it does not
///   resolve (M17 WP4, AC-3.3: CC reports the physical cwd, so the status registry needs it);
/// - `transcript:yes|no` — whether the remote default config root holds a transcript for the
///   project (M17 WP4, pulled from WP5 5.2): `--continue` with nothing to continue makes CC EXIT.
///   The slug is computed REMOTELY from the physical path (the stored one when it does not
///   resolve) by `sed 's|[/.]|-|g'`, which is `transcript::slug_of_physical`'s rule (tested
///   equal). Not `tr '/.' '--'`: a GNU `tr` reads that `--` as the end of its options;
/// - `mode:<v>` — only when `read_mode` (a reconnect): the live session's stored spawn mode.
///
/// Run by [`login_shell`] (`tmux` is not on the non-login PATH). Read-only, always exits 0. `$p`,
/// `$r`, `$s`, `$d`, `$m` are this script's own variables, never values: the only value is `path`,
/// quoted once into `$p` and quoted again by [`login_shell`]. `find`, not a glob, so the answer
/// never depends on the login shell's glob options.
pub fn spawn_facts_command(server: &str, session: &str, path: &str, read_mode: bool) -> String {
    let mode = if read_mode {
        format!(
            "\nm=$(tmux -L {srv} show-options -qv -t {pane} {opt} 2>/dev/null); \
printf '%s%s\\n' '{S}mode:' \"$m\"",
            S = SPAWN_SENTINEL,
            srv = quote(server),
            pane = quote(&format!("={session}:")),
            opt = quote(MODE_OPTION),
        )
    } else {
        String::new()
    };
    login_shell(&format!(
        "p={p}\n\
r=$(cd -P -- \"$p\" 2>/dev/null && pwd -P); printf '%s%s\\n' '{S}real:' \"$r\"\n\
if [ -n \"$r\" ]; then s=$r; else s=$p; fi; s=$(printf '%s' \"$s\" | sed 's|[/.]|-|g'); \
d=\"$HOME/.claude/projects/$s\"; \
if [ -n \"$(find \"$d\" -maxdepth 1 -name '*.jsonl' 2>/dev/null | head -n 1)\" ]; \
then echo '{S}transcript:yes'; else echo '{S}transcript:no'; fi{mode}",
        S = SPAWN_SENTINEL,
        p = quote(path),
    ))
}

/// What [`spawn_facts_command`] found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpawnFacts {
    /// The alias to register for the row: the physical path when it is a normalized absolute path
    /// that DIFFERS from the stored one, else `None` (no symlink, or no usable answer).
    pub real_alias: Option<String>,
    /// The remote holds a transcript to `--continue`. No answer is `false`: a fresh session is the
    /// safe side, since a wrong `--continue` kills the pane.
    pub has_transcript: bool,
    /// The live session's stored mode (see [`OpenFacts::mode`]); `None` when not read or unknown.
    pub mode: Option<Option<String>>,
}

/// [`spawn_facts_command`]'s answer for a row stored as `stored`. Every fact degrades on its own
/// to its safe side when its line is missing (an ssh failure is `out` = "").
pub fn parse_spawn_facts(out: &str, stored: &str) -> SpawnFacts {
    let mut facts = SpawnFacts {
        real_alias: None,
        has_transcript: false,
        mode: None,
    };
    for line in out.lines() {
        let Some(rest) = line.trim_end_matches('\r').strip_prefix(SPAWN_SENTINEL) else {
            continue;
        };
        if let Some(v) = rest.strip_prefix("real:") {
            facts.real_alias = (is_normalized_remote_path(v) && v != stored).then(|| v.to_string());
        } else if let Some(v) = rest.strip_prefix("transcript:") {
            facts.has_transcript = v == "yes";
        } else if let Some(v) = rest.strip_prefix("mode:") {
            facts.mode = parse_mode_value(v);
        }
    }
    facts
}

/// Prefix of every line the open check prints, so rc-file noise before it is ignored.
pub const OPEN_SENTINEL: &str = "CLAUDESK-OPEN:";

/// The drive modes a session can be spawned under (the closed four; `transitions.md`). A stored
/// [`MODE_OPTION`] outside this set reads as unknown, never as a mode.
const DRIVE_MODES: [&str; 4] = ["stepping", "orchestrated", "autopilot", "fsd"];

/// M17 WP5 — the open check's ONE exec (AC-3.1): does the folder exist, is the workspace's tmux
/// session live, and (if live) which drive mode was it spawned under. Run by [`login_shell`]
/// (`tmux` is not on the non-login PATH). Read-only, and always exits 0, so a non-zero exit means
/// ssh or the shell failed, never an answer. `$m` is this script's own variable, not a value.
///
/// ⚠️ The option read targets `=<session>:` (a PANE target, exact session), NOT `=<session>`:
/// tmux 3.8's option commands refuse the bare `=name` ("no such session"), and `-q` hides that, so
/// the mode silently read as unset (found live at WP5 Phase 1 verify-human). An unqualified name is
/// worse: it prefix-matches (`-t cd-1` can hit `cd-1x`).
///
/// M18 WP4 — `workflow` (gate ON) adds BOTH workflow reads: the remote `.session.md` and the host's
/// substrate ([`SUBSTRATE_PROBE`], with `substrate_home` as the debug sandbox root, D2). With it
/// `false` the command reads neither: a gate-OFF check is byte-identical to before WP4.
pub fn open_check_command(
    server: &str,
    session: &str,
    path: &str,
    workflow: bool,
    substrate_home: Option<&str>,
) -> String {
    let session_md = if workflow {
        format!(
            "\nif [ -f {sm} ]; then echo '{S}session-md:yes'; else echo '{S}session-md:no'; fi\n{probe}",
            S = OPEN_SENTINEL,
            sm = quote(&format!("{path}/workflow-system/state/.session.md")),
            probe = substrate_probe_lines(substrate_home),
        )
    } else {
        String::new()
    };
    login_shell(&format!(
        "if [ -d {p} ]; then echo '{S}dir:yes'; else echo '{S}dir:no'; fi\n\
if tmux -L {srv} has-session -t {exact} 2>/dev/null; then echo '{S}live:yes'; \
m=$(tmux -L {srv} show-options -qv -t {pane} {opt} 2>/dev/null); printf '%s%s\\n' '{S}mode:' \"$m\"; \
else echo '{S}live:no'; fi\n\
r=$(cd -P -- {p} 2>/dev/null && pwd -P); printf '%s%s\\n' '{S}real:' \"$r\"{session_md}\n{TRUSTED_KEYS}\n{BYPASS_ACCEPTED}",
        S = OPEN_SENTINEL,
        p = quote(path),
        srv = quote(server),
        exact = quote(&format!("={session}")),
        pane = quote(&format!("={session}:")),
        opt = quote(MODE_OPTION),
    ))
}

/// Constant fragment (no variable value): print every folder the remote `~/.claude.json` records
/// as TRUSTED (`hasTrustDialogAccepted` a JSON `true`), one `CLAUDESK-OPEN:trusted:<path>` line
/// each. Only the trusted keys cross the link, never the file (it can be megabytes). The match
/// against the project's physical path happens locally, by `folder_trust::trust_covers`, the
/// same walk the local check uses. Any failure (no file, bad JSON, no JSON::PP) prints nothing:
/// untrusted, the safe side (D4).
const TRUSTED_KEYS: &str = "perl -MJSON::PP -e 'open(my $h, q(<), qq($ENV{HOME}/.claude.json)) or exit 0; \
local $/; my $j = eval { JSON::PP->new->decode(<$h>) }; \
exit 0 unless ref $j eq q(HASH) && ref $j->{projects} eq q(HASH); \
for my $k (sort keys %{$j->{projects}}) { my $v = $j->{projects}{$k}; \
next unless ref $v eq q(HASH) && JSON::PP::is_bool($v->{hasTrustDialogAccepted}) && $v->{hasTrustDialogAccepted}; \
next if $k =~ /\\n/; print qq(CLAUDESK-OPEN:trusted:$k\\n) }' 2>/dev/null";

/// M18 WP2 — constant fragment (no variable value): print `CLAUDESK-OPEN:bypass-accepted:yes` when
/// the remote account's `~/.claude/settings.json` has `skipDangerousModePermissionPrompt` as a
/// JSON `true`, i.e. CC will not open a bypass-mode session on its "Bypass Permissions mode"
/// warning (`crate::bypass_prompt`'s probe facts). ⚠️ `~/.claude/settings.json`, INSIDE
/// `~/.claude/`: not the trust record's `~/.claude.json`. Only the one line crosses the link,
/// never the file. Any failure (no file, bad JSON, `false`, the string `"true"`, no JSON::PP)
/// prints nothing: not accepted, the safe side (D4).
const BYPASS_ACCEPTED: &str =
    "perl -MJSON::PP -e 'open(my $h, q(<), qq($ENV{HOME}/.claude/settings.json)) or exit 0; \
local $/; my $j = eval { JSON::PP->new->decode(<$h>) }; \
exit 0 unless ref $j eq q(HASH); my $v = $j->{skipDangerousModePermissionPrompt}; \
print qq(CLAUDESK-OPEN:bypass-accepted:yes\\n) if JSON::PP::is_bool($v) && $v' 2>/dev/null";

/// M18 WP6 — re-read ONLY the bypass answer for a Recycle respawn, which runs no open check
/// (`SURFACE-2026-11-18-QUALITY-REMOTE-BYPASS-ANSWER-STALE-ACROSS-RECYCLE`). The `bypass-probed`
/// marker comes first, so the parser can tell "the host answered: not accepted" from "nothing came
/// back" ([`parse_bypass_refresh`]). Constant text: no value is interpolated.
pub fn bypass_refresh_command() -> String {
    login_shell(&format!(
        "echo '{OPEN_SENTINEL}bypass-probed'\n{BYPASS_ACCEPTED}"
    ))
}

/// [`bypass_refresh_command`]'s output → `Some(accepted)` when the host ran the read, `None` when
/// the marker never came back (the caller then keeps what it had). A read that printed nothing
/// after the marker is `Some(false)`: not accepted, the safe side (D4), as in the open check.
pub fn parse_bypass_refresh(out: &str) -> Option<bool> {
    let mut probed = false;
    let mut accepted = false;
    for line in out.lines() {
        match line.trim().strip_prefix(OPEN_SENTINEL) {
            Some("bypass-probed") => probed = true,
            Some("bypass-accepted:yes") => accepted = true,
            _ => {}
        }
    }
    probed.then_some(accepted)
}

/// M18 WP4 — the HOST-side variable [`SUBSTRATE_PROBE`] reads in place of `$HOME` when set and
/// non-empty. Set only by a debug build's [`substrate_home_override`] (D2), as an env prefix on the
/// probe's one command, never exported, so the rest of the open check still reads the real `$HOME`.
pub const SUBSTRATE_HOME_ENV: &str = "CLAUDESK_SUBSTRATE_HOME";

/// M18 WP4 (D2) — the MAC-side env a DEBUG build reads to point detection (and, from WP6, the
/// install) at a sandbox root on the host instead of the account's `$HOME` (§R.3, §R.8). A release
/// build ignores it entirely.
pub const SUBSTRATE_ROOT_ENV: &str = "CLAUDESK_REMOTE_SUBSTRATE_ROOT";

/// M18 WP4 (§R.2) — constant fragment (no interpolated value): the LOCAL
/// `workflow_substrate::skills_dir_exists`, asked on the host. One `perl` process (already a
/// dependency of [`TRUSTED_KEYS`]). Prints:
/// - `substrate:yes|no`: does an entry under `<H>/.claude/skills/` resolve, through a symlink, into
///   `<repo>/skills/<name>` where `<repo>/install.sh` holds `claude-workflow-system`? `<H>` is
///   [`SUBSTRATE_HOME_ENV`] when set and non-empty, else `$HOME`.
/// - `substrate-root:<repo>`, the resolved repo root, unless it contains a newline (then the root
///   is unknown; `yes` still prints, so the answer keeps parity).
/// - `substrate-head:<sha>`, that repo's HEAD, read from `.git` IN PERL: a ref through the loose
///   file, then `packed-refs`; a detached HEAD as is. ⚠️ Never `git`: on a host whose Command Line
///   Tools are missing, `/usr/bin/git` is the shim that asks for the GUI installer on the host's
///   console (WP3 "Probe outcomes" (5); `SURFACE-2026-11-20-QUALITY-SUBSTRATE-PROBE-RUNS-THE-GIT-SHIM`).
///   A `.git` FILE (a worktree), an unreadable ref, or a non-sha value prints no head.
/// - `record-hex:<hex>`, `<H>/.claudesk/install-record.json` as ONE hex line (a multi-line record
///   survives the line protocol), only when the file opens.
///
/// The installer is read as bytes, as Rust does (P1.4). A missing perl prints nothing, which the
/// caller reads as unknown, never as absent. ⚠️ Held to `skills_dir_exists` by
/// `substrate_probe_agrees_with_skills_dir_exists`: change the two together.
pub const SUBSTRATE_PROBE: &str = r##"perl -MCwd=abs_path -MFile::Basename=dirname -e 'sub rd { open(my $x, "<", $_[0]) or return undef; my $l = <$x>; return undef unless defined $l; chomp $l; $l }
my $h = $ENV{CLAUDESK_SUBSTRATE_HOME} || $ENV{HOME}; my $d = "$h/.claude/skills"; my $root;
if (opendir(my $dh, $d)) { for my $n (readdir $dh) { next if $n eq "." || $n eq "..";
  my $e = "$d/$n"; next unless -l $e; my $t = abs_path($e); next unless defined $t && -e $t;
  my $r = dirname(dirname($t)); open(my $f, "<", "$r/install.sh") or next; binmode $f; local $/; my $b = <$f>;
  if (defined $b && index($b, "claude-workflow-system") >= 0) { $root = $r; last } } }
if (defined $root) { print "CLAUDESK-OPEN:substrate:yes\n";
  if ($root !~ /\n/) { print "CLAUDESK-OPEN:substrate-root:$root\n"; my $g = "$root/.git"; my $s;
    if (-d $g) { my $l = rd("$g/HEAD");
      if (defined $l && $l =~ m{^ref: (refs/\S+)$} && $l !~ /\.\./) { my $f = $1; $s = rd("$g/$f");
        if (!defined $s && open(my $p, "<", "$g/packed-refs")) { while (my $q = <$p>) { if ($q =~ /^([0-9a-f]+) \Q$f\E$/) { $s = $1; last } } } }
      else { $s = $l } }
    print "CLAUDESK-OPEN:substrate-head:$s\n" if defined $s && $s =~ /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/ } }
else { print "CLAUDESK-OPEN:substrate:no\n" }
if (open(my $j, "<", "$h/.claudesk/install-record.json")) { binmode $j; local $/; my $x = <$j>;
  print "CLAUDESK-OPEN:record-hex:", unpack("H*", defined $x ? $x : ""), "\n" }' 2>/dev/null"##;

/// M18 WP4 (D2) — the sandbox root a DEBUG build points detection at, from
/// [`SUBSTRATE_ROOT_ENV`] on the Mac, or `None`. Always `None` in a release build.
pub fn substrate_home_override() -> Option<String> {
    substrate_home_from(
        cfg!(debug_assertions),
        std::env::var(SUBSTRATE_ROOT_ENV).ok(),
    )
}

/// [`substrate_home_override`]'s decision, pure. Only a debug build honours the value, and only an
/// absolute remote path already in normalized form (no `~`, no `..`, no newline): anything else is
/// ignored with a log line, never interpolated.
pub fn substrate_home_from(debug: bool, raw: Option<String>) -> Option<String> {
    if !debug {
        return None;
    }
    let raw = raw.filter(|v| !v.is_empty())?;
    if is_normalized_remote_path(&raw) && !raw.contains('\n') {
        Some(raw)
    } else {
        eprintln!(
            "[claudesk] ignoring {SUBSTRATE_ROOT_ENV}={raw:?}: not an absolute normalized path"
        );
        None
    }
}

/// M18 WP4 — the open check's workflow lines: `substrate-probed` (so the parser can tell "probed,
/// nothing came back" from "not probed"), then [`SUBSTRATE_PROBE`], with the debug sandbox root
/// as an env PREFIX on that one command when given. With `home = None` this is byte-identical in
/// every build.
fn substrate_probe_lines(home: Option<&str>) -> String {
    format!(
        "echo '{OPEN_SENTINEL}substrate-probed'\n{}",
        substrate_probe_invocation(home)
    )
}

/// [`SUBSTRATE_PROBE`] with the debug sandbox root as an env PREFIX on that one command, when given.
fn substrate_probe_invocation(home: Option<&str>) -> String {
    let prefix = home
        .map(|h| format!("{SUBSTRATE_HOME_ENV}={} ", quote(h)))
        .unwrap_or_default();
    format!("{prefix}{SUBSTRATE_PROBE}")
}

/// M18 WP5 (D2) — constant fragment: succeeds only when the host's developer tools carry a real
/// `git` binary (WP3 "Probe outcomes" (5)), leaving its path's directory in `$d`. ⚠️ Every remote
/// `git` call runs behind this. On a Mac without the Command Line Tools, `/usr/bin/git` is the shim
/// that asks for the GUI installer on the host's console. The empty-path test is load-bearing:
/// there `xcode-select -p` prints nothing, and `[ -x "/usr/bin/git" ]` would test the shim and pass.
pub const DEV_TOOLS_GUARD: &str =
    r#"d=$(xcode-select -p 2>/dev/null) && [ -n "$d" ] && [ -x "$d/usr/bin/git" ]"#;

/// M18 WP5 — the plain-words fix for a host without developer tools (§R.6).
pub const DEV_TOOLS_FIX: &str = "run `xcode-select --install` at the host's console";

/// M18 WP5 (§R.4) — Settings → Remote hosts' ONE exec per host: the substrate probe (as the open
/// check runs it, with the same debug sandbox root) and then the drift read, `ls-remote` from the
/// host. Read-only: `ls-remote` writes nothing into the clone (a count would need a `fetch`, §R.4).
///
/// The drift half runs only when the probe printed a root, and prints ONE line:
/// - `drift-remote:<sha>`: the clone's `origin` HEAD on its server (D1: the clone's own `origin`,
///   which is what Update's `pull --ff-only` fetches from);
/// - `drift-error:no-devtools` ([`DEV_TOOLS_GUARD`] failed; no `git` ran at all);
/// - `drift-error:no-origin` (the clone has no `origin` remote);
/// - `drift-error:git:<last line of git's output>`.
///
/// `git` is the developer dir's own binary, never a PATH lookup, and runs non-interactively (no
/// credential prompt, ssh in batch mode, stdin closed): a prompt over a non-tty exec would hang
/// until the exec's timeout. Constant text apart from the sandbox prefix, which is quoted.
pub fn substrate_refresh_command(substrate_home: Option<&str>) -> String {
    login_shell(&substrate_refresh_script(substrate_home))
}

/// [`substrate_refresh_command`]'s script, before the login-shell wrapper (tests run it locally).
pub fn substrate_refresh_script(substrate_home: Option<&str>) -> String {
    // The open check's `substrate-probed` marker, then the probe captured in `$p` so the drift half
    // can read the root it printed: the root is decided ONCE, by the probe, never re-derived here.
    let probe_cmd = substrate_probe_invocation(substrate_home);
    format!(
        "echo '{S}substrate-probed'\n\
p=$({probe_cmd})\n\
printf '%s\\n' \"$p\"\n\
root=$(printf '%s\\n' \"$p\" | sed -n 's/^{S}substrate-root://p')\n\
if [ -n \"$root\" ]; then\n\
if {DEV_TOOLS_GUARD}; then\n\
if \"$d/usr/bin/git\" -C \"$root\" remote get-url origin >/dev/null 2>&1 </dev/null; then\n\
o=$(GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -o BatchMode=yes' \"$d/usr/bin/git\" -C \"$root\" ls-remote origin HEAD 2>&1 </dev/null); rc=$?\n\
r=$(printf '%s\\n' \"$o\" | awk '$2 == \"HEAD\" {{ print $1; exit }}')\n\
if [ \"$rc\" -eq 0 ] && [ -n \"$r\" ]; then printf '%s%s\\n' '{S}drift-remote:' \"$r\"; \
else printf '%s%s\\n' '{S}drift-error:git:' \"$(printf '%s\\n' \"$o\" | tail -n 1)\"; fi\n\
else echo '{S}drift-error:no-origin'; fi\n\
else echo '{S}drift-error:no-devtools'; fi\n\
fi",
        S = OPEN_SENTINEL,
    )
}

/// M18 WP5 — the drift half of a refresh, as the host printed it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DriftLine {
    /// GitHub's (the clone's `origin`'s) HEAD.
    Remote(String),
    /// The host has no developer tools; no `git` ran.
    NoDevTools,
    /// The clone has no `origin` remote.
    NoOrigin,
    /// `git ls-remote` failed (or printed no HEAD): its last output line, possibly empty.
    Git(String),
}

/// M18 WP5 — what one refresh exec found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefreshFacts {
    /// The probe's answer (`Unknown` when no `substrate:` line came back).
    pub substrate: SubstrateRead,
    /// The drift line, when the drift half ran and printed one.
    pub drift: Option<DriftLine>,
}

/// [`substrate_refresh_command`]'s answer, or `None` when not even the `substrate-probed` marker
/// came back (the shell never ran the script).
pub fn parse_refresh(out: &str) -> Option<RefreshFacts> {
    let substrate = parse_substrate(out)?;
    let mut drift = None;
    for line in out.lines() {
        let Some(rest) = line.trim_end_matches('\r').strip_prefix(OPEN_SENTINEL) else {
            continue;
        };
        if let Some(v) = rest.strip_prefix("drift-remote:") {
            drift = Some(if is_sha(v) {
                DriftLine::Remote(v.to_string())
            } else {
                DriftLine::Git(format!("unexpected HEAD {v:?}"))
            });
        } else if rest == "drift-error:no-devtools" {
            drift = Some(DriftLine::NoDevTools);
        } else if rest == "drift-error:no-origin" {
            drift = Some(DriftLine::NoOrigin);
        } else if let Some(v) = rest.strip_prefix("drift-error:git:") {
            drift = Some(DriftLine::Git(v.trim().to_string()));
        }
    }
    Some(RefreshFacts { substrate, drift })
}

/// M18 WP4 — what [`SUBSTRATE_PROBE`] found, when it answered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostProbe {
    /// `substrate:yes`: the workflow system's skills are linked for this account.
    pub present: bool,
    /// The resolved repo root, when it printed one in normalized form.
    pub root: Option<String>,
    /// That repo's HEAD sha, when it could be read from `.git` without `git`.
    pub head: Option<String>,
    /// The raw host install record, decoded from `record-hex`, when the file opened. Parsed by
    /// the caller with the LOCAL provenance parser (`remote_substrate`), never here.
    pub record: Option<Vec<u8>>,
}

/// M18 WP4 — the substrate half of an open check that ran with the workflow lines.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SubstrateRead {
    /// Probed, but no `substrate:` line came back (no perl, a broken read). Fails closed.
    Unknown,
    /// The probe answered.
    Known(HostProbe),
}

/// Lower-case or upper-case hex → bytes, or `None` on an odd length or a non-hex digit.
fn decode_hex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect()
}

/// What the open check found on the remote.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenFacts {
    /// The project folder exists.
    pub folder: bool,
    /// The workspace's tmux session is live.
    pub live: bool,
    /// The live session's spawn mode: `Some(Some(m))` a mode, `Some(None)` spawned with none,
    /// `None` unknown (not live, or a session started before WP5 stored it).
    pub mode: Option<Option<String>>,
    /// The project folder's PHYSICAL path on the remote (`cd -P && pwd -P`), when it resolves.
    pub real: Option<String>,
    /// The remote `workflow-system/state/.session.md` exists. `false` when not checked (gate off).
    pub session_md: bool,
    /// Every folder the remote `~/.claude.json` records as trusted.
    pub trusted_keys: Vec<String>,
    /// M18 WP2: the remote account has accepted CC's bypass-permissions warning
    /// ([`BYPASS_ACCEPTED`]). `false` when no line came back (D4).
    pub bypass_accepted: bool,
    /// M18 WP4: the host's workflow substrate. `None` when not probed (the gate was OFF), so a
    /// gate-OFF check carries no substrate answer at all.
    pub substrate: Option<SubstrateRead>,
}

/// [`open_check_command`]'s answer, or `None` when the folder or liveness line is missing (no
/// answer is never read as "no folder" or "not live").
pub fn parse_open_facts(out: &str) -> Option<OpenFacts> {
    let mut folder = None;
    let mut live = None;
    let mut mode = None;
    let mut real = None;
    let mut session_md = false;
    let mut trusted_keys = Vec::new();
    let mut bypass_accepted = false;
    for line in out.lines() {
        let Some(rest) = line.trim_end_matches('\r').strip_prefix(OPEN_SENTINEL) else {
            continue;
        };
        match rest {
            "dir:yes" => folder = Some(true),
            "dir:no" => folder = Some(false),
            "live:yes" => live = Some(true),
            "live:no" => live = Some(false),
            "session-md:yes" => session_md = true,
            "bypass-accepted:yes" => bypass_accepted = true,
            _ => {
                if let Some(v) = rest.strip_prefix("mode:") {
                    mode = parse_mode_value(v);
                } else if let Some(v) = rest.strip_prefix("real:") {
                    real = is_normalized_remote_path(v).then(|| v.to_string());
                } else if let Some(v) = rest.strip_prefix("trusted:") {
                    trusted_keys.push(v.to_string());
                }
            }
        }
    }
    let live = live?;
    Some(OpenFacts {
        folder: folder?,
        live,
        mode: if live { mode } else { None },
        real,
        session_md,
        trusted_keys,
        bypass_accepted,
        substrate: parse_substrate(out),
    })
}

/// M18 WP4/WP5 — the substrate lines of an open check or a refresh ([`substrate_probe_lines`]):
/// `None` when the output carries no `substrate-probed` line (not probed), `Unknown` when it was
/// probed but no `substrate:` answer came back. One parser for both callers, so the open check and
/// Settings can never read the same probe two ways.
fn parse_substrate(out: &str) -> Option<SubstrateRead> {
    let mut probed = false;
    let mut present = None;
    let mut root = None;
    let mut head = None;
    let mut record = None;
    for line in out.lines() {
        let Some(rest) = line.trim_end_matches('\r').strip_prefix(OPEN_SENTINEL) else {
            continue;
        };
        match rest {
            "substrate-probed" => probed = true,
            "substrate:yes" => present = Some(true),
            "substrate:no" => present = Some(false),
            _ => {
                if let Some(v) = rest.strip_prefix("substrate-root:") {
                    root = is_normalized_remote_path(v).then(|| v.to_string());
                } else if let Some(v) = rest.strip_prefix("substrate-head:") {
                    head = is_sha(v).then(|| v.to_string());
                } else if let Some(v) = rest.strip_prefix("record-hex:") {
                    record = decode_hex(v);
                }
            }
        }
    }
    probed.then_some(match present {
        None => SubstrateRead::Unknown,
        Some(present) => SubstrateRead::Known(HostProbe {
            present,
            root,
            head,
            record,
        }),
    })
}

/// A full git object name: 40 (SHA-1) or 64 (SHA-256) lower-case hex digits.
fn is_sha(v: &str) -> bool {
    matches!(v.len(), 40 | 64) && v.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// A stored [`MODE_OPTION`] value: one of the four → that mode; [`NO_MODE`] → none; anything else
/// (empty = unset, or not a mode) → unknown.
fn parse_mode_value(v: &str) -> Option<Option<String>> {
    if v == NO_MODE {
        Some(None)
    } else if DRIVE_MODES.contains(&v) {
        Some(Some(v.to_string()))
    } else {
        None
    }
}

/// A remote target that passed [`validate_host`] and [`is_normalized_remote_path`] exactly as
/// stored (M17 WP3, the WP2 review's MAJOR). **The only form of a target the spawn and link code
/// accept**, so a raw string read from `projects.json` cannot reach an ssh argv or a tmux `-c`
/// without passing both checks: the fields are private and [`ValidTarget::new`] is the only way
/// to build one.
///
/// Built from a stored row by `config_store::RemoteTarget::validated`. A hand-edited row that
/// fails stays in the list (so the operator can see and remove it) and only refuses to OPEN.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidTarget {
    host: String,
    path: String,
}

impl ValidTarget {
    /// Check `host` and `path` as stored. Neither is repaired: a value that would change under
    /// validation or normalization is refused, because the stored row's key was built from it.
    pub fn new(host: &str, path: &str) -> Result<Self, String> {
        match validate_host(host) {
            Ok(h) if h == host => {}
            Ok(_) => return Err(format!("the host {host:?} has spaces around it")),
            Err(e) => return Err(format!("the host {host:?} is invalid: {e}")),
        }
        if !is_normalized_remote_path(path) {
            let why = match normalize_remote_path(path, "/") {
                Err(e) => e,
                Ok(n) => format!("its normal form is {n:?}"),
            };
            return Err(format!("the remote path {path:?} is invalid: {why}"));
        }
        Ok(Self {
            host: host.to_string(),
            path: path.to_string(),
        })
    }

    /// The ssh destination (validated: no leading `-`, allow-listed characters).
    pub fn host(&self) -> &str {
        &self.host
    }

    /// The absolute, normalized remote path. ⚠️ Still a VARIABLE value: it enters a remote
    /// command only through [`quote`].
    pub fn path(&self) -> &str {
        &self.path
    }
}

// ── M17 WP7 — remote READS (`arch/remote-workspaces.md` §F; `crate::remote_fs`) ──────────────────

/// Prefix of every line the remote-read scripts print, so rc-file noise (`.zshenv`) is never read as
/// an answer.
pub const FS_SENTINEL: &str = "CLAUDESK-FS:";

/// The remote doc-set listing, one constant Perl program (no variable data in it). Its arguments are
/// `N d1..dN r1 r2 …`: N directories relative to each root, then the roots. For every root and
/// directory it prints, per entry that is a FILE (a regular file, or a symlink to one):
///
/// `CLAUDESK-FS:e<TAB>ri<TAB>di<TAB>name<TAB>kind<TAB>size<TAB>mtime_ms`
///
/// `kind` is `f` (lstat: a regular file) or `l` (a symlink whose target is a regular file), so the
/// caller can apply `docs::discover`'s exact rules (a glob matches only `f`; a fixed name matches
/// either). Directories, sockets and broken links are skipped; so is a name holding a tab or a line
/// break (it could not be framed, and no curated doc has one). A missing directory prints nothing.
/// `begin` / `end` lines frame the answer, so an empty listing is told apart from a failed run.
/// Non-recursive by construction (`readdir` of each named directory only), which is what keeps
/// `archive/**` out, as locally. Times are `Time::HiRes` (ms), matching local `mtime_ms`.
pub(crate) const DOC_LIST_PROG: &str = r#"use strict; use warnings; use Time::HiRes qw(stat);
my $n = shift @ARGV; my @d = splice(@ARGV, 0, $n); my @r = @ARGV;
print "CLAUDESK-FS:begin\n";
for my $ri (0 .. $#r) { for my $di (0 .. $#d) {
  my $p = "$r[$ri]/$d[$di]"; opendir(my $h, $p) or next;
  for my $e (sort readdir $h) {
    next if $e eq '.' || $e eq '..' || $e =~ /[\t\r\n]/;
    my $f = "$p/$e"; my $k;
    if (-l $f) { next unless -f $f; $k = 'l' } elsif (-f _) { $k = 'f' } else { next }
    my @s = stat($f) or next;
    printf "CLAUDESK-FS:e\t%d\t%d\t%s\t%s\t%d\t%d\n", $ri, $di, $e, $k, $s[7], int($s[9] * 1000);
  }
  closedir $h;
} }
print "CLAUDESK-FS:end\n";"#;

/// The remote single-file read / stat, one constant Perl program. Arguments: `mode root rel max`
/// with `mode` = `read` or `stat`. ⚠️ CONTAINMENT, parity with local `editor_fs::resolve_in_root`:
/// both `root` and `root/rel` are resolved with `Cwd::realpath` (which follows every symlink,
/// leaf included) ON THE REMOTE, and the target must lie strictly under the resolved root. So a
/// symlink inside the project pointing outside it is refused, as locally. (The caller has already
/// rejected `..`, absolute and empty paths before building this command: `remote_fs::validate_rel`.)
///
/// Prints exactly one status line, `CLAUDESK-FS:<mode>:<status>`:
/// - `missing` / `outside` / `notfile` / `toolarge:<size>` / `notutf8` / `unreadable`;
/// - `stat:ok:<size>:<mtime_ms>`;
/// - `read:ok:<bytes>` FOLLOWED BY the file's raw bytes (validated UTF-8 here, since the local side
///   receives a lossy string and could not tell).
pub(crate) const DOC_READ_PROG: &str = r#"use strict; use warnings; use Cwd qw(realpath); use Time::HiRes qw(stat);
my ($m, $root, $rel, $max) = @ARGV;
sub out { print "CLAUDESK-FS:$m:$_[0]\n"; exit 0 }
my $rr = realpath($root); out('missing') unless defined $rr && -d $rr;
my $t = "$root/$rel"; out('missing') unless -e $t;
my $p = realpath($t); out('missing') unless defined $p;
out('outside') unless index($p, "$rr/") == 0;
out('notfile') unless -f $p;
my @s = stat($p) or out('unreadable');
if ($m eq 'stat') { out(sprintf('ok:%d:%d', $s[7], int($s[9] * 1000))) }
out("toolarge:$s[7]") if $s[7] > $max;
open(my $h, '<:raw', $p) or out('unreadable');
my $c = do { local $/; <$h> }; $c = '' unless defined $c; close $h;
out('toolarge:' . length($c)) if length($c) > $max;
my $u = $c; out('notutf8') unless utf8::decode($u);
print "CLAUDESK-FS:read:ok:" . length($c) . "\n"; print $c; exit 0;"#;

/// The doc-set listing command for `roots` (each a remote absolute project path; VARIABLE values)
/// over the constant `dirs` (relative directories). Runs `perl` under the remote user's ordinary
/// (non-login) shell: one layer, so every argument is [`quote`]d once. Read-only, exits 0.
pub fn doc_list_command(dirs: &[&str], roots: &[&str]) -> String {
    let mut cmd = format!("perl -e {} -- {}", quote(DOC_LIST_PROG), dirs.len());
    for d in dirs {
        cmd.push(' ');
        cmd.push_str(&quote(d));
    }
    for r in roots {
        cmd.push(' ');
        cmd.push_str(&quote(r));
    }
    cmd
}

/// Whether a remote single-file command reads the bytes or only stats them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocReadMode {
    Read,
    Stat,
}

impl DocReadMode {
    fn word(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Stat => "stat",
        }
    }
}

/// The single-file read / stat command for `rel` (already validated by `remote_fs::validate_rel`)
/// under `root`, refusing more than `max` bytes. One layer, every argument [`quote`]d once.
pub fn doc_read_command(mode: DocReadMode, root: &str, rel: &str, max: u64) -> String {
    format!(
        "perl -e {} -- {} {} {} {}",
        quote(DOC_READ_PROG),
        mode.word(),
        quote(root),
        quote(rel),
        max
    )
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::process::Command;

    /// The inputs a remote path or mode string could carry on a hostile or careless day.
    /// `pub(crate)` so the spawn-string test in `cc_session` loops over the SAME set.
    pub(crate) const HOSTILE: &[&str] = &[
        "plain",
        "",
        "with space",
        "it's",
        "'",
        "''",
        "\"double\"",
        "$HOME",
        "${HOME}",
        "`id`",
        "$(id)",
        "a\nb",
        "-rf",
        "--help",
        ";rm -rf x",
        "a && b || c | d > e < f",
        "back\\slash",
        "\\'",
        "*?[]{}~!#",
        "UTF-8: ⏺ ✻ é 日本",
        "\t tab",
    ];

    /// Run `cmd` through `shell -c`, `layers` times nested, the innermost doing
    /// `printf %s <value>` with a canary file the payload might try to create. Returns stdout.
    fn round_trip(
        shell: &str,
        value: &str,
        layers: usize,
        canary_dir: &std::path::Path,
    ) -> Vec<u8> {
        // The innermost command: print the value, quoted once for its own shell.
        let mut script = format!(
            "cd {} && printf %s {}",
            quote(&canary_dir.to_string_lossy()),
            quote(value)
        );
        // Wrap it in (layers - 1) more `shell -c` levels, each quoting the script once more.
        for _ in 1..layers {
            script = format!("{shell} -c {}", quote(&script));
        }
        let out = Command::new(shell)
            .arg("-c")
            .arg(&script)
            .env_remove("ENV")
            .env_remove("BASH_ENV")
            .output()
            .expect("spawn shell");
        assert!(
            out.status.success(),
            "{shell} x{layers} failed for {value:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        out.stdout
    }

    #[test]
    fn quote_round_trips_hostile_values_byte_exact_through_nested_real_shells() {
        let canary = tempfile::TempDir::new().unwrap();
        for shell in ["/bin/sh", "/bin/zsh", "/bin/bash"] {
            for layers in 1..=3 {
                for value in HOSTILE {
                    let got = round_trip(shell, value, layers, canary.path());
                    assert_eq!(
                        got,
                        value.as_bytes(),
                        "{shell} x{layers}: {value:?} did not survive byte-exact"
                    );
                }
            }
        }
        // `;rm -rf x`, `$(id)`, `> e` … must never have RUN: nothing may have been created.
        let left: Vec<_> = std::fs::read_dir(canary.path()).unwrap().collect();
        assert!(left.is_empty(), "a payload executed and created {left:?}");
    }

    #[test]
    fn a_command_substitution_payload_does_not_execute() {
        // Positive control for the canary: an UNQUOTED payload does create the file.
        let canary = tempfile::TempDir::new().unwrap();
        let file = canary.path().join("pwned");
        let payload = format!("$(touch {})", file.display());
        let unquoted = Command::new("/bin/sh")
            .arg("-c")
            .arg(format!("printf %s {payload}"))
            .output()
            .unwrap();
        assert!(unquoted.status.success());
        assert!(file.exists(), "premise: the unquoted payload runs");
        std::fs::remove_file(&file).unwrap();

        let quoted = Command::new("/bin/sh")
            .arg("-c")
            .arg(format!("printf %s {}", quote(&payload)))
            .output()
            .unwrap();
        assert_eq!(quoted.stdout, payload.as_bytes());
        assert!(!file.exists(), "the quoted payload must not run");
    }

    #[test]
    fn quote_shape() {
        assert_eq!(quote(""), "''");
        assert_eq!(quote("a b"), "'a b'");
        assert_eq!(quote("it's"), "'it'\\''s'");
    }

    #[test]
    fn the_preflight_script_carries_the_path_quoted_and_the_token_only_as_a_remote_expansion() {
        let hostile = "/tmp/x'; touch /tmp/pwned; echo '";
        let s = preflight_script(hostile);
        assert!(s.starts_with(&format!("p={}\n", quote(hostile))), "{s}");
        // The token's expansion is in the constant, literally; no token VALUE can be here.
        assert!(s.contains("\"$(cat ~/.claudesk/cc-oauth-token)\""));
        // The whole thing as the remote login shell receives it.
        let wrapped = login_shell(&s);
        assert!(wrapped.starts_with("zsh -lc '"));
    }

    /// Run the real preflight script locally under `zsh -c` (as `zsh -lc` would remotely) with a
    /// hostile path, and check the protocol it prints. Proves the script parses in zsh and that
    /// the path is a VALUE, not code. (The tools/token/auth lines depend on this machine, so only
    /// the path check's outcome is asserted.)
    #[test]
    fn the_preflight_script_runs_in_real_zsh_and_treats_a_hostile_path_as_data() {
        let canary = tempfile::TempDir::new().unwrap();
        let pwned = canary.path().join("pwned");
        // A directory whose NAME is a payload: it exists, so the path check must pass on it.
        // Relative payloads (a dir name cannot hold `/`); zsh runs with the canary as its cwd.
        let evil_dir = canary
            .path()
            .join("d'; touch pwned; echo '$(touch pwned)`touch pwned`");
        std::fs::create_dir(&evil_dir).unwrap();
        // Replace the tools loop's binaries with ones guaranteed present, so the path check runs.
        let script =
            preflight_script(&evil_dir.to_string_lossy()).replace("tmux claude perl", "sh ls cat");
        let out = Command::new("/bin/zsh")
            .arg("-c")
            .arg(&script)
            .current_dir(canary.path())
            .output()
            .unwrap();
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(out.status.success(), "{stdout}");
        assert!(stdout.contains("ok:tools\nok:path\n"), "{stdout}");
        assert!(!pwned.exists(), "the path executed as code");

        // And a missing path fails the path check (not the shell).
        let missing = preflight_script(&canary.path().join("nope").to_string_lossy())
            .replace("tmux claude perl", "sh ls cat");
        let out = Command::new("/bin/zsh")
            .arg("-c")
            .arg(&missing)
            .output()
            .unwrap();
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(stdout.ends_with("ok:tools\nfail:path\n"), "{stdout}");
    }

    /// M18 WP2 — the real preflight script in real zsh, with `claude` only at `$HOME/.local/bin` and
    /// NOT on PATH: the tools check passes (and so does the auth check's `claude`, which runs later
    /// in the same script). With `claude` in neither place, the tools check fails on `claude`.
    /// (`tmux` and `perl` are swapped for `sh` and `cat`: this machine need not have tmux.)
    #[test]
    fn the_preflight_finds_claude_in_local_bin_when_the_login_path_lacks_it() {
        use std::os::unix::fs::PermissionsExt;
        let home = tempfile::TempDir::new().unwrap();
        let proj = home.path().join("proj");
        std::fs::create_dir_all(&proj).unwrap();
        let local_bin = home.path().join(".local/bin");
        std::fs::create_dir_all(&local_bin).unwrap();
        let fake = local_bin.join("claude");
        // A fake `claude` that answers the auth check as logged in.
        std::fs::write(&fake, "#!/bin/sh\nprintf '{\"loggedIn\": true}'\n").unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::create_dir_all(home.path().join(".claudesk")).unwrap();
        std::fs::write(home.path().join(".claudesk/cc-oauth-token"), "tok").unwrap();
        let run = || {
            let script = preflight_script(&proj.to_string_lossy())
                .replace("tmux claude perl", "sh claude cat");
            let out = Command::new("/bin/zsh")
                .arg("-c")
                .arg(&script)
                .env("HOME", home.path())
                .env("PATH", "/usr/bin:/bin")
                .output()
                .unwrap();
            String::from_utf8_lossy(&out.stdout).into_owned()
        };
        // M18 WP6: the script names where claude resolved (the fallback's `~/.local/bin`),
        // which a token failure's fix then uses.
        assert_eq!(
            run(),
            format!(
                "claude-at:{}\nok:tools\nok:path\nok:token\nok:auth\n",
                fake.display()
            )
        );
        std::fs::remove_file(&fake).unwrap();
        assert_eq!(run(), "fail:tools:claude\n");
    }

    /// The fallback is one constant fragment, used ahead of the FIRST `claude` in each script.
    #[test]
    fn the_path_fallback_precedes_every_claude_use() {
        assert!(!CLAUDE_PATH_FALLBACK.contains('{'), "no variable value");
        let pre = preflight_script("/p");
        let at = pre
            .find(CLAUDE_PATH_FALLBACK)
            .expect("preflight has the fallback");
        assert!(at < pre.find("for t in").unwrap());
        assert!(at < pre.find("claude auth status").unwrap());
        let launcher = crate::remote_link::cc_launcher();
        let at = launcher
            .find(CLAUDE_PATH_FALLBACK)
            .expect("cc-launch has the fallback");
        assert!(at < launcher.find("exec claude").unwrap());
    }

    #[test]
    fn validate_host_accepts_real_destinations() {
        for ok in [
            "mini",
            "user@mini-host",
            "user@host.tail0000.ts.net",
            "10.0.0.5",
            "user@[fe80::1%en0]",
            "  padded  ",
        ] {
            assert!(validate_host(ok).is_ok(), "{ok:?} should be accepted");
        }
        assert_eq!(validate_host("  padded  ").unwrap(), "padded");
    }

    #[test]
    fn validate_host_refuses_options_and_shell_shapes() {
        assert_eq!(validate_host(""), Err(HostError::Empty));
        assert_eq!(validate_host("   "), Err(HostError::Empty));
        assert_eq!(
            validate_host("-oProxyCommand=touch /tmp/x"),
            Err(HostError::LeadingDash)
        );
        assert_eq!(validate_host("-p22"), Err(HostError::LeadingDash));
        for bad in [
            "a b", "a\nb", "a\tb", "ssh://h", "h;id", "h$(id)", "h`id`", "h'x", "h\"x", "h/x",
            "h|x",
        ] {
            assert!(
                matches!(validate_host(bad), Err(HostError::BadChar(_))),
                "{bad:?} must be refused"
            );
        }
    }

    #[test]
    fn normalize_remote_path_expands_tilde_and_requires_absolute() {
        let home = "/Users/u";
        assert_eq!(normalize_remote_path("~", home).unwrap(), "/Users/u");
        assert_eq!(
            normalize_remote_path("~/p/q", home).unwrap(),
            "/Users/u/p/q"
        );
        assert_eq!(
            normalize_remote_path("~/p", "/Users/u/").unwrap(),
            "/Users/u/p"
        );
        assert_eq!(normalize_remote_path("/a/b/", home).unwrap(), "/a/b");
        assert_eq!(normalize_remote_path("/", home).unwrap(), "/");
        assert_eq!(normalize_remote_path("  /a  ", home).unwrap(), "/a");
        assert!(normalize_remote_path("rel/p", home).is_err());
        assert!(normalize_remote_path("~other/p", home).is_err());
        assert!(normalize_remote_path("", home).is_err());
        assert!(normalize_remote_path("/a\nb", home).is_err());
    }

    #[test]
    fn normalize_remote_path_gives_every_spelling_of_one_folder_one_form() {
        let home = "/Users/u";
        for (typed, want) in [
            ("/a//b", "/a/b"),
            ("/a/./b/", "/a/b"),
            ("//a///b//", "/a/b"),
            ("/./", "/"),
            ("~/x//y", "/Users/u/x/y"),
            ("~/./x", "/Users/u/x"),
            ("/a/.hidden/b", "/a/.hidden/b"),
            ("/a/b.", "/a/b."),
            ("/with space/ok", "/with space/ok"),
        ] {
            assert_eq!(
                normalize_remote_path(typed, home).as_deref(),
                Ok(want),
                "{typed:?}"
            );
        }
    }

    #[test]
    fn normalize_remote_path_refuses_a_dot_dot_segment_rather_than_resolving_it() {
        for typed in ["/a/../b", "/..", "~/../x", "/a/b/..", "/a/b/../"] {
            let err = normalize_remote_path(typed, "/Users/u").expect_err(typed);
            assert!(err.contains(".."), "{typed:?}: {err}");
        }
        // `..` only as a whole segment: these are ordinary names.
        assert_eq!(
            normalize_remote_path("/a/..b", "/").as_deref(),
            Ok("/a/..b")
        );
        assert_eq!(
            normalize_remote_path("/a/b..", "/").as_deref(),
            Ok("/a/b..")
        );
    }

    #[test]
    fn a_valid_target_is_built_only_from_a_host_and_path_that_need_no_repair() {
        let ok = ValidTarget::new("me@mini.example", "/Users/me/p").expect("valid");
        assert_eq!((ok.host(), ok.path()), ("me@mini.example", "/Users/me/p"));
        for (host, path) in [
            ("-oProxyCommand=touch /tmp/x", "/a"),
            ("a b", "/a"),
            (" me@mini", "/a"),
            ("me@mini ", "/a"),
            ("", "/a"),
            ("me@mini", "rel"),
            ("me@mini", "/a/"),
            ("me@mini", "/a//b"),
            ("me@mini", "/a/./b"),
            ("me@mini", "/a/../b"),
            ("me@mini", "~/a"),
            ("me@mini", "/a\nb"),
        ] {
            let err = ValidTarget::new(host, path).expect_err(&format!("{host:?} {path:?}"));
            assert!(!err.is_empty());
        }
    }

    #[test]
    fn normalize_remote_path_is_idempotent_and_its_output_passes_the_store_check() {
        for typed in ["~", "~/p", "/a//b/./c/", "/", "/x y/z", "/a/.b"] {
            let once = normalize_remote_path(typed, "/Users/u").unwrap();
            assert_eq!(
                normalize_remote_path(&once, "/Users/u").as_deref(),
                Ok(once.as_str())
            );
            assert!(is_normalized_remote_path(&once), "{once:?}");
        }
        for not_normal in [
            "/a/", "/a//b", "/a/./b", "/a/../b", "a/b", "", "~/a", " /a", "/a\tb",
        ] {
            assert!(!is_normalized_remote_path(not_normal), "{not_normal:?}");
        }
    }

    #[test]
    fn the_folder_check_and_the_copy_mode_cancel_treat_their_values_as_data() {
        let dir = tempfile::TempDir::new().unwrap();
        let canary = dir.path().join("CANARY");
        let touch = format!("touch {}", canary.display());
        // The open check answers yes / no for a hostile but real folder name.
        let hostile = dir.path().join(format!("it's $({touch}) `x`"));
        std::fs::create_dir_all(&hostile).unwrap();
        let folder = |p: &str| {
            parse_open_facts(&run_with_fake_tmux(
                &open_check_command("claudesk-dev", "cd-1", p, false, None),
                false,
                None,
            ))
            .map(|f| f.folder)
        };
        assert_eq!(folder(hostile.to_str().unwrap()), Some(true));
        assert_eq!(
            folder(dir.path().join("gone; touch x").to_str().unwrap()),
            Some(false)
        );
        let run = |cmd: &str| {
            let o = Command::new("/bin/zsh")
                .arg("-fc")
                .arg(cmd)
                .output()
                .unwrap();
            (
                o.status.code(),
                String::from_utf8_lossy(&o.stdout).trim().to_string(),
            )
        };
        // The cancel: with no tmux server at all it still exits 0 (a pane not in a mode, or no
        // pane, is not a failure of the close), and a hostile session name never executes.
        let cancel =
            tmux_cancel_copy_mode_command("claudesk-test-none", &format!("x'; {touch}; '"));
        assert!(cancel.starts_with("zsh -lc '"));
        let (code, _) = run(&cancel.replacen("zsh -lc ", "/bin/zsh -fc ", 1));
        assert_eq!(code, Some(0));
        assert!(!canary.exists(), "a hostile value executed");
    }

    #[test]
    fn tmux_names_are_stable_and_split_dev_from_prod() {
        assert_eq!(tmux_server("com.claudesk.app"), "claudesk");
        assert_eq!(tmux_server("com.claudesk.app.dev"), "claudesk-dev");
        assert_eq!(tmux_session("abc"), "cd-ba7816bf");
        assert_eq!(hash8("abc"), "ba7816bf");
    }

    /// Run `tmux_prepare_inject_command` in real zsh against a fake `tmux` that answers
    /// `bracket_paste_flag` from a file (`0` / `1`) and logs every `send-keys`.
    fn run_prepare(
        flag: &str,
        max_polls: u32,
        session: &str,
    ) -> (String, String, std::time::Duration) {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::TempDir::new().unwrap();
        let bin = dir.path().join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(dir.path().join("flag"), flag).unwrap();
        let tmux = bin.join("tmux");
        std::fs::write(
            &tmux,
            format!(
                "#!/bin/sh\nd={d}\ncase \"$*\" in\n*display*) cat \"$d/flag\" ;;\n\
                 *send-keys*) printf '%s\\n' \"$*\" >> \"$d/log\" ;;\nesac\n",
                d = dir.path().display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&tmux, std::fs::Permissions::from_mode(0o755)).unwrap();
        let cmd = tmux_prepare_inject_command("claudesk-dev", session, max_polls).replacen(
            "zsh -lc ",
            "/bin/zsh -fc ",
            1,
        );
        let t0 = std::time::Instant::now();
        let out = Command::new("/bin/sh")
            .arg("-c")
            .arg(&cmd)
            .env("PATH", format!("{}:/usr/bin:/bin", bin.display()))
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        let log = std::fs::read_to_string(dir.path().join("log")).unwrap_or_default();
        (
            String::from_utf8_lossy(&out.stdout).into_owned(),
            log,
            t0.elapsed(),
        )
    }

    #[test]
    fn prepare_inject_waits_for_the_panes_paste_mode_then_cancels_copy_mode() {
        // Ready at once: `ready=1`, no waiting, and the copy-mode cancel targets the session.
        let (out, log, took) = run_prepare("1", 75, "cd-12345678");
        assert_eq!(parse_ready(&out), Some(true), "{out}");
        assert!(took < std::time::Duration::from_secs(2), "{took:?}");
        // Cancel BEFORE the poll (copy-mode hides the flag) and again just before answering.
        assert_eq!(
            log.lines().collect::<Vec<_>>(),
            ["-L claudesk-dev send-keys -t =cd-12345678: -X cancel"; 2]
        );
        // Never ready: `ready=0` after the bound (3 polls ≈ 0.6 s), and still cancels.
        let (out, log, took) = run_prepare("0", 3, "cd-12345678");
        assert_eq!(parse_ready(&out), Some(false), "{out}");
        assert!(took >= std::time::Duration::from_millis(500), "{took:?}");
        assert!(log.contains("-X cancel"));
    }

    #[test]
    fn prepare_inject_treats_a_hostile_session_name_as_data() {
        let dir = tempfile::TempDir::new().unwrap();
        let canary = dir.path().join("CANARY");
        for v in HOSTILE
            .iter()
            .map(|v| v.to_string())
            .chain([format!("x'; touch {}; '", canary.display())])
        {
            let (out, log, _) = run_prepare("1", 2, &v);
            assert_eq!(parse_ready(&out), Some(true), "{v:?}: {out}");
            assert!(log.contains(&format!("={v}:")), "{v:?}: {log}");
        }
        assert!(!canary.exists());
    }

    #[test]
    fn parse_ready_reads_the_last_answer_and_ignores_noise() {
        assert_eq!(parse_ready("ready=1\n"), Some(true));
        assert_eq!(parse_ready("Welcome!\nready=0\n"), Some(false));
        assert_eq!(parse_ready("ready=0\nready=1"), Some(true));
        assert_eq!(parse_ready("ready=\n"), Some(false));
        assert_eq!(parse_ready("nothing"), None);
        assert_eq!(parse_ready(""), None);
    }

    /// Run `tmux_attach_command` through real `/bin/sh` → `/bin/zsh -fc` with a fake `tmux` that
    /// records its argv NUL-separated, and return that argv.
    fn run_attach(session: &str) -> Vec<String> {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::TempDir::new().unwrap();
        let bin = dir.path().join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let tmux = bin.join("tmux");
        std::fs::write(
            &tmux,
            format!(
                "#!/bin/sh\nfor a in \"$@\"; do printf '%s\\0' \"$a\"; done > {d}/argv\n",
                d = dir.path().display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&tmux, std::fs::Permissions::from_mode(0o755)).unwrap();
        let cmd =
            tmux_attach_command("claudesk-dev", session).replacen("zsh -lc ", "/bin/zsh -fc ", 1);
        let out = Command::new("/bin/sh")
            .arg("-c")
            .arg(&cmd)
            .env("PATH", format!("{}:/usr/bin:/bin", bin.display()))
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        let raw = std::fs::read(dir.path().join("argv")).unwrap();
        raw.split(|b| *b == 0)
            .filter(|p| !p.is_empty())
            .map(|p| String::from_utf8_lossy(p).into_owned())
            .collect()
    }

    #[test]
    fn the_reconnect_attaches_exactly_and_never_creates_a_session() {
        // Phase 5: a session that died while the link was down must never be silently restarted.
        let cmd = tmux_attach_command("claudesk-dev", "cd-1234abcd");
        assert!(cmd.contains("attach -t"), "{cmd}");
        assert!(
            !cmd.contains("new"),
            "a reconnect must never create a session: {cmd}"
        );
        assert_eq!(
            run_attach("cd-1234abcd"),
            ["-L", "claudesk-dev", "attach", "-t", "=cd-1234abcd"]
        );
    }

    /// Run a remote command locally (`zsh -lc` → `/bin/zsh -fc`) with a fake `tmux` whose
    /// `has-session` answers `live` and whose `show-options` prints `mode` (`None`: prints nothing,
    /// an unset option).
    fn run_with_fake_tmux(cmd: &str, live: bool, mode: Option<&str>) -> String {
        let home = tempfile::TempDir::new().unwrap();
        run_with_fake_tmux_home(cmd, live, mode, home.path())
    }

    /// [`run_with_fake_tmux`] with `$HOME` set to `home` (the remote `~/.claude.json` lives there).
    fn run_with_fake_tmux_home(
        cmd: &str,
        live: bool,
        mode: Option<&str>,
        home: &std::path::Path,
    ) -> String {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::TempDir::new().unwrap();
        let bin = dir.path().join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let tmux = bin.join("tmux");
        std::fs::write(
            &tmux,
            format!(
                // Like real tmux 3.8, an option command refuses a target that is not a pane-style
                // `=<session>:` ("no such session: =x"); the open check's read must use that form.
                "#!/bin/sh\nt=\"\"; prev=\"\"; for a in \"$@\"; do [ \"$prev\" = -t ] && t=\"$a\"; prev=\"$a\"; done\n\
                 case \" $* \" in\n *\" has-session \"*) exit {rc};;\n *\" show-options \"*) case \"$t\" in =*:) {show};; *) echo \"no such session: $t\" >&2; exit 1;; esac;;\nesac\nexit 0\n",
                rc = if live { 0 } else { 1 },
                show = match mode {
                    Some(m) => format!("printf '%s\\n' {}", quote(m)),
                    None => "exit 0".into(),
                },
            ),
        )
        .unwrap();
        std::fs::set_permissions(&tmux, std::fs::Permissions::from_mode(0o755)).unwrap();
        let out = Command::new("/bin/sh")
            .arg("-c")
            .arg(cmd.replacen("zsh -lc ", "/bin/zsh -fc ", 1))
            .env("PATH", format!("{}:/usr/bin:/bin", bin.display()))
            .env("HOME", home)
            .output()
            .unwrap();
        assert!(out.status.success(), "always exits 0");
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    #[test]
    fn the_open_check_reports_the_folder_the_live_session_and_its_mode_in_one_exec() {
        let dir = tempfile::TempDir::new().unwrap();
        let here = dir.path().to_str().unwrap();
        let check = |path: &str, live: bool, mode: Option<&str>| {
            parse_open_facts(&run_with_fake_tmux(
                &open_check_command("claudesk-dev", "cd-1234abcd", path, false, None),
                live,
                mode,
            ))
        };
        let key = |f: Option<OpenFacts>| f.map(|f| (f.folder, f.live, f.mode));
        assert_eq!(
            key(check(here, true, Some("autopilot"))),
            Some((true, true, Some(Some("autopilot".into()))))
        );
        assert_eq!(
            key(check(here, true, Some(NO_MODE))),
            Some((true, true, Some(None)))
        );
        // An unset option (a session started before WP5) or a value outside the four: unknown.
        assert_eq!(check(here, true, None).unwrap().mode, None);
        assert_eq!(check(here, true, Some("$(evil)")).unwrap().mode, None);
        // Not live: no mode, whatever tmux would say.
        assert_eq!(
            key(check(here, false, Some("fsd"))),
            Some((true, false, None))
        );
        assert!(!check("/nonexistent/x", false, None).unwrap().folder);
    }

    /// M17 WP5 Phase 2 (AC-3.1, 3.3): the same exec reports the folder's PHYSICAL path, the remote
    /// `.session.md` (only when asked: a gate-OFF open stats nothing in the project), and the
    /// folders the remote `~/.claude.json` trusts (only those keys, never the file).
    #[test]
    fn the_open_check_reports_the_resume_signals_of_a_dead_session() {
        let home = tempfile::TempDir::new().unwrap();
        let root = home.path().canonicalize().unwrap();
        let real = root.join("real proj");
        std::fs::create_dir_all(real.join("workflow-system/state")).unwrap();
        let link = root.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let real_s = real.to_str().unwrap().to_string();
        std::fs::write(
            root.join(".claude.json"),
            format!(
                r#"{{"numStartups": 9, "projects": {{
                    {real:?}: {{"hasTrustDialogAccepted": true}},
                    "/untrusted": {{"hasTrustDialogAccepted": false}},
                    "/stringy": {{"hasTrustDialogAccepted": "true"}},
                    "/odd": 3
                }}}}"#,
                real = real_s
            ),
        )
        .unwrap();
        let facts = |path: &str, check: bool| {
            parse_open_facts(&run_with_fake_tmux_home(
                &open_check_command("claudesk-dev", "cd-1", path, check, None),
                false,
                None,
                &root,
            ))
            .unwrap()
        };
        let f = facts(link.to_str().unwrap(), true);
        assert_eq!(
            f.real.as_deref(),
            Some(real_s.as_str()),
            "the physical path"
        );
        assert!(!f.session_md, "no pointer yet");
        // Only the JSON-true entry; a "true" string, a false and a non-object are not trust.
        assert_eq!(f.trusted_keys, vec![real_s.clone()]);
        std::fs::write(real.join("workflow-system/state/.session.md"), "---\n").unwrap();
        assert!(facts(link.to_str().unwrap(), true).session_md);
        assert!(
            !facts(link.to_str().unwrap(), false).session_md,
            "gate OFF: not checked"
        );
        // A missing folder has no physical path; a malformed record trusts nothing.
        assert_eq!(facts("/nonexistent/x", true).real, None);
        std::fs::write(root.join(".claude.json"), "{not json").unwrap();
        assert!(facts(link.to_str().unwrap(), true).trusted_keys.is_empty());
    }

    /// M18 WP4 — gate OFF reads nothing of the workflow system: no probe, no record, no sandbox
    /// variable, not even with a sandbox root given. Gate ON carries the constant VERBATIM.
    #[test]
    fn the_open_check_probes_the_substrate_only_with_the_gate_on() {
        let off = open_check_command("claudesk-dev", "cd-1", "/p", false, Some("/sandbox"));
        for absent in [
            "substrate",
            "install-record",
            SUBSTRATE_HOME_ENV,
            "session-md",
        ] {
            assert!(!off.contains(absent), "gate OFF carries {absent:?}: {off}");
        }
        // The constant crosses one `login_shell` quoting layer; compare in the same layer.
        let on = open_check_command("claudesk-dev", "cd-1", "/p", true, None);
        let quoted_probe = quote(SUBSTRATE_PROBE);
        let inner = &quoted_probe[1..quoted_probe.len() - 1];
        assert!(
            on.contains(inner),
            "gate ON carries SUBSTRATE_PROBE verbatim"
        );
        // (The constant itself NAMES the variable; only an assignment would set it.)
        let assign = format!("{SUBSTRATE_HOME_ENV}=");
        assert!(!on.contains(&assign), "no sandbox root, no assignment");
        let with = open_check_command("claudesk-dev", "cd-1", "/p", true, Some("/sb"));
        assert!(
            with.contains(&assign),
            "a sandbox root is passed as an env prefix"
        );
    }

    /// D2 — a release build ignores the Mac-side root entirely, and a debug build honours only an
    /// absolute normalized path. With no root the command is the same bytes in every build.
    #[test]
    fn the_sandbox_root_is_debug_only_and_never_interpolated_unvalidated() {
        assert_eq!(
            substrate_home_from(false, Some("/Users/me/sb".into())),
            None
        );
        assert_eq!(
            substrate_home_from(true, Some("/Users/me/sb".into())).as_deref(),
            Some("/Users/me/sb")
        );
        for bad in ["", "rel/x", "~/sb", "/a/../b", "/a/", "/a\nb", "/a//b"] {
            assert_eq!(substrate_home_from(true, Some(bad.into())), None, "{bad:?}");
        }
        assert_eq!(substrate_home_from(true, None), None);
        let none = open_check_command("s", "cd-1", "/p", true, None);
        let ignored = open_check_command(
            "s",
            "cd-1",
            "/p",
            true,
            substrate_home_from(false, Some("/Users/me/sb".into())).as_deref(),
        );
        assert_eq!(none, ignored, "a release build's command is byte-identical");
    }

    /// M18 WP4 — the whole open check, end to end under a fake tmux: the substrate is reported
    /// from `$HOME`, or from the debug sandbox root when one is given; a gate-OFF check reports
    /// no substrate at all.
    #[test]
    fn the_open_check_reports_the_hosts_substrate_and_honours_the_sandbox_root() {
        let home = tempfile::TempDir::new().unwrap();
        let root = home.path().canonicalize().unwrap();
        let proj = root.join("proj");
        std::fs::create_dir_all(&proj).unwrap();
        let repo = root.join("repo");
        std::fs::create_dir_all(repo.join("skills/feature-build")).unwrap();
        std::fs::write(repo.join("install.sh"), "# claude-workflow-system\n").unwrap();
        std::fs::create_dir_all(root.join(".claude/skills")).unwrap();
        std::os::unix::fs::symlink(
            repo.join("skills/feature-build"),
            root.join(".claude/skills/feature-build"),
        )
        .unwrap();
        let sandbox = root.join("sandbox");
        std::fs::create_dir_all(&sandbox).unwrap();
        let facts = |workflow: bool, home_override: Option<&str>| {
            parse_open_facts(&run_with_fake_tmux_home(
                &open_check_command(
                    "claudesk-dev",
                    "cd-1",
                    proj.to_str().unwrap(),
                    workflow,
                    home_override,
                ),
                false,
                None,
                &root,
            ))
            .unwrap()
            .substrate
        };
        assert_eq!(facts(false, None), None, "gate OFF: not probed");
        assert_eq!(
            facts(true, None),
            Some(SubstrateRead::Known(HostProbe {
                present: true,
                root: Some(repo.to_str().unwrap().to_string()),
                head: None,
                record: None,
            }))
        );
        assert_eq!(
            facts(true, Some(sandbox.to_str().unwrap())),
            Some(SubstrateRead::Known(HostProbe {
                present: false,
                root: None,
                head: None,
                record: None,
            })),
            "the empty sandbox root is read instead of $HOME"
        );
    }

    /// The parse: probed + no answer → Unknown; each line read into its field; a bad root, head or
    /// hex is dropped (never a guess); without the probed marker there is no substrate.
    #[test]
    fn the_substrate_lines_parse_and_fail_closed() {
        let s = OPEN_SENTINEL;
        let base = format!("{s}dir:yes\n{s}live:no\n");
        assert_eq!(parse_open_facts(&base).unwrap().substrate, None);
        assert_eq!(
            parse_open_facts(&format!("{base}{s}substrate-probed\n"))
                .unwrap()
                .substrate,
            Some(SubstrateRead::Unknown),
            "probed, no answer: unknown, never absent"
        );
        let sha = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(
            parse_open_facts(&format!(
                "{base}{s}substrate-probed\n{s}substrate:yes\n{s}substrate-root:/r/x\n\
                 {s}substrate-head:{sha}\n{s}record-hex:7b2278223a317d0a\n"
            ))
            .unwrap()
            .substrate,
            Some(SubstrateRead::Known(HostProbe {
                present: true,
                root: Some("/r/x".into()),
                head: Some(sha.into()),
                record: Some(b"{\"x\":1}\n".to_vec()),
            }))
        );
        let bad = parse_open_facts(&format!(
            "{base}{s}substrate-probed\n{s}substrate:yes\n{s}substrate-root:rel/x\n\
             {s}substrate-head:HEAD\n{s}record-hex:7b2\n"
        ))
        .unwrap()
        .substrate;
        assert_eq!(
            bad,
            Some(SubstrateRead::Known(HostProbe {
                present: true,
                root: None,
                head: None,
                record: None,
            }))
        );
        assert_eq!(decode_hex("zz"), None);
        assert_eq!(decode_hex("").as_deref(), Some(&b""[..]));
    }

    /// M18 WP2: the same exec says whether the remote account accepted CC's bypass warning, from
    /// `~/.claude/settings.json` (INSIDE `~/.claude/`), and only a JSON `true` counts (probe fact 2).
    #[test]
    fn the_open_check_reports_the_bypass_acceptance_from_settings_json() {
        let home = tempfile::TempDir::new().unwrap();
        let root = home.path().canonicalize().unwrap();
        let proj = root.join("proj");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::create_dir_all(root.join(".claude")).unwrap();
        let accepted = |settings: Option<&str>| {
            let file = root.join(".claude/settings.json");
            match settings {
                Some(text) => std::fs::write(&file, text).unwrap(),
                None => {
                    let _ = std::fs::remove_file(&file);
                }
            }
            parse_open_facts(&run_with_fake_tmux_home(
                &open_check_command("claudesk-dev", "cd-1", proj.to_str().unwrap(), false, None),
                false,
                None,
                &root,
            ))
            .unwrap()
            .bypass_accepted
        };
        assert!(accepted(Some(
            r#"{"theme": "dark", "skipDangerousModePermissionPrompt": true}"#
        )));
        for text in [
            r#"{"skipDangerousModePermissionPrompt": false}"#,
            r#"{"skipDangerousModePermissionPrompt": "true"}"#,
            r#"{"skipDangerousModePermissionPrompt": 1}"#,
            r#"{"theme": "dark"}"#,
            "{not json",
            "[true]",
        ] {
            assert!(!accepted(Some(text)), "{text}");
        }
        assert!(!accepted(None), "no settings.json");
        // The trust record's file is NOT where the key lives.
        std::fs::write(
            root.join(".claude.json"),
            r#"{"skipDangerousModePermissionPrompt": true}"#,
        )
        .unwrap();
        assert!(!accepted(None), "the key in ~/.claude.json does not count");
    }

    /// M18 WP6 — the Recycle re-read: no marker → `None` (keep the cached answer); the marker
    /// alone → `Some(false)`; the marker + the sentinel'd yes → `Some(true)`; an unsentinel'd yes
    /// is noise.
    #[test]
    fn the_bypass_refresh_parses_marker_and_answer() {
        let s = OPEN_SENTINEL;
        assert_eq!(parse_bypass_refresh(""), None);
        assert_eq!(
            parse_bypass_refresh(&format!("{s}bypass-accepted:yes\n")),
            None
        );
        assert_eq!(
            parse_bypass_refresh(&format!("{s}bypass-probed\n")),
            Some(false)
        );
        assert_eq!(
            parse_bypass_refresh(&format!("banner\n{s}bypass-probed\nbypass-accepted:yes\n")),
            Some(false)
        );
        assert_eq!(
            parse_bypass_refresh(&format!("{s}bypass-probed\n{s}bypass-accepted:yes\n")),
            Some(true)
        );
        let cmd = bypass_refresh_command();
        assert!(cmd.starts_with("zsh -lc '"), "{cmd}");
        assert!(cmd.contains("skipDangerousModePermissionPrompt"), "{cmd}");
    }

    #[test]
    fn open_facts_read_the_bypass_line_only_with_the_sentinel() {
        let s = OPEN_SENTINEL;
        let base = format!("{s}dir:yes\n{s}live:no\n");
        assert!(!parse_open_facts(&base).unwrap().bypass_accepted);
        assert!(
            parse_open_facts(&format!("{base}{s}bypass-accepted:yes\n"))
                .unwrap()
                .bypass_accepted
        );
        assert!(
            !parse_open_facts(&format!("{base}bypass-accepted:yes\n"))
                .unwrap()
                .bypass_accepted,
            "rc noise without the sentinel"
        );
    }

    #[test]
    fn the_open_check_treats_a_hostile_path_as_data() {
        let dir = tempfile::TempDir::new().unwrap();
        let canary = dir.path().join("CANARY");
        for v in HOSTILE
            .iter()
            .map(|v| v.to_string())
            .chain([format!("x'; touch {}; '", canary.display())])
        {
            let facts = parse_open_facts(&run_with_fake_tmux(
                &open_check_command("claudesk-dev", &v, &v, true, None),
                false,
                None,
            ));
            assert_eq!(facts.map(|f| f.folder), Some(false), "{v:?}");
        }
        assert!(!canary.exists());
    }

    #[test]
    fn open_facts_need_both_answers_and_ignore_noise() {
        let s = OPEN_SENTINEL;
        assert_eq!(parse_open_facts(""), None);
        assert_eq!(
            parse_open_facts(&format!("{s}dir:yes\n")),
            None,
            "no liveness answer"
        );
        assert_eq!(
            parse_open_facts(&format!("{s}live:no\n")),
            None,
            "no folder answer"
        );
        assert_eq!(
            parse_open_facts(&format!("Welcome!\r\n{s}dir:no\r\n{s}live:no\r\n")),
            Some(OpenFacts {
                folder: false,
                live: false,
                mode: None,
                real: None,
                session_md: false,
                trusted_keys: vec![],
                bypass_accepted: false,
                substrate: None,
            })
        );
        // `dir:yes` / `live:yes` printed by rc noise without the sentinel does not count.
        assert_eq!(parse_open_facts("dir:yes\nlive:yes\n"), None);
    }

    #[test]
    fn the_reconnect_spawn_reads_the_sessions_stored_mode_in_the_same_exec() {
        let dir = tempfile::TempDir::new().unwrap();
        let here = dir.path().canonicalize().unwrap();
        let here = here.to_str().unwrap();
        let mode = |read: bool, stored: Option<&str>| {
            parse_spawn_facts(
                &run_with_fake_tmux(
                    &spawn_facts_command("claudesk-dev", "cd-1234abcd", here, read),
                    true,
                    stored,
                ),
                here,
            )
            .mode
        };
        assert_eq!(
            mode(true, Some("orchestrated")),
            Some(Some("orchestrated".into()))
        );
        assert_eq!(mode(true, Some(NO_MODE)), Some(None));
        assert_eq!(mode(true, None), None, "unset: unknown");
        assert_eq!(mode(true, Some("$(evil)")), None, "not a mode: unknown");
        // A start does not read it (its line is absent), whatever tmux holds.
        assert_eq!(mode(false, Some("orchestrated")), None);
        assert!(!spawn_facts_command("s", "cd-1", here, false).contains("show-options"));
    }

    /// M17 WP5: the attach checks for the session FIRST and exits [`EXIT_NO_SESSION`] when it is
    /// gone, so the end is classified without reading tmux's output; the start refuses a live
    /// session with [`EXIT_SESSION_EXISTS`] and never runs `new`.
    #[test]
    fn the_attach_and_the_start_answer_a_missing_or_live_session_with_their_own_exit_codes() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::TempDir::new().unwrap();
        let bin = dir.path().join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let tmux = bin.join("tmux");
        let run = |has_session: bool, cmd: String| -> (Option<i32>, String) {
            std::fs::write(
                &tmux,
                format!(
                    "#!/bin/sh\necho \"$*\" >> {d}/calls\ncase \" $* \" in *\" has-session \"*) exit {rc};; esac\nexit 0\n",
                    d = dir.path().display(),
                    rc = if has_session { 0 } else { 1 },
                ),
            )
            .unwrap();
            std::fs::set_permissions(&tmux, std::fs::Permissions::from_mode(0o755)).unwrap();
            let _ = std::fs::remove_file(dir.path().join("calls"));
            let out = Command::new("/bin/sh")
                .arg("-c")
                .arg(cmd.replacen("zsh -lc ", "/bin/zsh -fc ", 1))
                .env("PATH", format!("{}:/usr/bin:/bin", bin.display()))
                .output()
                .unwrap();
            let calls = std::fs::read_to_string(dir.path().join("calls")).unwrap_or_default();
            (out.status.code(), calls)
        };
        let attach = || tmux_attach_command("claudesk-dev", "cd-1234abcd");
        let (code, calls) = run(false, attach());
        assert_eq!(code, Some(EXIT_NO_SESSION as i32), "{calls}");
        assert!(!calls.contains(" attach "), "never attaches: {calls}");
        let (code, calls) = run(true, attach());
        assert_eq!(code, Some(0));
        assert!(calls.contains("attach -t =cd-1234abcd"), "{calls}");

        let start = || {
            tmux_new_command(
                "claudesk-dev",
                "/h/conf",
                "cd-1234abcd",
                "/p",
                "/h/cc-launch",
                Some("autopilot"),
                &[],
            )
        };
        let (code, calls) = run(true, start());
        assert_eq!(code, Some(EXIT_SESSION_EXISTS as i32), "{calls}");
        assert!(!calls.contains(" new "), "never starts or joins: {calls}");
        let (code, calls) = run(false, start());
        assert_eq!(code, Some(0));
        assert!(calls.contains(" new -s cd-1234abcd -c /p "), "{calls}");
        assert!(!calls.contains("new -A"), "{calls}");
        assert!(
            calls
                .trim_end()
                .ends_with("; set-option -q @cd_mode autopilot"),
            "the spawn mode is stored on the session: {calls}"
        );
        // No mode: stored as `none`, never left unset (unset = a pre-WP5 session, mode unknown).
        let none = tmux_new_command("s", "/c", "cd-1", "/p", "/l", None, &[]);
        let (_, calls) = run(false, none);
        assert!(
            calls.trim_end().ends_with("set-option -q @cd_mode none"),
            "{calls}"
        );
    }

    #[test]
    fn the_reconnect_treats_a_hostile_session_name_as_data() {
        let dir = tempfile::TempDir::new().unwrap();
        let canary = dir.path().join("CANARY");
        for v in HOSTILE
            .iter()
            .map(|v| v.to_string())
            .chain([format!("x'; touch {}; '", canary.display())])
        {
            assert_eq!(
                run_attach(&v),
                ["-L", "claudesk-dev", "attach", "-t", &format!("={v}")],
                "{v:?}"
            );
        }
        assert!(!canary.exists());
    }

    /// Run [`spawn_facts_command`] (a start: no mode read) for `path` the way the link does, with
    /// `HOME=home` (the remote config root lives there) and the remote login shell.
    fn spawn_facts_out(shell: &str, home: &std::path::Path, path: &str) -> String {
        let cmd = spawn_facts_command("claudesk-dev", "cd-1234abcd", path, false);
        let out = Command::new("/bin/sh")
            .arg("-c")
            .arg(cmd.replacen("zsh -lc ", &format!("{shell} -c "), 1))
            .env("HOME", home)
            .env("PATH", "/usr/bin:/bin")
            .output()
            .unwrap();
        assert!(out.status.success(), "{shell}: always exits 0");
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    /// M17 WP4 (AC-3.3), now in WP5's one spawn exec: a stored path through a symlink yields the
    /// physical path; a physical path, a missing folder or rc noise yield no alias.
    #[test]
    fn the_spawn_exec_finds_the_physical_path_of_a_symlinked_folder() {
        let home = tempfile::TempDir::new().unwrap();
        let dir = tempfile::TempDir::new().unwrap();
        let real = dir.path().canonicalize().unwrap().join("real");
        std::fs::create_dir(&real).unwrap();
        let link = dir.path().canonicalize().unwrap().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let (real, link) = (
            real.to_string_lossy().into_owned(),
            link.to_string_lossy().into_owned(),
        );
        let alias =
            |p: &str| parse_spawn_facts(&spawn_facts_out("/bin/zsh", home.path(), p), p).real_alias;
        assert_eq!(alias(&link), Some(real.clone()));
        assert_eq!(alias(&real), None, "already physical: no alias");
        assert_eq!(alias(&format!("{real}/nope")), None, "missing: no alias");
        assert_eq!(
            parse_spawn_facts(&format!("noise\n{SPAWN_SENTINEL}real:relative\n"), "/a").real_alias,
            None,
            "a non-absolute answer is no alias"
        );
        assert_eq!(
            parse_spawn_facts("real:/b\n", "/a").real_alias,
            None,
            "no sentinel"
        );
    }

    /// A fake `tmux` for [`tmux_end_session_script`]: the session is alive while `$STATE/alive`
    /// holds a number > 0 (each `has-session` that sees it alive decrements it, so `N` = it ends
    /// after N polls; `forever` = it never ends on its own). Every call is logged.
    fn fake_tmux(dir: &std::path::Path, alive: Option<&str>) -> std::path::PathBuf {
        let bin = dir.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let script = r#"#!/bin/sh
echo "$*" >> "$STATE/log"
case "$3" in
  has-session)
    [ -f "$STATE/alive" ] || exit 1
    n=$(cat "$STATE/alive")
    [ "$n" = forever ] && exit 0
    [ "$n" -gt 0 ] || { rm -f "$STATE/alive"; exit 1; }
    echo $((n-1)) > "$STATE/alive"; exit 0 ;;
  kill-session) rm -f "$STATE/alive"; exit 0 ;;
esac
exit 1
"#;
        let tmux = bin.join("tmux");
        std::fs::write(&tmux, script).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmux, std::fs::Permissions::from_mode(0o755)).unwrap();
        if let Some(a) = alive {
            std::fs::write(dir.join("alive"), a).unwrap();
        }
        bin
    }

    /// Run the end-session script (2 polls) against the fake; (stdout, the fake's call log).
    fn run_end(alive: Option<&str>) -> (String, String) {
        let dir = tempfile::TempDir::new().unwrap();
        let bin = fake_tmux(dir.path(), alive);
        let out = Command::new("/bin/sh")
            .arg("-c")
            .arg(tmux_end_session_script("claudesk-dev", "cd-abcd1234", 2))
            .env("PATH", format!("{}:/usr/bin:/bin", bin.display()))
            .env("STATE", dir.path())
            .output()
            .unwrap();
        assert!(out.status.success(), "always exits 0");
        let log = std::fs::read_to_string(dir.path().join("log")).unwrap_or_default();
        (String::from_utf8_lossy(&out.stdout).into_owned(), log)
    }

    /// M17 WP4 (R-1): a session that ends on its own within the polls is left alone; one that does
    /// not is killed, by its EXACT name on Claudesk's own server; no session is a no-op.
    #[test]
    fn the_end_session_script_waits_then_kills_only_a_session_that_did_not_exit() {
        let (out, log) = run_end(Some("1"));
        assert_eq!(out.trim(), "ended=exited");
        assert!(!log.contains("kill-session"), "{log}");

        let (out, log) = run_end(Some("forever"));
        assert_eq!(out.trim(), "ended=killed");
        assert!(
            log.lines()
                .any(|l| l == "-L claudesk-dev kill-session -t =cd-abcd1234"),
            "{log}"
        );
        assert_eq!(
            log.lines().filter(|l| l.contains("has-session")).count(),
            3,
            "2 polls, then the final check: {log}"
        );

        let (out, log) = run_end(None);
        assert_eq!(out.trim(), "ended=exited");
        assert!(!log.contains("kill-session"), "{log}");
    }

    /// M17 WP4 (pulled from WP5 5.2), now in WP5's one spawn exec: `yes` only when the project's
    /// dir holds a `*.jsonl`, in sh AND zsh (the remote login shell).
    #[test]
    fn the_spawn_exec_answers_the_transcript_from_the_projects_dir_in_sh_and_zsh() {
        for shell in ["/bin/sh", "/bin/zsh"] {
            let home = tempfile::TempDir::new().unwrap();
            let proj = home.path().canonicalize().unwrap().join("work/u.proj");
            std::fs::create_dir_all(&proj).unwrap();
            let proj = proj.to_string_lossy().into_owned();
            let has = || {
                parse_spawn_facts(&spawn_facts_out(shell, home.path(), &proj), &proj).has_transcript
            };
            assert!(!has(), "{shell}: no dir");
            let dir = home
                .path()
                .join(".claude/projects")
                .join(crate::transcript::slug_of_physical(&proj));
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("notes.txt"), "x").unwrap();
            assert!(!has(), "{shell}: no jsonl");
            std::fs::write(dir.join("abc.jsonl"), "{}").unwrap();
            assert!(has(), "{shell}: a transcript");
        }
    }

    /// The slug the remote computes is `transcript::slug_of_physical`'s, for the PHYSICAL path:
    /// a transcript under the stored (symlinked) path's slug is NOT the project's, the physical
    /// one is. Paths with `.`, spaces and quotes, in sh and zsh.
    #[test]
    fn the_remote_slug_is_slug_of_physical_for_the_physical_path() {
        for shell in ["/bin/sh", "/bin/zsh"] {
            for name in ["plain", "a.b.c", "with space", "it's", "-dash", "x..y"] {
                let home = tempfile::TempDir::new().unwrap();
                let base = home.path().canonicalize().unwrap();
                let real = base.join("real").join(name);
                std::fs::create_dir_all(&real).unwrap();
                let link = base.join("link");
                std::os::unix::fs::symlink(base.join("real"), &link).unwrap();
                let stored = link.join(name).to_string_lossy().into_owned();
                let physical = real.to_string_lossy().into_owned();
                let projects = home.path().join(".claude/projects");
                // A transcript under the STORED path's slug only: not this project's.
                let wrong = projects.join(crate::transcript::slug_of_physical(&stored));
                std::fs::create_dir_all(&wrong).unwrap();
                std::fs::write(wrong.join("t.jsonl"), "{}").unwrap();
                let has = || {
                    parse_spawn_facts(&spawn_facts_out(shell, home.path(), &stored), &stored)
                        .has_transcript
                };
                assert!(
                    !has(),
                    "{shell} {name:?}: the stored path's slug is not asked"
                );
                let right = projects.join(crate::transcript::slug_of_physical(&physical));
                std::fs::create_dir_all(&right).unwrap();
                std::fs::write(right.join("t.jsonl"), "{}").unwrap();
                assert!(has(), "{shell} {name:?}: the physical path's slug is");
            }
        }
    }

    #[test]
    fn parse_spawn_facts_degrades_each_fact_to_its_safe_side() {
        let none = SpawnFacts {
            real_alias: None,
            has_transcript: false,
            mode: None,
        };
        assert_eq!(parse_spawn_facts("", "/a"), none, "a failed exec");
        assert_eq!(
            parse_spawn_facts("transcript:yes\n", "/a"),
            none,
            "no sentinel"
        );
        assert!(
            parse_spawn_facts(&format!("noise\n{SPAWN_SENTINEL}transcript:yes\r\n"), "/a")
                .has_transcript
        );
        assert!(
            !parse_spawn_facts(&format!("{SPAWN_SENTINEL}transcript:no\n"), "/a").has_transcript
        );
        assert!(
            !parse_spawn_facts(&format!("{SPAWN_SENTINEL}transcript:yess\n"), "/a").has_transcript
        );
    }

    /// The path is data in the spawn exec, whatever it holds (it crosses two shells).
    #[test]
    fn a_hostile_path_is_data_in_the_spawn_exec() {
        let home = tempfile::TempDir::new().unwrap();
        let canary = home.path().join("pwned");
        for hostile in HOSTILE {
            let p = format!("/x{hostile}; touch {}", canary.display());
            let _ = spawn_facts_out("/bin/zsh", home.path(), &p);
        }
        assert!(!canary.exists());
    }
}
