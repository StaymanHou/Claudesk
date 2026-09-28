# Workflow supervisor — as built

⚠️ **This is the AS-BUILT record for M15.** Where it and `roadmap.md` differ, this file wins
(`CLAUDE.md` declares the `arch/` set the authority). The milestone's WBS, probe report and
fixture are archived at `../archive/milestone-15-workflow-supervisor/`.

**What it does:** when a CC turn ends where the drive mode's pause policy says AUTO, Claudesk fires
the next command itself — mechanically, from a typed graph — instead of relying on prose the model
may drift from. Built because auto-chain adherence regressed **10x** (0.36 → 3.63 breaks per 100
`Skill` invocations, opus-4-7/4-8 → opus-5, 187 sessions mined, drive mode cleared as a confound).

⚠️ **The class is CHRONIC, not new** — three prior P1/P2 incidents pre-date opus-5. Every prose
mitigation decayed. That is the whole architectural argument for absorbing the machine as code.

---

## A. The ownership boundary with mccc

**Claudesk owns the drive mode's VALUE + TURN-BOUNDARY enforcement; mccc owns its MEANING +
INTRA-TURN semantics.** mccc's prose stays as the **no-Claudesk floor** — it runs in bare terminals
(877 transcripts), including the recursive case that mccc is developed using mccc.

⚠️ **Full absorption of mccc was CONSIDERED AND REJECTED** (2026-08-14) and is not to be
re-litigated: ~85% of it is prose Claudesk could own but never *enforce*; absorbing it would break
M10.9's two-tier gate, strand non-Claudesk sessions, and put the fastest-iterating artifact behind
the slowest release pipeline.

**Consequences for the cross-repo test suites:** absorbing the machine **deletes** mccc's
`check-structure.sh` **Phase 9** (the four-way `AGENTS.md` duplication it polices stops existing)
rather than moving it, while **Phase 3d** (the `TRANSITION:` regex contract) and **Phase 18** (the
boundary auto-chain pin) **move** to Claudesk.

---

## B. The pipeline

```
UserPromptSubmit hook ──> is_turn_start ──> [turn ends] ──> useSupervisor.onTurnEnd
                                                                  │
              transcript_tail     (Rust: file IO) ◄──────────────┤
              wip_read            (Rust: file IO) ◄──────────────┤
              supervisor_adjudicate (Rust: spawns `claude -p`) ◄──┤
                                                                  ▼
                                                     parseTranscript → readTurn
                                                                  ▼
                                                        FireLedger.claim(TurnKey)
                                                                  ▼
                                                  decideSupervised (TypeScript)
                                                   ├─ policy lookup (typed graph)
                                                   ├─ context-pressure check
                                                   └─ claude -p adjudicator (residual)
                                                                  ▼
                                    ┌─────────────────────────────┴──────────────┐
                                    ▼                ▼                           ▼
                              fire: injectCommand   recycle: onRecycle    withhold: nothing
```

⚠️ **THE VERDICT LIVES IN TYPESCRIPT; RUST MAKES NO DECISION** (ruling **R-4**). This keeps the
policy graph **single-sided**, so "funnel every policy read through ONE function" stays structurally
easy, and it builds **no new backend→frontend IPC direction**.

⚠️ **THE SUPERVISOR OWNS FIVE RUST COMMANDS.** It was three at M15 close; the activity record added
two on 2026-09-25. Enumerate all five:

| Command | Defined | Does |
|---|---|---|
| `transcript_tail` | `src-tauri/src/transcript/` | file IO — returns raw lines |
| `wip_read` | `src-tauri/src/wip/commands.rs` | file IO — returns raw text |
| **`supervisor_adjudicate`** | `src-tauri/src/adjudicator/commands.rs` | **spawns `claude -p`** — returns raw stdout or a stringified error |
| `supervisor_activity_append` | `src-tauri/src/supervisor_activity/commands.rs` | file IO — appends one opaque JSONL record line (async) |
| `supervisor_activity_read` | `src-tauri/src/supervisor_activity/commands.rs` | file IO — returns the newest N raw lines (async, capped) |

⚠️ **`supervisor_adjudicate` is NOT file IO, and an earlier draft of this section wrongly said Rust
exposes the first two "and nothing else" — corrected 2026-09-15 at WP5 verify-self.** It is
**still R-4-compliant**, because R-4 is about *who decides*, not about *what crosses the boundary*:
the command is decision-free by construction (its own doc comment: *"Thin by design (ruling R-4):
returns raw stdout or a stringified error, and makes no decision"*), and the TS side owns the prompt,
the parse and the verdict. ⚠️ **If you are auditing "what crosses into Rust for the supervisor?",
the answer is THREE, and the third one spawns a subprocess.**
**Accepted cost:** the supervisor stops when the webview is gone — acceptable, since a workspace
with no webview has no PTY to inject into anyway.

### The host is PER-WORKSPACE, and `fanOut` is deliberately UNWIRED

`fanOut()` sweeps N workspaces and reads like an invitation to host it once at app level.
⚠️ **It is not, and two guards pin it that way.** `recycleSession()` needs `relaunch` and
`awaitFreshSessionId`, built from `ccPaneRef` / `ccSessionIdRef` — refs that exist only inside a
mounted `Workspace`. Each `Workspace` therefore supervises **itself** via `fireOne`.
⚠️ **Wiring `fanOut` at app level WOULD COMPILE** and leave the recycle branch unable to act.

---

## C. The policy graph (WP2)

Absorbed from `transitions.md` + the four `AGENTS.md` files: **113** transition rows, **89**
pause-policy rows, **× 4 modes ≈ 356 cells**.

⚠️ **The cell vocabulary is FIVE UPSTREAM VALUES, not a boolean** — `AUTO` / `PAUSE` /
`AUTO-SKIP` / `SKIP (entire skill)` / `n/a`, **plus Mode 0, which is not one of the four modes**. A
boolean AUTO/PAUSE model is wrong on its face.

⚠️ **BUT THE MODELED UNION HAS SIX ARMS, NOT FIVE — do not state one count without the other.**
The sixth is **`confirm`** (`policy.ts:137`), which appears in exactly **one** cell (mid-workflow
ambiguity, `CONFIRM_QUESTION`) and which `transitions.md:147` calls *"the ABSENCE of the auto-chain
… NOT a modeled transition"*. It is kept distinct from `pause` for fidelity. `policy.ts`'s own
header warns: *"Do not 'simplify' the count in either direction without reading both comments."*
**FIVE upstream values, SIX modeled arms.**

⚠️ **Policy rows are keyed by STEP, not by transition ID** (feature table: **19 of 27** rows on a
bare step name, only 8 on an `F<n>` id). The detector parses an **edge**; the policy is recorded
per **state**, so the edge→policy-row mapping is **derivation work, not a lookup**.

### The one conditional cell — and its fallback is a safety property

`verify-human` in autopilot is `autoSkip(["no-integration-boundary","verify-self-all-pass"],
"pause")` — **the only conditional cell in the whole matrix**. `resolveCell` returns `skip-skill`
when satisfied and falls back to **`pause`** otherwise.

⚠️ **That fallback direction is load-bearing.** A turn parked at `verify-human` is waiting for the
operator to answer; a fire there is read by CC **as the reply**, consuming the answer slot.
Pinned by `verdict.test.ts` → *"withholds at the verify-human GATE"*, which drives **F11/F12/F13**
(found by enumerating `EDGES`, all dispatchable) plus an anti-vacuity guard asserting that
dispatchability. Mutation-proved: flipping the fallback to `auto` is caught by that test **alone**.

---

## D. Detection (WP3)

**Trigger:** `is_turn_start` (`status_broadcaster::event_is_turn_start`, = `hook_event_name ==
"UserPromptSubmit"`), surfaced on `WorkspaceStatusUpdate`.
⚠️ **Read it off the RAW event stream, never the folded `WorkspaceStatusMap`** — the map collapses
per workspace, so a per-turn signal cannot survive it.
⚠️ **A turn ending in `BackgroundWork` gets NO completion event** (a `BackgroundTasksIdle` request
was closed as not planned). Do not wait for one; do **not** add a PID-polling watchdog (probed and
rejected). It self-heals on the next zero-count `Stop`.

**Why a naive detector is not enough:** transition-token-without-a-`Skill`-call flags **289 of
2,281** turns — **~15x over-flagging**, because most are legitimate PAUSEs. **The policy lookup,
not the token parse, is the hard half.**

⚠️ **The finding that inverted the original design:** wrongful stops emit the **correct**
`TRANSITION:` token and often name the correct next skill, so they are **textually
indistinguishable** from legitimate pauses. A prose-reading LLM adjudicator — the original ask —
would pass **all 19** confirmed breaks. The mechanical check decides every one.

### Reading the turn — the flush race and turn scoping (2026-09-28, silent-supervisor)

⚠️ **CC writes a turn's final line AFTER the `Stop` hook.** Measured live in 6/6 turns: the
final assistant line (`stop_reason: end_turn`) reached disk **74–109 ms after `Stop`**, flushed
together with `system:stop_hook_summary` and `system:turn_duration`, while the supervisor read the
tail within ~2 ms. So until this fix **every decision was made on the previous turn's tail**. The
2026-09-15 "fires" were fires on stale verdicts, and the silence since v0.5.1 was this race plus
the report-raised watermark (§F).

- **Completion (`isTurnComplete`, `transcript.ts`).** A tail is complete for the current turn iff,
  after the last real user prose line, there is a main-chain assistant line whose `stop_reason` is
  terminal (neither `tool_use` nor absent), or a `stop_hook_summary` / `turn_duration` line. Corpus
  (135 transcripts, CC 2.1.272–283): 928/929 turn ends carry `end_turn`/`stop_sequence`, and 99.3%
  of those are followed by a close line. The close line alone covers the one outlier (an
  `AskUserQuestion` turn ending on `tool_use`). Subagent (`isSidechain`) lines never count.
- **The wait (`fireOne`).** Re-read until complete, `TAIL_COMPLETION_BUDGET` = 20 × 100 ms, **before
  the ledger claim**, so a stale read never claims a key. On expiry → `transcript-incomplete`
  (withheld). ⚠️ This is a bounded re-read inside one decision, **not** a watchdog. The rejected
  PID-polling watchdog below is a different thing.
- **Turn scoping (`readTurn`).** The backward scan stops at the last user prose line: a verdict the
  operator has since answered, or one from a `--continue`-resumed conversation, is not this turn's
  (→ `no-verdict`). Unscoped, it FIRED one live (a turn ending on `F8` fired the previous turn's
  `T2` as `/task-act`). The ledger could not have stopped that, because `verdictIndex` indexes the
  512 KiB tail window, shifts once the file outgrows it, and lives in memory.

### Idempotency — the `FireLedger`

Keyed on `{workspaceId, transcriptPath, edgeId, verdictIndex}`. ⚠️ **Claimed BEFORE adjudication**,
not just before injection: the adjudicator costs ~3s, and a second sweep arriving in that window
must not start its own adjudication of the same turn. Held in a **ref** so it survives across turns
— a ledger recreated per turn remembers nothing and double-injects.

### The adjudicator — a hybrid, not a regex

⚠️ **Ruling R-5: mechanical rule first, headless `claude -p` on the residual.** The rule decides
~1,900 of ~2,284. The residual it declines, **plus verify-human-adjacent fires** (where 70% of
wrong-fires concentrate), route to `claude -p` answering one question: *is this turn awaiting
operator input?*

⚠️ **A regex over natural-language tails IS a prose-reading adjudicator with worse judgment than an
LLM** — the exact failure class this milestone exists to remove, in a cheaper-looking form.
Measured: the best regex arm caught 7/30 wrong-fires at a cost of 4/43 true breaks; the hybrid
catches 25/29 at a cost of 6/41.

**R-6's three binding conditions:**
1. **The model is PINNED** (`sonnet`) and `assertPinnedModel` runs inside `adjudicate` before every
   spawn — a silent downgrade regresses the supervisor with no code change and no signal.
2. **The failure direction is WITHHOLDING.** On adjudicator error/timeout/unavailability the
   supervisor must **not** fire: "stays silent, operator nudges" is the recoverable status quo,
   while firing into an awaiting turn is not.
3. ⚠️ **NOT YET DISCHARGED — re-measure on a larger labelled set before relying on the margin.**
   Q2 came back `SEPARABLE` on a **+1-record margin** (sonnet 25/29 against a ≥24 bar; haiku is
   NOT_SEPARABLE), with only 70 of 96 records scorable, and the **0.80/0.80 bar is CHOSEN, not
   measured**. Tracked as `SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET`.

---

## E. Context-pressure recycle (WP4)

At a **feature-workflow phase boundary that is not the last phase**, above **400,000 tokens**, the
supervisor recycles the session (handoff → fresh CC → restore) instead of chaining.

⚠️ **THE THRESHOLD IS AN ABSOLUTE TOKEN COUNT, NOT A PERCENTAGE** (ruling **R-2**; value from
**R-7**). Two refutations forced this and must not be rebuilt on:
- ⚠️ **`message.model` CANNOT determine the context window.** `claude-opus-5` observed at
  **833,567** tokens, `claude-opus-4-7` at **268,743**, **no `[1m]` suffix anywhere in 238
  transcripts** (a `<synthetic>` value also occurs). The window is **not** a function of the model
  string, so **no model→window map could be correct** — R-2 deletes the seam rather than maintain
  it.
- **400k is deliberately not the median** (340,730 would churn runs that completed fine) **and not
  p90** (626,024 is too rare to earn the complexity). Next rung down if too eager: **500k**.

**Reading context:** `message.usage` = `input_tokens + cache_read_input_tokens +
cache_creation_input_tokens`. ⚠️ **LAST assistant line only — never summed** (`usage` is a
point-in-time reading of the most recent request).

⚠️ **An unreadable WIP degrades to "chain as usual", never to a recycle** — the withholding
direction. `wip_read` returns empty for both the absent and the unreadable case but **logs the
error arm distinctly**, so the two stay diagnosable.

**The recycle reuses `fireRecycle` — there is no second call site.** `recycleSession`'s own rule is
"every caller enters here"; a separate programmatic path would duplicate the re-entrancy guard, the
AbortController wiring and the failure-arm surfacing.

---

## F. Observability — what a fire leaves behind

⚠️ **Added 2026-09-14 (`7f303e6`) as a precondition for dogfooding**, because M15's five behavioral
checks are deferred to real use and a log line is the only evidence a fire would leave.

| Event | Trace |
|---|---|
| Successful fire | `supervisor: fired <command> into <workspaceId>` |
| Recycle started | `supervisor: recycling <name> at <n> tokens — deferring /<skill>` |
| Recycle **declined** | `supervisor: recycle DECLINED for <name> … was NOT fired and this turn will not be reconsidered` |
| WIP unreadable | `wip_read: could not read <path> — <err>` (stderr) |

⚠️ **The declined-recycle arm is the subtle one.** `fireRecycle` no-ops when a recycle is already
running **or** the session id is null — and the `FireLedger` has **already claimed the turn**, so a
declined recycle is **neither fired nor recycled and never reconsidered**. The announcement is
therefore **gated on the recycle actually starting**; announcing first made the only diagnostic
assert the opposite of what happened.

### The activity record (2026-09-25): the durable, agent-readable trace

⚠️ **Every `console.warn` above is unreadable** in a shipped build, and to an agent too
(`read_logs` captures nothing). That is how the supervisor went silent for a week unnoticed. So
every turn-end decision is now ALSO appended as one JSONL line to
**`<app-data>/supervisor-activity.log`**: `com.claudesk.app/` for prod, `com.claudesk.app.dev/`
for dev. It is size-capped at 5 MiB with one rotated generation (`.log.1`), reusing
`status_log::StatusLog`. **Read it with `tail` / `jq`.**

- **Exactly one record per `onTurnEnd` invocation**, through one funnel (`useSupervisor`'s
  `onTurnEnd` → `decideTurn` → `record()`). That includes the three formerly SILENT early returns
  (`supervisor-toggled-off`, `no-stored-mode`, `no-pty-session`) and both recycle arms (the
  caller's `onRecycle` returns `"started" | "declined"`). The **gate-OFF exit writes nothing**.
- **Schema** (single home: `src/state/supervisor/activityRecord.ts`; Rust stores opaque lines,
  R-4): `v, ts, appVersion, workspaceId, projectPath, sessionId` (the CC session id from the hook
  event), `outcome` ∈ `fired | withheld | recycle-started | recycle-declined | error`, `reason` (one
  closed union: `SupervisorReason` = `FanOutReason` + the early-exit reasons), `transcriptPath,
  edgeId, mode, detail` (the verdict detail, formerly dropped), `command, tokens`. Never
  transcript text.
- ⚠️ **Filter by `projectPath`, not `workspaceId`.** Ids like `ws-1` are reassigned on every app
  run.
- **One decision per `Stop`** *(2026-09-28)*. On 2026-09-25 a single emitted `Stop` produced two
  records (a second webview consumer). It could not be reproduced (mode changes, hot reloads, a full
  reload with a respawn), so the funnel now claims each EVENT once, keyed `(workspace_id,
  last_event_at)`, module-level in `turnEndDedupe.ts`. A repeat is recorded as
  `duplicate-turn-end` and never decided again. An event with no `last_event_at` is never deduped.
  If this reason ever appears in the log, the duplicate consumer is back: go and find it.
- **Reasons added 2026-09-28:** `transcript-incomplete` (the turn's close never reached the
  transcript within the budget) and `duplicate-turn-end` (see above). Both are `withheld`.
- **`inject-failed` is now reachable.** `injectCommand` swallows a rejected `cc_input`, so the
  supervisor passes an `onIpcError` that re-throws. Before this, a failed injection was reported as
  a fire.
- **In-UI:** the `⚙ supervised` badge's tooltip carries the newest decision
  (`Last: withheld: … · 2m ago`, live via the frontend-only `activityFeed`, seeded from the file on
  mount), and the `▾` trigger beside it opens a popover listing the project's last 20 decisions.

### Turn attribution (2026-09-28): the `⚙` on supervisor-started turns

When the turn prev/next readout (`workspace-turn-readout`, `N/M`) lands on a turn the supervisor
started, it shows `⚙` with a tooltip naming the command. Mechanism (`src/state/supervisor/turnOrigin.ts`):

- **Arm → claim → cancel.** `useSupervisor`'s `inject` ARMS a pending origin for its workspace
  immediately **before** the `cc_input` invoke (and disarms it if the injection fails). The CC
  pane's next `is_turn_start` CLAIMS it (consume-once) and tags that marker in a side table keyed
  by marker id beside `turnMarkersRef`. Any chunk the pane forwards CANCELS a pending origin.
- **The claim window is `ORIGIN_CLAIM_WINDOW_MS` = 2000**, from the P3.1 probe: live injections
  reached the webview as `is_turn_start` in **32–40 ms** (n=4; 49 ms at the broadcaster), and each
  of the six clean 2026-09-15 fires had its own `UserPromptSubmit` as the first one after the
  `Stop`. The window only bounds a fire that never produced a turn start.
- ⚠️ **`is_turn_start` is not strictly a turn start.** CC also fires `UserPromptSubmit` mid-turn
  when it dequeues a prompt (task notifications; a message typed while the model runs). The
  supervisor fires after a `Stop`, so these fall outside the ~40 ms gap in practice; one landing
  inside it would take the tag. Accepted.
- **Cancellation is operator input only** *(fixed 2026-09-28, silent-supervisor Phase 2)*. Terminal
  reports (focus in/out, DA replies, cursor position) used to cancel a pending origin, the same
  misclassification that raised the unsent-input watermark. `routeCcInput` now strips them once,
  for both readers (`src/state/supervisor/terminalReports.ts`), and `Workspace` ignores a chunk
  that was reports only. The PTY still receives every byte.
- **Gated through the readout**: the `⚙` renders from `workspaceSupervisorReadout(…).turnBadge`,
  never from the pane's origin directly, because the turn readout itself is ungated.
- Not tagged: the command a context-pressure recycle defers into the fresh session.

---

## G. The gate

⚠️ **The supervisor owns NO guard arm, and that is a recorded decision** (M15 WP5 / P2.2). It is
**headless** — zero `.tsx`, zero JSX, no panel / menu-id / chord / row-cell / skill-row
registration — and acts only through `injectCommand` and `recycleSession`, both already-gated
paths. `useSupervisor` checks `host.enabled` **twice**: via `useTurnEnd`'s `enabled` and again
**inside** the callback, deliberately, because the gate can flip while a turn is in flight and the
fire is the irreversible half.

⚠️ **The reversing condition, and how it actually played out:** M15 recorded that an
operator-visible supervisor surface would own a SEVENTH arm. **In practice every such surface
derives from ONE function, `workspaceSupervisorReadout`, policed as arm 6's `WORKSPACE-SUPERVISOR`
subject.** That covers the toggle (M14 WP0), the suppressed badge (WP0 Phase 3), and the
activity hint, `▾` trigger and popover (2026-09-25), all rendered inside the block that derivation
gates, and the turn readout's `⚙` (2026-09-28), which renders outside that block but only from the
readout's `turnBadge` field. The readout's own header requires extending it rather than adding a second derivation, so
the `armSubjects` pin (`offInvariantGuard.test.ts` → `it("still polices all six registries")`)
stays at **9**. ⚠️ **A supervisor surface that does NOT render from that readout would still own a
new subject, and the pin must bump in the same change.** The backstop is real but
partial: the guard's allowlist is **all of `src/**`**, so a supervisor panel/menu-id/chord *of a
shape arms 1–3 already select on* trips today — a genuinely novel shape would not.

---

## H. Verification posture at close

| Property | How it is pinned |
|---|---|
| Detector vs. the real corpus | `verdictReplay.test.ts` — the real `decideVerdict` over the frozen 2,284-record fixture, **34/36** on the non-circular set, both misses pinned as correct, non-vacuity guard |
| Negative arm | `verdict.test.ts` — PAUSE, `ESCALATE`, unmapped edge, no-stored-mode, already-chained, and the **verify-human GATE** |
| Recycle conditions | `verdict.test.ts` — all three FIRE-not-recycle arms + strictly-greater threshold |
| Gate OFF | `offInvariantGuard.test.ts` (6 arms / 9 subjects) + Rust-side fail-closed `resolve_gate_enabled` |

⚠️ **SCORING AGAINST THE FULL FIXTURE WOULD BE CIRCULAR** — its 2,284 labels were produced by the
**same policy table** the detector uses, so a 1.000 there is an arithmetic identity, not evidence.
The scored set is the **36 `GROUND_TRUTH_BREAK` records**, each also `prodded_by_user: true` with
the operator's own content-free nudge ("so?", "next") — labels from **operator behavior**, a signal
the detector does not produce.

⚠️ **THE MILESTONE'S CORE BEHAVIOR HAS NEVER BEEN OBSERVED ACTING.** WP4's five behavioral checks
were **DEFERRED, not passed** (operator's call: hard to trigger without real dogfooding), and WP5's
live-observation phase is deferred on the same basis. An agent cannot manufacture them — an
agent-launched CC produces no hook events. Tracked as
`SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` (**high**).
⚠️ **Update 2026-09-25: observed firing ONCE, then observed NOT firing.** It fired live on
2026-09-15 (v0.5.0: the unwanted six-fire run behind the WP0 hotfix). CC transcripts from v0.5.1
on show **no fire at all**, while at least six plain `F8` breaks on supervised projects went
unfired. The item is re-framed as a probable defect, with the evidence, method and unverified
hypotheses in the entry. ⚠️ **§F's `withheld … — <reason>` line is the discriminating observable,
and it is unreadable** (console-only), which is why the activity surface is sequenced ahead of the
investigation.
⚠️ **Read the `DEFERRED-*` status tags on those leaves, NOT the `[x]` checkboxes** — the checkbox
means the gate closed, not that the behavior was observed.

---

## I. Seams that already existed — do NOT rebuild

`is_turn_start` · `fs-change` (covers `.session.md`) · `recycleSession()` (built for this caller,
with an `AbortSignal`) · `injectCommand` (the single injection funnel).

**What does NOT exist:** any CC-uuid→workspace mapping (the hook's `session_id` arrives and is
**dropped** before the DTO). ⚠️ **`WorkspaceRegistry` keys on path ALONE and is 1:1**, so two CC
sessions in one tree are indistinguishable today — the multi-workspace case this milestone targets.
