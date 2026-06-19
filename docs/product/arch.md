---
stage: arch
state: complete
updated: 2026-06-19
---

> Revision 2026-05-19: Added cross-window CC status indicator (Phase 2) — see "Phase 2 / Phase 3 forward-look" section. No Phase 1 components affected; the indicator is a Phase 2 forward-look only.
> Revision 2026-05-22: Added two Phase 2 forward-look sub-sections — Smart auto-resume on project open (three-branch decision tree replacing the original "two-branch heuristic") and Drive-mode selector + indicator (header chrome + WIP-frontmatter persistence). Both are Phase 2 only; Phase 1 components unaffected.
> Revision 2026-06-15: Major revision following the vision pivot (multi-window → single-window with tabbed workspaces) and the research findings that resolved four open design questions. **Phase 1 now ships the tab-shell substrate** (single-workspace use is N=1 of the tab model) and a new **thumbnail-rendering probe** that gates Phase 2's filmstrip-rendering strategy. **xterm.js: DOM renderer only** — WebGL addon dropped after the WebGL-context cap finding. The prior "Phase 2 cross-window CC status indicator" sub-section is **replaced** by three status surfaces (filmstrip / menu-bar / PiP) coordinated by a single Rust-side status broadcaster fed by a Unix-socket hook channel. The earlier "WP9b probe" (shared file vs Unix socket) is resolved: socket wins. Phase 1 component diagram and data-flow tables updated below; Phase 2 forward-look sub-sections rewritten.
> Revision 2026-06-19 (WP7 shipped, commit `50ca322`): The `CcSession` trait + `PtyCcSession` impl now exist as built. Three as-built deltas from the design above: (1) **raw `portable-pty` behind our own 4 Tauri commands** (`cc_spawn`/`cc_input`/`cc_resize`/`cc_kill`), NOT the `tauri-plugin-pty` JS bridge — keeps `CcSession` the sole "drive CC" seam (the plugin's JS `spawn()` would compete with it). (2) **Output/exit are event streams, not trait methods**: `on_output(callback)` is realized as the `cc-output-<sid>` Tauri event and `wait_for_exit()` as the `cc-exit-<sid>` event (emitted on PTY EOF); the trait's concrete methods are `send_input`/`resize`/`kill`. (3) **PTY bytes cross IPC as base64 strings** (both directions) — `Vec<u8>` serializes as a heavy JSON number array, base64 is ~4× cheaper. Also as-built: spawn sets `TERM=xterm-256color`+`COLORTERM=truecolor` explicitly (the WP2-flagged no-inherited-TERM-under-Tauri case — confirmed needed), `kill()` is `/exit\r`-then-SIGKILL, and window-close reaping is `WindowEvent::CloseRequested` → `SessionRegistry::kill_all`. xterm wiring needed rAF-deferred fit/resize + explicit `term.focus()` (mount + post-spawn + click) for correct sizing/input under WKWebView (verify-human round-1 finding).

# Architecture

**Phase:** Phase 1 (Bare Shell + Tab Substrate). YAGNI applied — only the components needed to satisfy Phase 1 exit criteria are designed in detail. Phase 1 introduces the **tab-shell substrate** even though only one workspace is ever open in Phase 1, because Phase 2's filmstrip / PiP / menu-bar surfaces all assume the substrate exists. Phase 2 (stateful CC controller, file-watcher, status broadcaster, skill registry, Recycle Session, three status surfaces) and Phase 3 (lite editor, diff viewer, right-half panel swap) are explicitly identified as **extension points**, not built.

### Tech Stack

- **Language (backend):** Rust (stable, ≥1.77) — required by Tauri 2; owns the CC process, PTY, filesystem, global shortcuts, project config persistence, **status broadcaster (Phase 2)**, **Unix-socket hook listener (Phase 2)**. Rust is also a deliberate fit for Phase 2's stateful-controller work (process lifecycle, file watching, async I/O).
- **Language (frontend):** TypeScript + React 19 — community consensus for Tauri 2 in 2026 (matches the Terax reference project); the lite-editor work in Phase 3 (Monaco or CodeMirror 6) needs this stack regardless, so we pay the cost once.
- **Build / bundler:** Vite — fast HMR for dev; Tauri's `beforeDevCommand` / `beforeBuildCommand` hooks plug into Vite's CLI cleanly.
- **Framework:** Tauri 2 (2.9.x line) — native WebView (WKWebView on macOS); ~3MB bundle; Rust backend with IPC to a web frontend. **Single `WebviewWindow`**, all workspaces are React components in one webview (research decision: no multi-webview).
- **Embedded terminal:**
  - Backend: `tauri-plugin-pty` (wraps `portable-pty`) — registered in the Tauri builder; spawns `claude` in a real pty inside the Rust core. **Course-correction from roadmap.md text** (which said "node-pty via Tauri sidecar pattern"): node-pty would require shipping a Node runtime in the bundle, defeating the bundle-size advantage. portable-pty runs natively in Rust.
  - Frontend: `@xterm/xterm` + `@xterm/addon-fit` — render the terminal, fit to container. **DOM renderer only — `@xterm/addon-webgl` is NOT used** (2026-06-15 decision; see Key Decisions below). The 2026 DOM renderer is fast enough for the foreground workspace.
  - Bridge: `tauri-pty` (JS bindings shipped with `tauri-plugin-pty`) — `spawn()` returns a handle whose `onData` / `write` / `resize` mirror node-pty's API closely enough that xterm.js wiring is straight-line.
- **Sublime-pop hotkey:** an **in-app** keybinding — a webview `keydown` handler (`⌘⇧E`) owned by the focused workspace. NOT an OS-global shortcut, so **no `tauri-plugin-global-shortcut` and no macOS Accessibility permission** are required. (As-built 2026-06-19, WP8: the OS-global approach was built then rejected at verify-human in favor of in-app — see WP8 in the `wbs.md` archive.)
- **External tools invoked via shell:** `subl` (Sublime Text), `smerge` (Sublime Merge — Phase 2). Claudesk launches `subl` from the backend `sublime_open` command via **`std::process::Command`** (consistent with `cc_session` spawning `claude`; the original `tauri-plugin-shell` plan was dropped as-built — the launch is backend code, not a frontend-callable shell). No embedding.
- **Persistence:** flat JSON file at `~/Library/Application Support/Claudesk/projects.json` via `tauri-plugin-fs` + `path::app_data_dir()`. No DB; project list is a list of `{path, last_opened_at, display_name?, default_drive_mode?}` records. Matches the "no per-project config burden" vision principle (no `.claudesk.json` per repo).
- **Database:** none — Phase 1 has no relational data, and the only durable state is the project list (handled above).
- **Infrastructure:** none — this is a single-user desktop app; no servers, no cloud, no telemetry.

**Phase 2 additions (forward-look, not built in Phase 1):**
- `tauri-nspanel` v2.1 — `NSPanel` wrapper for the PiP window (display-only floating panel, all-Spaces, fullscreen-aux, non-activating).
- `tauri-plugin-positioner` (with `tray-icon` feature) — positions the menu-bar popover under the tray icon.
- `tauri-plugin-fs-watch` / `notify` — debounced file-watcher for `workflow/.session.md`.

### Dev Environment

**Host-based (opt-out — justification required).**

This is a desktop application targeting macOS. Tauri development requires direct access to the host's WKWebView, macOS code-signing chain (for later phases), and native windowing — all of which a Docker container on macOS cannot provide. The standard Tauri 2 toolchain runs natively on macOS via `rustup` + `node`. Industry practice for Tauri development is host-based; Dockerizing it would add friction without benefit.

**Toolchain:**
- Rust (stable, ≥1.77) via `rustup`
- Node 20 LTS or newer via `nvm` / `fnm` / system install
- Xcode Command Line Tools (`xcode-select --install`) — provides the C compiler, `codesign`, and macOS SDK headers
- `pnpm` (preferred) or `npm` for frontend deps
- Sublime Text installed locally (Sublime Merge too, for Phase 2). `subl`/`smerge` on `PATH` is **optional** — Claudesk discovers the binary via PATH → `.app` bundle (`/Applications/Sublime Text.app/.../bin/subl`) → `open -a` fallback (WP3 probe), so the maintainer's no-symlink setup works out of the box. Claudesk invokes Sublime but does NOT install it.
- Claude Code CLI installed and authenticated independently (`claude` on `PATH`)

**First-run bootstrap:**
```bash
# clone, then in repo root:
pnpm install            # frontend deps
cd src-tauri && cargo fetch   # backend deps
cd ..
pnpm tauri dev          # development run (Vite + Tauri together)
```

**Build commands during dev:**
- `pnpm tauri dev` — full app, live reload
- `pnpm tauri build` — production .app bundle
- `cargo test` (inside `src-tauri/`) — Rust unit tests
- `pnpm test` — frontend tests (Vitest)
- Lint: `pnpm lint` (eslint), `cargo clippy` (Rust)

### System Design

```mermaid
flowchart LR
  subgraph TauriApp["Tauri App (single macOS window, single WebviewWindow)"]
    subgraph Frontend["Frontend (React + xterm.js + TypeScript)"]
      Picker[Project Picker UI]
      WorkspaceList["WorkspaceList (React state, all workspaces stay mounted)"]
      CenterStage["Center Stage (focused workspace: xterm.js DOM renderer)"]
      Filmstrip["Filmstrip (P1: empty placeholder; P2: live tiles or status tiles)"]
      RightPlaceholder[Right half: placeholder]
      Picker -.click project.-> WorkspaceList
      WorkspaceList --> CenterStage
      WorkspaceList --> Filmstrip
    end

    subgraph Backend["Backend (Rust core, src-tauri)"]
      ConfigStore[Project Config Store - projects.json]
      CcSessionTrait[CcSession trait - swappable impl]
      PtyImpl[PtyCcSession - portable-pty]
      SublimeOpen[sublime_open command - find_subl + std::process::Command]
    end

    Frontend <-- Tauri IPC --> Backend
    CcSessionTrait <--> PtyImpl
  end

  PtyImpl -- spawns --> ClaudeCLI["claude (CC CLI in PTY)"]
  SublimeToolbar["SublimeToolbar - in-app ⌘⇧E + button (frontend)"] -- "invoke(sublime_open)" --> SublimeOpen
  SublimeOpen -- spawns --> Sublime[Sublime Text]
  ConfigStore -- read/write --> AppDataDir["~/Library/Application Support/Claudesk/projects.json"]
```

**Component responsibilities:**

| Component | Layer | Responsibility |
|-----------|-------|---------------|
| Project Picker UI | Frontend | List recents from config; "Open Folder" via Tauri dialog; emit `open_workspace(path)` (Phase 1: opens the single workspace; Phase 2: opens a new workspace into the list) |
| **WorkspaceList** | Frontend | Authoritative array of `Workspace { id, project_path, cc_session_id, status, xterm_ref }`. All workspaces stay mounted; switching center stage is `display: none` / `display: block`, never unmount. Phase 1: length always 1. Phase 2: length N. |
| **Center Stage** | Frontend | Renders the focused workspace at full size. Hosts the xterm.js terminal pane (left) and the right-half placeholder. |
| **Filmstrip** | Frontend | Phase 1: empty placeholder container (so Phase 2 doesn't have to introduce a new layout slot). Phase 2: one tile per non-focused workspace (live ~1 fps mirror OR static status tile, per probe outcome). |
| Right pane placeholder | Frontend | Static "Coming in Phase 3" panel; reserved real-estate inside each workspace. |
| Project Config Store | Backend | Read/write `projects.json`; debounced writes on update. |
| `CcSession` trait | Backend | **Forward-compat seam.** Abstract interface: `send_input(bytes)`, `on_output(callback)`, `resize(cols, rows)`, `wait_for_exit()`, `kill()`. Phase 1 has one impl (`PtyCcSession`); Phase 2 will add `recycle()`, `state_events()`, and per-session status fan-out. Future could add an `SdkCcSession` if we ever migrate to the Agent SDK. |
| `PtyCcSession` | Backend | Concrete impl using `portable-pty` to spawn `claude --dangerously-skip-permissions` with the project dir as cwd; bridges to frontend xterm.js via Tauri events. |
| `sublime` module / `sublime_open` command | Backend | Resolves `subl` (PATH → `.app` bundle → `open -a`, per WP3) and spawns `subl <path>` via `std::process::Command` (steal focus; never `--project`/`--new-window`). Frontend-invoked. `smerge` is Phase 2. |
| In-app Sublime hotkey + button | Frontend | `SublimeToolbar` in each workspace's right panel: an "Open in Sublime" button (labeled `⌘⇧E`) and a `keydown` handler bound only on the focused workspace. Both `invoke("sublime_open", {projectPath})`. No OS-global shortcut, no Accessibility permission. |

**Forward-compatibility seams (NOT built in Phase 1, only reserved):**

- `CcSession` trait is the seam for Phase 2's stateful controller (extra methods for ready-state detection, recycle, file-watcher integration) and any future Agent-SDK-backed implementation.
- **WorkspaceList holds many workspaces in Phase 2; in Phase 1 it always holds exactly one.** The data shape is the same; the only Phase 1 invariant is N=1 enforced by the picker's "open project" handler.
- The Filmstrip slot exists in Phase 1 layout but is empty — Phase 2 populates it.
- A `WorkflowStateWatcher` module is *not* created in Phase 1 — Phase 2.
- A `StatusBroadcaster` module is *not* created in Phase 1 — Phase 2.
- A `SkillRegistry` module is *not* created in Phase 1 — Phase 2.
- The right pane inside each workspace is a placeholder component; Phase 3 will replace it with a tabbed/swappable panel host. No premature panel-swap abstraction in Phase 1.

### Phase 1 thumbnail-rendering probe (gating for Phase 2)

A new Phase 1 work package: a synthetic harness measuring whether ~1 fps live terminal mirrors are cheap enough at N=8 workspaces. **Pass → Phase 2 ships live mirrors. Fail → Phase 2 ships status tiles in v1**, leave live mirrors as a Future Possibility.

**Harness shape:**
- 8 xterm.js instances, DOM renderer only, full-size rendering.
- Each xterm fed a representative CC output stream (canned recording of a typical Claude Code session, looped).
- Filmstrip thumbnails are `scale(0.15)` CSS-transformed tiles mirroring each background terminal, throttled to ~1 fps.
- One workspace simultaneously active (rendering normally at full speed) to simulate the center-stage workload.

> **CORRECTION (2026-06-17, from WP4 outcome).** The original text above said "live mirrors of those **off-screen** full-size xterms." That mechanism is **non-viable** and was corrected during WP4 (see `wp4-thumbnail-probe-outcome.md`): (1) a DOM node has exactly one parent, so one xterm subtree cannot appear in both an off-screen container and a filmstrip tile; (2) xterm.js's `RenderService` registers an `IntersectionObserver({threshold:0})` that **pauses the renderer for off-viewport terminals** — so an off-screen (`left:-99999px`) terminal's DOM goes stale and there is nothing live to mirror. The viable mechanism, validated by the probe, is **`@xterm/addon-serialize` `serializeAsHTML()` from the buffer** (the buffer updates via `write()` even while the renderer is paused), rendered into the tile at ~1 fps. Background workspaces are deliberately kept off-viewport so the renderer pauses for free; the serialized snapshot stays current. (`cloneNode`-per-frame of the live DOM also works but is more expensive and forces backgrounds on-viewport — rejected.)

**Measurements:**
- CPU usage at idle (all 8 workspaces "idle"; no PTY output flowing): target **<10%**.
- CPU usage during one active CC session (center-stage workspace receiving real output; 7 backgrounds idle): target **<20%**.
- RAM total: target **<300 MB**.
- Frame time on the center-stage workspace: target **<16ms** (no visible jank from background-mirror work).

Thresholds above are the proposed defaults. The probe's own implementation plan (when picked up as a Phase 1 WP) finalises them.

**Output:** a one-page report. **Decided as a sibling doc:** [`wp4-thumbnail-probe-outcome.md`](./wp4-thumbnail-probe-outcome.md) (kept separate to avoid bloating this file).

> **OUTCOME (2026-06-17): PASS → Phase 2 ships live ~1 fps mirrors, using `serializeAsHTML()`.** On Apple M4 / macOS 26.5.1 against a real-CC-transcript-reconstructed fixture: idle webview CPU 4.5% (<10% ✅), active median 13.3% (<20% ✅; p95 ~30% on bursts — caveat + mitigations in the report), RAM 240 MB (<300 ✅), center frame time p95 18 ms with **0 dropped frames** (✅). The `serialize` arm beat `cloneNode`. Full measurements, arm comparison, caveats (frame-time measured in Chromium; CPU via `top`), and Phase 2 deltas → `wp4-thumbnail-probe-outcome.md`.

### Data Flow

**Phase 1 happy path — project open:**

1. User clicks a project in the picker (or selects "Open Folder").
2. Frontend invokes Tauri command `open_workspace(path)`.
3. Backend updates `projects.json` (`last_opened_at`, optionally adds new project).
4. Backend instantiates a `PtyCcSession` with cwd=`path`, command=`claude`, args=`["--dangerously-skip-permissions"]`.
5. Backend emits `cc-session-ready` event with a session handle ID.
6. Frontend receives the event, **adds a Workspace record to `WorkspaceList`** (Phase 1: list now has length 1), mounts xterm.js inside the center stage, subscribes to `cc-output-<sid>` events, wires xterm.js `onData` → Tauri command `cc-input(sid, bytes)`, and `xterm fit addon resize` → `cc-resize(sid, cols, rows)`.
7. CC's TUI renders inside xterm.js. User interacts as in a normal terminal.

**Phase 1 happy path — Sublime hotkey/button (in-app):**

1. With Claudesk focused, the user presses `⌘⇧E` (an in-app webview keybinding) OR clicks the "Open in Sublime" button in the focused workspace's right-panel toolbar.
2. The focused workspace's `SublimeToolbar` reads its own `project_path` (frontend React state) and calls `invoke("sublime_open", { projectPath })`.
3. The backend `sublime_open` command resolves `subl` (PATH → `.app` bundle → `open -a`) and spawns `subl <path>` via `std::process::Command` (`open -a "Sublime Text" <path>` on the fallback). Never `--project`/`--new-window` (WP3).
4. macOS focuses the Sublime Text window (steal-focus is intended — the user explicitly asked for Sublime).
5. `⌘⇧E` does nothing when Claudesk is not the focused app (in-app keybinding, not OS-global) — no Accessibility permission needed.

**Phase 1 shutdown / window close:**

1. Frontend signals `close_workspace` (or window close event).
2. For each workspace in `WorkspaceList`, backend calls `CcSession::kill()` — sends SIGTERM to the CC process, then SIGKILL after timeout.
3. Backend persists `projects.json` final state.
4. App quits.

### Key Decisions

- **Tauri over Electron.** Aligned with vision principle 1 ("lite over featureful"). Research established 25x smaller bundle, ~50% lower RAM, faster startup. The "less mature packaging ecosystem" tradeoff is acceptable for a single-user tool.
- **`tauri-plugin-pty` / `portable-pty` over node-pty + sidecar.** node-pty requires a Node runtime; portable-pty runs natively in Rust. Bundle-size and architectural cleanliness win.
- **PTY byte-injection over Agent SDK for v1.** The vision requires the familiar interactive CC TUI in the foreground workspace. PTY byte-injection means we treat Claudesk as a legitimate terminal-front-end — typing slash commands as a human would. We avoid the "PTY scraping" anti-pattern (parsing CC's output text to infer state) by using **file watching** (Phase 2) for state detection. The `CcSession` trait is the seam that lets us swap to an Agent SDK backend later without UI changes.
- **Single window, many workspaces (NEW 2026-06-15).** Reversed from "one project per window." Multiple projects = workspaces inside one window, switched via filmstrip thumbnails (Phase 2). Aligned with the revised vision and the way the user actually juggles 3–4 projects.
- **xterm.js DOM renderer only — no WebGL (NEW 2026-06-15).** Research established the browser-wide WebGL-context cap of ~16/page. With a tab shell hosting many xterm instances, the WebGL renderer either hits the cap or forces a swap-on-focus complexity that gives marginal benefit on top of the modern DOM renderer. Verdict: DOM-only is simpler and good enough for the foreground workspace. If a single-workspace user one day proves the DOM renderer can't keep up, we re-add the WebGL addon for the center stage only — a one-line addon load. Decision is reversible.
- **Single `WebviewWindow`, no multi-webview (NEW 2026-06-15).** Tauri 2's multi-webview API is `unstable`-flagged and offers webview isolation we don't need (all workspaces share Claudesk's trust boundary). React-managed tabs in one webview is the stable choice.
- **Tab-shell substrate ships in Phase 1 (NEW 2026-06-15).** The WorkspaceList + Center Stage + Filmstrip slot are built in Phase 1 even though Phase 1 only ever opens one workspace. This is "design for N=1 with N>1 in mind" — Phase 2 plugs into existing structure rather than reshaping the foundation.
- **Thumbnail-rendering probe gates Phase 2's filmstrip + PiP rendering (NEW 2026-06-15).** Decision recorded in the dedicated section above. Probe pass → live ~1 fps mirrors. Probe fail → status tiles in v1.
- **Menu-bar status item ships BEFORE PiP in Phase 2 (NEW 2026-06-15).** Cheaper to build, covers the "Claudesk hidden" case PiP can't, and includes a dogfooding gate that may defer PiP to Phase 4 entirely.
- **CC hook channel via Unix socket, not shared file (NEW 2026-06-15).** Resolves the previously deferred WP9b probe. With three concurrent status-surface consumers (filmstrip / menu-bar / PiP), Unix-socket multi-consumer concurrency wins decisively over shared-file locking and debounce-write juggling.
- **Flat JSON for project list.** No SQLite, no app-managed DB. The list is ≤100 entries with read-on-open and write-on-update; JSON is appropriate.
- **No per-project config file in the project itself.** Project list lives in `~/Library/Application Support/...`, not in `.claudesk.json` files inside each repo. Aligned with vision principle 5.
- **Host-based dev environment, not Docker.** Tauri targets host WKWebView and native windowing; Docker on macOS cannot provide them. Industry standard for Tauri.
- **`--dangerously-skip-permissions` (yolo mode) by default.** Vision explicit. A Phase 4 setting will let users opt out.
- **Sublime hotkey is in-app, not OS-global (revised 2026-06-19, WP8).** The original design used `tauri-plugin-global-shortcut` (which needs a macOS Accessibility grant + first-launch onboarding flow). That was built then rejected at verify-human — the operator clarified the hotkey should fire only while Claudesk is focused, not system-wide. As-built: a webview `⌘⇧E` `keydown` handler owned by the focused workspace, plus a right-panel "Open in Sublime" button. No `tauri-plugin-global-shortcut`, no Accessibility permission, no onboarding dialog.

### Phase 2 forward-look (informational, not built)

The Phase 2 forward-look is reorganised around four architectural deltas: (a) **status broadcaster** as the central nervous system, (b) **three status surfaces** that subscribe to it, (c) **smart auto-resume on workspace open**, (d) **drive-mode selector**. The prior 2026-05-19 "cross-window CC status indicator" sub-section is fully replaced by (a) + (b). The 2026-05-22 "smart auto-resume" and "drive-mode selector" sub-sections are preserved in spirit but updated for the workspace-not-window model.

#### A. Status broadcaster + Unix-socket hook channel

```mermaid
flowchart LR
  CcHook["CC hook handler (~/.claude/settings.json)"] -- JSON line --> UnixSocket["Unix socket (Claudesk-owned)"]
  UnixSocket --> Broadcaster["Status Broadcaster (Rust core)"]
  Broadcaster -- "WorkspaceStatusUpdate event" --> MainWebview["Main webview (filmstrip)"]
  Broadcaster -- "WorkspaceStatusUpdate event" --> PiPWebview["PiP webview (tauri-nspanel)"]
  Broadcaster -- "WorkspaceStatusUpdate event" --> TrayWebview["Menu-bar popover webview"]
```

- **CC hook registration.** On first launch (or via a Phase 4 setting), Claudesk installs entries in `~/.claude/settings.json`'s `hooks` block for `UserPromptSubmit` (→ "running"), `Stop` (→ "idle"), and `Notification` (→ "awaiting-input"). The hook is a tiny POSIX shell script (no runtime deps) that writes a JSON line — `{ event, pid, cwd, timestamp }` — to Claudesk's Unix socket at a stable path (e.g., `~/Library/Application Support/Claudesk/hook.sock`).
- **Unix socket vs shared file.** Decided: socket. Claudesk's Rust core opens the socket on app launch and accepts a stream of JSON lines from any CC instance whose `cwd` matches a known workspace's project path. No file lock contention, no debounce-write juggling, no torn reads. The hook script is small enough to write the socket synchronously in <1ms; CC does not block waiting for the hook.
- **Status broadcaster.** Normalizes incoming hook events into `WorkspaceStatusUpdate { workspace_id, state: Idle|Running|AwaitingInput, last_event_at, last_output_snippet? }` and emits via Tauri's event channel (`app_handle.emit("workspace-status", ...)`). All three webviews subscribe; they re-render their local UI on each event.
- **Coexistence with `claude-time`.** `claude-time` (from the `my-claude-code-customization` project) already taps the same hook events. Hook entries in `~/.claude/settings.json` are a JSON array — both subscribers register side-by-side; no need to share a script.
- **Failure mode.** If the socket is missing or the hook script can't connect, the workspace status defaults to `Unknown`. Claudesk does not infer state from PTY output; an unknown badge is honest, a guessed badge is not.

#### B. Three status surfaces (subscribers)

**B.1 — Filmstrip + Center Stage (in-window).**
- Lives in the main React webview. Subscribes to `workspace-status` events from the broadcaster.
- Center Stage renders the focused workspace's xterm.js at full size, DOM renderer.
- Filmstrip renders one tile per non-focused workspace. Tile content per the **WP4 probe outcome (PASS, 2026-06-17 — live mirrors):**
  - Each background workspace's xterm.js is mounted **off-viewport** (`left:-99999px`) so xterm pauses its renderer (the buffer still updates via `write()`). The filmstrip tile is built from **`@xterm/addon-serialize` `serializeAsHTML()`** read off that buffer, rendered into a `scale(0.15)` tile, throttled to ~1 fps. (NOT a live mirror of off-screen DOM — that mechanism is non-viable; see the probe outcome doc and the §"Phase 1 thumbnail-rendering probe" correction.)
  - Active-CPU p95 caveat (~30% on output bursts) → mitigations available (sub-1fps background rate, coalesced serialize, mirror only visible tiles) if dogfooding shows it matters.
  - (Status-tile-only fallback was the probe-fail branch; not taken.)
- Clicking a tile swaps which workspace is the center stage (CSS `display: none` / `display: block`; no remount). Workspace state and PTY connection persist.
- **Filmstrip collapse:** A chrome button toggles between "full filmstrip" (tiles with thumbnails or status) and "collapsed strip" (one-line row of project-name + status-dot pills). Collapsed workspaces use `display: none` on their off-screen xterm to suppress the render loop; PTY output still buffers in xterm's scrollback.

**B.2 — Menu-bar status item.**
- Native Tauri tray icon via `tauri::tray::TrayIconBuilder`. `setIconAsTemplate(true)` for light/dark adaptation.
- Icon shows an aggregate status dot:
  - **Green** = all workspaces `Idle`
  - **Blue** = any workspace `Running`
  - **Amber** = any workspace `AwaitingInput`
- Left-click opens a popover (positioned via `tauri-plugin-positioner` with the `tray-icon` feature → `Position::TrayBottomCenter`). Popover is its own `WebviewWindow`, subscribes to `workspace-status`, renders a one-row-per-workspace list with status dot + project name. Clicking a row sends an IPC command to the main Claudesk window: bring forward + switch center stage to that workspace.
- Right-click opens a native menu: Show Claudesk window / Toggle PiP / Quit.
- **Ships BEFORE PiP** in Phase 2 (roadmap milestone 2.5). Dogfooding gate: at least one daily-driver week using the menu-bar item alone. If sufficient, **PiP defers to Phase 4**.

**B.3 — PiP NSPanel (conditional).**
- `tauri-nspanel` v2.1: `PanelBuilder` with `no_activate(true)` + `PanelLevel::Floating`.
- Underlying `NSWindow` collection behavior: `NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorStationary`. Visible on every Space, draws over fullscreen apps, doesn't steal focus on click.
- User-toggled (right-click menu-bar item → Toggle PiP, or in-Claudesk button). **Display-only in v1** — clicking a tile does NOT bring the workspace forward. Click-to-focus is a Future Possibility.
- Content mirrors filmstrip rendering: live ~1 fps mirrors if probe passed; status tiles if probe failed.
- **Bus-factor risk:** `tauri-nspanel` is single-maintainer. Mitigation: pin v2.1; monitor `tauri-apps/tauri#13034` for first-party NSPanel support and migrate when it lands.

#### C. Smart auto-resume on workspace open (preserved from 2026-05-22, updated for workspaces)

- **Decision logic = pure function of two signals**, evaluated on workspace-open in the Rust backend:
  1. `session_md_exists = fs::exists("<project>/workflow/.session.md")`
  2. `cc_has_resumable = check via Claude Code's resume mechanism whether a prior conversation is available for cwd=<project>` — exact probe shape decided in **WP9c probe** (still pending; not affected by the 2026-06-15 revision).
- **Branch table:**
  | `session_md_exists` | `cc_has_resumable` | Action |
  |---|---|---|
  | true | * | inject `/session-resume\n` into the PTY (workflow context wins over raw history) |
  | false | true | inject `/resume\n` into the PTY |
  | false | false | inject `/session-start\n` into the PTY |
- **No persisted "next-command" state.** Claudesk never writes a sidecar file like `last-action.json`. Source-of-truth files (`workflow/.session.md` + CC's own session-list) are authoritative; rereads on every workspace-open.
- **WP9c probe still required.** Sibling to the thumbnail probe, gating the smart-auto-resume implementation. Confirms the exact CC CLI surface for "is there a resumable conversation for this cwd."
- **Injection mechanism reuses existing seam.** Slash command via `CcSession::send_input(b"/session-resume\n")`. No new IPC, no new trait method.
- **Multiple workspaces in flight at the same time** is handled trivially — auto-resume runs per-workspace on workspace-open, never globally.

#### D. Drive-mode selector + indicator (preserved from 2026-05-22, updated for workspaces)

- **UI surface = workspace header chrome** (on the center-stage workspace). A small 4-position selector (radio-group or segmented control). Filmstrip tiles do NOT show drive mode — it's a center-stage concern only.
- **Persistence layers, in order of precedence (write-down, read-up):**
  1. **Active WIP file's `drive_mode:` frontmatter** — workflow's source of truth.
  2. **`projects.json` per-project `default_drive_mode`** — fallback for the gap between sessions.
  3. **Global default = `autopilot` (Mode 3)**.
- **Read path on workspace open:** check (1), fall back to (2), fall back to (3). Render in the center-stage header.
- **Write path on user click:** update WIP frontmatter (if active) AND `projects.json` (always).
- **Cross-workspace consistency** is no longer a concern (no multi-window setup; only one workspace per project at a time in v1).
- **No new Rust module.** Thin layer in `config_store/`.

### Phase 3 forward-look (informational, not built)

- Right-pane Monaco or CodeMirror 6 editor (decision in next research pass).
- libgit2-backed (or `git2` Rust crate) diff viewer.
- A second `PtyCcSession`-equivalent for the "ad-hoc terminal" mode within a workspace.
- A panel-host component on the right that swaps between editor / diff / terminal — one per workspace, so each workspace has its own panel state.

### Future hedge

- `SdkCcSession` impl of `CcSession` (using `@anthropic-ai/claude-agent-sdk`) is documented in research as a potential migration path if PTY-based control ever becomes untenable.
- **PiP click-to-focus** — promote a workspace from a PiP tile click. Defer until display-only PiP has been used long enough (or PiP has been replaced by menu-bar) to confirm the limitation is real.
