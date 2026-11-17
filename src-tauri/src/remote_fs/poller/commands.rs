//! The poller's runtime wiring: the production [`PollEnv`] (the gate from `settings.json`, the link
//! state from the host links), the `fs-change` emit, and the frontend's four commands:
//! `remote_poll_start` / `remote_poll_stop` (where a local workspace calls `workspace_watch_start` /
//! `workspace_watch_stop`), and `remote_poll_catch_up` / `remote_poll_pause` (the Docs panel coming
//! on / going off screen).
//!
//! Start, stop and pause are SYNC on purpose: they only touch the registry (`subscribe` may spawn a
//! worker, `unsubscribe` drops a sender, `pause` flips a flag) and read `projects.json` (bounded local
//! IO). `remote_poll_catch_up` is ASYNC: it waits for the host worker's tick on the blocking pool. No
//! ssh runs on the main thread; every exec is on the host's worker
//! (`tests/sync_commands_do_not_block.rs`).

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};

use super::{CatchUp, PollEnv, RemotePoller, REMOTE_POLL_INTERVAL};
use crate::config_store::is_remote_key;
use crate::fs_watch::commands::FS_CHANGE_EVENT;
use crate::remote_link::commands::SharedLinks;
use crate::remote_link::LinkState;

/// The gate and the link, read fresh on every tick.
struct AppEnv {
    data_dir: PathBuf,
    links: SharedLinks,
}

impl PollEnv for AppEnv {
    /// As WP5's open check reads it: a remote row has no profile, so the gate alone decides.
    fn gate_on(&self) -> bool {
        crate::config_store::profiles::workflow_applicable(
            crate::config_store::settings::read_workflow_features_enabled(&self.data_dir)
                .unwrap_or(false),
            None,
        )
    }

    fn link_up(&self, host: &str) -> bool {
        self.links.state(host) == Some(LinkState::Up)
    }
}

/// Build the managed poller over the host links. Polls go through `LinkRegistry::master_exec`
/// (Up-only, master-only); changes go out on `fs-change`.
pub fn init(app: &AppHandle, links: SharedLinks) -> Result<RemotePoller, String> {
    let data_dir = crate::config_store::commands::resolve_data_dir(app)?;
    let emitter = app.clone();
    Ok(RemotePoller::new(
        Arc::new(AppEnv {
            data_dir,
            links: Arc::clone(&links),
        }),
        links,
        Arc::new(move |change| {
            if let Err(e) = emitter.emit(FS_CHANGE_EVENT, &change) {
                eprintln!("[claudesk] remote poller: could not emit fs-change: {e}");
            }
        }),
        REMOTE_POLL_INTERVAL,
    ))
}

/// How long a catch-up waits for its tick: one that was already running (its exec) plus its own.
pub const CATCH_UP_TIMEOUT: std::time::Duration =
    std::time::Duration::from_millis(2 * super::LIST_TIMEOUT_MS + 2_000);

/// Subscribe a REMOTE workspace to the poller, PAUSED (the remote twin of `workspace_watch_start`).
/// Nothing is polled until its Docs panel is fronted and asks for a catch-up
/// ([`remote_poll_catch_up`]). The row is looked up in the project list, so an unknown or invalid
/// `ssh://` key is refused with its reason. Re-subscribing the same `workspace_id` replaces its
/// subscription. The gate is NOT checked here: the worker reads it on every tick.
#[tauri::command]
pub fn remote_poll_start(
    app: AppHandle,
    workspace_id: String,
    project_path: String,
) -> Result<(), String> {
    if !is_remote_key(&project_path) {
        return Err(format!("{project_path} is not a remote project"));
    }
    let Some(poller) = app.try_state::<RemotePoller>() else {
        return Err("remote workspaces are unavailable in this session".into());
    };
    let dir = crate::config_store::commands::resolve_data_dir(&app)?;
    let target = crate::remote_link::commands::target_for(&dir, &project_path)?;
    poller.subscribe(&workspace_id, target);
    Ok(())
}

/// Stop polling a workspace (on close / detach). The host's worker ends with its last workspace.
/// Absent id, or no poller in this session: a no-op.
#[tauri::command]
pub fn remote_poll_stop(app: AppHandle, workspace_id: String) {
    if let Some(poller) = app.try_state::<RemotePoller>() {
        poller.unsubscribe(&workspace_id);
    }
}

/// The return to a remote workspace's Docs (centre stage with Docs fronted, or Docs fronted again):
/// activate its polling and answer the result of the immediate tick, for the panel's catch-up toast.
/// ASYNC: it waits (on the blocking pool, bounded by [`CATCH_UP_TIMEOUT`]) for the host's worker,
/// which runs the exec; the command itself runs none.
#[tauri::command]
pub async fn remote_poll_catch_up(
    app: AppHandle,
    workspace_id: String,
    project_path: String,
) -> Result<CatchUp, String> {
    if !is_remote_key(&project_path) {
        return Err(format!("{project_path} is not a remote project"));
    }
    let rx = {
        let Some(poller) = app.try_state::<RemotePoller>() else {
            return Err("remote workspaces are unavailable in this session".into());
        };
        let dir = crate::config_store::commands::resolve_data_dir(&app)?;
        let target = crate::remote_link::commands::target_for(&dir, &project_path)?;
        poller.catch_up(&workspace_id, target)
    };
    crate::blocking::on_blocking_worker("checking the remote docs", move || {
        rx.recv_timeout(CATCH_UP_TIMEOUT).map_err(|e| match e {
            std::sync::mpsc::RecvTimeoutError::Timeout => "the check took too long".to_string(),
            std::sync::mpsc::RecvTimeoutError::Disconnected => {
                "the workspace is no longer watched".to_string()
            }
        })
    })
    .await
}

/// Pause a remote workspace's polling (it left centre stage, or its Docs tab was un-fronted). It keeps
/// its snapshot, so the next catch-up delivers what changed meanwhile. Absent id: a no-op.
#[tauri::command]
pub fn remote_poll_pause(app: AppHandle, workspace_id: String) {
    if let Some(poller) = app.try_state::<RemotePoller>() {
        poller.pause(&workspace_id);
    }
}
