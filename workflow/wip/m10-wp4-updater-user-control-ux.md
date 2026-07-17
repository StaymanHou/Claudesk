---
drive_mode: autopilot
---

# Feature: M10 WP4 — Updater user-control UX + persistence

**Workflow:** feature
**State:** verify-codify (all phases complete) → ready for /feature-ship
**Created:** 2026-07-17
**Entry:** spec (complex feature — new prefs + a new user-facing control surface; > ~200 LOC across backend prefs + frontend UX)
**Milestone:** M10 (in-app auto-updater) — WP4 of 6. WP2 (updater core) + WP3 (brew gate) + WP5 (`/release` pipeline) already SHIPPED (local, unpushed). WP4 is the last build WP before WP6's exit gate.

## Problem Statement

M10 WP2 shipped a working update flow (`updater_check` / `updater_apply`) driven by a **throwaway** corner widget (`src/updater/UpdaterTrigger.tsx`) — a bare inline confirm with no polish, no persistence, no menu affordance, no progress, no skip/disable controls. It exists only so WP6 can drive the real installed-build flow end-to-end.

WP4 replaces that throwaway with the **real user-control surface**, honoring the milestone's core promise: **the user is always in control — no silent/forced updates.** Concretely, the user must be able to:
- **See** a non-modal notification when a newer version is available (not a blocking modal on launch).
- **Skip** a specific version (never be re-nagged about it).
- **Disable** update notifications entirely (default ON) — while still being able to check manually.
- **Cancel** an update before it installs (leaving the running app untouched).
- **Confirm** an update and watch a **download progress bar**, then relaunch into the new version.
- **Check for updates on demand** (an app-menu item + a picker affordance) that always checks, ignoring the skip-list and the disable pref.

Both prefs (`skipped_version`, `update_notifications_enabled`) persist in `config_store` **per bundle-identity** (`com.claudesk.app` vs `.dev`), mirroring M9's `time_tracking_enabled` and `pip_mode`.

**Problem statement re-check (F12 back-loop, P4.verify-human.1, 2026-07-17):** root problem UNCHANGED — the banner is non-modal and must not endanger a user's click. What we LEARNED at verify-human: the P4 `position: absolute` banner avoids layout *shift* but *overlays* the top ~35px of the filmstrip on the workspace scene, so a slow-network late-load can obscure/steal a filmstrip-tile click (operator's misclick scenario). The fix REFINES the approach (float-over → reserve an in-flow row above the scene) without changing the goal. Not a symptom-fix: the reserved row structurally removes the overlap for ALL scenes.

## User Stories

- As the operator, I want a **non-modal, non-blocking notification** when a newer Claudesk is available, so I'm informed without being interrupted mid-work.
- As the operator, I want to **skip a specific version** (e.g. a release I've decided to wait on), so I stop being notified about that exact version but still hear about the *next* one.
- As a friend-user who dislikes update nags, I want to **turn off update notifications**, so Claudesk never proactively checks — but I can still trigger a check by hand when I choose.
- As any user, I want a **"Check for updates…"** affordance (in the app menu and on the picker) that checks *right now* regardless of my skip-list or disable pref, so an on-demand check is always available.
- As any user, I want to **cancel** before install and have the running app be exactly as it was, and when I confirm I want a **progress bar** so I know the download is working and roughly how far along it is.
- As a Homebrew-install user, I want the update surface to tell me to run `brew upgrade` instead of offering an in-app update (WP3's defer path), so I don't desync brew.

## Acceptance Criteria

The feature is done when:

**Persistence (backend — `config_store`):**
- `AppSettings` gains two optional fields: `skipped_version: Option<String>` and `update_notifications_enabled: Option<bool>`.
- `read_update_notifications_enabled(data_dir) -> bool` defaults **`true`** (ON) when unset (design-prior `operator-helpful-friend-misfiring-as-offswitchable-setting`).
- `read_skipped_version(data_dir) -> Option<String>` returns `None` when unset.
- Writer functions mirror the `write_pip_mode` / `write_time_tracking_enabled` read-modify-write pattern (no clobber of other fields, atomic write).
- Both are **per bundle-identity** (they ride `settings.json` in the app-data dir, which is already `com.claudesk.app` vs `.dev` isolated — free, same as the M9 fields).
- Round-trip unit tests; default-when-unset tests; independence-from-other-fields test (mirroring the existing `settings.rs` test suite).

**Commands (backend):**
- `updater_get_notifications_enabled` / `updater_set_notifications_enabled(bool)` — thin get/set over the pref (mirror `time_get_tracking_enabled` / `time_set_tracking_enabled`, including a broadcast event if a second surface must stay in sync — see Open Questions).
- `updater_get_skipped_version` / `updater_set_skipped_version(Option<String>)` — thin get/set. (A "skip" persists the *available* tag; a manual check must ignore it — the ignore logic lives frontend-side in the notify layer, per arch.md: `check()` still returns the version; the notify layer suppresses it.)
- `updater_check` gains a **manual-vs-auto** distinction OR the frontend applies the skip/disable filter (see Open Questions Q1). The command itself stays side-effect-free.

**Frontend UX:**
- **Auto-check on launch** fires **only when `update_notifications_enabled` is ON** and the resolved available version is **not** the skipped version → shows the non-modal notification. When OFF, no auto-check happens at all.
- **Non-modal notification** appears in a consistent, non-blocking location reachable from **both** the picker scene and an open-workspace scene (it can fire before any workspace is opened). It offers three actions: **Update…** (→ confirm+progress), **Skip this version** (→ persists `skipped_version`, dismisses), **Dismiss** (transient, re-notifies next launch). It is NOT a blocking modal.
- **Confirm + progress:** choosing **Update…** shows a confirm affordance; on confirm, `updater_apply` runs and a **progress bar** reflects real download progress (WP2's `download()` progress callback must be surfaced — see Open Questions Q2). **Cancel** before the install boundary leaves the app untouched.
- **"Check for updates…"** is available as (a) an **app-menu item** (Claudesk app menu, near About — the macOS-conventional location) and (b) a **picker affordance** (button/row alongside the existing settings). A manual check **always** checks: it ignores the disable pref and the skip-list, and reports "up to date" / "update available" / the brew-defer note explicitly.
- **Disable-notifications** control lives with the other picker settings (checkbox, mirroring `Time tracking`), default ON. Toggling OFF stops auto-check-on-launch; manual check still works.
- **Homebrew defer:** when `install_source === "homebrew"`, the surfaces show the "run `brew upgrade`" note (WP3 seam) instead of an Update button — in both the notification and the manual-check result.
- **WP1 fallback hook:** if WP1's live verdict (deferred to WP6) turns out FALLBACK (self-`xattr`-clear insufficient), the post-install path must be able to show an **instruct-user quarantine dialog** with the exact `xattr` command. WP4 provides the seam; whether it's wired live is settled at WP6. (WP2's `updater_apply` currently self-clears; a FALLBACK verdict would surface the command to the user instead.)

**Cleanup / no-regression:**
- `src/updater/UpdaterTrigger.tsx` (the throwaway) is **deleted**; its mount point removed. The new UX is wired in its place.
- The `updater_check` / `updater_apply` command seam is **unchanged in signature** (WP4 is a UX layer over the stable seam per WP2's design) unless Q1/Q2 force a minimal additive change (progress event).
- Frontend unit tests for the **pure UX-state logic**: skip-list suppression, pref-gating of auto-check, manual-check-ignores-skip, cancel-boundary state, brew-defer branch.
- Backend: `cargo test` green; `cargo clippy --all-targets -- -D warnings` clean. Frontend: `tsc --noEmit`, `eslint`, `vitest`, `pnpm vite build` all green.
- Live verify-self via the MCP bridge (per CLAUDE.md M5-WP2 note): the notification renders, the manual-check IPC round-trips, the picker toggle persists, cancel leaves state clean — driven against a scratch workspace. Destructive download→install→relaunch + real Gatekeeper self-clear stay carried to WP6.

## Out of Scope

- **The real live end-to-end update** (download→install→relaunch into a newer installed build), **real brew `/Caskroom/` positive detection**, and the **Gatekeeper self-clear live verdict** — all three are WP6's exit-gate concern (deferred by design; `SURFACE-2026-07-17-M10-WP1-LIVE-VERIFY-DEFERRED`, `-WP3-BREW-DETECTION-LIVE-DEFERRED`). WP4 builds the UX + seams; WP6 proves them on a real installed build.
- **A dedicated updater-preferences panel / settings window.** Per design-prior `explicit-selectable-mode-over-inferred-mode` (risk-surface-vs-value) + `new-surface-must-earn-its-place`: keep it **low-surface** — a checkbox in the existing picker settings + plain confirm/notify affordances, NOT a new panel or window.
- **Auto-download / silent update / forced update** — explicitly against the milestone promise. Every install is user-confirmed.
- **Multi-platform / Intel artifacts** — darwin-aarch64 only (matches the single `.dmg` target).
- **Changing the minisign verification, the `latest.json` shape, or the `/release` pipeline** — those are WP1/WP2/WP5, shipped.
- **Notification of update *notes*/changelog rendering beyond a version string + short note** — a version tag + the manifest `notes` line is enough; no rich release-notes viewer.

## Technical Constraints

- **3rd-party probe status:** `tauri-plugin-updater` + GitHub Releases endpoint + minisign are the 3rd-party surfaces. **WP1 (probe) is complete** and WP2 built the dependent flow on it; WP4 is a pure UX/persistence layer over the already-de-risked, already-shipped seam. No new probe required. (arch.md → "Milestone 10 architecture"; wbs.md → WP1/WP2 outcomes.)
- **Stable command seam (WP2):** `updater_check` (returns `UpdateCheckResult { current_version, available_version: Option<String>, status, install_source }`) and `updater_apply` (full flow, returns only on failure). WP4 consumes these; WP2 explicitly designed them as "the stable seam both the throwaway and WP4 use." A progress bar may require surfacing WP2's `download()` progress callback as a Tauri event (Q2).
- **Split download/install cancel boundary (WP2):** cancel = simply not calling `updater_apply` (or aborting before install); the app is untouched until `install()` extracts+replaces. WP4's cancel maps to this.
- **`config_store` per-identity pattern:** two new optional `AppSettings` fields + get/set commands, mirroring `time_tracking_enabled` (M9 WP5) and `pip_mode` (M5 WP5) exactly — `src-tauri/src/config_store/settings.rs`. Optional-field forward-stability discipline (missing = default; never wipe a malformed file).
- **Picker settings surface:** `src/components/picker/ProjectPicker.tsx` already hosts `Permission mode` (select) + `Time tracking` (checkbox) with the backend-is-source-of-truth + broadcast-sync pattern. The disable-notifications toggle and the "Check for updates…" affordance attach here.
- **Native app menu:** `src-tauri/src/app_menu/mod.rs` builds the menu; functional items get a stable id in `FUNCTIONAL_IDS`, emit on the `menu` Tauri event, and `src/menu/menuBridge.ts` routes the id. A "Check for updates…" app-menu item follows this exact pattern (new `ids::CHECK_FOR_UPDATES` + `MENU_IDS.CHECK_FOR_UPDATES` + a bridge case). macOS convention: place it in the **Claudesk app menu**, right after About + a separator.
- **Non-modal notify placement:** must be visible from any scene. `App.tsx` owns scene switching (picker ↔ workspaces) and already owns the `menu` listener + the single `<GlobalDashboard>` — the notification is an App-level overlay component, not a picker-only or workspace-only child.
- **Dark-mode only:** no light-theme tokens (project constraint). Match the existing dark token palette.
- **Verify posture:** live verify-self via the `tauri` MCP bridge is drivable for this UI (main webview) — prefer it over carrying visual checks to the operator, using scratch dirs `tmp/scratch/scratch-{a,b,c}`. The destructive/Gatekeeper/installed-build outcomes carry to WP6.

## Design-prior consult (product-design gaps)

- **`operator-helpful-friend-misfiring-as-offswitchable-setting`** → `update_notifications_enabled` is exactly this shape: **default ON** (operator benefit — the operator wants to know about updates), off-switchable (a friend who dislikes nags turns it off). **Rule 2 (prior agrees with common-sense default → take, higher confidence).** `[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]` — default ON confirmed.
- **`explicit-selectable-mode-over-inferred-mode`** (risk-surface-vs-value) → keep the UX **low-surface**: a picker checkbox + plain confirm/notify affordances, NOT an elaborate update-preferences panel. **Rule 2.** `[PRIOR: explicit-selectable-mode-over-inferred-mode]` — low-surface UX confirmed.
- **`new-surface-must-earn-its-place-against-existing-ones`** → the disable toggle + check affordance reuse the *existing* picker-settings surface and the *existing* app menu, rather than a new settings window. The non-modal notify is the one genuinely-new surface, and it earns its place (nothing else shows "an update is available" ambiently). **Rule 2** — reuse existing surfaces where they already cover the need.

No **new** design prior surfaced (WP4's shape is dependency/risk-driven + governed by the three existing priors, not a fresh product-design lean).

## Open Questions — RESOLVED (operator, 2026-07-17)

All four were design/wiring choices with proposed answers, not technical unknowns. Resolved at spec review; no research spike needed.

- [x] **Q1 — skip/disable filter: frontend.** The **frontend** applies skip-list + disable gating; backend `updater_check` / `updater_apply` stay pure (matches arch.md — `check()` still returns the skipped version, the notify layer suppresses it). Manual "check now" bypasses by not applying the filter. No backend change to the two commands beyond the new get/set pref commands. *(Not a question-worthy alternative; confirmed as proposed.)*
- [x] **Q2 — download progress: REAL progress event.** `updater_apply` emits an `updater-download-progress` Tauri event (bytes-downloaded + total) from WP2's currently-no-op `download()` callback; the frontend subscribes and renders a real **% progress bar**. Minimal additive change to `updater_apply` (emit from the callback), NOT a seam break. This is the one WP4 change that touches the backend command → gets its own plan phase. **(Operator chose "Real progress event" over an indeterminate spinner.)**
- [x] **Q3 — notify form/placement: top-of-window non-modal banner.** A full-width, dismissible, dark-themed banner across the top of the app window, App-level so it reads clearly over BOTH the picker and an open-workspace scene. Actions inline: **Update…** / **Skip this version** / **Dismiss**. **(Operator chose the top banner over a bottom-corner toast.)**
- [x] **Q4 — WP1 fallback: build the thin dialog + seam now.** Build a minimal instruct-user quarantine dialog (shows the exact `xattr -dr com.apple.quarantine …` command) + the seam, **defaulting to the GO path** (self-clear, as WP2's `updater_apply` already does). WP6 flips to the FALLBACK path with a one-line change if the deferred live Gatekeeper verdict requires it. Cheap insurance; keeps WP6 pure verification. **(Operator chose "build now" over stub-only.)**

## Recommendation

No blocking unknowns require a research spike — the 3rd-party surface is already probed (WP1) and built (WP2), and all four Open Questions are resolved above with operator-confirmed answers.

**→ `/feature-plan` (F4).** The resolved Q1–Q4 shape the phase breakdown: Q2 (backend progress event on `updater_apply`) warrants its own phase; the prefs+commands, the notify banner, the menu/picker affordances, the confirm+progress+cancel flow, and the WP1-fallback dialog are the other phase seams.

---

## Codebase seams (mapped at plan time — the exact integration points)

- **Prefs store:** `src-tauri/src/config_store/settings.rs` — `AppSettings` (all-optional fields); the `read_pip_mode`/`write_pip_mode` + `read_time_tracking_enabled`/`write_time_tracking_enabled` read-modify-write pattern. Data dir resolved by `config_store::commands::resolve_data_dir(&app)` (per bundle-identity, free).
- **Pref commands + broadcast:** `src-tauri/src/time_store/commands.rs` `time_get/set_tracking_enabled` + `TIME_TRACKING_ENABLED_EVENT` = exact template. The updater pref commands live in the existing **`src-tauri/src/updater/commands.rs`** (alongside `updater_check`/`updater_apply`), registered in `lib.rs`'s invoke handler.
- **Updater flow (WP2, stable seam):** `updater_check` → `UpdateCheckResult { current_version, available_version: Option<String>, status, install_source }`; `updater_apply` = check→download(minisign)→install→clear_own_quarantine→relaunch. Progress callback in `updater_apply` is currently `|_chunk, _total| {}` (Phase 2 emits from it).
- **FE pref helpers:** `src/state/timeAnalytics.ts` tail (`TIME_TRACKING_ENABLED_EVENT`, `getTimeTrackingEnabled`/`setTimeTrackingEnabled`) = template → a new **`src/updater/updaterPrefs.ts`** module.
- **App-level mount:** `src/App.tsx:485` `<UpdaterTrigger />` — mounted ONCE, app-level, over BOTH scenes (line 416 `view === "picker"` vs the workspace branch). The banner + dialogs replace it in this same slot. The GlobalDashboard (line 467) is the precedent for an app-level overlay reachable from both scenes.
- **Confirm/cancel + fallback dialog:** `src/components/workspace/editor/ConfirmModal.tsx` + its pure `confirmDialog.ts` (`ConfirmSpec<V>`) model — reused for the update confirm and the WP1-fallback quarantine dialog.
- **App menu:** `src-tauri/src/app_menu/mod.rs` — `ids::*` const + `FUNCTIONAL_IDS` slice + `is_functional_id`; a functional item emits its id on the `menu` Tauri event. `src/menu/menuBridge.ts` `MENU_IDS` + `menuActionFor` switch routes it; `App.tsx` `menu` listener dispatches. "Check for updates…" = a new `ids::CHECK_FOR_UPDATES` in the **Claudesk app menu** (after About + separator) + `MENU_IDS.CHECK_FOR_UPDATES` + a bridge case that triggers the manual check.
- **Picker settings surface:** `src/components/picker/ProjectPicker.tsx` — the `picker-permission-mode` (select) + `picker-time-tracking` (checkbox) block (~lines 289–313) with the seed-on-mount + broadcast-sync + optimistic-set-with-rollback pattern. The disable-notifications checkbox + a manual "Check for updates" affordance attach here.

## Backlog notes (opportunistic fold — not blockers)

Two MINOR code-quality batches are flagged as natural folds into a WP4 `updater/` touch (`workflow/backlog.md`): **m10-wp2-updater-core** (1 surviving MINOR — `updater_check` dual-provenance current-version read; hoist to one `let`) and **m10-wp3-brew-detect-and-defer** (findings (1) mod.rs `## Layout` list missing the 2 new public fns; (2) a one-line comment on the canonicalize-asymmetry). Fold them in if a phase touches the relevant file; otherwise leave for the standing `/feature-refactor` batch. Dismiss/record via the `## Code-Quality Review` section at ship.

## Work Tree

- [x] Phase 1: Backend prefs + get/set/broadcast commands  <!-- status: [x] COMPLETE — all impl + verify nodes done -->
  **Codify note (no integration boundary):** the 6 verified behaviors were codified at build (TDD): defaults (ON / None), round-trips, unskip (None clears), field-independence (read-modify-write), forward-compat, event-name-stable, full-struct serde round-trip. Purely-internal config_store + command-constant behavior → unit tests are the correct highest level (no UI wired this phase). Full suite 545 lib + 6 integ green; no new tests required, no regression.
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk --lib config_store::settings` passes new tests — `update_notifications_enabled` defaults `true` when unset; `skipped_version` defaults `None`; both round-trip; both independent of other `AppSettings` fields (a write of one preserves `pip_mode`/`time_tracking_enabled`). ✅ (26 pass)
  - CLI: `cargo test -p claudesk --lib updater` passes a new test asserting the broadcast event-name constant is stable (mirror `time_tracking_enabled_event_name_is_stable`). ✅ (`notifications_enabled_event_name_is_stable`)
  - CLI: `cargo clippy --all-targets -- -D warnings` clean; `cargo test` full lib+integ green (no regression to the 539 lib + 6 integ baseline). ✅ (545 lib + 6 integ; clippy clean)
  - CLI: `grep` confirms the 4 new commands (`updater_get_notifications_enabled`, `updater_set_notifications_enabled`, `updater_get_skipped_version`, `updater_set_skipped_version`) are registered in `lib.rs`'s `invoke_handler` generate_handler list. ✅ (lib.rs:465–468)
  - [x] P1.1 Add `skipped_version: Option<String>` + `update_notifications_enabled: Option<bool>` to `AppSettings` (both `#[serde(default, skip_serializing_if = "Option::is_none")]`); doc-comment each mirroring the `time_tracking_enabled` field (per-identity, default meaning).  <!-- status: [x] -->
  - [x] P1.2 Add `read_update_notifications_enabled` (default `true`) + `write_update_notifications_enabled`, `read_skipped_version` (default `None`) + `write_skipped_version` in `settings.rs`, read-modify-write mirroring `read/write_time_tracking_enabled`.  <!-- status: [x] -->
  - [x] P1.3 Add the get/set command trio(s) in `updater/commands.rs`: `updater_get_notifications_enabled`/`updater_set_notifications_enabled` (emits `UPDATER_NOTIFICATIONS_ENABLED_EVENT = "updater-notifications-enabled"`) + `updater_get_skipped_version`/`updater_set_skipped_version` (skip does NOT need a broadcast — single consumer; add one only if a second surface appears). Resolve data dir via `resolve_data_dir`.  <!-- status: [x] -->
  - [x] P1.4 Register the new commands in `lib.rs`'s `invoke_handler`.  <!-- status: [x] -->
  - [x] P1.5 Unit tests: settings defaults/round-trip/independence (in `settings.rs` tests, extend the existing all-fields round-trip test); event-name-stable test (in `updater/commands.rs` tests).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — scoped: config_store::settings 26 pass + updater 18 pass + clippy --all-targets clean -->
  - [x] verify-self  <!-- status: [x] — subagent: all 4 outcomes PASS (26 settings + 18 updater tests; clippy --all-targets clean on forced recompile; 545 lib + 6 integ; 4 cmds registered lib.rs:465-468). No integration boundary — isolated new artifacts. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIP (F11): drive_mode=autopilot + no integration boundary + verify-self all-PASS + no consuming-surface outcome. Isolated new artifacts (2 settings fields + 4 commands + 1 event const); nothing invokes the new commands yet (picker toggle/banner land P4–P5). -->
  - [x] verify-codify  <!-- status: [x] — behaviors codified at build (6 TDD tests); full suite 545 lib + 6 integ green, no new tests needed, no regression -->

- [x] Phase 2: Backend real download-progress event (Q2)  <!-- status: [x] COMPLETE — all impl + verify nodes done -->
  **Codify note (no integration boundary):** the payload contract (`downloaded`/`total`/`done` serde shape; Some→number, None→null) + event-name were codified at build (2 TDD tests). Purely-internal producer-side contract → unit tests are the correct level; the live emit behavior (per-chunk accumulation over a real network download) is network-live-only → WP6. Full suite 547 lib + 6 integ green; no new tests needed, no regression.
  **Observable outcomes:**
  - CLI: `grep` confirms `updater_apply`'s `download()` callback now emits a Tauri event `UPDATER_DOWNLOAD_PROGRESS_EVENT = "updater-download-progress"` carrying `{ downloaded: u64, total: Option<u64>, done: bool }` (total is `Option` — the plugin's content-length may be absent), replacing the `|_chunk, _total| {}` no-op. ✅ (commands.rs:38,46,174–189)
  - CLI: `cargo test -p claudesk --lib updater` passes a test pinning the progress-event payload struct shape (serde field names `downloaded`/`total`/`done`) + the event-name constant. ✅ (`download_progress_payload_serializes_snake_case_shape` + `download_progress_event_name_is_stable`)
  - CLI: `cargo clippy --all-targets -- -D warnings` clean; full `cargo test` green. ✅ (547 lib + 6 integ; clippy clean)
  - [x] P2.1 Define a `DownloadProgress { downloaded: u64, total: Option<u64>, done: bool }` `#[derive(Serialize, Clone)]` payload in `updater/commands.rs`; add the event-name const. (added a `done` marker so the FE flips to 100%/installing on `on_download_finish` without a divide)  <!-- status: [x] -->
  - [x] P2.2 Rewrite `updater_apply`'s `download(|chunk_len, content_length| …, || …)` closures to accumulate downloaded bytes (`saturating_add`; plugin's `on_chunk` gives per-chunk length, NOT cumulative — confirmed against `tauri-plugin-updater-2.10.1` src `FnMut(usize, Option<u64>)`) and `app.emit(UPDATER_DOWNLOAD_PROGRESS_EVENT, …)` per chunk (cloned AppHandles into the `move` closures; `app.emit` thread-safe). `on_download_finish` emits `done: true`.  <!-- status: [x] -->
  - [x] P2.3 Unit test: payload serde-shape pin + both event-name-stable tests (network path stays live-only → carried to WP6; the pinnable slice is the payload contract).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — scoped: updater slice 20 pass + clippy --all-targets clean -->
  - [x] verify-self  <!-- status: [x] — subagent: all 3 outcomes PASS (grep confirms emit + no-op gone; 20 updater tests incl. payload-shape + event-name; clippy clean; 547 lib + 6 integ). No integration boundary a P2 outcome could cite — new emit has no consumer yet; live emit path → WP6. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIP (F11): drive_mode=autopilot + no integration boundary (updater_apply signature/return/download-destination unchanged; new emit additive, no consumer yet) + verify-self all-PASS + no consuming-surface outcome. Live event-firing → WP6; progress-bar consumer lands P4. -->
  - [x] verify-codify  <!-- status: [x] — payload+event-name codified at build (2 TDD tests); full suite 547 lib + 6 integ green, no new tests needed, no regression -->

- [x] Phase 3: Frontend pure UX-state logic (skip/disable gating) — no DOM  <!-- status: [x] COMPLETE — all impl + verify nodes done -->
  **Codify note (no integration boundary):** the full `shouldAutoNotify` + `manualCheckOutcome` truth-table (12 cases) was codified at build; pure gating logic → unit tests are the correct level (no higher surface exists this phase). Full FE suite 102 files / 1132 pass; no new tests needed beyond build's, no regression.
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/updater` passes a new suite over a pure module `src/updater/updateNotifyState.ts` covering: (a) `shouldAutoNotify(result, { notificationsEnabled, skippedVersion })` → false when notifications OFF; false when `available_version === skippedVersion`; false when `available_version === null` (up-to-date); false when `install_source === "homebrew"`; true when direct-download + newer + not-skipped + enabled. (b) `manualCheckOutcome(result)` classifies → `"up-to-date" | "update-available" | "brew-defer"` **ignoring** skip-list + disable pref (manual always reports the truth). ✅ (12 tests pass)
  - CLI: `tsc --noEmit` clean; `eslint` clean. ✅
  - [x] P3.1 `src/updater/updaterPrefs.ts` — typed FE wrappers + event-name consts mirroring `timeAnalytics.ts` tail: `UPDATER_NOTIFICATIONS_ENABLED_EVENT`, `getUpdateNotificationsEnabled`/`setUpdateNotificationsEnabled`, `getSkippedVersion`/`setSkippedVersion`, plus the `UpdateCheckResult` TS interface (moved out of the throwaway `UpdaterTrigger.tsx` so it survives that file's deletion) + a `UPDATER_DOWNLOAD_PROGRESS_EVENT` + `DownloadProgress` type. Also added `checkForUpdate`/`applyUpdate` thin wrappers (the flow the banner/menu-check drive in P4/P5).  <!-- status: [x] -->
  - [x] P3.2 `src/updater/updateNotifyState.ts` — the two pure functions above (no React, no invoke; take plain args). This is the Q1 frontend-side filter.  <!-- status: [x] -->
  - [x] P3.3 Vitest suite `src/updater/__tests__/updateNotifyState.test.ts` — the full truth-table for `shouldAutoNotify` + `manualCheckOutcome` (incl. the brew branch + null-available + skip-equality edge + newer-than-skipped + OFF-beats-all).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — scoped: tsc --noEmit clean + eslint clean + vitest src/updater 12 pass -->
  - [x] verify-self  <!-- status: [x] — subagent: all 3 outcomes PASS (vitest 12/12 full truth-table incl. newer-than-skipped; tsc clean; eslint clean). No integration boundary — isolated new modules nothing imports yet. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIP (F11): drive_mode=autopilot + no integration boundary (2 new TS modules + test, nothing imports them yet) + verify-self all-PASS + no consuming-surface outcome. Consumers land P4–P5. -->
  - [x] verify-codify  <!-- status: [x] — truth-table codified at build (12 vitest cases); full FE suite 102 files / 1132 pass, no new tests needed, no regression -->

- [x] Phase 4: Frontend notify banner + confirm/progress/cancel + WP1-fallback dialog; delete throwaway  <!-- status: [x] COMPLETE — all impl + verify nodes done (incl. F12 layout back-loop) -->
  **Codify note (integration boundary — App.tsx):** flow specs + progress% + fallback const codified in `updateFlowState.test.ts` (11); gating truth-table in `updateNotifyState.test.ts` (12); App wiring + the F12 layout-invariant (banner rendered BEFORE `.app-shell-scene`; `.update-banner` NOT position:absolute — pins the no-overlap fix against regression) in `updaterWiring.test.ts` (6, incl. 2 new). Banner/confirm/progress/cancel DOM behavior driven LIVE via the MCP bridge (verify-self + the F12 re-verify) — no jsdom in the project. Full FE suite 104 files / 1145 pass; no regression.
  **Observable outcomes:**
  - Browser (MCP bridge, dev): `pnpm tauri:dev` + bridge → `webview_execute_js` invokes `updater_check` (dev binary → direct-download; endpoint returns "no latest.json"/up-to-date) — no crash. `webview_dom_snapshot` shows NO `[data-testid="updater-trigger"]` (throwaway gone). The `[data-testid="update-notify-banner"]` appears when an update-available state is injected (the banner is gated behind `updater.banner`, which is null until a check finds an update — inject via forcing the hook's `setBanner`/calling `checkNow` against a stubbed result, OR assert the banner renders given a forced `updater.banner` — see verify-self note).
  - Browser: with an update-available banner shown, it renders version + Update… / Skip / Dismiss; clicking Update… opens the `confirm-dialog`; a `updater-download-progress` event drives `[data-testid="update-progress"]`; Cancel returns to idle with the app untouched.
  - CLI: `grep` confirms `src/updater/UpdaterTrigger.tsx` is DELETED and its `App.tsx` import + `<UpdaterTrigger />` mount are removed; `pnpm vite build` succeeds (no broken import). ✅ (file rm'd; no import/JSX refs; vite build 1.94s OK)
  - Console: no JS errors on launch or during the flow. (bridge-verified in verify-self)
  - CLI: `tsc --noEmit`, `eslint`, `pnpm vitest run`, `pnpm vite build` all green. ✅ (tsc/eslint clean; 104 files / 1143 pass; vite build OK)
  - [x] P4.1 `src/updater/UpdateNotifyBanner.tsx` — top-of-window full-width dismissible banner (dark tokens, App.css `.update-banner`). Props: version + isBrew + optional applyingPercent + `onUpdate`/`onSkip`/`onDismiss`. Homebrew branch renders the `brew upgrade` note (no Update button); applying branch swaps the actions for a `[data-testid="update-progress"]` bar (determinate or indeterminate).  <!-- status: [x] -->
  - [x] P4.2 `src/updater/useUpdater.ts` (App-level hook, not a component — cleaner than a UpdateFlow.tsx) + pure `src/updater/updateFlowState.ts` (specs + `progressPercent` math + `QUARANTINE_FALLBACK_ACTIVE` seam). Orchestrates: confirm (via `ConfirmModal` + `updateConfirmSpec`) → `applyUpdate` + subscribe `updater-download-progress` → progress → cancel-before-apply leaves untouched; on reject/no-relaunch surface the error.  <!-- status: [x] -->
  - [x] P4.3 WP1-FALLBACK dialog: implemented as `quarantineFallbackSpec` (reuses `ConfirmModal`, no bespoke component needed) + the `QUARANTINE_FALLBACK_ACTIVE` const (default `false` = GO path/self-clear as WP2 does; WP6 flips the one const if the live verdict needs it). Rendered from `updater.fallbackBundlePath` (null on the GO path).  <!-- status: [x] -->
  - [x] P4.4 Wire at App level: replaced `<UpdaterTrigger />` with the `useUpdater()` hook + `<UpdateNotifyBanner>` + confirm `ConfirmModal` (gated on phase==="confirming") + fallback `ConfirmModal` (gated on `fallbackBundlePath`). Auto-check-on-launch lives inside the hook. DELETED `UpdaterTrigger.tsx`. **F12 fix (P4.vh.1):** the banner is an IN-FLOW leading row of the app-shell — `.app-shell` is now a flex column [banner (auto) | `.app-shell-scene` (flex:1, the grid the filmstrip+stage map into)]; the banner render is hoisted ABOVE the scene wrapper. The confirm/fallback dialogs stay modal overlays (they SHOULD cover the scene). This removes the filmstrip-overlay misclick hazard.  <!-- status: [x] -->
  - [x] P4.5 Tests: pure `updateFlowState.test.ts` (11: confirm-spec shape, progressPercent [determinate/indeterminate/done/clamp], fallback-spec, fallback-const-default) + `updaterWiring.test.ts` (App ?raw guards: hook+banner mounted, confirm/fallback specs wired, throwaway gone, confirm→confirmUpdate/cancelUpdate). Banner/flow DOM behavior → verify-self (project has no jsdom/testing-library; live DOM driven via the MCP bridge — the repo posture).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — scoped: tsc clean + eslint clean + vitest src/updater 23 pass + vite build OK (delete+App-rewire smoke) -->
  - [x] verify-self  <!-- status: [x] — LIVE via MCP bridge (pnpm tauri:dev, port 9223, dev identity) against the real WKWebView. Integration boundary (App.tsx modified) satisfied. All outcomes PASS: (1) __TAURI_INTERNALS__ present, updater-trigger GONE, app-shell+picker render; (2) updater_check IPC round-trips clean (dev→direct-download, expected "no latest.json" endpoint error, no crash — NOT the brew short-circuit); (3) injected update-available state (fiber setState hook 53) → banner renders "Claudesk 0.2.6 is available" + Update…/Skip/Dismiss (screenshot); (4) Update… → confirm dialog "Update to 0.2.6? … relaunch" (Update & Relaunch / Cancel); (5) applying state (phase→applying + applyingPercent→50) → update-progress bar renders aria-valuenow=50 fill 50% + "Updating to 0.2.6…", action buttons hidden (screenshot); (6) Cancel → confirm dismissed, banner stays, NO progress bar / NO download (app untouched — cancel-boundary correct); no JS errors. The REAL event-delivery (updater-download-progress fired by a live download) + destructive apply/relaunch → WP6. Teardown: driver_session stop + TaskStop + port-scoped 1420/9223 kill (NOT process-name pkill). -->
  - [x] verify-human  <!-- status: [x] — P4.vh.1 REJECTED then FIXED (F12 back-loop) + re-verified live; P4.vh.2/3 approved from screenshots. -->
    - [x] P4.verify-human.1 — banner look/placement  <!-- status: [x] — FIXED: banner is now an IN-FLOW leading row of the app-shell flex column (was position:absolute). RE-VERIFIED live via bridge on the WORKSPACE scene (scratch-a open): banner rect top0/bottom42, filmstrip top42/bottom127 → noOverlap TRUE, sceneBelowBanner TRUE. Filmstrip pushed down, never covered → the operator's misclick hazard is structurally removed. Screenshot wp4-banner-workspace-inflow.png. -->
    - [x] P4.verify-human.2 — progress-bar look while applying (screenshot: "Updating to 0.2.6…" + 50% blue fill, actions hidden)  <!-- status: [x] — operator approved -->
    - [x] P4.verify-human.3 — confirm dialog copy ("Update to 0.2.6? … relaunch." + Update & Relaunch / Cancel)  <!-- status: [x] — operator approved -->
  - [x] verify-codify  <!-- status: [x] — 29 updater vitest tests (12 gate + 11 flow + 6 wiring incl. 2 F12 layout-invariant guards); full FE suite 104 files / 1145 pass; no regression -->

- [x] Phase 5: "Check for updates…" app-menu item + picker disable-toggle + picker manual-check  <!-- status: [x] COMPLETE — all impl + verify nodes done -->
  **Codify note (integration boundary — App.tsx menu listener + ProjectPicker):** menu id-contract pinned Rust-side (`functional_ids_are_pinned_to_the_frontend_bridge` auto-covers `CHECK_FOR_UPDATES` via FUNCTIONAL_IDS iteration); `menuActionFor(CHECK_FOR_UPDATES)` → `checkForUpdates` pinned in menuBridge.test.ts; picker toggle+check wiring + IPC-seam (command names + broadcast event) in `pickerUpdateNotificationsWiring.test.ts` (8 guards). Live picker toggle round-trip + check-button bridge-verified; native menu click + real-endpoint toast branches → WP6. Full suite cargo 547+6, FE 1154 pass; no regression.
  **Observable outcomes:**
  - Browser (MCP bridge, dev): the picker scene shows a `[data-testid="picker-update-notifications"]` checkbox (checked by default) alongside `picker-time-tracking`; toggling invokes `updater_set_notifications_enabled` (round-trips via broadcast).
  - Browser: the picker shows a `[data-testid="picker-check-updates"]` button; clicking it runs a manual check (invokes `updater_check`, classifies via `manualCheckOutcome`) ignoring skip/disable, and surfaces the outcome (banner for available; picker toast for up-to-date / brew-defer).
  - CLI: `cargo test --lib app_menu` — the id-contract test passes with `CHECK_FOR_UPDATES` on both sides; `is_functional_id(ids::CHECK_FOR_UPDATES)` true. ✅ (5 pass)
  - CLI: `pnpm vitest run src/menu` — `menuActionFor(MENU_IDS.CHECK_FOR_UPDATES)` returns `{kind:"callback",callback:"checkForUpdates"}`. ✅
  - CLI: `cargo clippy --all-targets -- -D warnings`, full `cargo test`, `tsc --noEmit`, `eslint`, `pnpm vitest run`, `pnpm vite build` all green. ✅ (547 lib + 6 integ; 106 files / 1154 FE; clippy + tsc + eslint + vite build clean)
  - [x] P5.1 Backend: `ids::CHECK_FOR_UPDATES` (`"app.checkForUpdates"`) + `MenuItemBuilder::with_id(…, "Check for Updates…")` in the Claudesk app menu (after About + separator, before Services); added to `FUNCTIONAL_IDS` (front of slice). No accelerator (native-menu pattern). The existing id-contract + functional-ids tests auto-cover it (they iterate FUNCTIONAL_IDS).  <!-- status: [x] -->
  - [x] P5.2 FE: `MENU_IDS.CHECK_FOR_UPDATES` + `MenuCallback` gains `"checkForUpdates"` + a `menuActionFor` case → `{kind:"callback",callback:"checkForUpdates"}`; `App.tsx` `menu` listener runs `checkNowRef.current()` (latest-ref so the once-registered listener reaches the hook's stable checkNow; app-global, before the focused-path guard). menuBridge.test.ts case added.  <!-- status: [x] -->
  - [x] P5.3 FE picker: `picker-update-notifications` checkbox (seed `getUpdateNotificationsEnabled`, sync `UPDATER_NOTIFICATIONS_ENABLED_EVENT`, optimistic-set+rollback+toast — mirror `handleToggleTracking`) + `picker-check-updates` button → `onCheckForUpdates` (App passes `updater.checkNow`); `handleCheckForUpdates` toasts up-to-date/brew-defer (available → App banner), null → "Could not check". New prop `onCheckForUpdates?: () => Promise<{outcome:string}|null>`. CSS `.picker-updates` row.  <!-- status: [x] -->
  - [x] P5.4 Tests: app_menu id-contract (Rust, auto via FUNCTIONAL_IDS iteration) + menuBridge case (vitest) + `pickerUpdateNotificationsWiring.test.ts` (8 guards: toggle seed/sync/set/testid/revert + check-button testid/gate + outcome toasts + IPC-seam command/event pins).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — scoped: app_menu 5 pass + tsc clean + eslint clean + menu/picker-updates vitest 22 pass -->
  - [x] verify-self  <!-- status: [x] — LIVE via MCP bridge (dev, port 9223) on the real WKWebView. Integration boundary (App.tsx menu listener + ProjectPicker) satisfied. PASS: (1) picker shows picker-update-notifications checkbox CHECKED-by-default + picker-check-updates button alongside picker-time-tracking; (2) toggle round-trip — toggled OFF → updater_get_notifications_enabled returns false + checkbox reflects false (broadcast re-sync); toggled back ON; (3) Check-for-updates button → live updater_check → null outcome (dev endpoint has no latest.json) → picker error toast "Could not check for updates." (the null-outcome branch); (4) app healthy after, no JS errors, no crash. Screenshot in scratchpad. NATIVE app-menu "Check for Updates…" click is NOT webview-drivable (NSMenu) → carried to verify-human/WP6; its wiring is unit-pinned (functional_ids_are_pinned_to_the_frontend_bridge + menuBridge CHECK_FOR_UPDATES case). up-to-date/brew-defer/update-available toast branches need a real published endpoint → WP6. Teardown: driver stop + TaskStop + port-scoped 1420/9223 kill. -->
  - [x] verify-human  <!-- status: [x] — operator approved both leaves (native menu item + picker controls placement). -->
    - [x] P5.verify-human.1 — NATIVE "Check for Updates…" menu item  <!-- status: [x] — operator approved (wiring unit-pinned; the up-to-date/brew/available live outcomes carry to WP6 on a real endpoint) -->
    - [x] P5.verify-human.2 — picker controls' visual placement  <!-- status: [x] — operator approved -->
  - [x] verify-codify  <!-- status: [x] — menu id-contract + menuBridge case + picker wiring (8 guards) pin the behavior; full suite cargo 547+6, FE 1154 pass, no regression -->

## Current Node
- **Path:** Feature > ALL PHASES COMPLETE → ship
- **Active scope:** All 5 phases `[x]` (P1 backend prefs, P2 progress event, P3 FE gating logic, P4 banner+flow+fallback [+F12 layout back-loop], P5 menu item + picker controls). WP4 ready for `/feature-ship`.
- **Blocked:** none
- **Unvisited:** none — WP4 build complete.
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- none yet
