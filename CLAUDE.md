# Stayman CC Wrapper

## Project Overview

A macOS-only, single-user, open-source "lite IDE" wrapper that puts the daily Claude Code + Sublime Text workflow in **one window with multiple virtual workspaces inside it**. The pain point: starting work on any given project takes minutes of repetitive setup (open terminal → cd → `claude`, open Sublime Text and load project, open Sublime Merge and load again, occasionally a second terminal and cd again). Over 20+ rotating projects with 3–4 in flight on any given day, this cost compounds. Compounding it: when several projects ARE in flight, finding the one waiting on input means clicking through windows or switching Spaces — a second-order tax on top of the launch tax.

The wrapper provides:
- **VSCode-style project picker** — click a project → full environment fires up in <10s. Each pick opens a new **workspace** inside the existing wrapper window (a new tab/stage), not a new OS window.
- **One workspace = one project = one CC session.** Single window holds N workspaces concurrently.
- **Mission Control-inspired layout.** Center stage = the focused workspace, full-size; top filmstrip = live thumbnails (or status tiles, pending the Phase 1 thumbnail-rendering probe) of every other open workspace, ordered, with project name + idle/running/awaiting-input dot. Clicking a filmstrip tile promotes that workspace to center stage and demotes the previous one. Filmstrip is collapsible to a row of mini status tiles (project name + status dot only) for reclaiming vertical space.
- **Left half of each workspace:** Claude Code in a true PTY-backed terminal, yolo mode by default, already `cd`'d into the project. Rendered with xterm.js DOM renderer (no WebGL).
- **Right half of each workspace:** a placeholder in Phase 1; a built-in lite editor + git diff viewer arrives in Phase 3.
- **Stateful CC controller (Phase 2):** the wrapper owns each workspace's CC process lifecycle, watches workflow state files, and exposes workflow operations (skill buttons, Recycle Session) as clicks rather than typed slash commands.
- **Menu-bar status item (Phase 2):** an aggregate idle/running/awaiting-input dot in the macOS menu bar — click to open a popover listing every workspace + status; clicking a row brings the wrapper forward and switches the center stage. Always visible system-wide, even when the wrapper window is hidden, minimized, or on a different Space.
- **Picture-in-picture mini player (Phase 2, conditional):** a small always-on-top floating panel (via `tauri-nspanel`) the user can summon when the wrapper window is out of focus. Mirrors the same status surface as the filmstrip. Display-only in v1 — clicking a tile does NOT bring the workspace forward. Conditional on Phase 2 dogfooding: if the menu-bar item alone suffices, PiP may defer to Phase 4.
- **Smart auto-resume on workspace open (Phase 2):** the wrapper inspects `workflow/.session.md` and CC's resumable-conversation list, then auto-fires the right command — `/session-resume` (clean pause), `/resume` (mid-step termination, CC remembers but workflow doesn't), or `/session-start` (fresh / post-terminal-close). No manual selection between the three. Both signals present → prefer `/session-resume`.
- **Drive-mode selector + indicator in workspace header (Phase 2):** a small selector on the center-stage workspace's header showing the active drive mode (1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot), changeable in one click. Persisted per-project in `projects.json`; mirrored to the active WIP file's `drive_mode:` frontmatter so the workflow orchestrator and the UI share a single source of truth.
- **Sublime hotkey-pop:** the real Sublime Text and Sublime Merge are one keystroke away for the rare cases the built-in tools don't cover.

Audience: a single user (Stayman) running the custom workflow system at `~/.claude/skills/` against many projects on macOS. Open-sourced for others with the same setup; no design concession for users who don't share the workflow.

Full vision, roadmap, research, architecture, and WBS live in `docs/product/`.

## External reference

The companion workflow-system project (`my-claude-code-customization`) is symlinked at `_ref/claude-customization/` (gitignored). It's the source of truth for the workflow skills, orchestrator agents, and `transitions.md` that this wrapper integrates with. Read from it when you need current skill or transition definitions. Notable paths:
- `_ref/claude-customization/docs/product/transitions.md` — pause-policy tables and drive-mode definitions
- `_ref/claude-customization/agents/<workflow>-workflow/AGENTS.md` — orchestrator procedures
- `_ref/claude-customization/skills/` — skill bodies (installed copies live at `~/.claude/skills/`)

## Tech Stack

- **Tauri 2** (2.9.x line) — Rust desktop framework with native WKWebView on macOS; ~3MB bundle, ~30–40MB RAM idle. Single `WebviewWindow` hosts all workspaces (no multi-webview).
- **Rust** (stable, ≥1.77) — backend: process lifecycle, PTY, filesystem, global shortcuts, project config persistence. Phase 2 also: Unix-socket hook listener + status broadcaster.
- **TypeScript + React 19 + Vite** — frontend. WorkspaceList in React state; all workspaces stay mounted, switching center stage is `display: none` toggling.
- **xterm.js** (`@xterm/xterm` + `@xterm/addon-fit`) — terminal renderer. **DOM renderer only — no `@xterm/addon-webgl`.** Research established that WebGL contexts cap at ~16 per browser page; with a multi-workspace tab shell, the DOM renderer is simpler and good enough for the foreground.
- **`tauri-plugin-pty`** (wraps `portable-pty`) — embedded PTY in the Rust core (NOT node-pty + sidecar).
- **`tauri-plugin-global-shortcut`** — global hotkeys for Sublime-pop (requires macOS Accessibility permission).
- **`tauri-plugin-fs`** / **`tauri-plugin-dialog`** / **`tauri-plugin-shell`** — file IO, file dialogs, external process launch.
- **Phase 2 additions:** `tauri-nspanel` v2.1 (PiP NSPanel), `tauri-plugin-positioner` with `tray-icon` feature (menu-bar popover positioning), `tauri-plugin-fs-watch` / `notify` (`workflow/.session.md` file-watcher).
- **No database** — project list is a flat JSON file at `~/Library/Application Support/stayman-cc-wrapper/projects.json`.
- **No backend infrastructure** — single-user desktop app.

## Project Structure

Phase 1 will grow the tree into the standard Tauri 2 + Vite shape (added during WP1):

```
stayman-cc-wrapper/
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
│   │   ├── shortcuts/         # global hotkey registration
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
- **Claude Code CLI** (`claude`) installed and authenticated independently before launching the wrapper
- **macOS Accessibility permission** for the wrapper app (required for global shortcuts; the app prompts on first launch)

### Setup

The Tauri scaffold is added in WP1. Until then, the project is documentation-only. After WP1:

```bash
pnpm install
pnpm tauri dev
```

To build a production `.app`:

```bash
pnpm tauri build
```

## Development Conventions

- **Workflow system.** This project follows the workflow system documented in `~/.claude/CLAUDE.md` (Product → Feature/Task/Incident state machines). Use `/session-start` for end-to-end orchestration; entry-point slash commands (`/feature-plan`, `/feature-spec`, `/task-plan`, `/incident-report`) for single-step work.
- **WIP layout.** Active features in `workflow/wip/<feature>.md` using the Work Tree format (see `~/.claude/CLAUDE.md` → "Work Tree Format"). Discoveries logged in `workflow/backlog.md`. Completed items archived to `workflow/archive/`.
- **CHANGELOG.md.** Append-only narrative — `**Feature shipped:** …`, `**Task closed:** …`, `**Backlog resolved:** …`, etc. Closing skills write to it automatically.
- **Code style.**
  - Frontend: ESLint + Prettier. TypeScript strict mode on. React 19 function components only.
  - Backend: `cargo fmt` + `cargo clippy -- -D warnings`. No `unwrap()` outside of tests; use `?` with typed error returns (`thiserror`).
- **Tests.**
  - Backend: `cargo test` for unit tests; integration tests in `src-tauri/tests/`.
  - Frontend: Vitest for unit tests; component tests where state logic is non-trivial.
  - End-to-end: deferred; manual testing on the host macOS is the verification path in Phase 1.
- **One window, many workspaces.** The wrapper is single-window. Multiple projects open simultaneously = multiple workspaces inside that one window, switched via filmstrip tiles. Multi-window for the main wrapper is explicitly out of scope. The only auxiliary windows are: the PiP NSPanel (Phase 2 conditional), the menu-bar popover (Phase 2), and Sublime windows the user pops via hotkey.
- **Tab-shell substrate ships in Phase 1.** Even though Phase 1 only ever opens one workspace at a time, the WorkspaceList + Center Stage + (empty) Filmstrip layout is built from day one. Phase 2 plugs into the existing structure rather than reshaping it. Design for N=1 with N>1 in mind.
- **All workspaces stay mounted.** Switching the center stage is `display: none` / `display: block` toggling, never an unmount/remount. PTY connections persist across switches; CC sessions in background workspaces continue to receive output (buffered to xterm scrollback).
- **xterm.js DOM renderer only.** Do not load `@xterm/addon-webgl`. The WebGL renderer caps at ~16 contexts per page across all xterm instances on the page combined; with a multi-workspace tab shell that's a real ceiling, and the modern DOM renderer is fast enough for the foreground workspace. If a single-workspace user ever proves the DOM renderer can't keep up, the decision is reversible (one-line addon load) — but never load it speculatively.
- **Single `WebviewWindow`, no multi-webview.** Tauri 2's multi-webview API is `unstable`-flagged and offers webview isolation we don't need (all workspaces share the wrapper's trust boundary). All workspaces are React components in one webview.
- **No `.wrapper.json` per repo.** Project list is centralized at `~/Library/Application Support/stayman-cc-wrapper/projects.json`. Adding or removing a project is a UI action, not a per-repo file edit.
- **`CcSession` trait is a stable seam.** The wrapper's "how to drive CC" path goes through `CcSession`. Phase 1 has `PtyCcSession`; never bypass the trait when calling CC from anywhere else. Phase 2 extends the trait with `state_events()` and `recycle()`; future work could swap to an `SdkCcSession`.
- **PTY byte-injection for input; hook channel for state.** We write bytes into the CC pty for any "send a slash command" operation. We do NOT parse CC's output text to infer state. Workflow state is read from `workflow/.session.md` and similar files via a file watcher (Phase 2). CC's idle/running/awaiting-input state is read from CC's official hook channel (`UserPromptSubmit` / `Stop` / `Notification` events written to `~/.claude/settings.json`), delivered to the wrapper via Unix socket (Phase 2). NEVER from PTY output.
- **CC hook channel uses Unix socket, not shared file.** Resolved by research: with three concurrent status-surface consumers (filmstrip, menu-bar, PiP), Unix-socket multi-consumer concurrency wins decisively. The wrapper opens the socket on launch; the installed CC hook script writes one JSON line per event.
- **Status broadcaster fans out one stream to three subscribers.** Filmstrip (main webview), menu-bar popover (separate webview), and PiP (NSPanel webview) all subscribe to the same Tauri-event-channel broadcast of `WorkspaceStatusUpdate`. All three surfaces agree at all times.
- **Menu-bar status item ships before PiP in Phase 2.** The Phase 2 plan includes a dogfooding gate after the menu-bar item lands: at least one daily-driver week using menu-bar alone before building PiP. If menu-bar covers the "wrapper hidden" case, PiP defers to Phase 4.
- **Drive mode lives in the WIP file's frontmatter.** Phase 2's drive-mode selector writes to the active WIP file's `drive_mode:` field — that field is the source of truth for the workflow's pause-policy logic. The wrapper UI mirrors `projects.json` `default_drive_mode` only as a fallback for the gap between WIP files (e.g., right after `feature-finalize`). Never let the UI hold an in-memory drive mode that disagrees with the WIP frontmatter; always re-read on mount.
- **Pre-risky-action checklist for scaffolders.** Scaffolders (`create-tauri-app`, `npm create *`, etc.) can wipe strategic docs. Before running one in a non-empty dir, ensure git is clean and scaffold into a sibling dir then merging. The strategic docs in `docs/product/`, the root `CLAUDE.md`, and the `_ref/` symlink are load-bearing and must survive any scaffold.

## Current Phase

**Phase 1: Bare Shell + Tab Substrate (PoC).** Goal: prove the Tauri shell + embedded terminal + project picker + tab-shell substrate work together; replace the "open terminal + cd + run claude" step at the user-visible level, while shipping the WorkspaceList / Center Stage / (empty) Filmstrip layout that Phase 2 will populate. Exit criteria: click a project → working CC session running in the project dir inside a workspace within the wrapper window, in <10s; Sublime Text pops via hotkey when needed; the WP4 thumbnail-rendering probe has produced a documented pass/fail outcome that selects Phase 2's filmstrip rendering strategy (live ~1 fps mirrors or status tiles).

Work packages (see `docs/product/wbs.md` for detail):
- **WP1** Tauri 2 scaffold + dev environment
- **WP2** Probe — CC under host-driven PTY byte-injection
- **WP3** Probe — Sublime Text / Sublime Merge CLI shapes
- **WP4** Probe — thumbnail-rendering cost at N=8 workspaces (gates Phase 2 filmstrip strategy)
- **WP5** Frontend UI prototype (tab-shell substrate from day one)
- **WP6** Project config store
- **WP7** PtyCcSession — embedded CC terminal
- **WP8** Global hotkey for Sublime Text pop
- **WP9** Phase 1 polish + exit-criteria verification

Critical path: WP1 → WP5 → WP6 → WP7 → WP9. WP2 / WP3 / WP4 are probes that run in parallel as soon as WP1 unblocks them.

**First feature to pick up:** WP1 — Tauri 2 project scaffold + dev environment.

## Key Decisions

- **Tauri 2 over Electron.** Aligned with the "lite over featureful" principle. Bundle ~3MB vs ~96MB; ~30–40MB RAM vs ~200–300MB idle; startup <500ms vs 1–2s. The smaller ecosystem maturity is acceptable for a single-user tool.
- **`tauri-plugin-pty` / `portable-pty` over node-pty + sidecar.** node-pty would require shipping a Node runtime in the bundle, defeating the bundle-size advantage. portable-pty runs natively in the Rust core.
- **PTY byte-injection over Agent SDK for v1.** The vision requires the familiar interactive CC TUI inside the workspace. The wrapper *is* the terminal, so injecting bytes for slash commands is legitimate; we avoid the "PTY scraping" anti-pattern (parsing output text for state) by using the hook channel + file-watching for state detection in Phase 2. The `CcSession` trait is the future-swap seam for Agent SDK if/when needed.
- **Single window, many workspaces (replaces "one project per window").** Reversed during the 2026-06-15 product revision. Multiple projects = workspaces inside one window, switched via filmstrip tiles. Aligned with the revised vision.
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
- **macOS Accessibility permission flow on first launch.** Required by `tauri-plugin-global-shortcut`; surfaced as part of WP8.
- **Phases 2–4 not decomposed yet.** Phase 1 decomposition is full; Phases 2–4 are WP-headline only. Premature decomposition would force decisions about later-phase internals before Phase 1 surfaces real constraints.
- **PiP click-to-focus is a Future Possibility, not v1.** Display-only PiP first; promote-on-click deferred until dogfooding confirms the limitation is real.
- **Workflow state-machine enforcement & claude-time integration are future possibilities, NOT in the initial roadmap.** Architecturally we leave room for them (see `docs/product/vision.md` → "Future Possibilities") but don't build toward them in Phases 1–4.
