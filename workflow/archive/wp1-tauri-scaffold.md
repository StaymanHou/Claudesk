---
workflow: feature
state: ship (complete)
created: 2026-06-16
drive_mode: autopilot
wbs_ref: WP1
ship_commit: c50a785
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

- **Path:** Feature > finalize
- **Active scope:** review-quality complete (4 MAJOR + 5 MINOR auto-backlogged). Next: finalize.
- **Blocked:** none
- **Unvisited:** finalize
- **Open discoveries:** code-quality findings backlogged per autopilot policy

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

- [SURFACED-2026-06-16] Phase 1 — Rust toolchain (`rustup`/`cargo`/`rustc`) was not installed on the host at WP1 entry. User installed via `rustup-init` mid-flow. Project `CLAUDE.md` already lists this as a prerequisite, so this is a one-time onboarding gotcha, not a project-level gap. No backlog entry needed.
- [SURFACED-2026-06-16] Phase 1 — pnpm v11 moved `onlyBuiltDependencies` allowlist from `package.json` into `pnpm-workspace.yaml` as `allowBuilds:`. Auto-generated stub file appears on first install with `set this to true or false` literal placeholder — must be edited to `true`. Recorded in `pnpm-workspace.yaml` (committed).
- [SURFACED-2026-06-16] Phase 1 — Bash subshells in this Claude Code session do not inherit `~/.cargo/env` from the user's login shell. Every Bash invocation that needs `cargo` (Tauri build/dev, `cargo clippy/fmt/test` in Phase 2) must prepend `export PATH="$HOME/.cargo/bin:$PATH"`. This is a session-execution detail, not a project artifact — but tasks in Phase 2 must include the export.
- [SURFACED-2026-06-16] Phase 2 — ESLint v10 (Nov 2025) is incompatible with `eslint-plugin-react` 7.37.5 (`contextOrFilename.getFilename is not a function`). Pinned ESLint and `@eslint/js` to `^9` (v9.39.4 LTS). Revisit when `eslint-plugin-react` ships a v10-compatible release. Low-priority — v9 is the broad-ecosystem norm.
- [SURFACED-2026-06-16] Phase 2 — The scaffold's default `App.tsx` had three `target="_blank"` anchors without `rel="noreferrer"`; `react/jsx-no-target-blank` caught them. Auto-fixed via `eslint --fix`. The whole `App.tsx` will be replaced in WP5 anyway, so this is throwaway — but it's the kind of finding that justifies the lint baseline existing from day one.

## Code-Quality Review — wp1-tauri-scaffold

### Strengths
- Scaffold-and-merge discipline executed cleanly: strategic load-bearing files (`CLAUDE.md`, `docs/product/`, `_ref/` symlink, `.gitignore` with `_ref/` rule) survived intact, and `.gitignore` was additively merged rather than overwritten — exactly the pre-risky-action protocol from the global CLAUDE.md.
- ESLint v9 LTS pin with documented rationale (v10/eslint-plugin-react incompatibility, SURFACED in WIP) — a real-world-grounded decision over a "use latest" reflex, with a clear revisit trigger.
- `runtimes.md` populated proactively on the very first feature with three baseline measurements (`pnpm install`, `pnpm tauri dev`, `pnpm tauri build`) — sets the registry up for future-session inheritance from day one rather than as a retrofit.
- `.prettierignore` explicitly lists strategic docs (`CLAUDE.md`, `docs/`, `workflow/`, `runtimes.md`) with a "preserve author's spacing" comment — defensive against accidental reformatting of load-bearing prose.
- Smoke tests on both sides (Vitest + Rust `#[cfg(test)]`) are minimal-but-real — they exercise the test runner harness end-to-end without overengineering.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [index.html:7] `<title>Tauri + React + Typescript</title>` is the scaffold default — when `pnpm tauri dev` opens the window the user-visible chrome shows the template title, not "Claudesk". Tauri's window title overrides this for the native window, but the HTML title leaks into devtools/web inspector. — One-line fix.
- [README.md:1-7] README still reads "Tauri + React + Typescript — This template should help get you started…" — pure scaffold-default text. A single-line replacement ("# Claudesk — see CLAUDE.md and docs/product/vision.md") would prevent a misleading first impression.
- [src-tauri/tauri.conf.json:14-18] Window is 800x600 (scaffold default). Product vision describes a Mission-Control-style multi-workspace layout with center-stage + filmstrip; 800x600 is too small even at N=1. Will be reset in WP5/Phase 1 polish, but it creates a misleading dev-loop for WP2/WP3/WP4 probes.
- [src-tauri/src/lib.rs:2-5] The scaffold's `greet` Tauri command + its `invoke_handler!` registration is dead code that ships into the bundle and is reachable from any code with `@tauri-apps/api/core` access. WP7 will define the real command surface; removing the demo now (~3 lines) prevents a permanent reachable surface the team has no plan to support.

**MINOR**
- [.prettierrc.json:1] `{}` — empty object is a no-op; the file's existence is the only signal. A single explicit property would document intent.
- [eslint.config.js:7-37] No comment explains the layering or the `react/react-in-jsx-scope: off` shim. 2-line comment would inoculate future debugging.
- [src/__tests__/smoke.test.ts:5 vs src-tauri/src/lib.rs:20] Vitest uses `1+1` and Rust uses `2+2` for the same smoke-test purpose. Cosmetic.
- [pnpm-workspace.yaml:1-2] `allowBuilds: { esbuild: true }` ships without an explanatory comment. The WIP discovery notes pnpm v11 moved this from `package.json`; a one-line comment would prevent re-discovery.
- [vite.config.ts:4] `// @ts-expect-error process is a nodejs global` is scaffold-default; the right fix is `import { env } from "node:process"`. The directive will silently bit-rot if `process` ever does get typed.

### Assessment
A careful, well-disciplined first feature. The hard part of WP1 — running a destructive-capable scaffolder inside a repo with load-bearing strategic docs — was executed by-the-book (sibling-dir scaffold + selective merge + post-merge integrity checks). Tooling baselines are real on both sides, both smoke tests pass, runtimes.md was populated proactively. The MAJOR findings are all post-scaffold polish the scaffolder left behind: window title, README, default window size, and the demo `greet` command — each individually trivial, but together they're the kind of scaffold-debt much cheaper to clean now than after WP5 lands on top. None blocks shipping or threatens correctness.

### If you disagree
Operator: dismiss any finding by editing this section in the WIP file and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

**Disposition (drive_mode=autopilot):** 4 MAJOR + 5 MINOR auto-backlogged to `workflow/backlog-quality-findings.md` with a pointer in `workflow/backlog.md`. Re-run `/feature-refactor` to address; mark `[DISMISSED]` here to drop.

## Retrospect
- **What changed in our understanding:** Tauri 2's `create-tauri-app` is more polite than feared — the React+TS template is small, doesn't fight `.gitignore`, and the sibling-dir-scaffold-then-merge pattern works exactly as documented. The bigger surprise was the surrounding ecosystem: pnpm v11 moved `onlyBuiltDependencies` out of `package.json` into a new `pnpm-workspace.yaml` with an auto-generated stub that contains a literal `set this to true or false` placeholder. ESLint v10 (Nov 2025) is incompatible with `eslint-plugin-react` 7.x — pinned to v9 LTS. Bash subshells in this Claude Code session don't inherit `~/.cargo/env` from the user's login shell, so `cargo` invocations need an explicit `export PATH="$HOME/.cargo/bin:$PATH"` prefix.
- **Assumptions that held:** Scaffold-and-merge survives strategic docs (`CLAUDE.md`, `docs/product/`, `_ref/` symlink) when executed carefully. The Tauri 2 dev compile is fast enough on this hardware (29s first compile, sub-second incremental). The `claudesk_lib::run()` lib + bin split that the scaffold produces matches the long-term shape we want.
- **Assumptions that were wrong:** The project `CLAUDE.md` lists "Rust ≥1.77 via `rustup`" as a prerequisite but I assumed it was already installed (it wasn't — `rustup` had to be installed mid-flow). Prettier with default config will silently reformat hand-authored strategic docs in `docs/`, `CLAUDE.md`, and `workflow/` — required adding those paths to `.prettierignore` after the fact.
- **Approach delta:** Plan was 8 tasks across 2 phases; landed exactly that, but with three unplanned mid-flight fixes: (1) `rustup` install, (2) `pnpm-workspace.yaml` `allowBuilds: esbuild` configuration, (3) ESLint v9 pin after v10 incompatibility surfaced. None reshaped the plan — they fit inside existing leaves as the realistic-execution detail.

## Communicate

> **Feature complete:** WP1 — Tauri 2 scaffold + dev environment — has shipped. The repo now has a working `pnpm tauri dev` that opens a Claudesk-titled window on macOS and a `pnpm tauri build` that produces `src-tauri/target/release/bundle/macos/Claudesk.app`. Lint, format, and test toolchains are green on both the JS side (ESLint v9 + Prettier + Vitest) and the Rust side (`cargo fmt --check` / `cargo clippy -- -D warnings` / `cargo test`). Verify by running `pnpm tauri dev` from the repo root.

Requester = operator — closure notice for self-record.
