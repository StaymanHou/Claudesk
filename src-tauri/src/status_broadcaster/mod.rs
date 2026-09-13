//! Status broadcaster — Milestone 3's central node (WP4).
//!
//! WP3 delivers a stream of parsed [`HookEvent`](crate::hook_socket::HookEvent)s on
//! an `mpsc::Receiver` held in `HookSocketState`. This module is the transform on
//! top of that stream: it **normalizes** each event to a [`WorkspaceState`], **maps**
//! the event's `cwd` to a known open workspace via the [`WorkspaceRegistry`], builds
//! a [`WorkspaceStatusUpdate`] DTO, and (in [`commands`]) emits it on the Tauri event
//! channel as `workspace-status`. Every later status surface (M4 filmstrip, M5 PiP,
//! M6 menu-bar) subscribes to that one event — this is the single source of truth.
//!
//! ## State mapping (the M3 contract, extended QoL-WP2 2026-06-25)
//! - `UserPromptSubmit` → [`WorkspaceState::Running`] (CC is working a prompt)
//! - `Stop`             → [`WorkspaceState::Idle`] (CC finished, awaiting nothing) —
//!   **unless** the event's `background_task_count > 0`, in which case
//!   [`WorkspaceState::BackgroundWork`] (M13.5 WP2: control returned, a backgrounded job
//!   is still running). A missing count is treated as 0, so an older hook script degrades
//!   to the plain `Stop → Idle` contract.
//! - `PostToolUse`      → [`WorkspaceState::Running`] (a tool finished, CC resumed —
//!   the **answer-resume signal**: when a user answers an `AskUserQuestion`/permission
//!   prompt CC fires `PostToolUse` but NO `UserPromptSubmit`, so this is what clears a
//!   stuck `AwaitingInput`)
//! - `Notification`     → [`WorkspaceState::AwaitingInput`] **gated on
//!   `notification_type`**: a genuine input-needed type (`permission_prompt`,
//!   `agent_needs_input`, `elicitation_dialog`) or an unknown/absent type →
//!   AwaitingInput; a known non-input type (`idle_prompt`, `auth_success`,
//!   `agent_completed`, …) → no-op (`None`), so the dot doesn't flip blue on an idle
//!   nudge or on a background agent *finishing* (M13.5 WP2 — the latter was the
//!   stale-blue defect; see [`is_known_informational_notification`]).
//! - any other event    → no-op (`None`) — never guessed, never emitted
//!
//! [`WorkspaceState::Unknown`] is the **honest no-data default** a surface shows for
//! a workspace before any event has arrived (arch.md failure mode). The broadcaster
//! never *emits* `Unknown` from an event — an event either maps to one of the four
//! live states or is dropped. `Unknown` is the registry/frontend initial value.
//!
//! ## cwd→workspace mapping
//! [`WorkspaceRegistry::resolve_cwd`] canonicalizes both the event's `cwd` and each
//! registered project path before comparing (the M2 WP11 path-keying lesson —
//! symlinks / `.` / relative segments must not defeat the match; see
//! `git_status/mod.rs`). An event whose `cwd` matches no open workspace is **dropped,
//! not an error**. The actual open→register / close→deregister wiring is WP6's
//! concern; WP4 defines the seam and tests the mapping in isolation.
//!
//! ## Serde shape
//! [`WorkspaceStatusUpdate`] is **snake_case end-to-end** — NO `rename_all`, no field
//! rename — so WP6's TS type can mirror the field names verbatim with no camelCase
//! drift. The contract is pinned by [`tests::dto_serde_shape_is_snake_case`], folding
//! in `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`.
//!
//! The `commands` submodule (the receiver-drain thread + the Tauri `app.emit`
//! wiring) is the runtime consumer of this pure transform core.

pub mod commands;

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::hook_socket::HookEvent;

/// A workspace's CC lifecycle state, derived solely from the hook channel (never
/// from PTY output). Serializes snake_case so the frontend mirrors it verbatim.
/// `Deserialize` too (M7): the menu-bar tray consumes the emitted `workspace-status`
/// payload in-process, round-tripping the same snake_case wire shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceState {
    /// CC is idle (finished its last turn) — emitted on `Stop`.
    Idle,
    /// CC is actively working a prompt — emitted on `UserPromptSubmit`.
    Running,
    /// CC has paused for the user (permission / input) — emitted on `Notification`.
    AwaitingInput,
    /// CC returned control but a **backgrounded job it launched is still running** —
    /// emitted on a `Stop` whose `background_task_count > 0` (M13.5 WP2). Neither busy
    /// nor done: the turn ended, so CC wants nothing from you, but the workspace is not
    /// finished either.
    ///
    /// This exists because `Stop` → [`Idle`](Self::Idle) unconditionally read as "done,
    /// nothing to see" while work was outstanding
    /// (`SURFACE-2026-08-16-IDLE-DOT-CONFLATES-DONE-WITH-WAITING-ON-A-BACKGROUND-JOB`).
    ///
    /// ⚠️ **Deliberately has NO completion edge, and does not need one.** CC emits nothing
    /// when a background job finishes — the M13.5 WP2 research pass confirmed this against
    /// the official hook list (31 events, none of them applicable), and a
    /// `BackgroundTasksIdle` request was closed **as not planned**; the notifications are
    /// injected at the conversation level, bypassing the hooks pipeline entirely. It
    /// clears on the workspace's **next `Stop`** (with a zero count), which is
    /// self-healing. That is sufficient rather than a compromise, because of the measured
    /// fact below.
    ///
    /// ⚠️ **When a CC session exits, it KILLS its background jobs** (probed directly:
    /// the session died, its job shell died with it, the job never completed and no orphan
    /// was reparented). So the feared "stuck forever because the job outlived the session"
    /// case **does not exist** — the work is cancelled, not orphaned, and there is nothing
    /// left to report. Do not add a PID-polling watchdog for it: that was probed too, and
    /// it buys coverage for a non-existent case while depending on an undocumented
    /// `~/.claude/shell-snapshots/` path.
    BackgroundWork,
    /// No hook event observed yet — the honest default a surface shows before any
    /// event arrives. Never *emitted* from an event (the broadcaster only ever
    /// produces the four live states — Idle / Running / AwaitingInput /
    /// BackgroundWork); it exists on the Rust side so the DTO enum
    /// is complete and its `"unknown"` serde rendering is pinned. The frontend (TS)
    /// owns it as the initial state a workspace shows before its first hook event.
    /// Marked the `#[default]` because Unknown IS the absence-of-data state — this
    /// also gives the variant a live (non-test) presence via the derived `Default`.
    #[default]
    Unknown,
}

/// The `notification_type` values that mean CC is GENUINELY blocked on the user —
/// these map to [`WorkspaceState::AwaitingInput`]. Everything else CC sends as a
/// `Notification` (`idle_prompt`, `auth_success`, `agent_completed`, …) is informational
/// and must NOT flip a busy dot blue (QoL-WP2). An UNKNOWN or ABSENT type falls back to
/// AwaitingInput (honest default — never silently swallow a future CC notification type;
/// mirrors the `Unknown` no-data principle).
///
/// ## The measured vocabulary (M13.5 WP2, 2026-08-21)
/// CC's **complete** observed `notification_type` set, counted across both the prod and
/// dev corpora (~108MB of `time-analytics.sqlite`, every `Notification` ever recorded):
/// `idle_prompt` 1723 · `permission_prompt` 392 · `agent_completed` 3 · `auth_success` 2 ·
/// `agent_needs_input` 1.
///
/// ⚠️ **`agent_needs_input` is listed here EXPLICITLY, not left to the fallback.** It was
/// classified correctly before only *by accident* — the unknown-type fallback happened to
/// give the right answer. That same fallback gave the WRONG answer for `agent_completed`
/// (see [`is_known_informational_notification`]), so relying on it for a type we have
/// actually observed is exactly the gap that produced the stale-blue defect.
///
/// ⚠️ **`elicitation_dialog` has NEVER been observed** in either corpus — it is a
/// speculative entry retained from QoL-WP2. Harmless (its classification matches the
/// fallback), but do not cite it as evidence of CC's behavior.
const INPUT_NEEDED_NOTIFICATION_TYPES: [&str; 3] = [
    "permission_prompt",
    "agent_needs_input",
    "elicitation_dialog",
];

/// Whether a `Notification`'s `notification_type` means "awaiting genuine user input."
/// The unknown/absent→AwaitingInput honest-fallback rationale is on
/// [`INPUT_NEEDED_NOTIFICATION_TYPES`] (the canonical anchor); this just folds it into a bool.
///
/// `pub(crate)` so the M9 WP3 reclassifier ([`crate::reclassify`]) derives its
/// CC-AwaitingInput spans from the SAME classification (single source of truth) — the
/// live status dot and the retrospective analytics agree on "was CC blocked on input"
/// by construction.
pub(crate) fn notification_awaits_input(notification_type: Option<&str>) -> bool {
    match notification_type {
        None => true,
        Some(t) if INPUT_NEEDED_NOTIFICATION_TYPES.contains(&t) => true,
        Some(t) if is_known_informational_notification(t) => false,
        Some(_) => true,
    }
}

/// The recognized informational `notification_type`s that do NOT mean "awaiting input."
/// Kept explicit so an unknown future type falls through to the AwaitingInput default
/// rather than being treated as informational (see [`INPUT_NEEDED_NOTIFICATION_TYPES`]).
///
/// ⚠️ **`agent_completed` is here because its ABSENCE was the stale-blue defect**
/// (`SURFACE-2026-08-06-AWAITING-INPUT-DOT-NEVER-CLEARS-FOR-A-BACKGROUND-AGENT`, fixed
/// M13.5 WP2). A background agent finishing sends `agent_completed`; because the type was
/// unlisted, the honest-fallback in [`notification_awaits_input`] classified it as
/// input-needed and turned the dot **blue**. ⚠️ The defect was therefore a dot **lit
/// wrongly**, NOT — as the backlog item, the WBS, and `CLAUDE.md` all described it — a dot
/// "lit honestly that nothing ever cleared." There was no missing clearing edge.
/// `SubagentStop` (long suspected, and the basis of two proposed fixes) is unrelated: it
/// fires unpaired at a 3.2:1 surplus and belonged to a different CC session entirely.
///
/// The fallback direction is right for *input-needed* types and wrong for *completion*
/// ones, and Claudesk cannot tell which a new type is — so when a new `notification_type`
/// appears in the corpus it must be classified deliberately here or in
/// [`INPUT_NEEDED_NOTIFICATION_TYPES`]. `SELECT DISTINCT
/// json_extract(meta,'$.notification_type') FROM events` over `time-analytics.sqlite` is
/// the check; it would have caught this one the day it first fired.
fn is_known_informational_notification(t: &str) -> bool {
    matches!(
        t,
        "idle_prompt"
            | "auth_success"
            | "agent_completed"
            | "elicitation_complete"
            | "elicitation_response"
    )
}

/// Normalize a [`HookEvent`] to a [`WorkspaceState`]. Returns `None` for any event
/// that is not a mapped lifecycle event, OR for a `Notification` whose
/// `notification_type` is a recognized informational one (a no-op — the prior state
/// is preserved). An unknown event is a no-op, never a guessed state.
pub fn event_to_state(event: &HookEvent) -> Option<WorkspaceState> {
    match event.hook_event_name.as_str() {
        "UserPromptSubmit" => Some(WorkspaceState::Running),
        // Stop = the turn ended. Which state that means depends on whether CC left any
        // backgrounded job running (M13.5 WP2): a positive count is BackgroundWork
        // ("control returned, work outstanding"), zero/absent is plain Idle.
        //
        // ⚠️ `None` and `Some(0)` MUST behave identically — an older hook script (or a CC
        // that stops sending the field) omits it entirely, and that has to degrade to the
        // pre-M13.5 `Stop → Idle` behaviour rather than to a wrong colour. `unwrap_or(0)`
        // is what makes the undocumented upstream field safe to depend on.
        "Stop" => Some(if event.background_task_count.unwrap_or(0) > 0 {
            WorkspaceState::BackgroundWork
        } else {
            WorkspaceState::Idle
        }),
        // The answer-resume signal: a tool call (incl. AskUserQuestion) finished and
        // CC resumed working — clears a stuck AwaitingInput (QoL-WP2 Phase 1).
        "PostToolUse" => Some(WorkspaceState::Running),
        // AwaitingInput only for genuine input-needed notifications (QoL-WP2 Phase 2);
        // an informational Notification (idle_prompt / auth_success / …) is a no-op so
        // it doesn't flip a busy dot blue.
        "Notification" => {
            if notification_awaits_input(event.notification_type.as_deref()) {
                Some(WorkspaceState::AwaitingInput)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// The short, stable label for a [`WorkspaceState`] used by the WP1 status-channel
/// telemetry (`status_log`). Matches the serde `snake_case` rendering so a log line
/// and the wire DTO read the same. Kept here next to the enum so a future variant/
/// rename updates both in one place.
pub(crate) fn state_label(state: WorkspaceState) -> &'static str {
    match state {
        WorkspaceState::Idle => "idle",
        WorkspaceState::Running => "running",
        WorkspaceState::AwaitingInput => "awaiting_input",
        WorkspaceState::BackgroundWork => "background_work",
        WorkspaceState::Unknown => "unknown",
    }
}

/// The status update broadcast on the `workspace-status` Tauri event — the single
/// DTO every status surface consumes.
///
/// Field names are **snake_case verbatim** (NO `rename_all`); WP6's TS type mirrors
/// them exactly. `last_event_at` carries the hook-side send time (`HookEvent.timestamp`,
/// epoch ms) when present; `last_output_snippet` carries the event's `prompt`
/// (`UserPromptSubmit`) or `message` (`Notification`) when present; `notification_type`
/// carries the `Notification` subtype (QoL-WP2); `is_turn_start` marks the one event that
/// begins a CC turn (M13.5 WP3). All four are `Option` and `skip_serializing_if`-omitted
/// when absent so the wire shape is minimal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceStatusUpdate {
    /// The registry id of the workspace this event belongs to.
    pub workspace_id: String,
    /// The derived CC lifecycle state.
    pub state: WorkspaceState,
    /// Hook-side send time (epoch ms), if the event carried one.
    /// `#[serde(default)]` so a minimal wire payload (the field omitted by
    /// `skip_serializing_if`) still deserializes for the in-process tray consumer (M7).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_event_at: Option<u64>,
    /// The event's prompt/message text, if present (telemetry for the surface).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_output_snippet: Option<String>,
    /// The `Notification` subtype (`permission_prompt` / `idle_prompt` / …), if the
    /// event carried one (QoL-WP2). Telemetry/diagnostic for the surface — the
    /// AwaitingInput-vs-no-op gating decision is made backend-side in `event_to_state`,
    /// NOT by the frontend; this field is exposed so a surface can show *why* (e.g. a
    /// tooltip) without re-deriving.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub notification_type: Option<String>,
    /// `Some(true)` iff this event is the one that **begins a CC turn**
    /// (`UserPromptSubmit`) — M13.5 WP3, the turn-output-reorientation marker signal.
    ///
    /// ⚠️ **This field exists because `state` CANNOT express it.** [`event_to_state`] maps
    /// **two** different events to [`WorkspaceState::Running`]: `UserPromptSubmit` (a turn
    /// starts — once per turn) and `PostToolUse` (a turn resumes after a tool call — many
    /// times per turn). A consumer that infers "a turn started" from `state == Running`
    /// therefore fires on **every tool call**; in a measured p95 turn that is hundreds of
    /// spurious firings, not a graceful degradation. Same defect class as the M13.5 WP2
    /// CRITICAL that inferred "a `Stop` arrived" from `state == Idle`.
    ///
    /// Like `notification_type`, the classification is made **backend-side, here** so no
    /// surface re-derives it from a raw event name. Consumers must match this field, never
    /// `state`. ⚠️ And they must read it off the **raw event stream** — the frontend's
    /// `WorkspaceStatusMap` folds by workspace id, so consecutive events overwrite and
    /// "a turn started" is unrecoverable from the map.
    ///
    /// `None` (omitted on the wire) and `Some(false)` mean the same thing — not a turn
    /// start — so an older payload degrades to "no marker", never to a wrong one.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub is_turn_start: Option<bool>,
    /// `Some(true)` iff this event is the one that **ENDS a CC turn** (`Stop`) — M15 WP3,
    /// the workflow supervisor's trigger.
    ///
    /// ⚠️ **This is the `is_turn_start` mirror, and it exists for a SHARPER reason.** A
    /// consumer needing *"a `Stop` arrived"* cannot read `state`, because [`event_to_state`]
    /// maps `Stop` to **TWO** states: [`WorkspaceState::Idle`] and — when
    /// `background_task_count > 0` — [`WorkspaceState::BackgroundWork`]. Matching only
    /// `Idle` is precisely the shipped-CRITICAL shape from M13.5 WP2
    /// (`[[derived-state-is-not-a-proxy-for-its-event]]`): when a closed enum gains a
    /// member, every consumer of a SIBLING literal must be swept, and the failure mode is a
    /// silent hang — the supervisor simply never fires on a turn that ended with background
    /// work outstanding.
    ///
    /// Classifying it **backend-side, here** is what makes that unrepeatable: the rule has
    /// one home ([`event_is_turn_end`]), and a future third `Stop`-mapped state updates that
    /// predicate rather than every consumer.
    ///
    /// ⚠️ Consumers must read this off the **RAW event stream**, never the frontend's folded
    /// `WorkspaceStatusMap` — the map overwrites by workspace id, so two consecutive `Stop`s
    /// are indistinguishable in it
    /// (`[[workspace-status-map-collapses-consecutive-events]]`).
    ///
    /// ⚠️ **A turn ending in `BackgroundWork` gets no LATER completion event** — do not wait
    /// for one, and do not add a PID-polling watchdog (probed and rejected). This marker is
    /// the only turn-end signal such a turn will ever produce.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub is_turn_end: Option<bool>,
    /// The CC session id this event came from — the uuid that disambiguates **two CC
    /// sessions running in the same directory tree**. M15 WP3.
    ///
    /// ⚠️ **This value was already arriving and was being DROPPED here.** The hook parses it
    /// into [`HookEvent::session_id`], but every DTO built before M15 WP3 discarded it, so
    /// the only workspace key on the wire was the one [`WorkspaceRegistry::resolve_cwd`]
    /// derives from `cwd` — and that registry is a **1:1 `by_path` map** whose `resolve_cwd`
    /// returns a **single** id by longest-path-ancestor match. Two CC sessions in one tree
    /// therefore collapse onto one workspace and are indistinguishable
    /// (`SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS`).
    ///
    /// Threading it through does not by itself fix the collapse — `workspace_id` is still
    /// cwd-derived — but it puts the disambiguator **on the wire**, which is what lets the
    /// supervisor address a turn by the session that produced it rather than by the
    /// directory it happened to run in.
    ///
    /// Empty string on the wire is treated as absent (the hook's `#[serde(default)]` yields
    /// `""` for a payload that omits the key), so a degraded payload loses the id rather
    /// than inventing one.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub session_id: Option<String>,
}

/// Maps a canonicalized project path → its `workspace_id`. The cwd→workspace seam:
/// WP4 defines + tests it; WP6 wires open→[`register`](Self::register) /
/// close→[`deregister`](Self::deregister). Held in Tauri managed state behind a
/// `Mutex` (see [`SharedRegistry`]) so the drain thread and a future WP6 command
/// share one instance. Empty at launch — WP4 emits nothing until WP6 registers a
/// workspace.
#[derive(Debug, Default)]
pub struct WorkspaceRegistry {
    /// canonicalized-project-path-string → workspace_id
    by_path: HashMap<String, String>,
}

impl WorkspaceRegistry {
    /// A fresh, empty registry.
    pub fn new() -> Self {
        Self::default()
    }

    /// Register an open workspace: its project path (canonicalized) → `workspace_id`.
    /// A path that fails to canonicalize (does not exist) is stored verbatim so an
    /// exact-string match can still resolve it (best-effort; the resolve side also
    /// canonicalizes, so a both-canonicalizable pair matches regardless).
    ///
    /// Called by WP6's `workspace_register` command (open → register).
    pub fn register(&mut self, project_path: &Path, workspace_id: String) {
        let key = canonical_key(project_path);
        self.by_path.insert(key, workspace_id);
    }

    /// Deregister a closed workspace by its project path. Called by WP6's
    /// `workspace_deregister` command (close → deregister).
    pub fn deregister(&mut self, project_path: &Path) {
        let key = canonical_key(project_path);
        self.by_path.remove(&key);
    }

    /// Resolve an event's `cwd` to a `workspace_id`, or `None` if no open workspace
    /// matches (the event is then dropped, not an error).
    ///
    /// **Ancestor / longest-prefix matching (WP2 fix).** A CC turn's shell cwd may have
    /// descended into a *subdirectory* of the workspace root (e.g. `cd src-tauri`), so an
    /// event's `cwd` is the workspace root OR any descendant of it. We canonicalize the
    /// `cwd` the same way [`register`](Self::register) canonicalized the stored key (so
    /// symlinks / `.` / relative segments don't defeat the match — M2 WP11 lesson), then
    /// return the workspace whose registered key is the **longest** path-ancestor of (or
    /// equal to) the cwd. Longest wins so a nested inner workspace beats its outer parent.
    ///
    /// Before this fix `resolve_cwd` did an exact-equality lookup, so a `Stop` fired from a
    /// subdir resolved to `None` → the idle transition was dropped → the dot stuck on
    /// `Running` (telemetry-confirmed in prod 2026-06-27).
    ///
    /// Matching is on **path components** (via [`is_path_ancestor`]), NOT raw string
    /// prefix — so a registered `/a/src` never spuriously matches a cwd of `/a/src-tauri`.
    pub fn resolve_cwd(&self, cwd: &str) -> Option<String> {
        let key = canonical_key(Path::new(cwd));
        let cwd_path = Path::new(&key);
        self.by_path
            .iter()
            .filter(|(registered, _)| is_path_ancestor(Path::new(registered), cwd_path))
            // Longest registered key wins (nearest enclosing workspace). Rank by path-
            // component count — the precise depth measure. (A string-length proxy also
            // works here since every candidate is an ancestor of the same cwd, but counting
            // components says exactly what we mean and can't be skewed by a trailing slash.)
            .max_by_key(|(registered, _)| Path::new(registered).components().count())
            .map(|(_, ws)| ws.clone())
    }

    /// Number of currently-registered (open) workspaces. This IS the open-workspace
    /// set the broadcaster uses — `register` fires on workspace open, `deregister` on
    /// close — so its length is "how many workspaces are open right now." Read by the
    /// PiP auto-summon guard (M6 WP9): at zero open workspaces, blurring must NOT summon
    /// an empty PiP. Previously `#[cfg(test)]`-only (an inspection helper); un-gated now
    /// that it has a runtime caller.
    pub fn len(&self) -> usize {
        self.by_path.len()
    }

    /// The canonicalized project paths of every currently-open workspace.
    ///
    /// M12 WP2 (P2.3): the app-quit teardown must clear the unclean flag for every open
    /// workspace, but it only has *session ids* — `PtyCcSession` does not retain its
    /// project path (it is consumed as the PTY's cwd at spawn). This registry is the one
    /// place that already holds the open-workspace path set, so app-quit reads it here
    /// rather than a second path map being introduced to duplicate it.
    ///
    /// Returns canonicalized keys — the same form `register` stored and therefore the
    /// same form the flag was keyed under at spawn (both derive from the frontend's
    /// canonicalized project path).
    pub fn open_project_paths(&self) -> Vec<String> {
        self.by_path.keys().cloned().collect()
    }
}

/// Whether `ancestor` is the same path as `descendant` OR a path-ancestor of it, matched
/// on **path components** (not raw string prefix). `Path::starts_with` does exactly this:
/// `/a/src` is NOT an ancestor of `/a/src-tauri` (component `src` ≠ `src-tauri`), but it
/// IS an ancestor of `/a/src/lib`. The equal case (`ancestor == descendant`) counts as an
/// ancestor so a cwd exactly at the workspace root still resolves. Boundary-safety here is
/// load-bearing — the WP2 fix must never spuriously match a sibling dir whose name merely
/// shares a string prefix with a registered workspace.
pub(crate) fn is_path_ancestor(ancestor: &Path, descendant: &Path) -> bool {
    descendant.starts_with(ancestor)
}

/// Canonicalize a path to its registry key. Falls back to the lossy string form when
/// `canonicalize` fails (e.g. the path no longer exists on disk) — a non-existent
/// `cwd` then simply won't match any canonicalized registered path and is dropped,
/// which is the intended "no open workspace" behavior. Never panics.
pub(crate) fn canonical_key(path: &Path) -> String {
    match path.canonicalize() {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(_) => path.to_string_lossy().into_owned(),
    }
}

/// Tauri-managed shared registry: a `Mutex` so the drain thread and WP6's
/// register/deregister command share one instance.
pub type SharedRegistry = Mutex<WorkspaceRegistry>;

/// The pure transform the drain thread runs per event: normalize → resolve cwd →
/// build the DTO. Returns `None` when the event is not a mapped lifecycle event OR
/// its `cwd` matches no open workspace (both = drop, not error). Kept pure (no
/// `AppHandle`, no IO) so the whole transform unit-tests without a Tauri app — the
/// drain thread's only un-testable line is the `app.emit` of the returned `Some`.
/// ⚠️ **The two hook-stream consumers filter DIFFERENTLY, and the asymmetry is deliberate.**
/// An event whose `cwd` matches no open workspace is **DROPPED here** — a status dot needs a
/// workspace to belong to, so an unmatchable event has no surface. The `time_store` drain
/// (`time_store::commands::drain_loop`) deliberately does **NOT** filter: time analytics is
/// machine-global by design and records every Claude Code session on the machine, including
/// projects Claudesk has never opened. Neither side used to say so, which reads as one of them
/// being buggy. (`SURFACE-2026-08-01-TWO-HOOK-DRAINS-FILTER-DIFFERENTLY-UNDOCUMENTED`.)
pub fn to_update(event: &HookEvent, registry: &WorkspaceRegistry) -> Option<WorkspaceStatusUpdate> {
    let state = event_to_state(event)?;
    let workspace_id = registry.resolve_cwd(&event.cwd)?;
    let last_output_snippet = event.prompt.clone().or_else(|| event.message.clone());
    Some(WorkspaceStatusUpdate {
        workspace_id,
        state,
        last_event_at: event.timestamp,
        last_output_snippet,
        notification_type: event.notification_type.clone(),
        is_turn_start: Some(event_is_turn_start(event)),
        is_turn_end: Some(event_is_turn_end(event)),
        // ⚠️ Empty means absent — the hook's `#[serde(default)]` yields `""` for a payload
        // that omits the key, and an empty-string session id is not a usable address.
        session_id: Some(event.session_id.clone()).filter(|s| !s.is_empty()),
    })
}

/// Is this the hook event that **begins a CC turn**? M13.5 WP3.
///
/// `UserPromptSubmit` and nothing else. ⚠️ In particular **NOT `PostToolUse`**, even though
/// [`event_to_state`] maps both to [`WorkspaceState::Running`] — `PostToolUse` is the
/// *resume* signal and fires many times within a single turn. That collision is the entire
/// reason `WorkspaceStatusUpdate::is_turn_start` exists rather than a consumer reading
/// `state`; see that field's docs.
///
/// Kept as a named predicate (mirroring [`notification_awaits_input`]) so the rule has ONE
/// home and a test can pin it directly.
pub fn event_is_turn_start(event: &HookEvent) -> bool {
    event.hook_event_name == "UserPromptSubmit"
}

/// Is this the hook event that **ENDS a CC turn**? M15 WP3.
///
/// `Stop` and nothing else — ⚠️ **irrespective of which state it maps to.** This is the
/// whole point of the predicate: [`event_to_state`] sends `Stop` to [`WorkspaceState::Idle`]
/// *or* [`WorkspaceState::BackgroundWork`] depending on `background_task_count`, so a
/// consumer that asks "did a turn end?" by matching a state matches only one of the two and
/// silently never fires on the other
/// (`[[derived-state-is-not-a-proxy-for-its-event]]` — the M13.5 WP2 shipped CRITICAL).
///
/// ⚠️ Deliberately keyed on the **event name**, not on the state and not on
/// `background_task_count`. A turn that ends with background work outstanding has still
/// ENDED — the supervisor's trigger is the turn boundary, and `BackgroundWork` produces no
/// later completion event to wait for. Gating on the count here would reintroduce exactly
/// the hole this predicate closes.
///
/// Kept as a named predicate (mirroring [`event_is_turn_start`] and
/// [`notification_awaits_input`]) so the rule has ONE home: if upstream ever maps a third
/// state off `Stop`, this function is the only edit.
pub fn event_is_turn_end(event: &HookEvent) -> bool {
    event.hook_event_name == "Stop"
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(name: &str, cwd: &str) -> HookEvent {
        HookEvent {
            hook_event_name: name.to_string(),
            session_id: "s".to_string(),
            cwd: cwd.to_string(),
            timestamp: None,
            prompt: None,
            message: None,
            notification_type: None,
            // M9 WP2 time-analytics fields — absent on the status-path fixtures.
            prompt_length_chars: None,
            tool_use_id: None,
            tool_name: None,
            agent_type: None,
            source: None,
            reason: None,
            background_task_count: None,
        }
    }

    /// A `Notification` event carrying a specific `notification_type` (QoL-WP2 gating).
    fn notif(notification_type: Option<&str>, cwd: &str) -> HookEvent {
        HookEvent {
            hook_event_name: "Notification".to_string(),
            session_id: "s".to_string(),
            cwd: cwd.to_string(),
            timestamp: None,
            prompt: None,
            message: Some("a notification".to_string()),
            notification_type: notification_type.map(str::to_string),
            prompt_length_chars: None,
            tool_use_id: None,
            tool_name: None,
            agent_type: None,
            source: None,
            reason: None,
            background_task_count: None,
        }
    }

    // ---- event_to_state: the 3 mapped events + unknown → None ----

    #[test]
    fn user_prompt_submit_maps_to_running() {
        assert_eq!(
            event_to_state(&ev("UserPromptSubmit", "/p")),
            Some(WorkspaceState::Running)
        );
    }

    #[test]
    fn stop_maps_to_idle() {
        assert_eq!(
            event_to_state(&ev("Stop", "/p")),
            Some(WorkspaceState::Idle)
        );
    }

    #[test]
    fn notification_maps_to_awaiting_input() {
        // A Notification with NO notification_type (older CC / untyped) → AwaitingInput
        // (the conservative honest default).
        assert_eq!(
            event_to_state(&ev("Notification", "/p")),
            Some(WorkspaceState::AwaitingInput)
        );
    }

    // ---- QoL-WP2 Phase 2: Notification gated on notification_type ----

    #[test]
    fn notification_permission_prompt_maps_to_awaiting() {
        // The live-captured AskUserQuestion/permission case → genuine input needed.
        assert_eq!(
            event_to_state(&notif(Some("permission_prompt"), "/p")),
            Some(WorkspaceState::AwaitingInput)
        );
    }

    #[test]
    fn notification_elicitation_dialog_maps_to_awaiting() {
        // The other input-needed type (MCP elicitation prompt).
        assert_eq!(
            event_to_state(&notif(Some("elicitation_dialog"), "/p")),
            Some(WorkspaceState::AwaitingInput)
        );
    }

    #[test]
    fn notification_idle_prompt_is_a_noop() {
        // An idle nudge is informational, NOT a fresh input request — it must NOT flip
        // a busy dot blue. None (no-op) → prior state preserved on the frontend.
        assert_eq!(event_to_state(&notif(Some("idle_prompt"), "/p")), None);
    }

    #[test]
    fn notification_auth_success_is_a_noop() {
        // Another recognized informational type → no-op.
        assert_eq!(event_to_state(&notif(Some("auth_success"), "/p")), None);
    }

    /// Build a `Stop` carrying an explicit background-task count (M13.5 WP2).
    fn stop_with_bg(count: Option<u64>, cwd: &str) -> HookEvent {
        HookEvent {
            background_task_count: count,
            ..ev("Stop", cwd)
        }
    }

    #[test]
    fn stop_with_outstanding_background_work_maps_to_background_work() {
        // M13.5 WP2 — THE fix for
        // SURFACE-2026-08-16-IDLE-DOT-CONFLATES-DONE-WITH-WAITING-ON-A-BACKGROUND-JOB.
        // A turn that ends while a backgrounded job runs is neither busy nor done.
        assert_eq!(
            event_to_state(&stop_with_bg(Some(1), "/p")),
            Some(WorkspaceState::BackgroundWork)
        );
        // More than one outstanding job is the same state (the count is a boolean here —
        // the dot has no "how many" to render).
        assert_eq!(
            event_to_state(&stop_with_bg(Some(4), "/p")),
            Some(WorkspaceState::BackgroundWork)
        );
    }

    #[test]
    fn stop_with_zero_or_absent_background_count_still_maps_to_idle() {
        // ⚠️ The BACKWARD-COMPATIBILITY assertion, and the reason it matters: the upstream
        // `background_tasks` field is UNDOCUMENTED, and an older deployed hook script does
        // not send the count at all. `None` and `Some(0)` must be indistinguishable, both
        // degrading to the pre-M13.5 `Stop -> Idle` contract — otherwise a CC-side change
        // (or a stale hook on disk) turns every turn-end teal.
        assert_eq!(
            event_to_state(&stop_with_bg(Some(0), "/p")),
            Some(WorkspaceState::Idle)
        );
        assert_eq!(
            event_to_state(&stop_with_bg(None, "/p")),
            Some(WorkspaceState::Idle)
        );
        // And the plain helper (which sets no count) must agree — this is the exact shape
        // every pre-existing Stop test uses, so it pins that they stayed correct.
        assert_eq!(
            event_to_state(&ev("Stop", "/p")),
            Some(WorkspaceState::Idle)
        );
    }

    #[test]
    fn background_work_only_ever_comes_from_stop() {
        // ⚠️ A stray count on a NON-Stop event must not produce BackgroundWork. The Perl
        // hook only emits the field on `Stop`, but the wire is untrusted input: a future
        // hook change (or a hand-crafted line) must not be able to flip the dot teal
        // through UserPromptSubmit/PostToolUse/Notification.
        for name in ["UserPromptSubmit", "PostToolUse", "Notification"] {
            let ev = HookEvent {
                background_task_count: Some(3),
                ..ev(name, "/p")
            };
            assert_ne!(
                event_to_state(&ev),
                Some(WorkspaceState::BackgroundWork),
                "{name} must never map to BackgroundWork"
            );
        }
    }

    #[test]
    fn background_work_clears_on_the_next_clean_stop() {
        // The self-healing expiry rule, end to end: a turn ends with work outstanding
        // (teal), then a later turn ends with none (grey). This is the ONLY clearing edge
        // — CC emits nothing when a background job finishes (confirmed against the
        // official hook list; a BackgroundTasksIdle event was requested and declined), and
        // it is sufficient because a session exiting KILLS its background jobs.
        let seq = [
            ev("UserPromptSubmit", "/p"),
            stop_with_bg(Some(1), "/p"),
            ev("UserPromptSubmit", "/p"),
            stop_with_bg(Some(0), "/p"),
        ];
        let states: Vec<Option<WorkspaceState>> = seq.iter().map(event_to_state).collect();
        assert_eq!(
            states,
            vec![
                Some(WorkspaceState::Running),
                Some(WorkspaceState::BackgroundWork),
                Some(WorkspaceState::Running),
                Some(WorkspaceState::Idle),
            ]
        );
    }

    #[test]
    fn notification_agent_completed_is_a_noop() {
        // M13.5 WP2 — THE regression anchor for
        // SURFACE-2026-08-06-AWAITING-INPUT-DOT-NEVER-CLEARS-FOR-A-BACKGROUND-AGENT.
        // A background agent FINISHING sends `agent_completed`. Before the fix this type
        // was unlisted, so the unknown-type fallback classified it as input-needed and
        // turned the dot blue — the dot was lit WRONGLY, not "lit honestly and never
        // cleared." It must be a no-op (prior state preserved).
        assert_eq!(event_to_state(&notif(Some("agent_completed"), "/p")), None);
    }

    #[test]
    fn notification_agent_needs_input_maps_to_awaiting() {
        // The sibling of `agent_completed`: a background agent that genuinely NEEDS input.
        assert_eq!(
            event_to_state(&notif(Some("agent_needs_input"), "/p")),
            Some(WorkspaceState::AwaitingInput)
        );
    }

    #[test]
    fn agent_needs_input_is_classified_explicitly_not_by_fallback() {
        // ⚠️ This test exists because the behavioral assertion above CANNOT detect the
        // property we actually care about. `agent_needs_input` was classified correctly
        // even BEFORE M13.5 WP2 — the unknown-type fallback happened to give the right
        // answer. So `event_to_state(agent_needs_input) == AwaitingInput` passes whether
        // or not the type is listed, which a mutation probe confirmed: deleting the entry
        // from INPUT_NEEDED_NOTIFICATION_TYPES left every behavioral test GREEN.
        //
        // The property worth pinning is therefore *membership*, not the derived state: the
        // type must be recognized DELIBERATELY, because relying on the fallback for a type
        // we have actually observed is precisely the gap that produced the stale-blue
        // defect for its sibling `agent_completed`. Assert the list directly — this is the
        // one form that fails if the entry is removed.
        assert!(
            INPUT_NEEDED_NOTIFICATION_TYPES.contains(&"agent_needs_input"),
            "agent_needs_input must be classified explicitly, not left to the \
             unknown-type fallback (see is_known_informational_notification)"
        );
    }

    #[test]
    fn captured_background_agent_completion_resolves_running_idle_not_awaiting() {
        // The verify-codify anchor from the live-captured instance
        // (status-channel.log.1:15948-15950, 2026-08-04): UserPromptSubmit -> Stop ->
        // Notification{agent_completed}. The measured defect was the dot sitting BLUE for
        // ~150s after this sequence, until an unrelated later prompt incidentally moved it.
        //
        // Note the ORDER that makes this defect's shape distinctive: the Notification
        // arrives AFTER Stop — the foreground turn has already ended, so no PostToolUse
        // follows to clear it. That is why every "find the clearing edge" fix failed: the
        // correct fix is to never light the dot in the first place.
        let seq = [
            ev("UserPromptSubmit", "/p"),
            ev("Stop", "/p"),
            notif(Some("agent_completed"), "/p"),
        ];
        let states: Vec<Option<WorkspaceState>> = seq.iter().map(event_to_state).collect();
        assert_eq!(
            states,
            vec![
                Some(WorkspaceState::Running),
                Some(WorkspaceState::Idle),
                None, // the fix: no-op, so the dot STAYS idle rather than going blue
            ]
        );
        // And the resolved end state a surface would render: fold the sequence the way the
        // frontend does (None preserves the prior state) and assert it is Idle, not
        // AwaitingInput. This is the operator-visible property; the per-event vector above
        // is the mechanism.
        let mut rendered = WorkspaceState::Unknown;
        for s in states.into_iter().flatten() {
            rendered = s;
        }
        assert_eq!(rendered, WorkspaceState::Idle);
    }

    #[test]
    fn notification_unknown_type_falls_back_to_awaiting() {
        // A type CC introduces in the future that we don't recognize → honest fallback
        // to AwaitingInput (never silently swallow a future input-needed type). This is
        // the conservative-default principle that mirrors WorkspaceState::Unknown.
        assert_eq!(
            event_to_state(&notif(Some("some_future_type_we_dont_know"), "/p")),
            Some(WorkspaceState::AwaitingInput)
        );
    }

    #[test]
    fn post_tool_use_maps_to_running() {
        // QoL-WP2: PostToolUse is the answer-resume signal — it must map to Running
        // so an AskUserQuestion answer clears the stuck AwaitingInput.
        assert_eq!(
            event_to_state(&ev("PostToolUse", "/p")),
            Some(WorkspaceState::Running)
        );
    }

    #[test]
    fn m9_time_analytics_events_are_status_neutral() {
        // M9 WP2 registered 6 new events (PreToolUse / PostToolUseFailure /
        // SubagentStart / SubagentStop / SessionStart / SessionEnd) purely to feed
        // the time_store writer. The STATUS machine must ignore them — each maps to
        // None (the `_ => None` fall-through), so a PreToolUse arriving now can NEVER
        // flip a dot. This is the "status path unchanged" invariant from the WP2 plan.
        for name in [
            "PreToolUse",
            "PostToolUseFailure",
            "SubagentStart",
            "SubagentStop",
            "SessionStart",
            "SessionEnd",
        ] {
            assert_eq!(
                event_to_state(&ev(name, "/p")),
                None,
                "{name} must be status-neutral (time-analytics-only)"
            );
        }
        // And the 4 STATUS events still map exactly as before — the additions didn't
        // perturb the mapped set.
        assert_eq!(
            event_to_state(&ev("UserPromptSubmit", "/p")),
            Some(WorkspaceState::Running)
        );
        assert_eq!(
            event_to_state(&ev("Stop", "/p")),
            Some(WorkspaceState::Idle)
        );
        assert_eq!(
            event_to_state(&ev("PostToolUse", "/p")),
            Some(WorkspaceState::Running)
        );
        assert_eq!(
            event_to_state(&ev("Notification", "/p")),
            Some(WorkspaceState::AwaitingInput)
        );
    }

    #[test]
    fn captured_ask_user_question_stream_resolves_running_awaiting_running_idle() {
        // The verify-codify anchor (from the live-captured hook stream, QoL-WP2):
        // UserPromptSubmit → Notification → PostToolUse → Stop must resolve to
        // Running → AwaitingInput → Running → Idle. The AwaitingInput→Running step
        // (via PostToolUse) is the bug fix — before WP2, PostToolUse was a no-op
        // (None) and the dot stayed AwaitingInput until the Stop.
        let stream = ["UserPromptSubmit", "Notification", "PostToolUse", "Stop"];
        let resolved: Vec<Option<WorkspaceState>> = stream
            .iter()
            .map(|name| event_to_state(&ev(name, "/p")))
            .collect();
        assert_eq!(
            resolved,
            vec![
                Some(WorkspaceState::Running),
                Some(WorkspaceState::AwaitingInput),
                Some(WorkspaceState::Running),
                Some(WorkspaceState::Idle),
            ]
        );
    }

    #[test]
    fn state_label_matches_serde_snake_case_rendering() {
        // M6 WP1: the status-channel log renders each state via `state_label`. Pin that
        // it agrees with the serde snake_case wire rendering for ALL FIVE variants, so a
        // future enum reorder/rename can't silently drift the log label away from the DTO
        // (the same drift-guard discipline as `dto_serde_shape_is_snake_case`). Assert
        // against serde to keep the two derivations in lockstep, not against literals.
        //
        // ⚠️ This list is HAND-WRITTEN, so it does not fail to compile when a variant is
        // added — it just silently stops covering it. M13.5 WP2 added `BackgroundWork`;
        // whoever adds a sixth variant must extend this array by hand.
        for state in [
            WorkspaceState::Idle,
            WorkspaceState::Running,
            WorkspaceState::AwaitingInput,
            WorkspaceState::BackgroundWork,
            WorkspaceState::Unknown,
        ] {
            let serde_rendered = serde_json::to_value(state).unwrap();
            assert_eq!(
                serde_json::Value::String(state_label(state).to_string()),
                serde_rendered,
                "state_label must match the serde snake_case rendering for {state:?}"
            );
        }
        // And spot-check the exact literals the operator reads in the log.
        assert_eq!(state_label(WorkspaceState::Running), "running");
        assert_eq!(state_label(WorkspaceState::AwaitingInput), "awaiting_input");
        assert_eq!(
            state_label(WorkspaceState::BackgroundWork),
            "background_work"
        );
    }

    #[test]
    fn default_workspace_state_is_unknown() {
        // P2.4: Unknown is the derived Default — the honest no-data state. This pins
        // the #[default] choice so a future reorder/rename can't silently change the
        // default a consumer constructing `WorkspaceState::default()` would get.
        assert_eq!(WorkspaceState::default(), WorkspaceState::Unknown);
    }

    #[test]
    fn unknown_event_is_a_noop() {
        // Any event outside the mapped set is a no-op — never a guessed state.
        // PreToolUse is deliberately NOT mapped (QoL-WP2: we register PostToolUse as
        // the resume signal, NOT PreToolUse — UserPromptSubmit covers pre-tool state).
        assert_eq!(event_to_state(&ev("PreToolUse", "/p")), None);
        assert_eq!(event_to_state(&ev("", "/p")), None);
        assert_eq!(event_to_state(&ev("SessionStart", "/p")), None);
    }

    // ---- WorkspaceRegistry::resolve_cwd: hit / miss / canonicalization ----

    #[test]
    fn resolve_cwd_hit_on_registered_path() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        assert_eq!(
            reg.resolve_cwd(&dir.path().to_string_lossy()),
            Some("ws-1".to_string())
        );
    }

    #[test]
    fn len_tracks_open_workspace_count_across_register_deregister() {
        // M6 WP9: `len()` is the open-workspace count the PiP guards read (Auto auto-summon
        // suppression + On-mode reactive show/hide). Codify that it moves 0→1→2→1→0 across
        // register/deregister so a regression in the count signal — which would silently
        // resurrect the empty-PiP bug — is caught. Re-registering the same path does NOT
        // double-count (it's a HashMap keyed on the canonical path).
        let a = tempfile::TempDir::new().unwrap();
        let b = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        assert_eq!(reg.len(), 0, "empty registry → zero open workspaces");

        reg.register(a.path(), "ws-a".to_string());
        assert_eq!(reg.len(), 1);
        reg.register(b.path(), "ws-b".to_string());
        assert_eq!(reg.len(), 2);

        // Re-registering an already-open path keeps the count (same canonical key).
        reg.register(a.path(), "ws-a".to_string());
        assert_eq!(
            reg.len(),
            2,
            "re-register of the same path must not double-count"
        );

        reg.deregister(a.path());
        assert_eq!(reg.len(), 1);
        reg.deregister(b.path());
        assert_eq!(
            reg.len(),
            0,
            "all workspaces closed → count back to zero (PiP hides)"
        );
    }

    #[test]
    fn resolve_cwd_miss_returns_none() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        // A different (real) path is not registered → dropped.
        let other = tempfile::TempDir::new().unwrap();
        assert_eq!(reg.resolve_cwd(&other.path().to_string_lossy()), None);
        // A non-existent path also misses (canonicalize fails → lossy key → no match).
        assert_eq!(reg.resolve_cwd("/no/such/path/xyz"), None);
    }

    #[test]
    fn resolve_cwd_canonicalizes_both_sides() {
        // Register the canonical path, then resolve a non-canonical form of the same
        // dir (a trailing `.` component / symlink-equivalent). Canonicalization on
        // both sides must make them match (the M2 WP11 path-keying lesson).
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());

        // Build a non-canonical but equivalent path: <dir>/. (a redundant component).
        let non_canonical = dir.path().join(".");
        assert_eq!(
            reg.resolve_cwd(&non_canonical.to_string_lossy()),
            Some("ws-1".to_string()),
            "a non-canonical form of a registered dir must resolve via canonicalization"
        );
    }

    #[test]
    fn resolve_cwd_resolves_a_subdirectory_to_its_workspace() {
        // WP2 (stuck-Running dot): a CC turn whose shell cwd has descended into a
        // SUBDIRECTORY of the workspace root must still resolve to that workspace, so a
        // Stop fired from the subdir flips the dot to Idle. Before the fix, resolve_cwd
        // did an exact-equality lookup → a subdir cwd missed → the idle transition was
        // dropped → the dot stuck on Running. Telemetry-confirmed in prod 2026-06-27
        // (cwd=.../claudesk/src-tauri vs registered .../claudesk → resolved=none).
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());

        // A real nested subdir of the registered root.
        let subdir = dir.path().join("src-tauri");
        std::fs::create_dir(&subdir).unwrap();
        assert_eq!(
            reg.resolve_cwd(&subdir.to_string_lossy()),
            Some("ws-1".to_string()),
            "a Stop fired from a subdirectory of the workspace root must resolve to that workspace"
        );

        // A deeper nested subdir also resolves.
        let deeper = subdir.join("src/status_broadcaster");
        std::fs::create_dir_all(&deeper).unwrap();
        assert_eq!(
            reg.resolve_cwd(&deeper.to_string_lossy()),
            Some("ws-1".to_string()),
            "a deeply-nested subdir must still resolve to the workspace"
        );
    }

    #[test]
    fn resolve_cwd_nested_workspaces_longest_prefix_wins() {
        // When one workspace's root is itself nested under another's, a cwd inside the
        // inner workspace must resolve to the INNER one (longest/nearest match), not the
        // outer — otherwise an inner workspace's events would be misattributed.
        let outer = tempfile::TempDir::new().unwrap();
        let inner = outer.path().join("packages/inner");
        std::fs::create_dir_all(&inner).unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(outer.path(), "ws-outer".to_string());
        reg.register(&inner, "ws-inner".to_string());

        // A cwd inside the inner workspace → inner wins.
        let inner_subdir = inner.join("sub");
        std::fs::create_dir(&inner_subdir).unwrap();
        assert_eq!(
            reg.resolve_cwd(&inner_subdir.to_string_lossy()),
            Some("ws-inner".to_string()),
            "longest-prefix: a cwd under the inner workspace resolves to the inner one"
        );
        // A cwd under the outer root but NOT under inner → outer.
        let outer_only = outer.path().join("elsewhere");
        std::fs::create_dir(&outer_only).unwrap();
        assert_eq!(
            reg.resolve_cwd(&outer_only.to_string_lossy()),
            Some("ws-outer".to_string()),
            "a cwd under only the outer root resolves to the outer workspace"
        );
    }

    #[test]
    fn resolve_cwd_sibling_with_shared_string_prefix_does_not_match() {
        // Boundary-safety guard (WP2): ancestor matching is on PATH COMPONENTS, not raw
        // string prefix. A registered `<root>/src-tauri` must NOT resolve a cwd of
        // `<root>/src-tauri-foo` (a sibling whose name merely shares the `src-tauri`
        // string prefix). Pins the requirement so a future refactor can't regress to
        // `str::starts_with` and silently misattribute sibling dirs.
        let root = tempfile::TempDir::new().unwrap();
        let ws_dir = root.path().join("src-tauri");
        let sibling = root.path().join("src-tauri-foo");
        std::fs::create_dir(&ws_dir).unwrap();
        std::fs::create_dir(&sibling).unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(&ws_dir, "ws-1".to_string());
        assert_eq!(
            reg.resolve_cwd(&sibling.to_string_lossy()),
            None,
            "a sibling sharing only a string prefix must NOT resolve to the workspace"
        );
        // But the workspace dir itself + a real descendant still resolve.
        assert_eq!(
            reg.resolve_cwd(&ws_dir.to_string_lossy()),
            Some("ws-1".to_string())
        );
    }

    #[test]
    fn deregister_removes_the_mapping() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        assert_eq!(reg.len(), 1);
        reg.deregister(dir.path());
        assert_eq!(reg.len(), 0);
        assert_eq!(reg.resolve_cwd(&dir.path().to_string_lossy()), None);
    }

    #[test]
    fn registry_generalizes_to_n_gt_1_no_cross_workspace_bleed() {
        // M4 WP2 P4.3 — confirm the WP6 register/deregister list-diffing generalizes from
        // N<=1 to N>1: the map holds N entries, each cwd resolves to ITS OWN workspace_id
        // (no bleed), and deregistering one leaves the others intact + still resolving.
        let dir_a = tempfile::TempDir::new().unwrap();
        let dir_b = tempfile::TempDir::new().unwrap();
        let dir_c = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir_a.path(), "ws-1".to_string());
        reg.register(dir_b.path(), "ws-2".to_string());
        reg.register(dir_c.path(), "ws-3".to_string());
        assert_eq!(reg.len(), 3, "the map must hold all N=3 entries");

        // Each cwd resolves to its OWN workspace — a status event for one workspace's cwd
        // never bleeds into another's id.
        assert_eq!(
            reg.resolve_cwd(&dir_a.path().to_string_lossy()),
            Some("ws-1".to_string())
        );
        assert_eq!(
            reg.resolve_cwd(&dir_b.path().to_string_lossy()),
            Some("ws-2".to_string())
        );
        assert_eq!(
            reg.resolve_cwd(&dir_c.path().to_string_lossy()),
            Some("ws-3".to_string())
        );

        // Deregister the middle one (close one of N workspaces) — the others survive.
        reg.deregister(dir_b.path());
        assert_eq!(reg.len(), 2);
        assert_eq!(reg.resolve_cwd(&dir_b.path().to_string_lossy()), None);
        assert_eq!(
            reg.resolve_cwd(&dir_a.path().to_string_lossy()),
            Some("ws-1".to_string()),
            "deregistering ws-2 must not disturb ws-1"
        );
        assert_eq!(
            reg.resolve_cwd(&dir_c.path().to_string_lossy()),
            Some("ws-3".to_string()),
            "deregistering ws-2 must not disturb ws-3"
        );
    }

    // ---- to_update: full transform (mapped+resolved → Some; unmapped/unresolved → None) ----

    #[test]
    fn to_update_builds_dto_for_mapped_and_resolved_event() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());

        let mut event = ev("UserPromptSubmit", &dir.path().to_string_lossy());
        event.timestamp = Some(1_718_000_000_000);
        event.prompt = Some("do the thing".to_string());

        let update = to_update(&event, &reg).expect("mapped+resolved event yields a DTO");
        assert_eq!(update.workspace_id, "ws-1");
        assert_eq!(update.state, WorkspaceState::Running);
        assert_eq!(update.last_event_at, Some(1_718_000_000_000));
        assert_eq!(update.last_output_snippet.as_deref(), Some("do the thing"));
    }

    // ---- is_turn_start: the M13.5-WP3 turn-start discriminator ----

    #[test]
    fn turn_start_separates_the_two_running_producers() {
        // ⚠️ THE CORE OF M13.5 WP3, and the reason the field exists at all.
        //
        // `UserPromptSubmit` and `PostToolUse` BOTH map to Running. A consumer that reads
        // "a turn started" off `state == Running` therefore fires on every tool call — in a
        // measured p95 turn (378 events) that is hundreds of spurious turn markers. This
        // test pins the property that makes the two distinguishable ON THE WIRE while their
        // `state` stays deliberately identical.
        //
        // If this test is ever "simplified" to assert only the state, the feature it guards
        // silently breaks: the markers still appear, just in all the wrong places.
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        let cwd = dir.path().to_string_lossy().to_string();

        let start = to_update(&ev("UserPromptSubmit", &cwd), &reg).expect("mapped+resolved");
        let resume = to_update(&ev("PostToolUse", &cwd), &reg).expect("mapped+resolved");

        // Same derived state — this is NOT a bug to "fix"; it is why the field is needed.
        assert_eq!(start.state, WorkspaceState::Running);
        assert_eq!(resume.state, WorkspaceState::Running);
        assert_eq!(
            start.state, resume.state,
            "the two producers must remain state-identical — the discriminator, not the \
             state, is what separates them"
        );

        // ...but only one of them begins a turn.
        assert_eq!(
            start.is_turn_start,
            Some(true),
            "UserPromptSubmit begins a turn"
        );
        assert_eq!(
            resume.is_turn_start,
            Some(false),
            "PostToolUse RESUMES a turn (fires many times per turn) — it must never read as \
             a turn start"
        );
    }

    #[test]
    fn turn_start_is_false_for_every_other_mapped_event() {
        // No event other than UserPromptSubmit may claim a turn start. Enumerated rather
        // than sampled: a future mapped event added to event_to_state without a thought
        // about this field should surface here.
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        let cwd = dir.path().to_string_lossy().to_string();

        // Stop (→ Idle) and Stop-with-background-work (→ BackgroundWork, M13.5 WP2).
        let stop = to_update(&ev("Stop", &cwd), &reg).expect("mapped");
        assert_eq!(stop.state, WorkspaceState::Idle);
        assert_eq!(stop.is_turn_start, Some(false));

        let mut bg_ev = ev("Stop", &cwd);
        bg_ev.background_task_count = Some(2);
        let bg = to_update(&bg_ev, &reg).expect("mapped");
        assert_eq!(bg.state, WorkspaceState::BackgroundWork);
        assert_eq!(bg.is_turn_start, Some(false));

        // An input-needed Notification (→ AwaitingInput).
        let mut notif_ev = ev("Notification", &cwd);
        notif_ev.notification_type = Some("permission_prompt".to_string());
        let notif = to_update(&notif_ev, &reg).expect("mapped");
        assert_eq!(notif.state, WorkspaceState::AwaitingInput);
        assert_eq!(notif.is_turn_start, Some(false));
    }

    #[test]
    fn event_is_turn_start_predicate_pins_the_rule() {
        // The predicate directly — one home for the rule, so a caller can't drift from it.
        assert!(event_is_turn_start(&ev("UserPromptSubmit", "/p")));
        for name in [
            "PostToolUse",
            "PreToolUse",
            "Stop",
            "SubagentStop",
            "Notification",
            "SessionStart",
            "",
        ] {
            assert!(
                !event_is_turn_start(&ev(name, "/p")),
                "{name} must not read as a turn start"
            );
        }
    }

    #[test]
    fn event_is_turn_end_predicate_pins_the_rule() {
        // M15 WP3. The mirror of the turn-start pin — one home for the rule.
        assert!(event_is_turn_end(&ev("Stop", "/p")));
        for name in [
            "UserPromptSubmit",
            "PostToolUse",
            "PreToolUse",
            // ⚠️ `SubagentStop` is NOT a turn end. It was never involved in the M13.5 WP2
            // BackgroundWork work either — a subagent finishing is not the operator's turn
            // ending, and firing the supervisor on it would chain mid-turn.
            "SubagentStop",
            "Notification",
            "SessionStart",
            "",
        ] {
            assert!(
                !event_is_turn_end(&ev(name, "/p")),
                "{name} must not read as a turn end"
            );
        }
    }

    #[test]
    fn turn_end_fires_for_both_states_stop_can_map_to() {
        // ⚠️ THE REGRESSION THIS TEST EXISTS FOR, STATED PLAINLY.
        //
        // `event_to_state` sends `Stop` to TWO states — Idle, and BackgroundWork when
        // `background_task_count > 0`. A supervisor that asked "did a turn end?" by matching
        // a STATE would match one of them and silently never fire on the other. That is the
        // exact shape of the M13.5 WP2 shipped CRITICAL
        // (`[[derived-state-is-not-a-proxy-for-its-event]]`): when a closed enum gains a
        // member, every consumer of a sibling literal must be swept, and the failure mode is
        // a silent hang, not an error.
        //
        // So: assert the marker is true across BOTH mappings, and assert the mappings really
        // are different — otherwise this test would still pass if a future edit collapsed
        // `Stop` onto one state and made the whole hazard vanish silently.
        let plain = stop_with_bg(Some(0), "/p");
        let background = stop_with_bg(Some(3), "/p");

        assert_eq!(event_to_state(&plain), Some(WorkspaceState::Idle));
        assert_eq!(
            event_to_state(&background),
            Some(WorkspaceState::BackgroundWork),
            "the two Stop mappings must remain DISTINCT — if they collapse, this test's \
             premise is gone and the turn-end marker needs re-examining, not just re-running"
        );

        assert!(event_is_turn_end(&plain), "Stop → Idle is a turn end");
        assert!(
            event_is_turn_end(&background),
            "⚠️ Stop → BackgroundWork is ALSO a turn end — a turn that ends with background \
             work outstanding has still ENDED, and gets NO later completion event to wait for"
        );

        // And end-to-end through the DTO, since the marker's whole job is to reach a consumer.
        let mut registry = WorkspaceRegistry::default();
        registry.register(Path::new("/p"), "ws-1".to_string());
        for event in [&plain, &background] {
            let update = to_update(event, &registry).expect("Stop maps to a state");
            assert_eq!(
                update.is_turn_end,
                Some(true),
                "state {:?} must still carry the turn-end marker",
                update.state
            );
        }
    }

    #[test]
    fn session_id_reaches_the_dto_and_empty_reads_as_absent() {
        // M15 WP3 task 3.2 — the uuid that disambiguates two CC sessions in one tree. It was
        // already being parsed off the wire and DROPPED before the DTO; this pins that it
        // now arrives.
        let mut registry = WorkspaceRegistry::default();
        registry.register(Path::new("/p"), "ws-1".to_string());

        let with_id = HookEvent {
            session_id: "sess-abc".to_string(),
            ..ev("Stop", "/p")
        };
        assert_eq!(
            to_update(&with_id, &registry).unwrap().session_id,
            Some("sess-abc".to_string())
        );

        // ⚠️ Empty must read as ABSENT, not as a session whose id is "". `HookEvent`'s
        // `#[serde(default)]` yields `""` for a payload that omits the key, so without the
        // filter a degraded payload would present an unusable id as a real address — and
        // every such payload would compare EQUAL to every other one.
        let without_id = HookEvent {
            session_id: String::new(),
            ..ev("Stop", "/p")
        };
        assert_eq!(to_update(&without_id, &registry).unwrap().session_id, None);
    }

    #[test]
    fn status_update_serde_round_trips_for_tray_consumer() {
        // M7: the menu-bar tray consumes the emitted `workspace-status` payload IN-PROCESS
        // via serde_json::from_str::<WorkspaceStatusUpdate>(event.payload()). This pins the
        // Serialize→Deserialize round-trip the tray's listener depends on — a regression
        // (e.g. a future field added without #[serde(default)], or a rename breaking the
        // snake_case contract) would silently break tray parsing with green app-level tests.

        // (1) Full-shape update round-trips to an EQUAL value.
        let full = WorkspaceStatusUpdate {
            workspace_id: "ws-1".to_string(),
            state: WorkspaceState::AwaitingInput,
            last_event_at: Some(1_718_000_000_000),
            last_output_snippet: Some("perm?".to_string()),
            notification_type: Some("permission_prompt".to_string()),
            is_turn_start: Some(false),
            is_turn_end: Some(false),
            session_id: Some("sess-abc".to_string()),
        };
        let json = serde_json::to_string(&full).unwrap();
        let back: WorkspaceStatusUpdate = serde_json::from_str(&json).unwrap();
        assert_eq!(back, full);

        // (2) MINIMAL wire shape — the four Option fields are skip_serializing_if-omitted
        // when None, so the emitted JSON has only workspace_id + state. The tray must still
        // deserialize it (the #[serde(default)] guard). This is the common live shape (a
        // Stop/UserPromptSubmit with no timestamp/snippet/type).
        //
        // ⚠️ `is_turn_start` absent must deserialize to None — i.e. "not a turn start" —
        // NOT fail and NOT default to a marker. An older/degraded payload must lose the
        // turn marker, never invent one (M13.5 WP3).
        let minimal_json = r#"{"workspace_id":"ws-2","state":"running"}"#;
        let parsed: WorkspaceStatusUpdate = serde_json::from_str(minimal_json).unwrap();
        assert_eq!(parsed.workspace_id, "ws-2");
        assert_eq!(parsed.state, WorkspaceState::Running);
        assert_eq!(parsed.last_event_at, None);
        assert_eq!(parsed.last_output_snippet, None);
        assert_eq!(parsed.notification_type, None);
        assert_eq!(parsed.is_turn_start, None);
        // ⚠️ M15 WP3 — the same absent-means-None guarantee for the two NEW fields.
        //
        // ⚠️ HONEST SCOPE, because the obvious reading is wrong: this does NOT guard the
        // `#[serde(default)]` attribute. Mutation-tested 2026-09-13 — removing `default`
        // from `is_turn_end` leaves this test GREEN, because serde already treats a missing
        // `Option<T>` as `None` without it (the attribute is belt-and-braces on an Option,
        // and is kept only for symmetry with the sibling fields).
        //
        // What it DOES guard is the property that actually matters to the supervisor: a
        // degraded or older payload reads as "no turn-end marker" rather than failing to
        // parse or inventing one. (A change to a bare `bool` is caught EARLIER, at compile
        // time — also mutation-checked. So the runtime hole this closes is narrow: a future
        // `#[serde(deny_unknown_fields)]` or a rename of the wire key, which would make the
        // minimal payload stop parsing.) Documented precisely rather than overclaimed,
        // because a test whose comment promises more than it checks is how a guard quietly
        // stops guarding.
        assert_eq!(parsed.is_turn_end, None);
        assert_eq!(parsed.session_id, None);

        // (3) The snake_case state rendering the tray folds over is pinned end-to-end.
        assert_eq!(
            serde_json::from_str::<WorkspaceState>("\"awaiting_input\"").unwrap(),
            WorkspaceState::AwaitingInput
        );
    }

    #[test]
    fn a_stop_event_survives_the_whole_emit_path_to_the_tray_consumer() {
        // M15 WP3 Phase 1 — THE CONSUMING-SURFACE TEST.
        //
        // ⚠️ WHY A SEPARATE TEST WHEN THE PARTS ARE ALREADY COVERED. This phase changed the
        // payload SHAPE of a DTO that the menu-bar tray, the PiP webview, the filmstrip and
        // XtermPane already consume — an integration boundary. Every piece of that path had
        // a test (`to_update` builds the DTO; the round-trip test parses one) but NOTHING
        // asserted the pieces compose: that a real `HookEvent` entering the broadcaster comes
        // out the other side, through serialization, still carrying the new fields.
        //
        // That gap is this repo's standing defect shape — *a mechanism correct in itself
        // behind a caller that does not honor it*, four occurrences, one shipped CRITICAL.
        // This is the end-to-end codification of what was verified live at verify-self by
        // writing hook JSON to the dev app's socket and reading the emitted payload back.
        let mut registry = WorkspaceRegistry::default();
        registry.register(Path::new("/proj"), "ws-1".to_string());

        // Both Stop mappings, because the whole point of `is_turn_end` is that it survives
        // BOTH — a consumer keying on `state` would see only one of these.
        for (bg, expected_state) in [
            (0, WorkspaceState::Idle),
            (3, WorkspaceState::BackgroundWork),
        ] {
            let event = HookEvent {
                session_id: "sess-live".to_string(),
                background_task_count: Some(bg),
                ..ev("Stop", "/proj")
            };

            let update = to_update(&event, &registry).expect("a Stop in a registered cwd emits");
            assert_eq!(update.state, expected_state);

            // Serialize exactly as the broadcaster emits, then parse exactly as the tray does.
            let wire = serde_json::to_string(&update).unwrap();
            let seen: WorkspaceStatusUpdate = serde_json::from_str(&wire).unwrap();

            assert_eq!(
                seen.is_turn_end,
                Some(true),
                "the turn-end marker must survive the wire for state {expected_state:?}"
            );
            assert_eq!(seen.session_id, Some("sess-live".to_string()));
            assert_eq!(seen.is_turn_start, Some(false));
            assert_eq!(seen.state, expected_state);
        }
    }

    #[test]
    fn to_update_drops_event_for_unregistered_cwd() {
        let reg = WorkspaceRegistry::new(); // empty — nothing registered
        let event = ev("Stop", "/some/unregistered/path");
        assert!(to_update(&event, &reg).is_none());
    }

    // --- open_project_paths: the M12 WP2 app-quit clearing source (P2.3) ---
    //
    // `perform_quit_teardown` clears the unclean-exit flag for every OPEN workspace, but it
    // holds only session ids — `PtyCcSession` does not retain its project path (consumed as
    // the PTY's cwd at spawn). This registry is the one place that already knows the open
    // path set, so app-quit reads it from here. These tests cover the seam; the teardown
    // itself needs an `AppHandle` and was verified live instead (verify-self outcome 4).

    #[test]
    fn open_project_paths_lists_every_registered_workspace() {
        let a = tempfile::TempDir::new().unwrap();
        let b = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(a.path(), "ws-1".to_string());
        reg.register(b.path(), "ws-2".to_string());

        let mut paths = reg.open_project_paths();
        paths.sort();
        let mut want = vec![canonical_key(a.path()), canonical_key(b.path())];
        want.sort();
        assert_eq!(
            paths, want,
            "app-quit must see EVERY open workspace — a missing path means that project's \
             flag is never cleared, and the next open fires a spurious /resume"
        );
    }

    #[test]
    fn open_project_paths_is_empty_with_no_workspaces_open() {
        let reg = WorkspaceRegistry::new();
        assert!(
            reg.open_project_paths().is_empty(),
            "quitting with nothing open must clear nothing"
        );
    }

    #[test]
    fn open_project_paths_drops_a_deregistered_workspace() {
        // A workspace closed BEFORE the quit already cleared its own flag via the close
        // route; app-quit must not revisit it (harmless but wasteful), and more importantly
        // the list must track the live set rather than everything ever opened.
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        reg.deregister(dir.path());
        assert!(reg.open_project_paths().is_empty());
    }

    #[test]
    fn open_project_paths_returns_canonicalized_keys() {
        // ⚠️ Load-bearing for M12 WP2. The flag is keyed through `session_state::key_for`,
        // which canonicalizes; app-quit's clear must therefore be handed the SAME form or
        // it silently clears nothing (no error — just a stale flag firing a later /resume).
        // A `/tmp/...` TempDir is the natural probe on macOS, where `/tmp` is a symlink to
        // `/private/tmp`, so an uncanonicalized path would differ visibly here.
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());

        let paths = reg.open_project_paths();
        assert_eq!(paths.len(), 1);
        assert_eq!(
            paths[0],
            canonical_key(dir.path()),
            "the returned key must be the canonicalized form the flag store also uses"
        );
    }

    #[test]
    fn to_update_drops_unmapped_event_even_when_cwd_registered() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        // A non-lifecycle event is a no-op regardless of cwd registration.
        let event = ev("PreToolUse", &dir.path().to_string_lossy());
        assert!(to_update(&event, &reg).is_none());
    }

    #[test]
    fn to_update_uses_message_as_snippet_for_notification() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());
        let mut event = ev("Notification", &dir.path().to_string_lossy());
        event.message = Some("Claude needs your permission".to_string());

        let update = to_update(&event, &reg).unwrap();
        assert_eq!(update.state, WorkspaceState::AwaitingInput);
        assert_eq!(
            update.last_output_snippet.as_deref(),
            Some("Claude needs your permission")
        );
    }

    #[test]
    fn to_update_carries_notification_type_and_drops_informational() {
        let dir = tempfile::TempDir::new().unwrap();
        let mut reg = WorkspaceRegistry::new();
        reg.register(dir.path(), "ws-1".to_string());

        // An input-needed notification → DTO built, carrying notification_type through.
        let permission = notif(Some("permission_prompt"), &dir.path().to_string_lossy());
        let update = to_update(&permission, &reg).expect("permission_prompt yields a DTO");
        assert_eq!(update.state, WorkspaceState::AwaitingInput);
        assert_eq!(
            update.notification_type.as_deref(),
            Some("permission_prompt")
        );

        // An informational notification → dropped (no-op), prior state preserved.
        let idle = notif(Some("idle_prompt"), &dir.path().to_string_lossy());
        assert!(
            to_update(&idle, &reg).is_none(),
            "an idle_prompt notification must be dropped, not emitted as AwaitingInput"
        );
    }

    // ---- DTO serde-shape contract (folds in SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE) ----

    #[test]
    fn dto_serde_shape_is_snake_case() {
        // Pin the exact wire keys so WP6's TS type mirrors them verbatim. A future
        // `rename_all`/field rename must break this test, not silently drift.
        let update = WorkspaceStatusUpdate {
            workspace_id: "ws-1".to_string(),
            state: WorkspaceState::Running,
            last_event_at: Some(123),
            last_output_snippet: Some("hi".to_string()),
            notification_type: Some("permission_prompt".to_string()),
            is_turn_start: Some(true),
            is_turn_end: Some(false),
            session_id: Some("sess-abc".to_string()),
        };
        let value = serde_json::to_value(&update).unwrap();
        let obj = value.as_object().unwrap();

        // Exact key set, all snake_case (incl. the QoL-WP2 notification_type field, the
        // M13.5-WP3 is_turn_start field, and the M15-WP3 is_turn_end + session_id fields).
        let mut keys: Vec<&String> = obj.keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                &"is_turn_end".to_string(),
                &"is_turn_start".to_string(),
                &"last_event_at".to_string(),
                &"last_output_snippet".to_string(),
                &"notification_type".to_string(),
                &"session_id".to_string(),
                &"state".to_string(),
                &"workspace_id".to_string(),
            ]
        );

        // The state enum serializes snake_case too.
        assert_eq!(obj["state"], serde_json::json!("running"));
        assert_eq!(obj["workspace_id"], serde_json::json!("ws-1"));
        assert_eq!(obj["last_event_at"], serde_json::json!(123));
        assert_eq!(obj["last_output_snippet"], serde_json::json!("hi"));
        assert_eq!(
            obj["notification_type"],
            serde_json::json!("permission_prompt")
        );
        assert_eq!(obj["is_turn_start"], serde_json::json!(true));
        assert_eq!(obj["is_turn_end"], serde_json::json!(false));
        assert_eq!(obj["session_id"], serde_json::json!("sess-abc"));
    }

    #[test]
    fn dto_omits_optional_fields_when_absent() {
        // skip_serializing_if = Option::is_none → minimal wire shape.
        let update = WorkspaceStatusUpdate {
            workspace_id: "ws-1".to_string(),
            state: WorkspaceState::Unknown,
            last_event_at: None,
            last_output_snippet: None,
            notification_type: None,
            is_turn_start: None,
            is_turn_end: None,
            session_id: None,
        };
        let value = serde_json::to_value(&update).unwrap();
        let obj = value.as_object().unwrap();
        assert!(!obj.contains_key("last_event_at"));
        assert!(!obj.contains_key("last_output_snippet"));
        assert!(!obj.contains_key("notification_type"));
        assert!(!obj.contains_key("is_turn_start"));
        assert!(!obj.contains_key("is_turn_end"));
        assert!(!obj.contains_key("session_id"));
        assert_eq!(obj["state"], serde_json::json!("unknown"));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Arch-doc coupling guard (M13.5 WP5).
    //
    // ⚠️ WHY THIS EXISTS: M13.5 WP2 shipped the `BackgroundWork` state on 2026-08-22 and
    // `arch/status-channel-and-surfaces.md` went FOUR DAYS still describing the model as
    // three states. That doc is declared the AUTHORITY in CLAUDE.md ("where the arch/ set
    // and roadmap.md differ, the arch/ set is the authority"), so a stale arch doc does not
    // merely lag — it actively states a refuted model as live specification. Nothing failed;
    // the resync depended on a closing agent remembering a conditional WBS task
    // (`SURFACE-2026-08-26-NO-GATE-FAILS-WHEN-A-SHIPPED-STATE-HAS-NO-ARCH-MENTION`).
    //
    // `tray::aggregate_alarm` already makes a 5th state fail to COMPILE. This is the
    // documentation half of that same property: a 5th state also fails to be UNDOCUMENTED.
    //
    // ⚠️ The variant list is written out literally rather than derived. Rust has no stable
    // variant reflection, and a derive-based list would be satisfied by the enum agreeing
    // with itself. `unknown_variant_is_rejected` below pins the literal list against the
    // real enum via serde, so adding a variant without touching this block fails there.
    // ─────────────────────────────────────────────────────────────────────────────

    /// The authoritative arch doc for this subsystem, embedded at COMPILE time.
    ///
    /// ⚠️ One binding rather than a repeated `include_str!`, so the four-level traversal out
    /// of the crate root into the docs tree is stated once and is greppable. `include_str!`
    /// (not `std::fs`) deliberately: a moved or renamed doc then breaks the BUILD loudly
    /// instead of failing a test at runtime. The TS-side sibling guard uses `node:fs`
    /// because its file is outside the Vite graph — different tool, same intent.
    fn arch_doc() -> &'static str {
        include_str!("../../../workflow-system/product/arch/status-channel-and-surfaces.md")
    }

    /// Anti-vacuity: prove the doc actually loaded and is the file we think it is.
    ///
    /// ⚠️ **A HEAD ANCHOR CANNOT SEE TRUNCATION — truncation eats the TAIL.** So this pins
    /// one anchor near the top (§A) *and* one near the bottom (§B); a file cut in half
    /// still satisfies the first and fails the second. That pair replaces a bare
    /// `doc.len() > 5_000` byte threshold, which was the wrong instrument twice over: the
    /// number was underived (this doc is ~37 KB, so 5 KB was ~7× slack and would miss a
    /// gut-to-20%), and an unexplained numeric threshold is the shape a future reader
    /// LOWERS on first failure instead of investigating.
    fn assert_doc_loaded(doc: &str) {
        assert!(
            doc.contains("## A. Status broadcaster + Unix-socket hook channel"),
            "arch doc missing its §A heading — wrong file, or the include path moved?"
        );
        assert!(
            doc.contains("## B. Three status surfaces (subscribers)"),
            "arch doc missing its §B heading — the file is TRUNCATED (a head-only check \
             would have passed this). Do not relax the assertions below to compensate."
        );
    }

    /// The arch doc must name every wire-visible `WorkspaceState` variant.
    ///
    /// ⚠️ `Unknown` is deliberately EXCLUDED: it is the pre-first-event default and is
    /// never emitted by the broadcaster, so it is not part of the surface contract the doc
    /// describes. The other four all cross the socket and all render.
    #[test]
    fn arch_doc_names_every_emitted_workspace_state() {
        let doc = arch_doc();
        assert_doc_loaded(doc);

        // ⚠️ ANCHORED TO THE SITE, NOT TO FOUR FREE-FLOATING WORDS. The bare variant names
        // are NOT unique to this doc — across the file `Idle` occurs 4×, `Running` 5×,
        // `AwaitingInput` 7×, `BackgroundWork` 3×, in unrelated prose (a menu-bar
        // aggregation sentence, an `aggregate_alarm` note). A `contains("Idle")` loop
        // therefore passes with the state contract *gutted*, which was measured, not
        // supposed: replacing the union below with `state: REDACTED` left the old guard
        // GREEN. That is failure form 12 in `docs/lessons/source-text-guards.md` — "a
        // substring that OCCURS at the site is not ANCHORED to it".
        //
        // ⚠️ AND THE MUTATION PROOF THAT MISSED IT IS THE LESSON: the original probe was a
        // RENAME (`BackgroundWork` -> `BackgroundWorkX`), which tests boundary-matching and
        // is blind to anchoring. `grep -c` is the one-command check that finds this, and it
        // is prescribed by that same lesson. Both target strings below were `grep -c`'d
        // before being relied on: each occurs exactly ONCE.
        for site in [
            // The wire contract itself (the `WorkspaceStatusUpdate` DTO).
            "state: Idle|Running|AwaitingInput|BackgroundWork",
            // The rendered indicator list, which carries `Unknown` too.
            "Idle / Running / AwaitingInput / BackgroundWork / Unknown",
        ] {
            assert!(
                doc.contains(site),
                "arch/status-channel-and-surfaces.md no longer states the full state union \
                 `{site}`. Every emitted WorkspaceState must appear THERE, not merely \
                 somewhere in the file — a shipped state the authoritative arch doc omits \
                 reads as a refuted model left standing as live spec. Document it at the \
                 site; do not weaken this to a bare-word search."
            );
        }
    }

    /// The `BackgroundWork` signal + colour must be recorded, not just the variant name.
    ///
    /// ⚠️ Asserts `background_task_count` specifically, because the WBS, the WP2 CHANGELOG
    /// line and this WP's own plan all said `background_tasks[]` (the ARRAY). The hook
    /// forwards only the array's LENGTH — `command`/`description` in that array are
    /// arbitrary user shell text, the same privacy class as the raw prompt. A doc that
    /// says "array" invites a future reader to forward the tasks themselves.
    #[test]
    fn arch_doc_records_the_background_work_signal_and_colour() {
        let doc = arch_doc();
        assert_doc_loaded(doc);
        assert!(
            doc.contains("background_task_count"),
            "arch doc must name the COUNT field (not `background_tasks[]`) as BackgroundWork's signal"
        );
        assert!(
            doc.contains("a371f7"),
            "arch doc must record BackgroundWork's colour so the three surfaces stay in agreement"
        );
    }

    /// Pins the literal variant list above against the real enum.
    ///
    /// ⚠️ **Measured, not assumed: a 5th variant does not reach this test — it fails to
    /// COMPILE.** Probed by adding one: two `non-exhaustive patterns` errors fire first
    /// (`tray::aggregate_alarm` and one sibling match), so the build stops before any test
    /// runs. This assertion is therefore a **redundant backstop**, not the primary guard —
    /// it earns its place only for the case where a future variant is added *alongside* new
    /// match arms (which compiles cleanly and would otherwise reach the arch doc undocumented).
    /// Recorded so a later reader does not mistake it for the mechanism that actually bites.
    #[test]
    fn every_emitted_variant_round_trips_and_no_fifth_exists() {
        for (variant, wire) in [
            (WorkspaceState::Idle, "idle"),
            (WorkspaceState::Running, "running"),
            (WorkspaceState::AwaitingInput, "awaiting_input"),
            (WorkspaceState::BackgroundWork, "background_work"),
        ] {
            let json = serde_json::to_string(&variant).expect("serialize");
            assert_eq!(json, format!("\"{wire}\""));
        }
        // The sentinel: a name no current variant uses. If someone adds a variant and
        // happens to name it this, that is a deliberate collision, not an accident.
        assert!(
            serde_json::from_str::<WorkspaceState>("\"a_fifth_state_was_added\"").is_err(),
            "a 5th WorkspaceState exists — add it to `arch_doc_names_every_emitted_workspace_state` \
             and document it in arch/status-channel-and-surfaces.md"
        );
    }
}
