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

/// Constant fragment: the auth check (arch §H). With the token exported, `claude auth status`
/// must say `loggedIn: true`. ⚠️ The token's `$(cat …)` expands ON THE REMOTE; nothing but
/// `ok:auth` / `fail:auth` comes back, so the token never leaves the host.
pub const AUTH_CHECK: &str = "CLAUDE_CODE_OAUTH_TOKEN=\"$(cat ~/.claudesk/cc-oauth-token)\" \
claude auth status --json 2>/dev/null | grep -q '\"loggedIn\": *true' \
&& echo ok:auth || echo fail:auth";

/// The one preflight check script (arch §H), run under [`login_shell`]. `path` is the only
/// variable value and enters through [`quote`]. Prints one `ok:<check>` line per passing check
/// and stops at the first `fail:<check>[:<detail>]` line. Always exits 0, so a non-zero exit
/// means ssh (255) or the shell itself failed, never a check.
pub fn preflight_script(path: &str) -> String {
    format!(
        "p={path}\n\
for t in tmux claude perl; do command -v \"$t\" >/dev/null 2>&1 || {{ echo \"fail:tools:$t\"; exit 0; }}; done\n\
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

/// The remote command that starts (or attaches to) a workspace's CC session (arch §C; WP3
/// option (b)): `exec tmux -L <server> -f <conf> new -A -s <session> -c <path> <inner>`, run by
/// [`login_shell`] because `tmux` is not on the host's non-login PATH.
///
/// `<inner>` is the command tmux hands to its default shell: `exec env
/// [CLAUDESK_DRIVE_MODE=<mode>] <launcher> <cc_args…>`. The deployed launcher does the token
/// export, the inline TUI and `unset TMUX`, so NOTHING here expands: every value is quoted for
/// each shell it crosses (inner shell, then the `zsh -lc` script, then the login shell), and the
/// paths are absolute (from the link's `$HOME`), with no `~`.
///
/// `new -A` attaches when the session is live (its inner command is then ignored): the
/// reconnect (R-2). When CC exits, its session ends, so the next open starts fresh.
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
        "exec tmux -L {} -f {} new -A -s {} -c {} {}",
        quote(server),
        quote(conf),
        quote(session),
        quote(path),
        quote(&inner),
    ))
}

/// The remote command a RECONNECT runs (M17 WP3 Phase 5; arch §E): re-attach to the workspace's
/// EXISTING tmux session after the link came back.
///
/// ⚠️ `attach`, never `new -A`: a session that died while the link was down must NOT be silently
/// restarted with a fresh CC (WP5 owns what happens then). tmux refuses a missing session ("can't
/// find session", exit 1), which the caller classifies as the session having ended. The `=` makes
/// the match exact, so `cd-1234abcd` never attaches to `cd-1234abcd-x`.
pub fn tmux_attach_command(server: &str, session: &str) -> String {
    login_shell(&format!(
        "exec tmux -L {} attach -t {}",
        quote(server),
        quote(&format!("={session}")),
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

/// The line [`realpath_command`] prints its answer on, so rc-file noise is never read as a path.
pub const REALPATH_SENTINEL: &str = "CLAUDESK-REALPATH:";

/// The remote command that prints the PHYSICAL path of `path` (`cd -P` + `pwd -P`) after
/// [`REALPATH_SENTINEL`], or the sentinel alone when it cannot (M17 WP4, AC-3.3). Always exits 0.
pub fn realpath_command(path: &str) -> String {
    format!(
        "printf '%s%s\\n' '{REALPATH_SENTINEL}' \"$(cd -P -- {} 2>/dev/null && pwd -P)\"",
        quote(path)
    )
}

/// The alias to register for a remote row whose stored path is `stored`, from
/// [`realpath_command`]'s output: the physical path when it is a normalized absolute path that
/// DIFFERS from `stored`, else `None` (no symlink, or no usable answer: the stored path is used).
pub fn parse_realpath_alias(out: &str, stored: &str) -> Option<String> {
    let real = out
        .lines()
        .rev()
        .find_map(|l| l.trim_end_matches('\r').strip_prefix(REALPATH_SENTINEL))?;
    (is_normalized_remote_path(real) && real != stored).then(|| real.to_string())
}

/// The line [`has_transcript_command`] prints its answer on (`yes` / `no`).
pub const TRANSCRIPT_SENTINEL: &str = "CLAUDESK-TRANSCRIPT:";

/// The remote command that says whether the default config root on the remote holds a transcript
/// for the project whose slug is `slug` (M17 WP4, pulled from WP5 5.2; operator decision
/// P3.build): `--continue` with nothing to continue makes CC EXIT, so a remote resume arm is kept
/// only when this says `yes`. `find`, not a glob, so the answer never depends on the remote
/// login shell's glob options (a glob inside the `if` measured the same in sh and zsh, so this
/// is robustness, not a fix).
pub fn has_transcript_command(slug: &str) -> String {
    format!(
        "d=\"$HOME/.claude/projects/\"{}; \
if [ -n \"$(find \"$d\" -maxdepth 1 -name '*.jsonl' 2>/dev/null | head -n 1)\" ]; \
then echo '{TRANSCRIPT_SENTINEL}yes'; else echo '{TRANSCRIPT_SENTINEL}no'; fi",
        quote(slug)
    )
}

/// [`has_transcript_command`]'s answer: `true` only for a final `yes` line. No answer is `false`:
/// a fresh session is the safe side, since a wrong `--continue` kills the pane.
pub fn parse_has_transcript(out: &str) -> bool {
    out.lines()
        .rev()
        .find_map(|l| l.trim_end_matches('\r').strip_prefix(TRANSCRIPT_SENTINEL))
        == Some("yes")
}

/// The remote command for the open path's folder check: prints `yes` or `no` and exits 0, so a
/// non-zero exit means ssh failed, never "no folder".
pub fn test_dir_command(path: &str) -> String {
    format!("if [ -d {} ]; then echo yes; else echo no; fi", quote(path))
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
        assert_eq!(
            String::from_utf8_lossy(&out.stdout),
            "ok:tools\nfail:path\n"
        );
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
        // The folder check answers yes / no for a hostile but real folder name.
        let hostile = dir.path().join(format!("it's $({touch}) `x`"));
        std::fs::create_dir_all(&hostile).unwrap();
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
        assert_eq!(
            run(&test_dir_command(hostile.to_str().unwrap())),
            (Some(0), "yes".into())
        );
        let gone = dir.path().join("gone; touch x");
        assert_eq!(
            run(&test_dir_command(gone.to_str().unwrap())),
            (Some(0), "no".into())
        );
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

    /// Run [`realpath_command`] for `path` in a real `/bin/sh` (the remote side, locally).
    fn realpath_out(path: &str) -> String {
        let out = Command::new("/bin/sh")
            .arg("-c")
            .arg(realpath_command(path))
            .output()
            .unwrap();
        assert!(out.status.success(), "always exits 0");
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    /// M17 WP4 (AC-3.3): a stored path through a symlink yields the physical path; a physical
    /// path, a missing folder or rc noise yield no alias.
    #[test]
    fn realpath_command_finds_the_physical_path_of_a_symlinked_folder() {
        let dir = tempfile::TempDir::new().unwrap();
        let real = dir.path().canonicalize().unwrap().join("real");
        std::fs::create_dir(&real).unwrap();
        let link = dir.path().canonicalize().unwrap().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let (real, link) = (
            real.to_string_lossy().into_owned(),
            link.to_string_lossy().into_owned(),
        );

        assert_eq!(
            parse_realpath_alias(&realpath_out(&link), &link),
            Some(real.clone())
        );
        assert_eq!(
            parse_realpath_alias(&realpath_out(&real), &real),
            None,
            "already physical: no alias"
        );
        let missing = format!("{real}/nope");
        assert_eq!(
            parse_realpath_alias(&realpath_out(&missing), &missing),
            None
        );
        assert_eq!(
            parse_realpath_alias(&format!("noise\n{REALPATH_SENTINEL}relative\n"), "/a"),
            None,
            "a non-absolute answer is no alias"
        );
        assert_eq!(parse_realpath_alias("no sentinel\n", "/a"), None);
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

    /// Run [`has_transcript_command`] for `slug` in `shell` with `HOME=home`.
    fn transcript_out(shell: &str, home: &std::path::Path, slug: &str) -> bool {
        let out = Command::new(shell)
            .arg("-c")
            .arg(has_transcript_command(slug))
            .env("HOME", home)
            .output()
            .unwrap();
        assert!(out.status.success(), "{shell}: always exits 0");
        parse_has_transcript(&String::from_utf8_lossy(&out.stdout))
    }

    /// M17 WP4 (pulled from WP5 5.2): `yes` only when the project's dir holds a `*.jsonl`, in sh AND
    /// zsh (the remote login shell).
    #[test]
    fn has_transcript_command_answers_from_the_projects_dir_in_sh_and_zsh() {
        for shell in ["/bin/sh", "/bin/zsh"] {
            let home = tempfile::TempDir::new().unwrap();
            let slug = "-Users-u-proj";
            assert!(!transcript_out(shell, home.path(), slug), "{shell}: no dir");
            let dir = home.path().join(".claude/projects").join(slug);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("notes.txt"), "x").unwrap();
            assert!(
                !transcript_out(shell, home.path(), slug),
                "{shell}: no jsonl"
            );
            std::fs::write(dir.join("abc.jsonl"), "{}").unwrap();
            assert!(
                transcript_out(shell, home.path(), slug),
                "{shell}: a transcript"
            );
            assert!(
                !transcript_out(shell, home.path(), "-Users-u-other"),
                "{shell}: another project's dir is not this one's"
            );
        }
    }

    #[test]
    fn parse_has_transcript_is_yes_only_for_a_final_yes() {
        assert!(parse_has_transcript(&format!(
            "noise\n{TRANSCRIPT_SENTINEL}yes\n"
        )));
        assert!(parse_has_transcript(&format!(
            "{TRANSCRIPT_SENTINEL}yes\r\n"
        )));
        assert!(!parse_has_transcript(&format!("{TRANSCRIPT_SENTINEL}no\n")));
        assert!(!parse_has_transcript("yes\n"));
        assert!(!parse_has_transcript(""));
    }

    #[test]
    fn a_hostile_slug_is_data_in_the_transcript_command() {
        let home = tempfile::TempDir::new().unwrap();
        let canary = home.path().join("pwned");
        for hostile in HOSTILE {
            let slug = format!("{hostile}; touch {}", canary.display());
            let _ = transcript_out("/bin/zsh", home.path(), &slug);
        }
        assert!(!canary.exists());
    }

    /// The path is data in the realpath command, whatever it holds.
    #[test]
    fn a_hostile_path_is_data_in_the_realpath_command() {
        let dir = tempfile::TempDir::new().unwrap();
        let canary = dir.path().join("pwned");
        for hostile in HOSTILE {
            let p = format!("/x{hostile}; touch {}", canary.display());
            let _ = realpath_out(&p);
        }
        assert!(!canary.exists());
    }
}
