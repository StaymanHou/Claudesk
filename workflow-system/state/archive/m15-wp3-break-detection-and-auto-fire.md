# Feature: M15 WP3 — Break detection + auto-fire across all open workspaces

**Workflow:** feature
**State:** Completed 2026-09-13
**Created:** 2026-09-13
**Milestone:** 15 (workflow supervisor)
**Size:** L
**Disposition:** ⚠️ **GO-WITH-CONDITIONS** (ruling R-6) — the three conditions are binding, not advisory.

## Problem Statement

Auto-chain adherence regressed 10x (0.36 → 3.63 breaks per 100 `Skill` invocations) when the
model moved to opus-5, and the class is **chronic** — three prior P1/P2 incidents pre-date
opus-5, so every prose mitigation has decayed. WP2 absorbed the state machine as typed code
(111 edges, 58 policy rows, `resolvePolicy` as the single funnel). WP3 is the **first
production consumer**: on CC turn end, read the transcript, apply the mechanical rule
(transition token → policy row → dispatchable? → did it already chain?), and where policy says
AUTO and the turn did not chain, **inject the next command** — in **every** open workspace, not
only the focused one.

⚠️ **The verdict lives in TypeScript (R-4, decided — do not re-open).** Rust does file IO only;
TS owns the parse, the lookup, the verdict, and both actions. No new backend→frontend IPC
direction is built.

⚠️ **The single open gate is probe Q2, and it came back `SEPARABLE` on a +1-record margin**
(sonnet 25/29 against a ≥24 bar; haiku is NOT_SEPARABLE at 23/29 on identical data, and only
70 of 96 records were scorable). That margin is why R-6's conditions exist and why the failure
direction must bias toward **withholding**: `injectCommand` has **no retry and no pre-send
cancel window** by design, so a wrong silent fire on an unwatched workspace is unrecoverable
except via CC's own **Esc**.

**No 3rd-party probe gap.** The one external-process integration (`claude -p`, task 3.7) was
covered by WP1's probe — 192 live calls, zero errors — and §4's exemption rationale is recorded
as **partially inverted by R-5** with a re-check owed at WP5. Proceed.

## Inherited contracts (read before writing a line)

**From `SURFACE-2026-09-12-WP3-INHERITS-A-TYPED-MACHINE-WITH-THREE-LIVE-CONTRACTS`:**

1. ⚠️ **The funnel guard WILL fail on the first consumer — BY DESIGN.**
   `workflowMachineFunnel.test.ts` pins the importer population by name. Read **which** tests
   fail: **2 failures** (`admits no importer outside the allowlist` + `records that NO
   production module consumes the machine yet`) = a correct consumer; add it to the allowlist
   and update the vacuity note. **3 failures** (with `wires graph to policy in exactly ONE
   module`) = the consumer is importing `edges` **and** `policy` to hand-roll the derivation —
   ⚠️ **route it through `resolvePolicy`; do NOT widen the allowlist.**
2. ⚠️ **`unmapped` is a RESULT, never a default.** 31 of 111 edges have no governing row and the
   union arm structurally has no `cell`. ⚠️ **No `?? "auto"` fallback anywhere near this** — it
   would fire on 31 ungoverned edges including `I2` (report → triage), which **is** dispatchable.
3. ⚠️ **The funnel already applies `resolveCell` + the incident override.** Never re-apply, and
   never read `POLICY_ROWS` columns directly.

**Plus:** `extractTransitionId()` already lives at `src/state/workflowMachine/transitionToken.ts`
(moved out of the test file at WP2's code-quality review). ⚠️ **Import it — do not re-derive a
second regex.** A bare `/F[0-9]+/` captures the WRONG id on `F10b` rather than failing to match.

**From `AUTO-CELL-DOES-NOT-IMPLY-A-DISPATCHABLE-TARGET`:** policy says *"may I chain?"*;
`dispatchTarget` says *"is there anything to chain to?"*. Read both **independently** and fire
only when both say yes. ⚠️ **The model makes this easy but does not enforce it at the call
site** — that is the remaining risk and an explicit code-review item.

**From `CHAIN-DETECTION-WINDOW-MUST-NOT-CLOSE-EARLY`:** only a real **user prose turn** closes
the window. Tool results arrive with role=`user` and MUST be skipped, as must
`system`/`attachment`/`queue-operation` lines. Proven case: session `06eb0e92` turn 504 chained
correctly at line 511 after two `Bash` calls. Erring permissive is correct (M-3: naive
predicates over-flag 15x).

**From `TRANSITION-TOKENS-ECHO-ONTO-USER-LINES`:** ~half of all `TRANSITION:` occurrences sit on
**user** lines (559 user / 555 assistant across 40 files) — skill bodies and tool results echo
the transitions table. ⚠️ **Scope the parse to the LAST ASSISTANT text block of the turn.** A
file-level grep reads documentation as emitted verdicts.

**From `[[classifier-must-key-on-the-classified-property]]`** (binds the detector directly): key
on the property being classified, not one that merely correlates with it. The failure mode is a
**silent under-report**.

**From `[[derived-state-is-not-a-proxy-for-its-event]]`:** `Stop` maps to **both** `Idle` **and**
`BackgroundWork`. Matching only `Idle` is the shipped-CRITICAL shape.

**From `[[workspace-status-map-collapses-consecutive-events]]`:** read `is_turn_start` off the
**RAW** event stream, never the folded `WorkspaceStatusMap`.

## Work Tree

- [x] Phase 1: Turn-end trigger + `session_id` on the wire  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 — `cargo test` covers `event_is_turn_end` matching **both**
    `Stop→Idle` and `Stop→BackgroundWork`, and the DTO round-trips `session_id`.
  - CLI: `grep -c 'pub session_id' src-tauri/src/status_broadcaster/mod.rs` ≥ 1 — the field the
    hook parses at `hook_socket/mod.rs:74` now reaches `WorkspaceStatusUpdate` instead of being
    dropped before the DTO.
  - Browser (live app, MCP bridge): with a workspace open, a real CC turn end emits one
    `workspace-status` event whose payload carries `is_turn_end: true` **and** a non-empty
    `session_id`; captured via a `listen` tap in `webview_execute_js` and asserted on the raw
    payload, not the map.
  - Console: no JS errors on app boot; `#root` has children (boot smoke-test — a deleted export
    is a RUNTIME failure, per the M13.5 WP3 blank-app lesson).
  - [x] P1.1 Backend: classify turn **end** as a named predicate beside `event_is_turn_start`
        (`status_broadcaster/mod.rs`). ⚠️ Match **every** state `Stop` can map to — `Idle` and
        `BackgroundWork`. Surface as its own `is_turn_end` field, `skip_serializing_if`, so an
        older payload degrades to "no marker" rather than a wrong one.  <!-- status: DONE -->
  - [x] P1.2 Backend: thread the hook's `session_id` through to `WorkspaceStatusUpdate` (task
        3.2). ⚠️ This is the uuid↔workspace disambiguator — `WorkspaceRegistry` keys on path
        ALONE and is 1:1, so two CC sessions in one tree are indistinguishable today
        (`SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS`).  <!-- status: DONE -->
  - [x] P1.3 Frontend: mirror both fields in `workspaceStatus.ts`'s `WorkspaceStatusUpdate`.
        ⚠️ The reducer must NOT read them — per-event data belongs to per-event subscribers
        only (same posture as `is_turn_start`/`notification_type`).  <!-- status: DONE -->
  - [x] P1.4 Frontend: a raw per-event subscriber seam (`useTurnEnd`-style) that hands each
        turn-end event to a callback. ⚠️ Subscribes to the **raw** `workspace-status` stream,
        never `WorkspaceStatusMap`.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE -->
    - [x] P1.verify-human.1 Real CC turn in the operator's own app: status behaves exactly as
          before; no new UI appears  <!-- status: DONE -->
    - [x] P1.verify-human.2 Tray + filmstrip still show correct live per-workspace status —
          the DTO-change regression check (the tray parses this payload in-process)  <!-- status: DONE -->
    - [x] P1.verify-human.3 Operator accepted the captured live evidence: distinct `session_id`
          per workspace, and `is_turn_end=true` on BOTH Stop-mapped states  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE -->

- [x] Phase 2: Transcript reader (Rust file IO + TS parse)  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 — the slug derivation is unit-tested against the
    **realpath** footgun (`/tmp/foo` → `-private-tmp-foo`, not `-tmp-foo`), and the
    last-assistant-block parse is tested against a fixture containing a `TRANSITION:` token on a
    **user** line that must NOT be read as an emitted verdict.
  - CLI: a fixture-driven test proves `extractTransitionId` is **imported** from
    `workflowMachine/transitionToken`, not re-derived —
    `grep -c 'TRANSITION:\\\\s' src/` finds the regex in exactly ONE non-test module.
  - Browser (live app, MCP bridge): `invoke("cc_transcript_tail", {...})` against this project's
    own live transcript returns JSONL lines; a TS parse of them yields the last assistant text
    block and a `TRANSITION:` id where one was emitted.
  - Console: no JS errors; no unhandled Tauri rejection (every `invoke` has a `.catch`).
  - [x] P2.1 Rust: a **file-IO-only** command that resolves a workspace's transcript dir from
        the project path (⚠️ `realpath` first — `pwd -P`, `/` and `.` → `-`) and returns the tail
        of the session's `.jsonl`. ⚠️ **Reading a bounded tail, not the whole file** — the corpus
        is live and this project alone has 242 transcripts.  <!-- status: DONE -->
  - [x] P2.2 TS: parse JSONL → turns. ⚠️ Scope the token search to the **LAST ASSISTANT text
        block**; user/system/attachment/queue-operation lines are documentation, not verdicts.  <!-- status: DONE -->
  - [x] P2.3 TS: import `extractTransitionId` from `workflowMachine/transitionToken`.
        ⚠️ **Do NOT write a second regex.**  <!-- status: DONE -->
  - [x] P2.4 TS: the chain-detection window — scan forward for a `Skill` call, closing **only**
        on a real user **prose** turn. ⚠️ Skip tool results (role=`user`), system lines, and
        re-quoted `TRANSITION:` tokens.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE -->
    - [x] P2.verify-human.1 Operator confirmed `cc_transcript_tail` in the plan was a STALE
          OUTCOME STRING, not a code defect — `transcript_tail` is the correct name and
          stands (2026-09-13, "ok. good")  <!-- status: DONE -->
    - [x] The `06eb0e92` turn-504 case is covered by the codified test
          `⚠️ still sees the chain after intervening tool calls` rather than by hand — and
          was additionally confirmed LIVE against this session's own transcript at
          verify-self (read `F10` → chained → `feature-verify-self`)  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE -->

- [x] Phase 3: The verdict — policy lookup + dispatchability + idempotency  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 — but ⚠️ **the funnel guard fails FIRST, by design.** Record
    in the WIP which tests failed: **2** = correct consumer (allowlist it); **3** = hand-rolled
    derivation (route through `resolvePolicy` instead).
  - CLI: a test proves the verdict reads policy **and** `isDispatchable` independently — a
    fixture edge with an AUTO cell and a NON-dispatchable target yields **no fire**.
  - CLI: a test proves `outcome: "unmapped"` yields **no fire** and is never coerced to auto;
    `grep -c '?? "auto"' src/` returns **0**.
  - CLI: replay against `wp1-break-fixture.json` — the verdict reproduces the probe's break
    population. ⚠️ **Do NOT score against a fixture this detector's own table produced**
    (`[[detector-scored-against-its-own-table-is-circular]]`); the fixture is WP1's, built from
    operator behavior, which is the independent signal.
  - Console: no JS errors on boot.
  - [x] P3.1 TS: the verdict module — `resolvePolicy(edgeId, mode, context)` → check
        `isDispatchable(edge.dispatchTarget)` → check the chain window. Fire **only** when all
        three say yes. ⚠️ **The stored drive mode is the authority (R-1)** — read
        `default_drive_mode` from `projects.json`; **Mode 0 is NOT honored as a suppressor.**  <!-- status: DONE -->
  - [x] P3.2 ⚠️ Handle **every** `PolicyResolution` arm explicitly: `resolved` / `unmapped` /
        `unknown-edge`. No default branch that reads as auto.  <!-- status: DONE -->
  - [x] P3.3 Idempotency keyed on the **TURN**, never a corpus-wide count. ⚠️ **The supervisor
        reads its own writes** — the scanned total was observed drifting 2282 → 2284 → 2286
        within one session.  <!-- status: DONE -->
  - [x] P3.4 Update `workflowMachineFunnel.test.ts`: add the consumer to the allowlist and
        replace the "NO production module consumes the machine yet" assertion with its live
        successor. ⚠️ **The guard must not go vacuous** — it must still fail on a NEW unlisted
        importer after this edit (mutation-prove it, and confirm the mutant landed in
        **executable** code).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE -->
    - [x] P3.verify-human.1 Operator accepted **34/36 (94%)** on the 36 `GROUND_TRUTH_BREAK`
          records as Phase 3's replay result, and accepted the scoring METHOD (the independent
          operator-nudge signal, not the circular full 2,284)  <!-- status: DONE -->
    - [x] Funnel-test review confirmed: exactly 2 failures, `wires graph to policy in exactly
          ONE module` PASSED — the consumer routes through `resolvePolicy`  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE -->

- [x] Phase 4: The adjudicator — pinned, withholding-biased  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 — tests prove the model is **pinned to `sonnet`** and that
    absence/change **fails loudly**, not silently. ⚠️ `haiku` is NOT_SEPARABLE on identical data.
  - CLI: tests prove **every** failure path (error / timeout / unavailable / unparseable
    response) returns **WITHHOLD**, never fire. ⚠️ R-6 condition 2 — a fabricated "fire" default
    is the unrecoverable direction.
  - CLI: a test proves **every** fire candidate routes to the adjudicator, not just the
    verify-human-adjacent class. ⚠️ The narrow router sends 40 of 96 and misses 10 of 32
    awaiting-turns.
  - CLI: `claude -p` invoked with the pinned model against a fixture tail returns a parseable
    verdict; exit 0.
  - Console: no JS errors; no unhandled rejection on the adjudicator path.
  - [x] P4.1 The `claude -p` call behind a Rust command (external-process spawn). ⚠️ It inherits
        the app-wide login-shell `PATH` from `env_path/` — do **not** add a per-spawn PATH hack.  <!-- status: DONE -->
  - [x] P4.2 ⚠️ **Pin the model explicitly and assert it.** A silent downgrade regresses the
        supervisor with no code change and no signal.  <!-- status: DONE -->
  - [x] P4.3 ⚠️ **Bias every failure toward WITHHOLDING** — timeout, non-zero exit, empty or
        unparseable output, binary absent. Treat the adjudicator as a first-class component with
        real failure handling (R-5 accepted cost), not best-effort polish.  <!-- status: DONE -->
  - [x] P4.4 Route **all** fire candidates through it, behind the mechanical path. ⚠️ ~3s per
        fire on the critical path is the accepted cost.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE; outcome 5 (live console) is N/A-this-phase: zero invoke() calls, zero frontend callers, zero consumers of decideSupervised — no adjudicator path exists to exercise until Phase 5 wires it. Carried to Phase 5's verify, not silently passed. -->
  - [x] verify-human  <!-- status: DONE -->
    - [x] P4.verify-human.1 Live console: **N/A this phase** (no adjudicator path exists to
          exercise) — operator accepted carrying it to Phase 5's verify  <!-- status: DONE -->
    - [x] P4.verify-human.2 Operator accepted the **~3.6s per-fire** cost on the critical path
          AND the **20s** adjudicator timeout as built (2026-09-13, "approved")  <!-- status: DONE -->
    - [x] The "rename/hide `claude`" check is CODIFIED rather than manual: `NotFound` →
          withhold is covered in Rust (`a_missing_binary_errors_rather_than_returning_empty_output`)
          and TS (`withholds when the runner rejects`)  <!-- status: DONE -->
    - [x] "Instruction-to-reply is withheld" was confirmed **LIVE** at verify-self: a real
          `claude -p` returned `AWAITING` on "Run X and reply all pass"  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE -->

- [x] Phase 5: Fire + fan-out across all open workspaces  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 — tests prove the fan-out is a loop over **all** registered
    workspaces, and that a per-workspace failure does not abort the others.
  - Browser (live app, scratch workspaces): with `tmp/scratch/scratch-a` and `scratch-b` both
    open and `scratch-b` **unfocused**, a turn in `scratch-b` that emits an AUTO+dispatchable
    transition without chaining results in the next command appearing in **`scratch-b`'s**
    terminal. ⚠️ Evidence must be **execution-side**, not just typing-side — output body + a
    state change, per `[[observable-outcomes-execution-evidence]]`.
  - Browser: ⚠️ **The negative arm, asserted as hard as the positive (task 3.8)** — a legitimate
    `verify-human` PAUSE, an `ESCALATE`, and a Mode-0 direct invocation each produce **NO fire
    at all** in a live workspace.
  - Console: no JS errors; every `injectCommand` rejection is caught and `console.warn`ed with a
    distinct label.
  - [x] P5.1 Fire via `injectCommand(sessionId, command, onIpcError?, label)`. ⚠️ Pass a
        **distinct `label`** — reuse without one misattributed failures once already. ⚠️ The
        `invoke` MUST have a `.catch`.  <!-- status: DONE -->
  - [x] P5.2 ⚠️ Honor the settle ordering — do **NOT** raise the shared `INJECT_SETTLE_MS`
        (1500 ms); the settle's *starting line* matters more than its value (the M12/v0.3.3
        defect). ⚠️ `cc_ready` is NOT a CC-readiness signal.  <!-- status: DONE -->
  - [x] P5.3 Fan out across **all** open workspaces (task 3.6). ⚠️ Per-workspace verdicts are
        pure and independent by construction, so this is a loop, not a wrapper. ⚠️ **Funnel every
        fire through ONE function and guard THAT** — the standing local defect shape (a
        mechanism correct in itself behind a caller that does not honor it) has bitten this repo
        four times, twice in M11 WP4 with one shipped CRITICAL.  <!-- status: DONE -->
  - [x] P5.4 The negative arm (task 3.8) as first-class tests, not an afterthought.  <!-- status: DONE -->
  - [x] P5.5 Record R-4 (TS verdict, Rust file-IO-only) in `arch/` as the supervisor's boundary
        (task 3.0). ⚠️ **Decision already made — record it, do not re-open it.** Goes in the
        subsystem file it belongs to, NOT a new milestone section.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE -->
    - [x] P5.verify-human.1 Operator accepted the live evidence (unfocused fire, opt-in
          negative, idempotency, mode-sensitivity) as sufficient  <!-- status: DONE -->
    - [x] P5.verify-human.2 Operator accepted the in-place label fix AND its stated remaining
          debt (assert the call site PASSES the label at wiring time)  <!-- status: DONE -->
    - [x] "Watch a real unfocused workspace chain a real phase" — DONE LIVE at verify-self:
          `scratch-a` (unfocused, `orchestrated`) fired `/feature-verify-auto`  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE -->

## Current Node
- **Path:** Feature > review-quality (complete) > finalize next
- **Active scope:** none — shipped as `e186e33` (24 files, +4358/-14). ⚠️ **NOT PUSHED:** `main`
  is ahead 8 / behind 1 and the divergence is NOT a fast-forward (flagged in the inbound
  handoff); a rebase-or-merge is the operator's call. ⚠️ **Code-quality review DONE:** 0 CRITICAL,
  3 MAJOR + 4 MINOR auto-backlogged (1 MINOR fixed in place), pointer in `backlog.md`. Next:
  `/feature-finalize`.
  ⚠️ Phase 4's carried live-console check is now meaningful and belongs to this phase's verify.
- **Blocked:** none
- **Unvisited:** none — all five phases complete
- **Phase 1 codified:** +4 Rust tests (incl. the consuming-surface emit-path test) and +6
  frontend predicate tests; Rust 869→870, frontend 2412→2418.
- **Phase 2 codified:** +13 Rust (transcript module + the extracted `select_transcript`) and
  +25 frontend (parse contract + a committed REAL-transcript fixture); Rust 870→883,
  frontend 2418→2440.
- **Phase 3 codified:** +24 frontend (verdict contract, FireLedger, and the REPLAY test that
  finally executes WP1's spec against the real implementation); frontend 2440→2464.
- **Phase 4 codified:** +4 Rust (spawn/timeout/reap contract) and +25 frontend (the three R-6
  conditions, the hybrid's ordering, the operator-accepted 20s pin, and a Rust→TS error-string
  contract test that reads the REAL Rust source); Rust 883→887, frontend 2464→2489.
- **Phase 5 codified:** +20 frontend (the negative arm with zero-injection assertions, the
  ledger ordering, failure isolation reaching the real `allSettled` guard, the injection-label
  contract, and a WHOLE-PIPELINE test over the committed real transcript with its anti-vacuity
  control); frontend 2489→2509.
- **WP3 TOTALS:** Rust 869→887 (+18), frontend 2412→2509 (+97).
- **Open discoveries:** none

## Retrospect

- **What changed in our understanding:**
  - ⚠️ **An agent-launched Claudesk cannot produce a real CC hook event.** The spawned CC
    inherits `CLAUDE_CODE_CHILD_SESSION`, so transcript saving is OFF and the hook chain never
    fires — a full live turn left the status at `Unknown`. The working substitute is writing
    hook JSON directly to the dev app's `hook.sock`, which drives the REAL backend path
    (only the CC process is replaced, no Claudesk code is stubbed). This was not anticipated
    and it shapes how every future live status check must be driven.
  - ⚠️ **`git checkout --` silently no-ops on an UNTRACKED file** and exits 0. It left a
    mutation probe in place in `fanOut.ts`; only a pre-captured `shasum` caught it. For any
    mutation test on a new module, `git diff`/`git checkout` are not weak evidence — they are
    **inapplicable**. Logged high-priority.
  - **A redaction verified field-by-field verifies nothing.** The committed fixture leaked
    4,443 chars of the prior session's handoff via `toolUseResult.stdout` — a field the
    redactor never named — while a grep of the fields it DID redact came back clean. The right
    question is the inverse and content-shaped: *what is still unredacted?*

- **Assumptions that held:**
  - R-4's Rust/TS split held cleanly with no logic leakage (confirmed at review).
  - The WP2 handoff's predicted funnel-guard signature was exact — **2 failures = correct
    consumer** — and it fired identically all three times a consumer landed.
  - `is_turn_start` was consumable as-is; only the turn-END correlate was net-new.
  - The mechanical rule decides the dominant path; the adjudicator stayed demoted to the tail.

- **Assumptions that were wrong:**
  - ⚠️ **My own tests were weaker than their names claimed, three times, and only mutation
    testing found it.** (1) `isUserProseTurn`'s two arms MASKED each other — deleting either
    left the suite green. (2) The failure-isolation test threw from `readTail`, which `fireOne`
    catches internally, so `Promise.all` never saw a rejection and the test proved nothing.
    (3) The NUL-separator collision test embedded a NUL in the INPUT — a character that never
    occurs in a real path — so it passed even with a naive `-` separator.
  - ⚠️ **A mutation that does not land looks exactly like a surviving mutant.** One `perl -pi`
    silently failed to match; I nearly recorded "the guard is weak" from an invalid probe.
  - **The WP1 fixture is label-circular.** Every one of its 2,284 records is labelled by the
    same policy table the detector uses, so the obvious full-corpus score is an arithmetic
    identity. Only the 36 operator-nudge records are independent signal.
  - **`F5` is PAUSE in `orchestrated`.** My first live fixture assumed AUTO; the supervisor was
    right and the fixture was wrong.

- **Approach delta:**
  - Plan followed phase-for-phase; no back-loops, no re-plan.
  - **Two deviations, both recorded:** one in-place fix at Phase 5 verify-self (the injection
    label, all three shortcut gates met), and the P5.5 arch record landed in
    `arch/session-resumption.md` rather than a new file, since that doc already owns
    "Claudesk reads the workflow's world; it does not write it."
  - ⚠️ **The review's verdict on the debt is worth carrying into WP4:** three MAJORs, one
    shape — *a contract stated in PROSE where it could have been stated in a TYPE*. My
    verify-self fix for the injection label chose the documentation form when the structural
    one (widen the dep signature) was available. That is the habit to correct, not the
    instance.

## Code-Quality Review — m15-wp3-break-detection-and-auto-fire

Reviewed against ship commit `e186e33` by a fresh-context subagent, 2026-09-13.
**0 CRITICAL · 3 MAJOR · 5 MINOR.** Drive mode `autopilot` → MAJORs auto-backlogged with chat
surface; MINORs auto-backlogged.

### Strengths
- The three-gate structure in `decideVerdict` is genuinely enforced, not merely conventional:
  `resolvePolicy` has exactly ONE production caller, and the dispatchability read sits in that
  same function — no reachable path reads a policy cell without also reading `isDispatchable`.
- `FireLedger.claim()` is race-free by construction: the `has`-check and the `add` are one
  synchronous block with no `await` between, so JS run-to-completion guarantees no two
  `fireOne` calls win the same key. Claiming before ADJUDICATION (not just injection) closes
  the ~3s window — the non-obvious half.
- `adjudicator.ts` has no route to `PROCEED` except the pinned model's exact-match reply; all
  failure arms funnel through one `withheld()` helper typed `Exclude<…, "model">`, so a new
  failure arm cannot accidentally be typed as a success.
- The R-4 language boundary holds on both sides with no logic leakage.
- The funnel guard was STRENGTHENED, not relaxed: vacuous `toEqual([])` → exact-set assertion.
- The real-fixture pipeline tests pair a positive case with an anti-vacuity control.

### Issues

**CRITICAL**
- (none)

**MAJOR**
- `[fanOut.ts:149-170]` — `fireOne` calls `readTurn`, then `decideSupervised` calls it AGAIN on
  the same input. The ledger key comes from the first reading; the fire/withhold decision from
  the second. They agree today only because `readTurn` is deterministic, and **nothing asserts
  that coupling**. A future parameter or short-circuit would desynchronize the claimed key from
  the decided turn — a key claimed for turn A while a fire is issued for turn B, defeating
  idempotency with no error. Fix: pass the computed `TurnReading` into the verdict, or pin the
  agreement with a test.
- `[fanOut.ts:74-96]` — `SUPERVISOR_INJECT_LABEL` exists but `FanOutDeps.inject` has **no label
  parameter**, so the requirement is enforced only by a doc comment and a source-text test.
  ⚠️ **The cheap structural fix was available now:** widen the dep to
  `(pty, command, label)` and have `fireOne` pass the label itself, making omission impossible.
  As shipped, the guard is documentation checking documentation.
- `[verdict.ts:117-123]` — the "no stored drive mode" refusal returns `reason:
  "policy-not-auto"`, overloading a reason documented as *"the policy says pause"* onto a case
  where **no policy was consulted at all**. An operator debugging "why didn't my project fire?"
  is sent to the policy table instead of the unset `default_drive_mode`. Wants its own
  `not-supervised` arm. (The tell: `fanOut.test.ts:97` asserts only `fired === false`.)

**MINOR**
- Comment density 43–53% in the TS supervisor modules, and the **duplication** half of the
  comment budget is breached: three measured facts appear in 3–6 places each *within one diff*
  (the 40-of-96 router rationale; the 2282→2284→2286 drift; the "bitten four times" framing).
  ⚠️ Duplication, not length, is the expensive half — copies drift asymmetrically.
- `[adjudicator/mod.rs:214-240]` — `run_program_with_timeout` in the test module RE-IMPLEMENTS
  the production wait/kill loop, so the timeout test proves the copy kills its child, not that
  `run_adjudicator` does (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`).
- `[adjudicator/mod.rs:110-115]` — `AdjudicateError::Failed` discards the captured stderr
  (`String::new()`), so the one diagnostic for a failing `claude -p` always prints blank.
- The supervisor has **zero production callers** — deliberate and disclosed, but it means
  `assertPinnedModel`, the sole enforcement of R-6 condition 1, currently pins nothing at
  runtime. ⚠️ Name this in WP4's plan so it does not lapse.
- ✅ **FIXED IN PLACE:** the WIP recorded ship SHA `8dbc660`, which does not exist (a pre-amend
  SHA). Corrected to `e186e33` and verified with `git cat-file -e`. A wrong SHA in an archived
  WIP is worse than none.

### Assessment
Strong work, above the bar for a feature whose failure direction is unrecoverable. Every
load-bearing invariant holds under scrutiny. The tests are unusually honest — anti-vacuity
controls, recorded mutation-testing corrections, and an explicit refusal to score against a
circular fixture. **The debt is modest and of one kind: contracts stated in PROSE where they
could have been stated in a TYPE** — the injection label, the reading-vs-key coupling, the
overloaded reason. Each converts a comment into a compiler or a test.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`feature-finalize` archives the WIP.

## Deferred to WP5 (not this WP's scope)
- ⚠️ **R-6 condition 3 — re-measure the Q2 margin on a larger labelled set.** The +1-record
  margin is accepted for WP3's build; the re-measurement is a milestone-exit obligation, not a
  build-phase one. ⚠️ **Do not let it silently lapse** — it is the condition most likely to be
  forgotten because nothing fails without it.
- ⚠️ **Re-check §4's exemption of the adjudicator from its own probe WP** — R-5 partially
  inverted the rationale by making it load-bearing for correctness.
- ⚠️ **`CLAUDE.md:214` is STALE** — says "113 transition rows… 89 pause-policy rows"; measured
  **111** and **81**. Already tracked as a P5.4 resync item.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-09-13] ship — ⚠️ **A REDACTION MISSED A FIELD, CAUGHT AT SHIP CLEANUP.** The
committed real-transcript fixture was redacted field-by-field (`text` / `prompt` / `content`),
which silently left **`toolUseResult.stdout` — 4,443 characters of the PREVIOUS session's
handoff** in a file about to be committed. Half the fixture's bytes were unredacted session
content.

⚠️ **Why the original check passed:** I grepped `"text":"…"` and found nothing, concluding the
redaction held. But the leak was in a field I had not thought to name — **an allowlist
redactor only covers the fields you remember**. The correct check is the inverse and is
content-shaped, not field-shaped: *are there ANY long strings left that do not say
`[redacted]`?* That question found it immediately.

**Fixed:** the redactor now walks the whole object and redacts **every** string over 40 chars
wherever it appears, preserving only a real `TRANSITION:` token. Fixture 9020 → 4112 bytes,
zero unredacted strings, and all **97** supervisor tests still pass — the tests assert on
STRUCTURE, which is what the fixture is for.

⚠️ **Generalizable:** when redacting captured data for commit, verify by asking "what is still
unredacted?" over the whole artifact — never by confirming the specific fields you redacted are
clean.

[SURFACED-2026-09-13] Phase 5 verify-human — ⚠️ **THREE CHECKS ARE CARRIED TO THE WIRING WORK
(WP4), NOT SATISFIED BY WP3.** Recorded as a Discovery rather than a Work-Tree leaf because a
leaf is a unit of work and these are notices about work that belongs to a later WP — leaving
them as unticked children would have blocked Phase 5's parent-completion invariant
(`[[feedback_surfaced_in_discoveries_not_worktree]]`).

1. **The `injectCommand` → PTY hop.** Phase 5's live run drove everything upstream of it for
   real; `inject` was a recording stub because the pty session id is not reachable from the
   page (`__TAURI_INTERNALS__` exposes no patchable `invoke`).
2. **Esc recovery for a deliberately-chained one-step run** (R-1's accepted cost, to be
   OBSERVED rather than assumed).
3. ⚠️ **Installed-`.app` smoke test.** The adjudicator spawns an external process, so the
   GUI-PATH failure mode applies and **`pnpm tauri:dev` will NOT reproduce it** — it inherits
   the terminal's `PATH`. This one is mandatory per `docs/lessons/verify-self-tiers.md`.

⚠️ **None is exercisable until a production caller wires `FanOutDeps.inject`.** Claiming them at
WP3 would be a false pass.

[SURFACED-2026-09-13] Phase 5 verify-self — ✅ **THE SUPERVISOR FIRED END TO END ON THE LIVE
APP.** Driven through the REAL `transcript_tail` IPC, the REAL `supervisor_adjudicate`
(`claude -p`), and the REAL policy graph, against two live workspaces reading their own
on-disk transcripts:

| case | result | injections |
|---|---|---|
| `scratch-a` (`orchestrated`, **UNFOCUSED**) | **fired `/feature-verify-auto`** | 1 |
| `scratch-b` (`Drive Mode: None`) | no fire (`no-verdict`) | 0 |
| two sweeps, one ledger | fire → `already-fired-for-this-turn` | **1 total** |
| same transcript, `stepping` | `policy-not-auto` | 0 |
| same transcript, no stored mode | `policy-not-auto` | 0 |

**5.35s** for the firing sweep including a real adjudication (consistent with the ~3.6s measured
at Phase 4). Clean boot, `#root` mounted, zero supervisor warnings, self-tested error tap.

⚠️ **The mode-sensitivity is REAL, not asserted:** the IDENTICAL transcript fires in
`orchestrated` and withholds in `stepping`. ⚠️ **And a mid-run correction worth keeping:** my
first live fixture planted `F5`, which came back `policy-not-auto` — I checked before assuming a
bug and found **`F5` genuinely IS PAUSE in `orchestrated`** (it is AUTO only in autopilot). The
supervisor was right and the fixture was wrong; `F8` was the correct AUTO+dispatchable edge for
that mode.

⚠️ **What this run did NOT prove:** the final `injectCommand` → PTY hop. The pty session id was
not reachable from the page (`__TAURI_INTERNALS__` exposes no patchable `invoke` — caveat (l)),
so `inject` was a recording stub. Everything upstream of it is real. **The PTY hop is exercised
by `injectCommand`'s own M12/M13 callers and is what WP4/Phase 6 wires** — carried, not claimed.

[SHORTCUT-2026-09-13] P5.1 — **In-place fix at verify-self (all three gates held).** The
Phase-5 subagent found a real defect in review: `FanOutDeps.inject` carried no label, and
`injectCommand`'s fourth argument DEFAULTS to `"auto-resume"`. Since `console.warn` is the only
failure channel that path has (no toast, operator decision), a wiring site calling bare
`injectCommand(pty, cmd)` would make every supervisor failure read as *"auto-resume: …"* —
pointing the one available diagnostic at M12's arm. ⚠️ **This is the exact defect that forced
the `label` parameter to exist** (M13's skill row inherited the same default). **Fix:** exported
`SUPERVISOR_INJECT_LABEL = "supervisor"` + a documented requirement on the `inject` dep + two
tests (collision-freedom, and the contract being stated where a wiring author reads it).
**Re-verified by a FRESH subagent invocation**, per gate 2. ⚠️ **Owed at wiring time (WP4/Phase
6): extend the second test to assert the call site actually PASSES the label** — a constant
nobody passes is documentation, not a guard.

[SURFACED-2026-09-13] Phase 4 verify-self — ✅ **The adjudicator was exercised LIVE, and the
run produced two facts no test could:**

1. ⚠️ **The strict exact-match parser survives real model output.** `claude -p --model sonnet`
   returns a **bare token with no trailing punctuation** (`PROCEED`, `AWAITING`), exit 0, in
   **~3.6s** — matching R-6's accepted ~3s cost. This was a genuine risk: a model that replied
   `"PROCEED."` would have hit the strict parser and **withheld every single time**, i.e. the
   adjudicator would have looked "safe" while being permanently broken. Verified across three
   tail shapes, including the **instruction-to-reply** case ("Run X and reply all pass"), which
   R-5 identified as the real discriminator over the refuted question-mark predicate.

2. ⚠️ **EMPIRICAL JUSTIFICATION FOR CONDITION 1 (the model pin).** `haiku` on the SAME tail
   returns a **plausible, correctly-formatted `AWAITING`**. So a silent downgrade yields no
   error, no malformed output, and no visible signal at all — it is only detectably worse in
   AGGREGATE (23/29 vs 25/29 against a ≥24 bar). ⚠️ **Nothing except `assertPinnedModel`
   throwing would ever catch it.** The condition is not defensive boilerplate; a per-call
   sanity check provably cannot substitute for it.

[SURFACED-2026-09-13] Phase 3 verify-self — ✅ **Fixture replay scored against the
INDEPENDENT signal, not the circular one.** ⚠️ `wp1-break-fixture.json`'s `label_basis` is
`policy-row:…` on EVERY record — the labels were produced by the SAME policy table the
detector now uses, so scoring against the full 2,284 would be an arithmetic identity, not
evidence (`[[detector-scored-against-its-own-table-is-circular]]`). The fixture does carry a
non-circular subset: **36 records with `confidence: GROUND_TRUTH_BREAK`**, each also marked
`prodded_by_user: true` with the operator's own nudge text (e.g. `"so?"`) — labelled by
**operator behavior**, which the detector does not produce.

**Result on that set: 34/36 fire (94%).** ⚠️ **Both misses are CORRECT behavior, verified
edge-by-edge, not defects:**
- **`I2`** (report → triage) → `unmapped`, reason `no-row-upstream`. The known upstream gap.
  Firing would require exactly the `?? "auto"` fallback the inherited contract forbids.
- **`I6`** (investigate → mitigate) → `policy-not-auto`. Row *"before mitigate (I6)"*, cell
  **PAUSE** at the incident-forced Mode 2. The operator nudged past a pause the upstream policy
  deliberately places before mitigating — the policy being right and the operator overriding
  it, which is not a detector error.

⚠️ **The whole-corpus agreement (82/96 FIRE, 1716 NO_FIRE, 472 UNDECIDED) is recorded as SHAPE
ONLY and is explicitly NOT a score** — it is the circular comparison. The 13
`FIRE→policy-not-auto` disagreements are the same incident-override class as `I6`.

[SURFACED-2026-09-13] Phase 2 verify-self — ⚠️ **A Phase-2 Observable Outcome names a
command that does not exist.** The plan's outcome 3 says `invoke("cc_transcript_tail", …)`; the
command as designed and registered is **`transcript_tail`** (`lib.rs:470`). ⚠️ **This is a STALE
OUTCOME STRING, not a code defect** — the `cc_` prefix belongs to the PTY/session commands
(`cc_input`, `cc_spawn`, `cc_ready`) and was pattern-matched into the plan before the module
existed; the transcript reader is not a CC-session command. Verified live under the REAL name.
⚠️ Worth noting as a plan-hygiene signal: an outcome that names an identifier can go stale
between plan and build, and a verifier trusting the string would report a false FAIL.

[SURFACED-2026-09-13] Phase 2 P2.3 — ✅ **The funnel guard fired exactly as designed and is
RESOLVED.** `src/state/supervisor/transcript.ts` is the machine's first production consumer. It
failed **exactly 2** tests (`admits no importer outside the allowlist` + `records that NO
production module consumes the machine yet`) and NOT `wires graph to policy in exactly ONE
module` — the measured signature of a *correct* consumer, so the allowlist was widened rather
than the derivation rerouted. It imports one symbol (`extractTransitionId`) and produces no
verdict; the policy lookup lands in Phase 3 as a separate module that WILL owe `resolvePolicy`.
⚠️ The vacuous assertion was replaced with an **exact-set** successor, and the replacement was
mutation-proved: a throwaway unlisted importer still fails both tests, so the guard did not go
vacuous. Inherited contract 1 of 3 is now discharged.

[SURFACED-2026-09-13] Phase 1 verify-self — the `feature-verify-self-runner` subagent could NOT
reach the live app: `mcp__tauri__*` is not in a spawned subagent's toolset (it reached the
orchestrator only). The subagent correctly reported the two live outcomes UNVERIFIED rather
than substituting the bare Vite page. ⚠️ **The orchestrator closed the gap directly** — outcomes
3 and 4 were verified by the orchestrator against the live dev app. This confirms
`[[mcp-bridge-tools-not-exposed-to-subagents]]` still holds; the live half of verify-self must
be driven by the orchestrator, not delegated.

[SURFACED-2026-09-13] Phase 1 verify-self — ⚠️ **An agent-launched Claudesk cannot produce a
real CC turn-end event.** The spawned CC inherits `CLAUDE_CODE_CHILD_SESSION`, so transcript
saving is OFF and the hook chain never fires (status stayed `Unknown` through a full live
turn). The working substitute: **write hook JSON directly to the dev app's
`hook.sock`** (`~/Library/Application Support/com.claudesk.app.dev/hook.sock`), which drives
the real backend path end-to-end. Extends `[[agent-launched-app-cannot-verify-continue]]` to
the hook channel. ⚠️ WP3's later phases depend on real turn-end events — they will hit this
same wall and should use the socket-injection technique.
