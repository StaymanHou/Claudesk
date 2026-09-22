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
- **Smart auto-resume on workspace open (M12 — ✅ SHIPPED 2026-08-05):** opening a project fires the right resumption command by itself and **announces it before you click**. ⚠️ **TWO** signals, not three: unclean-exit flag → spawn with the `--continue` CLI flag; else `.session.md` present → inject `/session-restore`; else **nothing** (`/session-start` is *never* auto-fired — it gets an explicit button). ⚠️ **The unclean flag BEATS `.session.md`.** ⚠️ **`/session-resume` and `/session-pause` DO NOT EXIST** — renamed `/session-restore` / `/session-handoff` at M9 WP5. The refuted three-branch design + precedence proof: `arch/session-resumption.md` → "The two signals".
- **Drive-mode selector on the PICKER ROW (M12; ⚠️ NOT the workspace header):** a compact readout, click to edit, showing the project's drive mode (1 `stepping` / 2 `orchestrated` / 3 `autopilot` / 4 `fsd` — ⚠️ **not** `step-by-step`/`full-autopilot`, which no workflow skill recognizes; authority is upstream `transitions.md`). ⚠️ **As built it IS a native `<select>`** — reversing the "never a live `<select>` on every row" rule, because the four values are a **closed** set and a bad mode string fails serde on read and takes the whole project list down. The model override's open-string rule must NOT be generalized here. See `arch/session-resumption.md` → "The picker-row cell".


- **Sublime launchers (both KEPT permanently — revised 2026-06-20, WP8):** Sublime Text and Sublime Merge are each one click away via icon buttons in the right-panel tab row. ⚠️ The Sublime *Text* pop is **NOT removed** — the in-app editor is the *primary* editing surface, but Sublime Text stays as a permanent escape hatch. See "Key Decisions" below.

Audience — **two tiers** (stance refined 2026-07-20; supersedes the earlier flat "no design concession for users who don't share the workflow"): (1) the **workflow-independent lite-IDE core** — picker, workspaces, PTY terminal, editor/diff, hook-driven status surfaces, time analytics — which any Claude Code user gets out of the box; and (2) an **opt-in, default-OFF workflow-orchestration layer** (M10.9's `workflow_features_enabled` gate) for users who install the companion workflow system at `~/.claude/skills/`. The primary user is a single operator (Stayman) running that system against 20+ rotating projects on macOS. The refinement is not a softening: with the gate OFF the app is byte-identical to one that never had the workflow features, so a secondary user meets **no dead affordances** rather than a diluted tool. See `workflow-system/product/vision.md` §Target Audience + roadmap M10.9.

Full vision, roadmap, research, architecture, and WBS live in `workflow-system/product/`.

## External reference

The companion workflow-system project (`my-claude-code-customization`) is symlinked at `_ref/claude-customization/` (gitignored). It's the source of truth for the workflow skills, orchestrator agents, and `transitions.md` that Claudesk integrates with. Read from it when you need current skill or transition definitions. Notable paths:
- `_ref/claude-customization/workflow-system/product/transitions.md` — pause-policy tables and drive-mode definitions
- `_ref/claude-customization/agents/<workflow>-workflow/AGENTS.md` — orchestrator procedures
- `_ref/claude-customization/skills/` — skill bodies (installed copies live at `~/.claude/skills/`)

## Tech Stack

- **Tauri 2** (2.9.x line) — Rust desktop framework with native WKWebView on macOS; ~3MB bundle, ~30–40MB RAM idle. Single `WebviewWindow` hosts all workspaces (no multi-webview).
- **Rust** (stable, ≥1.77) — backend: process lifecycle, PTY, filesystem, external-tool launch (Sublime via `sublime_open`), project config persistence. Phase 2 also: Unix-socket hook listener + status broadcaster.
- **TypeScript + React 19 + Vite** — frontend. WorkspaceList in React state; all workspaces stay mounted, switching center stage is `display: none` toggling.
- **xterm.js** (`@xterm/xterm` + `@xterm/addon-fit`) — terminal renderer. **DOM renderer only — no `@xterm/addon-webgl`.** Research established that WebGL contexts cap at ~16 per browser page; with a multi-workspace tab shell, the DOM renderer is simpler and good enough for the foreground.
- **`tauri-plugin-pty`** (wraps `portable-pty`) — embedded PTY in the Rust core (NOT node-pty + sidecar).
- **In-app Sublime-pop hotkey** — a webview `⌘⇧E` `keydown` handler owned by the focused workspace (WP8). NOT an OS-global shortcut: no `tauri-plugin-global-shortcut`, no macOS Accessibility permission. (The OS-global approach was built then rejected at verify-human 2026-06-19 — see WP8 in `workflow-system/product/archive/phase-1-bare-shell-poc/wbs.md`.)
- **`tauri-plugin-fs`** / **`tauri-plugin-dialog`** — file IO, file dialogs. (The Sublime launch uses `std::process::Command` directly, not `tauri-plugin-shell`.)
- **Phase 2 additions:** `tauri-nspanel` v2.1 (PiP NSPanel), `tauri-plugin-positioner` with `tray-icon` feature (menu-bar popover positioning), `tauri-plugin-fs-watch` / `notify` (`workflow-system/state/.session.md` file-watcher).
- **No database** — project list is a flat JSON file at `~/Library/Application Support/com.claudesk.app/projects.json` (`app_data_dir()` resolves to the bundle identifier `com.claudesk.app`, not the productName).
- **No backend infrastructure** — single-user desktop app.

## Project Structure

⚠️ Strategic docs + workflow state live under one `workflow-system/` root (migrated 2026-07-28, `aacc687`); `docs/` holds only `lessons/` + `demo/`. **A pre-migration reference to `docs/product/*` or a top-level `workflow/` is stale** — see the tree below for the live layout.

```
claudesk/
├── CLAUDE.md                  # this file
├── CHANGELOG.md               # append-only narrative log
├── README.md                  # + docs/demo/*.gif embeds (M8)
├── runtimes.md                # per-project runtime registry (long-command timeouts)
├── HANDOFF-from-mccc-*.md     # cross-repo handoff notes (companion workflow-system repo)
├── _ref/                      # gitignored — symlinks to companion repos for read-only reference
├── docs/
│   ├── lessons/               # extracted topic docs — verify-self tiers, MCP-bridge caveats,
│   │                          #   sandboxed-$HOME, PiP main-thread rule
│   ├── reference/             # reference material
│   └── demo/                  # filmstrip.gif, pip.gif (M8 demo assets)
├── workflow-system/
│   ├── product/               # vision, roadmap, arch, wbs, design-priors, context
│   │   ├── m11-wbs-parked.md  # M11's decomposition, parked while M10.9 runs
│   │   └── archive/           # <cycle-name>/ per closed milestone (11 so far)
│   └── state/
│       ├── wip/               # active feature/task/incident items
│       ├── backlog.md         # SURFACE discoveries (+ backlog-quality-findings.md)
│       ├── archive/           # completed items
│       └── .session.md        # transient session pointer (gitignored)
├── src/                       # frontend (React 19 + TS)
│   ├── components/
│   │   ├── workspace/         # Workspace, RightPanelHost, Filmstrip, editor/,
│   │   │                      #   diff/, filetree/, search/, dashboard/, finder/
│   │   └── picker/            # ProjectPicker (+ today's ad-hoc settings strip)
│   ├── state/                 # WorkspaceList store, fsChange, appView
│   ├── pip/                   # PiP NSPanel webview entry
│   ├── updater/               # in-app updater UI (M10)
│   ├── menu/                  # menuBridge (native menu → webview)
│   └── probe/                 # dev-only harnesses (not shippable UI)
├── src-tauri/                 # Rust backend (~20 modules)
│   ├── src/
│   │   ├── cc_session/        # CcSession trait + PtyCcSession impl
│   │   ├── config_store/      # projects.json + settings.json persistence
│   │   ├── status_broadcaster/# hook events → workspace-status fan-out
│   │   ├── hook_socket/       # AF_UNIX listener; hook_install/ registers in ~/.claude
│   │   ├── time_store/        # time-analytics SQLite (write-gated) + reclassify/
│   │   ├── editor_fs/ fs_index/ fs_watch/ git_diff/ git_status/
│   │   ├── pip/ tray/ app_menu/ updater/ env_path/ sublime/ finder/
│   │   └── lib.rs, main.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json        # + tauri.dev.json (dev-identity overlay)
│   └── capabilities/
├── tooling/demo/              # dev-only demo-GIF pipeline (M8)
├── tmp/scratch/               # gitignored throwaway repos for verify-self
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
- _(No macOS Accessibility permission needed — the Sublime launchers are in-app buttons, not OS-global shortcuts.)_

### Setup

From a fresh checkout:

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
- **WIP layout.** Active features in `workflow-system/state/wip/<feature>.md` using the Work Tree format (see `~/.claude/CLAUDE.md` → "Work Tree Format"). Discoveries logged in `workflow-system/state/backlog.md`. Completed items archived to `workflow-system/state/archive/`.
- **CHANGELOG.md.** Append-only narrative — `**Feature shipped:** …`, `**Task closed:** …`, `**Backlog resolved:** …`, etc. Closing skills write to it automatically.
- **Code style.**
  - **⚠️ `pnpm verify:auto` IS the per-phase verify-auto gate — run that one command, not a remembered list.** Order: `lint` → `format:check` → `tsc --noEmit` → `vitest` → `cargo fmt --check` → `cargo clippy --all-targets -D warnings` → `cargo test`. ⚠️ **`cargo fmt --check` and `--all-targets` are in there deliberately** (never `--lib`, which skips the test target). Why each step earns its place — no CI/no git hook, the Prettier reflow that broke a `?raw` guard, the `cargo fmt` gap found at paydown WP1: `docs/lessons/verify-auto-gate.md`.
  - Frontend: ESLint + Prettier. TypeScript strict mode on. React 19 function components only.
  - Backend: no `unwrap()` outside of tests; use `?` with typed error returns (`thiserror`).
- **Dark mode only.** Claudesk's UI is **always dark** — it never follows the OS theme. Do NOT add `@media (prefers-color-scheme: light)` blocks or any light-theme tokens. `:root` in `src/App.css` sets `color-scheme: dark` and unconditionally dark color tokens; keep it that way. A light/theme toggle is explicitly out of scope (not even a Phase 4 setting).
- **Tests.**
  - Backend: `cargo test` for unit tests; integration tests in `src-tauri/tests/`.
  - Frontend: Vitest for unit tests; component tests where state logic is non-trivial.
  - End-to-end: deferred; manual testing on the host macOS is the verification path in Phase 1.
  - ⚠️ **Read the four verification lessons below before verifying anything non-trivial — they are the single biggest source of defects here, and each one exists because a green result was wrong.**
  - **Installed-build smoke test (dev-vs-installed parity)** · **scratch workspaces** (`tmp/scratch/scratch-{a,b,c}`, mandatory once a check spawns/answers a CC session) · **⚠️ extracting a pure state machine proves the MACHINE, not its CALLER** (hit twice in M11 WP4, one a shipped CRITICAL — funnel shared-state writes through ONE function and guard *that*). ⚠️ Anything touching PATH, env vars, or external-process spawning MUST be smoke-tested from an installed `.app` launched from Finder/Dock; `pnpm tauri:dev` inherits the terminal's env and will not reproduce GUI-PATH failures. → `docs/lessons/verify-self-tiers.md`
  - **⚠️ Live verify-self via the `tauri` MCP bridge** — prefer it over carrying visual/DOM checks to the operator, but read the caveats first: several have produced false verdicts, including (h) a freshly-opened CC pane reading blank, (i) the xterm DOM not being the buffer, and (l) `__TAURI_INTERNALS__` having no `invoke` property to patch. ⚠️ Instrument **agreement is not correctness** when both share a defect, and **never conclude "no IPC happened" from a JS-level tap without a positive control**. → `docs/lessons/mcp-tauri-bridge-caveats.md`
  - **⚠️ Guards that report green while checking nothing** — a numbered catalogue of ways a guard stops checking (`?raw`/`include_str!` source guards, filtered test runs that print `ok. 0 passed` and **exit 0**, entry 11: an ordering assertion is blind to any step that emits no observable; entry 12: a substring that OCCURS at the site is not ANCHORED to it — `grep -c` it first; ⚠️ **entry 13: a ONE-DIRECTIONAL guard cannot see OMISSIONS** — promoting a drifting artifact to typed data takes **two** guards, forward AND reverse, and the reverse is the one that bites; ⚠️ **entry 14: the match can be REAL but its POLARITY inverted** — a `grep -c "X" → 0` outcome cannot tell an *instruction* from a *prohibition against re-adding it*, and removal work is exactly where that collides, because good removal leaves a "do not bring this back" note. Scope the window to fenced code blocks and pair it with a positive control; ⚠️ **entry 15: a LENGTH-only assertion standing in for an IDENTITY one** — the highest-frequency shape here, it produced **three of four** holes in one WP and the third fell to it *while closing it*, so also ask whether your FIXTURE makes the right and wrong answers identical (an empty store, a `null` getter, a two-element run all collapse the distinction); ⚠️ **entry 16: a fix applied to the arm a hunt SURFACED is not a fix** — enumerate every exit of the function and sweep, because a mutation hunt finds *an* instance, never the class). Two questions before trusting one: *could this pass if the code it names were deleted?* and *which steps can actually APPEAR in what I am asserting over?* ⚠️ Mutation-prove each form **INDIVIDUALLY** and confirm the mutant landed in **executable** code — an invalid probe and a real hole look identical. Also holds the **comment budget** rule. → `docs/lessons/source-text-guards.md`
  - **Sandboxed-`$HOME` launch** — verifying a `~/`-touching feature without touching the operator's real home. ⚠️ The `RUSTUP_HOME`/`CARGO_HOME`/`PATH` overrides are mandatory, not optional. → `docs/lessons/sandboxed-home-verification.md`
- **One window, many workspaces.** Claudesk is single-window; N projects = N workspaces inside it, switched via filmstrip tiles. ⚠️ **Multi-window for Claudesk itself is explicitly out of scope.** The only auxiliary surfaces are the PiP NSPanel (M5) and the menu-bar popover (M6). Popped Sublime windows are external apps, not Claudesk windows, so they don't violate this (see the Sublime launcher decision below).
- **Tab-shell substrate ships in Phase 1.** Even though Phase 1 only ever opens one workspace at a time, the WorkspaceList + Center Stage + (empty) Filmstrip layout is built from day one. Phase 2 plugs into the existing structure rather than reshaping it. Design for N=1 with N>1 in mind.
- **All workspaces stay mounted.** Switching the center stage is `display: none` / `display: block` toggling, never an unmount/remount. PTY connections persist across switches; CC sessions in background workspaces continue to receive output (buffered to xterm scrollback).
- **xterm.js DOM renderer only.** Do not load `@xterm/addon-webgl`. The WebGL renderer caps at ~16 contexts per page across all xterm instances on the page combined; with a multi-workspace tab shell that's a real ceiling, and the modern DOM renderer is fast enough for the foreground workspace. If a single-workspace user ever proves the DOM renderer can't keep up, the decision is reversible (one-line addon load) — but never load it speculatively.
- **Single `WebviewWindow`, no multi-webview.** Tauri 2's multi-webview API is `unstable`-flagged and offers webview isolation we don't need (all workspaces share Claudesk's trust boundary). All workspaces are React components in one webview.
- **No `.claudesk.json` per repo.** Project list is centralized at `~/Library/Application Support/com.claudesk.app/projects.json` (the bundle-identifier path `app_data_dir()` returns). Adding or removing a project is a UI action, not a per-repo file edit.
- **`CcSession` trait is a stable seam.** Claudesk's "how to drive CC" path goes through `CcSession`. Phase 1 has `PtyCcSession`; never bypass the trait when calling CC from anywhere else. Phase 2 extends the trait with `state_events()` and `recycle()`; future work could swap to an `SdkCcSession`.
- **PTY byte-injection for input; hook channel for state. ⚠️ NEVER from PTY output.** We write bytes into the CC pty to send a slash command, but we do **not** parse CC's output text to infer state: workflow state comes from `workflow-system/state/.session.md` via a file watcher, and CC's idle/running/awaiting-input state from its official hook channel over a Unix socket. ⚠️ **`PostToolUse` is the answer-resume signal** (answering a prompt fires it, NOT `UserPromptSubmit`), and **`Notification`→AwaitingInput is gated on `notification_type`** backend-side in `status_broadcaster::event_to_state`. ⚠️ **An UNLISTED `notification_type` falls back to AwaitingInput — right for input-needed types, WRONG for completion ones; classify each new one deliberately** (M13.5 WP2: `agent_completed` fell through and lit the dot blue; `SubagentStop` was never involved). ⚠️ **FOUR states, not three** — `Stop`+`background_task_count>0` → `BackgroundWork` (purple); a **count, never the tasks**. Full event table, 5-type vocabulary, socket path: `workflow-system/product/arch/status-channel-and-surfaces.md`.
- **CC hook channel uses Unix socket, not shared file.** Resolved by research: with three concurrent status-surface consumers (filmstrip, menu-bar, PiP), Unix-socket multi-consumer concurrency wins decisively. Claudesk opens the socket on launch; the installed CC hook script writes one JSON line per event.
- **Status broadcaster fans out one stream to three subscribers.** Filmstrip (main webview), menu-bar popover (separate webview), and PiP (NSPanel webview) all subscribe to the same Tauri-event-channel broadcast of `WorkspaceStatusUpdate`. All three surfaces agree at all times.
- **⚠️ PiP/NSPanel window ops MUST run on the main thread.** Any background-thread/timer path calling a PiP window op must marshal via `app.run_on_main_thread(…)`. Off-main-thread AppKit ops **abort the process with a native exception and NO Rust panic** — invisible to `cargo test`, presenting as clean-launch-then-silently-die. ⚠️ **`#[command]` fns + `on_window_event` are main-thread — which cuts BOTH ways:** an AppKit call inside one is safe, but a `thread::sleep`/blocking poll, or a lock held across a main-thread-marshaling call, **freezes the UI**. A sync `cc_kill` doing exactly this hung the app (P1 2026-08-25; `sample` was the instrument that found it). Blocking work belongs on a worker (`SessionRegistry::take` + `thread::spawn`). See `docs/lessons/pip-nspanel-main-thread.md`.
- **⚠️ Drive mode: Claudesk NEVER writes the WIP file's frontmatter — REVERSED 2026-08-06** (M12 WP4; the WIP-frontmatter mirror was **rejected**). **As built:** stored per-project in `projects.json` (`default_drive_mode`), delivered as an env-var-gated `UserPromptSubmit` hook `additionalContext` line; companion skills unchanged. **Claudesk reads the workflow's world; it does not write it.** Why the mirror could not work + the full pipeline: `arch/session-resumption.md` → "The drive-mode signal".
- **Pre-risky-action checklist for scaffolders.** Scaffolders (`create-tauri-app`, `npm create *`, etc.) can wipe strategic docs. Before running one in a non-empty dir, ensure git is clean and scaffold into a sibling dir then merging. The strategic docs in `workflow-system/product/`, the root `CLAUDE.md`, and the `_ref/` symlink are load-bearing and must survive any scaffold.

## Setup & Ecosystem Gotchas

Setup-time pitfalls discovered during WP1 that any fresh checkout will hit.

- **pnpm v11+ moved `onlyBuiltDependencies`.** The allowlist for postinstall scripts now lives in `pnpm-workspace.yaml` as `allowBuilds:`, NOT in `package.json`'s `pnpm.onlyBuiltDependencies` field. On first install, pnpm v11 auto-generates a stub `pnpm-workspace.yaml` containing the literal text `set this to true or false` as a placeholder — that string must be replaced with `true` (or `false`) before `pnpm install` will succeed. Current state: `esbuild: true` in `pnpm-workspace.yaml`.
- **ESLint pinned to v9 LTS.** ESLint v10 (Nov 2025) is incompatible with `eslint-plugin-react` 7.37.x — the plugin uses `contextOrFilename.getFilename` which v10's API removed (`TypeError: contextOrFilename.getFilename is not a function` on every lint run). `eslint` and `@eslint/js` are pinned to `^9` until `eslint-plugin-react` ships a v10-compatible release. Do not bump to v10 without first verifying the plugin has caught up.
- **Prettier ignores strategic docs by design.** `.prettierignore` lists `docs/`, `workflow-system/` (was `workflow/` before the 2026-07-28 layout migration — the pattern was updated with it, so the unified root stays protected), `CLAUDE.md`, and `runtimes.md` — these are hand-authored prose where Prettier's blank-line-before-bullet-list rewrites are unwanted. Do NOT remove those entries casually; if you need to run Prettier on a sub-tree of those dirs, do it with explicit paths rather than removing the ignore rule. `pnpm format` skips them silently by design.
- **A dependency spike must live OUTSIDE the repo tree — `tmp/` being gitignored does NOT isolate a pnpm install.** Running `pnpm add` inside the repo's gitignored `tmp/` still **rewrites the tracked `pnpm-lock.yaml`**: pnpm resolves upward to the workspace root and does not honor gitignore for that resolution (the tell is `../..` in its progress output). **`package.json` is left untouched**, so the usual "did I add a dep?" check — grepping `package.json` — reports clean while the lockfile is dirty. Put library bake-offs / "just try it in a sandbox dir" spikes in the **session scratchpad** (outside the repo) instead, and when verifying a no-footprint claim check **`pnpm-lock.yaml` explicitly**, not just `package.json`. Hit 2026-08-01 (M11 WP1) while spiking two markdown renderers; caught by `git status` before any commit and reverted. Not to be confused with `[[pnpm-exec-shadows-local-binaries]]`, which is about `pnpm exec <bin>` silently shadowing a local binary.
- **GUI-launched app inherits a minimal PATH (install-only).** A Finder/Dock-launched macOS `.app` inherits the minimal launchd `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), NOT the user's shell `PATH` — so user-installed CLIs (`claude` in `~/.local/bin`, Homebrew/`fnm`/`nvm` bins) are invisible to spawned processes and `cc_spawn` fails with *"No viable candidates found in PATH …"*. This bites **only the installed build** — `pnpm tauri:dev` inherits the launching terminal's full `PATH`, so it never reproduces (operator hit it 2026-06-24 on first real install). Fixed app-wide by `src-tauri/src/env_path/`: at `.setup()` (FIRST, before any spawn) the app captures the login-shell `PATH` (`$SHELL -l -i -c 'printf %s "$PATH"'`, fallback `/bin/zsh`) and `std::env::set_var("PATH", …)` process-wide — best-effort, never blanks an existing `PATH`. If you add another external-CLI spawn, it benefits automatically; do NOT re-introduce per-spawn PATH hacks.

## Current Milestone

⚠️ **M15 AS-BUILT LIVES AT `workflow-system/product/arch/workflow-supervisor.md`** (written at WP5, 2026-09-15) — the typed policy graph, turn-end detection, the `claude -p` adjudicator, context-pressure recycle, observability, and the mccc ownership boundary. **Read it before touching the supervisor.** Four things it settles that must NOT be re-derived: the cell vocabulary is **FIVE values, not a boolean** (`AUTO`/`PAUSE`/`AUTO-SKIP`/`SKIP`/`n/a`, plus Mode 0 outside the four); policy rows key on **STEP, not transition ID** (19 of 27 feature rows), so edge→row is derivation work; `verify-human` is the matrix's **ONE conditional cell** and `resolveCell`'s fallback to **`pause`** is a safety property (a fire there is read by CC **as the operator's reply**); and the supervisor is **headless — it owns NO guard arm**, so the OFF-invariant pin stays at 6 arms / **9** subjects (arms 4, 5 and 6 each own two).

⚠️ **THE ACTIVE CYCLE IS M14's REMAINDER — decomposed 2026-09-15 into 5 WPs (`workflow-system/product/wbs.md`).** ⚠️ **M14 IS SPLIT: do NOT decompose it as a whole** — its release half shipped as `v0.4.0` and 2 of its 4 roadmap deliverables are already `[x]`. **Two operator rulings were taken at decomposition and must NOT be re-litigated:**

- ⚠️ **R-1 — SIGNING REVERSES THE M10 DECISION.** `arch/build-update-release.md` records *"Unsigned + minisign, not notarized — $99 NOT purchased, a deliberate accepted cost"* and had reconciled M14 down to *inherit and document* it, while naming M14 as the home of *"a future notarize-yes reversal."* **That reversal is taken**, so signing is an **implementation** deliverable, not a documentation one. ⚠️ **The operator was NOT enrolled at decomposition** — Apple Developer enrollment (~$99/yr, **24h published / 2–7+ weeks reported (2026)**) is an **operator-only** task and the milestone's **long pole**; it is calendar-bound, not effort-bound. ⚠️ **minisign STAYS — notarization is ADDITIVE, and the trust anchor `774E2E8429FDF78A` must NOT change** or every existing install is stranded. **Payoff:** deletes the self-quarantine-clear mechanism, the `QUARANTINE_FALLBACK_ACTIVE` seam + fallback dialog, and **six README `xattr` sites**. ⚠️ **Highest technical risk: hardened runtime is MANDATORY for notarization and may break subprocess spawning (`claude`, `subl`, PTY)** — probed at WP1 task 1.6; a break there is a **NO-GO**, not something to work around. ⚠️ It would be **invisible in `pnpm tauri:dev`** and appear only in an installed build.
- ⚠️ **R-2 — SETTINGS NARROWED TO HOTKEYS ONLY.** **Project-list management is DROPPED from M14** — dropped, *not* deferred; if wanted later it re-enters as new work, not as an unticked M14 leftover. ⚠️ **EXTEND the `⌘,` panel M10.9 WP2 built; do not rebuild it.** ⚠️ **11 `*Chord.ts` predicate modules already exist** sharing `chordEvent.ts` — WP3 **centralizes what exists**, it does not write keyboard handling from scratch.

**⚠️ M13 (Skill orchestration, closed 2026-08-18) and M13.5 (QoL polish bucket, closed 2026-08-26) — their eight "must NOT re-derive" properties are EXTRACTED, not dropped:** `docs/lessons/closed-cycles-m13-m13-5.md`. Read it before touching the status enum, the skill row, the OFF-invariant guard, Recycle's flag semantics, or the dev profile's permission mode. ⚠️ **Four of those bind M15 directly** and are restated above where they bite: the guard's **six arms / NINE subjects** (arms 4, 5 and 6 each own two; a new surface owns the seventh ARM), the fixed-five skill row (`skills_dir_exists` is **not** its gate), the post-Recycle flag reading `true` by design, and `cc_permission_mode: "dontAsk"` suppressing a prompt **without granting the write** (read at **spawn**; the pane footer is the tell).

⚠️ **A deleted ES-module export is a RUNTIME failure, not just a `tsc` error** — it cost M13.5 WP3 a blank app and a voided verify cycle (`verify:auto` and `tsc` both green while `#root` was empty and the "live" reads came from a pre-deletion bundle). **Never split an export deletion from its consumer migration across phases; run a boot smoke-test before trusting any live observation on a phase that deleted anything.** Full write-up: the `high`-priority entry in `backlog.md`.

⚠️ **A release is a VERIFICATION prerequisite, not just distribution** — M13.5 WP1's installed-`.app` tier was unsatisfiable because the installed build predated the feature (`25a68bc` was not an ancestor of `v0.3.4`). ✅ **It IS in `v0.4.0`**, so that deferred check is now **unblocked** once a `brew upgrade` lands: *does the window remember size/position/maximized across a relaunch of the INSTALLED app?*

## Milestone 15 — CLOSED 2026-09-15 (inserted 2026-08-14; decomposed 2026-09-07)

> ⚠️ **This section is RETAINED AS REFERENCE, not as active work.** M15 shipped all 5 WPs and was cycle-finalized 2026-09-15. Its constraints below still bind anyone touching the supervisor — but the **live half was never observed** (`SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`, high). **The active cycle is M14's remainder — see `## Current Milestone`.**
>
> ⚠️ **M15's WBS + probe outcomes are archived at `workflow-system/product/archive/milestone-15-workflow-supervisor/wbs.md`.** ⚠️ **When reading it, read the `DEFERRED-*` status tags, NOT the `[x]` checkboxes** — WP4's five behavioral checks and WP5's live-observation phase were **deferred to dogfooding by operator decision, not passed.**

**⚠️ Four M15 rulings taken at a `/util-grill-me` pass 2026-09-07 — DECIDED, do not re-litigate** (full text + accepted costs: `wbs.md` → "Operator rulings"):

1. **R-1 — the STORED drive mode is the authority; Mode 0 is NOT honored as a suppressor.** If `projects.json` says `autopilot`, enforce autopilot regardless of how the turn was entered. ⚠️ Forced by measurement: only **3 of 206** skill-using sessions carry a `/session-start` marker while **139** chained ≥2 skills — honoring Mode 0 literally would suppress firing on ~all real sessions and ship the milestone dead. Accepted cost: a deliberate one-step run may get chained; recovery is CC's **Esc**. ⚠️ **Probe Q4 is therefore an OPPORTUNITY, not a gate.**
2. **R-2 — the recycle threshold is an ABSOLUTE TOKEN COUNT, not a percentage.** ⚠️ **Deletes the model→window map entirely** — see the refutation below. `roadmap.md`'s "above 50%" is **superseded**.
3. **R-3 — rebuild the break fixture FRESH; the old "19 breaks / 46+5 pauses" are historical CONTEXT, not the acceptance criterion.** They exist only as prose and **the original selection method is unrecorded**, so chasing "the same 19" means fitting the detector to a list nobody can verify.
4. **R-4 — the verdict lives in TYPESCRIPT; Rust does file IO only.** No new backend→frontend IPC direction is built. Keeps the policy graph **single-sided** so "funnel every policy read through ONE function" stays structurally easy. Accepted cost: the supervisor stops when the webview is gone (a workspace with no webview has no PTY to inject into anyway).

**⚠️ Two M15 design premises REFUTED by measurement 2026-09-07 — do not rebuild on them:**

- ⚠️ **`message.model` CANNOT determine the context window.** `claude-opus-5` was observed at **833,567** tokens and `claude-opus-4-7` at **268,743**, with **no `[1m]` suffix appearing anywhere in 238 transcripts** (a `<synthetic>` value also occurs). So the window is **not** a function of the model string, and `roadmap.md`'s *"`message.model` is on the line so it is derivable"* is wrong. **R-2 removes the need for it.** The `usage` read itself is fine — `input + cache_read + cache_creation`, **LAST assistant line only, never summed**.
- ⚠️ **There is NO skill scan or registry to piggyback on.** `roadmap.md`'s probe Q3 says Claudesk *"reads them on the same scan M13's registry already performs"* — **false**: `skills_dir_exists()` answers **one boolean** and enumerates nothing, and **no YAML parser exists in either manifest**. Adding an enumerator + frontmatter parser **reverses a recorded §4c anti-brittleness decision** (the command name is the only stable cross-repo coupling; a path is not) — a product decision, not an implementation detail.

**⚠️ Also measured at decomposition, so it is not re-derived:** a **naive** detector (transition-token turn not followed by a `Skill` call) flags **289 of 2,281** turns — **~15x over-flagging**, because most are legitimate PAUSEs (`F10`/`F13`/`F19`). **The policy lookup, not the token parse, is the hard half.** And ⚠️ **policy rows are keyed by STEP, not by transition ID** (feature table: **19 of 27** rows on a bare step name, only **8** on an `F<n>` id) — the detector parses an *edge*, so the edge→policy-row mapping is **derivation work, not a lookup**.

**⚠️ One M15 gate remains open: probe Q2** (can a question-shaped / answer-awaiting tail be detected?). It gates the **silent-always** fire policy, and `injectCommand` has **no retry and no pre-send cancel window** by design — so a wrong silent fire on an unwatched workspace is unrecoverable except via **Esc**. Per `roadmap.md`'s own instruction: if Q2 fails, **revisit the fire policy before building WP3 — do not build it anyway.**

(`roadmap.md` → Group E.) Claudesk absorbs the workflow state machine as **typed code** and enforces auto-chaining **mechanically**. Triggered by a **measured 10x regression** in auto-chain adherence (**0.36 → 3.63** breaks per 100 `Skill` invocations, opus-4-7/4-8 → opus-5, 187 sessions mined, drive mode cleared as a confound). ⚠️ **Probe-gated: WP1 gates every other design decision.** Decomposition + the 15 pre-decomposition measurements: `wbs.md`. **Status, the four rulings and the two refutations are in `## Current Milestone` above; the mechanism, ownership boundary and as-built seams are here.**

⚠️ **The size of what WP2 absorbs, measured:** **113** transition rows in `transitions.md`, **89** pause-policy rows across the four `AGENTS.md` files, **× 4 modes ≈ 356 cells**, cell vocabulary **5 values** (`AUTO` / `PAUSE` / `AUTO-SKIP` / `SKIP (entire skill)` / `n/a`) **plus Mode 0, which is not one of the four modes.** ⚠️ **A boolean AUTO/PAUSE model is wrong on its face** — `AUTO-SKIP` is *conditional* (verify-human: no integration boundary **and** verify-self all-PASS) and `F17b` routes ship *around* a skipped state.

⚠️ **The finding that inverted the original design:** wrongful stops emit the **correct** `TRANSITION:` token and often **name the correct next skill**, so they are **textually indistinguishable** from legitimate pauses — a prose-reading LLM adjudicator (the original ask) would pass **all 19** confirmed breaks. A **mechanical** check (transition token + policy row + was-there-a-`Skill`-call) decides every one. The `claude -p` adjudicator survives **demoted to the ambiguous residual**. ⚠️ The class is **chronic, not new** — three prior P1/P2 incidents pre-date opus-5 — so **every prose mitigation has decayed**, which is the whole architectural argument.

⚠️ **THE OWNERSHIP BOUNDARY WITH mccc (decided 2026-08-14 — "absorb the machine, not the skills"):** **Claudesk owns the drive mode's VALUE + TURN-BOUNDARY enforcement; mccc owns its MEANING + INTRA-TURN semantics**, with mccc's prose kept as the **no-Claudesk floor** (it runs in bare terminals — 877 transcripts). ⚠️ **Full absorption of mccc was CONSIDERED AND REJECTED** — ~85% of it is prose Claudesk could own but never *enforce*; it would break M10.9's two-tier gate; it strands non-Claudesk sessions incl. the recursive case that mccc is developed using mccc; and it puts the fastest-iterating artifact behind the slowest release pipeline. **Do not re-litigate** — full rationale + the ownership table are in `roadmap.md` → Milestone 15 and Revision 2026-08-14.

⚠️ **Also settled there, do not re-derive:** context usage is read from the transcript's `message.usage` (`input + cache_read + cache_creation`, **LAST assistant line only, never summed**) — ⚠️ **but NOT as a percentage: the model→window map is REFUTED and R-2 replaces it with an absolute token count** (see `## Current Milestone`); the phase-boundary recycle rule is **feature-workflow-only**; fire policy is **silently, always** (⚠️ dissent recorded and sized — ~2-in-19 breaks were question-shaped, **still gated on probe Q2**); and absorbing the machine **deletes** mccc's `check-structure.sh` **Phase 9** rather than moving it (the four-way `AGENTS.md` duplication it polices stops existing), while **Phase 3d** (the `TRANSITION:` regex contract) and **Phase 18** (the boundary auto-chain pin) **move** to Claudesk.

⚠️ **The strongest existing seams M15 builds on — do NOT rebuild these:** `is_turn_start` already exists (`status_broadcaster/mod.rs:451`, surfaced on `WorkspaceStatusUpdate`, already consumed **raw** by `XtermPane`) — ⚠️ **read it off the RAW event stream, never the folded `WorkspaceStatusMap`**, which collapses per workspace; `fs-change` already covers `.session.md`; `recycleSession()` was built **for this caller** with an `AbortSignal`; and `injectCommand` is the single injection funnel. ⚠️ **What does NOT exist:** any transcript reader, slug computation, CC-uuid→workspace mapping (the hook's `session_id` arrives and is **dropped** before the DTO), WIP-file content parsing, or `.session.md` body parsing. ⚠️ **`WorkspaceRegistry` keys on path ALONE and is 1:1**, so two CC sessions in one tree are indistinguishable today — the multi-workspace case this milestone targets. ⚠️ **A turn ending in `BackgroundWork` gets NO completion event** (a `BackgroundTasksIdle` request was closed as not planned); do not wait for one, and do not add a PID-polling watchdog (probed and rejected).

## Previous Milestone (closed)

**⚠️ As-built architecture is organized BY SUBSYSTEM, not by milestone** — `workflow-system/product/arch/<subsystem>.md`, indexed by `arch.md` (split 2026-08-12). A milestone's WBS + probe outcomes live in `workflow-system/product/archive/<cycle-name>/`. Where the `arch/` set and `roadmap.md` differ, **the `arch/` set is the authority** — it is the as-built record, resynced at each `/product-finalize`. ⚠️ **Do not add a new milestone section to it**; edit the subsystem the change belongs to.

**M1–M12 all closed GO** (M1 2026-06-19 → M12 2026-08-12; 15 cycles counting the M10.5/M10.9/M11.5 inserts). ⚠️ **Do not maintain a milestone→as-built table here** — it duplicated `roadmap.md` (which carries each milestone's close note) and the `arch.md` index (which maps every subsystem to its file), so it was a third copy drifting against two authorities. **Look up a closed milestone's as-built home in `arch.md`'s index; its WBS + probe outcomes are in `workflow-system/product/archive/<cycle-name>/`.**

⚠️ **The M12 properties that bind M13 are NOT repeated here** — they are in `## Current Milestone` above ("Five things from M13 that must NOT be re-derived") and in full in `arch/session-resumption.md`.

**Execution order from here (as of 2026-09-21):** ✅ **M14's remainder is CLOSED** (2026-09-15, 6/6 WPs, 4/4 deliverables; its WBS is archived at `workflow-system/product/archive/milestone-14-remainder-polish-and-open-source-release/` — ⚠️ **there is no live `wbs.md` until the next decomposition writes one**). Now: **Group F item F-a** (staging area for prompt input) — grilled 2026-09-21 and **decomposing as a WBS**, not a single feature → **supervisor dogfeedback** (wall-clock, runs in parallel) → **F-b**. ⚠️ **M15 IS CLOSED and `v0.5.0` IS CUT** (2026-09-15, 22 commits). ⚠️ **Dogfooding is WALL-CLOCK, not a work package, and is NOT a milestone** — the supervisor needs ~1 week of real use, and the upgrade waits until all mid-flight tasks reach a clean boundary (a `brew upgrade` kills every running Claudesk). That is *why* M14's remainder is sequenced first: it does not depend on the dogfooding clock. ⚠️ **Group F is deliberately UN-NUMBERED and is TWO items** (F-a staging area for prompt input · F-b isolated CC profiles as workspaces) — **asks with measured blockers, NOT designs**; the dogfeedback pass may reorder or insert ahead of them. ⭐ **A `/util-grill-me` pass opens EACH one at its own start** (operator, 2026-09-15) — the grill is the ENTRY step, not a review step. ⚠️ **F-a's multi-line gate is DISSOLVED BY MEASUREMENT (2026-09-21 grill) — the earlier "resolved BY SCOPE" ruling is SUPERSEDED, do not restore it.** It held that staged content must be newline-free dictated prose, that bracketed paste was not needed, and that the surface must reject/normalize an embedded newline. **All three are wrong.** Measured: xterm.js's paste path is `\r?\n → \r` **then** wraps in `ESC[200~`…`ESC[201~`, and a live PTY probe shows `claude` emits `ESC[?2004h` at startup and **never** `ESC[?2004l` — bracketed paste is ON for the session's life. ⚠️ So **newlines are preserved, never normalized**: F-a emits the bracketed-paste envelope, and the **trailing `\r` is a SEPARATE byte** (envelope inserts literal text; it does not submit). Two send modes, differing by that one byte: auto-submit (`⌘↵`) and stage-only (`⇧⌘↵`). ⚠️ **`slashCommandPayload` is NOT modified** — a new builder sits alongside it so M12/M13/M15 callers stay byte-identical. Decisions + the probe: `roadmap.md` → Group F → F-a. ⚠️ **F-b EXPANDED** — Claudesk should absorb the boilerplate's profile *creation* (which kills blocker 1's zsh-function indirection) but that makes blocker 2 HARDER by taking on per-config-dir hook registration + teardown; the boilerplate must itself be representable as a profile (self-hosting — a design constraint). ⛔ **Turn-output re-orientation was DROPPED from the group** — recorded, not scheduled; do not re-promote it by citing the product thesis. See `roadmap.md` → Revision 2026-09-15 + Group F. ⚠️ **M14's release half already shipped as v0.4.0**, which is what spent the 2026-08-26 "M14 first" argument — see `## Current Milestone`. Numbering does not match execution order for M11/M11.5 — M11.5 ran *before* M11 by design; no catch-up is owed. ✅ **M14's "default CLI args for `claude`" Settings line was corrected 2026-09-18 (WP4 Phase 1)** across all 6 live sites — M11.5 consumed most of it; PiP shipped **M5**, permission-mode shipped **M6**, and the per-project `--model` override shipped **M11.5 on the picker row, not in Settings**.

**Releases** via the `/release` skill. ⚠️ **Do NOT record the latest version here — this line went two releases stale once, then went stale again.** `git tag --sort=-v:refname | head -1` is the authority; `main` runs ahead of the last tag by design. Trust anchor unchanged since v0.2.9 (key `774E2E8429FDF78A`), so existing installs self-update; CHANGELOG carries each release's contents.

## Key Decisions

- **Tauri 2 over Electron.** Aligned with the "lite over featureful" principle. Bundle ~3MB vs ~96MB; ~30–40MB RAM vs ~200–300MB idle; startup <500ms vs 1–2s. The smaller ecosystem maturity is acceptable for a single-user tool.
- **`tauri-plugin-pty` / `portable-pty` over node-pty + sidecar.** node-pty would require shipping a Node runtime in the bundle, defeating the bundle-size advantage. portable-pty runs natively in the Rust core.
- **PTY byte-injection over Agent SDK for v1.** The vision requires the familiar interactive CC TUI inside the workspace. Claudesk *is* the terminal, so injecting bytes for slash commands is legitimate; we avoid the "PTY scraping" anti-pattern (parsing output text for state) by using the hook channel + file-watching for state detection in Phase 2. The `CcSession` trait is the future-swap seam for Agent SDK if/when needed.
- **Single window, many workspaces (replaces "one project per window").** Reversed during the 2026-06-15 product revision. Multiple projects = workspaces inside one Claudesk window, switched via filmstrip tiles. Aligned with the revised vision.
- **xterm.js DOM renderer only — no WebGL.** Decided 2026-06-15 after research established the ~16-context browser cap. DOM renderer is simpler, sufficient for the foreground, and removes a swap-on-focus complexity. Decision is reversible if needed.
- **Single `WebviewWindow`, no multi-webview.** Tauri 2's multi-webview is `unstable` and offers no isolation we need.
- **Tab-shell substrate ships in Phase 1.** Phase 2 plugs into existing layout structure rather than reshaping the foundation.
- **Thumbnail-rendering probe (WP4) gates Phase 2's filmstrip + PiP rendering strategy.** Pass → live ~1 fps mirrors. Fail → static status tiles in v1, live mirrors deferred to Future Possibility.
- **CC hook channel uses Unix socket, not shared file.** Three concurrent status-surface consumers make the multi-consumer concurrency case unambiguous.
- **Flat JSON for the project list, no DB.** ≤100 entries; read-on-open, write-on-update; JSON is appropriate.
- **No per-project config file in the project itself.** Centralized list in app support dir aligns with the "no per-project config burden" principle.
- **Host-based dev environment, not Docker.** Tauri targets host WKWebView and native windowing; Docker on macOS cannot provide them.
- **`--dangerously-skip-permissions` (yolo) by default.** Vision-explicit. Phase 4 setting will let users opt out.
- **Sublime launchers are click-only icon buttons in the panel tab row (WP8, redefined 2026-06-20).** Both Sublime Text (`sublime_open`) and Sublime Merge (`smerge_open`) launch from icon buttons in the `RightPanelHost` `right-panel-toggle` tab row (`sublime/sublimeLaunch.ts`); the backend `sublime` module is unchanged. ⚠️ **NO OS-global shortcut and no macOS Accessibility permission** — that approach was built and rejected. ⚠️ **`⌘⇧O` was freed** when the in-app hotkey was deleted as redundant with the button — and **F-a WP3 CLAIMED it (2026-09-22) for the Prompt panel**, so it is **no longer free**; see `src/components/workspace/panelHost.ts`. **Both launchers are PERMANENT** — the in-app editor is the primary surface, but Sublime Text stays as a one-click escape hatch alongside Sublime Merge (staging/blame/history/blob-at-rev the inline diff viewer doesn't cover). See `workflow-system/product/vision.md` Core Principle 3.
- **Phases 2–4 not decomposed yet.** Phase 1 decomposition is full; Phases 2–4 are WP-headline only. Premature decomposition would force decisions about later-phase internals before Phase 1 surfaces real constraints.
- **PiP click-to-focus is a Future Possibility, not v1.** Display-only PiP first; promote-on-click deferred until dogfooding confirms the limitation is real.
- **Workflow state-machine enforcement & claude-time integration are future possibilities, NOT in the initial roadmap.** Architecturally we leave room for them (see `workflow-system/product/vision.md` → "Future Possibilities") but don't build toward them in Phases 1–4.
