//! M17 WP2 — the "Add remote project…" preflight (`arch/remote-workspaces.md` §H).
//!
//! Two one-shot `ssh` execs, in order, stopping at the first failure:
//! 1. **connect** — [`crate::remote_link::print_home_command`]: the host resolves, accepts the
//!    key without a prompt (`BatchMode=yes`), and tells us its `$HOME` (for a `~/…` path). The
//!    answer is read by the link's own [`crate::remote_link::parse_home`] (the last sentinel line),
//!    so a remote rc file that prints something cannot fail it;
//! 2. **the check script** — [`super::preflight_script`] under `zsh -lc`: `tmux`/`claude`/`perl`
//!    resolve, the path is a directory, the token file is non-empty, and CC is logged in with it.
//!
//! Each check reports in plain words, naming the fix where there is one.
//!
//! ⚠️ No ControlMaster here (D6): the master is WP3.1's `remote_link`, and a preflight is a
//! one-off that must work before any link exists.
//! ⚠️ Blocking: every exec waits on a process. Callers are `async` commands on a blocking worker
//! (`commands.rs`), never a sync `#[command]` (`tests/sync_commands_do_not_block.rs`).

use serde::Serialize;

use super::{login_shell, normalize_remote_path, preflight_script, validate_host};
use crate::remote_link::{parse_home, print_home_command};
use crate::subprocess::{run_captured, RunError};

/// ssh's own connect timeout, seconds (`-o ConnectTimeout`).
pub const CONNECT_TIMEOUT_S: u32 = 10;
/// The hard deadline on one exec, after which its process group is killed. Above the connect
/// timeout plus a cold `claude auth status`.
pub const EXEC_TIMEOUT_MS: u64 = 30_000;

/// What one remote exec produced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecResult {
    /// Exit 0, with stdout.
    Ok(String),
    /// Non-zero exit (ssh's own failures are 255), with stderr.
    Failed { code: Option<i32>, stderr: String },
    /// The deadline passed; the process group was killed.
    TimedOut,
    /// The local `ssh` could not be started at all.
    SpawnFailed(String),
}

/// Runs `remote_command` on `host`. Injectable so the preflight's sequencing and wording are
/// tested without a network, and so a test can prove validation refuses BEFORE any exec.
pub trait RemoteExec {
    fn exec(&self, host: &str, remote_command: &str) -> ExecResult;
}

/// The real exec: `/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=10 -- <host> <cmd>`, through
/// the shared hardened spawn/wait/kill loop (`crate::subprocess::run_captured`).
///
/// `--` ends ssh's options, so even a host that slipped past [`validate_host`] cannot become one.
/// The host is an argv element, never shell text; `remote_command` is shell text for the REMOTE
/// login shell, built only by `remote_cmd`.
pub struct SshExec;

impl RemoteExec for SshExec {
    fn exec(&self, host: &str, remote_command: &str) -> ExecResult {
        let mut cmd = std::process::Command::new("/usr/bin/ssh");
        cmd.arg("-o")
            .arg("BatchMode=yes")
            .arg("-o")
            .arg(format!("ConnectTimeout={CONNECT_TIMEOUT_S}"))
            .arg("--")
            .arg(host)
            .arg(remote_command);
        match run_captured(cmd, "", EXEC_TIMEOUT_MS) {
            Ok(out) => ExecResult::Ok(out),
            Err(RunError::Failed { code, stderr }) => ExecResult::Failed { code, stderr },
            Err(RunError::TimedOut(_)) => ExecResult::TimedOut,
            Err(RunError::NotFound(_)) => {
                ExecResult::SpawnFailed("/usr/bin/ssh was not found".into())
            }
            Err(RunError::Spawn(e)) => ExecResult::SpawnFailed(e),
            Err(RunError::OutputTooLarge(n)) => {
                ExecResult::SpawnFailed(format!("the host sent more than {n} bytes"))
            }
        }
    }
}

/// One check's outcome, for the picker's progress/error line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CheckResult {
    /// `host` · `connect` · `path-format` · `script` · `tools` · `path` · `token` · `auth`.
    /// `script` is the check script's exec failing as a transport (it never ran its checks); a
    /// script that stopped early is named for the first check it did not report.
    pub name: &'static str,
    pub ok: bool,
    /// Plain words. On a failure, what failed and how to fix it.
    pub message: String,
}

/// The whole preflight: every check that ran, in order, and on success the normalized target.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PreflightReport {
    pub host: String,
    /// The absolute remote path (`~` expanded), set only when every check passed.
    pub resolved_path: Option<String>,
    pub checks: Vec<CheckResult>,
}

impl PreflightReport {
    /// The first failure's message, if any.
    pub fn failure(&self) -> Option<&str> {
        self.checks
            .iter()
            .find(|c| !c.ok)
            .map(|c| c.message.as_str())
    }
}

fn pass(name: &'static str, message: impl Into<String>) -> CheckResult {
    CheckResult {
        name,
        ok: true,
        message: message.into(),
    }
}

fn fail(name: &'static str, message: impl Into<String>) -> CheckResult {
    CheckResult {
        name,
        ok: false,
        message: message.into(),
    }
}

/// Run the preflight for `host` + `path` as the operator typed them.
pub fn run_preflight(exec: &dyn RemoteExec, host: &str, path: &str) -> PreflightReport {
    let mut report = PreflightReport {
        host: host.trim().to_string(),
        resolved_path: None,
        checks: Vec::new(),
    };

    // 0. Validate locally, before ANY process is spawned (D4).
    let host = match validate_host(host) {
        Ok(h) => h,
        Err(e) => {
            report.checks.push(fail("host", e.to_string()));
            return report;
        }
    };
    report.host = host.clone();

    // 1. connect: resolve, key, and the remote $HOME.
    let home = match exec.exec(&host, &print_home_command()) {
        ExecResult::Ok(out) => match parse_home(&out) {
            Ok(home) => home,
            Err(e) => {
                report
                    .checks
                    .push(fail("connect", format!("{host} answered, but {e}")));
                return report;
            }
        },
        other => {
            report
                .checks
                .push(fail("connect", connect_failure(&host, &other)));
            return report;
        }
    };
    report
        .checks
        .push(pass("connect", format!("{host} accepted the ssh key")));

    let path = match normalize_remote_path(path, &home) {
        Ok(p) => p,
        Err(e) => {
            report.checks.push(fail("path-format", e));
            return report;
        }
    };

    // 2. The check script.
    let out = match exec.exec(&host, &login_shell(&preflight_script(&path))) {
        ExecResult::Ok(out) => out,
        ExecResult::Failed {
            code: Some(127), ..
        } => {
            report.checks.push(fail(
                "tools",
                format!(
                    "zsh was not found on {host}; Claudesk's remote workspaces need macOS's zsh"
                ),
            ));
            return report;
        }
        other => {
            report
                .checks
                .push(fail("script", connect_failure(&host, &other)));
            return report;
        }
    };
    if parse_check_lines(&out, &host, &path, &mut report.checks) {
        report.resolved_path = Some(path);
    }
    report
}

/// Read the check script's `ok:` / `fail:` lines into `checks`. True only when all four passed.
fn parse_check_lines(out: &str, host: &str, path: &str, checks: &mut Vec<CheckResult>) -> bool {
    // Where `claude` resolved on the host, when the script said (an absolute path only).
    let mut claude_at: Option<String> = None;
    for line in out.lines() {
        if let Some(at) = line.trim().strip_prefix("claude-at:") {
            claude_at = Some(at.to_string()).filter(|p| p.starts_with('/'));
            continue;
        }
        match line.trim() {
            "ok:tools" => checks.push(pass("tools", "tmux, claude and perl are installed")),
            "ok:path" => checks.push(pass("path", format!("{path} exists"))),
            "ok:token" => checks.push(pass("token", "the CC token file is present")),
            "ok:auth" => {
                checks.push(pass("auth", "Claude Code is logged in with the token"));
                return true;
            }
            "fail:path" => {
                checks.push(fail("path", format!("{path} is not a directory on {host}")));
                return false;
            }
            "fail:token" => {
                checks.push(fail(
                    "token",
                    token_fix(host, claude_at.as_deref(), "is missing or empty"),
                ));
                return false;
            }
            "fail:auth" => {
                checks.push(fail(
                    "auth",
                    token_fix(
                        host,
                        claude_at.as_deref(),
                        "did not log Claude Code in (expired or revoked?)",
                    ),
                ));
                return false;
            }
            l => {
                if let Some(tool) = l.strip_prefix("fail:tools:") {
                    checks.push(fail("tools", missing_tool(tool, host)));
                    return false;
                }
                // Anything else (a login-shell banner, a profile's echo) is not ours: ignore it.
            }
        }
    }
    // Named for the first check the script did not report, not for whichever comes last.
    let next = SCRIPT_CHECKS
        .into_iter()
        .find(|name| !checks.iter().any(|c| c.name == *name))
        .unwrap_or("auth");
    checks.push(fail(
        next,
        format!("the checks on {host} stopped early, before the {next} check (no result line came back)"),
    ));
    false
}

/// The check script's checks, in the order it runs them.
const SCRIPT_CHECKS: [&str; 4] = ["tools", "path", "token", "auth"];

/// The plain-words failure for a tool the preflight did not find (M18 WP2). `claude` gets its own
/// message: the usual cause is a PATH line that lives only in `~/.zshrc`, which Claudesk's
/// non-interactive login shell never reads (`remote_cmd::CLAUDE_PATH_FALLBACK`).
fn missing_tool(tool: &str, host: &str) -> String {
    if tool == "claude" {
        format!(
            "claude was not found on {host}: not on a login shell's PATH and not at \
             ~/.local/bin/claude. Claudesk's login shell reads ~/.zprofile, not ~/.zshrc, so if \
             your PATH line for claude is only in ~/.zshrc, add it to ~/.zprofile on {host}"
        )
    } else {
        format!("{tool} was not found on {host} (looked on a login shell's PATH)")
    }
}

/// The plain-words fix for a missing or rejected token. `claude_at` is where `claude` resolved on
/// the host (the script's `claude-at:` line). It is named in the command because `ssh host cmd`
/// runs a NON-login shell: on an account whose PATH line for `~/.local/bin` lives only in
/// `~/.zshrc` (the shape M18 WP2 hardened), a bare `claude` there is "command not found"
/// (`SURFACE-2026-11-18-QUALITY-TOKEN-FIX-HINT-ASSUMES-CLAUDE-ON-NONLOGIN-PATH`). The path is
/// quoted for the remote shell. Without one, the bare name is the best we can say.
fn token_fix(host: &str, claude_at: Option<&str>, what: &str) -> String {
    let claude = claude_at.map_or_else(|| "claude".to_string(), super::quote);
    format!(
        "the token in {} on {host} {what}. Fix: run `ssh -t {host} {claude} setup-token` and save \
         the token it prints to that file (chmod 600)",
        super::TOKEN_FILE
    )
}

/// Plain words for an exec that did not get to run the command (arch §H: "could not resolve
/// hostname: is Tailscale running?").
pub(crate) fn connect_failure(host: &str, r: &ExecResult) -> String {
    match r {
        ExecResult::TimedOut => format!("{host} did not answer within {}s", EXEC_TIMEOUT_MS / 1000),
        ExecResult::SpawnFailed(e) => format!("could not run ssh: {e}"),
        ExecResult::Ok(_) => format!("{host} gave an unexpected answer"),
        ExecResult::Failed { code, stderr } => {
            let s = stderr.as_str();
            if s.contains("Could not resolve hostname") {
                format!("could not resolve hostname {host}: is Tailscale running?")
            } else if s.contains("Permission denied") {
                format!(
                    "{host} did not accept your ssh key. Check that `ssh {host}` logs in without \
                     a password"
                )
            } else if s.contains("Host key verification failed") {
                format!("{host}'s host key isn't known yet: run `ssh {host}` once in a terminal to accept it")
            } else if s.contains("timed out") {
                format!("{host} did not answer within {CONNECT_TIMEOUT_S}s: is it awake and on the network?")
            } else if s.contains("Connection refused") {
                format!("{host} refused the connection: is Remote Login (ssh) turned on there?")
            } else {
                let first = s
                    .lines()
                    .map(str::trim)
                    .find(|l| !l.is_empty())
                    .unwrap_or("");
                match code {
                    Some(c) => format!("ssh to {host} failed (exit {c}): {first}"),
                    None => format!("ssh to {host} was killed: {first}"),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    /// Scripted exec: answers each call from a queue, and records every call.
    struct Fake {
        answers: RefCell<Vec<ExecResult>>,
        calls: RefCell<Vec<(String, String)>>,
    }

    impl Fake {
        fn new(answers: Vec<ExecResult>) -> Self {
            Fake {
                answers: RefCell::new(answers),
                calls: RefCell::new(Vec::new()),
            }
        }
    }

    impl RemoteExec for Fake {
        fn exec(&self, host: &str, cmd: &str) -> ExecResult {
            self.calls.borrow_mut().push((host.into(), cmd.into()));
            let mut a = self.answers.borrow_mut();
            assert!(!a.is_empty(), "unexpected exec: {cmd}");
            a.remove(0)
        }
    }

    /// The connect exec's answer: `$HOME` behind the link's sentinel, as the real command prints it.
    fn home_line(home: &str) -> ExecResult {
        ok(&format!("{}{home}\n", crate::remote_link::HOME_SENTINEL))
    }

    fn ok(s: &str) -> ExecResult {
        ExecResult::Ok(s.into())
    }

    fn ssh_err(stderr: &str) -> ExecResult {
        ExecResult::Failed {
            code: Some(255),
            stderr: stderr.into(),
        }
    }

    const ALL_OK: &str = "ok:tools\nok:path\nok:token\nok:auth\n";

    #[test]
    fn a_bad_host_is_refused_before_any_exec() {
        for bad in ["", "-oProxyCommand=touch /tmp/x", "a b", "a\nb", "h;id"] {
            let fake = Fake::new(vec![]);
            let r = run_preflight(&fake, bad, "/p");
            assert!(r.resolved_path.is_none());
            assert_eq!(r.checks.len(), 1, "{bad:?}: {r:?}");
            assert_eq!(r.checks[0].name, "host");
            assert!(fake.calls.borrow().is_empty(), "{bad:?} reached an exec");
        }
    }

    #[test]
    fn the_happy_path_runs_two_execs_and_resolves_the_path() {
        let fake = Fake::new(vec![home_line("/Users/u"), ok(ALL_OK)]);
        let r = run_preflight(&fake, " user@mini-host ", "~/proj/");
        assert!(r.resolved_path.is_some(), "{r:?}");
        assert_eq!(r.host, "user@mini-host");
        assert_eq!(r.resolved_path.as_deref(), Some("/Users/u/proj"));
        let names: Vec<_> = r.checks.iter().map(|c| c.name).collect();
        assert_eq!(names, ["connect", "tools", "path", "token", "auth"]);
        let calls = fake.calls.borrow();
        assert_eq!(
            calls[0],
            ("user@mini-host".into(), print_home_command()),
            "the connect exec is the link's own sentinel command"
        );
        assert!(
            crate::remote_link::pre_connect_script("id").contains(&print_home_command()),
            "one writer: the link's pre-connect prints $HOME with the same command"
        );
        assert_eq!(
            calls[1].1,
            login_shell(&preflight_script("/Users/u/proj")),
            "the check script carries the RESOLVED path"
        );
    }

    #[test]
    fn connect_failures_are_plain_words() {
        let cases = [
            (
                "ssh: Could not resolve hostname mini: nodename nor servname provided",
                "could not resolve hostname mini: is Tailscale running?",
            ),
            (
                "u@mini: Permission denied (publickey,password).",
                "did not accept your ssh key",
            ),
            (
                "Host key verification failed.",
                "run `ssh mini` once in a terminal",
            ),
            (
                "ssh: connect to host mini port 22: Operation timed out",
                "is it awake",
            ),
            (
                "ssh: connect to host mini port 22: Connection refused",
                "Remote Login",
            ),
            (
                "weird thing\nmore",
                "ssh to mini failed (exit 255): weird thing",
            ),
        ];
        for (stderr, want) in cases {
            let fake = Fake::new(vec![ssh_err(stderr)]);
            let r = run_preflight(&fake, "mini", "/p");
            assert_eq!(r.checks.len(), 1);
            assert_eq!(r.checks[0].name, "connect");
            assert!(
                r.checks[0].message.contains(want),
                "{stderr:?} → {:?}, want {want:?}",
                r.checks[0].message
            );
        }
        let r = run_preflight(&Fake::new(vec![ExecResult::TimedOut]), "mini", "/p");
        assert!(r.failure().unwrap().contains("did not answer within 30s"));
    }

    /// A remote rc file that prints (a banner, a `.zshenv` echo) before or after the sentinel line
    /// cannot fail connect: the last sentinel line is `$HOME` (the link's own `parse_home`).
    #[test]
    fn rc_noise_around_the_home_line_still_connects() {
        let s = crate::remote_link::HOME_SENTINEL;
        let out = format!("Welcome to the mini!\n/not/home\n{s}/Users/u\nzshenv says hi\n");
        let fake = Fake::new(vec![ok(&out), ok(ALL_OK)]);
        let r = run_preflight(&fake, "mini", "~/proj");
        assert_eq!(r.resolved_path.as_deref(), Some("/Users/u/proj"), "{r:?}");
    }

    /// No sentinel line (or an unusable `$HOME`) is a `connect` failure in plain words, and no
    /// check script runs.
    #[test]
    fn a_missing_or_unusable_home_line_fails_connect_in_plain_words() {
        let s = crate::remote_link::HOME_SENTINEL;
        for (out, want) in [
            (
                "/Users/u".to_string(),
                "mini answered, but the host did not report its home folder",
            ),
            (
                format!("{s}/Users/a b\n"),
                "mini answered, but the host's home folder",
            ),
        ] {
            let fake = Fake::new(vec![ok(&out)]);
            let r = run_preflight(&fake, "mini", "/p");
            assert_eq!(r.checks.len(), 1, "{out:?}");
            assert_eq!(r.checks[0].name, "connect");
            assert!(
                r.checks[0].message.starts_with(want),
                "{:?}",
                r.checks[0].message
            );
            assert_eq!(fake.calls.borrow().len(), 1, "{out:?}: no check script");
        }
    }

    #[test]
    fn a_relative_path_fails_after_connect_and_before_the_script() {
        let fake = Fake::new(vec![home_line("/Users/u")]);
        let r = run_preflight(&fake, "mini", "proj");
        assert_eq!(r.checks.last().unwrap().name, "path-format");
        assert_eq!(
            fake.calls.borrow().len(),
            1,
            "no check script for a bad path"
        );
    }

    #[test]
    fn each_check_failure_names_what_failed() {
        let cases = [
            ("fail:tools:tmux\n", "tools", "tmux was not found on mini"),
            // M18 WP2: claude's message names both places it looked and the ~/.zprofile fix.
            (
                "fail:tools:claude\n",
                "tools",
                "not at ~/.local/bin/claude. Claudesk's login shell reads ~/.zprofile, not ~/.zshrc",
            ),
            (
                "ok:tools\nfail:path\n",
                "path",
                "/p is not a directory on mini",
            ),
            (
                "ok:tools\nok:path\nfail:token\n",
                "token",
                "claude setup-token",
            ),
            (
                "ok:tools\nok:path\nok:token\nfail:auth\n",
                "auth",
                "claude setup-token",
            ),
            (
                "Last login: banner\nok:tools\n",
                "path",
                "stopped early, before the path check",
            ),
        ];
        for (out, name, want) in cases {
            let fake = Fake::new(vec![home_line("/Users/u"), ok(out)]);
            let r = run_preflight(&fake, "mini", "/p");
            assert!(r.resolved_path.is_none(), "{out:?}");
            let last = r.checks.last().unwrap();
            assert_eq!(last.name, name, "{out:?}");
            assert!(!last.ok);
            assert!(last.message.contains(want), "{out:?} → {:?}", last.message);
        }
    }

    /// M18 WP6 — a token failure names the `claude` the host resolved, quoted for the remote
    /// shell, because `ssh -t host claude …` runs a non-login shell that may not find a bare
    /// `claude`. No `claude-at:` line (or a non-absolute one) → the bare name, as before.
    #[test]
    fn the_token_fix_names_the_claude_the_host_resolved() {
        let at = "claude-at:/Users/u/.local/bin/claude\n";
        for (out, want) in [
            (
                format!("{at}ok:tools\nok:path\nfail:token\n"),
                "`ssh -t mini '/Users/u/.local/bin/claude' setup-token`",
            ),
            (
                format!("{at}ok:tools\nok:path\nok:token\nfail:auth\n"),
                "`ssh -t mini '/Users/u/.local/bin/claude' setup-token`",
            ),
            (
                "ok:tools\nok:path\nfail:token\n".to_string(),
                "`ssh -t mini claude setup-token`",
            ),
            (
                "claude-at:claude\nok:tools\nok:path\nfail:token\n".to_string(),
                "`ssh -t mini claude setup-token`",
            ),
        ] {
            let fake = Fake::new(vec![home_line("/Users/u"), ok(&out)]);
            let r = run_preflight(&fake, "mini", "/p");
            let last = r.checks.last().unwrap();
            assert!(!last.ok, "{out:?}");
            assert!(last.message.contains(want), "{out:?} → {:?}", last.message);
        }
    }

    #[test]
    fn a_login_banner_does_not_confuse_the_parser() {
        let fake = Fake::new(vec![
            home_line("/Users/u"),
            ok(&format!("Welcome!\n{ALL_OK}")),
        ]);
        assert!(run_preflight(&fake, "mini", "/p").resolved_path.is_some());
    }

    #[test]
    fn a_missing_zsh_is_named() {
        let fake = Fake::new(vec![
            home_line("/Users/u"),
            ExecResult::Failed {
                code: Some(127),
                stderr: "zsh: command not found".into(),
            },
        ]);
        let r = run_preflight(&fake, "mini", "/p");
        assert!(r.failure().unwrap().contains("zsh was not found"));
        assert_eq!(
            r.checks.last().unwrap().name,
            "tools",
            "zsh IS a missing tool"
        );
    }

    /// The check script's exec failing as a transport (it dropped, it timed out) is named
    /// `script`: none of its checks ran, so no check's name is true.
    #[test]
    fn a_check_script_transport_failure_is_named_script() {
        for second in [
            ssh_err("Connection to mini closed by remote host."),
            ExecResult::TimedOut,
        ] {
            let fake = Fake::new(vec![home_line("/Users/u"), second.clone()]);
            let r = run_preflight(&fake, "mini", "/p");
            let last = r.checks.last().unwrap();
            assert_eq!((last.name, last.ok), ("script", false), "{second:?}");
            assert!(r.resolved_path.is_none());
        }
    }

    /// A script that stopped early is named for the first check it did NOT report.
    #[test]
    fn a_script_that_stopped_early_names_the_next_unreported_check() {
        for (out, next) in [
            ("", "tools"),
            ("ok:tools\n", "path"),
            ("ok:tools\nok:path\n", "token"),
            ("ok:tools\nok:path\nok:token\n", "auth"),
        ] {
            let fake = Fake::new(vec![home_line("/Users/u"), ok(out)]);
            let r = run_preflight(&fake, "mini", "/p");
            let last = r.checks.last().unwrap();
            assert_eq!((last.name, last.ok), (next, false), "{out:?}");
            assert!(
                last.message
                    .contains(&format!("stopped early, before the {next} check")),
                "{:?}",
                last.message
            );
        }
    }

    #[test]
    fn a_wrong_home_answer_fails_connect() {
        let r = run_preflight(&Fake::new(vec![ok("relative")]), "mini", "/p");
        assert_eq!(r.checks[0].name, "connect");
        assert!(r.resolved_path.is_none());
    }

    /// The real `SshExec` against a name that cannot resolve: ssh itself runs (no network
    /// needed for the failure), and the stderr maps to the Tailscale hint.
    #[test]
    fn the_real_ssh_exec_maps_an_unresolvable_host() {
        let r = run_preflight(&SshExec, "nosuchhost.invalid", "/p");
        assert!(r.resolved_path.is_none());
        assert_eq!(r.checks[0].name, "connect");
        assert!(
            r.checks[0].message.contains("is Tailscale running?"),
            "{:?}",
            r.checks[0].message
        );
    }

    /// LIVE, opt-in: the real preflight against a real host. Never runs in the gate (`#[ignore]`),
    /// and the host comes from the environment so it is never written into this public repo:
    /// `CLAUDESK_TEST_REMOTE_HOST=<user@host> CLAUDESK_TEST_REMOTE_PATH=<abs or ~/ path>
    ///  cargo test --lib live_preflight -- --ignored --nocapture`.
    /// Read-only on the remote (`printf`, `command -v`, `test`, `claude auth status`).
    #[test]
    #[ignore = "needs a real ssh host; set CLAUDESK_TEST_REMOTE_HOST / _PATH"]
    fn live_preflight_against_a_real_host() {
        let host = std::env::var("CLAUDESK_TEST_REMOTE_HOST").expect("CLAUDESK_TEST_REMOTE_HOST");
        let path = std::env::var("CLAUDESK_TEST_REMOTE_PATH").expect("CLAUDESK_TEST_REMOTE_PATH");
        let start = std::time::Instant::now();
        let r = run_preflight(&SshExec, &host, &path);
        for c in &r.checks {
            eprintln!(
                "{} {:>11} {}",
                if c.ok { "PASS" } else { "FAIL" },
                c.name,
                c.message
            );
        }
        eprintln!(
            "resolved_path={:?} in {:?}",
            r.resolved_path,
            start.elapsed()
        );
        let expect_pass = std::env::var("CLAUDESK_TEST_EXPECT").as_deref() != Ok("fail");
        assert_eq!(r.resolved_path.is_some(), expect_pass, "{r:?}");
    }
}
