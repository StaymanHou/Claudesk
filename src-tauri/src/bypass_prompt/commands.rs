//! M18 WP2 — the Tauri surface over [`super`]'s bypass-warning read.
//!
//! ⚠️ Deliberately thin, and it answers one boolean, as `folder_trust::commands` does. The fire
//! DECISION lives in TypeScript (`autoResumeFire.ts` → `shouldInject`).

use std::path::Path;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::cc_session::SessionRegistry;

/// Whether session `pty_session_id` of `project_path` can NOT open on CC's bypass warning, so an
/// inject's `\r` cannot answer it. Every failure is `false` (D4): an unknown session, no home dir,
/// an unlisted profile, an unreadable `settings.json`, or (remote) no open-check answer.
///
/// Sync and cheap (one lock read, at most one small file read): safe on the main thread.
#[tauri::command]
pub fn bypass_dialog_cleared(
    app: AppHandle,
    registry: State<'_, Mutex<SessionRegistry>>,
    project_path: String,
    pty_session_id: String,
) -> bool {
    let permission = registry
        .lock()
        .ok()
        .and_then(|reg| reg.spawn_permission(&pty_session_id).ok());
    // A REMOTE row: the REMOTE account's `settings.json` decides, which the open check read over
    // the link; the local file says nothing about it.
    let links = app.try_state::<crate::remote_link::commands::SharedLinks>();
    if let Some(answer) = remote_cleared(
        &project_path,
        permission,
        links.as_deref().map(|l| l.as_ref()),
    ) {
        return answer;
    }
    let Ok(home) = app.path().home_dir() else {
        return false;
    };
    let Some(target) = crate::config_store::commands::live_config_target(
        &app,
        &registry,
        Path::new(&project_path),
        Some(&pty_session_id),
    ) else {
        return false;
    };
    super::dialog_cleared(
        permission,
        super::facts_on_disk(&super::settings_path(&home, &target)),
    )
}

/// The remote half of [`bypass_dialog_cleared`]: `Some(answer)` for a REMOTE key, `None` for a
/// local path. The remote `defaultMode` is not read over the link, so it is unknown: an unflagged
/// remote spawn withholds unless the key is accepted (D4).
pub(crate) fn remote_cleared(
    project_path: &str,
    permission: Option<crate::cc_session::SpawnPermission>,
    links: Option<&crate::remote_link::LinkRegistry>,
) -> Option<bool> {
    crate::config_store::split_remote_key(project_path)?;
    Some(super::dialog_cleared(
        permission,
        super::SettingsFacts {
            accepted: links.is_some_and(|l| l.open_bypass(project_path)),
            default_mode_bypass: None,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cc_session::{CcPermissionMode, SpawnPermission};

    /// The command body, comments stripped and whitespace removed.
    fn dense_command_body() -> String {
        let src = include_str!("commands.rs");
        let production = src.split("#[cfg(test)]").next().unwrap_or(src);
        let start = production
            .find("pub fn bypass_dialog_cleared(")
            .expect("bypass_dialog_cleared moved; re-scope this guard");
        let body = &production[start..];
        let end = body.find("\n}\n").expect("terminates");
        body[..end]
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .flat_map(|l| l.chars().filter(|c| !c.is_whitespace()))
            .collect()
    }

    /// Caller guard: the command takes an `AppHandle`, so no test drives it. Its pieces are each
    /// driven elsewhere (`super::tests`, `remote_cleared` here and in `remote_link::tests`); this
    /// pins that the command wires THOSE pieces, in order: the session's OWN spawn permission, the
    /// remote dispatch before any local read, and the local read of the live profile's
    /// `settings.json` through the one decision.
    #[test]
    fn the_command_wires_the_sessions_permission_and_answers_a_remote_row_first() {
        let body = dense_command_body();
        let at = |needle: &str| {
            body.find(needle)
                .unwrap_or_else(|| panic!("`{needle}` is not in bypass_dialog_cleared: {body}"))
        };
        let open = at("->bool{") + "->bool{".len();
        assert!(
            body[open..].starts_with(
                "letpermission=registry.lock().ok().and_then(|reg|reg.spawn_permission(&pty_session_id).ok());"
            ),
            "the session's own permission is read first: {}",
            &body[open..]
        );
        let remote = at("ifletSome(answer)=remote_cleared(&project_path,permission,");
        let local = at(
            "live_config_target(&app,&registry,Path::new(&project_path),Some(&pty_session_id),)",
        );
        assert!(
            remote < local,
            "the remote dispatch comes before any local read"
        );
        assert!(body.ends_with(
            "super::dialog_cleared(permission,super::facts_on_disk(&super::settings_path(&home,&target)),)"
        ));
    }

    #[test]
    fn a_local_path_is_not_answered_by_the_remote_half() {
        assert_eq!(
            remote_cleared(
                "/Users/me/proj",
                Some(SpawnPermission::Flag(CcPermissionMode::BypassPermissions)),
                None
            ),
            None
        );
    }

    #[test]
    fn a_remote_bypass_spawn_with_no_link_answer_withholds() {
        // No link registry at all: no answer is "not accepted" (D4).
        assert_eq!(
            remote_cleared(
                "ssh://u@h/home/u/p",
                Some(SpawnPermission::Flag(CcPermissionMode::BypassPermissions)),
                None
            ),
            Some(false)
        );
        // A non-bypass flag is clear without any answer.
        assert_eq!(
            remote_cleared(
                "ssh://u@h/home/u/p",
                Some(SpawnPermission::Flag(CcPermissionMode::Default)),
                None
            ),
            Some(true)
        );
        // An unflagged remote spawn: its defaultMode is unknown, so no answer withholds.
        assert_eq!(
            remote_cleared("ssh://u@h/home/u/p", Some(SpawnPermission::Unflagged), None),
            Some(false)
        );
    }
}
