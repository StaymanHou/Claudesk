# Feature: M9 WP6.5 — Session-termination model (measure session END, don't infer it)

**Workflow:** feature
**State:** COMPLETED 2026-07-08 — shipped + review-quality clean (0C/0M/2 MINOR backlogged) + finalized. Code local-only/uncommitted per commit-only-when-asked (batched with the M9 tree for the operator's push).
**Created:** 2026-07-08
**Entry:** spec (complex feature — new data-model semantics + multi-signal fusion + historical migration)
**Milestone:** M9 (time-analytics panel)
**Drive mode:** autopilot

## Problem Statement

The time tracker has **no concept of session termination**. A viz-session's window is
`[first event ts, last event ts]` (`time_store/query.rs::build_viz_session`), where "end"
is simply the timestamp of the session's *last hook event*. Nothing records that a
session was **closed, crashed, or lost to a power outage** — so a dead session is
indistinguishable from a live one that is merely idle.

Concretely (operator, WP6a verify-human 2026-07-08): scratch-b rendered **10:54 → 13:42**
with no live scratch-b workspace. The trailing gap (from real last-activity to the last
stray event) classifies as `away`, and the session's `end` sits at 13:42 — so the row
reads as a session that was "effectively running all day." This corrupts **every**
duration/away/longest-session number the dashboard reports:
- `session_active_ms` / "longest session" treat a corpse as a long paused-but-alive block.
- Trailing `away` time is credited against a session that no longer existed.
- Day totals (active vs away vs session span) are all downstream of a wrong `end`.

**Root cause:** CC hooks fire on *activity*. There is no observed *teardown* event in the
current derivation, so app-kill / CC-crash / power-outage / clean-`/exit` all look
identical to "idle." The fix is **upstream of the WP6a dashboard** — it lives in the WP2
hook writer (`time_store`) + the WP3 reclassifier / WP4 query layer (how `end` and the
trailing state are derived). The dashboard only *renders* what the query layer produces;
it is NOT a dashboard bug.

**Prior-art note (important, narrows the work):** `SessionEnd` is **already registered**
(`hook_install::CLAUDESK_EVENTS`, WP2's 4→10 extension) and **already persisted** as an
`events` row by `time_store` when tracking is ON. What is missing is that **nothing
*consumes* it** — `build_viz_session` still bounds the window at first→last *any* event,
ignoring whether a `SessionEnd` (or an explicit close) marks the true end. So signal (3)
below is partly free on the write side; the gap is on the read/derive side.

## User Stories

- As the operator reviewing the day-view, I want a session that I closed / that crashed to
  end its row at its **true termination time**, not stretch to the last stray event, so the
  timeline reflects reality.
- As the operator, I want the dashboard's duration / away / longest-session numbers to be
  **trustworthy** — a dead session must not inflate active-time or away-time.
- As the operator, I want a session left dangling by a **crash or power outage** to
  **self-heal** on the next Claudesk launch (closed out at its last-seen event), with no
  manual cleanup.
- As the operator, I want a genuinely-idle-but-**alive** session to **not** be prematurely
  cut off — a long think/lunch break on a live session is not a termination.

## Operator-locked decisions (spec review, 2026-07-08)

- **D2 — max-idle cap N = 30 min.** A session with no end marker and no events for 30 min of
  total silence is treated as terminated at its last real event. Comfortably above the
  10-min `AWAY_THRESHOLD_MS`/`SILENCE_CAP_MS` so a lunch/think break on a LIVE session stays
  one session (AC3). Hardcoded constant in `reclassify::constants`, no user setting.
- **D4/D5 — read-time capping is the correctness mechanism.** The cap + late-event guard are
  applied in the reclassifier/query layer when building the window. Historical dangling rows
  self-fix with zero backfill (AC8); idempotent, reversible. Dangling-session detection is
  **pure-DB inference** (no persisted open-session set). Startup write-marker (signal 4 as a
  real write) is **belt-and-suspenders only** — read-time capping already delivers
  correctness; the launch-time explicit marker is an optional cleanliness step, low priority.
- **Routing — research first (F3).** Confirm `SessionEnd` firing behavior via a live
  hook-stream capture before committing the plan (see the empirical Open Question).

## The four fused signals (operator-chosen 2026-07-08 — all four)

The spec's job is to fuse these into ONE coherent session-end model, resolving how they
interact. Each is listed with its role and where it lands in the code.

1. **Explicit end on workspace close** (authoritative, clean-close case). Claudesk *knows*
   when it tears down a workspace / kills a PTY (`closeWorkspace` → per-pane `cc_kill`; and
   `WindowEvent::CloseRequested` → `SessionRegistry::kill_all` on app quit). On that path,
   write an explicit **session-end marker** into `time_store` for the affected
   session(s). A clean close is then recorded exactly.

2. **Max-idle cap** (crash / outage bound, reclassifier-side). After **N** minutes with no
   events of any kind for a session, its `end` is capped at *last-seen event + (nothing
   further)* — i.e. the window does **not** extend past the last real event, and the
   trailing region beyond the cap is NOT credited as session time. This bounds a session
   that died without an explicit marker (the app was force-quit, CC segfaulted).

3. **CC `SessionEnd` hook** (authoritative if it fires). Already registered + persisted;
   make the derivation **honor** it as the session's true end when present. **Its
   real-world firing behavior is the one empirical unknown** (see Open Questions / the
   reproduce task) — must be confirmed by a live hook-stream capture before the model
   *depends* on it as the primary signal. If it fires reliably on `/exit`/close, it is the
   cleanest signal and largely subsumes (1) for the clean-close case; if it does NOT fire
   on abrupt teardown (expected — a crash can't emit a hook), (1)/(2)/(4) cover the rest.

4. **Startup reconciliation** (power-outage self-heal). On app launch, find sessions left
   **dangling** from a prior run (open, no end marker, last event older than the cap) and
   close them out (`end` = last-seen event ts). The power-outage case — where neither an
   explicit marker (1) nor a `SessionEnd` (3) could ever have been written — self-heals.

## Acceptance Criteria

The feature is done when:

- **AC1 — clean close ends exactly.** Closing a workspace (or quitting Claudesk) writes an
  explicit end marker; that session's rendered row ends at the close time, not at a later
  stray event, and no trailing `away` is credited past the close.
- **AC2 — crash/outage is bounded.** A session with no end marker whose last event is older
  than the max-idle cap N renders ending at its **last real event**, not stretched to the
  day-window edge or to a stray late event; its trailing region is not counted as session
  time.
- **AC3 — live-idle is preserved.** A session that is genuinely idle but still alive (a real
  `SessionEnd`/close has NOT occurred and events are within the cap, OR it is the current
  live session) is **not** prematurely terminated. A lunch-break gap on a live session
  still reads as one session, classified by the existing gap machine (Typing/Reviewing/
  Away), not truncated.
- **AC4 — self-heal on launch.** After a simulated crash/outage (dangling open session in
  the DB), the next launch's reconciliation closes it out at its last-seen event; a
  subsequent day-view render shows the correct bounded row.
- **AC5 — `SessionEnd` honored (CONFIRMED present, per research).** CC fires `SessionEnd` on
  every clean/graceful close — `/exit`, Claudesk's `/exit`-then-SIGKILL `cc_kill`, and SIGTERM
  — and NOT on bare SIGKILL / crash / power-loss (live-captured 2026-07-08). The derivation
  uses `SessionEnd` as the authoritative end when present; its **absence on a hard-kill/crash
  is expected and handled by signals 1/2/4**. The end-derivation does not branch on `reason`
  in v1, but the plan reads `reason` into `meta` for future debugging.
- **AC6 — precedence is deterministic & tested.** When signals disagree (e.g. an explicit
  close marker exists AND a later stray event arrives for the same session; or a
  `SessionEnd` precedes a late `Notification`), the resolved `end` follows the documented
  precedence rule (below) and is pinned by a unit test.
- **AC7 — no double-definition of "idle."** The max-idle cap N and the reclassifier's
  existing `AWAY_THRESHOLD_MS` / `SILENCE_CAP_MS` (both 10 min) are reconciled: the spec
  states the relationship explicitly so "session-ended" and "human-away" are not two names
  for the same threshold applied inconsistently.
- **AC8 — historical rows migrate.** Already-dangling historical sessions (written before
  this feature) render correctly after the change — either via the same reclassifier-side
  cap/reconciliation applied at read time, or a one-time backfill. The dashboard's
  numbers for past days become trustworthy without the operator re-recording anything.
- **AC9 — toggle-OFF unaffected.** With the WP5 tracking toggle OFF, the end-marker write
  path is gated off exactly like every other `time_store` write (zero storage/IO), and the
  live status dots are byte-unchanged (the end marker is a `time_store` concern, never a
  `status_broadcaster` concern).

## Design decisions to resolve in this spec (the interactions)

These are the substantive spec decisions — each needs a locked answer before `/feature-plan`.

### D1 — Explicit-end representation: new `event` value vs. new column.
The `events` table is `(ts, session_id, cwd, event, tool_name, agent_type, source, meta)`.
**Lean: a new `event` value** (e.g. `"WorkspaceClose"`) on a `source = "claudesk-native"`
row, NOT a new column. Rationale: it fits the existing WP2.5 `NativeSignal` shape (a new
enum variant → `native_row`), needs no schema migration, and the reclassifier already reads
`event` strings. A new column would touch the schema, the DDL, `event_to_row`, `native_row`,
and every SELECT. *(Confirm against WP2.5's `NativeSignal` enum — this is a 5th variant.)*
**[decision needed: confirm event-value approach + the exact event string]**

### D2 — Max-idle cap N vs. the away threshold (the AC7 reconciliation).
The reclassifier already has `AWAY_THRESHOLD_MS = 10 min` (a *human* gap becomes `away`
after 10 min silent) and `SILENCE_CAP_MS = 10 min` (working-credit expires). These classify
**within** a live session window. The max-idle cap is a **different axis**: it decides
whether the **session itself has ended**, not how to color a gap inside it. Proposed
relationship:
- **They are distinct and the session cap is looser.** A session does not "end" the instant a
  gap turns `away` — a 10-min bathroom break is `away` but the session is still alive. The
  session-termination cap N should be **substantially larger** than 10 min (proposed
  **default N = 30 min** of total silence with no end marker → treat as terminated at
  last-seen event). This keeps AC3 (live-idle preserved) from colliding with AC2.
- **Hardcoded constant, no user setting** — consistent with the WP3 operator-locked-threshold
  design-prior (`explicit-selectable-mode-over-inferred-mode`; a setting is bug surface the
  operator declined). Lives in `reclassify::constants` next to the existing two.
**[decision needed: lock N. Proposed 30 min. Operator confirms at spec review.]**

### D3 — Precedence when signals disagree (AC6).
Proposed total order for resolving a session's `end`:
1. **Explicit end marker (1)** — if a `WorkspaceClose` row exists, the session ended then.
   Authoritative: Claudesk *observed* the teardown.
2. **`SessionEnd` hook (3)** — if present and no explicit marker, it is the end.
3. **Max-idle cap / reconciliation (2)+(4)** — if neither marker exists and the last event is
   older than N, end = last-seen event ts.
4. **Live / within-cap** — otherwise the session is alive; end = last event ts (today's
   behavior), classified by the gap machine.
- **Late-event-after-end guard:** a stray event arriving *after* an explicit close marker or
  `SessionEnd` (e.g. a delayed idle `Notification`) does **not** reopen the session — events
  past the resolved end are ignored for that session's window. *(This is the specific
  10:54→13:42 defect: the late 13:42 event must not extend a session ended earlier.)*
**[decision needed: confirm the 4-level order + the late-event guard.]**

### D4 — Cap/reconciliation applied at READ time vs. a WRITE-time backfill (drives AC8).
**Lean: apply the cap + reconciliation logic at READ time** (in the reclassifier / query
layer, when building the window), NOT a destructive DB rewrite. Rationale:
- Historical dangling rows are fixed automatically (AC8) with no backfill migration — the
  same read-time rule bounds old and new sessions identically.
- Idempotent, reversible, no risk of a bad one-time migration corrupting real rows.
- Startup reconciliation (4) then becomes *optional-but-nice*: if read-time capping already
  bounds dangling sessions, a launch-time write of an explicit end marker for known-dead
  sessions is a **cleanliness/consistency** step (so the row stream itself is honest), not a
  correctness prerequisite. **[decision needed: is startup reconciliation a real WRITE (mark
  dead sessions) or does read-time capping make it redundant? Proposed: read-time capping is
  the correctness mechanism; startup writes an explicit marker only for sessions that were
  open at the last known-alive workspace set — belt-and-suspenders, low priority.]**

### D5 — "Which sessions are dangling at startup?" (the reconciliation input).
To close out dangling sessions at launch (4), we need to know which `session_id`s were
"open." Options: (a) infer purely from the DB (any session whose last event is a
non-terminal event older than N and has no end marker → dangling); (b) cross-reference a
persisted "open workspaces" set. **Lean: (a) pure-DB inference** — no new persisted state,
and it composes with D4's read-time cap (same predicate). **[decision needed: confirm pure-DB
inference; reject persisting an open-session set as new state we don't want.]**

## Out of Scope

- **Any change to the live status surfaces** (filmstrip / PiP / menu-bar). Session
  termination is a *retrospective analytics* concern; the live dots already reflect real
  process state via `status_broadcaster`. The end marker never touches `event_to_state`.
- **Re-architecting the reclassifier's human gap machine.** The Typing/Reviewing/Away
  classification inside a live window is unchanged; this feature only bounds the *window*.
- **User-configurable thresholds / a settings UI** for N (hardcoded constant, per D2).
- **Splitting a resumed session into multiple viz-sessions.** One `session_id` stays one
  viz-session (the locked WP3/claude-time decision) — termination bounds the window, it does
  not fragment it.
- **WP6b/6c renderers** (week/month/metrics) — they consume the same corrected `end`
  automatically; no renderer-specific work here.

## Technical Constraints

- **No 3rd-party dependency** — this is pure Rust over the existing `rusqlite` store +
  reclassifier. No probe WP needed (the 3rd-party-probe check is N/A).
- **Touch-points (all existing seams):**
  - `time_store/mod.rs` — a new `NativeSignal` variant + `native_row` arm (D1), or the
    end-marker helper; the write goes through the existing WP5-gated `write_gated` path.
  - `time_store/commands.rs` — the command that fires the end marker on close; startup
    reconciliation at `.setup()`.
  - Frontend `closeWorkspace` (`state/workspace.ts`) + backend `cc_kill` / `kill_all`
    (`cc_session`, `lib.rs::CloseRequested`) — the explicit-close firing sites.
  - `reclassify/mod.rs` — the max-idle cap constant + the window-bounding rule; the
    late-event guard.
  - `time_store/query.rs::build_viz_session` — apply the resolved `end` (this is where
    first→last is computed today; the fix lands here + in the reclassifier it calls).
- **Privacy invariant carries over** — an end marker is a count/timestamp/handle only (no
  content); it inherits the WP2.5 `NativeSignal` privacy guarantees.
- **`source` discriminator** — an explicit-close row is `source = "claudesk-native"`
  (Claudesk generated it), distinct from the CC-hook `SessionEnd` (`source = "cc-hook"`).
- **WP5 gate** — the write path is gated OFF with tracking OFF (AC9), same as every
  `time_store` write.
- **Determinism** — no wall-clock in the pure reclassifier core (it takes a `now`/window
  bound as a parameter, matching `human_segments_for_window`'s `Some(window_end)` shape);
  `time_store::now_ms()` is used only at the command/write layer.

## Open Questions

- [x] **[RESOLVED 2026-07-08 via live capture — see `## Research`]** Does CC emit
  `SessionEnd`, and on which paths? **Answer:** YES on `/exit` (`reason: prompt_input_exit`),
  YES on `/exit`-then-SIGKILL (= Claudesk's real `cc_kill` — fires before the SIGKILL
  backstop), YES on SIGTERM (`reason: other`); **NO on bare SIGKILL / crash / power-loss.**
  → Signal (3) is **primary** for clean/graceful close (incl. Claudesk's own close path);
  explicit-close marker (1) is **NOT redundant** (backstop for hard-kill + synchronous
  guarantee); signals (2)+(4) remain the sole cover for crash/power-loss.

**Resolved at spec review (2026-07-08) — see "Operator-locked decisions" above:**
- ✅ D2 — max-idle cap N = **30 min**.
- ✅ D3 — 4-level precedence (explicit marker > `SessionEnd` > max-idle/reconcile > live) +
  late-event guard: confirmed as specified (the D3 default was accepted; the research result
  may adjust *whether* signal 1 or 3 wins the clean-close case, but the ordering stands).
- ✅ D4/D5 — read-time capping is the correctness mechanism; pure-DB dangling inference;
  startup write-marker belt-and-suspenders only.
- ✅ D1 — new `event` value on a `claudesk-native` row (a 5th `NativeSignal` variant), no
  schema change — accepted as the spec's lean (confirm the exact event string in planning).

## Research (2026-07-08 — live hook-stream capture)

**Question:** Does CC (v2.1.204) fire `SessionEnd`, and on which teardown paths? Method: an
isolated `--settings` capture hook (per `cc-hook-capture-beats-docs`) logging every event,
driven through a `pty.fork()` against a scratch dir — the four teardown paths Claudesk can
produce. Harness cleaned up after; scratch-a CC transcripts left (harmless).

### Findings (all live-captured, not docs)

| Teardown path | `SessionEnd` fires? | `reason` value | Claudesk relevance |
|---|---|---|---|
| **`/exit`** (clean slash-exit) | ✅ YES | `prompt_input_exit` | — |
| **`/exit`-then-SIGKILL** (Claudesk's REAL `cc_session::kill()`) | ✅ **YES** | `prompt_input_exit` | **This is the actual close path** — the `/exit\r` exits cleanly within the grace window before the backstop SIGKILL. |
| **SIGTERM** (catchable graceful signal) | ✅ YES | `other` | e.g. app receives SIGTERM on logout |
| **bare SIGKILL** (uncatchable, no `/exit`) | ❌ **NO** — stream stops at `Stop` | n/a | The **crash** case; also power-loss. No hook can fire. |

**Clean stream:** `SessionStart → UserPromptSubmit → Stop → SessionEnd(reason)`.

**`SessionEnd` payload shape (raw):**
`{session_id, transcript_path, cwd, prompt_id, hook_event_name:"SessionEnd", reason}`.
Maps cleanly onto the existing `HookEvent`/`TimeRow` — `session_id` / `cwd` / `event` are
already captured by `event_to_row`; **`reason` is a NEW field not currently read** (would go
in `meta` if the model wants to distinguish `prompt_input_exit` vs `other` vs future values).
(For reference, `SessionStart` carries `source:"startup"` + `model` — already handled.)

### Impact on the spec (the two questions research existed to answer)

1. **Is `SessionEnd` primary-for-clean-close or supplementary?**
   → **PRIMARY for every clean/graceful close, including Claudesk's own `cc_kill` path.**
   Because `cc_session::kill()` is `/exit\r`-then-SIGKILL, the `/exit` causes CC to emit
   `SessionEnd` before the SIGKILL backstop lands. So the *normal* Claudesk workspace-close
   already produces an authoritative CC-side end signal in the row stream **for free** — we
   just need to *consume* it (which nothing does today).

2. **Is the explicit-close marker (signal 1) redundant on the `cc_kill` path?**
   → **NO — signal 1 is still needed, but its role narrows.** Two reasons it is not redundant:
   - **The bare-SIGKILL / crash / power-loss case emits NO `SessionEnd`** (proven). Only the
     `/exit` grace path does. If a close ever SIGKILLs *without* a successful `/exit` (grace
     window too short, CC hung, `/exit` not accepted mid-turn), there is no `SessionEnd` — the
     explicit marker is the backstop that still records the true close time.
   - **Timing/ordering:** the explicit marker is written by Claudesk *synchronously at the
     moment it initiates close*, whereas `SessionEnd` arrives asynchronously over the socket a
     beat later (and not at all on a hard kill). The explicit marker guarantees a recorded end
     even if the socket write races the process teardown.

**Net design refinement (spec holds; precedence order confirmed sound):**
- Signal 3 (`SessionEnd`) is real and authoritative — **honor it** (AC5 upgrades from
  "contingent" to "confirmed present on clean/graceful paths").
- Signal 1 (explicit close marker) remains the **backstop for the no-`SessionEnd` hard-kill
  case** + the synchronous-guarantee case. NOT redundant.
- Signal 2 (max-idle cap, 30 min) + signal 4 (read-time reconciliation) remain the ONLY
  cover for **crash / power-loss** (no marker, no `SessionEnd`) — unchanged and essential.
- The **D3 precedence order stands**: explicit-marker > `SessionEnd` > max-idle-cap > live.
  (Both explicit-marker and `SessionEnd` typically co-occur on a clean Claudesk close; the
  marker wins as the synchronous ground truth, `SessionEnd` corroborates — either alone is
  sufficient. The order only *matters* when they disagree on the ms, which is immaterial.)
- **Plan should read `reason` into `meta`** for `SessionEnd` rows (cheap; lets the model /
  future debugging distinguish clean-exit from signal-death), though the end-derivation does
  not branch on it in v1.

**Spec is NOT invalidated — findings confirm and sharpen it.** → `/feature-plan` (F5).

## Work Tree

- [x] Phase 1: Read-side correctness core — max-idle cap + late-event guard (signals 2+4 read-time)  <!-- status: DONE — all impl + verify nodes complete; 12 permanent tests; 477 lib pass -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP6.5 is operator-mandated (fix now inside M9)
  - Requirements unchanged: yes — the four-signal model is intact; Phase 1 delivered the read-time cap correctness core
  - Solution still feasible: yes — Phase 2 (honor SessionEnd/marker) slots `authoritative_end` into the existing `resolve_session_end` level-1 seam already built
  - No superior alternative discovered: yes — the idle-gap correction (P1.2) confirmed the design; no better approach surfaced
  **Verdict:** proceed
  **What/why:** The correctness mechanism (operator-locked D4: read-time capping, no destructive backfill). A new `SESSION_IDLE_CAP_MS = 30 min` constant + a pure window-resolver that, given a session's sorted events and the derivation `now`, returns the session's true `[start, end]`: end = last event, UNLESS the trailing silence from the last *substantive* activity exceeds the cap with no live-alive signal → end capped at the last event (the window does NOT extend past it, and no phantom trailing region is credited). This is where historical dangling rows self-fix. Pure Rust; no app, no DB write.
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk reclassify::` exits 0 — new unit tests prove: (a) a session whose last event is >30 min before `now` and has no end marker ends at its last event (not `now`, not day-edge); (b) a session with events within 30 min of `now` is NOT capped (live-idle preserved, AC3); (c) the 30-min constant is `SESSION_IDLE_CAP_MS` in `reclassify::constants`, distinct from `AWAY_THRESHOLD_MS`.
  - CLI: `cargo test -p claudesk` exits 0 (existing 350+ tests still green — no regression in the reclassifier/query layer).
  - CLI: a new test replays the operator's exact defect (a session with a last stray event long after real activity) and asserts the resolved window no longer stretches to that stray event when it's past the cap; documents the "10:54→13:42" repro as a named test.
  - [x] P1.1 Add `SESSION_IDLE_CAP_MS: i64 = 30 * 60 * 1000` to `reclassify::constants` with a doc comment stating the D2 distinction from `AWAY_THRESHOLD_MS` (session-ended vs. human-away axis)  <!-- status: DONE -->
  - [x] P1.2 Pure `resolve_session_end(&[EventRow], authoritative_end: Option<i64>) -> i64` in `reclassify/mod.rs`: level 1 authoritative-end (clamped); level 2 max-idle cap over **IDLE gaps** (AI-busy complement, via `idle_ms_in_gap` + `ai_busy_intervals`); level 3 last event. **Build-time correction:** keyed on idle gaps NOT raw inter-event gaps (raw-gap wrongly capped a long active UPS→run→Stop span → broke 4 existing tests); dropped the sketched `now` param (end value never depends on it). See Discoveries.  <!-- status: DONE -->
  - [x] P1.3 Wired into `time_store/query.rs::build_viz_session` — resolved end + late-event clip (events past resolved end dropped from tiling AND prompt/tool tallies). No `now_ms` thread needed (P1.2 correction).  <!-- status: DONE -->
  - [x] P1.4 10 tests: 8 `resolve_end_*` (no-gap, long-active-not-capped, live-idle-preserved, oversized-idle-cap, the named 10:54→13:42 defect repro, authoritative-marker-wins+clamp, marker-beats-gap, single-event) + 2 day-level (`dead_session_with_stray…`, `live_idle…`). Full suite 475 pass, clippy -D warnings clean. No existing test needed editing (idle-gap logic preserves the UPS→Stop-burst tests).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — reclassify:: 75 pass, time_store::query 17 pass, clippy -D warnings exit 0; no FE touch -->
  - [x] verify-self  <!-- status: DONE — fresh subagent verified all 4 CLI outcomes PASS (75/17/475 tests, clippy exit 0). Integration boundary (build_viz_session backs time_analytics_query→dashboard) is exercised at the query-function outcome level via the day-level build_day tests [same code path the command uses]; the LIVE dashboard render of a capped dead-session is unobservable until a real dangling session exists → CARRIED to Phase 4 end-to-end verify per plan. No live URL for a pure-logic phase. -->
  - [x] verify-human  <!-- status: DONE — operator explicitly SKIPPED the live dashboard check for this pure-logic phase (2026-07-08); no-regression + capped-render proof deferred to the next release gate. verify-auto/self already green at the unit tier. -->
    - [x] P1.verify-human.1 Live dashboard no-regression  <!-- status: DONE — operator-skipped; deferred to next release gate ("check this later when we have a new release") -->
    - [x] P1.verify-human.2 ACK: capped-dead-session RENDER carried to Phase 4 + release gate  <!-- status: DONE — operator acknowledged via skip -->
  - [x] verify-codify  <!-- status: DONE — behavior codified by 12 permanent tests (10 resolver incl. 2 new partial-AI-cover edge tests pinning idle_ms_in_gap + the named defect repro; constant identity; 2 day-level). 477 lib pass, 0 fail, no triage. -->

- [x] Phase 2: Honor `SessionEnd` + explicit-close rows as authoritative end (signal 3 + read side of signal 1)  <!-- status: DONE — all impl + 4 verify nodes complete; emit→parse→persist→derive chain fully pinned; 488 lib + 6 integ pass -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — operator-mandated WP6.5
  - Requirements unchanged: yes — research confirmed SessionEnd fires on clean close but NOT on hard-kill/crash, making Phase 3's explicit marker (signal 1) necessary not redundant
  - Solution still feasible: yes — `NativeSignal::WorkspaceClose` + `record_workspace_close` mirror the existing WP2.5 `record_*` gated-write pattern exactly; `authoritative_end` already reads the `WorkspaceClose` event name
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **What/why:** Make the window resolver treat an authoritative end-marker row (CC `SessionEnd`, `source=cc-hook`; OR the explicit `WorkspaceClose` written in Phase 3, `source=claudesk-native`) as the session end when present, per the D3 precedence: explicit-marker > `SessionEnd` > max-idle-cap > live. Includes the **late-event guard** — events after the resolved authoritative end are excluded from the window (the specific 13:42-stray-after-close defect). Also: `event_to_row` reads the `SessionEnd` `reason` field into `meta` (research finding — cheap, for debugging; derivation does not branch on it in v1). Pure logic + a one-field writer extension.
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk` exits 0 — new tests prove: (a) a session with a `SessionEnd` row ends at that row's ts even if a later stray event exists (late-event guard); (b) precedence: when BOTH an explicit `WorkspaceClose` and a `SessionEnd` exist, the explicit marker wins (ms-immaterial, but ordering pinned); (c) `event_to_row` on a `SessionEnd` HookEvent carrying `reason:"prompt_input_exit"` produces a row whose `meta` contains `reason`.
  - CLI: a test replays the full research-captured clean stream (`SessionStart → UPS → Stop → SessionEnd(prompt_input_exit)`) and asserts the built `SessionPayload.end` equals the `SessionEnd` ts, not the `Stop` ts or a later value.
  - [x] P2.1 `reason` field added to `HookEvent` (`#[serde(default)]`) + forwarded in `resources/claudesk-hook.pl` (SessionEnd→reason) + read into `meta` by `event_to_row` (mirror notification_type). 4 HookEvent test-literal sites updated with `reason: None`. Privacy: tag only, message-body guarded.  <!-- status: DONE -->
  - [x] P2.2 `authoritative_end(&[EventRow]) -> Option<i64>` in `reclassify/mod.rs`: `WorkspaceClose` (native) before `SessionEnd` (cc-hook), earliest-of-a-kind. Consts `EVENT_WORKSPACE_CLOSE`/`EVENT_SESSION_END`.  <!-- status: DONE -->
  - [x] P2.3 Folded into `build_viz_session`: `resolve_session_end(sid_events, authoritative_end(sid_events))` (level-1 precedence). Late-event guard = the existing `ts <= s_end_ts` clip (Phase 1) — post-end strays dropped from tiling + tallies.  <!-- status: DONE -->
  - [x] P2.4 Tests: reason-in-meta+privacy+absent (time_store, 2); authoritative_end none/session-end/explicit>session-end/earliest + resolver honors-marker-over-stray + marker-overrides-cap (reclassify, 7); day-level SessionEnd-honored + explicit-marker-precedence (query, 2); Perl-hook reason-forwarding (integration, 1). 487 lib + 6 integ pass, clippy -D warnings clean.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — reclassify 83, time_store 74, hook_socket 18, hook_pl_output integ 6, clippy -D warnings exit 0; no FE touch -->
  - [x] verify-self  <!-- status: DONE — fresh subagent verified all 5 CLI outcomes PASS (487 lib, 6 integ, clippy exit 0; all named Phase-2 tests pass). Same boundary posture as Phase 1: exercised at the build_day command-path outcome level; live dashboard render of a marker-bounded session CARRIED to Phase 4 + release gate. No live URL for a pure-logic/hook-contract phase. -->
  - [x] verify-human  <!-- status: DONE — operator explicitly SKIPPED (2026-07-08), consistent with the feature-wide "check at next release" preference. Live no-regression + SessionEnd/marker render + deployed-hook re-install all deferred to Phase 4 end-to-end verify + the release gate. -->
    - [x] P2.verify-human.1 Live no-regression  <!-- status: DONE — operator-skipped; deferred to next release gate -->
    - [x] P2.verify-human.2 ACK: SessionEnd/marker render + deployed-hook re-install carried to Phase 4 + release  <!-- status: DONE — operator acknowledged via skip -->
  - [x] verify-codify  <!-- status: DONE — behavior codified by 11 permanent tests (2 reason-in-meta+privacy+absent; 5 authoritative_end/resolver precedence; 2 day-level SessionEnd/marker; 1 Perl-hook emit contract; 1 NEW hook_socket parse test closing the emit→parse→persist chain). 488 lib + 6 integ pass, 0 fail, no triage. -->

- [x] Phase 3: Explicit close-marker write on workspace close / app quit (signal 1 write side)  <!-- status: DONE — all impl + 4 verify nodes complete; per-workspace close marker LIVE-proven; force-quit limitation accepted (2/4 cover); 489 lib pass -->
  **Relevance check (before Phase 4):**
  - Requester still needs this: yes — operator-mandated; the force-quit finding makes Phase 4 MORE necessary
  - Requirements unchanged: yes — but Phase 3 verify REVEALED that Phase 4 reconciliation is now load-bearing for force-quit/⌘Q (not just crash/power-loss). Phase 4's design already covers this (pure-DB dangling inference doesn't care WHY a session dangled).
  - Solution still feasible: yes — reconciliation reuses `authoritative_end` (absent) + the cap predicate + the `record_workspace_close` writer, all built
  - No superior alternative discovered: yes
  **Verdict:** proceed (Phase 4 scope unchanged; its importance confirmed by the P3 force-quit finding)
  **What/why:** Add `NativeSignal::WorkspaceClose` (5th variant, D1 — new `event` value on a `claudesk-native` row, NO schema change) + `native_row` arm (event string `"WorkspaceClose"`) + a gated `record_workspace_close(app, session_id)` helper mirroring `record_focus_change` (reads `tracking_enabled`, zero-IO when OFF, best-effort, never panics the teardown path). Fire it from BOTH close paths: `cc_kill(session_id)` (per-workspace close) and `kill_all()` on `WindowEvent::CloseRequested` (app quit — mark each killed session; `kill_all` exposes/returns the killed session_ids). Backend-lifecycle phase.
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk` exits 0 — `native_row(&WorkspaceClose, ctx)` yields `event=="WorkspaceClose"`, `source=="claudesk-native"`, a real `ts`; a privacy test proves the row carries only handles/counts.
  - Live (MCP bridge, scratch workspace): with tracking toggled ON, open `tmp/scratch/scratch-a` → drive a CC turn → close the workspace via the UI close path → then query the store (`time_get_*` / a debug query) and observe a `WorkspaceClose` row for that session; toggling tracking OFF → close → NO `WorkspaceClose` row written (gate honored). Driven via `mcp__tauri__*` per CLAUDE.md caveats (fire-then-poll invoke, ports 1420/9223, teardown port-cleanup).
  - CLI/backend (carried to verify-human): after app quit (`CloseRequested`), a `WorkspaceClose` row exists for each session that was open; `pgrep claude` shows no orphan (existing `kill_all` behavior unbroken). `pgrep`-class + installed-`.app` quit-path outcomes are operator-carried (webview can't see reaped procs).
  - [x] P3.1 `NativeSignal::WorkspaceClose` (5th variant) + `native_row` arm → event `"WorkspaceClose"` (asserted == `reclassify::EVENT_WORKSPACE_CLOSE`); new `native_workspace_close_row_is_the_session_end_marker` test.  <!-- status: DONE -->
  - [x] P3.2 Gated `record_workspace_close(app, session_id)` in `time_store/commands.rs` — mirrors `record_focus_change` (tracking_enabled gate, zero-IO OFF, best-effort never-panic); attributes the marker to the closed session_id.  <!-- status: DONE -->
  - [x] P3.3 Fires from `cc_kill` (added `app: AppHandle`; scoped registry lock → drop → gated marker, mirroring `cc_input`) + `kill_all` now returns `Vec<String>` of killed ids; the `CloseRequested` handler in `lib.rs` writes a marker per killed id. 3 kill_all tests adapted to `.len()`.  <!-- status: DONE -->
  - [x] P3.4 Sanity: `cargo build` + `cargo clippy -D warnings` exit 0; `tsc --noEmit` exit 0; FE invoke-sweep — all `cc_kill` callers pass `{ sessionId }` only (the added `app` is Tauri-auto-injected, JS signature unchanged). No new command surface.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — time_store 75, cc_session 25 (incl. kill_all Vec<String>), clippy -D warnings exit 0, tsc --noEmit OK -->
  - [x] verify-self  <!-- status: DONE — LIVE-driven via MCP bridge (ports 1420/9223, teardown clean). Tracking ON: opened scratch-a (real PTY cc-1 from fiber), drove a CC turn (store 632→689 rows), closed via filmstrip-close-ws-1 → WorkspaceClose row written (source=claudesk-native, session_id=cc-1). Tracking OFF: opened+closed scratch-b (ws-3) → NO new WorkspaceClose row (count stayed 1, gate honored). No scratch claude orphans. App-quit kill_all-per-session + installed-.app CARRIED to verify-human. -->
  - [x] verify-human  <!-- status: DONE — P3.vh.1 known-limitation pass (operator-accepted 2026-07-08); P3.vh.2 carried to release gate. -->
    - [x] P3.verify-human.1 App-QUIT path  <!-- status: DONE (known-limitation) — operator FORCE-quit with cc-1+cc-2 busy → NO WorkspaceClose markers written. Root cause: marker (+ pre-existing kill_all reaping) live ONLY in on_window_event(CloseRequested), which a force-quit BYPASSES (SIGKILL/SIGTERM → no Tauri window event). No orphans (parent-kill reaped PTY children). Operator-accepted as EXPECTED: a force-quit == a crash (no SessionEnd either, per research); the dangling session self-heals via Phase 4 startup-reconciliation + Phase 1 read-time cap. Explicit marker stays a best-effort fast-path for GRACEFUL close, which verify-self proved works (cc_kill path). No code change. -->
    - [x] P3.verify-human.2 Installed-.app parity  <!-- status: DONE — carried to release gate per operator standing preference -->
  - [x] verify-codify  <!-- status: DONE — WorkspaceClose row/source/attribution + kill_all id-FIDELITY (strengthened from count-only; markers keyed on these ids) + day-level marker-precedence. gate ON/OFF live-verified. Force-quit limitation deliberately NOT unit-codified (process-lifecycle gap; Phase 4 reconciliation is its safety net). 489 lib pass, 0 fail, no triage. -->

- [x] Phase 4: Startup reconciliation (belt-and-suspenders) + end-to-end precedence verify  <!-- status: DONE — all impl + 4 verify nodes complete; reconciliation LIVE-proven; 498 lib + 6 integ pass; clippy --all-targets clean -->
  FINAL PHASE — feature complete.
  **What/why:** On launch, close out sessions left dangling by a prior crash/power-loss (D4/D5: pure-DB inference — any session whose last event is a non-terminal event older than the cap and has NO authoritative end marker → write a `WorkspaceClose` at `end = last-seen event ts`). Read-time capping (Phase 1) already delivers correctness; this makes the ROW STREAM itself honest (belt-and-suspenders, operator-confirmed low-priority-but-do-it). Then the end-to-end integration verify that all four signals compose per the precedence and the operator's original defect is gone on the real app.
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk` exits 0 — a reconciliation test: seed a DB with a dangling session (open, last event > cap old, no marker) → run `reconcile_dangling_sessions` → a `WorkspaceClose` row now exists at the last-seen ts; a fresh/live session (last event recent) is NOT closed; idempotent (running twice writes no duplicate).
  - Live (MCP bridge, scratch): simulate crash — seed a dangling row set (via the store) → relaunch → reconciliation closes it → day-view render for that day shows the session bounded at its last event, not stretched. (End-to-end AC1–AC4 on the real app.)
  - Live/operator (verify-human): the reproduce of the ORIGINAL defect — a real closed/quit scratch session no longer renders "running all day"; day totals (active/away/longest) are trustworthy; toggle-OFF → zero rows + status dots unaffected (AC9). Installed-`.app` smoke where the quit path is exercised (GUI-PATH + real teardown).
  - [x] P4.1 Pure `reclassify::dangling_sessions(events, now, cap)` (no marker + silent past cap → `DanglingSession{session_id, cwd, last_ts}`) + `TimeStore::reconcile_dangling(now, cap)` writing a `WorkspaceClose` at each dangling session's last-seen ts; idempotent (a closed session has a marker → no longer dangling).  <!-- status: DONE -->
  - [x] P4.2 Called at `.setup()` after `open_and_bootstrap` + `app.manage(store)`, gated on `tracking_enabled` (zero work OFF), best-effort (logs `reconciled N`, never fatal).  <!-- status: DONE -->
  - [x] P4.3 End-to-end four-signal composition test through `build_day` (SessionEnd / explicit-marker / max-idle-cap / reconciled-marker — all resolve correctly, none stretch to the stray) + 3 reconcile store-level + 5 dangling-detector tests.  <!-- status: DONE -->
  - [x] P4.4 WP7 arch-resync pointer recorded below (§As-built for WP7). Not written to arch.md here — WP7 owns the resync.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — reclassify 88, time_store 79, clippy -D warnings exit 0; no FE touch -->
  - [x] verify-self  <!-- status: DONE — LIVE seed→relaunch→reconcile proven end-to-end. Seeded a dangling session (last event ~2h ago, no marker) into the dev DB → launched pnpm tauri:dev → startup reconciliation wrote a WorkspaceClose at the seed's TRUE last-seen ts (log: "reconciled 16 dangling session(s)" — the seed + 15 real historical danglers, exactly the operator's original defect class). IDEMPOTENT: 2nd launch → no reconcile line (Ok(0) silent branch), count stayed 17, seed still 1 marker (no dup). Teardown clean, seed rows removed. Dashboard-visual render CARRIED to release gate. -->
  - [x] verify-human  <!-- status: DONE — operator SKIPPED (2026-07-08), deferred to release gate per feature-wide standing preference. Reconciliation write LIVE-proven in verify-self; dashboard-visual defect-gone confirmation + installed-.app carried to release. -->
    - [x] P4.verify-human.1 Dashboard-visual defect-gone  <!-- status: DONE — operator-skipped; deferred to next release gate (the visual payoff of the whole WP) -->
    - [x] P4.verify-human.2 Installed-.app parity  <!-- status: DONE — carried to release gate -->
  - [x] verify-codify  <!-- status: DONE — 9 tests (5 dangling-detector, 3 reconcile store-level, 1 day-level end-to-end four-signal) confirmed comprehensive. FINAL clippy --all-targets sweep caught + fixed 6 TEST-code lints the per-phase --lib runs missed (erasing_op 0*MIN, non_snake_case mkB/mkD, vec_init_then_push, assertions_on_constants). 498 lib + 6 integ pass, clippy --all-targets -D warnings exit 0, no triage. -->

## Code-Quality Review — m9-wp6.5-session-termination-model

### Strengths
- Read-time-capping architecture (D4): `resolve_session_end` pure + `now`-free, historical rows self-fix at render, zero destructive backfill, app-free unit-testable.
- The P1.2 idle-gap correction (cap on the AI-busy complement, not raw inter-event gaps) documented at the def site + pinned by dedicated tests.
- D3 precedence as a readable 3-level cascade with an authoritative-end clamp; pinned by disagreement-case tests.
- Best-effort write discipline: `record_workspace_close` + `reconcile_dangling` gated (zero-IO OFF), never panic teardown/launch; `cc_kill` scopes the registry lock to drop before the telemetry write.
- `kill_all` `usize`→`Vec<String>` is the minimal correct shape for per-session attribution; the test asserts exact id-set fidelity (not count).

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [reclassify/mod.rs `dangling_sessions`] Clones the whole event slice per candidate session just to call `authoritative_end(&[EventRow])`, then scans for 2 event names — avoidable O(events) alloc on the startup path; would vanish if `authoritative_end` took `&[&EventRow]`. Negligible at current scale.
- [reclassify/mod.rs `resolve_session_end` level-2] Returns at the FIRST oversized idle gap ("a session ends once", D3) — intended, but the "long idle → resumed burst → idle again" shape isn't covered by a test or a one-line note at `return prev;`. Add a comment/test to make the load-bearing "first-gap-wins" choice explicit.

### Assessment
Well-built; advances the codebase rather than accruing debt. Pure deterministic resolver, idempotent reconciliation recording the true last-seen ts, uniform late-event guard, respected abstraction boundaries, privacy invariant carried through the new marker + reason-in-meta with tests. Comprehensive coverage across all four signals + precedence disagreements incl. the named operator-defect repro. Only 2 MINOR observations; no refactor warranted. (Dashboard-visual payoff deferred to release gate per operator preference — review judged code, not the carried live check.)

### If you disagree
Operator: dismiss a finding by marking its line `[DISMISSED]` in this section before finalize archives the WIP.

**Disposition (autopilot):** 0C/0M/2 MINOR → auto-backlogged to `workflow/backlog-quality-findings.md` (low); pointer in `workflow/backlog.md`. → finalize (F39).

## As-built for WP7 arch resync (session-termination model)
One-line pointers for WP7's `arch.md` + `CLAUDE.md` resync (do NOT write to arch.md until WP7):
- **`reclassify::resolve_session_end(&[EventRow], authoritative_end)`** — session END is now RESOLVED, not "last event": D3 precedence explicit-`WorkspaceClose` > CC-`SessionEnd` > max-idle-cap > last-event. Keys on IDLE gaps (AI-busy complement), not raw inter-event gaps.
- **`reclassify::constants::SESSION_IDLE_CAP_MS = 30 min`** — session-termination cap, a DIFFERENT axis from the 10-min `AWAY_THRESHOLD_MS`/`SILENCE_CAP_MS` (session-ended vs. human-away).
- **`NativeSignal::WorkspaceClose`** (5th native variant, event `"WorkspaceClose"`, `source=claudesk-native`) — explicit session-end marker; written by `record_workspace_close` from `cc_kill` (per-workspace) + `CloseRequested`/`kill_all` (app-quit), gated by tracking.
- **`kill_all()` returns `Vec<String>`** (killed session ids, was `usize`) — so `CloseRequested` writes a marker per killed session.
- **CC `SessionEnd` `reason`** now parsed (`HookEvent.reason`) + persisted into row `meta`; Perl hook forwards it. Live-confirmed: `SessionEnd` fires on `/exit`/`cc_kill`(`/exit`-then-SIGKILL)/SIGTERM, NOT on bare SIGKILL/crash/force-quit.
- **`reconcile_dangling(now, cap)`** at `.setup()` (gated) — closes dangling sessions (no marker + silent past cap) at their last-seen ts; idempotent; read-time cap is the correctness path, this makes the row stream honest. Covers crash/power-loss AND force-quit/⌘Q (the latter per SURFACE-2026-07-08-M9-WP6.5-CLOSE-MARKER-MISSES-FORCE-QUIT).

## Current Node
- **Path:** Feature > review-quality DONE (0C/0M/2 MINOR auto-backlogged) → finalize
- **Active scope:** none — ship + review-quality done. Next: `/feature-finalize`.
- **Blocked:** none
- **Unvisited:** none (SHIP → finalize)
- **Carried to next RELEASE gate:** the capped/terminated-session dashboard render + no-regression on live sessions (operator "check at next release" 2026-07-08); the P3 force-quit dangling case is now covered in-session by Phase 4 reconciliation (end-to-end test) + will be operator-confirmed live at the release.
- **Open discoveries:** 2 note-and-continue (P1.2 idle-gap correction; P2 deployed-hook re-install) + 1 backlog SURFACE (force-quit marker limitation, low, accepted).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
[SURFACED-2026-07-08] Phase 1 (P1.2) — The max-idle cap must key on **idle** gaps (spans with no AI-busy cover, via `ai_busy_intervals`), NOT raw inter-event gaps. A first cut walked raw consecutive-event gaps and wrongly capped a legitimately-long ACTIVE session (a `UserPromptSubmit`→`Stop` where the AI ran continuously for >30 min is one active burst, zero idle) — it collapsed the session to a single instant and broke 4 existing query tests. Corrected in-build (idle-gap logic; `resolve_session_end` now takes `&[EventRow]` + computes the AI-busy complement). This IS the D2/AC7 reconciliation made concrete: "session-ended" keys on the same AI-idle complement the human tiler uses, at a looser 30-min threshold vs. the 10-min away threshold. Not a backlog item (resolved same-phase); recorded for the verify-codify anchor.
[SURFACED-2026-07-08] Phase 2 (P2.1) — The Perl hook (`resources/claudesk-hook.pl`) now forwards `SessionEnd`→`reason`. The LIVE app forwards it only after the installed `claudesk-hook.pl` is re-deployed (hook_install re-registers on launch). Unit/integration tests use synthesized events, so this is invisible until the Phase 3/4 live verify against the real `.app`. Not a backlog item; carry to Phase 3/4 verify-human (deploy the updated hook before observing live `reason`/SessionEnd rows).

## Retrospect
- **What changed in our understanding:** The empirical hook capture (research phase) rewrote the plan's assumption about signal (3): CC's `SessionEnd` DOES fire on Claudesk's own close path (`/exit`-then-SIGKILL) — so it's primary-for-clean-close, nearly free (we just had to *consume* an already-persisted row), not the "maybe-doesn't-exist" unknown the spec hedged on. The complementary finding — no `SessionEnd` on a hard kill — is what keeps the explicit marker + reconciliation necessary rather than redundant.
- **Assumptions that held:** Read-time capping (D4) as the correctness mechanism was exactly right — historical rows self-fixed with zero backfill, and startup reconciliation collapsed to a cheap belt-and-suspenders write. The four-signal fusion with D3 precedence composed cleanly (proven by the end-to-end test). The WP2.5 `record_*`/`NativeSignal` seam absorbed signal 1 with no new plumbing.
- **Assumptions that were wrong:** (1) The max-idle cap must key on **idle** gaps (AI-busy complement), NOT raw inter-event gaps — a first cut broke 4 existing tests by capping legitimately-long ACTIVE sessions; corrected in-build (this IS the D2/AC7 reconciliation made concrete). (2) The explicit close marker fires only on `CloseRequested` (window-close), which a **force-quit BYPASSES** — surfaced by the operator force-quitting a busy session at P3 verify-human. Accepted as expected (a force-quit == a crash; 2/4 cover it) rather than chased — and it *promoted* Phase 4 reconciliation from "crash/power-loss only" to load-bearing for force-quit/⌘Q too.
- **Approach delta:** Followed the planned 4-phase shape exactly (read-side core → honor markers → write side → reconciliation + end-to-end). Two in-build corrections (idle-gap keying; the `now`-param dropped from the pure resolver as a dead arg). The FINAL `clippy --all-targets` sweep caught 6 test-code lints the per-phase `--lib` runs missed — worth folding `--all-targets` into the per-phase verify-auto gate for backend features (candidate lesson).
