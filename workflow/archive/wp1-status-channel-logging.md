# Feature: WP1 — File-based status-channel logging (stuck-`Running` dot probe)

**Workflow:** feature
**State:** COMPLETED 2026-06-27 (WP1 + WP1b shipped; released v0.2.1)
**Created:** 2026-06-27
**Drive mode:** autopilot
**Milestone:** M6 (LEAD; must precede WP2)
**Type:** probe
**WBS:** `docs/product/wbs.md` → "## WP1: Probe — file-based status-channel logging"
**SURFACE:** `SURFACE-2026-06-25-STATUS-STUCK-RUNNING-AFTER-CLEAN-TURN-END` (prod-confirmed twice)

## Problem Statement
When a CC turn cleanly ends in the **installed/prod `.app`**, the status dot sometimes stays `Running` instead of flipping to `Idle` — a trust-eroding false-positive on the core "is busy / needs me" signal. A prior investigation hit a **no-logs wall**: the prod `.app` is launchd-launched with no visible stderr, and today the status path only logs on the error path (`drain_loop`'s `eprintln!` at `status_broadcaster/commands.rs:74,89`, the hook-socket accept errors). This is a **probe, not the fix** — its sole job is to make the operator's installed-build reproduction *diagnosable* by capturing a real on-disk telemetry trail that names *which* link in the chain fails: (a) the `Stop` hook event never arrives/drains (socket edge), (b) it arrives but its `cwd` resolves to no registered workspace (cwd-match miss — the prime suspect, given canonicalization across launchd's environment), or (c) it resolves + emits but the frontend doesn't render the Idle transition. WP2 then `/feature-reproduce`s against this evidence and fixes the named layer instead of guessing.

**Learning objective:** after one reproduction of the stuck dot against this telemetry, WP2 can name the failing link with evidence, not a guess.

## Key seams (confirmed by code read 2026-06-27)
- **`drain_loop`** (`src-tauri/src/status_broadcaster/commands.rs:62`) — holds the `AppHandle` (→ `app_data_dir()` reachable) and the registry. The per-event instrumentation point. **NOTE:** today it calls `to_update(&event, &reg)` which folds `event_to_state` + `resolve_cwd` into one `Option`, *hiding* whether a `None` was an unmapped event vs. a cwd-miss. The probe must log `event_to_state(&event)` and `reg.resolve_cwd(&event.cwd)` **separately** to distinguish (b) from a non-lifecycle event — that distinction IS the learning objective.
- **`StatusRegistry::register`/`resolve_cwd`/`deregister`** (`src-tauri/src/status_broadcaster/mod.rs:194,210,201`) + `canonical_key` (`mod.rs:226`) — the cwd-normalization seam, prime suspect for a match-miss in the launchd environment. Log the canonicalized key on register and on each resolve hit/miss.
- **`app_data_dir()`** — reachable via `app.path().app_data_dir()` (used at `lib.rs:187`, `hook_install/commands.rs:91`). **Per-identity isolated automatically**: prod → `com.claudesk.app/`, dev → `com.claudesk.app.dev/` (same mechanism as `settings.json` + `hook.sock`). No dev/prod branching needed — the log path follows the bundle identifier for free. Log basename e.g. `status-channel.log`.
- **Hook delivery edge** — `resources/claudesk-hook.pl` (`print $sock $line` at line 74) silently swallows a failed socket connect (by design — never block CC). The probe adds an opt-in write-failure trace so a *never-arrived* `Stop` (hook couldn't connect) is distinguishable from an *arrived-but-unresolved* one (drain log has the event but resolve missed).
- **Logger discipline** — best-effort, swallow-and-continue on IO failure, **never block the drain loop** (consistent with the existing error-path discipline; same posture as the Perl hook's "a down listener must never block CC").

## Work Tree

- [x] Phase 1: Backend file logger + drain/registry instrumentation  <!-- status: complete — all impl + all 5 verify nodes [x] -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk` (or the crate name) passes, including new unit tests for the log-line formatter (event name + raw cwd + resolved-id-or-`None` + state) and the best-effort "swallow IO failure" path (writing to an unwritable dir does not panic / does not propagate).
  - CLI: `cargo build` + `cargo clippy -- -D warnings` clean; `cargo fmt --check` clean.
  - CLI: in `pnpm tauri:dev` (dev identity), after opening a scratch workspace and driving one CC turn, `~/Library/Application Support/com.claudesk.app.dev/status-channel.log` exists and contains ≥1 line per status event with the four fields (event / raw cwd / resolved-workspace-id-or-`None` / emitted state). (Dev-tier confirmation the file is written + shaped right; the installed-`.app` confirmation is Phase 2's verify-human.)
  - Console: no new JS errors (backend-only change; frontend untouched).
  - [x] P1.1 Add a small file-logger helper (`src-tauri/src/status_log/mod.rs`): append-mode write of one formatted line to `<app_data_dir>/status-channel.log`; takes the resolved log path (injected → `TempDir`-testable); best-effort — IO error swallowed-and-continued, NEVER panics, NEVER blocks. Pure `format_event_line`/`format_registry_line` split out for unit testing. 6 unit tests incl. the swallow-IO-failure path.  <!-- status: complete -->
  - [x] P1.2 Instrument `drain_loop` (`commands.rs`): per drained `HookEvent`, log event name + raw `event.cwd` + `event_to_state(&event)` (mapped state) + `registry.resolve_cwd(&event.cwd)` (workspace-id or `None`) + `outcome=emitted|dropped`. `event_to_state` + `resolve_cwd` computed SEPARATELY from `to_update` (the emit's single source of truth) so the line distinguishes never-mapped from cwd-miss. Log path resolved once from `app_data_dir()` at thread start (`start_broadcaster`), plus a `broadcaster-start log=<path>` startup breadcrumb. Emit path unchanged (still `to_update`).  <!-- status: complete -->
  - [x] P1.3 Instrument the registry mutation sites — `workspace_register` / `workspace_deregister` commands (`commands.rs`) log a `REGISTRY op=… id=… raw=… key=<canonical>` line via `log_registry_mutation` (added `app: AppHandle` param — auto-injected, no frontend change). `canonical_key` exposed `pub(crate)` so the call site logs the SAME key the registry stores/resolves on — a register key that doesn't match a later Stop's resolved cwd is the cwd-match-miss smoking gun. Registry struct kept pure (logging at command sites, not inside `WorkspaceRegistry`).  <!-- status: complete -->
  - [x] P1.4 Log path + format documented below ("## Log path + format"); dev-mode live-write over a scratch-workspace CC turn is carried to verify-self (drive via the `tauri` MCP bridge).  <!-- status: complete -->

  **Log path + format (P1.4 — the operator's repro guide):**
  - **Path:** `<app_data_dir>/status-channel.log`, append-mode, per-identity:
    - prod (installed `.app`): `~/Library/Application Support/com.claudesk.app/status-channel.log`
    - dev (`pnpm tauri:dev`): `~/Library/Application Support/com.claudesk.app.dev/status-channel.log`
  - **Lines** (greppable, space-delimited `key=value`):
    - startup: `- STATUS broadcaster-start log=<resolved path>`
    - per event: `<ts_ms|-> STATUS event=<name> cwd=<raw> mapped=<running|idle|awaiting_input|none> resolved=<workspace_id|none> outcome=<emitted|dropped>`
    - registry: `- REGISTRY op=<register|deregister> id=<workspace_id|-> raw=<path> key=<canonical_key>`
  - **Reading the stuck-dot bug** (WP2's input): find the offending turn's `Stop` line. If `event=Stop mapped=idle resolved=none outcome=dropped` → **cwd-match miss** (compare its `cwd` against the workspace's `REGISTRY op=register … key=…` — a canonicalization divergence). If the `Stop` line is **absent entirely** → the hook never arrived/drained (socket edge — Phase 2's hook-write-failure trace confirms). If `outcome=emitted` but the dot stayed Running → **frontend render gap** (the backend did its job).
  - [x] verify-auto  <!-- status: complete — status_log 6/6, status_broadcaster 28/28, clippy -D warnings clean, fmt clean -->
  - [x] verify-self  <!-- status: complete — drove LIVE via tauri MCP bridge against pnpm tauri:dev (com.claudesk.app.dev). All Phase 1 outcomes PASS, no BLOCKING/COSMETIC: -->
    <!-- - startup breadcrumb line written to ~/Library/Application Support/com.claudesk.app.dev/status-channel.log (proves app_data_dir resolution + start_broadcaster wiring + file write end-to-end) -->
    <!-- - real PostToolUse event lines from live CC hook events: `STATUS event=PostToolUse cwd=.../claudesk mapped=running resolved=none outcome=dropped` (all 4 fields correct; demonstrates the cwd-miss diagnostic shape WP2 needs) -->
    <!-- - REGISTRY line on opening a workspace: `REGISTRY op=register id=ws-1 raw=.../scratch-b key=.../scratch-b` (log_registry_mutation + canonical key) -->
    <!-- - Console: no JS errors, no workspace_register/deregister failures (added app:AppHandle param is auto-injected, frontend invoke unchanged) -->
  - [x] verify-human  <!-- status: complete — operator ran pnpm tauri:dev on their own machine 2026-06-27; status-channel.log confirmed present + correctly shaped (2nd broadcaster-start, scratch-a REGISTRY line, UserPromptSubmit event). The initial `cat` "No such file" was unquoted-path shell-splitting on the space in "Application Support", not a missing file. -->
    - [x] P1.verify-human.1 consuming-surface ACK — operator accepts dev-build status-channel.log evidence (drain_loop + workspace_register telemetry) as sufficient for Phase 1; installed-.app + real-CC-turn confirmation deferred to Phase 2.  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete — coverage already strong (6 status_log unit tests: formatters emitted/cwd-miss/unmapped + register/deregister + append + swallow-IO; the existing end-to-end socket→transform test exercises the refactored drain loop). Added 1 codified test: state_label_matches_serde_snake_case_rendering (drift-guard pinning the log label ↔ serde rendering for all 4 variants). Full suite 273 pass, clippy -D warnings clean, fmt clean. drain_loop/command AppHandle-bound paths are live-verified (verify-self via bridge), not unit-testable without a Tauri app — the module's documented design property, same as the existing end-to-end test. -->

- [x] Phase 2: Hook-delivery-edge logging + installed-`.app` confirmation  <!-- status: complete — WP1b; all impl + all 5 verify nodes [x] -->
  **Observable outcomes:**
  - CLI: `cargo test` / `cargo clippy -- -D warnings` / `cargo fmt --check` stay clean after the hook-edge change.
  - CLI: the Perl hook still `exit 0` unconditionally with no socket present (the never-block-CC invariant) — manual: `echo '{"hook_event_name":"Stop","session_id":"s","cwd":"/p"}' | CLAUDESK_HOOK_SOCK=/nonexistent.sock perl resources/claudesk-hook.pl; echo $?` prints `0`.
  - **Installed `.app` (operator, verify-human):** build + install the prod `.app`, launch from Finder/Dock, open a scratch workspace, drive a CC turn to clean end, reproduce the stuck dot; `~/Library/Application Support/com.claudesk.app/status-channel.log` exists, is readable, and contains the lines covering the offending turn — sufficient for WP2 to name the failing link (event-absent / resolve-miss / emit-without-render).
  - [x] P2.1 Instrumented the hook delivery edge (`resources/claudesk-hook.pl`): on a failed socket open (else-branch), appends a best-effort `- HOOK write-failed event=<name> cwd=<cwd> sock=<path>` line to `status-channel.log` in the SAME per-identity dir (derived as `File::Basename::dirname($CLAUDESK_HOOK_SOCK)` = `app_data_dir` — no new env var). Wrapped in `eval`, exit 0 stays unconditional. Hook header doc synced. Verified: perl `-c` OK; exit 0 with no listener; write-failure line lands with correct shape; absent-env still no-op exit 0. Deploy path: `hook_install` overwrites the deployed copy from the bundled resource on every launch (dev + installed both pick it up on next launch / rebuild).  <!-- status: complete -->
  - [x] P2.2 Installed-`.app` log readability — verified AT THE v0.2.1 RELEASE: cutting the patch builds + installs the prod `.app`; the operator confirms `status-channel.log` writes under `com.claudesk.app/` at the release smoke-test (per [[installed-build-verify-deferred-to-release]]). The release IS this check.  <!-- status: complete (at release gate) -->
  - [x] P2.3 Live stuck-dot repro — DEFERRED to WP2-on-natural-occurrence. The bug is intermittent (~once/day, operator 2026-06-27) and CANNOT be forced; the probe ships in v0.2.1 and passively captures the offending turn when it next happens. That captured log IS WP2's `/feature-reproduce` input. Not a WP1/WP1b blocker.  <!-- status: complete (deferred to WP2 passive capture) -->
  - [x] verify-auto  <!-- status: complete — perl -c OK; exit 0 with no listener; write-failure trace lands correctly-shaped. No Rust changed this phase. -->
  - [x] verify-self  <!-- status: complete — agent-observable slice all PASS, no BLOCKING: -->
    <!-- - O2 failure path: no listener → exit 0 + `HOOK write-failed event=Stop cwd=... sock=...` line lands in the per-identity dir -->
    <!-- - normal path (live listener): exit 0, JSON event delivered to socket, NO write-failed line (trace fires only on the failure branch — no false positives) -->
    <!-- - absent-env: no-op exit 0 (unchanged) -->
    <!-- - Rust suite still 273 pass (Perl-only change, no regression) -->
    <!-- Boundary: present (the deployed CC hook script CC invokes); satisfied — CLI checks invoke the hook exactly as CC does. P2.2 (installed-.app readable) + P2.3 (live stuck-dot repro) are operator-only → verify-human. -->
  - [x] verify-human  <!-- status: complete — operator decision 2026-06-27: P2.2 verified at the v0.2.1 release gate; P2.3 deferred to WP2 passive capture (intermittent bug, can't force). Phase 2 / WP1b accepted. -->
  - [x] verify-codify  <!-- status: complete — no new codified test for WP1b: the deployed Perl hook has no test harness, and the never-block + failure-trace + no-false-positive behavior is verified by the verify-auto/verify-self CLI checks (invoking the hook exactly as CC does). Rust side unchanged (273 pass). -->

## Current Node
- **Path:** Feature > COMPLETE (both phases / WP1 + WP1b done)
- **Active scope:** none — WP1 (backend logging) + WP1b (hook-edge trace) both shipped + all verify nodes resolved. Ready to ship/finalize + cut v0.2.1 patch.
- **Blocked:** none
- **Unvisited:** none (WP2 is a separate WBS WP, blocked on natural bug occurrence)
- **Open discoveries:** SURFACE-2026-06-27-PIP-SUMMONS-EMPTY-WITH-NO-WORKSPACE-OPEN → PROMOTED to M6 WP9 in the WBS

## Retrospect
- **What changed in our understanding:** The probe earned its keep *immediately* — even during verify-self, the live dev log already showed the diagnostic shape (`event=… mapped=running resolved=none outcome=dropped`) from real CC hook events, proving the telemetry distinguishes cwd-miss from never-mapped before WP2 even starts. Bigger learning (operator, at verify-human): the stuck-dot bug is **intermittent (~once/day)**, not reproducible on demand — which retroactively *validates* the probe-first decision and reshapes WP2 from "reproduce + fix" into "wait for passive capture + fix." A forced-repro plan would have stalled.
- **Assumptions that held:** `app_data_dir()` per-identity isolation gives dev/prod log separation for free (no branching). The `tauri` MCP bridge drove live verify-self end-to-end (startup breadcrumb + event lines + REGISTRY line) — no carry-to-operator needed for the dev slice. Best-effort swallow-IO + never-block discipline transferred cleanly from the existing hook posture. `cargo fmt`'s auto-injected `app: AppHandle` param needs no frontend change (Tauri auto-injects).
- **Assumptions that were wrong:** The original WBS framed this as a single WP feeding a single WP2 reproduce step. Reality: it's two independently-shippable telemetry slices (backend + hook-edge → WP1 + WP1b), and WP2 is gated on a natural occurrence, not effort. Also: keeping `to_update` as the emit's single source of truth (rather than rebuilding the DTO from the decomposed parts) avoided a logic-duplication + dead-code clippy failure — the first inline-build attempt tripped `-D dead-code`.
- **Approach delta:** Plan said "instrument `drain_loop` + carry live repro to verify-human." Actual: drove dev verify-self fully via the bridge (richer than planned), and the installed-`.app`/live-repro outcomes resolved as release-gate (P2.2) + WP2-passive-capture (P2.3) rather than a per-feature operator repro — because the bug can't be forced. Phase 2 split out as WP1b at operator request.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-27] product:wbs — SURFACE-2026-06-27-PIP-SUMMONS-EMPTY-WITH-NO-WORKSPACE-OPEN → promoted to M6 WP9.

## Notes
- **Why a probe, not the fix:** instrument before diagnosing — designing the fix around an *assumed* failing link risks fixing the wrong layer (exactly the wall the prior investigation hit). The probe's output is WP2's `/feature-reproduce` input.
- **Phase split rationale:** Phase 1 is fully agent-verifiable (cargo test for the formatter + swallow-IO path; `tsc`/build clean; dev-mode log-write via the `tauri` MCP bridge driving a scratch workspace). Phase 2's success criterion REQUIRES the **installed `.app`** (launchd PATH/stderr environment) + the live stuck-dot repro — backend-lifecycle outcomes the agent can't observe, carried to operator verify-human per CLAUDE.md.
- **WP2 will likely demote this logging** to `#[cfg(debug_assertions)]` or env-gated once the bug is closed (so prod isn't writing a status log forever) — flagged in the WBS WP2 tasks; not WP1's concern.
- **Dev-vs-prod tell:** window title bar `Claudesk` vs `Claudesk (dev)`; log dir `com.claudesk.app/` vs `com.claudesk.app.dev/`.
- **Scratch workspaces** at `tmp/scratch/scratch-{a,b,c}` for any verify-self that spawns/drives a CC session (mandatory per CLAUDE.md once a check drives a status transition).
