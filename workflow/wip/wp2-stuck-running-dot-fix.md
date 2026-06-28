# Feature: WP2 — Fix the stuck-Running status dot (cwd subdir resolve)

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-27
**Entry:** reproduce (bug-fix feature)
**Drive mode:** autopilot
**Milestone:** M6 (lead correctness item)

## Problem Statement

The status dot for a workspace stays stuck on `Running` after a CC turn has cleanly ended (false-positive on the core "needs me / is busy" signal). **Root cause pinned via WP1/WP1b prod telemetry (2026-06-27):** `WorkspaceRegistry::resolve_cwd` (`status_broadcaster/mod.rs:223`) resolves an event's cwd to a workspace by **exact canonical-path equality**. When CC's shell cwd has descended into a **subdirectory** of the workspace root at the moment a `Stop` (turn-end → idle) fires — e.g. `cwd=/Users/.../claudesk/src-tauri` while the workspace is registered under `/Users/.../claudesk` — the lookup misses (`resolved=none`), the event is dropped, and the idle transition never reaches the dot. The dot stays on its last *emitted* state (`Running`). Intermittent (~once/day) because it only triggers when the last shell cwd at turn-end is a subdir.

**Expected:** a `Stop`/`PostToolUse`/`UserPromptSubmit` event whose cwd is the workspace root OR any descendant of it resolves to that workspace, so the idle transition lands and the dot flips to Idle.

**Evidence:** `tmp/status-channel-snapshot-1782611136.log` — the offending turn at line 886:
`1782610920444 STATUS event=Stop cwd=/Users/stayman/Personal/projects/claudesk/src-tauri mapped=idle resolved=none outcome=dropped`
vs every prior root-cwd `Stop`: `resolved=ws-1 outcome=emitted`.

## Reproduction Attempt
**Surface chosen:** failing test (the bug lives in the pure `WorkspaceRegistry::resolve_cwd` — isolatable as a unit test, no Tauri runtime needed)
**Outcome:** reproduced
**Artifact:** `src-tauri/src/status_broadcaster/mod.rs` test `resolve_cwd_resolves_a_subdirectory_to_its_workspace` (red — currently fails: exact-match resolve returns `None` for a subdir cwd)
**Determinism:** every-run (deterministic — pure function, no timing/concurrency)
**Notes:** The fix is to make `resolve_cwd` match the cwd against the workspace root OR any ancestor (longest-prefix wins when workspaces nest). The existing `resolve_cwd_miss_returns_none` test (an unrelated dir → None) must keep passing — only true ancestors of a registered key resolve. Small/simple fix: one function, ≤~40 lines incl. the prefix walk + a couple of guard tests; no new data model, no endpoint, no arch decision. → F33 (plan).

## Work Tree

- [x] Phase 1: Ancestor-aware cwd resolution in `WorkspaceRegistry::resolve_cwd`  <!-- status: DONE -->>
  **Observable outcomes:**
  - CLI (Rust unit, the repro anchor): `cargo test --manifest-path src-tauri/Cargo.toml --lib status_broadcaster::tests::resolve_cwd` — the two currently-RED tests turn GREEN: `resolve_cwd_resolves_a_subdirectory_to_its_workspace` (a cwd of `<root>/src-tauri` and a deeper `<root>/src-tauri/src/status_broadcaster` both resolve to `ws-1`) and `resolve_cwd_nested_workspaces_longest_prefix_wins` (a cwd under an inner workspace resolves to the INNER id; a cwd under only the outer resolves to the outer). The pre-existing `resolve_cwd_hit_on_registered_path`, `resolve_cwd_miss_returns_none` (unrelated dir + nonexistent path → None), `resolve_cwd_canonicalizes_both_sides`, and `registry_generalizes_to_n_gt_1_no_cross_workspace_bleed` all STAY green (no regression — a sibling-but-not-ancestor dir must NOT resolve, e.g. `src-tauri-foo` must not match `src-tauri`).
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml --lib status_broadcaster` full module green; `cargo test … --lib` full suite green (282 = 279 + 2 repro + 1 guard).
  - CLI: `cargo clippy … --all-targets -- -D warnings` clean; `cargo fmt … --check` clean.
  - [x] P1.1 Rewrote `WorkspaceRegistry::resolve_cwd` from exact `by_path.get(&key)` to **ancestor / longest-prefix** matching: canonicalize the cwd, filter registered keys to those that are a path-ancestor of (or equal to) the cwd via the new `is_path_ancestor` (= `Path::starts_with`, component-boundary-safe), then `max_by_key(key.len())` for the nearest enclosing workspace. Canonicalize-both-sides + never-panic preserved.  <!-- status: DONE -->
  - [x] P1.2 Added `is_path_ancestor` helper (path-component matching, NOT raw string prefix) + rewrote the `resolve_cwd` doc comment (ancestor matching, longest-prefix-wins, boundary-safety, the WP2 prod-telemetry root cause). Callers unchanged — `drain_loop` (`commands.rs:117`) + `status_log` are signature-stable; a subdir cwd now logs `resolved=ws-1 emitted` automatically.  <!-- status: DONE -->
  - [x] P1.3 Added `resolve_cwd_sibling_with_shared_string_prefix_does_not_match` — a registered `<root>/src-tauri` must NOT resolve a cwd of `<root>/src-tauri-foo`; pins boundary-safety against a future regress to `str::starts_with`.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — scoped: status_broadcaster module 32 pass (resolve_cwd 6/6, 2 RED→GREEN + guard), clippy -D warnings clean, fmt clean -->
  - [x] verify-self  <!-- status: DONE — runner subagent: all 4 CLI outcomes PASS, 0 blocking. resolve_cwd 6/6 (2 repro RED→GREEN + boundary guard), status_broadcaster 32, full lib 282, clippy/fmt clean. LIVE dot-flip (real CC turn ending in a subdir → dot Idle in the installed/dev .app) is operator-only per CLAUDE.md backend-lifecycle corollary — CARRIED to verify-human. -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [x] verify-human  <!-- status: DONE (DEFERRED-TO-RELEASE) — operator (2026-06-27): live dot-flip can't be triggered consistently on demand (needs CC's cwd to be in a subdir at turn-end), so live confirmation is deferred to a patch release + real-use verification, per [[installed-build-verify-deferred-to-release]]. The WP1/WP1b prod telemetry self-confirms: a post-fix subdir-cwd Stop will log resolved=ws-N emitted (was dropped). Static slice (repro RED→GREEN, full suite, contract) all PASS. -->
    - [x] P1.verify-human.1 live subdir-turn dot-flip → DEFERRED-TO-RELEASE  <!-- status: DEFERRED-TO-RELEASE -->
    - [x] P1.verify-human.2 root-cwd regression check → DEFERRED-TO-RELEASE  <!-- status: DEFERRED-TO-RELEASE -->
    - [x] P1.verify-human.3 status-channel.log resolved=emitted confirmation → DEFERRED-TO-RELEASE  <!-- status: DEFERRED-TO-RELEASE -->
  - [x] verify-codify  <!-- status: DONE — 3 unit (resolve_cwd repro + nested + boundary guard) + 1 NEW consuming-surface integration test (hook_event_from_a_subdirectory_resolves_to_the_workspace, in commands.rs, through the same Mutex<WorkspaceRegistry> the drain_loop/register commands lock). Full lib suite 283 pass, clippy -D warnings + fmt clean. Live hook→socket→emit chain DEFERRED-TO-RELEASE. -->
- **State:** verify-codify (all phases complete)

## Current Node
- **Path:** Feature > Phase 1 > COMPLETE (all verify nodes done)
- **Active scope:** Phase 1 fully complete (single-phase feature) → ship
- **Patch-release plan (operator, 2026-06-27):** cut a patch release (v0.2.2) after the CURRENT WP6 concludes, carrying this WP2 fix; operator verifies the dot-flip in real use post-install. Do NOT release mid-WP6.
- **Blocked:** none
- **Unvisited:** Phase 1 verify group (verify-auto → verify-self → verify-human → verify-codify) — single phase
- **Open discoveries:** none
- **verify-codify anchor:** the repro tests `resolve_cwd_resolves_a_subdirectory_to_its_workspace` + `resolve_cwd_nested_workspaces_longest_prefix_wins` (RED now → must be GREEN after fix; the boundary-safety guard added at P1.3 joins them).

## Decision notes
- **Why longest-prefix (not first-match):** workspaces can nest (a monorepo package opened as its own workspace under an outer repo). A cwd inside the inner workspace must attribute to the inner one, not the outer — the nearest (longest) registered ancestor is the correct owner.
- **Boundary-safety is load-bearing:** must compare on path components / boundary char, not raw `str::starts_with`, or `/a/src-taurifoo` would falsely match `/a/src-tauri`. The P1.3 guard test pins this.
- **verify-self for this backend-lifecycle fix:** the live "dot flips Idle when a turn ends in a subdir" outcome is operator-only (needs the installed/dev `.app` + a real CC turn whose cwd is a subdir, per CLAUDE.md's backend-lifecycle verify-self corollary). The agent proves the fix statically (the RED→GREEN repro tests + full suite + clippy/fmt) and via the IPC-level `resolve_cwd` contract; the live installed-`.app` confirmation carries to verify-human / the next release (this is the very bug class the prod telemetry now self-captures, so a re-occurrence post-fix would re-surface in `status-channel.log` as `resolved=ws-N emitted`).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- none
