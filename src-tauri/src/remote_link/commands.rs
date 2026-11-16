//! M17 WP3 — the IPC surface and app wiring of the host links.
//!
//! ⚠️ `remote_open_check` is `async` and waits on a blocking worker: bringing a link up runs ssh
//! for seconds. A sync `#[command]` runs on the main thread and would freeze the UI that long
//! (`tests/sync_commands_do_not_block.rs`, where it is listed in `ASYNC_COMMANDS`).

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use super::{LinkEvent, LinkRegistry, SshTransport};
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

/// How long a successful open check keeps the link up after it ends, when nothing else holds it.
/// The open that follows a successful check reaches its spawn well within this (sub-second), so
/// the spawn finds the link Up instead of a torn-down one (M17 WP4 AC-0).
pub const OPEN_CHECK_GRACE: Duration = Duration::from_secs(20);

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

/// End the open check's hold on the link. After `Ok` an open follows within a second, so the hold
/// lingers `grace` (the open's spawn then finds the link Up). After anything else nothing follows,
/// so the hold drops plainly and an otherwise-unheld link stops at once.
pub(crate) fn release_check_hold(hold: super::LinkHold, outcome: &OpenCheck, grace: Duration) {
    if *outcome == OpenCheck::Ok {
        drop(hold.linger(grace));
    } else {
        drop(hold);
    }
}

/// The remote workspace's hook warning (M17 WP4, AC-1.2): the plain-words failure of the last
/// remote hook install on the host of `project_path` (a remote key), or `None` when it worked,
/// no link is up, or the key is not remote. The workspace reads it once its spawn resolved, so
/// the install of the connect it rode has finished (it runs before the link is reported Up).
///
/// Sync on purpose: a short lock read, no I/O (`tests/sync_commands_do_not_block.rs`).
#[tauri::command]
pub fn remote_hook_warning(links: State<'_, SharedLinks>, project_path: String) -> Option<String> {
    let (host, _) = config_store::split_remote_key(&project_path)?;
    links.hook_warning(host)
}

/// Before the picker opens a remote row: validate it, bring its link up, and check its folder
/// still exists (`test -d` over the master). Read-only on the remote. The link lingers
/// [`OPEN_CHECK_GRACE`] after an `Ok`, and stops at once after anything else (if unheld).
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
        // ⚠️ The check HOLDS the link for its own duration
        // (`SURFACE-2026-11-16-QUALITY-M17WP3-OPEN-CHECK-LEAKS-AN-UNHELD-LINK`). Only an `Ok`
        // lingers, because only an `Ok` is followed by an open. Every other outcome drops the hold
        // plainly, so a check that leads nowhere leaves no `ssh -M` behind.
        let hold = match links.ensure_and_hold(&target) {
            Ok((_, hold)) => hold,
            Err(message) => return Ok(OpenCheck::Unreachable { message }),
        };
        let out = links.exec(
            &target,
            &crate::remote_cmd::test_dir_command(target.path()),
            super::EXEC_TIMEOUT_MS,
        );
        let outcome = folder_check_outcome(out, &target);
        release_check_hold(hold, &outcome, OPEN_CHECK_GRACE);
        Ok(outcome)
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
    fn the_open_check_grace_is_the_operator_ruled_20_seconds() {
        // Operator ruling, M17 WP4 P1.verify-human.1 (2026-11-16): keep 20 s. The live open
        // reached the link ~1 s after the click, so a shorter grace buys little, and a change
        // here should be a decision, not a drive-by.
        assert_eq!(OPEN_CHECK_GRACE, Duration::from_secs(20));
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
