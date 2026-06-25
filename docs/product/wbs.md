---
stage: wbs
state: complete
updated: 2026-06-25
milestone: "Milestone 5 — Picture-in-picture"
---

# Work Breakdown Structure — Milestone 5: Picture-in-picture

> **Scope: Milestone 5 only.** Per the `product-wbs` just-in-time rule, this WBS decomposes the *immediate next* roadmap milestone (M5, PiP) and nothing further. Future milestones (M6 menu-bar, M7 workflow-docs viewer, M8 auto-resume, M9 skill orchestration, M10 polish) stay tracked in `roadmap.md` and are decomposed when reached.

**Milestone goal (roadmap M5):** An always-on-top, display-only floating status surface (PiP) for when the Claudesk window is out of focus — so "which project is awaiting input" is answerable without bringing Claudesk forward. **Unconditional** (the prior "gate PiP on a dogfood week" plan was dropped 2026-06-22). Mirrors the same status surface as the M4 filmstrip; clicking a tile does NOT promote a workspace (click-to-focus is a Future Possibility).

**Operator scope addition (2026-06-25): the PiP has FOUR selectable layout modes**, richest → most minimal, switched via an on-panel control and persisted: (1) **horizontal mirror** (filmstrip-like row of live thumbnails), (2) **vertical mirror** (same thumbnails, stacked), (3) **compact** (project name + status dot, stacked, no mirror), (4) **minimal** (status dots only — the "is anyone waiting on me?" glance for the all-instances-busy use case). The panel auto-resizes to each layout. Two deliberate design intents, baked into the WPs so they aren't "fixed" away: the **mirror layouts include the center-staged workspace live** (unlike the filmstrip's static center tile — because PiP is watched when the center stage is NOT visible), and the **minimal layout weights attention** (awaiting-input pops; all-busy reads quiet) rather than rendering N equal dots.

**Exit criteria (roadmap M5):** The PiP panel ships and mirrors the same status surface as the filmstrip; workspace status is visible while the Claudesk window is out of focus.

**Built on already-shipped seams:**
- **M3 `status_broadcaster`** — `workspace-status` Tauri event + snake_case `WorkspaceStatusUpdate` DTO + cwd→workspace registry. The PiP webview is a *third subscriber* alongside the M4 filmstrip (arch §B.3 / §A). No new state source.
- **M4 filmstrip rendering** — the validated `@xterm/addon-serialize` `serializeAsHTML()` ~1 fps live-mirror path off the off-viewport terminal buffer. PiP reuses the same render mode (arch §B.3: "Content mirrors filmstrip rendering").
- **M1 dev/prod isolation** — bundle-identifier-keyed per-install state (the PiP toggle state, if persisted, follows the same identity).

**No external-API research milestone** — M5 is pure in-app macOS-window UX. The one external dependency is the `tauri-nspanel` crate, de-risked by WP1 (probe) per the WBS 3rd-party rule. The agent-verifiability of the new status surface is de-risked by WP2 (probe).

---

## WP1: Probe — `tauri-nspanel` NSPanel mechanics on macOS / Tauri 2.9

**Type:** probe
**Milestone:** M5 (must precede WP3/WP4 — the build WPs depend on this knowledge)
**Dependencies:** none
**Size:** S
**Learning objective:** Confirm `tauri-nspanel` v2.1 under our Tauri 2.9.x line can create a small always-on-top secondary panel with the exact `NSWindow` collection behavior the PiP needs, and document the Rust API shape + any entitlement/code-signing requirements so WP3 builds against known calls — not assumed ones. (arch §B.3 names the target flags; this probe proves they work as-built and surfaces the single-maintainer bus-factor reality.)
**Timebox:** half-day
**Success criterion:** A one-paragraph note in this file (under "Probe outcomes") recording: (a) the working `PanelBuilder` call with `no_activate(true)` + `PanelLevel::Floating` + the collection-behavior flag set (`CanJoinAllSpaces | FullScreenAuxiliary | Stationary`) — or, if the high-level builder doesn't expose them, the raw `objc2` `NSWindow.setCollectionBehavior(...)` path that does; (b) confirmation the panel survives a Space switch + draws over a fullscreen app + does NOT steal focus on click; (c) any entitlement / signing requirement (expected: none for unsigned local builds, but verified); (d) GO/NO-GO for `tauri-nspanel` v2.1 vs. a fallback (raw `NSWindow` via `objc2`), with the pin/monitor note for `tauri-apps/tauri#13034`.
**Tasks:**
- [ ] Add `tauri-nspanel` v2.1 to `src-tauri/Cargo.toml`; stand up a bare empty NSPanel toggled by a temporary command (no real content yet).
- [ ] Apply `no_activate(true)` + `PanelLevel::Floating` + the three collection-behavior flags; verify each behavior manually: all-Spaces, over-fullscreen, no-focus-steal-on-click, survives Claudesk losing focus / minimizing.
- [ ] Confirm it works in BOTH `pnpm tauri:dev` AND a freshly-built installed `.app` launched from Finder/Dock (the installed-build-smoke-test convention — NSPanel is window/AppKit-level, exactly the dev-vs-installed parity class).
- [ ] Verify dev/prod isolation holds (the dev panel is the dev identity's; no cross-talk with an installed prod build running concurrently).
- [ ] Write the outcome note (GO/NO-GO + API shape + the fallback path if NO-GO).
- [ ] Tear down the throwaway toggle command (or keep it as the WP3 seed if GO).

---

## WP2: Probe — agent UI-driver for verify-self on workspace-status surfaces (adopt/reject)

**Type:** probe
**Milestone:** M5 (decision explicitly anchored to "M5 planning" — `SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI`)
**Dependencies:** none (parallel to WP1)
**Size:** S
**Learning objective:** Decide — adopt or deliberately reject — a real-app UI driver so `feature-verify-self` can agent-verify the new PiP status surface (more live status-rendering, the exact class that currently always punts to native `verify-human`). Lead candidate found 2026-06-23: [`hypothesi/mcp-server-tauri`](https://github.com/hypothesi/mcp-server-tauri) (`tauri-plugin-mcp-bridge`, WebSocket :9223, drives the real WKWebView with live IPC — `webview_interact` / `webview_dom_snapshot` / `webview_execute_js` / `read_logs` / `ipc_monitor`). The online check is already done; what remains is the macOS smoke test + the written verdict.
**Timebox:** half-day
**Success criterion:** A written adopt-or-reject decision in this file (under "Probe outcomes") backed by a macOS smoke test of `mcp-server-tauri` against a Claudesk dev build (does a workspace actually mount + is it drivable?). If **adopt:** a minimal harness wired so an M5 status-surface outcome (e.g. "the PiP tile shows AwaitingInput when the hook channel reports it") is agent-observable; record what `feature-verify-self` should invoke. If **reject:** the recorded reason + the standing posture stays "operator-only at the live tier for backend-lifecycle/native-window features" (the existing `CLAUDE.md` verify-self convention), so WP3/WP4 carry their live outcomes into `verify-human` knowingly, not by default.
**Tasks:**
- [ ] Install `tauri-plugin-mcp-bridge` into a Claudesk dev build; bring up the MCP server; smoke-test connecting to the running WKWebView.
- [ ] Verify the workspace + filmstrip actually mount + are drivable (`webview_dom_snapshot` shows real tiles; `webview_execute_js` can read a status dot's state).
- [ ] Assess the NSPanel reachability specifically — the PiP is a *separate* `tauri-nspanel` webview; confirm whether the driver can attach to it or only the main webview (this bounds what M5 can agent-verify vs. carry to verify-human).
- [ ] Write the adopt/reject verdict + (if adopt) the minimal verify-self invocation recipe; (if reject) the recorded reason.
- [ ] Update the `SURFACE-2026-06-23` backlog entry status to RESOLVED with the verdict.

---

## WP3: PiP NSPanel + status-subscribe core (one default layout)

**Description:** Build the real PiP panel shell + its status plumbing, rendering **one** default layout (horizontal mirror — the filmstrip-like row). A `tauri-nspanel` webview that subscribes to the M3 `workspace-status` broadcast and renders one tile per open workspace (project name + idle/running/awaiting-input dot + the live ~1 fps `serializeAsHTML()` mirror). **Display-only:** clicking a tile does NOT promote a workspace (arch §B.3 + vision anti-goal "Not PiP click-to-focus in v1"). The 4-layout switcher is WP4 — WP3 proves "PiP works, one layout, all N live."
**Milestone:** M5
**Dependencies:** WP1 (NSPanel API confirmed). Reuses M3 broadcaster + M4 filmstrip-rendering code.
**Size:** M
**Tasks:**
- [ ] Create the PiP panel module (`src-tauri/src/pip/` or fold into the existing window-management seam) using the WP1-confirmed `PanelBuilder` + collection-behavior call; load a dedicated PiP frontend route/entry into the NSPanel webview.
- [ ] PiP frontend: `listen("workspace-status")` and render the horizontal-mirror tile row (reuse the filmstrip's tile component + the M3 honest dot palette — Running orange `#d97757`, AwaitingInput blue `#539bf5`, Idle, Unknown — so the two surfaces never disagree).
- [ ] **Roster rule — PiP diverges from the filmstrip ON PURPOSE: mirror ALL N workspaces live, INCLUDING the center-staged one (no static active-marked tile).** Rationale (operator intent, 2026-06-25): the filmstrip makes the center-staged tile static because it's redundant *with the visible center stage in the same window*; the PiP is the surface you watch *when Claudesk is out of focus*, so the center-staged workspace is just another invisible project and its live state matters as much as any other. A static tile here would blind the user to the project they were most recently working on. **Do NOT "fix" this to match the filmstrip's static-center-tile behavior — the divergence is the intent.**
- [ ] Wire the live ~1 fps mirror: the PiP subscribes to the SAME serialized-buffer source the filmstrip uses (decide cleanly — share the serialize output rather than running a second serialize loop per workspace; the M4 active-CPU p95 caveat means a second independent loop is the wrong call). Document the chosen fan-out. Note: because PiP mirrors the center-staged workspace too (which the filmstrip does NOT serialize), confirm the center-staged workspace's buffer is serialized for the PiP — this is the one extra mirror the filmstrip didn't need.
- [ ] Enforce display-only: no click-to-promote handler; clicking a PiP tile is inert (the user switches back to Claudesk via ⌘Tab / Mission Control / Dock).
- [ ] Snake_case DTO + the existing subscribe pattern; no new state source (status comes only from the M3 broadcaster — never PTY scraping).

**WP1 → WP3 rationale:** the NSPanel API shape + collection-behavior flags are the riskiest unknown (single-maintainer crate, raw AppKit flags, dev-vs-installed parity). Proving the bare panel works before pouring the live-mirror content in means a render/subscribe bug and a window-mechanics bug never tangle in the same debugging session.

---

## WP4: PiP layout modes + persisted switcher + auto-resize

**Description:** Add the other 3 layout modes on top of WP3's horizontal-mirror core, an on-panel control to switch between all 4, persistence of the chosen layout, and per-layout NSPanel auto-resize. The four layouts, richest → most minimal:
1. **Horizontal mirror** (WP3's default) — live thumbnails in a row.
2. **Vertical mirror** — same live thumbnails, stacked vertically.
3. **Compact** — project name + status dot only, stacked vertically (no mirror; stops that workspace's serialize cost).
4. **Minimal** — status dots only, no names, no mirror.
**Milestone:** M5
**Dependencies:** WP3 (the panel + one layout + the subscribe path exist to build on).
**Size:** L
**Tasks:**
- [ ] Implement the vertical-mirror layout (reuses WP3's serialized mirrors; vertical flow).
- [ ] Implement the compact layout (name + dot, vertical stack); when active, **stop the serialize loop** for the PiP (no mirrors rendered — same "stop the loop when not showing thumbnails" discipline as the filmstrip-collapse toggle).
- [ ] Implement the minimal layout (dots only). **Design intent (operator, 2026-06-25): this is the "is anyone waiting on me?" glance for the all-instances-busy use case** — not merely the smallest mirror. The aggregate signal is what matters: *all running = quiet/ignore; any awaiting-input = pull my eye*. So the minimal view must **weight attention**, not render N equal-weight dots — make the AwaitingInput dot(s) pop (blue against a calm row of running-orange), and consider surfacing awaiting-input workspaces first/louder so "all busy" reads quiet and "needs me" reads loud. **Identification:** dots in the same persisted filmstrip order + a hover-tooltip showing the project name (so a bare dot is still resolvable to a project). *(Conceptual sibling of the M6 menu-bar aggregate dot — green=all idle / blue=any running / amber=any awaiting; keep the two coherent.)*
- [ ] On-panel layout switcher: a small corner control (`[⋮]` click-to-cycle or a tiny menu) cycles/selects among the 4 layouts.
- [ ] Persist the chosen layout (`pip_layout`) across toggles + launches, keyed per the bundle-identity isolation (thin layer in `config_store/`, like `default_drive_mode`). Default on first run: horizontal mirror.
- [ ] **Auto-resize the NSPanel to each layout's dimensions on switch** — wide+short for horizontal mirror, narrow+tall for the two vertical modes, tiny for minimal dots. Each layout has sensible default dimensions; the panel reshapes on switch (use the WP1-confirmed window-resize path).
- [ ] Confirm the M3 palette + the "never disagree with the filmstrip on a workspace's state" invariant holds across all 4 layouts.

**WP3 → WP4 rationale:** one working layout + the subscribe/mirror path must exist before generalizing to four — the switcher, persistence, and auto-resize all wrap a proven render core rather than being designed speculatively around an unbuilt one. This also keeps the 4-layout UI work out of the same session as the NSPanel-mechanics + first-render work (WP3), which is the higher-risk integration.

---

## WP5: PiP toggle + lifecycle

**Description:** User-toggled show/hide for the PiP (it is NOT auto-summoned — vision: "Toggled on/off explicitly by the user"). The toggle affordance is an in-Claudesk control now (the menu-bar right-click "Toggle PiP" entry is an M6 surface — note the forward-coupling but don't build it here). Handle the panel's lifecycle: it tracks the live workspace set (open/close), and tears down cleanly on app quit.
**Milestone:** M5
**Dependencies:** WP3 (panel + content). Independent of WP4 in principle, but sequenced after it so the toggle wraps the final multi-layout panel.
**Size:** M
**Tasks:**
- [ ] In-Claudesk toggle control (a window-chrome button and/or a `View`-menu item in the existing native app menu — reuse the `app_menu` id→event→action seam, no accelerator, per the native-menu pattern). Decide placement; wire show/hide.
- [ ] PiP reflects the live workspace roster: opening/closing a workspace adds/removes its PiP tile (subscribe to the same registry signal the filmstrip uses; `close_workspace` already deregisters from the broadcaster — confirm the PiP tile drops with it). True across all 4 layouts.
- [ ] Clean teardown: the panel closes on app quit (`WindowEvent`/quit path) and does not leak an orphan NSPanel; toggling off fully hides it (and stops any PiP-specific render cost — including the serialize loop in the mirror layouts, mirroring the filmstrip-collapse discipline).
- [ ] (If GO on persistence) remember the PiP on/off state per the bundle-identity isolation (alongside `pip_layout`); otherwise default off on launch (decide + document — leaning default-off, summon-on-demand, matching the vision's "summon when the window loses focus").

**WP4 → WP5 rationale:** the toggle + lifecycle wraps the *final* panel (all layouts present), so "toggling off stops the render cost" is verified against the actual mirror layouts rather than a single-layout placeholder.

---

## WP6: Verify M5 — PiP out-of-focus status visibility across all layouts

**Description:** Milestone-exit verification of the M5 exit criteria against real workspaces and a real out-of-focus Claudesk window, across all 4 layouts. Testing posture follows the WP2 verdict: agent-drive what the adopted driver (if any) can reach, carry the rest — especially the native-NSPanel out-of-focus behavior, which is AppKit-level — into `verify-human`.
**Milestone:** M5
**Dependencies:** WP3, WP4, WP5. WP2 (decides agent-vs-human split).
**Size:** S
**Tasks:**
- [ ] With N≥2 real CC sessions in different states (one idle, one running, one driven to awaiting-input via a real prompt), toggle the PiP on and confirm every workspace's status dot is correct and the live mirror updates — **including the center-staged workspace's tile** (the deliberate roster divergence).
- [ ] Cycle through all 4 layouts: horizontal mirror, vertical mirror, compact (name+dot), minimal (dots). Confirm each renders correctly, the panel auto-resizes, and the chosen layout persists across a PiP toggle-off/on and an app relaunch.
- [ ] **Minimal-layout intent check:** with all instances busy (running) the view reads *quiet*; when one flips to awaiting-input its dot *pops* / is surfaced — the "is anyone waiting on me?" glance works. Hover-tooltip resolves each dot to its project.
- [ ] Switch Claudesk fully out of focus — another app foreground, a different macOS Space, Claudesk minimized — and confirm the PiP stays visible and keeps updating status (<1s visual scan, zero clicks; vision Success Metric 6).
- [ ] Confirm display-only: clicking a PiP tile does nothing (no promote, no focus steal).
- [ ] Confirm the PiP and the filmstrip never disagree on any workspace's state (same broadcaster, same palette).
- [ ] Installed-build smoke test: rebuild the `.app`, launch from Finder/Dock, repeat the out-of-focus check (NSPanel + PATH-class parity per the standing convention).

---

## Dependency map

```
WP1 (probe: NSPanel) ─┐
                      ├─→ WP3 (panel + 1 layout) ─→ WP4 (4 layouts + switcher) ─→ WP5 (toggle + lifecycle) ─→ WP6 (verify-at-N)
WP2 (probe: UI-driver)┘                                                                                       ↑
                      └───────────────────────────────────────────────────────────────────────────────────┘
                         (WP2 verdict sets WP6's agent-vs-human verification split)
```

- **Critical path:** WP1 → WP3 → WP4 → WP5 → WP6.
- **Parallel:** WP2 (UI-driver probe) runs alongside WP1 — independent learning objective, no shared code. Its output feeds WP6's verification posture (and, if adopt, the build WPs' own verify-self).
- **No orchestration/async layer** to order (no queues/workers; the broadcaster fan-out already exists from M3). The "synchronous path first" rule is N/A — there is no new async path; PiP is a new *subscriber* to an existing event stream.

## Learning-sequence ordering rationale

1. **Probes first (WP1, WP2).** The two riskiest unknowns are both *knowledge*, not code: does the single-maintainer NSPanel crate actually deliver the collection behavior we need (WP1), and can we agent-verify a status surface at all (WP2). Resolving both before WP3 means the build WP starts against confirmed APIs and a known testing posture — the cheapest possible moment to discover a NO-GO (fall back to raw `objc2`; fall back to operator-only verify).
2. **Panel + one layout before the layout matrix (WP3 before WP4).** Window mechanics + the first live-mirror render are the high-risk integration; prove them on a single layout before adding 3 more layouts + a switcher + per-layout auto-resize. Keeps an AppKit window bug, a React subscribe bug, and a multi-layout UI bug out of the same session.
3. **Toggle/lifecycle wraps the final panel (WP5 after WP4).** "Toggling off stops the render cost" is only meaningfully verified against the real mirror layouts, so the lifecycle WP comes after all layouts exist.
4. **Verify last (WP6).** Milestone-exit verification needs the whole surface live at N across all layouts; it also consumes WP2's adopt/reject verdict to decide what's agent-driven vs. carried to verify-human.

## SURFACE-IN integration (this pass)

Two forward-look backlog items were anchored to "M5 planning" and are folded in here:
- **`SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI`** → **WP2** (the adopt/reject probe). Status to be set RESOLVED at WP2 close with the verdict.
- **`tauri-nspanel` bus-factor / API-shape risk** (arch §B.3 "Bus-factor risk") → **WP1** (the NSPanel probe), satisfying the WBS 3rd-party-integration rule (a probe must precede the build WP that assumes the crate's API).

Items explicitly NOT in M5 (kept in roadmap/backlog for their anchored milestones): the workflow-doc-hierarchy watcher (`SURFACE-2026-06-22-WP5-DROPPED-...` → M6), CM6 bundle-size lazy-load (→ M9/M10 startup-trim), the standing code-quality MINOR/MAJOR refactor batch (→ a future `/feature-refactor`).

## Probe outcomes

_(WP1 and WP2 record their findings here when run.)_
