# Feature: Filesystem watcher — FileTree refresh + editor-doc reload

**Workflow:** feature
**State:** verify-codify (all phases complete) — ready to ship
**Created:** 2026-06-24
**Entry:** spec (complex feature)
**WBS:** `docs/product/qol-wbs.md` → WP0 (QoL/lifecycle temporary WBS)
**Backlog:** SURFACE-2026-06-21-EDITOR-FILE-WATCHER (pulled forward + scope broadened 2026-06-24)
**Drive mode:** autopilot

## Research Findings (2026-06-24, online — don't-reinvent-the-wheel sweep)

A focused crate-ecosystem sweep resolved the dependency + exclusion design before planning:

- **Dependency stack = `notify-debouncer-full` + the `ignore` crate (already a dep).** `notify-debouncer-full` **0.7.0** (stable) **re-exports `notify ^8.2.0`**, so it is effectively ONE new dependency, not two — it bundles the cross-platform core watcher (FSEvents on macOS) + the debounce/coalesce layer. It does the **rename From/To pairing + FSEvents file-ID stitching** that the editor/formatter **write-then-rename atomic-save** case needs (the lighter `notify-debouncer-mini` does NOT pair renames — rejected for that reason). This is the lean composition; it matches the codebase posture of using crates directly (`portable-pty`, `git2`) rather than wrapper frameworks.
- **`watchexec`-as-a-library was evaluated and REJECTED as overkill** — it's a full command-runner framework (process spawning, restart orchestration). We need watch + filter + debounce only. Its standalone `ignore-files` crate is interesting but redundant: we already depend on the `ignore` crate via `fs_index`, which implements the full gitignore spec (nested `.gitignore`/`.ignore`, negation `!`, global excludes) — the same engine ripgrep uses.
- **`.git/`-only exclusion is a documented footgun.** Field reports (the watchexec author + a 2026 oneuptime writeup) flag that watching a root WITHOUT excluding build/VCS dirs causes an **infinite rerun loop** (a watcher fires → something touches `target/`/`node_modules/` → fires again). Standard default-ignore lists are `.git/`, `node_modules/`, `target/`, `.hg/`, `.svn/`. **Operator-confirmed (2026-06-24): exclude more than just `.git/`.** Our answer is BETTER than a hand-maintained list: **reuse `fs_index`'s `ignore`-crate walker config**, which already honors `.gitignore` (so `node_modules/`, `target/`, `dist/`, etc. are excluded wherever the project lists them) PLUS we hard-exclude `.git/` (which gitignore does NOT list but churns massively on every git op). Single source of truth with the tree walk → the watcher and the tree agree on what's visible.

Sources: [notify-debouncer-full (docs.rs)](https://docs.rs/notify-debouncer-full) · [How to Build a File Watcher with Debouncing in Rust (oneuptime, 2026-01)](https://oneuptime.com/blog/post/2026-01-25-file-watcher-debouncing-rust/view) · [notify crate (docs.rs)](https://docs.rs/notify) · [watchexec ignore-files (lib.rs)](https://lib.rs/crates/watchexec)

## Problem Statement

Claudesk has **no live filesystem watcher**. Two consumer surfaces go stale on external disk changes:

1. **FileTree rail (the live gap).** `FileTree.tsx` loads the tree via `fs_tree` only on `[projectPath]` (mount). A file created/removed/renamed on disk by an external process — another tool, a CLI, a `git checkout`, *Claude Code itself writing a file* — does **not** appear until the user manually collapses/re-expands the folder. (⌘P file-finder DOES see it because the finder re-walks `fs_index` on open; the tree is a one-shot snapshot.) The operator hit this live this session: a CLI-created `docs/product/qol-wbs.md` was invisible in the tree.
2. **Open editor documents.** WP12 shipped **synchronous** disk-change detection only (`diskConflict.diskDecision` runs on tab-activate + pre-save). A file changed on disk while its tab is backgrounded + untouched is caught only when next activated, not in real time.

Both are served by **one** `notify` filesystem-watcher seam fanning out to two frontend consumers. `notify` is the already-chosen, arch-blessed watcher tech (arch.md names it; it was only ever *dropped for `.session.md`*, which was the wrong file — not a rejection of the tech).

## User Stories

- As the operator, when an external process (CLI, another editor, git, or Claude Code) creates/deletes/renames a file under a workspace root, I want the **FileTree to update on its own** within a second or two, so I don't have to manually collapse/re-expand to see new files.
- As the operator, when a file with an **open, unmodified** editor tab changes on disk, I want it to **silently reload** without me activating the tab — so a background tab never shows stale content.
- As the operator, when a file with an open **dirty** editor tab changes on disk, I want the existing **conflict popup** to surface (keep-mine / load-disk) — without waiting until I activate the tab.
- As the operator, I do NOT want Claudesk's **own saves** to trigger a spurious reload/conflict on the file I just wrote.

## Acceptance Criteria

The feature is done when:

- **A backend watcher (`notify-debouncer-full`)** runs per open workspace root (recursive) and emits a Tauri event (working name `fs-change`) carrying `{ workspace_id (or root), paths: string[], kind }` to the frontend. Events are **debounced/coalesced** (~150–300 ms window, with rename From/To pairing) so a write-then-rename burst or a bulk `git checkout` produces a small number of events, not hundreds.
- **Exclusion is gitignore-aware, not `.git/`-only.** Ignored paths (`.git/` hard-excluded, plus everything the project's `.gitignore`/`.ignore` lists — `node_modules/`, `target/`, `dist/`, etc.) are filtered in the backend before emitting, using the **same `ignore`-crate matcher `fs_index` uses for the tree walk** (single source of truth — watcher and tree agree). This also avoids the documented infinite-rerun footgun of watching build dirs.
- **FileTree consumer:** on an `fs-change` for its workspace root, the rail re-walks (`fs_tree`) and reconciles the displayed tree **preserving expand/collapse state + scroll position**. Newly-added files appear and removed files disappear with no manual collapse/expand. Implemented via an `fsTreeRefreshKey` bump mirroring the existing `gitStatusRefreshKey` pattern (so the git-status indicators refresh on the same event for free).
- **Editor consumer:** on an `fs-change` touching a path with an open `DocEntry`, the editor re-stats that file (`stat_file`) and runs the existing `diskConflict.diskDecision(stored, disk, dirty)` → `noop` / `reload` / `conflict`, reusing the WP12 reload path + conflict popup unchanged. **No new decision logic** — only a new event *source* that drives the same path without requiring tab activation.
- **Ignore-self-writes:** Claudesk's own `write_file` saves do NOT raise a spurious conflict/reload on the just-saved file. (The mtime+size marker model already gives this for free at the editor: a self-write updates the stored marker, so the resulting watcher event's disk marker equals `stored` → `diskDecision` returns `noop`. Confirm this holds end-to-end; add an explicit guard only if a race window proves otherwise.)
- **Watcher lifecycle:** the watcher **starts** when a workspace opens (alongside / mirroring the `workspace_register` call in `useWorkspaceStatus.ts`) and **stops** when a workspace closes/deregisters. (WP1 — close-workspace — adds the close path; until WP1 lands there is no close, so the stop path is wired but only exercised on app shutdown. Verify start-on-open here; WP1 verifies stop-on-close.)
- **No regression** to the synchronous on-activate/pre-save check — it stays as the belt-and-suspenders path (covers the window before a watcher event lands, and any missed event).
- Gates green: `cargo test` + `cargo clippy -- -D warnings` + `cargo fmt`; `pnpm test` (vitest) + `tsc` + eslint + prettier. Pure logic (event→refresh mapping, path-membership matching, debounce/coalesce) is vitest/cargo unit-tested per the repo posture.
- **Installed-build smoke test** (per CLAUDE.md): the watcher is a backend `notify` thread touching the filesystem + process environment — must be confirmed in a freshly-built installed `.app` launched from Finder, not just `pnpm tauri:dev`.

## Out of Scope

- **A general-purpose "external change" merge UI** beyond the existing WP12 conflict popup — reuse the popup as-is.
- **Watching anything outside an open workspace root** (no `~/.claude/`, no global config, no the workflow doc hierarchy — that's the separately-anchored SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY, M6).
- **Incremental tree patching as an optimization** — a full subtree re-walk on change is acceptable for v1 (`fs_index` walk is already fast for the operator's repos; the existing finder re-walks fully on every open). Patch only if a measured problem appears.
- **Cross-platform watcher tuning** — macOS only (FSEvents via `notify`); no Linux/Windows backend selection.
- **Closing the workspace** (WP1) — this WP only *registers the stop hook*; the close affordance itself is WP1.
- **Debounce/coalesce of the editor conflict popup across many files** — if a bulk change hits N open dirty tabs, surfacing N conflicts (or a sensible cap) is acceptable; a batched "N files changed" UI is out of scope.

## Technical Constraints

- **No 3rd-party service/API** — `notify` is a Rust crate (local filesystem events via FSEvents on macOS). No probe WP required.
- **`notify` is arch-sanctioned** (arch.md Tech Stack "Phase 2 additions" + the M3 drop note: "`notify`/`tauri-plugin-fs-watch` is still the watcher tech when that lands"). Prefer the `notify` crate directly (consistent with the codebase spawning `portable-pty`/`git2` directly rather than via wrapper plugins); evaluate `notify-debouncer-full` for the debounce layer.
- **Reuse, don't rebuild, these seams:**
  - Tree walk: `fs_index::walk_tree_core` / the `fs_tree` command (already gitignore-aware via the `ignore` crate). FileTree refresh = bump an `fsTreeRefreshKey` like the existing `gitStatusRefreshKey` (`FileTree.tsx` L76-88 pattern).
  - Editor reload: `src/components/workspace/editor/diskConflict.ts` `diskDecision` (pure, watcher-ready by design — its own header says "a watcher event would feed the same path") + the WP12 `editorDocs` marker store + conflict popup.
  - Lifecycle: `src/state/useWorkspaceStatus.ts` already calls `workspace_register` / `workspace_deregister` on workspace open/close — the watcher start/stop mirrors this exactly (likely a `workspace_watch_start` / `workspace_watch_stop` command pair, or fold into the existing register/deregister commands).
- **Backend command shape:** follow the established `command → pure-fn → typed-error (thiserror) → String` convention; no `unwrap()` outside tests. The watcher thread mirrors the `status_broadcaster` / `hook_socket` long-lived-thread precedent (spawned at `.setup()` or on first workspace open; emits Tauri events).
- **IPC DTO casing:** the `fs-change` event payload is snake_case end-to-end with a `serde_json::to_value` key-shape contract test (the SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE lesson, now an arch convention).
- **Debounce is mandatory, not optional:** editors/formatters write-then-rename; `git checkout`/branch-switch rewrites many files at once. Without coalescing, a single logical change floods events.
- **Exclusion model (firmed up by research + operator):** the watcher must filter ignored paths so it doesn't fire a re-walk storm. Do NOT hand-maintain an exclusion list. **Reuse `fs_index`'s `ignore`-crate walker config** as the single source of truth — it already honors `.gitignore` + `.ignore` (nested, with negation), so `node_modules/`, `target/`, `dist/`, `build/`, etc. are excluded wherever the project's gitignore lists them — PLUS hard-exclude `.git/` itself (gitignore does not list it but it churns massively on every git operation). This guarantees the watcher and the tree agree on what's visible (same matcher = no "watcher fires for a file the tree never shows"). Watching `.git/` would also risk the documented infinite-rerun footgun.

## Open Questions

- [x] **`notify` raw vs `notify-debouncer-full`:** **RESOLVED by research** → use **`notify-debouncer-full` 0.7.0** (re-exports `notify ^8.2.0` — one dep, not two; does rename From/To pairing for the write-then-rename atomic-save case). `notify-debouncer-mini` rejected (no rename pairing). Hand-rolled debounce rejected (reinvents the wheel).
- [x] **`.git/` + ignore filtering location:** **RESOLVED** → filter in the **backend** before emitting (less IPC traffic; the watcher loads `fs_index`'s `ignore` matcher per root — same source of truth as the tree walk). `.git/` hard-excluded. See the Exclusion-model constraint above.
- [ ] **Watcher granularity:** one recursive watcher per workspace root, or one shared watcher with multiple watched paths? (Lean: per-root, started/stopped with the workspace lifecycle — simplest mapping to the register/deregister seam.) — *resolvable at plan, not a blocker.*
- [ ] **Self-write race:** is the mtime+size marker filter sufficient to suppress self-write reloads in all cases, or is a short post-save ignore-window (per path) needed for the FileTree consumer too (which has no marker model)? For the tree, a self-write just causes a harmless re-walk (no data loss, no popup) — likely acceptable; confirm the re-walk isn't visually disruptive (flicker / lost scroll). — *verify at self/human; mitigate only if observed.*

---

## Recommendation

No external-API unknowns; `notify` is arch-blessed and all three integration seams (tree refresh, editor reload, lifecycle) already exist and are watcher-ready by design. The open questions are all **plan/build-time implementation choices**, not research-grade unknowns. → **Proceeded to `/feature-plan` (F4).**

---

## Plan Notes (verified seams, 2026-06-24)

Concrete attach points confirmed by reading the code:
- **Backend exclusion config to reuse:** `fs_index::project_walker` (`src-tauri/src/fs_index/mod.rs:91`) = `ignore::WalkBuilder::new(root).hidden(false).filter_entry(|e| e.file_name() != ".git").build()` — honors `.gitignore`/`.ignore`, excludes `.git/`. The watcher's path filter reuses this same matcher → watcher + tree agree on visibility.
- **Backend thread + emit precedent:** `status_broadcaster::commands` (`src-tauri/src/status_broadcaster/commands.rs`) — a managed shared registry (`init_registry()` → `.manage()`), `#[tauri::command] workspace_register/deregister`, and `app.emit(EVENT, &dto)` from a thread. The watcher mirrors this exactly: a managed `WatcherRegistry`, `#[tauri::command] workspace_watch_start/stop`, `app.emit("fs-change", &FsChange)`.
- **Frontend lifecycle mirror:** `useWorkspaceStatus.ts` `registeredRef` effect (`src/state/useWorkspaceStatus.ts:75`) registers on open / deregisters on absent — the watcher start/stop attaches in the same effect (or a sibling) keyed on `[workspaces]`.
- **FileTree refresh seam:** `RightPanelHost.tsx:137` owns `const [gitStatusRefreshKey, setGitStatusRefreshKey] = useState(0)` (bumped on save). Add a sibling `fsTreeRefreshKey` bumped by `fs-change`; FileTree's `fs_tree` load effect (`FileTree.tsx:53`, currently keyed `[projectPath]`) gains the key in its deps (mirrors the git-status effect at `FileTree.tsx:76`, already keyed `[projectPath, gitStatusRefreshKey]`). The same event bumps `gitStatusRefreshKey` too → indicators refresh for free.
- **Editor reload seam:** `EditorSplit.tsx:190` `checkDisk(path)` → `invoke("stat_file") → diskDecision(entry.marker, disk, isDirty(entry))` → reload/conflict. The `fs-change` listener calls the existing `checkDisk` for each changed path that has an open `DocEntry`. **No new decision logic.**
- **Command registration:** add the two commands to the `tauri::generate_handler!` list in `lib.rs` (alongside `workspace_register`/`workspace_deregister` at L197-198); `.manage()` the watcher registry in `.setup()`.

## Work Tree

- [x] Phase 1: Backend `notify` watcher + `fs-change` event  <!-- status: [x] — impl + all 4 verify nodes complete -->

  **Observable outcomes:**
  - CLI: `cd src-tauri && cargo test fs_watch` exits 0 — unit tests cover the path-filter (an event under `.git/` or a gitignored dir → filtered out; a tracked-file event → kept) and the `FsChange` DTO snake_case key-shape (`serde_json::to_value` pins `workspace_id`/`paths`/`kind`). ✓ 13 tests pass.
  - CLI: `cargo build` exits 0 with `notify-debouncer-full = "0.7"` added to `src-tauri/Cargo.toml`; `cargo clippy -- -D warnings` clean. ✓ (build 11.46s; clippy + fmt clean; full suite 221 pass.)
  - CLI: a Rust integration-style test (or the unit test driving the pure filter + debounce-coalesce mapping) asserts that N raw events for the same path within the debounce window coalesce to one emitted `FsChange`. ✓ `transform_dedups_repeated_paths` covers OUR coalescing (dedup of a multi-touch batch → one path); the time-window debounce is `notify-debouncer-full`'s own tested behavior (not re-tested here — the design property: we test our transform, the crate tests its debounce).
  - [x] P1.1 Add `notify-debouncer-full = "0.7"` to `src-tauri/Cargo.toml` (re-exports `notify ^8.2`); `cargo build`.  <!-- status: [x] -->
  - [x] P1.2 New `src-tauri/src/fs_watch/` module (`mod.rs` + `commands.rs`), mirroring `status_broadcaster`'s shape: a `WatcherRegistry` (workspace_id → debouncer handle) behind a `Mutex`, an `init_watcher_registry()` managed-state ctor, and a pure `fs-change` transform (`paths_to_change`) — given a debounced event + the root's `ignore` matcher → `Option<FsChange>` (None if all paths filtered). `.git/` hard-excluded; root `.gitignore` honored via `build_ignore`/`is_ignored`. Pure transform unit-tested (no Tauri app).  <!-- status: [x] -->
  - [x] P1.3 `FsChange` DTO: `{ workspace_id, paths: Vec<String> (project-relative POSIX, via `rel_posix`), kind: <created|modified|removed|renamed|other> }`, snake_case serde + `fs_change_dto_serializes_snake_case` key-shape contract test.  <!-- status: [x] -->
  - [x] P1.4 `#[tauri::command] workspace_watch_start/stop` — start builds a `notify-debouncer-full` debouncer (200ms) watching the root recursively; callback classifies the batch, runs `paths_to_change`, `app.emit("fs-change", …)` on `Some`. Stop drops the handle (debouncer stops on drop). Both registered in `lib.rs` `generate_handler!`; registry `.manage()`d in `.setup()`. Typed `FsWatchError` → `String`; no `unwrap()` outside tests.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — cargo test fs_watch 13/13; clippy --lib -D warnings clean; fmt clean -->
  - [x] verify-self  <!-- status: [x] — subagent re-ran all 4 CLI outcomes: PASS×4, 0 BLOCKING, 0 COSMETIC. No integration boundary (isolated new artifacts: fs_watch module + 2 unconsumed commands + registry; lib.rs wiring only). -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (Mode 3 auto-skip gate clean: autopilot + verify-self all-PASS + no integration boundary + no outcome cites a consuming surface). Backend-only phase; the fs-change event has no UI consumer until Phase 2/3. Human-observable verification lands at P2 (tree refresh) + P3 (editor reload). -->
  - [x] verify-codify  <!-- status: [x] — behavior codified during build (TDD): 13 fs_watch tests (ignore-filter ×4, pure transform ×3, FsChange snake_case DTO, classify ×3, registry lifecycle ×2). No new tests (no duplication); full suite 221 pass, 0 fail. Command-body/emit left to Tauri runtime per the status_broadcaster precedent. No integration boundary. -->

- [x] Phase 2: FileTree auto-refresh consumer + watcher lifecycle  <!-- status: [x] — impl + all 4 verify nodes complete -->

  **Observable outcomes:**
  - Browser (native, verify-human): with a workspace open, create a file on disk externally (`touch <root>/newfile.txt` in a terminal) → the FileTree rail shows `newfile.txt` within ~1–2s WITHOUT a manual collapse/expand; `rm` it → it disappears; expand/collapse state + scroll of unaffected nodes is preserved.
  - CLI: `pnpm test` exits 0 — vitest covers the pure event→refresh mapping (an `fs-change` for workspace X bumps X's `fsTreeRefreshKey`, not other workspaces') and the path-membership/no-op logic; `tsc`/eslint/prettier clean. ✓ 442 vitest pass (+4 new fsChange tests); tsc clean; eslint 0 errors (1 pre-existing XtermPane warning, untouched); my files prettier-clean.
  - Console: no JS errors when an `fs-change` event arrives; a failed `fs_tree` re-walk still surfaces inline (existing behavior), never blanks the rail. (native verify-human)
  - [x] P2.1 Frontend lifecycle: in `useWorkspaceStatus.ts` call `workspace_watch_start` on workspace-open and `workspace_watch_stop` on workspace-absent, in the SAME `registeredRef` diff loop as register/deregister. (WP1 routes the close path through the same deregister → watcher stops on close for free.)  <!-- status: [x] -->
  - [x] P2.2 Subscribe to `fs-change` in `RightPanelHost` (a `listen("fs-change", …)` with the `cancelled`-flag guard — the StrictMode async-listen lesson). On an event matching THIS workspace (`appliesToWorkspace`), bump `fsTreeRefreshKey` (new sibling of `gitStatusRefreshKey`) AND `gitStatusRefreshKey`. New `state/fsChange.ts` (snake_case DTO mirror + `appliesToWorkspace` pure helper, vitest-covered).  <!-- status: [x] -->
  - [x] P2.3 `FileTree.tsx` `fs_tree` load effect gains `fsTreeRefreshKey` in its deps so a bump re-walks. Expand-state survives: the `expanded` reducer is path-keyed (untouched by an `entries` re-fetch); scroll is native on the never-remounted container. No flicker mitigation needed at impl (verify at human).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — scoped: vitest fsChange 4/4; eslint on the 4 changed files + new test exit 0; tsc clean (whole-project). -->
  - [x] verify-self  <!-- status: [x] — CLI outcome PASS (442 vitest incl. 4 fsChange, tsc clean). The 2 live-DOM outcomes (tree auto-refresh, console-clean) are UNVERIFIED: native-app surface, no Tauri IPC in plain Playwright (SURFACE-2026-06-23-VERIFY-SELF-DRIVER gap, 4th instance) → forwarded to native verify-human, NOT a genuine failure. No agent-fixable BLOCKING. -->
  - [x] verify-human  <!-- status: [x] — operator confirmed all 5 leaves PASS in pnpm tauri:dev (2026-06-24) -->
    - [x] P2.verify-human.1 External file CREATE → tree auto-refreshes  <!-- status: [x] -->
    - [x] P2.verify-human.2 External file REMOVE → tree auto-refreshes  <!-- status: [x] -->
    - [x] P2.verify-human.3 Expand/collapse + scroll preserved across a refresh  <!-- status: [x] -->
    - [x] P2.verify-human.4 No JS console errors on an fs-change; gitignored/.git churn does NOT refresh  <!-- status: [x] -->
    - [x] P2.verify-human.5 Own-save does not cause a disruptive tree flicker  <!-- status: [x] -->
  - [x] verify-codify  <!-- status: [x] — pure consumer seam codified during build (4 fsChange vitest: appliesToWorkspace filter + snake_case DTO). Live render+lifecycle is native-app, no jsdom/component harness (standing no-jsdom posture, SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP) — the integration-boundary end-to-end check is the operator's native verify-human (passed). Full suite green: vitest 442, cargo 221, 0 fail. No new tests warranted (no duplication). -->

- [x] Phase 3: Editor open-doc live reload consumer  <!-- status: [x] — impl + all 4 verify nodes complete -->

  **Observable outcomes:**
  - Browser (native, verify-human): open a file in the editor, leave the tab UNFOCUSED/backgrounded, change it on disk externally → the open buffer **silently reloads** to the new content within ~1–2s (clean buffer); make a local edit (dirty), change it on disk → the **conflict popup** surfaces without activating the tab. Saving from Claudesk does NOT trigger a spurious reload/conflict on the just-saved file (self-write suppressed).
  - CLI: `pnpm test` exits 0; `tsc`/eslint/prettier clean. ✓ 442 vitest pass; tsc clean; eslint exit 0 on changed files; prettier clean. (The reload path reuses `diskConflict.diskDecision`, already covered by diskConflict.test.ts — no new pure logic.)
  - [x] P3.1 Added a `checkDiskForPaths(paths)` method to `EditorSplitHandle` (re-stats only the changed paths that are OPEN here → `checkDisk` → `diskDecision` → reload-when-clean / conflict-when-dirty). Wired into RightPanelHost's EXISTING per-workspace `fs-change` listener (`editorSplitRef.current?.checkDiskForPaths(paths)`) — one listener, correctly workspace-scoped, no second subscription. Reuses the WP12 machinery unchanged.  <!-- status: [x] -->
  - [x] P3.2 Self-write suppression confirmed by construction: `onSave` does `write_file` → `save-ok` → re-stat → `set-marker` (EditorSplit.tsx:300), so a post-save watcher event (≥200ms later, after the debounce) re-stats to the SAME marker → `diskDecision` = `noop`. No per-path ignore-window added (YAGNI — the marker filter is sound; the only theoretical race is event-before-set-marker on a CLEAN just-saved buffer → an invisible identical-content reload, never a conflict, never data loss). Spec open-question disposition: verify at human; mitigate only if observed.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — scoped: eslint exit 0 on both changed files; diskConflict.test.ts 10/10 (the reused reload logic); tsc clean. -->
  - [x] verify-self  <!-- status: [x] — CLI outcome PASS (442 vitest, tsc clean, eslint clean, diskConflict 10/10). Live editor-reload outcome UNVERIFIED (native-app, SURFACE-2026-06-23 driver gap) → native verify-human. No agent-fixable BLOCKING. -->
  - [x] verify-human  <!-- status: [x] — operator confirmed all 3 leaves PASS in pnpm tauri:dev (2026-06-24) -->
    - [x] P3.verify-human.1 Clean backgrounded tab → silent reload on external change  <!-- status: [x] -->
    - [x] P3.verify-human.2 Dirty tab → conflict popup on external change (no tab activation)  <!-- status: [x] -->
    - [x] P3.verify-human.3 Claudesk's own save → NO spurious reload/conflict (self-write suppressed)  <!-- status: [x] -->
  - [x] verify-codify  <!-- status: [x] — reload decision logic (diskConflict.diskDecision) covered by 10 vitest (reused unchanged); checkDiskForPaths is a thin open-doc selector over it. Live wiring is native-app (no jsdom harness) — integration-boundary end-to-end = operator verify-human (passed). Full suite green: vitest 442, cargo 221, 0 fail. No new tests warranted. -->

## Current Node
- **Path:** Feature > SHIP
- **Active scope:** ALL 3 PHASES COMPLETE (every impl + verify node [x]). Ready for /feature-ship.
- **Blocked:** none
- **Unvisited:** none — ship next.
- **Open discoveries:** SURFACE-2026-06-23 verify-self driver gap fired again (4th instance, logged in Discoveries — pointer for M5 planning, not new WP work).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-24] Phase 2 verify-self — SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI fired AGAIN (4th instance: after M4 WP3/WP4/WP4b). The FileTree auto-refresh + console-clean outcomes are native-app live-DOM, unverifiable by Playwright-vs-Vite (no Tauri IPC). Forwarded to native verify-human as expected. Strengthens the M5-planning adopt/reject decision on a real-app UI driver (`mcp-server-tauri`). NOT new work for this WP — a pointer reinforcing the existing high-priority backlog item.

TRANSITION: F7
