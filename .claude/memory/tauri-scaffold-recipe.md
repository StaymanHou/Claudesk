---
name: tauri-scaffold-and-merge-recipe
description: The exact non-interactive command and merge pattern used to scaffold WP1 (Tauri 2 + React + TS + Vite) without destroying strategic docs.
type: reference
---

`pnpm create tauri-app` accepts non-interactive flags:

    pnpm create tauri-app <project-name> \
      --manager pnpm \
      --template react-ts \
      --identifier com.claudesk.app \
      --tauri-version 2 \
      --yes

**Merge pattern (used WP1, 2026-06-16):** the scaffolder was run in a SIBLING temp dir (`../claudesk-scaffold-tmp/`), then files were copied into the repo with `cp -n` and `cp -Rn` (no-overwrite flags) to preserve existing `CLAUDE.md`, `docs/`, `.gitignore`, `.git/`, `workflow/`, and the `_ref/` symlink. The only conflict was `.gitignore`, merged by hand (preserved `_ref/` line + appended scaffold's standard rules). Temp dir deleted after merge.

**Post-merge rename required:** the scaffold uses the project-name argument for the Cargo crate name and product name. Updated `src-tauri/Cargo.toml` (name, lib.name), `src-tauri/tauri.conf.json` (productName, window.title), `package.json` (name), and `src-tauri/src/main.rs` (the `_lib::run()` call) to `claudesk` from the temp-dir name.

**Use case:** if WP1 ever needs redoing, or if Phase 2 spawns a separate Tauri project for the menu-bar popover, this recipe is the load-bearing detail.
