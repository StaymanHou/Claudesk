---
stage: wbs
state: complete
updated: 2026-06-26
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

## WP1: Probe — `tauri-nspanel` NSPanel mechanics on macOS / Tauri 2.9  ✅ SHIPPED 2026-06-25 (commit 10a49cc; review fixes f2ad4e5)

**Type:** probe
**Milestone:** M5 (must precede WP3/WP4 — the build WPs depend on this knowledge)
**Dependencies:** none
**Size:** S
**Learning objective:** Confirm `tauri-nspanel` v2.1 under our Tauri 2.9.x line can create a small always-on-top secondary panel with the exact `NSWindow` collection behavior the PiP needs, and document the Rust API shape + any entitlement/code-signing requirements so WP3 builds against known calls — not assumed ones. (arch §B.3 names the target flags; this probe proves they work as-built and surfaces the single-maintainer bus-factor reality.)
**Timebox:** half-day
**Success criterion:** A one-paragraph note in this file (under "Probe outcomes") recording: (a) the working `PanelBuilder` call with `no_activate(true)` + `PanelLevel::Floating` + the collection-behavior flag set (`CanJoinAllSpaces | FullScreenAuxiliary | Stationary`) — or, if the high-level builder doesn't expose them, the raw `objc2` `NSWindow.setCollectionBehavior(...)` path that does; (b) confirmation the panel survives a Space switch + draws over a fullscreen app + does NOT steal focus on click; (c) any entitlement / signing requirement (expected: none for unsigned local builds, but verified); (d) GO/NO-GO for `tauri-nspanel` v2.1 vs. a fallback (raw `NSWindow` via `objc2`), with the pin/monitor note for `tauri-apps/tauri#13034`.
**Tasks:**
- [x] Add `tauri-nspanel` v2.1 to `src-tauri/Cargo.toml`; stand up a bare empty NSPanel toggled by a temporary command (no real content yet).
- [x] Apply `PanelLevel::Floating` + collection-behavior flags; verify each behavior manually: all-Spaces ✓, no-focus-steal-on-click ✓, survives focus-loss ✓. *(NOT `no_activate(true)` — the probe proved it's destructive; non-activation is the `NonactivatingPanel` style mask. Over-fullscreen DROPPED by operator — not a requirement.)*
- [~] Confirm it works in BOTH `pnpm tauri:dev` AND a freshly-built installed `.app` — **dev verified ✓; installed-`.app` parity DEFERRED → WP6** (re-verifying on the throwaway probe added no signal; the real PiP gets the installed smoke test at milestone-exit).
- [~] Verify dev/prod isolation holds — **DEFERRED → WP6** (same rationale; tied to the installed-`.app` check).
- [x] Write the outcome note (GO/NO-GO + API shape + the fallback path if NO-GO) — done, in "Probe outcomes" below.
- [x] Tear down OR keep the toggle — GO ⇒ KEPT as the WP3 seed (`pip_probe/` + `public/pip-probe.html` + the temp "PiP?" button).

---

## WP2: Probe — agent UI-driver for verify-self on workspace-status surfaces (adopt/reject)  ✅ SHIPPED 2026-06-26 (commit f18f1e0; VERDICT: ADOPT)

**Type:** probe
**Milestone:** M5 (decision explicitly anchored to "M5 planning" — `SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI`)
**Dependencies:** none (parallel to WP1)
**Size:** S
**Learning objective:** Decide — adopt or deliberately reject — a real-app UI driver so `feature-verify-self` can agent-verify the new PiP status surface (more live status-rendering, the exact class that currently always punts to native `verify-human`). Lead candidate found 2026-06-23: [`hypothesi/mcp-server-tauri`](https://github.com/hypothesi/mcp-server-tauri) (`tauri-plugin-mcp-bridge`, WebSocket :9223, drives the real WKWebView with live IPC — `webview_interact` / `webview_dom_snapshot` / `webview_execute_js` / `read_logs` / `ipc_monitor`). The online check is already done; what remains is the macOS smoke test + the written verdict.
**Timebox:** half-day
**Success criterion:** A written adopt-or-reject decision in this file (under "Probe outcomes") backed by a macOS smoke test of `mcp-server-tauri` against a Claudesk dev build (does a workspace actually mount + is it drivable?). If **adopt:** a minimal harness wired so an M5 status-surface outcome (e.g. "the PiP tile shows AwaitingInput when the hook channel reports it") is agent-observable; record what `feature-verify-self` should invoke. If **reject:** the recorded reason + the standing posture stays "operator-only at the live tier for backend-lifecycle/native-window features" (the existing `CLAUDE.md` verify-self convention), so WP3/WP4 carry their live outcomes into `verify-human` knowingly, not by default.
**Tasks:**
- [x] Install `tauri-plugin-mcp-bridge` into a Claudesk dev build; bring up the MCP server; smoke-test connecting to the running WKWebView.
- [x] Verify the workspace + filmstrip actually mount + are drivable (`webview_dom_snapshot` shows real tiles; `webview_execute_js` can read a status dot's state).
- [x] Assess the NSPanel reachability specifically — the PiP is a *separate* `tauri-nspanel` webview; confirm whether the driver can attach to it or only the main webview (this bounds what M5 can agent-verify vs. carry to verify-human).
- [x] Write the adopt/reject verdict + (if adopt) the minimal verify-self invocation recipe; (if reject) the recorded reason.
- [x] Update the `SURFACE-2026-06-23` backlog entry status to RESOLVED with the verdict.

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

### WP2 — agent UI-driver for verify-self — **VERDICT: ADOPT** (2026-06-26)

`mcp-server-tauri` + `tauri-plugin-mcp-bridge` is **ADOPTED** as the agent-side UI driver for `feature-verify-self` on Claudesk's workspace-status surfaces. The macOS smoke test passed decisively and the bridge dissolves the bare-Vite dead end (`__TAURI_INTERNALS__` undefined → no workspace mounts → every live-DOM outcome UNVERIFIED) that bit M4 WP3/WP4/WP4b. **The whole smoke test was agent-driven in-session** — the prior "operator-only at the live tier" posture for workspace-UI features no longer holds for the *main + NSPanel webviews* (it still holds for installed-`.app` and backend-process outcomes; see boundaries).

**(a) Smoke-test result (agent-driven, real macOS WKWebView, `pnpm tauri:dev`):**
- **Bridge attaches + round-trips:** `driver_session{start, port:9223}` → connected; `webview_dom_snapshot{structure}` returned the real picker DOM (28 indexed elements, `data-testid` intact); `webview_screenshot` captured the live viewport. The README's "WebKit weaker than Chromium" caveat did NOT bite for DOM/JS/click/screenshot.
- **Live IPC + drivable workspace:** `webview_execute_js` → `{hasTauriInternals:true, hasInvoke:true}` (the exact thing bare-Vite lacks); `webview_interact{click, [data-testid=picker-recent]}` mounted a real workspace (`workspaceCount:1`, `.xterm` present, CC v2.1.178 booted in the PTY pane); live status-dot class read via JS.

**(b) NSPanel reachability (P2.1) — YES, the bridge reaches the NSPanel webview, not just `main`.** Using the WP1 throwaway `pip_probe` NSPanel as the test surface: `pip_probe_toggle` via IPC → the bridge enumerated **both** windows ("Available windows: main, pip-probe"); `webview_dom_snapshot{windowId:'pip-probe'}` returned the panel's real DOM; `webview_execute_js{windowId:'pip-probe'}` read its content (`/pip-probe.html`, "PiP probe / floating · all-Spaces · non-activating"). **Implication:** WP3's real PiP status-mirror is agent-verifiable through the bridge via the `windowId` param — NOT carried to verify-human. Best-case outcome for M5.

**(c) The verify-self invocation recipe (ADOPT path):** `feature-verify-self` drives these MCP tools directly (the tool names are `mcp__tauri__*`, NOT the Playwright-MCP names `feature-verify-self-runner` assumes — so for Claudesk workspace-UI outcomes, drive the bridge tools inline, do NOT spawn the Playwright runner):
1. `pnpm tauri:dev` (background) → wait for the `"WebSocket server listening on: 127.0.0.1:9223"` (or `"MCP Bridge plugin initialized"`) stdout line. (NOT `"LISTEN"` — that's an `lsof`/`netstat` artifact, not a stdout token; grepping dev-server stdout for `LISTEN` misses it.)
2. `mcp__tauri__driver_session{action:'start', port:9223}`.
3. Drive: `webview_dom_snapshot{type:'structure'|'accessibility', windowId?}`, `webview_execute_js{script, windowId?}` (read live status-dot class / `__TAURI_INTERNALS__`), `webview_interact{action:'click', selector:'[data-testid=…]'}` (pick a project → workspace mounts; promote a filmstrip tile), `webview_screenshot`. Target the PiP with `windowId:'<pip-label>'`.
4. To exercise a *status transition*, trigger it via **IPC/click, not by typing into the CC terminal** (see boundary below).

**(d) Boundaries found (what stays operator/verify-human even with ADOPT):**
- **Raw xterm terminal typing is low-fidelity.** `webview_keyboard{type/press Enter}` into `.xterm-helper-textarea` reached the CC prompt line but synthetic Enter did NOT commit to the PTY. So CC-TUI keystroke flows stay operator/`expect`-driven; status-dot *transitions* are still agent-observable, just trigger them via IPC/click.
- **Installed-`.app` + backend-process outcomes** still genuinely operator-only: GUI-PATH spawn parity (the 2026-06-24 install-only `claude` PATH class) and `pgrep`-for-a-reaped-process outcomes the webview can't see. The CLAUDE.md "installed-build smoke test" + "operator-only at the live tier" conventions stand for *those*; the bridge amends them only for main/NSPanel webview DOM/IPC/interaction.

**(e) Bug the probe surfaced + fixed (bare-Vite never could have):** the inline `mcp-bridge-dev` capability in `tauri.dev.json` targeting `"main"` SUPPRESSED the file-based `default` capability for that window, dropping `core:default` → `cc_spawn`'s `event.listen` failed ("event.listen not allowed: core:event:allow-listen"). FIX: re-list `core:default`/`opener:default`/`dialog:default` alongside `mcp-bridge:default` in the inline dev capability.

**Wiring disposition (ADOPT ⇒ KEEP, dev-only):** `tauri-plugin-mcp-bridge` stays wired `#[cfg(debug_assertions)]` in `lib.rs` (`init_with_config(Config::localhost_only())`, binds 127.0.0.1:9223); the `mcp-bridge-dev` capability stays in `tauri.dev.json` (dev-config overlay only, never in `capabilities/*.json`); the `tauri` MCP server stays in `.mcp.json`. Release builds compile it OUT — confirmed in P2.3 (`nm` check). CLAUDE.md's verify-self convention amended 2026-06-26 to point future sessions at the bridge.

### WP1 — `tauri-nspanel` NSPanel mechanics — **VERDICT: GO** (2026-06-25)

`tauri-nspanel` v2.1 is confirmed viable for the M5 PiP. Build WP3 against the API + constraints below — they are NOT assumptions; each was compiled and/or live-verified during the probe.

**(a) The working API shape (copy-pasteable; confirmed by source read of the v2.1 checkout + a live-running panel).**
- **Dependency (git-only, NOT crates.io):** `tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2.1" }` (resolves to package `2.1.0`, commit `a3122e8`). Compiles clean against **Tauri 2.11.2** (the WBS's assumed "2.9.x line" is now 2.11.2 — no incompatibility; the crate floors tauri at 2.8.5).
- **Required:** enable the `tauri` feature **`macos-private-api`** AND set `"app": { "macOSPrivateApi": true }` in `tauri.conf.json`. Plugin init: `.plugin(tauri_nspanel::init())`.
- **No zero-config default panel type** — you MUST define a class: `tauri_panel! { panel!(MyPanel { config: { can_become_key_window: false, can_become_main_window: false, is_floating_panel: true, hides_on_deactivate: false } }) }`. The macro expansion needs `tauri::Manager` in scope. `config:` keys are CLASS-LEVEL bool-method overrides (baked in at `define_class!` time — crash-free, unlike post-build setters).
- **Builder:** `PanelBuilder::<_, MyPanel>::new(&app, "label").url(WebviewUrl::App("x.html".into())).size(LogicalSize::new(w,h).into()).with_window(|wb| wb.decorations(false).transparent(true).skip_taskbar(true)).style_mask(StyleMask::new().borderless().nonactivating_panel()).level(PanelLevel::Floating).collection_behavior(CollectionBehavior::new().can_join_all_spaces().full_screen_auxiliary().stationary()).has_shadow(true).build()?` → `Arc<dyn Panel>`.
- **Show without activating:** `panel.order_front_regardless()`. **Hide:** `panel.hide()`. **Re-fetch:** `app.get_webview_panel("label")` (via `ManagerExt`). **Visibility:** `panel.is_visible()`.
- **Content:** a bundled app route (`WebviewUrl::App("pip-probe.html")`, file in `public/`) — NOT a `data:` URL (renders blank under the app CSP).

**(b) Behaviors confirmed (live, `pnpm tauri:dev`, operator-verified 2026-06-25).** Toggle show/hide ✓; **visible on every Space** after a Space switch ✓ (`can_join_all_spaces`); **does NOT steal focus / activate the app on click** ✓ (the load-bearing one); **survives Claudesk losing focus / minimize** ✓ (`hides_on_deactivate:false`); **no crash on toggle** ✓; **safe teardown** (no orphaned panel after main-window close) ✓.

**(c) Entitlement / signing:** none required for unsigned local dev builds — verified (no entitlement added; `macos-private-api` is a tauri Cargo feature + conf flag, not a code-signing entitlement). Installed-`.app` parity + the `tauri-apps/tauri#5566` release-vs-dev caveat → carried to **WP6** (re-verifying on a throwaway probe added no signal; the real PiP gets the installed-build smoke test there).

**(d) GO/NO-GO:** **GO** for `tauri-nspanel` v2.1 — no fallback to raw `objc2` needed (the builder + class config + a single safe `set_style_mask` cover every required behavior). **Bus-factor:** single-maintainer, pinned to a branch (not a tag) — monitor `tauri-apps/tauri#13034` for first-party NSPanel support and migrate if it lands.

**⚠️ WP3 MUST-FOLLOW constraints (each cost a verify-human crash/failure to discover; all sourced to tauri-nspanel issues #19/#22 + the maintainer's menubar example):**
1. **NonactivatingPanel needs a born-borderless window.** Non-activation (no focus-steal on click) comes ONLY from the `NonactivatingPanel` style mask — `can_become_key_window:false` alone does NOT stop app activation. BUT setting that mask post-build crashes with `NSRangeException` IF the window transitions Titled→borderless (AppKit content-view teardown vs. WebKit `WKWindowVisibilityObserver` KVO). **Fix:** create the window `decorations(false)` + `transparent(true)` via `.with_window(...)` BEFORE conversion, then `style_mask(borderless | nonactivating_panel)` is safe.
2. **NEVER `.no_activate(true)`** on a single-window app — it flips the global `NSApplicationActivationPolicy` to `Prohibited` during `build()`, which HID the entire main Claudesk window.
3. **Teardown via `panel.to_window()` → `window.close()` ONLY** (in the main window's `CloseRequested`). Closing the live panel object directly is a use-after-free that aborts with `fatal runtime error: Rust cannot catch foreign exceptions`. An all-Spaces/floating panel also orphans on screen unless explicitly torn down on app close.
4. **No close (X) button** on a borderless panel — dismiss via the toggle/hide. (A titled variant restores a drag-bar but reintroduces the X-close UAF risk; the borderless build is what shipped the probe GO.)
5. **Builder method is `collection_behavior`** (American), NOT the `set_collection_behaviour` arch.md wrote — correct arch.md at finalize.

**Deferred out of WP1 (not failures):** over-fullscreen draw (operator DROPPED — not a PiP requirement, though the `full_screen_auxiliary` flag is kept, harmless); **drag-by-body** (DEFERRED→WP3: `movable_by_window_background(true)` did not visibly enable it; robust fix is a web-side `data-tauri-drag-region` handle); installed-`.app` parity + dev/prod isolation (DEFERRED→WP6).

**Probe-code disposition:** GO ⇒ `src-tauri/src/pip_probe/` + `public/pip-probe.html` + the temporary "PiP?" button in `RightPanelHost.tsx` are KEPT as the **WP3 seed** (the working PanelBuilder call is the starting point). WP3 replaces the throwaway button + inline content with the real toggle + live status-mirror surface and removes the `_probe` naming.
