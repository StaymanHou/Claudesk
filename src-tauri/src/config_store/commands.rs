//! Tauri command wrappers over the pure [`super`] store functions.
//!
//! These are thin: resolve the real app-data dir from the `AppHandle`, ensure it
//! exists, delegate to the pure store function, and map [`ConfigError`] to a
//! `String` so it can cross the IPC boundary (Tauri requires command errors to
//! be `Serialize`). All persistence logic and ordering live in [`super`]; these
//! wrappers add only the runtime-dependent path resolution and the wall clock.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager};

use super::{
    add_or_touch, prune_missing, read_projects, remove as remove_project_inner,
    set_default_drive_mode, set_default_model, set_supervisor_enabled, DriveMode, Project,
    PROJECTS_FILE,
};

/// Resolve `~/Library/Application Support/<identifier>/` and ensure it exists.
/// `pub(crate)` so the `cc_session` / `pip` command modules share this one
/// definition rather than each keeping a verbatim module-local copy (Theme A dedup).
pub(crate) fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create app data dir {}: {e}", dir.display()))?;
    Ok(dir)
}

/// One-time seed of the DEV build's `projects.json` from the PROD build's, so the
/// first `pnpm tauri:dev` launch starts with the operator's real project list
/// (dev/prod isolation, 2026-06-24). Best-effort + idempotent:
/// - no-op unless the running identifier ends in `.dev` (prod never seeds);
/// - no-op if the dev `projects.json` already exists (never clobber dev edits);
/// - no-op if the prod `projects.json` doesn't exist (nothing to seed from).
///
/// The prod dir is resolved as a SIBLING of the dev data dir (same parent, prod
/// identifier as the folder name) — `app_data_dir()` returns
/// `…/Application Support/<identifier>/`, so the prod dir is
/// `<parent>/<prod-identifier>/`. Prod's file is the copy SOURCE, never written.
/// Errors are logged, never propagated — seeding must never block launch.
pub fn seed_dev_projects_from_prod(app: &AppHandle) {
    let identifier = app.config().identifier.clone();
    let dev_dir = match resolve_data_dir(app) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[claudesk] dev projects seed: could not resolve dev data dir: {e}");
            return;
        }
    };
    match seed_dev_projects(&dev_dir, &identifier) {
        Ok(Some((src, dst))) => {
            eprintln!(
                "[claudesk] dev projects seed: copied {} → {}",
                src.display(),
                dst.display()
            )
        }
        Ok(None) => {} // no-op (prod build, already seeded, or no prod list)
        Err(e) => eprintln!("[claudesk] dev projects seed: {e}"),
    }
}

/// Pure-IO core of [`seed_dev_projects_from_prod`], testable with a `TempDir`.
/// Given the resolved dev data dir and the running identifier, copy prod's
/// `projects.json` into the dev dir iff: identifier ends in `.dev`, dev's file is
/// absent, and prod's file exists. Returns `Ok(Some((src, dst)))` when it copied,
/// `Ok(None)` for any no-op branch, `Err` only on a real copy failure. Prod dir is
/// the sibling of the dev dir named by the prod identifier (the `.dev` stripped).
fn seed_dev_projects(
    dev_dir: &Path,
    identifier: &str,
) -> Result<Option<(PathBuf, PathBuf)>, String> {
    let Some(prod_identifier) = identifier.strip_suffix(".dev") else {
        return Ok(None); // prod build (or non-dev identity) — nothing to seed
    };
    let dev_file = dev_dir.join(PROJECTS_FILE);
    if dev_file.exists() {
        return Ok(None); // already seeded (or dev built its own) — never clobber
    }
    let Some(parent) = dev_dir.parent() else {
        return Ok(None);
    };
    let prod_file = parent.join(prod_identifier).join(PROJECTS_FILE);
    if !prod_file.exists() {
        return Ok(None); // no prod list to seed from (fresh machine) — dev empty
    }
    std::fs::copy(&prod_file, &dev_file).map_err(|e| {
        format!(
            "copy {} → {} failed: {e}",
            prod_file.display(),
            dev_file.display()
        )
    })?;
    Ok(Some((prod_file, dev_file)))
}

/// Current wall-clock time in unix epoch milliseconds.
///
/// `duration_since(UNIX_EPOCH)` only errors if the system clock is set before 1970
/// — not a real condition, but if it ever fires we must NOT fall back to `0`: the
/// store sorts most-recently-opened first by descending `last_opened_at`
/// (`super::sort_by_recency`), so a `0` stamp would silently sink the just-opened
/// project to the BOTTOM of recents — the exact opposite of what the user just did.
/// Instead we log the anomaly and stamp `i64::MAX` so the actively-opened record
/// sorts FIRST, matching intent, and surface the clock fault rather than swallowing it.
fn now_ms() -> i64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_millis() as i64,
        Err(e) => {
            eprintln!(
                "[claudesk] system clock is before the unix epoch ({e}); \
                 stamping recency as i64::MAX so the just-opened project sorts first"
            );
            i64::MAX
        }
    }
}

/// List remembered projects, most-recently-opened first.
#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    let dir = resolve_data_dir(&app)?;
    read_projects(&dir).map_err(|e| e.to_string())
}

/// Add a project (or refresh its recency if already present). Returns the record.
///
/// NOTE: this body is DELIBERATELY identical to [`record_open`] — both are thin
/// aliases over `add_or_touch(.., now_ms())`. They are kept as two distinct IPC
/// commands for frontend readability (the picker calls `add_project` from "Open
/// Folder…" and `record_open` from clicking a recent — the names document intent at
/// the call site). The single point of truth is `add_or_touch`; if its contract ever
/// needs to differ per entry point, split it there, not by editing one wrapper and
/// not the other. Do not "dedupe" these into one command.
#[tauri::command]
pub fn add_project(app: AppHandle, path: String) -> Result<Project, String> {
    let dir = resolve_data_dir(&app)?;
    add_or_touch(&dir, PathBuf::from(path), now_ms()).map_err(|e| e.to_string())
}

/// Stamp `last_opened_at = now` for a project (adding it if unknown). Returns the
/// record so the frontend can reflect the new recency immediately.
///
/// Deliberately a byte-identical alias of [`add_project`] — see the note there.
#[tauri::command]
pub fn record_open(app: AppHandle, path: String) -> Result<Project, String> {
    let dir = resolve_data_dir(&app)?;
    add_or_touch(&dir, PathBuf::from(path), now_ms()).map_err(|e| e.to_string())
}

/// Remove a project from the list. No-op if absent.
#[tauri::command]
pub fn remove_project(app: AppHandle, path: String) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    remove_project_inner(&dir, Path::new(&path)).map_err(|e| e.to_string())
}

/// Drop projects whose folder no longer exists on disk, returning the dropped
/// records so the picker can show a toast naming how many were removed. Called on
/// picker mount (WP9): a project deleted between sessions otherwise lingers as a
/// dead click.
#[tauri::command]
pub fn prune_missing_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    let dir = resolve_data_dir(&app)?;
    prune_missing(&dir).map_err(|e| e.to_string())
}

// ⚠️ NO `project_get_default_model` command — deleted at the 2026-08-12 paydown sweep.
//
// It read a project's model override over IPC. The M11.5 repair (B) that removed the picker's
// per-row N+1 took its last caller: `default_model` now ships on the project-list payload and
// seeds each row's cell directly. The command stayed registered, callerless, for two milestones.
//
// ⚠️ Re-adding a per-project read command re-opens the N+1. `read_default_model` itself is NOT
// dead and is deliberately not on the IPC surface — `cc_session` calls it in-process at spawn.

/// Set (`Some`) or clear (`None`) a project's CC model override.
///
/// Takes effect on that project's **next** CC spawn — argv is fixed once per process,
/// exactly like the app-global permission mode. A blank string is normalized to "clear",
/// so the frontend may forward a trimmed-empty input without special-casing it.
/// An unknown path is an error (there is no record to attach the value to).
#[tauri::command]
pub fn project_set_default_model(
    app: AppHandle,
    path: String,
    model: Option<String>,
) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    set_default_model(&dir, Path::new(&path), model).map_err(|e| e.to_string())
}

/// Set (`Some`) or clear (`None`) a project's workflow drive mode (M12 WP4c).
///
/// Takes effect on that project's **next** CC spawn: the mode is read at spawn time and
/// becomes the `CLAUDESK_DRIVE_MODE` env var gating the `UserPromptSubmit` hook. An
/// unknown path is an error — there is no record to attach the value to, and reporting
/// success for a write that vanishes on the next read is worse than failing.
///
/// ⚠️ **`mode` is TYPED (`Option<DriveMode>`), deliberately unlike
/// [`project_set_default_model`]'s free `Option<String>`** — a correctness requirement, not
/// a style choice: one unrecognized drive-mode string fails `serde` on read and takes the
/// whole project list with it (`tests::an_unknown_drive_mode_string_fails_the_whole_project_list`).
/// Do NOT "harmonize" this to a `String`. The full open-vs-closed comparison is stated once,
/// at `src/cc/driveMode.ts`; it is deliberately not restated here.
///
/// Clearing removes the key from disk (via `skip_serializing_if`) rather than writing
/// `null`, which is what makes "absent → do not set the env var" one code path instead of
/// two.
#[tauri::command]
pub fn project_set_default_drive_mode(
    app: AppHandle,
    path: String,
    mode: Option<DriveMode>,
) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    set_default_drive_mode(&dir, Path::new(&path), mode).map_err(|e| e.to_string())?;
    // M13.5 WP4 P3.1 — broadcast so the OTHER surface re-syncs. Emitted only after the write
    // succeeds: a fan-out for a value that never reached disk would make both surfaces agree on
    // something `read_projects` will not return.
    let _ = app.emit(
        PROJECT_DRIVE_MODE_EVENT,
        ProjectDriveModeChanged { path, mode },
    );
    Ok(())
}

/// Set whether the workflow supervisor may act on this project (M14 WP0).
///
/// ⚠️ **NO BROADCAST EVENT, AND THAT IS A DECISION — NOT AN OVERSIGHT.** The drive-mode command
/// directly above emits one because that value has **two** surfaces to keep in sync (the picker
/// row and the workspace header), and its own doc records that the fan-out was added only once
/// the second surface appeared. The supervisor toggle has **exactly one** surface — the workspace
/// header (spec decision D-3) — so a broadcast would have a single consumer: the component that
/// just called this. That is sync machinery paid forever for nothing, which is precisely the
/// reasoning M12 used before the second surface existed.
///
/// ⚠️ **If a second surface is ever added (a picker-row cell, a PiP badge), the event comes WITH
/// it.** Do not add one speculatively, and do not read this absence as an inconsistency with the
/// sibling command.
#[tauri::command]
pub fn project_set_supervisor_enabled(
    app: AppHandle,
    path: String,
    enabled: bool,
) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    set_supervisor_enabled(&dir, Path::new(&path), enabled).map_err(|e| e.to_string())
}

/// The Tauri event broadcast when a project's drive mode changes — the M13.5 WP4 P3.1 fan-out.
///
/// ⚠️ **This is a DELIBERATE REVERSAL of M12's no-broadcast decision, and the condition it named
/// has now been met.** `driveModeIpc.ts` said outright: *"This value is per-project and has
/// exactly ONE surface — the picker row that just changed it — so a fan-out would have one
/// subscriber. If a genuinely second surface ever appears (a workspace-header readout, a
/// filmstrip badge), add the event then."* WP4 added the workspace-header readout, so this is
/// the extension that comment specified rather than an unplanned change.
///
/// ⚠️ **Not a copy of `CC_PERMISSION_MODE_EVENT`'s payload, and the difference is the bug it
/// prevents.** The permission mode is **app-global**, so it broadcasts a bare enum. This value is
/// **per-project**: a bare mode would tell every open workspace to adopt one project's new
/// setting. The path is what lets a subscriber decide whether the change is theirs.
pub const PROJECT_DRIVE_MODE_EVENT: &str = "project-drive-mode";

/// The [`PROJECT_DRIVE_MODE_EVENT`] payload: which project changed, and to what.
///
/// `mode: None` means the override was cleared — the same "absent → the hook stays inert" state
/// the store records by removing the key, not a distinct third value.
#[derive(Clone, serde::Serialize)]
pub struct ProjectDriveModeChanged {
    pub path: String,
    pub mode: Option<DriveMode>,
}

/// Read one project's **stored** drive mode — what its NEXT CC spawn will use (M13.5 WP4 P2.1).
///
/// ⚠️ **This is NOT the `getProjectDefaultDriveMode` that `driveModeIpc.ts` refuses to ship, and
/// the distinction is the whole reason this is allowed to exist.** That refusal is about
/// **per-picker-row** reads: M11.5's repair (B) removed exactly that shape, where each of N rows
/// re-read + re-parsed + re-sorted the whole `projects.json` for a field `list_projects` had
/// already put on the wire — and because filtered-out rows unmount, clearing the filter box
/// re-fired all N
/// (`SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE`).
///
/// A workspace is a different shape: there are a handful open at once, not 20+; the workspace
/// model carries no project record to seed from (only `project_path`); and the alternative —
/// threading the mode through `openWorkspace`'s argument list — walks straight into the arity
/// trap that has dropped a parameter **four times** in this milestone
/// (`pickerOnOpenArity.test.ts` exists because of it). One read per open workspace, on the same
/// gated + visible-only path as the next-open indicator, is the cheaper and safer seam.
///
/// ⚠️ **Returns the STORED value, never the running one.** What the live session actually
/// spawned under is `cc_session::commands::cc_drive_mode`; a live process's env is fixed, so the
/// two disagree the moment the operator changes the mode mid-session. Reading this one and
/// calling it "the session's mode" is the confabulation this pair of commands exists to prevent.
///
/// A project with no record, or an unreadable list, yields `None` rather than an error: the cost
/// of a missing readout is a label that does not appear, whereas a rejected `invoke` would put an
/// error on a purely advisory surface. Same posture as `picker_announce_actions`.
#[tauri::command]
pub fn project_get_default_drive_mode(app: AppHandle, path: String) -> Option<DriveMode> {
    let Ok(dir) = resolve_data_dir(&app) else {
        return None;
    };
    crate::config_store::read_default_drive_mode(&dir, Path::new(&path))
        .ok()
        .flatten()
}

/// Read whether the workflow supervisor may act on this project (M14 WP0).
///
/// ⚠️ **Degrades to `true`, NOT `false`, on every failure path** — an unresolvable data dir, an
/// unreadable list, or a project with no record. The ruled default is ON, and a degraded read
/// that answered `false` would silently unsupervise a project for reasons the operator can
/// neither see nor fix. ⚠️ **This is the opposite posture from the drive-mode getter beside it**,
/// and deliberately so: there, `None` means "pin no mode", which is the safe direction for a
/// value consumed as an env var. Here, `false` is a *policy decision the operator made*, so it
/// must never be manufactured by a failure.
#[tauri::command]
pub fn project_get_supervisor_enabled(app: AppHandle, path: String) -> bool {
    let Ok(dir) = resolve_data_dir(&app) else {
        return true;
    };
    crate::config_store::read_supervisor_enabled(&dir, Path::new(&path))
}

// ---------------------------------------------------------------------------
// F-b — profiles (named `CLAUDE_CONFIG_DIR`s)
// ---------------------------------------------------------------------------

/// The listed profiles, in list order. The built-in `"default"` is never included — the
/// frontend renders it itself. A malformed `profiles.json` is an error (never read as empty,
/// which would let the next write wipe it).
#[tauri::command]
pub fn profiles_list(app: AppHandle) -> Result<Vec<super::profiles::Profile>, String> {
    let dir = resolve_data_dir(&app)?;
    super::profiles::read_profiles(&dir).map_err(|e| e.to_string())
}

/// Adopt an existing directory as a profile. `name: None` derives one from the basename
/// (`claude-neo` → `neo`). Writes nothing into the directory in this phase.
#[tauri::command]
pub fn profile_adopt(
    app: AppHandle,
    config_dir: String,
    name: Option<String>,
) -> Result<super::profiles::Profile, String> {
    let dir = resolve_data_dir(&app)?;
    super::profiles::adopt(&dir, Path::new(&config_dir), name.as_deref()).map_err(|e| e.to_string())
}

/// One project's STORED profile reference (`None` = default, or no record). The workspace's
/// pre-session workflow-applicability input; once a session exists, `cc_session_profile` wins.
/// A read error is an error, so the frontend fails closed rather than guessing "default".
#[tauri::command]
pub fn project_get_profile(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let dir = resolve_data_dir(&app)?;
    super::read_project_profile(&dir, Path::new(&path)).map_err(|e| e.to_string())
}

/// Remove a profile from the list, leaving its directory untouched ("remove from Claudesk").
/// Rows that reference it degrade to the missing-profile state (spawn refused, A.6).
/// ⚠️ Phase 3 adds the hook UNREGISTER from the dir's `settings.json` here, before the drop.
#[tauri::command]
pub fn profile_remove(app: AppHandle, name: String) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    super::profiles::remove_entry(&dir, &name)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Set (`Some(name)`) or clear (`None` / `"default"`) the profile a project spawns under.
///
/// ⚠️ **Refuses a name that is not listed** — the store would keep it, but a row pointed at an
/// unlisted profile from the UI is a bug, not a state to create on purpose.
///
/// ⚠️ **F-b A.11 — a CHANGE clears the row's unclean-exit flag** (through `session_state`'s
/// `key_for`, like every other flag access). Otherwise the next open would fire `--continue`
/// into a profile with no conversation for this directory, which CC answers by exiting
/// (probe P1.1 (2)). Setting the same value again leaves the flag alone.
#[tauri::command]
pub fn set_project_profile(
    app: AppHandle,
    path: String,
    profile: Option<String>,
) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    apply_project_profile(&dir, &path, profile)
}

/// The testable body of [`set_project_profile`].
pub(crate) fn apply_project_profile(
    data_dir: &Path,
    path: &str,
    profile: Option<String>,
) -> Result<(), String> {
    use super::profiles::{resolve, ResolvedProfile};
    let list = super::profiles::read_profiles(data_dir).map_err(|e| e.to_string())?;
    let next = match resolve(&list, profile.as_deref()) {
        ResolvedProfile::Default => None,
        ResolvedProfile::Listed(p) => Some(p.name),
        ResolvedProfile::Missing(n) => return Err(format!("no profile named \"{n}\"")),
    };
    let before =
        super::read_project_profile(data_dir, Path::new(path)).map_err(|e| e.to_string())?;
    super::set_project_profile(data_dir, Path::new(path), next.clone())
        .map_err(|e| e.to_string())?;
    if before != next {
        crate::session_state::clear_and_persist(data_dir, path);
    }
    Ok(())
}

#[cfg(test)]
mod tests {

    #[test]
    fn profile_apply_refuses_unlisted_and_clears_the_flag_only_on_change() {
        let data = tempfile::TempDir::new().unwrap();
        let cfg = tempfile::TempDir::new().unwrap();
        let prof = cfg.path().join("claude-neo");
        std::fs::create_dir(&prof).unwrap();
        crate::config_store::profiles::adopt(data.path(), &prof, None).unwrap();
        crate::config_store::add_or_touch(data.path(), PathBuf::from("/proj"), 1).unwrap();

        assert!(apply_project_profile(data.path(), "/proj", Some("gone".into())).is_err());

        // A change clears the flag.
        crate::session_state::set_and_persist(data.path(), "/proj");
        apply_project_profile(data.path(), "/proj", Some("neo".into())).unwrap();
        assert!(!crate::session_state::is_unclean_keyed(
            &crate::session_state::read(data.path()),
            "/proj"
        ));
        // Re-setting the same value does not.
        crate::session_state::set_and_persist(data.path(), "/proj");
        apply_project_profile(data.path(), "/proj", Some("neo".into())).unwrap();
        assert!(crate::session_state::is_unclean_keyed(
            &crate::session_state::read(data.path()),
            "/proj"
        ));
        // Back to default: a change again.
        apply_project_profile(data.path(), "/proj", Some("default".into())).unwrap();
        assert_eq!(
            crate::config_store::read_project_profile(data.path(), Path::new("/proj")).unwrap(),
            None
        );
        assert!(!crate::session_state::is_unclean_keyed(
            &crate::session_state::read(data.path()),
            "/proj"
        ));
    }
    use super::*;
    use tempfile::TempDir;

    /// Build a `<root>/<prod-id>/` and `<root>/<dev-id>/` sibling layout mirroring
    /// the real `…/Application Support/<identifier>/` shape. Returns the dev dir.
    fn sibling_layout(root: &Path, prod_id: &str, dev_id: &str) -> PathBuf {
        std::fs::create_dir_all(root.join(prod_id)).unwrap();
        let dev_dir = root.join(dev_id);
        std::fs::create_dir_all(&dev_dir).unwrap();
        dev_dir
    }

    #[test]
    fn seed_copies_prod_list_into_empty_dev_dir() {
        let tmp = TempDir::new().unwrap();
        let dev_dir = sibling_layout(tmp.path(), "com.claudesk.app", "com.claudesk.app.dev");
        std::fs::write(
            tmp.path().join("com.claudesk.app").join(PROJECTS_FILE),
            br#"{"projects":["real"]}"#,
        )
        .unwrap();

        let res = seed_dev_projects(&dev_dir, "com.claudesk.app.dev").unwrap();
        assert!(res.is_some(), "should have copied");
        let seeded = std::fs::read(dev_dir.join(PROJECTS_FILE)).unwrap();
        assert_eq!(seeded, br#"{"projects":["real"]}"#);
    }

    #[test]
    fn seed_is_noop_for_prod_identity() {
        let tmp = TempDir::new().unwrap();
        // dev_dir arg is irrelevant here — prod identity returns early.
        let res = seed_dev_projects(tmp.path(), "com.claudesk.app").unwrap();
        assert!(res.is_none(), "prod build must never seed");
    }

    #[test]
    fn seed_never_clobbers_existing_dev_list() {
        let tmp = TempDir::new().unwrap();
        let dev_dir = sibling_layout(tmp.path(), "com.claudesk.app", "com.claudesk.app.dev");
        std::fs::write(
            tmp.path().join("com.claudesk.app").join(PROJECTS_FILE),
            br#"{"projects":["prod"]}"#,
        )
        .unwrap();
        // Dev already has its own divergent list.
        std::fs::write(dev_dir.join(PROJECTS_FILE), br#"{"projects":["dev-own"]}"#).unwrap();

        let res = seed_dev_projects(&dev_dir, "com.claudesk.app.dev").unwrap();
        assert!(res.is_none(), "must not overwrite an existing dev list");
        let kept = std::fs::read(dev_dir.join(PROJECTS_FILE)).unwrap();
        assert_eq!(
            kept, br#"{"projects":["dev-own"]}"#,
            "dev's own list preserved"
        );
    }

    #[test]
    fn seed_is_noop_when_no_prod_list_exists() {
        let tmp = TempDir::new().unwrap();
        let dev_dir = sibling_layout(tmp.path(), "com.claudesk.app", "com.claudesk.app.dev");
        // No prod projects.json written → nothing to seed from.
        let res = seed_dev_projects(&dev_dir, "com.claudesk.app.dev").unwrap();
        assert!(res.is_none(), "no prod list → dev starts empty");
        assert!(!dev_dir.join(PROJECTS_FILE).exists());
    }
}
