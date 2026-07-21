---
drive_mode: autopilot
---

# Feature: M4 WP4b — Left/right intra-workspace focus indicator

**Workflow:** feature
**State:** COMPLETED 2026-06-23 — shipped 647148f, review-quality clean (3 MINOR backlogged), finalized.
**Created:** 2026-06-23

## Problem Statement
At N workspaces each split into two interactive halves — the LEFT CC terminal (xterm) and the RIGHT panel (editor / diff / terminal) — "where will my keystrokes land" has no on-screen answer. WP4b adds a subtle persistent accent on the half of the **center-stage** workspace that currently holds keyboard focus, mirroring the visual language of the M2 WP3c split-pane active-*editor*-pane border (the `#6ea8ff` left-edge strip). This is the COARSER left-half-vs-right-half level; it must coexist with — not double-draw or fight — the finer which-editor-pane-within-the-right-half WP3c border. Independent of the filmstrip (depends on WP2 only — a focused workspace to indicate within). Folds in the focus-ambiguity gap the operator spotted 2026-06-22.

**[Updated 2026-06-23 — F12 back-loop re-check]** Problem statement unchanged in intent (indicate which half/pane holds focus). What we learned at verify-human: the "coexist with the WP3c per-pane border" task can't be satisfied because that border is itself broken in the current DOM — the WP11-Phase-5 refactor renamed the pane to `.editor-split-pane.is-active` and reverted its indicator to an `inset` box-shadow, which the opaque `.cm-editor` paints over once a file opens (the exact hazard the WP3c `::before` originally fixed; the WP3c `::before` rule was orphaned onto the stale `.editor-pane` class). Fix scope for P1.verify-human.3: restore the per-pane indicator as a `::before` strip that survives the opaque editor, and confirm the WP4b half accent coexists. No re-plan needed — this is inside the existing coexistence leaf.

## Design notes (reuse + placement)
- **Reuse target (visual):** the M2 WP3c active-pane indicator — `App.css:597` `.editor-panes:has(.editor-pane + .editor-pane) .editor-pane[data-active-pane="true"]::before` — a 2px `#6ea8ff` left-edge `::before` strip at `z-index:6`, opaque-editor-proof. WP4b reuses the SAME `#6ea8ff` accent token + the SAME `::before`-strip technique (the editor/xterm backgrounds are opaque `#000`/`#1e1e1e`, so an inset box-shadow would be painted over — the WP3c lesson, App.css:589-596).
- **Two halves:** `.workspace-left` (`Workspace.tsx:80`, contains XtermPane) and `.workspace-right` (the `RightPanelHost` root — confirm/ensure its root carries `.workspace-right`; `App.css:504`). These are the two `focusin`/`focusout` containers.
- **Center-stage only:** the indicator follows the genuinely-focused workspace. Background workspaces are off-viewport (`left:-99999px`, `Workspace.tsx:61-74`) and not focusable by the user; gate the indicator on `visible` so a stray programmatic focus in a background workspace never lights up.
- **Mechanism:** a per-workspace `data-focus-half` attribute on the `.workspace` root (values `"left" | "right" | "none"`), driven by capture-phase `focusin`/`focusout` listeners on the workspace root that read `event.target.closest('.workspace-left, .workspace-right')`. CSS selectors `.workspace[data-focus-half="left"] .workspace-left::before` / `[data-focus-half="right"] .workspace-right::before` paint the accent.
- **Pure seam (testable):** `deriveFocusHalf(target: Element | null): "left" | "right" | "none"` — given a focus event target, walk `closest()` and return which half (or none). Vitest-covered; the React effect is a thin wrapper that calls it and sets state.

## Work Tree

- [x] Phase 1: Focus-half tracking + accent render  <!-- status: [x] — all impl + verify nodes complete -->
  **Observable outcomes:**
  - Browser (Playwright): in the native dev app, click into the LEFT terminal half of the center-stage workspace → the `.workspace` root carries `data-focus-half="left"` and a `#6ea8ff` accent strip is visible on the left half; click into the RIGHT editor half → `data-focus-half="right"` and the accent moves to the right half. (Live-DOM posture: assert the `data-focus-half` attribute via `browser_evaluate` since the `::before` strip itself isn't in the a11y snapshot.)
  - Browser (Playwright): a background (off-viewport) workspace's `.workspace` root never has `data-focus-half` set to `left`/`right` (stays `none`) regardless of focus events — only the center-stage workspace indicates.
  - CLI: `pnpm vitest run` exits 0 with the new `focusHalf` derivation tests passing (`deriveFocusHalf` maps a target inside `.workspace-left` → `"left"`, inside `.workspace-right` → `"right"`, outside both → `"none"`).
  - CLI: `pnpm exec tsc --noEmit` exits 0; `pnpm lint` clean.
  - Console: no new JS errors on focus/blur transitions.
  - [x] P1.1 Add pure `deriveFocusHalf(target)` seam (new `src/components/workspace/focusHalf.ts`) — `closest('.workspace-left, .workspace-right')` → `"left" | "right" | "none"`. Duck-typed guard (`typeof target.closest === "function"`) NOT `instanceof Element` — the repo's vitest env is node (no DOM globals; `Element` is undefined → `instanceof` would throw ReferenceError). 5 tests pass.  <!-- status: [x] -->
  - [x] P1.2 Wire per-workspace focus tracking in `Workspace.tsx`: capture-phase `focusin`/`focusout` on the `.workspace` root via a ref, gated on `visible` (clears to "none" when hidden); set a `focusHalf` state → emit `data-focus-half` on the root. `focusout` derives the half from `relatedTarget` (where focus is going) so left↔right moves stay correct + leaving the workspace → "none". `RightPanelHost` root already carries `.workspace-right` (line 387) — no class addition needed.  <!-- status: [x] -->
  - [x] P1.3 Render the accent in `App.css`: `.workspace[data-focus-half="left"] .workspace-left::before` + `[data-focus-half="right"] .workspace-right::before` — a 2px `#6ea8ff` edge strip (`::before`, `z-index:6` above the opaque editor/xterm bg, `pointer-events:none`), reusing the WP3c token + technique. `.workspace-left` got `position:relative` (positioning context); `.workspace-right` already had it. Unfocused half shows no accent.  <!-- status: [x] -->
  - [x] P1.4 Coexistence: accents on OUTER edges (left half → left edge, right half → right edge) so they never sit on the central seam where the WP3c per-pane strip (inner `.editor-pane` left edge) lives. Different elements + opposite edges → distinct levels, no doubled line; the right panel can show both the half-frame (right edge) AND the WP3c pane strip (inner left edge) at once. Documented in the CSS comment.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — focusHalf 5/5, scoped lint clean, tsc clean; F12-fix is CSS-only (no TS touched, no test impact) -->
  - [x] verify-self  <!-- status: [x] — pure logic PASS (focusHalf 5/5); live DOM UNVERIFIED (Tauri IPC absent in plain-browser Playwright — WP3/WP4 posture; forwarded to native verify-human). F12-fix RE-VERIFIED via subagent: OUTCOME A PASS (new .editor-split-pane.is-active::before shipped, old box-shadow gone, z-index:6), OUTCOME B PASS (0 new console errors, only pre-existing IPC errors), OUTCOME C UNVERIFIED-environmental (no .workspace mounts → visual forwarded to verify-human). No BLOCKING → no back-loop. -->
  - [x] verify-human  <!-- status: [x] — all 4 leaves operator-PASSED (1/2/4 on first run 2026-06-23; 3 on re-run after the box-shadow→::before fix) -->
    - [x] P1.verify-human.1 Focus left terminal half → #6ea8ff accent on the LEFT edge of the left half  <!-- status: [x] — operator PASS 2026-06-23 -->
    - [x] P1.verify-human.2 Click into right editor half → accent MOVES to the RIGHT edge of the right half (left accent gone)  <!-- status: [x] — operator PASS 2026-06-23 -->
    - [x] P1.verify-human.3 Coexistence: with the editor split into 2 panes, the WP4b right-half accent + the WP3c per-pane strip both show without doubling/fighting  <!-- status: [x] — operator PASS on re-run 2026-06-23 after the fix; was FAILED first run — operator 2026-06-23: the split-pane active-pane border no longer shows when a FILE IS OPEN in a pane; still shows when the pane is empty ("No file open"). ROOT CAUSE (pre-existing, surfaced by this coexistence check): the WP11-Phase-5 DOM renders `.editor-split-pane.is-active` whose indicator is an `inset 2px 0 0` BOX-SHADOW (App.css:1057-1058) — which the opaque `.cm-editor` (#1e1e1e) paints over once a file loads (the exact hazard the WP3c ::before fix solved). The original WP3c ::before rule (App.css:634-645) targets the STALE `.editor-pane`/`.editor-panes` classes that no longer match the rendered DOM, so it never applies. FIX: convert the active-pane indicator to a ::before strip on `.editor-split-pane.is-active` (z-index above .cm-editor), coexisting with the WP4b half accent. -->
    - [x] P1.verify-human.4 At N≥2 workspaces, the backgrounded workspace shows NO accent; only the center-stage one indicates  <!-- status: [x] — operator PASS 2026-06-23 -->
  - [x] verify-codify  <!-- status: [x] — verified behavior already codified by focusHalf.test.ts (5 tests, the only pure-JS seam); CSS/visual paint + the box-shadow→::before fix have no extractable JS seam (no jsdom toolchain — backlog item), so live verify-human is the correct coverage level (WP3/WP4 posture). Full suite 426 pass, no regressions. -->

## Current Node
- **Path:** Feature > review-quality COMPLETE → finalize
- **Active scope:** none — shipped (647148f), review-quality clean (0 CRITICAL / 0 MAJOR / 3 MINOR auto-backlogged). Ready for /feature-finalize.
- **Blocked:** none
- **Unvisited:** none (single-phase feature) — after Phase 1 verify-codify completes, hand to ship → review-quality → finalize
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[VERIFY-SELF-2026-06-23] Phase 1 verify-self — the 4 live-DOM Observable outcomes could not be exercised by the Playwright subagent: it reaches the Vite dev URL as a plain browser with NO Tauri IPC bridge (`window.__TAURI_INTERNALS__` undefined), so no project loads → no `.workspace` mounts. The 2 console errors it saw are PRE-EXISTING (`useWorkspaceStatus.ts` `listen()` failing on the absent bridge), not from WP4b. Pure logic (`deriveFocusHalf`) is unit-proven (5/5); Vite confirmed serving the updated `deriveFocusHalf` + `data-focus-half` + `focusin`. This is the documented repo posture (WP3/WP4 verified workspace-UI live via native verify-human, not agent Playwright). Not a code defect → no F9b back-loop; outcomes annotated UNVERIFIED and forwarded to the native verify-human gate.

## Code-Quality Review — M4 WP4b Left/right intra-workspace focus indicator

### Strengths
- Clean pure/impure seam: `deriveFocusHalf` isolates the `closest()`-walk logic from the React effect, making the only branching logic unit-testable without a DOM harness — exactly the right factoring given this repo's node-only vitest env.
- The duck-typed `typeof target.closest === "function"` guard (over `instanceof Element`) is correct and well-justified — `instanceof Element` would throw `ReferenceError` in the node test env; the comment captures the WHY precisely.
- `focusout` derives the half from `relatedTarget` (where focus is going) rather than the leaving element — the subtle-but-correct choice that keeps left↔right transitions accurate and clears cleanly on workspace exit.
- The F12 back-loop fix is a genuine net improvement: it removes a dead orphaned selector (`.editor-pane[data-active-pane]`) AND repairs a silently-reintroduced regression (box-shadow painted over by opaque CodeMirror), restoring the WP3c `::before` technique on the correct live class.
- Effect correctly re-runs on `visible` and clears to `"none"` on hide, and the JSX double-gates with `data-focus-half={visible ? focusHalf : "none"}` — a stale accent on a demoted-while-focused workspace cannot leak.

### Issues
**CRITICAL** — (none)

**MAJOR** — (none)

**MINOR**
- [src/components/workspace/editor/EditorSplit.tsx:426] The `data-active-pane={...}` attribute on `.editor-split-pane` is now consumed by nothing — the only `[data-active-pane]` references left in the codebase are inside `App.css` *comments*. The F12 fix moved the live selector to `.editor-split-pane.is-active::before`, leaving `data-active-pane` a dangling render-time attribute. (Backlog-tier: outside this diff's authored lines.)
- [src/App.css ~443] The new WP4b block comment cross-references `.editor-pane[data-active-pane]` as the WP3c precedent, but that exact rule is the dead one this same commit deletes. The live precedent is now `.editor-split-pane.is-active::before`.
- [src/App.css WP4b + F12 blocks] The coexistence rationale (outer-edge vs inner-edge, "framed vs striped", z-index:6 parity) is documented near-verbatim in two places — will drift if the edge convention ever changes.

### Assessment
Well-built, appropriately-scoped feature. Right abstraction (pure derivation seam + thin capture-phase wrapper); tests cover every branch incl. the two real edge cases (null, non-Element). Effect lifecycle discipline (visible-gating, cleanup, relatedTarget derivation) reflects real care about the multi-workspace mount model. The bundled F12 fix was the right call to land atomically — the coexistence criterion couldn't be satisfied while the sibling indicator was broken, and the change strictly improves the codebase (one dead rule deleted, one regression repaired). Only debt is cosmetic: an unconsumed `data-active-pane` attribute + one stale comment cross-reference. Net: advances the codebase, negligible debt, no refactor warranted.

### If you disagree
Operator: dismiss any finding by editing this section and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:** The "coexist with the M2 split-pane border" task uncovered that the M2 active-pane border was *itself broken* — the WP11-Phase-5 DOM rename (`.editor-pane` → `.editor-split-pane`) had orphaned the original WP3c `::before` fix onto a now-dead class and reverted the live indicator to an `inset` box-shadow that the opaque CodeMirror editor paints over. A coexistence requirement turned into a regression hunt. Lesson: when a new feature is specced to "coexist with X", verifying X still works is part of the job.
- **Assumptions that held:** The pure-seam + thin-wrapper factoring (`deriveFocusHalf` + capture-phase effect) was right; the duck-typed guard correctly anticipated the node vitest env (no `Element` global). The `#6ea8ff` `::before`-strip reuse from WP3c was the correct technique. Outer-edge placement for the half accents cleanly avoided fighting the inner-edge per-pane strip.
- **Assumptions that were wrong:** I assumed the WP3c per-pane border was working and just needed to not be double-drawn. It wasn't working at all with a file open — only on empty panes. The plan's P1.4 framed coexistence as the risk; the real risk was the sibling indicator's pre-existing breakage.
- **Approach delta:** One unplanned F12 back-loop (verify-human reject on item 3) to fix the box-shadow→`::before` regression + delete the orphaned dead rule. Otherwise the implementation matched the plan: pure seam, capture-phase wiring, CSS accent, vitest coverage. The fix landed atomically in the same ship commit since the coexistence acceptance criterion genuinely couldn't pass without it.
