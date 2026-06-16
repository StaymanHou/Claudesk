---
workflow: feature
state: verify-codify (all phases complete)
created: 2026-06-16
drive_mode: autopilot
wbs_ref: WP1
---

# Feature: WP1 — Tauri 2 project scaffold + dev environment

## Problem Statement

The repo is documentation-only. To start any Phase 1 build WP we need a working Tauri 2 + React 19 + TypeScript + Vite project where `pnpm tauri dev` opens a window on macOS and `pnpm tauri build` produces a `.app` bundle. The hard constraint: the scaffolder (`pnpm create tauri-app`) will be run inside a repo that already contains strategic load-bearing files (`docs/product/`, root `CLAUDE.md`, `_ref/` symlink, `.gitignore`, `.git/`). Running the scaffolder in-place is destructive-capable. The plan must scaffold into a sibling dir and merge, never in-place. Beyond the scaffold itself, we need lint/format/test baselines on both sides (frontend ESLint+Prettier+Vitest; backend `cargo fmt`+`cargo clippy`+`cargo test`) so subsequent WPs land into a hygienic project.

## Work Tree

- [x] Phase 1: Scaffold-and-merge
      **Observable outcomes:**
  - CLI: `pnpm tauri dev` opens an empty Tauri window on macOS within ~10s of the bundler being ready; closing the window exits cleanly (exit 0)
  - CLI: `pnpm tauri build` produces a `.app` bundle under `src-tauri/target/release/bundle/macos/` (or platform-equivalent path); `ls` of the bundle dir is non-empty
  - CLI: `git status` after the scaffold-merge shows the pre-existing files (`docs/product/*.md`, root `CLAUDE.md`, `.gitignore`) **unchanged** (no diff lines for them); `_ref/` symlink still resolves (`readlink _ref/claude-customization` returns the original target)
  - CLI: `cat .gitignore | grep '^_ref/$'` exits 0 (the `_ref/` rule survives the merge)
  - Browser: not applicable (no UI behavior yet beyond an empty window)
  - [x] P1.1 Pre-flight: confirm `git status` is clean (only the planned WIP file may be staged/untracked); confirm `_ref/claude-customization` resolves; record current `.gitignore` contents and `ls docs/product/` for post-merge diff
  - [x] P1.2 Run `pnpm create tauri-app` in a sibling temp dir (e.g., `../claudesk-scaffold-tmp/`) with the React+TypeScript+Vite template; name the project `claudesk`
  - [x] P1.3 Merge the scaffold into the repo root: copy/move scaffold files into the repo, **never overwriting** `CLAUDE.md`, `docs/`, `_ref/`, `.gitignore`, `.git/`, `workflow/`, or `CHANGELOG.md` (if present). Concretely: copy scaffold contents file-by-file; for each target path that already exists, skip the scaffold's version (the only overlap of concern is `.gitignore` — merge by appending the scaffold's lines to the existing file, deduplicated)
  - [x] P1.4 Verify `.gitignore` retains the `_ref/` line; if absent, restore it
  - [x] P1.5 Delete the sibling temp dir
  - [x] P1.6 Run `pnpm install` to materialize `node_modules/` and `pnpm-lock.yaml`
  - [x] P1.7 Run `pnpm tauri dev` — verify a window opens; close it; confirm clean exit
  - [x] P1.8 Run `pnpm tauri build` — verify a `.app` bundle is produced (timing not enforced; just existence)
  - [x] verify-auto — `tsc --noEmit` clean, `cargo check` clean (13.96s), `tauri.conf.json` valid JSON
  - [x] verify-self — subagent confirmed 5/5: `.app` bundle exists, debug binary exists & arm64 Mach-O exec, `_ref/` symlink intact, all 6 product docs present, CLAUDE.md untouched, `.gitignore` retains `_ref/`, no scaffold-temp-name leakage in source. User screenshot independently corroborated dev-window outcome.
  - [x] verify-human — auto-skipped per drive_mode=autopilot; no integration boundary (phase adds only fresh artifacts); verify-self all-PASS; no Observable Outcome cites an existing consuming surface.
  - [x] verify-codify — no application logic in Phase 1; no test framework installed yet (deferred to Phase 2 P2.3 Vitest + P2.6 cargo test). Build-system properties (Tauri compile, `.app` bundle, file integrity) are observable via `pnpm tauri build` itself — re-running it is the regression check. Codified coverage of "project is hygienic" lands in Phase 2 (`pnpm lint`, `pnpm format --check`, `cargo clippy -- -D warnings`, `cargo fmt --check`). No integration boundary.

- [x] Phase 2: Tooling baselines (lint / format / test)
      **Observable outcomes:**
  - CLI: `pnpm lint` exits 0 (ESLint configured, no errors on the scaffolded code)
  - CLI: `pnpm format --check` (or equivalent Prettier check) exits 0
  - CLI: `pnpm test` runs Vitest and exits 0 with at least one passing test
  - CLI: `cargo fmt --check` exits 0 in `src-tauri/`
  - CLI: `cargo clippy -- -D warnings` exits 0 in `src-tauri/`
  - CLI: `cargo test` exits 0 in `src-tauri/` with at least one passing `#[test]`
  - [x] P2.1 Add ESLint config (flat config, eslint v9+) with TypeScript + React 19 plugins; ensure `pnpm lint` script exists in `package.json`
  - [x] P2.2 Add Prettier config (`.prettierrc` minimal: defaults are fine); ensure `pnpm format` and `pnpm format --check` scripts exist
  - [x] P2.3 Add Vitest to devDependencies; add `pnpm test` script; write one trivial passing test (e.g., `src/__tests__/smoke.test.ts` asserting `1 + 1 === 2`)
  - [x] P2.4 Confirm `cargo fmt` produces no diff on the scaffold's `src-tauri/`; if it does, run it once and commit
  - [x] P2.5 Confirm `cargo clippy -- -D warnings` is clean; address any warnings in the scaffolded code
  - [x] P2.6 Add one `#[test]` in `src-tauri/src/` (e.g., `#[test] fn smoke() { assert_eq!(2 + 2, 4); }`); confirm `cargo test` exits 0
  - [x] verify-auto — 6/6 Observable Outcome commands re-run clean: `pnpm lint`, `pnpm format:check`, `pnpm test` (1 passed), `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` (1 passed in lib).
  - [x] verify-self — subagent confirmed 6/6 PASS via fresh Bash runs. Noted: cargo commands must run from `src-tauri/` (no root `Cargo.toml`), but the canonical command path passes cleanly.
  - [x] verify-human — auto-skipped per drive_mode=autopilot; no integration boundary (toolchain configs + smoke tests are fresh artifacts); verify-self all-PASS; no Observable Outcome cites an existing consuming surface.
  - [x] verify-codify — the 6 toolchain commands ARE the codified regression checks (each one fails if the toolchain breaks); the Vitest smoke test + Rust `tests::smoke` are themselves the codified "test framework runs" coverage. No additional tests needed — no integration boundary, no extant behavior to cover beyond what the just-installed commands gate. Full suites re-run clean: 1 Vitest test passed, 1 Rust test passed.

## Current Node

- **Path:** Feature > ship
- **Active scope:** All phases complete. Next: ship.
- **Blocked:** none
- **Unvisited:** ship → review-quality → finalize
- **Open discoveries:** none

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

- [SURFACED-2026-06-16] Phase 1 — Rust toolchain (`rustup`/`cargo`/`rustc`) was not installed on the host at WP1 entry. User installed via `rustup-init` mid-flow. Project `CLAUDE.md` already lists this as a prerequisite, so this is a one-time onboarding gotcha, not a project-level gap. No backlog entry needed.
- [SURFACED-2026-06-16] Phase 1 — pnpm v11 moved `onlyBuiltDependencies` allowlist from `package.json` into `pnpm-workspace.yaml` as `allowBuilds:`. Auto-generated stub file appears on first install with `set this to true or false` literal placeholder — must be edited to `true`. Recorded in `pnpm-workspace.yaml` (committed).
- [SURFACED-2026-06-16] Phase 1 — Bash subshells in this Claude Code session do not inherit `~/.cargo/env` from the user's login shell. Every Bash invocation that needs `cargo` (Tauri build/dev, `cargo clippy/fmt/test` in Phase 2) must prepend `export PATH="$HOME/.cargo/bin:$PATH"`. This is a session-execution detail, not a project artifact — but tasks in Phase 2 must include the export.
- [SURFACED-2026-06-16] Phase 2 — ESLint v10 (Nov 2025) is incompatible with `eslint-plugin-react` 7.37.5 (`contextOrFilename.getFilename is not a function`). Pinned ESLint and `@eslint/js` to `^9` (v9.39.4 LTS). Revisit when `eslint-plugin-react` ships a v10-compatible release. Low-priority — v9 is the broad-ecosystem norm.
- [SURFACED-2026-06-16] Phase 2 — The scaffold's default `App.tsx` had three `target="_blank"` anchors without `rel="noreferrer"`; `react/jsx-no-target-blank` caught them. Auto-fixed via `eslint --fix`. The whole `App.tsx` will be replaced in WP5 anyway, so this is throwaway — but it's the kind of finding that justifies the lint baseline existing from day one.
