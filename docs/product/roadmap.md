---
stage: roadmap
state: complete
updated: 2026-06-22
---

# Roadmap

Claudesk grows in dogfood-able increments, each independently usable. **Launch-friction relief comes first** (Milestone 1 — also lays down the tab-shell substrate even though only one workspace is open at a time); **the in-app lite editor + diff viewer** comes second (Milestone 2) — a must-have, not a nice-to-have, now that projects live in tabs (see the resequencing rationale in the 2026-06-19 revision below); **the architectural heart** — stateful CC controller, three status surfaces, orchestration — comes third (Milestones 3–8); **release polish** comes fourth (Milestone 9).

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

> The architectural heart of the product: stop treating CC as a black box, and light up the full multi-workspace UX (filmstrip with live thumbnails, menu-bar status item, optional PiP). This is what makes Claudesk genuinely *aware* of CC, the workflow system, and the user's project-juggling pattern. **Milestone 7 (menu-bar status item) ships before the PiP work in Milestone 8 — see each milestone's dependency note.**

### Milestone 3: CC lifecycle & state plumbing

**Goal:** Claudesk owns each workspace's CC process lifecycle and knows its idle/running/awaiting-input state from CC's official signals — never by scraping PTY output.

**Deliverables:**
- [ ] **CC process lifecycle ownership:** spawn, detect idle vs running via CC's official hook channel (`UserPromptSubmit` / `Stop` / `Notification` events), detect exit, support clean re-spawn.
- [ ] **Hook handler via Unix socket** (research-decided): Claudesk registers a hook script in `~/.claude/settings.json` that writes JSON lines to a Unix socket Claudesk listens on. No shared-file polling.
- [ ] **Rust-side status broadcaster** — single source emitting `WorkspaceStatusUpdate { workspace_id, state: Idle|Running|AwaitingInput, last_event_at, last_output_snippet }` via Tauri event channel to three subscribers (main webview, PiP webview, menu-bar popover webview). All three surfaces agree at all times.
- [ ] **File-watcher for `workflow/.session.md`** (debounced write detection) via `notify` / `tauri-plugin-fs-watch`.

**Exit Criteria:** A workspace's CC state transitions (idle→running→awaiting-input→exit) are observed in Claudesk solely from the hook channel + file-watcher, broadcast to all subscribers, with no PTY-output parsing.

### Milestone 4: Smart auto-resume + drive mode

**Goal:** Opening a workspace lands on the correct resumption command automatically, and the active drive mode is always visible and one-click changeable.

**Deliverables:**
- [ ] **Smart auto-resume on workspace open** — three-branch decision tree using two source-of-truth signals (presence of `workflow/.session.md` + whether CC has a resumable conversation for the project dir):
  - `workflow/.session.md` exists → auto-send `/session-resume`
  - No `.session.md` but CC has a resumable conversation for the dir → auto-send `/resume` (CC native)
  - Neither, OR last action was a terminal-close (ship/finalize/resolve) → auto-send `/session-start`

  Edge case: both signals present → prefer `/session-resume` (workflow context is richer than raw history). No staleness heuristic on `.session.md`; trust it.
- [ ] **Drive-mode selector + indicator in the workspace header** — small control showing the current drive mode (1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot), changeable in one click. Persisted per-project; mirrored to the active WIP file's `drive_mode:` frontmatter so Claudesk's UI and the workflow's pause-policy logic share a single source of truth. Always visible on the center-stage workspace.

**Exit Criteria:** Workspace open always fires the right resumption command without manual selection; the active drive mode is visible in the header and switchable in one click.

### Milestone 5: Skill orchestration

**Goal:** Common workflow operations are clicks, not typed slash commands.

**Deliverables:**
- [ ] **Skill registry:** scan `~/.claude/skills/` (global) + `<project>/.claude/skills/` (project-local); render each skill as a clickable button that sends the matching slash command to the active CC pane.
- [ ] **"Recycle Session" one-click button:** `/session-pause` → wait for `.session.md` write completion → Ctrl+D → wait for CC exit → spawn fresh CC → `/session-resume`. Manually triggered only; never automatic.

**Exit Criteria:** No slash-command typing for common skills; Recycle Session is a single click.

### Milestone 6: Multi-workspace UX (filmstrip + center stage)

**Goal:** N projects open concurrently as workspaces in one window, switched via the filmstrip. *(Depends on Milestone 3's status broadcaster for tile status dots, and Milestone 1's tab-shell substrate.)*

**Deliverables:**
- [ ] **Multi-workspace UX:** opening a project from the picker adds a new workspace tab rather than reusing the existing one; the focused one is center-stage, the others render in the filmstrip.
- [ ] **Filmstrip** along the top of the window, one tile per non-center-stage workspace, each showing project name + idle/running/awaiting-input status dot. **Tile body is a live ~1 fps terminal mirror** (per the Milestone 1 probe PASS) via `serializeAsHTML()` from the off-viewport background terminal's buffer. Clicking a tile promotes that workspace to center stage and demotes the previous one.
- [ ] **Filmstrip collapse toggle** — one-click control collapses the filmstrip into a row of mini status tiles (project name + status dot only) and back. Collapsed workspaces render nothing (`display: none`); PTY output continues to buffer.

**Exit Criteria:** Idle/running/awaiting-input of every workspace is visible from inside the Claudesk window without clicking (filmstrip or collapsed-tile row); clicking a tile switches the center stage.

### Milestone 7: Menu-bar status item

**Goal:** Workspace status is visible system-wide, even when the Claudesk window is hidden or on another Space. *(Ships **before** the PiP work in Milestone 8 — see Milestone 8's gate.)*

**Deliverables:**
- [ ] **Menu-bar status item** via `tauri::tray::TrayIconBuilder`. Icon shows an aggregate status dot (green: all idle, blue: any running, amber: any awaiting input), `setIconAsTemplate` for light/dark adaptation. Left-click opens a popover (positioned via `tauri-plugin-positioner` with the `tray-icon` feature) listing every open workspace with status dot + project name; clicking a row brings Claudesk forward AND switches the center stage. Right-click opens a native menu: Show Claudesk window / Toggle PiP / Quit.

**Exit Criteria:** Idle/running of every workspace is visible when the Claudesk window is NOT in focus, via the menu-bar item.

### Milestone 8: Picture-in-picture (conditional)

**Goal:** An always-on-top floating status surface for when the Claudesk window is out of focus — *if* the menu-bar item proves insufficient. **Gating dependency:** after Milestone 7 ships, dogfood the menu-bar item alone for at least one daily-driver week. If it covers the "Claudesk hidden / not in focus" case sufficiently, **this milestone defers to Group D (Milestone 9)**; otherwise build it now.

**Deliverables:**
- [ ] **PiP NSPanel** via `tauri-nspanel` v2.1: `PanelBuilder` with `no_activate(true)` + `PanelLevel::Floating` + `CanJoinAllSpaces | FullScreenAuxiliary | Stationary`. User-toggled (menu-bar right-click or in-Claudesk button). Display-only — clicking a tile does NOT bring the workspace forward (that's a Future Possibility).
- [ ] **PiP rendering mode** matches the filmstrip outcome: live ~1 fps mirrors (probe PASSED).

**Exit Criteria:** Either the dogfooding gate defers PiP to Milestone 9 (documented), or the PiP panel ships and mirrors the same status surface as the filmstrip.

> **Group C exit (all six vision success metrics):** (1) time-to-productive <10s; (2) Recycle Session is one click; (3) no slash-command typing for common skills; (4) every workspace's status visible in-window without clicking; (5) workspace open always lands on the right resumption command without manual selection AND the active drive mode is always visible; (6) every workspace's status visible WHEN THE CLAUDESK WINDOW IS NOT IN FOCUS (menu-bar item, and PiP if shipped). Combined with the Milestone 2 editor/diff viewer, Claudesk is now a full daily driver — projects in tabs, edited and diffed in-window, with no external Sublime juggling.

## Group D — Polish & open-source release

### Milestone 9: Polish & Open-Source Release

**Goal:** Make Claudesk usable by other people who run the same workflow setup, without claiming to be a general-purpose tool. Also the home for PiP if it deferred from Milestone 8.

**Deliverables:**
- [ ] **Settings UI:** project list management, hotkeys, default CLI args for `claude` (e.g. yolo-mode toggle), menu-bar / PiP visibility toggles.
- [ ] **PiP NSPanel (if deferred from Milestone 8)** — same shape as Milestone 8. Drop if Milestone 7's menu-bar-only dogfooding proved sufficient long-term.
- [ ] **macOS app bundle + DMG;** code-signing / notarization strategy decided and documented.
- [ ] **README + minimum setup docs** (assumes the workflow system is installed; no hand-holding for users who don't share that assumption).
- [ ] **Public repo + open-source license** chosen and added.

**Exit Criteria:** A stranger with the workflow system installed at `~/.claude/skills/` can clone the repo, build Claudesk, and use it on their own macOS machine without further help from the author.

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
