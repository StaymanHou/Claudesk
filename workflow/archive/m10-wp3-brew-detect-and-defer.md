# Feature: M10 WP3 — Install-source detection (brew detect-and-defer gate)

**Workflow:** feature
**State:** COMPLETED
**Created:** 2026-07-17
**Completed:** 2026-07-17
**Milestone:** 10 (in-app auto-updater)
**Drive mode:** autopilot

## Problem Statement

Claudesk's M10 self-update flow (`updater_check` / `updater_apply`) currently assumes it can always download → install → self-clear → relaunch. That is only true for a **direct-download** install (a real `/Applications/Claudesk.app`). A **Homebrew-cask** install is symlink-managed under `…/Caskroom/…`; if the updater self-installs into a brew-managed bundle it desyncs brew's version bookkeeping (brew still thinks the old version is installed → future `brew upgrade` breaks or reverts). **Locked decision (operator, 2026-07-06): brew → detect-and-defer** — a brew-managed install must NOT self-install; it detects the brew layout and points the user at `brew upgrade`; only direct-download installs self-update. WP3 adds the pure detection function + gates the WP2 flow on it. No persisted pref (that's WP4); this is a runtime path-shape decision only.

## Work Tree

- [x] Phase 1: Install-source detection + gate the update flow  <!-- status: [x] — all impl + verify nodes complete; 2 real-brew verify-human leaves DEFERRED-to-WP6 (operator-approved) -->  
  **Observable outcomes:**
  - CLI (unit): `cargo test -p claudesk install_source` passes — `install_source_from_bundle` returns `Homebrew` for a `…/Caskroom/claudesk/0.2.5/Claudesk.app`-shaped path, `DirectDownload` for `/Applications/Claudesk.app`, and `DirectDownload` (safe default) for a `None`/dev-binary path.
  - CLI (unit): a test pins that `updater_check` on a Homebrew source returns `install_source: "homebrew"` with a defer status string mentioning `brew upgrade`, and does NOT attempt a network `check()`.
  - CLI (build): `cargo build` + `cargo clippy --all-targets -- -D warnings` → 0 warnings; `pnpm tsc --noEmit` + `pnpm vite build` clean (frontend consumes the new `install_source` field).
  - CLI (grep — doc-drift fold): `grep -n "WP1 PROBE\|throwaway\|_check reports\|_run executes\|WP1 spike\|GO/FALLBACK verdict.*probe" src-tauri/src/lib.rs src-tauri/Cargo.toml` returns no matches inside the updater invoke-handler comment block or the updater dep comment (both reframed to production WP2/WP3 wording).
  - Browser (bridge verify-self): with the app running (dev = DirectDownload, not inside a `.app`), the `UpdaterTrigger` "Check for updates" path still reaches `updater_check` and returns a result carrying `install_source: "direct-download"` (dev never resolves to brew) — the gate does not regress the direct-download flow.
  - [x] P1.1 Add pure `install_source_from_bundle(bundle: Option<&Path>) -> InstallSource` + `InstallSource {Homebrew, DirectDownload}` enum to `updater/mod.rs` (a `/Caskroom/` path *segment* check on the canonicalized bundle path; `None`/unresolved ⇒ `DirectDownload` safe default). Reuse `resolve_bundle_path`. Add a thin `install_source() -> InstallSource` that resolves `current_exe()` → `resolve_bundle_path` → `canonicalize()` → the pure fn.  <!-- status: [x] — uses Path::components() (bounded segment), canonicalize with raw-path fallback -->
  - [x] P1.2 Unit-test the pure fn: Caskroom-shaped path ⇒ Homebrew; `/Applications` path ⇒ DirectDownload; `None` ⇒ DirectDownload; a path with "caskroom" only in a filename (not a dir segment) ⇒ DirectDownload (avoid false-positive substring match — match a `/Caskroom/`-bounded segment).  <!-- status: [x] — 7 tests: arm64+intel caskroom, /Applications, None, 2 substring false-positive guards, translocation -->
  - [x] P1.3 Gate `updater/commands.rs`: add `install_source: String` to `UpdateCheckResult` (`"homebrew"` | `"direct-download"`). In `updater_check`, if `install_source() == Homebrew` short-circuit BEFORE `updater.check()` (no network) → return `available_version: None`, `status: "Installed via Homebrew — run `brew upgrade claudesk` to update"`, `install_source: "homebrew"`. In `updater_apply`, if Homebrew return `Err(…brew upgrade…)` before any download/install (belt-and-suspenders: the UI won't call apply, but the command must refuse too).  <!-- status: [x] — BREW_DEFER_MSG const shared by check status + apply error; 3 command tests -->
  - [x] P1.4 Frontend: extend `UpdateCheckResult` interface in `UpdaterTrigger.tsx` with `install_source: string`; when `install_source === "homebrew"`, render the defer status (already carried in `status`) and do NOT show the "Update & relaunch" confirm button (the check short-circuits to `available_version: null` so the confirm branch already won't fire — assert this holds; add the field so WP4's polished UX has the seam).  <!-- status: [x] — field + isBrew state + updater-brew-defer note; confirm branch already gated on available_version -->
  - [x] P1.5 Doc-drift fold (WP2 MINOR findings, low): reframe the stale WP1-probe comment in `src-tauri/src/lib.rs` (the `updater::commands::*` invoke-handler block — dropped "WP1 PROBE / throwaway / `_check`/`_run` / GO/FALLBACK probe" → production wording) and the `tauri-plugin-updater`/`tauri-plugin-process` dep comment in `src-tauri/Cargo.toml` (dropped "WP1 spike wiring; WP2 rebuilds" → production). Also refreshed the `mod updater;` comment to mention WP3's install-source detection. Mark the 2 backlog findings resolved at finalize.  <!-- status: [x] — grep confirms no stale probe wording remains -->
  - [x] verify-auto  <!-- status: [x] — cargo test --lib updater: 15 pass; clippy --all-targets 0-warn; pnpm build (tsc+vite) clean 217 modules; doc-drift grep clean -->
  - [x] verify-self  <!-- status: [x] — LIVE via MCP bridge (com.claudesk.app.dev): updater_check + updater_apply both reached updater.check() network step (error "check: Could not fetch a valid release JSON from the remote") = DirectDownload branch, NOT the brew short-circuit/refusal → gate does not regress the direct-download flow. Real brew /Caskroom/ positive case carried to verify-human/WP6 (needs a real brew install). No integration-boundary regression: consuming surfaces (updater_check/updater_apply) behave exactly as WP2 on dev. -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [x] verify-human  <!-- status: [x] — operator approved 2026-07-17 the agent-verified slice (7 path-shape unit tests + 3 command tests + live bridge direct-download non-regression); the 2 real-brew leaves DEFERRED-to-WP6 per operator ("defer"). Agent-doable slice green; brew /Caskroom/ positive + App-Translocation carry to WP6 milestone-exit (needs WP5 pipeline). -->
    - [x] P1.verify-human.1: Confirm against the ACTUAL Claudesk cask layout on a real brew install (`brew --prefix`/`brew --caskroom` → the resolved `current_exe()` path contains `/Caskroom/`).  <!-- status: DEFERRED-to-WP6 (operator 2026-07-17 "defer"; needs a real brew install of an updater-capable build → WP6 milestone-exit; unit tests pin the path-shape logic meanwhile) -->
    - [x] P1.verify-human.2: Document the App-Translocation interaction (translocated bundle → randomized path → DirectDownload safe default → would attempt self-update; a properly-installed /Applications bundle is not translocated).  <!-- status: DEFERRED-to-WP6 (operator 2026-07-17 "defer"; documented in-plan; live confirmation at WP6) -->
  - [x] verify-codify  <!-- status: [x] — behavior TDD-codified at build: 15 updater tests (7 install_source path-shape incl. false-positive + translocation guards, 3 command, 5 pre-existing self-clear). Full suite green: 539 lib + 6 integ + 1120 FE, 0 fail. Throwaway UpdaterTrigger deliberately untested (WP4 deletes it — matches WP2 precedent); durable gate logic fully covered on the Rust side. -->
  - **State:** verify-codify (all phases complete)

## Current Node
- **Path:** Feature > review-quality (complete) → finalize
- **Active scope:** finalize (single-phase feature; ship + review-quality done. Review: 0 CRIT / 0 MAJOR / 3 MINOR auto-backlogged. WP3's P1.5 fold RESOLVED the 2 WP2 doc-drift findings — close them at finalize.)
- **Blocked:** none
- **Unvisited:** none (single-phase feature)
- **Open discoveries:** P1.verify-human.1 + .2 DEFERRED-to-WP6 (real-brew /Caskroom/ + App-Translocation; operator "defer" 2026-07-17; logged SURFACE-2026-07-17-M10-WP3-BREW-DETECTION-LIVE-DEFERRED)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

## Retrospect
- **What changed in our understanding:** Nothing structural — WP2 had already built the exact seam WP3 needed. `resolve_bundle_path` (WP2's self-clear core) turned out to be directly reusable for install-source resolution, so WP3 was a pure add (a classification fn + a short-circuit) with zero refactor of WP2. The one deliberate design refinement over the WBS spec: match a **bounded `/Caskroom/` path component** (`Path::components()`), not the substring `.contains("caskroom")` the naive reading implies — the false-positive class (a dir named `Caskroom-notes`) is real and cheap to guard.
- **Assumptions that held:** dev binary classifies DirectDownload (not inside a `.app` → `None` → safe default), confirmed live via the bridge — both `updater_check`/`updater_apply` reached the network `check()`, proving the brew branch didn't fire. The gate is a pure decision fn with no config_store/persistence needs (WP4 owns prefs). The `canonicalize()` step is the right place to resolve the /Applications→Caskroom symlink.
- **Assumptions that were wrong:** none. The one open question — whether a baked install-source marker fallback would be needed — resolved to "not needed" (path resolution is clean); revisitable at WP6 if the real brew layout surprises.
- **Approach delta:** implementation matched the plan exactly. The only additions beyond the literal WBS tasks were defensive: the belt-and-suspenders `updater_apply` refusal (the UI can't reach it, but the command refuses anyway) and the App-Translocation test/doc-comment (the safe-default already handles it correctly; documenting the tradeoff). The real-brew live verification was deferred to WP6 by operator decision (needs WP5's pipeline first).

## Code-Quality Review — m10-wp3-brew-detect-and-defer

**Result: 0 CRITICAL / 0 MAJOR / 3 MINOR** (Mode-3 autopilot — MINOR auto-backlogged to `workflow/backlog-quality-findings.md`; pointer in `workflow/backlog.md`). Reviewer assessment: "well-built, appropriately-scoped… advances the codebase and accrues no meaningful debt."

### Strengths
- Bounded path-*component* match (`Path::components() == "Caskroom"`) not `.contains("caskroom")` — the two false-positive guard tests prove the discipline.
- Safe-default bias (unresolved/translocated/canonicalize-fail ⇒ DirectDownload) well-reasoned + rationale in the enum doc-comment (wrong DirectDownload merely attempts an update; wrong Homebrew silently disables updates).
- Belt-and-suspenders `updater_apply` refusal (defense-in-depth, with a why-comment).
- Shared `BREW_DEFER_MSG` const guarantees check-status ≡ apply-refusal string; a test pins it names `brew upgrade`.
- Clean pure-core/IPC-shell split; pure fn exhaustively unit-tested (arm64+intel, /Applications, None, 2 substring guards, translocation).

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [src-tauri/src/updater/mod.rs:26-45] Module header `## Layout` list not extended to list the 2 new public fns (`install_source_from_bundle`, `install_source`) — doc-completeness gap in an otherwise carefully-maintained header.
- [src-tauri/src/updater/mod.rs:~181 vs ~194] Resolution asymmetry: `install_source()` canonicalizes the bundle path; WP2's `clear_own_quarantine` does not. Benign today (brew is gated out before `clear_own_quarantine` runs; direct-download has no symlink), but the divergence is unremarked — a one-line comment would prevent a wrong "unify these" refactor.
- [src-tauri/src/updater/commands.rs:196-211] `homebrew_source_short_circuits_to_defer_with_no_available_version` reconstructs the struct by hand (AppHandle dependency) — pins the shape, not that `updater_check` orders the short-circuit before the network `check()`. That invariant rests on code inspection + the live bridge verify-self. Honestly noted in the test comment.

### Assessment
Well-built, appropriately-scoped. Core gate logic is small, pure where it can be; classification correctness defended by design (bounded match, safe-default bias) AND a thorough test matrix anticipating the real edge cases. Doc-drift fold is behavior-neutral; throwaway UpdaterTrigger.tsx correctly leaves the real UX to WP4. Every non-obvious decision carries a why-comment. Only debt is cosmetic/documentary.

### If you disagree
Dismiss any finding by marking its line `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Notes
- **Dependency:** WP2 (updater core) — SHIPPED (`2592b2d`, local). Reuses `updater/mod.rs::resolve_bundle_path`.
- **Parallelizable with WP4** (user-control UX) and **WP5** (`/release` pipeline). Neither depends on WP3.
- **No config_store change** — WP3 is a runtime path-shape decision, not a persisted pref. WP4 owns `skipped_version` / `update_notifications_enabled`.
- **Verify posture (autopilot, backend-lifecycle feature):** the agent proves the pure fn + gate via `cargo test` (path-shape logic is fully unit-testable) + wiring via `tsc`/`vite build` + a live bridge verify-self of the direct-download path (dev is never brew). The REAL brew-install detection (needs a `/Caskroom/` install of an updater-capable build) is CARRIED to WP6's milestone-exit verify — per `SURFACE-2026-07-17-M10-WP1-LIVE-VERIFY-DEFERRED` (the real brew end-to-end is the operator's stated priority, gated on WP3+WP5 existing).
- **False-positive guard:** match a `/Caskroom/`-bounded path SEGMENT, not a bare `.contains("caskroom")` substring (a project dir literally named `Caskroom` or a file with "caskroom" in its name must not trip the gate).
