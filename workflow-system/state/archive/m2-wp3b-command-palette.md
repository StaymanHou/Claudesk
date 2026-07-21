---
stage: feature
state: ship (complete)
ship_commit: 3699a22
drive_mode: autopilot
milestone: 2
wp: WP3b
created: 2026-06-20
---

# Feature: WP3b — Editor command palette

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-20

## Problem Statement

The WP2 editor shell + WP3a editing features give the operator a daily-usable lite editor, but every action is a chord or a mouse gesture — there is no discoverable command surface the way Sublime's `Cmd+Shift+P` palette is. WP3b adds a **net-new React command-palette overlay** (Cmd+Shift+P) over CodeMirror 6's command set. CM6 ships no turnkey palette, so this is a small custom subsystem, not a config flip. The first command set is **syntax/mode selection** (override the extension-derived language for the open file: JavaScript / TypeScript / JSX / TSX / Rust / Markdown / Plain Text — the languages `language.ts` already supports), structured as an extensible command registry so future commands (more modes, editor actions, panel ops) slot in by adding a registry entry. The palette hotkey **must fire while keyboard focus is inside CM6** — solved by the WP1-proven **capture-phase `document` keydown** pattern — and **must not collide** with the future WP5 panel-switch hotkey or the WP6 Cmd+P fuzzy finder.

**Grounding:**
- **WP1 finding (settled):** a capture-phase `document` keydown listener (`addEventListener('keydown', h, true)`) fires for **every** chord regardless of CM6 focus, *before* CM6's contentEditable handler — so CM6 cannot swallow it. For Cmd+Shift+P specifically the probe observed `[doc-capture, cm6-bubble, doc-bubble]`: CM6 does **not** consume it. (See `workflow/archive/m2-wp1-cm6-probe.md` → Objective (a).) The listener is scoped to the **focused/active workspace** — mirrors `SublimeToolbar`'s `active`-gating so the chord targets the visible tab only.
- **Existing in-app chord precedent:** `SublimeToolbar.tsx` already binds an `active`-gated `window` keydown for ⌘⇧E via the pure `isSublimeChord` predicate in `src/sublime/chord.ts`. WP3b follows the same shape but in **capture phase** (the WP1-recommended upgrade for editor-focused chords).
- **Language override seam:** `language.ts`'s `languageForPath` derives the mode purely from the file extension. For a palette syntax pick to actually change the active language, EditorPanel needs a **language-override `Compartment`** (default = extension-derived, overridden by the palette) — exactly mirroring the existing `fontSizeCompartment` reconfigure pattern in `theme.ts` / `editorExtensions.ts`.

## Work Tree

- [x] Phase 1: Palette overlay + capture-phase chord + syntax-selection command set  <!-- status: COMPLETE -->
  **Observable outcomes:**
  - Browser (Playwright, focus inside the CM6 editor): pressing **Cmd+Shift+P** opens an overlay with `data-testid="command-palette"`; a filter `input` is auto-focused; the list shows the syntax commands (≥ "Set Syntax: TypeScript", "Set Syntax: Rust", "Set Syntax: Plain Text").
  - Browser: typing in the filter narrows the list (e.g. typing "rust" leaves only the Rust row); **↓/↑** move the active row (`aria-selected` / active class), **Enter** runs the active command, **Esc** closes the overlay returning focus to the editor.
  - Browser: with a `.md` file open (markdown highlighting active), running **"Set Syntax: Rust"** reconfigures the editor language — a Rust keyword (`fn`) is now syntax-highlighted (CM6 adds a token class) where before it was plain markdown text. Verified via a computed-style / token-class check on the `.cm-content`.
  - Browser: Cmd+Shift+P does **not** trigger any browser default (no print dialog, no native action) and does not leak a literal "P" into the document (doc length unchanged after the chord).
  - Console: no JS errors on open / filter / select / close.
  - [x] P1.1 Pure command-registry + chord predicate module (`paletteCommands.ts` — renamed from `commandPalette.ts` to avoid a macOS case-collision with `CommandPalette.tsx`; see Discoveries): `PaletteCommand { id, title, run }` type; an `isPaletteChord(e)` predicate (Cmd+Shift+P, case-insensitive on "p", Shift REQUIRED to stay distinct from WP6's bare Cmd+P); a pure `filterCommands(commands, query)` (case-insensitive substring on `title`); a `PALETTE_CHORD_LABEL` ("⌘⇧P"). No React, no DOM — 11 vitest cases.  <!-- status: COMPLETE -->
  - [x] P1.2 Language-override `Compartment` in the editor: added `languageCompartment` in `theme.ts` (mirrors `fontSizeCompartment`); EditorPanel holds a path-scoped `override {path,id}` state (computed during render so a new file auto-re-derives from its extension — no reset effect, satisfies the react-hooks/set-state-in-effect rule); `buildEditorExtensions` seeds the compartment from `languageOverrideId ?? languageForPath(openPath)` via the new required `languageOverrideId` opt. Added `SYNTAX_MODES` + `languageForId(id)` to `language.ts` (same packs back both paths — no second source of truth).  <!-- status: COMPLETE -->
  - [x] P1.3 `CommandPalette.tsx` overlay component: dark-styled backdrop+panel (App.css, palette-aligned to the search-panel tokens, dark-only) absolutely positioned over `.editor-panel`; auto-focused filter input; keyboard-nav list (↓/↑ wrap, Enter run, Esc close); click(mousedown)-to-run; backdrop-click closes; renders `filterCommands(...)` output with an empty state. `data-testid` hooks for verify.  <!-- status: COMPLETE -->
  - [x] P1.4 Wired the capture-phase chord + palette into EditorPanel (owns the open file + override setter, so the palette lives here, not lifted to Workspace): a capture-phase `document` keydown listener (`addEventListener('keydown', h, true)`), **gated on `active`** (Workspace passes `active={visible}`, mirroring SublimeToolbar), toggles the palette + `preventDefault`s; inert when no file is open. Syntax-selection command set (Set Syntax: JS / JSX / TS / TSX / Rust / Markdown / Plain Text from `SYNTAX_MODES`) whose `run` calls the path-scoped override setter. `CommandPalette` mounted in the editor return.  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — scoped lint (7 files) clean, scoped tsc clean, scoped vitest 42/42 (paletteCommands+editorExtensions+language) -->
  - [x] verify-self  <!-- status: COMPLETE — subagent verified all 5 Observable Outcomes PASS (open/filter/nav/run/close, syntax-switch no-error, no stray "P" + preventDefault confirmed, zero console errors). Tauri-IPC-stubbed browser mount; token-highlight visual signal deferred to verify-human (headless mount has no viewport). No integration-boundary gap (outcomes cite the EditorPanel/.cm-content surface). -->
  - [x] verify-human  <!-- status: COMPLETE — operator: "all looking good / pass" 2026-06-20 (after a clean tauri dev relaunch) -->
    - [x] P1.verify-human.1 Open the palette while typing in the editor (Cmd+Shift+P with cursor in CM6) → palette opens, filter focused  <!-- status: PASS -->
    - [x] P1.verify-human.2 Filter + keyboard-nav + run a syntax command → list narrows, ↑/↓ move highlight, Enter runs + closes, Esc closes  <!-- status: PASS -->
    - [x] P1.verify-human.3 Syntax switch is VISIBLE: open a .md file, run "Set Syntax: Rust", confirm Rust tokens recolor  <!-- status: PASS — see markdown-highlighting note below -->
    - [x] P1.verify-human.4 No chord collision / no regression: Cmd+F (find) and Cmd+S (save) still work; Cmd+Shift+P doesn't leak a "P" or trigger a browser action  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: COMPLETE — +8 tests (4 language-facet: md/rs resolve, override forces rust on .md, unknown→plaintext — codifies the verify-human regression class; 4 SYNTAX_MODES/languageForId). Full suite 117/117, tsc+lint clean. Integration boundary (EditorPanel UI): live-DOM behavior codified by verify-self Playwright + native verify-human; durable automated coverage is the EditorState language-facet test per repo posture (pure→vitest, live-DOM→Playwright/manual; no jsdom harness installed). -->

- [x] Phase 2: Chord-coexistence + extension-point hardening  <!-- status: COMPLETE -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — operator approved Phase 1; directive is to complete WP3b
  - Requirements unchanged: yes — Phase 2 was always coexistence + extension-point hardening
  - Solution still feasible: yes — Phase 1 proved the capture-phase pattern; coexistence is verify + guard
  - No superior alternative discovered: yes — the verify-human scare was a dev-env (stale-HMR) artifact, no design change
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser (Playwright, focus inside CM6): the editor-internal chords still work with the palette wired in — **Cmd+F** opens the find panel, **Cmd+S** saves (no regression from the new capture-phase listener); **Cmd+P** (a bare-meta variant) does **not** open the palette (only Cmd+Shift+P does), proving the predicate distinguishes the WP6 chord from the palette chord.
  - Browser: opening the palette, then pressing **Cmd+Shift+P** again (or Esc) toggles/closes it; opening the palette does not break subsequent typing in the editor once closed.
  - CLI: `pnpm test` (vitest) passes including new `commandPalette.ts` cases — `filterCommands` substring/case/empty-query behavior and `isPaletteChord` accepts Cmd+Shift+P / rejects Cmd+P, Cmd+Shift+E, bare "p".
  - CLI: a `grep`/inspection check (or a code comment) documents the chord-ownership map so WP5 (panel-switch) and WP6 (Cmd+P) land without collision; `pnpm lint` + `tsc` clean.
  - [x] P2.1 Coexistence guard — the capture-phase palette listener already returns early for any chord where `isPaletteChord` is false (structural from Phase 1: it only acts when the predicate is true, so CM6's ⌘F/⌘S/⌘D/⌘R/⌘= pass through untouched). Codified with a chord-exclusivity matrix in `paletteCommands.test.ts`: ⌘⇧P is rejected against bare ⌘P (WP6), ⌘F/⌘R/⌘S/⌘D/⌘=, ⌘⇧E (WP8), and plain typing — proving no collision.  <!-- status: COMPLETE -->
  - [x] P2.2 Extension-point structure — already structural from Phase 1: the command set is composed in EditorPanel and passed into `<CommandPalette commands={...} />`, NOT hardcoded in the overlay (future WPs add a `{id,title,run}` entry, no overlay change). Documented the "add a command = one registry entry" extension point + the full chord-ownership map (⌘⇧P palette / ⌘P WP6 / ⌘⇧E WP8 / panel-switch WP5 / CM6 editor chords) in the `paletteCommands.ts` header for downstream WPs.  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — scoped lint clean, scoped tsc clean, scoped vitest 12/12 (paletteCommands incl. new chord-exclusivity matrix) -->
  - [x] verify-self  <!-- status: COMPLETE (mixed: CLI direct-PASS + browser UNVERIFIED→verify-human). CLI outcomes verified directly by orchestrator (no live app was running on :1420, so no subagent spawn against a dead URL): full suite 118/118 incl. exclusivity matrix, tsc clean, lint clean, chord-ownership map + extension-point documented (2 markers). Browser outcomes (⌘F/⌘S still work + bare ⌘P inert with palette wired in) UNVERIFIED — no running app; surfaced to verify-human. Mechanically covered too: the capture-phase listener acts ONLY when isPaletteChord is true, proven false for ⌘F/⌘S/bare-⌘P by the matrix, so editor chords structurally cannot be swallowed. -->
  - [x] verify-human  <!-- status: COMPLETE — operator: "approve" 2026-06-20 -->
    - [x] P2.verify-human.1 No regression: Cmd+F opens find, Cmd+S saves with the palette wired in  <!-- status: PASS -->
    - [x] P2.verify-human.2 No collision: bare Cmd+P does NOT open the palette; only Cmd+Shift+P does  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: COMPLETE — no new test written: Phase 2's behaviors (⌘F/⌘S unaffected, bare ⌘P inert) are ALREADY covered by the P2.1 chord-exclusivity matrix in paletteCommands.test.ts, which would fail if isPaletteChord ever broadened. Per the "skip if already covered" rule, no duplicate. Integration boundary (EditorPanel chord behavior) confirmed end-to-end by native-shell verify-human; durable guard is the matrix (repo posture: pure→vitest, live-DOM→manual). Full suite 118/118. -->

## Current Node
- **Path:** Feature > review-quality (complete) > finalize
- **Active scope:** none — shipped (3699a22), review-quality done (0 CRITICAL, 1 MAJOR + 2 MINOR auto-backlogged), ready to finalize
- **Blocked:** none
- **Unvisited:** none — both phases complete; next state = finalize
- **Open discoveries:** 3 code-quality findings auto-backlogged (see Code-Quality Review section + backlog-quality-findings.md)

## Code-Quality Review — m2-wp3b-command-palette

_(feature-review-quality on ship commit `3699a22`, drive_mode=autopilot, 2026-06-20)_

### Strengths
- Clean pure/impure split honored: `paletteCommands.ts` + `language.ts` carry no React/DOM and are vitest-tested, matching the `chord.ts`/`fontZoom.ts` precedent.
- The extensible command-registry seam is real: the command set is composed in `EditorPanel` and passed into `<CommandPalette commands={...}/>`; a future command is one `{id,title,run}` entry, no overlay change.
- Path-scoped language override derived during render (not via a reset effect) — idiomatic React, avoids the stale-override-on-file-switch bug class.
- `verify-codify` added a language-facet assertion targeting the verify-human markdown scare — codifies the "language extension silently absent" regression class.
- `isPaletteChord` mirrors `isSublimeChord`; the Shift-required distinction from WP6's bare ⌘P is locked by the chord-exclusivity matrix + the chord-ownership map.

### Issues
**CRITICAL** — (none)

**MAJOR**
- [theme.ts:176, editorExtensions.ts:60-65] The `languageCompartment` is **vestigial**: `.of()`-seeded but never `.reconfigure()`d — the language swap happens purely via the `languageOverrideId` useMemo dep forcing an array-identity rebuild (`@uiw` applies it as a full reconfigure). The comments claim two contradictory mechanisms ("reconfigure without rebuilding" vs "by rebuilding the extensions"), neither matching the code. The font-size compartment IS live-`.reconfigure()`d (in `applyZoom`); the language one is not. — *Fix: either drop the compartment and seed the language directly, OR actually live-`reconfigure` it and stop rebuilding on `languageOverrideId` change — and reconcile the comments either way.* **[AUTO-BACKLOGGED — Mode 3]**

**MINOR**
- [language.ts:80-97] `languageForId`'s switch duplicates `languageForExtension`'s pack-mapping arms; the "same packs, no second source of truth" comment overstates the design (two parallel switches that can drift — the extension path maps `js/cjs/mjs`, the id path only `javascript`). Consolidate via a shared id→Extension map. **[AUTO-BACKLOGGED — Mode 3]**
- [EditorPanel.tsx:36 vs SublimeToolbar.tsx:22] `EditorPanel.active` is optional-with-`true`-default while the mirrored `SublimeToolbar.active` is required; the asymmetry trades a compile-time gating guard for standalone-mount convenience (a forgotten `active` silently always-listens). **[AUTO-BACKLOGGED — Mode 3]**

### Assessment
Well-built, carefully-scoped feature that advances the codebase more than it accrues debt. Registry seam genuinely extensible, pure/DOM test split honored, render-time override derivation is the correct idiom. Test coverage thoughtfully aimed (chord-exclusivity matrix + language-facet codification target real risks, not count-padding). The one real debt is comment-vs-code drift around the vestigial language Compartment. Net: ship-quality, one MAJOR reconciliation + one MINOR de-dup worth a future pass.

### If you disagree
Dismiss any finding by editing this section in the WIP and marking the line `[DISMISSED]` before `feature-finalize` archives the file.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-20] Phase 1 (P1.1) — the pure module was first named `commandPalette.ts`, colliding on macOS's case-insensitive FS with the `CommandPalette.tsx` component (tsc TS1149/TS1261). Renamed the pure module to `paletteCommands.ts`. No backlog entry needed — resolved in-build, a naming convention note: keep pure-module names case-distinct from their PascalCase component siblings. Local convention, not a product-level surface.
## Retrospect
- **What changed in our understanding:** The palette is a *small* subsystem — the WP1 capture-phase finding did all the hard work up front, so the chord was a 10-line listener, not a research problem. The real design insight was that "Set Syntax" needs a runtime language **override** seam (default-from-extension, overridable), which the existing `fontSizeCompartment` pattern made obvious. Most of the WP's surface area turned out to be the override plumbing + tests, not the overlay.
- **Assumptions that held:** capture-phase `document` keydown fires inside CM6 (WP1 — confirmed live); the registry-as-prop extension point stayed clean; the pure→vitest / live-DOM→manual posture covered the feature without a jsdom harness.
- **Assumptions that were wrong:** I assumed a `Compartment` was *needed* to swap the language — the code-quality review (correctly) showed the compartment is **vestigial**: the array-identity rebuild on `languageOverrideId` already does the swap, so the compartment is dead weight + the comments describe a `.reconfigure()` that isn't wired. Auto-backlogged (SURFACE-2026-06-20-QUALITY-WP3B-VESTIGIAL-LANGUAGE-COMPARTMENT) for a refactor pass — behavior is correct, the abstraction is just unnecessary.
- **Approach delta:** Matched the 2-phase plan exactly. Two non-plan events: (1) a mid-build macOS case-collision rename (`commandPalette.ts`→`paletteCommands.ts`); (2) a verify-human markdown-highlighting scare that was a **stale-HMR artifact** of that rename, diagnosed empirically (byte-identical highlight classes in the live dev server) rather than guessed — no code change. Both logged as Discoveries with lessons.

## Closure
**Feature complete:** WP3b — Editor command palette has shipped (commit `3699a22`, local on `main`). It adds a Cmd+Shift+P command-palette overlay over the CodeMirror 6 editor whose first command set is syntax/mode selection (override the language for the open file), built on an extensible `{id,title,run}` registry and the WP1 capture-phase chord pattern. Verify it in the running Claudesk app: open a file, press ⌘⇧P, filter/arrow/Enter to run "Set Syntax: …". Requester = operator — closure notice for self-record.

- [SURFACED-2026-06-20] Phase 1 verify-human — operator reported "opening a .md file doesn't get markdown highlighting anymore," a suspected WP3b regression. **Diagnosed empirically (per the WP3a inspect-don't-guess lesson) as a stale-HMR artifact, NOT a code bug:** the mid-build `commandPalette.ts`→`paletteCommands.ts` rename left the long-running dev window's HMR half-applied (the export-not-found transients verify-self also saw), silently dropping the language extension in the live `EditorPanel`. Proof: built the editor both the WP3a way (bare `languageForPath`) and the WP3b way (compartment-wrapped) in the live dev server via Playwright `browser_evaluate` → **byte-identical highlight classes** (`ͼ25/ͼ28/ͼ24`), language facet = `markdown`, surviving a full reconfigure; current modules load clean, old `commandPalette.ts` gone. A clean `pnpm tauri dev` relaunch restored highlighting → operator confirmed PASS. **LESSON: a long-lived dev window across a mid-build file RENAME is a stale-HMR trap — when a "regression" appears right after a rename, reload/relaunch before suspecting the diff.** Not a product surface (dev-env artifact); no backlog entry.
