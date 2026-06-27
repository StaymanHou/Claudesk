# Feature: WP3 — Workspace split-ratio control (collapse + preset ratios)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-06-27
**Entry:** spec (complex feature — UX-design decisions, multiple interacting layout states, reflow-correctness risk)
**Milestone:** M6 (Friend-requested QoL polish)
**drive_mode:** autopilot

## Problem Statement

A friend-user (not the operator — the operator has no personal need here) wants to switch his attention between two states while working in a workspace:

- **"CC focus"** — read as much CC terminal output as possible (long tool outputs, file dumps, inline diffs). The editor is secondary or ignored.
- **"Editor focus"** — heads-down in the code/diff viewer; CC is running but he isn't reading it right now.

Today the workspace is a fixed `grid-template-columns: 1fr 1fr` (App.css:418) — a permanent 50/50 split between the left CC terminal (`.workspace-left`) and the right `RightPanelHost` (editor / diff / terminal panels). There is no way to give one half more room or to get it out of the way.

**Why NOT a free-drag divider** (the original WP3 framing in `wbs.md`): the real need is *discrete attention-switching between a small set of intents*, not continuous pixel precision. A free-drag handle (a) makes the user *operate a mechanism* (aim, drag, judge) on every attention switch, (b) stores an opaque "where did I leave it" pixel instead of a legible mode, and (c) introduces a **second nested vertical drag handle** a few hundred px from the existing inner file-tree↔editor rail (`RightPanelHost` `onRailResizeStart`) — easy to grab the wrong one. Modeling the *intent* (collapse / ratio presets) is more predictable and is **less code** than the drag clone. This supersedes the `wbs.md` "## WP3" drag-divider spec.

Consistent with project prior **[[explicit-selectable-mode-over-inferred-mode]]** — prefer a legible, directly-selectable state over a fiddly continuous control (same call as the M5 PiP tri-state Off/On/Auto).

**[Back-loop F12 re-check, 2026-06-27]** Problem statement unchanged — the root problem (discrete CC/editor attention-switching) holds. What we learned: the C3 plan-time lean ("rail clamps to RAIL_MIN, editor takes the rest") was insufficient — it sized the rail by its absolute 160px min but ignored its size *relative to* a narrow (~320px) right panel, so at 3:1 the rail's stored ~299px width crowds out the editor. Fix is a refinement of the rail's *applied* width (cap to a fraction of panel width), not a change to the feature's intent.

## User Stories

- As a friend-user reading a long CC turn, I want to **collapse the right panel** so the CC terminal fills the workspace and I see maximum output, in one click.
- As a friend-user working heads-down in the editor, I want to **collapse the left CC terminal** so the editor/diff fills the workspace, in one click.
- As a friend-user, I want to **nudge the balance** toward CC-heavy (3:1) or editor-heavy (1:3) without fully collapsing either half, via a single cycle control.
- As any user, I want the split state to **persist across launches** and default to the current balanced 2:2 on first run (no behavior change for users who never touch it).

## Acceptance Criteria

### Control & states
- A control lives in the **workspace header** (`.workspace-header`, App.css:432 — already spans both columns, next to the status dot), shaped as **two collapse toggles + a cycle button**:
  - **`◀ CC`** toggle — collapse / restore the LEFT (CC terminal) half.
  - **`ED ▶`** toggle — collapse / restore the RIGHT (editor/panel) half.
  - **Cycle** button (labeled with the current ratio, e.g. `2:2`) — cycles the *non-collapsed* ratio through **3:1 → 2:2 → 1:3 → (wrap)**.
- The five reachable layout states and their grid tracks:

  | State | `grid-template-columns` | How reached |
  |---|---|---|
  | **CC only** (right collapsed) | `1fr 0` | click `ED ▶` |
  | **3:1** | `3fr 1fr` | cycle |
  | **2:2** (default) | `1fr 1fr` | cycle |
  | **1:3** | `1fr 3fr` | cycle |
  | **Editor only** (left collapsed) | `0 1fr` | click `◀ CC` |

- The control reflects current state legibly: the active collapse toggle shows a pressed/active style; the cycle button label shows the current ratio. (At most one half collapsed at a time — collapsing one un-collapses the other if it was collapsed; never both collapsed.)
- Clicking an active collapse toggle again **restores** to the last non-collapsed ratio (e.g. collapse CC from 2:2 → `Editor only`; click `◀ CC` again → back to `2:2`).

### Persistence
- The split state (collapse flag + which half + the ratio) persists in **app-global localStorage** via a new `src/components/workspace/splitWidth.ts` helper (sibling of `railWidth.ts` — pure `clamp`/`load`/`save`, own key e.g. `claudesk.workspace.splitState`, never throws, sane default).
- First run (nothing stored) → **2:2**, byte-identical to today's layout.
- State is **per-app (global), not per-workspace** for v1 — matches the file-tree rail's app-global model (UI chrome, not project data). (Recorded as a deliberate v1 choice; see Open Questions if this should be per-project.)

### Reflow correctness (operator's three concerns — live-verified gates)
- **(C1) Ratio-switch reflow:** after switching to any non-collapsed ratio (3:1 / 2:2 / 1:3), the CC terminal re-fits cleanly via the existing `XtermPane` `ResizeObserver → fit.fit() → cc_resize` path (XtermPane.tsx ~249–252) — no garbled wrapping, no stale column count, prompt intact, scrollback preserved.
- **(C2) Collapsed-CC reflow safety:** collapsing the CC half to **0 width must NOT throw or corrupt the PTY buffer.** FitAddon must NOT be run against a 0-width container (the Workspace.tsx header comment already documents `display:none` → zero dims → `fit()` throws). **Design:** when a half is collapsed, the fit for that pane is *guarded/skipped* (do not fit to 0); on **expand**, fit once to the restored width. The CC PTY session stays alive the entire time (never killed/respawned by a collapse) — collapse is purely a layout-track change, consistent with the "all workspaces stay mounted" invariant.
- **(C3) Editor usability at 3:1:** at 3:1 (right panel on the narrow ¼ side) the right panel reflows **without clipping** and stays usable — the editor and the inner file-tree rail (min 160px, `RAIL_MIN`) coexist gracefully at the narrowed width (the rail clamps; the editor remains readable, or the spec records which yields — see Open Questions). The inner file-tree drag handle remains operable.
- **(C4) Both directions of collapse re-fit:** expanding CC from `Editor only` re-fits the terminal to full width cleanly; collapsing then re-expanding leaves the terminal and editor in a correct, usable state with no residual sizing artifacts.

### Non-regression
- The inner file-tree↔editor rail resizer (`RightPanelHost` `onRailResizeStart`) is **unchanged** and remains the only *drag* handle in the workspace (no new drag handle introduced — the outer split is preset-only).
- Window-resize behavior is preserved: with `fr`-based tracks the halves still flex with the window; a collapsed half stays collapsed across a window resize.
- All workspaces stay mounted; switching the center stage does not reset another workspace's split state (state is app-global, so all workspaces share the current split — acceptable per the v1 global-state choice).

## Out of Scope

- **Free-drag fine-tuning of the outer split** — presets only for v1. Adding a draggable outer divider (snapping to nearest preset) later is a clean, reversible follow-up if the friend asks; building it now reintroduces the nested-handle confusion this design deliberately avoids. (Recorded as a SURFACE candidate, not built.)
- **Per-workspace split state** — v1 is app-global (see Open Questions; flip is cheap if wanted).
- **Animated/transitioned collapse** — instant track change for v1 (a CSS transition on `grid-template-columns` is a possible polish add-on but risks fighting the ResizeObserver fit timing; deferred).
- **Vertical (top/bottom) splits, or >2 panes in the outer split** — not in scope.

## Technical Constraints

- **No 3rd-party dependency** — pure in-app React/CSS over confirmed seams. No probe needed.
- **Pattern to clone:** `src/components/workspace/filetree/railWidth.ts` (pure clamp/load/save + localStorage, never-throws posture) → new `src/components/workspace/splitWidth.ts`. The drag *handler* (`onRailResizeStart`) is NOT cloned (no outer drag).
- **Grid seam:** `Workspace.tsx` renders `.workspace` (grid) with `.workspace-header` (spans both, `grid-column: 1 / -1`, App.css:433), `.workspace-left` (XtermPane), and `RightPanelHost` (`.workspace-right`). The split control mounts in `.workspace-header`; the chosen `grid-template-columns` is applied to `.workspace` (inline style overriding the App.css:418 default, mirroring how `railWidth` overrides the rail's CSS default).
- **Reflow seam (confirmed):** `XtermPane` runs `ResizeObserver → fit.fit() → cc_resize` (XtermPane.tsx ~249–252, `fitAndResize` ~162–175) — a `grid-template-columns` change resizes `.workspace-left`, which the observer catches and re-fits automatically. The **only** new backend-adjacent work is *guarding* that fit when the terminal half is at 0 width (C2) — likely a guard inside the existing fit path or by not collapsing via a mechanism that drives the observer to 0 (e.g. keep the element but `display:none` the half AND skip fit when not displayed). Exact guard mechanism decided at plan time.
- **Dark-only:** the new control uses existing dark tokens; no light-theme variants (CLAUDE.md dark-mode-only rule).
- **State shape:** a small discriminated state — e.g. `{ collapsed: 'none'|'left'|'right', ratio: '3:1'|'2:2'|'1:3' }` — serialized to one localStorage value. `splitWidth.ts` owns parse/serialize/validate (unknown → default 2:2/none).
- **Verify-self path:** all four reflow gates (C1–C4) are live-observable via the `tauri` MCP bridge (`pnpm tauri:dev` + `mcp__tauri__*` at 127.0.0.1:9223) against a scratch repo (`tmp/scratch/scratch-a`). The agent drives the live verify-self for the visual/DOM/click checks (preset switch → screenshot → confirm terminal re-fit + no clipping); the PTY-stays-alive backend outcome (C2) and the installed-`.app` parity are carried to verify-human per the standing conventions.

## Open Questions

- [ ] **(plan-time, has lean)** Exact **0-width-collapse fit-guard mechanism** for C2 — options: (a) `display:none` the collapsed half + skip its `fit()`; (b) `0`-width track + a `cols/rows > 0` guard inside `fitAndResize`; (c) keep the half rendered off-track. Lean: whichever cleanly prevents `fit()` running against 0 dims while keeping the PTY + editor state mounted. Resolved by reading `fitAndResize`/the ResizeObserver wiring at plan time; not a research unknown.
- [ ] **(plan-time)** At **3:1, does the editor or the file-tree rail yield first** if both can't fit comfortably? Lean: the inner rail clamps to `RAIL_MIN` (160px) and the editor takes the rest, even if narrow — matches today's clamp behavior. Confirm acceptable at the live verify (C3); if the editor becomes unusable, the spec gains an AC that the rail auto-collapses below a threshold (existing `.is-collapsed` strip state).
- [ ] **(plan-time, low)** App-global vs **per-workspace** split state. Lean: app-global for v1 (matches the rail; simplest). Flag if the friend wants per-project.
- [ ] **(plan-time, low)** Cycle direction + whether a collapsed state participates in the cycle. Lean: cycle only the three ratios (3:1/2:2/1:3, wrapping); collapse is reached *only* via the two toggles, never via cycle — keeps the two affordances orthogonal and predictable.

## Plan-time decisions (open questions resolved)

All four spec open questions resolved at plan time from reading the seams — **each lands on its lean with zero extra mechanism**:

1. **0-width collapse fit-guard mechanism (C2) → `display:none` on the collapsed half.** `XtermPane.fitAndResize` (XtermPane.tsx:166) **already guards** `host.offsetParent === null` → early return (no `fit()`, no `cc_resize`). So collapsing `.workspace-left` via `display:none` means the ResizeObserver fires, `fitAndResize` early-returns (no fit-to-0, no throw), and the PTY stays alive. On expand, `display` restored → ResizeObserver fires → `offsetParent` non-null → fits to full width. **No new guard code.** (Chosen over the `0`-width-track + cols-guard option precisely because the guard already exists for `display:none`.) The right (editor) half collapse is a plain `display:none` too — CM6/editor state stays mounted (matches the "all stay mounted" invariant).
2. **Editor-vs-rail yield at 3:1 (C3) → rail clamps to `RAIL_MIN` (160px), editor takes remainder.** The inner file-tree rail already has a user-controlled `.is-collapsed` strip (RightPanelHost.tsx:598); at 3:1 the rail stays at its 160px min and the editor takes the rest (narrow but usable). If the user wants more editor room at 3:1, the existing rail-collapse strip is their lever. **No auto-collapse logic for v1.**
3. **App-global vs per-workspace → app-global** (matches `railWidth.ts`; simplest; one localStorage value shared by all workspaces). Per-workspace is a cheap future flip if requested.
4. **Cycle direction / collapse participation → cycle only the 3 ratios (3:1 → 2:2 → 1:3, wrapping); collapse reached ONLY via the two toggles.** Keeps the two affordances orthogonal and predictable. Toggling a collapse off restores the last non-collapsed ratio.

**State model (single localStorage value, owned by `splitWidth.ts`):** `{ collapsed: 'none'|'left'|'right', ratio: '3:1'|'2:2'|'1:3' }`. Effective grid track derived from it:
- `collapsed:'left'` → `0 1fr` (Editor only) — `.workspace-left` gets `display:none`
- `collapsed:'right'` → `1fr 0` (CC only) — `.workspace-right` gets `display:none`
- `collapsed:'none'` → ratio map: `3:1`→`3fr 1fr`, `2:2`→`1fr 1fr`, `1:3`→`1fr 3fr`
- Default / unparseable → `{collapsed:'none', ratio:'2:2'}` (byte-identical to today).

## Work Tree

- [x] Phase 1: Ratio presets — `splitWidth.ts` + cycle control + grid wiring (no collapse yet)  <!-- status: done — all impl + verify nodes [x]; operator-approved; rail-cap fix folded in -->
  **Relevance check:** N/A — first phase, no earlier-phase context to invalidate.
  **Observable outcomes:**
  - Browser (MCP bridge, `pnpm tauri:dev` + scratch repo): open a workspace; the workspace header shows a cycle button labeled `2:2`. `webview_dom_snapshot` of `.workspace` shows inline `grid-template-columns: 1fr 1fr`.
  - Browser: clicking the cycle button advances the label `2:2 → 1:3 → 3:1 → 2:2` (wrap) and the `.workspace` inline `grid-template-columns` updates to `1fr 3fr` / `3fr 1fr` / `1fr 1fr` respectively (read via `webview_execute_js` on the element's style).
  - Browser (C1 reflow): after cycling to `3:1` and to `1:3`, a `webview_screenshot` shows the CC terminal re-fitted (no garbled wrapping / clipped columns; prompt intact) and the right panel reflowed without clipping.
  - Browser (C3): at `3:1` the right panel screenshot shows the editor + file-tree rail both present and usable (rail at its 160px min, editor readable).
  - CLI: `pnpm exec tsc --noEmit` exits 0; `pnpm exec eslint src` exits 0; `pnpm vite build` exits 0 (imports/JSX across the change compile).
  - CLI: `pnpm exec vitest run splitWidth` passes — pure `clamp`/`load`/`save`/track-derivation unit tests (default 2:2, unknown→default, each ratio→track string).
  - [x] P1.1 Add `src/components/workspace/splitWidth.ts` — pure helpers cloning `railWidth.ts` posture: state type `{collapsed,ratio}`, `DEFAULT_SPLIT`, key `claudesk.workspace.splitState`, `loadSplitState`/`saveSplitState` (never throw, unknown→default per-field), `gridColumnsFor(state)` pure derivation, `cycleRatio(ratio)` (3→2→1:3 wrap)  <!-- status: done -->
  - [x] P1.2 Lift split state into `Workspace.tsx` (`useState(loadSplitState)`); apply `gridColumnsFor(state)` as an inline `grid-template-columns` on `.workspace` in BOTH visible + off-viewport branches (overrides App.css:418 default, mirroring how railWidth overrides its CSS default)  <!-- status: done -->
  - [x] P1.3 Add the cycle button to `.workspace-header` (between name and status dot, `margin-left:auto` grouping it with the dot at the trailing edge): label = current ratio, onClick = `cycleSplit` (cycleRatio + saveSplitState via functional updater). Dark-token styling (`.workspace-split-control` / `.split-cycle-btn`)  <!-- status: done -->
  - [x] P1.4 Unit tests `__tests__/splitWidth.test.ts` (derive/cycle/load/save round-trip, per-field invalid fallback, no-localStorage) — 13/13 pass  <!-- status: done -->
  - [x] P1.5 (F12 back-loop fix) Rail panel-fraction cap — `effectiveRailWidth` in railWidth.ts + ResizeObserver on `.workspace-right` in RightPanelHost; 5 new railWidth.test.ts cases (15/15). Editor usable at 3:1; cap doesn't bite at wide ratios; stored width untouched  <!-- status: done -->>
  - [x] verify-auto  <!-- status: done — (re-run after F12 fix) vitest 688/688 (72 files, +18 total new, 0 regressions); tsc 0 err; eslint 0 err; vite build ✓ -->
  - [x] verify-self  <!-- status: done — LIVE via tauri MCP bridge (127.0.0.1:9223, scratch-a). ALL 4 outcomes PASS, no BLOCKING/COSMETIC fails. (1) header cycle btn "2:2", inline grid 1fr 1fr → computed 640px 640px ✓. (2) cycle 2:2→1:3→3:1→2:2 wrap, tracks 1fr 3fr/3fr 1fr/1fr 1fr ✓. (3) C1: terminal re-fit cleanly at 1:3 (narrow ¼) AND 3:1 (wide ¾) — screenshots show live CC session reflowed, no garble. (4) C3: at 3:1 right panel ¼ shows file-tree rail + editor + tabs all usable. Console clean (no errors across all cycling). -->
  - [x] verify-human  <!-- status: done — operator approved all 3 leaves (.3 re-confirmed after the F12 rail-cap fix) -->
    - [x] P1.verify-human.1 Cycle button feel + placement — operator: looks good  <!-- status: done -->
    - [x] P1.verify-human.2 Terminal clean at all ratios + interactive — operator: looks good (CC took real input, wide+narrow re-fit clean)  <!-- status: done -->
    - [x] P1.verify-human.3 Editor usable at 3:1 (narrow ¼) — was FAILED (rail kept stored ~281px, crowding the editor); FIXED via the rail panel-fraction cap (P1.5) + agent-re-verified live; **operator re-confirmed approved 2026-06-27**. Fix: `effectiveRailWidth(stored, panelWidth)` caps APPLIED rail to `max(RAIL_MIN, panelWidth*0.5)`; ResizeObserver on `.workspace-right`; stored width untouched (restores at wide ratios).  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — coverage already comprehensive from TDD build (splitWidth 13 + effectiveRailWidth 5 = pure logic fully covered); live wiring covered by bridge verify-self per manual-host-UI convention. No new tests needed, no gaps. Full suite 688/688. -->

- [x] Phase 2: Collapse toggles + 0-width reflow safety  <!-- status: done — all impl + verify nodes [x]; operator-approved; collapsed-fill (single-track) + rail-cap fixes folded in -->
  **Observable outcomes:**
  - Browser (MCP bridge): header shows two collapse toggles `◀ CC` and `ED ▶`. Clicking `ED ▶` sets `.workspace` grid to `1fr 0` and `.workspace-right` to `display:none` (CC fills the workspace); the `ED ▶` toggle shows an active/pressed style.
  - Browser: clicking `◀ CC` sets grid to `0 1fr` and `.workspace-left` to `display:none` (editor fills the workspace). At most one half collapsed — collapsing one un-collapses the other.
  - Browser (C2 — the key gate): collapse CC (`◀ CC`) → `webview_execute_js` confirms NO uncaught error in console (`mcp__tauri__read_logs` / console clean), `__TAURI_INTERNALS__` still present, and the CC pane element is `display:none` (not removed). Re-expand → `webview_screenshot` shows the terminal re-fitted to full width, prompt + scrollback intact.
  - Browser (C4): collapse→expand each half twice; final screenshot shows terminal and editor both correct, no residual sizing artifacts.
  - Backend (C2, carried to verify-human / installed `.app`): the CC PTY is NOT killed by a collapse — `pgrep -f claude` count unchanged across collapse/expand (operator-driven; agent can't see PTY lifecycle from the webview).
  - CLI: `tsc --noEmit` / `eslint` / `vite build` exit 0; collapse-state derivation unit tests pass (`collapsed:'left'`→`0 1fr`, `'right'`→`1fr 0`, restore-to-last-ratio).
  - [x] P2.1 Extend `splitWidth.ts` — `gridColumnsFor` already handles collapse (Phase 1); added `toggleCollapse(state, half)` (collapse / restore-to-last-ratio / mutual exclusion) + 4 unit tests (17/17)  <!-- status: done -->
  - [x] P2.2 Apply per-half `display:none` when collapsed: inline style on `.workspace-left` (Workspace.tsx) + `.workspace-right` (new `collapsed` prop on RightPanelHost). The `display:none` makes XtermPane's `offsetParent===null` guard fire — no fit-to-0; panel + PTY stay mounted  <!-- status: done -->
  - [x] P2.3 Added the two collapse toggle buttons (◀ CC / ED ▶) flanking the cycle button in `.workspace-header`; `.is-active` pressed style (#6ea8ff) for the collapsed half; restore on re-click; cycle button disabled while collapsed (orthogonal affordances)  <!-- status: done -->
  - [x] P2.4 Expand re-fit nudge: added `refit()` to XtermPaneHandle (calls fitAndResize via a ref); Workspace fires it rAF-deferred on the leftCollapsed false-edge (display flip may not fire the ResizeObserver under WKWebView; offsetParent guard makes it a no-op if still hidden)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — (re-run after the collapse-grid fix) vitest 691/691; tsc 0 err; eslint 0 err; vite build ✓. (Earlier this node also triaged + refined workspaceOffViewport.test.ts: its blanket display:none ban was over-broad → retargeted to the workspace-level hide invariant.) -->
  - [x] verify-self  <!-- status: done — LIVE via tauri MCP bridge (scratch-a). ALL outcomes PASS: (1) ◀CC/ED▶ toggles present; ED▶→grid 1fr 0px, right display:none, ED active, CC fills workspace ✓. (2) ◀CC→grid 0px 1fr, left display:none; mutual exclusion confirmed (collapse moves between halves) ✓. (3) C2 KEY GATE: CC 0-width collapse → NO console error, __TAURI_INTERNALS__ present, .xterm pane STILL MOUNTED (PTY alive), offsetParent guard prevented fit-to-0 crash ✓. (4) C4: re-expand → grid 1fr 1fr, terminal re-fit full width, last ratio restored, no artifacts ✓. (5) cycle btn disabled while collapsed ✓. Console clean throughout. -->
  - [x] verify-human  <!-- status: done — operator approved both leaves (collapse feel + the collapsed-fill fix re-confirmed) -->
    - [x] P2.verify-human.1 Collapse toggles feel + placement — operator: all good  <!-- status: done -->
    - [x] P2.verify-human.2 CC-only / Editor-only fill the freed width — was FAILED (collapsed-CC editor didn't fill, ~1px right panel); FIXED via single-track grid (display:none removes the grid item → a leftover `0` track swallowed the visible half); agent-re-verified live + **operator re-confirmed approved 2026-06-27**.  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — coverage comprehensive from TDD (splitWidth toggleCollapse 4 cases + single-track collapse derivation pins the bug fix; workspaceOffViewport refined to allow half-collapse). Live wiring covered by bridge verify-self. No new tests, no gaps. Suite 691/691. -->

- [x] Phase 3: Persistence + non-regression hardening  <!-- status: done — all impl + verify nodes [x]; operator-approved (persistence survives a real app restart) -->
  <!-- NOTE: P3.1 (saveSplitState on every change) is already wired in Phase 2 — both cycleSplit + toggleSplitCollapse persist via functional updater. P3 confirms + adds the non-regression checks. -->
  **Observable outcomes:**
  - Browser (MCP bridge): set a non-default state (e.g. collapse CC), then relaunch `pnpm tauri:dev`; on reopen the workspace restores the same state (read `.workspace` grid + toggle active style). First run with cleared localStorage → 2:2, `1fr 1fr`.
  - Browser (non-regression): the inner file-tree↔editor rail drag handle still works (drag → `.file-tree-rail` width changes) — it remains the ONLY drag handle; no outer drag handle exists in the DOM (`webview_find_element` for an outer separator returns none).
  - Browser (non-regression): switching center stage between two workspaces does not throw; both share the app-global split state (expected per v1 global-state choice).
  - CLI: full `pnpm exec vitest run` passes; `tsc --noEmit` / `eslint` / `vite build` exit 0.
  - [x] P3.1 `saveSplitState` on every state change — DONE in Phase 2 (cycleSplit + toggleSplitCollapse both persist via functional updater, mirroring railWidth's save-from-latest); load-on-mount via `useState(loadSplitState)`. Confirmed.  <!-- status: done -->
  - [x] P3.2 Non-regression — confirmed: inner file-tree rail resizer (`onRailResizeStart`) untouched + still the ONLY drag handle (outer split is preset-only, no drag handle added); window-resize flex preserved (non-collapsed → fr tracks flex; collapsed → single `1fr` track stays collapsed across resize). Live-verified at verify-self (inner drag handle present, col-resize).  <!-- status: done -->
  - [x] P3.3 Tests — added 3 persistence integration tests (change→save→reload→derive chain for collapse + cycle + first-run default); derivation matrix + load/save fallbacks already covered. splitWidth 19/19.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — vitest 694/694 (+3 persistence integration); tsc 0 err; eslint 0 err (pre-existing XtermPane warning only); vite build ✓ -->
  - [x] verify-self  <!-- status: done — LIVE via tauri MCP bridge with a REAL app restart. (1) PERSISTENCE: set {collapsed:left,ratio:1:3} via UI → fully quit+relaunch tauri:dev → localStorage survived → reopened workspace restored exactly (grid 1fr, CC active, label 1:3, cycle disabled, left display:none) ✓. (2) NON-REGRESSION: only ONE role=separator drag handle exists (file-tree-resize, col-resize); NO outer split handle ✓. (3) first-run: cleared storage → null → default {none,2:2}→1fr 1fr (derivation unit-pinned) ✓. Console clean. -->
  - [x] verify-human  <!-- status: done — operator approved persistence-across-restart -->
    - [x] P3.verify-human.1 Persistence eyeball — operator: approved (state survives a full app restart)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — persistence chain covered by 3 integration tests (change→save→reload→derive); non-regression + restart-persistence driven live via bridge (real app restart). No new tests, no gaps. Suite 694/694. -->

## Current Node
- **Path:** Feature > ALL PHASES COMPLETE → ship
- **Active scope:** WP3 done — Phases 1–3 all [x], operator-approved. Ready for `/feature-ship`.
- **Blocked:** none
- **Unvisited:** (none)
- **Open discoveries:** none open

## Test Triage — workspaceOffViewport.test.ts "does NOT use display:none to hide a workspace"
Classification: Obsolete test (over-broad assertion) — the regex blanket-bans the `display: "none"` literal anywhere in Workspace.tsx, but its documented intent (lines 8–17) is narrower: the *workspace-level* hide (the non-`visible` background branch) must use off-viewport, NOT display:none (so FitAddon + the filmstrip mirror keep working).
Confidence: high
Evidence: my Phase 2 change adds `display:none` to the intra-workspace HALF collapse (`.workspace-left` / `.workspace-right` collapse toggles) — a different concern. The workspace-level `visible`/hidden style is UNTOUCHED (still `position:absolute; left:-99999px; display:grid`), so the M4 invariant the test protects is NOT violated; only the coarse regex misfires.
Action: refine the assertion to target the actual invariant (the off-viewport hidden branch keeps display:grid + left:-99999px and is not display:none), so it still catches a real regression of the workspace hide while allowing the legitimate half-collapse. No code change — the source is correct.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-27] Phase 1 — the C3 plan-time lean ("rail clamps to RAIL_MIN, editor takes remainder") was insufficient: it sized the rail by its absolute 160px min but ignored its size *relative to* a narrow (~320px) right panel, so the stored ~281px rail crowded the editor into an unusable sliver at 3:1. Fix landed in-cycle (P1.5: panel-fraction cap). Learning, not open work — the cap (`effectiveRailWidth`) generalizes: any future "inner element at a fixed px inside a now-shrinkable container" needs a fraction cap, not just a min. No backlog entry needed (resolved same cycle).
- [SURFACED-2026-06-27] Phase 2 — collapse via `display:none` on a grid item + a two-track `0 1fr` grid was broken: `display:none` removes the item from grid flow, so the lone visible half landed in the FIRST (`0`) track → ~1px wide. Fix: collapsed state → single `1fr` track. Learning: when you `display:none` a CSS-grid track's item, the *track count* must drop too — a leftover `0` track silently swallows the surviving item. Both P1 (rail-at-3:1) and P2 (collapse) were the same shape: "a half didn't get its expected width." Resolved same cycle; no backlog entry.
