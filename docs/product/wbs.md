---
stage: wbs
state: complete
updated: 2026-06-22  # M4 WP1 (N-workspace cost probe) SHIPPED — GO for eager-mount. Remaining: WP2 N>1 lift → WP3 filmstrip → WP4 collapse → WP5 verify; WP4b parallel off WP2. dogfood-replace point.
---

# Work Breakdown Structure — Milestone 4: Multi-workspace UX (filmstrip + center stage)

This WBS decomposes **Milestone 4 only** — the multi-workspace UX that lights up N concurrent project workspaces in one Claudesk window, switched via a filmstrip. **M3 + M4 together are the dogfood-replace point:** once M4 ships, Claudesk replaces the current terminal + Sublime setup as the operator's daily driver.

**Cycle scope:** **Milestone 4 only.** Milestones 5–9 are tracked in [`roadmap.md`](roadmap.md) and are **deliberately not decomposed** here — just-in-time decomposition happens when each milestone opens. Completed Milestone 1 / 2 / 3 WBSs are archived under [`archive/`](archive/).

## Why no research pass + no external-API probe

M4 introduces **no new external API, SDK, or service** — it's pure in-app UX over already-built seams: the M3 `status_broadcaster` (`workspace-status` Tauri event + `WorkspaceStatusUpdate` DTO + cwd→workspace registry), the M1 tab-shell substrate (WorkspaceList + center-stage mount + empty filmstrip slot + the `display:none` background-keep-mounted rule), and the M1 WP4 thumbnail probe's **validated `serializeAsHTML()` ~1 fps rendering path** (PASS, `wp4-thumbnail-probe-outcome.md`). No `/product-research` pass is warranted. The one real unknown is **cost at N with the full M2 editor stack mounted** (the M1 probe measured N=8 *terminals* only) — that's WP1, an internal probe of *our* mount cost, not a 3rd-party probe.

## Milestone 4 ordering rationale

Learning-sequence ordering (riskiest-unknown-first), per the WBS discipline:

1. **Cost probe at N (WP1)** — the milestone's whole premise (keep every workspace mounted + serialize-mirror the backgrounds) rests on the RAM/CPU envelope holding when N workspaces each carry the full M2 stack (editor + diff + terminal). This is unmeasured and **gates the mount architecture**: a bust means `React.lazy`-ing the EditorPanel *before* the filmstrip is built, not a retrofit after. Riskiest unknown, cheapest to resolve first.
2. **N>1 lift (WP2)** — flip the picker open-handler from "replace the single workspace" to "append a workspace," and resolve the latent N=1-clamp ripple this exposes. The synchronous core of multi-workspace, before any filmstrip rendering sits on top of it. Folds in the long-deferred picker IPC error-surfacing (same open-flow code).
3. **Filmstrip render (WP3)** — the status-surface UI: tiles fed by the M3 `workspace-status` event + the WP1-validated serialize mirror loop + click-to-promote. Built on a working N>1 list (WP2), using the probe-confirmed render path (WP1).
4. **Collapse toggle (WP4)** — a display-mode refinement over tiles that already exist (WP3); also the lever that *stops* the serialize loop to drop mirror cost. Smallest, last of the build WPs.
5. **Verify at N (WP5)** — end-to-end milestone-exit verification with real N workspaces: status visible without clicking, click-to-switch, collapse. Proves the dogfood-replace bar.

## Milestone 4

### WP1: Probe — N-workspace mount cost with the full M2 stack ✅ SHIPPED 2026-06-22 (commit 9f3e0fe)
**Verdict: GO for eager-mount.** N=8 real CC + full M2 stack measured idle CPU 0.0% / active 7.8% median (11.7% p95), webview RAM 311/428 MB — editors+diffs add only ~0% idle CPU + ~120–190 MB; envelope effectively holds, no `React.lazy` needed (WP2 mounts the EditorPanel eagerly, no mount-sequence delta). Decisive finding: the ~2.8 GB N=8 cost is the 8 `claude` backend processes — inherent to 8 concurrent CC sessions (same as 8 terminals), not Claudesk-introduced, not lazy-fixable → logged `SURFACE-2026-06-22-N8-CC-BACKEND-RAM` as a WP5 headroom watch-item. Full writeup: `docs/product/wp1-n-workspace-cost-probe-outcome.md`.
**Type:** probe
**Milestone:** Milestone 4
**Dependencies:** none (M1 tab-shell + M2 editor/diff/terminal + M3 broadcaster all shipped; this probes *our* mount cost at N)
**Size:** S
**Learning objective:** Does the keep-everything-mounted model hold its cost envelope at N? Specifically: with N≈8 workspaces open, each carrying a mounted EditorPanel (CodeMirror 6) + DiffPanel + a second-terminal pane (the full M2 RightPanelHost) **plus** the CC terminal, does total RAM stay **<300 MB** and active CPU **<20%** (the M1 WP4 probe's envelope — which covered N=8 *terminals only*, explicitly NOT CM6 editors)? If it busts, is `React.lazy`-ing the EditorPanel (so CM6 loads on first editor focus, not at workspace mount) sufficient mitigation — and does that change how a workspace mounts?
**Timebox:** half-day
**Success criterion:** A short writeup (`docs/product/wp1-n-workspace-cost-probe-outcome.md`) recording: measured RAM + idle/active CPU at N≈8 with the full M2 stack mounted per workspace (Activity Monitor / `top`), a go/no-go on "keep all editors eagerly mounted" vs "lazy-load EditorPanel," and — if lazy-load is needed — the concrete mount-sequence delta WP2 must honor. Closes `SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE`; references `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` for the mitigation.
**Tasks:**
- [x] Stand up N≈8 workspaces in a dev build — built a throwaway `?nwsprobe` route (`src/probe/nworkspaces/`) mounting N real `<Workspace>` records (full RightPanelHost: editor+diff+terminal) bypassing the N=1 clamp via direct `makeWorkspace` (WP2 owns the real N>1 lift)
- [x] Measure idle (all N backgrounded) + active (1 center-stage streaming, N−1 bg) RAM + CPU vs the <300 MB / <20% envelope — idle 0.0% CPU / 311 MB; active 7.8%/11.7% CPU / 428 MB
- [x] Within envelope → recorded GO for eager-mount (lazy prototype skipped: no bust, and lazy can't touch the dominant ~2.8 GB CC-backend cost)
- [x] Wrote outcome doc; resolved `SURFACE-2026-06-21-WP9-N-EDITORS-COST`, reconciled `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (deferred — different axis), logged `SURFACE-2026-06-22-N8-CC-BACKEND-RAM` → WP5

**WP1 → WP2 rationale:** Measure the mount-cost envelope before building the N>1 open-flow, so WP2 mounts workspaces the right way (eager vs lazy editor) the first time — a lazy-load retrofit after the filmstrip exists would re-touch the same mount code. Resolve the architecture-shaping unknown when re-planning is cheapest.

### WP2: N>1 lift — picker appends a workspace; resolve N=1-clamp ripple + picker error-surfacing
**Description:** Flip the picker's open-handler from the M1 invariant "open replaces the single workspace (N=1)" to "open **appends** a new workspace to the WorkspaceList (N≥1)," with the focused one center-stage and the rest available to the (WP3) filmstrip. Resolve the latent N=1 assumptions this exposes across the already-built backend/frontend, and fold in the long-deferred picker IPC error-surfacing (the open-flow is being reworked here anyway). This is the synchronous core of multi-workspace — no filmstrip rendering yet.
**Milestone:** Milestone 4
**Dependencies:** WP1 (mount-cost verdict — eager vs lazy editor mount shapes how a new workspace is added)
**Size:** M
**Tasks:**
- [ ] Picker open-handler: append a new Workspace record (new `id`, `project_path`, fresh `PtyCcSession`) to the WorkspaceList instead of replacing; reopening an already-open project focuses the existing workspace rather than duplicating it
- [ ] Center-stage switch: the newly-opened (or re-focused) workspace becomes center-stage via `display:block`; the prior one demotes to `display:none` (stays mounted, PTY persists) — the M1 substrate rule, now exercised at N>1 for the first time
- [ ] **Register/deregister each workspace with the M3 broadcaster registry on open/close** — the WP6-M3 `workspace_register`/`workspace_deregister` wiring already does this by list-diffing; confirm it generalizes correctly from N≤1 to N>1 (the canonicalized cwd→workspace map must hold N entries, unmatched cwd still dropped)
- [ ] **N=1-clamp ripple — resolve the latent single-workspace assumptions:**
  - [ ] `cc_session::kill_all` serializes a 3s grace window per session under the registry lock — at N>1 this blocks window-close for up to N×3s. Parallelize the grace windows (or drop the lock during the wait) so close stays responsive at N (WP7-M1 finding)
  - [ ] `EditorPanel.active` / `RightPanelHost` `active`-prop defaults — audit the optional-with-default `active` props (WP3b/WP5-M2 findings) so panel chords + spawn-gating fire only for the genuinely-focused workspace, never leak across N
  - [ ] The `"terminal"` panel-seam guard (WP5/WP9-M2) — confirm the per-workspace panel state is independent at N (each workspace keeps its own active panel / open files / scroll, per the M1 "all workspaces stay mounted" rule)
- [ ] **Picker IPC error-surfacing (folds in the deferred WP6-M1 MAJORs):** the picker mount loader must surface a rejected `list_projects` (not swallow it into an empty list, masking a malformed `projects.json`); mutation handlers (`open`/`remove`/`record_open`) must surface rejections instead of dropping them as unhandled promise rejections — reuse the established `cc-error-overlay` / toast IPC-error pattern
- [ ] Tests: pure reducer/handler logic for append-vs-focus-existing + the center-stage switch (vitest); the `kill_all`-at-N parallelization (cargo, if extractable as a pure-timing seam); picker-error-surfacing path (the loader/​mutation rejection → surfaced-error mapping)

**WP2 → WP3 rationale:** The filmstrip renders *one tile per non-center-stage workspace* — there must be a working N>1 WorkspaceList with a focused/background distinction before there's anything to put in the filmstrip. Build the synchronous multi-workspace core, then render the surface on top.

### WP3: Filmstrip — tiles + status dots + live mirror + click/⌘⇧-digit promote + drag-reorder
**Description:** Populate the (M1) empty filmstrip slot with one tile per **open workspace, including the center-staged one**, in a **user-arranged, persisted order**. Background-workspace tiles render a **live ~1 fps terminal mirror** via `serializeAsHTML()` from the off-viewport xterm buffer (the M1 WP4 probe-validated path); the **center-staged workspace's tile is a static, active-marked placeholder** (no live mirror — it's already full-size on the center stage) so the row is a complete roster and tile indices never renumber on switch. Promote a workspace to center-stage by clicking its tile **or** via the `⌘⇧+digit` hotkey (jump to the Nth tile). Tiles are drag-reorderable; the order is what `⌘⇧+digit` indexes into.
**Milestone:** Milestone 4
**Dependencies:** WP2 (a working N>1 WorkspaceList with focused/background distinction), WP1 (mount-cost verdict — confirms backgrounds can stay mounted to serialize from)
**Size:** L
**Tasks:**
- [ ] Filmstrip component: render one tile per **open** workspace (including center-stage), in the user-arranged order (below); project-name label + status dot per tile
- [ ] **Status dot** subscribes to the M3 `workspace-status` event keyed by `workspace_id` — reuse the WP6-M3 `useWorkspaceStatus` subscription + `WorkspaceStatusIndicator` palette (Idle / Running orange `#d97757` / AwaitingInput blue `#539bf5` / Unknown), so the filmstrip and the center-stage header agree at all times (the broadcaster fans out to both)
- [ ] **Live mirror (background tiles only):** background workspaces' xterm stays mounted off-viewport (`left:-99999px`) so xterm pauses its renderer (buffer still updates via `write()`); build each background tile from `@xterm/addon-serialize` `serializeAsHTML()` read off that buffer into a `scale(...)` tile, throttled to ~1 fps (the exact mechanism the WP4 probe validated — NOT a live mirror of off-screen DOM, which is non-viable)
- [ ] **Center-stage tile = static placeholder:** the center-staged workspace's tile shows project name + status dot + an **active marker** (e.g. a highlighted border), but **no live mirror** (it's already full-size on the center stage — mirroring it is wasted CPU). Keeping its slot makes the row a complete roster and keeps `⌘⇧+digit` indices stable across switches
- [ ] Serialize-loop lifecycle: start the ~1 fps loop per *background* tile, stop it when a tile becomes center-stage (its mirror turns off → placeholder) or the filmstrip collapses (WP4); honor any WP1 lazy-mount consequence
- [ ] **Click-to-promote:** clicking a tile makes that workspace center-stage (`display:block`) and demotes the previous (`display:none`); no unmount/remount, PTY + panel state persist (M1 rule); the promoted tile flips to the static placeholder, the demoted one starts its mirror loop
- [ ] **`⌘⇧+digit` workspace-switch hotkey:** `⌘⇧1..⌘⇧9` promote the Nth filmstrip tile (in the user-arranged order, including the center-stage tile so indices are stable) to center-stage — the keyboard equivalent of clicking it. Pure `isWorkspaceSwitchChord` predicate + `workspaceSwitchIndex` (mirroring the WP12-M2 `tabSwitchChord`/`tabSwitchIndex` shape); registered on the **capture-phase** document listener (fires regardless of focus — inside CM6, the terminal, anywhere — `preventDefault` so it's not swallowed) per the operator decision. **Reserved chord — no rebinding needed:** bare `⌘+digit` is the editor tab-switch (WP12), `⌘⇧+digit` was reserved for exactly this (memory `cmd-shift-digit-reserved-for-filmstrip`; chord-ownership map in `paletteCommands.ts`). `N` past the tile count → no-op (or last tile — decide at plan, mirror WP12's past-end behavior)
- [ ] **Drag-and-drop reorder:** tiles are draggable to rearrange the filmstrip order; the order persists (localStorage, consistent with the M2 panel-width/collapse patterns) and is the single source of truth for both tile render order and the `⌘⇧+digit` index. Center-stage tile participates in the order (it has a stable slot)
- [ ] Active-CPU caveat watch: the WP4 probe flagged a ~30% p95 on output bursts; if dogfooding shows it bites, the documented mitigations (sub-1fps background rate, coalesced serialize, mirror only visible tiles) are available — note, don't pre-optimize
- [ ] Tests: pure tile-list derivation (WorkspaceList + persisted order → ordered tiles, center-stage marked-not-excluded) + status-dot mapping reuse + `workspaceSwitchIndex` chord-index mapping + reorder-persistence reducer (vitest); the serialize-throttle timer logic if extractable as a pure seam

**WP3 → WP4 rationale:** The collapse toggle is a *display mode over tiles that already exist* — the expanded (thumbnail) filmstrip must exist before there's anything to collapse into a status-pill row. Build the rich surface, then add the space-reclaiming toggle.

### WP4b: Left/right focus indicator (intra-workspace)
**Description:** A subtle persistent indicator (analogous to the M2 WP3c split-pane active-editor border) marking which half of the center-stage workspace currently holds keyboard focus — the **left** CC terminal vs the **right** panel (editor / diff / terminal). At N workspaces with two interactive halves each, "where will my keystrokes land" otherwise has no on-screen answer. Independent of the filmstrip; folds in the focus-ambiguity gap the operator spotted 2026-06-22.
**Milestone:** Milestone 4
**Dependencies:** WP2 (a focused workspace exists to indicate within); independent of WP3/WP4 (can land in parallel)
**Size:** S
**Tasks:**
- [ ] Track which half (left terminal / right panel) of the center-stage workspace holds focus — `focusin`/`focusout` on the two half-containers (capture-phase), keyed per workspace; the indicator follows the genuinely-focused workspace only
- [ ] Render a subtle active-half border/accent on the focused half (reuse the M2 split-pane active-editor border styling/tokens for visual consistency, dark-only palette); the unfocused half shows no accent
- [ ] Coexist with the existing M2 split-pane active-*editor*-border (that distinguishes *which editor pane within the right half*; this is the coarser *left-half vs right-half* level — don't double-draw or fight it)
- [ ] Tests: pure focus-half derivation (a focus event target → left|right|none) in vitest

### WP4: Filmstrip collapse toggle
**Description:** A window-chrome control that toggles the filmstrip between **expanded** (full tiles with the live ~1 fps thumbnail) and **collapsed** (a one-line row of mini status pills — project name + status dot only, no preview). Collapsing reclaims vertical space *and* stops the serialize mirror loop, dropping the background-render CPU cost. (Vision feature: `vision.md` filmstrip bullet + Core Principle 4.)
**Milestone:** Milestone 4
**Dependencies:** WP3 (the expanded filmstrip + its serialize loop)
**Size:** S
**Tasks:**
- [ ] Collapse toggle control in window chrome (per vision: "toggle via window chrome"); persist the collapsed/expanded preference (localStorage, consistent with the M2 panel-width pattern)
- [ ] Collapsed render: each background workspace shows a mini status pill (project name + the same M3-driven status dot), no live preview; one-line row
- [ ] On collapse: stop the per-tile serialize loop (collapsed tiles render nothing live) so the mirror CPU cost goes to zero; backgrounds still buffer PTY output to xterm scrollback (M1 rule). On expand: restart the loop
- [ ] Click-to-promote still works from a collapsed pill (switching center-stage from the thin row is a core glance→switch path — vision metric 4)
- [ ] Tests: collapsed-vs-expanded tile derivation + the loop-stop-on-collapse logic (vitest, pure where extractable)

### WP5: Verify multi-workspace at N (milestone-exit verification)
**Description:** End-to-end verification of the M4 exit criteria against real N workspaces in the live native app — the dogfood-replace bar. Distinct from per-WP verify-self/human: this is the milestone-level proof that the whole surface holds at N with real CC sessions.
**Milestone:** Milestone 4
**Dependencies:** WP2, WP3, WP4, WP4b
**Size:** S
**Tasks:**
- [ ] Open N (≥4, ideally the operator's real in-flight set) real projects as workspaces in one `pnpm tauri dev` window; confirm each gets its own live CC session, center-stage switch works, no cross-workspace state leak
- [ ] Confirm idle/running/awaiting-input of **every** workspace is visible without clicking — in both the expanded filmstrip (incl. the static center-stage tile) and the collapsed pill row — driven purely by the M3 hook channel (no PTY scraping), agreeing with each workspace's center-stage header
- [ ] Confirm **both** promote paths: clicking a tile/pill AND `⌘⇧+digit` switch center-stage (the chord fires with focus inside CM6 / the terminal); confirm drag-reorder rearranges tiles + the new order survives reload + `⌘⇧+digit` follows the new order
- [ ] Confirm the **left/right focus indicator** correctly tracks terminal-half vs right-panel-half focus on the center-stage workspace (WP4b)
- [ ] Confirm collapse/expand reclaims space + halts/restarts the mirror loop
- [ ] Re-confirm the WP1 cost envelope holds with N *real* sessions (not the synthetic probe fixture); window-close at N is responsive (the `kill_all` ripple fix)
- [ ] verify-human sign-off: the operator can find the awaiting-input workspace in <1s, zero clicks, and switch to it via `⌘⇧+digit` without reaching for the mouse (vision success metric 4)

## Dependency map

**Critical path:** WP1 → WP2 → WP3 → WP4 → WP5 (cost verdict → N>1 core → filmstrip render → collapse → verify-at-N).
**Parallel track:** **WP4b (left/right focus indicator)** can land any time after WP2 (it only needs a focused workspace to indicate within) — independent of the filmstrip WP3/WP4 chain. WP5 verifies it alongside the rest.
WP3 (filmstrip render) genuinely needs WP2's working N>1 list, and WP4 is a refinement of WP3, so that sub-chain stays linear. WP2's picker-error-surfacing sub-task shares the open-flow code, so it's kept in WP2 rather than split.

```
WP1 (N-cost probe) ─→ WP2 (N>1 lift + clamp-ripple + picker errors) ─┬─→ WP3 (filmstrip: tiles + status + mirror + click/⌘⇧-digit + reorder) ─→ WP4 (collapse) ─→ WP5 (verify at N)
                                                                      └─→ WP4b (left/right focus indicator) ─────────────────────────────────┘
```

## Carried backlog — disposition for this cycle

- **`SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE`** — **FOLDED INTO WP1** (the N-workspace cost probe is exactly the measurement this asked for, now that N>1 is testable).
- **`SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD`** — **referenced by WP1** as the mitigation if the cost probe busts (lazy-load EditorPanel); resolved-or-deferred per the WP1 verdict.
- **WP6-M1 picker IPC error-surfacing MAJORs** (`wp6-project-config-store` review) — **FOLDED INTO WP2** (deferred since M1 specifically to pair with the multi-workspace open-flow rework).
- **`kill_all` N-clamp + `active`-prop + `"terminal"` panel-seam findings** (WP7/WP3b/WP5/WP9-M2 code-quality) — **FOLDED INTO WP2's N=1-clamp ripple task** (these are the latent single-workspace assumptions the N>1 lift exposes).
- **`SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY`** (workflow-doc-hierarchy watcher) — **NOT in M4; anchored to M6** (operator decision 2026-06-22 — the menu-bar popover's list form factor fits a workflow-position line; design deferred until post-M4/M5 dogfooding reveals what to show). M4's filmstrip status is the M3 CC-hook channel alone.
- **`SURFACE-2026-06-21-EDITOR-FILE-WATCHER`** — **stays DEFERRED** (low pri); the `notify` watcher seam it shares with the doc-hierarchy watcher lands whenever the first consumer needs it (likely M6).
- **`⌘⇧+digit` workspace-switch hotkey** (operator request 2026-06-22) — **FOLDED INTO WP3**; uses the chord reserved exactly for this (memory `cmd-shift-digit-reserved-for-filmstrip`, 2026-06-21). Drag-to-reorder + the center-stage static tile (so indices are stable) are in WP3 too; vision + roadmap M4 wording updated ("every *other*" → "every workspace, active one marked").
- **Left/right focus-indicator gap** (operator spotted 2026-06-22 — no on-screen indication of left-CC-terminal vs right-panel keyboard focus; distinct from the M2 split-pane active-*editor* border) — **NEW WP4b**, folded into M4 per operator decision (focus ambiguity bites more at N workspaces).
- **All other carried M1/M2/M3 code-quality MINORs + forward-look SURFACEs** — remain deferred (prior-cycle sweeps); none are M4-relevant. Re-triage continues at each milestone open.

## Architectural notes / gaps

- **No architectural gaps found** — M4 is a faithful build of the arch.md Phase-2 forward-look §B.1 (filmstrip + center stage: off-viewport xterm + `serializeAsHTML()` ~1 fps mirror, click-to-promote, collapse-to-status-row) on top of the M1 substrate + M3 broadcaster. No P8 back-loop to `/product-arch` needed.
- **The one architecture-shaping unknown is WP1's mount-cost verdict** — if N editors bust the envelope and lazy-mount is required, that's a mount-sequence change, not an arch redesign (the §B.1 mechanism is unaffected; only *when* the EditorPanel mounts changes). Captured as a WP1 success-criterion deliverable, surfaced forward into WP2/WP3 if it lands.
- **The active-CPU p95 caveat** (~30% on output bursts, from the WP4 probe) carries forward into WP3 as a watch-item with documented mitigations — not a gap, a known tunable.
