---
stage: wbs
state: complete
updated: 2026-05-22
---

> Revision 2026-05-19: Added cross-window CC status indicator to Phase 2 headlines (WP9b probe + WP10b indicator WP). Phase 1 decomposition is unchanged.
> Revision 2026-05-22: Added two Phase 2 additions. (1) Replaced the original auto-resume bullet (WP11) with a three-branch smart auto-resume; added WP9c probe to confirm CC's resumability-per-cwd surface. (2) Added WP10c drive-mode selector + indicator. Phase 1 decomposition still unchanged.

# Work Breakdown Structure

**Cycle scope:** Phase 1 (Bare Shell PoC). Phases 2–4 are sketched at WP-headline level for visibility but **deliberately not decomposed** until Phase 1 completes — premature decomposition would force decisions about Phase 2/3 internals before Phase 1 surfaces what we actually learned.

Roadmap-text correction noted in `arch.md` is applied during WP1 (project scaffold) rather than via a P4 back-loop: when WP1's scaffold uses `tauri-plugin-pty` instead of node-pty, the roadmap milestone text is amended in the same commit.

## Phase 1: Bare Shell PoC

### Phase ordering rationale

Within Phase 1, the learning-sequence ordering applies as follows:

1. **Environment first (WP1)** — get a Tauri 2 dev environment running on the host macOS before any product code. Catches Xcode CLT / rustup / node / signing gotchas at the cheapest moment.
2. **3rd-party probes before integrations (WP2, WP3)** — Claude Code's PTY behavior under host-driven byte injection (WP2) and Sublime Text's CLI shape across project styles (WP3) are the two external integrations Phase 1 depends on. Both are probes, not build WPs, because what we need is **knowledge** before we commit code that assumes shapes.
3. **UI prototype before backend wiring (WP4)** — a static frontend prototype validates the picker + terminal-pane + placeholder layout in the browser-tab dev mode before we wire the Rust IPC. Catches WKWebView CSS surprises early.
4. **Backend synchronous path (WP5, WP6, WP7)** — project config store, PTY-backed CC session via the `CcSession` trait, global shortcut for Sublime-pop. Each is a self-contained synchronous slice.
5. **No orchestration in Phase 1.** Phase 1 is single-project, single-window, no background workers, no async event bus beyond what Tauri IPC gives for free. Async orchestration starts in Phase 2 (Recycle Session state machine), per the Orchestration Ordering Rule.

**Phase 1 → Phase 2 rationale:** Phase 1 ships when we can launch a project and get CC running in <10s with Sublime hotkey-pop working. Phase 2's stateful-controller work depends on having a stable PTY-backed terminal pane that survives daily use — best learned by dogfooding Phase 1 for at least a week before Phase 2 decomposition.

### WP1: Tauri 2 project scaffold + dev environment
**Description:** Initialize the Tauri 2 + React + TypeScript + Vite project. Get `pnpm tauri dev` running with an empty window on macOS. Establish lint/format/test baselines. Apply the roadmap-text correction (replace "node-pty via Tauri sidecar pattern" with the `tauri-plugin-pty` choice from arch.md).
**Phase:** Phase 1
**Dependencies:** none
**Size:** S
**Tasks:**
- [ ] Run `pnpm create tauri-app` with React+TypeScript+Vite template (pre-risky-action checklist: target dir is the existing repo root with vision/roadmap/research/arch docs — confirm git is clean, **scaffold into a temporary sibling dir then merge**, do not run the scaffolder into a dir containing strategic docs)
- [ ] Verify `pnpm tauri dev` opens an empty window on this macOS machine
- [ ] Verify `pnpm tauri build` produces a `.app` bundle
- [ ] Add ESLint + Prettier (frontend); confirm `cargo clippy` and `cargo fmt` pass on the scaffolded `src-tauri/`
- [ ] Add Vitest scaffold (frontend) and a single passing test
- [ ] Add a single passing `#[test]` in `src-tauri/`
- [ ] Amend roadmap.md Phase 1 milestone text: replace "xterm.js + node-pty via Tauri sidecar pattern" with "xterm.js + tauri-plugin-pty (portable-pty)"
- [ ] Commit baseline; update `CHANGELOG.md` deferred to first `feature-finalize` run

### WP2: Probe — Claude Code under host-driven PTY byte-injection
**Type:** probe
**Phase:** Phase 1
**Dependencies:** WP1 (need a Tauri dev env to test from; can be done in parallel using a standalone Rust binary if WP1 slips)
**Size:** S
**Learning objective:** Confirm that running `claude --dangerously-skip-permissions` inside a `portable-pty` pty from a Rust parent process produces a normal interactive TUI experience, including: (a) ANSI rendering is intact, (b) typed slash commands work when written as byte streams ending in `\n`, (c) `Ctrl+D` (byte `0x04`) written into the pty cleanly terminates the session, (d) resize events propagate, (e) yolo-mode auth carries over from the host user's authenticated `claude` session.
**Timebox:** Half-day
**Success criterion:** A short writeup in `workflow/wip/wp2-cc-pty-probe.md` documenting: each of (a)–(e) confirmed or not, any surprises (e.g. CC requires a TTY env var, particular SIGWINCH handling, prompt-detection quirks), and the exact code shape that worked. The writeup is the deliverable; no production code lands.
**Tasks:**
- [ ] Write a minimal Rust binary (or `examples/` in src-tauri) that spawns `claude` via `portable-pty`
- [ ] Pipe its output to stdout; pipe stdin to its input (manual interactive verification)
- [ ] Verify ANSI/color is rendered correctly when stdout is a terminal
- [ ] Write a programmatic input variant: send `/help\n` and capture the response
- [ ] Write a `Ctrl+D` test: confirm the child exits cleanly within a reasonable timeout
- [ ] Test resize: send SIGWINCH after `pty.resize(cols, rows)` and confirm CC redraws
- [ ] Record findings in the probe writeup

### WP3: Probe — Sublime Text / Sublime Merge CLI shapes across project styles
**Type:** probe
**Phase:** Phase 1
**Dependencies:** none
**Size:** XS
**Learning objective:** Pin down the exact `subl` and `smerge` invocations to use for: (a) a project root that contains a `.sublime-project` file, (b) a project root that does not, (c) what happens with `--new-window` vs default, (d) whether `--background` is needed to avoid stealing focus from the wrapper window, (e) how macOS `open -a` behaves differently from direct `subl <path>` invocation (for users who don't have `subl` on PATH).
**Timebox:** 1 hour
**Success criterion:** A short table in `workflow/wip/wp3-sublime-cli-probe.md` mapping (project state × user intent) → exact command. Decision: do we require `subl`/`smerge` on PATH, or fall back to `open -a "Sublime Text" <path>` when they're absent?
**Tasks:**
- [ ] Test `subl <dir>` (no project file) vs `subl --project <dir>/foo.sublime-project` (with file)
- [ ] Test `subl --new-window` and `subl --background` combinations
- [ ] Test `smerge <dir>` and `smerge --new-window <dir>`
- [ ] Test `open -a "Sublime Text" <dir>` as a no-PATH fallback
- [ ] Record findings in the probe writeup

### WP4: Frontend UI prototype (no backend wiring)
**Description:** Build the static React UI: project picker (recents list + "Open Folder" button), 2-pane main view (left half: xterm.js component mounted with mock data; right half: placeholder card). No real IPC yet — use mock data so the layout/CSS work is settled before Rust wiring.
**Phase:** Phase 1
**Dependencies:** WP1
**Size:** M
**Tasks:**
- [ ] Project Picker component: list of recents (mocked), "Open Folder" button (mocked dialog), click handler stub
- [ ] Main view: 50/50 horizontal split (CSS grid or `react-split-pane`); resizable divider deferred to later phase
- [ ] Left pane: mount `@xterm/xterm` with WebGL + fit addons; write "Hello, mock CC" via direct `term.write`
- [ ] Right pane: placeholder card ("Coming in Phase 3")
- [ ] App shell: simple state machine for `picker` vs `project-open` view
- [ ] Verify in `pnpm tauri dev` on actual macOS (NOT just `vite dev` in a browser tab — WKWebView vs Chromium rendering differences must be caught here)
- [ ] Lint + tests pass

### WP5: Project config store (Rust backend)
**Description:** Implement the `projects.json` persistence layer in Rust. Tauri commands: `list_projects`, `add_project(path)`, `record_open(path)`, `remove_project(path)`. Atomic file writes (write to `.tmp`, rename) to survive crashes. Wire to the (now real) Project Picker UI.
**Phase:** Phase 1
**Dependencies:** WP1, WP4
**Size:** S
**Tasks:**
- [ ] Define the `Project` struct: `path: PathBuf`, `last_opened_at: i64 (unix ms)`, `display_name: Option<String>`
- [ ] Resolve app data dir via `tauri::path::app_data_dir()`; ensure dir exists on first run
- [ ] Implement read: JSON file → `Vec<Project>` (empty vec if file absent)
- [ ] Implement atomic write: serialize → `projects.json.tmp` → `rename`
- [ ] Wire Tauri commands: `list_projects`, `add_project`, `record_open`, `remove_project`
- [ ] Frontend: replace mocked picker data with real IPC calls
- [ ] Unit tests in `src-tauri/`: round-trip, atomic write under simulated crash, missing-file handling
- [ ] "Open Folder" dialog wired via `tauri-plugin-dialog`

### WP6: PtyCcSession — embedded CC terminal (real backend)
**Description:** Implement the `CcSession` trait and the `PtyCcSession` concrete impl in Rust using `tauri-plugin-pty` (which wraps `portable-pty`). Spawn `claude --dangerously-skip-permissions` with cwd = selected project path. Bridge bytes both ways with the xterm.js component from WP4. Handle resize, exit, kill. Apply findings from WP2.
**Phase:** Phase 1
**Dependencies:** WP1, WP2 (probe must complete first), WP4, WP5
**Size:** M
**Tasks:**
- [ ] Add `tauri-plugin-pty` to `src-tauri/Cargo.toml`; register in builder
- [ ] Add `tauri-pty` to frontend `package.json`
- [ ] Define `CcSession` trait: `send_input(bytes)`, `resize(cols, rows)`, `kill()`, `wait_for_exit()`, output via Tauri event stream
- [ ] Implement `PtyCcSession`: holds the pty handle + reader task + writer task
- [ ] Tauri commands: `cc_spawn(project_path) -> session_id`, `cc_input(session_id, bytes)`, `cc_resize(session_id, cols, rows)`, `cc_kill(session_id)`
- [ ] Tauri event: `cc-output-<session_id>` streaming output bytes to frontend
- [ ] Frontend: on project open → call `cc_spawn` → connect xterm.js `onData` to `cc_input`, `term.write` to `cc-output-*` events, fit-addon resize to `cc_resize`
- [ ] Lifecycle: window close → `cc_kill`; CC exit → frontend shows "session ended" overlay with re-launch button
- [ ] Manual test: open a project, run a real CC session, type slash commands, exit via Ctrl+D, re-launch

### WP7: Global hotkey for Sublime Text pop
**Description:** Register a configurable global hotkey that opens Sublime Text at the currently-open project's path. Single hotkey, hardcoded default in Phase 1 (settings UI lands in Phase 4). Surface a macOS Accessibility permission flow on first launch.
**Phase:** Phase 1
**Dependencies:** WP1, WP3 (probe must complete), WP5
**Size:** S
**Tasks:**
- [ ] Add `tauri-plugin-global-shortcut`; add required permissions to `capabilities/`
- [ ] Define default hotkey (e.g., `Cmd+Shift+E`); document it
- [ ] On app start: register hotkey; handler reads current open-project path from app state
- [ ] Implement Sublime launcher in Rust using `tauri-plugin-shell`, applying WP3 decision (subl + --project when applicable; `open -a` fallback)
- [ ] On macOS: detect Accessibility permission status; show a one-time onboarding dialog if missing, linking to System Settings → Privacy & Security → Accessibility
- [ ] Manual test: open project → press hotkey → Sublime Text opens at project root
- [ ] Manual test: hotkey when no project is open → no-op (or surface a tray notification)

### WP8: Phase 1 polish + exit-criteria verification
**Description:** Final pass on Phase 1: end-to-end timing check (<10s from picker click to ready CC), edge cases (CC binary missing, project path no longer exists, permission denied), basic error handling, README placeholder. NOT a release — Phase 4 covers distribution.
**Phase:** Phase 1
**Dependencies:** WP5, WP6, WP7
**Size:** S
**Tasks:**
- [ ] Time-to-productive measurement: cold launch → picker click → CC ready. Target <10s. Record in `workflow/wip/wp8-timing.md`
- [ ] Error: `claude` not on PATH → friendly message in xterm.js pane with link to install docs
- [ ] Error: project path deleted between sessions → remove from picker on next launch with toast
- [ ] Error: Accessibility permission denied → hotkey no-op + non-fatal warning
- [ ] Basic README in repo root (just enough for the author; full docs in Phase 4)
- [ ] Dogfood for 3+ days on real projects before marking complete

## Phase 1 critical path

```
WP1 ──► WP2 ──┐
       └─► WP4 ──► WP5 ──► WP6 ──► WP8
              └──────────► WP7 ──┘
WP3 ──────────────────────────────► WP7
```

- **Critical path:** WP1 → WP4 → WP5 → WP6 → WP8
- **Parallelizable:** WP2 (probe) and WP3 (probe) can start as soon as WP1 unblocks them; WP3 is independent enough to even start in parallel with WP1 if a Sublime install is available.
- **WP2 gates WP6.** Do not start WP6 PTY work before WP2 probe is done — the probe's findings will shape the `CcSession` trait's exact shape (e.g., whether resize needs explicit SIGWINCH, whether we need to set `TERM=xterm-256color`).

## Phase 2: Stateful CC Controller + Orchestration Layer (NOT decomposed)

Sketched at WP headline only — full decomposition deferred until Phase 1 ships and dogfooding surfaces real constraints.

- **WP9: Probe — `workflow/.session.md` write semantics** (probe): confirm whether `/session-pause` writes the file atomically or in stages; what marker indicates "done writing"; how `/session-resume` reads it.
- **WP9b: Probe — CC hook channel for idle/running detection** (probe): confirm the exact payload shape and timing of `UserPromptSubmit` / `Stop` / `Notification` hook events; verify a wrapper-installed hook can coexist with `claude-time`'s hook entries in `~/.claude/settings.json`; decide whether the hook script writes to a shared file or to a Unix socket the wrapper listens on; verify the events fire reliably on real interactive sessions (slash commands, multi-turn conversations, tool-use loops, permission prompts).
- **WP9c: Probe — CC's resumable-conversation surface per project dir** (probe): confirm the exact CC CLI shape for "is there a resumable conversation for this cwd". Test cases: (a) prior session cleanly exited via Ctrl+D, (b) prior session killed by SIGKILL (simulates wrapper crash / power-off), (c) prior session ended after `/session-pause` wrote `.session.md`, (d) project dir never had a CC session. For each, verify whether `claude --resume --list` (or the actual mechanism) reports a resumable session-id, and whether the answer is keyed by cwd or by session-id. Decision: the exact probe expression the wrapper uses on project open. Required by WP11.
- **WP10: WorkflowStateWatcher** (notify-based file watcher; debounced events)
- **WP10b: Cross-window CC status indicator** (the always-visible per-window indicator showing idle/running of *every* open wrapper instance): includes the hook-installer routine (write entry into `~/.claude/settings.json` on first launch, with idempotency check + uninstall on app removal), the small hook script (Perl or POSIX shell, no runtime deps), the shared `instances.json` reader/writer (atomic writes, ~3s heartbeat, ~10s staleness threshold), the file-watcher-driven indicator React component, and the click-to-focus cross-window IPC. Depends on WP9b. **Includes a dogfood requirement:** 2+ wrapper windows open simultaneously across 2+ real projects for at least one full work session before WP marked complete.
- **WP10c: Drive-mode selector + indicator (header)** — small UI control in the wrapper window header showing the current drive mode (1/2/3/4) and changing it with one click. Implementation: extend the `Project` struct in `projects.json` with `default_drive_mode: Option<DriveMode>`; add Tauri commands `get_drive_mode(project_path)` (read precedence: active WIP file frontmatter → `projects.json` → global default `autopilot`) and `set_drive_mode(project_path, mode)` (write to all active WIP files' `drive_mode:` frontmatter + `projects.json`). React header component subscribes to a file-watcher event for `projects.json` updates. **Includes a dogfood requirement:** at least one full session where the user changes drive mode mid-feature via the UI and verifies the workflow orchestrator picks up the change at the next pause-policy check.
- **WP11: Smart auto-resume on project open** — three-branch decision tree per `arch.md` "Phase 2 smart auto-resume on project open architecture". On `cc_spawn`, compute `(session_md_exists, cc_has_resumable)` and inject the corresponding slash command via `CcSession::send_input` once CC is ready. Depends on WP9c (probe must answer the resumability-per-cwd question). Edge cases verified during dogfood: (a) `.session.md` exists + resumable CC → `/session-resume` (workflow context wins), (b) clean Ctrl+D exit with no `.session.md` → `/resume`, (c) SIGKILL'd prior session with no `.session.md` → behavior depends on WP9c probe result, (d) terminal-close case (just ran `/feature-finalize`) → `/session-start`.
- **WP12: SkillRegistry** (scan `~/.claude/skills/` + `<proj>/.claude/skills/`; expose to UI)
- **WP13: Skill buttons in UI** (Phase 2 right-half panel is still a placeholder, so the skill buttons live in a left-pane toolbar or a slide-in drawer — decision pulled into Phase 2 decomposition)
- **WP14: Recycle Session state machine** (Rust state machine: `Pausing → WaitingForSessionFile → SendingCtrlD → WaitingForExit → Respawning → Resuming`; UI button; cancel handling). Uses WP10b's hook channel to detect when CC has actually exited and when the fresh CC is idle and ready — replaces any "wait for prompt glyph" PTY-scraping anti-pattern.
- **WP15: Hotkey for Sublime Merge pop** (parallels WP7)
- **WP16: Phase 2 polish + dogfood + exit-criteria verification** (all five vision success metrics confirmed, including the <1s cross-window scan target and the one-click correct-resumption target)

## Phase 3: Lite Editor + Diff Viewer (NOT decomposed)

Sketched only.

- **WP17: Probe — Monaco vs CodeMirror 6 for Sublime-feature coverage** (probe): which library covers multi-cursor, column selection, Cmd+P, command palette, project-wide find/replace, split panes, minimap with the least custom work? Decision: pick one.
- **WP18: Lite editor integration**
- **WP19: Git diff viewer (using `git2` crate)**
- **WP20: Right-half panel host with swappable tabs (editor / diff / ad-hoc terminal)**
- **WP21: Sublime hotkey-pop remains as escape hatch — verify still works**
- **WP22: Phase 3 polish + exit-criteria verification**

## Phase 4: Polish & Open-Source Release (NOT decomposed)

Sketched only.

- **WP23: Settings UI** (project list management, hotkeys, claude CLI args)
- **WP24: Code-signing + notarization strategy decided and applied** (probe-flavored: decide between Apple Developer Program signing vs unsigned-with-instructions; document)
- **WP25: README + setup docs** (workflow-system-assumed audience)
- **WP26: Open-source license + public repo**
- **WP27: Release dry-run + dogfood + cycle close**

## SURFACE-IN history

(none yet)

## Session Pause — 2026-05-19 06:20
Paused. See `workflow/.session.md` to resume.
