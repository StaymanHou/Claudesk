---
stage: wbs
state: complete
updated: 2026-06-17
---

> Revision 2026-05-19: Added cross-window CC status indicator to Phase 2 headlines (WP9b probe + WP10b indicator WP). Phase 1 decomposition is unchanged.
> Revision 2026-05-22: Added two Phase 2 additions. (1) Replaced the original auto-resume bullet (WP11) with a three-branch smart auto-resume; added WP9c probe to confirm CC's resumability-per-cwd surface. (2) Added WP10c drive-mode selector + indicator. Phase 1 decomposition still unchanged.
> Revision 2026-06-15: Major Phase 1 rework following vision/research/arch revision (multi-window → tabbed-workspaces, DOM-only xterm, tab-shell substrate in Phase 1, thumbnail-rendering probe gating Phase 2). **Phase 1 is fully re-decomposed below.** Phases 2–4 stay at headline level. Phase 2 headlines updated: WP9b "probe: shared file vs Unix socket" is **resolved by research — Unix socket**; WP10b "cross-window CC status indicator" is **replaced** by three Phase 2 headlines (WP10b-filmstrip, WP10c-menubar, WP10d-pip, the last conditional on Phase 2 dogfooding).

# Work Breakdown Structure

**Cycle scope:** Phase 1 (Bare Shell + Tab Substrate PoC). Phases 2–4 are sketched at WP-headline level for visibility but **deliberately not decomposed** until Phase 1 completes — premature decomposition would force decisions about Phase 2/3 internals before Phase 1 surfaces what we actually learned.

## Phase 1: Bare Shell + Tab Substrate (PoC)

### Phase ordering rationale

Within Phase 1, the learning-sequence ordering applies as follows:

1. **Environment first (WP1)** — get a Tauri 2 dev environment running on host macOS before any product code. Catches Xcode CLT / rustup / node / signing gotchas at the cheapest moment.
2. **3rd-party probes before integrations (WP2, WP3)** — Claude Code's PTY behavior under host-driven byte injection (WP2) and Sublime Text's CLI shape across project styles (WP3). Both are probes, not build WPs.
3. **Thumbnail-rendering probe (WP4) before any thumbnail work** — its outcome decides whether Phase 2 ships live ~1 fps mirrors or status tiles. Phase 1 has no filmstrip in production, but the substrate is built (WP6) and Phase 2 must know the answer before committing to a filmstrip rendering strategy. WP4 runs in parallel with the other probes and the UI prototype.
4. **UI prototype before backend wiring (WP5)** — a static React prototype validates the WorkspaceList + Center Stage + Filmstrip layout in `pnpm tauri dev` mode before we wire the Rust IPC. Catches WKWebView CSS surprises early.
5. **Backend synchronous path (WP6, WP7, WP8)** — project config store, PTY-backed CC session via the `CcSession` trait, global shortcut for Sublime-pop. Each is a self-contained synchronous slice.
6. **No orchestration in Phase 1.** Phase 1 has one workspace open at a time; no async event bus beyond what Tauri IPC gives for free. Multi-workspace orchestration starts in Phase 2.

**Phase 1 → Phase 2 rationale:** Phase 1 ships when (a) we can launch a project and get CC running in <10s inside a workspace within the Claudesk window, (b) Sublime hotkey-pop works, and (c) the thumbnail-rendering probe has produced a documented pass/fail outcome that selects Phase 2's filmstrip rendering strategy. Phase 2 work depends on this decision plus dogfooding of the single-workspace shell.

### WP1: Tauri 2 project scaffold + dev environment ✅ SHIPPED 2026-06-16 (commit c50a785)

**Description:** Initialize the Tauri 2 + React 19 + TypeScript + Vite project. Get `pnpm tauri dev` running with an empty window on macOS. Establish lint/format/test baselines.

**Phase:** Phase 1
**Dependencies:** none
**Size:** S
**Tasks:**
- [x] Run `pnpm create tauri-app` with React+TypeScript+Vite template (**pre-risky-action checklist:** target dir is the existing repo root containing strategic docs `docs/product/`, `CLAUDE.md`, `_ref/`. Confirm git is clean. **Scaffold into a temporary sibling dir then merge** — do NOT run the scaffolder in-place. The `_ref/` symlink must survive)
- [x] Verify `pnpm tauri dev` opens an empty window on this macOS machine
- [x] Verify `pnpm tauri build` produces a `.app` bundle
- [x] Add ESLint + Prettier (frontend); confirm `cargo clippy` and `cargo fmt` pass on the scaffolded `src-tauri/`
- [x] Add Vitest scaffold (frontend) and a single passing test
- [x] Add a single passing `#[test]` in `src-tauri/`
- [x] Verify `.gitignore` still ignores `_ref/` after scaffold-merge
- [x] Commit baseline; `CHANGELOG.md` first entry deferred to first `feature-finalize` run

### WP2: Probe — Claude Code under host-driven PTY byte-injection ✅ SHIPPED 2026-06-16 (commit 875e161)

**Type:** probe
**Phase:** Phase 1
**Dependencies:** WP1 (need a Tauri dev env to test from; can be done in parallel using a standalone Rust binary if WP1 slips)
**Size:** S
**Learning objective:** Confirm that running `claude --dangerously-skip-permissions` inside a `portable-pty` pty from a Rust parent process produces a normal interactive TUI experience, including: (a) ANSI rendering is intact, (b) typed slash commands work when written as byte streams ending in `\n`, (c) `Ctrl+D` (byte `0x04`) cleanly terminates the session, (d) resize events propagate, (e) yolo-mode auth carries over from the host user's authenticated `claude` session.
**Timebox:** Half-day
**Success criterion:** A short writeup in `workflow/wip/wp2-cc-pty-probe.md` documenting: each of (a)–(e) confirmed or not, any surprises (TTY env var, SIGWINCH quirks, prompt-detection details), and the exact code shape that worked. The writeup is the deliverable; no production code lands.
**Tasks:**
- [x] Write a minimal Rust binary (or `examples/` in src-tauri) that spawns `claude` via `portable-pty`
- [x] Pipe its output to stdout; pipe stdin to its input (manual interactive verification)
- [x] Verify ANSI/color is rendered correctly when stdout is a terminal
- [x] Write a programmatic input variant: send `/help\n` and capture the response
- [x] Write a `Ctrl+D` test: confirm the child exits cleanly within a reasonable timeout
- [x] Test resize: send `pty.resize(cols, rows)` and confirm CC redraws
- [x] Record findings in the probe writeup

### WP3: Probe — Sublime Text / Sublime Merge CLI shapes across project styles ✅ SHIPPED 2026-06-16 (commit cc72c4d)

**Type:** probe
**Phase:** Phase 1
**Dependencies:** none
**Size:** XS
**Learning objective:** Pin down the exact `subl` and `smerge` invocations to use for: (a) a project root containing a `.sublime-project` file, (b) one that does not, (c) what happens with `--new-window` vs default, (d) whether `--background` is needed to avoid stealing focus from the Claudesk window, (e) how `open -a` behaves differently from direct `subl` invocation (for users without `subl` on PATH).
**Timebox:** 1 hour
**Success criterion:** A short table in `workflow/wip/wp3-sublime-cli-probe.md` mapping (project state × user intent) → exact command. Decision: do we require `subl`/`smerge` on PATH, or fall back to `open -a "Sublime Text" <path>` when absent?
**Tasks:**
- [x] Test `subl <dir>` (no project file) vs `subl --project <dir>/foo.sublime-project` (with file)
- [x] Test `subl --new-window` and `subl --background` combinations
- [x] Test `smerge <dir>` and `smerge --new-window <dir>`
- [x] Test `open -a "Sublime Text" <dir>` as a no-PATH fallback
- [x] Record findings in the probe writeup

### WP4: Probe — Thumbnail-rendering cost at N=8 workspaces (gates Phase 2 filmstrip strategy) ✅ SHIPPED 2026-06-17 (commit 3ae90eb)

> **Outcome: PASS → Phase 2 ships live ~1 fps mirrors via `serializeAsHTML()`.** Apple M4 / macOS 26.5.1: idle CPU 4.5% (<10%), active median 13.3% (<20%; p95 ~30% caveat), RAM 240 MB (<300), center frame p95 18ms / 0 dropped. Corrected a non-viable arch.md mechanism (off-screen-DOM-mirror). Full report: `docs/product/wp4-thumbnail-probe-outcome.md`.

**Type:** probe
**Phase:** Phase 1
**Dependencies:** WP1
**Size:** M
**Learning objective:** Validate whether Claudesk can sustain ~1 fps live terminal mirrors of 8 backgrounded xterm.js instances on real macOS hardware, alongside one foreground active xterm.js, while staying within performance targets. **The outcome gates Phase 2's filmstrip and PiP rendering strategy:** pass → live mirrors; fail → static status tiles in v1, live mirrors deferred to Future Possibility.
**Timebox:** 1–2 days
**Success criterion:** A report appended to `docs/product/arch.md` as a `### Phase 1 thumbnail-probe outcome` sub-section (or sibling doc) recording: measurements, pass/fail per metric, the resulting recommendation (live mirrors vs status tiles), and any architectural deltas that flow into Phase 2.

**Pass thresholds (proposed; finalised in the probe's plan):**
- CPU usage at idle (all 8 workspaces idle, no PTY output flowing): **<10%**
- CPU usage during one active CC session (center-stage receiving real output; 7 backgrounds idle): **<20%**
- RAM total: **<300 MB**
- Frame time on the center-stage workspace: **<16ms** (no visible jank from background-mirror work)

**Tasks:**
- [x] Build a synthetic harness page (independent of the main app shell): 8 xterm.js instances + 1 active xterm.js, DOM renderer only (no WebGL addon)
- [x] Capture a representative CC output stream (reconstructed from a real CC transcript → `cc-replay.cast`; + synthetic bracket fixture)
- [x] Pipe the canned stream into all 8 background xterms at realistic CC pacing
- [x] ~~Mount each background xterm full-size in an off-screen container; render the filmstrip thumbnail as a CSS-transformed (`scale(0.15)`) live mirror of that off-screen DOM~~ — **mechanism corrected** (non-viable: one parent per DOM node + xterm pauses off-viewport renderers). Validated path: `serializeAsHTML()` from the buffer into a `scale(0.15)` tile (two-arm comparison vs cloneNode; serialize won)
- [x] Throttle the mirror update rate to ~1 fps (RAF-based; pause when tab/window is not visible)
- [x] Make the center-stage xterm actively receive a separate fresh stream (real-time, not the canned one)
- [x] Measure CPU (`top`, no-sudo path), RAM (`footprint`), and frame time (rAF-delta) across a representative run on real WKWebView
- [x] Record raw measurements; compute pass/fail per metric
- [x] If FAIL on any metric: try cheaper alternatives — N/A, no metric hard-failed (active-CPU p95 caveat documented + mitigations listed instead)
- [x] Write the report and link it from `arch.md` and `roadmap.md` Phase 2

### WP5: Frontend UI prototype (no backend wiring) — tab-shell substrate from day one

**Description:** Build the static React UI: project picker (recents list + "Open Folder" button), 2-pane main view (left half: xterm.js component mounted with mock data; right half: placeholder card), and the **tab-shell substrate** (WorkspaceList + Center Stage + empty Filmstrip slot). No real IPC yet — use mock data so the layout/CSS work is settled before Rust wiring. In Phase 1 the WorkspaceList only ever holds one workspace, but the data shape and rendering structure are the Phase 2-ready shape.

**Phase:** Phase 1
**Dependencies:** WP1
**Size:** M
**Tasks:**
- [ ] Define the `Workspace` TypeScript type: `{ id: string, project_path: string, cc_session_id: string | null, status: 'idle'|'running'|'awaiting-input'|'unknown', display_name: string }`
- [ ] `WorkspaceList` React state (`useState<Workspace[]>` or Zustand store) — holds the array of all open workspaces; Phase 1 invariant: length ≤ 1
- [ ] Workspace component (one per array element): contains the 50/50 horizontal split (CSS grid; resizable divider deferred). Left half mounts `@xterm/xterm` with `@xterm/addon-fit` (NO `@xterm/addon-webgl`); right half is the placeholder card ("Coming in Phase 3")
- [ ] All workspaces stay mounted; non-focused ones use `display: none` (Phase 1: trivially N=1 so always visible, but the pattern is wired)
- [ ] Center Stage: renders the focused workspace at full size
- [ ] **Filmstrip slot:** empty container above (or below) the Center Stage, sized as if it could host tiles. Comment in code: "Phase 2 populates this." This reserves the layout real-estate so Phase 2 doesn't have to reshape the foundation.
- [ ] Project Picker component: list of recents (mocked), "Open Folder" button (mocked dialog), click handler stub that emits `open_workspace(path)`
- [ ] App shell: state machine for `picker` vs `workspace-open` view (Phase 1: workspace-open shows the single workspace; Phase 2: shows the multi-workspace UI)
- [ ] Mount xterm.js in the left half with mock data via direct `term.write("Hello, mock CC\r\n")`
- [ ] Verify in `pnpm tauri dev` on actual macOS (NOT just `vite dev` in a browser tab — WKWebView vs Chromium rendering differences must be caught here)
- [ ] Lint + tests pass

### WP6: Project config store (Rust backend)

**Description:** Implement the `projects.json` persistence layer in Rust. Tauri commands: `list_projects`, `add_project(path)`, `record_open(path)`, `remove_project(path)`. Atomic file writes (write to `.tmp`, rename) to survive crashes. Wire to the (now real) Project Picker UI.

**Phase:** Phase 1
**Dependencies:** WP1, WP5
**Size:** S
**Tasks:**
- [ ] Define the `Project` struct: `path: PathBuf`, `last_opened_at: i64 (unix ms)`, `display_name: Option<String>`, `default_drive_mode: Option<DriveMode>` (last field is Phase 2 but cheap to reserve now)
- [ ] Resolve app data dir via `tauri::path::app_data_dir()`; ensure dir exists on first run
- [ ] Implement read: JSON file → `Vec<Project>` (empty vec if file absent)
- [ ] Implement atomic write: serialize → `projects.json.tmp` → `rename`
- [ ] Wire Tauri commands: `list_projects`, `add_project`, `record_open`, `remove_project`
- [ ] Frontend: replace mocked picker data with real IPC calls
- [ ] Unit tests in `src-tauri/`: round-trip, atomic write under simulated crash, missing-file handling
- [ ] "Open Folder" dialog wired via `tauri-plugin-dialog`

### WP7: PtyCcSession — embedded CC terminal (real backend)

**Description:** Implement the `CcSession` trait and the `PtyCcSession` concrete impl in Rust using `tauri-plugin-pty` (which wraps `portable-pty`). Spawn `claude --dangerously-skip-permissions` with cwd = selected project path. Bridge bytes both ways with the xterm.js component from WP5. Handle resize, exit, kill. Apply findings from WP2.

**Phase:** Phase 1
**Dependencies:** WP1, WP2 (probe must complete first), WP5, WP6
**Size:** M
**Tasks:**
- [ ] Add `tauri-plugin-pty` to `src-tauri/Cargo.toml`; register in builder
- [ ] Add `tauri-pty` to frontend `package.json`
- [ ] Define `CcSession` trait: `send_input(bytes)`, `resize(cols, rows)`, `kill()`, `wait_for_exit()`, output via Tauri event stream. Forward-compat: leave room for `state_events()` and `recycle()` methods in Phase 2.
- [ ] Implement `PtyCcSession`: holds the pty handle + reader task + writer task
- [ ] Tauri commands: `cc_spawn(project_path) -> session_id`, `cc_input(session_id, bytes)`, `cc_resize(session_id, cols, rows)`, `cc_kill(session_id)`
- [ ] Tauri event: `cc-output-<session_id>` streaming output bytes to frontend
- [ ] Frontend: on workspace open → call `cc_spawn` → connect xterm.js `onData` to `cc_input`, `term.write` to `cc-output-*` events, fit-addon resize to `cc_resize`. The new Workspace record is added to WorkspaceList with the returned session id.
- [ ] Lifecycle: window close → for each workspace in WorkspaceList, `cc_kill`; CC exit → frontend shows "session ended" overlay with re-launch button (per workspace)
- [ ] Manual test: open a project, run a real CC session, type slash commands, exit via Ctrl+D, re-launch

### WP8: Global hotkey for Sublime Text pop

**Description:** Register a configurable global hotkey that opens Sublime Text at the **focused workspace's** project path. Single hotkey, hardcoded default in Phase 1 (settings UI lands in Phase 4). Surface a macOS Accessibility permission flow on first launch.

**Phase:** Phase 1
**Dependencies:** WP1, WP3 (probe must complete), WP6
**Size:** S
**Tasks:**
- [ ] Add `tauri-plugin-global-shortcut`; add required permissions to `capabilities/`
- [ ] Define default hotkey (e.g., `Cmd+Shift+E`); document it
- [ ] On app start: register hotkey; handler reads **focused workspace's** project path from app state (Phase 1: there's only one workspace ever, so the read is trivial; the API is workspace-aware for Phase 2)
- [ ] Implement Sublime launcher in Rust using `tauri-plugin-shell`, applying WP3 decision (subl + --project when applicable; `open -a` fallback)
- [ ] On macOS: detect Accessibility permission status; show a one-time onboarding dialog if missing, linking to System Settings → Privacy & Security → Accessibility
- [ ] Manual test: open project → press hotkey → Sublime Text opens at project root
- [ ] Manual test: hotkey when no workspace is open → no-op (or surface a tray notification)

### WP9: Phase 1 polish + exit-criteria verification

**Description:** Final pass on Phase 1: end-to-end timing check (<10s from picker click to ready CC), edge cases (CC binary missing, project path no longer exists, permission denied), basic error handling, README placeholder. Confirm WP4 thumbnail-probe report is written and linked. NOT a release — Phase 4 covers distribution.

**Phase:** Phase 1
**Dependencies:** WP4, WP6, WP7, WP8
**Size:** S
**Tasks:**
- [ ] Time-to-productive measurement: cold launch → picker click → CC ready inside a workspace. Target <10s. Record in `workflow/wip/wp9-timing.md`
- [ ] Error: `claude` not on PATH → friendly message in xterm.js pane with link to install docs
- [ ] Error: project path deleted between sessions → remove from picker on next launch with toast
- [ ] Error: Accessibility permission denied → hotkey no-op + non-fatal warning
- [ ] Verify the WP4 thumbnail-probe report is appended/linked from `arch.md` and `roadmap.md` Phase 2; verify its recommendation (live mirrors vs status tiles) is recorded
- [ ] Verify the tab-shell substrate components (WorkspaceList, Center Stage, empty Filmstrip slot) are in place even though Phase 1 only ever opens one workspace
- [ ] Basic README in repo root (just enough for the author; full docs in Phase 4)
- [ ] Dogfood for 3+ days on real projects before marking complete

## Phase 1 critical path

```
WP1 ──► WP2 ──┐
       ├─► WP3 (parallel; XS, can also start without WP1)
       ├─► WP4 (probe — runs in parallel with WP5; gates Phase 2, not Phase 1 build)
       └─► WP5 ──► WP6 ──► WP7 ──► WP9
                                    ▲
              WP3 ──► WP8 ──────────┘
              WP2 ─────► WP7
```

- **Critical path:** WP1 → WP5 → WP6 → WP7 → WP9
- **Parallelizable:** WP2 (probe), WP3 (probe), and WP4 (probe) can all start as soon as WP1 unblocks them; WP3 is independent enough to even start in parallel with WP1 if a Sublime install is available. WP4 is independent of WP2/WP3.
- **WP2 gates WP7.** Do not start WP7 PTY work before WP2 probe is done — the probe's findings will shape the `CcSession` trait's exact shape (e.g., whether resize needs explicit SIGWINCH, whether we need to set `TERM=xterm-256color`).
- **WP4 does NOT gate any Phase 1 build WP.** It gates Phase 2's filmstrip rendering strategy. WP4 must complete before WP9 (which verifies the report exists and is linked).

## Phase 2: Stateful CC Controller + Multi-Workspace + Status Surfaces (NOT decomposed)

Sketched at WP headline only — full decomposition deferred until Phase 1 ships and dogfooding surfaces real constraints.

- **WP10: Probe — `workflow/.session.md` write semantics** (probe): confirm whether `/session-pause` writes the file atomically or in stages; what marker indicates "done writing"; how `/session-resume` reads it.
- **WP10b: Probe — CC hook channel for idle/running/awaiting-input detection** (probe): confirm the exact payload shape and timing of `UserPromptSubmit` / `Stop` / `Notification` hook events; verify a Claudesk-installed hook can coexist with `claude-time`'s hook entries in `~/.claude/settings.json`; verify the events fire reliably on real interactive sessions (slash commands, multi-turn conversations, tool-use loops, permission prompts). **Note (2026-06-15):** the prior "shared file vs Unix socket" sub-question of this probe is **RESOLVED by research — Unix socket from day one** (three concurrent consumers force the decision). The probe still verifies hook firing reliability but no longer decides the transport.
- **WP10c: Probe — CC's resumable-conversation surface per project dir** (probe): confirm the exact CC CLI shape for "is there a resumable conversation for this cwd". Test cases: (a) prior session cleanly exited via Ctrl+D, (b) prior session killed by SIGKILL, (c) prior session ended after `/session-pause` wrote `.session.md`, (d) project dir never had a CC session. For each, verify whether the answer is keyed by cwd or by session-id. Required by WP14.
- **WP11: WorkflowStateWatcher** (notify-based file watcher for `workflow/.session.md`; debounced events)
- **WP12: Status Broadcaster + Unix-socket hook channel** (Rust core: open socket on launch, accept JSON lines from CC hook scripts, normalize to `WorkspaceStatusUpdate`, emit via Tauri event channel to all subscribed webviews). Includes the hook-installer routine (write entry into `~/.claude/settings.json` on first launch, with idempotency check + uninstall on app removal), the small POSIX shell hook script (no runtime deps), and the heartbeat/staleness handling. Depends on WP10b.
- **WP13: Multi-workspace UX** (extend WorkspaceList to length > 1; opening a project adds a new workspace; switching center stage is `display: none` toggling; existing workspaces stay mounted)
- **WP14: Smart auto-resume on workspace open** — three-branch decision tree per arch §C. Depends on WP10c.
- **WP15: Drive-mode selector + indicator (header)** — per arch §D. Extends `Project` struct (already reserved in WP6 — just populate it now); Tauri commands `get_drive_mode` / `set_drive_mode`; React header component on the center-stage workspace.
- **WP16: Filmstrip + Center Stage (rendering)** — populate the empty Filmstrip slot from WP5. **Rendering mode determined by WP4's probe report:** live ~1 fps mirrors OR static status tiles. Includes filmstrip-collapse toggle (collapsed = mini status tiles only).
- **WP17: Menu-bar status item** (Tauri `TrayIconBuilder` + `tauri-plugin-positioner` with `tray-icon` feature + popover webview). Aggregate status dot (green/blue/amber); left-click → popover; right-click → native menu. **Ships BEFORE WP18.**
- **WP18: Menu-bar dogfooding gate** (1-week minimum). If menu-bar alone covers the "Claudesk hidden" case sufficiently, **WP19 (PiP) defers to Phase 4**. Otherwise, proceed to WP19.
- **WP19: PiP NSPanel** (conditional on WP18 outcome) — `tauri-nspanel` v2.1, `PanelBuilder` with `no_activate(true)` + `PanelLevel::Floating` + collection behavior `CanJoinAllSpaces | FullScreenAuxiliary | Stationary`. User-toggled, display-only.
- **WP20: SkillRegistry** (scan `~/.claude/skills/` + `<proj>/.claude/skills/`; expose to UI)
- **WP21: Skill buttons in UI** (toolbar or slide-in drawer on the center-stage workspace)
- **WP22: Recycle Session state machine** (Rust state machine: `Pausing → WaitingForSessionFile → SendingCtrlD → WaitingForExit → Respawning → Resuming`; UI button; cancel handling). Uses the Status Broadcaster (WP12) to detect when CC has actually exited and when the fresh CC is idle.
- **WP23: Hotkey for Sublime Merge pop**
- **WP24: Phase 2 polish + dogfood + exit-criteria verification** (all six vision success metrics confirmed, including the Claudesk-not-in-focus metric)

## Phase 3: Lite Editor + Diff Viewer (NOT decomposed)

Sketched only.

- **WP25: Probe — Monaco vs CodeMirror 6 for Sublime-feature coverage**
- **WP26: Lite editor integration**
- **WP27: Git diff viewer (using `git2` crate)**
- **WP28: Right-half panel host with swappable tabs (editor / diff / ad-hoc terminal)** — per-workspace, not global
- **WP29: Sublime hotkey-pop remains as escape hatch — verify still works**
- **WP30: Phase 3 polish + exit-criteria verification**

## Phase 4: Polish & Open-Source Release (NOT decomposed)

Sketched only.

- **WP31: Settings UI** (project list management, hotkeys, claude CLI args, menu-bar / PiP visibility toggles)
- **WP32: PiP NSPanel (if deferred from Phase 2 per WP18)**
- **WP33: Code-signing + notarization strategy decided and applied** (probe-flavored)
- **WP34: README + setup docs** (workflow-system-assumed audience)
- **WP35: Open-source license + public repo**
- **WP36: Release dry-run + dogfood + cycle close**

## SURFACE-IN history

(none yet)
