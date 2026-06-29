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

### WP1: Tray icon — ambient 2-state alarm
**Description:** The `src-tauri/src/tray/` module (mirrors `pip/` shape). At `.setup()`, build a native `TrayIconBuilder` tray icon with a template image; hold 2 pre-rendered template `Image`s (lit / neutral); reduce all open-workspace states to one bit via a pure `aggregate_alarm` fold (Attention iff any `AwaitingInput`; else Neutral — Running + Idle collapse; zero workspaces → Neutral); swap the icon atomically (`set_icon_and_icon_as_template_atomic`) on every `workspace-status` event + on workspace register/deregister. No menu yet, no popover ever.
**Milestone:** M7
**Dependencies:** none (builds on the shipped M3 broadcaster + the M5 run-on-main-thread pattern)
**Size:** S
**Tasks:**
- [ ] `tray/mod.rs`: `pub fn aggregate_alarm(states: &[WorkspaceState]) -> AlarmState` (`Attention | Neutral`) — pure fold; unit tests: empty → Neutral, any AwaitingInput → Attention, all Running/Idle (none awaiting) → Neutral.
- [ ] Ship 2 template-image PNG glyphs in `src-tauri/icons/tray/` (lit + neutral); load as `tauri::image::Image` at setup. Simple glyphs (build detail; swappable later).
- [ ] `tray/commands.rs` + setup wiring: build `TrayIconBuilder` (template icon). Subscribe to `workspace-status`; on each event + register/deregister, recompute `aggregate_alarm` and `set_icon_and_icon_as_template_atomic`. Marshal any background-thread icon op via `run_on_main_thread`.
- [ ] Confirm `set_icon_and_icon_as_template_atomic` avoids the `tauri#6527` template-flag-reset blink on this Tauri version (the one residual API confirmation — done inline during build, no separate probe WP).
- [ ] Confirm dev/prod isolation: one tray icon per running identity (`com.claudesk.app` vs `.dev` don't collide).

### WP2: Native actuator menu (Show Claudesk / Toggle PiP / Quit)
**Description:** Attach a native `tauri::menu::Menu` to the tray icon (shown on click) with three **actuators**, each wired to its existing app action via the 2026-06-24 `app_menu` `on_menu_event`/emit + managed-handle pattern. Actuators are the non-redundant complement to the alarm (display-only PiP can't act on the app).
**Milestone:** M7
**Dependencies:** WP1 (tray icon to attach the menu to)
**Size:** S
**Tasks:**
- [ ] `TrayIconBuilder::menu(...)` with: **Show Claudesk Window** (bring main window forward — a thin command, also reachable from the existing app menu), **Toggle PiP** (reuse the existing `pip-mode` path), **Quit** (`PredefinedMenuItem`). Default click-to-show-menu behavior (do NOT set `show_menu_on_left_click(false)` — no popover to free the left click for).
- [ ] Wire item handlers through the `app_menu` `on_menu_event`/emit bridge; reuse the managed-handle pattern where a handle is needed.
- [ ] verify-auto / verify-self / verify-human / verify-codify per the feature workflow.

### WP3: Milestone-exit verification (installed `.app`, out-of-focus)
**Description:** Verification-only WP (the M5 WP6 / M6 WP8 pattern). Agent GREENs the bridge-observable slice (the `aggregate_alarm` fold via unit tests; the icon-swap path via a driven status transition on a scratch workspace, confirming no abort); then composes the operator-carry / DEFERRED-TO-RELEASE checklist for what only the installed, launchd-launched `.app` can prove — the **native menu-bar glyph actually showing lit/neutral**, the **native menu appearing + each item firing**, and **out-of-focus / cross-Space / full-screen visibility** (the alarm's whole point). Carried to the next `/release` gate.
**Milestone:** M7
**Dependencies:** WP1, WP2
**Size:** XS
**Tasks:**
- [ ] Phase 1: drive the bridge-observable slice (icon-swap-no-abort on a driven transition; `aggregate_alarm` unit tests green) → PASS/FAIL.
- [ ] Phase 2: compose the operator-carry checklist (OC.*) — native glyph lit/neutral, menu appears + items fire, out-of-focus/cross-Space/full-screen visibility; mark DEFERRED-TO-RELEASE.

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

*(No gating probe WP after the shrink. The one API confirmation — `set_icon_and_icon_as_template_atomic` blink-free swap — is recorded inline at WP1 close.)*

- **WP1 — `set_icon_and_icon_as_template_atomic` blink-free icon swap:** _pending (inline confirmation during WP1 build)._

---

## Rejected richer WP set (recorded for the record — DO NOT build)

> ~~The originally-decomposed M7 (2026-06-29, before the spec debate) was a full third *status surface*:~~
> - ~~**WP1** Probe — tray + popover-window + `tauri-plugin-positioner` mechanics + `tauri#13633` blur-to-hide reliability + MCP-bridge `windowId:'popover'` reachability.~~
> - ~~**WP2** Tray icon + 3-state aggregate (green/blue/amber, AwaitingInput > Running > Idle) + native right-click menu.~~
> - ~~**WP3** Popover `WebviewWindow` (3rd Vite entry `popover.html` + `src/popover/`) — per-workspace status list, row-click navigates (bring-forward + switch-center-stage), positioned via `Position::TrayBottomCenter`, blur + click-outside dismissal.~~
> - ~~**WP4** Milestone-exit verify (popover bridge-driven + native glyph DEFERRED-TO-RELEASE).~~
>
> **Cut at the M7 spec debate (2026-06-29):** the popover-list-dashboard half was a strict subset of the shipped M5 PiP (live mirrors + layouts + attention weighting + all-Spaces + near-zero-pixel `minimal`/`On`). Two overlapping dashboards split the glance and double maintenance — against the "lite / attention is the scarce resource" thesis. Shrunk to the alarm + actuator (the non-overlapping core). See design-prior [[new-surface-must-earn-its-place-against-existing-ones]].
