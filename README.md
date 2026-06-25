# Claudesk

A macOS-only, single-user "lite IDE" that puts the daily Claude Code + Sublime Text
workflow in **one window with multiple virtual workspaces inside it**. Pick a project
→ a PTY-backed Claude Code session fires up in that project's directory, in seconds,
inside a workspace — no more "open terminal → `cd` → `claude`" every time, across 20+
rotating projects.

> **Status: Milestones 1–4 shipped — daily-driver ready.** Click a project → a working
> CC session in the project dir inside a workspace; a built-in lite editor + git-diff
> viewer in the right half; Sublime Text / Sublime Merge / Reveal-in-Finder one click
> away; N projects open concurrently as workspaces switched via a live filmstrip with
> per-workspace idle/running/awaiting-input status. **M3+M4 is the dogfood-replace
> point** — Claudesk now replaces the terminal + Sublime daily-driver setup, and is
> installable via a [Homebrew tap](#install). Next: M5 picture-in-picture, M6 menu-bar
> status, M7 auto-resume, M8 skill orchestration, M9 polish (Developer-ID signing +
> notarization + auto-update).

## Install

> **Requires:** macOS on **Apple Silicon** (M1 or later — the build is `aarch64`;
> Intel Macs are not supported and `brew` will refuse the cask), and
> [**Homebrew**](https://brew.sh). You'll also need the
> [**Claude Code CLI**](https://docs.claude.com/claude-code) installed + authenticated
> and **Sublime Text / Merge** to actually use it — see [Prerequisites](#prerequisites).

Claudesk is distributed through a personal **Homebrew tap**:

```bash
brew tap StaymanHou/claudesk
brew trust --cask StaymanHou/claudesk/claudesk
brew install --cask claudesk
xattr -dr com.apple.quarantine /Applications/Claudesk.app
```

Why each step:

- **`brew trust`** — recent Homebrew refuses casks from third-party taps until you
  explicitly trust them (*"Refusing to load cask … from untrusted tap"*). One-time
  per tap.
- **`brew install --cask claudesk`** — downloads the `.dmg`, checks its SHA-256, and
  installs `Claudesk.app` to `/Applications`.
- **`xattr -dr com.apple.quarantine …`** — Claudesk is **unsigned**, so macOS
  quarantines it and Gatekeeper blocks it at launch (*"Apple cannot check it for
  malicious software"*). This clears the flag once. (Homebrew 6.x removed the old
  `--no-quarantine` install flag, so this manual step is the reliable path.)

**Updating:**

```bash
brew update
brew upgrade --cask claudesk
xattr -dr com.apple.quarantine /Applications/Claudesk.app   # re-attaches on each new build
```

Your state — remembered projects, Claude Code hook registration, etc. under
`~/Library/Application Support/com.claudesk.app/` — carries across updates automatically.

**Before first launch**, make sure you have the [**Claude Code CLI**](https://docs.claude.com/claude-code)
(`claude`) installed and authenticated, plus **Sublime Text** / **Sublime Merge** for the
in-app launcher buttons. See [Prerequisites](#prerequisites) for the full list.

> Prefer to build it yourself? See [Build from source](#build-from-source) below.

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

## Philosophy & design choices

Claudesk is **deliberately opinionated software.** It is not meant to fit every
developer's needs in every circumstance, and it never will. Read these as the *why*
behind the product — if your situation contradicts them, Claudesk is probably the
wrong tool, and that's by design.

- **Opinionated by intent, narrow by intent.** This is a personal tool built against
  one workflow (heavy Claude Code use, the custom
  [`stayman-claude-code-customization`](https://github.com/StaymanHou/stayman-claude-code-customization)
  workflow system installed at `~/.claude/skills/`, Sublime, macOS, 20+ rotating
  projects). It's open-sourced for others with the *same* setup — but no design
  concession is made for users who don't share it. A tool that fits one workflow
  exactly beats a tool that fits every workflow approximately.

- **Tuned for Claude Code specifically — not OpenAI, not Gemini.** Portability across
  models was attempted and abandoned: not all models are created the same, and the
  workflow system + Claudesk are specifically tuned against Claude's behavior. The
  hook channel, the skill/orchestrator conventions, the drive modes, the
  resume/recycle rituals — all assume Claude Code. Running this against another
  model's CLI is out of scope.

- **Parallelism across projects, not across agents within a project.** The whole layout
  optimizes for *deliverable output per engineer-hour* by keeping many projects in
  flight at once — but with **one agent / one CC session per project** (subagents
  within that session are still fair game). This is a conscious rejection of the
  multi-agent-on-a-single-project approach: per *The Mythical Man-Month*, throwing more
  concurrent actors at one problem introduces coordination overhead that eats the gains.
  Claudesk parallelizes the *projects*, where the work is genuinely independent and the
  overhead is near zero, rather than the *agents*, where it isn't.

- **Built for flexible timelines, not for rushing.** The model assumes you're rotating
  among projects with relatively elastic deadlines — picking up whichever one is ready
  for you, letting the others run or sit. If you need to *rush a single project* to a
  hard deadline, the right move is multi-agent concurrency on that one project, and
  Claudesk is **not the fit**. It optimizes throughput across a portfolio, not latency
  on any single item.

- **Human-in-the-loop, surfaced not hidden.** Every CC session keeps a real, visible
  status (idle / running / awaiting-input) precisely because the bottleneck in this
  model is *operator attention* — the scarce resource is the one human steering N
  sessions. The filmstrip, PiP, and menu-bar surfaces all exist to answer "which
  project needs me right now?" in under a second. Claudesk doesn't try to remove the
  human from the loop; it tries to make the human's attention land where it's needed
  with minimal cost. (Hence also: yolo mode by default, but recycle/resume on operator
  judgment, never automatically.)

- **Lite over featureful.** If it isn't a *daily* friction, it doesn't get built.
  Claudesk consciously refuses to grow into a general-purpose IDE — the wins come from
  eliminating the repeated setup tax and the cross-project attention tax, not from
  feature breadth. Reuse the real tools (Sublime Text, Sublime Merge) for the long tail
  instead of reimplementing them.

- **Wrap the official tools, don't fork them.** Claudesk drives the real `claude` CLI
  and pops the real Sublime apps. It's an *orchestration layer*, not a replacement — so
  it inherits every upstream improvement for free and never has a fork to maintain.

See [`docs/product/vision.md`](docs/product/vision.md) for the full vision, principles,
and anti-goals.

## Prerequisites

**To run Claudesk** (whether installed via Homebrew or built from source):

- **macOS on Apple Silicon** (this project is macOS-only; the release is `aarch64`)
- **Claude Code CLI** (`claude`) installed, on your `PATH`, and authenticated before launching Claudesk
- **Sublime Text** with `subl` on `PATH` (or the app installed for the `open -a` fallback)
- **Sublime Merge** — for the in-app "open in Merge" launcher button

**Additionally, to build from source:**

- **Rust** stable ≥ 1.77 via `rustup`
- **Node** 20 LTS+ and **pnpm** (`corepack enable` or `npm i -g pnpm`)
- **Xcode Command Line Tools** — `xcode-select --install`

See [`CLAUDE.md`](CLAUDE.md) → "Getting Started" for the full setup notes and ecosystem
gotchas (pnpm v11 `pnpm-workspace.yaml`, ESLint v9 pin, etc.).

## Develop / contribute

Make sure you have the [build prerequisites](#prerequisites) (Rust, Node + pnpm,
Xcode CLT), then:

```bash
git clone git@github.com:StaymanHou/Claudesk.git
cd Claudesk
pnpm install
```

**Run the debug build (hot-reload):**

```bash
pnpm tauri:dev      # native debug build with Vite hot-reload
```

`pnpm tauri:dev` builds the **unoptimized debug target** and runs it under a separate
identity (`com.claudesk.app.dev`, window titled *"Claudesk (dev)"*, magenta "DEV" badge
on the Dock icon). It's fully isolated from an installed production build — separate
project list, hook socket, and Claude Code hook registration — so you can run the
installed app **and** `pnpm tauri:dev` at the same time without interference (i.e.
develop Claudesk *with* Claudesk). Use `pnpm tauri:dev`, **not** a bare `pnpm tauri dev`,
or the dev build will collide with a production install.

Front-end-only work (no Rust rebuild) can iterate even faster against the Vite dev
server alone — but note it has no Tauri IPC, so anything calling the backend won't work:

```bash
pnpm dev            # Vite only, http://localhost:1420 — UI iteration, no backend
```

**Checks** — run these before opening a PR (they're the same gates CI would enforce):

```bash
pnpm test                       # frontend unit tests (Vitest)
cd src-tauri && cargo test      # backend tests (Rust); then `cd -`
pnpm lint                       # ESLint (TypeScript strict)
pnpm format:check               # Prettier (use `pnpm format` to auto-fix)
cd src-tauri && cargo clippy -- -D warnings && cargo fmt --check
```

See [`CLAUDE.md`](CLAUDE.md) → "Development Conventions" for code style, the workflow
system, and ecosystem gotchas (pnpm v11 `pnpm-workspace.yaml`, the ESLint v9 pin,
dark-mode-only UI, the `CcSession` seam, etc.).

## Build from source

For development, or to install your own build instead of the Homebrew cask. Claudesk
is a self-built, **unsigned** macOS app — building produces both a `.app` and a `.dmg`:

```bash
pnpm tauri build
cp -R src-tauri/target/release/bundle/macos/Claudesk.app /Applications/
xattr -dr com.apple.quarantine /Applications/Claudesk.app   # clear Gatekeeper (unsigned)
```

The `.dmg` lands at `src-tauri/target/release/bundle/dmg/Claudesk_<version>_aarch64.dmg`
— this is the same artifact published to the Homebrew tap.

**Updating** a from-source install = rebuild and replace (quit the running app first):

```bash
git pull && pnpm install        # if there are upstream changes / dep updates
pnpm tauri build
cp -R src-tauri/target/release/bundle/macos/Claudesk.app /Applications/
xattr -dr com.apple.quarantine /Applications/Claudesk.app
```

The production bundle id (`com.claudesk.app`) is stable across updates, so your state
(`projects.json`, the Claude Code hook registration, etc. under
`~/Library/Application Support/com.claudesk.app/`) carries over automatically. The
Gatekeeper `xattr` step reappears on each replaced unsigned build.

> **Cutting a release** (maintainer): the build → tag → GitHub release → tap-cask bump
> flow is driven by the project-local `/release` skill — see
> [`.claude/skills/release/SKILL.md`](.claude/skills/release/SKILL.md). Proper
> Developer-ID signing + notarization + in-app auto-update (which removes the `xattr`
> step entirely) is deferred to a later polish milestone.

## More

- [`CLAUDE.md`](CLAUDE.md) — project overview, conventions, and current phase
- [`docs/product/vision.md`](docs/product/vision.md) — full product vision
- [`docs/product/arch.md`](docs/product/arch.md) — architecture and key decisions
- [`CHANGELOG.md`](CHANGELOG.md) — what has shipped
