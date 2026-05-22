---
stage: roadmap
state: complete
updated: 2026-05-22
---

> Revision 2026-05-22: Replaced the single auto-resume bullet with a three-branch Smart auto-resume milestone (`.session.md` → `/session-resume`; no `.session.md` + resumable CC conversation → `/resume`; otherwise → `/session-start`). Added a drive-mode selector + indicator milestone to Phase 2. Both are additive to Phase 2; Phase 1 unchanged.

# Roadmap

Each phase is independently usable — the wrapper grows in dogfood-able increments. Launch-friction relief comes first; the architectural heart (stateful CC controller + orchestration) second; the lite editor third; release polish fourth.

### Phase 1: Bare Shell (PoC)

**Goal:** Prove the Tauri shell + embedded terminal + project picker work together. Replaces *only* the "open terminal + cd + run claude" step. The biggest reported pain point (launch friction) is solved before any editor work begins.

**Milestones:**
- [ ] Tauri app skeleton (macOS bundle, launches, shows one window)
- [ ] Project picker UI (recents list, "Open Folder" button), persisted to a config file in `~/Library/Application Support/stayman-cc-wrapper/` or equivalent
- [ ] Embedded terminal pane (xterm.js + node-pty via Tauri sidecar pattern), auto-runs `claude --dangerously-skip-permissions` in the selected project dir
- [ ] Right half: empty placeholder (reserved for Phase 3)
- [ ] Hotkey to pop Sublime Text at the project root

**Exit Criteria:** Click a project in the picker → working CC session running in the project dir, in <10s. Sublime Text pops via hotkey when manual editing is needed. Sublime Merge still launched manually (out of scope for this phase).

### Phase 2: Stateful CC Controller + Orchestration Layer

**Goal:** Stop treating CC as a black box. Cross the architectural line that separates this tool from "tmux with a nicer skin." This is the architectural heart of the product — it's what makes the wrapper genuinely *aware* of CC and the workflow system, not just a fancy launcher.

**Milestones:**
- [ ] CC process lifecycle ownership: spawn, detect idle vs running via CC's official hook channel (`UserPromptSubmit` / `Stop` / `Notification` events written to `~/.claude/settings.json`), detect exit, support clean re-spawn
- [ ] File-watcher for `workflow/.session.md` (debounced write detection)
- [ ] **Smart auto-resume on project open** — three-branch decision tree using two source-of-truth signals (presence of `workflow/.session.md` + whether CC has a resumable conversation for the project dir):
  - `workflow/.session.md` exists → auto-send `/session-resume`
  - No `.session.md` but CC has a resumable conversation for the project dir → auto-send `/resume` (CC native)
  - Neither, OR last action was a terminal-close (ship/finalize/resolve) → auto-send `/session-start`

  Edge case: both signals present → prefer `/session-resume` (workflow context richer than raw history). No staleness heuristic on `.session.md`; trust it.
- [ ] **Drive-mode selector + indicator in window header** — small UI control showing the current drive mode (1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot) and letting the user change it with one click. Persisted per-project; mirrored to the active WIP file's `drive_mode:` frontmatter so the wrapper UI and the workflow's pause-policy logic share a single source of truth.
- [ ] Skill registry: scan `~/.claude/skills/` (global) + `<project>/.claude/skills/` (project-local), render each skill as a clickable button that sends the matching slash command to the active CC pane
- [ ] "Recycle Session" one-click button: send `/session-pause` → wait for `.session.md` write completion → send Ctrl+D → wait for CC exit → spawn fresh CC → send `/session-resume`. Manually triggered only; never automatic.
- [ ] **Always-visible cross-window CC status indicator.** Each wrapper window's header shows a compact list of all open wrapper instances (project name + idle/running dot per instance), updated in real time. State is shared between processes via a small file in the app-support dir (`instances.json` with last-heartbeat + state per pid; stale entries dropped). Detection is driven by the wrapper's CC hook handler registered in `~/.claude/settings.json` — NEVER PTY scraping. Clicking another instance's row focuses that window.
- [ ] Hotkey to pop Sublime Merge at the project root

**Exit Criteria:** All five vision-level success metrics hold: (1) time-to-productive <10s, (2) Recycle Session is one click, (3) no slash-command typing for common skills, (4) cross-window idle/running visible in every header without clicking, (5) project-open always lands on the right resumption command (`/session-resume`, `/resume`, or `/session-start`) without manual selection AND the active drive mode is visible in the header at all times. The wrapper is a viable daily driver even with the right half still empty.

### Phase 3: Lite Editor + Diff Viewer (Right Half)

**Goal:** Cover the daily-use Sublime Text features inside the wrapper so the right half stops being a placeholder. After this, the wrapper is feature-complete against the vision — a full day of work without opening Sublime Text or Sublime Merge externally is the target.

**Milestones:**
- [ ] Lite editor (Monaco or CodeMirror 6, decision in research phase) covering: multi-cursor / column selection, Cmd+P fuzzy file finder, command palette for syntax selection, project-wide find/replace, split panes within the editor, minimap
- [ ] Git diff viewer for unstaged + staged changes (file list + per-file diff view, comparable to Sublime Merge's basics)
- [ ] Right-half panel swapping: one keybind cycles editor ↔ diff viewer ↔ second terminal
- [ ] Hotkey-pop to real Sublime Text and Sublime Merge still works (escape hatch for any case the built-in tools don't cover)

**Exit Criteria:** A full working day completes without externally launching Sublime Text or Sublime Merge for routine work. The hotkey-pop becomes a rarely-used escape hatch, not the default for editing or diff review.

### Phase 4: Polish & Open-Source Release

**Goal:** Make the wrapper usable by other people who run the same workflow setup, without claiming or attempting to be a general-purpose tool.

**Milestones:**
- [ ] Settings UI: project list management, hotkeys, default CLI args for `claude` (e.g., yolo mode toggle)
- [ ] macOS app bundle + DMG; code-signing or notarization strategy decided and documented
- [ ] README and minimum setup docs (assumes the workflow system is installed; no hand-holding for users who don't share the workflow assumption)
- [ ] Public repo + open-source license chosen and added

**Exit Criteria:** A stranger with the workflow system installed at `~/.claude/skills/` can clone the repo, build the app, and use it on their own macOS machine without further help from the author.
