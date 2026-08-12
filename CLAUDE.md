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

**Doc layout migrated 2026-07-28** (commit `aacc687`): the strategic docs and workflow state were unified under a single `workflow-system/` root, following the companion repo's Milestone-7 folder unification. `docs/` now holds only `lessons/` + `demo/`. Old → new: `docs/product/*` → `workflow-system/product/*`; `workflow/{wip,backlog.md,archive,.session.md}` → `workflow-system/state/*`.

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
  - Frontend: ESLint + Prettier. TypeScript strict mode on. React 19 function components only. ⚠️ **`pnpm format:check` belongs in the per-phase verify-auto gate** — a Prettier reflow silently broke a `?raw` guard, which then reported green while checking nothing.
  - Backend: `cargo fmt` + `cargo clippy --all-targets -- -D warnings` (use `--all-targets`, NOT `--lib` — `--lib` skips the test target and silently misses test-code lints [`erasing_op`, `non_snake_case`, `vec_init_then_push`, `assertions_on_constants`] that still fail `-D warnings`; run `--all-targets` in the per-phase verify-auto gate so they surface early, not only at a final sweep — M9 WP6.5, 2026-07-08). No `unwrap()` outside of tests; use `?` with typed error returns (`thiserror`).
- **Dark mode only.** Claudesk's UI is **always dark** — it never follows the OS theme. Do NOT add `@media (prefers-color-scheme: light)` blocks or any light-theme tokens. `:root` in `src/App.css` sets `color-scheme: dark` and unconditionally dark color tokens; keep it that way. A light/theme toggle is explicitly out of scope (not even a Phase 4 setting).
- **Tests.**
  - Backend: `cargo test` for unit tests; integration tests in `src-tauri/tests/`.
  - Frontend: Vitest for unit tests; component tests where state logic is non-trivial.
  - End-to-end: deferred; manual testing on the host macOS is the verification path in Phase 1.
  - **Installed-build smoke test (dev-vs-installed parity).** Any feature touching PATH, env vars, or external-process spawning MUST be smoke-tested from a freshly-built installed `.app` launched from Finder/Dock — `pnpm tauri:dev` inherits the terminal's full env and will not reproduce GUI-PATH failures. Full rules + the other three verify-self tiers: `docs/lessons/verify-self-tiers.md`.
  - **Live verify-self via the `tauri` MCP bridge — prefer it over carrying visual/DOM checks to the operator.** The bridge attaches to the real running WKWebView (and the PiP panel) with live Tauri IPC. ⚠️ Ten caveats, several of which have produced false verdicts — including (h) **a freshly-opened CC pane reads blank for seconds and it means nothing**, and (i) **the xterm DOM is not the buffer, so a working pane reads as 1–3 characters** (and `innerText` on the pane returns xterm's injected *stylesheet*). ⚠️ Instrument **agreement is not correctness** when both instruments share a defect — run a positive control. Read `docs/lessons/mcp-tauri-bridge-caveats.md` before driving it.
  - **Sandboxed-`$HOME` launch** — how to verify a feature that reads or writes `~/` without touching the operator's real home. ⚠️ The `RUSTUP_HOME`/`CARGO_HOME`/`PATH` overrides are mandatory, not optional. See `docs/lessons/sandboxed-home-verification.md`.
  - **Scratch workspaces for verify-self (dev-only).** Three throwaway git repos at `tmp/scratch/scratch-{a,b,c}`; prefer them over real projects, mandatory once a check spawns/answers a CC session. See `docs/lessons/verify-self-tiers.md`.
  - **⚠️ Guards that report green while checking nothing are this repo's most common defect** — eight distinct ways, each found by mutation rather than review, covering `?raw`/`include_str!` source guards AND filtered test runs (`cargo test <filter>` matching zero tests prints `ok. 0 passed` and **exits 0**, so pin a count or name a test). The one-line test before trusting any of them: *could this still pass if the code it names were deleted?* Read `docs/lessons/source-text-guards.md` before writing or weakening one — it also carries the mutation method (prove each form INDIVIDUALLY; confirm the mutant landed in executable code; an invalid probe and a real hole look identical).
  - **⚠️ Extracting a pure state machine proves the MACHINE, not its CALLER.** A fully mutation-proven module can sit behind a caller that never invokes it correctly (hit twice in M11 WP4, one a shipped CRITICAL). Funnel every write of shared state through ONE function and guard *that*. See `docs/lessons/verify-self-tiers.md`.
- **One window, many workspaces.** Claudesk is single-window. Multiple projects open simultaneously = multiple workspaces inside that one window, switched via filmstrip tiles. Multi-window for Claudesk itself is explicitly out of scope. The standing auxiliary surfaces are: the PiP NSPanel (Phase 2 conditional) and the menu-bar popover (Phase 2). **Both Sublime tools (Text + Merge) are kept permanently** (revised 2026-06-20, WP8) — launched on demand via icon buttons in the right-panel tab row (`sublime_open` / `smerge_open`). The popped Sublime windows are external apps, not Claudesk windows, so they don't violate the single-window rule. *(The earlier "Sublime Text pop is a temporary stopgap removed once the in-app editor lands" framing is superseded — WP8 kept it.)*
- **Tab-shell substrate ships in Phase 1.** Even though Phase 1 only ever opens one workspace at a time, the WorkspaceList + Center Stage + (empty) Filmstrip layout is built from day one. Phase 2 plugs into the existing structure rather than reshaping it. Design for N=1 with N>1 in mind.
- **All workspaces stay mounted.** Switching the center stage is `display: none` / `display: block` toggling, never an unmount/remount. PTY connections persist across switches; CC sessions in background workspaces continue to receive output (buffered to xterm scrollback).
- **xterm.js DOM renderer only.** Do not load `@xterm/addon-webgl`. The WebGL renderer caps at ~16 contexts per page across all xterm instances on the page combined; with a multi-workspace tab shell that's a real ceiling, and the modern DOM renderer is fast enough for the foreground workspace. If a single-workspace user ever proves the DOM renderer can't keep up, the decision is reversible (one-line addon load) — but never load it speculatively.
- **Single `WebviewWindow`, no multi-webview.** Tauri 2's multi-webview API is `unstable`-flagged and offers webview isolation we don't need (all workspaces share Claudesk's trust boundary). All workspaces are React components in one webview.
- **No `.claudesk.json` per repo.** Project list is centralized at `~/Library/Application Support/com.claudesk.app/projects.json` (the bundle-identifier path `app_data_dir()` returns). Adding or removing a project is a UI action, not a per-repo file edit.
- **`CcSession` trait is a stable seam.** Claudesk's "how to drive CC" path goes through `CcSession`. Phase 1 has `PtyCcSession`; never bypass the trait when calling CC from anywhere else. Phase 2 extends the trait with `state_events()` and `recycle()`; future work could swap to an `SdkCcSession`.
- **PTY byte-injection for input; hook channel for state.** We write bytes into the CC pty for any "send a slash command" operation. We do NOT parse CC's output text to infer state. Workflow state is read from `workflow-system/state/.session.md` and similar files via a file watcher (Phase 2). CC's idle/running/awaiting-input state is read from CC's official hook channel (`UserPromptSubmit`→running / `Stop`→idle / `PostToolUse`→running / `Notification`→awaiting-input events registered in `~/.claude/settings.json`), delivered to Claudesk via Unix socket (Phase 2). NEVER from PTY output. **`PostToolUse` is the answer-resume signal** (QoL-WP2): answering an `AskUserQuestion`/permission prompt fires `PostToolUse` (NOT `UserPromptSubmit`), so it's what clears a stuck AwaitingInput. **`Notification`→AwaitingInput is gated on `notification_type`** — only genuine input-needed types (`permission_prompt`, `elicitation_dialog`) or an unknown/absent type map to AwaitingInput; recognized informational types (`idle_prompt`, `auth_success`, `elicitation_complete`, `elicitation_response`) are a no-op so an idle nudge doesn't flip a busy dot blue. The gate is backend-side (`status_broadcaster::event_to_state`); `PreToolUse` is deliberately NOT registered.
- **CC hook channel uses Unix socket, not shared file.** Resolved by research: with three concurrent status-surface consumers (filmstrip, menu-bar, PiP), Unix-socket multi-consumer concurrency wins decisively. Claudesk opens the socket on launch; the installed CC hook script writes one JSON line per event.
- **Status broadcaster fans out one stream to three subscribers.** Filmstrip (main webview), menu-bar popover (separate webview), and PiP (NSPanel webview) all subscribe to the same Tauri-event-channel broadcast of `WorkspaceStatusUpdate`. All three surfaces agree at all times.
- **Status-surface order (resequenced 2026-06-22): PiP (M5) ships BEFORE the menu-bar (M6), and PiP is now UNCONDITIONAL.** Supersedes the earlier "menu-bar first, dogfood a week, defer PiP if sufficient" plan — that gate is dropped. All three surfaces (M4 filmstrip, M5 PiP, M6 menu-bar) subscribe to the same M3 status broadcaster regardless of build order. See `roadmap.md` → "Revision 2026-06-22".
- **⚠️ PiP/NSPanel window ops MUST run on the main thread.** Any background-thread/timer path calling a PiP window op must marshal via `app.run_on_main_thread(…)`. Off-main-thread AppKit ops **abort the process with a native exception and NO Rust panic** — invisible to `cargo test`, presenting as clean-launch-then-silently-die. `#[command]` fns and `on_window_event` are already main-thread. See `docs/lessons/pip-nspanel-main-thread.md`.
- **⚠️ Drive mode: Claudesk NEVER writes the WIP file's frontmatter — REVERSED 2026-08-06** (M12 WP4). The WIP-frontmatter mirror was **rejected**: `/session-restore` deletes `.session.md` at step 7 and `feature-finalize` archives the WIP file, so at the moment a new WP starts there is no file to write to. **As built:** the mode is stored per-project in `projects.json` (`default_drive_mode`) and delivered as an env-var-gated `UserPromptSubmit` hook `additionalContext` line — companion skills unchanged. Claudesk reads the workflow's world; it does not write it. Full rationale: `arch/session-resumption.md` → "The drive-mode signal".
- **Pre-risky-action checklist for scaffolders.** Scaffolders (`create-tauri-app`, `npm create *`, etc.) can wipe strategic docs. Before running one in a non-empty dir, ensure git is clean and scaffold into a sibling dir then merging. The strategic docs in `workflow-system/product/`, the root `CLAUDE.md`, and the `_ref/` symlink are load-bearing and must survive any scaffold.

## Setup & Ecosystem Gotchas

Setup-time pitfalls discovered during WP1 that any fresh checkout will hit.

- **pnpm v11+ moved `onlyBuiltDependencies`.** The allowlist for postinstall scripts now lives in `pnpm-workspace.yaml` as `allowBuilds:`, NOT in `package.json`'s `pnpm.onlyBuiltDependencies` field. On first install, pnpm v11 auto-generates a stub `pnpm-workspace.yaml` containing the literal text `set this to true or false` as a placeholder — that string must be replaced with `true` (or `false`) before `pnpm install` will succeed. Current state: `esbuild: true` in `pnpm-workspace.yaml`.
- **ESLint pinned to v9 LTS.** ESLint v10 (Nov 2025) is incompatible with `eslint-plugin-react` 7.37.x — the plugin uses `contextOrFilename.getFilename` which v10's API removed (`TypeError: contextOrFilename.getFilename is not a function` on every lint run). `eslint` and `@eslint/js` are pinned to `^9` until `eslint-plugin-react` ships a v10-compatible release. Do not bump to v10 without first verifying the plugin has caught up.
- **Prettier ignores strategic docs by design.** `.prettierignore` lists `docs/`, `workflow-system/` (was `workflow/` before the 2026-07-28 layout migration — the pattern was updated with it, so the unified root stays protected), `CLAUDE.md`, and `runtimes.md` — these are hand-authored prose where Prettier's blank-line-before-bullet-list rewrites are unwanted. Do NOT remove those entries casually; if you need to run Prettier on a sub-tree of those dirs, do it with explicit paths rather than removing the ignore rule. `pnpm format` skips them silently by design.
- **A dependency spike must live OUTSIDE the repo tree — `tmp/` being gitignored does NOT isolate a pnpm install.** Running `pnpm add` inside the repo's gitignored `tmp/` still **rewrites the tracked `pnpm-lock.yaml`**: pnpm resolves upward to the workspace root and does not honor gitignore for that resolution (the tell is `../..` in its progress output). **`package.json` is left untouched**, so the usual "did I add a dep?" check — grepping `package.json` — reports clean while the lockfile is dirty. Put library bake-offs / "just try it in a sandbox dir" spikes in the **session scratchpad** (outside the repo) instead, and when verifying a no-footprint claim check **`pnpm-lock.yaml` explicitly**, not just `package.json`. Hit 2026-08-01 (M11 WP1) while spiking two markdown renderers; caught by `git status` before any commit and reverted. Not to be confused with `[[pnpm-exec-shadows-local-binaries]]`, which is about `pnpm exec <bin>` silently shadowing a local binary.
- **GUI-launched app inherits a minimal PATH (install-only).** A Finder/Dock-launched macOS `.app` inherits the minimal launchd `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), NOT the user's shell `PATH` — so user-installed CLIs (`claude` in `~/.local/bin`, Homebrew/`fnm`/`nvm` bins) are invisible to spawned processes and `cc_spawn` fails with *"No viable candidates found in PATH …"*. This bites **only the installed build** — `pnpm tauri:dev` inherits the launching terminal's full `PATH`, so it never reproduces (operator hit it 2026-06-24 on first real install). Fixed app-wide by `src-tauri/src/env_path/`: at `.setup()` (FIRST, before any spawn) the app captures the login-shell `PATH` (`$SHELL -l -i -c 'printf %s "$PATH"'`, fallback `/bin/zsh`) and `std::env::set_var("PATH", …)` process-wide — best-effort, never blanks an existing `PATH`. If you add another external-CLI spawn, it benefits automatically; do NOT re-introduce per-spawn PATH hacks.

## Current Milestone

**Milestone 13: Skill orchestration** — ▶ **NEXT, not yet decomposed.** Run `/product-wbs` to decompose it. Goal: common workflow operations are clicks, not typed slash commands. Two deliverables in `roadmap.md`: a **skill registry** (scan `~/.claude/skills/` + `<project>/.claude/skills/`, render each as a button that sends the matching slash command) and the **"Recycle Session" one-click button** (`/session-handoff` → wait for the `.session.md` write → Ctrl+D → wait for CC exit → spawn fresh CC → `/session-restore`; manually triggered only, never automatic).

**M13 closes Group C** — it carries the last two of the six vision success metrics (2: Recycle is one click; 3: no slash-command typing for common skills). The other four are met. Everything M13 needs is workflow-coupled, so it all sits **behind M10.9's `workflow_features_enabled` gate**.

**⚠️ Four things M13 must not re-derive** (full detail: `workflow-system/product/arch/session-resumption.md`):

1. **Recycle must CLEAR the unclean-exit flag** — it is a clean boundary, so without the clear every recycle leaves a false mark and the next open fires a spurious `--continue`. Use `session_state_mark_clean(path, route)` with a new `CleanExitRoute` variant; ⚠️ **clearing is OPT-IN PER ROUTE, never a side effect of teardown**, and every read/write must go through `key_for()` (a reader that skips it silently matches nothing — no error, just a flag that never fires).
2. **⚠️ Enumerating routes/skills as data makes the SET testable but does NOT prove each member has a CALLER.** M12 shipped a `/exit` clean-exit variant that round-tripped through two test suites while being called by nothing — and the exhaustiveness test's green read as coverage. A skill *registry* is exactly this shape at larger scale.
3. **Reusable pieces already exist; do NOT build new ones.** `slash_command_bytes` (`cc_session/mod.rs`) trims trailing CR/LF and appends exactly one `\r` — the PTY-injection primitive, first consumed at M12 WP3. `sessionStartButton.ts` is the single-button precedent this registry either absorbs or keeps pinned. `session_state::consume` returns-and-clears. ⚠️ **M13 reuse of the drive-mode signal is NOT pre-committed** (operator: *"I'll need to open the spec and re-evaluate if it's reusable when we get there"*) — Recycle re-spawns CC, so it gets the signal free from the ordinary spawn path **if** the mode is still set; record what exists, do not abstract for an unspecced caller.
4. **⚠️ The OFF-invariant guard has FOUR registries now** (panel · menu-id · chord · row-cell), and a skill-button surface is **none of them** — so M13 owns a fifth arm, per the guard's own header. Copy the row-cell arm's shape: assert the **computed** OFF-state value, and probe each arm **INDIVIDUALLY** (a composite bypass tripping *some* arm reports "the guard bites" while hiding a gap). ⚠️ **An invalid probe and a real hole present IDENTICALLY** — the chord arm exempts any module that merely *mentions* the seam, which is how a valid-looking probe passed 19/19 at WP5 (`SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE`). And a **type-level, executable** seam reference is what satisfies the guard; the arm strips comments, so a comment-only mention was *measured* not to.

**⚠️ Two open items to settle before or during M13, both filed:** `SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET` (a typed `/exit` leaves the workspace open with a "Session ended" overlay, so whether that counts as clean is an unanswered *product* question M13's Recycle work sits next to), and `SURFACE-2026-08-06-MANUAL-SESSION-START-MODE-MENU-INTERRUPTS-BEFORE-INTENT` (a manual `/session-start` costs 2.18 turns vs ~0.5 because the mode menu arrives *before* the operator has stated their problem — only 24 of 524 opens, hence deferred, but a skill-button surface is where it would be fixed).

**Before starting: the operator is running a `CLAUDE.md`/`arch.md` prune + `/util-backlog-paydown` in the session immediately after the M12 close** (stated 2026-08-12). `arch.md` is **982 lines** (up 244 from M12's as-built section) and the backlog carries **54 deferred items**, so expect both to shrink before M13 decomposition.

## Previous Milestone (closed)

**⚠️ As-built architecture is organized BY SUBSYSTEM, not by milestone** — `workflow-system/product/arch/<subsystem>.md`, indexed by `arch.md` (split 2026-08-12). A milestone's WBS + probe outcomes live in `workflow-system/product/archive/<cycle-name>/`. Where the `arch/` set and `roadmap.md` differ, **the `arch/` set is the authority** — it is the as-built record, resynced at each `/product-finalize`. ⚠️ **Do not add a new milestone section to it**; edit the subsystem the change belongs to.

| Milestone | Closed | Verdict | As-built home in the `arch/` set |
|---|---|---|---|
| **M12** Smart auto-resume + drive mode | 2026-08-12 | GO | `arch/session-resumption.md` |
| **M11** Workflow-docs markdown viewer | 2026-08-03 | GO | `arch/right-panel-surfaces.md` → "The Docs panel" |
| **M11.5** QoL bucket | 2026-07-31 | GO | *(no as-built section)* |
| **M10.9** Workflow-features opt-in gate | 2026-07-31 | GO | `arch/workflow-gate.md` + `arch/claude-substrate.md` |
| **M10.5** QoL polish bucket | 2026-07-19 | GO | `arch/process-and-pty.md` (shutdown + I/O encoding) |
| **M10** In-app auto-updater | 2026-07-18 | GO | `arch/build-update-release.md` |
| **M9** Time-analytics panel | 2026-07-16 | GO | `arch/time-analytics.md` |
| **M8** Demo assets | 2026-06-29 | GO | *(docs/marketing only — no app code)* |
| **M7** Menu-bar status item | 2026-06-29 | GO | `arch/status-channel-and-surfaces.md` §B.2 |
| **M6** Friend-requested QoL polish | 2026-06-28 | GO | *(no as-built section)* |
| **M5** Picture-in-picture | 2026-06-27 | GO | `arch/status-channel-and-surfaces.md` §B.3 |
| **M4** Multi-workspace UX | 2026-06-24 | GO | `arch/foundations.md` → "System Design" |
| **M3** CC lifecycle & state plumbing | 2026-06-22 | GO | `arch/status-channel-and-surfaces.md` §A |
| **M2** Lite Editor + Diff Viewer | 2026-06-22 | GO | `arch/right-panel-surfaces.md` |
| **M1** Bare Shell + Tab Substrate PoC | 2026-06-19 | GO | `arch/foundations.md` → "System Design" |

⚠️ **The M12 properties that bind M13 are NOT repeated here** — they are in `## Current Milestone` above ("Four things M13 must not re-derive") and in full in `arch/session-resumption.md`.

**Execution order from here:** M13 (skill orchestration, incl. Recycle Session) → M14 (polish + OSS release). Numbering does not match execution order for M11/M11.5 — M11.5 ran *before* M11 by design; no catch-up is owed. ⚠️ **When M14 is next touched, correct its "default CLI args for `claude`" Settings line** — M11.5 consumed most of it, and it still misstates PiP (shipped M5) + permission-mode (shipped M6) as future work.

**Latest release: v0.3.0** (`/release` 2026-08-03) — M10.9 + M11.5 + M11, published to GitHub (4 assets) + Homebrew tap, verified end-to-end on the operator's real installed `.app`. Trust anchor unchanged from v0.2.9 (key `774E2E8429FDF78A`), so existing installs self-update. ⚠️ **M12 is closed but NOT yet released** — `main` runs ahead of the last tag by design; the operator pushes at release time only. Releases via the `/release` skill.

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
- **Sublime launchers are click-only icon buttons in the panel tab row (WP8, redefined 2026-06-20).** Both Sublime Text (`sublime_open`) and Sublime Merge (`smerge_open`) launch from icon buttons in the `RightPanelHost` `right-panel-toggle` tab row (`sublime/sublimeLaunch.ts`); the backend `sublime` module is unchanged. **History:** the launch started OS-global (`tauri-plugin-global-shortcut` + Accessibility flow), was rebuilt as an in-app `⌘⇧E`→`⌘⇧O` `keydown` hotkey + button (WP8 2026-06-19, no Accessibility permission), and at WP8's 2026-06-20 redefinition the redundant `⌘⇧O` hotkey was **deleted** (button-only now; `⌘⇧O` freed). **Both launchers are PERMANENT** — the earlier "Sublime Text pop removed at WP8 once the editor proves parity" plan is superseded: the in-app editor is the primary surface, but Sublime Text stays as a one-click escape hatch alongside Sublime Merge (which covers staging/blame/history/blob-at-rev the inline diff viewer doesn't). See `workflow-system/product/vision.md` Core Principle 3.
- **Phases 2–4 not decomposed yet.** Phase 1 decomposition is full; Phases 2–4 are WP-headline only. Premature decomposition would force decisions about later-phase internals before Phase 1 surfaces real constraints.
- **PiP click-to-focus is a Future Possibility, not v1.** Display-only PiP first; promote-on-click deferred until dogfooding confirms the limitation is real.
- **Workflow state-machine enforcement & claude-time integration are future possibilities, NOT in the initial roadmap.** Architecturally we leave room for them (see `workflow-system/product/vision.md` → "Future Possibilities") but don't build toward them in Phases 1–4.
