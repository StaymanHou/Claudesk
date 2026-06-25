# Feature: QoL-WP5b — Editor file management, folder depth (create-in-folder + delete-folder)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-06-25
**Drive mode:** autopilot
**Backlog:** SURFACE-2026-06-25-EDITOR-FOLDER-FILE-OPS
**WBS:** docs/product/qol-wbs.md → WP5b

## Problem Statement
QoL-WP5 shipped editor file management at the shallow end only: **create** is root-only (the new-file input rejects any `/`), and **delete** is single-file-only (`delete_file_core` rejects a directory with `IsDirectory`; the ✕ renders on file rows only). WP5b adds the two natural depth extensions the operator asked for at WP5 verify-human: **(A) create a file INSIDE an existing folder**, and **(B) delete a FOLDER (recursive)**. (A) is cheap and low-risk — the backend already permits any existing-parent subpath (`write_in_nested_existing_dir_round_trips` proves it); the blockers are purely frontend. (B) is the riskier piece — a wrong click wipes a subtree — so it gets a stronger confirm, prefix-match tab teardown, and (decided at plan time) **macOS Trash, not a hard `remove_dir_all`**, for recoverability.

## Design decisions (plan-time; operator may override at verify-human)
- **(A) create-in-folder UX shape → per-DIR-row "＋" affordance** (NOT relative-path-in-the-input). Rationale: "create where you clicked" is the clearer mental model, it reuses the existing inline-input machinery scoped to a dir, and it sidesteps the "relative path only when the parent already exists" foot-gun. The backend's `proposeNewFilePath(dir, name)` already takes the `dir` arg (passed `null` today) — wire the clicked dir through it. **No `mkdir -p` / nested-dir create in v1** (matches the backend's existing-parent-only `resolve_within` guard).
- **(B) folder-delete disposition → macOS Trash (recoverable), via the `trash` crate.** Rationale: the blast radius (recursive subtree) makes a hard `remove_dir_all` too dangerous for a single misclick; Trash is recoverable from Finder. This is an intentional asymmetry with WP5's hard single-file delete (a single file is low-stakes + already shipped; not re-litigated here). The new command is named `trash_path` and handles BOTH files and dirs (so a future WP could route single-file delete through it too), but WP5b only wires it to dir rows.

## Work Tree

- [x] Phase 1: Create-in-folder (A)  <!-- status: complete -->

  **Observable outcomes:**
  - CLI (vitest): `proposeNewFilePath("src", "lib.rs")` → `{ ok: true, path: "src/lib.rs" }`; a per-dir-row create path composes the clicked dir + typed name; collision check runs against the dir-scoped path. `pnpm vitest run` green.
  - CLI (build): `pnpm tsc --noEmit` + `pnpm eslint` + `pnpm vite build` exit 0 (no broken imports/JSX across FileTree + RightPanelHost).
  - Browser (verify-human, carried): hovering a directory row in the FileTree shows a "＋" (new-file-here) affordance; clicking it opens the inline name input scoped to that dir; typing `x.txt` + Enter creates `<dir>/x.txt`, opens it in the editor, and the tree refreshes showing the new file under that dir. A name with `/` is still rejected inline. Creating into a non-existent nested dir is rejected with a clear inline message (no `mkdir -p`).
  - [x] P1.1 `FileTree`: extended `onCreateFile` to carry `dir`; `beginNewFile(dir?)` + a new `beginNewFileInDir(dir)` set `newFileDir` and `expand` the dir; per-DIR-row "＋" (`file-tree-newhere`, hover-revealed like the ✕) opens the input scoped to that dir; the input renders body-top for root (null) or inline under the dir row otherwise. Added an idempotent `expand` action to `treeState` (never collapses).  <!-- status: complete -->
  - [x] P1.2 `RightPanelHost.createFile`: now takes `dir` and threads it through `proposeNewFilePath(dir, name)` (was hardcoded `null`); collision check uses the dir-scoped path; empty-`write_file` + `openFile` + `fsTreeRefreshKey` bump unchanged; root create still passes `dir = null`.  <!-- status: complete -->
  - [x] P1.3 `newFilePath.ts`: no logic change (already joins `dir` + name + rejects separators); added WP5b tests — dir-scoped composition, separator-still-rejected-with-a-dir, collision against the dir-scoped path (same name in a different dir is not a collision) — plus `treeState` `expand` tests + editorFileManagement wiring assertions.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — tsc clean, eslint clean, vitest 38 passed (touched suites), vite build ✓ -->
  - [x] verify-self  <!-- status: complete — static slice PASS (tsc/eslint/vitest/vite-build) + wiring trace confirmed end-to-end; live Browser outcome UNVERIFIED-by-agent (no in-session Tauri app — operator-only per CLAUDE.md), carried to verify-human -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [x] verify-human  <!-- status: complete — operator confirmed all 4 leaves on the live app 2026-06-25 -->
    - [x] P1.verify-human.1: Hover a dir row → "＋" appears; click → inline input scoped to that dir  <!-- status: complete -->
    - [x] P1.verify-human.2: Create `<dir>/new.txt` → file appears under that dir, opens in editor  <!-- status: complete -->
    - [x] P1.verify-human.3: Root create (header "＋" + ⌘N) still creates at root (no regression)  <!-- status: complete -->
    - [x] P1.verify-human.4: A `/`-containing name is still rejected inline  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete — coverage written during build (newFilePath dir-scoping + collision, treeState expand, editorFileManagement wiring via ?raw); full suite 525 passed (60 files), no regressions -->


- [x] Phase 2: Delete-folder via Trash (B)  <!-- status: complete -->
  **Observable outcomes:**
  - CLI (cargo): a new `editor_fs` core fn `trash_path_core(root, requested)` is root-confined (reuses `resolve_within`), moves the target (file OR dir) to macOS Trash via the `trash` crate, and rejects an escaping path with `OutsideWorkspace`. New unit tests: trashing a dir removes it from `root` but does NOT hard-delete it from disk-unrecoverably (assert it's gone from `root`); an escaping path is rejected and the outside dir survives. `cargo test` green.
  - CLI (vitest): `closeTabsForPath` (or a new `closeTabsUnderPath`) closes EVERY open tab whose path is the deleted dir OR a descendant (prefix match `path === dir || path.startsWith(dir + "/")`), reassigning the active tab by the same neighbor rule as `close-path`. The stronger folder-delete confirm spec includes the dir name + "and everything inside it" + a descendant count. `pnpm vitest run` green.
  - CLI (build): `pnpm tsc --noEmit` + `pnpm eslint` + `pnpm vite build` exit 0; `cargo clippy -- -D warnings` clean.
  - Browser (verify-human, carried): a dir row shows a delete ✕ on hover; clicking it opens a STRONGER confirm than single-file (name + "and everything inside it" + descendant count); confirming moves the folder to the macOS Trash (recoverable from Finder), closes every editor tab under that folder across all panes, and the tree refreshes with the folder gone. Cancel changes nothing.
  - [x] P2.1 Backend: added `trash = "5"` to Cargo.toml; `trash_path_core(root, requested)` in `editor_fs/mod.rs` (root-confined via `resolve_within`, handles file + dir, `trash::delete` → macOS Trash, missing-target → `Io` NotFound); new `EditorFsError::Trash { path, source: trash::Error }` variant; `trash_path` command wrapper + registered in `lib.rs`. 5 new unit tests (trash dir / trash file / escaping-rejected-outside-survives / abs-outside-rejected / missing-target-Io). cargo test editor_fs → 26 passed.  <!-- status: complete -->
  - [x] P2.2 Frontend pure: added `close-under-path` event to `openFiles.ts` (prefix match `path === dir || startsWith(dir+"/")`, factored shared `closeMatching` with `close-path`); `deleteFolderSpec(name, count)` in `confirmDialog.ts` (danger; name + "everything inside it" + count + "moved to Trash recoverable"; Esc → cancel; singular/empty count). `countDescendants(entries, dir)` in `buildTree.ts`. Unit tests for all three (openFiles+confirmDialog+buildTree → 70 with editorFileManagement).  <!-- status: complete -->
  - [x] P2.3 Frontend wiring: dir-row ✕ in `FileTree` (`file-tree-delete-folder`) → `onDeleteFolder(path)`; FileTree wraps it with `countDescendants` so the parent gets the count. `RightPanelHost` holds `pendingDeleteFolder {path,count}`, opens `deleteFolderSpec`, on confirm invokes `trash_path` → `closeTabsUnderPath(target.path)` → `fsTreeRefreshKey` bump; failed trash → console (like single-file). `EditorSplit.closeTabsUnderPath` + `PaneTabs.closeTabsUnderPath` (dispatch `close-under-path`) fan out to every pane. tsc + eslint clean.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — cargo test editor_fs 26 ✓, clippy -D warnings clean, tsc clean, eslint clean, vitest 70 passed (touched), vite build ✓ -->
  - [x] verify-self  <!-- status: complete — static slice PASS (cargo/clippy/tsc/eslint/vitest/vite-build) + full frontend↔backend wiring trace confirmed; live Browser + installed-build outcomes UNVERIFIED-by-agent (no in-session Tauri app — operator-only per CLAUDE.md), carried to verify-human -->
  - [x] verify-human  <!-- status: complete — operator confirmed all 6 leaves on the live app + installed build 2026-06-25 -->
    - [x] P2.verify-human.1: Hover a dir row → delete ✕ appears (+ the ＋ from Phase 1)  <!-- status: complete -->
    - [x] P2.verify-human.2: Click ✕ → stronger confirm shows name + "everything inside it" + item count + "moved to Trash (recoverable)"  <!-- status: complete -->
    - [x] P2.verify-human.3: Confirm → folder + contents move to macOS Trash (verify recoverable in Finder), tree refreshes  <!-- status: complete -->
    - [x] P2.verify-human.4: Open tabs UNDER the deleted folder all close (across both panes); tabs outside it stay  <!-- status: complete -->
    - [x] P2.verify-human.5: Cancel changes nothing  <!-- status: complete -->
    - [x] P2.verify-human.6: Installed-build smoke test — delete-folder works from a Finder/Dock-launched `.app`  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete — coverage written during build (trash_path_core ×5, close-under-path, deleteFolderSpec, countDescendants, P2.3 wiring); full suites green: frontend 543, backend 242, no regressions -->

- [x] Phase 3: New folder + nested-file create (C)  <!-- status: complete; added 2026-06-25 by F23 scope expansion -->
  **Scope (operator decision 2026-06-25 = "Folder + nested-file create"):** two capabilities — (a) an explicit **"new folder"** affordance (header + per-dir ＋) that creates an empty directory, and (b) **nested-file create**: the new-file input now ACCEPTS a `/`-bearing relative path (`sub/new.txt`) and creates the intermediate dirs (`mkdir -p` semantics) before writing the file. Both run through one new root-confined backend primitive.

  **Key design point — the containment guard.** The shipped `resolve_within` canonicalizes the target's PARENT, which requires the parent to already exist — fine for write-into-existing-dir, but it CANNOT validate a not-yet-existing nested path (`a/b/c` where `a/b` doesn't exist yet). Phase 3 adds `resolve_within_lexical(root, requested)` — a sibling that resolves containment LEXICALLY: canonicalize `root` (must exist), join `requested`, normalize `.`/`..` components WITHOUT touching the filesystem, then assert the result stays under canonicalized `root`. (A symlink-in-the-middle escape is not a concern here: we are CREATING dirs under the workspace, and `create_dir_all` won't traverse a symlink to write outside a lexically-contained path. Existing read/write/delete paths keep the canonicalizing `resolve_within` — unchanged.) This is the one real backend addition; the rest is wiring.

  **Observable outcomes:**
  - CLI (cargo): new `create_dir_core(root, requested)` (root-confined via `resolve_within_lexical`, `std::fs::create_dir_all`, idempotent on an existing dir) + a `create_dir` command. New unit tests: creates a nested dir under root; an escaping path (`../x`, absolute-outside) is rejected with `OutsideWorkspace` and nothing is created outside; creating an already-existing dir is Ok (idempotent). `cargo test` green; `cargo clippy -D warnings` clean.
  - CLI (vitest): `proposeNewFilePath` gains a `allowNested`/path mode so a `/`-bearing name composes a nested project-relative path (still rejecting `..`, absolute, empty segments); a new pure validator for a folder name/path. `pnpm vitest run` green.
  - CLI (build): `pnpm tsc --noEmit` + `pnpm eslint` + `pnpm vite build` exit 0.
  - Browser (verify-human, carried): the rail header shows a **"new folder"** affordance (alongside the Phase-1 "new file" ＋) + a per-dir "new folder" option; using it creates an empty folder that appears in the tree. The new-FILE input now accepts `sub/x.txt` and creates `sub/` then the file, opening it in the editor. An escaping path (`../x`) is rejected inline. Root + per-dir create both work.
  - [x] P3.1 Backend: `resolve_within_lexical(root, requested)` (parent-tolerant lexical containment — normalizes `.`/`..` in memory, rejects climb-above-root + absolute-outside) + `create_dir_core` (`create_dir_all`, idempotent) in `editor_fs/mod.rs`; `create_dir` command in `commands.rs` + registered in `lib.rs`. No new error variant (maps to `Io`). 7 new unit tests (nested mkdir, idempotent, nested-file round-trip, dotdot-escape rejected + nothing created, dotdot-chain-above-root rejected, abs-outside rejected, interior-dotdot-staying-inside allowed). cargo test editor_fs → 33 passed.  <!-- status: complete -->
  - [x] P3.2 Frontend pure: `proposeNewFilePath` gained an `allowNested` arg (default false = Phase-1 behavior; true composes a `/`-bearing nested path) + a shared `validateRelSegments` (rejects empty/`.`/`..`/absolute per-segment, mirrors the backend lexical guard); new `proposeNewDirPath(dir, name)` for folders (nested allowed, trailing-slash tolerant). Unit tests: nested-compose, default-still-rejects-separator, traversal/absolute/empty-segment rejection, dir-path compose/trim/reject (newFilePath suite → 23).  <!-- status: complete -->
  - [x] P3.3 Frontend wiring: `createFile` now `allowNested` + `create_dir`s the file's parent (mkdir -p, idempotent) before `write_file` for a nested name. New `createDir` handler (validate → `invoke("create_dir")` → `fsTreeRefreshKey` bump). FileTree: shared inline input gained a `newFileMode` file|dir flag; `beginNewFolder`/`beginNewFolderInDir`; header "new folder" ⊞ button + per-dir ⊞ affordance (`file-tree-newfolder-here`/`-btn`) → `onCreateDir`. Inline error surfacing as Phase 1. tsc + eslint + vite build clean. (Updated the stale P1.2 wiring assertion — call evolved to the 3-arg allowNested form; obsolete-test, high-confidence.)  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — cargo test editor_fs 33 ✓, clippy -D warnings clean, tsc clean, eslint clean, vitest 46 passed (touched), vite build ✓ -->
  - [x] verify-self  <!-- status: complete — static slice PASS (cargo/clippy/tsc/eslint/vitest/vite-build) + full frontend↔backend wiring trace; live Browser + installed-build outcomes UNVERIFIED-by-agent (no in-session Tauri app — operator-only per CLAUDE.md), carried to verify-human -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [x] verify-human  <!-- status: complete — operator confirmed all 6 leaves on the live app + installed build 2026-06-25 -->
    - [x] P3.verify-human.1: Header "new folder" ⊞ creates an empty folder at root; it appears in the tree  <!-- status: complete -->
    - [x] P3.verify-human.2: Per-dir "new folder" ⊞ creates a subfolder inside the clicked dir  <!-- status: complete -->
    - [x] P3.verify-human.3: New-FILE input accepts `sub/x.txt` → creates `sub/` + the file, opens it  <!-- status: complete -->
    - [x] P3.verify-human.4: An escaping path (`../x`, `/abs`) is rejected inline; nothing created outside root  <!-- status: complete -->
    - [x] P3.verify-human.5: Phase-1 root + per-dir single-file create still work (no regression)  <!-- status: complete -->
    - [x] P3.verify-human.6: Installed-build smoke: create folder + nested file from a Finder/Dock-launched `.app`  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete — coverage written during build (create_dir_core/lexical ×7, proposeNewFilePath allowNested + proposeNewDirPath, P3.3 wiring); full suites green: frontend 554, backend 249, no regressions -->



## Current Node
- **Path:** Feature > ship
- **Active scope:** ALL 3 PHASES COMPLETE through verify-codify (frontend 554 / backend 249 green; operator-approved live + installed build for each). Ready to ship. (State: verify-codify all phases complete.)
- **Blocked:** none
- **Unvisited:** Phase 3 verify loop (auto → self → human → codify) → then ship.
- **Open discoveries:** none

**Relevance check (before Phase 3):**
- Requester still needs this: yes — operator explicitly asked to fold new-folder create into this WP (2026-06-25).
- Requirements unchanged: yes — scope fixed at "Folder + nested-file create" (AskUserQuestion answer).
- Solution still feasible: yes — `create_dir_all` + a lexical containment guard; the only new wrinkle is `resolve_within`'s parent-must-exist assumption, addressed by `resolve_within_lexical`.
- No superior alternative discovered: yes — Phases 1+2 surfaced nothing that changes this.
**Verdict:** proceed

## Scope expansion log
- **[2026-06-25] Phase 3 added (F23 from Phase-2 verify-codify).** Operator asked "how do I create a new folder?" at Phase-2 verify-human, then "fold that into this WP" with scope = **Folder + nested-file create** (AskUserQuestion). Phases 1+2 are done and stay done; the WP now carries a third phase for folder creation. feature-plan revised the tree to add Phase 3; the build/verify loop runs for it before ship.

## Test Triage — editorFileManagement "P1.2 threads dir through proposeNewFilePath"
Classification: Obsolete test — Phase 3 intentionally evolved the call from `proposeNewFilePath(dir, name)` to the 3-arg `proposeNewFilePath(dir, name, /* allowNested */ true)` form; the assertion pinned the old 2-arg shape.
Confidence: high
Evidence: the call at RightPanelHost.createFile now passes a third `allowNested` arg (P3.3); `dir` is still the first arg, so the behavior the test guards (dir threaded, not hardcoded null) is intact.
Action: relaxed the regex to `/proposeNewFilePath\(dir,\s*name/` (still asserts dir-first, tolerates the new 3rd arg). No code change.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
