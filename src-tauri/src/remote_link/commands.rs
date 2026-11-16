//! M17 WP3 — the IPC surface and app wiring of the host links.
//!
//! ⚠️ `remote_link_ensure` is `async` and waits on a blocking worker: bringing a link up runs ssh
//! for seconds. A sync `#[command]` runs on the main thread and would freeze the UI that long
//! (`tests/sync_commands_do_not_block.rs`, where it is listed in `ASYNC_COMMANDS`).

use std::path::Path;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};

use super::{LinkEvent, LinkRegistry, LinkState, SshTransport};
use crate::config_store::{self, commands::resolve_data_dir};
use crate::remote_cmd::ValidTarget;

/// The managed state: one registry for the app's lifetime.
pub type SharedLinks = Arc<LinkRegistry>;

/// Build the registry for this app: links keyed under `<app_data>/ssh/`, forwarding this app's
/// hook socket, deploying to `~/.claudesk/<identifier>/` on the remote (dev and prod distinct),
/// reporting every state change as a `remote-link` event.
pub fn init(app: &AppHandle) -> Result<SharedLinks, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    let local_socket = crate::hook_socket::commands::hook_socket_path(app)?;
    let identifier = app.config().identifier.clone();
    let emitter = app.clone();
    let sink = Arc::new(move |ev: LinkEvent| {
        if let Err(e) = emitter.emit("remote-link", &ev) {
            eprintln!("[claudesk] remote-link emit failed: {e}");
        }
    });
    Ok(Arc::new(LinkRegistry::new(
        Arc::new(SshTransport),
        app_data,
        local_socket,
        identifier,
        sink,
    )))
}

/// The validated remote target of the stored row keyed `project_path`. ⚠️ THE way a stored row
/// reaches ssh: the row is re-validated here (`RemoteTarget::validated`), so a hand-edited
/// `projects.json` is refused with the reason rather than passed through (operator decision A,
/// WP3 P1.verify-human.1: such a row stays listed and refuses to open).
pub(crate) fn target_for(data_dir: &Path, project_path: &str) -> Result<ValidTarget, String> {
    let projects = config_store::read_projects(data_dir).map_err(|e| e.to_string())?;
    let row = projects
        .iter()
        .find(|p| p.path == Path::new(project_path))
        .ok_or_else(|| format!("{project_path} is not in the project list"))?;
    let remote = row
        .remote
        .as_ref()
        .ok_or_else(|| format!("{project_path} is not a remote project"))?;
    remote
        .validated()
        .map_err(|e| format!("this remote row is invalid: {e}. Remove it and add it again."))
}

/// Bring up (or confirm) the link for the remote row `project_path` and return its state.
/// Errors are in plain words ("could not resolve hostname …: is Tailscale running?").
#[tauri::command]
pub async fn remote_link_ensure(
    app: AppHandle,
    links: State<'_, SharedLinks>,
    project_path: String,
) -> Result<LinkState, String> {
    let dir = resolve_data_dir(&app)?;
    let links = Arc::clone(&links);
    crate::blocking::on_blocking_worker("connecting to the remote host", move || {
        let target = target_for(&dir, &project_path)?;
        links.ensure(&target).map(|_| LinkState::Up)
    })
    .await
}

/// What the picker learns before it opens a remote row (P3.3;
/// `SURFACE-2026-11-16-REMOTE-OPEN-MUST-CHECK-THE-FOLDER-STILL-EXISTS`). Each non-`Ok` kind carries
/// its plain-words message. ⚠️ A missing folder and an unreachable host are DIFFERENT kinds on
/// purpose: only the first may offer Remove, and neither removes anything by itself.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum OpenCheck {
    Ok,
    FolderMissing { message: String },
    Unreachable { message: String },
    Invalid { message: String },
}

/// The folder check's answer, from the exec's result. `yes` = the folder exists; `no` = it does
/// not; anything else (an ssh failure, rc noise without an answer) is "could not check", which is
/// NOT a missing folder.
pub(crate) fn folder_check_outcome(
    out: Result<String, crate::subprocess::RunError>,
    target: &ValidTarget,
) -> OpenCheck {
    let answer = out.as_ref().ok().and_then(|o| {
        o.lines()
            .rev()
            .map(str::trim)
            .find(|l| *l == "yes" || *l == "no")
    });
    match answer {
        Some("yes") => OpenCheck::Ok,
        Some(_) => OpenCheck::FolderMissing {
            message: format!(
                "{} no longer exists on {}. Remove this project, or restore the folder there.",
                target.path(),
                target.host()
            ),
        },
        None => OpenCheck::Unreachable {
            message: match out {
                Err(e) => format!(
                    "could not check {} on {}: {e}",
                    target.path(),
                    target.host()
                ),
                Ok(_) => format!(
                    "{} gave no answer when checking {}",
                    target.host(),
                    target.path()
                ),
            },
        },
    }
}

/// Before the picker opens a remote row: validate it, bring its link up, and check its folder
/// still exists (`test -d` over the master). Read-only on the remote.
#[tauri::command]
pub async fn remote_open_check(
    app: AppHandle,
    links: State<'_, SharedLinks>,
    project_path: String,
) -> Result<OpenCheck, String> {
    let dir = resolve_data_dir(&app)?;
    let links = Arc::clone(&links);
    crate::blocking::on_blocking_worker("checking the remote project", move || {
        let target = match target_for(&dir, &project_path) {
            Ok(t) => t,
            Err(message) => return Ok(OpenCheck::Invalid { message }),
        };
        if let Err(message) = links.ensure(&target) {
            return Ok(OpenCheck::Unreachable { message });
        }
        let out = links.exec(
            &target,
            &crate::remote_cmd::test_dir_command(target.path()),
            super::EXEC_TIMEOUT_MS,
        );
        Ok(folder_check_outcome(out, &target))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config_store::{add_remote, write_projects, RemoteTarget};
    use tempfile::TempDir;

    #[test]
    fn target_for_returns_a_valid_row_and_refuses_an_invalid_or_unknown_one() {
        let dir = TempDir::new().unwrap();
        let good = add_remote(
            dir.path(),
            RemoteTarget {
                host: "me@mini-host".into(),
                path: "/Users/me/p".into(),
            },
            1,
        )
        .unwrap();
        let t = target_for(dir.path(), &good.path.display().to_string()).unwrap();
        assert_eq!((t.host(), t.path()), ("me@mini-host", "/Users/me/p"));

        assert!(target_for(dir.path(), "ssh://nobody/x")
            .unwrap_err()
            .contains("not in the project list"));

        // A hand-edited row that fails validation: refused with its reason, never passed on.
        let mut rows = config_store::read_projects(dir.path()).unwrap();
        let bad = RemoteTarget {
            host: "-oProxyCommand=x".into(),
            path: "/r".into(),
        };
        let mut row = rows[0].clone();
        row.path = std::path::PathBuf::from(bad.key());
        row.remote = Some(bad);
        rows.push(row.clone());
        write_projects(dir.path(), &rows).unwrap();
        let err = target_for(dir.path(), &row.path.display().to_string()).unwrap_err();
        assert!(err.contains("cannot start with \"-\""), "{err}");
        assert!(err.contains("Remove it and add it again"), "{err}");
    }

    #[test]
    fn the_folder_check_tells_a_missing_folder_from_an_unreachable_host() {
        use crate::subprocess::RunError;
        let t = ValidTarget::new("me@mini-host", "/Users/me/p").unwrap();
        assert_eq!(folder_check_outcome(Ok("yes\n".into()), &t), OpenCheck::Ok);
        // rc-file noise before the answer is ignored.
        assert_eq!(
            folder_check_outcome(Ok("Welcome!\nyes\n".into()), &t),
            OpenCheck::Ok
        );
        match folder_check_outcome(Ok("no\n".into()), &t) {
            OpenCheck::FolderMissing { message } => {
                assert!(
                    message.contains("/Users/me/p no longer exists on me@mini-host"),
                    "{message}"
                )
            }
            other => panic!("{other:?}"),
        }
        // An ssh failure is NEVER a missing folder: only `no` may lead to Remove.
        for out in [
            Err(RunError::Failed {
                code: Some(255),
                stderr: "Connection closed".into(),
            }),
            Err(RunError::TimedOut(10_000)),
            Ok(String::new()),
            Ok("noise only\n".into()),
        ] {
            assert!(
                matches!(
                    folder_check_outcome(out.clone(), &t),
                    OpenCheck::Unreachable { .. }
                ),
                "{out:?}"
            );
        }
    }
}
