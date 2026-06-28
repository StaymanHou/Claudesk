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
//! - `Stop`             → [`WorkspaceState::Idle`] (CC finished, awaiting nothing)
//! - `PostToolUse`      → [`WorkspaceState::Running`] (a tool finished, CC resumed —
//!   the **answer-resume signal**: when a user answers an `AskUserQuestion`/permission
//!   prompt CC fires `PostToolUse` but NO `UserPromptSubmit`, so this is what clears a
//!   stuck `AwaitingInput`)
//! - `Notification`     → [`WorkspaceState::AwaitingInput`] **gated on
//!   `notification_type`**: a genuine input-needed type (`permission_prompt`,
//!   `elicitation_dialog`) or an unknown/absent type → AwaitingInput; a known
//!   non-input type (`idle_prompt`, `auth_success`, …) → no-op (`None`), so the dot
//!   doesn't flip blue on an idle nudge.
//! - any other event    → no-op (`None`) — never guessed, never emitted
//!
//! [`WorkspaceState::Unknown`] is the **honest no-data default** a surface shows for
//! a workspace before any event has arrived (arch.md failure mode). The broadcaster
//! never *emits* `Unknown` from an event — an event either maps to one of the three
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

use serde::Serialize;

use crate::hook_socket::HookEvent;

/// A workspace's CC lifecycle state, derived solely from the hook channel (never
/// from PTY output). Serializes snake_case so the frontend mirrors it verbatim.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceState {
    /// CC is idle (finished its last turn) — emitted on `Stop`.
    Idle,
    /// CC is actively working a prompt — emitted on `UserPromptSubmit`.
    Running,
    /// CC has paused for the user (permission / input) — emitted on `Notification`.
    AwaitingInput,
    /// No hook event observed yet — the honest default a surface shows before any
    /// event arrives. Never *emitted* from an event (the broadcaster only ever
    /// produces the three live states); it exists on the Rust side so the DTO enum
    /// is complete and its `"unknown"` serde rendering is pinned. The frontend (TS)
    /// owns it as the initial state a workspace shows before its first hook event.
    /// Marked the `#[default]` because Unknown IS the absence-of-data state — this
    /// also gives the variant a live (non-test) presence via the derived `Default`.
    #[default]
    Unknown,
}

/// The `notification_type` values that mean CC is GENUINELY blocked on the user —
/// these map to [`WorkspaceState::AwaitingInput`]. Everything else CC sends as a
/// `Notification` (`idle_prompt`, `auth_success`, `elicitation_complete`,
/// `elicitation_response`, …) is informational and must NOT flip a busy dot blue
/// (QoL-WP2). An UNKNOWN or ABSENT type falls back to AwaitingInput (honest default —
/// never silently swallow a future CC notification type; mirrors the `Unknown`
/// no-data principle). Live-captured type for AskUserQuestion/permission: `permission_prompt`.
const INPUT_NEEDED_NOTIFICATION_TYPES: [&str; 2] = ["permission_prompt", "elicitation_dialog"];

/// Whether a `Notification`'s `notification_type` means "awaiting genuine user input."
/// `None`/absent or an unrecognized type → `true` (honest fallback). A recognized
/// informational type → `false` (no-op; the prior state is preserved).
fn notification_awaits_input(notification_type: Option<&str>) -> bool {
    match notification_type {
        // Absent type → conservative AwaitingInput (older CC, or a type CC didn't tag).
        None => true,
        Some(t) if INPUT_NEEDED_NOTIFICATION_TYPES.contains(&t) => true,
        // A recognized non-input type (idle_prompt, auth_success, elicitation_complete,
        // elicitation_response, …) → informational, not a fresh input request.
        Some(t) if is_known_informational_notification(t) => false,
        // An UNKNOWN type → honest fallback to AwaitingInput (don't swallow a future type).
        Some(_) => true,
    }
}

/// The recognized informational `notification_type`s that do NOT mean "awaiting input."
/// Kept explicit (not "anything not input-needed") so a genuinely unknown future type
/// falls through to the conservative AwaitingInput default rather than being silently
/// treated as informational.
fn is_known_informational_notification(t: &str) -> bool {
    matches!(
        t,
        "idle_prompt" | "auth_success" | "elicitation_complete" | "elicitation_response"
    )
}

/// Normalize a [`HookEvent`] to a [`WorkspaceState`]. Returns `None` for any event
/// that is not a mapped lifecycle event, OR for a `Notification` whose
/// `notification_type` is a recognized informational one (a no-op — the prior state
/// is preserved). An unknown event is a no-op, never a guessed state.
pub fn event_to_state(event: &HookEvent) -> Option<WorkspaceState> {
    match event.hook_event_name.as_str() {
        "UserPromptSubmit" => Some(WorkspaceState::Running),
        "Stop" => Some(WorkspaceState::Idle),
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
/// carries the `Notification` subtype (QoL-WP2). All three are `Option` and
/// `skip_serializing_if`-omitted when absent so the wire shape is minimal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceStatusUpdate {
    /// The registry id of the workspace this event belongs to.
    pub workspace_id: String,
    /// The derived CC lifecycle state.
    pub state: WorkspaceState,
    /// Hook-side send time (epoch ms), if the event carried one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_event_at: Option<u64>,
    /// The event's prompt/message text, if present (telemetry for the surface).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_output_snippet: Option<String>,
    /// The `Notification` subtype (`permission_prompt` / `idle_prompt` / …), if the
    /// event carried one (QoL-WP2). Telemetry/diagnostic for the surface — the
    /// AwaitingInput-vs-no-op gating decision is made backend-side in `event_to_state`,
    /// NOT by the frontend; this field is exposed so a surface can show *why* (e.g. a
    /// tooltip) without re-deriving.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_type: Option<String>,
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
            // Longest registered key wins (nearest enclosing workspace). Comparing by the
            // canonicalized string length is a valid proxy for component depth here since
            // every key is an ancestor of the same cwd (so they're prefixes of each other).
            .max_by_key(|(registered, _)| registered.len())
            .map(|(_, ws)| ws.clone())
    }

    /// Test/inspection helper: number of registered workspaces.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.by_path.len()
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
    })
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
        // it agrees with the serde snake_case wire rendering for ALL four variants, so a
        // future enum reorder/rename can't silently drift the log label away from the DTO
        // (the same drift-guard discipline as `dto_serde_shape_is_snake_case`). Assert
        // against serde to keep the two derivations in lockstep, not against literals.
        for state in [
            WorkspaceState::Idle,
            WorkspaceState::Running,
            WorkspaceState::AwaitingInput,
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

    #[test]
    fn to_update_drops_event_for_unregistered_cwd() {
        let reg = WorkspaceRegistry::new(); // empty — nothing registered
        let event = ev("Stop", "/some/unregistered/path");
        assert!(to_update(&event, &reg).is_none());
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
        };
        let value = serde_json::to_value(&update).unwrap();
        let obj = value.as_object().unwrap();

        // Exact key set, all snake_case (incl. the QoL-WP2 notification_type field).
        let mut keys: Vec<&String> = obj.keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                &"last_event_at".to_string(),
                &"last_output_snippet".to_string(),
                &"notification_type".to_string(),
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
        };
        let value = serde_json::to_value(&update).unwrap();
        let obj = value.as_object().unwrap();
        assert!(!obj.contains_key("last_event_at"));
        assert!(!obj.contains_key("last_output_snippet"));
        assert!(!obj.contains_key("notification_type"));
        assert_eq!(obj["state"], serde_json::json!("unknown"));
    }
}
