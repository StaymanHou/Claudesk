//! M17 WP2 — the IPC surface for adding a remote project.
//!
//! ⚠️ Both commands are `async` and run the preflight on a blocking worker: each one waits on
//! `ssh` for up to [`super::preflight::EXEC_TIMEOUT_MS`] per exec. A sync `#[command]` runs on the
//! main thread and would freeze the UI for that long (`tests/sync_commands_do_not_block.rs`,
//! where both are listed in `ASYNC_COMMANDS`).

use tauri::AppHandle;

use super::preflight::{run_preflight, PreflightReport, SshExec};
use crate::config_store::{self, commands::resolve_data_dir, Project, RemoteTarget};

/// Run the §H preflight for `host` + `path` without writing anything. Read-only on both ends:
/// the remote side runs only `printf`, `command -v`, `test` and `claude auth status`.
///
/// ⚠️ No frontend code calls this, deliberately: it is a DIAGNOSTIC surface, invoked over the
/// MCP bridge during verification to read the per-check report. The add form shows a static
/// "Checking…" line and calls [`add_remote_project`], which runs the same preflight itself.
#[tauri::command]
pub async fn remote_preflight(host: String, path: String) -> Result<PreflightReport, String> {
    crate::blocking::on_blocking_worker("the remote preflight", move || {
        Ok(run_preflight(&SshExec, &host, &path))
    })
    .await
}

/// Add a remote project: run the preflight, and write the row **only if every check passed**
/// (arch §H; D5). The ONLY creator of remote rows, so the preflight cannot be skipped by a UI
/// path. A failed check comes back as `Err(<plain words>)`; re-adding an existing remote project
/// touches it rather than duplicating it.
#[tauri::command]
pub async fn add_remote_project(
    app: AppHandle,
    host: String,
    path: String,
) -> Result<Project, String> {
    let dir = resolve_data_dir(&app)?;
    crate::blocking::on_blocking_worker("adding the remote project", move || {
        let report = run_preflight(&SshExec, &host, &path);
        add_after_preflight(&dir, report, crate::config_store::commands::now_ms())
    })
    .await
}

/// The write half of [`add_remote_project`], split out so a test drives it with a report.
pub(crate) fn add_after_preflight(
    data_dir: &std::path::Path,
    report: PreflightReport,
    now_ms: i64,
) -> Result<Project, String> {
    let Some(path) = report.resolved_path.clone() else {
        return Err(report
            .failure()
            .unwrap_or("the remote checks did not pass")
            .to_string());
    };
    config_store::add_remote(
        data_dir,
        RemoteTarget {
            host: report.host,
            path,
        },
        now_ms,
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::super::preflight::CheckResult;
    use super::*;
    use tempfile::TempDir;

    fn report(resolved: Option<&str>, failure: Option<&str>) -> PreflightReport {
        let mut checks = vec![CheckResult {
            name: "connect",
            ok: true,
            message: "ok".into(),
        }];
        if let Some(f) = failure {
            checks.push(CheckResult {
                name: "path",
                ok: false,
                message: f.into(),
            });
        }
        PreflightReport {
            host: "user@mini-host".into(),
            resolved_path: resolved.map(Into::into),
            checks,
        }
    }

    #[test]
    fn a_failed_preflight_writes_nothing_and_returns_its_message() {
        let dir = TempDir::new().unwrap();
        let err = add_after_preflight(dir.path(), report(None, Some("/p is not a directory")), 1)
            .unwrap_err();
        assert_eq!(err, "/p is not a directory");
        assert!(
            !dir.path().join(config_store::PROJECTS_FILE).exists(),
            "a failed preflight must not even create projects.json"
        );
    }

    #[test]
    fn a_passed_preflight_writes_one_keyed_remote_row() {
        let dir = TempDir::new().unwrap();
        let row = add_after_preflight(dir.path(), report(Some("/Users/u/p"), None), 1).unwrap();
        assert_eq!(
            row.path,
            std::path::PathBuf::from("ssh://user@mini-host/Users/u/p")
        );
        assert_eq!(
            row.remote,
            Some(RemoteTarget {
                host: "user@mini-host".into(),
                path: "/Users/u/p".into()
            })
        );
        // Twice → touched, not duplicated.
        add_after_preflight(dir.path(), report(Some("/Users/u/p"), None), 2).unwrap();
        let all = config_store::read_projects(dir.path()).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].last_opened_at, 2);
    }

    // ── The command body end to end (preflight → write), with a scripted ssh ───────────────────

    use super::super::preflight::{ExecResult, RemoteExec};
    use std::cell::Cell;

    /// Answers like a healthy host: `$HOME` first, then an all-pass check script.
    struct HealthyHost {
        calls: Cell<usize>,
    }

    impl RemoteExec for HealthyHost {
        fn exec(&self, _host: &str, _cmd: &str) -> ExecResult {
            let n = self.calls.get();
            self.calls.set(n + 1);
            ExecResult::Ok(if n.is_multiple_of(2) {
                format!("{}/Users/u\n", crate::remote_link::HOME_SENTINEL)
            } else {
                "ok:tools\nok:path\nok:token\nok:auth\n".into()
            })
        }
    }

    #[test]
    fn a_hostile_host_writes_nothing_and_never_reaches_ssh() {
        let dir = TempDir::new().unwrap();
        let ssh = HealthyHost {
            calls: Cell::new(0),
        };
        let r = run_preflight(&ssh, "-oProxyCommand=touch /tmp/x", "/p");
        let err = add_after_preflight(dir.path(), r, 1).unwrap_err();
        assert!(err.contains("cannot start with"), "{err}");
        assert_eq!(ssh.calls.get(), 0, "validation must refuse before any exec");
        assert!(!dir.path().join(config_store::PROJECTS_FILE).exists());
    }

    /// `~/p/` and `/Users/u/p` are the same remote project: one row, touched on the second add
    /// (an operator ruling at M17 WP2 kept the `~` expansion).
    #[test]
    fn tilde_and_trailing_slash_spellings_add_one_row() {
        let dir = TempDir::new().unwrap();
        let ssh = HealthyHost {
            calls: Cell::new(0),
        };
        let first = add_after_preflight(dir.path(), run_preflight(&ssh, "u@h", "~/p/"), 1).unwrap();
        let again =
            add_after_preflight(dir.path(), run_preflight(&ssh, "u@h", "/Users/u/p"), 2).unwrap();
        assert_eq!(first.path, std::path::PathBuf::from("ssh://u@h/Users/u/p"));
        assert_eq!(again.path, first.path);
        let all = config_store::read_projects(dir.path()).unwrap();
        assert_eq!(all.len(), 1, "{all:?}");
        assert_eq!(all[0].last_opened_at, 2);
    }
}
