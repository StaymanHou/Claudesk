# Feature: M4 WP4 — Filmstrip collapse toggle

**Workflow:** feature
**State:** COMPLETED 2026-06-23 — feature commit d06ac50 (local-only); finalized + archived
**Created:** 2026-06-23
**drive_mode:** autopilot

## Problem Statement
The WP3 filmstrip (commit `920678a`) renders one tile per workspace with a live ~1 fps `serializeAsHTML()` mirror on background tiles — rich, but it eats 84px of vertical space and runs a perpetual serialize ticker. WP4 adds a **collapse toggle**: a window-chrome control that switches the filmstrip between **expanded** (the current full thumbnail tiles) and **collapsed** (a one-line row of mini status pills — project name + the same M3-driven status dot, no live preview). Collapsing reclaims vertical space *and* stops the serialize mirror loop so the background-render CPU cost drops to zero (backgrounds still buffer PTY output to xterm scrollback per the M1 rule — only the *mirror read* stops). The collapsed/expanded preference persists across restarts (localStorage, mirroring the M2 `railWidth.ts` / WP3 `filmstripOrder.ts` app-global UI-chrome pattern). Click-to-promote must still work from a collapsed pill — glance→switch from the thin row is a core vision-metric-4 path.

## Work Tree

- [x] Phase 1: Collapse state, persisted toggle, collapsed pill row  <!-- status: done -->
  **Observable outcomes:**
  - Browser: With ≥2 workspaces open, the filmstrip shows a toggle control (data-testid `filmstrip-collapse-toggle`). Clicking it collapses the strip to a one-line pill row: each background workspace renders a `filmstrip-pill-<id>` element containing the project name + a `WorkspaceStatusIndicator` dot, NO `filmstrip-tile-mirror` node present in collapsed mode. Clicking again expands back to full tiles. No JS console errors.
  - Browser: Clicking a collapsed pill (`filmstrip-pill-<id>`) for a background workspace promotes it to center stage (the CenterStage shows that workspace; the previously-active workspace demotes). Verified via Playwright click + snapshot of the active workspace.
  - Browser: After collapsing then reloading the page (close+reopen browser context for a clean ES-module reload), the filmstrip re-renders collapsed — the preference persisted. After expanding + reload, it re-renders expanded.
  - CLI: `pnpm vitest run` passes, including new tests for the pure collapse-preference load/save helper (`filmstripCollapse.ts`): default (nothing stored) → expanded; stored "collapsed" → collapsed; unparseable/absent → expanded default; save round-trips. `pnpm tsc --noEmit` + `pnpm lint` clean.
  - [x] P1.1 Add `src/components/workspace/filmstripCollapse.ts` — pure load/save helpers mirroring `filetree/railWidth.ts` (localStorage key `claudesk.filmstripCollapsed`, boolean; `loadCollapsed()` defaults `false`=expanded, never throws; `saveCollapsed(boolean)` best-effort). vitest-testable, no React/DOM beyond localStorage.  <!-- status: done; +filmstripCollapse.test.ts 6 tests pass -->
  - [x] P1.2 In `App.tsx`: add `const [collapsed, setCollapsed] = useState(() => loadCollapsed())`; a `toggleCollapsed` callback that flips state + `saveCollapsed`. Pass `collapsed` + `onToggleCollapsed` to `<Filmstrip>`.  <!-- status: done -->
  - [x] P1.3 In `Filmstrip.tsx`: accept `collapsed` + `onToggleCollapsed` props. Render the toggle control (a small chevron/bar button in the strip chrome, `data-testid="filmstrip-collapse-toggle"`, `aria-expanded`). When `collapsed`, render the pill row instead of tiles: each tile becomes a `.filmstrip-pill` (project name + `WorkspaceStatusIndicator`, no mirror body, no `data-tile-index` drag wiring needed but click-to-promote preserved via onPromote). The "+" add control stays in both modes.  <!-- status: done -->
  - [x] P1.4 `App.css`: `.filmstrip--collapsed` height (~28px one-line row); `.filmstrip-pill` styling (compact horizontal chip: name + dot, reuse the `#6ea8ff` active accent for the active pill); `.filmstrip-collapse-toggle` control styling (dark-only palette, consistent with existing chrome). Active pill marked (`--active`) like the active tile.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; tsc clean, eslint exit 0 on 4 files, vitest workspace suite 76/76 -->
  - [x] verify-self  <!-- status: done; subagent 3/3 PASS — toggle collapses/expands (tiles↔pills, 0 mirror nodes collapsed), click-promote from pill works, localStorage persist+read-on-mount confirmed; only console errors are absent-Tauri-backend (out of scope) -->
  - [x] verify-human  <!-- status: done; operator PASS all 6 (toggle collapse/expand, click-promote from pill, persist-across-relaunch, pill-row visual, mirror-stops-on-collapse preview) -->
    - [x] P1.verify-human.1 collapse → thin pill row  <!-- status: done -->
    - [x] P1.verify-human.2 expand → tiles return  <!-- status: done -->
    - [x] P1.verify-human.3 click non-active pill → promotes  <!-- status: done -->
    - [x] P1.verify-human.4 persist across relaunch  <!-- status: done -->
    - [x] P1.verify-human.5 pill-row visual quality  <!-- status: done -->
    - [x] P1.verify-human.6 mirror stops on collapse / resumes on expand (Phase 2 preview)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done; persistence pinned by filmstripCollapse.test.ts (6); render-mode/click-promote/mirror-absence are Playwright-verified per repo posture (no RTL dep); full suite 417/417 green (+6 vs WP3) -->

- [x] Phase 2: Stop the serialize mirror loop on collapse  <!-- status: done -->
  **Observable outcomes:**
  - Browser: With ≥2 workspaces and the filmstrip expanded, the mirror ticker is running (background `filmstrip-tile-mirror` nodes receive `innerHTML` updates ~1 fps — observable via a Playwright `browser_evaluate` that wraps/counts `serializeTerminal` calls, or by asserting mirror innerHTML changes over a ~2s window). On collapse, `serializeTerminal` stops being called (call count frozen) — the loop is halted; on re-expand it resumes (call count climbs again).
  - Browser: While collapsed, background workspaces still buffer output (M1 rule) — re-expanding shows a fresh mirror frame within ~1s (the immediate-first-frame `tick()` on the restarted effect), proving the buffer kept updating even though the read was paused. No JS console errors across collapse/expand cycles.
  - CLI: `pnpm vitest run` passes, including a test for the loop-gating predicate (the ticker effect does NOT start its interval when `collapsed` is true — extract the "should the ticker run" decision to a pure boolean if cleanly extractable, else assert via the effect's dependency contract). `pnpm tsc --noEmit` + `pnpm lint` clean.
  - [x] P2.1 In `Filmstrip.tsx`: gate the mirror ticker `useEffect` on `!collapsed` — when collapsed, do not start the interval (early return) so `serializeTerminal` is never called; add `collapsed` to the effect deps so toggling expand→collapse tears down the interval (cleanup) and collapse→expand restarts it (with the immediate first `tick()`). Collapsed pills render no mirror, so there is nothing to write.  <!-- status: done; landed in the P1.3 component edit, now expressed via shouldRunMirror() -->
  - [x] P2.2 Extracted the gating decision to pure `shouldRunMirror(collapsed, backgroundCount)` in `mirrorTicker.ts`; Filmstrip's ticker effect now calls it (`if (!shouldRunMirror(collapsed, backgroundIds.length)) return;`). `document.hidden` stays a per-frame inline skip (not a should-the-interval-exist decision). Pinned by `mirrorTicker.test.ts` (4 tests).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; tsc clean, eslint exit 0 on 3 files, vitest workspace suite 80/80 (+4 mirrorTicker) -->
  - [x] verify-self  <!-- status: done; subagent 4/4 PASS — expanded has mirror nodes, collapse → 0 mirror nodes (loop halted, CPU→0), 6× rapid collapse/expand cycling clean (no effect-cleanup/null/unmount errors; error count flat at the 4 expected absent-backend ones), resume-on-expand restores mirror within ~900ms. NOTE: active tile DOES render a mirror DOM node (count was 2 w/ 2 ws, not 1) but the ticker excludes it via bgSignature + clears its innerHTML — correct skip, just a DOM-structure detail, not a defect. -->
  - [x] verify-human  <!-- status: done; operator PASS all 4 (expanded mirror updates, collapse → mirror gone/CPU stops, expand → mirror resumes <1s, rapid toggle clean) — confirmed in native app w/ real PTY output -->
    - [x] P2.verify-human.1 expanded bg tile mirror updates  <!-- status: done -->
    - [x] P2.verify-human.2 collapse → mirror gone, serialize work stops  <!-- status: done -->
    - [x] P2.verify-human.3 expand → mirror resumes <1s  <!-- status: done -->
    - [x] P2.verify-human.4 rapid toggle clean (no flicker/blank/errors)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done; shouldRunMirror pinned by mirrorTicker.test.ts (4); effect teardown/restart + visible stop/resume verified live (verify-self + native verify-human) per repo live-DOM posture (no RTL dup); full suite 421/421 green -->

## Current Node
- **Path:** Feature > COMPLETE > review-quality (done) > finalize
- **Active scope:** Shipped (d06ac50). review-quality done: 0 CRITICAL / 0 MAJOR / 3 MINOR (2 actionable) auto-backlogged. Next: /feature-finalize.
- **Blocked:** none
- **Unvisited:** Phase 2 verify chain (verify-self → verify-human → verify-codify), then ship
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

## Retrospect
- **What changed in our understanding:** Almost nothing — WP4 was a clean display-mode layer over the WP3 filmstrip exactly as the WBS framed it. The one mid-build realization was that the P2 ticker-gate (`if (collapsed) return;` + `collapsed` in deps) lives in the *same* `useEffect` as the P1 render branch's component, so it landed during the Phase-1 component edit rather than as a separate Phase-2 code change — Phase 2 then reduced to extracting the pure `shouldRunMirror` helper + pinning it. The phase split stayed honest because each phase's *observable outcome* (P1: tiles↔pills + persist; P2: loop-stop call-freeze) was independently verified.
- **Assumptions that held:** The `railWidth.ts`/`filmstripOrder.ts` localStorage pattern transferred byte-for-byte. The repo's pure-logic→vitest / live-DOM→Playwright posture covered the feature with no need to add `@testing-library`. The collapsed pills' lack of `data-tile-index` made the existing strip pointer-drag handlers no-op cleanly in collapsed mode (no extra guard needed). The `#6ea8ff` active-accent reuse gave free cross-mode visual consistency.
- **Assumptions that were wrong:** Predicted the mirror-node count at N=2 would be 1 (only the background tile) — verify-self found it was 2: the ACTIVE tile also renders a `filmstrip-tile-mirror` DOM node (the ticker just never writes to it, via `bgSignature` exclusion + an innerHTML clear). Correct behavior, wrong mental model of the DOM shape. Benign; surfaced as a verify-self note, not a defect.
- **Approach delta:** Matched the plan. Two phases, build→verify chain ran clean with zero back-loops (no F9b/F12/F23). Only deviation from a "pure" phase boundary: the P2 impl gate co-landed with P1 (noted above), which actually *reduced* total churn.

## Code-Quality Review — m4-wp4-filmstrip-collapse
<!-- feature-review-quality on ship commit d06ac50; drive_mode=autopilot (Mode 3). 0 CRITICAL, 0 MAJOR, 3 MINOR → MINORs auto-backlogged (Case C), F39 → finalize. -->

### Strengths
- Clean pure-helper extraction (`shouldRunMirror`, `loadCollapsed`/`saveCollapsed`) follows the `railWidth.ts`/`filmstripOrder.ts` precedent exactly — keeps React/DOM logic out of the vitest-pinnable core.
- Ticker `useEffect` deps correct: `collapsed` in the dep array → collapse tears down the interval, expand restarts it with an immediate `tick()`.
- localStorage helpers defensively correct (non-`"true"` → expanded, never throws on read/write).
- Comments encode WHY (pointer-capture-on-stable-strip, natural-width anti-wrap, `document.hidden`-is-per-frame-not-interval).
- Dark-only CSS honored; reuses `#6ea8ff` active accent for pill/tile consistency.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [Filmstrip.tsx collapsed branch] The collapsed branch maps over ALL tiles incl. the active one and gives the active pill `onClick={() => onPromote(tile.id)}` — a silent no-op promote (focusWorkspace on the already-focused ws), while advertising `aria-label="Switch to <name>"` + pointer cursor. Expanded tiles avoid this. Worth a no-op guard or aria-current-aware disabled affordance. (low)
- [Filmstrip.tsx ticker effect] `bgSignature ? bgSignature.split(",") : []` re-derives `backgroundIds` by splitting a string just joined from the same tiles a few lines above — could memoize the array once and reuse for both the signature and iteration (join-then-split is a tiny confabulation surface if an id ever held a comma; not the case today, ids are uuids). (low)
- [mirrorTicker.test.ts] Cosmetic `≥` glyph in test strings + a no-op confirmation that the test count (4) agrees across WIP/commit/file — not a defect, noting only that codify accounting is consistent. (low — non-actionable)

### Assessment
Well-built, appropriately-scoped single-commit increment that plugs cleanly into the WP3 filmstrip seam rather than reshaping it. Pure-helper extraction + vitest pins are idiomatic; the effect lifecycle (deps, cleanup, immediate-first-frame restart) is reasoned correctly and corroborated by live verify-human. No debt accrued; the only findings are MINOR polish fine to leave to backlog.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before finalize archives the WIP.

## Notes
- **Builds on WP3 filmstrip** (`920678a`). Key files: `src/components/workspace/Filmstrip.tsx` (the ticker `useEffect` at lines ~156–182 is what P2 gates), `src/App.tsx` (state owner — `collapsed` lives here next to `order`), `src/App.css` (`.filmstrip*` block ~84–253).
- **Persistence pattern to mirror:** `src/components/workspace/filetree/railWidth.ts` (pure load/save, try/catch-swallow, app-global key) and `filmstripOrder.ts` — `filmstripCollapse.ts` follows the same shape.
- **Status indicator reuse:** `WorkspaceStatusIndicator` (already used by tiles) renders the M3 dot in the collapsed pill so expanded and collapsed agree with the center-stage header — no PTY scraping, M3 hook channel only.
- **Drag-reorder in collapsed mode:** out of scope for WP4 (the WBS task list says click-to-promote from a pill; reorder is the expanded-tile affordance). Collapsed pills are click-to-promote only.
- **Vision anchors:** `vision.md` filmstrip bullet + Core Principle 4 ("collapsible to a row of mini status tiles for reclaiming vertical space").
- **Dogfood gotchas (from .session.md):** before `pnpm tauri dev` → `lsof -ti:1420 | xargs kill`; Playwright same-URL navigate does NOT evict a stale ES module — close the browser context for a clean reload; kill the dev app before `cargo test` (shared `target/` lock).
