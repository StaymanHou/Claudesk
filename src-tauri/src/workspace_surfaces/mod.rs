//! M17 WP6 — the backend half of the workspace-surfaces funnel (`arch/remote-workspaces.md` §G).
//!
//! The frontend's `workspaceSurfaces(projectPath)` (`src/state/workspaceSurfaces.ts`) decides which
//! surfaces a workspace SHOWS; it is the authority for what renders. This module is the defense in
//! depth behind it: every command that reaches the LOCAL filesystem, git, a local app, or a local
//! process calls [`refuse_remote`] as its FIRST statement, so a frontend site that forgot the funnel
//! errors loudly with plain words instead of handing an `ssh://` key to `canonicalize`, `git2`,
//! Sublime, Finder or a PTY.
//!
//! ⚠️ **First statement, before any IO.** A remote key is not a path: `canonicalize("ssh://…")`
//! fails with a raw `os error 2` (WP9's symptom), and `sublime_open` / `finder_open` would hand the
//! key straight to the app. The refusal must win before any of that runs.
//!
//! ⚠️ **The refused set is pinned** by `tests/remote_refusal_is_first.rs`: every `#[tauri::command]`
//! in the refused modules must start with a call to [`refuse_remote`], or be listed there as exempt
//! with a reason (`workspace_watch_stop` takes no root).
//!
//! The error crosses the IPC boundary as a `String`, like every other error in these modules, so
//! the "type" the frontend can match on is the exact text [`REMOTE_REFUSAL`].

use crate::config_store::is_remote_key;

/// The exact text a refused command returns. Plain words: no `os error`, no path, no key.
pub const REMOTE_REFUSAL: &str = "Not available on a remote workspace.";

/// A local-only command was handed a remote workspace's `ssh://` key. Its Display IS
/// [`REMOTE_REFUSAL`] (one source for the text the frontend matches on).
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("{}", REMOTE_REFUSAL)]
pub struct RemoteRefused;

impl From<RemoteRefused> for String {
    fn from(e: RemoteRefused) -> Self {
        e.to_string()
    }
}

/// Refuse a remote workspace's key. `Ok(())` for a local root; [`RemoteRefused`] for an `ssh://`
/// key. A pure prefix check: no IO, never blocks (safe in a sync command on the main thread).
pub fn refuse_remote(root: &str) -> Result<(), RemoteRefused> {
    if is_remote_key(root) {
        Err(RemoteRefused)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests;
