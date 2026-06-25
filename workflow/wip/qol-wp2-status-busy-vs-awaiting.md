# Feature: WP2 — Status indicator: busy vs awaiting-input (clear stuck AwaitingInput)

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-06-25
**Entry:** reproduce → spec → plan (F32 → F4 → F7; bug reproduced cleanly, complex)
**Drive mode:** autopilot
**Source WBS:** `docs/product/qol-wbs.md` → WP2
**Backlog:** SURFACE-2026-06-24-STATUS-INDICATOR-BUSY-VS-AWAITING-INPUT

## Problem Statement
The per-workspace status dot (filmstrip + center-stage header) shows **AwaitingInput**
(blue) and stays STUCK there after Claude Code calls the `AskUserQuestion` tool (or hits a
permission prompt) and the user ANSWERS it. The awaiting-input dot is THE core dogfood
signal ("this project needs me"); a stuck false-positive makes a project look like it needs
the user while Claude is actually busy working — worse than a transient wrong state, because
the user stops trusting the signal.

**Root cause (live-captured — see `## Reproduction Artifact`):** Claudesk registers and maps
only three hook events (`UserPromptSubmit`→Running, `Stop`→Idle, `Notification`→AwaitingInput).
The real ask→answer→resume stream is:

```
UserPromptSubmit                          → Running        ✓
PreToolUse(AskUserQuestion)               → (not registered — ignored)
Notification "Claude needs your permission" [permission_prompt] → AwaitingInput  ✓ (goes blue)
PostToolUse(AskUserQuestion)              → (not registered — IGNORED)  ← THE GAP (resume signal)
Stop                                      → Idle           (only this finally clears it)
```

CC **does** emit a resume signal — `PostToolUse(AskUserQuestion)` — when the answer is
received, but Claudesk doesn't register `PostToolUse`, so the dot stays AwaitingInput through
the entire genuinely-RUNNING post-answer window until the next `Stop`. With substantial
post-answer work that mislabeled-blue window is arbitrarily long.

Secondarily, `Notification` is mapped to AwaitingInput **unconditionally**, but CC fires
`Notification` for several `notification_type`s, not all of which mean "needs the user":
`permission_prompt` (real), `idle_prompt` (60s+ idle nudge — NOT a fresh input request),
`auth_success`, `elicitation_dialog/complete/response`. An `idle_prompt` or `auth_success`
firing mid-work would wrongly flip the dot blue.

## User Stories
- As the operator dogfooding N concurrent workspaces, I want the blue "awaiting input" dot to
  clear the moment Claude resumes working after I answer a question, so the dot only ever
  means "this project actually needs me right now."
- As the operator, I want an idle-nudge or auth-success notification NOT to flip a busy
  workspace to "awaiting input," so the signal isn't diluted by informational notifications.

## Acceptance Criteria
The feature is done when:
1. **Clear-on-resume.** After an `AskUserQuestion`/permission prompt is answered, the dot
   transitions out of AwaitingInput to Running as soon as CC resumes — driven by
   `PostToolUse` mapped to Running (NOT waiting for the eventual `Stop`). Verified live by
   re-running the `/tmp/wp2-repro` harness (or a real AskUserQuestion in the installed `.app`)
   and observing the dot flip orange on answer, not stay blue until turn-end.
2. **PostToolUse registered + mapped.** `hook_install::CLAUDESK_EVENTS` includes `PostToolUse`;
   `status_broadcaster::event_to_state` maps `PostToolUse` → `Running`. (PreToolUse is NOT
   added — see Out of Scope; the initial `UserPromptSubmit`→Running already covers a turn's
   pre-tool state.)
3. **Notification gated by `notification_type`.** The Perl hook forwards `notification_type`;
   the wire DTO carries it; the broadcaster maps `Notification` → AwaitingInput ONLY for
   genuine input-needed types (`permission_prompt`, `elicitation_dialog`). Other types
   (`idle_prompt`, `auth_success`, `elicitation_complete`, `elicitation_response`) do NOT set
   AwaitingInput — they are a no-op (drop), leaving the prior state intact. An UNKNOWN/absent
   `notification_type` falls back to the current behavior (→ AwaitingInput) so a future CC
   type isn't silently swallowed (honest-default principle, mirrors `Unknown`).
4. **No regression on the happy path.** Plain prompt (`UserPromptSubmit → Stop`) and ordinary
   tool calls still resolve correctly: a tool-using turn reads Running from UserPromptSubmit
   through Stop, never flickers to Idle/AwaitingInput between PostToolUse and the next event.
5. **Self-healing registration.** A previously-installed Claudesk that registered only the old
   3 events adds `PostToolUse` on next launch (additive merge; the existing idempotent +
   self-heal install path handles it). Uninstall removes `PostToolUse` too.
6. **Tests updated + green.** `hook_install` tests assert the new event set (incl. dev/prod
   coexistence still holding); `status_broadcaster` tests cover PostToolUse→Running and the
   `notification_type` gating (including the unknown-type fallback); the DTO serde-shape test
   covers the new field; `hook_socket` parse test covers `notification_type`. Frontend
   `workspaceStatus` tests unchanged unless a new wire field surfaces (it does not — see below).
7. **never-block-CC preserved.** The hook still exits 0 unconditionally; adding PostToolUse
   (a high-frequency event) introduces no perceptible CC lag — confirmed at verify-human in a
   tool-heavy session.
8. **Docs resynced.** arch.md §A (the "three events" contract), `CLAUDE.md`, and the affected
   module headers updated to the new event set + the `notification_type` gating.

## Design Decisions (operator-confirmed at spec)
- **Clear mechanism = `PostToolUse → Running` (precise).** Faithful to the captured stream;
  the dot flips back the instant the answer is received and CC resumes. (Chosen over the
  broader "any-activity auto-clears" net, and over adding PreToolUse too.)
- **`notification_type` gating = IN scope.** Forward `notification_type` through the Perl hook
  + the `HookEvent`/DTO; gate AwaitingInput on genuine input-needed types. Unknown/absent type
  → fall back to AwaitingInput (honest default — never silently swallow a future type).
- **Perf = accept + verify-human.** The hook already exits 0 unconditionally (~15ms; socket
  write ~3ms; never blocks CC). Add PostToolUse and confirm no perceptible lag during a
  tool-heavy session at verify-human (WP1-probe budget posture).

## Out of Scope
- **PreToolUse registration.** Not added — a turn's pre-tool/inter-tool state is already
  Running via the initial `UserPromptSubmit`, and `PostToolUse → Running` is sufficient to
  clear AwaitingInput on resume. Keeps the added hook-event volume to one event class.
- **A new "Busy" wire state distinct from "Running."** The SURFACE floated a distinct busy
  state; not needed — Running already means "CC is working." PostToolUse maps to the existing
  Running. No new `WorkspaceState` variant, no new TS wire state, no new dot color.
- **Subagent state surfacing** (`SubagentStart`/`SubagentStop`). The original SURFACE framing
  guessed subagents/background jobs; the reproduction proved the trigger is the
  AskUserQuestion/permission path, not subagents. Subagent-specific status is a separate idea,
  not this fix.
- **Forwarding/using `tool_name`** beyond what's needed. PostToolUse maps to Running
  regardless of which tool; no per-tool logic.
- **Tooltip/snippet work** (`SURFACE-2026-06-22-QUALITY-WP6-SNIPPET-TOOLTIP-DEAD-PATH`) —
  separate `/feature-refactor` item.

## Technical Constraints
- **No 3rd-party probe needed.** This consumes CC's official hook channel (already probed +
  shipped in M3 WP1–WP4). The ask→answer→resume event contract is now live-captured (claude
  v2.1.178) — see `## Reproduction Artifact`. No external API/SDK.
- **M3 contract change.** arch.md §A, `CLAUDE.md`, and module headers state Claudesk registers
  "exactly three events." This feature changes that to four (adds PostToolUse) + refines the
  Notification mapping. Documented, deliberate.
- **Wire-shape additive only.** `notification_type` is a new OPTIONAL field on `HookEvent` +
  `WorkspaceStatusUpdate`, `skip_serializing_if = Option::is_none`, snake_case verbatim (the
  IPC-DTO-casing convention). The frontend `WorkspaceStatusUpdate` TS type gains an optional
  `notification_type?: string` mirror, but the FRONTEND mapping is unchanged — the
  AwaitingInput/Running decision is made entirely BACKEND-side in `event_to_state`/`to_update`
  (the frontend still just renders the `state` it's handed). This keeps the gating logic in
  one place (Rust, unit-tested) rather than split across the boundary.
- **`event_to_state` signature change.** Today `event_to_state(&HookEvent) -> Option<State>`
  matches only on `hook_event_name`. To gate on `notification_type` it must read the whole
  event (it already takes `&HookEvent`, so the signature is fine — the body grows a
  `notification_type` check on the `Notification` arm). `to_update` already passes the event.
- **Self-heal install.** `merge_claudesk_hooks` keys on the script basename and appends a
  matcher-group per event in `CLAUDESK_EVENTS`; adding `PostToolUse` to the const makes the
  next launch additively register it. Dev/prod per-identity coexistence is unaffected (same
  basename-exact match). The existing install/uninstall round-trip + idempotency tests must be
  updated to the 4-event set.
- **Files:**
  - `src-tauri/resources/claudesk-hook.pl` — forward `notification_type` (mirrors the existing
    `message`/`prompt` conditional re-emit).
  - `src-tauri/src/hook_socket/mod.rs` — add `notification_type: Option<String>` to `HookEvent`
    (`#[serde(default)]`); a parse test.
  - `src-tauri/src/hook_install/mod.rs` — add `"PostToolUse"` to `CLAUDESK_EVENTS`; update the
    affected tests (event-count assertions, round-trip).
  - `src-tauri/src/status_broadcaster/mod.rs` — `event_to_state`: `PostToolUse`→Running;
    `Notification`→AwaitingInput gated on `notification_type`; add `notification_type` to the
    DTO; tests for both transforms + the serde shape + the unknown-type fallback.
  - `src/state/workspaceStatus.ts` — add optional `notification_type?: string` to the wire type
    (mirror only; no mapping change).
  - Docs: `docs/product/arch.md` §A, `CLAUDE.md` (hook-channel bullets), module headers.

## Verify posture (per CLAUDE.md backend-lifecycle convention)
This is a backend-lifecycle feature (hook registration + socket + broadcaster transform).
- **Agent (verify-self, static slice):** `cargo test` (the transform + install + parse units —
  the bulk of the behavior is pure and fully unit-testable), `cargo clippy -- -D warnings`,
  `cargo fmt --check`; `tsc --noEmit` + `eslint` + `pnpm vite build` for the TS wire-type
  touch; a wiring trace (hook.pl → settings registration → socket → event_to_state → emit →
  frontend render).
- **Operator (verify-human, live tier):** re-run the `/tmp/wp2-repro` harness OR drive a real
  `AskUserQuestion` in the **installed `.app`** (PATH/GUI-launch parity per the installed-build
  smoke-test convention) and watch the dot flip orange on answer (not stay blue until Stop);
  confirm no perceptible CC lag in a tool-heavy session; confirm an idle-nudge doesn't flip a
  busy workspace blue (best-effort — idle_prompt needs a 60s+ wait).

## Reproduction Artifact
**Surface:** manual repro recipe + LIVE-captured hook event stream (real `claude` v2.1.178).
**Outcome:** reproduced, deterministic (every-run).

### Harness (`/tmp/wp2-repro/`, ephemeral — stream preserved below as the durable record)
- `capture-hook.pl` — appends one JSON line per event (name + `tool_name` + `message` +
  `notification_type` + key set) to a log.
- `settings.json` — ISOLATED `--settings` file registering that hook for SessionStart/
  UserPromptSubmit/PreToolUse/PostToolUse/Notification/Stop/SessionEnd (does NOT touch
  `~/.claude/settings.json`).
- `drive.py` — drives an INTERACTIVE `claude` via `pty.fork()`, submits a prompt forcing an
  `AskUserQuestion`, waits for the multiple-choice prompt, sends Enter to answer, captures the
  stream. (Answering needs a real TTY; `claude -p` auto-dismisses the question.)
- Run: `python3 /tmp/wp2-repro/drive.py`.

### Captured stream — interactive AskUserQuestion ask → answer → resume (with timings)
```
  0.00s  SessionStart
  4.43s  UserPromptSubmit                          → Running        ✓
  8.73s  PreToolUse(AskUserQuestion)               → (unregistered) no-op
 14.77s  Notification "Claude needs your permission" [permission_prompt] → AwaitingInput  ✓
 24.97s  PostToolUse(AskUserQuestion)              → (unregistered) no-op  ← THE GAP
 27.64s  Stop                                      → Idle           (only now clears)
 45.75s  SessionEnd
```
The `+2.68s` between PostToolUse and Stop is genuine RUNNING work rendered as AwaitingInput;
real post-answer work makes that window arbitrarily long.

### Corroborating captures
- Baseline plain prompt: `SessionStart → UserPromptSubmit → Stop → SessionEnd`.
- Ordinary tool call (Read): `… UserPromptSubmit → PreToolUse(Read) → PostToolUse(Read) →
  Stop …` — confirms `PostToolUse` is a reliable generic "CC is working" signal carrying
  `tool_name`.
- The `Notification` carried `notification_type: "permission_prompt"` — confirms the field is
  present + the gate is feasible.

## Open Questions
- [ ] None blocking. (The three design choices were resolved with the operator at spec; the
      input-needed `notification_type` allow-list is pinned in P2.1 below.)

## Work Tree

- [x] Phase 1: PostToolUse → Running (clear AwaitingInput on resume)  <!-- status: COMPLETE 2026-06-25 — bug fixed + operator-verified live + codified -->
  **What:** the core stuck-blue fix. Register `PostToolUse` on the hook channel and map it to
  `Running` so the dot flips back the instant CC resumes after an answered AskUserQuestion /
  permission prompt — not at the eventual `Stop`. Independently shippable: this alone resolves
  the operator's stuck-blue complaint. (Phase 2 adds the Notification-gating refinement.)
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk` (lib) passes, incl. a NEW `status_broadcaster` test
    `post_tool_use_maps_to_running` asserting `event_to_state(&ev("PostToolUse",..)) ==
    Some(Running)`, and a NEW `hook_install` assertion that `CLAUDESK_EVENTS` contains
    `"PostToolUse"` (the 3→4 event-count updates green across merge/idempotent/round-trip tests).
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0; `cargo fmt --check` clean.
  - CLI: a focused unit test proves the FULL captured sequence resolves correctly — feeding
    `UserPromptSubmit→Notification(permission_prompt)→PostToolUse→Stop` through `event_to_state`
    yields `Running→AwaitingInput→Running→Idle` (the AwaitingInput→Running clear is the bug fix).
  - Manual/live (carried to verify-human): re-run `/tmp/wp2-repro/drive.py` with Claudesk's
    OWN hook re-registered for PostToolUse → the dot flips orange at the PostToolUse timestamp
    (~answer time), NOT blue-until-Stop.
  - [x] P1.1 Add `"PostToolUse"` to `hook_install::CLAUDESK_EVENTS` (3→4). Updated the const
        doc + module header. Renamed `merge_into_empty_settings_creates_all_three_events` →
        `…_a_group_per_event`; added `claudesk_events_includes_post_tool_use_resume_signal`.
        FIX: the `settings_with_claude_time()` fixture now seeds claude-time on PostToolUse too
        (it does on the real machine) so the additive-merge test stays production-faithful.  <!-- status: done -->
  - [x] P1.2 `status_broadcaster::event_to_state` arm `"PostToolUse" => Some(Running)`; module-
        header "State mapping" doc block updated (also pre-documented the Phase-2 Notification
        gate).  <!-- status: done -->
  - [x] P1.3 Tests: `post_tool_use_maps_to_running`; `captured_ask_user_question_stream_resolves_running_awaiting_running_idle`
        (the verify-codify anchor); extended `unknown_event_is_a_noop` to pin PreToolUse as a
        no-op. All 224 lib tests pass (was 221 + 3 new).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — cargo test 224 pass, clippy -D warnings exit 0, fmt --check clean -->
  - [x] verify-self  <!-- status: done (static slice + wiring trace) — see verify-self note below; live carried to verify-human -->
  - [x] verify-human  <!-- status: done — VH1/VH2/VH3 all pass (operator 2026-06-25) -->
    - [x] VH1: dot flips ORANGE on AskUserQuestion answer-resume, not stuck blue  <!-- status: pass -->
    - [x] VH2: no perceptible CC lag in a tool-heavy session  <!-- status: pass -->
    - [x] VH3 (installed-build parity): observed in the installed `.app`  <!-- status: pass -->
  - [x] verify-codify  <!-- status: done — coverage complete (3 anchor tests written TDD-style in build); full suite green: cargo 224/224, frontend 456/456, no regressions, no new tests needed -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [x] Phase 1.5: Status-dot animation (breathe/blink) + filmstrip caption transparency  <!-- status: COMPLETE 2026-06-25 — operator-verified visually + no regression -->
  **What:** operator UX request added at Phase 1 verify-human. Presentation-only (CSS), no
  logic/state-machine touch. (a) The **Running** dot "breathes" — a slow calm pulse (opacity +
  gentle scale, ease-in-out, ~1.8s). (b) The **AwaitingInput** dot does a **hard on/off blink**
  — opacity steps full↔near-zero, fast (~0.7s), step-like flash (attention-grab, since it's THE
  "needs me" cue). (c) Idle/Unknown stay static. (d) Animation lives on the shared `.status-dot-*`
  classes so it applies EVERYWHERE the dot renders (center-stage header + filmstrip tiles +
  collapsed pills; carries to future PiP/menu-bar). (e) Make the **filmstrip tile caption bar**
  (`.filmstrip-tile-header`, the name+dot overlay row) more transparent.
  **Operator decisions (verify-human 2026-06-25):** Running=breathe (opacity+scale), Awaiting=hard
  blink, applies everywhere, caption bar more transparent.
  **Observable outcomes:**
  - CLI: `pnpm vite build` succeeds; `tsc --noEmit` + `eslint` clean (CSS-only change touches no
    TS, but confirm the build is unbroken).
  - Browser/live (carried to verify-human): in the running app, a **Running** workspace's dot
    visibly breathes (slow pulse); an **AwaitingInput** dot blinks (fast on/off); Idle/Unknown
    dots are static; the filmstrip tile caption bar is more see-through than before.
  - CSS assertion (agent-verifiable, static): `.status-dot-running` carries a breathe
    `animation`; `.status-dot-awaiting` carries a blink `animation`; `@keyframes` for both exist;
    `.status-dot-idle`/`.status-dot-unknown` carry NO animation; `.filmstrip-tile-header`
    background alpha is lower than the prior `0.6`. Respect `prefers-reduced-motion` (disable the
    animation under it — accessibility; dark-only app but reduced-motion is orthogonal).
  - [x] P1.5.1 Added `@keyframes status-breathe` (opacity 1↔0.45 + `transform: scale(1↔1.15)`,
        ease-in-out) on `.status-dot-running` (1.8s) and `@keyframes status-blink` (opacity
        1↔0.1, `steps(1,end)` hard on/off) on `.status-dot-awaiting` (0.7s). Colors/box-shadows
        kept; scale via `transform` (no reflow; dot is `flex-shrink:0`).  <!-- status: done -->
  - [x] P1.5.2 Both animations wrapped in `@media (prefers-reduced-motion: no-preference)` so
        the pulse doesn't fire for motion-sensitive users — static state color still shows.  <!-- status: done -->
  - [x] P1.5.3 `.filmstrip-tile-header` background alpha `rgba(17,17,17,0.6)` → `0.35` — more of
        the live mirror shows through; scrim still legible.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — vite build green, tsc clean, eslint 0 errors (1 pre-existing XtermPane warning, untouched), prettier clean, CSS assertions pass -->
  - [x] verify-self  <!-- status: done (static slice + render-path trace) — visual carried to verify-human; see note below -->
  - [x] verify-human  <!-- status: done — VH1.5a–e all pass (operator 2026-06-25) -->
    - [x] VH1.5a: Running dot breathes (slow calm pulse)  <!-- status: pass -->
    - [x] VH1.5b: AwaitingInput dot blinks (fast hard flash, distinct from breathe)  <!-- status: pass -->
    - [x] VH1.5c: Idle/Unknown dots static  <!-- status: pass -->
    - [x] VH1.5d: filmstrip tile caption bar more transparent, legible  <!-- status: pass -->
    - [x] VH1.5e: animation visible across surfaces (header + tiles + pills)  <!-- status: pass -->
  - [x] verify-codify  <!-- status: done — CSS presentation; no new test warranted (class-application contract already covered by statusPresentation tests; visual verified at human tier). Frontend suite 456/456 green, no regression. -->

- [x] Phase 2: Gate Notification → AwaitingInput on notification_type  <!-- status: COMPLETE 2026-06-25 — operator-verified + codified -->
  **What:** the secondary refinement. Forward `notification_type` from the Perl hook through
  the wire DTO, and map `Notification` → AwaitingInput ONLY for genuine input-needed types;
  other types are a no-op (event dropped → prior state preserved, which is the existing `None`
  behavior — no new dropping logic needed). Then resync docs for the whole feature.
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk` passes incl. NEW tests: `hook_socket` parses
    `notification_type` into `Option<String>`; `notification_permission_prompt_maps_to_awaiting`
    (`Notification` + `notification_type:"permission_prompt"` → `Some(AwaitingInput)`);
    `notification_idle_prompt_is_a_noop` (`idle_prompt` → `None`); `notification_unknown_type_falls_back_to_awaiting`
    (unknown/absent type → `Some(AwaitingInput)`, honest default); the DTO serde-shape test
    includes the new optional `notification_type` key (present-when-set, omitted-when-absent).
  - CLI: `tsc --noEmit` + `eslint` clean + `pnpm vite build` succeeds with the optional
    `notification_type?: string` added to the TS `WorkspaceStatusUpdate` wire type.
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0; `cargo fmt --check` clean.
  - Manual/live (carried to verify-human): a `permission_prompt` Notification still turns the
    dot blue (re-run the harness); best-effort confirm an `idle_prompt` (60s+ idle) does NOT
    flip a busy workspace blue.
  - [x] P2.1 `claudesk-hook.pl` forwards `notification_type` (conditional re-emit, mirrors
        message/prompt) + wire-contract comment updated. Allow-list pinned in the Rust gate
        (P2.3): input-needed = `permission_prompt`, `elicitation_dialog`.  <!-- status: done -->
  - [x] P2.2 `hook_socket::HookEvent` gained `#[serde(default)] pub notification_type:
        Option<String>` + module-header wire-contract updated; added
        `parses_notification_type_when_present` + extended the legacy-line test to assert None.  <!-- status: done -->
  - [x] P2.3 `event_to_state` Notification arm gates via `notification_awaits_input()`:
        input-needed (`INPUT_NEEDED_NOTIFICATION_TYPES`) OR unknown/absent → AwaitingInput; a
        recognized informational type (`is_known_informational_notification`) → None (no-op,
        prior state preserved). `WorkspaceStatusUpdate` gained `notification_type` (snake_case,
        skip_serializing_if) + populated in `to_update`. Module-header state-mapping updated.  <!-- status: done -->
  - [x] P2.4 Frontend `workspaceStatus.ts` `WorkspaceStatusUpdate` gained optional
        `notification_type?: string` (wire-parity mirror only; reducer keys on `state` only —
        no mapping change). Pure fns unchanged.  <!-- status: done -->
  - [x] P2.5 Tests: 4 gating tests (`permission_prompt`/`elicitation_dialog`→Awaiting,
        `idle_prompt`/`auth_success`→noop, `unknown_type`→Awaiting-fallback) + a `to_update`
        carry+drop test + `hook_socket` parse test + DTO serde-shape extended (key present when
        set, omitted when None). 231 lib tests pass (was 224).  <!-- status: done -->
  - [x] P2.6 Doc resync: `arch.md` §A (4 events incl. PostToolUse + a new Notification-gating
        bullet + DTO field); `CLAUDE.md` hook-channel bullet (4 events + PostToolUse-resume +
        gating note); module headers (hook_install/status_broadcaster/hook_socket/claudesk-hook.pl)
        all updated during impl.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — perl -c OK, cargo test 231, clippy -D warnings exit 0, fmt clean, tsc clean, prettier clean, eslint 0 errors -->
  - [x] verify-self  <!-- status: done (static slice + wiring trace) — see note below; live carried to verify-human -->
  - [x] verify-human  <!-- status: done — VH2a–c all pass (operator 2026-06-25) -->
    - [x] VH2a: permission_prompt still turns the dot blue, orange on answer (gate didn't break the legit signal)  <!-- status: pass -->
    - [x] VH2b: idle nudge doesn't flip blue (accepted; unit-test-covered)  <!-- status: pass -->
    - [x] VH2c (installed-build parity): confirmed in the installed `.app`  <!-- status: pass -->
  - [x] verify-codify  <!-- status: done — coverage complete (7 tests TDD in build); no new test warranted. Full suites green: cargo 231/231, frontend 456/456, no regression. -->

## Current Node
- **Path:** Feature > ALL PHASES COMPLETE → ship
- **Active scope:** Phase 1 + Phase 1.5 + Phase 2 all COMPLETE + operator-verified + codified. Ready for `/feature-ship`.
- **Phase 2 verify-self note (backend-lifecycle posture):** No Playwright subagent — by design. The gating transform is pure + fully unit-tested (7 tests: permission_prompt/elicitation_dialog→Awaiting, idle_prompt/auth_success→noop, unknown→Awaiting-fallback, to_update carry+drop, hook_socket parse, DTO serde). Wiring trace PASS — hook forwards notification_type → HookEvent parses → event_to_state gates (mod.rs:130) → to_update carries into DTO (mod.rs:251) → frontend mirror (telemetry only). The no-op-preserves-prior-state property holds by construction: informational Notification → event_to_state None → to_update None → no emit → applyStatusUpdate not called → map keeps last state. The LIVE observable (a real idle_prompt/permission_prompt reaching the dot) needs the running app + is unobservable in the dev-seam browser → carried to verify-human VH2a–c.
- **Phase 1.5 verify-self note:** No Playwright subagent spawned — by design. The outcome is a PLAYING CSS keyframe animation (breathe/blink) + a translucency judgment, which a static Playwright snapshot can't meaningfully observe (captures one arbitrary-opacity frame; "more transparent" is a human visual call), and no dev-server/app is running in-session. Agent-verifiable slice done: (1) static CSS assertions (verify-auto) confirm the keyframes exist + are applied to `.status-dot-running`/`.status-dot-awaiting`, idle/unknown carry none, reduced-motion guard present, tile-header alpha 0.6→0.35; (2) render-path trace — `WorkspaceStatusIndicator.tsx:33` renders `status-dot ${dotClass}` where `dotClass` = `statusPresentation(state)` → `status-dot-running`/`status-dot-awaiting`, used in center-stage header + (shared class) filmstrip tiles + pills. The visual is carried to verify-human VH1.5a–e.
- **Blocked:** none
- **Unvisited:** Phase 2 (P2.1 → P2.2 → P2.3 → P2.4 → P2.5 → P2.6 → verify-auto/self/human/codify)
- **Open discoveries:** none open (Phase 1.5 from the operator UX request is now COMPLETE)

### Phase 1 verify-self note (backend-lifecycle posture per CLAUDE.md)
**No Playwright subagent spawned — by design, not omission.** Phase 1 changed only the Rust
hook channel (`CLAUDESK_EVENTS` 3→4) + the broadcaster transform (`event_to_state`
PostToolUse→Running); it touched ZERO frontend code (`workspaceStatus.ts` untouched — the
`running`→orange-dot mapping already existed). The `pgrep`/socket/hook-channel behavior is
unobservable in the dev-seam Vite browser (which shows the React frontend, not the Tauri
backend), and no app/dev-server is running in-session. Per CLAUDE.md "verify-self on
backend-lifecycle features is operator-only at the live tier," spawning Playwright against a
non-existent surface would only produce a spurious BLOCKING blank-page fail. Correct posture:
- **Static slice (agent-verifiable) — PASS:** `cargo test` 224 pass (incl. the captured-stream
  sequence test resolving `Running→AwaitingInput→Running→Idle`), `cargo clippy -D warnings`
  exit 0, `cargo fmt --check` clean (verify-auto).
- **Wiring trace (agent-verifiable) — PASS:** the connected path is unbroken end-to-end:
  CC `PostToolUse` → `CLAUDESK_EVENTS` registration (hook_install::commands `install()` on
  launch) → `claudesk-hook.pl` re-emits any `hook_event_name` (generic) → socket → hook_socket
  drain loop (`commands.rs:208 to_update`) → `to_update` (`mod.rs:189`) → `event_to_state`
  (`mod.rs:88` `"PostToolUse" => Running`) → emit `workspace-status` → frontend dot (orange).
  No integration-boundary gap: the consuming surfaces (the drain loop's `to_update`, the launch
  install path) are exercised by the unit tests + this trace.
- **Live tier (operator-only) — CARRIED to verify-human VH1–VH3.** The reproduction already
  PROVED CC emits PostToolUse on answer-resume; the only unconfirmed link is "Claudesk's running
  app flips the dot," which needs the installed/dev `.app`.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
[SURFACED-2026-06-25] Phase 1.5 — operator added UX scope at Phase 1 verify-human: status-dot animation (Running breathes = opacity+scale slow pulse; AwaitingInput hard on/off blink fast) on the shared dot classes (all surfaces), + filmstrip tile caption bar made more transparent. Presentation-only CSS; added as new Phase 1.5 (runs before Phase 2 Notification-gating). Not a separate backlog item — folded into this feature as in-scope polish on the same indicator.

## Verify-codify anchor (from reproduce)
The captured live stream (below) IS the red→green anchor: "fixed" means the
`UserPromptSubmit → Notification(permission_prompt) → PostToolUse → Stop` sequence resolves to
`Running → AwaitingInput → Running → Idle` (today it resolves to `Running → AwaitingInput → [drop] → Idle`
— stuck blue until Stop). verify-codify pins this as a `status_broadcaster` sequence test.
