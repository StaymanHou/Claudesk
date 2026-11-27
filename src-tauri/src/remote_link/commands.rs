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
use crate::remote_record::SessionRecordState;

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
    let registry = Arc::new(LinkRegistry::new(
        Arc::new(SshTransport),
        app_data,
        local_socket,
        identifier,
        sink,
    ));
    // M18 WP4: a host's substrate change reaches every `useHostSubstrate` as `remote-substrate`.
    let emitter = app.clone();
    registry.set_substrate_sink(Arc::new(move |ev| {
        if let Err(e) = emitter.emit(crate::remote_substrate::SUBSTRATE_EVENT, &ev) {
            eprintln!("[claudesk] remote-substrate emit failed: {e}");
        }
    }));
    Ok(registry)
}

/// The validated remote target of the stored row keyed `project_path`. ⚠️ THE way a stored row
/// reaches ssh: the row is re-validated here (`RemoteTarget::validated`), so a hand-edited
/// `projects.json` is refused with the reason rather than passed through (operator decision,
/// M17 WP3: such a row stays listed and refuses to open).
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

/// What the picker learns before it opens a remote row (
/// `SURFACE-2026-11-16-REMOTE-OPEN-MUST-CHECK-THE-FOLDER-STILL-EXISTS`), and since M17 WP5 what the
/// open DOES (AC-3). Each kind that stops the open carries its plain-words message. ⚠️ A missing
/// folder and an unreachable host are DIFFERENT kinds on purpose: only the first may offer Remove,
/// and neither removes anything by itself.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum OpenCheck {
    /// No live session: start CC through the two-signal rule, from these signals (M17 WP5 Phase 2).
    Start(StartSignals),
    /// A live session Claudesk left running: attach to it and fire nothing (R-2). `mode` is the
    /// mode it was spawned under, when known.
    Reconnect {
        mode: Option<crate::config_store::DriveMode>,
    },
    /// A live session the operator closed while the host was unreachable (R-4, dialog A).
    AskEndPending {
        message: String,
    },
    /// A live session Claudesk has no record of starting (R-4, dialog B).
    AskUnrecorded {
        message: String,
    },
    FolderMissing {
        message: String,
    },
    Unreachable {
        message: String,
    },
    Invalid {
        message: String,
    },
}

/// The resume signals of a dead remote session (M17 WP5 Phase 2, AC-3.3): the frontend's
/// `predictAction` turns them into the action (its precedence rule has ONE home, there). Every
/// signal reads as `false` when it could not be read: a fresh session is the safe side.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSignals {
    /// The LOCAL unclean-exit flag for the row (read, never consumed here: the spawn consumes it).
    pub unclean_flag: bool,
    /// The REMOTE `workflow-system/state/.session.md` exists (`false` with the gate off: not read).
    pub session_md: bool,
    /// The remote CC has trusted the folder (its physical path or an ancestor).
    pub trusted: bool,
    /// M18 WP2: the remote account has accepted CC's bypass-permissions warning. A fire-time input
    /// (`bypass_dialog_cleared`), not a resume signal, so it is not sent to the picker.
    #[serde(skip)]
    pub bypass_accepted: bool,
    /// M18 WP4: the host's workflow substrate AS THIS CHECK OBSERVED IT (`None` = not probed: the
    /// gate was OFF). The picker's open reads its funnel host input from HERE, not from its cached
    /// map: that map is the value from the last render, before this check wrote the cache, and the
    /// `remote-substrate` event is not ordered against this command's response.
    pub host_substrate: Option<crate::remote_substrate::HostSubstrate>,
}

/// The open decision (M17 WP5, AC-3), from the open check's exec and the LOCAL record. Pure, so
/// each arm is mutation-provable.
///
/// - No answer (an ssh failure, or noise without both lines) → unreachable. ⚠️ NEVER a missing
///   folder: only a definite `dir:no` may lead to Remove.
/// - Live: the record decides. `running` → reconnect; `end-pending` → ask (A); anything else → ask
///   (B): a live session Claudesk did not leave running is never joined without asking (A8).
/// - Not live: a missing folder → folder-missing; otherwise start.
pub(crate) fn decide_open(
    out: Result<String, crate::subprocess::RunError>,
    record: Option<SessionRecordState>,
    unclean_flag: bool,
    target: &ValidTarget,
) -> OpenDecision {
    let host = crate::cc_session::short_host(target.host());
    let Some(facts) = out
        .as_ref()
        .ok()
        .and_then(|o| crate::remote_cmd::parse_open_facts(o))
    else {
        return OpenDecision::plain(OpenCheck::Unreachable {
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
        });
    };
    // M18 WP4: the substrate the same exec probed (gate ON), whatever the decision below.
    let substrate = facts
        .substrate
        .as_ref()
        .map(crate::remote_substrate::HostSubstrate::from_read);
    if facts.live {
        let decision = match record {
            Some(SessionRecordState::Running) => OpenCheck::Reconnect {
                mode: facts.mode.mode(),
            },
            Some(SessionRecordState::EndPending) => OpenCheck::AskEndPending {
                message: format!(
                    "You closed this while {host} was unreachable, so its Claude Code session is \
                     still running there."
                ),
            },
            Some(SessionRecordState::Ended) | None => OpenCheck::AskUnrecorded {
                message: format!(
                    "A Claude Code session for this project is already running on {host}."
                ),
            },
        };
        return OpenDecision::plain(decision).with_substrate(substrate);
    }
    let clear = record == Some(SessionRecordState::EndPending);
    if !facts.folder {
        return OpenDecision {
            check: OpenCheck::FolderMissing {
                message: format!(
                    "{} no longer exists on {}. Remove this project, or restore the folder there.",
                    target.path(),
                    target.host()
                ),
            },
            clear_end_pending: clear,
            notice: None,
            substrate,
        };
    }
    // AC-2.3: the label promised a live session (or a question) that is no longer there.
    let notice = match record {
        Some(SessionRecordState::Running) => Some(format!(
            "The Claude Code session on {host} had ended since Claudesk last saw it, so it was \
             started again."
        )),
        Some(SessionRecordState::EndPending) => Some(format!(
            "The session you closed while {host} was unreachable had already ended, so there was \
             nothing to ask."
        )),
        _ => None,
    };
    // M18 WP4 (§R.1) — the restore arm goes through THE funnel with the host's substrate as its
    // third input. ONE control: the exec carries the workflow lines (`.session.md` + the probe)
    // only when `workflow_applicable_before_host_probe` was ON, so "it probed" IS that gate, as
    // the exec observed it; a second, independent gate check here would mask the first (the
    // redundant-controls pattern, `announce::announce_actions`). Absent / unknown → no restore.
    let restore_applicable = substrate.as_ref().is_some_and(|s| {
        crate::config_store::profiles::workflow_applicable(
            true,
            None,
            crate::config_store::profiles::HostInput::Remote(s),
        )
    });
    let physical = facts.real.as_deref().unwrap_or(target.path());
    let trusted_keys: Vec<&str> = facts.trusted_keys.iter().map(String::as_str).collect();
    OpenDecision {
        check: OpenCheck::Start(StartSignals {
            unclean_flag,
            session_md: facts.session_md && restore_applicable,
            trusted: crate::folder_trust::trust_covers(
                &trusted_keys,
                std::path::Path::new(physical),
            ),
            bypass_accepted: facts.bypass_accepted,
            host_substrate: substrate.clone(),
        }),
        clear_end_pending: clear,
        notice,
        substrate,
    }
}

/// [`decide_open`]'s result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct OpenDecision {
    pub check: OpenCheck,
    /// A stale `end-pending` to clear: the session it was about has ended anyway (A7).
    pub clear_end_pending: bool,
    /// What the workspace should say because the picker's label (read from the local record)
    /// predicted something else (AC-2.3).
    pub notice: Option<String>,
    /// M18 WP4 (D5): the host's substrate, when this check probed it (the gate was ON and the
    /// exec answered). `None` leaves the per-host cache as it was.
    pub substrate: Option<crate::remote_substrate::HostSubstrate>,
}

impl OpenDecision {
    fn plain(check: OpenCheck) -> Self {
        Self {
            check,
            clear_end_pending: false,
            notice: None,
            substrate: None,
        }
    }

    /// The same decision, carrying the substrate the check probed.
    fn with_substrate(mut self, substrate: Option<crate::remote_substrate::HostSubstrate>) -> Self {
        self.substrate = substrate;
        self
    }
}

/// Apply an open decision's LOCAL side effects for the row `key`, and return what the picker is
/// told (M17 WP5). Extracted from `remote_open_check` so each write is driven by a test:
/// - a stale `end-pending` is cleared (A7);
/// - the workspace's notice is left (or an older one cleared) (AC-2.3);
/// - the fire-time trust answer is OVERWRITTEN by every check: a start's remote trust, else
///   untrusted. ⚠️ `folder_trusted` answers a remote row from it, and it is what withholds the
///   auto-fired `/session-restore` in an untrusted folder, so no outcome may leave an older `true`.
pub(crate) fn settle_open_decision(
    dir: &std::path::Path,
    links: &super::LinkRegistry,
    key: &str,
    decision: OpenDecision,
) -> OpenCheck {
    if decision.clear_end_pending {
        crate::remote_record::record_state(dir, key, SessionRecordState::Ended);
    }
    links.set_open_notice(key, decision.notice);
    links.set_open_trust(
        key,
        matches!(&decision.check, OpenCheck::Start(signals) if signals.trusted),
    );
    links.set_open_bypass(
        key,
        matches!(&decision.check, OpenCheck::Start(signals) if signals.bypass_accepted),
    );
    // M18 WP4 (D5): only a check that probed writes the host's substrate; any other outcome
    // (unreachable, invalid, gate OFF) leaves the last known value.
    if let (Some(substrate), Some((host, _))) =
        (decision.substrate, config_store::split_remote_key(key))
    {
        links.set_substrate(host, substrate);
    }
    decision.check
}

/// M17 WP5 (R-4 dialogs' "End it" buttons, P4.2): end the remote CC session of the row
/// `project_path` so the open that follows starts fresh: cancel copy-mode, then end the tmux
/// session over the link (the same end a close runs), marked as a close so a racing respawn waits.
/// The record becomes `ended` only when the end ran ([`settle_end`]). The link lingers
/// [`OPEN_CHECK_GRACE`], since the picker re-runs the open check at once.
#[tauri::command]
pub async fn remote_end_session(
    app: AppHandle,
    links: State<'_, SharedLinks>,
    project_path: String,
) -> Result<(), String> {
    let dir = resolve_data_dir(&app)?;
    let links = Arc::clone(&links);
    crate::blocking::on_blocking_worker("ending the remote session", move || {
        let target = target_for(&dir, &project_path)?;
        let (_, hold) = links.ensure_and_hold(&target)?;
        let session = crate::remote_cmd::tmux_session(&project_path);
        let result = {
            let _closing = links.begin_close(&session);
            let _ = links.cancel_copy_mode(&target, &session);
            links.end_session(&target, &session).map(|_| ())
        };
        drop(hold.linger(OPEN_CHECK_GRACE));
        settle_end(&dir, &project_path, result)
    })
    .await
}

/// [`remote_end_session`]'s outcome: a delivered end records the session `ended` (so the next
/// open's decision starts fresh and the label clears); a failed one writes nothing (the record
/// keeps saying what is true: the session may still run) and says why in plain words.
pub(crate) fn settle_end(
    dir: &std::path::Path,
    key: &str,
    result: Result<(), super::CloseExecError>,
) -> Result<(), String> {
    match result {
        Ok(()) => {
            crate::remote_record::record_state(dir, key, SessionRecordState::Ended);
            Ok(())
        }
        Err(e) => Err(format!("could not end the Claude Code session: {e}")),
    }
}

/// End the open check's hold on the link. After a start or reconnect an open follows within a second, so the hold
/// lingers `grace` (the open's spawn then finds the link Up). After anything else nothing follows,
/// so the hold drops plainly and an otherwise-unheld link stops at once.
pub(crate) fn release_check_hold(hold: super::LinkHold, outcome: &OpenCheck, grace: Duration) {
    if matches!(outcome, OpenCheck::Start(_) | OpenCheck::Reconnect { .. }) {
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

/// M18 WP4 (§R.2): every probed host's workflow substrate, by host: the one seed of the frontend's
/// substrate store (`useHostSubstrate` / `useHostSubstrates`), which then tracks `remote-substrate`.
/// A host never probed in this app session is absent (the frontend reads it as closed).
///
/// Sync on purpose: a short lock read, no I/O (`tests/sync_commands_do_not_block.rs`).
#[tauri::command]
pub fn remote_host_substrates(
    links: State<'_, SharedLinks>,
) -> std::collections::HashMap<String, crate::remote_substrate::HostSubstrate> {
    links.substrates()
}

/// M18 WP5 (§R.5) — one entry of Settings → Remote hosts: a distinct host among the remote rows.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct RemoteHostEntry {
    pub host: String,
    /// The host's link is Up now, so a refresh can ask it (Settings never brings one up).
    pub link_up: bool,
    /// The last substrate this app session observed (`Unknown` when never probed).
    pub substrate: crate::remote_substrate::HostSubstrate,
}

/// The distinct hosts of the VALID remote rows in `projects`, sorted, each with one of its rows'
/// targets (any row will do: a refresh asks the host account, not the project folder). A row that
/// fails validation is skipped, as it refuses to open.
pub(crate) fn remote_hosts_of(projects: &[config_store::Project]) -> Vec<ValidTarget> {
    let mut by_host = std::collections::BTreeMap::new();
    for target in projects
        .iter()
        .filter_map(|p| p.remote.as_ref()?.validated().ok())
    {
        by_host.entry(target.host().to_string()).or_insert(target);
    }
    by_host.into_values().collect()
}

/// M18 WP5 (§R.5): the hosts Settings → Remote hosts lists, with each one's link state and cached
/// substrate. Empty when there is no valid remote row (the group is then not shown).
///
/// Sync on purpose: one bounded local read of `projects.json` and short lock reads, no ssh.
#[tauri::command]
pub fn remote_hosts(
    app: AppHandle,
    links: State<'_, SharedLinks>,
) -> Result<Vec<RemoteHostEntry>, String> {
    let dir = resolve_data_dir(&app)?;
    let projects = config_store::read_projects(&dir).map_err(|e| e.to_string())?;
    Ok(remote_hosts_of(&projects)
        .into_iter()
        .map(|t| RemoteHostEntry {
            link_up: links.state(t.host()) == Some(super::LinkState::Up),
            substrate: links.substrate(t.host()),
            host: t.host().to_string(),
        })
        .collect())
}

/// M18 WP5 — what one Settings refresh of a host found.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum RefreshOutcome {
    /// The host answered: its substrate (now cached) and, when there is something to compare, the
    /// drift verdict.
    Checked {
        substrate: crate::remote_substrate::HostSubstrate,
        drift: Option<crate::remote_substrate::Drift>,
    },
    /// The host's link is not Up: nothing was sent, and the cache is unchanged (D4).
    LinkDown,
    /// The exec ran and failed; the cache is unchanged.
    Failed { reason: String },
}

/// M18 WP5 (§R.4, §R.5): re-probe `host`'s substrate and read its drift against GitHub, in ONE exec
/// over the host's master. Run by Settings → Remote hosts while it is shown, never on open or by a
/// timer (prior `background-work-only-for-what-is-on-screen`).
///
/// ⚠️ It never brings a link up and never holds one: `master_exec` is Up-only and master-only, so
/// a host with no live link answers [`RefreshOutcome::LinkDown`] at the cost of a lock read (D4).
/// `host` must be the host of a remote row; any other value is refused before anything runs.
#[tauri::command]
pub async fn remote_substrate_refresh(
    app: AppHandle,
    links: State<'_, SharedLinks>,
    host: String,
) -> Result<RefreshOutcome, String> {
    let dir = resolve_data_dir(&app)?;
    let links = Arc::clone(&links);
    crate::blocking::on_blocking_worker("checking the remote host", move || {
        let projects = config_store::read_projects(&dir).map_err(|e| e.to_string())?;
        let target = remote_hosts_of(&projects)
            .into_iter()
            .find(|t| t.host() == host)
            .ok_or_else(|| format!("{host} is not the host of a remote project"))?;
        let out = links.master_exec(
            &target,
            &crate::remote_cmd::substrate_refresh_command(
                crate::remote_cmd::substrate_home_override().as_deref(),
            ),
            super::EXEC_TIMEOUT_MS,
        );
        Ok(settle_refresh(&links, &host, out))
    })
    .await
}

/// A refresh exec's result → the outcome, writing the cache ONLY when the host answered (D3): the
/// same `set_substrate` the open check uses, so every `useHostSubstrate` hears the change.
///
/// ⚠️ "Answered" means the PROBE answered, not just the exec. The refresh script prints
/// `substrate-probed` before the probe runs, so a probe that printed nothing (no perl, a broken
/// read) still parses, as `Unknown`. Settings is a read-only readout: an `Unknown` from it must
/// never demote a known host, because Unknown fails CLOSED in the funnel and would hide the
/// workflow surfaces of every open workspace on that host (M18 WP6,
/// `SURFACE-2026-11-20-QUALITY-SETTINGS-REFRESH-WRITES-UNKNOWN-OVER-A-KNOWN-HOST`). It answers
/// `Failed` and leaves the cache as it was. The open check is different: it writes `Unknown` (WP4
/// D5), because it is deciding a fresh open.
pub(crate) fn settle_refresh(
    links: &LinkRegistry,
    host: &str,
    out: Result<String, super::CloseExecError>,
) -> RefreshOutcome {
    let out = match out {
        Err(super::CloseExecError::LinkNotUp) => return RefreshOutcome::LinkDown,
        Err(e) => {
            return RefreshOutcome::Failed {
                reason: e.to_string(),
            }
        }
        Ok(out) => out,
    };
    let Some(facts) = crate::remote_cmd::parse_refresh(&out) else {
        return RefreshOutcome::Failed {
            reason: "the host printed no answer".to_string(),
        };
    };
    let substrate = crate::remote_substrate::HostSubstrate::from_read(&facts.substrate);
    if substrate == crate::remote_substrate::HostSubstrate::Unknown {
        return RefreshOutcome::Failed {
            reason: "the host's substrate probe printed no answer".to_string(),
        };
    }
    links.set_substrate(host, substrate.clone());
    RefreshOutcome::Checked {
        drift: crate::remote_substrate::Drift::decide(&substrate, facts.drift.as_ref()),
        substrate,
    }
}

/// M18 WP6 — re-read the remote account's bypass-warning answer for `project_path`, so a
/// Recycle respawn decides on today's answer, not the last open check's
/// (`SURFACE-2026-11-18-QUALITY-REMOTE-BYPASS-ANSWER-STALE-ACROSS-RECYCLE`: accepting the warning
/// wrote the key on the host, but every later Recycle still withheld `/session-restore`).
///
/// Answers `Some(accepted)` when the host answered (now cached), `None` when nothing could be read:
/// a local key, a row that is gone, a link that is not Up, or a failed exec. `None` keeps the cached
/// answer, which fails safe (one typed command, never a lost session). Up-only and master-only
/// (`master_exec`): it never brings a link up.
#[tauri::command]
pub async fn remote_bypass_refresh(
    app: AppHandle,
    links: State<'_, SharedLinks>,
    project_path: String,
) -> Result<Option<bool>, String> {
    if config_store::split_remote_key(&project_path).is_none() {
        return Ok(None);
    }
    let dir = resolve_data_dir(&app)?;
    let links = Arc::clone(&links);
    crate::blocking::on_blocking_worker("re-reading the bypass warning", move || {
        let Ok(target) = target_for(&dir, &project_path) else {
            return Ok(None);
        };
        let out = links.master_exec(
            &target,
            &crate::remote_cmd::bypass_refresh_command(),
            super::EXEC_TIMEOUT_MS,
        );
        Ok(settle_bypass_refresh(&links, &project_path, out))
    })
    .await
}

/// A bypass re-read's result → the cached answer. Writes ONLY when the host answered (the
/// `bypass-probed` marker came back); every other outcome leaves the cache as it was.
pub(crate) fn settle_bypass_refresh(
    links: &super::LinkRegistry,
    key: &str,
    out: Result<String, super::CloseExecError>,
) -> Option<bool> {
    let accepted = crate::remote_cmd::parse_bypass_refresh(&out.ok()?)?;
    links.set_open_bypass(key, accepted);
    Some(accepted)
}

/// The notice the last open check left for the workspace it opened (M17 WP5, AC-2.3), taken once,
/// or `None`. Read by the remote workspace once its spawn resolved, like `remote_hook_warning`.
///
/// Sync on purpose: a short lock read, no I/O (`tests/sync_commands_do_not_block.rs`).
#[tauri::command]
pub fn remote_open_notice(links: State<'_, SharedLinks>, project_path: String) -> Option<String> {
    links.take_open_notice(&project_path)
}

/// Before the picker opens a remote row: validate it, bring its link up, and decide what the open
/// does (M17 WP5, AC-3) from ONE exec over the master (folder, live session, its mode) and the
/// LOCAL session record. Read-only on the remote. The link lingers [`OPEN_CHECK_GRACE`] after a
/// start or reconnect, and stops at once after anything else (if unheld).
#[tauri::command]
pub async fn remote_open_check(
    app: AppHandle,
    links: State<'_, SharedLinks>,
    project_path: String,
) -> Result<OpenCheck, String> {
    let dir = resolve_data_dir(&app)?;
    let links = Arc::clone(&links);
    crate::blocking::on_blocking_worker("checking the remote project", move || {
        // ⚠️ EVERY outcome, the invalid row and the unreachable host included, goes through
        // `settle_open_decision`, so each check overwrites the fire-time trust answer: no earlier
        // `true` survives a later check that could not read the remote.
        let (decision, hold) = match target_for(&dir, &project_path) {
            Err(message) => (OpenDecision::plain(OpenCheck::Invalid { message }), None),
            // ⚠️ The check HOLDS the link for its own duration
            // (`SURFACE-2026-11-16-QUALITY-M17WP3-OPEN-CHECK-LEAKS-AN-UNHELD-LINK`). Only a start
            // or a reconnect lingers, because only those are followed by an open. Every other
            // outcome drops the hold plainly, so a check that leads nowhere leaves no `ssh -M`.
            Ok(target) => match links.ensure_and_hold(&target) {
                Err(message) => (
                    OpenDecision::plain(OpenCheck::Unreachable { message }),
                    None,
                ),
                Ok((_, hold)) => {
                    let out = links.exec(
                        &target,
                        &crate::remote_cmd::open_check_command(
                            crate::remote_cmd::tmux_server(links.identifier()),
                            &crate::remote_cmd::tmux_session(&project_path),
                            target.path(),
                            // The `/session-restore` arm is gated (a remote row has no profile):
                            // with the gate OFF the remote project folder is not read at all, and
                            // neither is the host's substrate. M18 WP4: this check PRODUCES the
                            // funnel's host input, so it decides only whether to probe;
                            // `decide_open` applies the full funnel to what it probed.
                            crate::config_store::profiles::workflow_applicable_before_host_probe(
                                crate::config_store::settings::read_workflow_features_enabled(&dir)
                                    .unwrap_or(false),
                                None,
                            ),
                            // M18 WP4 (D2): a debug build's sandbox root; `None` in release.
                            crate::remote_cmd::substrate_home_override().as_deref(),
                        ),
                        super::EXEC_TIMEOUT_MS,
                    );
                    let record = crate::remote_record::get(&dir, &project_path).map(|r| r.state);
                    let unclean = crate::session_state::is_unclean_keyed(
                        &crate::session_state::read(&dir),
                        &project_path,
                    );
                    (decide_open(out, record, unclean, &target), Some(hold))
                }
            },
        };
        let check = settle_open_decision(&dir, &links, &project_path, decision);
        if let Some(hold) = hold {
            release_check_hold(hold, &check, OPEN_CHECK_GRACE);
        }
        Ok(check)
    })
    .await
}

/// M17 WP5 (AC-8.2) — the shared closure of a remote command's REACH, for the one-exec caller
/// guards. A source guard cannot count real ssh processes (`LinkRegistry::exec` spawns
/// `/usr/bin/ssh`, and the commands take an `AppHandle`), so it closes the routes BY CLASS
/// instead of by the evasions found so far (four verify-self rounds found one each):
/// - every `crate::remote_cmd::…` / `crate::remote_link::…` / `super::…` item the body names is
///   in `allowed_paths` EXACTLY (so a public helper added later, like `run_preflight`, fails);
/// - every crate entry point that reaches ssh, and every panic (which skips what follows), is
///   banned by name, imported or not;
/// - every `links` occurrence is one of `links_sites` (a helper handed `&links`, an alias, or
///   `&*links` fails).
///
/// Residual, stated: a retry around the ONE allowed exec, or a brand-new ssh spawner under a new
/// name imported bare, still passes; neither is a shape an ordinary edit produces by accident.
#[cfg(test)]
pub(crate) fn assert_remote_reach_is_closed(
    body: &str,
    allowed_paths: &[&str],
    links_sites: &[&str],
) {
    let mut paths: Vec<&str> = Vec::new();
    for prefix in ["crate::remote_cmd::", "crate::remote_link::", "super::"] {
        for (i, _) in body.match_indices(prefix) {
            let rest = &body[i..];
            let end = rest
                .find(|c: char| !(c.is_alphanumeric() || c == '_' || c == ':'))
                .unwrap_or(rest.len());
            // `crate::remote_link::` is also matched by its own `super::`-free prefix only once.
            if prefix == "super::" && body[..i].ends_with("::") {
                continue;
            }
            paths.push(rest[..end].trim_end_matches(':'));
        }
    }
    paths.sort_unstable();
    paths.dedup();
    let mut allowed = allowed_paths.to_vec();
    allowed.sort_unstable();
    assert_eq!(
        paths, allowed,
        "the module items this command reaches: {body}"
    );
    for banned in [
        "run_preflight",
        "SshExec",
        "RemoteExec",
        "preflight",
        "install_remote_hook",
        "exec_argv",
        "master_argv",
        "check_argv",
        "run_captured",
        "Transport",
        "transport",
        "Command::new",
        "std::process",
        ".expect(",
        ".unwrap()",
        "panic!",
        "unreachable!",
    ] {
        assert!(
            !body.contains(banned),
            "`{banned}` in a remote command: {body}"
        );
    }
    for site in links_sites {
        assert_eq!(body.matches(site).count(), 1, "`{site}`: {body}");
    }
    let expected: usize = links_sites.iter().map(|s| s.matches("links").count()).sum();
    assert_eq!(
        body.matches("links").count(),
        expected,
        "a use of `links` outside the allowed sites: {body}"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config_store::{add_remote, write_projects, RemoteTarget};
    use tempfile::TempDir;

    /// `src` from `sig` to its top-level `}` (production code only), comments dropped, whitespace
    /// removed. The one rule lives in [`crate::test_support::dense_production_fn`].
    fn dense_body(src: &str, sig: &str) -> String {
        crate::test_support::dense_production_fn(src, sig)
    }

    /// Every `links.<method>(` call in a dense body, in order.
    fn links_calls(body: &str) -> Vec<String> {
        body.match_indices("links.")
            // Never the tail of a snake_case name (`remote_links.`). An alphanumeric before it is
            // allowed: removing whitespace glues keywords on (`match links.` → `matchlinks.`).
            .filter(|(i, _)| !body[..*i].ends_with('_'))
            .filter_map(|(i, m)| {
                let rest = &body[i + m.len()..];
                let name: String = rest
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                rest[name.len()..].starts_with('(').then_some(name)
            })
            .collect()
    }

    /// M17 WP5 (AC-3.1/AC-8.2) caller guard over `remote_open_check`'s worker:
    /// - the remote is asked in ONE exec, and the ONLY `links.` calls are the hold, that exec, and
    ///   the identifier (an allow-list, so a second remote call under ANY method name fails;
    ///   counting the text `.exec(` let `links.close_exec(` through);
    /// - every outcome, the early ones included, reaches `settle_open_decision` (no `return`, no
    ///   `?`, one settle), and the settled check is what the picker gets.
    ///
    /// The exec's content is tested in `remote_cmd` (`the_open_check_reports_…`); the settle's
    /// writes in `remote_link::tests`.
    #[test]
    fn the_open_check_asks_the_remote_once_and_settles_every_outcome() {
        let body = dense_body(
            include_str!("commands.rs"),
            "pub async fn remote_open_check(",
        );
        let worker = &body[body
            .find("on_blocking_worker(")
            .expect("runs on a blocking worker")..];
        assert_eq!(
            links_calls(worker),
            ["ensure_and_hold", "exec", "identifier"],
            "the hold, ONE exec, the identifier, nothing else remote: {worker}"
        );
        assert_eq!(worker.matches("open_check_command(").count(), 1, "{worker}");
        assert!(
            !worker.contains("return"),
            "no outcome skips the settle: {worker}"
        );
        assert!(
            !worker.contains('?'),
            "no outcome skips the settle: {worker}"
        );
        // The WHOLE command, not just the worker: a registry copy made before the worker is a
        // use too (a live re-verify found this route).
        super::assert_remote_reach_is_closed(
            &body,
            &[
                "crate::remote_cmd::open_check_command",
                "crate::remote_cmd::substrate_home_override",
                "crate::remote_cmd::tmux_server",
                "crate::remote_cmd::tmux_session",
                "super::EXEC_TIMEOUT_MS",
            ],
            &[
                "links:State<'_,SharedLinks>",
                "letlinks=Arc::clone(&links);",
                "links.ensure_and_hold(",
                "links.exec(",
                "links.identifier(",
                "settle_open_decision(&dir,&links,",
            ],
        );
        assert!(!worker.contains("try_state"), "{worker}");
        let settle = worker
            .find("letcheck=settle_open_decision(&dir,&links,&project_path,decision);")
            .unwrap_or_else(|| panic!("settles the decision: {worker}"));
        assert_eq!(worker.matches("settle_open_decision(").count(), 1);
        for early in [
            "Err(message)=>(OpenDecision::plain(OpenCheck::Invalid{message}),None)",
            "Err(message)=>(OpenDecision::plain(OpenCheck::Unreachable{message}),None,)",
            "(decide_open(out,record,unclean,&target),Some(hold))",
        ] {
            let at = worker
                .find(early)
                .unwrap_or_else(|| panic!("`{early}` feeds the settle: {worker}"));
            assert!(at < settle);
        }
        assert!(
            worker.ends_with("Ok(check)}).await"),
            "returns the settled check: {worker}"
        );
        for direct in [
            "set_open_trust(",
            "set_open_bypass(",
            "set_open_notice(",
            "record_state(",
        ] {
            assert!(
                !worker.contains(direct),
                "`{direct}` belongs to settle_open_decision"
            );
        }
        // And the settle itself touches only the two answers it leaves (no remote call).
        let settle_body = dense_body(
            include_str!("commands.rs"),
            "pub(crate) fn settle_open_decision(",
        );
        assert_eq!(
            links_calls(&settle_body),
            [
                "set_open_notice",
                "set_open_trust",
                "set_open_bypass",
                "set_substrate"
            ],
            "{settle_body}"
        );
    }

    /// M18 WP6 — the cached bypass answer has exactly TWO writers: the open check's settle and
    /// the Recycle re-read's settle. `remote_bypass_refresh` reaches the cache only through its
    /// settle, and nothing else in the crate writes it.
    #[test]
    fn the_bypass_answer_has_two_writers_each_a_settle() {
        let code =
            crate::workflow_install::source_guard::production_code(include_str!("commands.rs"));
        assert_eq!(code.matches("set_open_bypass(").count(), 2, "{code}");
        for settle in [
            "pub(crate) fn settle_open_decision(",
            "pub(crate) fn settle_bypass_refresh(",
        ] {
            assert!(
                dense_body(include_str!("commands.rs"), settle).contains("set_open_bypass("),
                "{settle} writes it"
            );
        }
        let cmd = dense_body(
            include_str!("commands.rs"),
            "pub async fn remote_bypass_refresh(",
        );
        assert!(!cmd.contains("set_open_bypass("), "{cmd}");
        assert!(
            cmd.contains("Ok(settle_bypass_refresh(&links,&project_path,out))"),
            "{cmd}"
        );
        assert!(
            cmd.contains("links.master_exec("),
            "Up-only, never a link bring-up: {cmd}"
        );
        assert!(!cmd.contains("ensure_and_hold("), "{cmd}");
    }

    /// M17 WP5 caller guard: the FIRST thing `folder_trusted` does is answer a remote row through
    /// `remote_trust` (driven by `remote_link::tests::the_fire_time_trust_read_answers_…`). A
    /// prefix check, so nothing (an early `return true` for `ssh://` keys, which passed the
    /// earlier "comes before the local read" form) can run ahead of it.
    #[test]
    fn folder_trusted_answers_a_remote_row_through_remote_trust_first() {
        let body = dense_body(
            include_str!("../folder_trust/commands.rs"),
            "pub fn folder_trusted(",
        );
        let open = body.find("->bool{").expect("returns bool") + "->bool{".len();
        assert!(
            body[open..].starts_with(
                "letlinks=app.try_state::<crate::remote_link::commands::SharedLinks>();\
                 ifletSome(answer)=remote_trust(&project_path,links.as_deref().map(|l|l.as_ref())){returnanswer;}"
            ),
            "the remote dispatch is the function's first statement: {}",
            &body[open..]
        );
    }

    /// M17 WP5 — the dialogs' End: a delivered end records `ended`; a failed one writes
    /// nothing and says why.
    #[test]
    fn ending_the_session_records_ended_only_when_the_end_ran() {
        use crate::remote_record::{get, record_state};
        let dir = TempDir::new().unwrap();
        let key = "ssh://me@mini-host/Users/me/p";
        assert!(record_state(
            dir.path(),
            key,
            SessionRecordState::EndPending
        ));
        let err = settle_end(
            dir.path(),
            key,
            Err(super::super::CloseExecError::LinkNotUp),
        )
        .unwrap_err();
        assert!(
            err.contains("could not end the Claude Code session"),
            "{err}"
        );
        assert_eq!(
            get(dir.path(), key).map(|r| r.state),
            Some(SessionRecordState::EndPending),
            "a failed end leaves the record as it was"
        );
        assert!(settle_end(dir.path(), key, Ok(())).is_ok());
        assert_eq!(
            get(dir.path(), key).map(|r| r.state),
            Some(SessionRecordState::Ended)
        );
    }

    /// M17 WP5 caller guard: the End runs inside a close mark (a racing respawn waits),
    /// cancels copy-mode before the end, and settles the record from the end's own result.
    #[test]
    fn remote_end_session_marks_the_close_cancels_then_ends_and_settles() {
        let body = dense_body(
            include_str!("commands.rs"),
            "pub async fn remote_end_session(",
        );
        let at = |n: &str| body.find(n).unwrap_or_else(|| panic!("`{n}`: {body}"));
        let hold = at("links.ensure_and_hold(&target)?");
        let mark = at("let_closing=links.begin_close(&session);");
        let cancel = at("links.cancel_copy_mode(&target,&session);");
        let end = at("links.end_session(&target,&session).map(|_|())");
        let settle = at("settle_end(&dir,&project_path,result)");
        assert!(
            hold < mark && mark < cancel && cancel < end && end < settle,
            "{body}"
        );
        assert_eq!(body.matches(".end_session(").count(), 1, "{body}");
    }

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

    /// M18 WP5 (§R.5): one entry per DISTINCT host among the VALID remote rows, sorted; a local
    /// row and a row that fails validation are not hosts.
    #[test]
    fn remote_hosts_are_the_distinct_valid_hosts_sorted() {
        let dir = TempDir::new().unwrap();
        for (host, path, at) in [
            ("me@zeta", "/Users/me/a", 1),
            ("me@mini-host", "/Users/me/a", 2),
            ("me@mini-host", "/Users/me/b", 3),
        ] {
            add_remote(
                dir.path(),
                RemoteTarget {
                    host: host.into(),
                    path: path.into(),
                },
                at,
            )
            .unwrap();
        }
        let mut rows = config_store::read_projects(dir.path()).unwrap();
        let mut local = rows[0].clone();
        local.path = std::path::PathBuf::from("/Users/me/local");
        local.remote = None;
        let mut bad = rows[0].clone();
        let bad_target = RemoteTarget {
            host: "-oProxyCommand=x".into(),
            path: "/r".into(),
        };
        bad.path = std::path::PathBuf::from(bad_target.key());
        bad.remote = Some(bad_target);
        rows.extend([local, bad]);
        write_projects(dir.path(), &rows).unwrap();
        let hosts: Vec<String> = remote_hosts_of(&config_store::read_projects(dir.path()).unwrap())
            .iter()
            .map(|t| t.host().to_string())
            .collect();
        assert_eq!(hosts, ["me@mini-host", "me@zeta"]);
    }

    /// M18 WP5 (D4) caller guard over `remote_substrate_refresh`: the host is asked in ONE exec, and
    /// that exec is `master_exec` (Up-only, master-only: never connects, never holds a link).
    /// `exec` or `ensure_and_hold` here would let Settings bring a link up (§R.5).
    #[test]
    fn the_refresh_asks_the_host_once_over_the_master_only() {
        let body = dense_body(
            include_str!("commands.rs"),
            "pub async fn remote_substrate_refresh(",
        );
        let worker = &body[body
            .find("on_blocking_worker(")
            .expect("runs on a blocking worker")..];
        assert_eq!(
            links_calls(worker),
            ["master_exec"],
            "ONE master-only exec, nothing else remote: {worker}"
        );
        assert_eq!(
            worker.matches("substrate_refresh_command(").count(),
            1,
            "{worker}"
        );
        super::assert_remote_reach_is_closed(
            &body,
            &[
                "crate::remote_cmd::substrate_home_override",
                "crate::remote_cmd::substrate_refresh_command",
                "super::EXEC_TIMEOUT_MS",
            ],
            &[
                "links:State<'_,SharedLinks>",
                "letlinks=Arc::clone(&links);",
                "links.master_exec(",
                "settle_refresh(&links,",
            ],
        );
    }

    #[test]
    fn the_open_check_grace_is_the_operator_ruled_20_seconds() {
        // Operator ruling, M17 WP4 (2026-11-16): keep 20 s. The live open
        // reached the link ~1 s after the click, so a shorter grace buys little, and a change
        // here should be a decision, not a drive-by.
        assert_eq!(OPEN_CHECK_GRACE, Duration::from_secs(20));
    }

    fn facts(dir: bool, live: bool, mode: Option<&str>) -> String {
        let s = crate::remote_cmd::OPEN_SENTINEL;
        let mut out = format!(
            "Welcome!\n{s}dir:{}\n{s}live:{}\n",
            if dir { "yes" } else { "no" },
            if live { "yes" } else { "no" }
        );
        if let Some(m) = mode {
            out.push_str(&format!("{s}mode:{m}\n"));
        }
        out
    }

    #[test]
    fn a_live_session_is_reconnected_only_when_claudesk_left_it_running() {
        use SessionRecordState::*;
        let t = ValidTarget::new("me@mini.example.net", "/Users/me/p").unwrap();
        let live = || Ok(facts(true, true, Some("autopilot")));
        assert_eq!(
            decide_open(live(), Some(Running), false, &t),
            OpenDecision::plain(OpenCheck::Reconnect {
                mode: Some(crate::config_store::DriveMode::Autopilot)
            })
        );
        let d = decide_open(live(), Some(EndPending), false, &t);
        assert!(!d.clear_end_pending && d.notice.is_none(), "{d:?}");
        match d.check {
            OpenCheck::AskEndPending { message } => {
                assert!(message.contains("while mini was unreachable"), "{message}")
            }
            other => panic!("{other:?}"),
        }
        // A8: a live session whose record says ended, or with no record, is never joined unasked.
        for record in [Some(Ended), None] {
            let d = decide_open(live(), record, false, &t);
            assert!(!d.clear_end_pending && d.notice.is_none(), "{d:?}");
            match d.check {
                OpenCheck::AskUnrecorded { message } => {
                    assert!(message.contains("already running on mini"), "{message}")
                }
                other => panic!("{record:?}: {other:?}"),
            }
        }
        // Live beats a missing folder: the session is there to reconnect to.
        assert!(matches!(
            decide_open(Ok(facts(false, true, None)), Some(Running), false, &t).check,
            OpenCheck::Reconnect { mode: None }
        ));
    }

    #[test]
    fn a_dead_session_starts_and_clears_a_stale_end_intent() {
        use SessionRecordState::*;
        let t = ValidTarget::new("me@mini-host", "/Users/me/p").unwrap();
        let dead = || Ok(facts(true, false, None));
        for record in [Some(Ended), None] {
            assert_eq!(
                decide_open(dead(), record, false, &t),
                OpenDecision::plain(OpenCheck::Start(StartSignals::default())),
                "{record:?}"
            );
        }
        // AC-2.3: the label said reconnect, but the session had ended: start, and say so.
        let d = decide_open(dead(), Some(Running), false, &t);
        assert_eq!(
            (&d.check, d.clear_end_pending),
            (&OpenCheck::Start(StartSignals::default()), false)
        );
        assert!(d
            .notice
            .unwrap()
            .contains("had ended since Claudesk last saw it"));
        // A7: the session the end-intent was about has ended anyway: clear it, ask nothing, and
        // say why the promised question did not come.
        let d = decide_open(dead(), Some(EndPending), false, &t);
        assert_eq!(
            (&d.check, d.clear_end_pending),
            (&OpenCheck::Start(StartSignals::default()), true)
        );
        assert!(d.notice.unwrap().contains("had already ended"));
        let d = decide_open(Ok(facts(false, false, None)), Some(EndPending), false, &t);
        assert!(d.clear_end_pending);
        match d.check {
            OpenCheck::FolderMissing { message } => assert!(
                message.contains("/Users/me/p no longer exists on me@mini-host"),
                "{message}"
            ),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_dead_session_starts_with_the_remote_resume_signals() {
        // M17 WP5 Phase 2 (AC-3.3): the remote `.session.md`, the remote trust of the PHYSICAL
        // path (a stored symlink is trusted through its target), and the local flag as given.
        let t = ValidTarget::new("me@mini-host", "/Users/me/link").unwrap();
        let s = crate::remote_cmd::OPEN_SENTINEL;
        let out = |lines: &str| Ok(format!("{s}dir:yes\n{s}live:no\n{lines}"));
        let signals = |o, flag| match decide_open(o, None, flag, &t).check {
            OpenCheck::Start(sig) => sig,
            other => panic!("{other:?}"),
        };
        let trusted_real = format!("{s}real:/Users/me/real\n{s}trusted:/Users/me/real\n");
        let probed = |answer: &str| format!("{s}substrate-probed\n{answer}");
        let present = probed(&format!("{s}substrate:yes\n"));
        assert_eq!(
            signals(
                out(&format!("{trusted_real}{s}session-md:yes\n{present}")),
                true
            ),
            StartSignals {
                unclean_flag: true,
                session_md: true,
                trusted: true,
                bypass_accepted: false,
                host_substrate: Some(crate::remote_substrate::HostSubstrate::Developer {
                    root: None,
                    head: None,
                }),
            }
        );
        // M18 WP4: the restore arm goes through the funnel with the host as its third input. A
        // host without the workflow system, or one the probe could not answer for, has no
        // restore arm even with a `.session.md` there; nor does a check that did not probe.
        for (case, substrate) in [
            ("absent", probed(&format!("{s}substrate:no\n"))),
            ("unknown", probed("")),
            ("not probed", String::new()),
        ] {
            assert!(
                !signals(
                    out(&format!("{trusted_real}{s}session-md:yes\n{substrate}")),
                    false
                )
                .session_md,
                "{case}"
            );
        }
        // M18 WP2: the remote account's bypass acceptance rides the start (and only its line).
        assert!(signals(out(&format!("{s}bypass-accepted:yes\n")), false).bypass_accepted);
        // Trust on the STORED (symlink) path does not count: CC keys trust by the physical path.
        assert!(
            !signals(
                out(&format!(
                    "{s}real:/Users/me/real\n{s}trusted:/Users/me/link\n"
                )),
                false
            )
            .trusted
        );
        // An ancestor's trust covers it; no physical path falls back to the stored one.
        assert!(signals(out(&format!("{s}trusted:/Users/me\n")), false).trusted);
        assert_eq!(signals(out(""), false), StartSignals::default());
    }

    #[test]
    fn no_answer_is_unreachable_never_a_missing_folder() {
        use crate::subprocess::RunError;
        let t = ValidTarget::new("me@mini-host", "/Users/me/p").unwrap();
        for out in [
            Err(RunError::Failed {
                code: Some(255),
                stderr: "Connection closed".into(),
            }),
            Err(RunError::TimedOut(10_000)),
            Ok(String::new()),
            Ok("dir:no\nlive:no\n".into()),
        ] {
            let d = decide_open(out.clone(), Some(SessionRecordState::EndPending), false, &t);
            assert!(matches!(d.check, OpenCheck::Unreachable { .. }), "{out:?}");
            assert!(!d.clear_end_pending && d.notice.is_none(), "{out:?}");
        }
    }

    #[test]
    fn the_wire_kinds_are_kebab_case() {
        let j = |o: OpenCheck| serde_json::to_value(o).unwrap();
        let start = j(OpenCheck::Start(StartSignals {
            unclean_flag: true,
            session_md: false,
            trusted: true,
            bypass_accepted: true,
            host_substrate: None,
        }));
        assert_eq!(start["kind"], "start");
        // M18 WP2: a fire-time input, not a resume signal: never sent to the picker.
        assert!(start.get("bypassAccepted").is_none(), "{start}");
        // M18 WP4: the host as the check observed it IS sent (the open's funnel host input).
        assert_eq!(start["hostSubstrate"], serde_json::Value::Null, "{start}");
        assert_eq!(
            (
                &start["uncleanFlag"],
                &start["sessionMd"],
                &start["trusted"]
            ),
            (
                &serde_json::json!(true),
                &serde_json::json!(false),
                &serde_json::json!(true)
            )
        );
        let r = j(OpenCheck::Reconnect {
            mode: Some(crate::config_store::DriveMode::FullAutopilot),
        });
        assert_eq!(
            (r["kind"].as_str(), r["mode"].as_str()),
            (Some("reconnect"), Some("fsd"))
        );
        assert_eq!(
            j(OpenCheck::AskEndPending {
                message: "m".into()
            })["kind"],
            "ask-end-pending"
        );
        assert_eq!(
            j(OpenCheck::AskUnrecorded {
                message: "m".into()
            })["kind"],
            "ask-unrecorded"
        );
    }
}
