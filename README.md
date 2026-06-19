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
pnpm tauri dev      # native dev build with hot-reload
```

Build a production `.app`:

```bash
pnpm tauri build
```

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
