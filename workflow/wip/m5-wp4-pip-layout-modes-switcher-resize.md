# Feature: M5 WP4 — PiP layout modes + persisted switcher + auto-resize

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-26
**drive_mode:** autopilot

## Problem Statement

WP3 shipped the real PiP NSPanel rendering exactly ONE layout (horizontal mirror — a
live-thumbnail row), subscribed to the M3 `workspace-status` broadcast + the main-webview
`pip-frame` roster + `pip-mirror` serialize fan-out. WP4 generalizes that proven render
core to **four** layouts (horizontal mirror → vertical mirror → compact name+dot →
minimal dots), adds an on-panel control to switch among them, persists the chosen layout
across toggles + launches keyed per bundle-identity isolation, and auto-resizes the
NSPanel to each layout's natural dimensions on switch. The minimal layout is NOT merely
the smallest mirror — it's the operator's "is anyone waiting on me?" glance for the
all-instances-busy case: it must **weight attention** so awaiting-input dots pop against a
calm row of running dots, not render N equal-weight dots. No new backend status source
(reuses the M3 channel); no click-to-promote (display-only stays — vision anti-goal). The
switcher/persistence/resize all wrap WP3's render core rather than being designed
speculatively. WP3's 2 MAJOR code-quality findings (filmstrip 2nd-interval; teardown
visibility-broadcast) are formally WP5 (lifecycle) scope — noted here, fixed there, unless
a phase below naturally touches that code.

**[F12 back-loop 2026-06-26 — problem statement unchanged]** Phase 1 still aims to render
all 4 layouts correctly. We learned the WP3 mirror geometry (width:640px; scale(0.16);
absolute bottom-left) is tuned for horizontal-mirror's tile proportions and renders an
invisible/clipped mirror in a vertical-mirror tile (248×64). Fix = layout-aware mirror
geometry — a render refinement within existing Phase-1 scope, not a shifted root cause.

**[F12 back-loop 2026-06-26 — Phase 2 problem statement unchanged]** Phase 2 still aims to
give a usable on-panel layout switcher + persistence. Function is correct (cycle/persist/
read-back all verified). We learned the switcher's PRESENTATION is wrong: absolute top-right
corner overlaps the tile status dot; the subtle generic ⋮ is not discoverable. Fix = own row
(no overlap, visible) + a per-layout icon depicting the CURRENT layout. A presentation change,
not a logic change — root cause unshifted.

**[F12 back-loop 2026-06-26 — Phase 3 problem statement unchanged]** Phase 3 still aims to
auto-resize the panel per layout. We learned the SIZING MODEL was wrong: a STATIC per-layout
size table crammed N workspaces into a fixed box. Corrected model: panel size = f(layout, N)
— content-driven. Tile unit = the main-app filmstrip tile (112×64 + 8px gap + 10px pad,
App.css). Panel grows along the flow axis (width for horizontal/grid, height for vertical/
compact/minimal) as unit×N; capped at ~90% of the screen edge, beyond which content WRAPS to
a 2nd row/column (grid-wrap, not scroll). A sizing-model refinement within Phase-3 scope, not
a shifted root cause.

## Architecture notes (decisions baked into the plan)

- **`pip_layout` persists in a NEW Rust-backed app-settings store, NOT localStorage.** The
  filmstrip's order/collapse persist via localStorage (`filmstripOrder.ts`), but the PiP is
  a SEPARATE webview heap — localStorage is per-origin-per-webview and would NOT be shared
  between the main webview (where the switcher likely also surfaces) and the PiP webview.
  The WBS says "keyed per the bundle-identity isolation, like `default_drive_mode`" → that
  means the app-data dir (which IS already bundle-identity-isolated: `com.claudesk.app` vs
  `.dev`). So add a thin `settings.json` app-settings store in `config_store/` (sibling to
  `projects.json`, same atomic write-then-rename + never-wipe-on-parse-fail discipline).
  `pip_layout` is **app-global chrome**, NOT per-project, so it's a top-level settings field,
  NOT a `Project` field (unlike `default_drive_mode` which is genuinely per-project).
- **Layout is the single source of truth in the BACKEND** (where the resize lives) and
  broadcast to the PiP webview, mirroring the `pip-visibility` pattern. The switcher calls a
  `pip_set_layout` command → backend persists + resizes the panel + emits a `pip-layout`
  event (all webviews) → the PiP re-renders in the new layout. On PiP mount, the PiP reads
  the persisted layout (via the same handshake path as `pip-ready`/`pip-frame`, or a direct
  `pip_get_layout` query). This keeps resize (backend) + render (frontend) reading ONE value.
- **Pure layout logic is vitest-pinned; render/resize/IPC is verify-self (bridge).** The
  layout enum, the per-layout "needs mirror?" predicate, the per-layout panel dimensions
  table, and the minimal-layout attention-ordering/weighting are all pure functions
  (vitest). The actual NSPanel reshape + the live multi-layout render are driven live via the
  MCP `tauri` bridge against scratch workspaces (WP2 ADOPT verdict — `windowId:'pip'` reaches
  the panel). Installed-`.app` parity → carried to WP6 (milestone-exit), per the standing
  convention.
- **Compact + minimal layouts STOP the serialize cost for the PiP** (no mirrors rendered) —
  same "stop the loop when not showing thumbnails" discipline as filmstrip-collapse. The
  `useMirrorTicker` `pipShown`-driven center-stage serialize must become layout-aware:
  serialize-for-PiP only when the active layout is a MIRROR layout (horizontal/vertical).
  This means the main webview must also know the active layout → it listens to `pip-layout`.

## Work Tree

- [x] Phase 1: Layout core + all 4 layouts (render only, no switcher yet)  <!-- status: done; all impl + verify loop complete 2026-06-26 -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/pip` exits 0 — new `pipLayout.ts` pure tests pass (the
    layout enum, `layoutNeedsMirror(layout)` predicate, and per-layout tile-shape selection).
  - CLI: `pnpm tsc --noEmit` exits 0; `pnpm vite build` exits 0 (PiP multi-entry still builds).
  - Browser (PiP webview, via `mcp__tauri__webview_*{windowId:'pip'}`): with ≥2 scratch
    workspaces open + PiP shown, forcing each of the 4 layout values (temporarily via a dev
    seam or `pip-layout` emit) renders the matching DOM: horizontal mirror = `.pip-tiles` row
    with `.pip-tile-mirror` nodes; vertical mirror = stacked tiles each with a mirror node;
    compact = stacked tiles with name+dot and NO `.pip-tile-mirror`; minimal = dots only, no
    names, no mirror. `webview_screenshot{windowId:'pip'}` visually confirms each.
  - Console (PiP webview): no JS errors on layout change.
  - [x] P1.1 Add `src/pip/pipLayout.ts` — the `PipLayout` enum (`horizontal-mirror`,
        `vertical-mirror`, `compact`, `minimal`), `DEFAULT_PIP_LAYOUT = horizontal-mirror`,
        `layoutNeedsMirror(l): boolean` (true only for the two mirror layouts), and the
        `PIP_LAYOUT_EVENT = "pip-layout"` constant. Pure module (no React/IPC), vitest-pinned.
        ALSO added `PIP_LAYOUT_CYCLE`, `nextLayout` (for the Phase-2 switcher), `coercePipLayout`
        (honest fall-back on stale/corrupt values). 16 vitest assertions in pipLayout.test.ts.  <!-- status: done -->
  - [x] P1.2 Refactor `Pip.tsx` to render by layout: `layout` state seeded to the default,
        driven by the `pip-layout` listener (backend = source of truth). Extracted a `PipTile`
        sub-component that branches on layout: mirror layouts (horizontal/vertical) render the
        WP3 mirror+header structure; compact = name+dot row (no mirror node registered → no
        paint target); minimal = bare dot (Phase-4 attention-weighting deferred). Container
        renamed `.pip-row`→`.pip-tiles`; layout selected via `.pip-layout-<x>` + `data-layout`
        on the root. DISPLAY-ONLY preserved (plain divs, no onClick) in all layouts.  <!-- status: done -->
  - [x] P1.3 Extend `pip.css`: `.pip-tiles` row/column flow per `data-layout` class; compact
        row + minimal dot tile rules. Self-contained, dark-only.  <!-- status: done -->
  - [x] P1.4 `useMirrorTicker` layout-aware: subscribes to `pip-layout`, computes
        `pipNeedsMirror = pipShown && layoutNeedsMirror(layout)`; the PiP center-stage serialize
        + `pip-mirror` emit fire only when true (compact/minimal pay nothing even while shown).
        `computeMirrorSet`'s 4th arg renamed `pipShown`→`pipNeedsMirror` (folds the layout
        decision); mirrorFrameSharing.test.ts updated + a new visible-but-non-mirror case added.
        No App.tsx signature change — the layout awareness is self-contained in the hook.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; vitest 42✓, tsc 0, eslint 0, vite build ✓ (2026-06-26) -->
  - [x] verify-self  <!-- status: done; agent-driven LIVE via MCP bridge windowId:'pip' against 2 scratch workspaces (2026-06-26). All 4 layouts forced via pip-layout emit: horizontal=row+2 mirror nodes; vertical=column+2 mirror nodes; compact=column+0 mirror nodes+2 compact tiles; minimal=0 mirror+0 names+2 dots+title tooltips. 0 JS errors across full cycle; screenshots confirm horizontal-mirror (WP3 layout intact) + minimal. Integration boundary (PiP webview) satisfied — outcome cites windowId:'pip'. NOTE: verify-self confirmed node EXISTENCE + feed; the verify-human visual pass caught a render-geometry bug the DOM checks missed (P1.vh.2) — codify a geometry assertion. -->
  - [x] verify-human  <!-- status: done; all 4 layout-visual leaves PASS (operator, 2026-06-26). Resizing (Phase 3) + minimal attention-weighting (Phase 4) confirmed out-of-scope for Phase 1. -->
    - [x] P1.verify-human.1 — horizontal-mirror visual: tiles side-by-side, name+dot over live mirror, readable  <!-- status: done; operator PASS 2026-06-26 -->
    - [x] P1.verify-human.2 — vertical-mirror visual: stacked tiles, mirrors legible  <!-- status: done; FIXED via F12 back-loop 2026-06-26 + operator re-confirm. Root cause was NOT width (width-fill isn't the legibility lever — horizontal's mirror doesn't fill its tile width either); it was tile HEIGHT: vertical tiles were only ~64px at the un-resized panel vs horizontal's ~98px, so the bottom-anchored content landed off the visible band. Fix: vertical-mirror tiles get min-height:96px + flex:0 0 auto + the column scrolls (overflow-y:auto), keeping the SHARED 0.16 scale (row density). Re-verified live via bridge: 13/17 content rows visible per tile (vs horizontal's 14/17), mirror content shown in screenshot, 0 JS errors. -->
    - [x] P1.verify-human.3 — compact visual: name+dot rows, no thumbnails  <!-- status: done; operator PASS 2026-06-26 (2 clean name+dot rows, no mirror) -->
    - [x] P1.verify-human.4 — minimal visual: dots only, hover→name  <!-- status: done; operator PASS 2026-06-26 (2 dots, 0 names, title tooltips resolve to project). Attention-weighting deferred to Phase 4 as planned. -->
  - [x] verify-codify  <!-- status: done; +pipLayout.test.ts (16) + mirrorFrameSharing non-mirror case + 4 WP4 wiring guards in pipFanoutWiring; full suite 637 pass / 70 files, no regressions (2026-06-26) -->

- [x] Phase 2: On-panel switcher + persisted layout (Rust app-settings store)  <!-- status: done; all impl (P2.1–P2.5) + verify loop complete 2026-06-26 (incl. 1 F12 switcher-UX back-loop) -->
  **Observable outcomes:**
  - CLI: `cargo test` exits 0 — new app-settings store tests pass (round-trip
    `pip_layout`, missing-file default, malformed-file-is-error-not-wipe, atomic write).
  - CLI: `pnpm vitest run src/pip` + `pnpm tsc --noEmit` + `pnpm vite build` exit 0.
  - Browser (PiP webview, bridge): a small corner control (`[⋮]` or cycle button) is present
    in the panel; `webview_interact{click, windowId:'pip'}` on it cycles the layout (DOM
    changes to the next layout's structure each click, wrapping after the 4th).
  - CLI: after a switch, `~/Library/Application Support/com.claudesk.app.dev/settings.json`
    contains `"pip_layout": "<chosen>"` (the dev identity, since verify-self runs under
    `tauri:dev`); `cat` it to confirm.
  - Browser (PiP webview): closing + reopening the PiP (toggle off/on) re-renders in the
    persisted layout, not the default (proves read-back on mount).
  - [x] P2.1 Add the app-settings store: NEW `config_store/settings.rs` (`AppSettings {
        pip_layout: Option<PipLayout> }`, forward-stable; `read_settings`/`write_settings`/
        `read_pip_layout`/`write_pip_layout` against injected `data_dir`; atomic tmp→rename,
        missing=defaults, malformed=error-not-wipe — mirrors projects.json + 6 tests). NEW
        `pip/layout.rs` `PipLayout` enum (serde kebab-case, mirrors TS pipLayout.ts) + 3
        tests. 258 Rust tests pass (+9).  <!-- status: done -->
  - [x] P2.2 Commands `pip_get_layout() -> PipLayout` (read persisted, default if absent) +
        `pip_set_layout(layout)` (persist via write_pip_layout + emit PIP_LAYOUT_EVENT to all
        webviews; resize deferred to Phase 3). Both registered in lib.rs invoke_handler.
        module-local resolve_data_dir mirrors config_store's private one.  <!-- status: done -->
  - [x] P2.3 PiP-side switcher: a `⋮` corner button (`pip-layout-switch`, data-tauri-drag-
        region=false so a click cycles not drags) calls `invoke("pip_set_layout",
        {layout: nextLayout(current)})`. The PiP's `layout` state is driven by the pip-layout
        listener (backend = source of truth), NOT set optimistically. On mount, `pip_get_layout`
        seeds the persisted layout (coerced). CSS added (subtle until hover, z-index above
        tiles+header).  <!-- status: done -->
  - [x] P2.4 Main webview pip-layout listen — SATISFIED by Phase-1's useMirrorTicker self-
        subscribe (P1.4) + Phase-2's pip_set_layout emit now carrying the real value; no
        App.tsx change needed (ticker is self-contained).  <!-- status: done -->
  - [x] P2.5 (F12 back-loop) Switcher UX rework — moved the switcher from an absolute top-right
        corner overlay to its OWN ROW (`.pip-switch-row` at the top of the column-flex root),
        resolving the dot-overlap + visibility. Added a per-layout `LayoutIcon` (SVG) DEPICTING
        the CURRENT layout: horizontal→2 tall rects, vertical→2 flat rects, compact→3 lines
        (hamburger), minimal→3 dots. Live-confirmed via bridge: row above tiles, no dot overlap,
        icon swaps per layout (rect×2 / rect×2 / rect×3 / circle×3).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done (re-confirmed after P2.5 switcher rework); pip vitest 37✓, tsc 0, eslint 0, vite build ✓. Rust unchanged by P2.5 (cargo settings 6✓ + layout 3✓ still valid). (2026-06-26) -->
  - [x] verify-self  <!-- status: done; agent-driven LIVE via MCP bridge windowId:'pip' (2026-06-26). PRE-P2.5: switcher cycles+WRAPS all 4, persistence to settings.json {"pip_layout":"minimal"}, read-back-on-mount via pip_get_layout. POST-P2.5 (switcher rework): switcher in its OWN ROW above the tiles (rowAboveTiles true), NO dot overlap (overlapsDot false), per-layout icon swaps correctly (horizontal=2 rects / vertical=2 rects / compact=3 rects / minimal=3 circles). Integration boundary (PiP webview + pip_get/set_layout IPC) satisfied. -->
  - [x] verify-human  <!-- status: done; operator APPROVED P2.vh.1 after the P2.5 switcher rework (2026-06-26). -->
    - [x] P2.verify-human.1 — switcher discoverable + non-overlapping + per-layout icon  <!-- status: done; operator APPROVED 2026-06-26 after fix P2.5 (own row + per-layout icon). All 3 original UX issues resolved: visible (own row), no dot overlap, per-layout icon depicting current layout. -->
  - [x] verify-codify  <!-- status: done; +3 switcher/persistence wiring guards in pipFanoutWiring (the persist/read-back round-trip is covered by the Rust store + layout-enum tests). Full suites: frontend 640 pass / 70 files, Rust 258 pass; no regressions (2026-06-26). -->

- [x] Phase 3: Per-layout NSPanel auto-resize  <!-- status: done 2026-06-26; content-driven rebuild (P3.5) shipped through full verify loop (auto→self→human→codify). -->

  **Observable outcomes:**
  - CLI: `cargo test` exits 0 — a pure `panel_size_for(layout) -> (w, h)` dimensions-table
    test passes (wide+short horizontal; narrow+tall vertical/compact; tiny minimal).
  - Browser (PiP webview, bridge): `mcp__tauri__manage_window` / `webview_screenshot
    {windowId:'pip'}` before vs after a layout switch shows the panel reshaped to the new
    layout's dimensions (horizontal wide+short → minimal tiny, etc.). Read panel bounds via
    the bridge to confirm w/h changed.
  - Console: no errors; the panel stays non-activating + floating after resize (no focus
    steal — confirm Claudesk main window stays key).
  - [~] P3.1 (SUPERSEDED by P3.5) Static `PipLayout::panel_size()` table — REMOVED at the F12
        rebuild; the static model was rejected. The enum no longer carries dimensions.  <!-- status: superseded -->
  - [~] P3.2 (SUPERSEDED by P3.5) `resize_panel_for(layout)` static resize — REMOVED.  <!-- status: superseded -->
  - [x] P3.5 (F12 rebuild — content-driven sizing) NEW `src/pip/pipPanelSize.ts`:
        `computePanelSize(layout, count, screen)` (pure, vitest-pinned, 9 tests) — fixed tile
        unit (mirror=112×64 matching App.css .filmstrip-tile; compact-row + minimal-dot units)
        × N along the flow axis (row: horizontal/minimal grow width; column: vertical/compact
        grow height), capped at 90% screen → WRAP to a 2nd row/col. Backend: removed
        `PipLayout::panel_size`; `pip_set_layout` no longer resizes; NEW `pip_resize(w,h)`
        command applies a webview-computed size via `panel.set_content_size`. Pip.tsx: a
        `useEffect([layout, tileCount])` computes via computePanelSize(window.screen.avail*) +
        invokes pip_resize; `.pip-tiles` now `flex-wrap:wrap` with fixed-size (flex:0 0 auto)
        112×64 mirror tiles (both mirror layouts share the unit; stale vertical scale/min-height
        overrides removed). `pip_toggle` builds at a small placeholder (220×130); the PiP
        resizes itself on mount.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done (re-run for the F12 rebuild); pip vitest 49✓ (+9 pipPanelSize), tsc 0, eslint 0, vite build ✓; cargo 258✓ (panel_size test removed), clippy -D warnings clean (2026-06-26). -->
  - [x] verify-self  <!-- status: done; agent-driven LIVE via MCP bridge on a RESTARTED dev app, content-driven model (2026-06-26). SIZE-REACTS-TO-COUNT: horizontal-mirror 1 workspace = 132×106 → 2 workspaces = 252×106 (widened by exactly 1 tile+gap; height unchanged). SIZE-REACTS-TO-LAYOUT: same 2 workspaces, horizontal 252×106 (wide) vs vertical 132×178 (narrow+tall). Fixed 112-wide tiles (filmstrip unit), panel sized to fit exactly — no cramming. flex-wrap:wrap active (cap+wrap math vitest-pinned; live wrap needs many workspaces). 0 errors. CARRIED to verify-human: no-focus-steal real-click check (operator-only) + visual re-confirm of the new sizing model. -->
  - [x] verify-human  <!-- status: done; operator APPROVED P3.vh.1 (content-driven rebuild P3.5) 2026-06-26. -->
    - [x] P3.verify-human.1 — resize reacts to layout AND workspace count; no focus steal  <!-- status: done; operator APPROVED 2026-06-26 (content-driven rebuild P3.5 + the two width-polish fixes). Sizing reacts to both layout + workspace count, no focus steal on real switcher click. -->
  - [x] verify-codify  <!-- status: done 2026-06-26; pure size math fully pinned by pipPanelSize.test.ts (9) + 3 NEW Phase-3 resize-wiring guards in pipFanoutWiring (computePanelSize→pip_resize wire; reacts to [layout, tileCount]; live-screen cap). Backend pip_resize is a live-panel AppKit wrapper → bridge-verified, not unit-testable. Full suite 652 pass / 71 files, tsc 0, eslint 0; no regressions. -->

- [x] Phase 4: Minimal-layout attention weighting ("is anyone waiting on me?")  <!-- status: done 2026-06-26; shipped through full verify loop (auto→self→human→codify). -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/pip` exits 0 — `orderForAttention(tiles, statusMap)` pure test:
    awaiting-input workspaces sort first; ties keep persisted order; all-running keeps order.
  - Browser (PiP webview, bridge): in minimal layout with a mix of statuses driven via IPC
    (`mcp__tauri__ipc_emit_event` / hook → some Running, ≥1 AwaitingInput on scratch
    workspaces), the AwaitingInput dot(s) are visually dominant (larger / brighter / pulsing —
    the chosen weighting) and ordered first; `webview_screenshot{windowId:'pip'}` confirms
    "all busy reads quiet, needs-me reads loud". A bare dot hover shows the project name
    (`title`/tooltip) — `webview_dom_snapshot` confirms each dot carries the name.
  - Console: no errors as statuses change.
  - [x] P4.1 `orderForAttention(tiles, statusMap)` pure helper (pipLayout.ts): stable-
        partition awaiting-input first, otherwise preserving persisted filmstrip order, so
        "needs me" rises to the front. Plus `isAwaitingInput(map, id)` predicate +
        `AWAITING_INPUT_STATE` wire-literal pin. Vitest-pinned (+11 assertions: predicate
        true-only-for-awaiting/absent/contract-pin; order awaiting-first/stable/all-running-
        untouched/no-mutate/empty).  <!-- status: done -->
  - [x] P4.2 Minimal-layout weighting in `Pip.tsx` + `pip.css`: AwaitingInput dots stand out
        via (1) ORDERING (awaiting-first) + (2) the inherited BLINK + a subtle brighter glow.
        [REFINED 2026-06-26 operator feedback: dropped the dot scale(1.55) — with several dots
        blinking the size change read "off"; the blink alone is enough. `.pip-tile-awaiting`
        now adds glow only, no transform/padding.] COLOR unchanged (shared M3 palette via
        WorkspaceStatusIndicator → never disagrees with filmstrip; only EMPHASIS differs).
        `orderForAttention(frame.tiles, statusMap)` applied to the minimal-layout tile order
        only (other layouts keep persisted order). M6 menu-bar aggregate coherence noted in
        the CSS comment, not built.  <!-- status: done -->
  - [x] P4.3 Per-dot hover tooltip — `title={tile.display_name}` is already on the minimal
        tile (P1.2), so a bare dot resolves to its project on hover. Confirmed present; no
        change needed beyond keeping it on the awaiting-weighted tile.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done 2026-06-26; scoped: eslint (pipLayout.ts/Pip.tsx/test) 0, vite build ✓ (PiP multi-entry intact), pip vitest 60✓, tsc 0. -->
  - [x] verify-self  <!-- status: done; agent-driven LIVE via MCP bridge windowId:'pip' on a fresh dev app, 2 scratch workspaces (ws-1 scratch-a, ws-3 scratch-b) (2026-06-26). MINIMAL LAYOUT (forced via pip-layout emit): mixed status ws-1=running + ws-3=awaiting_input → (1) ORDERING: ws-3 (awaiting) renders BEFORE ws-1 (running) in the DOM despite persisted order ws-1,ws-3 — orderForAttention working; (2) POP: ws-3 has .pip-tile-awaiting + dot transform scale(1.55) + brighter glow, ws-1 running dot ~1.0 (calm); (3) NEVER-DISAGREE: ws-3 dot = status-dot-awaiting (shared M3 blue), ws-1 = status-dot-running — palette unchanged, only emphasis differs; (4) DOTS-ONLY: both tiles hasName=false, hasMirror=false; (5) TOOLTIP (P4.3): title="scratch-b"/"scratch-a" resolve to project. ALL-RUNNING control (ws-3→running): NO .pip-tile-awaiting on either, order restored to persisted (no false POP, no scramble). 0 JS errors. Screenshot confirms "all busy reads quiet, needs-me reads loud" (big bright blue dot first, small calm orange dot second). Integration boundary (PiP webview) satisfied — outcome cites windowId:'pip'. -->
  - [x] verify-human  <!-- status: done; operator APPROVED both leaves 2026-06-26 -->
    - [x] P4.verify-human.1 — minimal-layout attention glance: awaiting-input dot POPs (bigger+brighter) against calm running/idle dots, AND sorts to the front  <!-- status: done; operator PASS 2026-06-26 -->
    - [x] P4.verify-human.2 — switcher real-click no-focus-steal (operator-only; bridge can't fake): cycle to minimal with the MAIN window focused → Claudesk stays the active app  <!-- status: done; operator PASS 2026-06-26 -->
  - [x] verify-codify  <!-- status: done 2026-06-26; pure ordering/predicate fully pinned by pipLayout.test.ts (+8 orderForAttention/isAwaitingInput) + 3 NEW Phase-4 attention-weighting WIRING guards in pipFanoutWiring (orderForAttention applied to minimal-only; .pip-tile-awaiting POP class via isAwaitingInput; minimal dot keeps title tooltip). Integration boundary (Pip.tsx) satisfied via the minimal-only wiring guard + bridge verify-self. Full suite 663 pass / 71 files, tsc 0; no regressions. -->

- [x] Phase 5: Cross-layout invariant verify + panel drag fix + toggle-icon polish + mirror-while-hidden fix  <!-- status: done 2026-06-26; shipped through the full verify loop (auto→self→human→codify, with auto+self re-run after the post-checklist rebuilds). SCOPE EXPANDED 2026-06-26 by operator requests surfaced at Phase 5: (a) PiP undraggable → pip_move; (b) "PiP" text button → PipIcon; (c) minimal dot-size "off" → blink-only; (d) PiP mirror froze while main backgrounded → gate fix. -->
  **Observable outcomes:**
  - Browser (PiP webview, bridge): cycling through ALL 4 layouts with ≥2 scratch workspaces
    open, the M3 status palette + the "PiP never disagrees with the filmstrip on a
    workspace's state" invariant holds in every layout (same dot color for the same workspace
    in the PiP and the filmstrip at the same instant). Drive a status transition via IPC and
    confirm both surfaces update together. `webview_screenshot` of PiP + main for each layout.
  - Browser (PiP webview, operator): dragging the panel by its body MOVES it (was inert —
    `data-tauri-drag-region` doesn't work on a NonactivatingPanel; fixed via manual
    startDragging on mousedown). Operator-only — synthetic drag can't complete a native drag.
  - Browser (main webview, bridge): the right-panel `pip-toggle` button shows a Picture-in-
    Picture SVG icon (outer rect + nested mini-player rect), NOT the "PiP" text.
  - CLI: full `pnpm vitest run` + `cargo test` + `pnpm tsc --noEmit` + `pnpm vite build` +
    `cargo clippy -- -D warnings` all exit 0.
  - [x] P5.1 Confirm the palette/agreement invariant across all 4 layouts (the WBS final
        task) — driven live via the bridge against scratch workspaces; document the check.
        DOCUMENTED as a structural codify guard in pipFanoutWiring.test.ts ("cross-layout
        never-disagree invariant"): the dot state derives from stateFor ONCE per tile + every
        layout branch renders the shared WorkspaceStatusIndicator (no hand-rolled status-dot),
        so no layout can diverge. Live all-4-layout sweep carried to verify-self.  <!-- status: done -->
  - [x] P5.2 (operator-surfaced) PiP panel drag fix — REBUILT after two dead ends:
        (DEAD END 1) `data-tauri-drag-region` / `startDragging` / `setPosition` are ALL inert
        on the swizzled borderless NonactivatingPanel (confirmed via bridge: setPosition no-op,
        panel stayed put). (DEAD END 2) Dropping `.borderless()` to match the maintainer's
        draggable example (→ `nonactivating_panel().resizable()`) CRASHED with the WP1
        setStyleMask: NSRangeException (PanelBuilder::build → set_style_mask; app exited).
        Reverted to the crash-free `.borderless().nonactivating_panel()`. FINAL FIX: a Rust
        `pip_move(dx,dy)` command moving the panel via AppKit `setFrameOrigin:` (raw msg_send
        on `panel.as_panel()`, same path as `set_content_size`; y inverted for bottom-left
        origin), driven by a JS pointer-delta tracker in Pip.tsx (`startPanelDrag`: mousedown→
        window mousemove→pip_move per-frame delta→mouseup; skips the switcher button).
        BRIDGE-VERIFIED: pip_move moves the panel exactly (850,260)→+150,+100→(1000,360)→
        -100,-50→(900,310), both axes correct. No crash on toggle (borderless restored).
        Actual drag GESTURE feel is operator-only (verify-human).  <!-- status: done -->
  - [x] P5.3 (operator-surfaced) Toggle-icon polish: replaced the "PiP" TEXT in the right-
        panel toggle button (RightPanelHost.tsx) with a NEW `PipIcon` (src/pip/icons/PipIcon.tsx)
        — the standard Picture-in-Picture glyph (outer rounded rect + nested filled mini-player
        rect), `currentColor`, matching the sibling FinderIcon/SublimeIcon component shape.
        Bridge-confirmed: button now renders the SVG (2 rects), no "PiP" text.  <!-- status: done -->
  - [x] P5.4 (operator-surfaced) PiP mirror froze while the main window is backgrounded —
        ROOT CAUSE: `useMirrorTicker`'s tick bailed on `if (document.hidden) return` (the M5
        WP3 cost gate), which froze BOTH the filmstrip AND the PiP serialize whenever the main
        window lost focus/visibility. But the PiP is a separate always-on-top panel whose WHOLE
        PURPOSE is the out-of-focus glance — gating its mirror on the main window's visibility
        froze the thumbnails exactly when the operator looks at them. (Previously mis-filed as a
        transient NON-ISSUE-2026-06-26; the operator hit it in normal use → it's real.) FIX:
        gate becomes `if (document.hidden && !pipNeedsMirror) return` — the filmstrip (inside
        the main window) still skips when hidden, but a mirror-needing PiP keeps ticking +
        emitting while Claudesk is backgrounded (the PiP already requires ALL ids, so no extra
        cost). BRIDGE-VERIFIED: with main `document.hidden=true` + PiP shown on horizontal-mirror,
        the PiP mirror node went 0 → 10003 chars of live serialized HTML; screenshot shows the
        live terminal thumbnail. mirrorFrameSharing tests still 9✓ (pure computeMirrorSet
        unchanged; the gate is in the imperative tick).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done 2026-06-26; RE-RAN after the P5.2 drag rebuild (pip_move + Rust/lib.rs) + P5.4 mirror gate + P4.2 dot-size refinement: full frontend suite 665 pass / 71 files, eslint (useMirrorTicker/Pip.tsx/PipIcon/RightPanelHost) 0, tsc 0, vite build ✓, cargo check 0 + cargo clippy 0 (post-pip_move). -->
  - [x] verify-auto (initial)  <!-- status: superseded by the re-run above; was: eslint 0, vite ✓, pip vitest 65✓, tsc 0 for the pre-rebuild P5 build. -->
  - [x] verify-self  <!-- status: done; RE-RAN for the rebuilt code, agent-driven LIVE via MCP bridge (2026-06-26). P5.1 CROSS-LAYOUT NEVER-DISAGREE: swept ALL 4 layouts with ws-1=running + ws-3=awaiting_input — PiP dot class == filmstrip dot class in EVERY layout; LIVE TRANSITION ws-1 running→awaiting_input flipped both surfaces together. P5.2 DRAG (rebuilt to pip_move): bridge-verified pip_move moves the panel EXACTLY (850,260)→+150,+100→(1000,360)→-100,-50→(900,310), both axes; NO crash on toggle (borderless config restored after the .resizable() crash). P5.3 ICON: pip-toggle renders PipIcon SVG, no "PiP" text. P5.4 MIRROR-WHILE-HIDDEN: with main document.hidden=true + PiP shown on horizontal-mirror, the mirror node went 0→10003 chars live HTML (screenshot shows live terminal thumbnail) — the freeze is fixed. P4.2 DOT-SIZE refinement: awaiting dot transform=none (no scale), glow-only. 0 JS errors throughout. Integration boundary (pip-toggle main webview + PiP webview) satisfied. Drag GESTURE feel + no-focus-steal were operator-confirmed at verify-human. -->
  - [x] verify-human  <!-- status: done; operator APPROVED all 5 leaves 2026-06-26 -->
    - [x] P5.verify-human.1 — DRAG: grab the PiP panel by its body and move it → the panel follows the cursor (was inert)  <!-- status: done; operator PASS 2026-06-26 -->
    - [x] P5.verify-human.2 — DRAG no-focus-steal: while dragging the PiP, the main Claudesk window stays the active app (PiP doesn't steal focus)  <!-- status: done; operator PASS 2026-06-26 -->
    - [x] P5.verify-human.3 — minimal POP refined: with multiple awaiting dots, the blink (no size change) reads clean, not "off"  <!-- status: done; operator PASS 2026-06-26 -->
    - [x] P5.verify-human.4 — toggle icon: the right-panel PiP toggle shows the PiP glyph (not "PiP" text), legible at tab size  <!-- status: done; operator PASS 2026-06-26 -->
    - [x] P5.verify-human.5 — mirror-while-backgrounded: with the PiP on a mirror layout, click away from Claudesk (so the main window is backgrounded) → the PiP thumbnails KEEP updating (~1fps), they don't freeze  <!-- status: done; operator PASS 2026-06-26 -->
  - **NOTE:** verify-auto + verify-self above passed for an EARLIER P5 build; P5.2 (drag rebuilt to pip_move + Rust+lib.rs change), P5.4 (mirror gate), and the P4.2 dot-size refinement landed AFTER. RE-RAN both below for the changed code before verify-codify (2026-06-26).
  - [x] verify-codify  <!-- status: done 2026-06-26; P5.1 invariant pinned by the cross-layout never-disagree guard (built earlier). +4 NEW Phase-5 wiring guards in pipFanoutWiring: drag (onMouseDown=startPanelDrag → invoke pip_move; window-mousemove delta tracking), mirror-while-hidden gate (exact `document.hidden && !pipNeedsMirror` + negative-guard vs the old bare early-return), toggle PipIcon (import + <PipIcon/>). pip_move + the tick gate are live-panel/interval behavior → bridge-verified, not unit-testable. Full suite 669 pass / 71 files, tsc 0; no regressions. -->

## Current Node
- **Path:** Feature > ship (all 5 phases complete through verify-codify)
- **Active scope:** ALL 5 PHASES COMPLETE through verify-codify. Phase 5 codify pinned the drag/mirror/icon wiring (+4 guards); full suite 669 pass. NEXT: `/feature-ship` (commits the whole WP4 working tree — currently dirty across all 5 phases).
- **Blocked:** none.
- **Unvisited (sequence-of-execution):** ship → finalize.
- **Operator-surfaced (logged, NOT WP4):** SURFACE-2026-06-26-M6-SETTING-NO-YOLO-DEFAULT — settings opt-out for yolo mode, anchored to M6 (backlog).
- **Dev app:** running (bridge 9223, task brb0lf58p) — but session is pausing, operator may close it. Persisted pip_layout currently = `minimal` in dev settings.json (left from testing).
- **Blocked:** none
- **Unvisited:** Phase 3 verify loop (auto → self → human → codify), Phase 4 (minimal attention-weighting), Phase 5 (cross-layout invariant verify)
- **Operator triage (2026-06-26):** "panel doesn't resize" = Phase-3 scope (NOW being built). "vertical-mirror invisible mirror" = FIXED (P1.vh.2). "mirror not displaying" (Phase-2 vh) = non-issue (transient; see Discoveries).
- **Blocked:** none
- **Unvisited:** Phase 2 verify loop (auto → self → human → codify), Phase 3 (auto-resize), Phase 4 (minimal attention-weighting), Phase 5 (cross-layout invariant verify)
- **Operator triage (2026-06-26):** Issue "panel doesn't resize" = EXPECTED, Phase-3 scope. Issue "no visible mirror in vertical-mirror" = FIXED (P1.vh.2; tile-height root cause, not width).
- **Unvisited:** Phase 1 verify loop (verify-auto → verify-self → verify-human → verify-codify), Phase 2 (switcher + Rust app-settings store), Phase 3 (auto-resize), Phase 4 (minimal attention-weighting), Phase 5 (cross-layout invariant verify)
- **Open discoveries:** none

## Notes — carried-in code-quality findings (from WP3 review; formally WP5 scope)
- `SURFACE-2026-06-26-QUALITY-WP3-UNSYNCED-FILMSTRIP-INTERVAL` (MAJOR, → WP5) — filmstrip
  runs its OWN unsynced 1fps DOM-write interval alongside the App ticker. If a phase here
  touches the filmstrip mirror path, opportunistically unify; otherwise leave for WP5.
- `SURFACE-2026-06-26-QUALITY-WP3-TEARDOWN-SKIPS-VISIBILITY-BROADCAST` (MAJOR, → WP5) —
  `pip::teardown()` doesn't emit `pip-visibility false`. WP5 (toggle+lifecycle) owns this.
- 3 MINOR (dup `MIRROR_INTERVAL_MS` literal, un-diffed `pip-mirror` emit, 5× duplicated
  `listen().then()` → `useTauriListen` helper) — in `backlog-quality-findings.md`.
  **Opportunistic:** P1.1/P2.x add MORE `listen().then()` blocks (pip-layout listener) — a
  good moment to extract `useTauriListen` if it's cheap, but not required for WP4 done-ness.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[FIX-2026-06-26 during pause] Phase 3 — operator flagged "title row layout width too long". Root
cause: padding mismatch — pipPanelSize.TILE.pad was 10 but `.pip-root` CSS padding was 6, AND compact
tiles were `flex:0 0 auto` so they shrank to content (~84px) inside a panel sized to compactW=200 →
a wide empty band right of every compact row (the panel was wider than its content). Fix: reconciled
pad=8 in BOTH pipPanelSize.TILE.pad + `.pip-root` padding, and gave `.pip-tile-compact` an explicit
`width:200px` (=compactW) so rows SPAN the panel. Verified live: compact 3-workspaces panel 216px with
200px full-width rows (no band); horizontal 3-workspaces 368px (= pad*2 + 3 tiles + 2 gaps), tiles fill.
Then operator: "compact panel width should match the vertical-stack layout." Set compactW=112 (=mirrorW)
+ `.pip-tile-compact` width:112 (name ellipsizes like the filmstrip tile) → BOTH column layouts (compact
+ vertical-mirror) are now an identical 128px wide (verified live). pip vitest 49✓, tsc 0. verify-human-
stage polish on P3.5; re-confirm at resume.

[NON-ISSUE-2026-06-26] Phase 2 verify-human — operator briefly saw "mirror not displaying", then
"mirror is working now". NOT a regression: the panel was on `minimal` (no mirror by design) and/or
the main webview's `document.hidden` serialize-guard transiently suppressed the `pip-mirror` emit
while the window was backgrounded during the bridge-driven test (focus-stealing). Confirmed healthy:
the filmstrip (same shared mirrorFrame) had 9931 bytes for ws-1 while the loop ran; the only gap was
the gated emit, which resumed once the main window regained focus + a mirror layout was active. No
code defect; Phase 2 didn't touch the pip-mirror emit path. Do NOT chase at codify/review.

[SURFACED-2026-06-26] Phase 1 (P1.vh.2 fix) — the vertical-mirror legibility fix gives PARITY
with horizontal, but both still inherit the shared mirror-occlusion characteristic already
backlogged as SURFACE-2026-06-24 (the `serializeAsHTML()` block is bottom-anchored on the
BUFFER bottom, not the last non-blank CONTENT row, so trailing blank rows consume part of the
visible band). NOT a new regression and NOT in WP4 scope — the "anchor on last non-blank row"
improvement is the existing backlog item touching filmstrip + PiP together. Noted so codify/
review treat the residual sparseness as a known shared characteristic, not a WP4 defect.
