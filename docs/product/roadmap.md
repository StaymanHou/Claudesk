---
stage: roadmap
state: complete
updated: 2026-06-19
---

# Roadmap

Claudesk grows in dogfood-able increments, each independently usable. **Launch-friction relief comes first** (Milestone 1 — also lays down the tab-shell substrate even though only one workspace is open at a time); **the architectural heart** — stateful CC controller, three status surfaces, orchestration — comes second (Milestones 2–8); **the lite editor** third (Milestone 9); **release polish** fourth (Milestone 10).

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
- [x] **Right half: empty placeholder** (reserved for the lite editor, Milestone 9). *(WP5 "Coming in Phase 3" card 777c0b8; WP8 added the in-app Sublime toolbar/button in the right panel.)*
- [x] **Hotkey to pop Sublime Text** at the project root (`subl <project-path>`). *(WP8 74dfc2c — in-app `⌘⇧E` webview keydown handler + right-panel button, NOT OS-global `tauri-plugin-global-shortcut`; that approach was built then rejected at verify-human in favor of in-app, no Accessibility permission.)*

**Exit Criteria (met):** Click a project in the picker → working CC session running in the project dir, in <10s, **inside a workspace in the existing Claudesk window** (not a new OS window). Sublime Text pops via hotkey when manual editing is needed. The tab-shell substrate is in place even though only one workspace ever opens. The thumbnail-rendering probe produced a documented pass/fail outcome selecting the filmstrip-rendering strategy (→ live mirrors). Sublime Merge still launched manually.

## Group B — Stateful CC controller, multi-workspace & status surfaces

> The architectural heart of the product: stop treating CC as a black box, and light up the full multi-workspace UX (filmstrip with live thumbnails, menu-bar status item, optional PiP). This is what makes Claudesk genuinely *aware* of CC, the workflow system, and the user's project-juggling pattern. **Milestone 8 (menu-bar status item) ships before the PiP work in Milestone 9's group… see each milestone's dependency note.**

### Milestone 2: CC lifecycle & state plumbing

**Goal:** Claudesk owns each workspace's CC process lifecycle and knows its idle/running/awaiting-input state from CC's official signals — never by scraping PTY output.

**Deliverables:**
- [ ] **CC process lifecycle ownership:** spawn, detect idle vs running via CC's official hook channel (`UserPromptSubmit` / `Stop` / `Notification` events), detect exit, support clean re-spawn.
- [ ] **Hook handler via Unix socket** (research-decided): Claudesk registers a hook script in `~/.claude/settings.json` that writes JSON lines to a Unix socket Claudesk listens on. No shared-file polling.
- [ ] **Rust-side status broadcaster** — single source emitting `WorkspaceStatusUpdate { workspace_id, state: Idle|Running|AwaitingInput, last_event_at, last_output_snippet }` via Tauri event channel to three subscribers (main webview, PiP webview, menu-bar popover webview). All three surfaces agree at all times.
- [ ] **File-watcher for `workflow/.session.md`** (debounced write detection) via `notify` / `tauri-plugin-fs-watch`.

**Exit Criteria:** A workspace's CC state transitions (idle→running→awaiting-input→exit) are observed in Claudesk solely from the hook channel + file-watcher, broadcast to all subscribers, with no PTY-output parsing.

### Milestone 3: Smart auto-resume + drive mode

**Goal:** Opening a workspace lands on the correct resumption command automatically, and the active drive mode is always visible and one-click changeable.

**Deliverables:**
- [ ] **Smart auto-resume on workspace open** — three-branch decision tree using two source-of-truth signals (presence of `workflow/.session.md` + whether CC has a resumable conversation for the project dir):
  - `workflow/.session.md` exists → auto-send `/session-resume`
  - No `.session.md` but CC has a resumable conversation for the dir → auto-send `/resume` (CC native)
  - Neither, OR last action was a terminal-close (ship/finalize/resolve) → auto-send `/session-start`

  Edge case: both signals present → prefer `/session-resume` (workflow context is richer than raw history). No staleness heuristic on `.session.md`; trust it.
- [ ] **Drive-mode selector + indicator in the workspace header** — small control showing the current drive mode (1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot), changeable in one click. Persisted per-project; mirrored to the active WIP file's `drive_mode:` frontmatter so Claudesk's UI and the workflow's pause-policy logic share a single source of truth. Always visible on the center-stage workspace.

**Exit Criteria:** Workspace open always fires the right resumption command without manual selection; the active drive mode is visible in the header and switchable in one click.

### Milestone 4: Skill orchestration

**Goal:** Common workflow operations are clicks, not typed slash commands.

**Deliverables:**
- [ ] **Skill registry:** scan `~/.claude/skills/` (global) + `<project>/.claude/skills/` (project-local); render each skill as a clickable button that sends the matching slash command to the active CC pane.
- [ ] **"Recycle Session" one-click button:** `/session-pause` → wait for `.session.md` write completion → Ctrl+D → wait for CC exit → spawn fresh CC → `/session-resume`. Manually triggered only; never automatic.

**Exit Criteria:** No slash-command typing for common skills; Recycle Session is a single click.

### Milestone 5: Multi-workspace UX (filmstrip + center stage)

**Goal:** N projects open concurrently as workspaces in one window, switched via the filmstrip. *(Depends on Milestone 2's status broadcaster for tile status dots, and Milestone 1's tab-shell substrate.)*

**Deliverables:**
- [ ] **Multi-workspace UX:** opening a project from the picker adds a new workspace tab rather than reusing the existing one; the focused one is center-stage, the others render in the filmstrip.
- [ ] **Filmstrip** along the top of the window, one tile per non-center-stage workspace, each showing project name + idle/running/awaiting-input status dot. **Tile body is a live ~1 fps terminal mirror** (per the Milestone 1 probe PASS) via `serializeAsHTML()` from the off-viewport background terminal's buffer. Clicking a tile promotes that workspace to center stage and demotes the previous one.
- [ ] **Filmstrip collapse toggle** — one-click control collapses the filmstrip into a row of mini status tiles (project name + status dot only) and back. Collapsed workspaces render nothing (`display: none`); PTY output continues to buffer.

**Exit Criteria:** Idle/running/awaiting-input of every workspace is visible from inside the Claudesk window without clicking (filmstrip or collapsed-tile row); clicking a tile switches the center stage.

### Milestone 6: Menu-bar status item

**Goal:** Workspace status is visible system-wide, even when the Claudesk window is hidden or on another Space. *(Ships **before** the PiP work in Milestone 7 — see Milestone 7's gate.)*

**Deliverables:**
- [ ] **Menu-bar status item** via `tauri::tray::TrayIconBuilder`. Icon shows an aggregate status dot (green: all idle, blue: any running, amber: any awaiting input), `setIconAsTemplate` for light/dark adaptation. Left-click opens a popover (positioned via `tauri-plugin-positioner` with the `tray-icon` feature) listing every open workspace with status dot + project name; clicking a row brings Claudesk forward AND switches the center stage. Right-click opens a native menu: Show Claudesk window / Toggle PiP / Quit.

**Exit Criteria:** Idle/running of every workspace is visible when the Claudesk window is NOT in focus, via the menu-bar item.

### Milestone 7: Picture-in-picture (conditional)

**Goal:** An always-on-top floating status surface for when the Claudesk window is out of focus — *if* the menu-bar item proves insufficient. **Gating dependency:** after Milestone 6 ships, dogfood the menu-bar item alone for at least one daily-driver week. If it covers the "Claudesk hidden / not in focus" case sufficiently, **this milestone defers to Group D (Milestone 10)**; otherwise build it now.

**Deliverables:**
- [ ] **PiP NSPanel** via `tauri-nspanel` v2.1: `PanelBuilder` with `no_activate(true)` + `PanelLevel::Floating` + `CanJoinAllSpaces | FullScreenAuxiliary | Stationary`. User-toggled (menu-bar right-click or in-Claudesk button). Display-only — clicking a tile does NOT bring the workspace forward (that's a Future Possibility).
- [ ] **PiP rendering mode** matches the filmstrip outcome: live ~1 fps mirrors (probe PASSED).

**Exit Criteria:** Either the dogfooding gate defers PiP to Milestone 10 (documented), or the PiP panel ships and mirrors the same status surface as the filmstrip.

### Milestone 8: Sublime Merge hotkey

**Goal:** Sublime Merge is one keystroke away, completing the external-tool escape hatches for this group.

**Deliverables:**
- [ ] **Hotkey to pop Sublime Merge** at the project root (`smerge <project-path>`).

**Exit Criteria:** Sublime Merge pops at the active workspace's project root via hotkey.

> **Group B exit (all six vision success metrics):** (1) time-to-productive <10s; (2) Recycle Session is one click; (3) no slash-command typing for common skills; (4) every workspace's status visible in-window without clicking; (5) workspace open always lands on the right resumption command without manual selection AND the active drive mode is always visible; (6) every workspace's status visible WHEN THE CLAUDESK WINDOW IS NOT IN FOCUS (menu-bar item, and PiP if shipped). Claudesk is a viable daily driver even with the right half still empty.

## Group C — Lite editor & diff viewer (right half)

### Milestone 9: Lite Editor + Diff Viewer

**Goal:** Cover the daily-use Sublime Text features inside Claudesk so the right half stops being a placeholder. After this, a full working day without opening Sublime Text or Sublime Merge externally is the target.

**Deliverables:**
- [ ] **Lite editor** (Monaco or CodeMirror 6 — decided in a research pass) covering: multi-cursor / column selection, Cmd+P fuzzy file finder, command palette for syntax selection, project-wide find/replace, split panes, minimap.
- [ ] **Git diff viewer** for unstaged + staged changes (file list + per-file diff view, comparable to Sublime Merge's basics; `git2` crate).
- [ ] **Right-half panel swapping:** one keybind cycles editor ↔ diff viewer ↔ second terminal (per-workspace, not global).
- [ ] **Hotkey-pop to real Sublime Text and Sublime Merge still works** (escape hatch for cases the built-in tools don't cover).

**Exit Criteria:** A full working day completes without externally launching Sublime Text or Sublime Merge for routine work; the hotkey-pop becomes a rarely-used escape hatch, not the default.

## Group D — Polish & open-source release

### Milestone 10: Polish & Open-Source Release

**Goal:** Make Claudesk usable by other people who run the same workflow setup, without claiming to be a general-purpose tool. Also the home for PiP if it deferred from Milestone 7.

**Deliverables:**
- [ ] **Settings UI:** project list management, hotkeys, default CLI args for `claude` (e.g. yolo-mode toggle), menu-bar / PiP visibility toggles.
- [ ] **PiP NSPanel (if deferred from Milestone 7)** — same shape as Milestone 7. Drop if Milestone 6's menu-bar-only dogfooding proved sufficient long-term.
- [ ] **macOS app bundle + DMG;** code-signing / notarization strategy decided and documented.
- [ ] **README + minimum setup docs** (assumes the workflow system is installed; no hand-holding for users who don't share that assumption).
- [ ] **Public repo + open-source license** chosen and added.

**Exit Criteria:** A stranger with the workflow system installed at `~/.claude/skills/` can clone the repo, build Claudesk, and use it on their own macOS machine without further help from the author.

## Revision 2026-06-19

**Structural re-format to the current `product-roadmap` skill conventions** (no scope or content change — same deliverables, same status, same exit criteria; only the structure and terminology were updated):

- **"Phase" → "Milestone", flat single-integer numbering.** The four phases + Phase 2's dotted sub-milestones (`2.1`–`2.7`) flattened into one continuous list, `Milestone 1` … `Milestone 10`. Dotted hierarchical numbering removed per the skill's flat-numbering rule (the feature Work Tree's `P1.1` dotted IDs are a different artifact and keep their form). Old "Phase N" references elsewhere remain valid as read-aliases.
- **Phases became cosmetic `## Group` headings.** Group A (launch friction / Milestone 1), Group B (stateful CC controller + multi-workspace + status surfaces / Milestones 2–8), Group C (lite editor / Milestone 9), Group D (polish + release / Milestone 10). Groups carry no numbering or dependency semantics; cross-milestone dependencies (e.g. Milestone 5 needs Milestone 2's broadcaster; Milestone 7's PiP gates on Milestone 6 dogfooding) are now stated in each milestone's prose.
- **Standardized milestone shape** to Goal / Deliverables / Exit Criteria. The Phase 1 completion status, ship commits, and the WP4 probe outcome are preserved verbatim under Milestone 1.

### Prior revisions

> 2026-06-15: Major rewrite driven by the vision pivot (multi-window → single-window tabbed workspaces + filmstrip + PiP + menu-bar) and research resolving the open design questions. Phase 1 gained the tab-shell substrate + a gating thumbnail-rendering probe; xterm.js settled on DOM-renderer-only (WebGL ~16-context cap); the prior "cross-window CC status indicator" milestone was replaced by three status surfaces (filmstrip / menu-bar / PiP) fed by a single Rust broadcaster over a Unix-socket hook channel (resolving the old "WP9b probe").
> 2026-05-22: Replaced the single auto-resume bullet with a three-branch Smart auto-resume milestone; added a drive-mode selector + indicator milestone. Both additive to the stateful-controller phase.
