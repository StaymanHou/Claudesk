# Feature: M2 WP6 — Cmd+P fuzzy file finder (app-layer `fs_index` subsystem)

**Workflow:** feature
**State:** COMPLETED 2026-06-20 — shipped fc77ad4, review-quality clean (3 MINOR backlogged), finalized
**Created:** 2026-06-20
**Entry:** spec (complex feature)
**Drive mode:** autopilot (standing directive: halt at WBS-WP boundaries; operator confirms the spec before plan)
**WBS:** Milestone 2 → WP6 (`docs/product/wbs.md`)

## Problem Statement

The right-half editor (WP2–WP3c) can open and edit files, but there is **no way to find a file to open** other than the WP2 *stopgap* path-input box in `RightPanelHost` (type `path/in/project.ts`, click Open). The operator's Sublime workflow leans on **Cmd+P fuzzy open** — type a few characters, see ranked matches, Enter to open — and that gesture is part of the parity bar WP9 gates WP8's Sublime-Text removal on.

This is an **app-layer subsystem, not an editor feature** (the load-bearing `research.md` correction, re-stated in `arch.md` Key M2 design constraints): CodeMirror edits a *document*, it does not index a *project*. WP6 builds (a) a Rust **`fs_index`** module that walks the workspace project dir honoring `.gitignore`, behind a Tauri command in the established `command → pure-fn → typed-error → String` shape, and (b) a React **fuzzy-picker overlay** (`⌘P`) that fuzzy-matches over that index and opens the selected file into the `EditorPanel`.

WP6 is also the **shared index foundation** that WP7 (project-wide search) and WP10 (file-tree navigator) reuse — both depend on it (`wbs.md` ordering rationale + WP10 dependency note). Doing WP6 first is the dependency-efficient sequencing.

**Folded-in scope (operator decision, this session):** a **dev-only workspace-seed seam** (`?ws=<path>` URL param / `window.__seedWorkspace()`) that opens a workspace *without* going through the native folder dialog. This unwedges `SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE` (the Tauri `plugin:dialog|open` stub-wedge that has blocked verify-self from reaching the workspace UI, reproduced 3×), so verify-self can drive the finder → open-into-editor flow end-to-end — for WP6 and every future editor/panel WP.

## User Stories

- As the operator, I want to press **⌘P inside a workspace** and get a fuzzy file-picker over my project's files, so I can open any file in a couple of keystrokes instead of typing its full relative path.
- As the operator, I want the picker to **honor `.gitignore`** (no `node_modules`, `target/`, `.git/`, build artifacts), so the match list is the files I actually edit.
- As the operator, I want **⌘P to work even while my cursor is inside the editor**, so I don't have to click out of CodeMirror first (the WP1 capture-phase lesson).
- As the operator, I want a **file open/index error surfaced**, not silently swallowed, so a permissions or non-existent-dir problem is visible (the carried-forward wp6 picker IPC error-surfacing MAJORs).
- As the agent doing verify-self on this and future editor WPs, I want a **dev-only way to seed a workspace** without the native dialog, so I can drive the finder → editor flow in an automated browser harness (currently impossible — the dialog stub-wedges).

## Acceptance Criteria

The feature is done when:

**Backend — `fs_index`**
1. A new Rust module `src-tauri/src/fs_index/` exists with a **pure-fn core** (`walk_index_core(root: &Path) -> Result<Vec<String>, FsIndexError>`, injected root, `TempDir`-testable) plus a thin Tauri command wrapper (`fs_index(root: String) -> Result<Vec<String>, String>`), registered in `lib.rs::generate_handler!`. Mirrors the `editor_fs` shape exactly.
2. The walk **honors `.gitignore`** (and `.git/` exclusion) via the `ignore` crate (ripgrep's walker — same ecosystem chosen so WP7's ripgrep-style search reuses it). Returns **project-relative** paths (POSIX `/` separators), files only (no dirs), sorted deterministically.
3. Index errors (root doesn't exist, unreadable) return a typed `FsIndexError` → `String` across IPC — **never an empty-list-on-error masquerade** (the picker IPC error-surfacing lesson; the WP6 design constraint that started this whole class of finding).
4. Unit tests on the pure core against a `TempDir` fixture: a known tree with a `.gitignore` excluding a dir + a file → asserts the ignored entries are absent and the kept ones present; an empty dir → empty list; a non-existent root → typed error.

**Frontend — FileFinder overlay**
5. A new `FileFinder` React overlay opens on **`⌘P`** (bare Cmd+P, distinct from ⌘⇧P palette and the ⌘⇧E/D/T panel chords — already reserved in `panelHost.ts`'s chord-ownership matrix), registered via the **WP1 capture-phase document listener**, **gated on the workspace being visible/active** so only the focused workspace responds and it fires while focus is inside CM6.
6. The overlay **fuzzy-matches** the typed query against the index with a **pure, unit-tested match+rank predicate** (`fuzzyMatch(query, candidate) -> score | null`), keyboard nav (↓/↑/Enter/Esc), and a bounded visible result count. Esc closes; re-pressing ⌘P toggles (mirrors the palette).
7. Selecting a result (Enter or click) **opens that file into the `EditorPanel`** — wired through the existing `RightPanelHost` `openPath`/`setOpenPath` seam (the same seam DiffPanel's "Open" uses), flipping the active panel to `editor`.
8. An `fs_index` IPC failure is **surfaced in the overlay** (an inline error row), not swallowed.
9. The overlay loads the index when opened (or on workspace open — decide at plan; lazy-on-open is the simpler default), so it reflects the current tree.

**Dev-only seed seam**
10. A **dev-only** mechanism seeds a workspace for a given absolute path without the native folder dialog: reading a `?ws=<path>` URL query param at app init **and/or** exposing `window.__seedWorkspace(path)`. Gated to **dev builds only** (`import.meta.env.DEV`) so it never ships in `pnpm tauri build`. It calls the existing `openWorkspace(path)` reducer path — no new workspace-creation logic.
11. With the seed seam, **verify-self can drive** the flow in a Vite-dev browser harness: seed a workspace pointed at a TempDir/real fixture dir → press ⌘P → type → Enter → assert a file opened in the editor. (The PTY-backed left half is not required for this — the seam seeds the workspace shell; the right-half finder→editor flow is what's under test.)

**Cleanup**
12. The WP2 stopgap `editor-open-bar` path-input box in `RightPanelHost.tsx` is **removed** (the backlog noted WP6 removes it — `m2-wp5` MINOR; the finder is its replacement). The empty/no-file editor state remains the fallback.

**Gates (all green before ship)**
13. `cargo test` (new `fs_index` tests + existing), `cargo clippy -- -D warnings`, `cargo fmt --check` clean.
14. `pnpm test` (new `fuzzyMatch` + finder-state tests + existing), `tsc`, `eslint` (0), `prettier --check` clean.
15. verify-self drives the seeded finder→editor flow (criterion 11) and verify-human confirms ⌘P in real `pnpm tauri dev` on this repo (the editor/panel WPs' verify pattern — verify-self proves the flow via the seam, verify-human confirms the real chord + dialog-opened workspace).

## Out of Scope

- **Project-wide content search (WP7)** — WP6 indexes filenames only; grepping file *contents* is WP7. WP6 deliberately builds the `ignore`-crate walk so WP7 reuses it.
- **File-tree navigator (WP10)** — WP6 returns a flat file list; the collapsible directory tree is WP10 (which extends `fs_index` with directory structure or a `list_dir` command).
- **Frecency / recently-opened-first ranking, multi-root, symlink-following policy beyond `ignore`'s default** — keep the ranker simple (subsequence fuzzy match + a sensible tiebreak); fancier ranking is a later polish, surface to backlog if it itches.
- **Incremental/streaming index for huge repos, file-watching to keep the index live** — WP6 indexes on open (re-walk is cheap at the operator's repo sizes). A watch-backed live index is future work.
- **Replacing the project *picker* dialog** — the dev seed seam is dev-only; the production path stays the native folder dialog in `ProjectPicker`. WP6 does not touch the picker's open flow.
- **Independent per-pane *files*** — WP3c is shared-document by design (panes are viewports onto ONE file; `SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT` deferred true per-pane files). WP6 does NOT reopen that decision. **Operator decision (2026-06-20): open targets the ACTIVE pane** — interpreted within the shared-doc model as: finder selection loads the file via `setOpenPath` AND the focused pane becomes the active viewport reflecting it. If the operator actually wants *independent files per pane*, that is a WP3c-model change → surface as a follow-up at plan, do not silently expand WP6.

## Technical Constraints

- **New crate: `ignore`** (ripgrep's gitignore-honoring directory walker). Chosen over `walkdir`+manual gitignore parsing because (a) it honors `.gitignore`/`.ignore`/global gitignore correctly out of the box, (b) it's the ripgrep ecosystem so **WP7's ripgrep-style content search reuses the same walker**, (c) it's a documented, widely-used Rust library — **no 3rd-party probe needed** (no external API/service). Add to `src-tauri/Cargo.toml`.
- **Backend command shape is fixed** by repo convention: `command → pure-fn (injected `&Path`, TempDir-testable) → typed `thiserror` error → `String` over IPC`. `fs_index` MUST mirror `editor_fs`/`config_store`/`git_diff` — including the **never-swallow-errors** rule (the WP6 picker MAJOR that originated the lesson). Reference: `src-tauri/src/editor_fs/mod.rs` + `commands.rs`.
- **⌘P chord registration MUST use the WP1 capture-phase document listener** (`document.addEventListener("keydown", fn, true)`), gated on `visible`/`active`, so it fires while focus is inside CodeMirror. A naive bubble-phase listener gets swallowed by CM6's keymap (the WP1 finding, re-stated in `research.md` and `arch.md`). Reference patterns: `RightPanelHost.tsx` (panel chords) and `EditorPanel.tsx` (palette chord).
- **Chord-ownership is already allocated:** `panelHost.ts` chord-ownership comment reserves `⌘P → finder`. ⌘P is bare-Cmd (no Shift), distinct from ⌘⇧P (palette) and ⌘⇧E/D/T (panels) — no predicate collision. Confirm the bare-⌘P predicate is exclusive (the palette's `isPaletteChord` requires Shift).
- **Open-into-editor seam exists:** `RightPanelHost` owns `openPath`/`setOpenPath` and passes `openPath` to `EditorPanel`; `EditorPanel` loads on `openPath` change via `read_file`. WP6 routes finder selection through `setOpenPath` + flip to the editor panel — exactly as `DiffPanel.onOpenInEditor` already does. **No new open-file plumbing.**
- **Seed seam reuses `useWorkspaceList(initial)`:** the hook already accepts an initial `WorkspaceListState`, and `openWorkspace(path)` is a pure reducer. The seed reads the dev-only param at App init and seeds via the existing reducer — no new workspace-creation path. Gate on `import.meta.env.DEV`.
- **Dark-mode only** (project convention) — overlay styling matches the existing palette/picker dark tokens; no light variant.
- **No 3rd-party probe required** (per the spec's 3rd-party check): the only new dependency is the `ignore` Rust crate (a library, not an external service/API); CodeMirror 6 + Tauri IPC are already integrated and verified in WP1–WP5.

## Carried-forward backlog to honor (load-bearing)

- **The wp6 picker IPC error-surfacing MAJORs** (`SURFACE-2026-06-18-QUALITY-*`, `wp6-project-config-store` review). WP6's `fs_index` is the canonical place to get this right: **surface IPC errors, do not swallow them** (criteria 3 + 8). This also fixes the existing picker mount-effect `catch {}` partial-failure window if the same pattern is applied — at minimum, the new `fs_index` path must not repeat it.

## Verify pattern (this WP class)

- **verify-self CANNOT reach the workspace UI today** (Tauri dialog `plugin:dialog|open` stub-wedge — `SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE`, reproduced 3×). The **dev seed seam (criteria 10–11) is the fix** — it lets verify-self seed a workspace and drive the finder→editor flow in the Vite-dev browser. Build the seam early so the rest of WP6 is verify-self-able.
- **verify-human** confirms the real ⌘P chord in `pnpm tauri dev` on THIS repo (kill `:1420` before relaunch; warm rebuild ~15s) — the dialog-opened workspace path + the real macOS chord, which the dev seam intentionally bypasses.

## Open Questions

- [ ] **Index timing:** lazy-walk on overlay-open (simplest, always-fresh) vs. walk-once on workspace-open and cache. → Lean lazy-on-open for WP6; revisit if it feels slow. *(Decide at plan; not a blocker.)*
- [ ] **Fuzzy ranker depth:** plain subsequence match + tiebreak (shorter path / earlier match / path-segment-boundary bonus) is the must-have. Anything beyond that (e.g. fzf-style scoring) is polish — confirm the must-have ranker shape at plan. *(Not a blocker.)*
- [ ] **Seed seam form:** `?ws=<path>` URL param, `window.__seedWorkspace()`, or both. → Both is cheap and covers Playwright (navigate with query) + console-driven harnesses. *(Decide at plan.)*

> None of these are unknowns requiring research — they are build-time decisions. No 3rd-party probe is required. Recommend **F4 → `/feature-plan`**.

## Spec review decisions (operator, 2026-06-20)

- **Spec approved** as written → proceed to `/feature-plan` (F4).
- **Open target = ACTIVE pane** (not "always shared-doc replace"): finder selection loads the file via the `openPath` seam and the FOCUSED pane becomes the active viewport on it. Interpreted within WP3c's shared-document model (panes = viewports onto one file). If true independent-per-pane *files* are wanted, that's a WP3c-model change → flag as a follow-up at plan, don't expand WP6 silently. (Reflected in Out of Scope above.)

## Plan decisions (resolving the spec's open questions, 2026-06-20)

- **Index timing → lazy-walk on overlay-open.** Simplest, always-fresh, fast at the operator's repo sizes. No caching/invalidation in WP6. (A watch-backed live index stays future work.)
- **Ranker depth → subsequence fuzzy match + tiebreak (must-have only).** `fuzzyMatch(query, candidate)` returns a numeric score or `null` (no match). Tiebreak: prefer (a) matches with more characters on path-segment boundaries / after `/`, (b) shorter candidate path, (c) earlier first-match index. No fzf-style bonus matrix — keep it pure + cheap. Case-insensitive. Empty query matches all (sorted by path).
- **Seed-seam form → BOTH `?ws=<path>` and `window.__seedWorkspace(path)`.** Cheap to do both; covers Playwright (navigate with query) and console-driven harnesses. Both gated on `import.meta.env.DEV` and both funnel through the same single seeding helper → the existing `openWorkspace` reducer.
- **`ignore` crate** (ripgrep's `WalkBuilder`) is the walker — gitignore-honoring by default; pin the exact version at build. No 3rd-party probe (library, not a service).
- **Phase ordering rationale:** backend `fs_index` first (no UI dep, fully unit-testable), then the **dev seed seam** (so Phase 3 is verify-self-able — it unwedges the dialog stub), then the **FileFinder overlay** (consumes both). The seam deliberately precedes the overlay.

## Work Tree

- [x] Phase 1: Backend `fs_index` module (gitignore-honoring walk)  <!-- status: COMPLETE — impl + all 5 verify nodes done; 9 fs_index tests, backend suite 82/82 -->
  **Observable outcomes:**
  - CLI: `cd src-tauri && cargo test fs_index` exits 0 — pure-core tests pass: a TempDir tree with a `.gitignore` excluding `ignored_dir/` + `secret.txt` → `walk_index_core` returns the kept files (project-relative, POSIX `/`, sorted) and NOT the ignored ones nor anything under `.git/`; empty dir → `[]`; non-existent root → `Err(FsIndexError::...)`. ✅ 9/9 pass.
  - CLI: `cargo clippy -- -D warnings` and `cargo fmt --check` exit 0 with the new module present. ✅ clean.
  - CLI: `grep -q "fs_index::commands::fs_index" src-tauri/src/lib.rs` → command registered in `generate_handler!`. ✅ registered.
  - [x] P1.1 Add `ignore` crate to `src-tauri/Cargo.toml` (pinned `ignore = "0.4"` → resolves 0.4.26; comment cross-refs WP7 reuse)  <!-- status: COMPLETE -->
  - [x] P1.2 Create `src-tauri/src/fs_index/mod.rs`: `FsIndexError` (thiserror, `BadRoot` only), pure `walk_index_core(root: &Path) -> Result<Vec<String>, FsIndexError>` using `WalkBuilder` (gitignore on, `hidden(false)` so dotfiles show, `.git` excluded), returning sorted project-relative POSIX paths, files only — mirrors `editor_fs/mod.rs` shape  <!-- status: COMPLETE -->
  - [x] P1.3 Create `src-tauri/src/fs_index/commands.rs`: thin `#[tauri::command] fn fs_index(root: String) -> Result<Vec<String>, String>` mapping the error to a `String` (never empty-on-error) — mirrors `editor_fs/commands.rs`  <!-- status: COMPLETE -->
  - [x] P1.4 Register `mod fs_index;` + `fs_index::commands::fs_index` in `lib.rs`  <!-- status: COMPLETE -->
  - [x] P1.5 Unit tests in `fs_index/mod.rs` (9 tests: gitignore exclusion, .git exclusion, dotfiles-present, empty dir → [], non-existent root → typed error, file-as-root → error, nested relative-path shape, sorted, dirs-excluded)  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — fs_index tests 9/9, clippy clean, fmt clean, command registered -->
  - [x] verify-self  <!-- status: COMPLETE — subagent 5/5 PASS (CLI outcomes + live-walk via unit coverage); no integration boundary (new unwired artifacts only) -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED (F11) — drive_mode=autopilot, verify-self all-PASS, no integration boundary (fs_index is a new unwired command); affirmation + dotfile decision printed for read-time veto -->
  - [x] verify-codify  <!-- status: COMPLETE — verified behavior fully codified by the 9 in-crate fs_index tests (written TDD-style during build); no new tests warranted; backend suite 82/82, no regressions; no integration boundary -->

- [x] Phase 2: Dev-only workspace seed seam (`?ws=` + `window.__seedWorkspace()`)  <!-- status: COMPLETE — impl + all 5 verify nodes done; 7 parser tests, frontend suite 175/175; verify-self proved the seam unwedges the dialog stub -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — the FileFinder is the WP6 deliverable; the seam (just built) makes it verify-self-able.
  - Requirements unchanged: yes — no new info contradicts the plan.
  - Solution still feasible: yes — fs_index command (Phase 1) + openPath/setOpenPath seam + capture-phase chord pattern all confirmed in code.
  - No superior alternative discovered: yes — Phases 1–2 surfaced nothing that changes the finder approach.
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser: in Vite dev (`pnpm dev`), navigating to `/?ws=<abs-fixture-dir>` mounts the workspace shell directly (CenterStage + RightPanelHost present, `[data-testid="app-shell"]` shows the workspace view, NOT the picker) — no folder dialog, no wedge.
  - Browser: with the app loaded, `window.__seedWorkspace("<abs-dir>")` in the console flips the view from picker to an open workspace for that path.
  - CLI: `pnpm test` exits 0 — a unit test on the pure seed-param parser (`parseSeedParam(search) -> path | null`) covers present/absent/empty.
  - Console: no JS errors when the seam fires; the seam is a no-op (and absent from `window`) when `import.meta.env.DEV` is false (asserted by a unit test that the production path doesn't register it).
  - [x] P2.1 Pure helper `src/state/seedWorkspace.ts`: `parseSeedParam(search) -> string | null` (URLSearchParams `ws` key; trims; null if absent/blank/whitespace; decodes %20) + `SEED_PARAM` const — no DOM, no env access (caller owns the DEV gate)  <!-- status: COMPLETE -->
  - [x] P2.2 Wired the seam into `App.tsx`: a DEV-gated `useEffect` reads `parseSeedParam(window.location.search)` on mount → `openWorkspace(seeded)`, AND registers `window.__seedWorkspace = (p) => openWorkspace(p)` (cleanup deletes it). Both funnel through the live `openWorkspace` reducer callback — no new workspace-creation logic. `window.__seedWorkspace?` typed in `vite-env.d.ts` (global augmentation)  <!-- status: COMPLETE -->
  - [x] P2.3 Prod-strip via the `import.meta.env.DEV` guard — Vite statically replaces it with `false` + dead-code-eliminates the block in `pnpm tauri build`, so `?ws=` is inert and `window.__seedWorkspace` is absent in prod. NOTE: repo has no DOM test env (pure-logic vitest only), so DCE/window-absence is NOT unit-asserted; it's a verify-self Playwright observable (DEV-absence check). The guard is the single registration site (one `useEffect`, one `if (!import.meta.env.DEV) return`)  <!-- status: COMPLETE -->
  - [x] P2.4 Unit tests for `parseSeedParam` — 7 cases (present, raw-no-?, absent, empty `?ws=`, whitespace-only→null + trim, %20-decode, multi-key isolation). 7/7 pass  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — seedWorkspace 7/7, tsc clean, eslint clean (scoped to changed files) -->
  - [x] verify-self  <!-- status: COMPLETE — subagent 4/4 PASS at http://localhost:1420: ?ws= mounts workspace (picker bypassed, no dialog/wedge); window.__seedWorkspace() is a fn + flips picker→workspace; console clean (Tauri-invoke failure handled in-UI error boundary, not a crash); prod-strip guard-enforced. THE DIALOG STUB-WEDGE IS UNWEDGED — verify-self reached the workspace UI in a stub browser for the first time. -->
  - [x] verify-human  <!-- status: COMPLETE — operator APPROVED 2026-06-20 on verify-self's 4/4 Playwright evidence (boundary present but DEV-only; verify-self covered the named app-shell surface end-to-end) -->
    - [x] P2.verify-human.1 Operator approved the dev seed seam (accepted on verify-self evidence)  <!-- status: COMPLETE -->
  - [x] verify-codify  <!-- status: COMPLETE — parser codified by 7 vitest cases; wiring codified by verify-self Playwright (repo has no DOM test env by design — pure→vitest, DOM→Playwright); no new tests warranted; frontend suite 175/175 -->

- [x] Phase 3: FileFinder overlay (⌘P) + open-into-active-pane + remove WP2 stopgap  <!-- status: COMPLETE — impl + all 5 verify nodes done; 21 finder tests, suites 82/82 + 196/196; operator approved real-backend end-to-end -->
  **Observable outcomes:**
  - Browser (verify-self via seed seam): navigate `/?ws=<abs-fixture-dir>` → press `⌘P` → the FileFinder overlay appears (`[data-testid="file-finder"]`) even with focus inside the editor; type a few chars → ranked results appear; ↓/↑ move selection; Enter opens the top match → the EditorPanel shows that file's path in its statusbar (`[data-testid="editor-status-path"]`) and content loads; Esc closes the overlay.
  - Browser: re-pressing `⌘P` toggles the overlay closed; clicking a result row opens it (same as Enter).
  - Browser: a forced `fs_index` failure (e.g. seed a non-existent dir) surfaces an inline error row in the overlay (`[data-testid="file-finder-error"]`), not an empty silent list.
  - Browser: the WP2 `editor-open-bar` path-input box is GONE from the RightPanelHost (`[data-testid]`/class no longer in the DOM).
  - CLI: `pnpm test` exits 0 — `fuzzyMatch` pure tests (ordering: exact-ish > subsequence; segment-boundary + shorter-path + earlier-match tiebreaks; no-match → null; empty query → all) + the finder reducer/state tests.
  - [x] P3.1 Pure `finder/fuzzyMatch.ts`: `fuzzyMatch(query, candidate) -> number | null` (case-insensitive subsequence; segment-boundary + basename + contiguity bonuses; earlier-first + shorter-path tiebreaks; empty→0) + `rankFiles(query, files, limit=100) -> FileMatch[]` (sorted best-first, path tiebreak, bounded). No React/DOM.  <!-- status: COMPLETE -->
  - [x] P3.2 `finder/FileFinder.tsx` overlay: lazy `invoke("fs_index",{root})` on mount, input, ranked list (bounded 100), keyboard nav ↓/↑/Enter/Esc, inline error row `[data-testid=file-finder-error]` on IPC failure (NOT swallowed), loading row, dark styling reusing `.command-palette-*`. `[data-testid=file-finder]`.  <!-- status: COMPLETE -->
  - [x] P3.3 `finder/finderChord.ts` pure `isFinderChord` (bare ⌘P, `metaKey && !shiftKey && key==='p'` — exclusive vs ⌘⇧P + ⌘⇧E/D/T) + registered in `RightPanelHost` via the WP1 capture-phase listener gated on `visible`; toggles overlay open/close, preventDefault  <!-- status: COMPLETE -->
  - [x] P3.4 Selection → open via shared `openFile(path)` helper in RightPanelHost: `setOpenPath` + flip panel to `editor` (active-pane within WP3c shared-doc model; pane model unchanged). DiffPanel `onOpenInEditor` now reuses the same `openFile`.  <!-- status: COMPLETE -->
  - [x] P3.5 Removed the WP2 `editor-open-bar` form (path input + Open button) from RightPanelHost + dropped its orphaned `.editor-open-bar`/`.editor-open-input` CSS; kept `openPath`/`setOpenPath` + the empty/no-file editor fallback  <!-- status: COMPLETE -->
  - [x] P3.6 Updated chord-ownership comments in `panelHost.ts` + `paletteCommands.ts`: ⌘P marked LIVE (finder), not reserved  <!-- status: COMPLETE -->
  - [x] P3.7 Unit tests: `fuzzyMatch`/`rankFiles` (13 cases — subsequence/null, case, empty, boundary/basename bonuses, ordering, shorter-path/limit) + `isFinderChord` exclusivity (8 cases — bare ⌘P matches; ⌘⇧P/plain-p/⌘+other don't; cross-predicate no-collision matrix). 21 finder tests; full suite 196/196  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — finder tests 21/21, tsc clean, eslint clean (scoped to changed files) -->
  - [x] verify-self  <!-- status: COMPLETE — subagent 5/5 PASS at :1420 via the seed seam: ⌘P opens finder (capture-phase, document-level → fires with editor focus); Esc closes + re-⌘P re-opens (toggle); fs_index IPC error surfaced inline [file-finder-error] (NOT swallowed); WP2 editor-open-bar GONE; console clean on fresh load. (HMR-transient pathInput ReferenceError flagged by subagent → confirmed CLEAN in source, stale-closure artifact only.) Backend-dependent paths (real file list + Enter-opens-file) deferred to verify-human in pnpm tauri dev. -->
  - [x] verify-human  <!-- status: COMPLETE — operator APPROVED all 4 in pnpm tauri dev 2026-06-20 (after freeing stale :1420 from verify-self's Vite). Real end-to-end finder flow confirmed. -->
    - [x] P3.verify-human.1 ⌘P populates with REAL files (fs_index walk; gitignore honored; dotfiles shown) — PASS  <!-- status: COMPLETE -->
    - [x] P3.verify-human.2 Typing narrows to ranked fuzzy results — PASS  <!-- status: COMPLETE -->
    - [x] P3.verify-human.3 Enter/click OPENS the file in the editor (statusbar path + content) — PASS  <!-- status: COMPLETE -->
    - [x] P3.verify-human.4 ⌘P fires while cursor is inside CodeMirror — PASS  <!-- status: COMPLETE -->
  - [x] verify-codify  <!-- status: COMPLETE — ranker + chord-exclusivity codified by 21 unit tests; overlay/wiring codified by verify-self Playwright (5/5) + verify-human (4/4 real backend); repo has no DOM test env by design; backend 82/82 + frontend 196/196, no regressions; no new tests warranted -->

## Current Node
- **Path:** Feature > review-quality COMPLETE → finalize
- **Active scope:** none — WP6 shipped (fc77ad4); review-quality clean (0 CRIT/0 MAJ, 3 MINOR auto-backlogged). Next: /feature-finalize.
- **Blocked:** none
- **Unvisited:** WP6 ship → finalize (WP boundary — operator-gated, not auto-chained)
- **Phase 1:** ✅ COMPLETE (backend fs_index — 9 tests)
- **Phase 2:** ✅ COMPLETE (dev seed seam — 7 tests; unwedged verify-self)
- **Phase 3:** ✅ COMPLETE (FileFinder ⌘P — 21 tests; operator-approved end-to-end)
- **Phase 1:** ✅ COMPLETE (backend fs_index — 9 tests, suite 82/82)
- **Phase 2:** ✅ COMPLETE (dev seed seam — 7 parser tests, suite 175/175; unwedged verify-self for the workspace UI)
- **Open discoveries:** dotfile-visibility decision (logged below — not blocking)

## Test Triage — fuzzyMatch "basename match higher than directory-only match"
Classification: Obsolete test — the test's assertion encoded a wrong expectation, not a code bug
Confidence: high
Evidence: The test asserted `comp`→`src/component.ts` (basename) outscores `comp`→`components/x.ts` (dir), but empirically the dir match scores HIGHER (20.25 vs 15.2) because "comp" matches at the very START of `components/x.ts` (start-of-string boundary bonus) and contiguously — which is DEFENSIBLE ranking (a path literally starting with the query is a reasonable top hit). The basename bonus is real but correctly does not override a start-of-string contiguous match.
Action: Replaced the assertion with one that genuinely isolates the basename bonus — a candidate where the dir match is neither start-of-string nor the only differentiator. The ranker code is unchanged (it behaves correctly); only the test's example was fixed.

## Retrospect
- **What changed in our understanding:** The dev seed seam (folded in at the operator's request) turned out to be the highest-leverage part of WP6 — it unwedged verify-self for the *entire* workspace UI, not just this WP. WP6 Phase 3 became the first time verify-self drove the workspace UI in a stub browser; WP7/WP10/WP9 inherit that capability for free. A process win that outlasts the feature.
- **Assumptions that held:** Every seam predicted at spec/plan time existed exactly as expected — the `editor_fs` backend template, the `openPath`/`setOpenPath` open-into-editor seam (same one DiffPanel uses), the WP1 capture-phase chord pattern, and `useWorkspaceList(initial)` for seeding. No re-plan, no F23/F22/F26. The `ignore` crate was the right pick (zero-config gitignore + WP7 reuse). No 3rd-party probe needed (correctly judged at spec).
- **Assumptions that were wrong:** Two small ones, both caught in-build: (1) `ignore::WalkBuilder` defaults to `hidden(true)` — would have hidden dotfiles from the finder; flipped to `hidden(false)` (operator-acknowledged). (2) A `fuzzyMatch` test encoded a wrong ranking expectation (assumed basename always beats a start-of-string dir match) — the ranker was correct, the test assertion was fixed (triaged).
- **Approach delta:** Implementation matched the plan's 3 phases exactly (backend → seed seam → overlay), in that deliberate order so the seam made Phase 3 verify-self-able. One eslint fix (`set-state-in-effect`) and one prettier pass during build. No scope expansion beyond the operator-approved seed seam.

## Code-Quality Review — m2-wp6-file-finder

Ship commit fc77ad4. Reviewer: code-quality-reviewer subagent. **0 CRITICAL, 0 MAJOR, 3 MINOR.** Rated well-built, low-debt, consistent with repo seams; correctness validated (deterministic tiebreak sort, greedy subsequence matcher, async cancellation, chord exclusivity).

### Strengths
- Clean pure-core/IPC-wrapper split in `fs_index` (mirrors `editor_fs`), 9 TempDir tests covering the load-bearing contracts incl. error-vs-empty-list.
- `rankFiles` uses an explicit path comparator as secondary sort (deterministic across engines), pinned by a test.
- Chord exclusivity enforced by construction (`!shiftKey`) + a cross-predicate matrix test.
- Async loads use the `cancelled`-flag cleanup; mousedown-not-click beats input-blur teardown.
- Comments encode WHY, not WHAT.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [RightPanelHost.tsx:60-75] Panel chord (⌘⇧E) while the finder overlay is open switches the panel underneath the still-visible overlay — UX seam, not a correctness bug. Consider guarding panel chords on `!finderOpen` or a one-line note.
- [fuzzyMatch.ts:32-34] `isBoundary` includes `.` (extension dot earns the boundary bonus); harmless given the "deliberately simple" ranker + tests, but the rationale for including `.` is undocumented.
- [FileFinder.tsx:177] `onMouseEnter→setActiveIndex` couples hover to the keyboard cursor; a mouse resting over the list can yank the active row during arrow-key nav. Negligible at the 100-row cap.

### Assessment
Well-built feature that advances the codebase rather than accruing debt. Architecture consistent with established seams (Rust command→pure-fn→typed-error→String, capture-phase chords, openPath/active-pane editor seam, pure→vitest/DOM→Playwright posture). Error-surfacing discipline applied correctly (the WP6 picker MAJORs' lesson). Only findings are minor overlay interaction seams.

### Disposition (Mode 3 autopilot)
All 3 MINOR auto-backlogged to `workflow/backlog-quality-findings.md` (pointer in `workflow/backlog.md`). To address now: `/feature-refactor`. To dismiss: mark `[DISMISSED]` here before finalize archives the WIP.

## Discoveries
<!-- [SURFACED-<date>] <target node> — <summary> -->
- [SURFACED-2026-06-20] Phase 1 (build) — `ignore::WalkBuilder` defaults to `hidden(true)`, which would hide dotfiles (`.gitignore`, `.prettierignore`, `.env.example`) from the finder. Resolved IN-BUILD by setting `.hidden(false)` (Sublime's Cmd+P shows dotfiles; the operator edits them); only `.git/` stays excluded via an explicit `filter_entry`. Tested (`kept_files_present` asserts `.gitignore` present, `git_metadata_dir_is_excluded` asserts `.git/` absent). Not a backlog item — a deliberate build decision, recorded here for traceability.
```
