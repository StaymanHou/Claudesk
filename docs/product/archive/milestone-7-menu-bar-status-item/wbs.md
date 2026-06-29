---
stage: wbs
state: complete
updated: 2026-06-29
milestone: "Milestone 7 — Menu-bar status item"
---

# Work Breakdown Structure — Milestone 7: Menu-bar status item

**Scope:** This WBS decomposes **only Milestone 7** (the immediate next milestone). Later milestones (M8 docs-viewer → M9 time-analytics → M10 auto-resume → M11 skill-orchestration → M12 polish) stay tracked in `roadmap.md` and are decomposed just-in-time when reached.

> **SHRUNK at the M7 spec debate (2026-06-29).** The originally-decomposed M7 (4 WPs: probe → tray + aggregate → popover list + navigate → exit verify) was scoped DOWN to an **ambient alarm + actuator**, because a full status surface (popover list + navigate) would be a strict subset of the shipped M5 PiP and therefore redundant (design-prior [[new-surface-must-earn-its-place-against-existing-ones]]). The popover `WebviewWindow`, the per-workspace list, navigate-on-click, the `tauri-plugin-positioner` dependency, the third Vite entry, and the `tauri#13633` blur-probe are all **CUT**. The WPs below are the shrunk decomposition. *(The rejected richer WP set is recorded struck-through at the end of this file for the record.)*

**Goal (shrunk):** The menu bar carries a **single ambient alarm** — "is any project waiting on me?" — visible system-wide (every Space, full-screen, even with the Claudesk window hidden), plus a **native actuator menu** (Show Claudesk / Toggle PiP / Quit). It exploits the menu bar's one edge over PiP: it's a strip the user already passively watches. It subscribes to the existing M3 `status_broadcaster` `workspace-status` event (no broadcaster change). It is **not** a status surface — running-vs-idle detail and per-workspace identity live in the PiP / the main window.

**Exit Criteria (shrunk):** A menu-bar tray icon is **lit when any workspace is AwaitingInput** and neutral otherwise, updating live, visible when the Claudesk window is NOT in focus / on another Space; clicking the icon opens a native menu (Show Claudesk / Toggle PiP / Quit) whose items each perform their existing app action.

**Architecture reference:** `arch.md` §B.2 (DESIGNED-FOR-BUILD — SHRUNK, Revision 2026-06-29) + the Key Decision "Menu-bar item is an ambient ALARM + ACTUATOR, not a status surface." Tauri 2.11.x API facts verified at the arch pass.

---

## Design-priors consult (this WBS pass)

- **`operator-helpful-friend-misfiring-as-offswitchable-setting`** — does NOT fire (over-infer guard). M7's batch has no behavior that helps the operator but misfires on a divergent friend setup. The tray alarm is universally useful. No setting needed.
- **`new-surface-must-earn-its-place-against-existing-ones`** (NEW, captured at the M7 spec debate) — **governs the whole milestone.** `[PRIOR: new-surface-must-earn-its-place-against-existing-ones] leaning SHRINK M7 to its non-PiP-overlapping core (ambient alarm + actuator); cut the popover/list/navigate dashboard half`. Applied: the WPs below build only the alarm + actuator.
- **`explicit-selectable-mode-over-inferred-mode`** (risk-surface-vs-value) — agrees: cutting the popover deletes the high-bug-surface half (separate webview, blur-dismissal, positioning) for a feature whose value was uncertain. Consistent direction.

No further design prior proposed this pass — the captured one above covers the shrink; the remaining M7 choices are technical (kept in `arch.md`).

---

## SURFACE-IN handling (P11)

**`SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY` — re-anchored M7 → M8 (unchanged by the shrink, reinforced by it).** The watcher's natural home was a popover workflow-position line — but M7 has **no popover** now. The watcher is firmly an M8 (docs-viewer) concern; nothing M7-shaped remains for it. Re-anchor recorded in the backlog SURFACE (2026-06-29).

---

## Work Packages

### WP1: Tray icon — ambient 2-state alarm ✅ SHIPPED 2026-06-29 (commit 3888dd6)
**Description:** The `src-tauri/src/tray/` module (mirrors `pip/` shape). At `.setup()`, build a native `TrayIconBuilder` tray icon with a template image; hold 2 pre-rendered template `Image`s (lit / neutral); reduce all open-workspace states to one bit via a pure `aggregate_alarm` fold (Attention iff any `AwaitingInput`; else Neutral — Running + Idle collapse; zero workspaces → Neutral); swap the icon atomically (`set_icon_with_as_template` — the real tauri 2.11.2 method; the WBS-specced `set_icon_and_icon_as_template_atomic` name does not exist) on every `workspace-status` event + on workspace register/deregister. No menu yet, no popover ever.
**Milestone:** M7
**Dependencies:** none (builds on the shipped M3 broadcaster + the M5 run-on-main-thread pattern)
**Size:** S
**Tasks:**
- [x] `tray/mod.rs`: `pub fn aggregate_alarm(states: &[WorkspaceState]) -> AlarmState` (`Attention | Neutral`) — pure fold; unit tests: empty → Neutral, any AwaitingInput → Attention, all Running/Idle (none awaiting) → Neutral.
- [x] Ship 2 template-image PNG glyphs in `src-tauri/icons/tray/` (lit + neutral); load via `include_bytes!` + `Image::from_bytes` at setup. The glyphs are a faithful monochrome app-icon portrait (rounded window + 4 filmstrip tiles, 2nd highlighted + large main CC box) with a lower-right corner BADGE on attention (operator-designed at WP1 verify-human; swappable later).
- [x] `tray/commands.rs` + setup wiring: build `TrayIconBuilder` (template icon). Subscribe to `workspace-status`; on each event + register/deregister, recompute `aggregate_alarm` and swap via `set_icon_with_as_template` (main-thread-marshaled internally → no manual run_on_main_thread needed). `forget_workspace` wired into `workspace_deregister`.
- [x] Confirm the atomic icon setter avoids the `tauri#6527` template-flag-reset blink — `set_icon_with_as_template` (NOT the WBS-named `set_icon_and_icon_as_template_atomic`, which doesn't exist on 2.11.2); its doc comment confirms it sets icon+template-flag atomically to prevent the double-render flicker.
- [x] Confirm dev/prod isolation: one tray icon per running identity (`com.claudesk.app` vs `.dev` don't collide) — holds by construction (tray built in-process; each identity is a separate process).

### WP2: Native actuator menu (Show Claudesk / Toggle PiP / Quit) ✅ SHIPPED 2026-06-29 (commit 3888dd6)
**Description:** Attach a native `tauri::menu::Menu` to the tray icon (shown on click) with three **actuators**, each wired to its existing app action. Reuses the *event-routing* half of the 2026-06-24 `app_menu` `on_menu_event` bridge (one app-level handler fires for tray menu events too); the actuators are handled BACKEND-side (NOT emit-to-frontend — the window may be hidden when the operator clicks the tray). Actuators are the non-redundant complement to the alarm (display-only PiP can't act on the app).
**Milestone:** M7
**Dependencies:** WP1 (tray icon to attach the menu to)
**Size:** S
**Tasks:**
- [x] `TrayIconBuilder::menu(...)` with: **Show Claudesk** (bring main window forward — unminimize/show/set_focus on the "main" WebviewWindow), **Toggle PiP** (pure `toggle_pip_mode` → existing `pip_set_mode` path), **Quit** (`PredefinedMenuItem`). Default click-to-show-menu (did NOT set `show_menu_on_left_click(false)`).
- [x] Wire item handlers via the app-level `on_menu_event` (routes tray ids FIRST through `handle_tray_menu_event`, else falls through to `app_menu`); handlers act BACKEND-side, not via the frontend emit. Tray ids namespaced `tray.*` (no app_menu collision).
- [x] verify-auto / verify-self / verify-human (operator-approved all 4 actuators live) / verify-codify per the feature workflow.

### WP3: Milestone-exit verification (installed `.app`, out-of-focus) ✅ SHIPPED 2026-06-29 (commit 3888dd6)
**Description:** Verification-only WP (the M5 WP6 / M6 WP8 pattern). Agent GREENs the bridge-observable slice (the `aggregate_alarm` fold via unit tests; the icon-swap path's no-abort, structurally guaranteed by main-thread marshaling + empirically confirmed in the dev build); then composes the operator-carry / DEFERRED-TO-RELEASE checklist for what only the installed, launchd-launched `.app` can prove. **NOTE:** unusually for this pattern, the substantive native checks (glyph renders; all 4 menu actuators fire) were already operator-approved LIVE at WP1+WP2 verify-human in `pnpm tauri:dev` — only the badge lit/neutral *transition*, out-of-focus/cross-Space visibility, and installed-`.app` parity remain DEFERRED-TO-RELEASE.
**Milestone:** M7
**Dependencies:** WP1, WP2
**Size:** XS
**Tasks:**
- [x] Phase 1: drive the agent-GREEN slice (icon-swap-no-abort + `aggregate_alarm` unit tests green; full suites: cargo 302 / vitest 780 / clippy / tsc / eslint / vite build) → PASS.
- [x] Phase 2: compose the operator-carry checklist (OC.1–OC.4) — native glyph badge transition, menu appears + items fire, out-of-focus/cross-Space/full-screen visibility, dev/prod isolation; mark DEFERRED-TO-RELEASE.

---

## Learning-Sequence Ordering

The shrink removed the only genuine unknown (the `tauri#13633` blur-to-hide reliability lived in the now-cut popover), so there is **no probe WP** — the one residual API confirmation (`set_icon_and_icon_as_template_atomic` avoids the `tauri#6527` blink) is a single inline check inside WP1's build, not a milestone-gating spike. The remaining order is plain build dependency:

1. **WP1 (tray icon + alarm)** — the synchronous core: the icon exists and reflects the alarm bit. Lands the `aggregate_alarm` pure fold (unit-testable) + the icon-swap loop.
   - **WP1 → WP2 rationale:** the tray icon must exist before a menu can attach to it; the bring-forward command WP2 needs is small and lives with the menu wiring.
2. **WP2 (actuator menu)** — attaches the actuators on top of the working icon.
   - **WP2 → WP3 rationale:** verify the whole surface only once both the alarm and the menu exist; the exit criterion (out-of-focus visibility) needs both.
3. **WP3 (exit verify)** — agent-verify the bridge slice, carry the native-glyph / menu / out-of-focus checks to `/release`.

No 3rd-party-probe gap (Tauri tray API is core; no `tauri-plugin-positioner` anymore). No orchestration/async layer (the broadcaster exists; M7 only subscribes).

---

## Dependency Map

```
WP1 (tray icon + alarm) ──► WP2 (actuator menu) ──► WP3 (exit verify)
```

- **Critical path:** WP1 → WP2 → WP3 (linear; tiny). The pure `aggregate_alarm` fold (WP1) is independently unit-testable.
- **No parallel track** — three small, tightly-coupled WPs.

---

## Probe outcomes

*(No gating probe WP after the shrink. The one API confirmation — the blink-free atomic icon swap — is recorded inline at WP1 close.)*

- **WP1 — blink-free atomic icon swap:** ✅ CONFIRMED 2026-06-29. The method is **`set_icon_with_as_template(icon, is_template)`** (tauri 2.11.2) — the WBS/arch-specced name `set_icon_and_icon_as_template_atomic` does NOT exist on this version. Same semantics: its source doc comment states it sets the icon + template flag atomically *specifically to prevent* the `tauri#6527` double-render flicker. Mechanism in place; the visual no-flicker is operator-carry/DEFERRED-TO-RELEASE (native glyph). Also confirmed: dev/prod isolation holds by construction (one tray per process-identity). [Both arch-name corrections logged: SURFACE-2026-06-29-M7-TRAY-ATOMIC-ICON-METHOD-NAME + SURFACE-2026-06-29-M7-TRAY-NO-CONFIG-BLOCK.]

---

## Rejected richer WP set (recorded for the record — DO NOT build)

> ~~The originally-decomposed M7 (2026-06-29, before the spec debate) was a full third *status surface*:~~
> - ~~**WP1** Probe — tray + popover-window + `tauri-plugin-positioner` mechanics + `tauri#13633` blur-to-hide reliability + MCP-bridge `windowId:'popover'` reachability.~~
> - ~~**WP2** Tray icon + 3-state aggregate (green/blue/amber, AwaitingInput > Running > Idle) + native right-click menu.~~
> - ~~**WP3** Popover `WebviewWindow` (3rd Vite entry `popover.html` + `src/popover/`) — per-workspace status list, row-click navigates (bring-forward + switch-center-stage), positioned via `Position::TrayBottomCenter`, blur + click-outside dismissal.~~
> - ~~**WP4** Milestone-exit verify (popover bridge-driven + native glyph DEFERRED-TO-RELEASE).~~
>
> **Cut at the M7 spec debate (2026-06-29):** the popover-list-dashboard half was a strict subset of the shipped M5 PiP (live mirrors + layouts + attention weighting + all-Spaces + near-zero-pixel `minimal`/`On`). Two overlapping dashboards split the glance and double maintenance — against the "lite / attention is the scarce resource" thesis. Shrunk to the alarm + actuator (the non-overlapping core). See design-prior [[new-surface-must-earn-its-place-against-existing-ones]].
