# Feature: WP4 — Adjustable CC terminal font size (focus-scoped zoom)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-06-27
**Drive mode:** autopilot
**Milestone:** M6 (friend-requested QoL polish) — WP4

## Problem Statement
The CC terminal's font size is hardcoded (`fontSize: 11` in the `XtermPane` `Terminal` constructor, `XtermPane.tsx:201`) and cannot be changed at runtime, unlike the right-panel editor which has ⌘+/⌘−/⌘0 zoom (`editor/fontZoom.ts` + `editorExtensions.ts`). A friend asked for the terminal to be zoomable too. **Keybinding is FOCUS-SCOPED and LOCKED (operator decision):** ⌘+/⌘−/⌘0 zoom whichever half holds keyboard focus — the CC terminal when the left pane is focused, the editor when the right pane is — routed via the M4 WP4b `data-focus-half` active-half tracking. No new chords. This mirrors the already-shipped editor `fontZoom.ts` pattern (pure localStorage helper + live-apply), so it's low-risk additive UI over a confirmed seam.

## Design notes (seams + routing decision)
- **Pure module** `src/components/workspace/terminalFontZoom.ts` — verbatim sibling of `editor/fontZoom.ts`: own localStorage key `claudesk.terminal.fontSize`, `DEFAULT_TERMINAL_FONT_PX = 11` (matches today's hardcode so first run is visually identical), `MIN`/`MAX` bounds, pure `clampTerminalFontSize`/`nextTerminalFontSize`/`loadTerminalFontSize`/`saveTerminalFontSize`, never-throw storage access.
- **XtermPane apply seam:** seed the `Terminal` constructor `fontSize` from `loadTerminalFontSize()` (instead of the literal `11`); expose `setFontSize(px)` on the existing `XtermPaneHandle` imperative interface (alongside `focus()`/`refit()`) that does `term.options.fontSize = px; fitAndResize()` — `fitAndResize` already recomputes cols/rows and pushes `cc_resize` to the PTY, so a font change reflows correctly and the PTY learns the new geometry. No-op-safe when `term` is null.
- **Routing (the one real decision — focus-scoped):** the editor zoom is a CM6 keymap that ONLY fires when CodeMirror holds DOM focus (`editorExtensions.ts` `coreKeymap`). xterm.js captures keystrokes via its own textarea and forwards to the PTY via `onData`, so a ⌘+ pressed while the terminal is focused would otherwise go to the PTY / browser page-zoom, not to a zoom handler. The seam: a **per-workspace capture-phase `keydown` listener** on the workspace root (added next to the existing `focusin`/`focusout` listeners in `Workspace.tsx`), gated on `visible`. When the listener sees a terminal-zoom chord (⌘= / ⌘+ / ⌘- / ⌘0) AND focus is in the LEFT half (`deriveFocusHalf(document.activeElement)` / the tracked `focusHalf === "left"`), it: applies terminal zoom via the pane handle, persists, then `preventDefault()` + `stopPropagation()` so the chord never reaches the PTY or triggers browser zoom. When focus is in the RIGHT half (editor) it does NOTHING — the existing CM6 keymap handles it unchanged. This keeps the two zoom paths fully disjoint (terminal: app-level capture gated on left-focus; editor: CM6 keymap gated on CM focus).
- **Chord matcher kept pure + tested:** a tiny `terminalZoomForChord(e) -> "in" | "out" | "reset" | null` predicate in `terminalFontZoom.ts` (mirrors `panelForChord`/`newWorkspaceChord` shape) matches `Mod-=`/`Mod-+`/`Mod--`/`Mod-0` (cover both shifted/unshifted `+`), so the keydown-listener wiring is thin and the matching logic is vitest-covered.
- **No new chords / no chord-ownership-map change:** ⌘+/⌘−/⌘0 are NOT in the `paletteCommands.ts` ⌘⇧-family ownership matrix (they're plain `Mod`, editor-internal today). Adding the terminal side is symmetric — same chords, dispatched by focused-half. Confirm no collision with the bare-`Mod` finder (`⌘P`) — different key, no overlap.

## Work Tree

- [x] Phase 1: Focus-scoped terminal font zoom  <!-- status: done — all impl + all 5 verify nodes [x] -->
  **Observable outcomes:**
  - Browser (MCP bridge, dev): in a real workspace, click into the LEFT CC terminal (data-focus-half="left"), press ⌘= repeatedly → the terminal text grows (xterm `fontSize` increases, terminal re-fits — fewer cols, no garbling); ⌘- shrinks it; ⌘0 resets to 11. The RIGHT editor's font size is UNCHANGED throughout.
  - Browser (MCP bridge, dev): click into the RIGHT editor (data-focus-half="right"), press ⌘= → the EDITOR grows (existing behavior) and the terminal font is UNCHANGED — confirming the routing is focus-scoped both directions.
  - Browser (MCP bridge, dev): zoom the terminal, then reload the app (or re-pick the project) → the terminal mounts at the persisted size, not 11 (localStorage round-trip).
  - CLI: `pnpm vitest run terminalFontZoom` → the pure-module unit tests pass (clamp/next/load/save + the `terminalZoomForChord` matcher truth table).
  - CLI: `pnpm tsc --noEmit && pnpm eslint . && pnpm vite build` → clean (no broken imports/JSX across XtermPane handle + Workspace listener changes).
  - Console: no JS errors when zooming the terminal; the ⌘+ chord does NOT trigger WKWebView page-zoom while the terminal is focused (preventDefault confirmed by the terminal text scaling but the surrounding chrome NOT scaling).
  - [x] P1.1 Add `src/components/workspace/terminalFontZoom.ts` — pure clamp/next/load/save (key `claudesk.terminal.fontSize`, default 11, bounds 6–32) + `terminalZoomForChord` matcher; mirror `editor/fontZoom.ts` structure  <!-- status: done; 17 unit tests pass -->
  - [x] P1.2 XtermPane: seed constructor `fontSize` from `loadTerminalFontSize()`; add `setFontSize(px)` to `XtermPaneHandle` (`term.options.fontSize = px; fitAndResize()`), null-safe  <!-- status: done -->
  - [x] P1.3 Workspace: capture-phase keydown listener (gated on `visible`, beside focusin/focusout) — on a terminal-zoom chord WHILE the left half is focused (read live `document.activeElement` via deriveFocusHalf) it applies+persists terminal zoom + preventDefault+stopPropagation; right-half focus is a no-op (CM6 keymap unchanged)  <!-- status: done -->
  - [x] P1.4 Hold the live terminal font size in Workspace React state seeded from `loadTerminalFontSize()` (+ a ref synced via effect so the listener reads the live value); chord computes next from current; persist on each change  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; eslint 0-err (XtermPane:442 spread-warn pre-existing), tsc clean, terminalFontZoom 17/17, vite build OK -->
  - [x] verify-self  <!-- status: done; driven live via tauri MCP bridge (dev) — all outcomes PASS, no BLOCKING. One latent batch-fragility fixed in-place (functional-updater refactor) + fresh re-verified -->
    - [x] terminal-focused grow/shrink (⌘=/⌘−) reflows xterm: 11→12→13 grow, 13→12 shrink, persisted  <!-- status: PASS -->
    - [x] ⌘0 resets terminal to 11  <!-- status: PASS -->
    - [x] editor-focused ⌘= grows EDITOR (12→13), terminal unchanged (stays 12) — focus-scoped routing  <!-- status: PASS -->
    - [x] right-half focus → terminal listener bails (defaultPrevented=false, terminal unchanged)  <!-- status: PASS -->
    - [x] persistence across reload+re-pick → terminal mounts at persisted 12 (not 11)  <!-- status: PASS -->
    - [x] ⌘+ does not trigger WKWebView page-zoom while terminal focused (defaultPrevented=true, only xterm text scales)  <!-- status: PASS -->
    - [x] batch-safe: 3× ⌘= in one synchronous tick advances 12→15 (post-fix; pre-fix only +1)  <!-- status: PASS after shortcut fix -->
  - [x] verify-human  <!-- status: done; operator confirmed all 4 leaves PASS 2026-06-27 (real keyboard) -->
    - [x] P1.verify-human.1 Real ⌘+ / ⌘− while CC terminal focused → terminal text grows/shrinks smoothly, re-fits  <!-- status: PASS -->
    - [x] P1.verify-human.2 Real ⌘0 while terminal focused → resets to the default size  <!-- status: PASS -->
    - [x] P1.verify-human.3 Editor focused ⌘+ zooms editor (terminal unchanged); terminal focused ⌘+ zooms terminal (editor unchanged)  <!-- status: PASS -->
    - [x] P1.verify-human.4 Zoom terminal, quit+relaunch, re-open → terminal mounts at chosen size (persisted)  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: done; no new tests needed — both pure seams already covered (terminalFontZoom 17 + deriveFocusHalf 5); the live-DOM routing is bridge+human-verified per the repo's no-jsdom-harness posture. Full suite 711/711 pass (73 files, +17). -->
    - **Integration boundary:** routing lives in Workspace.tsx (existing UI), but it decomposes into two CI-stable PURE seams — `terminalFontZoom.ts` (17 tests: clamp/next/load/save + terminalZoomForChord matcher) and `deriveFocusHalf` (5 tests: the left/right/none gate). Their COMPOSITION (capture-listener focus-scoped dispatch) is live-DOM, exhaustively verified via the MCP bridge (verify-self, both routing directions + batch-safety) + real keyboard (verify-human). No jsdom render harness exists (deliberate — see focusHalf.ts header + SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP); a hand-mocked DOM test would be brittle and lower-value than the live verification done. No new test written; existing coverage pins the regression-catching surface.

## Current Node
- **Path:** Feature > Phase 1 > COMPLETE
- **Active scope:** none — Phase 1 done (all impl + verify-auto/self/human/codify [x]); single-phase feature, all phases complete → ready to ship
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** one SHORTCUT entry (batch-fix); two new M6 WPs (WP10 RP-terminal zoom, WP11 multiple RP-terminals) surfaced at verify-human → logged to backlog & added to WBS

## Build notes
- **terminalFontZoom.ts:** verbatim sibling of editor/fontZoom.ts (key `claudesk.terminal.fontSize`, default 11 = old hardcode, bounds 6–32) + a `terminalZoomForChord(e)` matcher (`=`/`+`→in, `-`→out, `0`→reset, meta required, no shift). 17 unit tests.
- **XtermPane:** constructor `fontSize` now `loadTerminalFontSize()`; `setFontSize(px)` added to `XtermPaneHandle` → `term.options.fontSize = px; fitAndResize()` (re-fits + pushes cc_resize). Null-safe before mount.
- **Workspace:** `terminalFontSize` state (seeded from localStorage) + a ref synced via effect; `applyTerminalFontSize` sets state + persists + calls the handle. A capture-phase `keydown` listener on the workspace root (gated on `visible`) intercepts the zoom chord ONLY when `deriveFocusHalf(document.activeElement) === "left"` — applies terminal zoom + preventDefault+stopPropagation so it never reaches the PTY or browser page-zoom; right-half focus is a pass-through (CM6 editor keymap handles it). Reads live focus (not the React `focusHalf` state) to dodge a stale-closure race.
- **eslint nit fixed:** ref sync moved into an effect (react-hooks/refs forbids ref-assign during render). XtermPane's line-442 spread-dep warning is pre-existing (spawnTriggerDeps), untouched.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[SHORTCUT-2026-06-27] P1.4 — verify-self surfaced a latent batch-fragility: the original `applyTerminalFontSize(px)` computed the next size in the keydown listener reading a `terminalFontSizeRef` synced via a post-commit effect, so N chords fired within ONE React batch all read the same stale size and only advanced one step (proven live: 3× ⌘= in one synchronous tick went 11→12 not 11→14). Real keystrokes are tick-separated so it never bit a user — but the fix is a strict simplification: `applyTerminalZoom(action)` now computes the next size INSIDE the functional setState updater (the only batch-safe source of the prior value), dropping the ref + its sync effect entirely. Re-verified live via a freshly-HMR'd dev build: 3× ⌘= in one tick now correctly advances 12→15, and the focus-scoped routing + reset still hold. tsc/eslint clean; 22 unit tests pass.
