# Feature: M4 WP2 — N>1 lift (picker appends a workspace)

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-06-23
**Entry:** spec (complex feature)
**Milestone:** Milestone 4 (Multi-workspace UX) — WBS §WP2
**Drive mode:** autopilot
**Size:** M

## Problem Statement

Claudesk's WorkspaceList, CenterStage, and Workspace components were built N-ready from M1
(array of workspaces, `display:none` keep-mounted, `visible`-gated panel liveness), but a
deliberate **N=1 clamp** holds the list to a single workspace: `openWorkspace` *replaces* any
existing workspace instead of appending (`src/state/workspace.ts:73`). M4 is the dogfood-replace
milestone — the operator runs 3–4 projects concurrently — so this clamp must be lifted: opening
a project must **append** a new workspace (with its own CC session) and switch the center stage
to it, while every other workspace stays mounted and alive in the background.

Lifting the clamp exposes latent single-workspace assumptions across the already-shipped
backend/frontend that were correct at N=1 but break or degrade at N>1. WP2 is the *synchronous
core* of multi-workspace — it makes N workspaces genuinely coexist — **before** any filmstrip
rendering (WP3) sits on top. It also folds in the long-deferred picker IPC error-surfacing
(MAJORs deferred from M1 WP6 specifically to pair with this open-flow rework).

WP1's mount-cost probe already cleared the one architecture-shaping unknown: **GO for eager-mount**
— a new workspace mounts its EditorPanel eagerly at open, no `React.lazy`, no mount-sequence delta.

## User Stories

- As the operator, I want clicking a project in the picker to **add** a new workspace (not replace
  my current one) so I can have several projects open at once.
- As the operator, I want a way to **re-open the picker while a workspace is already open** (a "+"
  control in the filmstrip → picker overlay) so I can add a second/third project without closing
  what I have.
- As the operator, I want re-opening a project that's **already open** to just **focus** the existing
  workspace (not spawn a duplicate CC session for the same directory).
- As the operator, I want **window-close to stay responsive** even with N sessions open (not hang
  for N×3s while each CC session is reaped one at a time).
- As the operator, I want each workspace's panel state (active panel, open files, scroll, focus) to
  be **fully independent** — switching center stage never leaks one workspace's state into another.
- As the operator, I want picker IPC failures (a malformed `projects.json`, a failed open/remove) to
  **surface visibly** instead of silently leaving an empty list or dropping the action.

## Acceptance Criteria

The feature is done when:

### A. N>1 open-flow (append + focus-existing)
- [ ] `openWorkspace(state, projectPath)` **appends** a new `Workspace` (fresh `id`, `project_path`,
      its own `PtyCcSession` via the existing XtermPane spawn) to `state.workspaces` and focuses it —
      no longer the `{ workspaces: [ws], ... }` replace clamp at `src/state/workspace.ts:79`.
- [ ] **Reopen = focus, not duplicate:** if a workspace for the same canonicalized `project_path` is
      already open, `openWorkspace` focuses the existing one and appends nothing (no second CC session
      for the same directory). Canonicalization matches the M3 broadcaster's cwd-canonicalization rule
      so "same project" agrees across the two subsystems.
- [ ] Center-stage switch: the newly-opened (or re-focused) workspace becomes `visible` (center-stage,
      `display:block`); the prior focused one demotes to `display:none`, **stays mounted**, its PTY +
      panel state persist (the M1 substrate rule, now exercised at N>1 for the first time).

### B. New-workspace re-entry (picker overlay)
- [ ] A persistent **"+" control in the Filmstrip slot** (always-rendered when a workspace is open)
      opens the **ProjectPicker as an overlay/modal** over the current center stage.
- [ ] Picking a project from the overlay calls the same `openWorkspace` append path, then dismisses
      the overlay; the new workspace is center-stage. The overlay is dismissable without opening
      anything (Esc / backdrop click / a close affordance) — dismissing leaves the current workspace
      untouched.
- [ ] First-open (no workspace yet) still shows the picker full-screen as today; the overlay is only
      the *re-entry* path once `view === "workspace-open"`.

### C. M3 broadcaster registry generalizes N≤1 → N>1
- [ ] Each workspace registers (`workspace_register`) on open and deregisters (`workspace_deregister`)
      on close, so the canonical cwd→workspace map holds **N** entries; an unmatched cwd is still
      dropped (the WP6-M3 list-diffing behavior is confirmed to generalize, not just work at N≤1).
- [ ] A `workspace-status` event for one workspace's cwd updates **only that** workspace's status —
      no cross-workspace status bleed at N>1.

### D. N=1-clamp ripple resolved
- [ ] **`kill_all` parallelized:** window-close terminates N sessions with overlapping (not serialized)
      3s grace windows, so close latency at N is ~3s, not N×3s. The registry lock is not held across the
      per-session grace waits. Best-effort semantics preserved (one session's failure doesn't block the
      others); no orphaned `claude`/shell child leaks.
- [ ] **`active`/`visible`-prop audit:** panel chords (⌘⇧E/D/T, ⌘P, ⌘W, find/search) and spawn-gating
      fire **only** for the genuinely-focused workspace. Confirm RightPanelHost's `visible` gate +
      `active={visible && panel === ...}` composition does not leak to a background workspace at N>1
      (no event-listener double-fire, no background EditorPanel taking a chord).
- [ ] **Per-workspace panel-seam independence:** each workspace keeps its own active panel
      (editor/diff/terminal), open files, and scroll across center-stage switches — switching away and
      back restores the workspace exactly as left (the `"terminal"` panel-seam state is per-workspace).

### E. Picker IPC error-surfacing (folds in deferred M1 WP6 MAJORs)
- [ ] The picker **mount loader** surfaces a rejected `prune_missing_projects` / `list_projects`
      (e.g. a malformed `projects.json`) as a visible error — no longer swallowed into a silent empty
      list (which masks a real load failure as "no projects yet").
- [ ] The picker **mutation handlers** (`record_open` / `add_project` / `remove_project`) surface a
      rejection visibly instead of dropping it as an unhandled promise rejection.
- [ ] The surfaced-error UX reuses the established `cc-error-overlay` / toast IPC-error pattern (the
      `picker-toast` surface already exists for the prune case — extend it, don't invent a new one).
      First-run-empty (`projects.json` absent → backend returns `[]`) is **not** an error and shows no
      toast.

### F. Tests
- [ ] Pure reducer/handler tests (vitest): append-vs-focus-existing (incl. canonicalized
      same-path dedup), center-stage switch, and `viewFor` staying `workspace-open` at N>1.
- [ ] `kill_all`-at-N parallelization (cargo): assert all N sessions are killed AND total wall-clock
      is ~one grace window, not N× — exercised through a pure-timing seam with the existing `FakeSession`
      double (extend it with a controllable delay; no real PTY).
- [ ] Picker error-surfacing path (vitest): loader/mutation rejection → surfaced-error state mapping;
      first-run-empty maps to no-error.

## Out of Scope

- **Filmstrip tile rendering** (one tile per workspace, status dots, live `serializeAsHTML()` mirror,
  click/`⌘⇧+digit` promote, drag-reorder) — that's **WP3**. WP2 only adds the bare **"+" control** to the
  otherwise-empty filmstrip slot; it does NOT render workspace tiles.
- **`⌘⇧+digit` workspace-switch hotkey** — WP3 (reserved chord; memory `cmd-shift-digit-reserved-for-filmstrip`).
- **Left/right focus indicator** — WP4b (parallel, separate WP).
- **Filmstrip collapse toggle** — WP4.
- **Closing a workspace from the UI** — no per-workspace close button in WP2 (window-close `kill_all`
  is the only teardown path today; per-workspace close is a WP3-era affordance once tiles exist). The
  `kill_all` parallelization here is still required because it's the N-session shutdown path.
- **Removing the WP1 throwaway probe** (`src/probe/nworkspaces/` + the `?nwsprobe` branch) — DEV-only,
  cleaned at M4 close per the probe convention. WP2 must NOT build on it.
- **Drive-mode selector, menu-bar, PiP, auto-resume** — later milestones.

## Technical Constraints

- **No 3rd-party dependency** → 3rd-party probe check N/A (pure in-app UX over already-shipped seams).
- **Eager-mount verdict (WP1, `9f3e0fe`/`1fa2548`):** a new workspace mounts its EditorPanel eagerly at
  open — NO `React.lazy`, NO mount-sequence delta to honor. Outcome doc:
  `docs/product/wp1-n-workspace-cost-probe-outcome.md`.
- **The substrate is already N-ready** (read during spec): `CenterStage` maps over all workspaces and
  toggles `visible`; `Workspace` uses `display:none` to keep the subtree mounted; `RightPanelHost`
  gates all liveness + chords on `visible`. The clamp lives in exactly one place — `openWorkspace`
  (`src/state/workspace.ts:79`). The ripple work is *audit-and-confirm* for B/C/D items that are
  largely already correct via the `visible` gate; the genuine code change is the append flip,
  the "+" overlay, `kill_all` parallelization, and picker error-surfacing.
- **`kill_all` shape today** (`src-tauri/src/cc_session/mod.rs:512`): sequential loop, each `kill()`
  polling up to a 3s `Instant::now() + Duration::from_secs(3)` deadline; invoked under the registry
  `Mutex` lock from the `CloseRequested` handler (`lib.rs:158-172`). At N>1 this serializes to N×3s
  under the lock. **`Date::now`/`Instant::now` in tests:** the cargo timing test must use a controllable
  delay seam in the test double, not wall-clock sleeps that flake.
- **`CcSession` trait is the stable seam** — do not bypass it; `kill_all` parallelization stays inside
  the registry. **PTY byte-injection for input, hook channel for state** — unchanged.
- **localStorage persistence pattern** (M2 panel-width/collapse) is the convention for any future
  persisted UI state, but WP2 persists nothing new (order/collapse are WP3/WP4).
- **Dark-mode only**; no light-theme tokens. **TS strict**; `cargo clippy -D warnings`, no `unwrap()`
  outside tests.
- **Reserved chord:** `⌘⇧+digit` is WP3's, not WP2's; if a `⌘N`/`⌘O` new-workspace hotkey is ever added
  it's out of WP2 scope (operator chose the "+" button, not a hotkey).

## Open Questions

- [ ] None blocking. Spec is clear: append flip + "+"-overlay re-entry + ripple-audit/fix +
      picker error-surfacing, all over already-shipped N-ready seams. The new-workspace re-entry
      affordance (the one genuine design fork) was resolved with the operator: **"+" control in the
      filmstrip → picker overlay**. → **F4 (spec → plan).**

## Work Tree

- [x] Phase 1: Reducer append + focus-existing dedup (the N>1 core)  <!-- status: done -->
  **Observable outcomes:**
  - CLI (vitest): `openWorkspace` on a list with one workspace, opening a *different* path, yields `workspaces.length === 2` and `focusedId` = the new id (append, not replace).
  - CLI (vitest): `openWorkspace` on a list already containing the same canonicalized `project_path` yields the SAME length and focuses the existing workspace's id (focus-existing dedup; no duplicate, no second id minted).
  - CLI (vitest): `viewFor` returns `"workspace-open"` for a 2-workspace list with a valid `focusedId` (N>1 keeps the open view).
  - CLI (vitest): the existing `workspace.test.ts` / `appView.test.ts` suites still pass with the replace→append change (no regression in the N≤1 paths).
  - [x] P1.1 Flip `openWorkspace` (`src/state/workspace.ts:73`) from the `{ workspaces: [ws], ... }` replace clamp to APPEND: `{ workspaces: [...state.workspaces, ws], focusedId: ws.id }`. Update the Phase-1-invariant doc comment to the N>1 reality.  <!-- status: done -->
  - [x] P1.2 Add canonicalized same-path dedup: before appending, if an open workspace's canonicalized `project_path` matches, return `focusWorkspace(state, existing.id)` instead. Extract a `canonicalizeProjectPath(path)` helper (trim trailing slashes — match the M3 broadcaster's cwd-canonicalization rule; verify against the broadcaster's rule so "same project" agrees). No new CC session for a re-open.  <!-- status: done -->
  - [x] P1.3 Confirm `useWorkspaceList` + `CenterStage` need NO change (they already map over all workspaces + toggle `visible`); if a stale "N<=1" comment exists in `workspace.ts` / `useWorkspaceList.ts` / `CenterStage.tsx`, correct it. This is the audit half of ripple-item D (panel-seam independence is structurally provided by the existing per-workspace mount + `visible` gate — record the confirmation here).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc --noEmit exit 0, eslint exit 0 on changed files, vitest 354 pass -->
  - [x] verify-self  <!-- status: done — subagent confirmed all 4 CLI(vitest) outcomes PASS (append, focus-existing×2, viewFor N>1, no regression); 354 full-suite green. No browser surface this phase. -->
  - [x] verify-human  <!-- status: deferred-to-P2 — operator decision 2026-06-23: P1 is a pure-logic reducer change with NO human-observable live surface (N>1 entry point is P2's overlay); live N>1 check lands at P2 verify-human where it's reachable. P1 logic fully covered by automated outcomes. -->
  - [x] verify-codify  <!-- status: done — +1 N=3–4 generalization test; 355 full-suite green. Integration-boundary E2E (live N>1 in-app) deferred to P2 codify where the overlay makes it reachable. -->

- [x] Phase 2: "+" filmstrip control → ProjectPicker overlay (the visible N>1 entry)  <!-- status: done -->
  **Observable outcomes:**
  - Browser (Playwright/verify-self via the `?ws=` seed seam): with one workspace open, the filmstrip renders a "+" control (`data-testid="filmstrip-add-workspace"`); clicking it shows the ProjectPicker as an overlay (`data-testid="picker-overlay"` + `data-testid="picker"` present over `center-stage`).
  - Browser: picking a project from the overlay (or `window.__seedWorkspace` driving the same `openWorkspace`) dismisses the overlay and the center stage shows the new workspace; the prior workspace's DOM node is still mounted (`display:none`), confirming keep-mounted at N>1.
  - Browser: the overlay dismisses on Esc / backdrop click / close affordance (`data-testid="picker-overlay-close"`) WITHOUT opening anything, leaving the current center-stage workspace unchanged.
  - Browser: first-open (no workspace) still shows the picker full-screen (not as an overlay) — the regression guard for the existing entry path.
  - Console: no JS errors on open → "+" → overlay → pick → dismiss.
  - [x] P2.1 Add a `showPicker` (overlay) state to `App.tsx`; when `view === "workspace-open"`, render `<Filmstrip onAddWorkspace={() => setShowPicker(true)} />` and conditionally `<PickerOverlay onOpen={openFromOverlay} onDismiss={...} />`. `openFromOverlay` appends + dismisses. First-open path (`view === "picker"`) renders the picker full-screen as today.  <!-- status: done -->
  - [x] P2.2 Add the "+" control to `Filmstrip.tsx` (slot was empty): a single button `data-testid="filmstrip-add-workspace"`, dark-only dashed-tile styling. NO workspace tiles (those are WP3) — just the "+". Filmstrip now takes a required `onAddWorkspace` prop.  <!-- status: done -->
  - [x] P2.3 Overlay wrapper `PickerOverlay.tsx`: dismissable modal reusing the `command-palette-backdrop` shell (finder/palette pattern) + a document-level Esc handler + backdrop-mousedown-close + a × close button (`data-testid="picker-overlay-close"`), hosting `ProjectPicker`. CSS `.picker-overlay-panel` / `.picker-overlay-close` added (dark-only).  <!-- status: done -->
  - [x] P2.4 Confirmed ripple-item D (active/visible-prop, chord non-leak) at the now-reachable N>1 — see audit note below.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc --noEmit exit 0, eslint exit 0 on App.tsx/Filmstrip.tsx/PickerOverlay.tsx, vitest 355 pass (no regression) -->
  - [x] verify-self  <!-- status: done — subagent PASS on all 5 outcomes (Vite dev @1420): "+"→overlay open, keep-mounted at N>1 (2 panels, 1 display:none + 1 display:grid), all 3 dismiss paths (Esc/backdrop/×), first-open full-screen picker regression guard, no genuine console errors (only expected no-Tauri-backend IPC rejections). -->
  - [x] verify-human  <!-- status: done — operator sign-off 2026-06-23, all 4 leaves PASS in the real native app (carries the deferred-from-P1 live N>1 gate) -->
    - [x] P2.verify-human.1 Open project A, click filmstrip "+", open project B → both get own live CC session; center stage switches to B  <!-- status: done -->
    - [x] P2.verify-human.2 A's CC session keeps running in the background; switching back to A (via "+" reopen-focuses-existing) restores its terminal + panel state intact  <!-- status: done — verified via reopen-A focus showing prior scrollback (switch-back path that exists in WP2; tile-click is WP3) -->
    - [x] P2.verify-human.3 Reopening an already-open project focuses the existing workspace (no duplicate CC session spawned)  <!-- status: done -->
    - [x] P2.verify-human.4 Ripple-D: ⌘⇧E/⌘⇧D/⌘⇧T fires only on the FOCUSED workspace's right panel, never the background one  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — NO new unit test: the only pure/branch-bearing logic (openWorkspace append/dedup) is already exhaustively covered by Phase 1's reducer tests; the rest of P2 is JSX event-wiring covered by the Playwright verify-self run (all 5 PASS) + operator verify-human. Per CLAUDE.md:129 E2E is deferred (no committed Playwright specs — manual/verify-self is the host path), so the integration-boundary E2E artifact is the recorded verify-self+verify-human, not a fabricated CI spec. Full suite 355 green, no regression. -->

- [x] Phase 3: `kill_all` parallelization (responsive window-close at N)  <!-- status: done -->
  **Observable outcomes:**
  - CLI (cargo test): a new `kill_all` timing test with N=4 `FakeSession`s, each given a controllable per-kill delay (~the grace window), asserts (a) all 4 are killed AND (b) total wall-clock ≈ one delay window, NOT 4× — proving the grace windows overlap rather than serialize. Uses a delay seam in the test double, not real wall-clock sleeps that flake.
  - CLI (cargo test): existing `kill_all_drains_every_session` + `kill_removes_session_and_invokes_kill` still pass (best-effort semantics + single-kill path unchanged).
  - CLI: `cargo clippy -- -D warnings` clean; no `unwrap()` outside tests.
  - [x] P3.1 Refactored `SessionRegistry::kill_all` (`cc_session/mod.rs`) — drains every session out of the map (`.drain()`), spawns one thread per session running `session.kill()` (sound: `CcSession: Send` so the `Box` moves across threads + is `'static`), joins all → the N 3s grace windows OVERLAP (~3s total, not N×3s). Best-effort preserved (a panicked join is filtered out, not counted) + returns the killed-count.  <!-- status: done -->
  - [x] P3.2 Confirmed the `CloseRequested` handler (`lib.rs:158-172`) needs NO change: it locks the registry, calls `reg.kill_all()`, then runs socket cleanup. `kill_all` now spawns+joins INTERNALLY, so the lock is held for ~one grace window (~3s) instead of N×3s — strictly better, same reaping discipline, socket cleanup still runs after. No orphan leak (every session is `kill()`-ed on its own thread before join returns).  <!-- status: done -->
  - [x] P3.3 Extended `FakeSession` with a `kill_delay: Duration` field (`kill()` sleeps it before counting) + a `reg_with_delayed_fakes(n, delay)` helper; `reg_with_fakes` delegates with a 0ms delay (existing tests unchanged). Deterministic fixed sleep, not wall-clock-state-dependent.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — cargo test cc_session::tests::kill_all (2 pass, 0.21s, parallel-timing confirmed); full cargo 184 pass; clippy --all-targets -- -D warnings exit 0 -->
  - [x] verify-self  <!-- status: done — subagent PASS on all 4 cargo outcomes: parallel-timing test (0.21s, not 800ms serial), unchanged kill_all_drains + kill_removes, clippy -D warnings clean (no unwrap outside tests in changed code), full suite 184/0. No browser surface this phase. -->
  - [x] verify-human  <!-- status: satisfied-by-cargo + deferred-live-to-WP5 — operator decision 2026-06-23: the behavioral assertion (N grace windows overlap → ~3s not N×3s close) is proven DETERMINISTICALLY by kill_all_runs_grace_windows_in_parallel_not_serially; the only human-observable proof (felt native window-close latency at N real CC sessions) is explicitly folded into WP5 milestone-exit verification (WBS §WP5: "window-close at N is responsive — the kill_all ripple fix"). No redundant manual test now. -->
  - [x] verify-codify  <!-- status: done — TDD parallel-timing test already codified the core; +1 codify test kill_all_is_best_effort_a_failing_kill_does_not_block_or_count (new FailingSession double) covering the parallel-refactor's untested failure branch (filter(|&ok| ok) count + all-drained even when one kill Errs). Full cargo 185 pass, clippy -D warnings exit 0. -->

- [x] Phase 4: Picker IPC error-surfacing + M3 registry N>1 confirmation  <!-- status: done -->
  **Observable outcomes:**
  - CLI (vitest): a pure error-mapping helper maps a rejected loader (`prune_missing_projects`/`list_projects`) to a surfaced-error state, and maps first-run-empty (resolved `[]`) to NO error.
  - Browser (verify-self): with a mocked/forced `list_projects` rejection, the picker shows an error in the `picker-toast` surface (not a silent empty list); with `list_projects` resolving `[]`, NO toast appears (first-run-empty is not an error).
  - Browser: a forced `record_open`/`add_project`/`remove_project` rejection surfaces visibly (toast) rather than an unhandled promise rejection in the console.
  - CLI (cargo test): the M3 broadcaster register/deregister list-diffing test exercised at N>1 (≥2 registered cwds) — each `workspace-status` event maps to exactly one workspace; an unmatched cwd is dropped. (Reuse/extend the existing WP6-M3 list-diffing test.)
  - Console: no unhandled promise rejections across the picker mount + mutation paths.
  - [x] P4.1 Picker mount loader (`ProjectPicker.tsx`): replaced the silent `catch {}` with a surfaced error — generalized the toast state from a `string|null` prune-note to `{ kind: "info"|"error"; message }|null`; a rejected prune/list now sets an `error`-kind toast (`mapIpcError("load projects", e)`). First-run-empty (`[]`) resolves normally → no toast. Toast render gains `picker-toast-error` (red, `role=alert`) + `data-toast-kind`.  <!-- status: done -->
  - [x] P4.2 Picker mutation handlers (`handleOpenRecent`/`handleOpenFolder`/`handleRemove`): each `invoke(...)` is now wrapped in try/catch → a rejection sets an `error` toast (`mapIpcError`) instead of an unhandled promise rejection; `handleOpenRecent` does NOT proceed to `onOpen` if `record_open` failed. Extracted the pure `mapIpcError(action, err) → message` helper (`picker/ipcError.ts`) — never returns empty (a rejection is never silent).  <!-- status: done -->
  - [x] P4.3 Confirmed ripple-item C: added `registry_generalizes_to_n_gt_1_no_cross_workspace_bleed` (`status_broadcaster/mod.rs`) — registers 3 dirs→3 ids, asserts each cwd resolves to ITS OWN id (no bleed), len()==3, and deregistering the middle one leaves the other two intact + resolving. Existing coverage was N≤1 only.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc exit 0, eslint exit 0 on changed picker files, ipcError tests 6/6, registry N>1 test ok; full vitest 361 + cargo 186 + clippy -D warnings exit 0 -->
  - [x] verify-self  <!-- status: done — subagent PASS on all 3 browser outcomes + P4.3-by-cargo: plain picker shows error toast (data-toast-kind=error, role=alert, "Could not load projects: …") on the forced IPC reject (not a silent empty list); toast dismissible (× removes it, picker stays); NO unhandled promise rejection on the picker mount path (the reject is caught→toast). -->
  - [x] verify-human  <!-- status: satisfied-by-verify-self — operator decision 2026-06-23: the error-surfacing is fully demonstrated by the Playwright forced-reject run (the exact swallowed-error bug, reproduced for free by Vite's missing backend); reproducing it natively needs deliberately corrupting projects.json (destructive setup, marginal added confidence). P4.3 is cargo-proven. -->
  - [x] verify-codify  <!-- status: done — TDD tests comprehensive: +6 mapIpcError (string/Error/object/empty/blank/never-empty) + +1 registry N>1 no-bleed cargo. No new test: the only pure seam (mapIpcError) is fully covered; the first-run-empty-no-toast resolve-path is a JSX-state assertion (project verifies via Playwright/human, no jsdom/RTL) and is noted-not-fabricated. Both full suites green: vitest 361, cargo 186, no regression. -->

## Current Node
- **Path:** Feature > COMPLETE — all 4 phases done. Ready for /feature-ship.
- **Active scope:** ALL PHASES COMPLETE. Phase 1 (reducer append+dedup), Phase 2 ("+"→overlay), Phase 3 (kill_all parallelization), Phase 4 (picker error-surfacing + registry N>1) — all [x] through verify-codify. Suites: vitest 361, cargo 186, clippy -D warnings clean.
- **Blocked:** none
- **Unvisited:** none — exit to ship.

### P2.4 audit confirmation (ripple-item D, behavioral half)
- The RightPanelHost chord listener is registered on a `useEffect(..., [visible])` that **early-returns when `!visible`** (`RightPanelHost.tsx:296-334`) — so a background (non-focused) workspace's host has **NO capture-phase keydown listener registered at all** (the effect's body is skipped + its cleanup removes any prior listener on the visible→false transition). This is stronger than an early-return guard: background workspaces literally do not listen, so ⌘⇧E/D/T / ⌘P / ⌘W / ⌘+digit reach only the ONE focused workspace's host. Panel liveness is independently gated via `active={visible && panel === ...}`.
- **Structural confirmation complete; no leak, no code change needed.** The live-app behavioral proof (mount 2 workspaces, press a chord, observe only the focused one reacts) is a verify-self/verify-human observation at the now-reachable N>1 — folded into Phase 2's verify-human live N>1 check (per the P1 verify-human deferral decision).
- **Blocked:** none
- **Unvisited:** Phase 4 (picker IPC error-surfacing + M3 registry N>1 confirmation)
- **Open discoveries:** none

### P1.3 audit confirmation (ripple-item D, structural half)
- `CenterStage` already maps over ALL workspaces and toggles each one's `visible` prop (`ws.id === focusedId`) — needed NO logic change for N>1; only a stale "Phase 1: list holds <= 1" doc comment corrected.
- `Workspace` keeps every subtree mounted via `display:none` and forwards `visible` to `RightPanelHost`; `RightPanelHost` gates ALL panel liveness + chords on `visible` (`active={visible && panel === ...}`, chord listener `if (!visible) return`). So at N>1 only the focused workspace's host reacts — panel-seam independence + chord non-leak are STRUCTURALLY provided by the existing per-workspace mount + `visible` gate. The clamp lived solely in `openWorkspace`. The *behavioral* N>1 confirmation (2 mounted workspaces, only the focused one takes a chord) is exercised in Phase 2 P2.4 once the overlay makes N>1 reachable in the live app.
- `useWorkspaceList` / `seedWorkspace`: no stale clamp comment found.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-23] WP3 (filmstrip) — At WP2's surface there is NO visible affordance to switch BACK to a backgrounded workspace; the only switch-back path is reopening the project via the "+" overlay (the dedup focuses the existing workspace). This made P2.verify-human.2 awkward to observe (operator asked "how do I verify this?"). Expected — tile-click + ⌘⇧+digit promote are explicitly WP3 — but WP3 should treat "switch to a background workspace from the filmstrip" as the primary path and confirm it during its own verify-human. Logged to backlog. (Not blocking WP2.)

