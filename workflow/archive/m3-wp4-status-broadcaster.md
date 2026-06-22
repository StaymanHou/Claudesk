# Feature: M3 WP4 — Status broadcaster + WorkspaceStatusUpdate DTO + cwd→workspace mapping + Tauri emit

**Workflow:** feature
**State:** finalize (complete) — COMPLETED 2026-06-22
**Created:** 2026-06-22
**Milestone:** 3 (CC lifecycle & state plumbing)
**WBS ref:** `docs/product/wbs.md` → WP4
**drive_mode:** autopilot

## Problem Statement

WP3 lands a stream of parsed `HookEvent`s on an `mpsc::Receiver<HookEvent>` held (undrained) in `HookSocketState.receiver`. WP4 is the **central node** that turns that raw event stream into the single status signal every later surface (M4 filmstrip, M5 PiP, M6 menu-bar) subscribes to. It must: (1) **normalize** each `HookEvent` to a workspace state (`UserPromptSubmit`→Running, `Stop`→Idle, `Notification`→AwaitingInput; any other event → no-op); (2) **map** the event's `cwd` to a known open workspace's canonicalized project path (an event whose cwd matches no open workspace is dropped, not an error — reusing the M2 WP11 path-keying/canonicalization lesson); (3) build a `WorkspaceStatusUpdate { workspace_id, state, last_event_at, last_output_snippet? }` DTO with **snake_case-end-to-end** serde keys (pinned by a contract test, folding in `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`); and (4) **emit** it on the Tauri event channel as `app.emit("workspace-status", update)`. Workspaces that have produced no hook event default to `Unknown` (honest, not guessed — arch.md failure mode). WP4 also **deletes** the `#![allow(dead_code)]` in `hook_socket/mod.rs` (its removal owner) once the broadcaster drains the receiver and reads the event fields. The open-workspace *registration* (open→register, close→deregister) is WP6's wiring; WP4 defines the mapping fn + the registry seam and tests the mapping in isolation against a stub registry.

## Work Tree

- [x] Phase 1: Pure state-machine + DTO + cwd→workspace mapping (no IO)  <!-- status: done — all children [x]; full suite 178/178 -->
  **Observable outcomes:**
  - CLI: `cargo test --lib status_broadcaster` exits 0 — covers `event_to_state` for all 3 mapped events + unknown→no-op, cwd-match hit/miss/canonicalization, and the `WorkspaceStatusUpdate` serde-shape contract test.
  - CLI: a `#[test]` asserts `serde_json::to_value(&WorkspaceStatusUpdate{..})` yields exactly the keys `workspace_id`, `state`, `last_event_at`, and (when present) `last_output_snippet`, all snake_case — fails if any field is renamed/camelCased.
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0 with the new module present. The pure core is genuinely dead-code until Phase 2's drain thread consumes it, so Phase 1 carries a module-scoped `#![allow(dead_code)]` with a `// REMOVE in Phase 2` note (mirrors the WP3 pattern: removal owner = the consumer phase). Phase 2 deletes BOTH this allow AND the WP3 `hook_socket` allow when the broadcaster drains.
  - [x] P1.1 New `status_broadcaster` module: define `WorkspaceState` enum (`Idle | Running | AwaitingInput | Unknown`, snake_case serde) + pure `event_to_state(&HookEvent) -> Option<WorkspaceState>` (`UserPromptSubmit`→Running, `Stop`→Idle, `Notification`→AwaitingInput, other→`None` i.e. no-op)  <!-- status: done -->
  - [x] P1.2 Define `WorkspaceStatusUpdate { workspace_id: String, state: WorkspaceState, last_event_at: Option<u64>, last_output_snippet: Option<String> }` (`Serialize`, snake_case verbatim — NO `rename_all` drift; `last_event_at` from `HookEvent.timestamp`, `last_output_snippet` from `prompt`/`message` when present)  <!-- status: done -->
  - [x] P1.3 Define the workspace-registry seam: a `WorkspaceRegistry` (canonicalized project-path → `workspace_id`) with `register`/`deregister`/`resolve_cwd(&str) -> Option<String>`; `resolve_cwd` canonicalizes both sides (M2 WP11 lesson — symlinks/`.`/relative segments) and returns `None` on no-match (drop, not error). Also added the pure `to_update(&HookEvent, &WorkspaceRegistry) -> Option<WorkspaceStatusUpdate>` transform seam (the only un-testable line in P2 is the `app.emit` of its `Some`)  <!-- status: done -->
  - [x] P1.4 Tests: `event_to_state` (3 mapped + ≥1 unknown→None), `resolve_cwd` (exact hit, miss→None, non-canonical-path canonicalization hit), the DTO serde-key-shape contract test, `to_update` happy/drop paths. **14 tests, all green; clippy + fmt clean.** Module carries a scoped `#![allow(dead_code)]` (REMOVE-in-Phase-2 note) — the pure core has no consumer until P2's drain thread.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 14/14 status_broadcaster tests, fmt --check clean, clippy --lib -D warnings clean -->
  - [x] verify-self  <!-- status: done — subagent ran all 4 CLI outcomes: 14/14 tests, serde-shape contract present+passing, clippy -D warnings clean, fmt --check clean. 0 BLOCKING, 0 COSMETIC. No integration boundary (isolated new module). -->
  - [x] verify-human  <!-- status: done — AUTO-SKIPPED (F11) per drive_mode=autopilot: no integration boundary (isolated new module, nothing consumes it yet), verify-self all-PASS, no outcome cites a consuming surface. -->
  - [x] verify-codify  <!-- status: done — behavior already codified by the 14 P1.4 tests (no new tests needed; pure internal logic → unit tests correct). Full suite 178/178, 0 regressions. No integration boundary. -->

- [x] Phase 2: Drain the receiver + emit on the Tauri channel + delete the dead-code allow  <!-- status: done — all children [x]; full suite 180/180 -->
  **Observable outcomes:**
  - CLI: `cargo test` full suite exits 0 (≥164 prior + the new broadcaster tests); includes an end-to-end test that pushes `HookEvent`s through a bound socket (WP3 `bind_listener`+`spawn_listener`) and asserts the broadcaster's transform produces the expected `WorkspaceStatusUpdate`s for a registered cwd and drops an unregistered cwd.
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0 with the WP3 module-wide dead-code allow deleted from `hook_socket/mod.rs` (its receiver + `prompt`/`timestamp` fields now consumed by the broadcaster). NOTE: `status_broadcaster` carries 3 *item-scoped* `#[allow(dead_code)]` on `WorkspaceState::Unknown`, `WorkspaceRegistry::register`, `deregister` — genuinely WP6-owned (frontend initial value + workspace open/close wiring), each tagged with WP6 as removal owner. No module-wide allow remains anywhere in the WP3/WP4 surface.
  - CLI: `cargo build` exits 0 with the broadcaster drain wired into `lib.rs` `.setup()` after `start_on_launch` (the receiver is taken from `HookSocketState` and a drain thread spawned).
  - [x] P2.1 `start_broadcaster(app, Receiver<HookEvent>)` + `drain_loop`: spawn a dedicated drain thread that loops `rx.recv()`, locks the managed `SharedRegistry`, runs the pure `to_update` (`event_to_state` + `resolve_cwd`), and on a mapped+resolved event calls `app.emit("workspace-status", &update)`; a closed channel (`recv` Err) ends the thread cleanly; emit-failure logged, never swallowed  <!-- status: done -->
  - [x] P2.2 `init_registry() -> SharedRegistry` + `app.manage(...)` in setup so the drain thread (`try_state`) and a future WP6 register/deregister command share one instance; registry **empty at launch** (WP6 wires open→register), seam exposed  <!-- status: done -->
  - [x] P2.3 Wired `start_broadcaster` into `lib.rs` `.setup()` immediately after the `start_on_launch` Ok-arm (only starts the drain when the listener bound; takes the receiver from `HookSocketState.receiver` — the WP3→WP4 seam); lock/take failures logged to stderr, never swallowed  <!-- status: done -->
  - [x] P2.4 Deleted the WP3 module-wide `#![allow(dead_code)]` from `hook_socket/mod.rs`; clippy clean. The honest residual (WP6-owned `Unknown`/`register`/`deregister`) is covered by 3 item-scoped allows naming WP6 as owner — NOT a re-added module allow. See [NOTE-2026-06-22] in Discoveries.  <!-- status: done -->
  - [x] P2.5 End-to-end test (`commands::tests::end_to_end_socket_to_transform_…`): bind a temp socket (WP3 `bind_listener`+`spawn_listener`), register a workspace path, write 3 lines through the real socket (registered-cwd UserPromptSubmit→Running emitted, registered-cwd Notification→AwaitingInput emitted, unregistered-cwd Stop dropped); assert exactly 2 `WorkspaceStatusUpdate`s via the pure `to_update` the drain thread calls (emit is `AppHandle`-bound plumbing, not unit-tested). Plus `init_registry_starts_empty`.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — commands tests 2/2, clippy --all-targets -D warnings clean (allow-deletion + targeted allows correct, lib.rs wiring typechecks), fmt --check clean -->
  - [x] verify-self  <!-- status: done — subagent ran all 4 CLI outcomes: full suite 180/180 (incl. the end-to-end socket→transform test), clippy --all-targets -D warnings clean (WP3 module allow deleted, exactly 3 WP6-owned item allows), cargo build typechecks the lib.rs setup wiring, fmt clean. 0 BLOCKING, 0 COSMETIC. No integration boundary (additive background thread + new event channel nothing consumes yet). -->
  - [x] verify-human  <!-- status: done — AUTO-SKIPPED (F11) per drive_mode=autopilot: no integration boundary (additive drain thread + new `workspace-status` event nothing subscribes to yet — WP6 adds the frontend listener + the live real-claude→emit close-the-loop verify-human per the WBS), verify-self all-PASS, no outcome cites a consuming surface. The strongest WP4-boundary check is the automated end-to-end socket→transform test. -->
  - [x] verify-codify  <!-- status: done — behavior already codified by P2.5's end-to-end socket→transform test + init_registry test + Phase 1's 14 transform tests (no new tests; the only uncoverable line is the AppHandle-bound emit, a Tauri one-liner — live close-the-loop deferred to WP6 per WBS). Full suite 180/180, 0 regressions. No integration boundary. -->

## Current Node
- **Path:** Feature > ship + review-quality COMPLETE → finalize
- **Active scope:** Shipped (`8bc2d68`). Review-quality done: 0 CRIT / 0 MAJ / 3 MINOR (auto-backlogged → SURFACE-2026-06-22-QUALITY-WP4-MINORS). Next: `/feature-finalize`
- **Blocked:** none
- **Unvisited:** none — ship remains
- **Open discoveries:** [NOTE-2026-06-22] targeted-allow refinement (build decision, not a backlog SURFACE)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[NOTE-2026-06-22] Phase 2 — The plan said "delete the dead-code allow." Reality: deleting the WP3 module-wide allow surfaced that `WorkspaceState::Unknown` (frontend initial value, never emitted by the backend) and `WorkspaceRegistry::register`/`deregister` (wired by WP6's workspace-open/close) are *genuinely* still dead until WP6. Resolved more honestly than a re-added module allow: 3 **targeted** `#[allow(dead_code)]` on exactly those items, each naming WP6 as removal owner + noting they're exercised by WP4's tests. The WP3 `hook_socket` module allow IS fully deleted (its receiver + prompt/timestamp fields are now live via the broadcaster). Net: no module-wide allow remains anywhere in the WP3/WP4 surface; only item-scoped WP6-owned allows. Not a backlog SURFACE — it's a build-decision note for the reviewer/WP6.

## Retrospect
- **What changed in our understanding:** Deleting the WP3 module-wide dead-code allow (a planned WP4 acceptance item) surfaced that not *everything* the broadcaster touches becomes live at WP4. `WorkspaceState::Unknown` (a frontend-default value the backend never emits) and `WorkspaceRegistry::register`/`deregister` (wired by WP6's workspace open/close) are genuinely dead until WP6. The plan's "delete the allow" was right in spirit but underspecified — the honest landing was a *targeted* allow on exactly those three WP6-owned items, not a re-added module allow. The reflection-learning "dead-code allow removal owner = the consumer WP" generalizes: the owner is the consumer *of each specific item*, which can be a later WP than the one that deletes the broad allow.
- **Assumptions that held:** The WP3→WP4 seam was exactly as designed — a parsed `HookEvent` stream on `HookSocketState.receiver: Mutex<Option<Receiver>>`; `take()` + a dedicated drain thread (the blocking-recv-on-a-thread shape, mirroring WP1's listener verdict) was the clean owner. The pure-transform factoring (`to_update` holds all logic, `app.emit` is the one untestable line) let the end-to-end test exercise the real WP3 socket plumbing without a Tauri app. The M2 WP11 canonicalization pattern transferred directly to cwd→workspace matching.
- **Assumptions that were wrong:** None material. The only plan/reality delta was the targeted-vs-module allow (above), caught at the first clippy run and resolved within the same build step.
- **Approach delta:** Implementation matched the plan's two-phase shape (pure core → runtime wiring) exactly. The one refinement: 3 item-scoped allows replacing the planned single allow-deletion, documented as `[NOTE-2026-06-22]` and folded into the WBS shipped-notes + CLAUDE.md.

## Communicate
> **Feature complete:** M3 WP4 (status broadcaster) has shipped. Claudesk now drains the parsed CC-hook event stream and emits a normalized `WorkspaceStatusUpdate { workspace_id, state, … }` on the `workspace-status` Tauri event — the single signal the M4/M5/M6 status surfaces will subscribe to. Verify via `cargo test` (180/180, incl. the end-to-end socket→transform test); the live real-`claude`→UI close-the-loop arrives at WP6 when the frontend listener + workspace registration land.

Requester = operator — closure notice for self-record.

## Code-Quality Review — m3-wp4-status-broadcaster

Reviewed on ship commit `8bc2d68` by `code-quality-reviewer`. **0 CRITICAL / 0 MAJOR / 3 MINOR.** Verdict: well-built, no refactor warranted; the 3 MINORs are cosmetic docstring drift.

### Strengths
- Pure/impure split is exemplary: `to_update` / `event_to_state` / `WorkspaceRegistry` hold all logic with zero `AppHandle` coupling, leaving exactly one untestable line (`app.emit`), exercised directly by the test suite.
- Honest-state discipline preserved end-to-end: unmapped event / unresolved cwd dropped (never guessed), `Unknown` never emitted from an event, tied back to arch.md + the never-infer-from-PTY invariant.
- Serde-shape contract test pins the exact wire key set + snake_case enum rendering, genuinely closing `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`.
- Dead-code-allow handling is the right call: WP3 module-wide allow fully deleted; 3 residuals item-scoped with WP6 named as removal owner + rationale; `[NOTE-2026-06-22]` documents the plan deviation transparently.
- Lock-then-drop-before-emit discipline correctly avoids holding the registry mutex across `app.emit`; poisoned-lock recovery via `into_inner()` keeps the drain thread alive.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [commands.rs:43-47] `start_broadcaster` docstring describes a `Result`-style error contract ("errors returned as a human-readable string… receiver-already-taken") but the signature returns `thread::JoinHandle<()>` with no error channel — the double-start check actually lives in `lib.rs`. Doc drifted from signature.
- [commands.rs:48-53] `start_broadcaster` uses `.expect()` on the thread spawn (a non-test panic path) — mirrors WP3's `spawn_listener` precedent but is borderline vs the "no unwrap outside tests" convention. Consistent with WP3; flagged for convention-consistency only.
- [commands.rs:41-42] Docstring says the caller "may hold or detach" the JoinHandle, but `lib.rs` discards it (detached) while WP3's listener retains `_handle` in `HookSocketState`. Asymmetry is correct (drain thread self-terminates on channel close) but undocumented — a one-line "detached — exits on channel close" note would close the gap.

### Assessment
Well-built; advances the codebase cleanly. Textbook "pure core, thin runtime shell" — every piece of logic unit-tested, the one IO-bound line isolated and acknowledged, the end-to-end test exercising real WP3 socket plumbing through the transform without a Tauri app. Honors the load-bearing conventions and documents the item-scoped-allow deviation. Only debt is cosmetic docstring drift. No refactor warranted; the 3 MINORs are backlog-or-dismiss material.

### If you disagree
Dismiss any finding by marking it `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Design notes (grounding, read at build)
- **Receiver hand-off (the central wiring decision):** WP3 holds `HookSocketState.receiver: Mutex<Option<Receiver<HookEvent>>>`. WP4's `start_broadcaster` does `state.receiver.lock().unwrap().take()` to own the receiver, then spawns a `std::thread` draining it (mirrors WP3's blocking-thread discipline — the `mpsc::Receiver` blocks on `recv`; a thread is the simplest correct owner, consistent with WP1's listener verdict). The drain thread holds a cloned `AppHandle` for `emit`.
- **Pure transform seam for testability:** factor `fn to_update(&HookEvent, &WorkspaceRegistry) -> Option<WorkspaceStatusUpdate>` (state-map + cwd-resolve + DTO-build) so the only un-unit-testable line is the `app.emit`. Tests exercise `to_update` directly; the drain thread is `loop { recv → to_update → if Some, emit }`.
- **`workspace_id`:** M3 is single-workspace, but the DTO/registry are built for N>1 (project convention "design for N=1 with N>1 in mind"). `workspace_id` = the registry's id for a project path; the registry maps canonicalized `cwd` → `workspace_id`. WP6 supplies the actual ids at workspace-open.
- **Canonicalization:** reuse the M2 WP11 pattern (`git_status/mod.rs:115` — canonicalize both sides, tolerate canonicalize failure by falling back to no-match/drop, never panic). A `cwd` that no longer exists on disk → canonicalize fails → treated as no-match (dropped).
- **`Unknown` default:** the broadcaster never *emits* `Unknown` from an event (an event always maps to Idle/Running/AwaitingInput or is dropped). `Unknown` is the *initial* state a surface shows for a workspace before any event arrives — owned by the frontend default (WP6) and noted in the DTO/state enum as the honest-no-data value. WP4 defines the `Unknown` variant; it is the registry/frontend default, not an event output.
- **Backlog:** `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE` is closed by P1.4's serde-shape contract test. Candidate arch.md convention note at finalize: "IPC DTOs are snake_case end-to-end; frontend types mirror the serde field names verbatim."
- **Out of scope (WP5/WP6):** the `.session.md` file-watcher as a second input source = WP5; the workspace open→register/close→deregister wiring + the frontend listener/indicator = WP6. WP4 stops at "a mapped event is emitted on `workspace-status`."
