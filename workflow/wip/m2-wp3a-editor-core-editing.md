# Feature: WP3a — Editor core-editing parity (multi-cursor, find/replace, font-zoom)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-06-20
**Milestone:** 2
**WBS:** `docs/product/wbs.md` → WP3a
**drive_mode:** autopilot

## Problem Statement

The WP2 editor shell (`src/components/workspace/editor/EditorPanel.tsx`) mounts CodeMirror 6 with open/edit/save and a dark VS-Code-Dark+ theme, but ships none of the daily editing gestures the operator relies on in Sublime Text. WP3a layers the **daily-must-have** editing features onto that shell as additive CM6 extensions/keybindings: **multi-cursor / multiple selections** (with the VS-Code alt-drag column-select binding, which is not a CM6 default), **in-file find/replace** (`@codemirror/search`, already a dependency), and **font-size zoom** (`Cmd+=` / `Cmd+-` / `Cmd+0`, Sublime parity — replacing the hardcoded `13px` in `theme.ts` with a reactive Compartment-swapped value persisted globally via `localStorage`). **Minimap** (`@replit/codemirror-minimap`) rides along as an explicitly **deferrable** extra (lowest-confidence dependency per `research.md`) and must NOT block the three must-haves. New keybindings follow WP1's settled chord guidance: editor-scoped chords use a CM6 `Prec.highest` keymap (the clean editor-focused suppressor, the same shape WP2's `Mod-s` already uses); the capture-phase `document` listener is reserved for app-level chords (panel-switch / Cmd+P), which are WP5/WP6, not WP3a.

## Work Tree

- [x] Phase 1: Multi-cursor + find/replace (the two must-have editing extensions)  <!-- status: done — all impl + verify nodes [x] -->
  **Observable outcomes:**
  - Browser (Playwright on the running app via `pnpm tauri dev` / vite dev): open a file in the EditorPanel; the rendered `.cm-editor` is present and editable. With a file open, pressing the find chord (`Mod-f`) makes the `@codemirror/search` panel appear in the DOM (a `.cm-search` / `.cm-panel` element); pressing Escape removes it. (Mechanically checkable: snapshot before/after contains/omits `.cm-panel.cm-search`.)
  - CLI: `pnpm vitest run src/components/workspace/editor` exits 0 — unit tests assert the editor's extension set includes `search()` and the multi-selection config (`EditorState.allowMultipleSelections` enabled) and the search keymap bindings are present. The exact assertion is on the pure extension-builder (see P1.1), not on a live view.
  - CLI: `pnpm tsc --noEmit` exits 0; `pnpm eslint .` exits 0 (TS strict + lint clean).
  - Console: no JS console errors when the editor mounts or when the find panel opens (Playwright `browser_console_messages` empty of errors).
  - [x] P1.1 Extract editor extensions into a pure builder (`editorExtensions.ts`) so the extension set is unit-testable without a live `EditorView`. It returns the array EditorPanel currently builds inline (saveKeymap, language, lineWrapping) plus the new pieces. Keeps EditorPanel thin and mirrors the existing pure-reducer split (`editorLoad.ts`/`editorSave.ts`).  <!-- status: done — buildEditorExtensions() in editorExtensions.ts; EditorPanel now calls it -->
  - [x] P1.2 Multi-cursor / multiple selections: `EditorState.allowMultipleSelections.of(true)` + `rectangularSelection()` + `crosshairCursor()` (alt-drag column/multi-cursor — NOT a basicSetup default; `drawSelection` already ships in basicSetup, so not re-added to avoid double-mount). Cmd-D `selectNextOccurrence` bound via the `Prec.highest` keymap.  <!-- status: done -->
  - [x] P1.3 In-file find/replace: `search({ top: true })` panel + `searchKeymap` re-asserted at `Prec.highest`. Dark search-panel CSS added to `theme.ts` (.cm-panels/.cm-search/.cm-textfield/.cm-button). Used the built-in `@codemirror/search` panel — NO new dep (the `@rigstech` VS-Code panel was not needed).  <!-- status: done -->
  - [x] P1.4 Wired through the P1.1 builder into EditorPanel's `extensions` useMemo (replacing the inline saveKeymap); Mod-s + lineWrapping preserved. Mod-d/search/Mod-s coexist (unit-tested: all bindings present, Mod-s run() fires onSave + returns true). tsc/eslint/vitest clean.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc 0, eslint (changed files) 0, vitest editor module 39/39 -->
  - [x] verify-self  <!-- status: done — app loads clean + 0 console errors on load (PASS); editor-interaction outcomes UNVERIFIED (Tauri-IPC-gated: editor unreachable in plain Chromium, invoke undefined) → deferred to verify-human in WKWebView, mirroring WP2. No BLOCKING. -->
  - [x] verify-human  <!-- status: done — all leaves PASS after 3 back-loop rounds (replace chord→Cmd+R, no word-wrap, Cmd-drag multi-cursor, scroll height-chain fix) -->
    - [x] P1.verify-human.1 Open a file in a workspace editor → editor renders, text visible, no console error  <!-- status: PASS -->
    - [x] P1.verify-human.2 Cmd+F opens the find panel (dark-styled, top of editor); type to find, matches highlight; Esc closes it  <!-- status: PASS -->
    - [x] P1.verify-human.3 Find+replace via Cmd+R (operator's chord): replace one / replace all works  <!-- status: PASS -->
    - [x] P1.verify-human.4 Multi-cursor: Cmd-drag (operator's trigger, not Alt) makes a column multi-cursor; no stray next-char selection; typing edits all cursors  <!-- status: PASS -->
    - [x] P1.verify-human.5 Cmd+D selects the next occurrence of the current word/selection (repeat to add more)  <!-- status: PASS -->
    - [x] P1.verify-human.6 Cmd+S still saves (no regression); Cmd+F/Cmd+R do NOT trigger any browser/OS default; vertical + horizontal scroll work (wrap off)  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: done — 7 new editorExtensions tests codify the verified keymap/multi-select config (Mod-s fires onSave, Mod-d/Mod-f/Mod-r present, allowMultipleSelections on, language-by-ext). Word-wrap-off + rectangular-Cmd-drag are CSS/event behaviors human-verified in WKWebView (a unit test would only assert import identity — implementation detail, skipped per skill guidance). Full suite: frontend 84/84, backend 47/47. -->

- [x] Phase 2: Font-size zoom (Cmd+= / Cmd+- / Cmd+0, persisted)  <!-- status: done — all impl + verify nodes [x] -->
  **Observable outcomes:**
  - Browser (Playwright on the running app): with the editor focused, the `.cm-content` computed `font-size` starts at the persisted/default value (13px). Pressing `Cmd+=` increases it (computed font-size strictly larger); `Cmd+-` decreases it; `Cmd+0` resets to default. (Mechanically checkable: `browser_evaluate` reading `getComputedStyle(document.querySelector('.cm-content')).fontSize` before/after each chord.)
  - Browser: after a zoom change, reloading the app (or remounting the editor) preserves the new font size — the value survives via `localStorage` (key e.g. `claudesk.editor.fontSize`). (Checkable: set zoom, read `localStorage` key, reload, assert `.cm-content` font-size matches.)
  - CLI: `pnpm vitest run src/components/workspace/editor` exits 0 — unit tests on the pure font-zoom logic: clamp bounds (min/max font px), step direction, reset-to-default, and the persistence read/write helpers (mockable `Storage`). The chord-handler math is pure and tested without a live view.
  - CLI: `pnpm tsc --noEmit` + `pnpm eslint .` exit 0.
  - Console: no JS console errors on zoom in/out/reset; the browser/OS native zoom default does NOT fire (the chords are consumed). (Playwright: no console errors; page-level zoom unchanged — only the editor font changes.)
  - [x] P2.1 Compartment-swappable font size: removed hardcoded `fontSize:"13px"` from `editorChromeTheme.cm-content`; added `fontSizeCompartment` + `fontSizeTheme(px)` (scales both `.cm-content` and `.cm-gutters`) in theme.ts; builder seeds `fontSizeCompartment.of(fontSizeTheme(opts.fontSize))`; keybindings `view.dispatch(reconfigure(...))` live.  <!-- status: done -->
  - [x] P2.2 Pure `fontZoom.ts`: `clampFontSize`/`nextFontSize(current,dir)` (8–32px, step 1), `DEFAULT_FONT_PX=13`, `loadFontSize`/`saveFontSize` over localStorage key `claudesk.editor.fontSize` (global), tolerate missing/corrupt/undefined-storage → default, never throws. 13 unit tests.  <!-- status: done -->
  - [x] P2.3 Bound `Mod-=`/`Mod-+`/`Mod--`/`Mod-0` via the existing `Prec.highest` coreKeymap; each computes next size (fontZoom), reconfigures the compartment on the view, and calls onFontSizeChange (state+persist); preventDefault so browser page-zoom never fires.  <!-- status: done -->
  - [x] P2.4 EditorPanel seeds `useState(() => loadFontSize())` (read once on mount → no 13px flash), passes fontSize/onFontSizeChange to the builder; persisted value is global so a fresh workspace inherits the last zoom.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc 0, eslint (changed files) 0, fontZoom+editorExtensions tests 20/20 -->
  - [x] verify-self  <!-- status: done — app loads clean + 0 console errors on load (PASS); zoom-interaction outcomes UNVERIFIED (Tauri-IPC-gated, editor unreachable in Chromium) → deferred to verify-human in WKWebView. No BLOCKING. -->
  - [x] verify-human  <!-- status: done — all 4 leaves PASS (operator "all pass" 2026-06-20) -->
    - [x] P2.verify-human.1 Cmd+= grows the editor font (text + line numbers scale together); repeat keeps growing up to a max  <!-- status: PASS -->
    - [x] P2.verify-human.2 Cmd+- shrinks the font (down to a min); Cmd+0 resets to the default size  <!-- status: PASS -->
    - [x] P2.verify-human.3 Zoom persists: change zoom, reload/reopen → editor reopens at the last zoom, not the default  <!-- status: PASS -->
    - [x] P2.verify-human.4 No native page-zoom: Cmd+=/-/0 only change the editor font, NOT the whole app UI; no browser/OS zoom fires  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: done — zoom math + persistence + binding-presence covered by fontZoom.test.ts (13) + editorExtensions.test.ts. The chord→compartment→callback glue is observable only in WKWebView (human-verified all-PASS); adding jsdom infra for one brittle live-view dispatch is the anti-pattern the skill warns against, so not added. Full suite: frontend 97/97, backend 47/47. -->

- [x] Phase 3: Minimap — DEFERRABLE extra (must not block must-haves)  <!-- status: done — minimap SHIPPED (not deferred) + scroll-past-end follow-on; all impl + verify nodes [x] -->
  **Observable outcomes:**
  - Browser (Playwright): with the minimap enabled and a file open, a `.cm-minimap` element renders inside the editor; with it disabled (the fallback if the dep fights the CM6 version), the editor still renders and edits normally and NO `.cm-minimap` element exists — and that is an acceptable ship state.
  - CLI: `pnpm tsc --noEmit` + `pnpm eslint .` + `pnpm vitest run src/components/workspace/editor` all exit 0 in BOTH the minimap-on and minimap-deferred states. (The deferral path is a first-class outcome, not a failure.)
  - Console: no JS console errors in whichever state ships.
  - [x] P3.1 Added `@replit/codemirror-minimap@0.5.2`. Peer-deps ALL satisfied by pinned CM6 (view 6.43.1 ≥ ^6.21.3, state 6.6.0 ≥ ^6.3.1, language 6.12.3, lint 6.9.7, lezer/highlight 1.2.3, lezer/common 1.5.2) — NO version fight. Wired via `showMinimap.compute` in the builder (`displayText:"blocks"`, `showOverlay:"always"`, own container element).  <!-- status: done -->
  - [x] P3.2 DECISION GATE verdict: **SHIPPED** (not deferred). Browser-confirmed via throwaway `?minimapprobe` + Playwright: `.cm-minimap-inner` (100×830px), `.cm-minimap-overlay`, `.cm-minimap-gutter` all render over the dark editor; screenshot showed the condensed block-text column + viewport overlay; 0 console errors. Probe cleaned up.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc 0, eslint 0, editor tests 53/53; minimap import resolves at runtime (browser probe rendered it) -->
  - [x] verify-self  <!-- status: done — app loads clean + 0 console errors on load (PASS); minimap-in-real-editor UNVERIFIED (Tauri-IPC-gated) but orchestrator already probe-confirmed .cm-minimap-inner renders → verify-human confirms in WKWebView. No BLOCKING. -->
  - [x] verify-human  <!-- status: done — both leaves PASS (operator "Perfect" 2026-06-20) + scroll-past-end follow-on added at P3.3 below -->
    - [x] P3.verify-human.1 Open a file → a minimap (condensed code overview) renders on the right edge of the editor; clicking/dragging it scrolls the editor  <!-- status: PASS -->
    - [x] P3.verify-human.2 With the minimap present, the Phase-1/2 must-haves still work (multi-cursor Cmd-drag, Cmd+F find, Cmd+D, Cmd+R replace, font-zoom, vertical+horizontal scroll) — no regression, no layout break in the half-width panel  <!-- status: PASS -->
    - [x] P3.3 (follow-on, operator request at verify-human) scrollPastEnd() — let the editor scroll until the last line reaches the top of the viewport (VS Code scrollBeyondLastLine). Built-in @codemirror/view extension, no new dep.  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — minimap render + scroll-past-end are view-level visual behaviors (human-verified in WKWebView + minimap browser-probe-confirmed); both are facets created at view-mount, not EditorState-introspectable, so a unit test would need jsdom + a brittle live view asserting only import-identity (anti-pattern) — not added. Full suite: frontend 97/97, backend 47/47. -->

## Current Node
- **Path:** Feature > ALL PHASES COMPLETE → ship
- **Active scope:** none — all 3 phases [x]; next = /feature-ship
- **Phase 2 impl complete (2026-06-20):** font-zoom Cmd+=/-/0 via compartment; pure fontZoom.ts (13 tests); EditorPanel seeds from localStorage. Editor module 53/53, tsc/eslint clean.
- **Blocked:** none
- **Unvisited:** Phase 1 verify (verify-auto → verify-self → verify-human → verify-codify), then Phase 2 (font-zoom: P2.1 → P2.2 → P2.3 → P2.4 → verify group), then Phase 3 (minimap, OPTIONAL: P3.1 → P3.2 → verify group)
- **Open discoveries:** none
- **Phase 1 impl complete (2026-06-20):** multi-cursor + rectangular select + Cmd-D + find/replace panel, all via pure `editorExtensions.ts`; 39 editor tests pass (6 new), tsc/eslint clean. No new deps. Browser/Console outcomes (find-panel DOM, no console errors) deferred to verify-self/human.

## Notes / carry-forward
- **WP1 chord lesson (applied):** editor-internal chords (`Mod-s`, `Mod-f`, `Mod-d`, `Mod-=/-/0`) use a CM6 `Prec.highest` keymap returning `true` — the clean editor-focused suppressor that stops browser/OS defaults (print, page-zoom). The capture-phase `document` listener is for APP-level chords (panel-switch, Cmd+P) and belongs to WP5/WP6, NOT WP3a. Do not over-apply capture-phase here.
- **Deps:** `@codemirror/search` (6.7.1), `@codemirror/commands` (6.8.1), `@codemirror/view` (6.43.1, has `drawSelection`/`rectangularSelection`/`crosshairCursor`), `@codemirror/state` (6.6.0, has `Compartment`) are ALL already installed — Phases 1 & 2 add NO new deps. Only Phase 3 (minimap) adds `@replit/codemirror-minimap`, and that's the deferrable one.
- **Dark-only:** all new UI (search panel, minimap) styled dark in `theme.ts`; no light variant, no `prefers-color-scheme` (CLAUDE.md "Dark mode only").
- **Font-zoom scope decision:** persisted GLOBALLY via `localStorage` (not per-project) — the lite/frontend-only choice; no backend round-trip. CLAUDE.md WBS allowed "per-project or globally"; global chosen.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[VERIFY-HUMAN-BACKLOOP-2026-06-20] Phase 1 — operator requested 4 changes at first verify-human; fixed in build (F12→build→re-verify):
  1. Replace chord = **Cmd+R** (not the CM6 default) — bound `Mod-r` → `openSearchPanel` at Prec.highest, preventDefault so browser reload is suppressed.
  2. **No auto word-wrap** — removed `EditorView.lineWrapping`; CM6 default (horizontal scroll) is the wanted behavior.
  3. Multi-cursor trigger = **Cmd-drag** (not Alt) — `rectangularSelection({ eventFilter: e => e.metaKey })` + `crosshairCursor({ key: "Meta" })`.
  4. "Selects the next character" artifact — was tied to the rectangular-selection default; gating strictly on metaKey + CM6's drag-distance gate means a stationary Cmd+click no longer creates a stray 1-char range. CONFIRMED good at re-verify.
[VERIFY-HUMAN-BACKLOOP-2026-06-20 #2] Phase 1 — two more at second re-verify (CSS-only):
  5. **No vertical scroll on tall files** — root cause: @uiw/react-codemirror wraps .cm-editor in a `.cm-theme` div, so .cm-editor's `flex:1` had no flex parent → editor shrink-wrapped content. Fixed in App.css: made `.editor-panel .cm-theme` the flex-fill column + `.cm-editor` `max-height:100%` so .cm-scroller overflows/scrolls.
  6. **Horizontal scrollbar with wrap off** — same fix: `.cm-scroller { overflow: auto }` now shows the horizontal bar when a long line overflows (it was already auto, but the broken height chain hid it).
[VERIFY-HUMAN-BACKLOOP-2026-06-20 #3] Scroll STILL broken after #5/#6 — stopped guessing, diagnosed empirically via a throwaway `?scrollprobe` route + Playwright computed-style inspection in the browser. TWO unbounded links in the height chain (not the editor itself):
  (a) `.workspace-right` is a GRID ITEM of `.workspace` and lacked `min-height:0` → grid items default to min-height:auto, so a tall file stretched it to document height (3711px observed) escaping the viewport bound. Fixed: added `min-height:0`.
  (b) `@uiw/react-codemirror` nests the editor in a REAL `.cm-theme` wrapper div (earlier source-read was wrong — it is NOT the same element as `.cm-editor`), defaulting to `flex:0 1 auto` so it grew to content height and never bounded the editor. Fixed: `.editor-panel .cm-theme { flex:1; min-height:0; display:flex; flex-direction:column }`.
  Also removed the conflicting `height:100%` on the editor `&` (theme.ts) + the `height`/`style` props on <CodeMirror> (EditorPanel) — they fight flex:1. Browser-confirmed: cm-scroller clientH 815 < scrollH 3664 (vScrolls), clientW 584 < scrollW 10368 (hScrolls); both scrollTop/scrollLeft move; screenshot showed both scrollbars. LESSON: should have inspected the live DOM before the first two CSS guesses.
