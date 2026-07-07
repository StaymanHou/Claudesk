---
stage: roadmap
state: complete
updated: 2026-07-06  # Revision 2026-07-06: In-app auto-updater inserted as M10 (right after M9, before next release) — check/download/install updates with user control (skip version / disable notifications / cancel-confirm, no silent updates). Tail slides +1: docs-viewer M11, auto-resume M12, skill-orch M13, polish M14. Two decisions PENDING operator confirm: (1) Homebrew coexist via auto_updates true stanza [leaning coexist]; (2) $99 notarize vs stay-unsigned (updater minisign keypair is free/no-Apple-account, but Claudesk ships unsigned so post-update relaunch hits Gatekeeper unless notarized). | M9 (Time-analytics panel — absorb claude-time) DECOMPOSED 2026-07-06 via /product-wbs → docs/product/wbs.md (7 WPs: WP1 probe contract-freeze+dark-render → WP2 hook+write-gated SQLite → WP3 reclassifier port → WP4 segment-model query layer → WP5 tracking toggle [default OFF] → WP6 dark dashboard tab [+CM6 lazy-load fold-in] → WP7 deprecate+exit-verify). Sizing surprise: the 4065-line dashboard.jsx + 54KB viz_data.py ports dominate risk, NOT the 368-line reclassifier — WP1 front-loads it. Folded in SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD (→WP6). Next: /product-context then feature workflow for WP1. | 2026-06-29  # M8 (Demo assets) COMPLETE 2026-06-29 — all WPs shipped (WP1 probe→synthesized-GIF/Playwright pipeline; WP3 filmstrip GIF; WP4 PiP GIF; WP5 embed+README-restructure+push, operator-approved on the github.com render). Exit criteria MET; cycle archived to docs/product/archive/milestone-8-demo-assets/. Next execution milestone: M9 (time-analytics). | Revision 2026-06-29b: NEW M8 "Demo assets" (filmstrip + PiP value GIF/videos, probe-first, agent-produced) inserted as the next execution milestone; M8↔M9 swapped so Time-analytics (M9) precedes Docs-viewer (M10); tail slides +1 → auto-resume M11 / skill-orch M12 / polish M13. | 2026-06-29  # M7 (menu-bar) deliverables SHRUNK at the spec debate — ambient alarm + actuator only; popover list + navigate + tauri-plugin-positioner CUT as a PiP subset (design-prior new-surface-must-earn-its-place-against-existing-ones); watcher re-anchored M7→M8. | 2026-06-28  # M6 COMPLETE 2026-06-28 — all 12 WPs shipped (WP8 milestone-exit verify closed it; agent GREEN'd all bridge-observable exit criteria, operator-carry checklist DEFERRED-TO-RELEASE for v0.2.2). | M6 WP6 (gitignore→heavy-dir re-base) SHIPPED 2026-06-28 (commit 61db3d4). | M6 WBS WRITTEN 2026-06-27 (docs/product/wbs.md; 8 WPs, lead = stuck-Running dot fix). | Revision 2026-06-27: M5 (PiP) COMPLETE — all 6 WPs shipped, agent-verified PASS via the MCP bridge; installed-build out-of-focus confirmation deferred to /release. Next execution milestone: M6 (friend-QoL, lead item = fix the stuck-`Running` status dot). | Revision 2026-06-26b: friend-QoL milestone inserted as M6 (slides menu-bar→M7, docs-viewer→M8, time-analytics→M9, auto-resume→M10, skill-orch→M11, polish→M12). Earlier same-day (2026-06-26): time-analytics absorb-claude-time inserted.
---

# Roadmap

Claudesk grows in dogfood-able increments, each independently usable. **Launch-friction relief comes first** (Milestone 1 — also lays down the tab-shell substrate even though only one workspace is open at a time); **the in-app lite editor + diff viewer** comes second (Milestone 2) — a must-have, not a nice-to-have, now that projects live in tabs (see the resequencing rationale in the 2026-06-19 revision below); **the architectural heart** — stateful CC controller, three status surfaces, orchestration — comes third (Milestones 3–12, resequenced dogfood-first 2026-06-22 so CC-state + the multi-workspace filmstrip land first as the daily-driver replacement point); **release polish** comes fourth (Milestone 13). *(A demo-assets milestone — M8 — was inserted 2026-06-29b after the filmstrip + PiP shipped, to capture their value before further feature work.)*

Milestones are a **flat, continuous list** (`Milestone 1`, `Milestone 2`, …). The `## Group` headings below are **cosmetic clustering only** — they carry no numbering or dependency semantics; they just organize the flat list for readability. Dependencies, where they exist, are stated in each milestone's prose.

## Group A — Launch friction (PoC)

### Milestone 1: Bare Shell + Tab Substrate (PoC) ✅ COMPLETE 2026-06-19

> **Cycle closed 2026-06-19.** All 9 work packages shipped (WP1–WP9); the full decomposition is archived at [`docs/product/archive/phase-1-bare-shell-poc/wbs.md`](archive/phase-1-bare-shell-poc/wbs.md).

**Goal:** Prove the Tauri shell + embedded terminal + project picker + tab-shell substrate work together. Replaces *only* the "open terminal + cd + run claude" step at the user-visible level — the biggest reported pain point (launch friction) is solved before any editor work begins. The tab substrate ships now (even though only one workspace is ever open) so later status-surface work builds on an existing foundation rather than reshaping it.

**Deliverables (all shipped):**
- [x] **Tauri 2 app skeleton** (macOS bundle, launches, shows one window). Single `WebviewWindow` per the research decision — no multi-webview. *(WP1, commit c50a785.)*
- [x] **Project picker UI** (recents list, "Open Folder" button), persisted to `~/Library/Application Support/Claudesk/projects.json`. *(WP5 prototype 777c0b8; WP6 real config store + filter/search 525b7e8; WP9 added prune-missing-on-mount + toast, 91fae7f.)*
- [x] **Tab-shell substrate** — a workspace-list React component holds an array of workspace records; the center stage mounts the focused workspace; the filmstrip area exists but is empty. Background workspaces stay mounted (`display: none`), never unmounted on switch. **Only one workspace ever opens here, but the substrate is already in place.** *(WP5 777c0b8; confirmed at WP9.)*
- [x] **Embedded terminal pane** (xterm.js + `portable-pty`), **DOM renderer only — no WebGL addon**, auto-runs `claude --dangerously-skip-permissions` in the selected project dir, full-size in the center stage. *(WP7 50ca322 — raw `portable-pty` behind our own Tauri commands; WP9 added a friendly "claude not on PATH" error.)*
- [x] **Thumbnail-rendering probe** (gating for the later filmstrip strategy). **PASS** — Apple M4 / macOS 26.5.1: idle CPU 4.5% (<10% ✅), active median 13.3% (<20% ✅; p95 ~30% on bursts — caveat), RAM 240 MB (<300 ✅), center frame p95 18 ms / 0 dropped (✅). Validated path: `@xterm/addon-serialize` `serializeAsHTML()` from the buffer at ~1 fps (beat `cloneNode`; off-screen-DOM-mirror non-viable). **→ live ~1 fps mirrors are viable.** *(WP4, commit 3ae90eb; full outcome [`wp4-thumbnail-probe-outcome.md`](wp4-thumbnail-probe-outcome.md).)*
- [x] **Right half: empty placeholder** (reserved for the lite editor, Milestone 2). *(WP5 "Coming in Phase 3" card 777c0b8; WP8 added the in-app Sublime toolbar/button in the right panel.)*
- [x] **Hotkey to pop Sublime Text** at the project root (`subl <project-path>`). *(WP8 74dfc2c — in-app `⌘⇧E` webview keydown handler + right-panel button, NOT OS-global `tauri-plugin-global-shortcut`; that approach was built then rejected at verify-human in favor of in-app, no Accessibility permission.)*

**Exit Criteria (met):** Click a project in the picker → working CC session running in the project dir, in <10s, **inside a workspace in the existing Claudesk window** (not a new OS window). Sublime Text pops via the `⌘⇧E` hotkey when manual editing is needed *(a stopgap until the in-app editor lands — retired in Milestone 2)*. The tab-shell substrate is in place even though only one workspace ever opens. The thumbnail-rendering probe produced a documented pass/fail outcome selecting the filmstrip-rendering strategy (→ live mirrors). Sublime Merge still launched manually.

## Group B — Lite editor & diff viewer (right half)

> **Resequenced to second, 2026-06-19.** With the pivot from one-project-per-window to one-project-per-tab, the right half can no longer stay a placeholder behind an external Sublime pop-up: popping a separate Sublime/Sublime-Merge window per tab fragments the workflow across OS windows and reintroduces the exact window-juggling tax the tab model exists to remove. The in-app editor + diff viewer is therefore a **must-have**, built before the multi-workspace/status-surface work — so the right half is real the moment more than one tab is in play.

### Milestone 2: Lite Editor + Diff Viewer ✅ COMPLETE 2026-06-22

> **Cycle closed 2026-06-22.** All work packages shipped (WP1, 2, 3a/b/c, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13); the full decomposition is archived at [`docs/product/archive/milestone-2-lite-editor-diff-viewer/wbs.md`](archive/milestone-2-lite-editor-diff-viewer/wbs.md). Beyond the original three editor/diff deliverables, the cycle added a file-tree navigator (WP10), a multi-file editor tab strip (WP12), ⌘W close-tab (WP13), and tree/editor density + Sublime-style git indicators (WP11); one P1 incident (terminal blank-cursor) was resolved at close.

**Goal:** Cover the daily-use Sublime Text features inside Claudesk so the right half stops being a placeholder and becomes the **primary** routine-editing surface. With projects in tabs, in-app editing/diffing is the difference between a coherent single-window workflow and a window-juggling mess. *(Revised 2026-06-20, WP8: the in-app editor is the primary surface but does **not remove** Sublime Text — both Sublime launchers, Text + Merge, are kept permanently as icon buttons in the panel tab row. See the WP8 deliverable below.)*

**Deliverables (all shipped):**
- [x] **Lite editor** — **CodeMirror 6** (via `@uiw/react-codemirror`; decided over Monaco in research) covering multi-cursor / Cmd-drag column selection, Cmd+P fuzzy file finder, ⌘⇧P command palette (syntax selection), project-wide find/replace, split panes, minimap, font-zoom; plus a multi-file tab strip (WP12), ⌘W close-tab (WP13), and a left file-tree rail (WP10). *(WP2, 3a, 3b, 3c, 6, 7, 10, 12, 13.)*
- [x] **Git diff viewer** for unstaged + staged changes (file list + per-file diff + commit log) — backend `git2` hunks rendered as styled +/- lines (not `@codemirror/merge`, as-built). *(WP4, commit 4e2d742.)*
- [x] **Right-half panel-switch hotkeys** — per-panel **direct-select** (⌘⇧E Editor / ⌘⇧D Diff / ⌘⇧T Terminal — NOT a cycle, as-built WP5) + clickable tabs, per-workspace, coexisting with CM6's keymap via the WP1 capture-phase registration. *(WP5, commit 4546ffb.)*
- [x] **Consolidate the Sublime launchers into the panel tab row (WP8 ✅ 2026-06-20).** *(REDEFINED 2026-06-20 — was "Remove the Sublime Text pop once the editor proves parity.")* The Sublime Text pop is **NOT removed**. Both launchers (Text via `sublime_open` + Merge via `smerge_open`) are kept permanently as inlined-SVG **icon buttons** in the `right-panel-toggle` tab row; the redundant Sublime-Text `⌘⇧O` `keydown` hotkey was deleted (the button is the sole affordance, `⌘⇧O` freed). The backend `sublime` module is untouched. Rationale: the in-app editor is the primary surface, but keeping a one-click Sublime Text escape hatch (alongside the permanent Sublime Merge button for staging/blame/history) costs nothing and the operator wanted both retained.

**Exit Criteria:** A full working day of editing + diff review completes entirely inside Claudesk's right half, with the editor ↔ diff viewer panel-switch hotkey as the navigation. *(Revised 2026-06-20, WP8: "the Sublime Text pop is removed" is NO LONGER an exit criterion — both Sublime launchers are kept as permanent panel-tab-row icon buttons; `subl`/`smerge` are companion surfaces, not dependencies to eliminate.)*

## Group C — Stateful CC controller, multi-workspace & status surfaces

> The architectural heart of the product: stop treating CC as a black box, and light up the full multi-workspace UX (filmstrip with live thumbnails, PiP, menu-bar status item). This is what makes Claudesk genuinely *aware* of CC, the workflow system, and the user's project-juggling pattern.
>
> **Resequenced 2026-06-22 (operator dogfood-first reorder — see the Revision 2026-06-22 note below).** Execution order is now **M3 → M4 (multi-workspace) → M5 (PiP) → M6 (menu-bar) → M7 (auto-resume) → M8 (skill orchestration)**. The driver: **M3 + M4 alone are the dogfood-replace point** — once Claudesk knows CC state (M3) and shows N projects in a filmstrip (M4), the operator can drop the current terminal+Sublime setup and daily-drive Claudesk. The CC-lifecycle "hand-holding" surfaces (smart auto-resume M7, skill-button orchestration M8) are livable-without for now and slid to last-before-polish. **PiP (M5) now ships before the menu-bar (M6)** and is **no longer conditional** — the earlier "menu-bar first, PiP gated on a dogfood week" plan is dropped (operator decision 2026-06-22). The status-broadcaster (M3) still fans out to all three surfaces regardless of their build order.

### Milestone 3: CC lifecycle & state plumbing ✅ COMPLETE 2026-06-22

> **Cycle closed 2026-06-22.** Critical path shipped (WP1 probe → WP2 hook script + `settings.json` registration → WP3 `AF_UNIX` listener + parse → WP4 status broadcaster + DTO → WP6 frontend subscribe + honest indicator); verified live (real `pnpm tauri dev` + real `claude`: idle→running→awaiting-input observed purely from the hook channel, terminal output scrolled away = not PTY scraping). The planned **WP5 (`workflow/.session.md` file-watcher) was DROPPED** — `.session.md` is a manual pause bookmark created by `/session-pause` and deleted by `/session-resume`, not a live workflow-state stream, so watching it yields a near-constant, trivially-derivable signal known to the user before any watcher could report it. M3's exit criterion is met by the hook channel alone. The full decomposition is archived at [`docs/product/archive/milestone-3-cc-lifecycle-state-plumbing/wbs.md`](archive/milestone-3-cc-lifecycle-state-plumbing/wbs.md).

**Goal:** Claudesk owns each workspace's CC process lifecycle and knows its idle/running/awaiting-input state from CC's official signals — never by scraping PTY output.

**Deliverables (all shipped except the dropped file-watcher):**
- [x] **CC process lifecycle ownership:** spawn (Milestone 1), detect idle vs running via CC's official hook channel (`UserPromptSubmit`→Running / `Stop`→Idle / `Notification`→AwaitingInput), detect exit. *(WP2–WP4, WP6.)*
- [x] **Hook handler via Unix socket** (research-decided): Claudesk installs a **Perl** hook script (`resources/claudesk-hook.pl`, ~15 ms/call) and registers it additively/idempotently/reversibly in `~/.claude/settings.json` (coexists with claude-time + notify-telegram); the Rust core binds an `AF_UNIX` `UnixListener` (blocking, dedicated thread — not tokio) at `<app-data>/hook.sock` and parses each JSON line to a typed `HookEvent`. No shared-file polling. *(WP2 commit `77d6a6e`, WP3 commit `4355e00`.)*
- [x] **Rust-side status broadcaster** — single source emitting `WorkspaceStatusUpdate { workspace_id, state, last_event_at, last_output_snippet? }` (snake_case end-to-end DTO) via Tauri event channel (`app.emit("workspace-status", …)`); designed so the three (later-milestone) surfaces all subscribe. The state enum carries an honest `Unknown` default (never emitted). *(WP4 commit `8bc2d68`; frontend subscribe + honest dot indicator WP6 commit `b377a97`.)*
- [x] ~~**File-watcher for `workflow/.session.md`**~~ — **DROPPED** (wrong file; manual pause bookmark, not a live signal — see cycle-close note above). A future milestone (M4+) may instead watch the live workflow document hierarchy (`roadmap → wbs → wip(s) → backlog`); tracked at `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY`.

**Exit Criteria (met):** A workspace's CC state transitions (idle→running→awaiting-input→exit) are observed in Claudesk solely from the hook channel, broadcast to subscribers, with no PTY-output parsing. *(The file-watcher half of the original criterion was dropped with WP5; the hook channel alone satisfies the milestone goal.)*

### Milestone 4: Multi-workspace UX (filmstrip + center stage) ✅ COMPLETE 2026-06-24 *(was Milestone 6)*

> **Cycle closed 2026-06-24 — the M3+M4 dogfood-replace point is REACHED.** All 6 WPs shipped (WP1 N-cost probe → GO for eager-mount; WP2 N>1 lift; WP3 filmstrip tiles + status + live ~1 fps mirror + click/⌘⇧+digit + drag-reorder; WP4 collapse toggle; WP4b left/right focus indicator; WP5 verify-at-N, all exit criteria operator-PASSED at N≥4 real sessions). Three inserted-but-shipped items also landed this cycle (dev/prod isolation, the GUI-PATH fix, the Reveal-in-Finder launcher) — see the arch.md Revision 2026-06-24 note. WBS archived at [`docs/product/archive/milestone-4-multi-workspace-ux/wbs.md`](archive/milestone-4-multi-workspace-ux/wbs.md).

**Goal:** N projects open concurrently as workspaces in one window, switched via the filmstrip. **This + M3 is the dogfood-replace point — once it ships, Claudesk replaces the current terminal + Sublime setup as the daily driver.** *(Depends on Milestone 3's status broadcaster for tile status dots, and Milestone 1's tab-shell substrate.)*

**Deliverables:**
- [x] **Multi-workspace UX:** opening a project from the picker adds a new workspace tab rather than reusing the existing one; the focused one is center-stage, the others render in the filmstrip.
- [x] **Filmstrip** along the top of the window, one tile per **open workspace including the center-staged one**, in a user-arranged order, each showing project name + idle/running/awaiting-input status dot. Background-workspace tiles render a **live ~1 fps terminal mirror** (per the Milestone 1 probe PASS) via `serializeAsHTML()` from the off-viewport terminal's buffer; the **center-staged workspace's tile is a static, active-marked placeholder** (no live mirror — it's already full-size on the center stage) so the row is a complete roster and tile indices never renumber on switch. Clicking a tile promotes that workspace to center stage and demotes the previous one.
- [x] **`⌘⇧+digit` workspace-switch hotkey** — `⌘⇧1..⌘⇧9` jump to the Nth filmstrip tile (keyboard equivalent of clicking it), firing regardless of focus (capture-phase, like the M2 panel chords). The chord is **already reserved** for this — the M2 editor tab-switch uses *bare* `⌘+digit`, deliberately disjoint (see the chord-ownership map in `paletteCommands.ts`).
- [x] **Drag-and-drop filmstrip reorder** — the user arranges the filmstrip tile order by dragging; the order persists (localStorage) and is what `⌘⇧+digit` indexes into (so the digits map to *the user's* layout, not open-order).
- [x] **Left/right focus indicator** — a subtle border (analogous to the M2 split-pane active-editor border) marks which half of the center-stage workspace — the left CC terminal or the right panel (editor/diff/terminal) — currently holds keyboard focus, since at N workspaces with two halves each "where will my keystrokes land" otherwise has no on-screen answer. *(Folds in the focus-ambiguity gap surfaced 2026-06-22.)*
- [x] **Filmstrip collapse toggle** — one-click control collapses the filmstrip into a row of mini status tiles (project name + status dot only) and back. Collapsed workspaces render nothing (`display: none`); PTY output continues to buffer.

**Exit Criteria (met):** Idle/running/awaiting-input of every workspace is visible from inside the Claudesk window without clicking (filmstrip or collapsed-tile row); clicking a tile switches the center stage.

> **Scope notes for the M4 `/product-wbs` pass (operator decisions 2026-06-22):**
> - **Open M4 with a cost-probe WP1** — the N-workspace mount cost (N≈8, each with editor+diff+terminal mounted) is unmeasured (M1's probe covered N=8 *terminals* only, not CM6 editors; `SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE`). M4's whole premise (keep-everything-mounted + serialize-mirror) rests on the <300MB/<20% envelope holding at N. If it busts, the mitigation is `React.lazy` the EditorPanel (`SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD`) — a *mount-architecture* decision, so measure before building the filmstrip, not after.
> - **Fold the picker IPC error-surfacing MAJORs into the N>1 lift** — the WP6-M1 picker MAJORs (mount loader swallows a rejected `list_projects`; mutation handlers drop rejections) were deferred specifically to pair with the multi-workspace open-flow rework (N=1→append). Fixing standalone means touching the open-handler twice. In scope for M4.
> - **N=1-clamp ripple** — the lift from "replace the single workspace" to "append a workspace" surfaces latent N=1 assumptions to resolve: `kill_all` serializing 3s grace windows under one lock (WP7-M1), the `active`-prop defaults (WP3b-M2), the `"terminal"` panel-seam guard (WP5-M2).
> - **Workflow-doc-hierarchy watcher does NOT land in M4** — deferred and anchored to M6 (see `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY`). M4's filmstrip status dot is driven by the M3 CC-hook channel alone.

### Milestone 5: Picture-in-picture *(was Milestone 8 — now unconditional, and ordered before the menu-bar)*  ✅ COMPLETE 2026-06-27

**Goal:** An always-on-top floating status surface for when the Claudesk window is out of focus. *(Resequenced 2026-06-22: ships **before** the menu-bar item and is **no longer conditional** — the prior "build the menu-bar first, gate PiP on a dogfood week" plan is dropped per operator decision. Depends on Milestone 3's broadcaster + Milestone 4's filmstrip-tile rendering.)*

**Deliverables:**
- [x] **PiP NSPanel** via `tauri-nspanel` v2.1 (WP1 GO → WP3): `PanelBuilder` with `PanelLevel::Floating` + `CanJoinAllSpaces | FullScreenAuxiliary | Stationary` + `NonactivatingPanel` style mask (NOT `no_activate(true)` — WP1 proved it destructive). User-toggled via the in-Claudesk right-panel PiP icon + a View-menu tri-state radio (Off/On/Auto). Display-only — clicking a tile does NOT bring the workspace forward (Future Possibility). **Plus (operator scope-adds):** 4 selectable layouts (horizontal/vertical mirror, compact, minimal) with persisted switcher + content-driven auto-resize (WP4); auto-summon-on-blur tri-state `PipMode` lifecycle (WP5).
- [x] **PiP rendering mode** matches the filmstrip outcome: live ~1 fps mirrors via the shared `useMirrorTicker` serialize (WP3 — one serialize loop feeds both filmstrip + PiP, no second loop).

**Exit Criteria:** The PiP panel ships and mirrors the same status surface as the filmstrip; workspace status is visible while the Claudesk window is out of focus. *(Agent-verified PASS on the dev build via the MCP bridge at WP6; the installed-`.app` out-of-focus confirmation is operator-deferred to the `/release` gate before Homebrew distribution — `SURFACE-2026-06-27-M5-INSTALLED-BUILD-VERIFY-DEFERRED-TO-RELEASE`.)*

### Milestone 6: Friend-requested QoL polish ✅ COMPLETE 2026-06-28 *(new — inserted 2026-06-26; an OPEN collection bucket)*

**Goal:** A batch of small, friend-sourced quality-of-life refinements to the workspace UI, landing after the dogfood-replace point (M3+M4) and the out-of-focus status surface (M5) — once real friend-users are exercising the daily driver. **This milestone is deliberately an OPEN collection:** the three deliverables below are the first batch (2026-06-26); **more friend requests are expected before this milestone is reached and should be appended as additional WPs** (or new SURFACEs anchored here) rather than forced into the initial three. Each item mirrors an already-shipped pattern (the file-tree rail resizer, the editor font-zoom, the editor extension array), so the milestone is low-risk polish. *(Depends on Milestone 2's editor/right-panel + Milestone 1's terminal — both shipped; benefits from Milestone 4's WP4b focus indicator for the focus-scoped zoom routing.)*

**Deliverables (first batch — expect more before this milestone is reached):**
- [x] **FIRST ITEM — Fix the stuck-`Running` status dot** ✅ SHIPPED 2026-06-27 (probe WP1+WP1b commits + fix WP2 commit `bafee80`) — root cause pinned via the prod file-telemetry: cwd-match-miss when CC's last shell cwd was a *subdirectory* of the workspace root; `resolve_cwd` rewritten to longest-prefix/ancestor matching. Installed-`.app` live dot-flip → OC.2, confirmed at the v0.2.2 /release gate. *(`SURFACE-2026-06-25-STATUS-STUCK-RUNNING-AFTER-CLEAN-TURN-END`.)*
- [x] **Adjustable left/right split width** ✅ SHIPPED 2026-06-27 (WP3, commit `0b68f5a`) — reframed at spec time from free-drag to a discrete collapse + ratio-preset cycle control (`workspace-split-control`); xterm re-fits via the existing `ResizeObserver` on each ratio change.
- [x] **Adjustable CC terminal font size** ✅ SHIPPED 2026-06-27 (WP4, commit `67c3f54`; extended to the right-panel terminal by WP10, commit `baaaa4c`) — focus-scoped ⌘+/⌘−/⌘0 via `terminalFontZoom.ts` + `data-focus-half` routing. *(Plus the WP8 editor-font 13→11 tweak so editor + terminal share a default size.)*
- [x] **Editor auto-wrap toggle** ✅ SHIPPED 2026-06-27 (WP5, commit `16ce60a`) — default OFF, `⌘\` chord + status-bar pill, live reconfigure via a CM compartment, persisted under `claudesk.editor.lineWrap`.
- [x] **FileTree reaches gitignored-but-editable files** ✅ SHIPPED 2026-06-28 (WP6, commit 61db3d4) — DECIDED: re-base the walker+watcher exclusion from "is gitignored" → "is a heavy/generated dir" (NOT an allowlist), walker-wide (tree + Cmd+P + search). Gitignored-but-editable files (`.env`/`.session.md`/`.claude/*`) are now shown/openable/editable/watched; heavy dirs (`node_modules`/`target`/… by name or detected-big) are listed-but-not-descended + rendered "(not indexed)". *(`SURFACE-2026-06-26-FILETREE-EXCLUDES-GITIGNORED-EDITABLE-FILES`.)*
- [x] **Settings option: open CC without yolo by default** ✅ SHIPPED 2026-06-28 (WP7, commit `4db7b82`) — `AppSettings.cc_yolo` (default yolo-ON) gates `--dangerously-skip-permissions` in the CC spawn argv, synced across 3 surfaces (picker checkbox / native View-menu / `cc-yolo` broadcast). No-yolo next-spawn → OC.3, confirmed at the v0.2.2 /release gate. *(`SURFACE-2026-06-26-M6-SETTING-NO-YOLO-DEFAULT`.)*
- [x] **(fold-ins) WP9 empty-PiP suppression** ✅ SHIPPED 2026-06-28 (commit `7b36853`); **WP10 right-panel terminal zoom** ✅ (commit `baaaa4c`); **WP11 multiple right-panel terminals** ✅ (commit `f9e3292`); **WP8 milestone-exit verification** ✅ (2026-06-28, verification-only + editor-font 13→11 polish, commit `3895a32`). The open collection grew exactly as designed.

**Exit Criteria:** The left/right split is drag-resizable (terminal re-fits cleanly); the CC terminal font size is adjustable via focus-scoped ⌘+/⌘−/⌘0; the editor offers a persisted auto-wrap toggle; gitignored-but-editable files (e.g. `.env`) are reachable in the in-app editor; a settings toggle can open the CC terminal without yolo (default stays yolo-on). (Plus any additional friend-requested QoL items folded in before this milestone's `/product-wbs`.)

> Full first-batch analysis + confirmed code seams: `SURFACE-2026-06-26-FRIEND-QOL-BATCH-1` in `workflow/backlog.md`.

### Milestone 7: Menu-bar status item *(was Milestone 6 → M7; SHRUNK to ambient alarm + actuator 2026-06-29)*  ✅ COMPLETE 2026-06-29 (commit 3888dd6)

**Goal:** The menu bar carries an **ambient "is a project waiting on me?" alarm**, visible system-wide even when the Claudesk window is hidden or on another Space — exploiting the one thing the menu bar offers that the shipped M5 PiP does not: it's a strip the user already passively watches. *(Shrunk at the M7 spec debate 2026-06-29: a full status surface — popover list + navigate-on-click — would be a strict subset of PiP and was cut as redundant. See the Revision 2026-06-29 note below + design-prior `new-surface-must-earn-its-place-against-existing-ones`.)*

**Deliverables:**
- [x] **Menu-bar tray icon — 2-state ambient alarm** via `tauri::tray::TrayIconBuilder` (`icon_as_template` for light/dark; blink-free `set_icon_with_as_template` swap — the real 2.11.2 method; the planned `set_icon_and_icon_as_template_atomic` name doesn't exist). **Lit when ANY workspace is `AwaitingInput`; neutral otherwise** (Running + Idle collapse). Reduced by a pure `aggregate_alarm` fold; subscribes to the existing M3 `workspace-status` event (no broadcaster change). Glyph is a faithful monochrome app-icon portrait (window + 4 filmstrip tiles + main CC box) with a lower-right corner badge on attention.
- [x] **Native actuator menu** (shown on click): Show Claudesk / Toggle PiP / Quit — wired BACKEND-side through the app-level `on_menu_event` (fires for tray menu events too); operator-approved live.
- [ ] ~~Popover `WebviewWindow` with per-workspace status list + navigate-on-click + `tauri-plugin-positioner`~~ — **CUT** (PiP subset; see Revision 2026-06-29).

**Exit Criteria:** ✅ MET (agent-GREEN slice + operator-live-approval). The menu-bar tray icon is lit when any workspace is awaiting input and neutral otherwise, updating live and visible when the Claudesk window is NOT in focus / on another Space / full-screen; clicking it opens a native menu (Show Claudesk / Toggle PiP / Quit) whose items each perform their existing action. *(Native-glyph badge transition + out-of-focus/cross-Space + installed-`.app` parity carried as OC.1–OC.4 DEFERRED-TO-RELEASE for the next `/release` gate, the M5/M6 pattern; the substantive glyph + all 4 actuators were operator-approved live in `pnpm tauri:dev`.)*

> **Watcher re-anchor (2026-06-29):** the workflow-doc-hierarchy watcher (below) was anchored here on the premise that the menu-bar popover's per-workspace list is the natural form factor for a workflow-position line. **M7's shrink removed the popover entirely** — so the watcher's home is now firmly the **workflow-docs markdown viewer** (M8 at the time of this note; renumbered to **M10** by the 2026-06-29b demo-milestone insert + time-analytics swap), the rendering counterpart; nothing M7-shaped remains for it. Re-anchored in `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY`. The note below is retained as history.

> **Anchored here (operator decision 2026-06-22; the menu-bar milestone, now M7): the workflow-doc-hierarchy watcher** (`SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY`, the dropped-M3-WP5 replacement idea — watch `roadmap→wbs→wip(s)→backlog` to surface where each project sits in the workflow). The menu-bar popover's one-row-per-workspace LIST is the natural form factor for a workflow-position line (e.g. `acme-api · WBS M2/WP3 · building`); by M7 the operator will have dogfooded M4+M5 and know what's worth showing. Builds the `notify` watcher seam (shared with `SURFACE-2026-06-21-EDITOR-FILE-WATCHER`). Decide at M7's `/product-wbs` whether it's an M7 WP or — if it outgrows a popover line into a real tree view — a standalone feature after M7. *(Note: the workflow-docs markdown viewer (M10 after the 2026-06-29b reorder) is the adjacent surface — the watcher answers "where does each project sit in the workflow" as a status line; the docs viewer renders the docs themselves. Decide at the docs-viewer's `/product-wbs` whether the watcher feeds that doc panel rather than the popover.)*

### Milestone 8: Demo assets — filmstrip & PiP value showcase  ✅ COMPLETE 2026-06-29 *(inserted 2026-06-29b)*

**Goal:** Produce a pair of short demo recordings (GIF and/or video — format decided in WP1) that *show*, not tell, the two hardest-to-explain value props of the now-shipped multi-workspace UX: **(a) the filmstrip** — multitasking ~4 CC-driven projects at once, the operator's attention moving between them as their status dots change; **(b) the PiP** — staying in deep/mentally-intensive work (or even watching YouTube) in another app while an always-on-top PiP keeps CC's progress monitorable in the corner. These are marketing/communication assets for the README, GitHub release pages, and open-source launch (M13) — they make the "attention across N parallel projects" thesis legible to someone who hasn't used the tool. *(Depends on Milestone 4's filmstrip + Milestone 5's PiP — both shipped + released in v0.2.0–v0.2.3, so the features to demo already exist on the installed `.app`.)*

> **Why a milestone, and why now (operator decision 2026-06-29b):** the filmstrip (M4) and PiP (M5) are the most distinctive things Claudesk does and the hardest to convey in prose; with both shipped and released, this is the moment to capture them. Placed *before* the time-analytics (M9) and docs-viewer (M10) feature work — communicating the existing value comes before building more of it. **Agent-produced end-to-end:** Claude Code drives the capture (staging the scenario on the real `.app`, recording, rendering, embedding), with the operator verifying + giving feedback at checkpoints — NOT operator-recorded. This makes WP1 a genuine **feasibility probe**, not a formality (see below).

**Deliverables:**
- [x] **WP1 — Capture/render pipeline probe + format decision (FIRST; gates the rest).** RESOLVED 2026-06-29 — operator ruled out real screen capture; chose a **synthesized hi-fi animation** (no TCC/staging/MCP-bridge). Format = **looping GIF**; pipeline = HTML harness reusing the real status-dot CSS → Playwright seek-per-frame screenshot → ffmpeg palettegen. (Remotion rejected — non-OSS license.)
- [x] **Filmstrip demo** (WP3, commit a42ba61) — looping ~334KB GIF: 4 unrelated projects, a live CC session, one flips to AwaitingInput, a cursor click promotes it, a `1`/`⏎` answer resumes — "4 in flight, one glance, one click."
- [x] **PiP demo** (WP4, commit 5625658) — looping ~367KB GIF: a vertical corner PiP holding 2 live-mirrored projects over an active Slack work-backdrop; one pings (AwaitingInput), ⌘+Tab switches to the real Claudesk window, `1`/`⏎` answers.
- [x] **Embed + place** (WP5, commits f7b1310/157242d/c34925a) — both GIFs committed to `docs/demo/`, embedded near the top of `README.md` (value one-liner → problem/feature/demo blocks → original content) + 2 new philosophy bullets; pushed + operator-approved on the github.com render.

**Exit Criteria:** ✅ MET 2026-06-29 — two demo assets exist as looping GIFs, agent-produced, each legibly conveying its value prop (filmstrip = parallel-project attention; PiP = monitor-while-elsewhere), embedded in the README and operator-approved at the verify checkpoint. WP1's pipeline probe produced a documented GO + format decision before the final assets were rendered.

### Milestone 9: Time-analytics panel (absorb claude-time) *(was Milestone 8 in the 2026-06-26 insert → M9 after the 2026-06-26b QoL insert → kept M9 but moved AHEAD of the docs-viewer 2026-06-29b)*

> **Reordered ahead of the workflow-docs viewer (2026-06-29b).** Operator-directed swap of the former M8 (docs-viewer) ↔ M9 (time-analytics): time-analytics now precedes the docs-viewer. No deliverable content changed — only sequence + numbering. See the Revision 2026-06-29b note.

**Goal:** Bring CC time-tracking inside Claudesk as a native, default-OFF analytics panel — "where did this week's session time actually go, per project?" — by **absorbing** the standalone `claude-time` tool (`_ref/claude-customization/tools/claude-time/`) and deprecating it. This is the *retrospective* counterpart to the real-time status surfaces (M4 filmstrip / M5 PiP / M7 menu-bar): the same "attention across N parallel projects" thesis, viewed after the fact. *(Depends on Milestone 2's right-half panel model + Milestone 3's hook plumbing — both shipped.)*

**This is a UNIVERSAL feature, not workflow-coupled.** It observes generic CC lifecycle hook events, not the customization *skills* — so unlike the Docs viewer (M10), smart auto-resume (M11), and skill orchestration (M12), it is **not** in the off-by-default *workflow-coupled* bucket. It has its own simple Settings toggle, **default OFF** (to keep CPU/memory/storage at zero for users — including the first friend-users — who don't want it), but any user can enable it and get value without running the workflow system.

**Deliverables:**
- [ ] **Tracking toggle (default OFF), write-gated.** A Settings toggle enables time-tracking. The CC hook fires regardless (it drives the universal live status dots — unchanged); the **time-row SQLite write happens only when the toggle is ON**. Toggle off → receive event → update status → no SQLite touch → zero storage/IO. *(This is also the project's first concrete instance of the universal-vs-workflow-coupled feature-flag pattern.)*
- [ ] **Absorbed hook + DB writer (Rust, in `hook_socket`).** Persistence moves into Claudesk's existing `AF_UNIX` listener — NOT a second Perl hook. `claudesk-hook.pl`'s `settings.json` registration extends to the full event set the reclassifier needs (incl. `PreToolUse`/`PostToolUse`/`SubagentStart`/`SubagentStop`/`SessionStart`/`SessionEnd`), and the Perl hook forwards the extra fields (`tool_use_id`, `agent_type`, `prompt_length_chars`, `source`). The separate `claude-time-hook.pl` registration is removed. **Privacy invariant preserved:** prompt *lengths* only, tool names + ids only — never prompt text or tool input/output.
- [ ] **Per-identity SQLite DB under `app_data_dir()`.** Dev and prod each get their OWN tracking DB (consistent with the `com.claudesk.app` / `com.claudesk.app.dev` isolation) — the DB deliberately does NOT survive / share across the split. No migration of the legacy `~/.claude-time/events.sqlite` (start fresh per identity).
- [ ] **Reclassifier ported to Rust.** `reclassify.py` (gap → tool/active/reading/thinking/away with typing-debit + cross-session reattribution; ~370 lines pure stdlib) ported to Rust, with `test_reclassify.py`'s 29 assertions as the porting oracle. Grouping logic (git-root + `project_names`-style aliasing) stays here as the single source of truth.
- [ ] **Native dashboard right-panel tab.** Port `viz/dashboard.jsx` to a React right-panel tab (alongside Editor/Diff/Terminal/Docs), fed by a Rust query layer (the `viz_data.py` segment model). Renders in-window — no unpkg/Babel CDN, no separate browser window, no stale-snapshot-vs-moving-cursor problem. The standalone `claude-time` CLI (`report`/`visualize`) is deprecated and does not move.

**Exit Criteria:** With the tracking toggle ON, a day of CC usage produces a per-project time breakdown rendered in a native Claudesk panel; with the toggle OFF, the feature adds zero storage/IO and the live status dots are unaffected. The standalone `claude-time` tool is retired.

### Milestone 10: In-app auto-updater *(NEW — inserted 2026-07-06, Revision 2026-07-06; see below)*

> **Why here (operator decision 2026-07-06):** inserted **right after M9 and before the next release** so that whatever version ships next carries an update mechanism — the milestone is about *how future versions reach users*, so it must precede a publish to be useful (a v0.2.x cut without it can't self-update; the first release that *includes* it is the first that later versions can update *from*).

**Goal:** Claudesk can check for updates, and download/install a newer version, from inside the app — with the user always in control: **skip a version**, **disable update notifications**, and **cancel / confirm** each install. No silent forced updates.

**Research findings + LOCKED decisions (2026-07-06):**
- **Homebrew coexistence → DECIDED: detect-and-defer (the "even-cleaner alternative").** Claudesk is distributed via a Homebrew *cask* today. A cask app that self-updates **desyncs `brew`** (brew keeps recording the old version; a later `brew upgrade` could even *downgrade*). **Locked approach (operator, 2026-07-06):** the updater **detects whether the running app was installed via Homebrew** (e.g. bundle path under a Caskroom-linked location / an install-source marker) and, if so, **does NOT self-install — it points the user to `brew upgrade`** instead; only **direct-download installs self-update in-app.** This keeps `brew`'s version tracking correct (no desync, no downgrade risk) with no mixed-updater confusion. *(The `auto_updates true`-stanza variant was the simpler-but-desync-tolerant alternative; the operator chose the correctness path.)* WP-decomposition owns the install-source detection mechanism.
- **Signing → DECIDED: stay UNSIGNED for now; updater surfaces the quarantine-clear step.** The two signing systems are independent: (1) the **updater's minisign keypair** (`tauri signer generate`) is **free, no Apple account**, and verifies update-artifact authenticity; (2) **macOS notarization** needs the **$99/yr Apple Developer Program** — separate. **Locked (operator, 2026-07-06): do NOT pay the $99 yet.** Claudesk stays unsigned (as today — `/release` already ships the `xattr -dr com.apple.quarantine` guidance). Consequence the updater MUST handle: a freshly-downloaded `.app` hits the **Gatekeeper "unverified/damaged" block on relaunch**, so **the updater surfaces the quarantine-clear step** to the user (show the `xattr` command / run it on its own bundle before relaunch if feasible — mechanism TBD at WP-decomposition). Revisit notarization later (a future call, not this milestone).

**Deliverables:**
- [ ] **Update check + notify** — on launch (and/or on demand) check for a newer published version; show a non-modal notification when one exists. Respects the disable-notifications preference and the per-version skip list.
- [ ] **Download + install with explicit confirm** — on user confirm, download the new version, verify its signature (minisign, per `tauri-plugin-updater`), install, and relaunch. **Cancel** at any point leaves the current version untouched.
- [ ] **User controls (the operator's three asks):** **skip this version** (never re-notify for that exact version), **disable update notifications** (a setting; the app stops proactively checking/notifying but a manual "check now" still works), **cancel / confirm** each install (never silent, never forced). Preferences persist per bundle-identity (consistent with `pip_mode` / the M9 tracking toggle).
- [ ] **Homebrew detect-and-defer** — detect a brew-managed install; in that case DON'T self-install — surface "installed via Homebrew → run `brew upgrade`" instead. Direct-download installs self-update. (No desync because the updater never touches a brew-managed bundle.)
- [ ] **Unsigned-relaunch quarantine handling** — the updater surfaces the `xattr -dr com.apple.quarantine` step (or self-runs it on its own bundle pre-relaunch, feasibility TBD) so the post-update relaunch isn't a silent Gatekeeper "damaged" failure. Updates the `/release` skill to publish the update manifest + minisign signature per release (no notarization — staying unsigned).

**Exit Criteria:** From an older **direct-download** installed build, Claudesk detects a newer published version, the user can skip it / disable notifications / confirm the install, and on confirm the app downloads, verifies (minisign), installs, and relaunches into the new version — handling the unsigned-Gatekeeper quarantine step so relaunch isn't a silent failure. A **Homebrew-installed** build instead detects its brew origin and directs the user to `brew upgrade` (no self-install, no desync). The `/release` skill publishes the update manifest + signature per release.

### Milestone 11: Workflow-docs markdown viewer *(was Milestone 7 → M8 → M10 → demoted to M11 by the 2026-07-06 auto-updater insert)*

**Goal:** Read the conventional product/workflow docs as formatted markdown without leaving Claudesk or popping an external editor — so the workflow document hierarchy (vision → roadmap → wbs → wip → backlog) is glanceable inside the workspace it belongs to. *(Depends on Milestone 2's right-half panel model.)*

**Deliverables:**
- [ ] **`Docs` right-panel tab** — a new panel alongside Editor / Diff / Terminal in the `right-panel-toggle` tab row, switched via a `⌘⇧`-chord (next free chord, disjoint from `⌘⇧E`/`⌘⇧D`/`⌘⇧T` and the `⌘⇧+digit` workspace switch) and a clickable tab. Per-workspace, scoped to the workspace's project.
- [ ] **Auto-discovered conventional doc set** — lists, if present in the workspace's project: `docs/product/*.md` (vision, roadmap, research, arch, context — and **glob-matched `*wbs*.md`** so temporary/scratch WBS files surface alongside the canonical `wbs.md`), `workflow/wip/*.md`, `workflow/backlog.md`, and `workflow/.session.md`. No config; absent files are silent no-ops. **CHANGELOG.md is deliberately out of scope.**
- [ ] **Read-only markdown render** — formatted display with scroll and clickable in-doc / cross-doc links; the WIP Work-Tree checkboxes and frontmatter render legibly. Editing those docs stays in the Editor panel or Claude Code — the viewer never writes to disk.
- [ ] **Scroll-preserving live reload** — when a rendered doc changes on disk (the `fs-change` watcher fires — the common case: watching a `workflow/wip/*.md` file update live while CC edits it), re-render the content **without resetting scroll to the top**. Preserve the scroll offset (or anchor) across the reload so a doc the operator is reading mid-file stays put. *(Surfaced 2026-07-07 — `SURFACE-2026-07-07-DOCS-VIEWER-RELOAD-PRESERVE-SCROLL`; the naive "re-read file → replace content" reload scrolls to top, which is disruptive precisely when watching a live-updating WIP.)*

**Exit Criteria:** From any workspace, the `Docs` tab renders that project's conventional product/workflow docs as formatted, scrollable, link-navigable markdown, read-only, with no external editor pop — and a live on-disk change re-renders in place without jumping scroll to the top.

### Milestone 12: Smart auto-resume + drive mode *(was Milestone 4 → M8 → M9 → M10 → M11; slid +1 again by the 2026-07-06 auto-updater insert; livable-without for now)*

**Goal:** Opening a workspace lands on the correct resumption command automatically, and the active drive mode is always visible and one-click changeable.

**Deliverables:**
- [ ] **Smart auto-resume on workspace open** — three-branch decision tree using two source-of-truth signals (presence of `workflow/.session.md` + whether CC has a resumable conversation for the project dir):
  - `workflow/.session.md` exists → auto-send `/session-resume`
  - No `.session.md` but CC has a resumable conversation for the dir → auto-send `/resume` (CC native)
  - Neither, OR last action was a terminal-close (ship/finalize/resolve) → auto-send `/session-start`

  Edge case: both signals present → prefer `/session-resume` (workflow context is richer than raw history). No staleness heuristic on `.session.md`; trust it.
- [ ] **Drive-mode selector + indicator in the workspace header** — small control showing the current drive mode (1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot), changeable in one click. Persisted per-project; mirrored to the active WIP file's `drive_mode:` frontmatter so Claudesk's UI and the workflow's pause-policy logic share a single source of truth. Always visible on the center-stage workspace.

**Exit Criteria:** Workspace open always fires the right resumption command without manual selection; the active drive mode is visible in the header and switchable in one click.

### Milestone 13: Skill orchestration *(was Milestone 5 → M9 → M10 → M11 → M12; slid +1 again by the 2026-07-06 auto-updater insert; livable-without for now)*

**Goal:** Common workflow operations are clicks, not typed slash commands.

**Deliverables:**
- [ ] **Skill registry:** scan `~/.claude/skills/` (global) + `<project>/.claude/skills/` (project-local); render each skill as a clickable button that sends the matching slash command to the active CC pane.
- [ ] **"Recycle Session" one-click button:** `/session-pause` → wait for `.session.md` write completion → Ctrl+D → wait for CC exit → spawn fresh CC → `/session-resume`. Manually triggered only; never automatic.

**Exit Criteria:** No slash-command typing for common skills; Recycle Session is a single click.

> **Group C exit (all six vision success metrics):** (1) time-to-productive <10s; (2) Recycle Session is one click; (3) no slash-command typing for common skills; (4) every workspace's status visible in-window without clicking; (5) workspace open always lands on the right resumption command without manual selection AND the active drive mode is always visible; (6) every workspace's status visible WHEN THE CLAUDESK WINDOW IS NOT IN FOCUS (PiP + menu-bar item). Combined with the Milestone 2 editor/diff viewer, Claudesk is now a full daily driver — projects in tabs, edited and diffed in-window, with no external Sublime juggling. *(Note: the dogfood-replace point arrives earlier than full Group-C completion — at M3 + M4 — per the 2026-06-22 reorder; metrics 2/3/5 land with the later M11/M12.)*

## Group D — Polish & open-source release

### Milestone 14: Polish & Open-Source Release

**Goal:** Make Claudesk usable by other people who run the same workflow setup, without claiming to be a general-purpose tool. *(2026-06-22: PiP is no longer parked here — it ships unconditionally as Milestone 5; the "home for deferred PiP" role is retired.)* *(2026-06-25: the workflow-docs markdown viewer was inserted as Milestone 7, sliding Skill orchestration to M9 and this Polish milestone to M10.)* *(2026-06-26: the time-analytics panel was inserted as Milestone 8, sliding Skill orchestration to M10 and this Polish milestone to M11.)* *(2026-06-26b: the friend-QoL milestone was inserted as Milestone 6, sliding everything after it +1 — time-analytics → M9, Skill orchestration → M11, this Polish milestone → M12.)* *(2026-06-29b: the demo-assets milestone was inserted as Milestone 8 and the time-analytics ↔ docs-viewer pair swapped, sliding the tail +1 again — time-analytics → M9, docs-viewer → M10, auto-resume → M11, Skill orchestration → M12, this Polish milestone → M13.)* *(2026-07-06: the in-app auto-updater was inserted as Milestone 10, sliding the tail +1 again — docs-viewer → M11, auto-resume → M12, Skill orchestration → M13, this Polish milestone → M14.)*

> **Overlap note (2026-07-06):** M14 deliverable "code-signing / notarization strategy decided and documented" now **overlaps** M10 (auto-updater), which forces the sign-vs-unsigned decision earlier because the updater's post-install relaunch depends on it. At M10 the decision gets *made*; M14 inherits it as *documented/finalized for the public release* rather than deciding it fresh. Reconcile at M10 close.

**Deliverables:**
- [ ] **Settings UI:** project list management, hotkeys, default CLI args for `claude` (e.g. yolo-mode toggle), menu-bar / PiP visibility toggles.
- [ ] **macOS app bundle + DMG;** code-signing / notarization strategy decided and documented.
- [ ] **README + minimum setup docs** (assumes the workflow system is installed; no hand-holding for users who don't share that assumption).
- [ ] **Public repo + open-source license** chosen and added.

**Exit Criteria:** A stranger with the workflow system installed at `~/.claude/skills/` can clone the repo, build Claudesk, and use it on their own macOS machine without further help from the author.

## Revision 2026-07-06 — In-app auto-updater inserted as Milestone 10 (right after M9, before the next release)

**Operator-directed insert (2026-07-06):** a new **Milestone 10 — In-app auto-updater** placed immediately after M9 (time-analytics) and **before the next release**. Claudesk gains an in-app "check for updates → download/install newer version" flow with the user in control: **skip a version, disable update notifications, cancel/confirm each install** (no silent/forced updates). Rationale for the slot: the milestone governs *how future versions reach users*, so it must ship before a publish to be useful.

**Two decisions this milestone turns on — BOTH LOCKED (operator, 2026-07-06):**
1. **Homebrew → detect-and-defer.** A self-updating cask desyncs `brew`. Chosen (the correctness path over the simpler `auto_updates true` stanza): the updater **detects a brew-managed install and directs the user to `brew upgrade`** there; only direct-download installs self-update in-app. No desync.
2. **Signing → stay UNSIGNED (no $99 yet).** The updater's minisign keypair is free (no Apple account); notarization is a separate $99/yr Apple Developer Program requirement. Operator: **not paying $99 yet.** Claudesk stays unsigned, so the updater **surfaces the `xattr` quarantine-clear step** on the post-update relaunch (Gatekeeper would otherwise block the fresh bundle). Notarization revisitable later.

**Old → new mapping** (tail slides +1; M1–M9 unchanged):

| Was | Now | Milestone |
|-----|-----|-----------|
| — | **M10** | In-app auto-updater *(new)* |
| M10 | **M11** | Workflow-docs markdown viewer |
| M11 | **M12** | Smart auto-resume + drive mode |
| M12 | **M13** | Skill orchestration |
| M13 | **M14** | Polish & Open-Source Release |

> **Note:** the M14 (Polish) "code-signing / notarization strategy" deliverable now overlaps M10 — the decision is *made* at M10 (the updater forces it), *finalized/documented for public release* at M14. Also: the Group-C exit block still references the six vision metrics at "M11/M12" by their pre-insert numbers — those metrics now land at M12/M13; re-number at the next finalize sweep (non-load-bearing prose).

## Revision 2026-06-29b — Demo-assets milestone inserted as M8; time-analytics ↔ docs-viewer swapped

**Two operator-directed changes, stacked (2026-06-29b):**

1. **Swapped the former M8 (workflow-docs viewer) ↔ M9 (time-analytics)** so time-analytics now precedes the docs-viewer. No deliverable content changed for either — only sequence + numbering.
2. **Inserted a NEW milestone — Demo assets (filmstrip & PiP value showcase)** — as the next execution milestone, *before* the (post-swap) time-analytics. A pair of short demo recordings (GIF and/or video — format decided in the milestone's first WP) that *show* the filmstrip's parallel-project-attention value (multitasking ~4 CC-driven projects) and the PiP's monitor-while-elsewhere value (deep work / YouTube while CC runs in the corner). Marketing/communication assets for the README + GitHub release pages + the M13 open-source launch.

**Demo-milestone specifics (operator decisions 2026-06-29b):** (a) it's a **roadmap milestone**, not a one-off task — gets a full WBS; (b) the **format (GIF vs MP4 vs both) is deferred** to the milestone's **first WP, framed as a feasibility probe** — establish *how* an agent can capture + render these on macOS before committing to a format; (c) **agent-produced end-to-end** — Claude Code drives the capture (staging the scenario on the real installed `.app`, recording, rendering, embedding), with the operator verifying + giving feedback at checkpoints, NOT operator-recorded. **Why here:** the filmstrip (M4) and PiP (M5) are the most distinctive + hardest-to-explain things Claudesk does, both now shipped + released (v0.2.0–v0.2.3) — so communicating that existing value comes before building more features.

**Old → new mapping** (everything from the former M8 onward shifts; M1–M7 unchanged):

| Old | New | Milestone |
|-----|-----|-----------|
| — | **M8** | Demo assets — filmstrip & PiP value showcase *(new, probe-first, agent-produced)* |
| M9 | **M9** | Time-analytics panel (absorb claude-time) *(moved ahead of docs-viewer)* |
| M8 | **M10** | Workflow-docs markdown viewer *(demoted below time-analytics)* |
| M9→M10 *(was)* | **M11** | Smart auto-resume + drive mode |
| M10→M11 *(was)* | **M12** | Skill orchestration |
| M11→M12 *(was)* | **M13** | Polish & open-source release |

Decompose M8 at its `/product-wbs` pass; WP1 (the capture/render pipeline probe + format decision) gates the two demo deliverables + the README embed.

## Revision 2026-06-26b — Friend-requested QoL milestone inserted as Milestone 6

**Inserted a new Milestone 6 (friend-requested QoL polish) between PiP (M5) and the menu-bar item,** sliding the entire Group-C tail +1. Operator-directed: a first batch of three small UI requests from friend-users, framed as an **OPEN collection bucket** — more friend requests are expected before the milestone is reached and should be appended as additional WPs, not forced into the initial three. Full first-batch analysis + confirmed code seams at `SURFACE-2026-06-26-FRIEND-QOL-BATCH-1` in `workflow/backlog.md`.

**First batch (three, all mirroring already-shipped patterns):** (1) **drag-resizable left/right split** (CC terminal ↔ right panel), like the file-tree rail resizer — terminal re-fits automatically via XtermPane's existing `ResizeObserver → fit()`, so no reflow risk; (2) **adjustable CC terminal font size**, like the editor's font-zoom, with **focus-scoped** ⌘+/⌘−/⌘0 (zooms whichever half holds keyboard focus, routed via the WP4b `data-focus-half` tracking — operator decision); (3) **editor auto-wrap toggle** (`EditorView.lineWrapping`, currently off by deliberate 2026-06-20 decision), default OFF, persisted, ⌘\ proposed.

**Old → new mapping** (everything after M5 shifts +1; M1–M5 unchanged):

| Old | New | Milestone |
|-----|-----|-----------|
| — | **M6** | Friend-requested QoL polish *(new, open collection)* |
| M6 | **M7** | Menu-bar status item |
| M7 | **M8** | Workflow-docs markdown viewer |
| M8 | **M9** | Time-analytics panel (absorb claude-time) |
| M9 | **M10** | Smart auto-resume + drive mode |
| M10 | **M11** | Skill orchestration |
| M11 | **M12** | Polish & open-source release |

**Why here:** after the dogfood-replace point (M3+M4) and the out-of-focus status surface (M5), once friend-users are actively exercising the daily driver and surfacing ergonomic friction — but before the workflow-coupled and absorb-claude-time milestones. Low-risk polish (each item clones an existing seam). Decompose at its `/product-wbs` when reached, folding in any further friend requests that arrive first.

## Revision 2026-06-26 — Time-analytics panel (absorb claude-time) inserted as Milestone 8

**Inserted a new Milestone 8 (time-analytics panel) between the workflow-docs viewer (M7) and smart auto-resume.** Claudesk **absorbs** the standalone `claude-time` tool (`_ref/claude-customization/tools/claude-time/` — a hook-driven CC time-tracker: SQLite event log → reclassifier → Gantt dashboard) as a native, **default-OFF** right-panel analytics tab, and the standalone tool is **deprecated**. Operator-directed; full analysis + locked decisions at `SURFACE-2026-06-26-ABSORB-CLAUDE-TIME-INTO-CLAUDESK` in `workflow/backlog.md`.

**Locked decisions:** (1) **full absorption, not reader-only** — claude-time is deprecated, so the bare-terminal-coverage / cross-repo-schema constraints that argued for reader-only are gone and "don't maintain two copies" wins; (2) it is a **universal feature, NOT workflow-coupled** (observes generic CC hook events, not the skills) — so it is NOT in the off-by-default *workflow-coupled* bucket (Docs viewer / auto-resume / skill-orch); it gets its own Settings toggle, default OFF, that a friend may enable; (3) **write only when the toggle is ON** — the hook still fires for the universal status dots, but the time-row SQLite write is gated, so cost-when-off is zero; (4) **per-identity DB** under `app_data_dir()` — dev and prod do NOT share a tracking DB, consistent with the `com.claudesk.app` / `.dev` isolation, no legacy-history migration.

**Absorption shape:** persistence folds into the Rust `hook_socket` listener (not a second Perl hook; `claudesk-hook.pl`'s registration extends to the fuller event set the reclassifier needs, and the legacy `claude-time-hook.pl` registration is removed); `reclassify.py` ports to Rust (29-assertion oracle); `viz/dashboard.jsx` ports to a React right-panel tab fed by a Rust query layer; the `claude-time` CLI is retired.

**Old → new mapping** (Group C tail only; M1–M7 unchanged):

| Old | New | Milestone |
|-----|-----|-----------|
| — | **M8** | Time-analytics panel (absorb claude-time) *(new)* |
| M8 | **M9** | Smart auto-resume + drive mode |
| M9 | **M10** | Skill orchestration |
| M10 | **M11** | Polish & open-source release |

**Why here:** dependencies (M2 right-panel tab model + M3 hook plumbing) are both shipped; it's a natural neighbor to the Docs viewer (another read-mostly right-panel tab on the same panel pattern) and sits before the genuinely workflow-coupled hand-holding milestones. Decompose at its `/product-wbs` pass when reached (open sub-decisions: exact DB path, config/tuning surface, panel scope, the universal-vs-coupled toggle pattern).

> **Numbering superseded by Revision 2026-06-26b (same day):** the friend-QoL milestone was then inserted as M6, shifting this time-analytics milestone from M8 → **M9** and the tail to M10 (auto-resume) / M11 (skill-orch) / M12 (polish). The mapping table above reflects this revision's *then*-current numbering; the current numbering is in 2026-06-26b above.

## Revision 2026-06-25 — Workflow-docs markdown viewer inserted as Milestone 7

**Inserted a new Milestone 7 (workflow-docs markdown viewer) between the menu-bar item (M6) and smart auto-resume.** A read-only `Docs` right-panel tab that renders the conventional product/workflow docs (`docs/product/*.md` incl. glob-matched `*wbs*.md`, `workflow/wip/*.md`, `workflow/backlog.md`, `workflow/.session.md`; CHANGELOG out of scope) as formatted, link-navigable markdown, per-workspace. Operator-directed.

**Old → new mapping** (Group C tail only; M1–M6 unchanged):

| Old | New | Milestone |
|-----|-----|-----------|
| — | **M7** | Workflow-docs markdown viewer *(new)* |
| M7 | **M8** | Smart auto-resume + drive mode |
| M8 | **M9** | Skill orchestration |
| M9 | **M10** | Polish & open-source release |

**Why here:** it sits naturally after the status surfaces (M5/M6) and before the CC-lifecycle hand-holding (M8/M9) — and is the rendering counterpart to the M6-anchored workflow-doc-hierarchy watcher (the watcher answers *where* a project sits; M7 renders the docs themselves). Read-only by design; editing stays in the Editor panel / CC.

## Revision 2026-06-22 — Group C resequenced dogfood-first; PiP unconditional, before menu-bar

**Reordered Milestones 3–8 to reach the daily-driver-replacement point as early as possible, and dropped the PiP conditionality.** No deliverable content changed — only sequence, numbering, and the removed PiP gate. Operator-directed at the M2 cycle close.

**Old → new mapping** (Group C only; M1, M2, M9 unchanged):

| Old | New | Milestone |
|-----|-----|-----------|
| M3 | **M3** | CC lifecycle & state plumbing |
| M6 | **M4** | Multi-workspace UX (filmstrip + center stage) |
| M8 | **M5** | Picture-in-picture *(now unconditional)* |
| M7 | **M6** | Menu-bar status item |
| M4 | **M7** | Smart auto-resume + drive mode |
| M5 | **M8** | Skill orchestration |
| M9 | **M9** | Polish & open-source release |

**Why:** The operator's dogfood-replace bar is **M3 + M4 (new numbering)** — CC-state awareness plus an N-project filmstrip is enough to drop the current terminal+Sublime setup and daily-drive Claudesk. The two CC-lifecycle "hand-holding" milestones (smart auto-resume, skill-button orchestration) are livable-without for now and slid to last-before-polish (M7, M8). **PiP moved ahead of the menu-bar (M5 before M6) and is no longer gated** — the prior "menu-bar first, dogfood a week, defer PiP if sufficient" plan (old M7→M8 gate + the M9 deferred-PiP slot) is fully dropped; PiP ships unconditionally as M5. The status broadcaster (M3) is unaffected — it fans out to all three surfaces no matter their build order.

**Cross-doc impact:** `arch.md`'s Phase-2 forward-look sub-sections (A/B/C/D) describe these surfaces by content, not by milestone number, so they remain accurate; the one numbered reference (the N-editors-cost note) is updated to the new numbering. Historical Revision sections below keep their original numbers (they're history). Next `/product-wbs` decomposes from M3.

## Revision 2026-06-19 (d) — Sublime Text pop is a stopgap, not a permanent escape hatch

> **SUPERSEDED 2026-06-20 by the WP8 redefinition** (see Milestone 2's WP8 deliverable + arch.md's top-of-file Revision 2026-06-20 note): both Sublime launchers (Text + Merge) are KEPT permanently as panel-tab-row icon buttons. The "remove the pop once the editor proves parity" plan below did NOT happen. Retained here as history.

**The in-app lite editor will *replace* Sublime Text, not coexist with it.** The Sublime Text `⌘⇧E` pop + right-panel button that shipped in Milestone 1 (WP8) are reframed from a permanent escape hatch to a **temporary stopgap** that made the right half usable before the in-app editor existed. Milestone 2 now includes a deliverable to **remove** them once the lite editor is proven to cover the daily-use feature set (drop the `keydown` handler, the toolbar button, and the `sublime` backend command). What survives long-term is the **right-half panel-switch hotkeys** (editor ↔ diff viewer ↔ second terminal) — the actual in-window navigation, distinct from the Sublime pop.

**Vision impact:** this reverses the vision's prior "Sublime Text is sacred — a hotkey pops the real Sublime, no second-class compromise" principle, which treated the pop as permanent. `vision.md` and `CLAUDE.md` are updated in step to reflect "in-app editor replaces Sublime; the pop is a Phase-1 stopgap." Milestone 2's goal/exit-criteria updated accordingly (full editing + diff day inside the right half, no `subl` dependency for routine work).

## Revision 2026-06-19 (c) — Dropped the Sublime Merge hotkey milestone

**Removed the standalone "Sublime Merge hotkey" milestone** (was Milestone 9 after revision (b)). Polish & Open-Source Release moved up to Milestone 9; the roadmap is now 9 milestones.

**Why:** the in-app **git diff viewer** shipped in Milestone 2 covers the day-to-day git review need that a Sublime Merge pop-up used to serve. The remaining external-Sublime-Merge use cases (interactive staging, rebase, blame, conflict resolution) don't justify a dedicated roadmap milestone — they can be served, if needed, by a low-effort `smerge <path>` escape hatch added during Milestone 9 polish, mirroring the already-shipped Sublime **Text** `⌘⇧E` hotkey. The Sublime Text escape hatch stays (it pairs with the lite editor); the Sublime Merge one is demoted from a milestone to "optional later polish" and noted as such in Milestone 2's deliverables. No other milestone numbers changed (Milestones 1–8 unaffected; only the old M9→dropped, old M10→M9).

## Revision 2026-06-19 (b) — Lite editor resequenced to second

**Moved the lite editor + diff viewer from last-before-polish to immediately after the PoC** (now Group B / Milestone 2; was Group C / Milestone 9). The stateful-CC-controller + multi-workspace + status-surface block slid down one (now Group C / Milestones 3–9); polish stays Milestone 10. No deliverables changed — only ordering and the resulting renumbering.

**Why:** the product pivoted from one-project-per-**window** to one-project-per-**tab**. Under tabs, leaving the right half a placeholder and relying on the external Sublime pop-up means a separate Sublime/Sublime-Merge OS window per project — which fragments the workflow back across windows and reintroduces the exact window-juggling tax the tab model exists to eliminate. So the in-app editor/diff viewer is now a **must-have**, sequenced before the multi-workspace build-out so the right half is real the moment a second tab opens. Cross-references updated (Milestone 1's right-half "reserved for Milestone 2"; the Milestone 2 editor no longer claims the Sublime Merge hotkey, which stays in Milestone 9; PiP-defer target unchanged at Milestone 10).

## Revision 2026-06-19 (a) — Structural re-format

**Structural re-format to the current `product-roadmap` skill conventions** (no scope or content change — same deliverables, same status, same exit criteria; only the structure and terminology were updated):

- **"Phase" → "Milestone", flat single-integer numbering.** The four phases + Phase 2's dotted sub-milestones (`2.1`–`2.7`) flattened into one continuous list, `Milestone 1` … `Milestone 10`. Dotted hierarchical numbering removed per the skill's flat-numbering rule (the feature Work Tree's `P1.1` dotted IDs are a different artifact and keep their form). Old "Phase N" references elsewhere remain valid as read-aliases.
- **Phases became cosmetic `## Group` headings.** As originally re-formatted: Group A (launch friction), Group B (stateful CC controller + multi-workspace + status surfaces), Group C (lite editor), Group D (polish + release). *(Superseded the same day by revision (b), which moved the lite editor to Group B and slid the CC-controller block to Group C — see above for the current mapping.)* Groups carry no numbering or dependency semantics; cross-milestone dependencies are stated in each milestone's prose.
- **Standardized milestone shape** to Goal / Deliverables / Exit Criteria. The Phase 1 completion status, ship commits, and the WP4 probe outcome are preserved verbatim under Milestone 1.

### Prior revisions

> 2026-06-15: Major rewrite driven by the vision pivot (multi-window → single-window tabbed workspaces + filmstrip + PiP + menu-bar) and research resolving the open design questions. Phase 1 gained the tab-shell substrate + a gating thumbnail-rendering probe; xterm.js settled on DOM-renderer-only (WebGL ~16-context cap); the prior "cross-window CC status indicator" milestone was replaced by three status surfaces (filmstrip / menu-bar / PiP) fed by a single Rust broadcaster over a Unix-socket hook channel (resolving the old "WP9b probe").
> 2026-05-22: Replaced the single auto-resume bullet with a three-branch Smart auto-resume milestone; added a drive-mode selector + indicator milestone. Both additive to the stateful-controller phase.
