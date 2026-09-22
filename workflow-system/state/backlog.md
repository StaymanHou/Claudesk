# Backlog

## Code-quality findings — fa-wp4-send-and-stage (2026-09-22)

- **Pointer:** **1 MAJOR (partially fixed) + 1 MINOR** from `feature-review-quality` against ship
  baseline `9264a6f..5af55f6`. ⚠️ **The review's other 2 MAJOR and 3 MINOR were FIXED AT REVIEW
  TIME, not backlogged** — including MAJOR-1, a guard that was mutation-confirmed to be checking
  nothing (deleting `sendModeForChord`'s `isStageOnlyChord` branch, which kills ⇧⌘↵ outright, left
  all 17 chord-registry assertions green). Details:
  [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) →
  `# fa-wp4-send-and-stage — 2026-09-22`.
- **Priority:** medium (the wiring-test item) / low (the comment-duplication item)
- **Status:** pending
- **Pickup shape:** the MAJOR wants a jsdom render capturing the panel's real send closure via
  `onRegisterSend`; the MINOR is a canonical-home-plus-pointers comment collapse spanning files
  WP4 did not author. ⚠️ Neither is a shipped defect — both are tripwires weaker than their prose
  claims, which is the review's own root-cause reading.
- **Reviewer's root cause, worth carrying:** *"guards whose STATED coverage exceeds their ACTUAL
  coverage"* — all three MAJORs were guards the agent wrote, believed, and documented as stronger
  than they were.

## Code-quality findings — m15-wp4-context-pressure-recycle (2026-09-14)
- **Pointer:** **4 findings remain — 0 CRITICAL, 0 MAJOR, 4 MINOR** *(was 7 — all **3 MAJORs** were RESOLVED on 2026-09-14 by the pre-WP5 observability paydown and deleted per delete-on-resolve; see CHANGELOG)*. ⚠️ **The three MAJORs were one defect — *the supervisor is not observable to the operator it acts for* — and were paid down together, before dogfooding, precisely because they would have made `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`'s five deferred behavioral checks undiagnosable:** `fireRecycle` now reports whether it started and the announcement is gated on it (with a distinct DECLINED log for the turn the ledger consumed for nothing); a successful fire is announced; and `wip_read` matches `Ok(None)` and `Err(e)` as separate arms with the error logged. ⚠️ **One mutation-testing finding worth keeping:** the behavioral Rust test for the last of these **cannot** discriminate — both arms return the same value by design and the only difference is an `eprintln!` that is not capturable in-process — so it is pinned by a source guard instead, and BOTH were mutation-proved individually. The 4 remaining MINOR: the `tokens` cast resting on a prose contract; a `useCallback` that memoizes nothing; `runtimes.md`'s `Last:`/`History:` disagreement; and an over-weight `lastIndex` comment. Full bodies: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# m15-wp4-context-pressure-recycle — 2026-09-14`.
- **Priority:** medium (the 3 MAJORs) / low (the 4 MINORs)
- **Status:** pending
- **Pickup shape:** ⚠️ **Do the 3 MAJORs together — they are one observability pass**, and doing them BEFORE the operator dogfoods is what makes the deferred behavioral checks diagnosable at all (a fire that leaves no trace cannot be confirmed or refuted by dogfooding). MINORs: the `as number` cast that should be a return type (the exact prose-contract shape WP3 paid down), a `useCallback` that memoizes nothing, a `runtimes.md` Last-vs-History ordering disagreement, and the `lastIndex` comment's 14:1 ratio — ⚠️ **fold that last one into the standing comment-convention item, do NOT trim per-WP** (measured as not converging). The reviewer explicitly endorsed KEEPING the `lastIndex` line itself; only the essay around it is the finding.

## Code-quality findings — m15-wp3-break-detection-and-auto-fire (2026-09-13)
- **Pointer:** ⚠️ **ALL 3 MAJORs + the `assertPinnedModel` live-guard gap were RESOLVED 2026-09-14** (`/feature-refactor`; see CHANGELOG 2026-09-14). **3 MINORs remain open.** What landed: the fan-out's `TurnReading` is now threaded into the verdict (one read, so the ledger key and the fire decision cannot describe different turns); `FanOutDeps.inject` requires a `label` and `fireOne` passes `SUPERVISOR_INJECT_LABEL` itself; the unsupervised-project refusal has its own `not-supervised` reason; and `assertPinnedModel` is called inside `adjudicate` **before the spawn**, so R-6 condition 1 is live rather than awaiting WP4's wiring. ⚠️ **The label's source-text guard was REPLACED, not supplemented** — it asserted the requirement was *stated* and survived a mutant that dropped the argument; the behavioral test kills that mutant. ⚠️ **The "still zero production callers" note is now STALE — WP4 supplied the caller** (`useSupervisor`, shipped 2026-09-14, `79c67e5` — hash rewritten by the 2026-09-14 rebase; was `75ad76d`), so these MINORs now sit behind live code rather than an unwired module. Remaining MINOR bodies: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# m15-wp3-break-detection-and-auto-fire — 2026-09-13`.
- **Priority:** low (all three remaining)
- **Status:** pending
- **Pickup shape:** comment-duplication across the supervisor modules (fold into the standing comment-convention item, do NOT trim per-WP — that is measured as not converging), the Rust timeout test that re-implements the production wait/kill loop, and the discarded adjudicator stderr. Independent polish; none blocks WP4.

## Code-quality findings — m15-wp2-state-machine-as-code (2026-09-12)
- **Pointer:** **2 MAJOR + 3 MINOR**, but ⚠️ **BOTH MAJORs and ONE MINOR were FIXED IN PLACE before finalize** — only 2 low-value MINORs remain open. **0 CRITICAL.** ⚠️ **The first MAJOR was a real latent defect in the module WP3 consumes:** `unmappedReason()` keyed on `workflow === "session-ops"` and returned `meta-op` for all 19, but only 12 actually are (6 are `cross-workflow`, 1 `terminal`, 2 dispatchable skills) — so a future session-ops edge with a real skill target and no policy row would have been silently labelled "no row owed", **hiding a genuine gap from the one report whose job is to surface them.** Fixed by keying on `dispatchTarget` with `terminal`/`cross-workflow` as their own reasons; ⚠️ this also **sharpened the gap report from 2 entries to 1** (`P13` is terminal — no row was ever owed; `I2` alone is the real gap). The second MAJOR: the `TRANSITION:` regex was exported from a **test file** — extracted to `src/state/workflowMachine/transitionToken.ts`, since shipping the parse half of the contract in `__tests__/` is this WP's own single-source thesis failing one layer up. Full bodies: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# m15-wp2-state-machine-as-code — 2026-09-12`.
- **Priority:** low (both remaining)
- **Status:** pending
- **Pickup shape:** both are test-file polish — collapse the arithmetic-derived count expectations, and extract the two funnel predicates to module scope. `/feature-refactor` handles them together in one pass.

## Code-quality findings — m15-wp1-supervisor-probe (2026-09-12)
- **Pointer:** **3 MAJOR + 3 MINOR** (6 entries), auto-backlogged per `drive_mode: autopilot`. **0 CRITICAL — no refactor owed.** ⚠️ **Two change what a reader BELIEVES, not just how the code looks, and both were verified at source before filing:** (1) the decisive `0.8` bar is stated **twice** — hardcoded in `scoreArm` and as unparsed prose in `_meta.threshold` — so the two can drift while each keeps asserting confidently; compounding it, **haiku's margin is computed against SONNET's `minTpForBar`**, correct only because both arms happen to share 29 positives, a coincidence never asserted. (2) the comment calls the naive baseline "consults no policy table at all", but it **excludes the 472 `undecided` records** — measured, a genuinely policy-free predicate flags **234, not 119**, and 119 is the headline figure in the ship commit, the probe report's Q1, and the circularity backlog entry. The third MAJOR is structural: both fixtures are read from a **cycle-archive directory `/product-finalize` owns and may relocate**, putting a 33-test break under the control of the skill whose job is to move those files. Full bodies: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# m15-wp1-supervisor-probe — 2026-09-12`.
- **Priority:** medium (the three MAJORs); low for the tautology/comment-density/naming polish
- **Status:** pending
- **Pickup shape:** the two comment-accuracy fixes (bar-from-`_meta`, naive-baseline framing) are small and should ride with **WP3**, which consumes both numbers; the fixture-path move is independent and is cheapest **before `/product-finalize` closes the M15 cycle**.

## Code-quality findings — drive-mode-on-the-workspace-surface (2026-08-26)
- **Pointer:** **4 MAJOR + 4 MINOR** (grouped as 5 entries), auto-backlogged per `drive_mode: autopilot`. **0 CRITICAL — no refactor owed.** ⚠️ **One is a LIVE user-facing defect, verified at source before filing:** during a queued apply the readout stays clickable and a second Apply is **silently discarded** while the readout shows the new value — the "readout claims a mode the session is not obeying" state AC-5 exists to prevent, reached by a different door (reachable only behind a busy agent, which is why every live verification missed it — they all ran against an idle session). ⚠️ **Findings 1, 2 and 4 share ONE fix**: extracting the apply operation into a `useDriveModeApply` hook gates the affordance, replaces a scheduler-timing sleep with a ref, and makes both source-guarded properties value-testable — pick them up as one item, not four. Full bodies: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# drive-mode-on-the-workspace-surface — 2026-08-26`.
- **Priority:** medium (the re-entrancy defect); low for the comment/CSS polish
- **Status:** pending
- **Pickup shape:** `/feature-refactor` on the hook extraction clears 1, 2 and 4 together; the MINOR sweep rides along.

## Code-quality findings — turn-output-reorientation (2026-08-25)
- **Pointer:** **3 MAJOR + 3 MINOR**, auto-backlogged per `drive_mode: autopilot`. **0 CRITICAL** — the review states this *"advances the codebase, with a modest, well-identified debt in guard shape and comment budget"*, so **no refactor pass is required**. ⚠️ **Two of the three MAJORs are about the WP's own VERIFICATION work, not the feature** — worth reading as a set. (1) `turnNavControls.test.ts` `?raw`-greps for **DOM-at-rest** questions, which `docs/lessons/source-text-guards.md` explicitly routes to a render test and for which it names **two existing precedents needing no new dependency**; the regexes break on a Prettier reflow and cannot cover gate-OFF. (2) The blank-app guard `turnNavExportContract.test.ts` covers **one import edge** while standing in for the **repo-wide boot smoke-test that was FILED rather than BUILT** — 4 sibling edges in the same directory remain unguarded, and the guard's own header **overclaims** its blast-radius coverage. (3) A genuine three-layer **contract drift**: `stepTurn` returns `nav`, `XtermPane` discards it, the handle returns a `boolean` that `Workspace` also discards in favour of a follow-up `turnNavState()` — while comments at two layers assert push-not-poll. Full bodies: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# turn-output-reorientation — 2026-08-25`.
- **⚠️ The density MINOR is an instance of an already-open standing finding, not new work:** `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`. This WP added **388 comment lines of 673 new production lines (58%)**, moved `XtermPane.tsx` 51% → 55%, and states the `.workspace-jump-turn-btn` deletion rationale in **four places**. ⚠️ **Fold it in rather than trimming per-WP** — that standing item records per-WP trimming as **measured NOT converging**, and this is the **second** M13.5 WP to produce such an entry (see `# window-geometry-persistence — 2026-08-21`), which is itself evidence for its thesis. ⚠️ **The retraction blocks are load-bearing and must NOT be swept** — each prevents a re-derivation that already cost real work.
- **The other 2 MINORs:** a 7-line comment documenting a `TURN_MARKER_COLOR` constant **that no longer exists** (delete); and `aria-live="polite"` on a **conditionally-mounted** span, so the **first** turn is never announced (render the region unconditionally, gate only its text).
- **Priority:** medium (3 MAJOR — guard shape + contract drift, no correctness impact) + low (3 MINOR)
- **Status:** pending
- **Pickup shape:** read the six entries in `backlog-quality-findings.md`, then `/feature-refactor`. To dismiss, edit the `## Code-Quality Review` section in the archived WIP and mark the line `[DISMISSED]`.

## Code-quality findings — window-geometry-persistence (2026-08-21)
- **Pointer:** **2 MAJOR + 4 MINOR** (grouped as 3 entries), auto-backlogged per `drive_mode: autopilot`. ⚠️ **Both MAJORs are about PROSE, not code** — the review found 0 CRITICAL and explicitly states "nothing here needs a refactor pass to be safe." (1) `window_state/mod.rs` carries **117 comment lines for 14 lines of executable code**, with a clean keep/move split — the four plugin-source properties and two flag-omission rationales stay; the provenance (display size, "verified live at P1.3", the `1280×800` history, the mutant-E narrative) is **already verbatim in commit `25a68bc`**, so it is deletion not relocation. (2) The **PiP-denylist rationale is stated at four sites** (`mod.rs` ×2, `lib.rs` ×2 regions, `Cargo.toml`) — the asymmetric-drift shape this repo has measured before. Full bodies: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# window-geometry-persistence — 2026-08-21`.
- **⚠️ Both MAJORs are instances of an already-open standing finding, not new work:** `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`, whose own resolution shape is **"one authority per rule + a pointer at every other site + a GUARD"** and which records that **per-WP trimming was measured as NOT converging** (four consecutive reviews of one file). **Fold these into it rather than paying them down separately** — a fifth per-file trim is the thing that finding exists to stop.
- **The 4 MINORs:** a bare `"main"` literal in a test that argues the opposite principle elsewhere; ⚠️ the vacuity guard's `!code.contains('"')` assertion being **broader than the property it names** (it would also reject a legitimate `.with_filename(..)`, and an over-broad guard is how guards get deleted rather than narrowed); `denylist()`'s fixed-size array baking the count into the signature; and the guard's doc comment restating commit-message history.
- **Priority:** medium (2 MAJOR — documentary/drift risk, no correctness impact) + low (4 MINOR)
- **Status:** pending
- **Pickup shape:** read the three entries in `backlog-quality-findings.md`, then `/feature-refactor`. To dismiss, edit the `## Code-Quality Review` section in the archived WIP and mark the line `[DISMISSED]`.

## Code-quality findings — wp2-background-work-status-states (2026-08-22)
- **Pointer:** **1 CRITICAL + 2 MAJOR — all three FIXED IN PLACE before finalize, not backlogged** (see the archived WIP's `## Code-Quality Review`). ⚠️ The CRITICAL was a **real shipped regression**: `recycleSession.ts` derived "a `Stop` arrived" from `state === "idle"` only, so WP2's new `background_work` mapping made a `Stop` with outstanding background work invisible — hanging Recycle to its 180s timeout in the *likely* case (Recycle runs `/session-handoff`, which may well have a job outstanding). Root method cause: the consumer sweep grepped `awaiting_input` consumers, a predicate structurally blind to a site keyed on `"idle"`. **2 MINOR remain open**, bodies in [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# wp2-background-work-status-states — 2026-08-22`: the CSS regex guard's shape-blindness (it will false-fail opaquely on a nested rule / custom property / shorthand), and the dead hyphenated `WorkspaceStatus` legacy type that is a casing-trap for the next person adding a state.
- **Priority:** low (both remaining)
- **Status:** pending
- **Pickup shape:** read the two entries in `backlog-quality-findings.md`, then `/feature-refactor`. To dismiss, edit the `## Code-Quality Review` section in the archived WIP and mark the line `[DISMISSED]`.

> **M15 (Workflow supervisor) cycle-close — backlog sweep 2026-09-15 (`/product-finalize`).**
> M15 complete — all 5 WPs shipped (WP1 probe → WP2 typed graph → WP3 detect+fire → WP4
> context-pressure recycle → WP5 exit verify; WBS archived to
> `workflow-system/product/archive/milestone-15-workflow-supervisor/`).
>
> **Sweep disposition: NOTHING NEWLY RESOLVED.** M15's resolvable items were closed incrementally at
> each WP's own `feature-finalize` and deleted then, per delete-on-resolve — most recently
> `SURFACE-2026-09-14-PAUSE-REFUSAL-TEST-DRIVES-THE-WRONG-EDGE-CLASS` (closed by WP5 Phase 2's two
> `verify-human`-GATE tests, deleted at ship `9b6cc00`). Of the 21 pending items whose text mentions
> M15, none was *resolved by* it; they are adjacent, not addressed.
>
> ⚠️ **THE CYCLE'S OWN EXIT CRITERION IS CARRIED FORWARD, NOT CLOSED.**
> `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` (**high**) now holds all
> **six** live checks — WBS tasks 5.1/5.4 among them — and **closing this cycle does not close it.**
> The trigger is the operator's first real dogfooding; an agent cannot manufacture it.
>
> **Surfaced during this cycle, all carried forward:**
> `SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET` (medium — R-6 condition 3,
> owed before any tuning leans on the +1-record margin) · `SURFACE-2026-09-15-STAGING-AREA-FOR-PROMPT-INPUT`
> (medium — operator feature request; ⚠️ the multi-line-injection question gates it) ·
> `SURFACE-2026-09-14-MANAGE-ISOLATED-CC-PROFILES-AS-CLAUDESK-WORKSPACES` (medium — operator request;
> two hard blockers recorded) · `SURFACE-2026-09-15-WIP-FILES-USE-PROSE-HEADERS-NOT-YAML-FRONTMATTER`
> (low — cross-repo, mccc) · `SURFACE-2026-09-14-DOCSLINKHANDLING-FLAKE-EXITS-NONZERO-WITH-ZERO-FAILURES`
> (medium) · `SURFACE-2026-09-13-GIT-CHECKOUT-SILENTLY-NO-OPS-ON-AN-UNTRACKED-FILE` (**high**).
>
> **Nothing escalated.** Open total at close: **52 items — 4 high, 3 medium-high, 20 medium, 3
> low-medium, 19 low.** ⚠️ **Advisory:** the standing code-quality/refactor batch has now rolled
> forward across several cycles — `/util-backlog-paydown` is the instrument for it, and this is a
> between-milestone boundary.

## SURFACE-2026-09-21-UNCHUNKED-BASE64-ENCODER-OVERFLOWS-ON-LARGE-INPUT

- **Priority:** low-medium
- **Source:** feature:build — F-a WP2 Phase 1 (2026-09-21)
- **Target level:** product:arch (a duplicated primitive, one copy of which has a size ceiling)
- **Type:** tech-debt
- **Status:** pending

**Two copies of "UTF-8 string → base64 for `cc_input`" exist, and one of them throws on large
input.** `autoResumeFire.ts`'s module-private `encodeUtf8Base64` builds its binary string by
spreading the entire byte array into a single `String.fromCharCode(...bytes)` call.
⚠️ **Measured 2026-09-21: it throws `RangeError: Maximum call stack size exceeded` at ~200k
characters.** `src/cc/bridge.ts`'s `encodeBase64` — whose own header calls it *"the single
frontend chokepoint for that encoding"* — does the same job with a **chunked** spread
(`CHUNK = 0x8000`) and is unaffected.

**Why it has not bitten:** the private twin's only callers are slash commands (`/session-restore`,
skill-row commands, supervisor fires), which are short by construction and cannot approach the
limit. The ceiling is real but currently unreachable **from those callers**.

**Why it is still worth recording:** F-a WP2 hit this while choosing an encoder for staged prompt
text, where a long single-take dictation is *exactly* the input that reaches 200k. That WP routed
around it (the staging path imports the chunked `encodeBase64`, pinned by a 200k regression test
in `stagedPayload.test.ts`) rather than fixing it — so **the trap is still armed for the next
caller who reaches for the nearer copy.** ⚠️ The duplicate also contradicts its own header, which
says *"Kept in this module (rather than imported) only because the encode is two lines; if a third
caller appears, hoist it."* A third caller has now appeared and deliberately did not use it.

- **Suggested action:** delete `autoResumeFire.ts`'s private `encodeUtf8Base64` and import
  `encodeBase64` from `cc/bridge` instead. ⚠️ **`slashCommandPayload`'s output bytes must not
  change** — it is pinned against a Rust twin and shared by M12 auto-resume, M13's skill row and
  M15's supervisor. The two encoders agree on all ASCII and multi-byte input; the only difference
  is the chunking, so the swap should be byte-neutral — but the existing byte pins in
  `autoResumeFire.test.ts` plus the wbs-2.4 guard in `stagedPayload.test.ts` are what prove it.
  Good `/feature-refactor` or backlog-paydown material; not urgent on its own.

## Code-quality findings — fa-wp2-draft-store-history-payload (2026-09-21)
- **Pointer:** **3 findings — 0 CRITICAL, 0 MAJOR, 3 MINOR.** ⚠️ **Both MAJORs were FIXED at review time, not backlogged**, and the first is worth knowing about: `appendToHistory` returned the intact ring on its blank-entry arm but a bare `[]` on the no-storage and quota arms — and **a throwing `setItem` leaves storage INTACT**, so `setRing(appendToHistory(p, t))` in WP3/WP4 would have blanked a populated UI ring against live data. ⚠️ **The round-4 test PINNED the bug**: it asserted `toEqual([])` against a stub whose `getItem` returned `null`, so `[]` was also what correct behavior produced — the assertion could not tell them apart. Both the code and that test are fixed and mutation-proved. The second MAJOR was comment density (measured 73%/58%/56% of physical lines) plus a rationale triplicated across three sites; trimmed to the comment budget's keep-list (measurements, rejected alternatives, what-to-do-when-this-fails) with zero provenance markers left in the implementation files, verified by grep. The 3 remaining MINOR: a `.filter()` that collects elements where it reads as collecting indices; a `loadHistory` read that precedes the storage guard it would short-circuit; and a `typeof`-guard comment overstating a production risk that only the test double can produce. Full bodies: [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# fa-wp2-draft-store-history-payload — 2026-09-21`.
- **Priority:** low (all 3)
- **Status:** pending
- **Pickup shape:** All three are one-liners and independent — no ordering constraint. ⚠️ **Do NOT "fix" the blank-check ordering by returning `[]` from that arm** — that reintroduces the MAJOR this WP just closed; only the guard *ordering* is the finding. ⚠️ **Fold the `typeof`-comment reword into the standing comment-convention item rather than doing a per-WP trim pass** — per-WP trimming has been measured as not converging (four consecutive reviews of the same file).

## SURFACE-2026-09-21-SUPERVISOR-HAS-NO-OPERATOR-VISIBLE-ACTIVITY-SURFACE

- **Priority:** high
- **Surfaced by:** operator request (2026-09-21, during F-a WP2 restore — a detour, not F-a work)
- **Target level:** product:roadmap (a new feature ask, not a defect in shipped code)
- **Type:** gap (missing capability)
- **Status:** pending

**The ask — TWO requirements, and the second was added 2026-09-21 after the first draft:**

1. **A retained activity record** answering, per workspace and across all of them — **was the
   supervisor triggered? when? how many times? with what input, and what output?** Today there is
   no way for the operator to tell whether the supervisor is working as designed, misfiring, or
   silently doing nothing at all.
2. ⚠️ **NON-INTRUSIVE IN-PLACE ATTRIBUTION — the operator must be able to look at a turn and tell
   whether the supervisor fired it or they typed it themselves** (operator, 2026-09-21). This is
   **not** a restatement of (1): (1) is a place you deliberately visit, (2) is a property of the
   turn as you encounter it in the normal course of work. ⚠️ **"Non-intrusive" is an operator-stated
   constraint, not a nicety** — the supervisor's value is that it does not demand attention, so an
   attribution marker that interrupts, steals focus, or adds noise defeats the feature it is
   reporting on.

⚠️ **THE HARD FACT FOR REQUIREMENT (2): a fired turn and a typed turn are INDISTINGUISHABLE
DOWNSTREAM, by construction.** `injectCommand` (`components/workspace/autoResumeFire.ts`) takes a
`label` — `"supervisor"` for every supervisor injection, enforced as a required parameter in
`fanOut.ts` — but **the label is consumed ONLY on the failure path** (the `catch`, for the warn
line and the `onIpcError` message). On success it is discarded, and the call is a bare
`invoke("cc_input", { sessionId, data: slashCommandPayload(command) })` — **byte-identical to what
the operator's own keystrokes produce.** CC receives no provenance, the transcript records none,
and the PTY cannot be read back. ⚠️ So requirement (2) cannot be satisfied by reading anything
downstream of the injection; the attribution must be **retained Claudesk-side at fire time** and
rendered from there. ⚠️ **Do not propose parsing the terminal to recover it** — `arch.md` forbids
reading CC's output as a state source, and it would not work anyway.

⚠️ **The gap is STRUCTURAL, not an oversight — the supervisor's design creates it.** Its whole
purpose is to silently type the next step on the operator's behalf, and it is deliberately
**headless** (`arch/workflow-supervisor.md` §G: zero `.tsx`, zero JSX, no panel / menu-id / chord /
row-cell / skill-row registration — a *recorded* decision). Compounding it, the operator's
attention is by construction on the workspaces **awaiting input**, not the ones quietly
self-driving — so the supervisor acts precisely where nobody is looking. **Success and total
inactivity are observationally identical.**

**What exists today, and why it does not close this.** §F ("Observability — what a fire leaves
behind", added `7f303e6` 2026-09-14 as a dogfooding precondition) gives every branch a distinct
trace — a successful fire, a started recycle, a **declined** recycle, an unreadable WIP, and
(M14 WP0) a per-non-fire **`withheld … — <reason>`** line drawn from a precise closed vocabulary
(`policy-not-auto`, `not-dispatchable`, `not-supervised`, `adjudicator-says-awaiting`,
`already-fired-for-this-turn`, `transcript-unreadable`, `no-verdict`, `unsent-input-present`).
⚠️ **But every one of them is a `console.warn` into the WKWebView console**
(`useSupervisor.ts`, `fanOut.ts`, `adjudicator.ts` all default `warn` to `console.warn`), which in
a shipped build the operator cannot open. ⚠️ And per
`[[read-logs-console-captures-nothing]]`, `read_logs{source:"console"}` captures nothing for this
app either — **so the traces are unreachable to the operator AND to an agent.** The data is
computed, correctly and completely, and then discarded to a sink nobody reads.

⚠️ **So this item is mostly a SURFACING problem, not an instrumentation one.** The expensive half
— deciding what to record and recording it at every branch — is already built and pinned by tests.
What is missing is a destination: a retained, readable, per-workspace history. Do **not** re-derive
the event vocabulary; read §F and the `withheld` reason list above.

⚠️ **This is the REVERSING CONDITION named in `arch/workflow-supervisor.md` §G, and it fires the
moment this item is built.** Giving the supervisor an operator-visible surface makes that surface
own the **SEVENTH** guard arm, and the `armSubjects` pin (`offInvariantGuard.test.ts` →
`it("still polices all six registries")`, currently **9** subjects) **must bump in the same
change**. The guard's backstop is real but partial — its allowlist is all of `src/**`, so a
panel/menu-id/chord *of a shape arms 1–3 already select on* trips today, while a genuinely novel
shape would not. ⚠️ Also: the surface must itself be gated **OFF** with the supervisor
(`workflow_features_enabled` / `host.enabled`), or the OFF-invariant acquires a dead affordance —
the exact thing M10.9's two-tier gate exists to prevent.

**Relationship to `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` (high):**
adjacent, **not** a duplicate, and they compound. That item is *verification debt* — six specific
behavioral checks deferred to dogfooding because an agent cannot manufacture the trigger. This item
is the *instrument* those checks would read. ⚠️ **Sequencing consequence worth weighing:** three of
those six checks (a live AUTO fire, the live gate-OFF invariant, the negative arm producing no fire)
are checks the operator must currently confirm **by watching a terminal at the right moment** —
with a retained activity log they become an after-the-fact read. Building this **before** or
**early into** dogfooding plausibly makes the dogfooding itself cheaper and more conclusive. That is
an argument for sequencing, not a decision.

**Open design questions (for `/util-grill-me` at the item's start — do not pre-decide here):**
1. **Surface shape** — right-panel tab, a section in an existing panel, filmstrip/tile affordance,
   or a menu-bar popover section? ⚠️ Note the operator's stated context: attention is elsewhere, so
   a surface requiring a deliberate visit may under-serve the "is it working at all?" question that
   motivated the ask, while anything ambient competes with the status dot.
2. **Retention + scope** — per-workspace only, or a cross-workspace roll-up? In-memory for the
   session, or durable across relaunch? ⚠️ If durable, the persistence-substrate question is live
   and **F-a WP2 decision 1 is the nearest precedent** (`localStorage` keyed by canonicalized
   `project_path`, explicitly **not** `projects.json`, because unbounded growth read through serde
   at startup can take the whole project list down).
3. **Granularity** — fires only, or fires + withholds? The `withheld` reason line is described in
   `useSupervisor.ts` as *"the tuning channel"* and is the signal that would distinguish
   "not working" from "correctly declining" — which is the operator's actual question. It is also
   far higher-volume than fires.
4. **"Inputs and outputs"** — how much of the decision to show. The natural candidates are the
   detected transition/step, the resolved policy cell, the adjudicator verdict when one was
   consulted, and the injected command. ⚠️ The transcript itself must **not** be surfaced
   wholesale — it is unbounded and the arch forbids reading CC's output as a state source.
5. ⚠️ **Where attribution (requirement 2) lives, and what carries it.** The label is retained at
   fire time Claudesk-side — but rendered where? Candidates: a marker in the terminal pane keyed to
   the fired turn, a per-workspace "last turn: supervisor / you" readout, a filmstrip-tile
   affordance, or a distinct transient status. ⚠️ The "non-intrusive" constraint and the
   `display: none` multi-workspace shell both bear on this, and any in-pane marker must not be
   written INTO the PTY (that would corrupt the buffer and be indistinguishable from CC output).
6. **Is a passive log enough, or is a notification wanted** when a fire happens on an unwatched
   workspace? ⚠️ Bears directly on the recorded risk that `injectCommand` has **no retry and no
   pre-send cancel window**, so a wrong fire's only recovery is CC's **Esc** — and check (5) of the
   dogfooding list, whether Esc actually interrupts a wrong fire, is itself still unconfirmed.

- **Suggested action:** carry into the next roadmap pass as a candidate alongside Group F. ⚠️ It is
  **not** F-a work and must not be folded into the running F-a WBS. Per the standing Group F
  practice, open it with its own `/util-grill-me` pass — questions 1–5 above are that grill's
  agenda, and the sequencing-against-dogfooding point is the first thing to settle.

## SURFACE-2026-09-17-F10B-STOPPED-BEFORE-VERIFY-HUMAN-INSTEAD-OF-CHAINING-INTO-IT
- **Source:** operator correction (M14 WP0, observed twice in one session)
- **Target level:** product:wbs
- **Type:** bug
- **Summary:** On `TRANSITION: F10b` in autopilot the agent **returned control to the operator
  before invoking `feature-verify-human`**, instead of chaining into it and letting the skill take
  its own pause at the checklist. Cost one operator turn per phase, twice in one session
  (Phase 1 and Phase 2).
- **Context:** ⚠️ **The pause-policy table already says the right thing** — `feature-verify-self`'s
  F10b row reads *"AUTO (chain into verify-human, which itself PAUSEs)"*, and
  `feature-verify-human`'s own table marks **skill invocation (entry)** as the PAUSE point. So the
  pause is supposed to live INSIDE verify-human, at the moment the checklist is presented.
  ⚠️ **The failure is subtle because the OUTCOME looks identical** — either way the operator ends
  up being asked to verify. What differs is that stopping early costs a turn AND skips everything
  verify-human does *before* its checklist: the §2 integration-boundary assessment, the §2
  auto-skip gate evaluation, and the §3 pre-filter that EXCLUDES outcomes verify-self already
  confirmed. An operator who says "proceed" gets those; an operator who is asked first does not
  get them until they answer.
  ⚠️ **Plausible cause worth checking before designing a fix:** the AUTO-exit hard rule is stated
  in terms of *"do not return control to the user"*, and a chain whose NEXT skill is itself a
  pause gate reads like an exception to an agent applying that rule literally. It is not — the
  rule's own parenthetical says so — but the phrasing invites the misread. The two other
  PAUSE-at-entry skills (`feature-spec`, `feature-plan`) have the same shape and the same risk.
- **Suggested action:** Operator's framing: fix in **mccc** (sharpen the rule so "the next skill
  is itself a pause gate" is named as explicitly NOT an exception — a chain-into-a-pause is still
  a chain) **or** in **Claudesk** (the M15 supervisor could enforce it mechanically: F10b in
  autopilot is an AUTO cell, so a turn that ends on it without a `Skill` call is exactly the
  "wrongful stop" class the supervisor was built to detect). ⚠️ **Claudesk's supervisor would
  have caught this one** — it is a textbook AUTO-cell break, which makes it a useful real-world
  test case for the dogfooding pass. Scheduled as QoL work immediately AFTER the WP0 hotfix ships
  (operator, 2026-09-17).
- **Priority:** medium
- **Status:** open

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
- **Status:** open

## SURFACE-2026-09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1
- **Source:** operator dogfooding (v0.5.0, first real use of the M15 workflow supervisor)
- **Target level:** product:wbs
- **Type:** bug
- **Summary:** First operator feedback from live supervisor use. ⚠️ **RECORDED, NOT TRIAGED —
  the operator explicitly said "just record it" and expects to add more.** Do not act on these
  without a triage pass; do not treat this entry as closed when one item is fixed.
- **Context:** This is the first feedback of its kind. `SURFACE-2026-09-14-SUPERVISOR-NEVER-
  OBSERVED-FIRING-IN-A-LIVE-SESSION` (high) has been open because the supervisor's live half had
  never been observed acting. ⚠️ **Item 2 below is the first direct evidence that it FIRES in a
  real session** — which partially satisfies that item's observation question while simultaneously
  reporting the fire as unwanted. Both facts matter and neither cancels the other.

  **Item 1 — "inference / transition check would freeze the UI."**
  ⚠️ Matches a KNOWN and PREVIOUSLY-BURNED failure mode, which is why it is the highest-signal of
  the three. `CLAUDE.md`: *"`#[command]` fns + `on_window_event` are main-thread — which cuts BOTH
  ways: an AppKit call inside one is safe, but a `thread::sleep`/blocking poll, or a lock held
  across a main-thread-marshaling call, FREEZES the UI. A sync `cc_kill` doing exactly this hung
  the app (P1 2026-08-25; `sample` was the instrument that found it)."* The supervisor reads
  transcripts and may shell out to a `claude -p` adjudicator; either on a main-thread path would
  reproduce this shape. ⚠️ **`sample` is the instrument that found it last time** — use it again
  rather than reasoning from the code.

  **Item 2 — "I'm typing something midway, and the supervisor auto chained."**
  ⚠️ **This is the recorded dissent arriving in reality.** M15's fire policy is *silently, always*,
  chosen over announce-then-click and over a countdown veto. The dissent was recorded AND SIZED at
  decomposition: ~2-in-19 confirmed breaks were question-shaped, and `injectCommand` has **no retry
  and no pre-send cancel window** by design, so a wrong fire is unrecoverable except via **Esc**.
  ⚠️ **Probe Q2 (can a question-shaped / answer-awaiting tail be detected?) was the gate on this
  policy and it REMAINS OPEN** — `roadmap.md`'s own instruction was: if Q2 fails, revisit the fire
  policy before building WP3, do not build it anyway. This report is evidence the un-gated case is
  real. ⚠️ Note the operator was TYPING — which is a *different* signal from a question-shaped
  tail, and may be cheaper to detect (local UI state, no transcript parse).

  **Item 3 — the operator's question: "it's only working when workflow is enabled and a project
  is using workflow, right?"** ✅ **ANSWERED FROM SOURCE, 2026-09-15 — YES, with two conditions,
  not one.** `Workspace.tsx:620` passes `enabled: workflowFeaturesEnabled` (the M10.9 gate hook)
  into `useSupervisor`, and `useSupervisor.ts:110` re-checks `if (!host.enabled) return` on every
  turn — deliberately re-checked at fire time rather than only at subscribe time, so flipping the
  gate mid-session takes effect immediately. **Second condition:** `useSupervisor.ts:115` returns
  early when `storedMode === null`, so a project with no stored drive mode in `projects.json` is
  never supervised either. So: gate ON **and** a stored drive mode. ⚠️ Ruling R-1 is what makes the
  second condition bite — the STORED mode is the authority, so a project inherits supervision from
  `projects.json` regardless of how the turn was entered.
- **Update 2026-09-17 — ⚠️ WP0 PHASE 1 SHIPS WITH ITS HANDS-ON CHECKS DEFERRED, and they must
  ride the release.** The unsent-input suppression is built and mechanically proven (watermark
  state machine, suppression placement, ledger-claim semantics, AC-7 both behaviorally and
  structurally, caller wiring — all mutation-proven). ⚠️ **But "does it actually stop interrupting
  the operator" was NOT observed** — an agent-launched CC emits no hook events, so the supervisor
  never fires under agent testing, and the operator approved on the mechanical evidence while
  explicitly stating no hands-on test was performed. **Seven checks are carried as
  `DEFERRED-TO-DOGFOODING` on `P1.verify-human.1-7`** in `wip/supervisor-hotfix.md`:
  1. Unsent line present at turn end → NO fire, text intact. *(the reported defect)*
  2. ⚠️ A line walked away from for minutes → STILL no fire. **The ruling's load-bearing case —
     a debounce-on-recent-keystrokes implementation would fire here and pass check 1.**
  3. Esc, then turn end → fires normally.
  4. Ctrl+C and Ctrl+U → fire normally.
  5. Enter/submit → fires normally.
  6. After a suppressed turn, subsequent turns resume chaining (the suppressed turn itself stays
     spent **by design**).
  7. Esc-dismissing a CC *menu* clears the watermark early — the **recorded accepted cost** of the
     D-2 decay ruling. Confirm it is tolerable in practice.
  ⚠️ **Checks 1-2 and 6 are markedly easier to judge AFTER WP0 Phase 3 ships the suppressed-state
  marker** — until then suppression is invisible and must be inferred from the absence of an
  unwanted fire, which is exactly the write-only problem Phase 3 exists to fix. ⚠️ **Read the
  `DEFERRED-*` tags on those leaves, not their `[x]` checkboxes** (the M15 WP4/WP5 convention).
- **Update 2026-09-17 (WP0 close) — ⚠️ PARTIALLY RESOLVED; the entry SURVIVES, slimmer.**
  **Item 2 is ADDRESSED IN CODE** by WP0 (`a46ae89`): unsent-input suppression + a per-workspace
  toggle + a suppressed-state marker, all mechanically proven and mutation-tested. ⚠️ **But it is
  NOT closed**, for two independent reasons, and the entry is deliberately not deleted:
  (a) the seven hands-on checks below are `DEFERRED-TO-DOGFOODING`, so the fix is *built and
  unobserved* — "does it actually stop interrupting the operator" has never been witnessed; and
  (b) ⚠️ **no release has been cut** (task 0.7 open; latest tag `v0.5.0`), so the operator's own
  Claudesk is **still running the UNFIXED supervisor** — which is itself what blocks (a).
  ⚠️ **Item 2's FIRE-POLICY question also remains open and is NOT what WP0 answered.** WP0
  implements the narrower "suppress when unsent input is present" candidate; the probe-Q2 question
  (can a question-shaped / answer-awaiting tail be detected?) that gates the *silently-always* fire
  policy is untouched. **Item 1 (UI freeze) is explicitly out of WP0's scope and wholly untouched.**
  **Item 3 needs no action — answered 2026-09-15.**
- **Suggested action (remaining open work):** ⚠️ **Item 1** — still the highest-signal item, and
  now the only one with no work against it: `sample` against a frozen app (the P1 2026-08-25
  playbook), NOT reasoning from the code. ⚠️ **Item 2's residue** — after a release lands, run the
  seven deferred checks; then decide the fire policy proper (probe Q2), which WP0 deliberately did
  not settle. Triage what remains as a batch, not one-at-a-time.
- **Priority:** high
- **Status:** open

## SURFACE-2026-09-15-CHORD-COMPLETENESS-GUARD-KEYS-ON-A-NAMING-CONVENTION
- **Source:** feature:build (M14 WP3 Phase 1, raised by the verify-self auditor)
- **Target level:** product:wbs
- **Type:** tech-debt
- **Summary:** The chord-registry COMPLETENESS guard (`chordRegistry.test.ts`) walks code → registry
  by regex-matching call sites on `/[Cc]hord/` plus two named `*Index` symbols. That selector is a
  **naming convention, not a structural property** — a future chord matcher named outside both
  conventions (e.g. `zoomForKey`) would be invisible to it.
- **Context:** The guard exists because the reachability guard only walks registry → code and
  therefore could not see two chords the app registered but the registry omitted (terminal font
  zoom, ⌘\ toggle-wrap — both shipped in the comment map's blind spot before this WP). The
  completeness guard closes that direction **for chords named by today's conventions**. It caught
  everything present at the time of writing and an independent hand enumeration found no omission
  it missed — but it is one rename away from the same class of hole it was built to close.
  ⚠️ Note `terminalFontZoom.ts` — the module that was actually missed — does NOT match `*Chord*`;
  it is caught only because its exported symbol `terminalZoomForChord` does. That is exactly how
  narrow the margin is.
- **Suggested action:** Make the selector structural rather than lexical — e.g. require every
  capture-phase keydown handler in a registration host to route through a registry-aware helper, so
  "is this chord known?" becomes a property of the call path instead of the callee's name. That is a
  refactor of three working registration hosts (App.tsx, RightPanelHost.tsx, EditorPanel.tsx,
  Workspace.tsx), so it wants its own change with its own verification — deliberately NOT bolted
  onto a data-extraction phase.
- **Priority:** medium
- **Status:** open

## SURFACE-2026-09-14-DOCSLINKHANDLING-FLAKE-EXITS-NONZERO-WITH-ZERO-FAILURES
- **Source:** feature:verify-codify (M15 WP4 Phase 5)
- **Target level:** product:arch
- **Type:** bug (flaky test / unhandled async rejection)
- **Summary:** `pnpm verify:auto` intermittently **exits 1 while reporting `2587 passed`, `0
  failed`, `190 test files passed`**. The non-zero exit comes from `Errors  1 error` — an
  unhandled rejection thrown from a `setTimeout` callback **after** the suite completes:
  `scrollToFragmentWhenPresent` → `handleDocLinkClick.ts:160` → `Timeout._onTimeout`, attributed
  to `docsLinkHandling.test.ts`.
- **Context:** Observed once during M15 WP4 Phase 5; **not reproducible on demand** — the file
  passes 14/14 in isolation (2 runs) and the full suite exits 0 (2 runs) immediately afterward.
  M11 docs code; WP4 touched nothing in it. ⚠️ **The dangerous property is the SHAPE, not the
  frequency:** a gate that exits non-zero while reporting zero failures teaches a future session
  to "just re-run until green" — which is precisely how a REAL failure gets waved through. It also
  cost one full-gate cycle to classify.
- **Suggested action:** Make the timer cancellable — `scrollToFragmentWhenPresent`'s polling
  timeout should be cleared on unmount/teardown so no callback can fire after the test that
  scheduled it has finished. Alternatively give the test an explicit teardown that drains pending
  timers. ⚠️ Do **not** "fix" it by loosening the runner's unhandled-error reporting: that
  reporting is what surfaced it.
- **Priority:** medium (intermittent; no product impact — but it degrades trust in the one gate
  this project relies on, and the failure mode is self-concealing)
- **Status:** pending

## SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION
- **Source:** feature:verify-human (M15 WP4 Phase 4)
- **Target level:** product:wbs
- **Type:** gap (verification debt, not a known defect)
- **Summary:** M15 WP4 wires the workflow supervisor to its **first production caller**, but the
  supervisor has **never been observed actually firing in a live CC session**. Five behavioral
  checks were deferred at verify-human because the trigger cannot be reliably manufactured: (1) a
  live AUTO-edge fire, (2) the gate-OFF invariant under a real turn, (3) the installed-`.app`
  GUI-PATH smoke test, (4) an unattended context-pressure recycle at a real phase boundary, (5)
  **Esc recovery for a chained one-step run**.
- **Context:** Everything statically checkable IS verified — `pnpm verify:auto` green (2580
  frontend / 919 Rust), the `"supervisor"` label chain intact end-to-end, the M10.9 gate checked
  twice, `fanOut` provably unwired, four wiring mutants killed individually. ⚠️ **The wiring is
  proven; the behavior is not.** Operator's reasoning (2026-09-14): *"It's hard to consistently
  trigger these conditions without actually using it"* — and manufacturing a trigger would verify
  the fixture rather than the feature (`[[verify-self-stub-cannot-cross-subprocess-boundary]]`).
  ⚠️ **THE RISK:** the supervisor fires with **no human watching**, and `injectCommand` has **no
  retry and no pre-send cancel window** — the only recovery from a wrong fire is CC's **Esc**,
  which is itself deferred check (5). So a wrong fire on an unwatched workspace is unrecoverable
  AND its recovery path is unconfirmed.
- **Suggested action:** Operator-owned; trigger is the first real dogfooding after M15 ships.
  Check (3) folds into the standing `/release`-gate practice
  (`[[installed-build-verify-deferred-to-release]]`) and needs a build newer than v0.4.0/Sep-6 —
  the installed app predates this code by 8 days and cannot exercise it. ⚠️ **WP5's exit verify
  must read these as OPEN.** A future session finding `[x]` on the P4.verify-human leaves must read
  their `DEFERRED-*` status tags, not the checkbox: the checkbox means the gate closed, not that
  the behavior was observed.
- **Priority:** high (it is the milestone's core behavior, unobserved, with an unrecoverable
  failure mode and an unconfirmed recovery path)
- **Update 2026-09-14:** ⚠️ **The observability blocker that would have made these checks
  undiagnosable is CLEARED.** The three MAJORs from this WP's quality review were paid down before
  any dogfooding (see CHANGELOG): a successful fire is now announced, a declined recycle is logged
  distinctly, and an unreadable WIP is distinguishable from an absent one. **This does not close
  this item** — the behavior is still unobserved — but a fire or recycle now leaves a trace, so
  when dogfooding does trigger one the five deferred checks have evidence to read.
- **Update 2026-09-15 — ⚠️ M15 WP5's PHASE 3 IS FOLDED INTO THIS ITEM, AND WP5 SHIPPED WITHOUT
  IT (operator decision).** WP5 planned a "Live observation" phase whose six checks are the same
  behaviors listed above; it was never run, for the same reason they were deferred at WP4 — an
  agent cannot manufacture the trigger (`SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`:
  an agent-launched CC emits no hook events). The operator approved shipping WP5 with it open
  (P1.verify-human.3 and P4.verify-human.3, both 2026-09-15) rather than blocking the milestone.
  ⚠️ **SO M15 CLOSED WITH ITS EXIT CRITERION EXPLICITLY UNMET — recorded, not hidden.**
  `arch/workflow-supervisor.md` §H and `CLAUDE.md` both say so in terms.

  **The six checks to run at first dogfooding** (WP5's list — note it has **one more** than WP4's,
  the gate-OFF check having been missing from WP5's plan until Phase 1 caught it):
  1. A real AUTO-policy turn that stops is detected and fired **without operator input**, across a
     real multi-workspace session.
  2. ⚠️ **Gate OFF → the same turn fires nothing** (the OFF-invariant, live).
  3. The negative arm live: a legitimate `verify-human` PAUSE, an `ESCALATE`, and a no-stored-mode
     project each produce **no fire at all**.
  4. A context-pressure recycle observed at a **non-final** phase boundary above 400,000 tokens.
  5. ⚠️ **Esc actually interrupts a wrong fire** — R-1's accepted cost rests on this and it has
     never been confirmed.
  6. Installed-`.app` smoke test (GUI-PATH) — ⚠️ needs a build newer than `c55d5fa`; folds into
     the `/release` gate.

  ✅ **What is now easier than it was at WP4:** every fire, recycle and declined-recycle leaves a
  distinct log line (the 2026-09-14 observability paydown), so these checks have evidence to read
  rather than silence to interpret. The mechanical half is also fully pinned by standing tests —
  `verdictReplay.test.ts` (34/36 on the non-circular set), `verdict.test.ts`'s negative arm
  including the **verify-human GATE** (added at WP5 Phase 2), and the recycle conditions.
  **What remains is exactly and only the live behavior.**
- **Update 2026-09-15 (b) — ⭐ THE STRUCTURAL BLOCKER IS CLEARED: `v0.5.0` IS CUT.** The installed
  app was `v0.4.0` (2026-09-06) and predated every line of the supervisor, which made all six
  checks *unsatisfiable* — the same trap M13.5 WP1 hit. `v0.5.0` (2026-09-15, 22 commits, the whole
  of M15) contains them. ⚠️ **This does NOT close the item, and the release must not be read as
  progress on it** — the checks are now **satisfiable but still unsatisfied.** Two operator
  conditions gate the actual observation: the upgrade waits until **all mid-flight tasks reach a
  clean boundary** (a `brew upgrade` deletes and re-quarantines the running app, killing every live
  Claudesk session), and the supervisor then needs **at least one full week of real use** before
  its behavior is worth judging. ⚠️ **Expect this item to stay open for weeks; that is the plan,
  not a stall.** Check 6 (installed-`.app` GUI-PATH smoke) is satisfiable the moment the upgrade
  lands; checks 1–5 need the week. Sequenced in `roadmap.md` → Revision 2026-09-15 as the
  **dogfeedback** step, deliberately *after* M14's remainder because that work does not depend on
  this clock.
- **Status:** pending

## SURFACE-2026-09-21-MACOS-TEXT-INPUT-SERVICES-DEAD-UNDER-TAURI-DEV

- **Priority:** medium
- **Surfaced by:** feature:build — F-a WP1 Phase 2 verify-human (2026-09-21)
- **Target level:** product:arch (a verification-capability constraint, not a bug)
- **Type:** gap
- **Status:** pending

**macOS dictation does not engage AT ALL under `pnpm tauri:dev`, but works in the installed
prod app.** Observed while running the F-a WP1 dictation probe: dictation refused to start in
all three probe arms **including a plain `<textarea>`**, and equally in the **dev app's own code
editor** — the same CM6 code the operator confirmed working **concurrently** in the installed
prod app.

**Likely mechanism (direct evidence, not isolated):** `tauri:dev` runs a **bare adhoc-signed
Mach-O** (`codesign`: `Identifier=claudesk-<hash>`, `Signature=adhoc`, no `TeamIdentifier`, no
hardened runtime) with **no `.app` bundle** under `target/debug/`. Prod is a Developer-ID bundle
(`com.claudesk.app`, Team `C8RJH77B47`, hardened runtime). macOS dictation is a system
text-input service that attaches to an app with a real bundle identity. ⚠️ Per-app TCC was NOT
inspected — it needs Full Disk Access, deliberately not granted.

⚠️ **Why this matters beyond the probe:** it is a **standing limit on what `tauri:dev` can
verify.** Any feature depending on macOS text-input services — dictation, and plausibly
autocorrect, the emoji picker, the character palette — **cannot be verified in a dev build** and
needs an installed `.app`. This is a sibling of the known **GUI-PATH** constraint (a
Finder-launched `.app` inherits a minimal PATH, which `tauri:dev` never reproduces): both are
cases where the dev build is not a faithful stand-in, and the verify-self tier list should say so.

⚠️ **Hypotheses already killed — do not re-propose:** a CM6/contenteditable problem (the
`<textarea>` failed too); a WKWebView/Tauri limitation (prod is both, and works); a missing
entitlement (prod has the stricter posture); `spellcheck="false"` (the working prod editor
carries the identical attributes).

- **Suggested action:** add the constraint to `docs/lessons/verify-self-tiers.md` beside the
  installed-build/GUI-PATH tier, so the next feature touching text-input services does not
  rediscover it. Fold in whatever the F-a WP1 Phase 3 run settles about *how* to run a probe on
  an installed build without shipping dev-only scaffolding or killing a running Claudesk.

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

## SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET

- **Priority:** medium
- **Surfaced by:** M15 WP5 Phase 2 / P2.4 (feature:verify-human — operator-approved as explicitly owed)
- **Target:** M15 supervisor — the `claude -p` adjudicator (`src/state/supervisor/adjudicator.ts`)
- **Type:** gap

⚠️ **R-6's condition 3 is NOT discharged, and M15 closes without discharging it.** R-6 shipped WP3
as GO-WITH-CONDITIONS with three binding conditions. Conditions 1 and 2 are shipped and tested —
the adjudicator model is **pinned** and `assertPinnedModel` runs inside `adjudicate` before every
spawn (so a silent downgrade fails loudly), and the failure direction is **withholding**, pinned by
`verdict.test.ts:362` ("withholds when the adjudicator fails — the failure direction, end to end").
**Condition 3 — re-measure on a larger labelled set BEFORE relying on the margin — is not.**

⚠️ **Why it matters: the margin is thin and the bar is CHOSEN, not measured.** Q2 came back
`SEPARABLE` on a **+1-record margin** (sonnet 25/29 against a ≥24 bar; haiku is NOT_SEPARABLE at
23/29), with only **70 of 96** records scorable. The 0.80/0.80 threshold is *"accepted as-is but is
a CHOSEN bar, not a measured constant"* (R-6, verbatim). So the adjudicator's accept/reject
behavior rests on a number nobody has validated at scale — and R-5 made the adjudicator
**load-bearing for correctness** on the Q2 slice, not merely a cleanup tail.

⚠️ **This is the one thing a probe would still have bought.** WP5/P2.4 re-checked §4's exemption of
the adjudicator from its own probe WP and concluded it HOLDS — but explicitly on the basis that
conditions 1 and 2 discharge what the probe was for. Condition 3 is the residue. **It is recorded
as owed rather than silently dropped**, per the operator's approval at WP5 Phase 2 verify-human
(2026-09-15).

**The one cheap mitigation already in place:** R-3 established the fixture is *rebuildable* from the
corpus, and `wp1-break-fixture.json` (2,284 records) is checked in — so re-labelling a larger set
does not start from zero.

**Suggested action:** re-mine and label a larger set, re-score `sonnet` against it, and either
confirm the 0.80/0.80 bar or move it to a measured value. ⚠️ **Do this BEFORE any tuning that
leans on the current margin** — that is the trigger R-6 named, and it has not fired yet.
- **Status:** pending

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
- **Status:** pending

## SURFACE-2026-09-14-MANAGE-ISOLATED-CC-PROFILES-AS-CLAUDESK-WORKSPACES

- **Priority:** medium
- **Surfaced by:** operator request (session detour, 2026-09-14)
- **Target:** product:roadmap (a milestone-sized capability, not a task)
- **Type:** new-work

⚠️ **DETAILS DELIBERATELY NOT SPECIFIED — the operator's explicit instruction was that the design
is to be discussed when the work actually starts.** This entry records the ASK, the two hard
blockers found while sizing it, and the one seam that already exists. It is **not** a design.

**The ask.** The operator now runs several **isolated Claude Code environments** created by
`~/Personal/projects/claude-code-wrapper-agent-boilerplate` — each a separate profile with its own
`CLAUDE.md`, skills, subagents, MCP servers, memory, projects, history and state, rooted at
`~/.config/claude-<name>/` via **`CLAUDE_CONFIG_DIR`**. These would ideally be managed by Claudesk
and benefit from what is already built (picker, workspaces, PTY terminal, status surfaces,
editor/diff, time analytics, the M15 supervisor).

⚠️ **BLOCKER 1 — the profiles are SHELL FUNCTIONS, not binaries.** `create-env.sh` appends a
block-delimited `claude-<name>()` function to `~/.zshrc` that sets `CLAUDE_CONFIG_DIR` and execs
`claude`. Claudesk spawns a hardcoded `const CC_CMD: &str = "claude"`
(`src-tauri/src/cc_session/mod.rs:42`) — so **a `claude-<name>` profile cannot be spawned by
Claudesk at all today**, and it is not on `PATH` either (a zsh function is invisible to a direct
exec). ⚠️ Note this interacts with the GUI-PATH work already done in `env_path/`: capturing the
login-shell `PATH` does **not** capture shell *functions*.

⚠️ **BLOCKER 2 — the status channel is single-rooted and would go DARK.** Claudesk registers its
hook into `~/.claude/settings.json` only (`hook_install/`). An isolated profile reads
`~/.config/claude-<name>/settings.json` instead, so a profile session would emit **no hook events**
— no idle/running/awaiting-input dot in the filmstrip, PiP, or menu bar. ⚠️ **That is the product's
core value proposition, not a nice-to-have**, so "just spawn it and see" is not a viable first
step: it would look like it worked while silently losing the thing the app is for.

✅ **The seam that already exists.** `cc_spawn_env()` (`cc_session/mod.rs:599`) already builds the
PTY's environment and already carries the drive-mode + gate signals, so `CLAUDE_CONFIG_DIR` has an
obvious insertion point. Spawning `claude` directly **with `CLAUDE_CONFIG_DIR` set** — rather than
going through the shell wrapper — is the likely shape and would sidestep blocker 1 entirely;
blocker 2 still needs a real answer (per-config-dir hook registration).

**Open questions for the design discussion (NOT answered here):** is a profile a property of a
*project* or a separate workspace kind? · does `projects.json` gain a `config_dir` field? · does
hook installation become per-profile, and who owns teardown? · how does the M10.9 workflow gate
interact with a profile whose skills live elsewhere? · does the time-analytics capture (already
machine-global) need to distinguish profiles? · does the M15 supervisor's transcript reader follow
`CLAUDE_CONFIG_DIR` for its slug computation (it currently assumes `~/.claude/projects/<slug>/`)?

**Suggested action:** size as a **roadmap milestone** at the next `/product-finalize` or roadmap
pass — after M15 closes and M14's remainder. Start the design discussion then, with the operator.
⚠️ **Open with a `/util-grill-me` pass** (booked by the operator 2026-09-15), and expect a real
**spec** pass rather than a plan pass — the operator's words were "we will need to think it through
and work on the spec well."
- **Update 2026-09-15 — ⭐ SCOPE EXPANDED: absorb the boilerplate, do not just consume its output.**
  Operator direction. Claudesk should own **profile creation**, folding in what
  `~/Personal/projects/claude-code-wrapper-agent-boilerplate` does today, so provisioning a profile
  is a Claudesk operation rather than a shell script run beforehand. ⚠️ **This changes the shape,
  not just the size:** `create-env.sh`'s appending of a `claude-<name>()` function to `~/.zshrc` is
  precisely the mechanism behind **blocker 1**, so owning creation lets Claudesk **stop generating
  the shell-function indirection entirely** and spawn `claude` directly with `CLAUDE_CONFIG_DIR`
  set. ⚠️ **Blocker 2 is NOT dissolved and gets HARDER** — owning creation means owning
  **per-config-dir hook registration** as part of provisioning, plus teardown on profile deletion.
  *A profile Claudesk created but cannot see the status of is worse than one it never created.*
  ⭐ **And the boilerplate itself must be representable as a profile** — a self-hosting property and
  a **design constraint, not a nice-to-have**: if the thing that creates profiles cannot itself be
  one, the model has a special case at its center. Cheap to design for, expensive to retrofit —
  check it early in the spec.
- **Status:** pending

## SURFACE-2026-09-13-GIT-CHECKOUT-SILENTLY-NO-OPS-ON-AN-UNTRACKED-FILE

- **Priority:** high
- **Surfaced by:** M15 WP3 Phase 5 (feature:build, mutation testing)
- **Target:** verification method (`docs/lessons/source-text-guards.md`)
- **Type:** gap

⚠️ **`git checkout -- <path>` on an UNTRACKED file does nothing and reports success.** Used to
restore a mutation probe in `src/state/supervisor/fanOut.ts` (a new, untracked module); the
command exited 0, printed nothing, and **left the mutated file in place**. Caught only because
the restore was verified by `shasum` against a pre-mutation baseline rather than by trusting
the command.

⚠️ **The failure mode is a MUTATED FILE SHIPPING**, and it is silent in both directions: the
mutant stays, and the "restore" looks done. `git status` would show the file as `??` either
way, so it is not a tell.

**The rule:** for any mutation probe, capture `shasum` BEFORE and verify it AFTER. ⚠️ For an
untracked file `git diff`/`git checkout` are not merely weak evidence — they are **inapplicable**,
and a `git diff --stat` that shows "no change" is vacuously true. (A subagent independently
flagged the `git diff --stat` half of this at Phase 4 verify-self; this is the `checkout` half,
which actually bit.)

**Suggested action:** fold into `docs/lessons/source-text-guards.md` as a mutation-testing
precondition — `cp` the file aside, or capture the SHA, before mutating.
- **Status:** pending

## SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT

- **Priority:** high
- **Surfaced by:** M15 WP3 Phase 1 (feature:verify-self)
- **Target:** M15 WP3 Phases 2-5 (every phase whose outcomes need a real turn-end)
- **Type:** gap

⚠️ **A CC session spawned by an agent-launched Claudesk produces NO hook events, so no
turn-end can be observed the obvious way.** The child inherits `CLAUDE_CODE_CHILD_SESSION`,
which turns transcript saving OFF (the pane itself prints the warning) and the hook chain
never fires. Measured: a full live CC turn in `scratch-a` left the status label at `Unknown`
and appended nothing to the session's transcript — `grep -c` for the typed prompt returned 0
against a file whose mtime was one minute old.

⚠️ **This makes the naive verify-self read a FALSE FAIL** — the feature works, the instrument
cannot drive it. It extends `[[agent-launched-app-cannot-verify-continue]]` from `--continue`
to the whole hook channel.

**The working technique (used to verify Phase 1):** write hook JSON directly to the dev app's
Unix socket at `~/Library/Application Support/com.claudesk.app.dev/hook.sock` — one JSON
object per line, same shape the hook script sends. This drives the REAL backend path
(`hook_socket` -> `status_broadcaster::to_update` -> `workspace-status` emit -> the webview),
so it is not a stub: only the CC process is replaced, not any Claudesk code. Confirmed by
`status-channel.log` showing `outcome=emitted` and by a live `listen` tap receiving the payload.

⚠️ **Also needed to see the payload at all:** register the listener through the app's own
bundled module (`await import("/node_modules/@tauri-apps/api/event.js")` inside an injected
`<script type="module">`). A bare `@tauri-apps/api/event` specifier does not resolve, there is
no `window.__TAURI__` global, `__TAURI_INTERNALS__` exposes only `plugins` (no `invoke`), and
the `__internal_unstable_listeners_object_id__` registry reads EMPTY even while events are
demonstrably flowing — ⚠️ a tap on it is an INVALID PROBE, not a negative result.

**Suggested action:** use socket injection for WP3's remaining phases; consider a small helper
script under `tooling/` so each phase does not re-derive it.
- **Status:** pending

## SURFACE-2026-09-12-ONE-TRANSITION-HAS-NO-PAUSE-POLICY-ROW-UPSTREAM

⚠️ **NARROWED 2026-09-12 at code-quality review — was "TWO TRANSITIONS".** `P13` (product-finalize → EXIT) is **terminal**, so no pause-policy row is owed and its absence was never a gap. The over-broad claim came from a gap classifier that keyed on an edge's *workflow* rather than its *target*; fixed, and the report now names exactly the dispatchable edge that is genuinely missing a row. **`I2` alone stands.**

- **Priority:** medium
- **Surfaced by:** M15 WP2 Phase 3 (feature:build) — the edge→policy-row derivation's coverage survey
- **Target level:** mccc (`transitions.md`) — a cross-repo question, NOT a Claudesk fix
- **Type:** gap

⚠️ **Two transitions in `transitions.md` have no governing pause-policy row**, found by exhaustively resolving all 111 edges against all 58 policy rows:

| Edge | From → To | Why it has no row | Dispatchable? |
|---|---|---|---|
| **`I2`** | `report → triage` | The incident table's `triage (I2→I3 / I2→I13)` row governs the exits **FROM** triage, not the entry **INTO** it | ⚠️ **YES** |
| **`P13`** | `product-finalize → EXIT` | The product table has a row for **P14** (the back-loop) but none for **P13** (the cycle exit) | no (terminal) |

**Why `I2` matters and `P13` does not (much):** `I2` is dispatchable, so a supervisor that defaulted "no row found" to AUTO would fire `/incident-triage` into a session with no policy sanctioning it. `P13` is terminal — nothing to fire — so its gap is a documentation inconsistency rather than a behavioral risk.

**How Claudesk handles them today (no patch applied):** `lookup.ts` returns an explicit `{outcome: "unmapped", reason: "no-row-upstream"}` — **never a default**, and the result union structurally has **no `cell` field** on that arm, so a caller cannot mistake it for a verdict. A standing test pins both ids, so a third gap appearing upstream fails loudly.

⚠️ **Deliberately NOT patched in Claudesk.** Inventing a policy row would be Claudesk deciding mccc's policy, crossing the ownership boundary settled 2026-08-14 (*Claudesk owns the drive mode's VALUE + TURN-BOUNDARY enforcement; mccc owns its MEANING*). The typed model records what upstream **says**, including where it says nothing. **The question belongs upstream:** should `I2` (report → triage) PAUSE like every other incident row, or AUTO?

⚠️ **Found by a TEST, not by the survey that preceded it.** The pre-implementation survey classified the unmapped edges but only eyeballed the **dispatchable** ones, so it reported one gap (`I2`) and missed `P13`. The exhaustive assertion caught the second. *A survey that filters before counting reports the filter, not the population.*

## SURFACE-2026-09-12-THE-TWO-UPSTREAM-COPIES-OF-THE-FEATURE-GRAPH-DISAGREE

- **Priority:** medium *(was high — Claudesk's exposure is closed; what remains is upstream hygiene)*
- **Surfaced by:** M15 WP2 (feature-plan, measurement A-2)
- **Target:** ⚠️ **mccc** — a cross-repo item. **Claudesk's half is DONE (2026-09-12).**

⚠️ **`transitions.md` and `agents/feature-workflow/AGENTS.md` record DIFFERENT feature graphs.** `F10` targets `verify-self` in the authority and `verify-human` in the copy; `F9b`/`F10b`/`F30` are absent from the copy entirely, whose state table has 12 rows and omits `verify-self`.

✅ **CLAUDESK IS NO LONGER EXPOSED.** The typed graph was transcribed from `transitions.md` **only**, and a live drift test (`agrees with upstream on the F10 target`) reads the authority file and fails if anyone "fixes" the absorbed value toward the stale copy. ⚠️ It is `_ref/`-gated, so it **skips** on a fresh checkout — reported as skipped, never silently passed.

⚠️ **WHAT REMAINS IS UPSTREAM'S:** the four `AGENTS.md` copies are still wrong, and mccc's `check-structure.sh` Phase 9 — which exists to keep them in sync — is **not catching it**. The hand-off note (`HANDOFF-to-mccc-m15-wp2.md`) asks for Phase 9's deletion and carries the evidence. **Blocked on a session rooted in the mccc repo** (editing from Claudesk would silently dirty a different git repository).

## SURFACE-2026-09-11-EVERY-INSTALLED-SKILL-IS-A-SYMLINK-INTO-THE-MCCC-SOURCE-REPO

- **Priority:** high
- **Surfaced by:** M15 WP1 probe, Phase 4 Q3 (feature:build)
- **Target:** M15 WP2 (any frontmatter/skill-file coupling work) + any future skill edit

⚠️ **Every skill under `~/.claude/skills/` is a SYMLINK into `my-claude-code-customization/skills/`.** Editing an installed skill file therefore writes into a **different git repository** — silently dirtying the mccc source tree from inside a Claudesk session.

**Verified:** `ls -l ~/.claude/skills/` shows every entry as a symlink (e.g. `feature-plan -> /Users/stayman/Personal/projects/my-claude-code-customization/skills/feature-plan`). `~/.claude/skills` itself is a real directory, so the hazard is per-skill and easy to miss.

**The safe pattern, used by this probe:** copy with **`cp -RL`** to dereference the link, work only on the copy in gitignored scratch, and **verify the source repo's `git status` stays clean** before and after. A plain `cp -R` copies the symlink, not the content, and a subsequent write goes straight through to the source.

**Why it matters beyond Q3:** WP2 considers coupling the typed graph to skill frontmatter. Any experiment that "just adds a key to a skill to see what happens" would mutate the companion repo. ⚠️ The failure is silent — nothing in the Claudesk session reports it, and it surfaces later as unexplained dirt in a different project.

**Also recorded (the compatibility answer itself):** extra frontmatter keys ARE inert — **6 of 48 shipped skills already carry `allowed-tools`** beyond the standard three keys, so the harness tolerates extra keys in production today. The open question was never compatibility; it is whether the enumerator is worth building at all (probe says no — see the WP1 WIP, Q3b).

## SURFACE-2026-09-11-Q2-SEPARABILITY-IS-MODEL-CONDITIONAL

- **Priority:** high
- **Surfaced by:** M15 WP1 probe, Phase 3 (feature-build)
- **Target:** M15 WP3 task 3.7 (the adjudicator) + the fire policy

⚠️ **The Q2 gate opens ONLY with a sufficiently strong adjudicator model.** Measured over the 96-turn FIRE population against operator-behavior ground truth (96 `claude -p` calls per arm, zero errors):

| Model | Wrong-fire recall | Real breaks preserved | Verdict @ 0.80/0.80 |
|---|---|---|---|
| `haiku` | 0.793 (23/29) | 0.878 (36/41) | **NOT_SEPARABLE** |
| `sonnet` | 0.862 (25/29) | 0.854 (35/41) | **SEPARABLE** |

⚠️ **AND THE MARGIN IS ONE RECORD.** `sonnet` clears the 0.80 recall bar by exactly **+1 record** (25/29; it needs ≥24). `haiku` misses by **−1** (23/29). The entire SEPARABLE/NOT_SEPARABLE split between the two models rests on a **2-record difference on a 29-record denominator**, and only **70 of 96** records are scorable at all (26 have no recorded operator response). ⚠️ **The 0.80/0.80 threshold is a judgment call, not a measured constant** — a 0.85 bar fails both arms, a 0.75 bar passes both.

**Consequence:** WP3's GO is not *"the hybrid works"* — it is *"the hybrid works with a strong enough adjudicator, on a thin margin."* Treat it as **GO-WITH-CONDITIONS**: pin the model, **re-measure on a larger labelled set before relying on the margin**, and keep the fire policy biased toward withholding (the safe direction). ⚠️ **A silent model downgrade moves the supervisor from SEPARABLE to NOT_SEPARABLE with no code change and no signal.** The adjudicator model must be **pinned explicitly**, and changing it is a **behavioral change that requires re-measurement**, not a config tweak.

✅ **The failure direction is the safe one.** The stronger arm's 6 false positives all *withhold* a fire on a turn that was a real break, so the supervisor stays silent and the operator nudges — today's status quo, and recoverable. The dangerous direction (firing into a turn awaiting an answer) is caught at 0.86.

⚠️ **Cost on the critical path:** ~3s per call, one call per fire candidate before firing. Routing must cover **every** candidate, not just the verify-human-adjacent class — the narrow router misses 10 of 32 awaiting-turns (see the routing entry in the WP1 WIP).

## SURFACE-2026-09-11-A-DETECTOR-SCORED-AGAINST-ITS-OWN-POLICY-TABLE-IS-CIRCULAR

- **Priority:** high
- **Surfaced by:** M15 WP1 probe, Phase 2 (feature-build)
- **Target:** M15 WP3 task 3.4 (the verdict) + any future detector tuning

⚠️ **A detector scored against a fixture that its OWN policy table produced is measuring itself, and will report a perfect score no matter how wrong both are.** The probe's `detect.py` and `mine.py` both called the same `lookup()` with the same branch order on the same inputs, yielding **precision 1.000 / recall 1.000** — arithmetic identity, not evidence. It would have read 1.000 even if `policy.py`'s 95 hand-transcribed edges were entirely wrong.

**How it was caught:** by treating a perfect score as a *symptom* rather than a success. Nothing in the run flagged it; the numbers looked like the best possible outcome.

**The only non-circular truth in this corpus is the operator prod** — a short, content-free nudge (`"so?"`, `"next"`, `"chain"`, `"autopilot it! why returning control?"`) typed immediately after a verdict. It is derived from **operator behavior**, not from the policy table, so scoring against it actually tests whether the policy lookup models reality. Measured that way: **36/36 ground-truth breaks caught.**

**Consequence for WP3:** when the real detector is tuned, its acceptance measurement must come from a signal the detector does not itself produce. Re-deriving labels from the same typed graph the detector consults is not a test — it is a tautology with a percentage attached.

## SURFACE-2026-08-25-PROBE-CHECK-EXEMPTS-ALREADY-INSTALLED-DEPENDENCIES
- **Source:** feature:verify-human (M13.5 WP3, 2026-08-25) — cost **three failed live test rounds** and a full WP escalation.
- **Target level:** workflow-system (`feature-spec` / `feature-plan` §"3rd-Party Probe Check") — a **process** defect, not a Claudesk one.
- **Type:** gap (verification-method hole).
- **Summary:** Both `feature-spec` and `feature-plan` gate their probe requirement on whether the dependency is **third-party / new**. WP3's spec ran that check, saw *"xterm is already a first-class dependency and the API is in the installed version"*, and concluded **no probe was needed**. The API then turned out not to work **in our runtime conditions**. ⚠️ **CORRECTED 2026-08-25 by the WP3 3.1 probe — the original diagnosis in this entry was WRONG.** It said `registerMarker`/`registerDecoration` are no-ops in xterm's **alternate** buffer "which is where a full-screen TUI like Claude Code always runs". **Measured false:** CC runs in the **normal** buffer (`buffer.active === buffer.normal`, `buffer.alternate.length === 0`, zero `onBufferChange` events). The real cause was **two unset xterm options** — `allowProposedApi` (without which `registerDecoration` *throws*, silently, inside an un-caught listener) and terminal-level `overviewRuler.width` — **both documented in the dependency's own typings**. Nothing about the dependency being installed, vendored, or type-checked could have revealed that.
- **Context:** ⚠️ **The inference "already a dependency → no probe" is the bug.** A probe answers *"does this API behave as needed in OUR conditions?"*, which is orthogonal to provenance. `tsc` passed, 42 tests passed, the types were read correctly — and every one of those observations was **identical whether or not the alt buffer was active**, which is `arch.md`'s own decisiveness rule going unapplied. ⚠️ Aggravating detail: **WP2 of the same bucket was literally titled *"Probe — … can it get one?"***, so the probe-first pattern was already present in the immediate context and simply was not applied to a sibling WP. ⚠️ **And the lesson is STRONGER than first filed:** the failure was not exotic runtime conditions at all, but two options spelled out in the typings that were read — so "read the types more carefully" is *not* the fix; **running the API is.**
- **Suggested action:** widen the probe trigger in `feature-spec` §2 / `feature-plan` §3 from *"3rd-party / external"* to something like: **"a probe is required when the feature depends on runtime BEHAVIOUR of any API — including an already-installed one — that no existing code in this repo exercises under the same conditions."** ⚠️ A cheap, mechanical form of the test: *"does any shipped code already call this API in this context?"* — for WP3 the answer was **no** (`grep` found zero prior uses of `registerMarker`/`registerDecoration`/`overviewRulerOptions`), which would have fired the gate immediately. Consider also a standing checklist line for terminal work: **which xterm buffer is active — read it, do not infer it?** ⚠️ And for any *proposed/experimental* API surface: **does it need an opt-in flag, and does the call throw rather than return falsy when the flag is missing?** (`registerDecoration` throws; the original code's `if (!marker) return` guard shape assumed a falsy return, so the throw escaped un-caught.)
- **Priority:** medium-high (the cost was three build/verify rounds + one escalation; the fix is a few lines of skill prose, and the failure recurs wherever a familiar dependency is used in an unfamiliar mode).
- **Status:** pending — cross-repo (`my-claude-code-customization`); fold into the handoff already owed to mccc.

## SURFACE-2026-08-25-SYNC-TAURI-COMMANDS-MAY-BLOCK-THE-MAIN-THREAD
- **Source:** incident:codify (P1 workspace-close hang, 2026-08-25) — an adjacent gap found while writing that incident's regression coverage, deliberately NOT built then (codify's speed-aware "minimum viable coverage" rule).
- **Target level:** task:plan (a guard + a sweep; feature:spec only if the sweep finds many offenders).
- **Type:** tech-debt / latent-defect class (missing systemic guard).
- **Summary:** A synchronous `#[tauri::command]` body is dispatched by Tauri on the **main thread**, so ANY blocking work inside one freezes the UI. The 2026-08-25 P1 was exactly this (`cc_kill` → `poll_reaped` → `thread::sleep` on the main thread) and is now fixed, **but the property is repo-wide and nothing enforces it.** `cc_session/commands.rs` alone has **8 sync commands**; the codebase has many more across `config_store`, `editor_fs`, `fs_index`, `git_diff`, `git_status`, `time_store`, etc.
- **Context:** ⚠️ **The incident's two regression tests do NOT cover this** — by design. They pin the two specific call sites that broke; neither would notice a *new* blocking call in a *different* sync command. ⚠️ Also note the codebase already *documented* the main-thread fact benignly (`status_broadcaster/commands.rs`: "This command body runs on the main thread, so the AppKit hide inside is safe") — the same property that makes an AppKit call safe makes a sleep or a lock-across-marshal catastrophic, and only the benign reading was written down. Two shapes are dangerous: (a) sleeping/polling (`thread::sleep`, `poll_*`, blocking IO, `.join()`), and (b) taking a lock and then calling something that marshals to the main thread (the `tray::reconcile` deadlock, the second defect in that same incident).
- **Suggested action:** Inventory every `#[tauri::command]` that is NOT `async`, and triage each for blocking work. Then add a guard — a source-level scan is plausible (`production_code` + "no `thread::sleep`/`.join()`/blocking-IO between `#[tauri::command]` and the closing brace of a non-async fn"), though the lock-across-marshal shape is harder to express mechanically and may only be catchable by convention + review. ⚠️ Whatever the guard, **mutation-prove it against the real 2026-08-25 violation** (`git show` the pre-fix `cc_kill`) — a guard that would not have caught the incident that motivated it is not coverage. Cheapest first step may simply be making the blocking-capable commands `async` by default.
- **Priority:** medium-high (the class already produced one P1 that escaped as could-not-reproduce for two release cycles; each instance is invisible until a slow path makes it visible).
- **Status:** pending

## SURFACE-2026-08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME
- **Source:** feature:research (M13.5 WP3 task 3.1 probe, 2026-08-25) — the probe that **overturned** the refutation this WP was escalated on.
- **Target level:** workflow-system (verification method / `arch.md` decisiveness rule) — a **process** defect, not a Claudesk one. Sibling to `SURFACE-2026-08-25-PROBE-CHECK-EXEMPTS-ALREADY-INSTALLED-DEPENDENCIES`, but a distinct failure: that one is about skipping a probe *before* building; this one is about skipping one *when closing work*.
- **Type:** gap (verification-method hole).
- **Summary:** M13.5 WP3 failed verify-human three times. The post-mortem diagnosed the cause by **reading xterm's doc comments** (*"registerMarker adds a marker to the normal buffer"*, *"registerDecoration returns undefined if the alt buffer is active"*), inferred that Claude Code — a full-screen TUI — must run in the **alternate** buffer, and declared the mechanism **refuted**. On that refutation the WP was **escalated out of its milestone**, working code was **annotated as dead** in two places, and a shipped config decision was marked **"premise invalidated"**. ⚠️ **All of it was wrong.** A single property read on a live pane — `term.buffer.active.type` → **`"normal"`** — refutes the entire chain. The real cause was two unset xterm options.
- **Context:** ⚠️ **A refutation is a hypothesis, and this one was never tested.** It was internally coherent, cited the vendor's own typings, and explained every observed symptom — which is exactly why it earned three rounds of trust. The asymmetry that makes this worth filing: **a false claim gets caught by the next test; a false refutation CLOSES the work and is never tested again.** Costs incurred: one WP escalated out of its bucket, ~175 lines of sound code marked refuted, one correct decision marked as a mistake, and a re-spec queued that was not needed. ⚠️ Note the instrument chain was *already* suspect — the handoff records **three instrument traps in a row** (stale binary ×2, then HMR masking a stale Rust half) and its own note that *"a repeated 'the instrument was wrong' verdict is itself the signal to go read the platform contract."* The contract *was* then read — but read, not **run**, and that was the last mile that failed.
- **Suggested action:** add a rule to the verification-method lessons (and consider `feature-verify-human` / `feature-research` prose): **before a refutation is allowed to close, escalate, or delete work, at least one RUNTIME observation must contradict the working hypothesis.** Reading a type, a doc comment, or a spec is *evidence for* a refutation, never sufficient *on its own*. Cheap mechanical form: *"which single value, if I read it live, would prove this refutation wrong? Go read it."* For WP3 that value was one property access. ⚠️ Pair with the existing `[[verify-the-mutation-landed]]` / `[[invalid-probe-and-real-hole-look-identical]]` family — same shape: **a green/negative result is under-determined until you prove the instrument could have said otherwise.**
- **Priority:** medium-high (cheap prose fix; the failure mode silently destroys correct work and is self-concealing — nothing re-tests a closed item).
- **Status:** pending — cross-repo (`my-claude-code-customization`); fold into the handoff already owed to mccc, alongside its sibling.

## SURFACE-2026-08-22-STOP-BACKGROUND-TASKS-IS-AN-UNDOCUMENTED-SEAM
- **Source:** feature:build (M13.5 WP2 Phase 3 — the field the fourth status state is built on)
- **Target level:** product:arch (a named stale-able dependency, not a defect)
- **Type:** trap (a load-bearing upstream field with no public contract)
- **Summary:** `WorkspaceState::BackgroundWork` — the purple dot — is derived entirely from a field CC's **public hooks reference does not document**: the `Stop` payload's `background_tasks` array (`[{id, type, status, description, command}]`, empty when nothing is outstanding). ⚠️ **Claudesk consumes only its LENGTH, as `background_task_count`** — the hook forwards the count and never the tasks, because `command`/`description` are arbitrary user shell text (prompt-class privacy). Say *count* when describing our side and *array* only when describing CC's payload; four other records said "array" for our signal and were corrected at the M13.5 close. It was found by live raw-payload capture, not from the docs, and the docs pass that confirmed the completion-signal absence **also confirmed this field is unlisted**. So CC can rename, reshape or drop it in any release with no deprecation signal.
- **Context:** ⚠️ **Already mitigated by construction, which is why this is a note and not work.** The Perl hook maps a missing or non-array value to a count of `0`, and the Rust mapping treats `None` and `Some(0)` identically — so a CC-side change degrades to the **pre-M13.5 `Stop → Idle` behaviour** (an honest grey dot) rather than erroring or turning every turn-end purple. Three tests pin exactly that: `stop_background_task_count_degrades_to_zero_on_every_bad_shape` (empty / absent / string / object), `stop_with_zero_or_absent_background_count_still_maps_to_idle`, and `background_task_count_is_emitted_only_on_stop`. ⚠️ Also deliberate: the hook forwards a **count, never the tasks** — `command`/`description` are arbitrary user shell text, the same privacy class as the raw prompt, and a test asserts a secret in the command never reaches the wire. ⚠️ **The failure mode if it does break is SILENT** — the feature stops working and the dot goes back to grey, which looks exactly like "no background job ran". Nothing alerts.
- **Suggested action:** None standing. If the purple dot ever stops appearing, check this field **first** (`RAWCAP`-style capture on `Stop`) before suspecting the mapping or the surfaces. Same class as M15's model→window map — a named stale-able seam whose breakage is invisible.
- **Priority:** low (no live defect; the degradation path is built and tested — this exists so the silent-failure mode is diagnosable rather than mysterious)
- **Status:** pending

## SURFACE-2026-08-22-A-CC-SESSION-EXIT-KILLS-ITS-BACKGROUND-JOBS
- **Source:** feature:build (M13.5 WP2 Phase 2/3 — probed while evaluating the operator's PID-polling proposal)
- **Target level:** method / any future design touching background-job lifetime
- **Type:** fact (a measured platform behavior that retires a whole design branch)
- **Summary:** **When a CC session exits, its backgrounded shell jobs are killed with it.** Probed directly: CC launched a 90s job, ended its turn and exited ~85s early; the job shell died with the session, the job **never completed**, and no orphan was reparented to launchd. ⚠️ **This is the fact that dissolved the fourth state's hardest design question** — the feared "the dot sticks forever because the job outlived the session" case **does not exist**. The work is *cancelled*, not orphaned, so there is nothing left to report and the self-healing clear on the next turn-end is sufficient rather than a compromise.
- **Context:** ⚠️ **Two consequences worth not re-deriving.** (1) **Do not build a PID-polling watchdog.** The operator proposed it and it was probed properly: no PID is in the hook payload (`id` is a CC-internal handle), but the process tree *does* expose it — Claudesk owns the PTY, so it already knows the `claude` PID, and a job appears as a `/bin/zsh -c` child running `eval '<command>'`, matchable against `background_tasks[].command`. A naive child-count would be wrong (the CC child list holds `caffeinate` and two long-lived MCP servers); the working discriminator is that **only job shells source `~/.claude/shell-snapshots/snapshot-zsh-*.sh`** (measured: 1 job shell caught, 3 infrastructure processes excluded, zero false positives). **It works — and it buys coverage for a case that does not exist**, while depending on an undocumented internal path. (2) The close/quit guard **must** treat background work as active (it does): closing the workspace kills the session, which kills the job, so that dialog is what stands between one click and silently discarded work.
- **Suggested action:** None standing. ⚠️ **Re-check this if CC ever changes to let background jobs survive session exit** — at that point the residual gap becomes real, and Findings above are the ready-made mechanism (the `shell-snapshots` discriminator is the non-obvious part). Until then, treat "session gone → work gone" as the model.
- **Priority:** low (a fact, not work — recorded so a future session does not re-litigate the expiry rule or rebuild the watchdog)
- **Status:** pending

## SURFACE-2026-08-21-SUBAGENT-PAIRING-CLAIM-IS-REFUTED-BY-PRODUCTION-DATA
- **Source:** feature:build (M13.5 WP2 Phase 1 — found while root-causing the stale-blue dot)
- **Target level:** product:arch (time-analytics accuracy) — **not** a status defect
- **Type:** gap (analytics computed from a minority of the available events)
- **Summary:** M9's subagent-duration analytics are computed from **~31% of the `SubagentStop` events**, and its per-agent-type breakdown does not exist in practice. Two measured facts, both across the prod + dev corpora (~108MB of `time-analytics.sqlite`): (1) **`agent_type` is NULL on 100% of 3,977 subagent events** — CC does not send `subagent_type`, so `reclassify::subagent_intervals`' FIFO keying collapses everything into one `<unknown>` bucket; (2) **`SubagentStop` outnumbers `SubagentStart` 3,031:946** (3.2:1; per-session imbalances like 0:19, 5:50, 0:13), so most stops find no open start and are **silently discarded**.
- **Context:** ⚠️ **Nothing is broken and nothing panics** — the `unwrap_or("<unknown>")` fallback is what keeps this correct-but-coarse, which is exactly why it went unnoticed: subagent durations are *narrower* than the code reads, not wrong. ⚠️ **The doc claims were the real hazard and are now corrected in 5 live sites** (`hook_install/mod.rs`, `reclassify/mod.rs` header + `subagent_intervals` fn doc, `claudesk-hook.pl`, `arch/status-channel-and-surfaces.md`, `tests/hook_pl_output.rs`) — all previously asserted pairing "by `agent_type`" as fact. ⚠️ The test `subagent_start_maps_subagent_type_to_agent_type` **passes and is correct** (it pins the hook's transformation on a *synthetic* payload) but its comment asserted CC sends the field; comment fixed, test untouched. ⚠️ **The properly-paired subagent signal already exists and is already flowing:** `PreToolUse`/`PostToolUse` with `tool_name == "Agent"` balance **exactly** per session (493 pre vs 486 post + 7 failures = 493) and carry `tool_use_id`. Note `SubagentStart` (946) != `PreToolUse[Agent]` (493), so `SubagentStart` is not the spawn signal either.
- **Suggested action:** Decide whether M9's subagent segmentation should re-key onto the `Agent`-tool pairing (accurate, `tool_use_id`-keyed, no label) or stay on `SubagentStart`/`Stop` (labeled in principle, unreliable in practice). ⚠️ **Do NOT "fix" the label handling alone — the stop surplus is the larger half of the error.** Quantify the duration delta on real data before changing anything; the current numbers are conservative (under-counting), so this is an accuracy improvement, not a bug fix.
- **Priority:** low-medium (no correctness/data-loss impact; it under-reports one segment kind in a dashboard the operator reads, and the misleading docs — now fixed — were the part that could have caused a wrong build)
- **Status:** pending

## SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS
- **Source:** feature:build (M13.5 WP2 Phase 1 — a rejected root-cause hypothesis that turned out to be a real, separate defect)
- **Target level:** product:arch (status-channel attribution model)
- **Type:** bug (live, low-frequency, cross-session status cross-talk)
- **Summary:** The status path resolves an event to a workspace by **`cwd` alone and never reads `session_id`**, so every CC session sharing a directory drives one workspace's dot. Verified: `session_id` occurs in `status_broadcaster/` only inside **test fixtures** (`mod.rs:338`, `:358`, `commands.rs:271-285`) — no production path reads it. In the captured instance at `status-channel.log.1:15948-15950`, **four** distinct sessions (`2c95b1a3`, `69a7ce96`, `76e288aa`, `23a9ad84`) drove `ws-3`, and the `UserPromptSubmit` that eventually cleared a blue dot belonged to a *different session* than the `Notification` that lit it.
- **Context:** ⚠️ **This was investigated as the cause of the stale-blue defect (`SURFACE-2026-08-06-AWAITING-INPUT-DOT-NEVER-CLEARS-FOR-A-BACKGROUND-AGENT` — since RESOLVED and deleted from this file; see CHANGELOG 2026-08-22) and REJECTED** — that defect was `agent_completed` falling through the notification-type fallback (fixed M13.5 WP2). Filed separately so the rejection is not mistaken for "not real": it **is** real, just not that. ⚠️ **Measured as rare: only 1 of 1,673** post-`Stop` notifications is cross-session, which is why it was deliberately NOT fixed inside a one-line classification fix. Affects any second CC session on the same repo — a bare terminal, a `bg` job, or two Claudesk workspaces on one project. ⚠️ Note it is *not* obviously a pure win to fix: per-session attribution needs a fold decision ("any session awaiting -> blue" keeps a stale blue if a session dies silently; "newest wins" can hide a genuine prompt) and a bound on the per-session map, since a session that dies without `SessionEnd` would leak an entry forever.
- **Suggested action:** Only if the frequency rises. If taken: attribute per `(cwd, session_id)`, fold explicitly (present both folds to the operator — this is a product decision, not a mechanical one), expire on `SessionEnd` (already registered; 51 events in the corpus), and bound the map for sessions that never emit one. ⚠️ Per `[[workspace-status-map-collapses-consecutive-events]]` this needs the **raw event stream**, not the status map. ⚠️ Also re-check `tray::aggregate_alarm` and PiP ordering — both fold the same broadcast, so changing one workspace's input set changes their shape.
- **Priority:** low (1 observed instance in the entire corpus; no data impact — it degrades the ambient dot, the same surface M7 exists for. **Re-raise if the operator starts routinely running two sessions per repo.**)
- **Status:** pending

## SURFACE-2026-08-21-NOTIFICATION-TYPE-FALLBACK-IS-WRONG-FOR-COMPLETION-TYPES
- **Source:** feature:build (M13.5 WP2 Phase 1 — the generalization of the defect just fixed)
- **Target level:** product:arch (a standing classification hazard, not a current defect)
- **Type:** trap (a conservative default that is right in one direction and wrong in the other)
- **Summary:** `notification_awaits_input`'s unknown-type fallback maps **any unrecognized `notification_type` to AwaitingInput**. That is the right conservative choice for a future *input-needed* type (never silently swallow a real prompt) and the **wrong** one for a *completion/informational* type — and Claudesk cannot tell which a new type is. `agent_completed` was one instance and lit the dot blue for ~150s; the next new type is a coin flip.
- **Context:** ⚠️ **The fallback should NOT be inverted** — it is load-bearing in the input-needed direction and pinned by `notification_unknown_type_falls_back_to_awaiting`. The gap is that nothing *notices* a new type has appeared. ⚠️ A second, subtler shape found by mutation probe while fixing `agent_completed`: because the fallback yields the same answer as an explicit entry, a **behavioral** test cannot distinguish "classified deliberately" from "classified by accident" — deleting `agent_needs_input` from the explicit list left every behavioral test green. Closed for that one type by asserting list *membership*; the general form is unguarded. ⚠️ Also recorded: the three `elicitation_*` types in the code have **never been observed** in either corpus (harmless — each classifies the way the fallback would — but do not cite them as evidence of CC behavior).
- **⚠️ Added 2026-08-22 from the docs pass — `elicitation_url_dialog` is a SIXTH documented type Claudesk does not classify.** The official hooks doc lists `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, **`elicitation_url_dialog`**, `elicitation_complete`, `elicitation_response`, `agent_needs_input`, `agent_completed`. Claudesk knows all but `elicitation_url_dialog`, which therefore rides the unknown-type fallback to `AwaitingInput`. ⚠️ That is **probably correct** (it is a dialog awaiting the user) — but it is correct *by accident*, which is exactly the shape of the `agent_completed` defect. It appears in **neither corpus**, so the measured-vocabulary sweep could not see it; only the docs list it. **Cheap fix: add it to `INPUT_NEEDED_NOTIFICATION_TYPES` explicitly.** ⚠️ Note the docs are now a second source for this vocabulary alongside the corpus — check **both**, since each misses what the other has.
- **⚠️ Added 2026-08-21 at verify-human — `agent_completed` is NOT emitted by the in-turn `Agent` tool.** A real backgrounded `Agent`-tool task was run to completion during verification (`SubagentStart` → `SubagentStop` both present in `status-channel.log`); its only `Notification` was **`idle_prompt`**. All 3 corpus instances of `agent_completed` came from sessions where the likely emitter is a **background CC session** (`~/.claude/jobs`, `template: "bg"`), not a subagent spawned inside a turn. ⚠️ **Consequence: the fixed defect could not be reproduced on demand**, so the fix is verified by socket injection + unit/mutation tests, NOT by a live CC-emitted event. ⚠️ **Do not read a passing "background agent finished and the dot stayed gray" test as exercising this code path** — `idle_prompt` produces the identical `mapped=none, dropped` signature and was already correct before the fix. If a future session needs to reproduce it, drive a **background CC session**, not an in-turn agent.
- **Suggested action:** A cheap periodic check, not a code change: `SELECT DISTINCT json_extract(meta,'$.notification_type') FROM events` over `time-analytics.sqlite` and classify anything new. The measured vocabulary as of 2026-08-21 is exactly **5** types (`idle_prompt` 1723 · `permission_prompt` 392 · `agent_completed` 3 · `auth_success` 2 · `agent_needs_input` 1). ⚠️ This would have caught the `agent_completed` defect the day it first fired. Consider whether it belongs in a test that reads the live DB (probably not — it would be environment-dependent) or in a `/release`-time checklist item.
- **Priority:** low (no live defect — the vocabulary is fully classified as of today; this is about the NEXT type CC adds)
- **Status:** pending

## SURFACE-2026-08-21-HOOK-SOCKET-SHUTDOWN-RACE-IS-FLAKY
- **Source:** feature:ship (M13.5 WP1 final verification — unrelated to that feature)
- **Target level:** task (a small test-hygiene fix)
- **Type:** tech-debt (flaky test)
- **Summary:** `hook_socket::tests::loop_exits_cleanly_when_receiver_is_dropped` fails intermittently at `src-tauri/src/hook_socket/mod.rs:568` with `Os { code: 57, kind: NotConnected }` from `client.shutdown(..).unwrap()`.
- **Context:** The race is **intrinsic to what the test exercises**: it drops the receiver so `accept_loop` returns and closes the connection: when the server wins that race, the client's later `shutdown` has nothing connected. Observed once in ~4 full-suite runs on 2026-08-21; passed 3/3 in isolation and the next full run was green. **Not caused by the WP1 change** (that diff is a dependency, two `lib.rs` lines, and a new module — nothing touching sockets or threads). ⚠️ Per the workflow's own triage rule, no code or test was modified to make it quiet.
- **Suggested action:** Treat `shutdown` as best-effort in this test — `let _ = client.shutdown(..)` (the assertion that matters is the `handle.join()` below it, i.e. the loop returns rather than hanging or panicking). ⚠️ Do **not** "fix" it by adding a sleep: the race is the point of the test, and a sleep would make the pass timing-dependent in the other direction. Confirm the `join()` assertion still fails if `accept_loop` is mutated to hang.
- **Priority:** low (no product defect; cost is one spurious red full-suite run and the re-diagnosis it invites)
- **Status:** pending

## SURFACE-2026-08-21-OSASCRIPT-CANNOT-SAFELY-ADDRESS-THE-DEV-BUILD
- **Source:** feature:build (M13.5 WP1, window geometry persistence)
- **Target level:** product:arch (verify-self method) — or a `docs/lessons/` addition
- **Type:** gap (a verification-method hazard with a live blast radius)
- **Summary:** `osascript`/System Events **cannot safely address the `pnpm tauri:dev` build while a prod Claudesk is running**, and its failures are silent and *misdirected* rather than erroring. The dev binary is `target/debug/claudesk` launched by `cargo run` — **not a bundled `.app`** — so System Events reports `bundle identifier = missing value` for it and, early in a launch, **no windows at all**.
- **Context:** ⚠️ **Two distinct misfires in one session, and one of them quit the operator's live app.** (a) `set frontmost of <process whose unix id is DEV>` + `keystroke "q"`: the activation silently did not take (no bundle id), and `keystroke` delivers to whatever is *actually* frontmost — so **the ⌘Q hit the operator's prod app (PID 18806) and quit it**; it relaunched as a new PID. (b) `first process whose unix id is DEV` then `every window of` it **returned the PROD app's windows** (`Claudesk` / `Tauri App`, 1280×800) while nominally addressing the dev PID — detected **only** because the MCP bridge concurrently reported the true dev geometry (1111×733); the **instrument disagreement was the tell**. Trusting that enumeration would have sent a maximize gesture to the operator's window.
- **⚠️ Why the existing memory is insufficient:** `[[verify-self-dev-vs-prod-process-name-collision]]` prescribes "target by window title or bundle id, not process name." Here **both of those degrade to the prod app** — the dev binary has no bundle id, and its windows are invisible to System Events for a while after launch — so title/bundle-id targeting *silently resolves to the wrong process* instead of failing loudly. The prescribed mitigation does not cover the un-bundled dev-binary case.
- **Suggested action:** Record the stronger rule: **drive the dev build through the MCP bridge only** (`127.0.0.1:9223`, registered under `#[cfg(debug_assertions)]`, so it structurally cannot reach a prod install — `manage_window`, `ipc_emit_event`). **Never** use a global `keystroke`, `set frontmost`, or a System Events window enumeration for the dev app while a same-named prod app runs. Note the working quit trigger found here: `ipc_emit_event('quit-requested')` exercises the real `prevent_close` → `quit_now` → `app.exit(0)` path (proven 3×). Fold into `docs/lessons/verify-self-tiers.md` (or the MCP-bridge caveats doc) and consider amending the memory above.
- **Priority:** medium (no product defect; it is a verification-method hazard whose realized cost was quitting the operator's live app mid-session, and the silent-misdirection shape means the next session repeats it)
- **Status:** pending

## SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED
- **Source:** backlog-paydown sweep 2026-08-19 (carried out of `backlog-paydown-wbs.md` at sweep
  close, so it survives that file's deletion — it was the sweep's only surviving obligation)
- **Target level:** product:wbs (a dedicated convention pass, NOT a code-quality trim)
- **Type:** tech-debt (documentary, with a guard requirement)
- **Summary:** The two big documentary themes — **T1 rationale duplication** and **T2 comment
  density** — were deliberately **NOT** swept as WPs in the 2026-08-18/19 paydown. They need a
  **dedicated convention pass**, and its shape is already decided: **(a)** designate ONE authority
  per rule, **(b)** reduce every other site to a pointer, **(c)** ⚠️ **GUARD it so it cannot drift
  back.**
- **⚠️ Context — why this is not "just trim some comments":** T2 has been flagged in **FOUR
  consecutive reviews of the same file**, and per-WP trimming was **measured as not converging** —
  each review trimmed a little and moved on, which is exactly how a finding survives four reviews.
  The reviewer's own conclusion was that it wants a **density budget**, not another trim. ⚠️ **A
  pass that does (a) and (b) without (c) will be re-flagged a fifth time.** M13 WP4's partial
  payment is the evidence for the shape: the *guard-backed single-authority* approach is the one
  that actually held (the latency figures now live in one doc comment with a guard forbidding
  restatement, plus an anti-vacuity companion blocking the wrong-direction "fix" of deleting the
  measurement).
- **In scope for the pass:** the remaining half of `m13-wp3`'s comment-density MAJOR — the *"Recycle
  is not a `SKILL_BUTTONS` member"* rationale restated at **5 sites**, plus raw density measured at
  **52% / 71% / 70%** in `recycleSession.ts` / `recycleMachine.ts` / `recycleButton.ts`. ⚠️ It is
  **not** WP2/WP4 work even though those WPs touched the same files — they narrowed *claims* and
  fixed *tests*; this is a density/duplication convention.
- **Already paid (do not re-scope these):** the `validate_frontend_root` `pub(crate)` dedup was
  pulled into paydown WP1 as a pure win (now **compile-enforced**, `E0255`); the latency-figure half
  of the duplication MAJOR closed at M13 WP4.
- **Suggested action:** run it as its own small WBS/feature, not a sweep item. Pick the authority
  per rule first (that is the design decision), and write the guard **before** deleting sites, so
  the deletion is verified rather than trusted.
- **Priority:** low-medium (documentary; no correctness impact, but it is this project's most
  persistently re-flagged finding)
- **Status:** open — deferred by decision, shape recorded

## Code-quality findings — m13-wp4-milestone-exit-verify (2026-08-18)
- **Pointer:** **2 MINOR** (documentary only) from WP4's code-quality review — the WIP file's phase
  sections interleave out of execution order, and `arch/workflow-gate.md` mirrors
  `offInvariantGuard.test.ts`'s header in three prose paragraphs. Full bodies:
  [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under
  `# m13-wp4-milestone-exit-verify — 2026-08-18`.
- **⚠️ The review's 2 MAJORs are NOT here — both were FIXED in the WP**, because each was a defect in
  a guard that WP itself wrote: the arm-count pin did not detect a deleted arm (reproduced: the
  suite stayed green at 33/33; now derived from the file's own source and regression-proven), and the
  one-authority guard asserted more than its non-test-`src/` scope enforces (boundary now disclosed at
  both the guard and the authority).
- **Priority:** low (both MINOR; readability of documentation, no correctness impact)
- **Status:** deferred — carry to next cycle (M13 close 2026-08-18); prior note: 2 MINOR documentary only — the `arch/` duplication one is the more valuable
- **Pickup shape:** the `arch/` one is the more valuable — it is this project's standing
  rationale-duplication finding one level up, and the right fix is *"pick one authority and point at
  it"*, ⚠️ **not** trimming a little from each site.

## SURFACE-2026-08-18-DEV-PROFILE-PERMISSION-MODE-BLOCKS-SKILL-WRITES
- **Source:** feature:build (M13 WP4 Phase 3 — live Recycle runs)
- **Target level:** product:arch
- **Type:** gap (dev-environment configuration, with a documentation consequence)
- **Summary:** The **dev** profile (`com.claudesk.app.dev`) had drifted to
  `cc_permission_mode: "dontAsk"` while **prod** runs `bypassPermissions` (the yolo default the
  vision specifies). Per `cc_session/mod.rs:97`, `dontAsk` *"just stops the prompting"* — it does
  **not** grant the write. A CC session spawned under it composes a correct `/session-handoff` and is
  then **silently denied** at the write, with no prompt to accept. CC's own words in the pane:
  *"the block is the permission mode, not anything about the skill or the content… the content is
  composed and ready."*
- **Context:** ⚠️ **This corrected a recorded diagnosis.** WP3 concluded the Recycle success path was
  **fixture-blocked** (*"CC correctly refuses to hand off from an empty scratch repo"*). True for
  `scratch-b` — but on `~/Tmp/yitang-copy`, a fixture with a 19.7 KB incident WIP, a real backlog and
  real git history, the handoff **still failed**, for a reason no fixture work could fix. ⚠️ **Anyone
  retrying on a richer fixture without checking the permission mode would fail again and
  mis-attribute it to the fixture a second time.** The mode is read at **spawn** time, so changing it
  requires a respawn — the pane's footer is the tell (`⏵⏵ don't ask on` vs `⏵⏵ bypass permissions on`).
- **Suggested action:** Two parts, and the second is the durable one. (1) Already applied: dev set to
  `bypassPermissions` via the real `⌘,` Settings select (prod untouched). (2) **Decide whether the dev
  profile should seed its permission mode from prod** the way `projects.json` already seeds on first
  launch — today a dev profile can silently diverge from prod on a setting that changes whether
  workflow skills can write at all, which makes dev an unfaithful rehearsal of the shipped app. If
  seeding is rejected, record the divergence in `docs/lessons/verify-self-tiers.md` as a
  check-this-first item for any live workflow verification.
- **Priority:** medium (no production defect — prod is correctly `bypassPermissions`; the cost is
  dev-time misdiagnosis, which has already happened once and consumed a WP's accepted-gap slot)
- **Status:** deferred — carry to next cycle (M13 close 2026-08-18); prior note: part (1) APPLIED (dev now `bypassPermissions`, verified 2026-08-18 — prod unchanged). ⚠️ **Part (2) — the durable half — is OPEN:** decide whether the dev profile seeds its permission mode from prod, or else record the divergence in `docs/lessons/verify-self-tiers.md` as a check-this-first item. The trap that cost a WP's accepted-gap slot is still unguarded

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
- **Status:** deferred — carry to next cycle (M13 close 2026-08-18); ⚠️ **M15 is the likely author of the first exposed surface** (a Recycle menu item) — decide (a) vs (b) *before* building it, not after. Standing precedent is (b)

## SURFACE-2026-08-14-SESSION-RESTORE-USAGE-FIGURE-SPANS-TWO-COMMAND-NAMES
- **Source:** feature:plan (M13 WP2 — the measurement mandated by `SURFACE-2026-08-14-SESSION-RESTORE-HAS-NO-MANUAL-DOOR`)
- **Target level:** method / any future usage-frequency claim about this skill
- **Type:** trap (a measurement predicate that silently under-counts)
- **Summary:** The `/session-restore` usage figure **requires counting two command names**, because the M9 WP5 rename split one skill's history: **`/session-resume` = 390** invocations (2026-05-29 → 2026-07-21) and **`/session-restore` = 142** (2026-07-21 → 2026-08-14), raw family **532**. ⚠️ A re-measurement grepping only `/session-restore` finds **142** — a 73% under-count — and would wrongly conclude the earlier "531" was inflated.
- **Context:** Also measured: **9 of the raw 532 were `ScheduleWakeup` self-fires**, not operator input (one overnight-training transcript, hourly). They are cleanly separable — the only family invocations carrying a `<command-args>` block matching a `ScheduleWakeup` prompt in the same file — giving **523 operator-typed**. ⚠️ A second trap in the same measurement: bucketing *every* user line mentioning the command gives **1,869**, of which only ~155 are real invocations; the rest are `tool_result` skill-listing output, skill-body text, and prose. The predicate must match `<command-name>` in **string/text content only**, never `tool_result` bodies.
- **Suggested action:** None standing — this is a note for the next person who measures skill usage. ⚠️ Applies to any renamed skill, not just this one: `session-handoff`/`session-pause` and `session-capture`/`session-store-learning` have the same split.
- **Priority:** low (no defect; prevents a wrong conclusion from a plausible-looking grep)
- **Status:** deferred — carry to next cycle (M13 close 2026-08-18); no action standing — a method note for the next person who measures skill usage. ⚠️ Applies to every renamed skill, not just this one

## SURFACE-2026-08-14-SKILL-SCAN-COLLAPSES-TWO-FRONTMATTER-ERRORS
- **Source:** feature:build (M13 WP1 Phase 1, P1.3 — synthetic fixture)
- **Target level:** product:wbs (M13 WP2, task 2.1 — a scanner design detail, not a defect)
- **Type:** gap
- **Summary:** The probe classifier collapses two distinct authoring errors into one class: a `SKILL.md` with **no** `---` fenced block and a `SKILL.md` whose block is **opened but never terminated** both classify as `no-frontmatter`. The real skill dir has neither case (all 50 valid entries parse), so this only surfaced against the synthetic fixture.
- **Context:** Matters for WP2's Q2 verdict on diagnostics: if the scanner surfaces a dirty-entry count to the operator, "unterminated frontmatter" is an actionable authoring bug in a skill the operator owns, whereas "no frontmatter" more often means "this directory is not a skill." Reporting them identically costs the operator the distinction.
- **Suggested action:** Decide in WP2 task 2.1 whether the diagnostic vocabulary separates them. Cheap either way — it is one branch in the parser. Not worth its own work package.
- **Priority:** low
- **Status:** **deferred — DORMANT** (M13 close 2026-08-18); ⚠️ **MOOT as of 2026-08-14**: WP2 task 2.1 chose option (i) (**no scanner**, §4c: the command name is the only sanctioned coupling), so this item's only target no longer exists and **no scanner will be built**. ⚠️ **Deliberately NOT deleted as resolved** — nothing fixed the classifier; the finding is real about the probe instrument (M13 confirmed at close: no scanner exists in `src/` or `src-tauri/src/`) and becomes live again only if future work reintroduces skill-frontmatter parsing. ⚠️ Do **not** treat this as a reason to build the scanner.

## SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT
- **Source:** M12 WP4c code review; scope NARROWED at the 2026-08-12 paydown sweep (WP7)
- **Target level:** product:arch (repo-wide verification hygiene)
- **Type:** gap
- **Summary:** Every CSS-related guard in this repo reads exactly ONE side of the CSS↔component contract, so a class can be **styled-but-never-emitted** (dead CSS still carrying real behavior) or **emitted-but-never-styled** with both sides individually green. ✅ **The MODIFIER selectors are now covered** (`cssModifierAudit.test.ts`, added 2026-08-12): all 13 `.block.is-*` / `.block.has-*` selectors are asserted emitted, mutation-proven against the original `is-editing` regression. What REMAINS open is the **base-class** direction across `App.css`'s other ~298 top-level class blocks.
- **Context:** ⚠️ **The 13-selector audit found ZERO orphans, and that is the honest result** — but it found two *false* positives first, which is the transferable part. `.diff-line.is-add` and `.diff-line.is-remove` are emitted as `` `diff-line is-${line.origin}` ``, so those strings appear NOWHERE in source; a literal search flags them as dead CSS on correct code. ⚠️ And the first predicate used `includes(modifier)`, which a mutation proved vacuous: renaming the emitted `is-editing` to `is-editingRENAMED` left the audit green, since the longer string still contains the shorter — the same prefix-shadowing hole `hasRule` exists to avoid, reproduced on the component side. Boundary matching fixed it. ⚠️ Base classes are a **different risk profile** from modifiers and that is why the split is defensible rather than lazy: a base class is visible on screen the moment it is wrong, while a modifier fires only mid-interaction — which is exactly how the `is-editing` regression shipped.
- **Suggested action:** Extend `cssModifierAudit.test.ts` from modifiers to all `^\.[a-z-]+` blocks. ⚠️ Two traps, both already paid for once: defining *emitted* is the hard part (interpolation above; also `data-testid`s share the class naming convention, so proximity to `className` is the only honest signal), and **comments must be stripped first** (a design-prior slug ending `-is-chosen` demanded CSS for a class existing only in prose). Budget for false positives on ~298 classes, not 13.
- **Priority:** low *(was medium — the behavioral half is now guarded; the remainder is largely cosmetic-risk classes)*
- **Status:** deferred — scope narrowed to the base-class direction at the 2026-08-12 paydown sweep

## SURFACE-2026-08-06-SESSION-RESTORE-CONTRADICTS-ITSELF-ON-THE-DEFAULT-DRIVE-MODE
- **Source:** feature:build (M12 WP4a Phase 2)
- **Target level:** external — the **companion workflow-system repo** (`my-claude-code-customization`), not Claudesk code
- **Type:** bug (doc/spec inconsistency in a skill body)
- **Summary:** `~/.claude/skills/session-restore/SKILL.md` states two different defaults for the drive mode **within one file**: step 4 priority 4 says *"Default to `orchestrated` (Mode 2) if neither source has it"* (`:42`), while the mode menu 17 lines later labels *`3  Autopilot     only pause at verify-human (default)`* (`:59`). A reader following step 4 defaults to Mode 2; a reader reading the menu believes Mode 3 is the default.
- **Context:** Found while settling M12 WP4a's P2.2 (what an unset drive mode should mean on the wire). It **strengthened** that verdict rather than blocking it: since there is no coherent upstream default even within a single skill, Claudesk emitting any default would be inventing workflow policy — so absence correctly emits **nothing**. ⚠️ Note the WBS's Finding F describes this as a disagreement *between* `session-start` and `session-restore`; the sharper truth is that `session-restore` disagrees with **itself**. Claudesk is unaffected either way (it defers entirely).
- **Suggested action:** Not Claudesk's to fix — the companion repo owns it. Worth mentioning in the next cross-repo handoff: pick one default and make `:42` and `:59` agree. (Menu-labels-Mode-3 vs step-4-says-Mode-2; the 29-file archive sample suggests `autopilot` is what actually gets used, 28/29.) **Do NOT "fix" this from Claudesk** — hard constraint: zero companion-repo change in M12.
- **Priority:** low (documentation clarity in an external repo; no Claudesk impact, and M12's design deliberately defers to whatever the skill decides)
- **Status:** deferred — carry to next cycle (M12 close 2026-08-12)

## SURFACE-2026-08-06-MANUAL-SESSION-START-MODE-MENU-INTERRUPTS-BEFORE-INTENT
- **Source:** product:wbs (M12 WP4 re-decomposition, 2026-08-06) — deferred by operator decision during the same session that measured it
- **Target level:** product (a candidate M13/M14 item or a QoL-bucket entry; deliberately NOT scoped to a WP yet)
- **Type:** UX friction (measured, not reported)
- **Summary:** A **manual** `/session-start` costs **2.18 human turns** to reach work, vs ~0.49 for `/session-restore` and ~0.43 for `/session-resume` — roughly **4×**. The cause is *sequencing*, not persistence: the drive-mode menu arrives **before the operator has said what they want to do**. Of 17 manual `session-start` opens that got the menu, only **4 replies led with a mode word**; the other 13 ignored the menu entirely and stated a problem (*"do /init first"*, *"I can't open the jenkins web interface. Can you try?"*, *"reverse engineer to establish the product documents as a brownfield project"*). Contrast `session-restore`/`session-resume`, where 84–86% of replies bundle the mode with the work instruction reflexively, because the problem is already on disk and only the mode is nominally in question.
- **Context:** Measured in the same full-corpus parse that drove the M12 WP4 re-decomposition (697 transcripts / 62 slugs / 2026-05-29→2026-08-06; 524 manual entry points, classifier exactly decidable with zero ambiguous cases). ⚠️ **Manual `session-start` is only 24 of 524 manual opens (4.6%)** — which is exactly why it is deferred rather than built: M12's signal work targets the 500 restore/resume opens. But it is the *most expensive per instance*. ⚠️ **The M12 mechanism does NOT automatically solve this.** M12 WP4b injects a drive mode; that removes the menu, but the deeper friction here is that a fresh `/session-start` has no work context at all, so the operator must still state intent. The 2.18-turn figure would improve but not collapse. ⚠️ Note also that `session-start` **never reads a persisted mode** (12 `drive_mode` refs in its SKILL.md, all writes or prose; step 3 presents the menu unconditionally) and defaults to **autopilot** on Enter, while `session-restore` defaults to **orchestrated** — the two disagree, so there is no single upstream default.
- **Suggested action:** Revisit after dogfooding M12's signal. If the injected mode alone brings manual `session-start` into line with the restore path, close this. If not, the remaining question is whether Claudesk can supply *work intent* as well as *mode* — which overlaps M13's skill registry and should be decided there rather than as an isolated fix. ⚠️ Do **not** address it by changing `session-start`'s behavior in the companion repo: the same constraint that governs `/session-restore` applies — the skill is correct for a plain-CLI user, who has stated no mode and no intent.
- **Priority:** low-medium (4.6% of manual opens, but ~4× the per-instance cost; no correctness impact, and M12's signal may partially absorb it)
- **Status:** deferred — carry to next cycle (M12 close 2026-08-12); prior note: **deferred by operator decision 2026-08-06** (*"session-start can be a later item in the backlog. much lower priority than session-restore, but not nothing"*)

## Code-quality findings — m13-wp3-recycle-session (2026-08-18)
- **Pointer:** **2 MAJOR + 3 MINOR remaining** (grouped), auto-backlogged per `drive_mode: autopilot`.
  ⚠️ **REWRITTEN 2026-08-19 — one MAJOR is RESOLVED and removed from this pointer:** *Recycle is
  uncancellable across unmount* closed with the abort-signal work (see the `**Backlog resolved:**`
  entry in `CHANGELOG.md` for 2026-08-19); the ordering question it asked to be decided explicitly
  is now decided (**on abort after a successful handoff but before the respawn, the clean mark
  STAYS**) and mutation-pinned against reversal.
  **Still open:** (1) `awaitCompletion`'s late-subscription disposal branch (`settled ? un()`) —
  ⚠️ **its `Status:` reads `pending` but a test for it EXISTS** (`recycleSession.test.ts`, *"disposes
  a LATE-arriving subscription"*, labelled paydown WP4). Not closed here because verifying that the
  test fully satisfies the finding was outside this task's scope — **re-read the code before
  re-scoring it**, per the standing lesson that a filing is true only as-of its filing date;
  (2) the documentary MAJOR: **52–71% comment
  density with the same rationale in five files** — ⚠️ the *latency-figure* half closed at M13 WP4,
  the *"Recycle is not a skill-button member"* half and the raw density are untouched; plus 3 MINOR.
  Full findings in [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md)
  under `# m13-wp3-recycle-session — 2026-08-18`.
## Code-quality findings — m12-wp4b-drive-mode-signal (2026-08-07)
- **Pointer:** 3 MAJOR + 4 MINOR (grouped as 4 entries), auto-backlogged per `drive_mode: autopilot`. The headline MAJOR is a **stated-scope gap, CONFIRMED EMPIRICALLY at review rather than accepted on assertion**: `CLAUDESK_DRIVE_MODE` inherits down the **entire descendant chain** (no `env_clear` anywhere), so a `claude` launched from inside a Claudesk-spawned CC fires the hook with the **parent workspace's** mode — while the WP's stated containment story is only CC-yes / login-shell-no. The other two: `shell_spawn_env`'s test asserts the primitive it extracted rather than the caller it was extracted to prove (the same gap the WP closes at `cc_spawn`), and incident-narrative comments are triple-recorded in code + WIP + backlog. Full findings in [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# m12-wp4b-drive-mode-signal — 2026-08-07`.
- **Priority:** medium (2 MAJOR) + low-medium (1 MAJOR readability) + low (4 MINOR)
- **Status:** deferred — carry to next cycle (M12 close 2026-08-12)
- **Pickup shape:** the descendant-inheritance item is a **decision first, edit second** — decide whether a nested CC *should* inherit the workspace's mode (arguably yes), then state it at `cc_spawn_env`. ⚠️ **Do NOT reach for `env_clear()`**: it would strip PATH/LANG/TERM and break both the M10.5 mojibake fix and the GUI-PATH spawn fix. The `shell_spawn_env` item is best resolved by **deleting** the seam unless a real caller assertion is wanted — the current middle position pays indirection cost without buying the property.

## Code-quality findings — m12-wp3-autofire-and-announce (2026-08-05)
- **Pointer:** ~~3 MAJOR~~ **2 MAJOR** + 3 MINOR remaining (grouped as 3 entries), auto-backlogged per `drive_mode: autopilot`. **The headline MAJOR — the inject arm re-firing on Re-launch — was RESOLVED 2026-08-05** (task `fix-inject-arm-refires-on-relaunch`, commit `051d707`; see `CHANGELOG.md`). Remaining: 3 stale doc comments still asserting the pre-Phase-3.5 whole-feature gate at the module's most-read entry points, one consumer bypassing the `actionFromAnnounced` wire seam, and 3 MINOR polish items. Full findings in [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) under `# m12-wp3-autofire-and-announce — 2026-08-05`.
- **Priority:** medium (2 MAJOR) + low (3 MINOR)
- **Status:** deferred — carry to next cycle (M12 close 2026-08-12); **partially resolved** — the relaunch re-fire is closed, the rest is open
- **Pickup shape:** the five remaining findings are mechanical single-line edits. ⚠️ **Note the resolved item did NOT take the fix its own entry preferred:** it asked for the two arms' consume-once guarantees to be made *symmetric*, and symmetry was rejected on evidence — clearing `pending_action` on the record needs a child→parent callback that StrictMode's discarded first mount would fire, suppressing the injection entirely. The asymmetry is now documented at the field rather than removed. A future reader "restoring symmetry" would re-break the feature.

## SURFACE-2026-08-04-CC-READY-NAME-INVITES-MISREADING-AS-CC-READINESS
- **Source:** feature:spec (M12 WP3 reconciliation)
- **Target level:** product:arch (or a one-line doc fix at the command)
- **Type:** gap (naming / doc clarity with a correctness consequence)
- **Summary:** `cc_ready` reads as *"CC is ready to accept input"* and actually means *"the frontend has attached its `cc-output-<sid>` listener."* It is fired immediately after `invoke(cc_spawn)` resolves (`XtermPane.tsx:429`) and flushes **Claudesk's own** output backlog (`cc_session/commands.rs:112`) — it carries no information about CC's TUI being interactive.
- **Context:** **Two independent readers took it the wrong way.** The M12 WP3 draft spec (written 2026-08-03 with rich context) built its whole injection-timing answer on *"fire on `cc_ready`, a terminal buffers stdin"* — a false premise twice over, since `cc_ready` is not a CC signal AND CC is a raw-mode TUI rather than a line-buffered shell, so the stdin-buffering intuition does not transfer (`[[raw-mode-cr-is-enter]]`). Caught at WP3 spec reconciliation (2026-08-04) by reading the command body rather than trusting the name; WP3's Phase 1 is now a live timing probe instead of a build on the assumption.
- **Suggested action:** Either (a) rename to something that states what it means (`cc_output_listener_attached` / `cc_frontend_ready`) — a Tauri command rename needs the invoke-caller sweep + runtime smoke per `[[tauri-command-removal-needs-invoke-sweep]]`, or (b) cheaper: add a one-line "⚠️ NOT a CC-readiness signal — see WP3" note to the command's doc comment and to `arch.md`'s load-bearing index. **Do (b) at minimum before M13**, whose skill-buttons face the identical injection-timing question and will reach for the same name.
- **Priority:** medium (no live defect — nothing fires on it today; the cost is that the next injection feature repeats the same misread, and WP3 already paid for it once)
- **Status:** deferred — carry to next cycle (M12 close 2026-08-12)

## SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET
- **Source:** feature:refactor (M12 WP2, from the code-review CRITICAL)
- **Target level:** product:wbs (M12 — WP3 or later)
- **Type:** new-work (product decision, then possibly a small wiring change)
- **Summary:** Typing `/exit` in the CC pane does **not** clear the unclean-exit flag. `/exit` ends the CC process; the frontend responds by showing the "Session ended" overlay with a Relaunch button (`XtermPane.tsx`, bridge phase `ended`) and **the workspace stays open**. There is no close for a clean-exit clear to hang off. Net effect: after a typed `/exit`, closing the workspace with × clears normally, but if the app is quit or the workspace is left open, the flag stays `true` and the next open offers `/resume`.
- **Context:** Found at code review — the `CleanExitRoute::CcExitCommand` variant existed in the Rust enum, the TS union, and round-tripped in two test suites, but **no caller ever sent it**. The variant was **REMOVED** in refactor rather than wired, because wiring it is new functionality gated on a product question, and a dead enum member reads as a covered case (it is precisely what made the gap invisible — the exhaustiveness test proves the *set*, never that each member has a caller). ⚠️ The WP2 verify-self log wrongly asserted `/exit` "shares the clearing path proven above"; that sentence has been corrected in the WIP.
- **Suggested action:** Decide the product question first: **is a typed `/exit` a clean exit?** It is genuinely ambiguous — the user deliberately ended the session (argues clean), but the workspace remains open and Relaunch starts a NEW session that should itself be flagged unclean (argues the flag is simply not yet decidable at that moment). Three viable answers: (a) treat `/exit` as clean and clear on the `ended` transition; (b) leave as-is — the flag resolves correctly on whatever close follows; (c) clear on `ended` but re-set on Relaunch. **(b) is the current behavior and is defensible**, which is why this is not a bug fix.
- **Priority:** medium (no data loss; worst case is one unasked-for `/resume` offer, which WP3's announce makes visible before it fires)
- **Status:** deferred — carry to next cycle (M12 close 2026-08-12)

## Code-quality findings — m12-wp1-probe-flag-store-and-announce (2026-08-03)
- **Pointer:** 5 open items of 8 findings (0 CRITICAL / 3 MAJOR / 5 MINOR — **2 MAJORs and 1 MINOR
  fixed in place at review**). The two fixed MAJORs were both *guard-calibration overclaims* in a
  header written in the same commit: the field-access negatives were variable-name- and
  syntax-form-bound (a `for (const p of projects)` consumer and any renamed binding passed them),
  and `stripComments` ignored trailing `//`. Both are now name-agnostic/form-agnostic with the
  previously-missed mutants added to the calibration block as real inputs, and the header narrowed
  to what is actually asserted. The carried MAJOR (measurement scripts not in the repo) was
  **mitigated** — figures relabelled as one-shot observations with method inline — leaving only a
  convention question. Full body:
  [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) →
  `# m12-wp1-probe-flag-store-and-announce — 2026-08-03`.
- **Priority:** low (all five)
- **Status:** deferred — carry to next cycle (M12 close 2026-08-12); prior note: auto-backlogged per `drive_mode=autopilot`.
- **Pickup shape:** three are one-touch cleanups to fold into the next WP that edits the same file
  (brace-count the interface slice in `listProjectsConsumers.test.ts`; qualify the ambiguous
  `Verdict (b)` comment at `App.tsx:306-308`; trim one redundant paragraph on the Rust hazard test's
  doc comment — ⚠️ **not** its ⚠️ reopening-condition paragraph, which is what stops a future reader
  deleting the test when it correctly fails). The other two are conventions worth deciding once
  rather than per-instance: whether probe-grade perf spikes get a durable home under `tooling/`, and
  whether a phase observable must be amended when a verdict *reverses* the assumption it encoded.
  ⚠️ The comment-density item here is mild ("not the DocsPanel pattern" per the reviewer) but it is
  the **fifth consecutive review** to raise density in this repo — treat it as further evidence for
  the standing *budget* ask on the M11 blocks below, not as another isolated trim.

## Code-quality findings — m11-wp4-docs-live-reload (2026-08-02)
- **Pointer:** **1 MAJOR + 4 MINOR** remaining (was 1 CRITICAL + 4 MAJOR + 4 MINOR) from
  `code-quality-reviewer` against ship baseline `480052e`. **The CRITICAL and 2 of the 4 MAJOR
  were FIXED IN PLACE at `/feature-refactor`, not backlogged.** The CRITICAL: the `"jump"` arm
  wrote the machine's answer into `chosen` — the state documented as "the USER's explicit pick" —
  and since the jump guard is `chosen === null`, **the first jump permanently disabled every
  later one**, self-disabling the feature's headline behavior after one firing. It was the exact
  move `docsReloadDecision.ts` forbids for `"refallback"`, made one arm earlier. Fixed by giving
  the machine its own `jumpedTo` slot (three precedence tiers: user > machine > default, stated
  in `selectedDoc`). MAJOR-1: neither user-selection path dispatched `"reset"`, so a scroll offset
  held for doc A could apply to doc B — correctness was resting on an incidental `planRestore`
  clamp; fixed by funnelling both paths through a single `chooseDoc`. MAJOR-3: the reload ran
  regardless of `panelFront`, so a never-opened Docs tab still issued `docs_list` per debounce
  window per workspace; fixed with a skip-and-remember-stale flag plus a catch-up re-list on
  re-front. All three mutation-proven (M23/M24/M25, one arm each).
  **⚠️ The 1 MAJOR (`SIBLING-EDIT-MOVES-AUTOSELECTION`) was RESOLVED at M11 WP5 (2026-08-02)** —
  see CHANGELOG; its body is deleted from the findings file. **Remaining: 3 MINOR** (⚠️ the comment-density
  MINOR was RESOLVED at the 2026-08-12 paydown sweep — the budget rule is now recorded in
  `docs/lessons/source-text-guards.md` → "Comment budget", so it is no longer carried here; a second
  `fs-change` listener deviating from a stated in-repo pattern; a vestigial null-check; an
  error-surfacing asymmetry). See
  [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) →
  `# m11-wp4-docs-live-reload — 2026-08-02`.
- **Priority:** low (all four remaining)
- **Status:** deferred — carry to next cycle *(M11 cycle-close sweep 2026-08-03)*. Held for a future `/feature-refactor` **by design**, not cycle-resolved — part of the standing code-quality batch. ⚠️ The comment-density finding is the pick across all four M11 blocks: it is ONE finding at four points in time (WP2 → WP3 → WP4 → WP5) and WP5's reviewer concluded per-WP trimming **is not converging** — it wants a density *budget*, not another sweep.
- **Pickup shape:** Fold into the next touch of `DocsPanel.tsx`. Read the WP5 comment-density
  item alongside this one — they are the same finding at two points in time, and WP5's reviewer
  concluded per-WP trimming is not converging (it wants a density *budget*, not another sweep).

## Code-quality findings — m11-wp3-docs-render-and-navigation (2026-08-02)
- **Pointer:** **2 MINOR** remaining (was 3; 0 CRITICAL, 0 MAJOR) from `code-quality-reviewer` against ship baseline `6f6df23`. ⚠️ **`SELECTED-RECOMPUTED-FEEDS-EFFECT` was RESOLVED by M11 WP4** (2026-08-02) — the WP it named as the point it "becomes live" — and deleted per delete-on-resolve; see CHANGELOG. **All 4 MAJOR were FIXED IN PLACE, not backlogged** — three were verified by reproducing the reviewer's mutations first, and one of them (folding an empty-href bail into the anchor guard) **passed the full 1645-test suite while re-opening the `[click]()` webview-hijack hole this WP had just fixed**. The root cause the reviewer named — *"the remedy is not more `?raw` arms but mutation-probing the component rather than the copy of it"* — was acted on: the click handler was extracted to `handleDocLinkClick.ts` so the behavioral test **imports the real code**, and the source-order guard was deleted rather than re-patched (that shape had failed twice). Also fixed: `resolveDocLink`'s `fragment` was computed, documented, and discarded by its only caller, so `wbs.md#section` links landed at the top of the doc while the comment said otherwise. The 2 remaining MINOR: comment density past useful (⚠️ flagged by the *previous* WP's review too, and it grew — **and flagged a THIRD time at WP4**, where the reviewer judged it to have crossed from stylistic to functional and named specific offenders; see the WP4 findings entry), and `headingSlug` lacking GitHub's collision suffix. See [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m11-wp3-docs-render-and-navigation — 2026-08-02`.
- **Priority:** low (all)
- **Status:** deferred — carry to next cycle *(M11 cycle-close sweep 2026-08-03)*. Held for a future `/feature-refactor` **by design**, not cycle-resolved — part of the standing code-quality batch. ⚠️ The comment-density finding is the pick across all four M11 blocks: it is ONE finding at four points in time (WP2 → WP3 → WP4 → WP5) and WP5's reviewer concluded per-WP trimming **is not converging** — it wants a density *budget*, not another sweep.
- **Pickup shape:** All three are polish that should ride a future touch of these files. The comment-density one is the pick — it has now been flagged twice, and the reviewer supplied a usable discriminator (*does the sentence survive once the WIP is archived?*). ⚠️ Do NOT strip the ⚠️-marked invariant comments while doing it; those are the ones that stopped real regressions. Dismiss via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-08-02-SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE
- **Source:** feature:verify-human (M11 WP3 Phase 3)
- **Target level:** product:arch
- **Type:** new-work (security hardening)
- **Summary:** Set a real Content-Security-Policy on the webview. `tauri.conf.json` ships `"csp": null`; the operator agreed at WP3 verify-human that a CSP **should** exist as a second line of defense behind the renderer's raw-HTML escaping.
- **Context:** WP3 recorded the *posture* decision in `arch.md` ("raw HTML is BLOCKED", pinned three ways) but deliberately did NOT set the CSP, on two grounds. (1) It needs **`style-src 'unsafe-inline'`** — 14 files use inline `style={{…}}` and CodeMirror/xterm inject stylesheets at runtime — so it does **not** close the CSS vector class and is a partial backstop, not a replacement for the escaping. (2) It is **app-wide**: terminal, editor, diff, PiP NSPanel, dashboard and updater all render under it. A too-strict CSP fails **silently** (blank panel, unpainted terminal), so it needs a full-surface live verification pass that a docs-viewer WP had no reason to run.
- **Suggested action:** Proposed starting policy — `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost`. ⚠️ Verify **live** on every webview surface before shipping: xterm terminal (render + input), CodeMirror editor + diff, the **PiP NSPanel** (separate webview — easy to forget), the analytics dashboard, and the updater banner. Confirm the updater's `github.com` endpoint still resolves (it is a Rust-side fetch, so it should be unaffected — verify rather than assume). Note `img-src data:` is needed if any surface renders inline data-URI images.
- **Priority:** medium (no live exposure — raw HTML is structurally blocked and mutation-proven; this is defense-in-depth for when that first line is removed by someone who did not know it was load-bearing)
- **Status:** deferred — carry to next cycle *(M11 cycle-close sweep 2026-08-03)*. Deliberately NOT folded into M11: app-wide in scope, needs `style-src 'unsafe-inline'`, fails SILENTLY, and wants its own verification pass — folding it into a docs-panel WP would have shipped it unverified. Recorded in `arch/security-posture.md` → read-only-is-the-panel-not-the-webview.

## Code-quality findings — m11-wp2-docs-panel-plumbing (2026-08-01)
- **Pointer:** **2 MINOR** remaining (was 2 MAJOR + 4 MINOR). ⚠️ **Both MAJORs were RESOLVED by M11 WP3** (2026-08-02) and deleted per delete-on-resolve — the fetch-latch entanglement became an explicit state machine (`fetchLatch.ts`) before WP4's reload could turn it into a loop, and the missing wiring test landed as `docsPanelWiring.test.ts`. ⚠️ **2 of the 4 MINORs were resolved by paydown WP1** (2026-08-18) — the `validate_frontend_root` copy (now `pub(crate)` + imported, and the dedup is compile-enforced) and the `DocsPanel.tsx` `selected` item (resolved by WP3+ shipping; no edit needed). **The 2 survivors are comment-DENSITY items and belong to the deferred T1/T2 convention pass, not a sweep WP** — per-WP trimming was measured as not converging. See [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m11-wp2-docs-panel-plumbing — 2026-08-01`.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M11 cycle-close sweep 2026-08-03)*. Held for a future `/feature-refactor` **by design**, not cycle-resolved — part of the standing code-quality batch. ⚠️ The comment-density finding is the pick across all four M11 blocks: it is ONE finding at four points in time (WP2 → WP3 → WP4 → WP5) and WP5's reviewer concluded per-WP trimming **is not converging** — it wants a density *budget*, not another sweep.
- **Pickup shape:** Sweep in a refactor pass or dismiss individually. Dismiss via the WIP's `## Code-Quality Review` section.
## SURFACE-2026-08-01-DOMPURIFY-DEFAULTS-LEAVE-DATA-SVG-AND-STYLE
- **Source:** feature:build (M11 WP1 Phase 2)
- **Target level:** product:wbs (M11 WP3 build-time constraint — only if Option A is chosen)
- **Type:** gap (security-config finding)
- **Summary:** **DOMPurify's default configuration is NOT sufficient for this app's threat model.** Measured against a hostile fixture: `DOMPurify.sanitize(marked.parse(src))` leaves **two live vectors** — a live `<style>` tag, and `<img src="data:image/svg+xml;base64,…">` whose payload decodes to `<svg onload="alert(1)"></svg>`. **Neither `FORBID_TAGS` nor the strictest `ALLOWED_URI_REGEXP` removes the `data:` URI** (three configs probed; all three left it intact) — DOMPurify treats `data:` on `<img>` as an allowed-data-URI tag and bypasses the URI regexp for it.
- **Context:** Only bites if M11 WP1's verdict picks **Option A** (`marked` + DOMPurify). Option B (`react-markdown`) escapes raw HTML by default and measured 0 live vectors with no extra work. Matters because the app has **no CSP** (see `SURFACE-2026-08-01-APP-SHIPS-WITH-CSP-NULL-…`), so the sanitizer is the only line of defense and the failure mode is silent — the output *looks* sanitized.
- **Suggested action:** If Option A is chosen, the shipping config must include `FORBID_TAGS: ["style"]` **and** an `afterSanitizeAttributes` hook stripping `data:` from `src`. Verified to reach 0 live vectors while preserving a benign `./local.png` and all cross-doc/anchor/external hrefs. Pin it with a hostile-fixture test asserting the **live DOM** (not source text). If Option B is chosen, this item is moot — close it.
- **Priority:** low (conditional on the WP1 verdict; fully characterized with a proven fix in hand)
- **Status:** **deferred — MOOT under the WP1 verdict** *(2026-08-01)*. WP1 chose Option B (`react-markdown`), so DOMPurify does not ship and this gap is not live. Kept rather than deleted because the mutation table below is the evidence for *why* Option A was not chosen — **revive only if Option A is ever reconsidered**. Nothing resolved it; the verdict routed around it, so delete-on-resolve does not apply.
- **⚠️ UPDATED 2026-08-01 (verify-self) — the gap is WIDER than first measured, and the first measurement was wrong.** The original predicate had no `style`-**attribute** probe, so it scored a surviving `<div style="background:url(javascript:alert(1))">` as clean. DOMPurify's default `ALLOWED_ATTR` includes `style` and it does not parse CSS. Corrected numbers: **`A-sanitized` (defaults) = 4 live vectors**, not 2. The full Option-A recipe is therefore **three individually-necessary options** — `FORBID_TAGS:["style"]` + `FORBID_ATTR:["style"]` + the `afterSanitizeAttributes` data-URI hook — each **mutation-proven load-bearing** (dropping any one scores 1, 2, or 1 respectively; dropping all scores 4). **If Option A is chosen, all three ship together and the pinning test must assert the live DOM including a style-attribute probe** — the failure mode of omitting one is silent. Two further latent gaps (`img[srcset]`, `track[src]`) survive even the full recipe: outbound network/beacon references rather than script execution, low priority, but unblocked only by the absent CSP.

## SURFACE-2026-08-01-PNPM-SPIKE-IN-TMP-MUTATES-REPO-LOCKFILE
- **Source:** feature:build (M11 WP1 Phase 1, P1.1)
- **Target level:** product:arch (convention note — belongs with the "Setup & Ecosystem Gotchas" family in `CLAUDE.md`)
- **Type:** tech-debt (tooling footgun / verification-hygiene)
- **Summary:** Running `pnpm add` inside the repo's **gitignored** `tmp/` directory still **mutates the tracked `pnpm-lock.yaml`** at the repo root. pnpm resolves upward to the workspace root and does not honor gitignore for that resolution (the tell is `../..` appearing in its progress output). Crucially, **`package.json` is left untouched**, so the common "did I add a dep?" check — grepping `package.json` — reports clean while the lockfile is dirty.
- **Context:** Hit while spiking two markdown renderers for M11 WP1. The WP plan explicitly said "spiking may install into a throwaway dir under `tmp/`, which is gitignored" — that instruction was wrong, and following it dirtied the tree. Caught by `git status` before any commit and reverted with `git checkout pnpm-lock.yaml`; the spike was relocated outside the repo entirely (the session scratchpad). Generalizes beyond this WP: **any** future dependency spike, renderer/library bake-off, or "just try it in a sandbox dir" inside this repo has the same failure, and it is silent in the check most people run.
- **Suggested action:** Record the rule in `CLAUDE.md` → "Setup & Ecosystem Gotchas": *a dependency spike must live outside the repo tree (use the session scratchpad), because `tmp/` being gitignored does not isolate a pnpm install; and when verifying no-footprint, check `pnpm-lock.yaml` explicitly, not just `package.json`.* One short bullet — no code change.
- **Priority:** low (one-line doc fix; the failure is reversible and was caught immediately — but it is silent, recurring, and cheap to prevent)
- **Status:** deferred — carry to next cycle *(M11 cycle-close sweep 2026-08-03)*. One-line doc fix, already captured as a Setup-Gotcha in the root `CLAUDE.md`; the remaining work is the preventive guard.

## Code-quality findings — time-tracking-offline-local-only-copy (2026-08-01)
- **Pointer:** **2 MINOR** (0 CRITICAL, 0 MAJOR remaining) from `feature-review-quality` against ship baseline `0f5a8c7^..7a1a185`. **Both MAJORs and one MINOR were FIXED IN PLACE, not backlogged** — the two MAJORs were reflow-fragile `?raw` assertions in this WP's own new copy guards (prose inside JSX wraps at Prettier's default 80 cols; two assertions sat 3–6 chars from the boundary and passed only by luck about where the words fell), fixed by normalizing the haystack in both guard files and **validated in both directions**: a pure reflow with identical words now passes where it previously failed, while dropping a claim / dropping the scope disclosure / renaming the advertised label each still fail. The deviation from autopilot's auto-backlog default was deliberate — one line per file, the guards protect a **privacy disclosure**, and they had been written in the same session, so backlogging a guard already known to misfire would have shipped known-broken verification. The 2 remaining MINOR: the Analytics hint still ~2.5× its longest sibling hint (content correct, length an explicit call), and ~55 lines of test commentary triplicating prose that also lives in the WIP/WBS/commit. See [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) → `# time-tracking-offline-local-only-copy — 2026-08-01`.
- **Priority:** low (all).
- **Status:** deferred — carry to next cycle *(M11.5 close, 2026-08-01)*.
- **Pickup shape:** Both are polish that should ride a future touch of these files, not a standalone pass. ⚠️ **Neither should be "fixed" by weakening a claim or a guard:** the hint's length is four *distinct* load-bearing facts (the machine-wide scope clause especially — removing it makes the copy misleading by omission), and the whitespace-normalization comment in the guards is what stops someone simplifying the haystack back to raw and silently re-breaking them. Dismiss via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-08-01-EDITOR-DISK-RELOAD-WAITS-FOR-REAL-WINDOW-FOCUS
- **Source:** feature:build (M11.5 WP2 Phase 1 reproduction run, 2026-08-01)
- **Target level:** product:wbs
- **Type:** bug
- **Summary:** ⚠️ **LOW-CONFIDENCE — re-test from scratch before acting.** Observed that an external change to an open file did not reload the editor's document text while the Claudesk window lacked real OS focus. **The observation is partly confounded by tester error:** the shell cwd had reset, so one of the disk writes landed in the repo root instead of the watched scratch dir — the app was correctly watching a file that had stopped changing. The effect may be wholly explained by that. Recorded because it was noticed, not because it is established.
- **Context:** Found incidentally while trying to reproduce the minimap staleness bug — it is **not** that bug (the minimap faithfully matched its own buffer in every recipe, and `SURFACE-2026-07-31-EDITOR-MINIMAP-STALE-ON-FILE-UPDATE` explicitly states the text updates correctly). Deliberately **not** pursued in WP2: the roadmap clears the `checkDisk` → `diskDecision` → `reloadFromDisk` path as not-suspect, and it is shared machinery the WP was instructed not to touch without a reproduction implicating it. Whether this is even a defect is a judgment call — reloading only on focus is a defensible design (it is when the user can actually see the change), and it may well be the intended behavior.
- **Suggested action:** First decide whether it is a bug at all. If yes, the question is whether the CC-edits-a-file case (the common Claudesk case, where the user *is* watching the panel while CC works, possibly with the window focused but the editor pane merely unfocused) is covered by the current trigger. Worth pairing with any future work on the disk-reload path rather than picking up alone.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M11.5 close, 2026-08-01)*

## SURFACE-2026-07-31-MODEL-ALIAS-HINTS-COULD-BE-DYNAMIC
- **Source:** operator question at M11.5 WP1 Phase 3 verify-human ("Then can this list be dynamic?")
- **Target level:** product:wbs
- **Type:** new-work
- **Summary:** The per-project model control's `datalist` suggestions come from a hardcoded `MODEL_ALIAS_HINTS = ["fable", "opus", "sonnet"]` (`src/cc/modelOverride.ts`). Could it be derived instead of hand-maintained?
- **Context:** **Not a correctness gap** — the hints affect *autocomplete only*. Any value stays typeable, nothing validates against the list, and its non-exhaustiveness is test-pinned at all three layers (TS normalizer, Rust store, Rust argv builder). If CC ships a new model it works immediately; only the suggestion is missing. **CC exposes no `list-models` command** (verified against `claude --help`: `--model` plus 11 subcommands, none enumerating models), so "dynamic" requires choosing a different source. The staleness cost is bounded, which is why this was not built during WP1.
- **Suggested action:** **recently-used derivation** is the recommended option — zero dependencies, no network, no credentials, and it surfaces the models this operator actually uses (it is also what the roadmap's own constraint text suggested: "free-text / recently-used / derived"). Union it with the three static aliases so a fresh install still gets suggestions. **Two alternatives considered and not recommended:** scraping CC's own config/state (brittle coupling to an undocumented internal shape — the same anti-brittleness argument as M10.9 §4c), and querying the Anthropic API's models endpoint (authoritative and even entitlement-aware, but adds a network call, credentials Claudesk does not hold, and an offline-failure path to a feature that currently has none — a large surface for autocomplete convenience).
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M11.5 close, 2026-08-01)*

## SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS
- **Source:** feature:verify-codify (M11.5 WP1 Phase 2)
- **Target level:** product:arch
- **Type:** gap
- **Summary:** ⚠️ **PARTIALLY RESOLVED — the factual claim below was REFUTED and is corrected 2026-08-18 (paydown WP5); only the DECISION remains open.** The original text read *"not one of the 123 test files renders a component"*, which was true when written and is not now: **`renderToStaticMarkup` + jsdom renders components today with no new dependency** (`docsRender.test.tsx`, `projectModelCellRender.test.tsx`), proven on a component with hooks AND IPC. ⚠️ **Do NOT cite this entry for "components cannot be render-tested here"** — the authority is `docs/lessons/source-text-guards.md` → "The render-harness note, corrected", which states both halves plus the boundary. What remains genuinely open: **`@testing-library/react` is still not a dependency**, so there is no harness for INTERACTION — event dispatch, state transitions, `act()`, or the StrictMode double-invoke class. Every frontend test is a pure-function test, a source-text guard, or a resting-DOM render.
- **Context:** Surfaced when codifying the picker-row model control (M11.5 WP1 Phase 2). Two verify-human-verified behaviors were **honestly un-pinnable**: (1) click-to-edit yielding exactly one `<input>` + N-1 labels across a list, and (2) a commit reverting the visible value on IPC rejection. Both need a real render with state transitions. The gap has been *worked around* repeatedly rather than named: pure-function extraction (`decideCommit`, `escDismissTarget`, `PICKER_ROW_CELLS`) is the standing mitigation and is genuinely good practice — but it cannot reach render-output or interaction-sequence properties, so those currently rely on live MCP-bridge verification, which is operator/agent-driven and not a regression gate. Note this is *also* what made M10.9 WP2's StrictMode double-write invisible to tests (the tests there modelled `set` with a plain closure, which has no React semantics to double-invoke).
- **Suggested action:** decide deliberately whether to adopt a render harness (`@testing-library/react` + `jsdom`; Vitest already present) or to **formally accept** the "pure-core + live-verify" posture and stop treating render-level coverage as a gap. Either is defensible — the cost of the current implicit position is that each feature re-discovers the limit and re-argues it. If adopted, the first targets are the two behaviors above plus the StrictMode-double-invoke class.
- **Priority:** low
- **Status:** deferred — carry to next cycle; **rewritten at paydown WP5 (2026-08-18)** to the remaining open decision (adopt an INTERACTION harness or formally accept pure-core + live-verify). The resting-DOM half is no longer a gap.

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

## Code-quality findings — m10.9-wp3-invite-settings-substrate (2026-07-29)
- **Pointer:** **1 MAJOR + 4 MINOR** (0 CRITICAL) *(was 5 MINOR — `WP3-OPERATOR-SPECIFIC-CLONE-PATH` was RESOLVED by WP3.5a on 2026-07-29 and deleted per delete-on-resolve; see CHANGELOG)* from `feature-review-quality` against ship baseline `6193615^..5bc88f3`. **A 2nd MAJOR is NOT listed — it was a live defect and was FIXED at review time, not backlogged:** `App.tsx` read the gate via the raw `getWorkflowFeaturesEnabled()` wrapper, bypassing WP2's seam contract, and a one-shot read **never re-syncs** on `WORKFLOW_FEATURES_ENABLED_EVENT` — so enabling the gate mid-session left the value stale for the process lifetime (masked only by an unrelated `dismissedThisSession` term). Fixed by consuming `useWorkflowFeaturesEnabled()`, **and the OFF-invariant guard's blind spot that hid it was closed in the same pass** (its bypass scan matched only raw command strings, so a wrapper import was invisible; the new arm strips comments and is proven to bite on the exact shipped violation). The remaining MAJOR: **`WP3-POSITIONAL-RAW-SLICING`** (two wiring guards use positional `?raw` slicing — one line-bounded, one a fixed `at + 90` window, which is the pattern that already produced a false positive *in this same feature*; they guard the highest-value assertions in the file, `[Later]`-writes-nothing and Esc-means-Later). The 5 MINOR: a detached comment block in `SettingsPanel.tsx`; a hardcoded highlight tint in `settingsHighlight.test.ts`; the operator-specific `~/Personal/projects/…` clone path shown to secondary users (**coordinate with WP3.5's location picker**); an untestable "kebab-case" claim with only single-word variants; and the stale `..._other_seven_fields` sibling test name. Reviewer verdict: "high-quality, unusually disciplined work… the debt it accrues is a seam-discipline exception that should be made explicit rather than left implicit" — which is what the in-place fix did. See [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m10.9-wp3-invite-settings-substrate — 2026-07-29`.
- **Priority:** medium (1 MAJOR) + low (5 MINOR).
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** **`WP3-POSITIONAL-RAW-SLICING` belongs with the open `SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING`** — same idiom, same root cause, and a single pass could extract the Esc decision as a pure function (the `escDismissTarget` precedent) while stripping the fragment-matching greps. Likewise the two test-naming items (`WP3-KEBAB-CASE-CLAIM-UNTESTABLE`, `WP3-STALE-SIBLING-TEST-NAME`) pair with `SURFACE-2026-07-29-SETTINGS-PRESERVES-OTHER-FIELDS-TEST-NAME-OVERSTATES-ASSERTION` — all three are in `settings.rs` and all three are the overstated-assertion class this feature hit repeatedly. ~~`WP3-OPERATOR-SPECIFIC-CLONE-PATH` should be settled BEFORE WP3.5 builds its location picker~~ — **RESOLVED at WP3.5a.** The outcome inverted the original suggestion: the two paths deliberately **disagree** (neutral `~/dev/…` for hand-run, `~/.claudesk/vendor/` for the wizard), because pointing manual instructions at the managed dir would create unrecorded clones that read as `developer` while looking managed. Dismiss via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m10.9-wp2-workflow-features-gate (2026-07-28)
- **Pointer:** **2 MAJOR + 4 MINOR** remaining (0 CRITICAL) from `feature-review-quality` on the WP2 ship commit `467593f`. **⚠️ `WP2-CHORD-ARM-MISSES-PANELHOST` was RESOLVED 2026-08-01 by M11.5 WP4 (`0bac2c6`) and its body is deleted from the findings file** — the chord arm now selects by exported identifier, `panelHost.ts` is in scope, and the probe that passed 10/10 against it fails. **A 4th MAJOR is NOT listed — it was a live defect and was FIXED at review time, not backlogged:** `useSettingControl` called `persist()` inside a `setValue` updater, and StrictMode's dev double-invoke made **every settings toggle fire two IPC writes**; fixed via a `valueRef` read outside the updater, confirmed empirically (2 writes → 1) and pinned by a shape guard proven to bite. The 2 still-open MAJOR: **`WP2-RAW-GUARDS-STILL-LOAD-BEARING`** (~10 `?raw` greps in `settingsPanelWiring.test.ts` match formatted multi-line fragments — the exact shape that broke twice during this feature; the behavior is already covered in `escDismiss.test.ts`); **`WP2-PICKER-PREFIXED-TESTIDS-IN-SETTINGS-PANEL`** (migrated controls kept `picker-*` testids inside the Settings panel — WBS-permitted, but a durable lie in the selector namespace; ~8-site mechanical rename). The 4 MINOR: missing `return` after the Esc branch in `App.tsx`; the milestone rationale restated in ~6 places; the tautological `ALLOWED_SAMPLE` half of the allowlist test; `SettingsPanel.tsx` near the doing-too-much line before M14 extends it. Reviewer verdict: "well-built work that clears the bar the milestone set… the debt is concentrated in two places." No refactor auto-invoked (0 CRITICAL). See [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m10.9-wp2-workflow-features-gate — 2026-07-28`.
- **Priority:** medium (3 MAJOR) + low (4 MINOR).
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** **⚠️ Re-scoped 2026-08-01 — the chord-arm half of this entry is DONE.** The original advice was to pay the two MAJOR test-quality items *together* (both being about the `?raw` idiom's limits); that pairing is now moot — `WP2-CHORD-ARM-MISSES-PANELHOST` shipped in M11.5 WP4 and is deleted from the findings file. What remains: **`WP2-RAW-GUARDS-STILL-LOAD-BEARING`** (~10 `?raw` greps matching formatted multi-line fragments; best paid alongside `WP3-POSITIONAL-RAW-SLICING`, and **corroborated a third time** by the 2026-08-01 `format:check` sweep, where two such guards broke as false negatives on a pure reflow) and **`WP2-PICKER-PREFIXED-TESTIDS-IN-SETTINGS-PANEL`** (~8-site mechanical rename, wants its own commit to stay reviewable). The 4 MINOR are low and unchanged. Dismiss via the WIP's `## Code-Quality Review` section.

## Code-quality findings — editor-fs-backend-hardening (2026-07-20)
- **Pointer:** 4 MINOR (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on the backlog-paydown **WP7** `editor_fs` hardening (working-tree diff, HEAD `6f514d0`). The four: **`WP7-VALIDATE-ROOT-PER-CALL-COST`** (every read/write/stat/delete/trash/create re-reads `projects.json` + canonicalizes every known root — memoize behind config-store state); **`WP7-UNKNOWN-ROOT-ERROR-VARIANT`** (a distinct `UnknownRoot` variant would read cleaner than reusing `OutsideWorkspace { root: "<no known project>" }`); **`WP7-STALE-COMPILE-GAP-TEST-COMMENT`** (trim the superseded RED-phase comment in the gap-2 test block); **`WP7-RESOLVE-WITHIN-TOCTOU-NOTE`** (documentation-of-non-issue: the `exists()`→`canonicalize()` window is re-validated). Reviewer verdict: "well-built, disciplined hardening pass… none rise to a finding." No refactor auto-invoked (0 CRITICAL/MAJOR). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# editor-fs-backend-hardening — 2026-07-20`.
- **Priority:** low (all 4 MINOR).
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** all four ride any future `editor_fs` touch — the per-call cost + `UnknownRoot` variant are the two with any substance (both small); the other two are a comment trim + a non-issue note. Dismiss via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m10.5-wp3-cc-terminal-clean-kill (2026-07-19)
- **Pointer:** 1 MINOR remaining (originally 0 CRITICAL / 0 MAJOR / 3 MINOR; the "3s" `kill_all` doc-drift MINOR and the `None`-pgid fallback comment MINOR both RESOLVED) from `feature-review-quality` on the WP3 SIGHUP-first process-group kill (`cc_session/mod.rs`). The remaining MINOR — **`WP3-REAPLEADER-SILENT-NONREAP`**: `ReapLeader` discards `poll_reaped()`'s result (`let _ =`) → a residual non-reap (AC-4 wedged-workspace case) degrades silently; add a debug log / distinct signal on `Ok(false)`. Reviewer verdict: "a well-built, unusually disciplined bug fix… No refactor is warranted." No refactor auto-invoked (0 CRITICAL). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m10.5-wp3-cc-terminal-clean-kill — 2026-07-19`.
- **Priority:** low (1 MINOR).
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** a one-line `cc_session/mod.rs` observability touch-up (a `log`/return on the `ReapLeader` `Ok(false)` branch) — rides any future kill-path touch. Dismiss via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m10-wp4-updater-user-control-ux (2026-07-17)
- **Pointer:** 1 MINOR surviving (originally 1 MAJOR + 3 MINOR; **3 RESOLVED by M10 WP6 Phase 1** — the MAJOR `ERROR-STATE-UNCONSUMED` [now consumed by `UpdaterStatusRow`], MINOR `MENU-CHECK-DISCARDS-OUTCOME` [manual-check feedback wired via `statusNoteForOutcome`], and MINOR `FALLBACK-VS-ERROR-RACE` [reconciled under the single-post-install-surface invariant] — all closed 2026-07-18 at `/product-finalize`, see CHANGELOG). Remaining: **`on_download_finish` emit zeroes the final `downloaded` byte count** (`src-tauri/src/updater/commands.rs` ~L184-193; harmless — `progressPercent` short-circuits to 100 on `done` — cosmetic). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m10-wp4-updater-user-control-ux — 2026-07-17`.
- **Priority:** low.
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** the one surviving MINOR is a one-line fix — carry the final `downloaded` through on the finish emit (or a one-line comment) — rides any future `updater/commands.rs` touch. Dismiss via the WIP's `## Code-Quality Review` section.

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
- **Status:** pending — cross-repo (`my-claude-code-customization`).

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
- **Status:** pending

## SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION
<!-- Heading RESTORED at the M10.9 cycle-close sweep (2026-07-31). This item had lost its `## ` heading
     and was orphaned under SURFACE-2026-07-20-TIME-TRACKING-OFFLINE-LOCAL-ONLY-MESSAGING, making it
     unfindable by ID and making that item appear twice in a heading scan. Pre-existing defect, not
     introduced by this cycle. -->
- **Source:** operator (raised mid-M9, 2026-07-14)
- **⚠️ PARTIALLY RESOLVED 2026-08-25 by M13.5 WP3 — REWRITTEN to the remaining open work, not deleted.**
  Solution direction 1 of 4 shipped: **turn-boundary markers + a bidirectional jump affordance**
  (`↑ N/N ↓` in the terminal chrome, stepping through turn starts over the existing scrollback).
  See `CHANGELOG.md` 2026-08-25 and `workflow-system/state/archive/turn-output-reorientation.md`.
  ⚠️ **The original problem is NOT fully solved** — a jump control helps you *navigate* to a turn
  start; it does not stop an inline answer being **buried** by continued task output, which is the
  half the operator actually reported ("can't find that answer anymore").
- **Target level:** product:roadmap — the remaining directions are a further capability, not a bug.
- **Type:** new-work (UX / attention feature).
- **Summary (remaining):** With heavy cross-workspace switching, the operator asks a *question layered
  on top of a workflow instruction*, the LLM **answers first and then proceeds without pausing**, and
  by the time the operator switches back the answer is buried mid-scroll. Navigation to turn starts
  now exists; **surfacing or preserving the answer itself does not.**
- **Context:** Squarely in Claudesk's thesis — *attention is the scarce resource*
  ([[claudesk-philosophy]]). Real-time status surfaces say *that* a workspace changed state; WP3 now
  helps you re-orient to *where a turn began*. Neither helps you find **the answer inside it**.
  Adjacent-but-distinct from the M11 docs-viewer ([[m7-docs-viewer-intent]]).
- **Remaining solution directions (3 of the original 4 — all still undecided):**
  - ~~**Turn-boundary markers in the terminal**~~ — ✅ **SHIPPED M13.5 WP3** (2026-08-25).
  - **Per-turn "answer/notable" capture:** detect when CC emitted a direct answer to an operator
    question (vs. pure task output) and surface it in a persistent, non-scrolling side rail or a
    "last answer" chip that survives the turn.
  - **A turn digest / re-orientation panel** opened on returning to a workspace: "since you left:
    turn ended, here's the answer to your question + what got done."
  - **Behavior-side:** make the orchestrator pause (or visibly flag) after answering an inline
    question layered on an AUTO task, so the answer isn't immediately buried. ⚠️ This one is a
    **workflow-system** change, not a Claudesk one — it belongs in the owed cross-repo handoff.
- **⚠️ WHEN ADDRESSED — REQUIRED FIRST STEP, STILL NOT DONE:** **scan the recent session logs /
  transcripts for concrete real examples** of the pattern (question layered on a workflow instruction
  → LLM answered-then-proceeded → answer buried in a long turn). Ground the spec in captured
  instances, not a hypothetical — the operator explicitly asked for this. ⚠️ **M13.5 WP3 did NOT do
  this** (it was scoped to the navigation half, whose design was settled by probe data instead), so
  the requirement carries forward intact. Likely sources: harness session logs under
  `~/.claude/projects/<slug>/`, long-turn transcripts. Extract 2–3 concrete examples (the question,
  where the answer landed, how far it scrolled).
- **Priority:** medium (the navigation half is shipped, which lowers the felt friction; the
  answer-burial half remains real and recurring).
- **Update 2026-09-15 — ⛔ DROPPED from Group F by the operator.** Briefly carried as **F-c** in
  `roadmap.md`'s Group F (opened the same day) and **removed on operator review** of the three
  operator-requested capabilities. ⚠️ **Dropped from the scheduled group, NOT deleted and NOT
  resolved** — the entry stays because half of it genuinely shipped (M13.5 WP3's turn-boundary
  markers + `↑ N/N ↓` jump) and the remaining answer-burial half is a real, articulated problem
  with its history intact here. It is simply **not scheduled work**. ⚠️ **Do NOT re-promote it by
  citing the product thesis** — it reads as a strong fit for *attention is the scarce resource*,
  which is exactly why it keeps resurfacing; the operator has now weighed it against F-a/F-b and
  chosen not to carry it. **Re-open only on a fresh operator ask.**
- **Status:** pending — recorded, not scheduled (dropped from Group F 2026-09-15)

## SURFACE-2026-07-14-M9-CUSTOM-RANGE-NEEDS-MULTIDAY-TIMELINE
- **Source:** feature:build (M9 WP6b-2 Phase 3 build-entry — the Custom-range render surfaced a `DayTimeline` constraint).
- **Target level:** product:wbs — a new WP (forked as **WP6b-4** at the operator's direction, 2026-07-14).
- **Type:** gap (missing render capability that blocks a planned surface).
- **Summary:** WP6a/WP6b-1 shipped `DayTimeline` as **single-day only** — it hardcodes `dayOffset 0` (seg coordinate = minute-of-day, 0–1440) and dropped the source's multi-day tick labels + NOW marker (`DayTimeline.tsx` L16-18). So a multi-day `RangePayload` (what a Custom range >1 day returns) cannot render on the day timeline — every day's segments collapse onto the same 0–1440 axis and overlap. The standalone `claude-time` timeline HAD multi-day `dayOffset` support; reviving it is the fix.
- **Context:** Blocks WP6b-2 Phase 3's Custom-range *render* (the picker + fetch are fine; the correct multi-day surface isn't). Operator chose (2026-07-14) the **full multi-day timeline port** and, because it touches the WP6b-1 interactive-viewport/Minimap subsystem (a multi-day viewport spans `day_count × 1440` minutes, not 1440 — the zoom/pan + Minimap coordinate math must cooperate), agreed to **fork it to a separate WP** rather than balloon WP6b-2. A 1-day custom range renders fine today (the Month drill-down proves it) — only multi-day is blocked.
- **Suggested action:** WP6b-4 (see wbs.md): revive `dayOffset` (per-session `day_iso` → day-index offset into `day_count × 1440`); multi-day ruler (day-separator ticks + per-day labels + NOW-on-current-day); reconcile with the WP6b-1 `ViewportContext` + Minimap (the crux — spec-first likely); wire Custom (+ optionally WP6b-3's past-week) through it. Size M–L.
- **Priority:** medium (blocks only the multi-day Custom render; Week/Month/SidePanel + 1-day drill all ship without it; sequenced after WP6b-2/6b-3, before WP6c — or whenever the multi-day view is wanted). Depends on WP6b-1 (viewport) + WP6b-2 (picker/fetch).
- **Status:** deferred — carry to next cycle *(M11.5 close, 2026-08-01)* (WP6b-4 added to WBS 2026-07-14; not yet started). WP6b-2 Phase 3 re-planned to ship picker+fetch only. — **deferred, carry to next cycle** *(M10.9 close, 2026-07-31)*

## SURFACE-2026-07-13-M9-WP6B1-KEYBOARD-PAN-ZOOM-DEFERRED
- **Source:** feature:plan (M9 WP6b-1, Q4 resolution)
- **Target level:** feature (future enhancement of the interactive day-timeline viewport) — NOT blocking WP6b-1
- **Summary:** WP6b-1 ships only a minimal keyboard affordance (`0` → reset viewport to the `hour_range` seed). The source `claude-time` viewport had a full keyboard set — arrow-pan (±10% range), `+`/`-` zoom, `0` reset, Home/End jump-to-edge. Deferred out of WP6b-1 scope: drag-pan + ctrl/cmd-wheel/pinch zoom + the Minimap cover the interaction need; keyboard pan/zoom is a nicety, not a requirement.
- **Context:** the deferred handlers are cheap (one `window` keydown listener + the same `clampViewport`); adding them later is a small, isolated follow-up. Files: `src/components/workspace/dashboard/` (a keyboard handler alongside `useTimelineGestures.ts` / the `ViewportProvider`).
- **Priority:** low (post-WP6b-1 nicety; add if a real need surfaces)
- **Status:** deferred — carry to next cycle *(M11.5 close, 2026-08-01)* (deferred at plan) — **deferred, carry to next cycle** *(M10.9 close, 2026-07-31)*

## SURFACE-2026-07-08-M9-WP6.5-CLOSE-MARKER-MISSES-FORCE-QUIT
- **Source:** feature:verify-human (M9 WP6.5 Phase 3)
- **Target level:** product:wbs (future enhancement) — NOT blocking WP6.5
- **Type:** tech-debt / known-limitation
- **Summary:** The explicit `WorkspaceClose` session-end marker (signal 1) fires only from `on_window_event(CloseRequested)` (+ the pre-existing WP7 `kill_all` reaping). A **force-quit** (SIGKILL/SIGTERM) bypasses the Tauri window event entirely, so no marker is written (operator force-quit with cc-1+cc-2 busy → 0 markers; no orphans, since parent-kill reaped the PTY children). A graceful per-workspace close DOES write the marker (verify-self LIVE-confirmed). Whether a graceful app-level ⌘Q reaches `CloseRequested` is unconfirmed (single-window Tauri usually fires it on last-window-close, but ⌘Q app-termination may route differently).
- **Context:** Operator-ACCEPTED as expected (2026-07-08): a force-quit is indistinguishable from a crash — CC emits no `SessionEnd` on a hard kill either (research 2026-07-08). The dangling session self-heals via **Phase 4 startup reconciliation** + **Phase 1 read-time cap**, so the dashboard numbers stay correct. This makes Phase 4's reconciliation LOAD-BEARING for the force-quit/⌘Q case, not just crash/power-loss.
- **Suggested action (future, optional):** add a `RunEvent::ExitRequested` / app-termination hook so a GRACEFUL ⌘Q also writes markers before exit (a true force-kill still can't be caught by any code). Low value given 2/4 cover it.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M11.5 close, 2026-08-01)* (accepted limitation; Phase 4 reconciliation is the safety net) — **deferred, carry to next cycle** *(M10.9 close, 2026-07-31)*

> **M13 (Skill orchestration) cycle-close — backlog sweep 2026-08-18 (`/product-finalize`).** M13 complete — all 4 WPs shipped, **and GROUP C CLOSED with it: all six vision success metrics are met** (WP1 probe `578ac4d`/`cbe4874` → WP2 skill buttons + the 5th guard arm `bd67758`/`e45cca8` → WP3 Recycle as a callable operation `be29dea` → WP4 milestone exit verify `1dba27b`/`ca0c973`/`22a58a9`, finalize `4d1d923`; WBS archived to `workflow-system/product/archive/milestone-13-skill-orchestration/`). Both exit criteria were verified **LIVE against the running app**, not inferred from code. **Sweep disposition: ZERO newly-resolvable items, and that is the honest result** — M13's two substantive resolutions were recorded incrementally at WP4's `feature-finalize` and are already absent from this file: `SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE` (RESOLVED, **deleted** per delete-on-resolve) and the WP3 comment-density MAJOR (**partially** resolved — its latency-figure half is closed and now guard-enforced, so the entry was **rewritten** to its remaining scope rather than deleted). Nothing else in the standing pile is addressed by a skill-orchestration milestone. **All 10 previously-`pending` items moved to `deferred`**, each with its reason inline. Two deserve a forward pointer because **M15 is their likely first exposure**: the WP3 pointer's **two BEHAVIORAL MAJORs** (an unreachable disposal branch that would leak one `fs-change` listener per Recycle; an **uncancellable** in-flight Recycle that can clear the flag for a session that never respawned) — ⚠️ **pay these BEFORE M15 wires the context-pressure caller, which fires with no human watching** — and `SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION`, whose `WORKFLOW_TERMS` blind spot a Recycle **menu item** would land in exactly; decide (a)-widen vs (b)-own-arm before building, standing precedent is (b). ⚠️ `SURFACE-2026-08-18-DEV-PROFILE-PERMISSION-MODE-BLOCKS-SKILL-WRITES` is **only half-applied** — dev is now `bypassPermissions` (verified at this close; prod untouched), but the durable half (seed-from-prod, or record the check-this-first in `docs/lessons/verify-self-tiers.md`) is open, and it is the half that prevents the misdiagnosis recurring. ⚠️ `SURFACE-2026-08-14-SKILL-SCAN-COLLAPSES-TWO-FRONTMATTER-ERRORS` is marked **DORMANT, deliberately NOT deleted** — WP2 chose option (i) so no scanner exists (confirmed by grep at this close), but nothing *fixed* the classifier, so delete-on-resolve does not apply. **Nothing escalated.** ⚠️ Two record-keeping notes for the next sweep: **M12 left no cycle-close blockquote here** (its sweep did run — items carry inline `M12 close 2026-08-12` statuses — only this summary note is missing; not reconstructed retroactively), and this sweep corrected a **live falsehood in `roadmap.md`**, which still stated the Recycle success path as an open accepted gap with the *refuted* "fixture-blocked" diagnosis. **Standing advisory: 34 open items (+20 code-quality pointers) with a large `deferred` code-quality tail — `/util-backlog-paydown` fits a between-cycle moment, and this is one.** Next execution milestone: **M14 (polish + OSS release)** or **M15 (workflow supervisor)** — ⚠️ **the order is a deliberately open operator call**, recorded as undecided in `roadmap.md`; the standing argument favors M14 first (M15 is a dogfooding win whose value to a stranger is unproven).

> **M11 (Workflow-docs markdown viewer) cycle-close — backlog sweep 2026-08-03 (`/product-finalize`).** M11 complete — all 5 WPs shipped, **exit verdict GO** (WP1 renderer probe `d467877`/`e971d22` → WP2 panel + discovery `6632f59` → WP3 render + auto-select + links `6f6df23` → WP4 scroll-preserving live reload `480052e`/`966dca5` → WP5 exit verify `0951d2d`/`8cda041`/`3c0eb8d`; WBS archived to `workflow-system/product/archive/milestone-11-workflow-docs-viewer/`). **Sweep disposition: ZERO newly-resolvable items at this sweep** — and that is the honest result, not an oversight. M11's one substantive resolution, **`SURFACE-2026-07-07-DOCS-VIEWER-RELOAD-PRESERVE-SCROLL`**, was recorded incrementally at WP4's `feature-finalize` and **deleted there** per delete-on-resolve, so it is already absent from this file; likewise WP5 resolved 1 MAJOR code-quality finding (deleted, its coupled pointer **rewritten** to the remaining 4 MINOR — a *partial* resolution, so the entry survives slimmer rather than being deleted). Nothing else in the standing pile is addressed by a docs-panel milestone. **All 8 previously-`pending` items moved to `deferred — carry to next cycle`**, each with its own reason recorded inline: `…BROWSER-SUPPLIES-THE-ANSWER…` (low) and `…JSDOM-CLIENTHEIGHT-IS-ZERO…` (medium) were **filed BY this cycle** as method/test-infra lessons rather than being work it could close; `…RAF-DOES-NOT-TICK-IN-MCP-BRIDGE-EVAL-CONTEXT` (medium) is candidate bridge caveat **(h)** and belongs with the next bridge-driven verify-self session; `…SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE` (medium) was **deliberately not folded in** — app-wide, needs `style-src 'unsafe-inline'`, and fails **silently**, so folding it into a docs-panel WP would have shipped it unverified; `…CSS-CLASS-GUARDS-MAY-USE-SUBSTRING…` (medium, 8 unaudited sibling files), `…OFF-INVARIANT-CHORD-ARM-PREDICATE-IS-MODULE-LEVEL…` (low, **no live gap** — M11 landed a gated surface with the guard passing 14/14, and the arm was *extended* to assert the computed `availablePanels(false)`, never narrowed), `…PNPM-SPIKE-IN-TMP-MUTATES-REPO-LOCKFILE` (low, doc fix already in root `CLAUDE.md`), and `…PROJECT-MEMORY-SYMLINK-NOT-IN-PLACE…` (medium, env hygiene). `SURFACE-2026-08-01-DOMPURIFY-DEFAULTS-LEAVE-DATA-SVG-AND-STYLE` stays **deferred-as-MOOT** rather than deleted — WP1 chose Option B so the gap is not live, and its mutation table is the *evidence for why Option A was rejected*; nothing resolved it, the verdict routed around it, so delete-on-resolve does not apply. **Nothing escalated.** ⚠️ Two things a future reader should not have to re-derive: the **`settled` precedence tier WP5 shipped is NOT live-verified** (informed operator decision — 1734 tests + 7 mutants; operator dogfooding exercises the trigger on every `/session-restore`), and **two WP4 evidence claims were RETRACTED** across four durable records because WebKit supplies both behaviors unaided (no code defect; both pure modules stay mutation-proven). **Standing advisory:** ~57 open items with a large `deferred` code-quality tail — **`/util-backlog-paydown` fits a between-cycle moment, and this is one.** Next execution milestone: **M12 (smart auto-resume + drive mode)**; M11.5 already ran before M11 by design, so there is no numbering catch-up.

> **M8 (Demo assets — filmstrip & PiP value showcase) cycle-close — backlog sweep 2026-06-29 (`/product-finalize`).** M8 complete — all 5 WPs shipped (WP1 probe→synthesized-GIF/Playwright/ffmpeg pipeline; WP2 shared harness `cbe2922`+`9cff1b1`; WP3 filmstrip GIF `a42ba61`; WP4 PiP GIF `5625658`; WP5 embed+README-restructure+push `f7b1310`/`157242d`/`c34925a`, finalize `f5cc431`; WBS archived to `docs/product/archive/milestone-8-demo-assets/`). Sweep disposition: this cycle's one newly-resolvable item is the milestone-level **`SURFACE-2026-06-29-DEMO-ASSETS-FILMSTRIP-AND-PIP`** (RESOLVED — both demos shipped as looping GIFs + embedded + operator-approved on the github.com render). M8 added **2 MINOR code-quality findings** (`Code-quality findings — m8-wp5-embed-place`: test-name over-claims "animated"; stale README Status block now prominent) — **DEFERRED** to a future `/feature-refactor` (by design), the stale-Status one a natural fold into a README-freshen task. M8 was a pure docs/marketing-asset cycle (no app code, no new dep, dev-only `tooling/demo/`), so it resolved none of the standing carry-forward items, all still **DEFERRED → carry forward** (anchors intact): the **code-quality `/feature-refactor` batch** (now incl. m8-wp2/wp3/wp4/wp5 MINOR batches — all dev-only `tooling/demo/` polish + the README-freshen); forward-look SURFACEs — `SURFACE-2026-06-26-ABSORB-CLAUDE-TIME-INTO-CLAUDESK` (→ **M9, the next execution milestone**), `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY` (→ **M10** docs-viewer, re-anchored off the cut M7 popover), `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (→ M9 startup-trim), `SURFACE-2026-06-27-WP1-STATUS-LOG-KEEP-OR-DEMOTE` (unblocked post-v0.2.2, keep-or-demote decision pending), `SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP` (→ test-infra), `SURFACE-2026-06-27-ESLINT-WALKS-GITIGNORED-SCRATCH-FIXTURE` (→ one-line eslint-ignore at next refactor), `SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED-AT-SESSION-START` (cosmetic). Also note: M7's **OC.1–OC.4 DEFERRED-TO-RELEASE** checklist (`workflow/archive/m7-menu-bar-status-item.md`) is still pending its next `/release` gate — M8 shipped no installed-`.app` change, so it didn't touch that. **Nothing escalated.** Each item keeps its own `Status:` detail; this note records the en-masse disposition. Next execution milestone: **M9 (Time-analytics panel — absorb claude-time).**

> **M7 (Menu-bar status item) cycle-close — backlog sweep 2026-06-29 (`/product-finalize`).** M7 complete — all 3 WPs shipped in commit `3888dd6` (WP1 tray icon + ambient alarm, WP2 actuator menu, WP3 milestone-exit verify; WBS archived to `docs/product/archive/milestone-7-menu-bar-status-item/`). Sweep disposition: this cycle's only newly-resolvable items were the 2 M7 arch-doc-name SURFACEs — **`SURFACE-2026-06-29-M7-TRAY-ATOMIC-ICON-METHOD-NAME`** (RESOLVED — `set_icon_with_as_template` is the real method; corrected across wbs/roadmap/arch/CLAUDE.md) and **`SURFACE-2026-06-29-M7-TRAY-NO-CONFIG-BLOCK`** (RESOLVED — glyphs embedded via `include_bytes!`, no `trayIcon` config block; corrected likewise). M7 added 3 MINOR code-quality findings (`Code-quality findings — m7-menu-bar-status-item`) — **DEFERRED** to a future `/feature-refactor` (by design, not cycle-resolved). M7 also carries the **OC.1–OC.4 DEFERRED-TO-RELEASE operator-carry checklist** (in `workflow/archive/m7-menu-bar-status-item.md`) — native glyph badge-transition + out-of-focus/cross-Space + installed-`.app` parity, to verify at the next `/release` gate. M7 was net-new tray work, so it resolved none of the standing carry-forward items: the **code-quality `/feature-refactor` batch** + forward-look SURFACEs (`SURFACE-2026-06-27-WP1-STATUS-LOG-KEEP-OR-DEMOTE` now unblocked post-v0.2.2; `SURFACE-2026-06-26-ABSORB-CLAUDE-TIME-INTO-CLAUDESK` → M9; `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` → M9; `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY` → M8, the now-current docs-viewer milestone; the various PANETABS/eslint/cosmetic carries) all remain **DEFERRED**, anchors intact. **Nothing escalated.** Next execution milestone: **M8 (workflow-docs markdown viewer)**.

> **v0.2.2 release-gate verification PASS — 2026-06-28 (`/release`).** v0.2.2 cut + published (GitHub release `v0.2.2`, Homebrew tap `c532ba7`, sha256 `579f7d8…`), installed-build smoke-tested by the operator: **all DEFERRED-TO-RELEASE checks pass on the real installed `.app`.** This RESOLVES the M6 operator-carry checklist **OC.1–OC.6** (`workflow/archive/m6-wp8-milestone-exit-verification.md`) — WP1 telemetry survival, WP2 stuck-dot subdir-cwd flip→Idle, WP7 no-yolo next-spawn, WP11 `term_spawn` PATH parity + reap, WP9 blur-driven empty-PiP suppression, WP4/WP10 real-keyboard zoom routing — and the **/release-gate cluster**: `SURFACE-2026-06-27-M5-INSTALLED-BUILD-VERIFY-DEFERRED-TO-RELEASE` (RESOLVED — installed out-of-focus visibility confirmed), `SURFACE-2026-06-24-HOMEBREW-DISTRIBUTION-VIA-UNSIGNED-PERSONAL-TAP` (RESOLVED — tap install path verified), `SURFACE-2026-06-26-MCP-BRIDGE-RELEASE-ACL-STRINGS` (RESOLVED — release build launched + ran clean). Remaining pending = the standing code-quality `/feature-refactor` batch + forward-look SURFACEs anchored to M7+/M9 (incl. `SURFACE-2026-06-27-WP1-STATUS-LOG-KEEP-OR-DEMOTE` — now that WP2's fix is prod-confirmed, the keep-or-demote decision is unblocked). origin/main in sync at `028fa33`; tag `v0.2.2`.

> **M6 (Friend-requested QoL polish) cycle-close — backlog sweep 2026-06-28 (`/product-finalize`).** M6 complete — all 12 WPs shipped (WP1/1b/2/3/4/5/6/7/8/9/10/11; WBS archived to `docs/product/archive/milestone-6-friend-qol/`). Sweep disposition: M6's substantive resolutions were recorded incrementally at each WP's `feature-finalize` — `SURFACE-2026-06-25-STATUS-STUCK-RUNNING-AFTER-CLEAN-TURN-END` (the LEAD; RESOLVED at WP2, `bafee80`), `SURFACE-2026-06-26-FRIEND-QOL-BATCH-1` (RESOLVED — all 3 sub-requests via WP3/4/5), `SURFACE-2026-06-27-RIGHT-PANEL-TERMINAL-ZOOM-AND-MULTIPLE` (RESOLVED via WP10/WP11), `SURFACE-2026-06-26-FILETREE-EXCLUDES-GITIGNORED-EDITABLE-FILES` (RESOLVED via WP6), `SURFACE-2026-06-27-PIP-SUMMONS-EMPTY-WITH-NO-WORKSPACE-OPEN` (RESOLVED via WP9). This sweep additionally closed **`SURFACE-2026-06-26-M6-SETTING-NO-YOLO-DEFAULT`** (was still `pending`; shipped WP7 `4db7b82`). WP8 (milestone-exit verify) was verification-only and resolved nothing new but **carries one batch forward**: the **DEFERRED-TO-RELEASE operator-carry checklist OC.1–OC.6** (in `workflow/archive/m6-wp8-milestone-exit-verification.md`) — installed-`.app` + backend-lifecycle outcomes (stuck-dot subdir-cwd flip, no-yolo next-spawn, `term_spawn` PATH parity, blur-driven empty-PiP, real-keyboard zoom, telemetry survival) verified at the v0.2.2 `/release` gate. Still-pending otherwise (all **DEFERRED → carry forward**, anchors intact): (a) the standing **code-quality MINOR/MAJOR findings** batch (held for a future `/feature-refactor` — by design, not cycle-resolved; +2 from WP8's review, +others from M6 WPs); (b) forward-look SURFACEs — `SURFACE-2026-06-27-WP1-STATUS-LOG-KEEP-OR-DEMOTE` (→ keep through v0.2.2 then decide; it's the channel that self-confirms the WP2 fix in prod), `SURFACE-2026-06-26-ABSORB-CLAUDE-TIME-INTO-CLAUDESK` (→ M9), `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (→ M9), `SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP` (→ test-infra), `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY` (→ M7/M8 docs-viewer-adjacent), `SURFACE-2026-06-27-ESLINT-WALKS-GITIGNORED-SCRATCH-FIXTURE` (→ one-line eslint-ignore at next refactor), `SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED-AT-SESSION-START` (cosmetic carry-forward), and the **/release-gate cluster** (`SURFACE-2026-06-27-M5-INSTALLED-BUILD-VERIFY-DEFERRED-TO-RELEASE` **high**, `SURFACE-2026-06-24-HOMEBREW-DISTRIBUTION-VIA-UNSIGNED-PERSONAL-TAP`, `SURFACE-2026-06-26-MCP-BRIDGE-RELEASE-ACL-STRINGS`) — all resolve when v0.2.2 is cut + verified before the Homebrew bump. **Nothing escalated.** Each item keeps its own `Status:` detail; this note records the en-masse disposition. Next execution milestone: **M7 (menu-bar status item)**.

> **M5 (Picture-in-picture) cycle-close — backlog sweep 2026-06-27 (`/product-finalize`).** M5 complete (WP1–WP6 all shipped; WBS archived to `docs/product/archive/milestone-5-picture-in-picture/`). Sweep disposition: M5's per-WP resolutions were recorded incrementally at each WP's `feature-finalize` (`SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI` RESOLVED at WP2; WP3-quality items at their finalizes), so this sweep found **no newly-resolvable items**. WP6 was verification-only and resolved nothing new but **surfaced one carry-forward**: `SURFACE-2026-06-27-M5-INSTALLED-BUILD-VERIFY-DEFERRED-TO-RELEASE` (**high**, pending) — the M5 exit criterion (installed-`.app` out-of-focus visibility) + native menu glyph + ⌘Tab-away auto-summon + dev/prod isolation + tauri#5566 caveat are operator-deferred to the `/release` gate; resolves when the release is verified before the Homebrew bump. Still-pending otherwise: (a) the standing **code-quality MINOR/MAJOR findings** batch (held for a future `/feature-refactor` — by design, not cycle-resolved); (b) forward-look SURFACEs with intact anchors — `SURFACE-2026-06-26-FRIEND-QOL-BATCH-1` + `SURFACE-2026-06-25-STATUS-STUCK-RUNNING-AFTER-CLEAN-TURN-END` (→ **M6**, the latter is M6's LEAD item), `SURFACE-2026-06-26-ABSORB-CLAUDE-TIME-INTO-CLAUDESK` (→ M8), `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (→ M9), `SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP` (→ test-infra), `SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED-AT-SESSION-START` (DEFERRED — the M5 PiP-fold-in opportunity passed without a fix; the shared `serializeAsHTML()` occlusion remains a cosmetic carry-forward), editor-polish + workflow-doc-watcher items unchanged. **Nothing escalated.** Each item keeps its own `Status:` detail; this note records the en-masse disposition.

> **QoL/lifecycle sweep finalize — backlog sweep 2026-06-25 (`/product-finalize`, operator-requested between-milestone run).** The QoL scratch sweep (WP0–WP8, not a roadmap milestone) is complete; `qol-wbs.md` retired. Sweep disposition: **all of this cycle's resolutions were already recorded incrementally at each WP's own `feature-finalize`** — every `SURFACE-2026-06-24-*` item is RESOLVED (WP1–WP7) and `SURFACE-2026-06-20-WP4-DIFF-VIEWER-POLISH-FOLLOWUPS` was closed at WP8 finalize — so this sweep found **no newly-resolvable items**. The ~37 still-`pending` entries are: (a) ~32 **code-quality MINOR/MAJOR findings** held for a future `/feature-refactor` batch (standing by design — not cycle-resolved), and (b) the substantive forward-look SURFACEs, all **DEFERRED → carry forward** with existing anchors intact: `SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI` (→ M5 planning), `SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP` (→ test-infra investment), `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (→ M9 startup-trim), `SURFACE-2026-06-20-WP3C-SHARED-DOC-CURSOR-RESET` + independent-pane (→ later editor-polish), `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY` (→ M6). `SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE` was already RESOLVED 2026-06-21. **Nothing escalated; nothing blocks M5 (PiP).** Each item keeps its own `Status:` detail; this note records the en-masse disposition. Next `/product-wbs` should re-triage the forward-look SURFACEs against M5's scope.

## Code-quality findings — m9-wp6b-2-week-month-sidepanel-range (Phase 4) (2026-07-14)
- **Pointer:** 0 CRITICAL / 0 MAJOR / 2 MINOR findings from `feature-review-quality` on the WP6b-2 Phase-4 working-tree change (SidePanel + click-to-select seam; uncommitted per commit-only-when-asked; the M9 tree local carry), Mode-3 autopilot auto-backlogged. Both MINOR (low): (1) the `dashboardWiring` "clears selection 3 ways" pin uses a bare whole-file `setSelectedSegId(null)` substring, so a regression dropping the clear from ONE of `changeView`/`changeDay` would still pass — tighten by asserting within each handler's slice; (2) `SidePanel.wallTime` uses minute-quantized endpoints (positioning basis) while `sumActive` is true-`dur_ms` — faithful + intentional (positions must stay on the minute grid to align with the main timeline), recorded only so a future reader doesn't "fix" the mini-timeline to `dur_ms` and break the wall-relative layout (likely won't-fix). Reviewer: clean, well-disciplined render-surface port — small new code, pure logic cleanly extracted into `sidePanelMath.ts` + 14 unit pins, `?raw` wiring pins per the no-render-infra posture, every source deviation deliberate + documented, correctly inherits the `dur_ms` duration-summation contract. No refactor warranted. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m9-wp6b-2-week-month-sidepanel-range (Phase 4) — 2026-07-14`.
- **Priority:** low (both MINOR)
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** rides along the standing WP-refactor batch — finding (1) is a one-test tightening; finding (2) is doc/awareness (likely no-op). Dismiss either via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m9-wp4-segment-model-query-layer (2026-07-08)
- **Pointer:** **2 MINOR remaining** (0 CRITICAL / 0 MAJOR; the dup tz-math helpers MINOR RESOLVED by backlog-paydown sweep WP3, and the `ai_busy_intervals`-computed-twice MINOR RESOLVED) from `feature-review-quality` on ship commit `d8b308e`. The 2 open findings: (1) **`WP4-DAYPAYLOAD-EMPTY-NOT-ON-IPC-SURFACE`** — `DayPayload.empty` never reaches WP6 (RangePayload/FE have no `empty`); a WP6-facing decision (surface it or document inference from `projects.is_empty()`); (2) **`WP4-CUSTOM-WINDOW-MIDNIGHT-EXTRA-DAY`** — a custom window ending on midnight emits one extra empty trailing day (cosmetic boundary edge). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m9-wp4-segment-model-query-layer — 2026-07-08`.
- **Priority:** low (both remaining)
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** (1) is a WP6-facing contract decision best made when the docs-viewer/day-view work is touched; (2) rides along or defers. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — mirror-fill-from-bottom (2026-07-06)
- **Pointer:** 1 MINOR remaining (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `99aca94`. The remaining MINOR — **`MIRRORTRIM-FIXTURE-REALISM`**: test fixtures use the simple unstyled `<div><span>text</span></div>` row shape while real styled CC output produces intra-row multi-span rows the regex must survive (correct, but fixtures under-represent it). Reviewer: well-built, tightly-scoped single-seam fix; correctness verified against the vendored xterm source. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# mirror-fill-from-bottom — 2026-07-06`.
- **Priority:** low (1 MINOR)
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** add one styled-multi-span test fixture — rides any future `mirrorTrim.ts` touch. Dismiss via the WIP's `## Code-Quality Review` section.

## Code-quality findings — cc-permission-mode-dropdown (2026-07-02)
- **Pointer:** 1 MINOR remaining (originally 3 MINOR / 0 CRITICAL / 0 MAJOR; the `<select>`-a11y-name MINOR and the bare-enum-doc-comments MINOR both RESOLVED) from `feature-review-quality` on ship commit `1624e2e`. The remaining MINOR — **`CCMODE-DEFAULT-ARGV-NOOP-UNTESTED`**: `Default` now emits an explicit `--permission-mode default`, the "harmless no-op" claim untested behaviorally (doc-hardening; live spawn verify-human-passed). Reviewer: well-built, wire contract + legacy-cc_yolo migration are the standouts. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# cc-permission-mode-dropdown — 2026-07-02`.
- **Priority:** low (1 MINOR)
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** a behavioral test (or doc-hardening) for the `--permission-mode default` no-op — rides any future spawn-path touch. Dismiss via the WIP's `## Code-Quality Review` section.

## Code-quality findings — qol-wp1-close-workspace (2026-06-25)
- **Pointer:** 1 MINOR remaining (originally 3 MINOR / 0 CRITICAL / 0 MAJOR; the filmstrip-× over-narrating comment MINOR and the forward-referencing `docsRef` comment MINOR both RESOLVED) from `feature-review-quality` on ship commit `c01a3f9`. The remaining MINOR — **`WP1-APP-WIRING-UNTESTED`**: the App-level close wiring (`requestClose`/`resolveClose`/dirty-probe registry) + the × routing are untested by automation (accepted per the manual-host-UI convention + live 9/9 verification). Reviewer: well-built, idiomatic, closes a latent WP7 lifecycle gap. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# qol-wp1-close-workspace — 2026-06-25`.
- **Priority:** low (1 MINOR)
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*
- **Pickup shape:** a test-harness gap that only matters once the project adopts RTL/E2E (deferred per Phase-1 convention). Dismiss via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY
- **What:** M3 WP5 (specced as a `workflow/.session.md` file-watcher → broadcaster) is **DROPPED**. The WBS framed `.session.md` as a real-time second workflow-state signal — but it isn't: `.session.md` is a *manual handoff bookmark* created **only** by `/session-pause` and deleted by `/session-resume` (verified against `~/.claude/skills/session-pause` + `session-resume` SKILL.md). It is absent during all active work, present only in the parked gap between sessions, binary, and known to the user before any watcher could report it. Watching it yields a near-constant, trivially-derivable signal — no live workflow state to detect.
- **Consequence for M3:** M3's goal (CC idle/running/awaiting from the official hook channel, never PTY scraping) is **fully met by WP1–WP4 + WP6**. With WP5 dropped, **Milestone 3 is COMPLETE** → `/product-finalize`.
- **New WP idea (operator-defined 2026-06-22, deferred to a later milestone — NOT M3):** instead of `.session.md`, watch the **workflow document hierarchy** to surface where a project actually is in the workflow: `roadmap.md → wbs.md → workflow/wip/*.md` (possibly multiple WIP files — tasks can fork mid-feature) → `backlog.md`. This is the genuine live workflow state (the WIP Work Tree / Current Node mutates continuously as skills run; roadmap/wbs give the milestone context). Reuses the `notify` watcher seam that `SURFACE-2026-06-21-EDITOR-FILE-WATCHER` also wants.
- **Hard part (acknowledged, NOT a blocker):** visually representing the whole tree (roadmap→wbs→wip(s)→backlog) in the UI is the design challenge. **Good-to-have, not must-have.**
- **Anchored to Milestone 6 (menu-bar status item)** (operator decision 2026-06-22): the M6 popover is a one-row-per-workspace LIST (project name + status), which fits a workflow-position line (e.g. `acme-api · WBS M2/WP3 · building`) far better than a thumbnail tile — and by M6 the operator will have dogfooded M4+M5 and will know what workflow-position info is worth surfacing (resolves the "unsolved visualization" risk by deferring the design until there's real usage signal). NOT folded into M4/M5 (those are pure CC-state status-surface rendering; adding a workflow axis + tree viz mid-build is the wrong place). If it outgrows a popover line into a real tree view, promote to a standalone feature after M6. The `notify` watcher seam (shared with `SURFACE-2026-06-21-EDITOR-FILE-WATCHER`) gets built whenever the first consumer needs it — likely M6.
- **Priority:** medium (the new WP idea); the drop itself is a clean WBS correction, no work owed.
- **RE-ANCHORED M7 → M8 (2026-06-29), reinforced by the M7 shrink.** Initially (at the M7 `/product-wbs`) this was re-anchored to M8 over M7 because the workflow-position line is value-unproven and drags in tree-visualization surface. **Then the M7 spec debate SHRUNK the menu-bar item to an ambient alarm + actuator and CUT the popover entirely** (design-prior [[new-surface-must-earn-its-place-against-existing-ones]] — a popover list was a PiP subset). So the watcher's intended form factor (a workflow-position line *in the popover*) no longer exists in M7 at all — its home is firmly **M8 (workflow-docs markdown viewer)**, the rendering counterpart ("where does each project sit" as a status line is adjacent to "render the docs themselves"; the `notify` watcher seam — shared with `SURFACE-2026-06-21-EDITOR-FILE-WATCHER` — can be built there). Decide at M8's JIT decomposition whether it feeds the M8 doc panel, promotes to a standalone tree view, or is dropped.
- **RENUMBERED M8 → M10 (2026-06-29b), no semantic change.** The watcher's home is still the **workflow-docs markdown viewer** — that milestone was renumbered M8 → **M10** by the 2026-06-29b roadmap reorder (a new demo-assets milestone took M8; time-analytics ↔ docs-viewer swapped). Same milestone, same decision; only the number moved. Decide at the docs-viewer's JIT decomposition whether it feeds that doc panel, promotes to a standalone tree view, or is dropped.
- **DECIDED at the M11 (docs-viewer) JIT decomposition — NOT folded into M11 (2026-07-20).** The milestone is now **M11** (further renumbered by the 2026-07-06 auto-updater + 2026-07-16 M10.5 inserts). At M11's `/product-wbs`, the watcher idea was **held out of M11**: M11 is the **single-workspace, read-SIDE** renderer — it renders *the focused project's* docs (`vision→roadmap→wbs→wip→backlog→.session.md`) as formatted markdown in the right panel. The doc-**hierarchy watcher** here is a distinct, **cross-project** capability — surfacing *where each project sits* across the open set (a status-line/tree axis over many workspaces), which overlaps the filmstrip/PiP/menu-bar status-surface family, not the per-workspace render. That is its own future feature (a standalone cross-project workflow-position view), to be triaged at a later roadmap boundary — it does not belong inside M11's per-workspace viewer. The shared `notify` watcher seam it wanted **already exists** (QoL-WP0 `fs_watch`), so no infra is owed; M11 reuses that seam for its own live-reload.
- **Status:** WP5 dropped (recorded in M3 wbs.md, archived); the cross-project workflow-position **watcher/tree** idea remains **deferred → NOT in M11** (decided 2026-07-20 at M11 JIT decomposition; see line above). Re-triage as a standalone cross-project view at a future roadmap boundary. (Anchor history: M6 → M7 → M8 → M10 → M11; M7's popover form-factor was cut at the 2026-06-29 spec-debate shrink.)

> **Scaffold-debt refactor pass — DONE 2026-06-17.** The 4 code-quality finding blocks below (6 MAJOR + 15 MINOR across wp1/wp2/wp3/wp4) were cleared via `/feature-refactor` before WP5. 20 findings fixed, 1 dismissed with rationale (WP2 `ReaderSink` enum — see that WIP's Code-Quality Review). Detail file: [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md).

> **Phase 1 cycle-close backlog sweep — 2026-06-19 (`/product-finalize`).** Phase 1 (Bare Shell + Tab Substrate PoC) closed; all 9 WPs shipped. Sweep disposition of the items still pending at close: **all DEFERRED → carry to the Phase 2 cycle** (none escalated, none newly resolved by the close itself). Carried forward: wp5/wp6/wp7/wp8/wp9 code-quality findings (the **wp6 picker IPC error-surfacing MAJORs are the most load-bearing** — they pair with Phase 2's multi-workspace picker work, WP13/WP16) + `SURFACE-2026-06-18-MEMORY-MD-PRETTIER-NITS` (housekeeping). These remain in this file (not archived) so the next cycle inherits them.

> **Milestone 2 cycle-close backlog sweep — 2026-06-22 (`/product-finalize`).** M2 (Lite Editor + Diff Viewer) closed; all WPs shipped + the terminal blank-cursor P1 incident resolved. Sweep disposition: the WP11 git-status **MAJOR** was RESOLVED during the cycle (task `m2-wp11-git-status-path-keying`); **all remaining pending items DEFERRED → carry to the next cycle** (operator decision — none escalated, none else newly resolved by the close). The deferred set is ~20 items, almost entirely cosmetic code-quality MINORs (wp5/6/7/8/9 + m2-wp2/3a/3c/4/4-polish/5/6/9/11/13 findings) plus forward-look SURFACEs that pair with future milestones: `SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE` (→ multi-workspace milestone), `SURFACE-2026-06-21-EDITOR-FILE-WATCHER`, `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`, `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD`, `SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE`, `SURFACE-2026-06-20-WP10-ARROW-KEY-TREE-NAV`, `SURFACE-2026-06-20-WP3C-SHARED-DOC-CURSOR-RESET`, `SURFACE-2026-06-20-WP4-COMMIT-LOG-SCOPE-EXPANSION` (an arch-resync follow-up — largely reconciled in arch.md at this close), `SURFACE-2026-06-20-WP4-DIFF-VIEWER-POLISH-FOLLOWUPS`, `SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP`. Each item keeps its own `Status:` detail; this note records the en-masse deferral. **NOTE — roadmap rearrange pending:** the operator is reshaping the post-M2 roadmap right after this close, so the next `/product-wbs` should re-triage these against the revised milestone order (esp. the forward-look SURFACEs, whose target milestones may move).

## SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE
- **Source:** feature:build (WP7 Phase 3 relevance gate — operator decision 2026-06-21)
- **Target level:** product:wbs (a WP7 follow-on, or a small standalone feature)
- **Type:** new-work
- **Summary:** WP7 Phase 3 shipped project-wide **Replace All** ONLY (an overlay Replace field + a confirmed replace-all-across-project). Per-result single-match replace and per-file replace — the other two scopes in the WP7 spec's "full depth" replace — were DEFERRED because the Phase-2 UX redirect moved results into a **read-only** "Find Results" synthetic tab that can't cleanly host per-row / per-file replace affordances.
- **Context:** the WP7 spec chose full replace depth (per-result + per-file + replace-all). The read-only-tab result surface (operator's chosen Sublime model) removed the writable result rows those two scopes attached to. Replace All covers the headline "rename a string across the project" use case; the finer scopes are a refinement.
- **Suggested action:** add per-result + per-file replace when there's a writable result surface — e.g. clickable per-file "replace in this file" markers rendered into the Find Results tab (via the synthetic click-line callback, the same seam clicks already use), or a richer results panel. Backend `project_replace` already does per-file rewrite; a scope param + a file-filter would extend it.
- **Priority:** medium
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*

## SURFACE-2026-06-20-WP3C-SHARED-DOC-CURSOR-RESET
- **Source:** feature:build (WP3c Phase 1)
- **Target level:** product:wbs
- **Type:** tech-debt
- **Summary:** Split-pane editor uses shared-document with N independent `<CodeMirror>` (`@uiw`) instances bound to one `value`/`onChange`. Typing in one pane fires `setDoc` → all panes re-render with the new `value`, which can reset the OTHER pane's cursor/selection on each keystroke.
- **Context:** Acceptable for v1 — panes are viewports (the high-value gesture is *viewing* two regions of a long file; edits typically happen in one pane). A true fix is a single shared CM6 `EditorState` across views (dropping the `@uiw/react-codemirror` wrapper for raw `EditorView`s), which is a larger refactor that would also touch WP2/3a/3b wiring.
- **Suggested action:** Observe at WP3c verify-self/verify-human and during WP9 dogfooding. If the cursor-reset is annoying in practice, schedule a raw-`EditorView` shared-state refactor (post-M2, or fold into a later editor-polish WP). Otherwise dismiss.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*

## SURFACE-2026-06-26-MCP-BRIDGE-RELEASE-ACL-STRINGS
- **Source:** feature:build (M5 WP2 probe, P2.3 release-exclusion check)
- **Target level:** product:wbs
- **Type:** tech-debt
- **Summary:** The dev-only `tauri-plugin-mcp-bridge` is correctly compiled OUT of release *code* (`#[cfg(debug_assertions)]` — `nm` finds zero bridge command-handler symbols; bridge port `9223` literal absent), BUT its **permission-manifest name strings** (`mcp-bridge`, `allow-execute-js`, `list_windows`, `ipc_monitor`, …) are still embedded inert in the release binary's ACL blob (`gen/schemas/acl-manifests.json`), because the crate is a plain `[dependencies]` entry and Tauri's build-time permission codegen emits its manifest regardless of the runtime `cfg` gate.
- **Context:** NOT a security or bundle-size concern — these are a few hundred bytes of permission-vocabulary strings, NOT code, and NOT a granted capability (the `mcp-bridge:default` permission is never referenced by any compiled-in capability; `mcp-bridge-dev` lives only in `tauri.dev.json`, which release builds don't load — `strings | grep mcp-bridge-dev` on the release binary = empty). So nothing can invoke the bridge in release. The ADOPT verdict's "release-safe" claim holds. This is a fidelity footnote: a *fully* clean release ACL would also exclude the dep from the manifest.
- **Suggested action:** Optional. If a fully-clean release ACL is wanted, move `tauri-plugin-mcp-bridge` from `[dependencies]` to a dev-only dependency surface that the build-time permission codegen also skips (e.g. a `[target.'cfg(debug_assertions)'.dependencies]` entry or a feature-gated optional dep), and re-confirm `pnpm tauri:dev` still gets the bridge. Verify with `strings target/release/claudesk | grep -i mcp-bridge` → empty. Low value; the current state is functionally release-safe.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*

## Code-quality findings — file-op-error-surface (2026-06-30)
- **Pointer:** 1 DEFERRED finding (net-new UX) in [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# file-op-error-surface`. The 3 silent file-op-failure findings (delete/trash/create-collision) collapsed into one anchored Defer — needs a toast/inline-error surface in RightPanelHost that doesn't exist yet (net-new UX, not debt).

## Code-quality findings — supervisor-hotfix (2026-09-17)
- **Pointer:** **6 remaining** findings (2 MAJOR / 4 MINOR) in [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) → `# supervisor-hotfix — 2026-09-17`. ⚠️ **One MAJOR was RESOLVED 2026-09-18 at M14 WP4** — the stale "8 subjects" OFF-invariant arm count (corrected to 9 at five live sites, citations moved to the symbol); it is deleted from the findings file and recorded in `CHANGELOG.md`. The two remaining MAJOR: the **toggle is read on reveal only while the supervisor fires in unfocused workspaces** (a design call, not a reflex fix — D-4's no-broadcast is settled and the default degrades safely to ON); and **`UnsentInputWatermark.clear()` has no production caller** while its doc comment describes one.
- **Priority:** medium (3) / low (4)
- **Status:** pending
- **Pickup shape:** the arm-count finding is a **documentation correction** and the cheapest real win — ⚠️ grep the retracted claim repo-wide rather than trusting the two named sites (`doc-correction-scope-list-is-a-floor`). The reveal-only finding wants an operator decision between accept-and-document / re-read-on-turn-end / reverse D-4. The rest are `/feature-refactor` material.

## SURFACE-2026-09-17-STALE-WORKFLOW-PATHS-SURVIVE-THE-LAYOUT-MIGRATION
- **Target level:** task
- **Type:** tech-debt
- **Summary:** ⚠️ **PARTIALLY RESOLVED at the M14-remainder cycle close (2026-09-18) — REWRITTEN to the remaining open work.** The originally-named scope is **clean**: `backlog.md` (was 15 occurrences), `vision.md`, and `roadmap.md` all now measure **0** live `workflow/state|product/` references. **Still open: 5 files under `.claude/memory/`** (`widened-selector-must-be-strict-superset`, `feedback_surfaced_in_discoveries_not_worktree`, `m7-docs-viewer-intent` ×2, `observable-outcomes-execution-evidence`) carrying `workflow/archive`, `workflow/backlog`, `workflow/wip`.
- **Context:** The self-propagating half of the original finding is closed — new pointer entries are now copied from a canonical shape that uses `workflow-system/`, so the stale path no longer reproduces itself each feature close. What remains is inert: memory files are read by a future session as guidance, so a stale path there misdirects a reader but propagates nowhere. ⚠️ **CHANGELOG hits are CORRECT and must NOT be "fixed"** — they are historical narrative recording what the paths were at the time, the same rule that keeps `**/archive/**` untouched.
- **Suggested action:** Fix the 5 `.claude/memory/` files on the next touch of any of them; not worth a standalone commit. ⚠️ Separate string-matches from claim-assertions first — a path inside a quoted historical note is correct as-is.
- **Priority:** low
- **Status:** pending (remaining scope only)

## Buried
*Items moved out of active — low-impact + not worth carrying forward as active work. Not resolved (no CHANGELOG entry); revive only if the anchoring condition fires.*
- **SURFACE-2026-06-24-QUALITY-APPMENU-LISTENER-NOT-EXTRACTED** (buried 2026-07-20, backlog-paydown sweep §Completion) — the `src/App.tsx` `menu` listener isn't extracted to a pure testable `dispatchMenuAction(action, effects)` seam. LOW-impact + med-effort + low-risk; explicitly "defer unless the listener grows"; consistent with the repo's "runtime-bound listeners aren't unit-tested" posture (the higher-value `menuBridge` mapping IS fully tested). **Revive only if** the App.tsx menu listener grows new branches. (Was: `# app-menu-bar` finding, now removed from `backlog-quality-findings.md`.)


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
- **Status:** pending

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
- **Status:** pending

## SURFACE-2026-09-17-SETTINGS-PANEL-READS-THE-GATE-VIA-ITS-OWN-CONTROL-NOT-THE-HOOK
- **Source:** feature:build (M14 WP3 Phase 2, P2.3)
- **Target level:** product:arch
- **Type:** tech-debt
- **Summary:** The hotkey group in `SettingsPanel.tsx` reads the workflow-features gate from
  `workflowFeatures.value` (the panel's own `useSettingControl`) rather than from
  `useWorkflowFeaturesEnabled()`, which is the established seam every other gate consumer uses
  (`announceRow.ts`, `ProjectModelCell.tsx`, `App.tsx`).
- **Context:** The deviation is deliberate and, in this component, correct: `SettingsPanel` is the
  surface that OWNS the gate toggle, so the control is the live value and the hook would lag the
  checkbox sitting a few rows above the list. But it means there is now one gate consumer that does
  not go through the common seam. ⚠️ A previous MAJOR in this same area went the other way — `App.tsx`
  read the raw `getWorkflowFeaturesEnabled()` wrapper, never re-synced, and left the value stale for
  the process lifetime (fixed at m10.9-wp3 review, and the OFF-invariant guard's blind spot closed
  with it). The risk here is that a future reader sees two patterns and copies the wrong one into a
  component that has NO local control.
- **Suggested action:** Decide whether the seam contract should say "use the hook UNLESS the component
  owns the control" explicitly (a one-paragraph note in `arch/` + the OFF-invariant guard's comment),
  or whether `useSettingControl` should expose the gate in a way both callers share. ⚠️ Do NOT
  "fix" this by switching the panel to the hook — that reintroduces the lag this avoided.
- **Priority:** low
- **Status:** pending

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
- **Status:** pending

## Code-quality findings — hotkey-reference (2026-09-17)
- **Pointer:** **3 MAJOR + 3 MINOR** (0 CRITICAL) from `feature-review-quality` against ship baseline `5e3ecd9`. ⚠️ **All three MAJORs were independently VERIFIED against source before backlogging** (not taken on the reviewer's assertion), and all three are the same shape: *the WP's own anti-drift discipline, not applied one layer up at the render/guard boundary.* (1) **`TEST-SELECTOR-PINNED-TO-AN-UNSTYLED-CLASS`** — `.settings-hotkey-outcome` (singular) carries the multi-outcome assertion but only the PLURAL has a CSS rule, so an ordinary "remove unused classes" cleanup silently kills the ⌘W canary. (2) **`CM6-GUARD-BLIND-TO-SPREAD-KEYMAPS`** — the CM6 arm's regex reads literal `key:` entries only, so `⌘F` (via `...searchKeymap`) has **ZERO coverage in either direction**, and it is the one entry the group's hint text names as the reason the EDITOR section exists. (3) **`HOST-SECTIONS-PARALLEL-TO-THE-UNION`** — `HOST_SECTIONS` has no exhaustiveness tie to `ChordHost`, and the render test iterates the same hardcoded array so it **shares the blind spot**. The 3 MINOR: `chordLabel()` has no non-test consumer; `visibleChords` recomputed 3x per render; the same rationale stated verbatim in three places. Reviewer verdict: *"the three MAJORs are cheap to close and are better backlog items than refactor scope."* See [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) → `# hotkey-reference — 2026-09-17`.
- **Priority:** medium (3 MAJOR) / low (3 MINOR)
- **Status:** pending
- **Pickup shape:** a single `/feature-refactor` pass closes all six cheaply — MAJOR-2 and MAJOR-3 are each ~1–5 lines of test, MAJOR-1 is a CSS rule or a comment. ⚠️ MAJOR-2's fix must **resolve the spread** (import `searchKeymap` and enumerate its keys); widening the regex to match `...searchKeymap` textually would prove the spread is present, not which bindings it contributes — a guard that looks fixed and is not.


## Code-quality findings — m14-wp2-sign-notarize-delete-quarantine (2026-09-18)
- **Pointer:** **1 MINOR** remaining (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship
  commit `3e50eb7`. A reverse-only source guard (`updaterWiring.test.ts`'s "no longer wires the
  deleted quarantine dialog") has no positive anchor — safe where it sits, a vacuity risk if ever
  isolated. **A second MINOR was FIXED at review time rather than backlogged** (a backlog entry
  marked "RESOLVED in-phase" while still `Status: pending`; closed via delete-on-resolve with a
  `**Backlog resolved:**` CHANGELOG bullet in the same commit). See
  [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) →
  `# m14-wp2-sign-notarize-delete-quarantine — 2026-09-18`.
- **Priority:** low
- **Status:** pending
- **Pickup shape:** one-line addition — add a positive assertion beside the reverse guard. Rides any
  future touch of `src/updater/__tests__/updaterWiring.test.ts`. Dismiss via the WIP's
  `## Code-Quality Review` section.

## SURFACE-2026-09-18-DOC-COUNT-NEEDS-A-GENERATOR-NOT-A-DETECTOR
- **Source:** feature:verify-codify (M14 WP4 Phase 4)
- **Target level:** product:arch
- **Type:** new-work
- **Summary:** The OFF-invariant guard's shape (6 arms / 9 subjects) is restated as prose in ~8 live places with no mechanical link to the code, and it has drifted repeatedly. A **detector** guard was built and mutation-tested at M14 WP4 and **does not work** — it caught 1 of 4 mutants, missing both real-world defect shapes. The viable mechanism is a **generator**, not a detector.
- **Context:** ⚠️ **Measured, not speculated.** The detector needs to separate "this doc ASSERTS the count is N" from "this doc RECORDS that the count WAS N", and the docs deliberately contain both — often adjacent, because every correction leaves a retraction note beside the corrected claim (`source-text-guards.md` entry 14). Its exempt list needs a milestone-reference token to skip historical records; that token exempts **21 of 117** candidate lines (**17%**), including the line carrying a live stale claim. Narrowing it re-admits the historical records that must not be flagged. The discriminator is authorial intent, which a source-text predicate cannot express (`extract-for-import-when-a-raw-guard-cant-express-the-property`). The full mutation table and root-cause analysis are in the WP4 WIP's `## Codify Decision — Phase 4`.
- **Suggested action:** If this drifts again, invert the mechanism: make the count a **generated artifact** rather than something to detect. Options: (a) a single source-of-truth line emitted by a script that docs `include`, (b) an HTML-comment marker (`<!-- guard-count -->…<!-- /guard-count -->`) whose content a test REGENERATES from `armSubjects` and fails on diff — a generator's output is unambiguous where prose intent is not. ⚠️ **Do not re-attempt the detector shape** without reading why it failed first.
- **Priority:** low
- **Status:** pending

## Code-quality findings — m14-wp4-two-tier-setup-docs (2026-09-18)
- **Pointer:** 2 MINOR in [`workflow-system/state/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m14-wp4-two-tier-setup-docs — 2026-09-18`. Both concern the new `readmeTierOneHonesty.test.ts` guard: unanchored chord-label matching (the same file's slash-command test already anchors correctly), and the file living under `settings/__tests__/` while importing nothing from `settings/`. ⚠️ **The review's 2 MAJOR findings were FIXED at review time, not backlogged** — a `sectionWindow` that failed OPEN (reproduced: a `###` subsection naming the gated `⌘⇧K` passed 10/10) and two tests that were provably the same assertion; see the WIP's `## Code-Quality Review`.
- **Priority:** low (both)
- **Status:** pending
- **Pickup shape:** both ride the next touch of `readmeTierOneHonesty.test.ts` — neither justifies a standalone commit.
