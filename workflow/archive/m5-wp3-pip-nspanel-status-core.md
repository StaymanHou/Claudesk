# Feature: M5 WP3 — PiP NSPanel + status-subscribe core (one default layout)

**Workflow:** feature
**State:** COMPLETED 2026-06-26 (shipped 95292d6)
**Created:** 2026-06-26
**drive_mode:** autopilot

## Retrospect
- **What changed in our understanding:** The PiP is a *separate webview with its own JS heap* — so the real design problem wasn't rendering, it was the **fan-out**: status was already free (the M3 backend `app.emit` broadcasts to all webviews incl. the NSPanel), but roster + serialized-mirror are main-webview-resident and had to be forwarded over Tauri events (`pip-frame`/`pip-mirror`). The cleanest "no second serialize loop" answer turned out to be a single App-level ticker + a shared `mirrorFrame` read-store that the filmstrip was refactored to consume. The WP2 MCP bridge let the agent drive the ENTIRE verify-self live (incl. `windowId:'pip'`) — no operator hand-off for the visual/DOM/interaction checks, which is new this milestone.
- **Assumptions that held:** WP1's PanelBuilder contract was reusable verbatim (zero window-mechanics debugging this WP — the probe-first sequencing paid off exactly as the WBS rationale predicted). Status broadcast reaching the PiP "for free" held. The bridge reaching the `pip` window (WP2 caveat (c)) held.
- **Assumptions that were wrong:** None major. Minor: I initially planned `mirror_html` to ride the `pip-frame` event; splitting it onto a separate `pip-mirror` (high-freq) vs `pip-frame` (low-freq roster) was a cleaner call made during build. The latest-ref pattern needed an effect (not a render-time write) per eslint react-hooks/refs.
- **Approach delta:** Matched the plan's 3-phase shape. Two off-plan touches: (1) added a backend `pip-visibility` broadcast as the cost-gate signal (not foreseen at plan time — the PiP-shown signal had to come from somewhere; the backend owns visibility); (2) caught + reverted pre-existing repo-wide prettier/cargo-fmt drift that an over-broad format sweep pulled in (logged to backlog, NOT WP3 work).

## Problem Statement

Build the real Picture-in-Picture (PiP) NSPanel — the out-of-focus status surface — on top of the WP1 probe seed (`src-tauri/src/pip_probe/` + `public/pip-probe.html` + the temp "PiP?" button), rendering **one** default layout: a horizontal mirror (filmstrip-like row), one tile per open workspace (project name + idle/running/awaiting-input dot + live ~1 fps `serializeAsHTML()` mirror). The PiP is a **separate NSPanel webview** with its own JS heap, so it cannot read the main webview's React `workspaces`/`order` state or its module-level `terminalMirror` registry — the core design problem WP3 solves is the **fan-out**: status already broadcasts to all webviews via the backend `app.emit("workspace-status")` (M3), but the **roster** (names + order) and the **serialized mirror HTML** are main-webview-resident and must be forwarded to the PiP **without running a second serialize loop** (the M4 active-CPU p95 caveat forbids it). **Roster divergence from the filmstrip is intentional:** the PiP mirrors ALL N workspaces *including* the center-staged one (no static active tile) — it's the surface you watch when Claudesk is out of focus, so the most-recent project's live state matters too. **Display-only:** clicking a PiP tile is inert (no promote, no focus steal — arch §B.3 + vision anti-goal). WP4 (4-layout switcher + persistence + auto-resize) and WP5 (toggle + lifecycle) build on this core; WP3 proves "PiP works, one layout, all N live." Build against the WP1-confirmed `PanelBuilder` contract (GO verdict) and lean on the WP2-ADOPTED MCP bridge (`mcp__tauri__*`, `windowId:'pip'`) for agent-driven verify-self.

## Work Tree

- [x] Phase 1: Real `pip` module + React/IPC-capable PiP webview entry (replace the probe scaffold)  <!-- status: done -->
  <!-- verify-codify: +9 src/pip/__tests__/pipEntryWiring.test.ts ?raw structural guards (multi-entry inputs present, pip.html→main.tsx→<Pip/> chain, pip_toggle/pip-toggle button, no pip_probe naming regression across 4 files, capability windows include 'pip'). Full suites green: 600 frontend / 66 files + 249 Rust, 0 fail. No triage. -->
  <!-- Below: leaf statuses retained for audit. -->
  **Observable outcomes:**
  - CLI: `cargo build` (in `src-tauri/`) exits 0 — the renamed `pip` module compiles; `pip_probe` no longer referenced.
  - CLI: `pnpm vite build` exits 0 — the multi-entry Vite config emits both `index.html` and `pip.html` into `dist/`; no broken imports.
  - CLI: `pnpm tsc --noEmit` + `pnpm eslint .` exit 0.
  - Browser (live, via MCP bridge): with `pnpm tauri:dev` running + `driver_session{start, port:9223}`, clicking the PiP toggle builds + shows the panel; `mcp__tauri__webview_execute_js{windowId:'pip'}` reports `typeof window.__TAURI_INTERNALS__ !== "undefined"` (the PiP page now has live IPC — NOT a static `data:`/plain HTML page) and the bridge enumerates both windows (`main`, `pip`).
  - [x] P1.1 Rename `src-tauri/src/pip_probe/` → `src-tauri/src/pip/`; strip `_probe`/THROWAWAY naming from `mod.rs` + `commands.rs` while KEEPING the verified PanelBuilder contract verbatim (born-borderless + `NonactivatingPanel` style mask, `PanelLevel::Floating`, `can_join_all_spaces`/`stationary` collection behavior, `order_front_regardless` show, `to_window()→close()` teardown). Rename the command `pip_probe_toggle` → `pip_toggle`, panel label `pip-probe` → `pip`, panel class `PipProbePanel` → `PipPanel`. Update `lib.rs` (`mod`, `invoke_handler`, `on_window_event` teardown).  <!-- status: done -->
  - [x] P1.2 Add a real PiP frontend entry: `pip.html` at project root (Vite-discovered) + `src/pip/main.tsx` mounting a `<Pip />` React root. Point the panel `WebviewUrl::App("pip.html")`. Make Vite multi-entry via `build.rollupOptions.input = { main: "index.html", pip: "pip.html" }` in `vite.config.ts`. Delete `public/pip-probe.html`.  <!-- status: done -->
  - [x] P1.3 Capability check: PiP webview (label `pip`) added to the file `default` capability `windows` AND the `tauri.dev.json` inline `mcp-bridge-dev` capability `windows` (so `core:event` listen/emit + the MCP-bridge `windowId:'pip'` driving both reach the panel). Base perms re-listed in the dev capability per the WP2 caveat. (`core:default` includes `core:event:default` → listen+emit — confirmed against acl-manifests.json.)  <!-- status: done -->
  - [x] P1.4 Replace the temp "PiP?" button wording in `RightPanelHost.tsx`: working toggle now `invoke("pip_toggle")`, copy de-temporary'd, `data-testid` → `pip-toggle`.  <!-- status: done -->
  - [x] P1.5 Doc fix (folded from backlog MINOR): `docs/product/wbs.md` "Probe outcomes → WP2" recipe step 1 wait-token corrected to `"WebSocket server listening on…"`; backlog `SURFACE-2026-06-26-QUALITY-WP2-RECIPE-WRONG-WAIT-TOKEN` marked RESOLVED.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — cargo build, cargo test --no-run, tsc, eslint (0 err), vite multi-entry (both entries), vitest 485/485 all PASS -->
  - [x] verify-self  <!-- status: done — agent-driven via MCP bridge (WP2 ADOPT). Main webview: pip-toggle button present (new testid/label/title; pip-probe-toggle gone), __TAURI_INTERNALS__ live. Clicked toggle → bridge reached windowId:'pip': location /pip.html, title "Claudesk PiP", __TAURI_INTERNALS__ TRUE (real IPC, not static — the core Phase 1 proof), <Pip /> root mounted w/ drag-region, screenshot shows dark rounded panel. Toggle round-trip (show→hide) works. -->
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1 PiP button → dark rounded floating panel "PiP", floats, non-activating, toggles off  <!-- status: done — operator APPROVED 2026-06-26 (WP1-verified contract carried forward unchanged) -->
  - [x] verify-codify  <!-- status: done — +9 pipEntryWiring ?raw guards; 600 frontend + 249 Rust pass -->>

- [x] Phase 2: PiP status surface — roster + dots, all N workspaces (no live mirror yet)  <!-- status: done -->
  <!-- verify-codify: +5 pipFrame.test.ts (pure derivation: order, no active-drop, field projection, empty, constants) + +5 pipFanoutWiring.test.ts (?raw boundary guards: App calls usePipFanout; usePipFanout emitTo+handshake; Pip listens both channels + fires pip-ready + reuses shared indicator). 610 frontend pass / 68 files, 0 fail, no triage. -->
  <!-- Below: leaf statuses retained for audit. -->
  **Observable outcomes:**
  - Browser (live, MCP bridge): with ≥1 workspace open in the main window, the PiP (`windowId:'pip'`) DOM snapshot shows one tile per open workspace — INCLUDING the center-staged one (roster divergence) — each with the project `display_name` + a `.status-dot` whose class reflects the M3 state.
  - Browser (live): driving a status transition via IPC (`mcp__tauri__ipc_emit_event` of a `workspace-status` update, or a real hook event) flips the matching PiP tile's dot class to `status-dot-running` / `status-dot-awaiting` / `status-dot-idle` — i.e. the PiP and filmstrip never disagree (same broadcast, same `statusPresentation` palette).
  - CLI: `pnpm tsc --noEmit`, `pnpm eslint .`, `pnpm vitest run` (new pure-logic test for the PiP frame/roster reducer) exit 0.
  - [x] P2.1 PiP frame wire contract — pure `src/pip/pipFrame.ts`: `PipFrame`/`PipFrameTile` DTO (ordered `{id, display_name}[]`; `mirror_html` added Phase 3), `derivePipFrame` (NO active-drop — full roster incl. center-staged), `emptyPipFrame`, the event/label constants. +5 vitest cases (pipFrame.test.ts). Status palette reused from `workspaceStatus.ts` via `WorkspaceStatusIndicator` (P2.3), not duplicated here.  <!-- status: done -->
  - [x] P2.2 Main→PiP roster fan-out — `src/pip/usePipFanout.ts` (wired in App.tsx): `emitTo("pip", "pip-frame", derivePipFrame(roster))` on roster change + a once-registered `pip-ready` listener that replies with the current frame (handshake). Roster = `tiles.map(t=>{id,display_name})`, memoized so it only re-emits on real roster change. emitTo to a non-open PiP is a harmless no-op. Fan-out documented in pipFrame.ts header.  <!-- status: done -->
  - [x] P2.3 `<Pip />` component — `listen("workspace-status")` (fold via `applyStatusUpdate`) + `listen("pip-frame")` (roster); renders the horizontal `.pip-row` of `.pip-tile`s (name + reused `WorkspaceStatusIndicator` via `stateFor`), honest "No workspaces" empty state, `unknown` default. Self-contained pip.css with the status-dot palette + keyframes COPIED verbatim from App.css (never-disagree invariant); label text hidden (dot is the signal in a narrow tile).  <!-- status: done -->
  - [x] P2.4 Initial-state handshake — PiP fires `pip-ready` on mount → usePipFanout replies with the current frame. **Decision (documented):** ROSTER uses the explicit handshake; STATUS does NOT need forwarding — it reaches the PiP via the backend's all-webview `workspace-status` broadcast. The one consequence: a freshly-mounted PiP shows `unknown` for each workspace until its NEXT status event (honest default, same as the main app on first launch) — acceptable, not blank.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc clean, eslint 0 err, vitest 605 pass (+5 pipFrame), vite multi-entry build (pip chunk bundles). Covers all changed files. -->
  - [x] verify-self  <!-- status: done — agent-driven via MCP bridge with 2 SCRATCH workspaces (ws-1 scratch-c bg, ws-3 scratch-b active). PiP (windowId:'pip') shows BOTH tiles incl. the center-staged ws-3 (roster divergence CONFIRMED), honest unknown default before events. Emitted workspace-status via ipc_emit_event: ws-1→running, ws-3→awaiting_input → PiP dots flipped to status-dot-running / status-dot-awaiting (data-state matches); filmstrip read IDENTICAL states (never-disagree invariant PASS). Screenshot: 2-tile row, orange + blue dots. -->
  - [x] verify-human  <!-- status: done -->
    - [x] P2.verify-human.1 PiP shows one tile per workspace incl. center-staged, dots track real states + match filmstrip  <!-- status: done — operator APPROVED 2026-06-26 -->
  - [x] verify-codify  <!-- status: done — +5 pipFrame + +5 pipFanoutWiring guards; 610 frontend pass -->>

- [x] Phase 3: Live ~1 fps serialize mirror (shared output, no 2nd loop) + display-only  <!-- status: done -->
  <!-- verify-codify: +9 mirrorFrameSharing.test.ts (computeMirrorSet union-once + the divergence + collapsed/hidden gate + Set dedup; mirrorFrame store round-trip/replace/null) + extended pipFanoutWiring.test.ts (Pip subscribes pip-mirror + writes .pip-tile-mirror; display-only tile is not a button; ONE serialize loop via import guard — ticker imports serializeTerminal, filmstrip imports readMirrorFrame + does NOT import serializeTerminal; cost gated on pip-visibility). 622 frontend pass / 69 files, 0 fail, no triage. -->
  <!-- Below: leaf statuses retained for audit. -->
  **Observable outcomes:**
  - Browser (live, MCP bridge): with a background workspace whose CC terminal has content, the PiP tile body (`windowId:'pip'`) shows the serialized terminal HTML (`.pip-tile-mirror` innerHTML non-empty), updating at ~1 fps — and the CENTER-STAGED workspace's PiP tile ALSO shows a live mirror (the one extra mirror the filmstrip doesn't render).
  - Browser (live): clicking a PiP tile does nothing — no center-stage change in the main window, no focus steal (panel stays non-activating). Verified via DOM snapshot of `main` before/after a `pip` tile click being identical (focusedId unchanged).
  - CLI: `pnpm tsc --noEmit`, `pnpm eslint .`, `pnpm vitest run` exit 0; no second `setInterval` serialize loop introduced (grep: exactly one `MIRROR_INTERVAL_MS` serialize ticker in the codebase, the existing Filmstrip one, now feeding both surfaces).
  - [x] P3.1 Shared serialize lift — `mirrorFrame.ts` (module-level id→html snapshot) + `useMirrorTicker.ts` (the SINGLE App-level serialize loop). The mirror rides a SEPARATE `pip-mirror` event (Record<id,html>) not `pip-frame` (so high-freq mirror ≠ low-freq roster). Filmstrip refactored to READ `readMirrorFrame(id)` instead of calling `serializeTerminal` — so `serializeTerminal` now has exactly ONE caller (useMirrorTicker). Needed set = filmstrip-background (when expanded) ∪ all-N (when PiP shown — incl. the center-staged one, the one extra mirror); serialized once into a Set. pipShown tracked via the backend `pip-visibility` broadcast (new — pip_toggle emits it). Fan-out documented in pipFrame.ts + mirrorFrame.ts + useMirrorTicker.ts headers.  <!-- status: done -->
  - [x] P3.2 `<Pip />` listens `pip-mirror` → writes each tile's HTML into `.pip-tile-mirror` (out-of-React innerHTML; last-frame ref repaints a just-mounted tile). pip.css `.pip-tile-mirror` = absolute base layer, natural-width 640px + scale(0.16) + bottom-left origin (the white-bar fix, copied from App.css), header as semi-transparent overlay.  <!-- status: done -->
  - [x] P3.3 Display-only enforced — `.pip-tile` is a plain `<div>` (NOT a button), no onClick/promote handler; header comment cites the vision anti-goal "Not PiP click-to-focus in v1".  <!-- status: done -->
  - [x] P3.4 Mirror cost gated on PiP-shown — useMirrorTicker only adds the center-stage serialize AND only emits `pip-mirror` when `pipShown` (from `pip-visibility`). Hidden PiP → no extra serialize, no emit. (Full toggle lifecycle is WP5.)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc clean, eslint 0 err, cargo build (pip-visibility emit), vitest 610 (Filmstrip serialize→readMirrorFrame refactor broke nothing), vite multi-entry. Grep guard: exactly ONE serializeTerminal() caller (useMirrorTicker) — no duplicate serialize. -->
  - [x] verify-self  <!-- status: done — agent-driven via MCP bridge, 2 SCRATCH workspaces (ws-1 scratch-a bg, ws-3 scratch-b active). After PiP toggle-on: BOTH tiles' .pip-tile-mirror innerHTML had serialized xterm HTML (~9.9KB each, <pre><div style=color:#d4d4d4...>) — INCLUDING the center-staged ws-3 (the one extra mirror the filmstrip skips). Screenshot: 2 tiles, scaled live terminal text + name/dot overlay. Display-only CONFIRMED: clicked pip-tile-ws-1 → main focusedActiveId stayed ws-3 (no promote, no focus steal). ~1fps update path structurally proven (single ticker @ MIRROR_INTERVAL_MS, content present+non-stale); real-CC live refresh carried to verify-human. -->
  - [x] verify-human  <!-- status: done -->
    - [x] P3.verify-human.1 live ~1fps mirror updates under real CC output, incl. center-staged; toggle-off stops cost; click inert  <!-- status: done — operator APPROVED 2026-06-26 -->
  - [x] verify-codify  <!-- status: done — +9 mirrorFrameSharing + extended pip mirror/display-only/single-loop guards; 622 frontend pass -->>

## Current Node
- **Path:** Feature > finalize
- **Active scope:** SHIPPED (95292d6) + code-quality review done (0 CRITICAL, 2 MAJOR + 3 MINOR all auto-backlogged per Mode 3 — 2 MAJOR carried to M5 WP5 scope, 3 MINOR to a refactor batch). Ready for finalize.
- **Blocked:** none
- **Unvisited:** finalize
- **Open discoveries:** [SURFACED-2026-06-26] prettier/cargo-fmt repo drift + brittle ?raw regex test → backlog (low), NOT WP3.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-26] ship — pre-existing prettier drift across ~21 src files (committed without prettier; a broad `prettier --write src/**` reformats them) + a brittle `?raw` regex test (fileTreeGitRollup.test.ts expects a near-single-line `useMemo(...)` that prettier multi-line-wraps). Reverted the out-of-scope reformats this WP; logged to backlog (low). NOT WP3 work.

## Code-Quality Review — m5-wp3-pip-nspanel-status-core

### Strengths
- Single-serialize-loop lift (`useMirrorTicker` as the sole `serializeTerminal` caller, `mirrorFrame` as shared read-store) is the right architecture; the filmstrip cleanly degrades to a reader.
- `computeMirrorSet` extracted pure with an exhaustive vitest matrix (expanded/collapsed × shown/hidden + Set-dedup).
- Backend owns PiP visibility via the `pip-visibility` broadcast (single source of truth), not a frontend guess.
- Probe→real promotion preserves the WP1-verified PanelBuilder contract verbatim with the full "why" carried in comments.
- Display-only enforced structurally (plain `<div>`, no handler) AND guarded by a `?raw` test — vision anti-goal defended against regression.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [Filmstrip.tsx ~199-212] The filmstrip retains its OWN `setInterval(1000)` DOM-write loop, unsynchronized with the App-level `useMirrorTicker` serialize loop (also 1000ms) — they drift in phase, so the filmstrip can read a `mirrorFrame` snapshot up to ~1s stale. "Exactly ONE serialize ticker" is true for *serialize* but there are two unsynced 1fps intervals. → AUTO-BACKLOGGED (Mode 3). WP5-scope (could push into filmstrip refs directly, as it already does for the PiP).
- [pip/commands.rs teardown / lib.rs CloseRequested] `teardown()` does NOT emit `pip-visibility false`, so `useMirrorTicker.pipShown` stays `true` after a programmatic teardown → ticker keeps serializing + emitting to a dead label. Harmless on app-close (only current path); a latent cost-gate desync the moment WP5 adds a non-toggle close path. → AUTO-BACKLOGGED (Mode 3). WP5-scope.

**MINOR**
- [Filmstrip.tsx:34] `MIRROR_INTERVAL_MS` duplicated as a literal in both Filmstrip.tsx and useMirrorTicker.ts (both 1000) — a shared exported const would keep them provably equal. → AUTO-BACKLOGGED (low).
- [useMirrorTicker.ts ~130] `pip-mirror` emits the full snapshot every tick (no per-tile diff) — correct, but worth a `// full-frame each tick — no diff; revisit if N grows` note. → AUTO-BACKLOGGED (low).
- [Pip.tsx + usePipFanout + useMirrorTicker] The `listen(...).then(...)` + `cancelled`/`unlisten` boilerplate is copy-pasted 5×; a `useTauriListen` helper would remove the repeated async-unlisten footgun. → AUTO-BACKLOGGED (low).

### Assessment
Well-built; advances the codebase more than it accrues debt. The hard part (fanning roster + mirror across a separate-heap NSPanel webview without a second serialize loop) is solved with a clean pure-core/wiring split matching the repo posture. Vision invariants enforced structurally + test-guarded. The 2 MAJOR findings are NOT bugs at the shipped baseline (both benign on WP3's only lifecycle path) but are latent desyncs the WP5 lifecycle work will trip over — carried into WP5 scope, not a standalone refactor.

### If you disagree
Dismiss any finding by editing this section + marking the line `[DISMISSED]` before finalize archives the WIP.

## Design notes (carried into build)

- **Status fan-out is already solved by M3:** the backend `app.emit("workspace-status", …)` broadcasts to ALL webviews (main + the `pip` NSPanel). The PiP `listen`s the same channel — no new status source, no PTY scraping. (Confirmed: `status_broadcaster::commands` uses `app.emit`, which is the all-webview broadcast.)
- **Roster + mirror fan-out is the new work:** `workspaces`/`order`/`terminalMirror` live in the MAIN webview's JS heap; the PiP can't read them. The main webview forwards a `pip-frame` (roster in Phase 2, +mirror_html in Phase 3) to the `pip` webview. This is the "share the serialize output rather than a second loop" the WBS mandates.
- **Roster divergence is intentional (do NOT match the filmstrip):** PiP includes the center-staged workspace as a live tile; the filmstrip makes it a static active marker. Rationale: PiP is the out-of-focus surface — the center-staged project is just-as-invisible there.
- **Reuse, don't re-derive:** `WireWorkspaceState`, `statusPresentation`, `WorkspaceStatusIndicator`, `applyStatusUpdate`, `stateFor` are all reused verbatim so PiP + filmstrip share one palette and never disagree (the M3 invariant + a WP3 explicit task).
- **WP1 PanelBuilder contract is verified, not assumed** — keep it byte-for-byte (born-borderless → `NonactivatingPanel` style mask; NO `.no_activate(true)`; `to_window()→close()` teardown only). See `pip_probe/commands.rs` header for the full why; the rename must not alter the calls.
- **Agent-driven verify-self via the MCP bridge (WP2 ADOPT):** drive `mcp__tauri__*` directly (NOT the Playwright `feature-verify-self-runner`); `windowId:'pip'` reaches the panel webview. DOM-read / JS-exec / click / screenshot are high-fidelity; xterm raw typing is low-fidelity (trigger status transitions via IPC, not by typing into CC). Installed-`.app` + `pgrep`-class outcomes stay operator-only → carried to WP6.
