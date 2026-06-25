# Feature: QoL-WP5 — Editor file management (add new file + delete file)

**Workflow:** feature
**State:** verify-codify (all phases complete) — ready to ship
**Created:** 2026-06-25
**Drive mode:** autopilot

## Problem Statement
The lite editor can only OPEN existing files (⌘P finder, FileTree click, diff "Open", search results) — it has no path to **create** a new file or **delete** an existing one. WP5 adds both as basic file-management affordances confined to the workspace root: (1) create a new file — name it, `write_file` an empty buffer under the root via the existing `editor_fs`, then open it in the focused pane; (2) delete an existing file — a new root-confined `delete_file(root, path)` in `editor_fs` mirroring `write_file`'s `resolve_within` confinement, confirm-before-delete via the editor's `ConfirmModal`, and tear down any open tab(s) for the deleted file. Surface both in the `FileTree` rail (a "+ new file" control + a per-row delete action). Reserve **⌘N** for create-file (pairs with WP6's ⌘⇧N so the chord pair lands coherently). Collision-on-create must not clobber an existing file; recursive folder delete is OUT of scope for v1. Tree refresh rides the WP0 fs-watcher but is ALSO triggered explicitly so it's immediate.

## Context / key seams (verified at plan time)
- **Backend** `src-tauri/src/editor_fs/mod.rs` — pure `read_file_core`/`write_file_core`/`stat_file_core` + `resolve_within(root, requested)` (the security boundary: canonicalizes root + the target's PARENT, rejects escapes/symlinks-out with `EditorFsError::OutsideWorkspace`; parent dir must already exist). `commands.rs` wraps each as a `#[tauri::command]` mapping the typed error to `String`. Registered in `lib.rs` (~164–168). **Create** = the existing `write_file` with empty contents (no new backend needed). **Delete** = a NEW `delete_file_core` + `delete_file` command.
- **`resolve_within` constraint:** the target's parent dir must exist (it canonicalizes the parent). For v1 create, files are created in EXISTING dirs (workspace root or an already-present subdir) — `mkdir -p` of new intermediate dirs is out of scope. A create into a missing dir returns the existing `EditorFsError::Io` ("parent dir … No such file or directory"), surfaced inline — acceptable v1 behavior.
- **Frontend FileTree** `src/components/workspace/filetree/FileTree.tsx` — renders `fs_tree` walk; `onOpen(path)` is the shared open seam; `fsTreeRefreshKey` bump forces a re-walk (WP0). The rail container + collapse/resize live in `RightPanelHost.tsx` (`fileTreeRail`, ~413–455). No inline-input pattern exists yet — add one.
- **Editor open seam** `RightPanelHost.openFile(path)` (~261) → `editorSplitRef.current?.openFile(path)` → focused pane's `PaneTabs.openFile`. This is how a freshly-created file opens into a tab.
- **Tab teardown** `PaneTabs` closes a tab by **id** (`openFilesReducer` `close` action takes `id`, not path) via `requestClose(id)`/`doClose(id)`. There is **no close-by-path** today — DELETE needs one (a deleted file's tab(s) across panes must disappear). Add a `close-path` action to `openFiles.ts` + thread a `closeTabsForPath(path)` through `EditorSplitHandle` → each `PaneTabs`. The deleted file's shared `editorDocs` `DocEntry` is ref-counted down by the existing `onTabClose` path as tabs close.
- **ConfirmModal** `src/components/workspace/editor/ConfirmModal.tsx` + pure specs in `confirmDialog.ts` (`closeDirtySpec`/`conflictSpec`/`closeWorkspaceSpec`). Add a `deleteFileSpec(name)` (Delete danger / Cancel primary, Esc→cancel) for delete confirm.
- **⌘N wiring** — RightPanelHost's capture-phase `keydown` listener (~366–404, gated on `visible`) already hosts ⌘P / ⌘⇧E·D·T / ⌘1..9 / ⌘W. Add ⌘N (bare meta+N, no Shift — disjoint from WP6's ⌘⇧N) → open the new-file input. A pure `newFileChord` predicate mirrors `finder/finderChord.ts`.
- **Repo posture:** pure logic → vitest (`openFiles.ts`, `confirmDialog.ts`, a new `newFilePath.ts` collision/path helper, `newFileChord.ts`); live DOM/interaction → operator verify-human (the standing convention — agent CANNOT drive the Tauri-backed FileTree in a bare Vite browser; carry live outcomes to verify-human). Backend → `cargo test` against `TempDir`.

## Work Tree

- [x] Phase 1: Backend delete_file + create reuse  <!-- status: [x] COMPLETE — shipped impl + 6 editor_fs tests; full suite 237 pass -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk editor_fs` passes, incl. new tests — `delete_file_core` removes a file under root and round-trips (create→delete→read errors); a `..`/absolute-outside path is rejected with `OutsideWorkspace` and the outside file is NOT removed; deleting a missing file is `EditorFsError::Io`; deleting a directory is rejected (not `remove_file`'d).
  - CLI: `cargo test` whole-suite still green (no regression); `cargo clippy -- -D warnings` clean; `cargo fmt --check` clean.
  - CLI: create-path is the existing `write_file` with `""` — a test writes an empty file under root via `write_file_core` and `read_file_core` returns `""` (documents the create primitive; no new backend code for create).
  - [x] P1.1 Add `delete_file_core(root, requested)` to `editor_fs/mod.rs` — `resolve_within` (reuse), then reject a directory target (`metadata` → `is_dir` → `IsDirectory`, NOT recursive remove), else `fs::remove_file`. New `EditorFsError::IsDirectory(String)` variant added. Root-confinement + no-recursion invariants documented.  <!-- status: [x] -->
  - [x] P1.2 Added the `delete_file(root, path) -> Result<(), String>` command wrapper in `editor_fs/commands.rs` (mirrors `write_file`) + registered in `lib.rs` `generate_handler!`.  <!-- status: [x] -->
  - [x] P1.3 Unit tests in `editor_fs/mod.rs` `#[cfg(test)]`: delete-ok-round-trips, delete-escaping-root-rejected (+ outside file survives), delete-absolute-outside-rejected, delete-missing-is-Io, delete-directory-rejected (contents survive), create-via-empty-write doc test. 21 editor_fs tests pass (+6).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — cargo test editor_fs 21 pass (+6); clippy --all-targets -D warnings clean; rustfmt --check on WP5 files clean -->
  - [x] verify-self  <!-- status: [x] — backend-only phase, all outcomes are CLI/cargo (no live frontend, no dev-url, no integration boundary — isolated new artifacts only). Agent-verifiable slice run live: cargo test editor_fs 21 pass; whole-suite 237 pass no regression; clippy + rustfmt clean. No live outcomes to carry to verify-human. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (F11) per drive_mode=autopilot: no integration boundary (isolated new artifacts: delete_file_core, delete_file command, IsDirectory variant, handler registration; no caller yet), verify-self all-PASS. -->
  - [x] verify-codify  <!-- status: [x] — the 6 editor_fs tests (TDD-written in build) fully codify the verified behavior; highest-level type available for a pure backend module (the command has no caller until Phase 3). No new tests needed. Full suite 237 pass, no regression. No integration boundary. -->

- [x] Phase 2: Pure-logic frontend seams (close-by-path, collision helper, ⌘N chord)  <!-- status: [x] COMPLETE — 4 seams + 16 tests; full suite 503 pass -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run` passes, incl. new tests — `openFilesReducer` `close-path` removes ALL tabs whose `path === target` (multiple-tab case) and reassigns/empties `activeTabId` correctly, and is a no-op for an unknown path / synthetic tabs; `newFilePath` helper joins a name to a dir, rejects empty/`..`/absolute names, and reports collision against a provided existing-path set; `newFileChord` matches meta+N (no shift) and rejects ⌘⇧N / plain N / ⌘P; `deleteFileSpec` yields Delete(danger)/Cancel(primary) with Esc→cancel.
  - CLI: `pnpm tsc --noEmit` + `pnpm eslint` clean (catches broken imports/JSX across the change).
  - [x] P2.1 `openFiles.ts` — added `{ type: "close-path"; path: string }` to `OpenFilesEvent` + reducer case: filters out every file tab with that path (synthetic tabs untouched), reassigns `activeTabId` via the `close` slot-neighbor rule, empties → null, identity no-op when no tab matches.  <!-- status: [x] -->
  - [x] P2.2 `newFilePath.ts` (new pure module) — `proposeNewFilePath(dir, name)` → `{ok:true, path}` or `{ok:false, reason}` (rejects empty/`.`/`..`/path-separator/absolute); `collides(path, existingPaths)` exact-match boolean. Path-string composition only, no IO.  <!-- status: [x] -->
  - [x] P2.3 `newFileChord.ts` (new pure predicate) — `isNewFileChord(e)` = meta && !shift && key==="n", mirroring `finderChord.ts`. Reserves ⌘N (disjoint from ⌘⇧N WP6 + ⌘P finder; the ⌘⇧+digit filmstrip reservation is Shift+digit, no conflict).  <!-- status: [x] -->
  - [x] P2.4 `confirmDialog.ts` — added `deleteFileSpec(name)` + `DeleteFileChoice = "delete" | "cancel"` (Cancel primary / Delete danger, Esc→cancel).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — vitest openFiles+confirmDialog+newFileChord+newFilePath 48 pass (+16); tsc --noEmit clean; eslint clean; prettier clean -->
  - [x] verify-self  <!-- status: [x] — pure-logic phase, all outcomes CLI (no live frontend, no dev-url, no integration boundary — new artifacts not yet consumed; existing openFiles dispatch paths untouched). Agent-verifiable slice (= the whole phase) run live: vitest 48 pass, tsc/eslint/prettier clean. No live outcomes to carry to verify-human. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (F11) per drive_mode=autopilot: no integration boundary (isolated new artifacts: close-path action, newFilePath helpers, newFileChord, deleteFileSpec — no caller yet), verify-self all-PASS. -->
  - [x] verify-codify  <!-- status: [x] — 16 unit tests (TDD-written in build) fully codify the 4 seams; unit is the correct level (no higher surface until Phase 3 wires them). Full suite 503 pass, no regression. No integration boundary. -->

- [x] Phase 3: Wire the UI — create + delete in the FileTree rail, ⌘N, tab teardown  <!-- status: [x] COMPLETE — all 8 vh PASS; vitest 514 + cargo 237 green -->
  **Observable outcomes:** (live — carried to verify-human per the backend/UI convention; the agent verifies the static slice in verify-self)
  - Browser/live: a "+ new file" control in the FileTree rail opens an inline name input; entering a name creates the file (empty), the tree refreshes to show it, and it opens in a focused-pane tab. ⌘N opens the same input.
  - Browser/live: creating a file whose name collides with an existing file is REJECTED with an inline message — the existing file is NOT clobbered.
  - Browser/live: a per-row delete action on a file shows the ConfirmModal; confirming deletes the file from disk, the tree refreshes to drop it, and any open tab(s) for it close (including the dirty-tab case — the confirm covers data loss). Canceling changes nothing.
  - Console: no JS errors on create/delete; a backend error (e.g. delete failure) surfaces inline, never swallowed (the WP6 IPC-error lesson).
  - CLI (agent-side static slice): `pnpm tsc --noEmit`, `pnpm eslint`, `pnpm vite build` all clean (broken imports/JSX caught); a `?raw` source-assertion test pins the wiring (create→write_file+openFile; delete→delete_file+close-path+fsTreeRefresh; ⌘N→new-file input).
  - [x] P3.1 FileTree → `forwardRef<FileTreeHandle>` exposing `beginNewFile()`; inline name-input row (Enter submits / Esc/blur cancels / inline error) at the top of the loaded body; per-file-row hover ✕ (`file-tree-delete`, visibility:hidden→visible on row hover, red on hover) calling `onDeleteFile(node.path)`. RightPanelHost rail header gained a "+ new file" button beside the collapse toggle (hidden when collapsed). New CSS: `.file-tree-header/-newfile/-newfile-input/-newfile-error/-newfile-btn/-delete`. IPC errors surfaced inline.  <!-- status: [x] -->
  - [x] P3.2 `createFile(name, existingPaths)` in RightPanelHost: `proposeNewFilePath(null, name)` (root v1) → `collides` (reject clobber) → `invoke("write_file", {root, path, contents:""})` → `openFile(path)` → bump `fsTreeRefreshKey`. Returns an error string (shown inline) or null. IPC error → inline.  <!-- status: [x] -->
  - [x] P3.3 `requestDeleteFile`/`onDeleteConfirm` in RightPanelHost: ✕ → `setPendingDelete` → `ConfirmModal` with `deleteFileSpec(labelForPath(path))` → on "delete" `invoke("delete_file", {root, path})` → `editorSplitRef.current?.closeTabsForPath(path)` → bump `fsTreeRefreshKey`. Added `closeTabsForPath` to `EditorSplitHandle` (fans out to EVERY pane via the handle map) + `PaneTabsHandle` (dispatches P2.1 `close-path`; ref-count drops via the existing prevPaths diff). Failure logged (not swallowed).  <!-- status: [x] -->
  - [x] P3.4 ⌘N: `isNewFileChord(e)` added to the RightPanelHost capture-phase keydown listener (gated on `visible`, before `panelForChord`) → flip to editor panel + `fileTreeRef.current?.beginNewFile()`. `preventDefault` pre-empts any OS binding.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — tsc --noEmit clean; eslint (4 changed components) clean; pnpm vite build succeeds (broken-import/JSX catch); editorFileManagement.test.ts 11 wiring assertions pass; prettier clean -->
  - [x] verify-self  <!-- status: [x] — integration-boundary phase (live UI). Per CLAUDE.md "verify-self operator-only at the live tier": the Tauri-backed FileTree create/delete/⌘N flow is unobservable in a bare Vite browser (no IPC → no workspace mounts) + no .app in-session, so NO Playwright subagent spawned against a non-existent surface. Agent-doable STATIC slice PASSES: tsc/eslint/vite build clean + 11 ?raw wiring assertions. The 3 Browser/live + Console outcomes are UNVERIFIED-by-agent → CARRIED to verify-human (operator drives pnpm tauri:dev / installed .app). -->
  - [x] verify-human  <!-- status: [x] — operator: ALL 8 PASS (2026-06-25) -->
    - [x] P3.vh.1 Create via "+ button"  <!-- status: [x] PASS -->
    - [x] P3.vh.2 Create via ⌘N  <!-- status: [x] PASS -->
    - [x] P3.vh.3 Collision rejected (no clobber)  <!-- status: [x] PASS -->
    - [x] P3.vh.4 Invalid name rejected inline  <!-- status: [x] PASS -->
    - [x] P3.vh.5 Delete confirms + removes + refreshes  <!-- status: [x] PASS -->
    - [x] P3.vh.6 Delete closes the open tab  <!-- status: [x] PASS -->
    - [x] P3.vh.7 Delete cancel changes nothing  <!-- status: [x] PASS -->
    - [x] P3.vh.8 No JS console errors on create/delete  <!-- status: [x] PASS -->
  - [x] verify-codify  <!-- status: [x] — every operator-confirmed behavior has highest-available codified coverage: Phase 1 cargo delete tests + Phase 2 unit seams (proposeNewFilePath/collides/close-path/isNewFileChord/deleteFileSpec) + Phase 3 ?raw wiring (11 assertions). No jsdom/RTL harness in-repo (pre-existing SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP, not WP5's to solve). Integration-boundary consuming-surface requirement met by the wiring test. Full suite green: vitest 514, cargo 237. No new tests needed. -->
  <!-- Operator Qs at verify-human (2026-06-25): (1) create-in-folder and (2) delete-folder.
       Both are DELIBERATE v1 scope cuts (per plan + qol-wbs.md): create is root-only ("no
       nested-dir create"), delete is single-file-only ("Folder delete (recursive) is OUT of
       scope v1"). NOT defects — the feature works as scoped. Logged as a follow-up SURFACE
       rather than back-looping. See SURFACE-2026-06-25-EDITOR-FOLDER-FILE-OPS. -->

## Current Node
- **Path:** Feature > COMPLETE — ready to ship
- **Active scope:** ALL THREE PHASES COMPLETE (every node [x]); next is /feature-ship
- **Blocked:** none
- **Unvisited:** none — ship
- **Open discoveries:** SURFACE-2026-06-25-EDITOR-FOLDER-FILE-OPS (low — create-in-folder + delete-folder, both deliberate v1 scope cuts; logged, not blocking)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[SURFACED-2026-06-25] Phase 3 verify-human — operator asked for (A) create-file-inside-a-folder and (B) delete-a-folder. Both are DELIBERATE v1 scope cuts (create is root-only; folder-delete is OUT per qol-wbs.md), not defects — all 8 vh checks passed. Logged as SURFACE-2026-06-25-EDITOR-FOLDER-FILE-OPS (low priority, two scoped extensions). (A) is cheap — backend already supports nested-existing-dir writes; (B) is riskier — needs delete_dir + stronger confirm + prefix-match tab teardown + ideally Trash.
