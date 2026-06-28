# Feature: M6 WP5 — Editor auto-wrap toggle

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-06-27
**drive_mode:** autopilot

## Problem Statement
The lite editor deliberately ships with line-wrapping OFF (operator decision, verify-human 2026-06-20 — long lines scroll horizontally; commented at `editorExtensions.ts` ~218–221, no `EditorView.lineWrapping` added). A friend wants soft-wrap as an option. Add a per-editor-view, persisted **auto-wrap toggle**, default **OFF** (preserves today's behavior — `[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]` agrees: default to the operator's current benefit, off-switchable on). Wrap flips live via a CodeMirror Compartment reconfigure (no editor remount), driven by a `⌘\` chord (Sublime convention — confirmed disjoint from every chord in the `paletteCommands.ts` ownership map) plus a clickable status-bar control.

## Scope decisions (resolved at plan time)
- **`⌘\` chord — CONFIRMED disjoint.** Verified against the `paletteCommands.ts` CHORD-OWNERSHIP MAP and a codebase grep: every existing chord is `⌘⇧<letter>`, bare `⌘<letter>` (P/F/R/S/D/W), or `⌘<digit>` / `⌘⇧<digit>`. **`⌘\` (backslash) is bound nowhere.** It's an editor-internal action → it goes in the `Prec.highest` `coreKeymap` in `editorExtensions.ts` (like `Mod-=`/`Mod-0`), NOT the app-level capture-phase listener. `preventDefault: true` so the OS/browser never sees it.
- **Persistence scope: GLOBAL one-key, mirroring `fontZoom.ts`.** The WBS note says "per-editor-view, persisted"; fontZoom (the cited template) persists GLOBALLY under one localStorage key and every view inherits it. For consistency with that established pattern and the lite/frontend-only posture, wrap persists globally under `claudesk.editor.lineWrap` — a freshly opened view inherits the last wrap state. ("Per-editor-view" is honored at the *runtime* layer — each EditorView holds its own compartment instance, seeded from the shared persisted value — but the persisted preference is one global flag, not per-path.) `[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]` only governs the *default direction* (OFF), not the persistence scope; common sense (match the sibling fontZoom pattern) fills the scope gap.
- **Clickable control placement:** a small `wrap`/`no-wrap` toggle in the existing `.editor-statusbar-right` cluster (alongside the save-state text), so there's a discoverable affordance besides the chord.

## Work Tree

- [x] Phase 1: Auto-wrap toggle — helper + compartment + chord + control  <!-- status: done — all impl + 5 verify nodes complete -->
  <!-- (single-phase feature; ready to ship) -->
  **Observable outcomes:**
  - Browser (default OFF preserved): open a file with a long line in the editor → the long line does NOT soft-wrap; a horizontal scrollbar is present on `.cm-scroller` (today's behavior unchanged). DOM: `.cm-content` has no wrapping (`white-space` is `pre`, not `pre-wrap`).
  - Browser (chord flips live): with editor focused, press `⌘\` → the same long line now soft-wraps within the panel width (no horizontal scroll needed); `.cm-content` `white-space` becomes `pre-wrap`. Press `⌘\` again → back to no-wrap. No editor remount (cursor/scroll preserved — same EditorView instance).
  - Browser (clickable control): a wrap toggle control is visible in `.editor-statusbar-right`; clicking it flips wrap state identically to the chord and reflects the current state (e.g. label/aria `wrap` vs `no wrap`).
  - Browser (persistence): toggle wrap ON, reload the dev build → a newly opened editor view mounts with wrap already ON. Toggle OFF, reload → mounts OFF. `localStorage["claudesk.editor.lineWrap"]` holds `"true"`/`"false"`.
  - CLI: `localStorage` round-trip is unit-tested — `pnpm vitest run editorWrapToggle` passes (load default OFF when absent/garbage, save persists, toggle inverts, all swallow storage errors).
  - CLI: `pnpm vitest run editorExtensions` passes with a new assertion that `buildEditorExtensions({ lineWrap: true })` includes `EditorView.lineWrapping` and `({ lineWrap: false })` does not (via the compartment).
  - CLI: `pnpm tsc --noEmit` clean; `pnpm eslint` (scoped to changed files) clean; `pnpm vite build` succeeds.
  - [x] P1.1 Add `src/components/workspace/editor/editorWrapToggle.ts` — pure localStorage helper mirroring `fontZoom.ts`: `LINE_WRAP_KEY = "claudesk.editor.lineWrap"`, `DEFAULT_WRAP = false`, `loadWrap(storage?)` → boolean (default OFF when absent/unparseable; never throws), `saveWrap(on, storage?)`. No React/CM6/DOM.  <!-- status: done -->
  - [x] P1.2 Add a `lineWrapCompartment` (Compartment) + `lineWrapExtension(on: boolean): Extension` to `theme.ts` (alongside `fontSizeCompartment`/`fontSizeTheme`) → returns `on ? EditorView.lineWrapping : []`.  <!-- status: done -->
  - [x] P1.3 Wire into `editorExtensions.ts`: added `lineWrap: boolean` + `onWrapChange` to `EditorExtensionOptions`; seeded `lineWrapCompartment.of(lineWrapExtension(opts.lineWrap))` (REPLACED the "No EditorView.lineWrapping" comment block); added the `Mod-\` keymap entry → `applyWrap(view, !lineWrap)` (reconfigure compartment + `onWrapChange`), `preventDefault: true`.  <!-- status: done -->
  - [x] P1.4 Wire into `EditorPanel.tsx`: `lineWrap` state seeded from `loadWrap()`; `onWrapChange` (state+persist); `onToggleWrap` routes the status-bar button through `viewRef.current.dispatch(...reconfigure...)` + `onWrapChange`; passed `lineWrap`/`onWrapChange` into `buildEditorExtensions` + memo deps. Status-bar `.editor-wrap-toggle` button (aria-pressed, "wrap"/"no wrap") added to `.editor-statusbar-right`.  <!-- status: done -->
  - [x] P1.5 Added `.editor-wrap-toggle` CSS to `App.css` (muted statusbar tokens; aria-pressed active state).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc clean, eslint (changed files) clean, vite build OK, editorWrapToggle + editorExtensions vitest 21/21 -->
  - [x] verify-self  <!-- status: done — driven LIVE via tauri MCP bridge (127.0.0.1:9223, com.claudesk.app.dev) against scratch-a. ALL outcomes PASS, 0 BLOCKING, 0 cosmetic. See verify-self notes below. -->
    **verify-self results (2026-06-27, MCP bridge live):**
    - Outcome 1 (default OFF preserved): PASS — README.md opened, `.cm-content` `white-space:pre`, no `cm-lineWrapping`, toggle reads "no wrap"/aria-pressed=false.
    - Outcome 2 (chord flips live, no remount): PASS — clicked toggle → ON (`break-spaces`+`cm-lineWrapping`, same `.cm-editor` instance via data-probe = NO remount); ⌘\ keydown (defaultPrevented=true) flipped back OFF. Button + chord share onWrapChange (state+persist in sync).
    - Outcome 3 (clickable control): PASS — `.editor-wrap-toggle` visible in `.editor-statusbar-right`, gated on hasFile (absent in the no-file empty state), reflects state, title "Soft-wrap on/off (⌘\)".
    - Outcome 4 (persistence across mount): PASS — set ON, full webview reload → re-opened scratch-a/hello.txt → fresh EditorPanel mounted with wrap ALREADY ON (loadWrap() seeds useState). localStorage key holds "true"/"false". Reset to default after.
  - [x] verify-human  <!-- status: done — operator: "all pass" 2026-06-27 -->
    - [x] P1.verify-human.1 ⌘\ chord feels right (toggles wrap, doesn't collide / leak to the PTY or page-zoom)  <!-- status: done -->
    - [x] P1.verify-human.2 status-bar "wrap"/"no wrap" pill is discoverable + aesthetically acceptable (dark tokens, placement in the right cluster)  <!-- status: done -->
    - [x] P1.verify-human.3 default OFF still feels right (no behavior regression on existing files; long lines scroll horizontally as before)  <!-- status: done -->
    - [x] P1.verify-human.4 installed-build behavior [DEFERRED-TO-RELEASE per standing convention — operator verifies at /release gate]  <!-- status: done — DEFERRED-TO-RELEASE -->
  - [x] verify-codify  <!-- status: done — behavior codified during build (TDD); coverage confirmed sufficient. Full suite 719 pass / 74 files, no regressions. -->

## Current Node
- **Path:** Feature > Phase 1 > COMPLETE (all 5 verify nodes green)
- **Active scope:** none — single phase complete, ready to ship
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none
- **Notes:** All phases complete. impl + verify-auto + verify-self (live MCP bridge) + verify-human ("all pass") + verify-codify (719/74, no regressions) all green. Next: `/feature-ship`.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
