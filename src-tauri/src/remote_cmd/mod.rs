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

/// Normalize a remote path as typed. `~` / `~/…` are expanded with the REMOTE `home` (read by the
/// preflight's [`PRINT_HOME`]); the result must be absolute and free of control characters;
/// trailing slashes are dropped so `/a/b/` and `/a/b` are the same project (one key).
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
    let trimmed = expanded.trim_end_matches('/');
    Ok(if trimmed.is_empty() { "/" } else { trimmed }.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    /// The inputs a remote path or mode string could carry on a hostile or careless day.
    const HOSTILE: &[&str] = &[
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
}
