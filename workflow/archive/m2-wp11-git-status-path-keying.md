---
workflow: task
state: closed (completed)
created: 2026-06-22
completed: 2026-06-22
docs-only: false
drive_mode: autopilot
---

# Task: WP11 git-status path-keying — re-base status-map keys to the workspace root

**Workflow:** task
**State:** closed (Completed 2026-06-22)
**Created:** 2026-06-22

## Problem Statement
`git_file_statuses` returns repo-root-relative paths (via `Repository::discover` walking up to the enclosing `.git`), but the file tree keys rows by workspace-root-relative paths, so a workspace nested below its repo root renders no git indicators (silent, graceful).

## Context
- **Backlog item:** `SURFACE-2026-06-21-QUALITY-WP11-GIT-STATUS-PATH-KEYING` (`workflow/backlog.md` L23-27 + `backlog-quality-findings.md` → `# m2-wp11-tree-density-git-indicators`). MAJOR, medium priority. M2-close blocker #2 of 2.
- **The mismatch (confirmed by reading):**
  - `src-tauri/src/git_status/mod.rs::status_map_core` — opens the repo via `git_diff::open_repo` → `Repository::discover(repo_root)`, which discovers **upward**. `repo.statuses()` then yields paths relative to `repo.workdir()` (the **repo root**), e.g. `subdir/file.txt`.
  - `src/components/workspace/filetree/buildTree.ts` (`TreeEntry.path`) + `FileTree.tsx:203` (`gitStatus[node.path]`) — keys are **workspace/project-root-relative** POSIX paths from `fs_tree`, e.g. `file.txt`.
  - When workspace == repo root → keys match (today's verify-human green baseline). When workspace is a subdir of the repo → keys diverge → `gitStatus[node.path]` always misses → no indicators.
- **git2 0.21** — `Repository::workdir() -> Option<&Path>` returns the canonical absolute working-dir path. `repo_root` (the `root` IPC arg) may be non-canonical; the codebase's pattern (`editor_fs::resolve_within`) is to `Path::canonicalize` before comparing.
- **Wiring:** `git_status::commands::git_file_statuses` (lib.rs:67) passes `root` (the workspace dir) straight to `status_map_core`. No frontend change needed — the fix re-keys server-side so `node.path` lookups hit.
- **arch.md:** 352 lines (>300 size guard) — but it has no `git_status`/path-keying content and this is an internal key-derivation fix (wire shape `path → status` unchanged, no cross-module boundary change), so the conditional-read trigger does not apply. Size guard noted; eager read skipped.

## Fix approach
In `status_map_core`, after `open_repo` succeeds:
1. Resolve the strip prefix = the workspace dir relative to the repo working dir:
   - `workdir = repo.workdir()` (canonical absolute; if `None` — bare repo — there are no working-tree statuses, return empty map).
   - `ws_canon = repo_root.canonicalize()` (fall back to `repo_root` as-is if canonicalize fails, e.g. path doesn't exist — then the loop simply finds no matches → empty map, same graceful posture).
   - `rel = ws_canon.strip_prefix(workdir)` → the workspace's path *within* the repo (empty when workspace == repo root).
2. For each status entry path (repo-root-relative POSIX):
   - If `rel` is empty → keep the path as-is (preserves current behavior exactly).
   - Else if the path starts with `rel + "/"` → re-key to the remainder (strip `rel/`), so `subdir/file.txt` → `file.txt` (matches `node.path`).
   - Else (path is outside the workspace subtree, e.g. a sibling dir of the workspace) → **omit** (the tree never renders those rows).
3. Build POSIX-relative comparison carefully: git paths are `/`-joined; `rel` from `strip_prefix` is an OS `Path` → convert to a `/`-joined string for the prefix test (macOS-only project, native sep is `/`, but normalize via `Path`→components→join to be correct and clear).

Empty-`rel` short-circuit guarantees the workspace==repo-root path is byte-for-byte unchanged (all existing tests stay green untouched).

## Work Tree

- [x] T1 Re-base keys in `status_map_core` (`git_status/mod.rs`): compute the workspace-within-repo prefix from `repo.workdir()` + canonical `repo_root`, strip it from each entry path, omit out-of-subtree entries; empty-prefix short-circuit preserves the workspace==repo-root path  <!-- status: complete -->
  - Added `within_repo_prefix()` (canonical workdir + canonical repo_root → `/`-joined POSIX prefix, empty when ws==repo root) + `rebase_to_workspace()` (strip prefix/, `None` ⇒ outside subtree → dropped).
  - **In-passing fix:** also added `recurse_untracked_dirs(true)` to `StatusOptions` — see Discoveries. Surfaced by the nested-workspace test: an untracked subdir collapsed to one `ws/` entry that re-based to the empty key.
- [x] T2 Add regression tests: (a) workspace nested below repo root → file keyed workspace-relative (the bug case); (b) a changed file in a SIBLING dir outside the workspace is omitted; (c) the existing workspace==repo-root tests still pass unchanged  <!-- status: complete -->
  - `workspace_nested_below_repo_root_is_keyed_workspace_relative` + `change_outside_workspace_subtree_is_omitted` added; all 8 prior tests unchanged + green.
- [x] T3 Run gate — `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt`; confirmed diff touches only `git_status/mod.rs`  <!-- status: complete -->
  - **138 tests pass** (136 prior + 2 new), clippy clean, fmt clean. `git diff --stat`: only `src-tauri/src/git_status/mod.rs` (the `wbs.md` 3-line change is the pre-existing session status comment, unrelated).

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** 1 in-passing fix (recurse_untracked_dirs) — folded into this task, no separate item needed

## Verification Observable

**Observable:** Against a real `git` fixture where the workspace dir is a SUBDIR of the repo root, `status_map_core(&workspace_subdir)` returns a map keyed by the workspace-relative path (`nested.txt`), NOT the repo-relative path (`ws/nested.txt`) — i.e. the nested workspace now shows its git indicators instead of silently showing none.
**Verification command:** `cd src-tauri && cargo test git_status::tests::workspace_nested_below_repo_root_is_keyed_workspace_relative -- --exact --nocapture`
**Expected result:** exit 0, `test result: ok. 1 passed`.

## Verification Result

**Status:** PASS
**Date:** 2026-06-22
**Evidence:** `cargo test git_status::tests::workspace_nested_below_repo_root_is_keyed_workspace_relative -- --exact` → exit 0, `test result: ok. 1 passed; 0 failed`. The test asserts `map.get("nested.txt") == Some(Untracked)` AND `!map.contains_key("ws/nested.txt")` against a real git fixture where the workspace is the `ws/` subdir of the repo root.
**Notes:** Confirms the failure mode is fixed — a workspace nested below its repo root now produces workspace-relative keys that the tree's `gitStatus[node.path]` lookup hits. Full gate (138 tests, clippy, fmt) was already green at act exit.

## Retrospect
- **What changed in our understanding:** The root cause was already half-built into the code — `open_repo` uses `Repository::discover` (walks upward), which is exactly why libgit2 reports repo-root-relative paths. The fix wasn't "change how we open the repo" but "re-key what it reports." A second, latent bug hid behind the first: `StatusOptions` defaulted to collapsing untracked subdirs into one entry, which the tree (file-row-only) could never mark — invisible until the nested-workspace test forced an untracked subdir into the picture.
- **Assumptions that held:** The empty-prefix short-circuit kept the workspace==repo-root path byte-for-byte unchanged (all 8 prior tests green untouched). No frontend change needed — server-side re-keying was sufficient. Task scope (one Rust file) was correct.
- **Assumptions that were wrong:** The original plan's 3 test cases assumed a per-file untracked path would just appear; the first test run produced `{"": Untracked}` because the untracked subdir collapsed to a single `ws/` entry that re-based to the empty key. Caught immediately by the regression test — which is the value of writing the bug-case test first.
- **Approach delta:** Plan was followed exactly for the re-keying helpers; the only delta is the in-passing `recurse_untracked_dirs(true)` addition, surfaced by T2's test and folded in as part of correct path-keying (recorded in Discoveries, no separate backlog item).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[SURFACED-2026-06-22] T1 (folded into this task, no backlog item) — `StatusOptions` lacked `recurse_untracked_dirs(true)`, so an untracked subdir reported as one collapsed `subdir/` entry rather than per-file. Latent even at the repo-root baseline (the tree marks files, not dirs, so files under an untracked dir got no indicator); surfaced sharply in the nested-workspace case where the lone `ws/` entry equaled the strip prefix and re-based to an empty key. Fixed in the same change — it's part of correct path-keying, not separable.
