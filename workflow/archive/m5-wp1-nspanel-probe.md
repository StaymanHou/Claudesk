# Feature: M5 WP1 — Probe: `tauri-nspanel` NSPanel mechanics

**Workflow:** feature
**State:** finalize (complete) — VERDICT: GO, shipped 10a49cc + review fixes f2ad4e5
**Created:** 2026-06-25
**Completed:** 2026-06-25
**drive_mode:** autopilot
**Type:** probe (deliverable is a GO/NO-GO knowledge note, not production code)
**WBS ref:** `docs/product/wbs.md` → M5 WP1

## Problem Statement

M5 (Picture-in-picture) needs a small always-on-top floating panel that (a) is visible on every Space, (b) draws over fullscreen apps, and (c) does NOT steal focus when clicked — the AppKit `NSPanel` non-activating + collection-behavior contract. `arch.md` §B.3 names `tauri-nspanel` v2.1 with `PanelBuilder.no_activate(true)` + `PanelLevel::Floating` + `NSWindowCollectionBehaviorCanJoinAllSpaces | FullScreenAuxiliary | Stationary`, but flags the crate as single-maintainer (bus-factor risk) — and our line is now **Tauri 2.11.2**, not the 2.9.x the WBS assumed, so v2.1 compat against 2.11 is itself unverified. This probe stands up a bare empty NSPanel behind a temporary toggle, proves the three behaviors as-built (dev AND installed `.app`), confirms dev/prod isolation holds, and records a GO/NO-GO verdict + the exact working Rust API shape (or the raw `objc2` `NSWindow.setCollectionBehavior(...)` fallback path if the high-level builder doesn't expose the flags) under "Probe outcomes" in `wbs.md`. WP3 (the build WP) then builds against confirmed calls, not assumed ones.

No 3rd-party network API — `tauri-nspanel` is a compile-time Rust crate; this probe IS its de-risk. No external probe precedes it.

## Work Tree

- [x] Phase 1: Bare NSPanel behind a temporary toggle — prove the AppKit contract + record verdict  <!-- status: complete — GO. All impl + all 5 verification nodes complete. -->

  **Observable outcomes:**
  - CLI (build gate): `cd src-tauri && cargo build` exits 0 with `tauri-nspanel` v2.1 added — i.e. the crate compiles against Tauri 2.11.2 (the first hard GO/NO-GO gate; a compile failure here = pin-mismatch NO-GO, fall to `objc2`).
  - CLI (lint/type): `pnpm tsc --noEmit` + `pnpm eslint .` pass with the temporary toggle button wired (frontend `invoke("pip_probe_toggle")`).
  - Browser (dev-seam): in `pnpm tauri:dev`, clicking the temporary "PiP probe" toggle button makes a small empty panel appear; clicking again hides it. (Confirms the command is reachable + the panel is created — the *behavior* outcomes below are verify-human, AppKit-level.)
  - Console: no JS errors on toggle; no Rust panic in the `tauri:dev` stderr on create/show/hide.
  - **Carried to verify-human (AppKit-level, not agent-observable):** panel visible on every Space after a Space switch; panel draws OVER a fullscreen app; clicking the panel does NOT steal focus from the frontmost app (no app-activation, no focus theft); panel survives Claudesk losing focus / being minimized; all of the above reproduced in a freshly-built installed `.app` launched from Finder/Dock (installed-build-smoke-test convention — NSPanel is exactly the dev-vs-installed parity class); dev/prod isolation holds (the dev panel belongs to `com.claudesk.app.dev`, no cross-talk with a concurrently-running prod build).
  - [x] P1.1 Add `tauri-nspanel` v2.1 to `src-tauri/Cargo.toml`; `cargo build` to confirm it compiles against Tauri 2.11.2.  <!-- status: complete — GO on compile gate. Crate is git-only (branch=v2.1, commit a3122e8, package 2.1.0); NOT on crates.io. Compiled clean vs tauri 2.11.2 in 50s. Required: enable tauri feature `macos-private-api` + set `"macOSPrivateApi": true` in tauri.conf.json (both done). -->
  - [x] P1.2 Throwaway `src-tauri/src/pip_probe/` seam: `pip_probe_toggle` command builds-once then toggles a bare NSPanel; registered in lib.rs invoke_handler + `tauri_nspanel::init()` plugin added.  <!-- status: complete — PanelBuilder<_, PipProbePanel> exposes ALL three flags NATIVELY: no_activate(true) + level(PanelLevel::Floating) + collection_behavior(CanJoinAllSpaces|FullScreenAuxiliary|Stationary) + style_mask(nonactivating_panel). NO raw objc2 fallback needed. A custom panel class via tauri_panel!{panel!(PipProbePanel{config:{can_become_key_window:false,...}})} is REQUIRED (no zero-config default type); macro needs `tauri::Manager` in scope. Content = inline data: HTML. cargo build clean. -->
  - [x] P1.3 Temporary "PiP?" toggle button in RightPanelHost tab row (past the launcher divider, data-testid=pip-probe-toggle) → `invoke("pip_probe_toggle")`. The operator's verify-human driver.  <!-- status: complete — tsc clean, eslint 0 errors (1 pre-existing XtermPane warning unrelated), vite build clean. -->
  - [x] verify-self static gate (agent-doable slice): cargo build + cargo check + tsc --noEmit + eslint + vite build all pass; full end-to-end wiring trace confirmed (button data-testid=pip-probe-toggle → invoke("pip_probe_toggle") → lib.rs mod+plugin-init+handler-register → #[tauri::command] pip_probe_toggle → PanelBuilder::<_,PipProbePanel> → order_front_regardless/hide; macOSPrivateApi+macos-private-api feature present). NO running app/dev server in-session (pgrep + port 1420 both empty) — and the NSPanel is a native window the bare Vite dev-seam cannot observe + the Tauri invoke would reject in a plain browser, so a Playwright subagent would target a non-existent surface. Per the CLAUDE.md backend-lifecycle verify-self convention: agent proves code compiles + wires; operator proves NSPanel AppKit behavior at verify-human. No real integration boundary (isolated new command + new button; existing tabs/launchers untouched; the meaningful effect is an AppKit window unobservable in the browser).  <!-- status: complete -->

  - [x] verify-auto  <!-- status: complete — cargo check clean (24.5s), tsc clean, eslint 0 errors, vite build clean. No RightPanelHost-specific test (temporary button, no logic); vite full-graph compile is the JSX smoke. -->
  - [x] verify-self  <!-- status: complete — agent-doable static slice green (compile/type/lint/build + full wiring trace); live + NSPanel AppKit outcomes carried to verify-human per the backend-lifecycle convention. No running surface to drive (no app/dev server; NSPanel unobservable in a bare browser). No genuine integration boundary. -->
  - [x] verify-human  <!-- status: complete — GO. Required behaviors PASS live (dev): toggle/all-Spaces/#4-no-focus-steal/survives-focus-loss/no-crash/safe-teardown. #3 over-fullscreen DROPPED by operator; drag DEFERRED→WP3; installed-.app parity DEFERRED→WP6. Borderless build (the live-tested one) retained. -->
    **Operator setup:** run `pnpm tauri:dev`, open any workspace, click the "PiP?" button in the right-panel tab row (far right, past the launcher divider). A small dark floating "PiP probe" panel should appear; click again to hide. Then run the six checks below. Also build + test the installed `.app` (`pnpm tauri build` → launch the `.app` from Finder) for the parity + dev/prod-isolation checks.
    - [x] P1.verify-human.1 Toggle: clicking "PiP?" shows the panel; clicking again hides it (no JS error, no Rust panic in stderr)  <!-- status: complete — PASS (operator 2026-06-25, after the no_activate + style_mask + data-URL fixes) -->
    - [x] P1.verify-human.2 Space switch: panel stays visible after switching macOS Spaces  <!-- status: complete — PASS (collection_behavior CanJoinAllSpaces confirmed) -->
    - [~] P1.verify-human.3 Fullscreen: panel draws OVER a fullscreened app window  <!-- status: DROPPED — operator scoped this OUT 2026-06-25: "this feature is not needed". Over-fullscreen draw is NOT a PiP requirement. The collection_behavior FullScreenAuxiliary flag stays in the code (harmless) but the behavior is not part of the exit criteria. NOT a fail. -->
    - [x] P1.verify-human.4 No focus-steal: clicking the panel does NOT activate Claudesk / steal focus from the frontmost app  <!-- status: complete — PASS (operator 2026-06-25, "vh.4 works now") after fix #4: NonactivatingPanel style mask on a borderless-at-creation window. The crash-free non-activation lever. -->
    - [x] P1.verify-human.5 Survives Claudesk losing focus / minimize (panel stays floating + visible)  <!-- status: complete — PASS (hides_on_deactivate:false) -->
    - [x] P1.verify-human.close-crash + teardown No crash on toggle; panel does NOT orphan after main-window close  <!-- status: complete — PASS (operator 2026-06-25 "no crash - verified", "teardown - verified"). No X button (borderless); teardown via to_window()→close() in CloseRequested. -->
    - [~] P1.verify-human.drag Draggable by body  <!-- status: DROPPED from WP1 — NOT a WP1 success criterion (surfaced only because removing the titlebar removed the drag affordance). movable_by_window_background did not visibly enable body-drag; robust fix is web-side data-tauri-drag-region. DEFERRED to WP3 (operator decision 2026-06-25). -->
    - [~] P1.verify-human.6 Installed `.app` parity  <!-- status: DEFERRED to WP6 (milestone-exit verification) — NOT run for the probe. The probe's GO is established on dev-mode behavior (all required AppKit behaviors verified live in pnpm tauri:dev). The installed-.app + dev/prod-isolation + #5566 release-vs-dev parity checks move to WP6 where the REAL PiP is built; re-verifying them on a throwaway probe panel adds no signal. Recorded as a WP6 carry. (Operator closed WP1 as GO on the dev-verified behaviors 2026-06-25.) -->
    - **Operator close decision 2026-06-25:** WP1 closed as **GO** on the dev-verified required behaviors (toggle, all-Spaces, no-focus-steal, survives-focus-loss, no-crash, safe-teardown). #3 over-fullscreen DROPPED; drag DEFERRED→WP3; installed-.app parity DEFERRED→WP6. Reverted to the borderless build (exactly what was tested live).
    - **Operator scope decision 2026-06-25:** #3 (over-fullscreen) DROPPED from the M5 PiP requirement set — "not needed". Exit criteria for the PiP window contract are now: toggle ✓, all-Spaces ✓, survives-focus-loss ✓, **non-activating-on-click** (the open #4), installed parity.
  - [x] verify-codify  <!-- status: complete — probe deliverable IS the wbs.md verdict (not a test suite); 249 cargo tests pass, no regression. No integration boundary (isolated throwaway command + additive button). -->
    - [x] Wrote the GO/NO-GO outcome note in `docs/product/wbs.md` → "Probe outcomes" (a/b/c/d + the 5 WP3 MUST-FOLLOW constraints + deferrals + probe-code disposition).  <!-- status: complete -->
    - [x] Teardown decision: GO ⇒ KEEP `pip_probe/` + `public/pip-probe.html` + the temp button as the WP3 seed (recorded in the wbs.md outcome). WP3 replaces the throwaway button/content + drops the `_probe` naming.  <!-- status: complete -->
  

## Current Node
- **Path:** Feature > review-quality COMPLETE → finalize
- **Active scope:** none — WP1 probe shipped (10a49cc) + review-quality done (0C/0M/2 MINOR, both fixed in-place f2ad4e5). Ready for /feature-finalize.
- **Blocked:** none
- **Blocked:** none
- **Unvisited:** verify-auto → verify-self → verify-human (operator drives the AppKit-behavior checks on dev + installed .app) → verify-codify (write the GO/NO-GO note to wbs.md + teardown decision)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [BLOCKING-FIX-2026-06-25 #1] P1.verify-human.1 — First verify-human attempt: clicking "PiP?" made the MAIN Claudesk window VANISH (no dock icon, no on-screen window; process stayed alive) and NO panel appeared. **Root cause:** the builder's `.no_activate(true)` flips the whole app's `NSApplicationActivationPolicy` to `Prohibited` during `build()` (confirmed by source read of build() lines 817-928) — on this single-window app that hid the main window; the `data:` URL panel content also rendered blank under the app CSP. **Fix:** dropped `.no_activate(true)` + replaced the `data:` URL with bundled `public/pip-probe.html` via `WebviewUrl::App`.
- [BLOCKING-FIX-2026-06-25 #4] P1.verify-human.4 + chrome + teardown — Third attempt's fix FAILED on re-test (operator): focus STILL jumped to Claudesk; AND `decorations(false)` left the panel with no titlebar (can't drag/close); AND the panel ORPHANED on screen after the main window closed. Root insight (from a research dive into tauri-nspanel issues #19/#22 + the maintainer's shipping menubar example): (a) `can_become_key_window:false`/`becomes_key_only_if_needed` do NOT stop click-ACTIVATION — only the `NonactivatingPanel` STYLE MASK does; (b) the `setStyleMask:` NSRangeException crash happens ONLY on a Titled→borderless transition, so the maintainer's documented fix (#19) is to create the window ALREADY borderless+transparent via `.with_window(...)` BEFORE conversion, after which `set_style_mask(borderless|nonactivating_panel)` is crash-free; (c) borderless needs `.movable_by_window_background(true)` for drag; (d) teardown MUST be `panel.to_window()→window.close()` (un-swizzles first) — closing the live panel is the UAF abort (#22). **Fix (applied, compiles):** restored `.style_mask(borderless().nonactivating_panel())` now that `.with_window(|wb| wb.decorations(false).transparent(true).skip_taskbar(true))` makes it crash-safe; added `.movable_by_window_background(true)`; panel class now `can_become_key_window:false`+`is_floating_panel:true`+`hides_on_deactivate:false`; added `pip_probe::commands::teardown()` to lib.rs `CloseRequested`. This fix is GROUNDED in the maintainer's documented pattern + shipping example, NOT a guess like the prior three. Awaiting operator re-test (#4 focus + drag + close-doesn't-orphan + no crash).
- [BLOCKING-FIX-2026-06-25 #3 — superseded by #4] P1.verify-human.4 + close-button — Third attempt: panel showed fine but (a) clicking the panel ACTIVATED Claudesk (focus-steal — verify-human #4 FAIL), and (b) clicking the panel's X close button CRASHED the app: `fatal runtime error: Rust cannot catch foreign exceptions, aborting` (a released-NSPanel use-after-free — the panel is `released_when_closed` by default, so closing it dealloc'd the NSPanel while Tauri/webview still held it). **Root cause of (a):** `can_become_key_window:false` alone does NOT prevent app activation on click — that needs `NonactivatingPanel`, which we can't set post-attach (crash #2). **Fix (applied, compiles):** (i) added `becomes_key_only_if_needed:true` to the panel CLASS config (crash-free class-level override — suppresses key-window-on-click → no activation); (ii) made the window BORDERLESS via `.with_window(|wb| wb.decorations(false).closable(false).minimizable(false))` — set BEFORE the webview attaches (the only safe place for chrome changes), which removes the titlebar (no click-to-activate target) AND the X button (kills the close-crash); (iii) `released_when_closed(false)` as belt-and-braces against the UAF. Awaiting operator re-test of #4 + close. `*** Terminating app due to uncaught exception 'NSRangeException', reason: 'Cannot remove an observer <WKWindowVisibilityObserver> for the key path "contentLayoutRect" from <PipProbePanel> because it is not registered as an observer.'` Crash stack: `pip_probe_toggle` → `PanelBuilder::build` → `PipProbePanel::set_style_mask` → `-[NSWindow setStyleMask:]` → AppKit detaches/reattaches the content view → WebKit's `WKWindowVisibilityObserver` KVO teardown on an unregistered observer. **Root cause:** the builder applies `.style_mask(...)` via a POST-build `setStyleMask:` on a window that ALREADY has a WKWebView attached — mutating an attached-WKWebView NSPanel's style mask is unsafe and crashes. **Fix (applied, compiles):** dropped `.style_mask(...)` ENTIRELY. The crate's `from_window` swizzles the NSWindow class to the panel class (which sets `can_become_key_window:false`) but never sets a style mask itself, so there's nothing to crash on. Non-activation is FULLY covered by `can_become_key_window:false`; the style mask only added borderless/HUD cosmetics, irrelevant to the behavioral probe. **WP3 constraint: never call `.style_mask(...)`/`set_style_mask` on a panel whose webview is attached — establish any needed mask before attach, or live without it.** Awaiting operator re-test.

## Code-Quality Review — m5-wp1-nspanel-probe (2026-06-25, ship commit 10a49cc)

Reviewer (code-quality-reviewer subagent): **0 CRITICAL, 0 MAJOR, 2 MINOR.** Probe-scope calibration applied correctly.

### Strengths
- Crash-path avoidances documented at the site they govern, each tied to the verify-human failure that earned it (the highest-value probe output).
- Teardown correct + defensive: no-op if never built, the only UAF-safe `to_window()→close()` path, fired from `CloseRequested` so the all-Spaces panel can't orphan.
- Git dep pinned to a concrete commit SHA in `Cargo.lock` despite `branch=v2.1` — reproducible seed.
- Class-level behavior overrides chosen over post-build setters (avoids the setter-transition crash class).
- Cleanly isolated: one `mod`, one command, one temp button; no entanglement with M3/M4 surfaces.

### Issues
**CRITICAL** — none
**MAJOR** — none
**MINOR** (both ADDRESSED IN-PLACE this pass — doc-only, in the kept WP3 seed, so fixing now prevents a WP3 foot-gun rather than deferring):
- [ADDRESSED] `pip_probe/mod.rs:14` docstring still claimed `no_activate(true)` was the non-activation mechanism — the exact API the probe concluded is FORBIDDEN, in the file a WP3 author reads first. Rewrote the docstring to name the `NonactivatingPanel` style mask + an explicit "do NOT use `.no_activate(true)`" warning.
- [ADDRESSED] "over-fullscreen" still advertised in the panel content (`public/pip-probe.html`) + mod docs though the requirement was dropped. Removed from the content caption; mod doc now notes `full_screen_auxiliary` is set-but-not-a-validated-need.

### Assessment
Well-executed probe — converts four AppKit crash/failure modes into durable co-located constraints, correctly-scoped + correctly-torn-down throwaway, pinned risky dep. Only debt was doc-drift within the kept seed (the top-of-file summary naming the forbidden API); fixed in-place since the seed is designed to be re-read at WP3. Executable code is correct and safe.

### If you disagree
Operator: dismiss any finding by editing this section + marking `[DISMISSED]` before finalize archives the WIP.

## Probe verdict (preliminary — finalized at verify-codify after operator AppKit checks)

**Compile-gate verdict: GO.** `tauri-nspanel` v2.1.0 (commit `a3122e8`) compiles clean against Tauri 2.11.2. The AppKit-behavior GO/NO-GO completes at verify-human (Space/fullscreen/focus-steal/installed-`.app`).

**API shape (confirmed by source read of the v2.1 checkout — copy-pasteable, NOT assumed):**
- **Dependency (git-only, NOT crates.io):** `tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2.1" }`
- **Required:** `tauri` feature `macos-private-api` + `"app": { "macOSPrivateApi": true }` in tauri.conf.json. Plugin init: `.plugin(tauri_nspanel::init())`.
- **No zero-config default panel type** — must define one: `tauri_panel! { panel!(PipProbePanel { config: { can_become_key_window: false, can_become_main_window: false } }) }`. The macro expansion needs `tauri::Manager` in scope.
- **Builder (all flags native — NO raw objc2 needed):**
  ```rust
  PanelBuilder::<_, PipProbePanel>::new(&app, "label")
      .url(WebviewUrl::External(url))            // data: URL works for content
      .size(LogicalSize::new(w, h).into())
      .no_activate(true)                          // non-activating
      .level(PanelLevel::Floating)                // floats above normal windows
      .style_mask(StyleMask::new().nonactivating_panel().full_size_content_view().borderless())
      .collection_behavior(CollectionBehavior::new().can_join_all_spaces().full_screen_auxiliary().stationary())
      .has_shadow(true)
      .build()?                                   // -> Arc<dyn Panel>
  ```
- **Show without activating:** `panel.order_front_regardless()`. **Hide:** `panel.hide()`. **Re-fetch:** `app.get_webview_panel("label")` (via `ManagerExt`). **Visibility:** `panel.is_visible()`.
- **Spelling gotcha:** builder method is `collection_behavior` (American), NOT the `set_collection_behaviour` the arch doc wrote — correct that in arch.md at finalize.
- **Known caveat to watch at verify-human (`tauri-apps/tauri#5566`):** collection-behavior over fullscreen can differ release vs dev → the installed-`.app` check is load-bearing, not ceremonial.
- **⚠️ WP3 DESIGN CONSTRAINTS (found at verify-human, 2026-06-25 — three usage gotchas, none a crate NO-GO):**
  1. **Never `.no_activate(true)`** on this single-window app — it flips the global `NSApplicationActivationPolicy` to `Prohibited` during `build()`, which HID the main Claudesk window entirely. Non-activation comes from `can_become_key_window: false` on the panel class instead.
  2. **Never `.style_mask(...)` / `set_style_mask` on an attached-WKWebView panel** — the builder applies it post-build via `setStyleMask:`, which detaches/reattaches the content view and crashes WebKit's `WKWindowVisibilityObserver` KVO teardown with `NSRangeException`. Drop it; `can_become_key_window:false` already gives non-activation. If WP3 wants borderless/transparent chrome, set it on the `WebviewWindowBuilder` BEFORE the webview attaches (via `.with_window(...)`), not after.
  3. **Panel content must be a bundled app route** (`WebviewUrl::App("pip-probe.html")`), not a `data:` URL (which rendered blank under the app CSP).
  All three are baked into the fixed probe code.
- **Bus-factor / pin:** single-maintainer, pinned to a branch (not a tag). Monitor `tauri-apps/tauri#13034` for first-party NSPanel; migrate when it lands.

**Teardown decision (pending verify-human):** if GO confirmed → keep `pip_probe/` as the WP3 seed; remove only the temporary "PiP?" button + `pip_probe_toggle` registration noise as WP3 replaces them. If NO-GO → full teardown.

## Retrospect
- **What changed in our understanding:** The probe assumed (from arch §B.3 + the WP1 research) that `tauri-nspanel`'s builder flags map cleanly to the AppKit behaviors. Reality: the **order and timing** of AppKit calls is the load-bearing part the docs gloss over. Three crash/failure modes only surfaced at live verify-human — none were visible in compile/static checks: (1) `.no_activate(true)` flips the GLOBAL activation policy and hides the main window; (2) the `NonactivatingPanel` style mask crashes (`NSRangeException`) if set on a window that transitions titled→borderless post-webview-attach; (3) closing the live panel is a use-after-free abort. Each is a *usage* gotcha, not a crate defect — exactly the kind of knowledge a probe exists to extract.
- **Assumptions that held:** the crate IS viable (GO); it compiles against Tauri 2.11.2 (not the assumed 2.9.x) with no incompatibility; no raw `objc2` fallback needed; no code-signing entitlement for local dev.
- **Assumptions that were wrong:** (a) "agent slice green ⇒ low risk" — the static slice (compile/type/lint) passed on the very first build, yet THREE live crashes followed; for AppKit-window features the static slice proves almost nothing about behavior. (b) `can_become_key_window:false` would suffice for non-activation — it does not; only the style mask does. (c) My first live root-cause ("session died → stuck Running") during the digression was WRONG — a `pgrep` filtering artifact; the operator caught it.
- **Approach delta:** The plan was a clean single build→verify pass. Actual: **four** build→verify-human back-loops (no_activate hides window → data-URL blank → setStyleMask crash → focus-still-jumps + close-crash → finally borderless+NonactivatingPanel). The turning point was stopping the incremental guessing and dispatching a focused research agent against the crate's issues (#19/#22) + the maintainer's shipping example — which gave the documented fix in one shot. Lesson reinforced: when a behavioral fix is handed back ≥2× untested, stop guessing and get grounded evidence (here: the maintainer's own working code) before the next attempt.

## Closure
**Feature complete:** M5 WP1 (the `tauri-nspanel` NSPanel-mechanics probe) shipped — verdict **GO**. `tauri-nspanel` v2.1 is confirmed viable for the M5 Picture-in-picture panel, with five hard-won WP3 must-follow constraints recorded in `docs/product/wbs.md` → "Probe outcomes". The throwaway probe (toggle a borderless floating panel via the "PiP?" button in the right-panel tab row) is kept as the WP3 seed. Requester = operator — closure notice for self-record.
