---
workflow: feature
drive_mode: autopilot
wbs: M2-WP8
---

# Feature: WP8 — Relocate Sublime launchers into the panel tab row as icon buttons; drop the Text hotkey

**Workflow:** feature
**State:** COMPLETED 2026-06-20 — shipped 62869de + cleanup 2940004 (local on main); finalized.
**Created:** 2026-06-20
**Entry:** spec (complex feature — redefined WP, multiple spec-time decisions + asset sourcing)
**Drive mode:** autopilot
**WBS:** Milestone 2, WP8 (REDEFINED by operator 2026-06-20 — supersedes the old "remove the Sublime Text pop, gated on WP9 parity" scope)

**Approved spec decisions (2026-06-20):** (1) inlined SVG icon components for both Sublime marks;
(2) launchers right-aligned in the `right-panel-toggle` row, separated from the Editor/Diff tabs by
a divider; (3) delete `SublimeToolbar.tsx`, move the two `invoke` handlers into a small pure
`sublimeLaunch.ts` helper. Frontend-only; backend untouched.

## Problem Statement

WP8 was originally scoped as the *removal* of the Milestone-1 Sublime **Text** stopgap once the
in-app editor proved daily-use parity. The operator **reversed that on 2026-06-20**: the Sublime
Text button is **kept** (both Sublime tools stay as launch affordances), the **parity gate is
dropped** (WP8 no longer removes the editor's escape hatch, so it needs no parity proof and is
**not gated on WP9**).

The new WP8 is a **UI consolidation**: today the two Sublime launchers live in a separate
`SublimeToolbar` strip at the very top of the right half (above the panel tab row), as
text-label buttons, and the Sublime **Text** launcher additionally has a `⌘⇧O` keydown hotkey.
This wastes vertical space (a whole toolbar row for two buttons), splits the right-half chrome
into two horizontal bands, and the Text hotkey is now redundant with the always-visible button.

We want both launchers **moved into the existing panel tab row** (the `right-panel-toggle`
tablist that holds the Editor / Diff tabs) as compact **icon buttons**, and the now-redundant
`⌘⇧O` Text hotkey **deleted**.

## User Stories

- As Stayman, I want the Sublime Text and Sublime Merge launchers to sit in the same row as the
  Editor/Diff panel tabs, so the right-half chrome is a single compact band instead of two.
- As Stayman, I want the launchers shown as recognizable **app icons** (not text labels), so the
  row stays compact and the buttons are instantly identifiable.
- As Stayman, I want the redundant `⌘⇧O` Sublime-Text hotkey gone, since the always-visible
  button now covers that affordance and the chord is dead weight.

## Acceptance Criteria

The feature is done when:

1. **Both launchers live in the `right-panel-toggle` tab row** of `RightPanelHost`, alongside the
   Editor and Diff `panel-tab` buttons. The standalone `SublimeToolbar` strip no longer renders
   above the panel body.
2. **Both launchers are icon buttons** — a Sublime Text mark and a Sublime Merge mark — with
   accessible labels (`aria-label` / `title`) naming each app. No visible text label.
3. **Both buttons still call their existing backend command** unchanged: Text → `sublime_open`,
   Merge → `smerge_open`, each with the workspace's `projectPath`. Rejections are surfaced
   (kept: the existing `.catch` → `console.error`), not dead-clicked.
4. **The `⌘⇧O` Sublime-Text hotkey is removed** — the `keydown` listener in `SublimeToolbar` and
   the `src/sublime/chord.ts` module (the Text-only matcher + `SUBLIME_CHORD_LABEL`) are deleted,
   along with `chord.test.ts`. No `⌘⇧O` handler remains anywhere.
5. **The panel-select chords still work** — `⌘⇧E` (Editor) / `⌘⇧D` (Diff) and `⌘P` (finder) are
   untouched; `panelHost.ts` + `finderChord.ts` unchanged. (`⌘⇧O` is freed, unused.)
6. **Sublime Merge has no chord** (it never did) — unchanged.
7. **Icons are visually consistent with the dark tab row** — sized to match `.panel-tab`, dark-mode
   styled, with a hover state. The launchers are visually distinguishable from the panel *tabs*
   (they are actions, not selectable tabs) — e.g. placed at the row's right edge with a divider.
8. **Gates green:** `cargo test` (backend untouched but must stay green), `vitest`, `tsc`,
   `eslint`, `prettier` all clean. The dropped `chord.test.ts` removes its tests; new tests cover
   the relocated buttons' presence + invoke wiring.
9. **Backend is untouched** — `sublime_open`, `smerge_open`, `find_subl`/`find_smerge`, the shared
   `resolve`/`tool_command`/`spawn`, and all consts STAY. No Rust changes beyond (none expected).

## Out of Scope

- **No backend changes.** The whole `src-tauri/.../sublime/` module stays exactly as-is — both
  commands, both resolvers, the shared spawn path, all consts. (Reverses the old WP8's backend
  Text-path deletion.)
- **No removal of either Sublime launcher.** Both are kept permanently (Merge always was; Text is
  now also permanent per the operator reversal).
- **No parity gate, no WP9 dependency.** Dropped per operator.
- **No new hotkey for the launchers.** The buttons are the only affordance; `⌘⇧O` is freed and
  left unbound (not reassigned).
- **No change to the Editor/Diff panel tabs themselves**, the panel-select chord scheme, the
  finder chord, the FileTree rail, or any panel content.
- **The `⌘⇧T` Terminal tab** (WP9) is still out — unaffected.

## Technical Constraints

- **External-tool probe already complete:** WP3 (`docs/product/archive/phase-1-bare-shell-poc/`)
  established the `subl`/`smerge` invocation contract; both `sublime_open` and `smerge_open` ship
  and work. No new probe needed — this feature only moves the *frontend* affordances.
- **Affected files (frontend only):**
  - `src/components/workspace/RightPanelHost.tsx` — remove the `<SublimeToolbar>` render; add the
    two icon buttons into the `right-panel-toggle` row; drop the `SublimeToolbar` import.
  - `src/components/workspace/SublimeToolbar.tsx` — **deleted** (its two `invoke` calls move inline
    or into a small `sublimeLaunch.ts` helper; decided at plan). Its `active`-gated `⌘⇧O` effect is
    removed entirely.
  - `src/sublime/chord.ts` + `src/sublime/__tests__/chord.test.ts` — **deleted** (Text-only chord).
  - `src/App.css` — relocate/adapt `.sublime-toolbar` / `.sublime-open-button` styles into an
    icon-button style that sits in `.right-panel-toggle`; remove the now-dead `.sublime-kbd`.
  - New icon assets (see Open Questions) + a test for the relocated buttons.
- **Dark-mode-only** (CLAUDE.md): icons + button styling must be unconditionally dark; no
  `prefers-color-scheme` blocks.
- **`active`/`visible` gating:** the buttons launch the *focused* workspace's project — they live in
  `RightPanelHost`, which already only behaves live when `visible`. The buttons take `projectPath`
  directly (always correct for that host instance); no chord-style `active` gate needed since a
  click on a backgrounded host can't happen (it's `display:none`). Verify this holds.
- **WBS resync is part of this WP:** the `wbs.md` WP8 section (lines ~156–167), the M2 critical-path
  note (lines ~199–215, esp. the "parity gate unblocks WP8" / "WP8 gated and last" wording), and
  WP9's parity-gate task wording all describe the OLD scope and must be rewritten to the new scope
  (KEEP both buttons, drop the hotkey, relocate to tab row, no WP9 gate). arch.md Revision-2026-06-20
  note + the "Sublime pop removed at WP8" design constraint also need a touch-up at finalize.

## Open Questions

- [ ] **Icon sourcing.** RECOMMENDATION: **inlined SVG** components (redrawn simple Sublime Text /
      Sublime Merge marks) bundled in the repo — crisp at tab size, dark-mode tintable, no dependency
      on the user's local `.app` bundles (the local `.icns` are raster and path-fragile). Alternative:
      copy each app's `.icns`→`png` into `public/`. **Decide at plan.** (Lean: inline SVG.)
- [ ] **Button placement within the row.** RECOMMENDATION: **right-aligned**, pushed to the far edge
      with `margin-left:auto` + a thin divider, so they read as *actions* distinct from the
      left-aligned Editor/Diff *tabs*. Alternative: immediately after the Diff tab. **Decide at plan.**
- [ ] **`SublimeToolbar.tsx` fate.** RECOMMENDATION: **delete it** and inline the two `invoke`
      handlers (or a tiny `sublimeLaunch.ts` with `openSublime`/`openSublimeMerge`) into
      RightPanelHost — the component's only remaining job (two buttons) moves into the tab row, and a
      thin wrapper would be vestigial. **Decide at plan.** (Lean: delete + small helper module.)

## Work Tree

- [x] Phase 1: Relocate launchers into the tab row as icon buttons + delete the ⌘⇧O hotkey  <!-- status: done -->【all impl + verify nodes complete】
  **Observable outcomes:**
  - Browser: Playwright loads the app (dev `?ws=<dir>` seed), opens a workspace; the right half shows a SINGLE chrome band — the `right-panel-toggle` tablist — with NO separate `.sublime-toolbar` strip above it (`document.querySelector('.sublime-toolbar')` is null).
  - Browser: that tablist contains the `panel-tab-editor` + `panel-tab-diff` buttons (left) AND two launcher buttons at the right edge — `[data-testid=sublime-open]` and `[data-testid=smerge-open]` — each rendering an `<svg>` (icon), each with a non-empty `aria-label`/`title` naming its app, and NO visible text label.
  - Browser: clicking `[data-testid=sublime-open]` invokes the Tauri command `sublime_open` with `{projectPath}`; clicking `[data-testid=smerge-open]` invokes `smerge_open` with `{projectPath}` (assert via a stubbed `@tauri-apps/api/core` invoke spy in a vitest component test, or Playwright `window.__TAURI__` mock).
  - CLI: `rg -n "isSublimeChord|SUBLIME_CHORD_LABEL|sublime/chord" src` returns NOTHING (the chord module + all references are gone); `test ! -f src/sublime/chord.ts && test ! -f src/sublime/__tests__/chord.test.ts && test ! -f src/components/workspace/SublimeToolbar.tsx` all pass (files deleted).
  - CLI: `rg -n "keydown" src/components/workspace/SublimeToolbar.tsx 2>/dev/null` finds no file; `rg -n "⌘⇧O|metaKey.*shiftKey.*o" src` finds no ⌘⇧O handler anywhere.
  - CLI: `pnpm exec tsc --noEmit` exits 0; `pnpm lint` exits 0; `pnpm exec prettier --check src` exits 0.
  - CLI: `pnpm test` (vitest) exits 0 — `chord.test.ts` is gone, the new `sublimeLaunch` test passes, and the panel-select/finder chord tests (`panelHost.test.ts`, `finderChord.test.ts`) still pass unchanged.
  - CLI: `cd src-tauri && cargo test` exits 0 (backend untouched, still green).
  - [x] P1.1 Create `src/sublime/icons/SublimeTextIcon.tsx` + `SublimeMergeIcon.tsx` — small inlined-SVG React components (recognizable Sublime Text / Sublime Merge marks), `currentColor`-tintable, sized for the tab row (≈16px), `aria-hidden` (label lives on the button)  <!-- status: done -->
  - [x] P1.2 Create `src/sublime/sublimeLaunch.ts` — extract `openSublime(projectPath)` + `openSublimeMerge(projectPath)`, each keeping the `.catch` → `console.error` surface; export both. (Used an INJECTABLE `Invoker` defaulting to the real `invoke` — matches the repo's pure-core test convention, no `vi.mock` needed.)  <!-- status: done -->
  - [x] P1.3 Edit `RightPanelHost.tsx`: dropped the `<SublimeToolbar>` render + import; added the two icon `<button>`s into the `.right-panel-toggle` row after the Diff tab, right-aligned past a `.panel-launch-group` divider (`margin-left:auto`). Each: `type=button`, `data-testid`, `aria-label`+`title`, `onClick` → `sublimeLaunch` helper with `projectPath`, icon child. NOT `role=tab`.  <!-- status: done -->
  - [x] P1.4 Deleted `SublimeToolbar.tsx`, `sublime/chord.ts`, `sublime/__tests__/chord.test.ts` (via `git rm`)  <!-- status: done -->
  - [x] P1.5 `App.css`: removed `.sublime-toolbar`/`.sublime-open-button`/`:hover`/`.sublime-kbd`; added `.panel-launch` (icon-button, sized to `.panel-tab`) + `:hover` + `.panel-launch-group` right-align divider, all dark-only  <!-- status: done -->
  - [x] P1.6 Added `sublime/__tests__/sublimeLaunch.test.ts` — injectable `Invoker`; asserts command name + `{projectPath}` + caught-rejection (no throw). Also FIXED `paletteCommands.test.ts`: removed the deleted `isSublimeChord` import, dropped the ⌘⇧O row from the exclusivity matrix, added a "⌘⇧O is FREED" assertion.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc/eslint clean, scoped vitest 21/21 (full suite 206/206 + cargo 90 at build) -->
  - [x] verify-self  <!-- status: done — subagent confirmed all 5 Observable Outcomes PASS (single chrome band, both icon launchers with svg+aria-label+no-text in correct DOM order past the divider, clicks don't crash, clean load). Browser observation via ?ws= seed seam; the only console errors were the EXPECTED caught invoke-rejections (no Tauri IPC host in plain-browser dev). -->
  - [x] verify-human  <!-- status: done — operator confirmed "all pass" 2026-06-20 -->
    - [x] P1.verify-human.1 Icons read recognizably as Sublime Text / Sublime Merge at tab size  <!-- status: done -->
    - [x] P1.verify-human.2 Right-aligned placement past the divider looks correct in the tab row  <!-- status: done -->
    - [x] P1.verify-human.3 Sublime Text button launches Sublime Text (real Tauri build)  <!-- status: done -->
    - [x] P1.verify-human.4 Sublime Merge button launches Sublime Merge (real Tauri build)  <!-- status: done -->
    - [x] P1.verify-human.5 ⌘⇧O no longer pops Sublime Text (hotkey removed)  <!-- status: done -->
    - [x] P1.verify-human.6 ⌘⇧E/⌘⇧D panel-select + ⌘P finder still work (no regression)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — no new tests warranted: command-wiring + chord-exclusivity already covered by sublimeLaunch.test.ts + paletteCommands.test.ts (built in P1.6); icon/DOM/placement covered by verify-self Playwright + human approval, per the repo's pure-logic-unit / live-DOM-Playwright convention. Full suite green: vitest 206/206, cargo 90/90. -->

- [x] Phase 2: Resync WBS + arch docs to the new WP8 scope  <!-- status: done -->【all impl + verify nodes complete】
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — operator's standing directive is to halt at WBS-WP boundaries; the WBS is the shared source of truth and is currently stale on WP8.
  - Requirements unchanged: yes — Phase 1 shipped exactly the redefined scope; the doc resync reflects it.
  - Solution still feasible: yes — pure doc edits.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `rg -n "gated on.*parity|parity gate.*WP8|WP8.*parity|Remove the Sublime \*Text\* pop" docs/product/wbs.md` returns NOTHING — the old "remove the Text pop, gated on WP9 parity" framing is gone from the WP8 section, the critical-path note, and WP9's parity-gate task.
  - CLI: `rg -n "WP8" docs/product/wbs.md` shows the WP8 section now describes "relocate both Sublime launchers into the tab row as icon buttons + drop the ⌘⇧O hotkey; KEEP both buttons; backend untouched; NOT gated on WP9".
  - CLI: the M2 critical-path diagram/line no longer routes `WP9 parity gate ─► WP8`; WP8 is shown as independent of WP9's gate.
  - CLI: `rg -n "Sublime.*Text.*pop.*removed|removed at WP8|in-app editor replaces Sublime Text" docs/product/arch.md docs/product/vision.md` — any surviving "Text pop removed at WP8" design-constraint wording is reconciled (a Revision note added or the constraint updated to "both Sublime buttons kept").
  - [x] P2.1 Rewrote `wbs.md` WP8 section (title + REDEFINED callout + Description + Dependencies + Size + Tasks) to the new scope; dropped the WP9-parity gate-check task; marked WP8 ✅ SHIPPED; updated the header tally (9/12→10/12) + the cycle-scope "replaces Sublime Text" phrasing  <!-- status: done -->
  - [x] P2.2 Updated the M2 critical-path diagram + notes: removed the `WP9 PARITY GATE ─► WP8` routing, added WP8 as a parallel slice off WP5; rewrote the "WP8 gated and last" bullet to "NOT gated and NOT last"  <!-- status: done -->
  - [x] P2.3 Reworded WP9's parity task → "EDITOR-PARITY DOGFOOD CHECKPOINT (informational; gates nothing)"; updated WP9 exit-criteria to drop "Sublime Text pop is removed"  <!-- status: done -->
  - [x] P2.4 Added arch.md top-of-file Revision-2026-06-20 note; reconciled the 3 highest-traffic inline spots (component-table `sublime_open` row, the in-app-hotkey Key Decision, the M2 "Sublime Text pop removed" design constraint); added a 2026-06-20 SURFACE-IN history entry to wbs.md  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — O1–O4 doc-resync greps pass; prettier clean (docs .prettierignore'd, src unaffected). verify-auto caught a missed stale line (wbs.md M2-ordering-rationale item 6 "Gated Sublime-pop removal LAST") — fixed in-place (same P2.1/P2.2 resync family). Remaining old-framing matches are correctly-dated SURFACE-IN/Revision history entries (append-don't-rewrite convention). -->
  - [x] verify-self  <!-- status: done — fresh subagent confirmed all 5 CLI outcomes PASS: no live old-framing (5 matches all historical/superseded), WP8 new scope present, no live parity→WP8 routing, arch.md Revision note present + no live "removed at M2", WIP structure intact (2 Phase nodes). No integration boundary — docs-only edits. -->
  - [x] verify-human  <!-- status: done — AUTO-SKIPPED (F11) per drive_mode=autopilot: no integration boundary (docs-only edits to wbs.md + arch.md, nothing consumes them), verify-self all-PASS, no outcome cites a consuming surface. Affirmation block printed for operator read-time veto. -->
  - [x] verify-codify  <!-- status: done — no new tests warranted: docs-only phase, no executable behavior to codify; resync correctness grep-verified in verify-auto + verify-self. A string-grep test would be brittle (breaks on next legit doc edit) and isn't the repo convention. Full suite green: vitest 206/206, cargo 90/90. -->【all impl + verify nodes complete】

## Current Node
- **Path:** Feature > review-quality complete → finalize
- **Active scope:** Shipped (62869de) + review-quality done (0 CRITICAL/0 MAJOR/3 MINOR, all 3 fixed inline → 2940004). Ready for `/feature-finalize`.
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none
- **Build note:** all gates green at build exit — tsc/eslint/prettier clean, vitest 206/206, cargo test 90 passed. One in-scope fix beyond the plan: `paletteCommands.test.ts` imported the now-deleted `isSublimeChord`; updated its chord-exclusivity matrix to drop ⌘⇧O and assert it is now FREED.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> ; each also logged to workflow/backlog.md -->
- none yet

## Code-Quality Review — m2-wp8-sublime-buttons-into-tab-row

*Reviewed against ship commit `62869de` (autopilot). 0 CRITICAL, 0 MAJOR, 3 MINOR.*

### Strengths
- Clean `sublimeLaunch.ts` extraction with an injectable `Invoker` (defaulting to real `invoke`) — unit-testable without `vi.mock`, matching the repo's pure-core convention; test covers happy + surfaced-rejection paths.
- Inlined `currentColor` SVG icons (no raster asset, no dependency on the user's local `.app`) — right call for dark-only tab-tinted buttons, well-documented WHY.
- Accessibility correct: `aria-label`+`title` on the button, `aria-hidden`/`focusable="false"` on the SVGs; buttons deliberately NOT `role="tab"` (actions, not selectable tabs).
- The chord-exclusivity test was *updated* (⌘⇧O row removed + a dedicated "⌘⇧O is freed" assertion added), codifying the freed-chord invariant rather than silently dropping it.
- Thorough deletion: `chord.ts`/`chord.test.ts`/`SublimeToolbar.tsx` gone with no dangling imports.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR** (all 3 FIXED INLINE during review — see note below)
- [src/App.css:200-202] Orphaned `.sublime-toolbar` comment block (body deleted, header survived). — FIXED (removed).
- [src/App.css:547] CSS comment said "beneath the Sublime toolbar" (no longer exists). — FIXED ("beneath the panel tab row").
- [RightPanelHost.tsx:29 + Workspace.tsx:5] `projectPath`/header comments referenced "the toolbar(s)". — FIXED (now name the Sublime launch buttons / panel tab row).

### Assessment
Well-built, tightly-scoped frontend consolidation that does exactly what the redefined spec asked with good hygiene (testable helper, re-codified invariant, a11y + dark-mode respected). Net +473/-244 with two whole modules deleted — advances the codebase, no debt. Only blemishes were 3 stale comments left by the toolbar deletion; reviewer said "no refactor warranted, appropriate to auto-backlog." **Decision: fixed all 3 inline before finalize** (trivial 1-line comment edits directly caused by this diff — cleaner than backlogging cosmetic rot). prettier clean post-fix; no live "Sublime toolbar" refs remain (only the intentional historical note in `sublimeLaunch.ts`).

### If you disagree
Operator: dismiss any finding by marking it `[DISMISSED]` in this section before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The biggest realization was the *blast radius* of a vision-level reversal. WP8 itself was a small, clean frontend job — but "keep Sublime Text instead of removing it" contradicted a Core Principle that had been propagated into 6 docs (wbs, arch, roadmap, CLAUDE.md, vision, + the WP8 plan). Most of the work-by-volume was doc reconciliation, not code.
- **Assumptions that held:** The injectable-`Invoker` pattern for `sublimeLaunch.ts` fit the repo's "pure-core, no `vi.mock`" convention exactly; inlined SVG icons were the right call (no `.app`-bundle dependency); the capture-phase chord scheme was untouched and the `⌘⇧O`-freed invariant codified cleanly in the existing exclusivity matrix.
- **Assumptions that were wrong:** I initially scoped the WBS resync to "the WP8 section + critical path" — but verify-auto caught a stale line in the *M2 ordering-rationale* list (item 6) that I'd missed. The grep-based observable outcomes earned their keep. Also under-estimated the durable-doc reach: the plan named arch.md but not CLAUDE.md/vision.md/roadmap.md, which surfaced at finalize.
- **Approach delta:** Two phases as planned (frontend + doc resync). Deltas: (1) `paletteCommands.test.ts` needed an in-scope fix not in the plan (it imported the deleted `isSublimeChord`); (2) the 3 review-quality MINOR nits were fixed inline rather than auto-backlogged (trivial stale comments from this diff); (3) CLAUDE.md + vision.md durable-doc resync was done at finalize per operator decision (the plan had deferred them implicitly to /product-finalize).

## Notes
- No git remote — commits land local on `main`.
- The 3 MINOR doc-nit findings from the *old* WP8 ship (`wp8-sublime-hotkey`, commit `74dfc2c`,
  in `workflow/backlog-quality-findings.md`) reference `chord.ts` and the WP8 launch mechanism;
  since `chord.ts` is deleted here, those nits are mooted — note at finalize.
- Before any `pnpm tauri dev`: `lsof -ti:1420 | xargs kill` (Tauri strictPort fails if stale Vite holds :1420).
- Verify-self for the workspace UI uses the dev `?ws=<dir>` / `window.__seedWorkspace` seed seam (WP6).
