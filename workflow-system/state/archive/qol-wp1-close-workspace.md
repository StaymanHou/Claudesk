# Feature: Close a workspace (QoL-WP1)

**Workflow:** feature
**State:** COMPLETED 2026-06-25 (shipped c01a3f9; review-quality clean — 3 MINOR auto-backlogged)
**Created:** 2026-06-25
**Entry:** spec (complex feature)
**Source WBS:** `docs/product/qol-wbs.md` → WP1
**Backlog:** SURFACE-2026-06-24-NO-WAY-TO-CLOSE-A-WORKSPACE
**Drive mode:** autopilot

## Problem Statement

Claudesk can OPEN a workspace (picker / filmstrip "+" → `openWorkspace` appends) and
switch between workspaces, but there is **no way to close one**. Workspaces accumulate
with no removal path — each holds a live CC PTY session, a second-terminal shell, a
filesystem watcher, an editor with open tabs, and a status-registry entry, none of which
can be torn down short of quitting the app. This directly impedes the multi-workspace
daily-driver use case the M3+M4 dogfood depends on (you open a project to do a quick
thing, and it's stuck on the roster forever).

The close path is more than a list-splice: it must reap the workspace's backend
resources (two PTY sessions, the watcher), update the status-broadcaster registry,
re-pick the center stage, fall back to the picker when the last one closes, and guard a
workspace with unsaved editor edits. Several of these are cross-layer and have real
edge cases — hence a spec.

## User Stories

- As a multi-project user, I want an × on each filmstrip tile so that I can close a
  workspace I'm done with and reclaim the roster slot + its CPU/memory.
- As a user closing the workspace I'm currently looking at, I want Claudesk to promote
  another workspace to center stage so that I'm never left staring at a blank stage.
- As a user closing my last open workspace, I want to land back on the full-screen
  project picker so that I can immediately open the next project.
- As a user who has unsaved edits in a workspace's editor, I want a confirm prompt
  before the close discards them so that I don't lose work by a stray ×-click.

## Acceptance Criteria

The feature is done when:

1. **Close affordance.** Each expanded filmstrip tile shows an × button (appears on
   hover) that closes that workspace. (Collapsed-pill close is OUT — see Out of Scope.)
2. **Reducer.** A `closeWorkspace(state, id)` reducer removes the workspace from
   `workspaces` and re-picks `focusedId` per the focus rules below. Pure, unit-tested.
3. **Focus re-pick.**
   - Closing a **non-focused** workspace: `focusedId` is unchanged.
   - Closing the **focused** workspace (and others remain): promote a neighbour to
     center stage — the tile to the **left** in filmstrip order, or the first remaining
     tile if the closed one was leftmost. (Decision Q1.)
   - Closing the **last** workspace: `focusedId → null`; the derived `view` flips to
     `"picker"` (full-screen picker returns). This already follows from `viewFor` once
     the array is empty — verify it does.
4. **CC session reaped.** The closing workspace's left-half CC PTY session is killed
   (`cc_kill` on its `cc_session_id`). No orphan `claude` process survives the close.
5. **Second-terminal reaped.** The closing workspace's WP9 second-terminal shell session
   is killed too (it is a real PTY in the same `SessionRegistry`). No orphan login shell.
6. **Watcher + registry torn down.** The workspace's filesystem watcher is stopped
   (`workspace_watch_stop`) and its status registry entry is removed
   (`workspace_deregister`). These already ride the `useWorkspaceStatus` register/
   deregister diff loop — confirm a `closeWorkspace` that removes the id from the array
   fires both for free, and add nothing redundant.
7. **Dirty-tab guard.** Closing a workspace that has ≥1 unsaved (dirty) editor tab
   prompts a confirm ("Discard unsaved changes in N file(s)?") before tearing down.
   Cancel aborts the close entirely (nothing is torn down); confirm proceeds. A
   workspace with no dirty tabs closes with no prompt.
8. **No leak, no double-kill.** The teardown is idempotent and ordered so that nothing
   double-kills a session or leaves a dangling listener. Re-opening the same project
   after closing it spawns fresh sessions cleanly (no "session ended" overlay carryover).
9. **Tests.** Reducer unit tests (focus re-pick matrix incl. leftmost/last/non-focused);
   a dirty-guard predicate test; the cross-layer teardown verified live (verify-human).

## Out of Scope

- A "Close Workspace ⌘⇧W" **native-menu item / hotkey.** Natural follow-up once close
  exists (noted in the WBS as pairs-with), but a separate small task — keeps this WP to
  the × affordance + the lifecycle. (The menu's other items mirror existing features;
  this adds a new one, so it's deliberately deferred.)
- ~~**Close from a collapsed pill.** v1 ships the × on expanded tiles only.~~ **SUPERSEDED
  2026-06-25 (operator request at Phase-3 verify-human):** the × is now ALSO on collapsed
  pills — folded in as P3.6. (Dogfooding immediately wanted it.)
- **Undo-close / reopen-recently-closed.** Not in v1.
- **Confirm-on-close for a still-running CC session** (a CC mid-task). v1 only guards
  on unsaved EDITOR edits; a running CC is killed without a prompt (yolo posture — the
  user closing the tile is the intent). Revisit only if dogfooding bites.
- **Folder/recursive teardown semantics** — n/a, a workspace is a flat unit.

## Technical Constraints

No 3rd-party dependency — pure in-app UX + existing backend commands. (3rd-party probe
check: N/A.)

**Seams (verified by reading the code this session):**

- `src/state/workspace.ts` — the pure reducer module. Has `openWorkspace`,
  `focusWorkspace`, `setSessionId`; **needs a new `closeWorkspace(state, id)`**. `viewFor`
  (in `state/appView.ts`) already derives `"picker"` from an empty list — the last-close
  → picker behavior should fall out of removing the final workspace (CONFIRM in plan).
- `src/state/useWorkspaceList.ts` — thin React binding; add a `closeWorkspace(id)`
  callback wrapping the reducer. Expose it on `WorkspaceListApi`.
- `src/state/useWorkspaceStatus.ts` (lines 75–119) — **the register/deregister + watcher
  start/stop already DIFF the workspace list.** Removing a workspace from the array makes
  this effect fire `workspace_deregister` + `workspace_watch_stop` automatically (the
  comment at line 81–83 explicitly anticipates "a QoL-WP1 close"). So criteria 6 is
  largely FREE — the close just needs to drop the workspace from the array; do NOT add a
  parallel deregister call (double-deregister).
- **CC + second-terminal kill is NOT free.** `XtermPane` (lines 210–225) explicitly does
  NOT kill its backend session on unmount today — the comment says "multi-workspace
  pane-close will revisit this." Two candidate designs (Decision Q2):
  - **(A) Per-pane kill-on-unmount in `XtermPane`.** Add a real teardown that calls
    `cc_kill(sessionIdRef.current)` on unmount. Because a closed workspace is genuinely
    removed from the array (real unmount, unlike the display:none background-keep), this
    one change reaps BOTH the CC pane AND the second-terminal pane generically (both are
    `XtermPane` instances). Must NOT fire on the StrictMode dev double-unmount in a way
    that kills a surviving session — but the per-run `cancelled` flag + a real unmount
    only happen on a true close, so a guarded unmount-kill is safe. This also fixes the
    long-standing "session outlives nothing reaps it until window close" gap.
  - **(B) Explicit kill in the close handler (App).** App kills `cc_session_id` directly;
    but the second-terminal id is **owned internally by `TerminalPane`'s `XtermPane`** and
    never lifted to workspace state, so (B) cannot reap the second terminal without
    lifting that id. (A) is strongly preferred — it reaps both and fixes the latent gap.
- **Dirty-tab guard plumbing.** `EditorSplitHandle` (in `editor/EditorSplit.tsx`) exposes
  `closeActiveTab` + `checkDiskForPaths` but **no aggregate "are any tabs dirty?" query.**
  The guard needs the workspace's editor to report dirtiness up to the close handler.
  Candidate: add a `hasDirtyDocs(): boolean` (or `dirtyDocCount(): number`) to
  `EditorSplitHandle`, surface it through `RightPanelHost` → `Workspace` to App (a ref or
  a registry keyed by workspace id), and have the close handler consult it before tearing
  down. `editorDocs.isDirty` already exists per-entry — the aggregate is a fold over the
  docs state. Reuse `ConfirmModal` + a `confirmDialog` spec for the prompt (Decision Q3
  on exact plumbing — ref vs. lifted state vs. a small per-workspace dirty registry).
- `src/components/workspace/Filmstrip.tsx` — add the × button to the EXPANDED tile
  render (criteria 1). The strip's pointer handlers do drag/promote on `[data-tile-index]`
  elements; the × must `stopPropagation` so an ×-click is NOT read as a tile press
  (promote) by `onStripPointerDown`/`onStripPointerUp`. Wire an `onClose(workspaceId)`
  prop from App.
- `src/components/workspace/filmstripOrder.ts` / `filmstripTiles.ts` — `orderWorkspaces`
  **already ignores persisted-order entries whose path isn't open** (filmstripTiles.ts
  line 80–89). So a closed workspace's stored order entry is harmless (skipped on render)
  and re-opening restores its old position. **Decision Q4:** actively prune the stored
  entry on close (loses arrangement on a transient close) vs. leave it (preserves
  arrangement; harmless stale entry). Leaning LEAVE — the WBS task says "drop the entry,"
  but the skip already covers the only failure mode (a ghost tile), and preserving
  arrangement across a close→reopen is the better UX. Resolve at plan.
- `src/App.tsx` — owns `useWorkspaceList`; add the close handler that (optionally) runs
  the dirty guard, then calls `closeWorkspace(id)`. Pass `onClose` to `<Filmstrip>`.

**Project rules that bear on this:**
- "All workspaces stay mounted" — closing is the explicit EXCEPTION (a real unmount +
  teardown). Spell that out in the code comment so a future reader doesn't think it
  violates the rule.
- No `unwrap()` in backend; `cc_kill` already returns `Result`. Frontend: surface a
  failed `cc_kill`/`workspace_*` invoke to the console (never silently swallow — the WP6
  IPC-error lesson), but a kill failure must NOT block the UI close (best-effort teardown,
  same posture as `kill_all`).

## Resolved Decisions (plan)

- **Q1 — focus re-pick → LEFT-neighbour-in-filmstrip-order.** On closing the focused
  workspace, promote the tile to its left in CURRENT FILMSTRIP ORDER; if the closed tile
  was leftmost, promote the new leftmost (= old index 1). Non-focused close leaves
  `focusedId` unchanged. Last close → `focusedId: null` (→ picker, `viewFor` confirmed:
  it returns "picker" when `focusedId === null` OR `workspaces.length === 0`). NOTE: the
  reducer in `state/workspace.ts` only knows the WorkspaceList ARRAY order, not the
  persisted filmstrip order. To honour "left in filmstrip order" the re-pick must be
  computed against the ORDERED tiles, so the close handler in App (which has `tiles`)
  resolves the next-focus id and the reducer takes an explicit `nextFocusId` — OR the
  reducer re-picks against array order and App overrides focus. **Decision: reducer
  re-picks against array order (simple, pure, testable); the array order and filmstrip
  order coincide for the common case (no custom drag-order). A custom-ordered roster
  promoting the array-left neighbour instead of the visual-left one is an acceptable v1
  imperfection — revisit only if dogfooding notices.** Keeps the reducer pure and the
  focus logic in one place. (If this proves wrong, App can pass `nextFocusId` later.)
- **Q2 — teardown → Design A (per-pane kill-on-unmount in `XtermPane`).** Add an
  unmount teardown that calls `cc_kill(sessionIdRef.current)`. Because a closed workspace
  is genuinely removed from the array (real unmount, unlike the display:none background-
  keep), this ONE change reaps BOTH the CC pane and the WP9 second-terminal pane (both
  are `XtermPane`). Guard: the kill fires in the mount-effect's cleanup, which under
  StrictMode dev runs on the throwaway first mount too — but that cleanup kills the
  session that mount spawned (its own `sessionIdRef`), and the re-mount spawns a fresh
  one, so no surviving session is killed. The existing per-run `cancelled` self-kill
  handles the spawn-resolves-after-unmount race. This also fixes the latent "a live
  session outlives its pane until window-close `kill_all`" gap the WP7 comment flagged.
- **Q3 — dirty guard → `dirtyDocCount()` on `EditorSplitHandle` + a per-workspace dirty
  registry in App.** `EditorSplit` owns the full `DocsState.byPath`; add
  `dirtyDocCount(): number` (a fold over `byPath` via the existing `isDirty`). Thread a
  `registerDirtyProbe(workspaceId, () => number)` callback `App → CenterStage →
  Workspace → RightPanelHost`; App holds a `Map<workspaceId, () => number>` ref. The
  close handler reads the probe for the closing id; if > 0, open a `ConfirmModal`
  (reuse `confirmDialog` spec) — confirm proceeds, cancel aborts the whole close. No
  editor doc state lifted into workspace state (editor stays self-contained).
- **Q4 — persisted filmstrip-order entry → LEAVE it (do NOT prune).** `orderWorkspaces`
  already skips persisted paths that aren't open (`filmstripTiles.ts` lines 80–89), so a
  stale entry can never produce a ghost tile — the only failure mode is already covered.
  Leaving it preserves the user's drag-arrangement across a close→reopen, which is better
  UX. This is a deliberate, documented deviation from the WBS task's literal "drop the
  entry" wording (the WBS predates confirming the skip already handles it).

## Work Tree

- [x] Phase 1: Reducer + binding — `closeWorkspace`  <!-- status: complete -->
  <!-- Relevance check N/A — Phase 1 was the first phase; the gate applies before Phase 2 (recorded under Phase 2 below). -->

  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/__tests__/workspace.test.ts` exits 0 — new cases:
    close non-focused leaves focusedId; close focused promotes left-neighbour (array
    order); close leftmost-focused promotes new-leftmost; close last → focusedId null;
    close unknown id → state unchanged (no-op).
  - CLI: `pnpm exec tsc --noEmit` exits 0 — `WorkspaceListApi` gains `closeWorkspace`.
  - [x] P1.1 Add pure `closeWorkspace(state, id)` to `src/state/workspace.ts`: remove the
    workspace; if it was focused, re-pick `focusedId` = the array-index-left neighbour
    (or new-leftmost if it was index 0, or `null` if it was the only one); if it was not
    focused, keep `focusedId`; unknown id → return state unchanged.  <!-- status: complete -->
  - [x] P1.2 Wire `closeWorkspace(id)` callback into `useWorkspaceList.ts` + add to
    `WorkspaceListApi`.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — vitest 20/20, tsc clean, eslint clean -->
  - [x] verify-self  <!-- status: complete — CLI outcomes PASS (vitest 20/20); no integration boundary (isolated new artifacts: closeWorkspace reducer + API method, no consumer until Phase 3); no live UI surface this phase -->
  - [x] verify-human  <!-- status: complete — AUTO-SKIPPED (F11) per drive_mode=autopilot; no integration boundary, isolated new artifacts only -->
  - [x] verify-codify  <!-- status: complete — behaviors already codified during build (6 closeWorkspace cases); full suite 448 pass, no regression; no boundary, no new tests needed -->

- [x] Phase 2: Backend teardown — per-pane CC + second-terminal kill on unmount  <!-- status: complete; depends on Phase 1 -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WBS WP1 unchanged.
  - Requirements unchanged: yes — Phase 1 confirmed the seams.
  - Solution still feasible: yes — Design A (XtermPane unmount-kill) confirmed by reading the lifecycle code.
  - No superior alternative discovered: yes.
  **Verdict:** proceed.
  **Observable outcomes:**
  - CLI: after closing a workspace in the running app, `pgrep -fl claude` shows ONE
    fewer `claude --dangerously-skip-permissions` process (the closed workspace's CC is
    reaped); closing the last leaves zero.
  - CLI: `cargo test` (in `src-tauri/`) exits 0 — no backend regression (the kill path
    reuses the existing `cc_kill`; no new Rust unless a teardown needs it).
  - Console: closing a workspace logs no uncaught errors; a failed `cc_kill` is
    `console.error`'d (surfaced) but does not block the close.
  - [x] P2.1 Add an unmount teardown to `XtermPane` that calls `cc_kill` on its live
    `sessionIdRef.current` (best-effort `.catch`). Update the lifecycle comment (lines
    ~210–225): closing a workspace is the real-unmount path the WP7 note deferred; the
    StrictMode-cleanup safety argument (kills only the session this mount spawned).  <!-- status: complete — cleanup now kills sid; reaps BOTH cc_spawn + term_spawn panes generically; tsc+eslint clean -->
  - [x] P2.2 Confirm `workspace_deregister` + `workspace_watch_stop` fire automatically
    via the `useWorkspaceStatus` diff loop when the id leaves the array (read-only
    confirm; no code unless the diff misses it). Note the confirmation in the WIP.  <!-- status: complete — CONFIRMED: useWorkspaceStatus.ts:84-96 — the `for ([id] of registered) if (!liveIds.has(id))` branch fires both invokes when closeWorkspace drops the id from `workspaces`. The line 81-83 comment explicitly names "a QoL-WP1 close". No code needed. -->
  - [x] verify-auto  <!-- status: complete — tsc clean, eslint clean (only pre-existing spawn-spread warning), cargo test 221 pass (no backend regression) -->
  - [x] verify-self  <!-- status: complete — static outcome (cargo test 221 pass) PASS; the two LIVE outcomes (pgrep one-fewer claude on close; console clean on close) are GATED on Phase 3's × trigger — no code unmounts a <Workspace> until closeWorkspace is wired to the button in P3, and no app is running. Deferred to Phase 3 verify-human, where the end-to-end close path (× → closeWorkspace → unmount → cc_kill → pgrep) is exercisable. No spawn against a non-existent surface. -->
  - [x] verify-human  <!-- status: complete — AUTO-SKIPPED (F11) per drive_mode=autopilot; no reachable integration boundary (XtermPane unmount-cleanup is dormant until Phase 3 wires the × trigger); live outcomes carried to Phase 3 -->
  - [x] verify-codify  <!-- status: complete — no new test: behavior's meaningful coverage is the end-to-end close path (exercisable only with Phase 3's × trigger, carried to Phase 3 outcomes); a mock-heavy XtermPane unit test would be low-value. Full suite 448 pass, no regression. No integration boundary. -->

- [x] Phase 3: UI — × on filmstrip tile + dirty-tab confirm guard  <!-- status: complete; depends on Phase 2 -->
  **Relevance check (before Phase 3):** requester needs it: yes · requirements unchanged: yes · feasible: yes (Phases 1+2 confirmed seams) · no superior alt: yes. **Verdict: proceed.**
  **Observable outcomes:**
  - Browser: each EXPANDED filmstrip tile shows an × control (data-testid
    `filmstrip-close-<id>`); clicking it removes that tile from the strip. An ×-click
    does NOT promote the tile (no center-stage switch to the closing workspace).
  - Browser: closing the focused tile promotes the left-neighbour to center stage (its
    `data-active="true"` moves); closing the last tile shows the full-screen picker
    (`data-testid="app-shell"` contains the ProjectPicker, no `center-stage`).
  - Browser: with an unsaved editor tab in a workspace, clicking its × shows a confirm
    dialog (data-testid `confirm-dialog`); Cancel keeps the workspace; Confirm closes it.
    A workspace with no dirty tabs closes with no dialog.
  - CLI: `pnpm vitest run` + `pnpm exec tsc --noEmit` exit 0 (dirty-guard predicate +
    any tile-derivation change covered).
  - CLI (carried from Phase 2 — the × now provides the trigger): after closing a
    workspace, `pgrep -fl claude` shows ONE fewer `claude --dangerously-skip-permissions`
    process (the unmount-kill reaps the closed workspace's CC); closing all → zero. And
    `pgrep`-equivalent for the second-terminal shell if one was opened.
  - Console (carried from Phase 2): closing a workspace logs no uncaught errors; a failed
    `cc_kill` is `console.error`'d but does not block the close.
  - [x] P3.1 Add `dirtyDocCount(): number` to `EditorSplitHandle` (fold `DocsState.byPath`
    via `isDirty`) in `EditorSplit.tsx`.  <!-- status: complete — pure dirtyDocCount() in editorDocs.ts + handle method reading the existing docsRef -->
  - [x] P3.2 Thread a `registerDirtyProbe(workspaceId, probe)` callback App → CenterStage
    → Workspace → RightPanelHost; RightPanelHost registers `() =>
    editorSplitRef.current?.dirtyDocCount() ?? 0` on mount (unregister on unmount). App
    holds the `Map<workspaceId, () => number>` ref.  <!-- status: complete — threaded through all 4 layers; App holds dirtyProbes ref + useCallback registerDirtyProbe -->
  - [x] P3.3 Add the × button to the EXPANDED tile in `Filmstrip.tsx` (hover-revealed via
    CSS); wire an `onClose(workspaceId)` prop; the × handler `stopPropagation` so the
    strip's pointerdown/up drag-or-promote logic doesn't treat it as a tile press.  <!-- status: complete — span role=button (avoids nested <button>), onPointerDown stopPropagation, data-testid filmstrip-close-<id> -->
  - [x] P3.4 In `App.tsx`: a `closeWorkspace`-handler that reads the dirty probe for the
    id; if dirty > 0 open a `ConfirmModal` (reuse `confirmDialog` / `replaceAllSpec`-style
    spec), else close immediately; on confirm call `closeWorkspace(id)`. Pass `onClose` to
    `<Filmstrip>`. Add the confirm-modal render at the app-shell level.  <!-- status: complete — requestClose reads dirtyProbes; pendingClose state + closeWorkspaceSpec confirm; resolveClose closes on "close" -->
  - [x] P3.5 CSS for the × button (hover-reveal, top-right of the tile) in `App.css`,
    dark-only tokens (no light variant — project rule).  <!-- status: complete — .filmstrip-tile-close opacity:0 → 0.7 on tile:hover/focus-visible → 1 + red on its own hover; pointer-events:auto overrides header's none -->
  - [x] P3.6 (added 2026-06-25 — operator scope request at verify-human; supersedes the
    spec's "collapsed × OUT of scope") Add the same × to the COLLAPSED filmstrip PILL in
    `Filmstrip.tsx` (the `filmstrip-pill` branch) + hover-reveal CSS. The pill's onClick is
    click-to-promote, so the × must `stopPropagation` (pointerdown + click) to avoid
    promoting. Reuse the SAME `onClose` prop — the dirty-guard + focus-repick + reap all
    ride App's `requestClose` unchanged.  <!-- status: complete — .filmstrip-pill-close span role=button, stopPropagation, reuses onClose; CSS hover-reveal mirrors expanded ×; tsc+eslint+vite build clean -->
  - [x] verify-auto  <!-- status: complete — closeWorkspaceGuard 8 + workspace 20 tests pass, tsc clean, eslint clean on all 8 changed files -->
  - [x] verify-self  <!-- status: complete with caveat — CLI outcome PASS (vitest+tsc); integration boundary present (App/Filmstrip/CenterStage/Workspace/RightPanelHost), outcomes cite the consuming surfaces. STATIC wiring confirmed fully connected (requestClose→dirty-probe→pendingClose/closeWorkspace; × testid+stopPropagation; probe register/unregister) AND `vite build` ✓ (all 8 files import/compile clean). The LIVE browser+backend outcomes (× removes tile, focus re-pick, picker fallback, dirty confirm dialog, pgrep one-fewer claude, console-clean-on-close) are UNVERIFIED-by-agent: no dev server running + the pgrep outcomes need the real Tauri app (not a bare Vite browser). Surfaced to verify-human (operator drives pnpm tauri:dev — the correct surface, per the installed-build-smoke-test convention). No blocking failure at static/build level. -->
  - [x] verify-human  <!-- status: complete — 9/9 leaves PASSED 2026-06-25 (8 expanded-× + close behaviors, then P3.6 collapsed-× re-verified .9 PASS after the F12 scope-addition back-loop) -->
    - [x] P3.verify-human.1 Hover an expanded filmstrip tile → an × appears top-right; click it → that workspace's tile disappears from the strip. The × click does NOT switch the center stage to that workspace first.  <!-- status: complete — operator PASS 2026-06-25 -->
    - [x] P3.verify-human.2 Close the FOCUSED (center-stage) workspace with ≥2 open → the left-neighbour is promoted to center stage (no blank stage).  <!-- status: complete — operator PASS 2026-06-25 -->
    - [x] P3.verify-human.3 Close a NON-focused workspace → the center stage is unchanged (still showing the one you were on).  <!-- status: complete — operator PASS 2026-06-25 -->
    - [x] P3.verify-human.4 Close the LAST remaining workspace → the full-screen Project Picker returns.  <!-- status: complete — operator PASS 2026-06-25 -->
    - [x] P3.verify-human.5 In a workspace, edit a file in the editor (leave it dirty/unsaved), then click that workspace's × → a confirm dialog appears ("…has unsaved changes in N file(s)…"). Cancel → workspace stays. Re-click × → Close Anyway → workspace closes.  <!-- status: complete — operator PASS 2026-06-25 -->
    - [x] P3.verify-human.6 Close a workspace with NO unsaved edits → it closes immediately, NO confirm dialog.  <!-- status: complete — operator PASS 2026-06-25 -->
    - [x] P3.verify-human.7 BACKEND REAP (the carried Phase-2 outcome): with N workspaces open, note `pgrep -fl claude` count, close one workspace, re-run `pgrep -fl claude` → ONE fewer `claude --dangerously-skip-permissions` process. If you opened the second-terminal panel in that workspace, its login shell is also gone. No orphan processes accumulate.  <!-- status: complete — operator PASS 2026-06-25 -->
    - [x] P3.verify-human.8 Console clean: closing a workspace logs no uncaught errors (a benign `cc_kill … failed` console.error is acceptable only if the session had already exited).  <!-- status: complete — operator PASS 2026-06-25 -->
    - [x] P3.verify-human.9 Hover a COLLAPSED filmstrip pill → an × appears; click it → that workspace closes (same dirty-guard + focus-repick + reap as the expanded ×). The × click does NOT promote the pill first.  <!-- status: complete — operator PASS 2026-06-25 -->
  - [x] verify-codify  <!-- status: complete — pure logic fully codified (14 tests: 6 closeWorkspace + 8 dirtyDocCount/closeWorkspaceSpec). UI behavior is Playwright-class (deferred per project E2E convention) + operator-verified at verify-human. Full suite 456 pass, no regression. -->

## Current Node
- **Path:** Feature > review-quality COMPLETE → feature-finalize
- **Active scope:** Shipped (c01a3f9); review-quality done (0 CRITICAL / 0 MAJOR / 3 MINOR auto-backlogged); ready to finalize
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Code-Quality Review — qol-wp1-close-workspace

### Strengths
- Clean separation of pure logic (`closeWorkspace` reducer, `dirtyDocCount` fold, `closeWorkspaceSpec`) from React/IPC wiring — all three vitest-covered with meaningful cases (focus re-pick variants, unknown-id no-op, dirty-count revert-to-clean).
- The per-pane `cc_kill`-on-unmount generically reaps both the CC pane and the WP9 second-terminal pane because both are `XtermPane` instances, closing the documented latent WP7 gap without lifting session ids up to App.
- Reference-identity discipline correct throughout: `registerDirtyProbe` useCallback-stable (effect runs once/workspace); `dirtyDocCount` reads `docsRef.current` with empty deps (handle not rebuilt per keystroke).
- Reducer returns same state reference on unknown-id; the "all workspaces stay mounted" exception is documented at every site that creates it.
- Safe-default UX: confirm dialog makes Cancel primary + Esc → cancel; danger variant reserved for "Close Anyway".

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [Filmstrip.tsx:312-340, 252-280] The expanded × comment narrates a rejected "invalid nested `<button>`" alternative before the actual `<span role=button>` choice — trim to state only what shipped.
- [EditorSplit.tsx:137-141] The "(A live `docsRef` mirror already exists below…)" comment forward-references the `docsRef` ~50 lines down, restating what the `docsRef.current` read already makes obvious.
- [Filmstrip.tsx / App.tsx] No component/integration test for the × button (stopPropagation routing, keyboard) or the App-level probe-registry / focus-repick wiring; only the pure layer is covered. Accepted boundary per the project's manual-host-UI convention + live 9/9 verification, but the App wiring (`requestClose` stale-closure, `resolveClose`) is the part most likely to regress silently.

### Assessment
Well-built, idiomatic work that fits the existing architecture. The standout — reaping PTYs in `XtermPane`'s unmount cleanup so a single list-removal tears down both panes generically — is leverage that reduces complexity and closes a pre-existing gap as a side effect. StrictMode-safety reasoning sound. The Q1 array-order-vs-visual-order divergence is honestly documented as an accepted v1 trade-off. Only debt: a couple over-narrated comments + absence of App-wiring automation — neither above MINOR. Net: advances the codebase, accrues no meaningful debt.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The spec assumed killing the CC + second-terminal would need explicit handler-side `cc_kill` calls, with the second-terminal's session id being a problem (it's owned inside `TerminalPane`'s `XtermPane`, never lifted to App). Reading the lifecycle revealed a cleaner path: because a real close genuinely UNMOUNTS the `<Workspace>`, a per-pane `cc_kill`-on-unmount in `XtermPane` reaps BOTH panes generically — no id-lifting needed — and incidentally closes the latent WP7 "session outlives its pane until window-close kill_all" gap. The `useWorkspaceStatus` diff loop was already written (WP0) to fire deregister + watch-stop on list removal, so two of the four teardown obligations were free.
- **Assumptions that held:** The reducer/binding/UI three-phase split was right-sized; `viewFor` already returned "picker" on an empty list (last-close → picker fell out for free); `ConfirmModal`/`ConfirmSpec` reused cleanly for the dirty guard; the dirty-probe registry threaded App→CenterStage→Workspace→RightPanelHost without friction.
- **Assumptions that were wrong:** The spec scoped the collapsed-pill × OUT ("expanded tiles only, fiddly"). The operator wanted it immediately at verify-human — a 1-build F12 back-loop folded it in. Lesson: a "v1 leaves X out" scope cut on a small, symmetric affordance is cheap to add and worth a second thought at spec time.
- **Approach delta:** Implementation matched the plan except (1) the collapsed-× scope addition (F12 back-loop, P3.6), and (2) the live UI/backend outcomes couldn't be agent-verified (no running Tauri app + the `pgrep` reap needs the real app, not a Vite browser) — they were carried to verify-human and operator-confirmed 9/9. The pure-logic phases (1, 3) were fully agent-verifiable; the cross-layer/backend phases (2, 3-live) leaned on the operator, which is the correct posture for a Tauri desktop feature touching process lifecycle (per the installed-build-smoke-test convention).

## Discoveries
<!-- [SURFACED-<date>] <target node> — <summary> -->
- [SURFACED-2026-06-25] feature-spec — `docs/product/arch.md` exceeds size guard (382 lines), read first 100 + headings only. Consider summarizing at next finalize.
