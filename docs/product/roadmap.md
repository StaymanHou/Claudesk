---
stage: roadmap
state: complete
updated: 2026-06-16
---

## Revision 2026-06-15

Major rewrite driven by the vision pivot (multi-window → single-window with tabbed workspaces + filmstrip + PiP + menu-bar) and the research findings that resolved the open design questions. **Changed assumptions from prior revisions:**

- **Phase 1 now ships the tab-shell substrate.** Single-workspace use in Phase 1 is just N=1 of the tab model; Phase 2 isn't reshaping the foundation. Adds a **thumbnail-rendering probe** as a Phase 1 work package (parallel to the CC-PTY probe) to validate that ~1 fps live terminal mirrors are cheap enough at N=8 workspaces. Probe is gating: pass → ship live mirrors in Phase 2; fail → ship status tiles in v1, leave live mirrors as Future Possibility. (Recorded in vision: "live terminal mirrors at ~1 fps" is the target; "status tiles" is the documented fallback.)
- **xterm.js: DOM renderer only, no WebGL.** Decision recorded after re-evaluating the research finding that WebGL contexts cap at ~16/page. With DOM-only there is no cap, no swap-on-focus complexity, and the 2026 DOM renderer is fast enough for the foreground workspace.
- **Phase 2's "Always-visible cross-window CC status indicator" milestone (prior 2026-05-22 revision) is REPLACED** by three status surfaces: (a) **filmstrip + center-stage** in-window, (b) **menu-bar status item** with click-to-popover, (c) **PiP NSPanel** (display-only, ~1 fps live mirrors or status tiles per probe outcome). Menu-bar item ships *before* PiP in Phase 2 — if it proves sufficient, PiP may be deferred to Phase 4.
- **Resolves a question previously deferred to a "WP9b probe":** the CC hook channel writes via Unix socket to Claudesk's Rust broadcaster, not a shared file. Three concurrent status surfaces (filmstrip, PiP, menu-bar) consume the same broadcaster — multi-consumer concurrency makes the socket the obvious choice from day one.
- **Phase count unchanged (4)**, but milestone shape inside Phase 1 and Phase 2 is materially different. Phase 3 (lite editor + diff viewer) and Phase 4 (polish + open-source release) are largely unchanged.

### Prior revisions

> 2026-05-22: Replaced single auto-resume bullet with a three-branch Smart auto-resume milestone (`.session.md` → `/session-resume`; no `.session.md` + resumable CC conversation → `/resume`; otherwise → `/session-start`). Added a drive-mode selector + indicator milestone to Phase 2. Both additive to Phase 2; Phase 1 unchanged.

# Roadmap

Each phase is independently usable — Claudesk grows in dogfood-able increments. **Launch-friction relief comes first** (Phase 1 also lays down the tab-shell substrate, even though only one workspace is open at a time); **the architectural heart** — stateful CC controller, three status surfaces, orchestration — comes second (Phase 2); **the lite editor** third (Phase 3); **release polish** fourth (Phase 4).

### Phase 1: Bare Shell + Tab Substrate (PoC)

**Goal:** Prove the Tauri shell + embedded terminal + project picker + tab-shell substrate work together. Replaces *only* the "open terminal + cd + run claude" step at the user-visible level. The biggest reported pain point (launch friction) is solved before any editor work begins. The tab substrate is shipped now (even though Phase 1 only ever shows one workspace) so Phase 2's filmstrip and PiP build on top of an existing foundation rather than reshaping it.

**Milestones:**
- [x] **Tauri 2 app skeleton** (macOS bundle, launches, shows one window). Single `WebviewWindow` per the research decision — no multi-webview. *(WP1 shipped 2026-06-16, commit c50a785.)*
- [ ] **Project picker UI** (recents list, "Open Folder" button), persisted to `~/Library/Application Support/Claudesk/projects.json` via `tauri-plugin-fs`.
- [ ] **Tab-shell substrate** — a workspace-list React component holds an array of workspace records; the center-stage area mounts the focused workspace. Filmstrip area exists but is empty (Phase 2 populates it). Background workspaces stay mounted (`display: none`), never unmounted on switch. **Phase 1 only ever opens one workspace at a time, but the substrate must already be in place.**
- [ ] **Embedded terminal pane** (xterm.js + `tauri-plugin-pty` / `portable-pty`), **DOM renderer only — no WebGL addon**, auto-runs `claude --dangerously-skip-permissions` in the selected project dir, full-size in the center stage.
- [ ] **Thumbnail-rendering probe** (research output, gating for Phase 2). Build a synthetic harness: 8 xterm.js instances rendering representative CC output, mirror each at ~1 fps via the simplest viable approach (CSS-transform live mirror of the off-screen-mounted full-size xterm). Measure: CPU at idle, CPU during one active CC session, RAM total. Pass thresholds (proposed; finalised in the probe's plan): <10% CPU idle, <20% CPU active, <300 MB RAM. Record outcome in `docs/product/arch.md` as the deciding signal between "Phase 2 ships live mirrors" vs "Phase 2 ships status tiles."
- [ ] **Right half: empty placeholder** (reserved for Phase 3 lite editor).
- [ ] **Hotkey to pop Sublime Text** at the project root using `tauri-plugin-global-shortcut` + `subl <project-path>`.

**Exit Criteria:** Click a project in the picker → working CC session running in the project dir, in <10s, **inside a workspace in the existing Claudesk window** (not a new OS window). Sublime Text pops via hotkey when manual editing is needed. The tab-shell substrate is in place even though only one workspace ever opens. The thumbnail-rendering probe has produced a documented pass/fail outcome that selects Phase 2's filmstrip-rendering strategy (live mirrors or status tiles). Sublime Merge still launched manually (out of scope for this phase).

### Phase 2: Stateful CC Controller + Multi-Workspace + Status Surfaces

**Goal:** Stop treating CC as a black box. Cross the architectural line that separates this tool from "tmux with a nicer skin." Light up the full multi-workspace UX: filmstrip with live thumbnails (or status tiles per probe outcome), menu-bar status item, optional PiP. This is the architectural heart of the product — it's what makes Claudesk genuinely *aware* of CC, the workflow system, and the user's project-juggling pattern.

**Milestones (grouped):**

**2.1 — CC lifecycle & state plumbing**
- [ ] **CC process lifecycle ownership:** spawn, detect idle vs running via CC's official hook channel (`UserPromptSubmit` / `Stop` / `Notification` events written to `~/.claude/settings.json`), detect exit, support clean re-spawn.
- [ ] **Hook handler via Unix socket** (research-decided; previously a "WP9b probe"). Claudesk registers a hook script in `~/.claude/settings.json` that writes JSON lines to a Unix socket Claudesk listens on. No shared-file polling.
- [ ] **Rust-side status broadcaster** — single source emitting `WorkspaceStatusUpdate { workspace_id, state: Idle|Running|AwaitingInput, last_event_at, last_output_snippet }` via Tauri event channel to three subscribers (main webview, PiP webview, menu-bar popover webview). All three surfaces agree at all times.
- [ ] **File-watcher for `workflow/.session.md`** (debounced write detection) via `notify` / `tauri-plugin-fs-watch`.

**2.2 — Smart auto-resume + drive mode**
- [ ] **Smart auto-resume on workspace open** — three-branch decision tree using two source-of-truth signals (presence of `workflow/.session.md` + whether CC has a resumable conversation for the project dir):
  - `workflow/.session.md` exists → auto-send `/session-resume`
  - No `.session.md` but CC has a resumable conversation for the project dir → auto-send `/resume` (CC native)
  - Neither, OR last action was a terminal-close (ship/finalize/resolve) → auto-send `/session-start`

  Edge case: both signals present → prefer `/session-resume` (workflow context richer than raw history). No staleness heuristic on `.session.md`; trust it.
- [ ] **Drive-mode selector + indicator in the workspace header** — small UI control showing the current drive mode (1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot) and letting the user change it with one click. Persisted per-project; mirrored to the active WIP file's `drive_mode:` frontmatter so Claudesk's UI and the workflow's pause-policy logic share a single source of truth. Always visible on the center-stage workspace.

**2.3 — Skill orchestration**
- [ ] **Skill registry:** scan `~/.claude/skills/` (global) + `<project>/.claude/skills/` (project-local), render each skill as a clickable button that sends the matching slash command to the active CC pane.
- [ ] **"Recycle Session" one-click button:** send `/session-pause` → wait for `.session.md` write completion → send Ctrl+D → wait for CC exit → spawn fresh CC → send `/session-resume`. Manually triggered only; never automatic.

**2.4 — Multi-workspace UX (filmstrip + center-stage)**
- [ ] **Multi-workspace UX:** opening a project from the picker now adds a new workspace tab rather than reusing the existing one. The user can have N workspaces open concurrently; the focused one is center-stage, the others render in the filmstrip.
- [ ] **Filmstrip** along the top of the window, populated with one tile per non-center-stage workspace. Each tile shows project name + idle/running/awaiting-input status dot. **Tile body is either a live ~1 fps terminal mirror (probe pass) or a static status tile (probe fail).** Clicking a tile promotes that workspace to center stage and demotes the previous one to the filmstrip.
- [ ] **Filmstrip collapse toggle** — one-click control in the window chrome collapses the filmstrip into a row of mini status tiles (no live preview, just project name + status dot) and back. Collapsed workspaces render nothing (display: none) — PTY output continues to buffer.

**2.5 — Menu-bar status item (ship BEFORE PiP)**
- [ ] **Menu-bar status item** via Tauri's built-in `tauri::tray::TrayIconBuilder`. Icon shows an aggregate status dot (green: all idle, blue: any running, amber: any awaiting input), `setIconAsTemplate` for proper light/dark adaptation. Left-click opens a popover (positioned via `tauri-plugin-positioner` with the `tray-icon` feature) listing every open workspace with per-workspace status dot + project name. Clicking a row brings the Claudesk window forward AND switches the center stage to that workspace. Right-click opens a native menu: Show Claudesk window / Toggle PiP / Quit.
- [ ] **Dogfooding gate before building PiP:** use the menu-bar item alone for at least one daily-driver week. If it covers the "Claudesk hidden / not in focus" case sufficiently, **PiP is deferred to Phase 4** (still on the roadmap, but optional). If not, proceed to 2.6.

**2.6 — Picture-in-picture (conditional on 2.5 dogfooding)**
- [ ] **PiP NSPanel** via `tauri-nspanel` v2.1: `PanelBuilder` with `no_activate(true)` + `PanelLevel::Floating` + `NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorStationary`. User-toggled (from menu-bar right-click or in-Claudesk button). Display-only — clicking a tile does NOT bring the workspace forward; that's a Future Possibility.
- [ ] **PiP rendering mode** matches the filmstrip outcome: live ~1 fps mirrors if probe passed, status tiles if probe failed.

**2.7 — Sublime Merge hotkey**
- [ ] **Hotkey to pop Sublime Merge** at the project root (`smerge <project-path>`).

**Exit Criteria:** All six vision-level success metrics hold:
1. Time-to-productive <10s (workspace open inside existing Claudesk window).
2. Recycle Session is one click.
3. No slash-command typing for common skills.
4. Idle/running/awaiting-input of every workspace visible from inside the Claudesk window without clicking (filmstrip or collapsed-tile row).
5. Workspace open always lands on the right resumption command (`/session-resume`, `/resume`, or `/session-start`) without manual selection AND the active drive mode is visible in the workspace header at all times.
6. Idle/running of every workspace is visible WHEN THE CLAUDESK WINDOW IS NOT IN FOCUS via the menu-bar status item (and PiP, if 2.6 shipped).

Claudesk is a viable daily driver even with the right half still empty.

### Phase 3: Lite Editor + Diff Viewer (Right Half)

**Goal:** Cover the daily-use Sublime Text features inside Claudesk so the right half stops being a placeholder. After this, Claudesk is feature-complete against the vision — a full day of work without opening Sublime Text or Sublime Merge externally is the target.

**Milestones:**
- [ ] Lite editor (Monaco or CodeMirror 6, decision in next research pass) covering: multi-cursor / column selection, Cmd+P fuzzy file finder, command palette for syntax selection, project-wide find/replace, split panes within the editor, minimap.
- [ ] Git diff viewer for unstaged + staged changes (file list + per-file diff view, comparable to Sublime Merge's basics).
- [ ] Right-half panel swapping: one keybind cycles editor ↔ diff viewer ↔ second terminal.
- [ ] Hotkey-pop to real Sublime Text and Sublime Merge still works (escape hatch for any case the built-in tools don't cover).

**Exit Criteria:** A full working day completes without externally launching Sublime Text or Sublime Merge for routine work. The hotkey-pop becomes a rarely-used escape hatch, not the default for editing or diff review.

### Phase 4: Polish & Open-Source Release

**Goal:** Make Claudesk usable by other people who run the same workflow setup, without claiming or attempting to be a general-purpose tool. Also the home for PiP if it was deferred from Phase 2.

**Milestones:**
- [ ] Settings UI: project list management, hotkeys, default CLI args for `claude` (e.g., yolo mode toggle), menu-bar / PiP visibility toggles.
- [ ] **PiP NSPanel (if deferred from Phase 2)** — same milestone shape as 2.6 above. Drop if Phase 2's menu-bar-only dogfooding proved sufficient long-term.
- [ ] macOS app bundle + DMG; code-signing or notarization strategy decided and documented.
- [ ] README and minimum setup docs (assumes the workflow system is installed; no hand-holding for users who don't share the workflow assumption).
- [ ] Public repo + open-source license chosen and added.

**Exit Criteria:** A stranger with the workflow system installed at `~/.claude/skills/` can clone the repo, build Claudesk, and use it on their own macOS machine without further help from the author.
