# Stayman CC Wrapper

## Project Overview

A macOS-only, single-user, open-source "lite IDE" wrapper that puts the daily Claude Code + Sublime Text workflow in one window. The pain point: starting work on any given project takes minutes of repetitive setup (open terminal → cd → `claude`, open Sublime Text and load project, open Sublime Merge and load again, occasionally a second terminal and cd again). Over 20+ rotating projects with 3–4 in flight on any given day, this cost compounds.

The wrapper provides:
- **VSCode-style project picker** — click a project → full environment fires up in <10s
- **Left half:** Claude Code in a true PTY-backed terminal, yolo mode by default, already `cd`'d into the project
- **Right half:** a placeholder in Phase 1; a built-in lite editor + git diff viewer arrives in Phase 3
- **Stateful CC controller (Phase 2):** the wrapper owns the CC process lifecycle, watches workflow state files, and exposes workflow operations (skill buttons, Recycle Session) as clicks rather than typed slash commands
- **Always-visible cross-window CC status indicator (Phase 2):** every wrapper window's header shows idle/running of *every* open wrapper instance, so juggling 3–4 projects no longer needs window-clicking to find the awaiting-input one. Detection uses CC's official hook channel (`UserPromptSubmit` / `Stop` / `Notification` via `~/.claude/settings.json`) — never PTY output scraping. Cross-window state is shared via a small file in the app-support dir.
- **Sublime hotkey-pop:** the real Sublime Text and Sublime Merge are one keystroke away for the rare cases the built-in tools don't cover

Audience: a single user (Stayman) running the custom workflow system at `~/.claude/skills/` against many projects on macOS. Open-sourced for others with the same setup; no design concession for users who don't share the workflow.

Full vision, roadmap, research, architecture, and WBS live in `docs/product/`.

## Tech Stack

- **Tauri 2** (2.9.x line) — Rust desktop framework with native WKWebView on macOS; ~3MB bundle, ~30–40MB RAM idle
- **Rust** (stable, ≥1.77) — backend: process lifecycle, PTY, filesystem, global shortcuts, project config persistence
- **TypeScript + React 19 + Vite** — frontend
- **xterm.js** (`@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl`) — terminal renderer
- **`tauri-plugin-pty`** (wraps `portable-pty`) — embedded PTY in the Rust core (NOT node-pty + sidecar)
- **`tauri-plugin-global-shortcut`** — global hotkeys for Sublime-pop (requires macOS Accessibility permission)
- **`tauri-plugin-fs`** / **`tauri-plugin-dialog`** / **`tauri-plugin-shell`** — file IO, file dialogs, external process launch
- **No database** — project list is a flat JSON file at `~/Library/Application Support/stayman-cc-wrapper/projects.json`
- **No backend infrastructure** — single-user desktop app

## Project Structure

Phase 1 will grow the tree into the standard Tauri 2 + Vite shape (added during WP1):

```
stayman-cc-wrapper/
├── CLAUDE.md                  # this file
├── CHANGELOG.md               # append-only narrative log (created on first feature close)
├── README.md                  # minimal; full version in Phase 4
├── docs/
│   └── product/               # vision, roadmap, research, arch, wbs, context
├── workflow/
│   ├── wip/                   # active feature/task/incident items
│   ├── backlog.md             # SURFACE discoveries
│   └── archive/               # completed items
├── src/                       # frontend (React + TS)
│   ├── components/
│   ├── state/
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
- **One project per window.** Multi-project tabs in a single window are explicitly out of scope. Multiple projects = multiple wrapper windows. App state is single-project.
- **No `.wrapper.json` per repo.** Project list is centralized at `~/Library/Application Support/stayman-cc-wrapper/projects.json`. Adding or removing a project is a UI action, not a per-repo file edit.
- **`CcSession` trait is a stable seam.** The wrapper's "how to drive CC" path goes through `CcSession`. Phase 1 has `PtyCcSession`; never bypass the trait when calling CC from anywhere else.
- **PTY byte-injection for input; file-watching for state.** We write bytes into the CC pty for any "send a slash command" operation. We do NOT parse CC's output text to infer state. Workflow state is read from `workflow/.session.md` and similar files via a file watcher (Phase 2). CC's idle-vs-running state (Phase 2 status indicator) is read from CC's official hook channel (`UserPromptSubmit` / `Stop` / `Notification` events written to `~/.claude/settings.json`), NOT from PTY output.
- **Pre-risky-action checklist for scaffolders.** Scaffolders (`create-tauri-app`, `npm create *`, etc.) can wipe strategic docs. Before running one in a non-empty dir, ensure git is clean and consider scaffolding into a sibling dir then merging. The strategic docs in `docs/product/` are load-bearing and must survive any scaffold.

## Current Phase

**Phase 1: Bare Shell PoC.** Goal: prove the Tauri shell + embedded terminal + project picker work together; replace only the "open terminal + cd + run claude" step. Exit criteria: click a project → working CC session running in the project dir, in <10s; Sublime Text pops via hotkey when needed.

Work packages: WP1 (scaffold) → WP2 (CC PTY probe) + WP3 (Sublime CLI probe) → WP4 (UI prototype) → WP5 (config store) → WP6 (PtyCcSession) → WP7 (Sublime hotkey) → WP8 (polish + exit verification). See `docs/product/wbs.md` for detail.

**First feature to pick up:** WP1 — Tauri 2 project scaffold + dev environment.

## Key Decisions

- **Tauri 2 over Electron.** Aligned with the "lite over featureful" principle. Bundle ~3MB vs ~96MB; ~30–40MB RAM vs ~200–300MB idle; startup <500ms vs 1–2s. The smaller ecosystem maturity is acceptable for a single-user tool.
- **`tauri-plugin-pty` / `portable-pty` over node-pty + sidecar.** node-pty would require shipping a Node runtime in the bundle, defeating the bundle-size advantage. portable-pty runs natively in the Rust core. (This is a correction from the original roadmap text, applied during WP1.)
- **PTY byte-injection over Agent SDK for v1.** The vision requires the familiar interactive CC TUI in the left pane. The wrapper *is* the terminal, so injecting bytes for slash commands is legitimate; we avoid the "PTY scraping" anti-pattern (parsing output text for state) by using file-watching for state detection in Phase 2. The `CcSession` trait is the future-swap seam for Agent SDK if/when needed.
- **One project per window.** Simpler state; multi-project = multiple wrapper windows. Window management is the OS's job.
- **Flat JSON for the project list, no DB.** ≤100 entries; read-on-open, write-on-update; JSON is appropriate.
- **No per-project config file in the project itself.** Centralized list in app support dir aligns with the "no per-project config burden" principle.
- **Host-based dev environment, not Docker.** Tauri targets host WKWebView and native windowing; Docker on macOS cannot provide them.
- **`--dangerously-skip-permissions` (yolo) by default.** Vision-explicit. Phase 4 setting will let users opt out.
- **macOS Accessibility permission flow on first launch.** Required by `tauri-plugin-global-shortcut`; surfaced as part of WP7.
- **Phases 2–4 not decomposed yet.** Phase 1 decomposition is full; Phases 2–4 are WP-headline only. Premature decomposition would force decisions about later-phase internals before Phase 1 surfaces real constraints.
- **Workflow state-machine enforcement & claude-time integration are future possibilities, NOT in the initial roadmap.** Architecturally we leave room for them (see `docs/product/vision.md` → "Future Possibilities") but don't build toward them in Phases 1–4.
