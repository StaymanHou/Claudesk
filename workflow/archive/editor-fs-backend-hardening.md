# Feature: editor_fs backend hardening (backlog-paydown WP7)

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-07-20
**Entry:** reproduce → plan (F33) — bug-fix, red tests already captured
**drive_mode:** autopilot
**Parent WBS:** docs/product/backlog-paydown-2026-07-19-wbs.md → WP7 (the last, med-risk WP of the sweep)

## Problem Statement

The `editor_fs` fs-trust-boundary guard has two accepted gaps (both PARTIAL findings from the M2 review, docs already narrowed to honest, hardening deferred to this sweep):

1. **Leaf-symlink escape.** `resolve_within` (`src-tauri/src/editor_fs/mod.rs`) canonicalizes only the target's *parent* and re-attaches the raw leaf name un-canonicalized. A **leaf** symlink inside root whose target points *outside* root is followed — `read_file_core` leaks the outside file, `write_file_core` clobbers it. (Runtime-red captured: `read_leaf_symlink_escaping_root_is_rejected` → `Ok("TOP SECRET")`, `write_through_leaf_symlink_escaping_root_is_rejected` → `Ok(())`; the inside-pointing fence `read_leaf_symlink_pointing_inside_root_is_still_allowed` passes.)
2. **Backend trusts frontend `root`.** All six editor_fs commands (`read_file`/`write_file`/`stat_file`/`delete_file`/`trash_path`/`create_dir`) take a bare `root: String` straight from the renderer with no validation against the known project list — the "confined to the open project" guarantee lives entirely in the webview. (Compile-gap red captured: `validate_root_rejects_a_root_not_in_the_known_project_list` references the to-be-added `validate_root(known_roots, requested_root)` helper — `E0425` today.)

Fixed = both gaps closed under their red tests, module/`resolve_within`/`commands.rs` docs restated to the now-**enforced** invariant (drop "accepted gap" language), and both PARTIAL findings delete-on-resolve closed.

**Key de-risking finding (from FE caller sweep):** every FE `invoke` call passes `{ root: projectPath, path }` and Tauri injects `AppHandle` **server-side** — so adding `app: AppHandle` to the Rust commands is *transparent to the frontend*: no `invoke` call changes, and the `editorFileManagement.test.ts` source-guard tests (which match `invoke<void>("...")` strings) stay green. The med-risk is confined to the Rust command layer. `config_store::commands::resolve_data_dir(app: &AppHandle)` is already `pub(crate)` and is the established data-dir seam to reuse.

## Work Tree

- [x] Phase 1: Leaf-symlink hardening (pure core, no signature change)  <!-- status: complete — all impl + verify nodes done -->
  **Observable outcomes:**
  - CLI: `cargo test --lib editor_fs::tests` exits 0 — `read_leaf_symlink_escaping_root_is_rejected` and `write_through_leaf_symlink_escaping_root_is_rejected` now PASS (both were RED, leaking/clobbering the outside file); `read_leaf_symlink_pointing_inside_root_is_still_allowed` still PASSES; all 34 pre-existing editor_fs tests still PASS.
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0; `cargo fmt --check` clean.
  - [x] P1.1 In `resolve_within` (`editor_fs/mod.rs`), after re-attaching the leaf, if the resolved target **exists**, canonicalize the *full* target and re-check `starts_with(root_canon)`; reject with `OutsideWorkspace` on failure. Preserve the not-yet-existing-leaf write path: when the target does not exist, keep today's parent-canonicalize-only behavior (the parent is already confirmed inside root, and a fresh leaf can't be a symlink).  <!-- status: complete — leaf-symlink guard added; both runtime-reds now green, inside-pointing fence still green -->
  - [x] P1.2 Confirm the fix does not regress the other `resolve_within` consumers (`stat_file_core`, `delete_file_core`, `trash_path_core` all route through it) — their existing tests must stay green; `resolve_within_lexical` (create paths) is untouched.  <!-- status: complete — all stat/delete/trash/write/create tests green in the same run; resolve_within_lexical untouched -->
  - [x] verify-auto  <!-- status: complete — 550 lib + 6 integ + 1 shell-history green (0 fail); clippy --all-targets -D warnings + fmt clean; gap-2 test correctly commented (Phase-2 anchor) -->
  - [x] verify-self  <!-- status: complete — general-purpose subagent (no live surface; pure-fn backend): all 4 outcomes PASS (3 leaf-symlink tests green, clippy + fmt clean, wiring trace command→*_core→resolve_within intact for read/write/stat/delete/trash). No BLOCKING/COSMETIC. -->
  - [x] verify-human  <!-- status: complete — operator approved 2026-07-20 (pure-fn security-tightening, no live surface; consuming-surface check = editor_fs suite green ×2) -->
    - [x] P1.verify-human.1 Recorded consuming-surface check: editor_fs suite drives read_file_core/write_file_core directly — leaf-symlink escape rejected, inside-pointing still works.  <!-- status: complete — operator approved -->
  - [x] verify-codify  <!-- status: complete — 3 reproduce tests + 1 added pin (destructive_ops_reject_a_leaf_symlink_escaping_root_and_target_survives: proves the shared guard protects delete/trash, not just read/write). 551 lib + integ green; clippy + fmt clean. -->

- [x] Phase 2: Root-validation seam + AppHandle injection + doc-rewrite + close findings  <!-- status: complete — all impl + verify nodes done; P2.4 delete-on-resolve executed at ship -->

  **Observable outcomes:**
  - CLI: `cargo test --lib editor_fs::tests` exits 0 — `validate_root_rejects_a_root_not_in_the_known_project_list` now COMPILES and PASSES (known root honored, unknown root → `OutsideWorkspace`); all Phase-1 + pre-existing editor_fs tests still PASS.
  - CLI: `cargo test` (full lib + integ) exits 0 — 547+ tests green (no regression from the command-signature change).
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0; `cargo fmt --check` clean.
  - CLI: `pnpm test` (Vitest) exits 0 — `editorFileManagement.test.ts` source-guards still green (FE `invoke` unchanged); `pnpm tsc --noEmit` + `pnpm vite build` clean (no broken FE binding).
  - [x] P2.1 Add pure helper `validate_root(known_roots: &[PathBuf], requested_root: &Path) -> Result<PathBuf, EditorFsError>` in `editor_fs/mod.rs`: canonicalize `requested_root`; return `Ok(canon)` iff it equals or is a descendant of some canonicalized known root, else `OutsideWorkspace`. Unit-testable with no Tauri runtime (mirrors the existing pure-core convention).  <!-- status: complete — validate_root added; anchor test uncommented + green; +3 pins (descendant honored, stale-record skipped, non-existent-root Io error). editor_fs suite 41 pass. -->
  - [x] P2.2 Wire the six commands (`commands.rs`) to gain `app: AppHandle`, resolve `known_roots` from `config_store::read_projects(resolve_data_dir(&app)?)` mapped to their `.path`, call `validate_root(&known_roots, Path::new(&root))` before the file op. Keep the FE-facing param shape (`root`, `path`, `contents`) identical — `AppHandle` is injected, not passed. Map errors to `String` as today. (No dedicated create command — create is `write_file("")`, already covered.)  <!-- status: complete — shared validate_frontend_root(app, root) helper on all 6 commands; FE invoke() sweep confirms {root,path[,contents]} unchanged (AppHandle Tauri-injected); compiles + all gates green. -->
  - [x] P2.3 Rewrite the docs to the now-ENFORCED invariant: `editor_fs/mod.rs` module header (drop the "leaf symlink NOT followed-and-validated" + "root itself supplied by trusted frontend, not validated" accepted-gap language), the `resolve_within` doc (state the full-target canonicalize + re-check), and `commands.rs` module header (state `root` IS validated against the known project list).  <!-- status: complete — mod.rs module header + resolve_within doc + commands.rs header all restated to the enforced two-layer invariant. -->
  - [x] P2.4 Delete-on-resolve close both PARTIAL findings: remove `SURFACE-2026-06-19-QUALITY-WP2-RESOLVE-WITHIN-LEAF-SYMLINK` + `SURFACE-2026-06-19-QUALITY-WP2-BACKEND-TRUSTS-FRONTEND-ROOT` from `workflow/backlog-quality-findings.md` (and any coupled pointer in `backlog.md`); append one `**Backlog resolved:**` line each to `CHANGELOG.md` in the SAME commit-unit as the delete.  <!-- status: complete — executed at ship 2026-07-20: 2 **Backlog resolved:** lines added to CHANGELOG (with a **Feature shipped:** WP7 line); the `# m2-wp2-editor-shell` section (both finding bodies + header, its 3 MINORs already resolved) removed from backlog-quality-findings.md; the coupled pointer stub removed from backlog.md. CHANGELOG-then-delete invariant honored (record first, then delete). -->
  - [x] verify-auto  <!-- status: complete — editor_fs 41 pass (4 validate_root tests), clippy --all-targets -D warnings + fmt exit 0; full-suite (561 BE) + FE (1181 + tsc + vite build) confirmed clean in build. -->
  - [x] verify-self  <!-- status: complete — general-purpose subagent (no live surface; backend/wiring): all 5 outcomes PASS. Chain intact FE invoke {root,path} → cmd(app,root,path) → validate_frontend_root → validate_root → *_core; FE binding unchanged; doc-rewrite verified (5 gap phrases gone, enforced-invariant present). No BLOCKING/COSMETIC. CARRY: live/installed-.app IPC exercise (real read_file through running .app) is operator-only → rides next /release gate. -->
  - [x] verify-human  <!-- status: complete — operator approved 2026-07-20; live positive-path check CARRIED to next tauri:dev/release pass per operator + installed-build-verify-deferred-to-release. -->
    - [x] P2.verify-human.1 Live positive path (open/edit/save a file in a picked project — validate_root must NOT reject a real project's root).  <!-- status: complete — operator approved; live exercise carried to next tauri:dev/release pass -->
    - [x] P2.verify-human.2 Live negative path (unknown root rejected) — covered by validate_root_rejects_a_root_not_in_the_known_project_list unit test; manual optional, operator approved.  <!-- status: complete — unit-covered; operator approved -->
  - [x] verify-codify  <!-- status: complete — 4 validate_root tests + 1 added pin (validate_root_tolerates_a_non_canonical_form_of_a_known_root: `..`-laden + symlinked forms of a known root still validate — guards the false-positive-rejection risk flagged at verify-human). 556 lib + 6 integ + 1 green; clippy + fmt clean. -->

## Current Node
- **Path:** Feature > review-quality (complete) → finalize
- **Active scope:** review-quality COMPLETE — 0 CRITICAL / 0 MAJOR / 4 MINOR; MINORs auto-backlogged to backlog-quality-findings.md (`# editor-fs-backend-hardening — 2026-07-20`) + 1 pointer in backlog.md (F39). Next: /feature-finalize.
- **Blocked:** none
- **Unvisited:** finalize → **STOP for operator review** (per-WP check-in preference — do NOT auto-chain into WBS §Completion fold-back/delete).
- **Carry to next tauri:dev/release:** live IPC exercise (a real read_file/write_file confirming validate_root doesn't reject a legit open project + the installed-.app exercise) — operator-approved to carry, rides next /release gate per installed-build-verify-deferred-to-release.
- **Open discoveries:** none.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

## Reproduction Artifact
See `docs/product/backlog-paydown-2026-07-19-wbs.md` → WP7 → "Reproduction Attempt (2026-07-20)". Red tests live in `src-tauri/src/editor_fs/mod.rs` `#[cfg(test)]`: 3 gap-1 tests (2 runtime-red, 1 fence) + 1 gap-2 compile-gap test. These are the verify-codify anchor — "fixed" = all four green.

## Retrospect
- **What changed in our understanding:** The FE-caller sweep (done at plan time) collapsed the perceived "med-risk" of the AppHandle-injection: because `AppHandle` is Tauri-injected server-side and never passed from JS, the six-command signature change turned out to be **transparent to the frontend** — no `invoke` call changed and the `editorFileManagement.test.ts` source-guards stayed green. The risk that remained was purely the false-positive-rejection case (validate_root wrongly rejecting a legit project's root), which the canonicalize-both-sides design + the canonical-form-tolerance codify pin cover.
- **Assumptions that held:** the two reproduce reds pinned the exact defects (leaf-symlink leak/clobber; missing root-validation seam); `config_store::commands::resolve_data_dir` (pub(crate)) + `read_projects` (pub) were the ready-made server-side seam; the pure-`*_core` convention extended cleanly to a pure `validate_root`.
- **Assumptions that were wrong:** none material. One small surprise: the `--all-targets` clippy lint (`cloned_ref_to_slice_refs`) fired on the *test* code I uncommented — exactly the test-target lint class CLAUDE.md flags — caught only because the per-phase gate runs `--all-targets`, not `--lib`.
- **Approach delta:** matched the plan. Two extra codify pins beyond plan (destructive-ops guard in Phase 1; canonical-form tolerance in Phase 2) — both high-value, both directly guarding a flagged risk. P2.4 (delete-on-resolve) correctly deferred from build to ship.

## Communicate
**Feature complete:** editor_fs backend hardening (backlog-paydown WP7) has shipped — the editor's file-IO trust boundary is now fully enforced: a leaf symlink escaping the workspace root is rejected (was followed), and the frontend-supplied `root` is authenticated against the known project list before any read/write/stat/delete/trash/create is honored. Verify via `cargo test --lib editor_fs::tests` (all green, incl. the leaf-symlink + validate_root suites) or by opening/editing/saving a file in a real project through `pnpm tauri:dev`. Requester = operator — closure notice for self-record.

## Code-Quality Review — editor-fs-backend-hardening (backlog-paydown WP7)

*Reviewer: code-quality-reviewer subagent on the working-tree WP7 diff (uncommitted; HEAD 6f514d0). drive_mode=autopilot → 0 CRITICAL / 0 MAJOR / 4 MINOR → MINORs auto-backlogged (Case C, F39).*

### Strengths
- Two-layer safety model documented at the right altitude (mod.rs header states the invariant; `resolve_within` + `validate_root` each state their own step; commands.rs states "root is validated, not trusted") — a reader can reconstruct the trust boundary without the impl.
- `validate_root` is a pure Tauri-free helper matching the `*_core` convention → the security-critical decision is unit-testable against `TempDir`; the 6 `validate_root_*` tests exercise it directly incl. the false-positive-rejection fence.
- The `destructive_ops_reject_...` pin proves the shared guard protects delete/trash (names the refactor-regression it catches).
- Canonicalize-both-sides + component-wise `Path::starts_with` correctly neutralize macOS case-insensitivity, `..`/symlink spoof, and prefix-string-vs-ancestor.
- Not-yet-existing-leaf carve-out reasoned correctly + stated in prose.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [commands.rs:34-45] `validate_frontend_root` reads+parses `projects.json` and canonicalizes every known root on *every* read/write/stat/delete/trash/create call — a small per-call cost scaling with project count. Acceptable at single-user scale; worth a note in case a future watch/poll surface calls these in a tight loop (memoize known-roots behind config-store state). → auto-backlogged.
- [mod.rs:199] `OutsideWorkspace.root` set to literal `"<no known project>"` in `validate_root` reads slightly oddly (the requested root *is* the rejected thing). A future polish could use a distinct `UnknownRoot` variant so the UI distinguishes "root not a known project" from "file path escaped a valid root". → auto-backlogged.
- [mod.rs:434-497] The test block carries a stale compile-gap RED-phase comment paragraph ("intentionally fails to COMPILE…") directly above the live post-fix restatement — now historically inaccurate; trimming would remove a reader snag. Cosmetic. → auto-backlogged.
- [mod.rs:141] `resolve_within`'s `exists()`-then-`canonicalize()` has a benign, non-exploitable TOCTOU window (a swap-to-symlink race is re-validated by canonicalize+starts_with; broken-symlink → exists()=false → safe not-yet-existing path). No action; noted only because flagged. → auto-backlogged.

### Assessment
Well-built, disciplined hardening pass: closes two real trust-boundary gaps test-first, keeps the security decision in a pure unit-testable helper, lands the doc-rewrite atomically so the module's stated invariant now matches enforced behavior. FE `invoke` shape preserved by server-injecting `AppHandle` → med-risk confined to the Rust command layer. All flagged edge cases resolve correctly under the design; none rise to a finding. Only accrued debt is the per-call `projects.json` read + per-root canonicalize cost (acceptable at single-user scale, noted not fixed).

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before finalize archives the WIP.
