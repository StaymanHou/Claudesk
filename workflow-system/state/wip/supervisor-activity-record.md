---
workflow: feature
state: ship (complete)
created: 2026-09-25
drive_mode: autopilot
---

# Feature: Supervisor activity record

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-09-25
**Entry:** spec (complex feature)
**Source:** `SURFACE-2026-09-21-SUPERVISOR-HAS-NO-OPERATOR-VISIBLE-ACTIVITY-SURFACE`. Grilled
2026-09-25; the settled decisions and defaults are recorded in that entry under "GRILLED 2026-09-25".

## Problem Statement

The workflow supervisor computes a precise decision at every turn end, but every trace of it goes
to a `console.warn` that neither the operator nor an agent can read. **Four of its exits leave no
trace at all.** So its success and its total inactivity look identical, and that has now bitten
for real: it has not fired since v0.5.1
(`SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`), and nobody could tell.
We need a **durable, agent-readable record of every turn-end decision**, a **per-workspace view**
of it, and a **non-intrusive in-place sign** of which turns the supervisor fired. This feature is
the instrument the silent-supervisor investigation depends on.

## User Stories

- As the **operator**, I want to see, per workspace, what the supervisor decided at each recent
  turn end (fired, held back and why, or recycled), so that I can tell "working" from "declining"
  from "doing nothing".
- As the **operator**, when I scroll back through a session, I want to see which turns the
  supervisor fired rather than me, without being interrupted to find out.
- As an **agent investigating the supervisor**, I want to read the decision record from disk, so
  that I can diagnose it without the operator watching a terminal or relaying what they saw.

## Acceptance Criteria

- **AC-1: exactly one record per turn end, through ONE function.** While the gate is ON, every
  `onTurnEnd` invocation writes **exactly one** decision record. This covers:
  - the four currently-silent early returns (supervisor toggle off, no stored mode, no PTY session,
    and the defensive `!host.enabled`);
  - every `fireOne` outcome;
  - a thrown sweep;
  - both recycle arms (started / declined).
  All writes go through **one** recorder call on every exit path, so a turn end that produces no
  record is itself a detectable anomaly. This is the funnel rule from
  `[[extracted-machine-needs-a-live-caller-guard]]` and "funnel shared-state writes through ONE
  function".
- **AC-2: the record carries the decision's inputs and output, never the transcript.** Fields:
  - timestamp (ms);
  - app version;
  - workspace id and project path;
  - the CC session id (today `WorkspaceStatusUpdate.session_id` is **discarded** by
    `useSupervisor`'s inline arrow; thread it through);
  - `outcome` ∈ {`fired`, `withheld`, `recycle-started`, `recycle-declined`, `error`};
  - `reason` from **one closed, typed union**. It covers today's `WithholdReason`,
    `adjudicator-says-awaiting` and `fireOne`'s untyped strings, plus the new early-return reasons.
    `FanOutOutcome.reason: string` is widened no further; it gets narrowed;
  - edge id and step;
  - the resolved policy cell and drive mode (today dropped with `verdict.detail`);
  - the adjudicator basis when it was consulted;
  - the command when fired;
  - context tokens when known.
  **No transcript text.** The adjudicator basis is bounded, so size is not a concern.
- **AC-3: durable and agent-readable.** Records are appended as JSONL to one app-wide file in the
  app-data dir, e.g. `supervisor-activity.log`. The file is size-capped with one rotated generation
  (reusing `status_log`'s rotate-if-oversized shape), survives relaunch and upgrade, and dev and
  prod stay separate through their separate app-data dirs. An agent can answer "did it fire /
  why not" with `tail` / `jq` alone. The path is documented in
  `arch/workflow-supervisor.md` §F.
- **AC-4: a per-workspace popover off the `⚙ supervised` header control.** It lists that
  workspace's most recent decisions (about 20, newest first): relative time, outcome, reason or
  command, and edge. It reads from the **file**, so history spans a relaunch. ⚠️ **Clicking the
  badge must stay the toggle** (today it is the only way to un-supervise a workspace), so the
  popover gets its own adjacent trigger within the same header group.
- **AC-5: a header "last action" hint.** The badge's tooltip (and the popover's header) states the
  most recent decision and how long ago, e.g. `last: fired /feature-verify-auto · 2m ago` or
  `last: withheld — policy-not-auto · 30s ago`. It is updated live as decisions happen.
- **AC-6: turn attribution (probe first; the fallback is sanctioned).** A supervisor-fired turn is
  tagged at fire time. When the turn prev/next readout (`workspace-turn-readout`, `N/M`) lands on
  such a turn, it shows `⚙`, with a tooltip saying the supervisor fired it. ⚠️ **If the probe shows
  the tag cannot be attached reliably, AC-6 drops and AC-5 alone satisfies the attribution
  requirement** (operator ruling at the grill).
- **AC-7: the gate. OFF means byte-identical.** With `workflow_features_enabled` OFF:
  - no record is written;
  - the popover trigger, the hint and the turn `⚙` do not exist;
  - nothing new appears in the app-data dir.
  The new surface(s) are registered with the OFF-invariant guard (a **seventh arm**, or new
  **arm-6 subjects**, decided at plan time), and the `armSubjects` pin (currently **9**) bumps in
  the same change. Every subject gets an OFF test and an anti-vacuity positive.
- **AC-8: non-intrusive, and nothing touches the PTY.** No notification, no focus change and no
  motion. Nothing is written into the PTY, and nothing is read from PTY output.
- **AC-9: the existing `console.warn` lines are retained.** The record is additive.
- **AC-10: the existing seams are reused, not rebuilt.** That means the trigger (`useTurnEnd`), the
  verdict (`fireOne` / `decideSupervised`), the readout (`workspaceSupervisorReadout`, extended
  rather than duplicated, per its own header comment) and the turn markers (`turnMarkersRef`).

## Out of Scope

- **Fixing the silence itself.** That is the investigation that follows, using this record.
- A cross-workspace roll-up in the UI (the file answers "is it firing anywhere?").
- Notifications of any kind.
- Recording while the gate is OFF.
- Any change to fire policy, the verdict, the adjudicator, or recycle behavior.
- Surfacing transcript content.
- xterm decorations or gutter marks (proven unavailable under the DOM renderer, M13.5 WP3).
- A log viewer beyond the recent-decisions popover, such as search, filtering or export. The file
  is the power-user surface.

## Technical Constraints

- **R-4 (the verdict lives in TypeScript; Rust does file IO only).** Appending and reading the file
  are decision-free Rust commands. This is the same shape as `transcript_tail` and `wip_read`, and
  it adds **no** backend→frontend event direction.
- ⚠️ **The main-thread rule.** Sync `#[command]` functions run on the main thread. An append is
  short, but the read-last-N command must not block, so make the commands `async` or keep them
  trivially bounded. `src-tauri/tests/sync_commands_do_not_block.rs` polices this transitively.
- **Precedent for the log:** `status_log::StatusLog` (`write_line` → `append`,
  `rotate_if_oversized`, `MAX_LOG_BYTES` 5 MiB, one generation, best-effort open-per-write).
  Reuse the shape (or the module) rather than inventing a second rotation scheme.
- **Where the exits are** (mapped 2026-09-25):
  - `useSupervisor`'s `onTurnEnd` has four silent early returns before `fireOne`.
  - `fanOut.fireOne` returns through `no(reason)` or `{fired, command}`, and recycle is
    `host.onRecycle` in `Workspace.tsx`, whose started/declined arms are known only there.
  ⚠️ **So the recycle arm's final outcome is decided in `Workspace.tsx`, not in the supervisor
  module.** The one-record-per-turn-end funnel has to span that boundary, and this is a known place
  for a record to be dropped or duplicated.
- **The header control today:** `workspace-header-supervisor` is a `role="button"` span whose click,
  Enter and Space all call `toggleSupervisor()`. There is **no popover or dropdown component** in
  `src/components`, so a minimal one is new code.
  - ⚠️ No CSS token layer exists (`[[no-css-custom-property-layer]]`): copy the hex values.
  - Dark mode only.
  - ⚠️ The readout is gated on `workflowEnabled && visible`, while the supervisor is gated on
    `workflowFeaturesEnabled` (`isWorkflowApplicable(gate, profile)`: gate ON **and** the default
    profile). Keep the popover and hint on the readout's gate.
- **Turn markers:** `XtermPane.turnMarkersRef` is a `TurnMarker[]` (`{id, line, isDisposed}`, an
  xterm `IMarker`) recorded at turn **start** (`is_turn_start`, the raw event stream). They carry
  **no metadata** today. Attribution means correlating "the supervisor injected at T" with the next
  turn start on that workspace. ⚠️ Match on the raw event, never the folded status map
  (`[[workspace-status-map-collapses-consecutive-events]]`).
- **The guard:** `offInvariantGuard.test.ts`. An arm polices a registry by calling a production
  derivation with the gate OFF (asserting null or empty) and pairing that with a positive. Each
  subject needs an OFF test whose title matches `/(registers|matches|renders|announces) no …/`, an
  `armSubjects` entry, and a bump to the count literal.
- ⚠️ **Known blind spot, by design:** because the record only writes while the gate is ON, it cannot
  observe a gate that wrongly reads OFF. That case is operator-visible anyway: the `⚙` badge and the
  Docs tab disappear.
- **Verification:** an agent-launched CC emits no hook events
  (`SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`), so live verification of
  a *real* decision needs an operator-driven turn in a dev build. The recorder, the reason union,
  the file IO and the popover render are testable without one (Vitest with jsdom live mount, plus
  Rust unit tests).
- **No 3rd-party dependency** (step 2 skipped).
- `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` agrees with the popover sitting
  on the existing supervisor control instead of a new panel.
  `[PRIOR: gate-substrate-dependent-feature-class-behind-default-off-opt-in]` agrees with AC-7.

## Open Questions

- [ ] **Attribution feasibility (AC-6)**. Can an injected command be reliably tied to the turn start
      it produces? The candidate is to correlate the supervisor's fire with the next `is_turn_start`
      on that workspace within a short window. The risk is an operator keystroke racing it. This is
      a bounded probe to settle at the start of the plan, not a research state. The fallback is
      pre-sanctioned.

## Elicitation record

**Asked** (at the 2026-09-25 grill; not re-asked here)
- Who reads the record, and how long does it live? → A durable JSONL file in the app-data dir,
  readable by the operator AND an agent.
- Where is it read in the UI? → Off the existing `⚙` header control. No new panel tab.
- How is attribution shown in place? → Turn tag plus header hint; header hint only if the tag is
  hard.

**Assumed** (defaults taken without asking; correct any of these)
- The popover gets a **separate adjacent trigger**; the badge click stays the toggle. *Cheap to
  reverse, and forced by the existing toggle behavior.*
- About **20** recent decisions in the popover, newest first, with relative times. *Cheap.*
- The file is named `supervisor-activity.log` and is capped by reusing `status_log`'s 5 MiB,
  one-generation rotation. *Cheap.*
- The popover reads from the **file** (history spans a relaunch), not from an in-memory ring.
  *Cheap-ish; this follows from the durability ruling.*
- `FanOutOutcome.reason` is **narrowed** from `string` to one closed union. *Not the operator's
  call; this is type hygiene the record needs so reasons stay grep-able and exhaustive.*
- The recycle outcome is recorded where it is decided (`Workspace.tsx`'s `onRecycle`), as part of
  the same single funnel. *Architecture, not the operator's call.*
- The record includes the app version, so a record can be pinned to a release. *Cheap.*

## Work Tree

- [x] Phase 1: The recorder: one durable record per turn end
  **Observable outcomes:**
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml supervisor_activity` exits 0 with ≥1 test
    run (never `0 passed`): append creates the file, rotation keeps exactly one generation at the
    cap, and read-last-N returns the newest lines in order.
  - CLI: `pnpm verify:auto` exits 0. It includes a Vitest suite that drives **every** `onTurnEnd`
    exit (the three recordable early returns, each `fireOne` reason, fired, thrown sweep, recycle
    started, recycle declined) and asserts **exactly one** recorded call each, with the expected
    `outcome` and `reason`. With `host.enabled === false` it asserts **zero** recorded calls.
  - CLI: `grep -c "reason: string" src/state/supervisor/fanOut.ts` → 0 (the reason is a closed
    union), and `tsc` fails if a new reason literal is added outside the union.
  - CLI (dev build, operator-driven turn): after one real CC turn ends in a supervised dev
    workspace, `tail -1 "$HOME/Library/Application Support/com.claudesk.app.dev/supervisor-activity.log" | jq -e '.outcome and .reason and .workspaceId and .sessionId and .appVersion'`
    exits 0. ⚠️ **This line doubles as the investigation's first read**, so record its `reason`.
  - [x] P1.1 Rust `supervisor_activity` module: `supervisor_activity_append(line)` (a JSONL
        append with rotate-if-oversized, reusing `status_log`'s shape: 5 MiB, one generation,
        best-effort) and `supervisor_activity_read(limit)` (the last N raw lines, newest last).
        Both `async`, both decision-free (R-4). Register them in `lib.rs`. Unit tests.  
  - [x] P1.2 `src/state/supervisor/activityRecord.ts`: an `ActivityRecord` type, the closed
        `SupervisorReason` union (today's `WithholdReason`, `adjudicator-says-awaiting`, `fireOne`'s
        untyped strings, `sweep-threw`, plus the new `supervisor-toggled-off`, `no-stored-mode`,
        `no-pty-session`), and a pure `buildRecord(...)`. Narrow `FanOutOutcome.reason` to the
        union.  
  - [x] P1.3 `fireOne` carries the dropped context out on its outcome: `edgeId`, the policy cell
        kind and mode, and the adjudicator basis (today discarded with `verdict.detail`).  
  - [x] P1.4 The funnel: restructure `useSupervisor.onTurnEnd` so every exit resolves to ONE
        decision that is recorded exactly once through a single `record()` (try/finally shape).
        `!host.enabled` writes **nothing** (gate OFF = byte-identical). Thread
        `WorkspaceStatusUpdate.session_id` through `useTurnEnd`'s callback (today discarded by the
        inline arrow).  
  - [x] P1.5 The recycle arm: `host.onRecycle` returns `"started" | "declined"` synchronously, so
        the funnel records the final outcome once. Update `Workspace.tsx`'s implementation.
        ⚠️ Capture the returned VALUE in the test double
        (`[[ts-arity-flexible-assignability-hides-a-widened-param]]`).  
  - [x] P1.6 Tests: per-exit exactly-once (mutation-prove that deleting one exit's record
        call fails a test), gate-OFF zero writes, the reason union's exhaustiveness, and Rust
        append/rotate/read.  
  - [x] verify-auto  <!-- 2026-09-25: `pnpm verify:auto` EXIT=0 (3093 frontend, 986 Rust lib). Two fix-ups on the way: the machine-importer allowlist (reviewed entries for `activityRecord.ts` + its test, type-only `DriveMode`, 0 policy reads) and a dead `STATUS_LOG_ROTATED_FILE` const that clippy -D rejected. `grep -c "reason: string" fanOut.ts` → 0. -->
  - [x] verify-self  <!-- 2026-09-25: outcomes 1–3 PASS (the feature-verify-self-runner subagent: supervisor_activity 3 passed, status_log 11 passed, verify:auto EXIT=0 with activityFunnel 18 passed, `reason: string` count 0). Outcome 4 PASS by the agent on the consuming surface: in the running dev build (PID 28348, com.claudesk.app.dev), a synthetic `workspace-status` turn end emitted through `plugin:event|emit` for ws-1 (scratch-c) produced exactly ONE line in the dev `supervisor-activity.log`, with the full schema, `appVersion "0.7.0"`, `sessionId` threaded, and `withheld`/`no-stored-mode`. That is a formerly SILENT exit, and the jq check exits 0. The bridge's async execute_js timed out although the emit landed (an instrument quirk). Integration boundary: YES (Workspace.tsx / useSupervisor.ts); outcome 4 cites the consuming surface. -->
  - [x] verify-human  <!-- 2026-09-25: operator APPROVED (F13). Integration boundary YES, so no skip. Duplicate records ruled "fix later, with the investigation" (operator). -->
    - [x] P1.verify-human.1 A REAL turn end in an operator-launched dev build writes one record, and
          the agent reads its `reason` back (the first live evidence on the silent supervisor).
          ⚠️ The operator must launch the dev build: a CC inside an agent-launched build emits no
          hook events.  <!-- PASS 2026-09-25: a real operator turn (scratch-c, autopilot, reply ending TRANSITION: F5) wrote a record → `withheld`/`no-verdict`, which exposed the transcript read race. 2 identical records came from a pre-existing duplicate listener (operator: fix later). -->
    - [x] P1.verify-human.2 The operator confirms the record's fields answer "what did it decide,
          and why" well enough to act on (a judgment call; the agent cannot judge it).  <!-- PASS 2026-09-25: operator "good as is". -->
  - [x] verify-codify  <!-- 2026-09-25: added `supervisorActivityLive.test.tsx`, the CONSUMING-SURFACE test: a real `Workspace` plus one real turn-end event → exactly one `supervisor_activity_append` IPC call whose `line` parses to the expected record; gate OFF → none. Mutation-proven: renaming the command or the `line` arg each fails it. Everything else was already pinned by activityFunnel (not duplicated). Full `pnpm verify:auto` EXIT=0 (3095 frontend, 986 Rust lib). -->

- [x] Phase 2: Popover and header "last action" hint
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes. The operator approved Phase 1 and chose to continue the
    feature (not "pause, fix silence now").
  - Requirements unchanged: yes.
  - Solution still feasible: yes.
  - No superior alternative discovered: yes. The file serves agents; the popover and hint serve the
    operator in-UI, which the file cannot.
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser (dev build via the tauri MCP bridge): in a gate-ON supervised workspace the header
    shows the `⚙ supervised` badge **and** a separate activity trigger. Clicking the trigger opens a
    popover whose rows (≤20, newest first) match the last records for that workspace in
    `supervisor-activity.log`. Clicking the badge still flips `aria-pressed` (the toggle is
    unchanged).
  - Browser: the badge's `title` contains `last:` plus the most recent decision's outcome/reason
    and a relative time, and updates without a reload after a new record is written.
  - Browser: with the gate OFF, `document.querySelector` finds neither the activity trigger nor the
    popover. (The M10.9 gate hides the whole badge group.)
  - CLI: `pnpm verify:auto` exits 0, including a live-mount test (`liveWorkspace` harness,
    `mockIPC`) that clicks the trigger and asserts rows rendered from the mocked
    `supervisor_activity_read`, and the OFF-invariant guard with the new subject(s) registered and
    the `armSubjects` pin bumped from 9.
  - [x] P2.1 A pure derivation for the hint: extend `workspaceSupervisorReadout` (do NOT add a second
        derivation, per its header) with a `lastAction` → `title` text.  
  - [x] P2.2 A live feed: the recorder also publishes to a small frontend-only per-workspace store,
        so the hint updates as decisions happen. No backend event direction.  
  - [x] P2.3 A minimal popover component and an adjacent trigger in the `workspace-header-supervisor`
        group. It loads via `supervisor_activity_read`, filters to this workspace in TS, and closes
        on Esc or an outside click. Dark only; hex copied from existing header styles
        (`[[no-css-custom-property-layer]]`).  
  - [x] P2.4 The OFF-invariant guard: register the new surface (a 7th arm, or arm-6 subjects;
        decide against the guard's registry model), with OFF tests and anti-vacuity positives, and
        bump `armSubjects`.  
  - [x] P2.5 Docs: `arch/workflow-supervisor.md` §F gets the record's path, schema and reasons; §G
        records that the "headless" decision is REVERSED by this surface and names the arm.  
  - [x] verify-auto  <!-- 2026-09-25: `pnpm verify:auto` EXIT=0 (3117 frontend, 986 Rust lib). Two fix-ups: the feed hook needed `getServerSnapshot` (the renderToStaticMarkup header tests), and `supervisorToggleStyles.test.ts` required the two new header classes to be registered with their selectors (the guard doing its job). -->
  - [x] verify-self  <!-- 2026-09-25, run 1: the CLI outcome PASS (subagent; the pin-count wording FAILED-cosmetic, a documented deviation). Browser outcomes, driven by the orchestrator on a markers-stripped dev build (PID 27501) via the MCP bridge: (1) the badge plus a separate ▾ trigger are present; the popover rows match the dev log exactly (6 scratch-c records, newest first); the badge click flips aria-pressed (restored); Esc closes. ⚠️ BLOCKING found: the popover rect x=-163, left side clipped off-window (screenshot). FIXED in place (anchor left:0), after which x=172..613, in viewport. (2) The title updated "14m ago" → "just now" with no reload after a new record. (3) Gate OFF via `workflow_set_features_enabled`: badge/trigger/popover absent, header present, and a turn end wrote 0 lines (7 → 7). Gate restored to true. RE-VERIFIED by a fresh feature-verify-self invocation (shortcut gate 2): the popover rows = the file's 7 scratch-c records newest first; rect 172,119→613,370 inside 1920×1018; screenshot shows it fully readable. All Phase 2 outcomes PASS (the pin wording is FAILED-cosmetic, a documented deviation). -->
  - [x] verify-human  <!-- 2026-09-25: operator "all good" (F13). Integration boundary YES, so no skip. -->
    - [x] P2.verify-human.1 In the running dev app: the `▾` trigger beside `⚙ supervised` and the
          popover it opens look right, read well, and sit well in the header (a taste judgment the
          agent cannot make).  <!-- PASS 2026-09-25 (operator) -->
    - [x] P2.verify-human.2 Hovering the badge: the tooltip's trailing "Last: …" line is useful and
          not noisy.  <!-- status: NOT-STARTED -->
    - [x] P2.verify-human.3 [FAILED-cosmetic in verify-self, low priority] Accept the decision to
          register NO new guard subject (the `armSubjects` pin stays 9), which deviates from AC-7's
          "bumps" wording; see `[DECISION-2026-09-25] P2.4`.  <!-- ACCEPTED 2026-09-25 (operator) -->
  - [x] verify-codify  <!-- 2026-09-25: added an outside-click-closes live test, and a CSS anchoring guard (`left: 0`, never `right:`) for the clipping bug found live; jsdom computes no geometry, so the CSS source is the honest instrument there. Both mutation-proven (reverting to right:0 fails the guard; dropping the outside pointerdown listener fails the live test). Everything else was already pinned. Full `pnpm verify:auto` EXIT=0 (3119 frontend, 986 Rust lib). -->

- [x] Phase 3: Turn attribution: the ⚙ on supervisor-fired turns (probe-gated)  <!-- 2026-09-28: complete. ⚠️ P3.verify-human.2 is DEFERRED (read the tag, not the checkbox). -->
  **Observable outcomes:**
  - CLI: the probe verdict is recorded in this WIP. From `status-channel.log` plus transcripts for the
    known 2026-09-15 fires, the latency distribution between the fire and the next
    `UserPromptSubmit` on that workspace, and whether exactly one turn start follows each fire. A
    verdict of GO or FALLBACK is written with its numbers.
  - CLI (on GO): `pnpm verify:auto` exits 0, including a live-mount test in which a
    supervisor-origin marker makes `workspace-turn-readout` render `⚙` with a supervisor `title`,
    an operator-typed turn renders no `⚙`, and operator input between fire and turn start cancels
    the tag.
  - CLI (on FALLBACK): AC-6 is marked dropped in this WIP with the probe numbers, and AC-5 stands
    as the attribution (the operator-sanctioned fallback).
  - [x] P3.1 Probe (data, agent-runnable): measure the fire → `UserPromptSubmit` correlation from
        the logs. Decide GO or FALLBACK.  <!-- 2026-09-28: **GO**. See "P3.1 probe verdict" below. -->
    **P3.1 probe verdict (2026-09-28): GO.**
    - *Historical (the 2026-09-15 fires, claudesk session `7a912f57`, prod `status-channel.log.1`):*
      7 machine-speed commands. For the **6 clean fires**, the fire's `UserPromptSubmit` was the
      FIRST one after the `Stop`, with `Stop`→fire hook 3.32–4.81 s (3.37–4.84 s from the last
      assistant entry) and transcript-accepted→hook 19–31 ms. Two fires (19:52:22, 19:53:24) are
      each later followed by a MID-TURN `UserPromptSubmit` (9 s and 69 s after), far outside the
      claim window. The **7th** (19:50:54) submitted `"FYI, the apple ac/feature-build"`: the supervisor
      injected into the operator's half-typed text, which is the race WP0's suppression now blocks.
    - *Live (dev build, markers stripped, scratch-c, 2026-09-28):* 5 `cc_input` injections of a
      one-word prompt. `cc_input` resolved in ≤1 ms; the webview received `is_turn_start` **32, 33,
      34, 40 ms** after the invoke (n=4), and the broadcaster logged `UserPromptSubmit` 49 ms after
      (n=1). **Exactly one turn start and one turn end per injection**, and no stray starts.
    - *Hazard found:* `is_turn_start` also fires MID-TURN when CC dequeues a prompt (a task
      notification at 19:52:31; an operator message typed while the model ran at 19:54:33). The
      supervisor fires after a `Stop`, so these fall outside the ~40 ms gap; accepted and documented.
    - *Design taken:* arm the origin BEFORE the invoke; claim window 2000 ms (~50× the worst
      sample); consume-once; operator input cancels (conservatively, including terminal reports).
  - [x] P3.2 (GO) Tag at fire time: a pending-origin marker per workspace, consumed by the next
        `is_turn_start` within the measured window and cancelled by operator keystrokes. Keep origin
        in a map keyed by marker id, beside `turnMarkersRef`.  <!-- 2026-09-28: `src/state/supervisor/turnOrigin.ts` (arm/claim/cancel, `ORIGIN_CLAIM_WINDOW_MS`); `useSupervisor`'s `inject` arms before `cc_input` and disarms on failure; `XtermPane` claims via a new `claimTurnOrigin` prop at the marker and keeps `turnOriginsRef` (pruned with the markers); one `turnNavView` builder serves push and pull; pure `selectedMarker`/`selectedTag`/`pruneTags` in `turnMarkers.ts`. Workspace cancels in `onInputForwarded`. -->
  - [x] P3.3 (GO) The readout renders `⚙` plus a tooltip for a supervisor-origin selected turn, and
        is gated with the rest of the surface.  <!-- 2026-09-28: `workspaceSupervisorReadout` gained a 6th input and a `turnBadge` field (extended, not a second derivation, per its header), so the ⚙ inherits arm 6's gate; the turn readout (ungated chrome) renders it only from there. Tests: turnOrigin (11), turnMarkers side-table (5), readout (3), arm-6 leak check + positive, funnel arm/disarm (4), live Workspace (6), structural pane guards (2); 10 mutants each killed by its intended test. `arch/workflow-supervisor.md` §F/§G updated. -->
  - [x] verify-auto  <!-- 2026-09-28: `pnpm verify:auto` EXIT=0 in 40s (3151 frontend, 986 Rust lib). The one lint warning (`XtermPane.tsx:932`, exhaustive-deps spread) is pre-existing and outside this phase's diff. One guard needed its pattern updated during build: `fanOut.test.ts` AC-7 pinned the one-line `onInputForwarded` arrow; it now pins the push as the block body's FIRST statement (mutant M10 proves it still bites). -->
  - [x] verify-self  <!-- 2026-09-28: all 3 CLI outcomes PASS (subagent: the probe numbers spot-checked independently against status-channel.log.1 + transcript 7a912f57; `pnpm verify:auto` EXIT=0, 3151 tests, the live-mount file 6/6 unskipped; FALLBACK N/A). The subagent caught a duplicated NOT-STARTED P3.2/P3.3 pair left by the build edit, now removed, and a mislabelled latency range, now corrected. ORCHESTRATOR LIVE CHECK on the REAL XtermPane (dev build PID 52154, markers stripped, scratch-c, webview reloaded first to shed stale HMR state; the app's own `turnOrigin.ts?t=…` instance imported via its Vite URL, since the plain URL is a separate module instance): (A) a control injection with nothing armed → `1/1`, no ⚙; (B) armOrigin then a real `cc_input` → `⚙ 2/2`, title "Turn 2 of 2 — The workflow supervisor started this turn (it ran /feature-verify-auto).", glyph rgb(217,119,87); (C) an origin armed 3 s in the past → `3/3`, no ⚙, and the expired origin was consumed (claim afterwards → null); stepping ↑ gave `⚙ 2/3` then `1/3` (no ⚙), and ↓ back to `⚙ 2/3` (the tag persists per marker); (D) gate OFF via `workflow_set_features_enabled` → `2/3`, plain title, no ⚙, no header badge; gate restored to true (settings.json confirmed), ⚙ returned. Screenshot shows ⚙ 2/3 in the header accent. -->
  - [x] verify-human  <!-- 2026-09-28: operator "all good" (F13); item 2 DEFERRED by operator decision. Integration boundary YES, so no skip. -->
    - [x] P3.verify-human.1 In the running dev app (scratch-c, readout showing `⚙ 2/3`): the `⚙`
          beside the turn readout looks right and sits well; its tooltip reads well; stepping ↑/↓
          shows and hides it (a taste judgment the agent cannot make).  <!-- PASS 2026-09-28 (operator) -->
    - [x] P3.verify-human.2 ⚠️ A LIVE ⚙ from a REAL supervisor fire (verify-self armed the origin by
          hand; the fire→arm step is proven offline). The supervisor is currently silent, so this is
          expected to be `DEFERRED` until the investigation restores firing (the operator's call).
          <!-- status: DEFERRED-TO-INVESTIGATION 2026-09-28 (operator: "defer"). NOT passed: check it once the silent-supervisor fixes land. -->
    - [ ] P3.verify-human.3 Accept two documented limitations: (a) cancellation is conservative
          (terminal focus/DA/cursor reports also cancel, so a `⚙` can be MISSING, never wrong);
          (b) a queued prompt dequeued mid-turn inside the ~40 ms gap could take the tag (not
          engineered around).  <!-- ACCEPTED 2026-09-28 (operator) -->
  - [x] verify-codify  <!-- 2026-09-28: the one live-verified behavior without a regression test was the ⚙'s STYLING (its class sat outside the header-class CSS guard's `workspace-header-supervisor*` scan). Added two pins to `supervisorToggleStyles.test.ts`: emitted AND styled, and the SAME accent as the header badge (read from the badge's rule). Mutation-proven: C1 wrong colour, C2 rule deleted, C3 class renamed; each killed. Everything else was already pinned (claim ordering: structural; per-marker persistence: `selectedTag`; expiry and consume-once: `turnOrigin`; gate OFF, cancel and the re-read on step: the live-mount file). Full `pnpm verify:auto` EXIT=0 in 30s (3153 frontend, 986 Rust lib). -->

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality (ship complete 2026-09-28; `pnpm verify:auto` EXIT=0, 3153 frontend / 986 Rust lib). All three phases complete (2026-09-28); P3.verify-human.2 DEFERRED to the investigation.
- **Blocked:** none. ⚠️ P3's verify-human LIVE check is expected to be DEFERRED: a live `⚙` needs a
  real supervisor fire, and the supervisor is currently silent (read race + spurious watermark).
  ⚠️ A dev build is running for the probe (PID 52154, markers stripped, scratch-c open); verify-self
  can reuse it after a reload.
- **Unvisited:** review-quality → finalize
- **Open discoveries:** 5 (below). #2 and #3 are the two causes of the silent supervisor, #4 is
  the duplicate listener (operator: fix with the investigation), and #5 is the mid-turn
  `is_turn_start` found by the P3.1 probe.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-09-25] P1.4 — `injectCommand` SWALLOWS a rejected `cc_input` (it warns and
  returns). With the supervisor passing `onIpcError: undefined`, `fireOne`'s `inject-failed` arm
  was unreachable, so a failed injection was reported, and would have been recorded, as `fired`.
  **Fixed in scope:** the supervisor now passes an `onIpcError` that re-throws (pinned by the
  `inject-failed` funnel test and mutant C). ⚠️ This is also a **new hypothesis for the silence**,
  added to `SURFACE-2026-09-14-…-NEVER-OBSERVED-…` as hypothesis 4: before this fix, a
  supervisor whose injections failed (e.g. a stale PTY session id) believed it fired while CC
  received nothing. That is equally consistent with "no commands in the transcripts".
- [SURFACED-2026-09-25] verify-self — ⭐ **PROBABLE ROOT CAUSE of the silent supervisor, found
  while verifying.** A freshly opened, **untouched** dev workspace (scratch-c) showed the
  `⚙ supervised ⏸` suppressed badge: the unsent-input watermark was up with no typing. Cause:
  `foldInput` (`unsentInput.ts`) lets the LAST byte of each `onData` chunk decide, and xterm's
  `onData` carries not only keystrokes but **terminal-generated reports**. Focus-in `ESC[I`,
  focus-out `ESC[O`, DA replies (`ESC[?1;2c`) and cursor reports (`ESC[r;cR`) all end on a
  non-clearing byte, so each one RAISES "unsent input" (replayed: all → `true`). Consequence: a
  focus change (the operator switching workspace or app mid-turn) raises the watermark, and the
  turn end then withholds `unsent-input-present`. The supervisor falls silent **precisely when
  the operator is not watching**. v0.5.1 is when the watermark shipped, and v0.5.0 fired.
  ⚠️ Still a hypothesis until a REAL turn's record says `unsent-input-present` (the Phase 1
  verify-human check). **Not fixed here**: that is the investigation's fix, out of this
  feature's scope. Logged to `SURFACE-2026-09-14-…-NEVER-OBSERVED-…`.
- [SURFACED-2026-09-25] P1.verify-human.1 — ⭐ **SECOND CAUSE of silence: the transcript read
  RACES the `Stop` hook.** A real operator turn (scratch-c, a dev build launched with the Claude
  session markers stripped, which DOES emit real hook events) ended on `TRANSITION: F5`. `Stop`
  arrived at 11:11:38.074, and the record (stamped .076, before the read) says `no-verdict`.
  Re-running `parseTranscript`/`readTurn` on the SAME file afterwards finds `edgeId: "F5"`, while
  the file minus the final text line gives `null`. So at read time CC had not yet flushed the
  final assistant message. Timing-dependent, so some turns win the race (the 09-15 fires did).
  Independent of the unsent-input watermark. Logged to NEVER-OBSERVED.
- [SURFACED-2026-09-25] P1.verify-human.1 — **Duplicate turn-end evaluation (pre-existing,
  revealed by the record).** One turn end produced TWO identical records. It was reproduced
  synthetically: one `plugin:event|emit` produced 2 records in the operator's session instance,
  but only 1 after a fresh page load and in the earlier agent run. So a SECOND
  `workspace-status` listener is added during a session (suspect: changing the drive mode on an
  open workspace, i.e. a respawn; unconfirmed). The Rust broadcaster emits once
  (`status_broadcaster::commands`, single `app.emit`). This predates the record: the supervisor has
  been evaluating such turns twice, and the `FireLedger` silently absorbed the second as
  `already-fired-for-this-turn`. The funnel holds its own contract (one record per `onTurnEnd`
  invocation); the extra invocation is upstream.
- [SURFACED-2026-09-25] P1.verify-human.1 — **Agent-driven hook verification is now possible.**
  Launching `pnpm tauri:dev` with `env -u CLAUDE_CODE_CHILD_SESSION -u CLAUDECODE -u
  CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u
  CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_PID -u CLAUDE_CODE_SESSION_ATTENDED -u
  CLAUDE_CODE_EXECPATH -u CLAUDE_EFFORT -u CLAUDESK_DRIVE_MODE` produced real `UserPromptSubmit`
  and `Stop` hook events for an operator turn. This contradicts the standing assumption behind
  `SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT` (the markers must be
  stripped at the app PARENT, not at a child).
- [DECISION-2026-09-25] P2.4 — **No new guard subject; `armSubjects` stays at 9** (a deviation
  from AC-7's "bumps" wording, to disclose at verify-human). The hint, `▾` trigger and popover
  all render INSIDE the block gated by `workspaceSupervisorReadout`, which is arm 6's existing
  `WORKSPACE-SUPERVISOR` subject. That module's header requires EXTENDING it rather than adding a
  second derivation, and M14 WP0's toggle set the same precedent. Arm 6 gained a check that the
  new `last` input cannot leak through the gate (plus a positive), deliberately not titled
  "renders no …" because the count is reconciled against those titles. `arch/workflow-supervisor.md`
  §G's stale "SEVENTH arm" rule was corrected to how it actually played out.
- [SURFACED-2026-09-25] P2.5 — `archDocEnumeration.test.ts` scanned only `useSupervisor.ts`, on
  the premise that it was "the single place every supervisor-owned invoke is made". The recorder's
  two new commands live in `activityRecorder.ts`, and one uses no `invoke<…>` generic, so the guard
  was blind to both. It was widened as a strict superset (a second file; the generic made optional)
  and positive-control-proven (removing a command from the doc fails it). §B now enumerates FIVE
  commands.
- [SHORTCUT-2026-09-25] P2.3 — the activity popover was right-anchored (`right: 0`), and the badge
  sits near the header's left end, so the 440px panel extended to x=-163 and clipped its own
  timestamps (seen live plus a screenshot at Phase 2 verify-self). Fix: one CSS property, extending
  the P2.3 rule (`left: 0`). Re-verified by a fresh `feature-verify-self` invocation: rows match the file, rect inside the viewport, screenshot readable.
- [SURFACED-2026-09-25] P2 verify-self — ⭐ **Hypothesis 1 confirmed END-TO-END on a real
  transcript.** Synthetic turn ends at 11:13–11:14 re-read the operator's (by then fully flushed)
  turn ending `TRANSITION: F5`. Past the read race, the verdict was FIRE (edge F5, autopilot), and
  it was withheld as `unsent-input-present` although the operator never typed after Enter. So both
  causes are now shown on real data: the read race (`no-verdict` at the real Stop) and the spurious
  watermark (withholding a would-be fire). A fourth probe (11:3x, fresh load) again read
  `unsent-input-present`.
- [SURFACED-2026-09-28] P3.1 — **`is_turn_start` also fires MID-TURN.** CC emits
  `UserPromptSubmit` when it dequeues a queued prompt while running: a background task
  notification (2026-09-15 19:52:31) or a message the operator typed during the turn (19:54:33).
  `event_is_turn_start` maps every `UserPromptSubmit` to a turn start, so the M13.5 turn-nav markers
  also land on those mid-turn points (the prev/next walk steps onto them). Turn attribution is
  unaffected in practice (it fires after a `Stop`; documented in `turnOrigin.ts`). Logged to the
  backlog as `SURFACE-2026-09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES`. Also seen again at
  the probe: a freshly opened, untouched scratch-c showed `⚙ supervised ⏸`, the known spurious
  watermark.
