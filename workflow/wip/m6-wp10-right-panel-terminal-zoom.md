# Feature: M6 WP10 — Right-panel terminal font zoom (focus-scoped, extends WP4)

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-28
**Drive mode:** autopilot

## Problem Statement
WP4 shipped focus-scoped ⌘+/⌘−/⌘0 font zoom for the **CC terminal** (the left half). The right-half login-shell terminal (`TerminalPane` → `XtermPane`, `spawnCommand="term_spawn"`) is the **same** `XtermPane` component, so it already accepts `setFontSize(px)` via the imperative handle and already seeds its initial size from the shared `loadTerminalFontSize()`. But it has **no live zoom**: WP4's capture-phase keydown listener in `Workspace.tsx` intercepts the zoom chord only when `deriveFocusHalf(document.activeElement) === "left"` (the CC terminal). When the right-panel terminal is focused, a right-half focus falls through to the editor's CM6 keymap (which zooms the editor) — so ⌘+ pressed in the right-panel terminal does nothing useful. WP10 closes the routing gap: when the focused right-half surface is the **terminal panel** (not the editor), the zoom chord must zoom **that terminal** via its `setFontSize` handle. **The gap is routing only** — the apply seam (`XtermPane.setFontSize`), the zoom math, and the persistence (`terminalFontZoom.ts`) all already exist.

## Decisions (recorded at plan time)
- **Shared zoom key (CONFIRMED, per WBS lean).** Both terminals reuse WP4's single global localStorage key `claudesk.terminal.fontSize`. Rationale: the right-panel `XtermPane` already *seeds* from `loadTerminalFontSize()` (XtermPane.tsx:221), so a separate key would make it mount at the shared size then silently diverge on first zoom — surprising. Both are "a terminal"; one size for both is the lite, consistent choice matching the editor's single `fontZoom` key and the WP3 split state. `applyTerminalZoom` already persists to this key; routing the right-panel terminal through the **same** `applyTerminalZoom` means a zoom in either terminal moves both (next time the other one re-fits/re-seeds) and persists once — exactly the intended shared behavior.
- **Routing signal = DOM-ancestry read on the focused element (CONFIRMED).** A new pure helper `deriveRightSurface(target)` returns `"terminal"` when the focused element is inside `[data-testid="term-pane"]`, else `"other"`. Chosen over lifting `RightPanelHost`'s `panel` state up to `Workspace`: the terminal pane only ever **holds DOM focus** when it is the front panel (the editor/diff slots are `display:none`, so their elements are not focusable/focused), so "focus is inside `term-pane`" *is* the "terminal panel is the focused right-half surface" signal — no extra state plumbing, no `RightPanelHost`→`Workspace` prop lift, no coupling across the component boundary. Mirrors the existing `deriveFocusHalf` duck-typed `closest()` seam (pure → vitest-testable, the repo posture). The single capture-phase listener in `Workspace.tsx` already reads live `document.activeElement`; we just extend its branch.
- **Same chord, same LOCKED keybinding.** ⌘+/⌘−/⌘0 (`terminalZoomForChord`), reused unchanged — LOCKED per the M6 WBS. ⌘⇧+digit stays reserved for the filmstrip ([[cmd-shift-digit-reserved-for-filmstrip]]).

## Work Tree

- [x] Phase 1: Route the zoom chord to the focused right-panel terminal  <!-- status: DONE 2026-06-28 — all impl tasks + all 5 verify nodes [x] -->

  **Observable outcomes:**
  - Browser (MCP bridge): with the Terminal panel front and DOM focus inside `[data-testid="term-pane"]`, dispatching ⌘= raises the right-panel terminal's xterm font size — read back via `webview_execute_js` on the term-pane's `.xterm` computed `font-size` (or the xterm `fontSize` option): it grows by 1px (⌘=), shrinks by 1px (⌘−), resets to 11 (⌘0). The CC terminal's font size is UNCHANGED in the same gesture (focus is in the right half, not left).
  - Browser (MCP bridge): with the **Editor** panel front and focus inside CodeMirror, ⌘= zooms the EDITOR (unchanged from before) and neither terminal's font size changes — confirming the new branch is correctly gated on the terminal pane holding focus.
  - Browser (MCP bridge): with the CC (left) terminal focused, ⌘= still zooms the CC terminal (WP4 behavior preserved — no regression).
  - CLI: `pnpm vitest run` passes, including a new `deriveRightSurface` unit spec (terminal-pane ancestor → "terminal"; editor/diff/other → "other"; null/non-Element → "other") and the existing `terminalFontZoom` + `focusHalf` specs unchanged.
  - CLI: `pnpm tsc --noEmit` clean; `pnpm eslint .` clean; `pnpm vite build` succeeds (no broken imports across the ref thread `RightPanelHost`→`TerminalPane`→`XtermPane`).
  - [x] P1.1 Add a pure `deriveRightSurface(target)` helper (returns `"terminal" | "other"`) in a small module beside `focusHalf.ts` (e.g. `rightSurface.ts`), duck-typed `closest("[data-testid='term-pane']")`, mirroring `deriveFocusHalf`. Add its unit spec.  <!-- status: DONE — rightSurface.ts + rightSurface.test.ts (5 cases, all pass) -->
  - [x] P1.2 Thread an `XtermPaneHandle` ref from `RightPanelHost` → `TerminalPane` → `XtermPane` (mirror the CC `ccPaneRef`): `TerminalPane` gains `forwardRef`; `RightPanelHost` creates a `termPaneRef` and forwards it. Expose the right-panel terminal's `setFontSize` to `Workspace`.  <!-- status: DONE — TerminalPane now forwardRef; RightPanelHost gained `terminalPaneRef?: Ref<XtermPaneHandle>` prop forwarded onto <TerminalPane> -->
  - [x] P1.3 Lift the right-panel-terminal zoom apply into `Workspace.tsx`: extend `applyTerminalZoom` (or add a sibling) so the next-size/persist path is shared, and the apply targets `termPaneRef.current?.setFontSize(next)` when routing to the right-panel terminal.  <!-- status: DONE — chose the lean: `termPaneRef` lifted to Workspace (beside ccPaneRef); applyTerminalZoom(action, target) where target ∈ {"cc","right"} applies to the chosen handle but shares the one localStorage key + one useState store (shared-key decision); termPaneRef forwarded to RightPanelHost as a prop -->
  - [x] P1.4 Extend the capture-phase keydown router in `Workspace.tsx`: keep the `deriveFocusHalf === "left"` → CC-zoom branch; ADD: if `deriveFocusHalf === "right"` AND `deriveRightSurface(document.activeElement) === "terminal"`, preventDefault + stopPropagation + apply zoom to the right-panel terminal. A right-half focus that is NOT the terminal pane (editor/diff) keeps falling through to the CM6 keymap (unchanged). Gated on `visible` as today.  <!-- status: DONE — router now branches half==="left" → cc; half==="right" && deriveRightSurface==="terminal" → right; else fall through -->
  - [x] verify-auto  <!-- status: DONE 2026-06-28 — scoped eslint exit 0, tsc --noEmit exit 0, targeted vitest 27/27 (rightSurface + terminalFontZoom + focusHalf) -->

  - [x] verify-self  <!-- status: DONE 2026-06-28 — agent-driven LIVE via the tauri MCP bridge (mcp__tauri__*, port 9223) against the real Claudesk Dev WKWebView; scratch-a workspace. ALL outcomes PASS. No integration-boundary gap (outcomes cite term-pane / editor / CC by name). See verify-self log below. -->
    **verify-self live results (MCP bridge, scratch-a):**
    - Baseline: both terminals at 11px (`.xterm-rows` computed font-size), persisted `claudesk.terminal.fontSize`=11.
    - CC focused → ⌘= : CC 11→12, right-terminal unchanged (11), persisted=12. `defaultPrevented:true` (my listener). WP4 behavior preserved. PASS.
    - Right-panel terminal focused (term-pane front, focus in its textarea, `deriveFocusHalf`=right + `deriveRightSurface`=terminal) → ⌘= : right terminal 11→13 (re-seeded to 12 from the shared store on activation, then +1), CC unchanged (12), persisted=13. ⌘− → 12, ⌘0 → 11 (reset). All `defaultPrevented:true` via the new WP10 branch. **CORE WP10 OUTCOME — PASS.**
    - Editor (CodeMirror) focused → ⌘= : editor `.cm-content` 14→15 + persisted `claudesk.editor.fontSize` 14→15 (CM6's own keymap fired); BOTH terminals unchanged (cc=12, term=11, persistedTerm=11). My listener correctly FELL THROUGH (never called applyTerminalZoom). PASS.
    - Shared-key behavior confirmed: the right terminal re-seeded from the value CC last set (one `claudesk.terminal.fontSize` key, one store) — the shared-key decision works as designed.
    - Bridge teardown: driver_session stop + ports 1420/9223 killed (CLAUDE.md caveat d). Both free.
  - [x] verify-human  <!-- status: DONE 2026-06-28 — operator real-keyboard confirmation, ALL 4 leaves PASS. Integration boundary applied (existing Workspace keydown router + UI components modified); not auto-skippable — operator drove real OS→WKWebView ⌘-chord path that verify-self's dispatched events couldn't fully prove. (Stale vite-on-1420 from the verify-self session blocked the operator's first launch — CLAUDE.md caveat d — cleared with lsof kill; relaunched clean.) -->
    - [x] P1.verify-human.1 RIGHT-panel terminal: ⌘= grows / ⌘− shrinks / ⌘0 resets, CC unchanged.  <!-- status: PASS -->
    - [x] P1.verify-human.2 CC (left) terminal: ⌘=/⌘− zooms CC (WP4 preserved), right-panel terminal unchanged.  <!-- status: PASS -->
    - [x] P1.verify-human.3 Editor focus: ⌘=/⌘− zooms the editor, NEITHER terminal changes (fall-through).  <!-- status: PASS -->
    - [x] P1.verify-human.4 Persist/restore: terminal mounts at the last-chosen shared size.  <!-- status: PASS -->

  - [x] verify-codify  <!-- status: DONE 2026-06-28 — the routing seam (deriveRightSurface) is codified in rightSurface.test.ts (5 cases incl. the over-infer guard: selector targets term-pane not xterm-pane). Full suite 736/736 (was 731; +5 = rightSurface). No new render test for the Workspace.tsx router composition: repo has no jsdom render harness (deferred — SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP); the router composition was verified live (MCP bridge, all 3 focus cases = the consuming-surface end-to-end exercise) + operator real-keyboard — the right fidelity for keyboard-driven React glue. Integration boundary satisfied by the live verify-self. -->


## Current Node
- **Path:** Feature > Phase 1 > COMPLETE → ship
- **Active scope:** none — Phase 1 fully complete (all impl + all 5 verify nodes [x]). Single-phase feature → all phases complete → ship.
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none
- **Blocked:** none
- **Unvisited:** none (single-phase feature; verify-auto → verify-self → verify-human → verify-codify → ship)
- **Open discoveries:** none

## Build notes (2026-06-28)
- Inline fix made during build (in-scope, not a SURFACE): added `tmp/**` + `src-tauri/tmp/**` to `eslint.config.js` ignores. The gitignored verify-self scratch repos (`src-tauri/tmp/scratch/*`) were being linted (a `no-undef` error on `main.js`), which broke the `pnpm eslint .` clean Observable outcome. They are dev-only fixtures (CLAUDE.md "Scratch workspaces for verify-self"), never app code — correctly ignored now. Pre-existing latent config gap surfaced because the scratch dirs now exist locally.
- The lone remaining `pnpm eslint .` item is a pre-existing WARNING (not error) at `XtermPane.tsx:442` (the `spawnTriggerDeps` spread in the deps array) — predates WP10, untouched, exit 0.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
```
(none)
```
