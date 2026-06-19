---
stage: wbs
state: carry-forward
updated: 2026-06-19
---

# Work Breakdown Structure

> **Phase 1 (Bare Shell + Tab Substrate PoC) — COMPLETE & ARCHIVED 2026-06-19.** All 9 WPs shipped (WP1 scaffold + WP2/3/4 probes + WP5 UI + WP6 config store + WP7 PtyCcSession + WP8 in-app Sublime hotkey + WP9 polish/exit-criteria). The full Phase 1 decomposition (per-WP tasks, outcomes, ship tags, critical path) is preserved at [`docs/product/archive/phase-1-bare-shell-poc/wbs.md`](archive/phase-1-bare-shell-poc/wbs.md). The Phase 1 cycle was closed via `/product-finalize` (durable docs `arch.md`/`roadmap.md` resynced; backlog swept — remaining items deferred to Phase 2).

**Cycle scope (this file, going forward):** the **next** cycle is **Phase 2 (Stateful CC Controller + Multi-Workspace + Status Surfaces)**. Phases 2–4 are still at WP-headline level below — they are **deliberately not decomposed** until Phase 2 opens and we re-run `/product-wbs` (or a focused decomposition pass) to break Phase 2 into per-WP tasks. Premature decomposition would force Phase 2/3 internal decisions before Phase 1's learnings (now in hand) can inform them.

**To open Phase 2:** run a decomposition pass over the Phase 2 headlines below, grounding in the now-complete `arch.md` Phase-2 forward-look sub-sections and the carried-forward backlog (esp. the wp6 picker IPC error-surfacing MAJORs, which pair with WP13/WP16). Carry forward the WP4 probe outcome ([`wp4-thumbnail-probe-outcome.md`](wp4-thumbnail-probe-outcome.md), PASS → live ~1 fps mirrors) as the WP16 filmstrip-rendering decision.

## Phase 2: Stateful CC Controller + Multi-Workspace + Status Surfaces (NOT decomposed)

Sketched at WP headline only — full decomposition deferred until Phase 2 opens (Phase 1 has now shipped and surfaced real constraints).

- **WP10: Probe — `workflow/.session.md` write semantics** (probe): confirm whether `/session-pause` writes the file atomically or in stages; what marker indicates "done writing"; how `/session-resume` reads it.
- **WP10b: Probe — CC hook channel for idle/running/awaiting-input detection** (probe): confirm the exact payload shape and timing of `UserPromptSubmit` / `Stop` / `Notification` hook events; verify a Claudesk-installed hook can coexist with `claude-time`'s hook entries in `~/.claude/settings.json`; verify the events fire reliably on real interactive sessions (slash commands, multi-turn conversations, tool-use loops, permission prompts). **Note (2026-06-15):** the prior "shared file vs Unix socket" sub-question of this probe is **RESOLVED by research — Unix socket from day one** (three concurrent consumers force the decision). The probe still verifies hook firing reliability but no longer decides the transport.
- **WP10c: Probe — CC's resumable-conversation surface per project dir** (probe): confirm the exact CC CLI shape for "is there a resumable conversation for this cwd". Test cases: (a) prior session cleanly exited via Ctrl+D, (b) prior session killed by SIGKILL, (c) prior session ended after `/session-pause` wrote `.session.md`, (d) project dir never had a CC session. For each, verify whether the answer is keyed by cwd or by session-id. Required by WP14.
- **WP11: WorkflowStateWatcher** (notify-based file watcher for `workflow/.session.md`; debounced events)
- **WP12: Status Broadcaster + Unix-socket hook channel** (Rust core: open socket on launch, accept JSON lines from CC hook scripts, normalize to `WorkspaceStatusUpdate`, emit via Tauri event channel to all subscribed webviews). Includes the hook-installer routine (write entry into `~/.claude/settings.json` on first launch, with idempotency check + uninstall on app removal), the small POSIX shell hook script (no runtime deps), and the heartbeat/staleness handling. Depends on WP10b.
- **WP13: Multi-workspace UX** (extend WorkspaceList to length > 1; opening a project adds a new workspace; switching center stage is `display: none` toggling; existing workspaces stay mounted)
- **WP14: Smart auto-resume on workspace open** — three-branch decision tree per arch §C. Depends on WP10c.
- **WP15: Drive-mode selector + indicator (header)** — per arch §D. Extends `Project` struct (already reserved in WP6 — just populate it now); Tauri commands `get_drive_mode` / `set_drive_mode`; React header component on the center-stage workspace.
- **WP16: Filmstrip + Center Stage (rendering)** — populate the empty Filmstrip slot from WP5. **Rendering mode determined by WP4's probe report:** live ~1 fps mirrors (PASS outcome — see [`wp4-thumbnail-probe-outcome.md`](wp4-thumbnail-probe-outcome.md)). Includes filmstrip-collapse toggle (collapsed = mini status tiles only).
- **WP17: Menu-bar status item** (Tauri `TrayIconBuilder` + `tauri-plugin-positioner` with `tray-icon` feature + popover webview). Aggregate status dot (green/blue/amber); left-click → popover; right-click → native menu. **Ships BEFORE WP18.**
- **WP18: Menu-bar dogfooding gate** (1-week minimum). If menu-bar alone covers the "Claudesk hidden" case sufficiently, **WP19 (PiP) defers to Phase 4**. Otherwise, proceed to WP19.
- **WP19: PiP NSPanel** (conditional on WP18 outcome) — `tauri-nspanel` v2.1, `PanelBuilder` with `no_activate(true)` + `PanelLevel::Floating` + collection behavior `CanJoinAllSpaces | FullScreenAuxiliary | Stationary`. User-toggled, display-only.
- **WP20: SkillRegistry** (scan `~/.claude/skills/` + `<proj>/.claude/skills/`; expose to UI)
- **WP21: Skill buttons in UI** (toolbar or slide-in drawer on the center-stage workspace)
- **WP22: Recycle Session state machine** (Rust state machine: `Pausing → WaitingForSessionFile → SendingCtrlD → WaitingForExit → Respawning → Resuming`; UI button; cancel handling). Uses the Status Broadcaster (WP12) to detect when CC has actually exited and when the fresh CC is idle.
- **WP23: Hotkey for Sublime Merge pop**
- **WP24: Phase 2 polish + dogfood + exit-criteria verification** (all six vision success metrics confirmed, including the Claudesk-not-in-focus metric)

## Phase 3: Lite Editor + Diff Viewer (NOT decomposed)

Sketched only.

- **WP25: Probe — Monaco vs CodeMirror 6 for Sublime-feature coverage**
- **WP26: Lite editor integration**
- **WP27: Git diff viewer (using `git2` crate)**
- **WP28: Right-half panel host with swappable tabs (editor / diff / ad-hoc terminal)** — per-workspace, not global
- **WP29: Sublime hotkey-pop remains as escape hatch — verify still works**
- **WP30: Phase 3 polish + exit-criteria verification**

## Phase 4: Polish & Open-Source Release (NOT decomposed)

Sketched only.

- **WP31: Settings UI** (project list management, hotkeys, claude CLI args, menu-bar / PiP visibility toggles)
- **WP32: PiP NSPanel (if deferred from Phase 2 per WP18)**
- **WP33: Code-signing + notarization strategy decided and applied** (probe-flavored)
- **WP34: README + setup docs** (workflow-system-assumed audience)
- **WP35: Open-source license + public repo**
- **WP36: Release dry-run + dogfood + cycle close**

## SURFACE-IN history

(none yet)
