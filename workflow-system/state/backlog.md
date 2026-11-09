# Backlog

## SURFACE-2026-09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES
- **Source:** feature:build (`supervisor-activity-record`, P3.1 probe)
- **Target level:** product:arch
- **Type:** gap (upstream-blocked)
- **Summary:** `event_is_turn_start` (`status_broadcaster`) treats EVERY `UserPromptSubmit` as a turn
  start. CC fires `UserPromptSubmit` **at enqueue** for a prompt typed while a turn runs (M16.5 WP1),
  so the M13.5 turn prev/next markers are planted mid-turn. First seen in claudesk session `7a912f57`
  on 2026-09-15.
- **Context:** **Rewritten 2026-10-26 (M16.5 WP4). This was decided BY MEASUREMENT; do not re-derive.**
  Neither local discriminator is acceptable: CC fires no `Stop` on an Esc interrupt (0 of 16), so
  "no `Stop` since the last submit" (rule A) catches 30/34 queued prompts but drops the marker on 8/8
  first prompts after an Esc, and the safe variant (rule B) catches only 6/34. `event_is_turn_start`
  is therefore KEPT as is. Full record: `arch/status-channel-and-surfaces.md` §A.5 → "Queued prompts".
  Turn attribution (the `⚙`) is unaffected.
- **Suggested action:** Wait on the upstream ask, **anthropics/claude-code#105187** (filed
  2026-10-26 at the operator's instruction): a `queued` flag on `UserPromptSubmit`, or an interrupt
  hook. If either ships, capture a live payload (`[[cc-hook-capture-beats-docs]]`) and gate the
  marker on it. Until then there is nothing to build here.
- **Priority:** low
- **Status:** blocked on upstream (anthropics/claude-code#105187)

## SURFACE-2026-09-17-OBSERVABLE-OUTCOME-WRITTEN-FOR-A-SURFACE-A-LATER-PHASE-BUILDS
- **Source:** feature:verify-self (M14 WP0 Phase 1)
- **Target level:** product:arch
- **Type:** gap
- **Summary:** A phase's Observable Outcome named a browser-observable check for state that has
  **no observable surface until a LATER phase builds one**. Phase 1 stores the unsent-input
  watermark in a `useRef` inside a component closure (no DOM node, no store, no `window` handle);
  the outcome said to observe it "via the pure module's exported state", which does not exist —
  the module exports a class and a reducer, and the live instance is private. The satisfiable
  form of the same check already existed in **Phase 3**, which builds the marker that IS the
  surface.
- **Context:** ⚠️ **The failure mode is a verify-self that cannot be satisfied without building a
  later phase's UI early** — and the tempting workarounds are all worse than the gap: React-fiber
  traversal to read the ref (proves the fiber can be walked, not that the wiring works), or
  exporting module-level mutable state purely for the test (changes the design to suit the
  instrument). ⚠️ **Both would have produced a GREEN verify-self that demonstrated nothing**,
  which is the shape `arch.md` already warns about: *"an observation is only decisive when a
  broken implementation would give a DIFFERENT answer."*
  ⚠️ This is distinct from the known `SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`
  limitation (the agent cannot TRIGGER the supervisor). Here the agent cannot **observe the state**
  either — two independent blockers, and only the first was anticipated at plan time.
- **Suggested action:** At `feature-plan`, when writing a Browser/DOM Observable Outcome, check
  that the **surface it names already exists or is built by THAT phase** — not by a later one. A
  one-line test: *"which `data-testid` or URL does this outcome assert on, and which leaf creates
  it?"* If the answer names a leaf in a later phase, the outcome belongs to that phase. Consider
  pinning it in `feature-plan`'s Observable-outcomes rules alongside the existing
  "mechanically verifiable" requirement, which this outcome technically satisfied while still
  being unsatisfiable.
- **Priority:** medium
- **Status:** open — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §A.1; stays OPEN until mccc applies it

## SURFACE-2026-09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1
- **Source:** operator dogfooding (v0.5.0, first real use of the M15 workflow supervisor)
- **Target level:** product:wbs
- **Type:** bug
- **Summary:** The first (and, per the operator on 2026-09-24, the **last**) batch of operator
  feedback from live supervisor use: three items. **Rewritten 2026-09-25** at the dogfeedback
  close-out to its remaining open work, and again 2026-09-28 at `silent-supervisor` finalize.
  ⚠️ **It is NOT closed, and "no more feedback" does not close it.** Its checks were vacuous while
  the supervisor never fired. ✅ Firing is restored on `main` (`778fe72`), so they are now
  **runnable**, once a release containing that commit is installed.
- **Item 3 — "only when workflow is enabled and a project uses workflow?"** ✅ Answered 2026-09-15:
  yes, gate ON **and** a stored drive mode. Since v0.5.1 there is a third condition: the
  per-workspace `supervisor_enabled` toggle. **No work remains on this item.**
- **Item 2 — "I'm typing something midway, and the supervisor auto chained."** The fix is **built**:
  WP0 (`a46ae89`, shipped v0.5.1) added unsent-input suppression, the per-workspace toggle and a
  suppressed-state marker, all mutation-proven. ⚠️ **Its seven hands-on checks remain
  `DEFERRED-TO-DOGFOODING`** on `P1.verify-human.1-7` of the archived `supervisor-hotfix.md`. The
  dogfooding did not satisfy them: "no unwanted fire mid-typing" is exactly what a supervisor that
  never fires also produces. ✅ **The "is this fix causing the silence?" question is ANSWERED**
  (2026-09-28): the watermark design was sound, but terminal-generated reports (focus in/out, DA,
  CPR) arrived through `onData` as if typed and raised it. `terminalReports.ts` now strips them
  for both the watermark and the `⚙` origin cancel. The checks, now runnable:
  1. Unsent line present at turn end → NO fire, text intact.
  2. ⚠️ A line walked away from for minutes → STILL no fire (the D-2 ruling's load-bearing case).
  3. Esc, then turn end → fires.
  4. Ctrl+C and Ctrl+U → fire.
  5. Enter/submit → fires. ⚠️ **Add: F-a prompt-panel send (v0.6.0) → fires.** That submit path does
     not come through the xterm keystroke stream and post-dates the watermark design.
  6. After a suppressed turn, later turns resume chaining.
  7. Esc-dismissing a CC menu clears the watermark early (the accepted cost). Confirm it is
     tolerable.
  ⚠️ **The fire-policy question proper (probe Q2: can a question-shaped / answer-awaiting tail be
  detected?) is still open.** WP0 answered only the narrower unsent-input case.
- **Item 1 — "inference / transition check would freeze the UI."** ⚠️ **Untouched, and unconfirmed
  either way.** No freeze has been reported since, but that is weak evidence: if the supervisor
  rarely reaches the adjudicator, the `claude -p` path that would freeze rarely runs. When it next
  happens, use the P1 2026-08-25 playbook: `sample` against the frozen app, not reasoning from the
  code.
- **Suggested action:** during dogfooding of the next release, run item 2's checks against
  `supervisor-activity.log` (an `unsent-input-present` withhold is the observable for checks 1–2),
  then decide probe Q2.
- **Priority:** medium (no longer a suspect for the silence)
- **Status:** deferred — carry to next cycle *(M16.5 close, 2026-11-08)*: runnable since `v0.7.1` (contains `778fe72`) is installed; waiting on dogfooding (M16.5 WP7 deferred its checks there). Was: open — rewritten 2026-09-28

## SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION
- **Source:** feature:verify-human (M15 WP4 Phase 4). Re-framed 2026-09-25 as a probable bug.
  **Rewritten 2026-09-28** at `silent-supervisor` finalize to its remaining open work (partial
  resolution; CHANGELOG 2026-09-28).
- **Target level:** product:wbs
- **Type:** gap (verification debt). The bug half is fixed on `main`.
- **Summary:** ✅ **The silence is fixed (`778fe72`) and SHIPPED in `v0.7.1` (2026-09-29, installed).** Since
  v0.5.1 the supervisor had missed every AUTO-edge break. Feature `silent-supervisor` found and
  fixed three causes, each pinned by regression tests:
  - the transcript read raced CC's post-`Stop` flush (74–109 ms), and the verdict was not scoped to
    the current turn;
  - terminal focus/DA/CPR reports raised the unsent-input watermark;
  - a turn end could be decided twice.

  A live fire was read from `supervisor-activity.log` on a dev build: two workspaces each fired under
  their own project, one with `⚙`. Gate OFF and a PAUSE edge (`F22`) both withheld. The evidence
  trail, hypotheses and mechanism are in the archived WIP
  (`workflow-system/state/archive/silent-supervisor.md`) and in this entry's git history.
  ⚠️ **Do not resolve this on silence.** A positive observable from an **installed** build is what
  closes it.
  **Installed `v0.7.1`, first day (read 2026-09-29, `supervisor-activity.log`):** 75 decisions.
  - ✅ **One context-pressure recycle worked end-to-end** (check 5): `recycle-started` on
    `ops-data-hub` at `F10` → `/feature-verify-self` with 508,028 tokens (11:27). A fresh session
    ran `/session-restore` 32 s later, and `feature-verify-self` followed.
  - ⚠️ **Zero plain `fired` outcomes.** The other 74 are withholds: mostly `no-verdict`, plus
    `no-stored-mode` (`yitang-copy`), one `policy-not-auto` (`F11`) and one `unmapped` (`S17`).
    ⚠️ **Zero fires is EXPECTED (operator, 2026-09-29):** a recent mccc-side change now handles
    the agent failing to auto-chain, and limited testing shows breaks are much rarer. So there are
    far fewer breaks for the supervisor to catch, and a quiet log is NOT evidence of a regression.
    The same fact makes check 1 slow to observe; expect it to take a while.

### What still closes this item (checks deferred by the operator to the next release + dogfooding)
1. **Installed build, AUTO-edge break → `fired` record + `⚙`** on the turn it started (was AC-6;
   also carries `supervisor-activity-record` P3.verify-human.2).
2. **The same with another app focused** when the turn ends (AC-7).
3. ⚠️ **Esc interrupts an injected turn** (AC-9). R-1's accepted cost rests on it, and it is
   still unconfirmed.
4. **Negative arms not yet seen live:** ESCALATE → no fire; a project with no stored mode → no
   fire. (Gate OFF and PAUSE were seen live in the dev build.) ✅ **No-stored-mode → withheld was SEEN on installed `v0.7.1`** (`yitang-copy`, 4×); ESCALATE is still unseen.
5. **A context-pressure recycle** at a non-final phase boundary above 400,000 tokens. ✅ **SEEN on installed `v0.7.1`** 2026-09-29 (see Summary).
6. **Installed-`.app` GUI-PATH smoke** for the supervisor's spawns (`claude -p` adjudicator). ✅ **PASSED by evidence 2026-11-04 (M16.5 WP7):** 8 `adjudicator-says-awaiting` records carry a real `adjudicator (model): AWAITING` verdict from Finder-launched installed builds (0.7.1 ×2, 0.8.0 ×6), so the adjudicator's `claude -p` spawn resolves on a GUI PATH.
- **How to check:** `jq 'select(.projectPath=="<proj>")' <app-data>/supervisor-activity.log` on the
  installed app (`com.claudesk.app`), or scan CC transcripts for commands arriving ~4 s after
  turn end (`[[supervisor-activity-observable-from-cc-transcripts]]`).
- **Related items:** `SURFACE-2026-09-28-A-LEAKED-WORKSPACE-SUBSCRIPTION-DUPLICATES-TURN-ENDS-AND-STEALS-THE-GEAR` (Buried 2026-11-04 to `backlog-archived.md`: dev-build-only). (The quoted-token and format-alarm items it once listed were resolved at M16.5 WP3, 2026-10-27; the format alarm now makes the CC-format-change regression loud.)
- **Priority:** medium (a release containing `778fe72` — `v0.7.1` — is installed as of 2026-09-29; per this entry's own rule it drops from high). Was: high until a release containing `778fe72` is installed (the field build is still
  silent); medium after that.
- **Status:** deferred — carry to next cycle *(M16.5 close, 2026-11-08)*, open until seen in dogfooding — ⚠️ **M16.5 WP7 (2026-11-04) did NOT run the on-screen checks: the operator deferred them to ordinary dogfooding** ("if I notice something while using it, I'll give feedback or add to backlog"). So checks 1–3, ESCALATE → no fire, and WP4's on-screen dot behavior (an artifact watch alone reads grey: no `monitor`-type `Stop` has ever appeared in the installed `status-channel.log`; every verify-human pause reads blue) stay **unseen, NOT passed**. A probe design that provokes each on purpose is in the archived WIP `workflow-system/state/archive/m16-5-wp7-installed-acceptance.md` if anyone wants to run it. As of 2026-11-04 the installed 0.8.1 has logged **0 plain fires** (first 0.8.1 record 01:19Z). Earlier: **a plain fire IS now observed on the installed build:** `v0.7.1` fired four times on 2026-10-12 (`bluecg-maps`, autopilot, P3→P5→P7→P9 in `supervisor-activity.log`), on top of the 2026-09-29 recycle. What remains is the on-screen half (a fire with its `⚙`, a fire with another app focused, Esc recovery); scheduled to close in **M16.5** (roadmap, 2026-10-20; WP7 closed it as deferred to dogfooding, see above). Earlier: fix shipped in `v0.7.1` (2026-09-29). Checks 1–4 and 6 were deferred to dogfooding on the installed release (now `v0.7.1`).
- **Also in that release (2026-09-28, task `f-b-quality-cleanup`):** the supervisor's transcript read
  now names CC's session id (it had passed the PTY id, so every read took the newest-modified file)
  and follows the LIVE profile's config root. When reading a fire's `transcriptPath` in the activity
  record, expect it to be the workspace's own session file.

## SURFACE-2026-09-15-STAGING-AREA-FOR-PROMPT-INPUT

- **Priority:** medium
- **Surfaced by:** operator request (session, 2026-09-15)
- **Target:** product:roadmap
- **Type:** new-work
- **Status:** ⚠️ **PARTIALLY RESOLVED 2026-09-22 — REWRITTEN to the remaining open work.** F-a's
  four WPs all shipped (WP1 probe, WP2 store/ring/payload, WP3 the panel, WP4 send+stage). ⚠️ NOT
  deleted, because the operator's MOTIVATING CASE is still unverified — see below.

### What shipped (all three named failure modes addressed)

1. **"Messed up midway"** → an editable CM6 prose buffer with undo AND redo.
2. **"Deleted by accident"** → undo, plus a non-destructive per-project ring of the last ~10 sent
   drafts, recoverable from the panel (with a discard confirmation over a non-empty buffer).
3. **"Unintended shutdown"** → per-project `localStorage`, debounce-saved, reseeded on open;
   survives panel switch, workspace switch, reload and restart.

Sending works in both modes (⌘↵ submits, ⇧⌘↵ stages without submitting), through `injectCommand`
with `label: "staging"`. See CHANGELOG 2026-09-22.

### ⚠️ THE ONE THING STILL OPEN — and it is the reason the ask was made

**VOICE DICTATION IS ASSUMED WORKING, NOT VERIFIED.** The operator's words were *"when I input a
lot of stuff, sometimes it just got messed up midway"*, and the motivating case is **long
single-take voice dictation**. macOS text-input services **do not engage under `pnpm tauri:dev`
at all**, so neither agent nor operator can exercise dictation in a dev build — WP1's probe closed
ASSUMED-PASS with its question unanswered (task 1.4 never ran, and is deliberately left unticked).

⚠️ **The reopening condition is NARROW and OPERATOR-OWNED (ruling 2026-09-22):** raise this only
if the operator reports a dictation issue **after a release** that includes F-a. Do not re-probe,
do not re-raise at planning time, and do not treat the shipped mechanism as closing it.

**Delete this entry when** a released build has had dictation exercised into the Prompt panel and
the durability half holds — that is what the pain point was about, not the WBS being ticked.

## SURFACE-2026-09-15-WIP-FILES-USE-PROSE-HEADERS-NOT-YAML-FRONTMATTER

- **Priority:** low
- **Surfaced by:** M15 WP5 Phase 1 (feature:verify-human, auto-skip gate evaluation)
- **Target:** workflow-system (mccc) — `feature-verify-human` SKILL.md §2 auto-skip gate (a)
- **Type:** gap

⚠️ **The verify-human auto-skip gate can NEVER fire in this project, and the reason is a schema
mismatch nobody declared.** Gate (a) says: read `drive_mode` from the WIP file's **YAML
frontmatter**; *"If frontmatter has no `drive_mode` field, treat as Mode 2 (orchestrated) and do
NOT auto-skip."* **No WIP file in this project has ever had a YAML frontmatter block** — they all
carry bold-prose headers (`**Workflow:** feature`, `**State:** …`, `**Created:** …`). Checked
against the M15 WP3 and WP4 archived WIPs; both use prose.

**Consequence:** gate (a) fails unconditionally here, so every phase of every feature prompts at
verify-human regardless of drive mode — which is exactly what the operator observed across all of
WP4 ("this made the verify-human auto-skip gate (a) fail at every phase, so each one prompted").
⚠️ **Adding a `**Drive mode:** autopilot` prose line does NOT fix it** — that was tried at WP5's
plan step on the theory that WP4's omission was the cause, and Phase 1 disproved it. A
self-authored prose line is not the frontmatter field the gate specifies, and treating it as one
would let the agent authorize its own skip.

**Not obviously a defect — it may be the safer posture.** Erring toward prompting is the
withholding direction, and M15 WP5 independently hit the skill's *documented* decision-artifact
false positive (a phase whose deliverable is an operator decision ACK with no integration
boundary), where auto-skip is explicitly wrong. So this is filed as a **schema question**, not a
bug: should WIP files adopt real YAML frontmatter, should the gate also accept the prose header,
or should the gate stay conservative by design?

⚠️ **Cross-repo:** the gate lives in **mccc** (`skills/feature-verify-human/SKILL.md`), while the
WIP-file convention lives in this project. Fixing it in one repo alone will not close it.

**Suggested action:** fold into the next mccc-rooted session alongside the two open handoffs
(`HANDOFF-to-mccc-m15-wp2.md`, `HANDOFF-to-mccc-m15-wp4.md`).
- **Status:** pending — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §D.8; stays OPEN until mccc applies it

## SURFACE-2026-09-12-ONE-TRANSITION-HAS-NO-PAUSE-POLICY-ROW-UPSTREAM

⚠️ **NARROWED 2026-09-12 at code-quality review — was "TWO TRANSITIONS".** `P13` (product-finalize → EXIT) is **terminal**, so no pause-policy row is owed and its absence was never a gap. The over-broad claim came from a gap classifier that keyed on an edge's *workflow* rather than its *target*; fixed, and the report now names exactly the dispatchable edge that is genuinely missing a row. **`I2` alone stands.**

- **Priority:** medium
- **Surfaced by:** M15 WP2 Phase 3 (feature:build) — the edge→policy-row derivation's coverage survey
- **Target level:** mccc (`transitions.md`) — a cross-repo question, NOT a Claudesk fix
- **Type:** gap

⚠️ **The survey found two transitions in `transitions.md` with no governing pause-policy row; only ONE (`I2`) is a gap** (see the NARROWED note above: `P13` is terminal). Found by exhaustively resolving all 111 edges against all 58 policy rows:

| Edge | From → To | Why it has no row | Dispatchable? |
|---|---|---|---|
| **`I2`** | `report → triage` | The incident table's `triage (I2→I3 / I2→I13)` row governs the exits **FROM** triage, not the entry **INTO** it | ⚠️ **YES** |
| **`P13`** | `product-finalize → EXIT` | The product table has a row for **P14** (the back-loop) but none for **P13** (the cycle exit) | no (terminal) |

**Why `I2` matters and `P13` does not (much):** `I2` is dispatchable, so a supervisor that defaulted "no row found" to AUTO would fire `/incident-triage` into a session with no policy sanctioning it. `P13` is terminal — nothing to fire — so its gap is a documentation inconsistency rather than a behavioral risk.

**How Claudesk handles them today (no patch applied):** `lookup.ts` returns an explicit `{outcome: "unmapped", reason: "no-row-upstream"}` — **never a default**, and the result union structurally has **no `cell` field** on that arm, so a caller cannot mistake it for a verdict. A standing test pins both ids, so a third gap appearing upstream fails loudly.

⚠️ **Deliberately NOT patched in Claudesk.** Inventing a policy row would be Claudesk deciding mccc's policy, crossing the ownership boundary settled 2026-08-14 (*Claudesk owns the drive mode's VALUE + TURN-BOUNDARY enforcement; mccc owns its MEANING*). The typed model records what upstream **says**, including where it says nothing. **The question belongs upstream:** should `I2` (report → triage) PAUSE like every other incident row, or AUTO?

⚠️ **Found by a TEST, not by the survey that preceded it.** The pre-implementation survey classified the unmapped edges but only eyeballed the **dispatchable** ones, so it reported one gap (`I2`) and missed `P13`. The exhaustive assertion caught the second. *A survey that filters before counting reports the filter, not the population.*

- **Status:** pending — upstream (mccc); consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` (paydown-2026-09-23 WP2)

## SURFACE-2026-09-12-THE-TWO-UPSTREAM-COPIES-OF-THE-FEATURE-GRAPH-DISAGREE

- **Priority:** medium *(was high — Claudesk's exposure is closed; what remains is upstream hygiene)*
- **Surfaced by:** M15 WP2 (feature-plan, measurement A-2)
- **Target:** ⚠️ **mccc** — a cross-repo item. **Claudesk's half is DONE (2026-09-12).**

⚠️ **`transitions.md` and `agents/feature-workflow/AGENTS.md` record DIFFERENT feature graphs.** `F10` targets `verify-self` in the authority and `verify-human` in the copy; `F9b`/`F10b`/`F30` are absent from the copy entirely, whose state table has 12 rows and omits `verify-self`.

✅ **CLAUDESK IS NO LONGER EXPOSED.** The typed graph was transcribed from `transitions.md` **only**, and a live drift test (`agrees with upstream on the F10 target`) reads the authority file and fails if anyone "fixes" the absorbed value toward the stale copy. ⚠️ It is `_ref/`-gated, so it **skips** on a fresh checkout — reported as skipped, never silently passed. ✅ **Verified 2026-09-23 (paydown WP6): no change needed.** A throwaway copy with the gate forced absent reported `17 passed | 2 skipped`, with both drift tests listed as `↓` skipped.

⚠️ **WHAT REMAINS IS UPSTREAM'S:** the four `AGENTS.md` copies are still wrong, and mccc's `check-structure.sh` Phase 9 — which exists to keep them in sync — is **not catching it**. The hand-off note (`HANDOFF-to-mccc-m15-wp2.md`) asks for Phase 9's deletion and carries the evidence. **Blocked on a session rooted in the mccc repo** (editing from Claudesk would silently dirty a different git repository).

- **Status:** pending — upstream (mccc); Claudesk's half is done. Consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` (paydown-2026-09-23 WP2)

## SURFACE-2026-08-25-PROBE-CHECK-EXEMPTS-ALREADY-INSTALLED-DEPENDENCIES
- **Source:** feature:verify-human (M13.5 WP3, 2026-08-25) — cost **three failed live test rounds** and a full WP escalation.
- **Target level:** workflow-system (`feature-spec` / `feature-plan` §"3rd-Party Probe Check") — a **process** defect, not a Claudesk one.
- **Type:** gap (verification-method hole).
- **Summary:** Both `feature-spec` and `feature-plan` gate their probe requirement on whether the dependency is **third-party / new**. WP3's spec ran that check, saw *"xterm is already a first-class dependency and the API is in the installed version"*, and concluded **no probe was needed**. The API then turned out not to work **in our runtime conditions**. ⚠️ **CORRECTED 2026-08-25 by the WP3 3.1 probe — the original diagnosis in this entry was WRONG.** It said `registerMarker`/`registerDecoration` are no-ops in xterm's **alternate** buffer "which is where a full-screen TUI like Claude Code always runs". **Measured false:** CC runs in the **normal** buffer (`buffer.active === buffer.normal`, `buffer.alternate.length === 0`, zero `onBufferChange` events). The real cause was **two unset xterm options** — `allowProposedApi` (without which `registerDecoration` *throws*, silently, inside an un-caught listener) and terminal-level `overviewRuler.width` — **both documented in the dependency's own typings**. Nothing about the dependency being installed, vendored, or type-checked could have revealed that.
- **Context:** ⚠️ **The inference "already a dependency → no probe" is the bug.** A probe answers *"does this API behave as needed in OUR conditions?"*, which is orthogonal to provenance. `tsc` passed, 42 tests passed, the types were read correctly — and every one of those observations was **identical whether or not the alt buffer was active**, which is `arch.md`'s own decisiveness rule going unapplied. ⚠️ Aggravating detail: **WP2 of the same bucket was literally titled *"Probe — … can it get one?"***, so the probe-first pattern was already present in the immediate context and simply was not applied to a sibling WP. ⚠️ **And the lesson is STRONGER than first filed:** the failure was not exotic runtime conditions at all, but two options spelled out in the typings that were read — so "read the types more carefully" is *not* the fix; **running the API is.**
- **Suggested action:** widen the probe trigger in `feature-spec` §2 / `feature-plan` §3 from *"3rd-party / external"* to something like: **"a probe is required when the feature depends on runtime BEHAVIOUR of any API — including an already-installed one — that no existing code in this repo exercises under the same conditions."** ⚠️ A cheap, mechanical form of the test: *"does any shipped code already call this API in this context?"* — for WP3 the answer was **no** (`grep` found zero prior uses of `registerMarker`/`registerDecoration`/`overviewRulerOptions`), which would have fired the gate immediately. Consider also a standing checklist line for terminal work: **which xterm buffer is active — read it, do not infer it?** ⚠️ And for any *proposed/experimental* API surface: **does it need an opt-in flag, and does the call throw rather than return falsy when the flag is missing?** (`registerDecoration` throws; the original code's `if (!marker) return` guard shape assumed a falsy return, so the throw escaped un-caught.)
- **Priority:** medium-high (the cost was three build/verify rounds + one escalation; the fix is a few lines of skill prose, and the failure recurs wherever a familiar dependency is used in an unfamiliar mode).
- **Status:** pending — cross-repo (`my-claude-code-customization`); fold into the handoff already owed to mccc. — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §A.4; stays OPEN until mccc applies it

## SURFACE-2026-08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME
- **Source:** feature:research (M13.5 WP3 task 3.1 probe, 2026-08-25) — the probe that **overturned** the refutation this WP was escalated on.
- **Target level:** workflow-system (verification method / `arch.md` decisiveness rule) — a **process** defect, not a Claudesk one. Sibling to `SURFACE-2026-08-25-PROBE-CHECK-EXEMPTS-ALREADY-INSTALLED-DEPENDENCIES`, but a distinct failure: that one is about skipping a probe *before* building; this one is about skipping one *when closing work*.
- **Type:** gap (verification-method hole).
- **Summary:** M13.5 WP3 failed verify-human three times. The post-mortem diagnosed the cause by **reading xterm's doc comments** (*"registerMarker adds a marker to the normal buffer"*, *"registerDecoration returns undefined if the alt buffer is active"*), inferred that Claude Code — a full-screen TUI — must run in the **alternate** buffer, and declared the mechanism **refuted**. On that refutation the WP was **escalated out of its milestone**, working code was **annotated as dead** in two places, and a shipped config decision was marked **"premise invalidated"**. ⚠️ **All of it was wrong.** A single property read on a live pane — `term.buffer.active.type` → **`"normal"`** — refutes the entire chain. The real cause was two unset xterm options.
- **Context:** ⚠️ **A refutation is a hypothesis, and this one was never tested.** It was internally coherent, cited the vendor's own typings, and explained every observed symptom — which is exactly why it earned three rounds of trust. The asymmetry that makes this worth filing: **a false claim gets caught by the next test; a false refutation CLOSES the work and is never tested again.** Costs incurred: one WP escalated out of its bucket, ~175 lines of sound code marked refuted, one correct decision marked as a mistake, and a re-spec queued that was not needed. ⚠️ Note the instrument chain was *already* suspect — the handoff records **three instrument traps in a row** (stale binary ×2, then HMR masking a stale Rust half) and its own note that *"a repeated 'the instrument was wrong' verdict is itself the signal to go read the platform contract."* The contract *was* then read — but read, not **run**, and that was the last mile that failed.
- **Suggested action:** add a rule to the verification-method lessons (and consider `feature-verify-human` / `feature-research` prose): **before a refutation is allowed to close, escalate, or delete work, at least one RUNTIME observation must contradict the working hypothesis.** Reading a type, a doc comment, or a spec is *evidence for* a refutation, never sufficient *on its own*. Cheap mechanical form: *"which single value, if I read it live, would prove this refutation wrong? Go read it."* For WP3 that value was one property access. ⚠️ Pair with the existing `[[verify-the-mutation-landed]]` / `[[invalid-probe-and-real-hole-look-identical]]` family — same shape: **a green/negative result is under-determined until you prove the instrument could have said otherwise.**
- **Priority:** medium-high (cheap prose fix; the failure mode silently destroys correct work and is self-concealing — nothing re-tests a closed item).
- **Status:** pending — cross-repo (`my-claude-code-customization`); fold into the handoff already owed to mccc, alongside its sibling. — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §B.5; stays OPEN until mccc applies it

## SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS
- **Source:** feature:build (M13.5 WP2 Phase 1 — a rejected root-cause hypothesis that turned out to be a real, separate defect)
- **Target level:** product:arch (status-channel attribution model)
- **Type:** bug (live, low-frequency, cross-session status cross-talk)
- **Summary:** The status path resolves an event to a workspace by **`cwd` alone and never reads `session_id`**, so every CC session sharing a directory drives one workspace's dot. Verified: `session_id` occurs in `status_broadcaster/` only inside **test fixtures** (`mod.rs:338`, `:358`, `commands.rs:271-285`) — no production path reads it. In the captured instance at `status-channel.log.1:15948-15950`, **four** distinct sessions (`2c95b1a3`, `69a7ce96`, `76e288aa`, `23a9ad84`) drove `ws-3`, and the `UserPromptSubmit` that eventually cleared a blue dot belonged to a *different session* than the `Notification` that lit it.
- **Context:** ⚠️ **This was investigated as the cause of the stale-blue defect (`SURFACE-2026-08-06-AWAITING-INPUT-DOT-NEVER-CLEARS-FOR-A-BACKGROUND-AGENT` — since RESOLVED and deleted from this file; see CHANGELOG 2026-08-22) and REJECTED** — that defect was `agent_completed` falling through the notification-type fallback (fixed M13.5 WP2). Filed separately so the rejection is not mistaken for "not real": it **is** real, just not that. ⚠️ **Measured as rare: only 1 of 1,673** post-`Stop` notifications is cross-session, which is why it was deliberately NOT fixed inside a one-line classification fix. Affects any second CC session on the same repo — a bare terminal, a `bg` job, or two Claudesk workspaces on one project. ⚠️ Note it is *not* obviously a pure win to fix: per-session attribution needs a fold decision ("any session awaiting -> blue" keeps a stale blue if a session dies silently; "newest wins" can hide a genuine prompt) and a bound on the per-session map, since a session that dies without `SessionEnd` would leak an entry forever.
- **Suggested action:** Only if the frequency rises. If taken: attribute per `(cwd, session_id)`, fold explicitly (present both folds to the operator — this is a product decision, not a mechanical one), expire on `SessionEnd` (already registered; 51 events in the corpus), and bound the map for sessions that never emit one. ⚠️ Per `[[workspace-status-map-collapses-consecutive-events]]` this needs the **raw event stream**, not the status map. ⚠️ Also re-check `tray::aggregate_alarm` and PiP ordering — both fold the same broadcast, so changing one workspace's input set changes their shape.
- **The routine agent-run trigger is REMOVED (2026-11-06, paydown-2026-11-04 WP11).** On 2026-11-04 the re-raise trigger was met by our own convention: the agent's verify workspaces lived INSIDE the repo (`claudesk/tmp/scratch/*`), so every agent-driven CC session resolved to the operator's `claudesk` workspace (`resolve_cwd` takes the longest registered ancestor). That moved its dot, its blue overlay and its supervisor's turn ends. The supervisor risk was assessed LOW: a fire claims its turn once, and turn scoping stops at the last user prose line. WP11 moved them to `../claudesk-scratch/`, outside the repo. Verified in the installed app: scratch events now read `resolved=none`, while repo events still resolve to `ws-3`. **What remains is the original, rare case:** two REAL CC sessions on one repo (a bare terminal, a `bg` job, or two Claudesk workspaces on one project) still drive one dot.
- **Priority:** low (back from medium, 2026-11-06: the routine agent-run trigger is gone, so this is again "1 observed real instance in the corpus; no data impact — it degrades the ambient dot").
- **Status:** pending — was deferred to **F-b**, which shipped 2026-09-24 WITHOUT putting two workspaces on one tree ("the same directory under two profiles" is F-b Out of Scope; `WorkspaceRegistry` stays path-keyed and a row is one dir + one profile). So the trigger has not happened; still re-raise on the first real two-sessions-per-repo use. It travels with options (b)/(c) of the supervisor-hotfix "per turn" toggle-freshness finding, which is harmless for the same 1:1 reason (paydown-2026-09-23 fold-back).

## SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION
- **Source:** feature:build (M13 WP4 Phase 1 — individual guard-arm probes)
- **Target level:** product:arch
- **Type:** gap (guard predicate completeness, not a live defect)
- **Summary:** The OFF-invariant guard's shared `WORKFLOW_TERMS` list — `["workflow", "docs",
  "skill", "drivemode", "drive-mode"]` (`offInvariantGuard.test.ts:153`) — contains neither
  **"recycle"** nor **"session"**. Arms 1 (panel), 2 (menu id) and 3 (chord) all match through
  `namesWorkflowTerm`, so a `RECYCLE_SESSION` menu id, a `"recycle"` panel, or a `recycleChord`
  export would register **unseen** while the gate is OFF.
- **Context:** Found because an *invalid* probe presented **identically to a real hole**: adding
  `RECYCLE_SESSION: "workspace.recycleSession"` to `MENU_IDS` landed in executable code and left the
  guard 33/33 green. Re-probing with `WORKFLOW_DOCS` made arm 2 bite immediately, proving the arm's
  **assertion** is sound and its **vocabulary** is what is incomplete — the
  *guard-predicate-completeness* failure mode, distinct from a mutation that never lands.
  ⚠️ Live exposure today is **nil**: M13's Recycle affordance is a button guarded by its own
  predicate (`showRecycleButton`, arm 5x — mutation-proven this phase), and no menu id, panel, or
  chord names Recycle. The risk is entirely in the next surface: M15's supervisor is the likeliest
  author of a Recycle **menu item**, and it would land in exactly this blind spot.
- **Suggested action:** Decide deliberately rather than reflexively widening. Two shapes: (a) add
  "recycle"/"session" to `WORKFLOW_TERMS` — ⚠️ cheap but cross-arm, and "session" is a **common**
  word in this codebase (`ccSessionId`, `SessionRegistry`, `cc_session`), so it risks the
  cry-wolf false positives the term list's own doc comment warns get a guard deleted; or (b) follow
  WP2's precedent and assert **provenance by command prefix** for the new surface's own arm, leaving
  the shared list alone. ⚠️ WP2 deliberately declined to widen the shared list, so (b) is the
  standing precedent and (a) reverses it.
- **Priority:** medium (no live exposure; the arm's assertion is sound — the risk is the next
  surface, most likely M15's)
- **Status:** deferred — carry to next cycle (M13 close 2026-08-18); ⚠️ **M15 is the likely author of the first exposed surface** (a Recycle menu item) — decide (a) vs (b) *before* building it, not after. Standing precedent is (b). ⚠️ **Re-anchored 2026-09-23 (paydown fold-back):** M15 closed with a **headless** supervisor that owns NO guard arm, so it never authored the exposed surface. The anchor was then the supervisor activity surface, expected to own the **seventh** arm, but that surface **shipped 2026-09-28 WITHOUT a seventh arm**: all of it derives from `workspaceSupervisorReadout`, arm 6's existing subject (`arch/workflow-supervisor.md` §G). So this question still has **no concrete anchor**. Decide (a) vs (b) when a supervisor surface first needs its own arm.

## Code-quality findings — m12-wp1-probe-flag-store-and-announce (2026-08-03)
- **Pointer:** **1 open item** (rewritten 2026-11-07; the redundant hazard-test paragraph, item (2), was resolved at paydown 2026-11-04 WP14). Remaining: whether a phase observable must be amended when a verdict *reverses* the assumption it encoded (a workflow-system convention → the mccc handoff). Body: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# m12-wp1-probe-flag-store-and-announce — 2026-08-03`.
- **Priority:** low
- **Status:** pending — upstream (mccc), `HANDOFF-to-mccc-2026-09-23-paydown.md` §B.6

## SURFACE-2026-07-31-EDITOR-MINIMAP-STALE-ON-FILE-UPDATE
- **Source:** operator report (2026-07-31, during the M11.5 bucket-scoping discussion)
- **Target level:** product:wbs (bug, small)
- **Type:** bug
- **⚠️ TITLE/SUMMARY CORRECTED 2026-08-01 (M11.5 WP2 Phase 1) — this is NOT a staleness bug.** Reproduced live; the real symptom is **the minimap stops painting partway down, leaving a blank tail**, while the editor still has content below. Nothing is stale. Operator: *"It was blank, not stale content."* The original framing below is retained for provenance and because it is what the first reproduction round tested (and disproved).
- **Summary (CORRECTED):** With **soft-wrap ON** and a document taller than one minimap canvas, the minimap paints only the first N lines and leaves the rest of the strip blank. **Root cause:** `@replit/codemirror-minimap`'s `canvasStartAndEndIndex()` derives `scrollPercent` from the editor's **wrap-aware** pixel scroll height but computes `totalHeight` from the **wrap-blind** source-line count (`LinesState.length × lineHeight`). With wrap on these diverge (measured: model believes 1167px, screen reality ~4545px), so the paint window barely advances, `endIndex` hits the document's last source line, the draw loop `break`s, and everything below goes unpainted. Clean A/B at 85% scroll on `CLAUDE.md`: **wrap ON → 3/34 canvas bands blank; wrap OFF → 0/34.** Upstream package limitation (it predates `lineWrapping`); Claudesk made it visible by shipping soft-wrap in M6 WP5. Our 68px `!important` clip is **not** implicated — it affects width, and every term in the fault is a height.
- **Summary (ORIGINAL, DISPROVED — kept for provenance):** The in-app editor's **minimap does not update when the file content changes.** The document text itself updates correctly — only the minimap render stays stale, so it stops corresponding to the buffer it is supposed to be an overview of. *(Disproved: 7 live recipes across both change sources — external disk reload and local typing, including line-count growth, hidden-tab remount, and split panes — all showed the minimap tracking the buffer correctly, with a calibrated canvas fingerprint that was proven to move on change and return exactly on undo.)*
- **✅ Prime suspect EXONERATED 2026-08-01 (settles the WBS's Finding 2).** `editorExtensions.ts:217`'s `showMinimap.compute([], …)` does freeze the facet *value*, but it is **not** the cause of anything reported here: in `@replit/codemirror-minimap@0.5.2` the `minimapClass` ViewPlugin re-renders on **every** update while the facet is merely non-null, and `TextState.shouldUpdate` fires on `docChanged` without ever consulting `showMinimap`. Confirmed empirically by the 7-recipe round-1 run. **Had this been "fixed" on the static inference alone, it would have shipped a no-op and closed a live bug** — Finding 2's reproduce-first insistence is what prevented that. *(Original suspect text: the empty deps array freezes the facet value including the `create`d container for the life of the `EditorView`.)*
- **Context:** The disk-change path that feeds the buffer is *not* suspected and appears sound — `EditorSplit.tsx` runs `checkDisk` → `diskDecision` (`diskConflict.ts`) → silent `reloadFromDisk` on a clean buffer / conflict popup on a dirty one, which is consistent with the operator's report that the text updates. So this is a minimap-extension problem, not a reload-plumbing problem. Worth checking **both** change sources at reproduce time, since they may not behave alike: (a) an **external** change reloaded from disk (CC editing the file — the common Claudesk case), and (b) **local typing** in the editor. If (b) is also stale, the minimap is simply not tracking the doc at all and the bug is larger than the reload path.
- **Not the M9 dashboard Minimap.** `src/components/workspace/dashboard/Minimap.tsx` is an unrelated component (time-analytics timeline). The editor minimap is a CM6 extension only — no dedicated component file. Don't cross-wire them when searching.
- **⚠️ ECOSYSTEM RESEARCH — nothing can be adopted (checked exhaustively 2026-08-01).** This is **upstream issue #1, "Bug: Support line wrapping", open since 2023-04-23 and filed by the maintainer himself**; his description independently confirms the diagnosis (*"Currently we assume lines do not wrap… We don't render the wrapped text/blocks on a new line"* — two sub-problems struck through as fixed, **the rendering one, ours, never was**). Repo is alive (pushed 2026-07-17, 70★), so this is an unfinished feature, not abandonware. Ruled out: `0.5.2` **is already latest**; standalone `codemirror-minimap@1.0.6` is **CM5-only** (`peer: codemirror >=5.15.0`, 2022); `@oeyoews/codemirror-minimap@0.5.3` is a stale republish that is *behind* upstream with **zero** wrap code; all **9 forks** are drive-by mirrors (the one commit-ahead is a perf change); and **none of the 14 all-time PRs** touches wrapping. There IS a maintainer WIP branch `line-wrapping` (sha `e5841a8`, 2023-06-22, 141+/60− over 2 files), **13 commits behind**, self-declared incomplete: *"Overscroll seems to be off · When out of viewport we can't measure posAtCoords, so we'll need some kind of estimation · Selection & Diagnostics don't work yet."*
- **⚠️ A FIX WAS ATTEMPTED AND FAILED — read this before trying again.** A `pnpm patch` port of the WIP branch's **geometry** half was built, measured live, and **reverted to pristine** (2026-08-01). The three changes: `totalHeight ← view.contentHeight / SizeRatio`; `startIndex` via `lineBlockAtHeight()`; flat per-line budget replaced by real `lineBlockAt().height` advances with height-based loop termination. **Result: the minimap rendered essentially blank at every scroll position — worse than the bug.** Instrumenting the live loop showed **the geometry is correct** (`startIndex 198` in range; 18 lines correctly filling the 1085px canvas); the failure is downstream: `drawLine()` paints each source line as **one ~4px row** while the cursor advances by the line's true wrapped height (measured advances of 178.7 / 168.8 / **217.5**px for single lines), leaving thin slivers of text separated by large gaps. **The geometry port is necessary but NOT sufficient.**
- **Suggested action:** **A complete fix requires rewriting `text.ts`'s `drawLine` to emit each line's wrapped *segments* across multiple rows, in addition to the geometry port.** That is exactly what upstream left undone (*"This is pretty close, now we need to wrap the actual elements"*) and why it has sat for three years — it is a rewrite of the line-drawing path with an unsolved off-viewport measurement problem, **not** a geometry tweak. Size it as its own feature, not a papercut. Two cheaper alternatives were **explicitly rejected by the operator** and should not be re-proposed without new information: *clamping* the scroll model (would paint the full strip at a **wrong scale**, trading an obvious defect for a misleading one) and *disabling the minimap when wrap is ON* (guts the feature precisely on the long prose files where it earns its keep). If revived, the geometry half is recoverable from the WP2 record — the diagnosis, the A/B, and the live instrumentation are all preserved in `workflow-system/state/archive/editor-minimap-stale-on-file-update.md`. Also still binding: any fix that recreates the container MUST preserve the `cm-minimap-narrow` marker class or the 68px width clip in `App.css:2129` silently regresses.
- **Priority:** medium (the minimap is a navigation aid that is actively misleading while blank — worse than absent; but the editor is fully usable, the text is always correct, and turning soft-wrap OFF is a complete workaround)
- **Status:** **DEFERRED to backlog 2026-08-01 (operator decision) — REMOVED from Milestone 11.5.** Was M11.5 WP2; re-scoped out after the attempt above proved it is feature-sized rather than papercut-sized, and the bucket's stated value is that it stays tight. **M11.5 continues at WP3.** Revive as its own feature item when the `drawLine` rewrite is worth funding.

## SURFACE-2026-08-28-SUPERSEDED-TEXT-IN-DURABLE-DOCS-HAS-NO-CONVENTION
- **Source:** cross-project global learning, ported 2026-08-28 from `knowledge_base` (CMC ad-ops).
  Draft parked at `.claude/learnings/2026-08-28-superseded-text-doc-hygiene.md` (gitignored per the
  artifact-tracking MAP — global-scope drafts await hand-porting to the workflow-system source repo).
- **Target level:** workflow-system (cross-repo — `CLAUDE.snippet.md` + `product-finalize` §2,
  `product-arch`, and the three terminal-close skills). ⚠️ **NOT a Claudesk code change.**
- **Type:** gap (a durable-doc convention the skills assume but never state).
- **Summary:** Skills that resync durable docs say "update in place" and "flag significant drift
  explicitly" but never say **what a correction should look like on the page**. With no rule the agent
  decides per instance and the decisions disagree *within a single session* — the source session left
  **16 supersede markers in three different styles** across five docs, including strikethrough and a
  `> **CORRECTED**` block **both on the same claim**. The proposed rule: **correct in place by
  default** (`git log` holds the history); keep the old claim visible **only when a reader of the new
  text would plausibly re-derive the old one**, and then say *why* it was wrong. Markers: `~~…~~` for
  a short phrase edited against a quoted original; a `> **CORRECTED <date>.**` block for a reversed
  conclusion; **never both**; **never strike status** (a completion marker or dependency is replaced,
  not struck).
- **Context:** ⚠️ **This is directly load-bearing here, and M13.5 supplies fresh evidence.** WP5 spent
  real effort on exactly this class: a **stale duplicate** of a pre-WP3 backlog body survived beside
  its own rewrite (`SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE`), and the
  cycle close found `arch/session-resumption.md` still **titled** *"NOT the workspace header"* after
  WP4 reversed it — retitled rather than deleted precisely because that reversal *does* teach
  something, which is the discriminant this rule names. ⚠️ The learning's own payoff was the same
  shape: chasing an unexplained strikethrough surfaced a **factual error** (an `arch.md` Unknown
  recorded as resolved while the matching backlog item was still open). **Consistent supersede
  markers make a doc greppable; inconsistent ones hide contradictions** — and in this project the
  `arch/` set is declared *the authority*, so a hidden contradiction there outranks a correct record.
- **Suggested action:** Port the draft into the workflow-system source repo — a short
  `### Superseded text in durable docs (GLOBAL)` section in `CLAUDE.snippet.md` (the
  CHANGELOG-convention neighbourhood shares the "what closing skills write" concern), plus a one-line
  pointer from `product-finalize` §2 and the sibling doc-editing skills. ⚠️ **Cheap mechanical
  enforcement is available for the clearest case only:** `tests/check-structure.sh` can flag a `~~` on
  the same line as, or directly above, a `CORRECTED`/`Superseded` marker — the "never both" case.
  Do **not** try to mechanize the judgment call (*"does the reversal teach anything?"*); that is the
  part that needs a human-authored discriminant, and a guard asserting it would pass on prose saying
  the opposite.
- **⚠️ Fold into the mccc handoff already owed** — this is the **fourth** cross-repo item queued
  there, alongside `SURFACE-2026-08-25-PROBE-CHECK-EXEMPTS-ALREADY-INSTALLED-DEPENDENCIES`,
  `SURFACE-2026-08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME`, and
  `SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE` (whose target is the same
  "Append discipline" neighbourhood — ⚠️ **consider porting the two together**, since a rewrite that
  must replace the old body in place *is* the delete-side instance of this same convention).
- **Priority:** medium (cheap prose fix; no live defect, but the failure mode is self-concealing —
  an inconsistent marker hides a contradiction and nothing re-reads a closed doc).
- **Status:** pending — cross-repo (`my-claude-code-customization`). — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §F.10; stays OPEN until mccc applies it

## SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE
- **Source:** feature:plan (M13.5 WP5 exit verify — found while reading the TURN-OUTPUT entry)
- **Target level:** workflow-system (cross-repo — `~/.claude/CLAUDE.md` "Append discipline" prose)
- **Type:** gap (invariant wording does not cover one of its own two paths).
- **Summary:** The delete-on-resolve invariant spells out the **full**-resolution path (CHANGELOG
  line, then delete the whole `## SURFACE-` block, staged together) and the **partial**-resolution
  carve-out (rewrite the entry to the remaining open work). ⚠️ **But on the rewrite path there is no
  instruction to remove the OLD body** — and in practice the new body was inserted while the old one
  survived, leaving two contradictory bodies for one ID. Found live in this repo: the pre-WP3
  `SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION` body survived under a mangled `` ## ` heading ``
  heading, still listing as *undecided* the turn-boundary-marker work WP3 had shipped.
- **Context:** ⚠️ **The failure is self-concealing in the exact way that matters** — a `grep` for the
  SURFACE ID finds the *correct* rewritten entry first, so the duplicate only surfaces if someone
  reads the surrounding lines. The same file already recorded this defect class once before (an
  orphaned heading fixed at the M10.9 sweep, 2026-07-31), which makes this the second instance, not
  a one-off. A stale body asserting shipped work as open is a confabulation channel into the next
  planning pass.
- **Suggested action:** In the `## CHANGELOG.md convention (GLOBAL)` → "Append discipline" →
  partial-resolution carve-out, state explicitly that a rewrite **replaces** the entry body in place
  (old text removed in the same edit), and that the result must be **exactly one** `## SURFACE-<ID>`
  block per ID. ⚠️ A cheap mechanical guard: assert every `^## ` line in `backlog.md` matches the
  expected heading shapes and that no SURFACE ID appears as a heading twice — this would have caught
  both instances.
- **Priority:** medium (cheap prose fix + a cheap guard; the failure silently contradicts a shipped
  record and nothing re-reads a closed item).
- **Evidence 2026-09-23 (paydown-2026-09-23 WP1) — the class at SCALE:** 22 of 100 code-quality finding bodies were resolved-but-undeleted, most by the 2026-08-18/19 paydown, whose CHANGELOG lines claimed them while the bodies stayed. So were 10 of 34 pointer stubs, whose counts no longer matched their bodies, and one claimed closure was only HALF true (`SURFACE-2026-08-18-QUALITY-WP3-LATE-SUBSCRIPTION-DISPOSAL-UNTESTED`: one arm of two). A sweep that resolves SUB-ITEMS of a grouped entry is where this happens, because no heading disappears, so nothing prompts the delete.
- **Status:** pending — upstream (mccc) ONLY — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §F.11. ✅ The **local half is DONE** (backlog-paydown-2026-11-08 WP3): `src/__tests__/backlogHeadings.test.ts` fails on a duplicated or malformed `## ` heading in `backlog.md` and `backlog-quality-findings.md`. Stays OPEN until mccc applies the prose fix.

## SURFACE-2026-08-25-OBSERVABLE-OUTCOME-ASSERTED-A-GREEN-GATE-ITS-OWN-PHASE-BREAKS
- **Source:** feature:verify-self (M13.5 WP3 Phase 1)
- **Target level:** product:wbs
- **Type:** gap
- **Summary:** A plan-time Observable outcome asserted `tsc --noEmit` **exits 0** while the *same
  sentence's* rationale said the phase's deletion "is a compile error at every call site". Both
  halves cannot be true. The phase deliberately deletes exports two consumers still use (P1.7), so a
  green `tsc` is impossible until Phase 3 — the outcome was unsatisfiable **as written** the moment
  it was authored.
- **Context:** ⚠️ **The generalizable trap: a phase that intentionally breaks the build cannot use a
  whole-gate green as its Observable outcome.** `feature-plan`'s template pushes for mechanically
  verifiable outcomes (rightly), and "the type checker exits 0" is the most obviously mechanical one
  available — which is exactly why it gets written down without checking whether *this* phase can
  satisfy it. ⚠️ It is also a **false-green risk in the other direction**: had the callers happened
  to still compile, the outcome would have passed while proving nothing about the deletion. The
  honest outcome for a deliberate-breakage phase is a **shape** assertion — "errors appear in exactly
  these N files, all of kind X, all naming the deleted symbols" — which is what verify-auto actually
  checked and what caught this.
- **Suggested action:** In `feature-plan`, when a phase's tasks include a deliberate deletion or
  signature change with existing consumers left for a later phase, require the phase's gate outcome
  to be expressed as an **expected-failure shape** rather than a whole-gate pass. A cheap mechanical
  prompt: *"does any task in this phase break a consumer that a later phase fixes? then no
  whole-suite/whole-gate green may be an outcome of THIS phase."* Consider also having
  `feature-verify-auto` treat "outcome asserts a green gate that the phase's own plan says it
  breaks" as a plan-defect signal rather than a test failure.
- **Priority:** medium
- **Status:** pending — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §A.2; stays OPEN until mccc applies it

## SURFACE-2026-08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC
- **Source:** feature:build (M13.5 WP3 Phase 3, found by the OPERATOR — the dev app was blank)
- **Target level:** product:wbs
- **Type:** gap
- **Summary:** A phase plan deliberately deleted exports (`inertAfter` et al.) and left two consumers
  un-migrated to a later phase, treating the resulting `tsc` errors as a *guard* ("that compile
  error IS the guard proving no caller kept the old semantics"). ⚠️ **That framing was wrong in a
  load-bearing way: a missing ES-module export is not only a compile-time error — it is a RUNTIME
  module-resolution failure.** `SyntaxError: Importing binding name 'inertAfter' is not found`
  aborted `main.tsx` before it mounted, so **the whole dev app was blank/unlaunchable** for the
  entire duration of Phase 2.
- **Context:** ⚠️ **The compounding harm is what makes this worth filing.** Phase 2's verify-self
  ran "live-pane" checks against an app that could no longer boot — it only appeared to work because
  the running webview still held a bundle loaded *before* the deletion. So a full verify-self →
  verify-human cycle passed on **stale-runtime evidence**, and the operator approved
  phase-by-phase build on the agent's own (incorrect) assurance that a non-compiling tree was safe.
  ⚠️ This is `[[hmr-stale-across-file-rename]]` at milestone scale: the agent *knew* that lesson,
  cited it, and still banked live readings from a runtime that could not have been rebuilt.
- **Suggested action:** In `feature-plan`, treat **"does this phase remove or rename an exported
  binding that any un-migrated consumer still imports?"** as a hard blocker on splitting the change
  across phases — for ESM the migration must land in the SAME phase as the deletion (or the deletion
  must come last). ⚠️ A cheap mechanical gate: after any phase whose tasks include a deletion, run
  a **boot smoke-test** (load the app and assert `#root` has children) before accepting any
  live-observation outcome. `tsc` passing is not the same property, and `tsc` *failing* must never
  be described as a guard when the failure class includes module resolution.
- **Priority:** high
- **Status:** pending — upstream (mccc) ONLY. ✅ The **local half is RESOLVED** (paydown-2026-09-23 WP3): `pnpm check:link` is the mechanical deleted-export gate, and `src/__tests__/appBoot.test.tsx` boots both entries. ⚠️ Note for the upstream half: under Vitest a boot test CANNOT see a missing export (the binding reads as `undefined`), so the suggested "boot smoke-test" only works as a LIVE-webview check or a real linker. Consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §A.3; stays OPEN until mccc applies it.

## SURFACE-2026-09-17-REVIEW-QUALITY-DIFF-WINDOW-BREAKS-ON-A-PARKED-FEATURE
- **Source:** feature:review-quality (M14 WP3)
- **Target level:** product:arch
- **Type:** gap
- **Summary:** `feature-review-quality` §1 computes its diff window as `BASE_SHA^..SHIP_SHA`, where
  `BASE_SHA` is the earliest commit touching the feature's WIP file. That assumes the feature's
  commits are **contiguous**. When a feature is PARKED mid-flight and unrelated work ships in the
  interval, the window silently swallows all of it.
- **Context:** Hit on M14 WP3. WP3 was parked at verify-human on 2026-09-15; the WP0 supervisor
  hotfix was then specced, built, shipped, quality-reviewed (`cf8d2a1`) and released as v0.5.1
  before WP3 resumed. The naive window spanned **42 files / ~5,844 insertions**, of which only
  **5 source files** belong to WP3 — the rest was WP0's ALREADY-REVIEWED-AND-CLOSED work plus the
  release. ⚠️ The failure is silent and bidirectional: the reviewer would (a) re-litigate findings
  already dispositioned at `cf8d2a1`, and (b) bury WP3's real diff in 40x its volume, which is the
  more likely way a genuine finding gets missed. Worked around this run by hand-selecting WP3's
  three commits (`3db5994`, `ef0bb82`, `5e3ecd9`) and telling the reviewer explicitly which paths
  were out of scope.
- ⚠️ **SECOND, DISTINCT FAILURE MODE OF THE SAME COMPUTATION — observed 2026-09-22 (F-a WP3).**
  The item above is "the window is too WIDE". This one is "the window is EMPTY", and it is the
  more dangerous of the two. `BASE_SHA` is derived from the earliest commit touching the WIP file
  — but **this project commits WIP files at FINALIZE, not at ship**, so during review-quality the
  WIP is still untracked and the lookup returns nothing. `git diff ^..<ship>` on an empty base
  yields an empty range, and a reviewer handed an empty diff reports **"no findings"** having
  examined **nothing** — indistinguishable in the output from a genuinely clean feature.
  ⚠️ It already bit once: WP2's review ran against a working tree only because the operator
  noticed. Worked around again on WP3 by anchoring the window by hand (`3e32d53..6c50140`) and
  **confirming it was non-empty (5,018 lines) before spawning the reviewer**.
- **Suggested action:** Make the window commit-set-based rather than range-based — e.g. derive the
  feature's commits by `git log --format=%h --all -- <wip-path>` intersected with commits that also
  touch source, or record the feature's own SHAs in the WIP as each phase ships (the WIP already
  records ship SHAs in its phase statuses). ⚠️ A `git log --first-parent` or date-bounded window
  does NOT fix this — the interleaving is temporal, not topological.
  ⚠️ **AND, for the empty-window mode: the skill must FAIL LOUDLY on an empty diff rather than
  proceed.** Whatever the window computation becomes, a non-emptiness assertion before the spawn
  is the cheap half of the fix and catches both modes' worst outcome. A reviewer must never be
  handed nothing and asked what it thinks.
- **Priority:** medium-high *(raised from medium 2026-09-22 — two independent failure modes now
  observed, and the empty-window one produces a FALSE CLEAN review rather than a noisy one)*
- **Status:** pending — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §C.7; stays OPEN until mccc applies it

## SURFACE-2026-09-18-DOC-COUNT-NEEDS-A-GENERATOR-NOT-A-DETECTOR
- **Source:** feature:verify-codify (M14 WP4 Phase 4)
- **Target level:** product:arch
- **Type:** new-work
- **Summary:** The OFF-invariant guard's shape (6 arms / 9 subjects) is restated as prose in ~8 live places with no mechanical link to the code, and it has drifted repeatedly. A **detector** guard was built and mutation-tested at M14 WP4 and **does not work** — it caught 1 of 4 mutants, missing both real-world defect shapes. The viable mechanism is a **generator**, not a detector.
- **Context:** ⚠️ **Measured, not speculated.** The detector needs to separate "this doc ASSERTS the count is N" from "this doc RECORDS that the count WAS N", and the docs deliberately contain both — often adjacent, because every correction leaves a retraction note beside the corrected claim (`source-text-guards.md` entry 14). Its exempt list needs a milestone-reference token to skip historical records; that token exempts **21 of 117** candidate lines (**17%**), including the line carrying a live stale claim. Narrowing it re-admits the historical records that must not be flagged. The discriminator is authorial intent, which a source-text predicate cannot express (`extract-for-import-when-a-raw-guard-cant-express-the-property`). The full mutation table and root-cause analysis are in the WP4 WIP's `## Codify Decision — Phase 4`.
- **Suggested action:** If this drifts again, invert the mechanism: make the count a **generated artifact** rather than something to detect. Options: (a) a single source-of-truth line emitted by a script that docs `include`, (b) an HTML-comment marker (`<!-- guard-count -->…<!-- /guard-count -->`) whose content a test REGENERATES from `armSubjects` and fails on diff — a generator's output is unambiguous where prose intent is not. ⚠️ **Do not re-attempt the detector shape** without reading why it failed first.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M16 close, 2026-10-20)*

## SURFACE-2026-11-03-AUTO-RESUME-FIRES-INTO-THE-FOLDER-TRUST-PROMPT
- **Source:** inbox live check (drive-mode picker, 2026-11-03), dev build
- **Target level:** task
- **Type:** bug
- **Summary:** The first time a never-trusted folder opens as a workspace, Claudesk's auto-fired resume command lands on CC's "Quick safety check: … trust this folder?" prompt. That prompt's default is "No, exit", so the `\r` that ends the injected `/session-restore` picks it and CC quits ("Session ended"). The resume is lost, and so is the session.
- **Context:** `autoResumeFire.ts` injects on a fixed delay after spawn (1500 ms, `shouldInject`); nothing checks that CC is at its input prompt. The trust dialog only appears for a folder CC has never trusted, so dogfooding on known projects never hits it. A newly added project that already holds a `.session.md` (a cloned repo, a copied fixture, a new machine) does. Reproduced 2026-11-03 with `tmp/scratch/restore-test`: open → trust dialog → auto-fire → exit. After Re-launch the dialog showed again and no auto-fire repeated (consume-once), so accepting trust by hand recovered. Side observation, not investigated: the header showed `↻ will continue` on that workspace afterwards, including after a close and reopen.
- **Ready-made repro (2026-11-06):** paydown WP11 moved the scratch workspaces to `../claudesk-scratch/`, so CC sees `scratch-a`, `scratch-b` and `restore-test` as never-trusted folders. (`scratch-c` was trusted during the WP11 probe.) Put a `.session.md` in one, open it, and the auto-fired `/session-restore` should land on the trust prompt.
- **Suggested action:** Pick one: (a) skip or defer the auto-fire until a first hook event proves CC reached its prompt (a `SessionStart` hook, if the channel sees one before input), or (b) detect a never-trusted folder (`~/.claude.json` → `projects[<path>].hasTrustDialogAccepted`) and announce instead of firing. Note that (a) must not parse PTY output (the CLAUDE.md rule).
- **Priority:** low (first open of a new folder only; recovery is one Re-launch plus accepting trust)
- **Status:** deferred — carry to next cycle *(M16.5 close, 2026-11-08)*

## SURFACE-2026-11-04-REOPENED-WORKSPACE-CC-PANE-NEVER-PAINTS
- **Source:** inbox live check (drive-mode picker, `/session-start` half, 2026-11-04), dev build
- **Target level:** task
- **Type:** bug (suspected; seen ONCE, NOT reproduced on a deliberate probe)
- **Summary:** After a workspace was closed and the same project reopened in the same app instance, the new CC pane once stayed blank for minutes while CC was alive and working: hooks arrived, the status went Running → Awaiting input, and the transcript held a full turn plus a pending `AskUserQuestion`. Nothing painted, and a window `resize` did not repaint it. The original instance was 2026-11-04 on `restore-test`: Close Anyway, picker-row drive mode → None, reopen (`cc-2`, no `--continue`).
- **Probe 2026-11-06 (paydown-2026-11-04 WP11) — NOT reproduced.** Run on a FRESH `pnpm tauri:dev` (no HMR history, no source edits mid-run), on the moved `claudesk-scratch/scratch-c`. Instrument: screenshots scored for CC-pane text pixels and eyeballed; a blank pane reads 0.0000. All three arms painted:
  - (A) first open: 0.0016, CC's trust dialog;
  - (B) normal close, then reopen: 0.0012 at 15 s;
  - (C) the reported sequence: a turn in flight (`background_work`) → close → guard → **Close Anyway** → picker-row drive mode autopilot → **None** → reopen by row click, spawned without `--continue` like the original `cc-2`: 0.0012 at 15 s, 0.0011 at ~33 s and ~80 s.

  Probe matrix: archived WIP `paydown-2026-11-04-wp11-scratch-out-of-repo-and-pane-probe.md` → "T7 probe".
- **Still unexplained.** The 11-04 run's app had a long agent-driven history in that instance, which this fresh launch did not; `[[hmr-stale-across-file-rename]]` is the known way a long-lived dev window fakes a defect. The leads, uninvestigated:
  - the PTY early-output buffer never released, because the reopened pane's `cc_ready` / listener attach targeted the old session;
  - a stale per-workspace listener after the forced close.
- **Suggested action: an installed-build WATCH, not active work.** If a reopened pane is ever seen blank in the INSTALLED app, capture the following before touching anything, then trace `cc_ready` and the output listener for that session id:
  - the session id;
  - whether the status dot is moving;
  - `ps` for the `claude` child;
  - a screenshot at about 30 s and about 2 min.
- **Priority:** low (one dev-build sighting, and one clean deliberate probe; raise to medium on any installed-build sighting, since a blank pane hides an awaiting question)
- **Status:** open — watch

## SURFACE-2026-11-08-QUOTA-AUTO-RESUME-FIRED-IS-AN-UNCLASSIFIED-NOTIFICATION-TYPE
- **Source:** `/release` step 1 advisory vocabulary check (v0.8.2 cut, 2026-11-08)
- **Target level:** task
- **Type:** bug (status dot, low frequency)
- **Summary:** CC has sent `notification_type: "quota_auto_resume_fired"` **9 times** (prod `time-analytics.sqlite`; first 2026-09-21 12:11, recurring around 12:11 on later days, e.g. 2026-10-21). It is in neither `INPUT_NEEDED_NOTIFICATION_TYPES` nor `INFORMATIONAL_NOTIFICATION_TYPES` (`status_broadcaster/mod.rs`), so `event_to_state` falls back to **AwaitingInput** and the workspace dot goes blue when CC auto-resumes after a quota reset.
- **Context:** The name says CC resumed work on its own, which is a completion/informational shape (like `agent_completed`, the M13.5 WP2 precedent), not a request for input. ⚠️ Classify it deliberately: capture one live payload first (`[[cc-hook-capture-beats-docs]]`) to confirm that nothing in it asks the user anything. The fallback itself must NOT be inverted.
- **Suggested action:** add it to `INFORMATIONAL_NOTIFICATION_TYPES` with a classification test, after the payload check.
- **Priority:** low (≈1 event per quota reset; a false blue, not a lost prompt)
- **Status:** open

## SURFACE-2026-11-09-NEXT-OPEN-INDICATOR-PREDICTS-CONTINUE-WITH-NO-TRANSCRIPT
- **Source:** feature:verify-self (paydown-2026-11-08 WP5 Phase 1, reproducing the side observation in `SURFACE-2026-11-03-AUTO-RESUME-FIRES-INTO-THE-FOLDER-TRUST-PROMPT`)
- **Target level:** task
- **Type:** bug (prediction surface)
- **Summary:** The workspace header's next-open indicator (`nextOpenIndicator` in `sessionStartButton.ts`, fed by `picker_announce_actions`) shows `↻ will continue` whenever the unclean flag is set, and the flag is set at spawn by design. But the spawn drops `--continue` when the project has no transcript under its config root (`cc_session` → `guard_continue_against_transcripts`, F-b P1.1), so for such a project the label predicts a continue that will not happen. Because the flag outranks `.session.md` in `predictAction`, the prediction also displaces the `/session-restore` arm. Seen live 2026-11-09 on `claudesk-scratch/restore-test` (never trusted, no `~/.claude/projects/…` dir): the header read `↻ will continue` right after open.
- **Context:** Display-only today: the action is re-derived at open time, so nothing is typed wrongly. The cost is a false promise, plus a reopen after an unclean exit that runs neither arm. The picker's batch announce has the same blind spot: it reads the flag but not the transcript guard.
- **Suggested action:** Have `announce_actions` apply the same transcript check the spawn uses (one predicate shared by both, never a copy), so a no-transcript project predicts the `.session.md` arm or nothing. Decide whether the flag should then still outrank `.session.md` when `--continue` cannot run (likely: fall through to `/session-restore`, which needs a matching change in `resolve_resume_arm`).
- **Priority:** low (display-only mis-prediction; most real projects have transcripts)
- **Status:** open

## SURFACE-2026-11-09-F10B-MEASUREMENT-COUNTS-A-CORRECT-FSD-CHAIN-AS-A-STOP
- **Source:** task:act (backlog-paydown-2026-11-08 WP1, the F10b re-measure)
- **Target level:** upstream (mccc) — `tools/analysis/measure-f10b-handback-rate.py`
- **Type:** bug (measurement instrument)
- **Summary:** The script's classifier `vh()` counts an F10b turn as chained only if the next assistant turn invokes `feature-verify-human`. But in **FSD**, F10b correctly SKIPS verify-human and chains into `feature-verify-codify`, and the drive-mode gate (`AUTO` regex) admits FSD turns. So **every FSD F10b turn reads as a stop.** All 8 post-fix "stops" were this: 3 in the 2026-11-04 reading (`--since 2026-09-22`, read as a 1.5% residual) and 5 more in `--since 2026-11-04` (read as 8.1%). Each was checked by hand and each chained into `feature-verify-codify`. The corrected post-fix rate is **0 of 257**.
- **Context:** A reading of 8.1% would have triggered the "rate climbing back toward 7% reopens the upstream ask" branch of the close rule on a pure instrument artifact. ⚠️ The pre-fix baselines in `tests/results/M-PROSE-SHIP-BASELINE.md` may carry the same inflation, wherever FSD sessions fall inside their windows.
- **Suggested action:** In FSD context, count a `feature-verify-codify` invocation as the chain, or more generally accept the mode's next skill. Add a fixture with one FSD F10b → codify turn that must read as chained. Then re-derive the pre-fix baselines to see whether any moved.
- **Priority:** low (the F10b entry it was measuring is resolved; this matters only for future readings)
- **Status:** open — upstream (mccc); not yet sent

## Code-quality findings — paydown-2026-11-08-wp6-subprocess-primitives (2026-11-09)

- **Pointer:** **1 MAJOR + 4 MINOR** from the review of `1ccf9c4`. MAJOR: both kill exits of `run_streaming` drain the channel before setting the readers' stop flag, so a `setsid` writer flooding the pipe can keep the run (and the install lock) past its deadline. MINOR: `MAX_OUTPUT` carries three meanings; the truncation note implies arrival order; docs still name `spawn_blocking`; a long line is cut without a marker.
  Details: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) → `# paydown-2026-11-08-wp6-subprocess-primitives — 2026-11-09`.
- **Priority:** medium (MAJOR) / low (the rest)
- **Status:** pending
- **Pickup shape:** one small task: set `stop` (or bound the drain) at both exits with a `setsid`-flood test, plus the doc/naming MINORs in the same pass.

