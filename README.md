# Claudesk

A macOS-only, single-user "lite IDE" that puts the daily Claude Code + Sublime Text
workflow in **one window with multiple virtual workspaces inside it**. Pick a project
→ a PTY-backed Claude Code session fires up in that project's directory, in seconds,
inside a workspace — no more "open terminal → `cd` → `claude`" every time, across 20+
rotating projects.

> **Status: Phase 1 (Bare Shell + Tab Substrate PoC).** Click a project → a working CC
> session in the project dir inside a workspace; Sublime Text pops via an in-app `⌘⇧E`.
> The multi-workspace filmstrip, menu-bar status, stateful CC controller, and built-in
> editor/diff viewer arrive in Phases 2–3. A full user-facing README lands in Phase 4.

## What it is

Claudesk is a **macOS-only, single-user "lite IDE"** that puts the daily
**Claude Code + Sublime** workflow into **one window with multiple virtual
workspaces inside it**. Each workspace = one project = one live Claude Code (CC)
session: a true terminal on the left, a lite code-editor + git-diff viewer on the
right. A **Mission-Control-style layout** runs the show — one workspace is the
full-size *center stage*, and a *filmstrip* of live thumbnails/status-tiles across
the top shows every other open project at a glance, each with an
**idle / running / awaiting-input** status dot. Click a tile (or press a hotkey)
to promote that project to center stage. It replaces the old routine of juggling
terminal tabs, Sublime Text, and Sublime Merge across many windows and macOS Spaces.

**Tech feel:** Tauri 2 (a tiny ~3 MB native app, not Electron), **dark-mode only —
always**, fast (<500 ms startup), lean. The aesthetic is *quiet, dark,
keyboard-driven, dense-but-calm* — a tool for a power user running 20+ rotating
projects, 3–4 in flight on any given day.

### What it does, and why it matters

- **One window, many project workspaces (Mission-Control layout).** A single window
  holds N concurrent project workspaces — one full-size *center stage* + a
  *filmstrip* of the rest across the top. No window-juggling, no Spaces-hopping;
  every in-flight project is one glance and one click away, so you instantly see
  which project needs you and switch without breaking flow.
- **Per-workspace status at a glance (idle / running / awaiting-input).** Every
  filmstrip tile carries a live status dot driven by Claude Code's real lifecycle
  (not guesswork). The "which of my 4 running agents is waiting on me?" question is
  answered in under a second, zero clicks — no more hunting through windows for the
  one stalled on a prompt.
- **Instant project launch.** Pick a project → its full environment (CC session
  `cd`'d in, editor, diff) fires up in seconds as a new workspace, eliminating the
  minutes of repetitive setup (open terminal → `cd` → `claude`, open Sublime, load
  project, open Merge, …) per project, per day. Starting work on any of 20+ projects
  is one click, not a ritual.
- **Split workspace: terminal + editor side by side.** Left half = a true
  PTY-backed Claude Code terminal (the real interactive TUI); right half = a lite
  code editor + git-diff viewer. Drive the AI and read the code without leaving the
  window — the whole edit-review-converse loop in one calm surface.
- **Lean, fast, dark, native.** Tauri 2 native app — ~3 MB, ~30–40 MB RAM idle,
  <500 ms launch, always dark. A daily driver that disappears into the work instead
  of competing with it.

## Prerequisites

- **macOS** (this project is macOS-only)
- **Rust** stable ≥ 1.77 via `rustup`
- **Node** 20 LTS+ and **pnpm** (`corepack enable` or `npm i -g pnpm`)
- **Xcode Command Line Tools** — `xcode-select --install`
- **Claude Code CLI** (`claude`) installed, on your `PATH`, and authenticated before launching Claudesk
- **Sublime Text** with `subl` on `PATH` (or the app installed for the `open -a` fallback)

See [`CLAUDE.md`](CLAUDE.md) → "Getting Started" for the full setup notes and ecosystem
gotchas (pnpm v11 `pnpm-workspace.yaml`, ESLint v9 pin, etc.).

## Run

```bash
pnpm install
pnpm tauri:dev      # native dev build with hot-reload
```

`pnpm tauri:dev` runs the **dev build** under a separate identity (`com.claudesk.app.dev`,
window titled *"Claudesk (dev)"*, magenta "DEV" badge on the Dock icon). This is fully
isolated from an installed production build — separate project list, hook socket, and
Claude Code hook registration — so you can run the installed app **and** `pnpm tauri:dev`
at the same time without interference (i.e. develop Claudesk *with* Claudesk). Use
`pnpm tauri:dev`, not a bare `pnpm tauri dev`, or the dev build will collide with an install.

## Install (and update)

Claudesk is a single-user, self-built, **unsigned** macOS app — there's no App Store
release, no notarization, and no auto-updater. Installing and updating is a manual
build-and-copy:

```bash
pnpm tauri build
cp -R src-tauri/target/release/bundle/macos/Claudesk.app /Applications/
```

This produces (and you can also distribute) a `.dmg` at
`src-tauri/target/release/bundle/dmg/Claudesk_<version>_aarch64.dmg`.

**First launch — clear Gatekeeper (one time per build).** Because the app is unsigned,
macOS blocks the first open with *"Apple cannot check it for malicious software."* Clear
it once with either:

- **Right-click `Claudesk.app` → Open → Open**, or
- `xattr -dr com.apple.quarantine /Applications/Claudesk.app` before launching.

**Updating** = rebuild and replace (quit the running app first):

```bash
git pull && pnpm install        # if there are upstream changes / dep updates
pnpm tauri build
cp -R src-tauri/target/release/bundle/macos/Claudesk.app /Applications/
```

The production bundle id (`com.claudesk.app`) is stable across updates, so your state —
remembered projects (`projects.json`), the Claude Code hook registration, etc. under
`~/Library/Application Support/com.claudesk.app/` — carries over automatically. The
Gatekeeper right-click-Open step reappears on each replaced unsigned build. (Proper
Developer-ID signing + notarization + in-app auto-update is deferred to a later polish
milestone — it's only needed for distributing to *other* people.)

## Tests

```bash
pnpm test                       # frontend (Vitest)
cd src-tauri && cargo test      # backend (Rust)
```

## More

- [`CLAUDE.md`](CLAUDE.md) — project overview, conventions, and current phase
- [`docs/product/vision.md`](docs/product/vision.md) — full product vision
- [`docs/product/arch.md`](docs/product/arch.md) — architecture and key decisions
- [`CHANGELOG.md`](CHANGELOG.md) — what has shipped
