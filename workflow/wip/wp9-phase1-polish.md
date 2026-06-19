# Feature: WP9 — Phase 1 polish + exit-criteria verification

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-06-19
**drive_mode:** autopilot

## Problem Statement

WP9 is the last Phase 1 work package: a polish + exit-criteria pass that takes the bare-shell PoC (WP1–WP8: scaffold, three probes, frontend UI, config store, embedded CC terminal, in-app Sublime hotkey) to "Phase 1 complete." Two things are missing for a daily-driver: (a) the two unhappy paths a real user hits — `claude` not on `PATH` (today the xterm error overlay shows a raw `No such file or directory (os error 2)` from portable-pty) and a project whose directory was deleted between sessions (today it stays in the picker and dead-clicks); and (b) the exit-criteria evidence — a measured <10s time-to-productive, confirmation that the WP4 thumbnail-probe report is linked from `arch.md`/`roadmap.md`, confirmation that the tab-shell substrate is in place, a real README placeholder, and a 3-day dogfood. The WBS WP9 task list still lists an "Accessibility permission denied → hotkey no-op" error case — **moot**, since WP8's hotkey is in-app `⌘⇧E` (no OS Accessibility); it is dropped here.

## Work Tree

- [x] Phase 1: Unhappy-path error handling  <!-- status: done — all impl + verify nodes complete -->
  **Observable outcomes:**
  - CLI (backend unit): `cargo test` — a new `cc_session` test asserts that a spawn failure whose underlying error is "not found" maps to a friendly `CcError::Spawn` variant/message naming `claude` + install guidance (not a bare `os error 2`); exits 0.
  - CLI (backend unit): `cargo test` — a new `config_store` test asserts `prune_missing` (pure fn over an injected `data_dir`) drops projects whose `path` does not exist on disk, keeps existing ones, persists the pruned list, and returns the dropped set; exits 0.
  - Browser (manual/Playwright): opening a workspace when `claude` is not resolvable shows the `cc-error-overlay` containing a human message that names Claude Code and points to install/PATH guidance — NOT a raw OS error string. (Verified by a vitest over the pure error-prettifier; live confirmation at verify-human.)
  - Browser (vitest): the picker, given a `list_projects` result that pruned N entries, renders a dismissible toast naming how many stale projects were removed; the pruned rows are absent from the recents list. Pure toast-state logic unit-tested; no JS console errors.
  - [x] P1.1 Backend: friendly "claude not on PATH" error. `CcError::CcNotFound(String)` variant + pure `classify_spawn_error(raw)` promotes the not-found case (matches "no such file or directory"/"os error 2"/"not found"/"cannot find", case-insensitive) to the friendly `CC_NOT_FOUND_MSG` (names `claude`, PATH, install-docs link); all other spawn failures stay `CcError::Spawn`. Wired at the `spawn_command` call site. 3 cargo tests.  <!-- status: done -->
  - [x] P1.2 Frontend: the `cc-error-overlay` (XtermPane bridge `error` phase) already renders `bridge.errorMsg` verbatim; the backend now sends the friendly string (Tauri rejects with `CcNotFound`'s `to_string()` = the message). Existing CSS `max-width:36ch` + `word-break:break-word` + centered wraps it cleanly. No code change needed — verified by reading the bridge passthrough.  <!-- status: done -->
  - [x] P1.3 Backend: `config_store::prune_missing(data_dir)` pure fn — partitions on `Path::exists()`, persists survivors only when any dropped, returns dropped `Vec<Project>`. `prune_missing_projects` Tauri command wrapper registered in lib.rs. 3 cargo tests (drop+keep+return; no-op-no-rewrite; empty store).  <!-- status: done -->
  - [x] P1.4 Frontend: picker calls `prune_missing_projects` on mount, then `list_projects`; dropped entries → dismissible toast via pure `pruneToastMessage` (singular/plural, null when none). Toast element + dark-only `.picker-toast` CSS. 3 vitest.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc clean; pruneToast 3/3 vitest; classify 2/2 + other_spawn 1/1 + prune_missing 3/3 cargo; broad gates 35 cargo/44 vitest/clippy/fmt/build green -->
  - [x] verify-self  <!-- status: done — CLI/pure outcomes PASS (classify 2+1, prune_missing 3, pruneToast 3 vitest); the two live-DOM outcomes (cc-error-overlay render, picker toast DOM) are UNVERIFIED — Tauri-IPC-driven, not browser-reachable; deferred to verify-human in native shell (NOT blocking) -->
    - [x] CLI: classify_spawn_error → CcNotFound (friendly msg, no raw os-error) — PASS  <!-- status: done -->
    - [x] CLI: prune_missing drops gone / keeps present / returns dropped — PASS  <!-- status: done -->
    - [x] vitest: pruneToastMessage singular/plural/null — PASS  <!-- status: done -->
    - [ ] Browser: cc-error-overlay shows friendly "claude not on PATH" guidance — UNVERIFIED (native-shell only → verify-human)  <!-- status: UNVERIFIED: Tauri runtime only — check at verify-human -->
    - [ ] Browser: picker toast renders + dismisses + stale rows absent — UNVERIFIED (native-shell only → verify-human)  <!-- status: UNVERIFIED: Tauri runtime only — check at verify-human -->
  - [x] verify-human  <!-- status: done — operator PASS both in native shell 2026-06-19 -->
    - [x] P1.verify-human.1 cc-error-overlay shows friendly "claude not on PATH" guidance (names Claude Code + install/PATH link, NOT raw os-error)  <!-- status: done -->
    - [x] P1.verify-human.2 picker prune toast renders + dismisses; deleted-folder project absent from recents on next launch  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — pure logic TDD-covered in build (9 tests); +1 IPC-contract test (CcNotFound to_string == friendly msg verbatim). Full suite 36 cargo + 44 vitest green. Integration-boundary live wiring confirmed at verify-human; no CI-runnable E2E in Phase 1 (project posture: E2E deferred, live DOM human/Playwright-verified) so no jsdom-mock test added — it would test the mock, not the wiring. -->

- [x] Phase 2: Exit-criteria verification + README + dogfood  <!-- status: done — all impl + verify nodes complete (dogfood operator-waived) -->
  **Observable outcomes:**
  - CLI: `test -f workflow/wip/wp9-timing.md && grep -qi "time-to-productive" workflow/wip/wp9-timing.md` exits 0 — a timing record exists with cold-launch→picker-click→CC-ready measurement method and a verdict slot vs the <10s target. (Case-insensitive: the doc heading is "Time-to-Productive Measurement".)
  - CLI: `grep -q "wp4-thumbnail-probe-outcome.md" docs/product/arch.md && grep -q "wp4-thumbnail-probe-outcome.md" docs/product/roadmap.md` exits 0 — the WP4 report is linked from both durable docs (verification confirms; both already link it as of 2026-06-17 — this task records the confirmation, no edit expected).
  - CLI: `test -f src/components/workspace/Filmstrip.tsx && test -f src/components/workspace/CenterStage.tsx && test -f src/state/useWorkspaceList.ts` exits 0 — tab-shell substrate components present (verification; confirmation recorded in the WIP).
  - CLI: `test -s README.md && grep -qi "Claudesk" README.md` exits 0 and the README is more than the Tauri scaffold stub — a real (if minimal) placeholder describing what Claudesk is, prerequisites pointer, and `pnpm tauri dev`.
  - [x] P2.1 Time-to-productive measurement: `workflow/wip/wp9-timing.md` written with the <10s criterion, "productive = type into live CC prompt" definition, native-shell stopwatch method (3 runs/median), and a results table. The number itself is operator-filled during verify-human/dogfood (a GUI cold-start stopwatch is not agent-runnable). Doc + method = the codifiable deliverable.  <!-- status: done -->
  - [x] P2.2 WP4 thumbnail-probe report verified linked from BOTH `arch.md` and `roadmap.md` (grep ✓ both), and the live-~1fps-mirrors recommendation is recorded in arch.md (grep ✓). No gap — no edit needed; confirmation recorded.  <!-- status: done -->
  - [x] P2.3 Tab-shell substrate verified present: WorkspaceList (`state/useWorkspaceList.ts` + `state/workspace.ts` reducer w/ N≤1 invariant), `CenterStage.tsx`, empty `Filmstrip.tsx` slot ("Phase 2 populates this"). All ✓. Confirmation recorded.  <!-- status: done -->
  - [x] P2.4 README.md rewritten from the 5-line stub to a real placeholder: what-it-is paragraph, Phase 1 PoC status callout, prerequisites (macOS/Rust/pnpm/Xcode CLT/claude/Sublime) + pointer to CLAUDE.md Getting Started, `pnpm install`/`pnpm tauri dev`/`pnpm tauri build`, test commands, doc links. 51 lines; prettier-clean.  <!-- status: done -->
  - [ ] P2.5 Dogfood gate: 3+ days driving real projects through Claudesk before marking WP9 complete. Operator-time gate — surfaced at verify-human; the workflow cannot fast-forward it. Operator records the window + any issues; non-blockers SURFACE to backlog.  <!-- status: NOT-STARTED — operator-time gate, handled at verify-human -->
  - [x] verify-auto  <!-- status: done — P2.1/P2.2/P2.3/P2.4 CLI outcomes all PASS; README prettier-clean; no source code changed this phase (docs only) so suites stay green (36 cargo/44 vitest) -->
  - [x] verify-self  <!-- status: done — subagent ran all 4 CLI outcomes: timing doc + method PASS, WP4 linked both docs PASS, substrate present PASS, README content+prettier PASS. No integration boundary (docs-only phase). P2.1 number + P2.5 dogfood deferred to verify-human (operator-time). -->
  - [x] verify-human  <!-- status: done — operator approved on feel 2026-06-19; 3-day dogfood explicitly waived -->
    - [x] P2.verify-human.1 Time-to-productive <10s: operator accepts on feel ("feels right") — no stopwatch number recorded. wp9-timing.md retains the method + an open verdict slot for a future formal measurement.  <!-- status: done — operator-accepted on feel, number not recorded -->
    - [x] P2.verify-human.2 3+-day dogfood: WAIVED by operator ("we can skip the 3-day for now"). Phase 1 exit experience accepted as right without the full 3-day window.  <!-- status: done — operator-waived -->
  - [x] verify-codify  <!-- status: done — no new tests: Phase 2 changed only README.md + a new WIP doc (no source code, no integration boundary); verified outcomes are doc/file-state facts with no runtime behavior to regress (a grep-the-doc test would be brittle, low-value). Full suite re-run confirms no regression: 36 cargo + 44 vitest green. -->

## Current Node
- **Path:** Feature > ship
- **Active scope:** ship (both phases complete; all verify nodes done)
- **Blocked:** none
- **Unvisited:** ship → review-quality → finalize. WP9 ship = Phase 1 complete → /product-finalize (F30) becomes available afterward.
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

## Notes
- **Dropped from WBS WP9 task list:** "Error: Accessibility permission denied → hotkey no-op" — moot. WP8 shipped the Sublime hotkey as an in-app `⌘⇧E` webview keydown handler (not OS-global `tauri-plugin-global-shortcut`), so no macOS Accessibility permission is involved and there is no permission-denied path to handle.
- **Tasks 4 & 5 are verifications, likely already satisfied:** WP4 (commit 3ae90eb) already linked `wp4-thumbnail-probe-outcome.md` from arch.md + roadmap.md and recorded the live-mirrors recommendation; the tab-shell substrate shipped in WP5. Phase 2's P2.2/P2.3 confirm-and-record rather than build. They stay as explicit tasks because "exit-criteria verification" is the WP's whole point.
- **No new data models / no arch decisions** — confirms small/simple routing (entered at plan via F2). Phase 1 adds two error variants + one pure prune fn + one Tauri command + a toast; well under the size/complexity bar.
- **Optional fold-in:** the WP5/WP7/WP8 cosmetic MINOR quality findings (backlog) and the picker IPC error-surfacing MAJORs (wp6) could be touched during this polish pass, but are NOT in WP9 scope — leave for a dedicated refactor unless they intersect the toast/overlay work.
