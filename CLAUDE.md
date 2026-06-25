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
- **One window, many workspaces.** Claudesk is single-window. Multiple projects open simultaneously = multiple workspaces inside that one window, switched via filmstrip tiles. Multi-window for Claudesk itself is explicitly out of scope. The standing auxiliary surfaces are: the PiP NSPanel (Phase 2 conditional) and the menu-bar popover (Phase 2). **Both Sublime tools (Text + Merge) are kept permanently** (revised 2026-06-20, WP8) — launched on demand via icon buttons in the right-panel tab row (`sublime_open` / `smerge_open`). The popped Sublime windows are external apps, not Claudesk windows, so they don't violate the single-window rule. *(The earlier "Sublime Text pop is a temporary stopgap removed once the in-app editor lands" framing is superseded — WP8 kept it.)*
- **Tab-shell substrate ships in Phase 1.** Even though Phase 1 only ever opens one workspace at a time, the WorkspaceList + Center Stage + (empty) Filmstrip layout is built from day one. Phase 2 plugs into the existing structure rather than reshaping it. Design for N=1 with N>1 in mind.
- **All workspaces stay mounted.** Switching the center stage is `display: none` / `display: block` toggling, never an unmount/remount. PTY connections persist across switches; CC sessions in background workspaces continue to receive output (buffered to xterm scrollback).
- **xterm.js DOM renderer only.** Do not load `@xterm/addon-webgl`. The WebGL renderer caps at ~16 contexts per page across all xterm instances on the page combined; with a multi-workspace tab shell that's a real ceiling, and the modern DOM renderer is fast enough for the foreground workspace. If a single-workspace user ever proves the DOM renderer can't keep up, the decision is reversible (one-line addon load) — but never load it speculatively.
- **Single `WebviewWindow`, no multi-webview.** Tauri 2's multi-webview API is `unstable`-flagged and offers webview isolation we don't need (all workspaces share Claudesk's trust boundary). All workspaces are React components in one webview.
- **No `.claudesk.json` per repo.** Project list is centralized at `~/Library/Application Support/com.claudesk.app/projects.json` (the bundle-identifier path `app_data_dir()` returns). Adding or removing a project is a UI action, not a per-repo file edit.
- **`CcSession` trait is a stable seam.** Claudesk's "how to drive CC" path goes through `CcSession`. Phase 1 has `PtyCcSession`; never bypass the trait when calling CC from anywhere else. Phase 2 extends the trait with `state_events()` and `recycle()`; future work could swap to an `SdkCcSession`.
- **PTY byte-injection for input; hook channel for state.** We write bytes into the CC pty for any "send a slash command" operation. We do NOT parse CC's output text to infer state. Workflow state is read from `workflow/.session.md` and similar files via a file watcher (Phase 2). CC's idle/running/awaiting-input state is read from CC's official hook channel (`UserPromptSubmit` / `Stop` / `Notification` events written to `~/.claude/settings.json`), delivered to Claudesk via Unix socket (Phase 2). NEVER from PTY output.
- **CC hook channel uses Unix socket, not shared file.** Resolved by research: with three concurrent status-surface consumers (filmstrip, menu-bar, PiP), Unix-socket multi-consumer concurrency wins decisively. Claudesk opens the socket on launch; the installed CC hook script writes one JSON line per event.
- **Status broadcaster fans out one stream to three subscribers.** Filmstrip (main webview), menu-bar popover (separate webview), and PiP (NSPanel webview) all subscribe to the same Tauri-event-channel broadcast of `WorkspaceStatusUpdate`. All three surfaces agree at all times.
- **Status-surface order (resequenced 2026-06-22): PiP (M5) ships BEFORE the menu-bar (M6), and PiP is now UNCONDITIONAL.** Supersedes the earlier "menu-bar first, dogfood a week, defer PiP if sufficient" plan — that gate is dropped. All three surfaces (M4 filmstrip, M5 PiP, M6 menu-bar) subscribe to the same M3 status broadcaster regardless of build order. See `roadmap.md` → "Revision 2026-06-22".
- **Drive mode lives in the WIP file's frontmatter.** Phase 2's drive-mode selector writes to the active WIP file's `drive_mode:` field — that field is the source of truth for the workflow's pause-policy logic. Claudesk's UI mirrors `projects.json` `default_drive_mode` only as a fallback for the gap between WIP files (e.g., right after `feature-finalize`). Never let the UI hold an in-memory drive mode that disagrees with the WIP frontmatter; always re-read on mount.
- **Pre-risky-action checklist for scaffolders.** Scaffolders (`create-tauri-app`, `npm create *`, etc.) can wipe strategic docs. Before running one in a non-empty dir, ensure git is clean and scaffold into a sibling dir then merging. The strategic docs in `docs/product/`, the root `CLAUDE.md`, and the `_ref/` symlink are load-bearing and must survive any scaffold.

## Setup & Ecosystem Gotchas

Setup-time pitfalls discovered during WP1 that any fresh checkout will hit.

- **pnpm v11+ moved `onlyBuiltDependencies`.** The allowlist for postinstall scripts now lives in `pnpm-workspace.yaml` as `allowBuilds:`, NOT in `package.json`'s `pnpm.onlyBuiltDependencies` field. On first install, pnpm v11 auto-generates a stub `pnpm-workspace.yaml` containing the literal text `set this to true or false` as a placeholder — that string must be replaced with `true` (or `false`) before `pnpm install` will succeed. Current state: `esbuild: true` in `pnpm-workspace.yaml`.
- **ESLint pinned to v9 LTS.** ESLint v10 (Nov 2025) is incompatible with `eslint-plugin-react` 7.37.x — the plugin uses `contextOrFilename.getFilename` which v10's API removed (`TypeError: contextOrFilename.getFilename is not a function` on every lint run). `eslint` and `@eslint/js` are pinned to `^9` until `eslint-plugin-react` ships a v10-compatible release. Do not bump to v10 without first verifying the plugin has caught up.
- **Prettier ignores strategic docs by design.** `.prettierignore` lists `docs/`, `workflow/`, `CLAUDE.md`, and `runtimes.md` — these are hand-authored prose where Prettier's blank-line-before-bullet-list rewrites are unwanted. Do NOT remove those entries casually; if you need to run Prettier on a sub-tree of those dirs, do it with explicit paths rather than removing the ignore rule. `pnpm format` skips them silently by design.
- **GUI-launched app inherits a minimal PATH (install-only).** A Finder/Dock-launched macOS `.app` inherits the minimal launchd `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), NOT the user's shell `PATH` — so user-installed CLIs (`claude` in `~/.local/bin`, Homebrew/`fnm`/`nvm` bins) are invisible to spawned processes and `cc_spawn` fails with *"No viable candidates found in PATH …"*. This bites **only the installed build** — `pnpm tauri:dev` inherits the launching terminal's full `PATH`, so it never reproduces (operator hit it 2026-06-24 on first real install). Fixed app-wide by `src-tauri/src/env_path/`: at `.setup()` (FIRST, before any spawn) the app captures the login-shell `PATH` (`$SHELL -l -i -c 'printf %s "$PATH"'`, fallback `/bin/zsh`) and `std::env::set_var("PATH", …)` process-wide — best-effort, never blanks an existing `PATH`. If you add another external-CLI spawn, it benefits automatically; do NOT re-introduce per-spawn PATH hacks.

## Current Milestone

**Milestone 4: Multi-workspace UX (filmstrip + center stage).** Goal: N projects open concurrently as workspaces in one Claudesk window, switched via a filmstrip. **M3 + M4 together are the dogfood-replace point** — once M4 ships, Claudesk replaces the operator's current terminal + Sublime setup as the daily driver. Exit criteria: idle/running/awaiting-input of every workspace is visible from inside the window without clicking (expanded filmstrip or collapsed pill row), driven purely by the M3 hook channel (no PTY scraping); clicking a tile — or `⌘⇧+digit` — switches the center stage.

Built on already-shipped seams: the M3 `status_broadcaster` (`workspace-status` event + `WorkspaceStatusUpdate` DTO + cwd→workspace registry), the M1 tab-shell substrate (WorkspaceList + center-stage mount + empty filmstrip slot + `display:none` background-keep-mounted), and the M1 WP4 thumbnail probe's validated `serializeAsHTML()` ~1 fps render path. No `/product-research` + no external-API probe — M4 is pure in-app UX (WP1 is an internal probe of *our* mount cost at N).

Work packages (Milestone 4 — live decomposition in `docs/product/wbs.md`). Critical path **WP1 → WP2 → WP3 → WP4 → WP5**; **WP4b** parallel off WP2:
- **WP1** Probe — N-workspace mount cost with the full M2 stack (editor+diff+terminal) mounted; gates eager-mount vs `React.lazy` the EditorPanel
- **WP2** N>1 lift — picker *appends* a workspace (was N=1 replace); resolve the N=1-clamp ripple (`kill_all` grace-window serialization, `active`-prop leak, terminal panel-seam) + fold in the deferred picker IPC error-surfacing
- **WP3** Filmstrip — one tile per workspace (incl. a static active-marked center-stage tile) + M3-driven status dots + live ~1 fps `serializeAsHTML()` mirror (background tiles only) + click/`⌘⇧+digit` promote + drag-to-reorder (persisted; the `⌘⇧+digit` index)
- **WP4b** Left/right focus indicator — subtle border marking which half (left CC terminal / right panel) of the center-stage workspace holds keyboard focus (parallel; folds in the focus-ambiguity gap)
- **WP4** Filmstrip collapse toggle — expanded thumbnails ↔ collapsed status-pill row; stops the serialize loop on collapse
- **WP5** Verify multi-workspace at N — milestone-exit verification against real N CC sessions

**Status (2026-06-22):**
- **Milestone 4 — WBS WRITTEN** 2026-06-22, live at `docs/product/wbs.md`. Not yet built. **Next: WP1 (the N-workspace cost probe)** via `/feature-plan`.
  - *Operator scope decisions baked in:* WP1 cost-probe opens the milestone (gates mount architecture); picker IPC error-surfacing folded into WP2; the `⌘⇧+digit` workspace-switch hotkey + drag-to-reorder + static center-stage tile folded into WP3 (`⌘⇧+digit` was reserved for exactly this — see memory `cmd-shift-digit-reserved-for-filmstrip`; bare `⌘+digit` is the editor tab-switch); left/right focus indicator added as WP4b; the workflow-doc-hierarchy watcher idea deferred + anchored to **M6** (NOT M4).
- **Milestone 3 (CC lifecycle & state plumbing) — COMPLETE + CLOSED** 2026-06-22 (`/product-finalize`, commit `99b9398`). Critical path WP1→WP2→WP3→WP4→WP6 shipped + live-confirmed (idle→running→awaiting-input observed purely from the hook channel — Perl hook → `AF_UNIX` socket → `status_broadcaster` → `workspace-status` emit → honest indicator). **WP5 (`.session.md` watcher) DROPPED** — wrong file (manual pause bookmark, not a live signal). WBS + WP1 probe outcome archived at `docs/product/archive/milestone-3-cc-lifecycle-state-plumbing/`.
- **Milestone 2 (Lite Editor + Diff Viewer) — COMPLETE + CLOSED** 2026-06-22 (`/product-finalize`, commit `c501e3b`). All WPs shipped + the terminal blank-cursor P1 incident resolved (`d26756e`). WBS + research archived at `docs/product/archive/milestone-2-lite-editor-diff-viewer/`.
- **Milestone 1 (Bare Shell + Tab Substrate PoC) — COMPLETE + CLOSED** 2026-06-19. WP1–WP9 shipped; WBS archived at `docs/product/archive/phase-1-bare-shell-poc/`.
- **Roadmap resequenced dogfood-first** 2026-06-22 (commit `07444cb`): execution order is now M3 → **M4 multi-workspace** → **M5 PiP (unconditional, before menu-bar)** → **M6 menu-bar** → **M7 auto-resume** → **M8 skill-orchestration** → **M9 polish**. The M3 + M4 pair is the dogfood-replace point. See `roadmap.md` → "Revision 2026-06-22".
- **All commits are local-only** (no git remote yet). To publish: `gh repo create claudesk --private --source=. --remote=origin --push`.

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
