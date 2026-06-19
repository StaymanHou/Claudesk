# Feature: WP6 — Project config store (Rust backend)

**Workflow:** feature
**State:** COMPLETED 2026-06-18 — shipped 525b7e8, finalized (local; no remote)
**Created:** 2026-06-18
**Entry:** spec (complex feature)
**drive_mode:** autopilot

## Problem Statement

The WP5 frontend Project Picker runs on **mock data**: a hardcoded `MOCK_RECENTS`
array held in component state and a `mockOpenFolderDialog()` stub. There is no
durable project list — close the app and any "recents" vanish. WP6 implements the
real persistence layer in the Rust backend (`projects.json` in the macOS app-data
dir), exposes it over Tauri IPC, and rewires the picker to use it. This is the
first backend build on the Phase 1 critical path (WP1→WP5→**WP6**→WP7→WP9); WP7
(PtyCcSession) depends on the picker producing a real project path with persisted
recency.

It also lands the deferred picker-at-scale work
(`SURFACE-2026-06-18-PICKER-SCALES-TO-MANY-PROJECTS`): real persistence-backed
delete, recency ordering, and a filter/search box — the operator runs 20+ rotating
projects and the list must scale while keeping every project until explicitly
deleted.

## User Stories

- As the operator, I want the projects I open to be **remembered across app
  restarts** so I don't re-add them every session.
- As the operator, I want the recents list **ordered most-recently-opened first**
  so the project I'm likely to want is at the top.
- As the operator, I want to **add a project via a native folder picker** ("Open
  Folder…") so I can onboard a new repo in one click.
- As the operator, I want to **delete a project from recents** (per-row ×) and have
  it stay gone across restarts — manual delete only, never auto-eviction.
- As the operator with 20+ projects, I want a **filter/search box** over the recents
  so I can find one by substring without scrolling.

## Acceptance Criteria

The feature is done when:

1. **`Project` data model exists** in Rust with fields: `path: PathBuf`,
   `last_opened_at: i64` (unix ms), `display_name: Option<String>`,
   `default_drive_mode: Option<DriveMode>` (reserved for Phase 2; populated by WP15).
   Serialized to JSON with the field name **`project_path`** for `path` to match the
   existing frontend `RecentProject` shape (no frontend rename).
2. **App-data dir resolves** via `tauri::Manager::path().app_data_dir()` →
   `~/Library/Application Support/Claudesk/`; the directory is created on first run
   if absent.
3. **Read path:** `projects.json` → `Vec<Project>`. A **missing file returns an
   empty vec** (not an error). A malformed file surfaces a typed error (does not
   panic, does not silently wipe).
4. **Atomic write:** serialize → write to `projects.json.tmp` → `fs::rename` over
   `projects.json`. A crash mid-write never corrupts the live file (tmp is discarded,
   old file intact).
5. **Four Tauri commands** are registered and callable from the frontend:
   - `list_projects() -> Vec<Project>` — ordered by `last_opened_at` **descending**.
   - `add_project(path: String) -> Project` — adds if new (derives `display_name`
     from the dir basename, stamps `last_opened_at`); if the path already exists,
     updates `last_opened_at` instead of duplicating. Returns the resulting record.
   - `record_open(path: String)` — stamps `last_opened_at = now` for an existing
     entry (or adds it if absent — same effect as `add_project` for an unknown path).
   - `remove_project(path: String)` — removes the entry, persists. No-op if absent.
6. **Frontend rewiring:** `ProjectPicker` drops `MOCK_RECENTS` and
   `mockOpenFolderDialog`; loads recents via `list_projects` on mount, calls
   `add_project`/`record_open` on open, `remove_project` on × (real persistence, not
   in-memory filter), and the real `tauri-plugin-dialog` `open({ directory: true })`
   for "Open Folder…".
7. **Recency ordering** is visible: opening a lower-in-list project moves it to the
   top after reload.
8. **Filter/search box** above the recents: incremental case-insensitive substring
   match on `display_name` + `project_path`. (Always present; cheap, and the
   operator's real N warrants it.)
9. **Rust unit tests** pass (`cargo test`): round-trip (write→read equality),
   atomic-write-leaves-old-file-intact-on-simulated-crash, missing-file→empty-vec,
   add-existing-path-dedupes, list ordering by `last_opened_at` desc.
10. **Gate green:** `cargo fmt`, `cargo clippy -- -D warnings` (no `unwrap()` outside
    tests; typed errors via `thiserror`), `pnpm lint`, `pnpm test` (existing vitest
    suite still green), `pnpm build`. App launches via `pnpm tauri dev` and the
    picker shows real persisted recents.

## Out of Scope

- **PTY / CC session spawn** — that's WP7. WP6's `onOpen(path)` still drives the
  existing WP5 mock workspace; WP6 only makes the project list real.
- **Drive-mode selector UI + `get_drive_mode`/`set_drive_mode` commands** — that's
  WP15 (Phase 2). WP6 only **reserves** the `default_drive_mode` field on the struct;
  it is never read or written in Phase 1.
- **`record_open` wiring to actual workspace lifecycle** beyond the picker click —
  Phase 1 has one workspace; the open handler stamps recency. No multi-workspace
  bookkeeping.
- **Migration / schema versioning** for `projects.json` — first version of the file;
  no prior shape to migrate from.
- **`.claudesk.json` per-repo config** — explicitly rejected in arch.md; centralized
  list only.
- **Light theme** — dark-mode-only convention; any new picker CSS stays dark.

## Technical Constraints

- **arch.md is authoritative** on persistence: flat JSON at
  `~/Library/Application Support/Claudesk/projects.json`, record shape
  `{path, last_opened_at, display_name?, default_drive_mode?}`, read-on-open /
  write-on-update, ≤100 entries, no DB. (arch.md §"Persistence", component table
  "Project Config Store", data-flow steps 2–3.)
- **`tauri-plugin-dialog` and `tauri-plugin-fs`** are first-party Tauri plugins — no
  3rd-party probe required. Add `tauri-plugin-dialog` to `Cargo.toml` + the JS
  package + a capability entry in `src-tauri/capabilities/`. `tauri-plugin-fs` may not
  be needed if we use `std::fs` directly in Rust (the read/write happens in the Rust
  core, not the webview) — decide at plan time.
- **No `unwrap()` outside tests** (CLAUDE.md code-style); atomic write + read errors
  go through `thiserror` typed returns. Tauri command error type must be
  `Serialize` (string-convertible) to cross IPC.
- **Field-name contract:** frontend `RecentProject` already uses `display_name` +
  `project_path`. The Rust `Project` serializes `path` as `project_path` (via
  `#[serde(rename)]`) so the IPC payload matches without a frontend type rename.
- **`DriveMode` enum** must exist (even if unused in Phase 1) to type the reserved
  field. Mirror the 4 workflow modes: `StepByStep | Orchestrated | Autopilot |
  FullAutopilot`. Reuse if a definition already exists; otherwise define minimally in
  `config_store/`.
- **`config_store/` module** is where this lives (per CLAUDE.md project structure +
  arch.md "No new Rust module … thin layer in `config_store/`"). First real backend
  module — establishes the `mod` layout that WP7's `cc_session/` will mirror.
- **WP5 frontend test posture:** jsdom/RTL is NOT configured. Pure logic gets vitest
  unit tests; component/DOM behavior is verified live via Playwright in verify-self.
  The picker rewiring's DOM behavior is a verify-self concern, not a new vitest suite.
  Backend gets `cargo test` coverage.
- **Tauri IPC in tests:** the four commands are thin wrappers over pure
  store functions. Unit-test the **store functions** (file IO, ordering, dedupe)
  directly with `cargo test` against a tempdir; the command wrappers themselves need
  no Tauri runtime in tests.

## Open Questions

- [ ] None blocking. Resolved at plan time (not research-grade): (a) `std::fs` vs
      `tauri-plugin-fs` for the actual read/write — leaning `std::fs` since IO is in
      the Rust core; (b) whether to inject the app-data path into store functions for
      testability (yes — pass `&Path` so tests use a tempdir) vs. resolving
      `app_data_dir()` inside them (no — couples tests to the Tauri runtime). Both are
      implementation-shaping, not unknowns requiring a spike.

## Work Tree

- [x] Phase 1: Backend config store — `config_store/` module + Tauri commands + cargo tests  <!-- status: done — 13 config_store tests green, verify loop complete -->
  **Observable outcomes:**
  - CLI: `cd src-tauri && cargo test config_store` exits 0 — covers round-trip (write→read equality), missing-file→empty-vec, atomic-write-leaves-old-file-intact (tmp written then store fn returns before rename simulated → old `projects.json` content unchanged), add-existing-path-dedupes (no duplicate, `last_opened_at` updated), `list_projects` returns recency-desc order.
  - CLI: `cargo clippy -- -D warnings` exits 0 (no `unwrap()` outside `#[cfg(test)]`, typed `thiserror` errors).
  - CLI: `cargo fmt --check` exits 0.
  - CLI: store functions accept an injected `&Path` (data dir) — a test using `tempfile::TempDir` round-trips without any Tauri runtime, proving the testability seam.
  - [x] P1.1 Add deps to `src-tauri/Cargo.toml`: `tauri-plugin-dialog = "2"`, `thiserror = "2"` (v2 current; derive API identical); `tempfile` under `[dev-dependencies]`  <!-- status: done -->
  - [x] P1.2 Create `config_store/mod.rs`: `Project` struct (`#[serde(rename = "project_path")] path: PathBuf`, `last_opened_at: i64`, `display_name: Option<String>`, `default_drive_mode: Option<DriveMode>`), `DriveMode` enum (StepByStep|Orchestrated|Autopilot|FullAutopilot, serde `kebab-case` matching workflow vocab), `ConfigError` (thiserror)  <!-- status: done -->
  - [x] P1.3 Pure store fns taking `data_dir: &Path`: `read_projects`, `write_projects` (atomic: serialize → `projects.json.tmp` → `fs::rename`), `add_or_touch(path)`, `remove(path)`, plus the recency-desc sort applied by the read/list path. Missing file → empty vec; malformed → `ConfigError`  <!-- status: done -->
  - [x] P1.4 Tauri command wrappers in `config_store/commands.rs` (thin): `list_projects`, `add_project`, `record_open`, `remove_project` — resolve data dir via `app.path().app_data_dir()`, ensure dir exists, delegate to store fns; map `ConfigError` → `String` for IPC. Registered all four in `lib.rs` `generate_handler![]`; registered `tauri_plugin_dialog::init()` in the builder  <!-- status: done -->
  - [x] P1.5 `cargo test`: round-trip, missing-file, atomic-write-preserves-old-on-no-rename, dedupe-on-existing, ordering-recency-desc, remove, drive-mode-round-trip (10 tests, all against a `TempDir`) — 11/11 pass incl. smoke  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — cargo test config_store 10/10, clippy -D warnings clean, fmt clean -->
  - [x] verify-self  <!-- status: done — subagent: 4/4 outcomes PASS, 0 BLOCKING, 0 COSMETIC. No integration boundary (isolated new module + new command registrations nothing yet consumes). Testability seam confirmed by source inspection. -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED (F11) — drive_mode=autopilot, verify-self all-PASS, no integration boundary, no consuming-surface outcome. Affirmation printed. -->
  - [x] verify-codify  <!-- status: done — added 3 tests (empty-list round-trip, returned-record contract, project_path serde-rename pin); full suite 14 cargo + 21 vitest green; no triage needed -->

- [x] Phase 2: Frontend rewiring — real IPC + dialog + recency + filter box  <!-- status: done — full verify loop complete; 27 vitest + 14 cargo green; operator-approved in native shell -->
  **Observable outcomes:**
  - Browser: Playwright loads the app (`pnpm dev`) — picker renders recents fetched via `list_projects` IPC (mocked in browser via injected `__TAURI__` stub OR verified in `pnpm tauri dev` native shell at verify-self); no `MOCK_RECENTS` literal remains in the bundle (`grep -r MOCK_RECENTS src/` → no matches).
  - Browser: a filter `<input data-testid="picker-filter">` is always present above the recents; typing a substring narrows visible `[data-testid="picker-recent"]` rows to case-insensitive matches on name+path; clearing restores all.
  - Browser: clicking a row's × (`picker-recent-remove`) invokes `remove_project` and the row disappears (and stays gone after reload — persistence verified in native shell at verify-self/human).
  - Browser: "Open Folder…" invokes `tauri-plugin-dialog` `open({directory:true})` (real native dialog in `tauri tauri dev`; the click path is observable, the chosen path flows to `add_project` then `onOpen`).
  - Console: no JS errors on picker mount or interaction.
  - CLI: `pnpm lint && pnpm test && pnpm build` all exit 0; existing vitest suite (21 tests) still green.
  - [x] P2.1 Added `"dialog:default"` to `src-tauri/capabilities/default.json`; installed `@tauri-apps/plugin-dialog@2.7.1` via pnpm  <!-- status: done -->
  - [x] P2.2 Rewrote `ProjectPicker.tsx`: dropped `MOCK_RECENTS` + `mockOpenFolderDialog`; `useEffect` (async IIFE + cancelled guard) loads via `invoke("list_projects")`; row click → `record_open` then `onOpen`; × → `remove_project` then drop from local state; "Open Folder…" → `openDialog({directory:true})` → `add_project` → `onOpen`. `RecentProject` exported, matches `project_path`/`display_name`  <!-- status: done -->
  - [x] P2.3 Added always-present `<input data-testid="picker-filter">` above recents; local `filter` state; derived `visible = recents.filter(matchesFilter)`; empty filter shows all; dark-only `.picker-filter` CSS  <!-- status: done -->
  - [x] P2.4 Extracted pure `matchesFilter(project, query)` (module-level export); 6 vitest cases in `src/components/picker/__tests__/matchesFilter.test.ts`  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc --noEmit clean, eslint picker clean, vitest matchesFilter 6/6 -->
  - [x] verify-self  <!-- status: done — subagent (Chromium + stubbed Tauri IPC): 4/4 PASS, 0 BLOCKING, 0 COSMETIC. Recents render recency-ordered; filter narrows by name+path & restores; × calls remove_project + row drops; Open Folder → dialog open → add_project → workspace transition. Pre-stub Tauri-absent console errors are benign (excluded by outcome wording). -->
  - [x] verify-human  <!-- status: done — operator APPROVED all 6 leaves in pnpm tauri dev (native WKWebView). Integration boundary → PAUSED (no auto-skip). -->
    - [x] P2.verify-human.1 native macOS folder dialog opens + workspace opens  <!-- status: done -->
    - [x] P2.verify-human.2 opened project persists to projects.json across restart  <!-- status: done -->
    - [x] P2.verify-human.3 recents reorder most-recently-opened-first across restarts  <!-- status: done -->
    - [x] P2.verify-human.4 × delete persists (gone and stays gone after relaunch)  <!-- status: done -->
    - [x] P2.verify-human.5 filter narrows live in WKWebView, restores on clear  <!-- status: done -->
    - [x] P2.verify-human.6 projects.json valid w/ project_path/last_opened_at/display_name  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — matchesFilter 6 vitest cases are sufficient (only new pure logic); per WP5 test posture, DOM behavior stays a live/Playwright concern (no RTL standup in codify scope). Full suite 27 vitest + 14 cargo green, no regression. -->

## Current Node
- **Path:** Feature > finalize
- **Active scope:** Shipped (525b7e8) + review-quality complete (0 CRITICAL, 2 MAJOR + 3 MINOR auto-backlogged). Next: finalize.
- **Blocked:** none
- **Unvisited:** finalize → reflect
- **Open discoveries:** SURFACE-2026-06-18-MEMORY-MD-PRETTIER-NITS (low, pre-existing, out of scope)

## Discoveries
<!-- [SURFACED-<date>] <target node> — <summary> -->
[SURFACED-2026-06-18] Phase 2 — `pnpm format:check` flags two pre-existing `.claude/memory/*.md` files (untouched by WP6, last in commit 90ae5ef). Logged as SURFACE-2026-06-18-MEMORY-MD-PRETTIER-NITS (low). Out of WP6 scope; WP6 source files are Prettier-clean.

## Code-Quality Review — wp6-project-config-store

Reviewer subagent against ship commit `525b7e8`. drive_mode=autopilot (Mode 3): 0 CRITICAL, 2 MAJOR (auto-backlogged), 3 MINOR (auto-backlogged).

### Strengths
- Pure-core / IPC-shell split: store fns take injected `&Path`, unit-test against `TempDir` with zero Tauri runtime; `commands.rs` is genuinely thin. Sets the precedent WP7's `cc_session/` mirrors.
- Atomic-write discipline (`.tmp` → `fs::rename`) correct, documented, and pinned by a crash-before-rename test.
- Failure-mode coverage: missing→empty-vec vs malformed→typed-error vs explicit-empty-list are three distinct tested paths.
- Load-bearing `project_path` serde rename pinned by a dedicated test (asserts presence + absence of `"path"`).
- Module docs encode WHY (durability, testability seam, IPC string-mapping), not WHAT.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [ProjectPicker.tsx:60-63] Mount loader's `await invoke("list_projects")` has no `.catch`; the comment claims "a failed load leaves the list empty" but a rejected IPC throws inside the async IIFE and is silently swallowed — a malformed `projects.json` (backend `ConfigError::Parse`) presents as zero recents, masking the corruption the backend deliberately refused to silently wipe. → SURFACE-2026-06-18-QUALITY-PICKER-IPC-NO-ERROR-HANDLING
- [ProjectPicker.tsx:69-85] `handleOpenRecent`/`handleOpenFolder`/`handleRemove` `await invoke(...)` with no error handling, dispatched via `() => void handle...()`. A rejected command → unhandled promise rejection, no user feedback. ESLint config has no type-checked rules (`no-floating-promises` off) so it's not lint-caught. → same SURFACE (one entry covers both — the picker error-surfacing pass).

**MINOR**
- [ProjectPicker.tsx:78-79] `handleOpenFolder` adds via `add_project` but never refreshes `recents` (unlike `handleRemove`); a newly added folder doesn't appear until remount. State-sync asymmetry. → SURFACE-2026-06-18-QUALITY-PICKER-ADD-NO-REFRESH
- [commands.rs:42-55] `add_project` and `record_open` have byte-identical bodies; nominal-only IPC distinction invites drift. A doc note (deliberate alias) or collapse would help. → SURFACE-2026-06-18-QUALITY-CMD-ADD-RECORD-IDENTICAL
- [commands.rs:28-33] `now_ms()` swallows pre-epoch `SystemTime` error with `.unwrap_or(0)`; `0` is a sentinel that collides with recency ordering if it ever fires. → SURFACE-2026-06-18-QUALITY-NOW-MS-EPOCH-SENTINEL

### Assessment
Well-built feature that advances the codebase. Backend is the strongest part (pure-core/IPC-shell separation, correct+tested atomic-write and read-failure semantics, contract pins). Conventions hold (no unwrap outside tests, thiserror, dark-only CSS, project_path rename, vitest-pure/Playwright-DOM posture). The one real soft spot: the frontend IPC error-handling boundary partially neutralizes the careful no-silent-wipe backend behavior at the UI. The Rust module is exemplary; the picker needs an error-surfacing pass + recents-refresh fix before the Phase 2 multi-workspace shell.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** Nothing structural — the spec/plan mapped the implementation cleanly. Minor course-corrections: `thiserror` is at v2 now (spec said v1; derive API identical), and the WP5 frontend's set-state-in-effect pattern triggered `eslint-plugin-react-hooks` v7's `set-state-in-effect` rule, forcing the idiomatic async-IIFE-with-cancelled-guard shape (which is genuinely more correct anyway).
- **Assumptions that held:** The injected-`&Path` testability seam worked exactly as designed (10 backend tests run against `TempDir`, zero Tauri runtime). The `project_path` serde-rename reconciliation to the existing frontend `RecentProject` shape avoided any frontend type rename. The 2-phase split (backend-then-frontend) kept each phase independently verifiable — Phase 1's verify-human auto-skipped (no boundary), Phase 2's correctly paused (UI boundary).
- **Assumptions that were wrong:** None material. The Tauri-IPC-in-Chromium constraint for verify-self was anticipated (stubbing `__TAURI_INTERNALS__`) and worked.
- **Approach delta:** Implementation matched the plan. The one addition beyond the plan: 3 extra codify tests (empty-list round-trip, returned-record contract, `project_path` serde-rename pin) — the rename pin is the highest-value guard since Phase 2's frontend depends on that exact field name.
