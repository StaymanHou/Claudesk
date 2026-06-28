# Claudesk

## Project Overview

**Claudesk** — a macOS-only, single-user, open-source "lite IDE" that puts the daily Claude Code + Sublime Text workflow in **one window with multiple virtual workspaces inside it**. The pain point: starting work on any given project takes minutes of repetitive setup (open terminal → cd → `claude`, open Sublime Text and load project, open Sublime Merge and load again, occasionally a second terminal and cd again). Over 20+ rotating projects with 3–4 in flight on any given day, this cost compounds. Compounding it: when several projects ARE in flight, finding the one waiting on input means clicking through windows or switching Spaces — a second-order tax on top of the launch tax.

Claudesk provides:
- **VSCode-style project picker** — click a project → full environment fires up in <10s. Each pick opens a new **workspace** inside the existing Claudesk window (a new tab/stage), not a new OS window.
- **One workspace = one project = one CC session.** Single window holds N workspaces concurrently.
- **Mission Control-inspired layout.** Center stage = the focused workspace, full-size; top filmstrip = live thumbnails (or status tiles, pending the Phase 1 thumbnail-rendering probe) of every other open workspace, ordered, with project name + idle/running/awaiting-input dot. Clicking a filmstrip tile promotes that workspace to center stage and demotes the previous one. Filmstrip is collapsible to a row of mini status tiles (project name + status dot only) for reclaiming vertical space.
- **Left half of each workspace:** Claude Code in a true PTY-backed terminal, yolo mode by default, already `cd`'d into the project. Rendered with xterm.js DOM renderer (no WebGL).
- **Right half of each workspace:** a placeholder in Phase 1; a built-in lite editor + git diff viewer arrives in Phase 3.
- **Stateful CC controller (Phase 2):** Claudesk owns each workspace's CC process lifecycle, watches workflow state files, and exposes workflow operations (skill buttons, Recycle Session) as clicks rather than typed slash commands.
- **Menu-bar status item (Phase 2):** an aggregate idle/running/awaiting-input dot in the macOS menu bar — click to open a popover listing every workspace + status; clicking a row brings Claudesk forward and switches the center stage. Always visible system-wide, even when the Claudesk window is hidden, minimized, or on a different Space.
- **Picture-in-picture mini player (Phase 2, conditional):** a small always-on-top floating panel (via `tauri-nspanel`) the user can summon when the Claudesk window is out of focus. Mirrors the same status surface as the filmstrip. Display-only in v1 — clicking a tile does NOT bring the workspace forward. Conditional on Phase 2 dogfooding: if the menu-bar item alone suffices, PiP may defer to Phase 4.
- **Smart auto-resume on workspace open (Phase 2):** Claudesk inspects `workflow/.session.md` and CC's resumable-conversation list, then auto-fires the right command — `/session-resume` (clean pause), `/resume` (mid-step termination, CC remembers but workflow doesn't), or `/session-start` (fresh / post-terminal-close). No manual selection between the three. Both signals present → prefer `/session-resume`.
- **Drive-mode selector + indicator in workspace header (Phase 2):** a small selector on the center-stage workspace's header showing the active drive mode (1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot), changeable in one click. Persisted per-project in `projects.json`; mirrored to the active WIP file's `drive_mode:` frontmatter so the workflow orchestrator and the UI share a single source of truth.


- **Sublime launchers (both KEPT permanently — revised 2026-06-20, WP8):** the real Sublime Text and Sublime Merge are each one click away via **icon buttons in the right-panel tab row** (`sublime_open` / `smerge_open`, both backed by `sublime/sublimeLaunch.ts`). **WP8 was redefined 2026-06-20:** the Sublime *Text* pop is **NOT removed** — the in-app editor is the *primary* routine-editing surface, but Sublime Text stays as a permanent one-click escape hatch alongside Sublime Merge. The only thing WP8 dropped was the redundant Sublime-Text `⌘⇧O` `keydown` hotkey (the button is now the sole affordance; `⌘⇧O` is freed). *(Earlier framing — "the in-app editor replaces Sublime Text and the pop is removed at WP8" — is superseded.)* Sublime *Merge* always stays — the inline diff viewer covers *viewing*; staging/blame/history/blob-at-rev live in Sublime Merge. See `docs/product/vision.md` Core Principle 3.

Audience: a single user (Stayman) running the custom workflow system at `~/.claude/skills/` against many projects on macOS. Open-sourced for others with the same setup; no design concession for users who don't share the workflow.

Full vision, roadmap, research, architecture, and WBS live in `docs/product/`.

## External reference

The companion workflow-system project (`my-claude-code-customization`) is symlinked at `_ref/claude-customization/` (gitignored). It's the source of truth for the workflow skills, orchestrator agents, and `transitions.md` that Claudesk integrates with. Read from it when you need current skill or transition definitions. Notable paths:
- `_ref/claude-customization/docs/product/transitions.md` — pause-policy tables and drive-mode definitions
- `_ref/claude-customization/agents/<workflow>-workflow/AGENTS.md` — orchestrator procedures
- `_ref/claude-customization/skills/` — skill bodies (installed copies live at `~/.claude/skills/`)

## Tech Stack

- **Tauri 2** (2.9.x line) — Rust desktop framework with native WKWebView on macOS; ~3MB bundle, ~30–40MB RAM idle. Single `WebviewWindow` hosts all workspaces (no multi-webview).
- **Rust** (stable, ≥1.77) — backend: process lifecycle, PTY, filesystem, external-tool launch (Sublime via `sublime_open`), project config persistence. Phase 2 also: Unix-socket hook listener + status broadcaster.
- **TypeScript + React 19 + Vite** — frontend. WorkspaceList in React state; all workspaces stay mounted, switching center stage is `display: none` toggling.
- **xterm.js** (`@xterm/xterm` + `@xterm/addon-fit`) — terminal renderer. **DOM renderer only — no `@xterm/addon-webgl`.** Research established that WebGL contexts cap at ~16 per browser page; with a multi-workspace tab shell, the DOM renderer is simpler and good enough for the foreground.
- **`tauri-plugin-pty`** (wraps `portable-pty`) — embedded PTY in the Rust core (NOT node-pty + sidecar).
- **In-app Sublime-pop hotkey** — a webview `⌘⇧E` `keydown` handler owned by the focused workspace (WP8). NOT an OS-global shortcut: no `tauri-plugin-global-shortcut`, no macOS Accessibility permission. (The OS-global approach was built then rejected at verify-human 2026-06-19 — see WP8 in `docs/product/archive/phase-1-bare-shell-poc/wbs.md`.)
- **`tauri-plugin-fs`** / **`tauri-plugin-dialog`** — file IO, file dialogs. (The Sublime launch uses `std::process::Command` directly, not `tauri-plugin-shell`.)
- **Phase 2 additions:** `tauri-nspanel` v2.1 (PiP NSPanel), `tauri-plugin-positioner` with `tray-icon` feature (menu-bar popover positioning), `tauri-plugin-fs-watch` / `notify` (`workflow/.session.md` file-watcher).
- **No database** — project list is a flat JSON file at `~/Library/Application Support/com.claudesk.app/projects.json` (`app_data_dir()` resolves to the bundle identifier `com.claudesk.app`, not the productName).
- **No backend infrastructure** — single-user desktop app.

## Project Structure

Phase 1 will grow the tree into the standard Tauri 2 + Vite shape (added during WP1):

```
claudesk/
├── CLAUDE.md                  # this file
├── CHANGELOG.md               # append-only narrative log (created on first feature close)
├── README.md                  # minimal; full version in Phase 4
├── _ref/                      # gitignored — symlinks to companion repos for read-only reference
├── docs/
│   └── product/               # vision, roadmap, research, arch, wbs, context
├── workflow/
│   ├── wip/                   # active feature/task/incident items
│   ├── backlog.md             # SURFACE discoveries
│   └── archive/               # completed items
├── src/                       # frontend (React + TS)
│   ├── components/
│   │   ├── workspace/         # Workspace, CenterStage, Filmstrip
│   │   └── picker/
│   ├── state/                 # WorkspaceList store
│   └── main.tsx
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── cc_session/        # CcSession trait + PtyCcSession impl
│   │   ├── config_store/      # projects.json persistence
│   │   ├── sublime/           # find_subl discovery + sublime_open command (WP8)
│   │   └── main.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

## Dev Environment

**Rationale for host-based dev env (copied from arch.md):** This is a desktop application targeting macOS. Tauri development requires direct access to the host's WKWebView, macOS code-signing chain (for later phases), and native windowing — all of which a Docker container on macOS cannot provide. The standard Tauri 2 toolchain runs natively on macOS via `rustup` + `node`. Industry practice for Tauri development is host-based; Dockerizing it would add friction without benefit.

Commands run directly on the host. Standard setup and tooling apply.

## Getting Started

### Prerequisites

- **macOS** (this project is macOS-only and will not be tested on Linux or Windows)
- **Rust** (stable, ≥1.77) via `rustup`
- **Node** 20 LTS or newer (recommend `fnm` or `nvm`)
- **pnpm** (preferred) — `npm i -g pnpm` or via `corepack enable`
- **Xcode Command Line Tools** — `xcode-select --install`
- **Sublime Text** with `subl` on `PATH` (or fallback to `open -a "Sublime Text"`)
- **Sublime Merge** with `smerge` on `PATH` — Phase 2 only
- **Claude Code CLI** (`claude`) installed and authenticated independently before launching Claudesk
- _(No macOS Accessibility permission needed — the Sublime hotkey is an in-app `⌘⇧E` keybinding, not an OS-global shortcut.)_

### Setup

The Tauri scaffold is added in WP1. Until then, the project is documentation-only. After WP1:

```bash
pnpm install
pnpm tauri:dev   # dev build — runs under the com.claudesk.app.dev identity (isolated from a prod install)
```

To build a production `.app`:

```bash
pnpm tauri build
```

**Dev/prod isolation (2026-06-24):** `pnpm tauri:dev` launches with `--config src-tauri/tauri.dev.json`, which overlays a distinct bundle identifier `com.claudesk.app.dev` (productName "Claudesk Dev", window title "Claudesk (dev)"). This isolates the dev build's app-data dir, `projects.json`, hook socket, deployed hook script (`claudesk-hook-dev.pl`), and `~/.claude/settings.json` registration from a production install (`com.claudesk.app`) — so the installed `.app` and `pnpm tauri:dev` can run **concurrently** with no cross-talk (required for dogfooding Claudesk with Claudesk). The hook-script basename + registration marker derive from the running app's identifier at runtime (single source of truth — `hook_install::commands::script_basename`); a dev build's `projects.json` seeds once from the prod list on first launch. Plain `pnpm tauri dev` (no overlay) would collide with a prod install — use `pnpm tauri:dev`.

## Development Conventions

- **Workflow system.** This project follows the workflow system documented in `~/.claude/CLAUDE.md` (Product → Feature/Task/Incident state machines). Use `/session-start` for end-to-end orchestration; entry-point slash commands (`/feature-plan`, `/feature-spec`, `/task-plan`, `/incident-report`) for single-step work.
- **WIP layout.** Active features in `workflow/wip/<feature>.md` using the Work Tree format (see `~/.claude/CLAUDE.md` → "Work Tree Format"). Discoveries logged in `workflow/backlog.md`. Completed items archived to `workflow/archive/`.
- **CHANGELOG.md.** Append-only narrative — `**Feature shipped:** …`, `**Task closed:** …`, `**Backlog resolved:** …`, etc. Closing skills write to it automatically.
- **Code style.**
  - Frontend: ESLint + Prettier. TypeScript strict mode on. React 19 function components only.
  - Backend: `cargo fmt` + `cargo clippy -- -D warnings`. No `unwrap()` outside of tests; use `?` with typed error returns (`thiserror`).
- **Dark mode only.** Claudesk's UI is **always dark** — it never follows the OS theme. Do NOT add `@media (prefers-color-scheme: light)` blocks or any light-theme tokens. `:root` in `src/App.css` sets `color-scheme: dark` and unconditionally dark color tokens; keep it that way. A light/theme toggle is explicitly out of scope (not even a Phase 4 setting).
- **Tests.**
  - Backend: `cargo test` for unit tests; integration tests in `src-tauri/tests/`.
  - Frontend: Vitest for unit tests; component tests where state logic is non-trivial.
  - End-to-end: deferred; manual testing on the host macOS is the verification path in Phase 1.
  - **Installed-build smoke test (dev-vs-installed parity).** `pnpm tauri:dev` inherits the launching terminal's full environment (PATH, env vars); the installed Finder/Dock-launched `.app` inherits only the minimal launchd environment (`PATH=/usr/bin:/bin:/usr/sbin:/sbin`, no user shell PATH). A feature can therefore pass all dev-mode + agent-mechanism verification yet be broken in a real install (e.g. 2026-06-24: the installed app couldn't spawn `claude` because `~/.local/bin` wasn't on the GUI PATH — never reproduced in `tauri:dev`). **Any feature touching PATH, environment variables, or external-process spawning MUST be smoke-tested from a freshly-built installed `.app` launched from Finder/Dock — not just `pnpm tauri:dev` — before it's considered done.** Part of the dogfood-readiness bar. (The PATH case is already mitigated app-wide by `src-tauri/src/env_path`; the verification posture stands for the whole class.)
  - **verify-self on backend-lifecycle features is operator-only at the live tier.** For a feature whose observable outcomes include backend process lifecycle (PTY spawn/reap, `pgrep` for a killed `claude`/shell, hook-socket behavior, anything needing the real `.app`), the agent canNOT drive verify-self end-to-end: there's usually no running app in-session, and a bare Vite browser (the dev-seam `?ws=`/`__seedWorkspace` path) shows the React frontend but NOT the Tauri backend, so `pgrep`-class outcomes are unobservable there. The correct posture is NOT to spawn a Playwright subagent against a non-existent surface — it's to (1) verify the slice the agent CAN do statically: `tsc --noEmit`, `eslint`, `pnpm vite build` (catches broken imports/JSX across the change), and a wiring trace of the connected path; then (2) CARRY the live + backend outcomes into the phase's verify-human checklist, where the operator drives `pnpm tauri:dev` (or the installed `.app`). This is the verify-self-tier corollary of the "installed-build smoke test" convention above (which governs done-ness); together they say: the agent proves the code compiles + wires correctly, the operator proves the process behavior on the real app. (Recurred every phase of QoL-WP1 close-workspace, 2026-06-25.)
  - **NEW (2026-06-26) — the agent CAN now drive live verify-self via the `tauri` MCP bridge; reach for it before carrying to the operator.** A dev-only MCP bridge (`tauri-plugin-mcp-bridge`, `#[cfg(debug_assertions)]`-gated, binds 127.0.0.1:9223; MCP server in `.mcp.json`) attaches to the **real running WKWebView with live Tauri IPC** — proven on macOS during M5 WP2. This dissolves the bare-Vite dead end above for the *main webview*: the agent can itself (1) `pnpm tauri:dev` (background), (2) `mcp__tauri__driver_session{start, port:9223}`, then (3) drive the live workspace — `webview_dom_snapshot`, `webview_execute_js` (read live status-dot class / confirm `__TAURI_INTERNALS__`), `webview_interact{click}` (pick a project → a real workspace mounts), `webview_screenshot`. So for a frontend/workspace-UI feature, **prefer driving live verify-self through the bridge over carrying the visual/DOM checks to verify-human.** Fidelity boundaries found: DOM-read / JS-exec / **click** / screenshot are high-fidelity; **raw xterm terminal typing is low-fidelity** (`webview_keyboard` reaches the CC prompt but synthetic Enter doesn't commit to the PTY) — so trigger status *transitions* via IPC/click, not by typing into CC. Still genuinely operator-only: things that need the **installed** `.app` (GUI-PATH spawn parity) and backend-process outcomes the webview can't see (`pgrep` for a reaped `claude`). **Caveats:** (a) the bridge tool names are `mcp__tauri__*` (NOT the Playwright-MCP names `feature-verify-self-runner` assumes — drive these directly, don't spawn that runner); (b) `tauri.dev.json`'s inline dev capability must re-list the base perms (`core:default` etc.) or it suppresses them and `cc_spawn` breaks; (c) NSPanel/PiP-webview reachability is still TBD (M5 WP2 Phase 2). Full ADOPT/REJECT verdict lands in `docs/product/wbs.md` "Probe outcomes" at WP2 close — until then this is a proven, lean-adopt capability. **Update (M5 WP3, 2026-06-26):** caveat (c) is now resolved — the bridge DOES reach the PiP NSPanel webview via `webview_*{windowId:'pip'}` (confirmed driving the real PiP panel: `__TAURI_INTERNALS__` present, DOM/screenshot readable). So the agent drives live verify-self for *both* the main webview and the PiP panel. **Update (M6 WP7, 2026-06-28) — caveat (d), teardown port-cleanup:** after a bridge verify-self session, run `lsof -ti tcp:1420 tcp:9223 | xargs -r kill -9` *in addition to* `mcp__tauri__driver_session{stop}` + `TaskStop` on the `tauri:dev` task. A `TaskStop`'d `pnpm tauri:dev` can leave **vite still bound to 1420**, which silently fails the *next* `pnpm tauri:dev` at `beforeDevCommand` with "Port 1420 is already in use" (the tauri build then exits non-zero before the bridge binds — looks like a build failure, is really a stale port). Make port-cleanup the **default** teardown, not a recovery step. (1420 = Vite dev server; 9223 = the `tauri-plugin-mcp-bridge` WebSocket.) Also useful from that session: a `webview_execute_js` script that calls `__TAURI_INTERNALS__.invoke(...)` times out the bridge's eval (it doesn't await the promise) — use the fire-then-poll pattern (kick the invoke, store its result on a `window.__x` global in `.then`, read it back on a follow-up sync script).
  - **Scratch workspaces for verify-self (dev-only).** When an agent drives live verify-self through the MCP bridge, it picks a project from the picker → a *real* CC session spawns in that project's dir. To keep that off real work, three throwaway git repos live at `tmp/scratch/scratch-{a,b,c}` (each its own repo with a baseline commit, so diff/git-status surfaces have content). `tmp/` is gitignored. **Prefer opening these for verify-self over real projects** — mandatory once a check drives a status *transition* or anything that spawns/answers a CC session (Phase 2/3 of M5 onward); read-only DOM/click checks against a real recent are harmless but the scratch dirs are still the default. First use: "Open folder…" → `tmp/scratch/scratch-a` to add them to the picker recents; thereafter they're one click.
- **One window, many workspaces.** Claudesk is single-window. Multiple projects open simultaneously = multiple workspaces inside that one window, switched via filmstrip tiles. Multi-window for Claudesk itself is explicitly out of scope. The standing auxiliary surfaces are: the PiP NSPanel (Phase 2 conditional) and the menu-bar popover (Phase 2). **Both Sublime tools (Text + Merge) are kept permanently** (revised 2026-06-20, WP8) — launched on demand via icon buttons in the right-panel tab row (`sublime_open` / `smerge_open`). The popped Sublime windows are external apps, not Claudesk windows, so they don't violate the single-window rule. *(The earlier "Sublime Text pop is a temporary stopgap removed once the in-app editor lands" framing is superseded — WP8 kept it.)*
- **Tab-shell substrate ships in Phase 1.** Even though Phase 1 only ever opens one workspace at a time, the WorkspaceList + Center Stage + (empty) Filmstrip layout is built from day one. Phase 2 plugs into the existing structure rather than reshaping it. Design for N=1 with N>1 in mind.
- **All workspaces stay mounted.** Switching the center stage is `display: none` / `display: block` toggling, never an unmount/remount. PTY connections persist across switches; CC sessions in background workspaces continue to receive output (buffered to xterm scrollback).
- **xterm.js DOM renderer only.** Do not load `@xterm/addon-webgl`. The WebGL renderer caps at ~16 contexts per page across all xterm instances on the page combined; with a multi-workspace tab shell that's a real ceiling, and the modern DOM renderer is fast enough for the foreground workspace. If a single-workspace user ever proves the DOM renderer can't keep up, the decision is reversible (one-line addon load) — but never load it speculatively.
- **Single `WebviewWindow`, no multi-webview.** Tauri 2's multi-webview API is `unstable`-flagged and offers webview isolation we don't need (all workspaces share Claudesk's trust boundary). All workspaces are React components in one webview.
- **No `.claudesk.json` per repo.** Project list is centralized at `~/Library/Application Support/com.claudesk.app/projects.json` (the bundle-identifier path `app_data_dir()` returns). Adding or removing a project is a UI action, not a per-repo file edit.
- **`CcSession` trait is a stable seam.** Claudesk's "how to drive CC" path goes through `CcSession`. Phase 1 has `PtyCcSession`; never bypass the trait when calling CC from anywhere else. Phase 2 extends the trait with `state_events()` and `recycle()`; future work could swap to an `SdkCcSession`.
- **PTY byte-injection for input; hook channel for state.** We write bytes into the CC pty for any "send a slash command" operation. We do NOT parse CC's output text to infer state. Workflow state is read from `workflow/.session.md` and similar files via a file watcher (Phase 2). CC's idle/running/awaiting-input state is read from CC's official hook channel (`UserPromptSubmit`→running / `Stop`→idle / `PostToolUse`→running / `Notification`→awaiting-input events registered in `~/.claude/settings.json`), delivered to Claudesk via Unix socket (Phase 2). NEVER from PTY output. **`PostToolUse` is the answer-resume signal** (QoL-WP2): answering an `AskUserQuestion`/permission prompt fires `PostToolUse` (NOT `UserPromptSubmit`), so it's what clears a stuck AwaitingInput. **`Notification`→AwaitingInput is gated on `notification_type`** — only genuine input-needed types (`permission_prompt`, `elicitation_dialog`) or an unknown/absent type map to AwaitingInput; recognized informational types (`idle_prompt`, `auth_success`, `elicitation_complete`, `elicitation_response`) are a no-op so an idle nudge doesn't flip a busy dot blue. The gate is backend-side (`status_broadcaster::event_to_state`); `PreToolUse` is deliberately NOT registered.
- **CC hook channel uses Unix socket, not shared file.** Resolved by research: with three concurrent status-surface consumers (filmstrip, menu-bar, PiP), Unix-socket multi-consumer concurrency wins decisively. Claudesk opens the socket on launch; the installed CC hook script writes one JSON line per event.
- **Status broadcaster fans out one stream to three subscribers.** Filmstrip (main webview), menu-bar popover (separate webview), and PiP (NSPanel webview) all subscribe to the same Tauri-event-channel broadcast of `WorkspaceStatusUpdate`. All three surfaces agree at all times.
- **Status-surface order (resequenced 2026-06-22): PiP (M5) ships BEFORE the menu-bar (M6), and PiP is now UNCONDITIONAL.** Supersedes the earlier "menu-bar first, dogfood a week, defer PiP if sufficient" plan — that gate is dropped. All three surfaces (M4 filmstrip, M5 PiP, M6 menu-bar) subscribe to the same M3 status broadcaster regardless of build order. See `roadmap.md` → "Revision 2026-06-22".
- **PiP/NSPanel window ops MUST run on the main thread — background-thread callers MUST marshal via `run_on_main_thread`.** Any `std::thread`/timer/spawned path that calls a PiP window operation (`pip::commands::pip_set_visible` → `PanelBuilder::build` / `order_front_regardless` / `hide`, or any NSPanel mutation) MUST hop back to the main (UI) thread with `app.run_on_main_thread(move || { … })`. Off-main-thread AppKit window ops **abort the whole process with a native exception and NO Rust panic** — invisible to `cargo test`, and at runtime it presents as a clean-launch-then-silently-die (M5 WP5: the app self-exited ~3s after launch, exactly when the auto-summon debounce timer fired; diagnosed empirically via per-second alive-tracking, not static reading). Tauri `#[command]` fns **and** the `on_window_event` closure already run on the main thread, so command-driven paths (`pip_set_mode`, the focus handler's synchronous hide) are safe — this **only** bites code that hops onto a background thread (the auto-summon debounce: sleeping off-thread is fine; the *show* must be marshaled back, re-checking the cancel-token + freshly-read mode inside the main-thread closure to close the off-thread→main-thread race). M6's menu-bar work + any future PiP/NSPanel timer or async path will hit the same seam. *(M5 WP5, commit `f6e3929`.)*
- **Drive mode lives in the WIP file's frontmatter.** Phase 2's drive-mode selector writes to the active WIP file's `drive_mode:` field — that field is the source of truth for the workflow's pause-policy logic. Claudesk's UI mirrors `projects.json` `default_drive_mode` only as a fallback for the gap between WIP files (e.g., right after `feature-finalize`). Never let the UI hold an in-memory drive mode that disagrees with the WIP frontmatter; always re-read on mount.
- **Pre-risky-action checklist for scaffolders.** Scaffolders (`create-tauri-app`, `npm create *`, etc.) can wipe strategic docs. Before running one in a non-empty dir, ensure git is clean and scaffold into a sibling dir then merging. The strategic docs in `docs/product/`, the root `CLAUDE.md`, and the `_ref/` symlink are load-bearing and must survive any scaffold.

## Setup & Ecosystem Gotchas

Setup-time pitfalls discovered during WP1 that any fresh checkout will hit.

- **pnpm v11+ moved `onlyBuiltDependencies`.** The allowlist for postinstall scripts now lives in `pnpm-workspace.yaml` as `allowBuilds:`, NOT in `package.json`'s `pnpm.onlyBuiltDependencies` field. On first install, pnpm v11 auto-generates a stub `pnpm-workspace.yaml` containing the literal text `set this to true or false` as a placeholder — that string must be replaced with `true` (or `false`) before `pnpm install` will succeed. Current state: `esbuild: true` in `pnpm-workspace.yaml`.
- **ESLint pinned to v9 LTS.** ESLint v10 (Nov 2025) is incompatible with `eslint-plugin-react` 7.37.x — the plugin uses `contextOrFilename.getFilename` which v10's API removed (`TypeError: contextOrFilename.getFilename is not a function` on every lint run). `eslint` and `@eslint/js` are pinned to `^9` until `eslint-plugin-react` ships a v10-compatible release. Do not bump to v10 without first verifying the plugin has caught up.
- **Prettier ignores strategic docs by design.** `.prettierignore` lists `docs/`, `workflow/`, `CLAUDE.md`, and `runtimes.md` — these are hand-authored prose where Prettier's blank-line-before-bullet-list rewrites are unwanted. Do NOT remove those entries casually; if you need to run Prettier on a sub-tree of those dirs, do it with explicit paths rather than removing the ignore rule. `pnpm format` skips them silently by design.
- **GUI-launched app inherits a minimal PATH (install-only).** A Finder/Dock-launched macOS `.app` inherits the minimal launchd `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), NOT the user's shell `PATH` — so user-installed CLIs (`claude` in `~/.local/bin`, Homebrew/`fnm`/`nvm` bins) are invisible to spawned processes and `cc_spawn` fails with *"No viable candidates found in PATH …"*. This bites **only the installed build** — `pnpm tauri:dev` inherits the launching terminal's full `PATH`, so it never reproduces (operator hit it 2026-06-24 on first real install). Fixed app-wide by `src-tauri/src/env_path/`: at `.setup()` (FIRST, before any spawn) the app captures the login-shell `PATH` (`$SHELL -l -i -c 'printf %s "$PATH"'`, fallback `/bin/zsh`) and `std::env::set_var("PATH", …)` process-wide — best-effort, never blanks an existing `PATH`. If you add another external-CLI spawn, it benefits automatically; do NOT re-introduce per-spawn PATH hacks.

## Current Milestone

**Milestone 6: Friend-requested QoL polish (OPEN collection).** A batch of small, friend-sourced quality-of-life refinements landing after the dogfood-replace point (M3+M4) and the out-of-focus status surface (M5). **Deliberately an open collection** — more friend requests may arrive before the milestone closes and should be folded in as additional WPs. Every item but the lead fix mirrors an already-shipped pattern (the `railWidth.ts` rail resizer, the editor `fontZoom.ts`, the `AppSettings` store), so the milestone is low-risk polish; the **lead item is a correctness bug** — the stuck-`Running` status dot — sequenced first.

No `/product-research` + no external-API probe — M6 is pure in-app UX over confirmed seams. The one knowledge-unknown (*which* link causes the stuck dot — cwd-match-miss / socket-not-draining / frontend-not-rendering) is resolved by an internal file-logging probe (WP1), not external research.

Work packages (Milestone 6 — live decomposition in `docs/product/wbs.md`). Critical path **WP1 → WP2 → WP8**; **WP3–WP7** parallel polish track:
- **WP1** Probe — **file-based status-channel logging** (instrument `drain_loop`/`StatusRegistry`/hook edge to a per-identity log file readable from the launchd-launched prod `.app`, where `eprintln!` is invisible). LEAD prerequisite.
- **WP2** **Fix the stuck-`Running` dot** — `/feature-reproduce` against WP1's telemetry, fix the named layer. The milestone's lead correctness item (`SURFACE-2026-06-25-STATUS-STUCK-RUNNING-AFTER-CLEAN-TURN-END`, prod-confirmed twice).
- **WP3** Drag-resizable left/right split (CC terminal ↔ right panel) — clone `railWidth.ts`; terminal re-fits via XtermPane's existing `ResizeObserver`.
- **WP4** Focus-scoped CC terminal font zoom — ⌘+/⌘−/⌘0 routes to whichever half holds focus (`data-focus-half`). Keybinding LOCKED.
- **WP5** Editor auto-wrap toggle — `EditorView.lineWrapping`, default OFF, `⌘\` chord to confirm at build time.
- **WP6** FileTree reaches gitignored-but-editable files (`.env`) — the one item with a genuine open design choice (policy + walker-wide vs FileTree-only), decided at plan time.
- **WP7** No-yolo setting — gate `--dangerously-skip-permissions` on a new `AppSettings.cc_yolo` field, default yolo-ON.
- **WP8** Milestone-exit verification at the installed `.app`.

**Status (2026-06-27):**
- **Milestone 6 — IN PROGRESS** 2026-06-27. WBS at `docs/product/wbs.md`. **WP1 (backend status-channel logging) + WP1b (hook-edge write-failure trace) SHIPPED 2026-06-27** — the stuck-`Running` dot **probe**, released in the **v0.2.1 patch** so the telemetry runs in prod and self-captures the intermittent bug. **WP2 (the fix) is BLOCKED on a natural occurrence** — the bug is intermittent (~once/day), can't be forced; WP2's `/feature-reproduce` runs against the prod `status-channel.log` when the bug next fires. **WP9 (suppress empty PiP when no workspace open)** added to the WBS (operator-observed 2026-06-27). **Remaining: WP2 (passive), WP3–WP7, WP9, WP8 (exit verify).**
  - *Probe split (WP1 + WP1b):* originally one WP with two phases; split after build into the backend file logger (WP1: `status_log/mod.rs` + `drain_loop`/registry instrumentation) and the deployed-Perl-hook write-failure trace (WP1b: `claudesk-hook.pl`) — independently-shippable telemetry at different layers. Log lands at `<app_data_dir>/status-channel.log` (per-identity: `com.claudesk.app/` vs `.dev`). Line shapes: `<ts> STATUS event=… cwd=… mapped=… resolved=… outcome=emitted|dropped`, `- REGISTRY op=… key=<canonical>`, `- HOOK write-failed …`. Reading it: a `Stop` with `resolved=none outcome=dropped` = cwd-miss; absent `Stop` + `HOOK write-failed` = never-arrived; `outcome=emitted` but dot stuck = frontend gap.
  - *Scope decisions baked in:* Design priors consulted: `operator-helpful-friend-misfiring-as-offswitchable-setting` agrees with WP5 (wrap default OFF) + WP7 (yolo default ON) — both off-switchable, defaulting to operator benefit. WP4's focus-scoped terminal zoom keybinding is LOCKED; WP5's `⌘\` chord is a suggestion to confirm at plan time. Two open design choices flagged for plan time: WP6's gitignore policy/scope, WP7's app-global-vs-per-project. The workflow-doc-hierarchy watcher is **NOT** an M6 WP (re-anchored to M7).
- **Milestone 5 (Picture-in-picture) — COMPLETE + CLOSED + RELEASED as v0.2.0** 2026-06-27 (`/product-finalize`; `/release` v0.2.0 — GitHub release live, Homebrew tap pushed `7717bd9`, install smoke-tested). All 6 WPs shipped; WP6 milestone-exit agent-verified PASS via the MCP bridge, installed-build out-of-focus checks operator-verified at the release gate. WBS archived at `docs/product/archive/milestone-5-picture-in-picture/`.
- **Milestone 4 (Multi-workspace UX) — COMPLETE + CLOSED** 2026-06-24 (`/product-finalize`). All 6 WPs shipped (N-cost probe → GO eager-mount; N>1 lift; filmstrip tiles + status + live mirror + ⌘⇧+digit + drag-reorder; collapse toggle; WP4b focus indicator; verify-at-N). The M3+M4 dogfood-replace point is REACHED. WBS archived at `docs/product/archive/milestone-4-multi-workspace-ux/`.
- **Milestone 3 (CC lifecycle & state plumbing) — COMPLETE + CLOSED** 2026-06-22. Hook channel live (Perl hook → `AF_UNIX` socket → `status_broadcaster` → `workspace-status` emit → honest indicator). WP5 (`.session.md` watcher) DROPPED. WBS archived at `docs/product/archive/milestone-3-cc-lifecycle-state-plumbing/`.
- **Milestone 2 (Lite Editor + Diff Viewer) — COMPLETE + CLOSED** 2026-06-22. WBS + research archived at `docs/product/archive/milestone-2-lite-editor-diff-viewer/`.
- **Milestone 1 (Bare Shell + Tab Substrate PoC) — COMPLETE + CLOSED** 2026-06-19. WBS archived at `docs/product/archive/phase-1-bare-shell-poc/`.
- **Roadmap (resequenced dogfood-first 2026-06-22, +friend-QoL/docs-viewer/time-analytics inserts):** M1–M5 complete; execution order onward is M6 friend-QoL → **M7 menu-bar** → **M8 docs-viewer** → **M9 time-analytics** → **M10 auto-resume** → **M11 skill-orchestration** → **M12 polish**. See `roadmap.md` revisions.
- **Published:** origin/main in sync (latest `50902af`); releases via the `/release` skill (current: v0.2.0).

## Key Decisions

- **Tauri 2 over Electron.** Aligned with the "lite over featureful" principle. Bundle ~3MB vs ~96MB; ~30–40MB RAM vs ~200–300MB idle; startup <500ms vs 1–2s. The smaller ecosystem maturity is acceptable for a single-user tool.
- **`tauri-plugin-pty` / `portable-pty` over node-pty + sidecar.** node-pty would require shipping a Node runtime in the bundle, defeating the bundle-size advantage. portable-pty runs natively in the Rust core.
- **PTY byte-injection over Agent SDK for v1.** The vision requires the familiar interactive CC TUI inside the workspace. Claudesk *is* the terminal, so injecting bytes for slash commands is legitimate; we avoid the "PTY scraping" anti-pattern (parsing output text for state) by using the hook channel + file-watching for state detection in Phase 2. The `CcSession` trait is the future-swap seam for Agent SDK if/when needed.
- **Single window, many workspaces (replaces "one project per window").** Reversed during the 2026-06-15 product revision. Multiple projects = workspaces inside one Claudesk window, switched via filmstrip tiles. Aligned with the revised vision.
- **xterm.js DOM renderer only — no WebGL.** Decided 2026-06-15 after research established the ~16-context browser cap. DOM renderer is simpler, sufficient for the foreground, and removes a swap-on-focus complexity. Decision is reversible if needed.
- **Single `WebviewWindow`, no multi-webview.** Tauri 2's multi-webview is `unstable` and offers no isolation we need.
- **Tab-shell substrate ships in Phase 1.** Phase 2 plugs into existing layout structure rather than reshaping the foundation.
- **Thumbnail-rendering probe (WP4) gates Phase 2's filmstrip + PiP rendering strategy.** Pass → live ~1 fps mirrors. Fail → static status tiles in v1, live mirrors deferred to Future Possibility.
- **Menu-bar status item ships BEFORE PiP in Phase 2.** Includes a dogfooding gate — if menu-bar alone suffices, PiP defers to Phase 4.
- **CC hook channel uses Unix socket, not shared file.** Three concurrent status-surface consumers make the multi-consumer concurrency case unambiguous.
- **Flat JSON for the project list, no DB.** ≤100 entries; read-on-open, write-on-update; JSON is appropriate.
- **No per-project config file in the project itself.** Centralized list in app support dir aligns with the "no per-project config burden" principle.
- **Host-based dev environment, not Docker.** Tauri targets host WKWebView and native windowing; Docker on macOS cannot provide them.
- **`--dangerously-skip-permissions` (yolo) by default.** Vision-explicit. Phase 4 setting will let users opt out.
- **Sublime launchers are click-only icon buttons in the panel tab row (WP8, redefined 2026-06-20).** Both Sublime Text (`sublime_open`) and Sublime Merge (`smerge_open`) launch from icon buttons in the `RightPanelHost` `right-panel-toggle` tab row (`sublime/sublimeLaunch.ts`); the backend `sublime` module is unchanged. **History:** the launch started OS-global (`tauri-plugin-global-shortcut` + Accessibility flow), was rebuilt as an in-app `⌘⇧E`→`⌘⇧O` `keydown` hotkey + button (WP8 2026-06-19, no Accessibility permission), and at WP8's 2026-06-20 redefinition the redundant `⌘⇧O` hotkey was **deleted** (button-only now; `⌘⇧O` freed). **Both launchers are PERMANENT** — the earlier "Sublime Text pop removed at WP8 once the editor proves parity" plan is superseded: the in-app editor is the primary surface, but Sublime Text stays as a one-click escape hatch alongside Sublime Merge (which covers staging/blame/history/blob-at-rev the inline diff viewer doesn't). See `docs/product/vision.md` Core Principle 3.
- **Phases 2–4 not decomposed yet.** Phase 1 decomposition is full; Phases 2–4 are WP-headline only. Premature decomposition would force decisions about later-phase internals before Phase 1 surfaces real constraints.
- **PiP click-to-focus is a Future Possibility, not v1.** Display-only PiP first; promote-on-click deferred until dogfooding confirms the limitation is real.
- **Workflow state-machine enforcement & claude-time integration are future possibilities, NOT in the initial roadmap.** Architecturally we leave room for them (see `docs/product/vision.md` → "Future Possibilities") but don't build toward them in Phases 1–4.
