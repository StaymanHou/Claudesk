---
workflow: feature
state: plan (complete)
drive_mode: autopilot
created: 2026-08-01
milestone: 11.5
wp: WP3
resolves: SURFACE-2026-07-20-TIME-TRACKING-OFFLINE-LOCAL-ONLY-MESSAGING
---

# Feature: Time-tracking states it is offline + local-only

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-08-01

## Problem Statement

Claudesk's time-analytics capture has **always** been local-only — a local SQLite `time_store`
with no network path anywhere in the module — but nothing in the UI ever told the user so. A
privacy-conscious user toggling `time_tracking_enabled` ON has no signal that the data never
leaves their machine. This is a trust/clarity gap, not a behavior change. WP3 closes it with
**copy only**: no change to `time_store`, the write gate, or the capture path.

The scope audit (below) found the gap is narrower and the hosts different than the WBS assumed:
the Analytics group hint **already says "Local"**, so the real defect is that the copy is
*incomplete and unspecific* (it never says "never leaves this Mac" / "no network"), not absent.

## Scope-audit findings

Four places where `wbs.md` WP3's task list does not match the code as it stands today. All four
make the WP smaller or better-targeted; none expand it.

**Finding 1 — the "per-setting help-line slot" is a per-GROUP hint, and it is already populated.**
`SettingsGroup` (`src/components/settings/SettingsPanel.tsx:118-143`) takes one `hint: string` per
group and renders it as a single `<p className="settings-group-hint">`. There is no per-*control*
help line. The Analytics group's hint (`SettingsPanel.tsx:529`) already reads:

> "Local time tracking for your Claude Code sessions. Off means zero storage and zero IO."

So task 3.1 is **editing existing copy in place**, not filling an empty slot. Consequence for the
plan: the risk is not "where does this go" but "don't lose what the incumbent line already earns"
— the `zero storage and zero IO` clause is a real ON-vs-OFF fact and must survive the rewrite.

**Finding 2 — task 3.4's named test does not exist.** `PRIVACY-TEST-COINCIDENTAL-SUBSTRING` appears
only in prose (`CHANGELOG.md`, `roadmap.md`, `wbs.md`, `backlog.md`); it matches nothing in
`src/` or `src-tauri/src/`. The actual privacy self-consistency tests are Rust:
`time_store::tests::row_never_carries_prompt_text` (`mod.rs:413`) and
`native_row_never_carries_content` (`mod.rs:703`). Both assert on **structured row fields** —
`native_row_never_carries_content` explicitly abandoned bare-substring checking (its comment names
that as "WP2 MINOR #1's weakness"). **Therefore UI copy cannot trip them**, and the WBS's stated
worry ("new copy is exactly what could trip it") does not apply to the tests that exist. The plan
still re-runs them (cheap, and it is the honest discharge of 3.4), but records the identifier as
stale rather than pretending to have verified a test by that name.

**Finding 3 — task 3.5's wiring discipline already exists in full.**
`src/components/settings/__tests__/settingsTimeTrackingWiring.test.ts` already pins all five
wiring facts (seed / event / persist / testid / errorLabel) in exactly the
`settingsPermissionModeWiring.test.ts` shape the WBS asks for. Adding a second wiring test would
be duplication. What is genuinely unguarded is the **copy** — so the new test asserts the copy
claim, which is what this WP actually changes.

**Finding 4 — the optional dashboard extension has a concrete host, and that host is currently
WRONG.** The tracking-OFF empty state (`GlobalDashboard.tsx:1054-1065`,
`data-testid="dashboard-empty-tracking-off"`) instructs the user to *"Turn on **Time tracking** in
the project picker"* — but M10.9 WP2 **deleted** the picker settings strip; the toggle now lives
only in the `⌘,` Settings panel. That is a stale instruction pointing at a surface that no longer
exists. Fixing it costs one string in the same file the optional copy would touch, so 3.3 is
included — it lands a correctness fix, not just an optional nicety.

**Truthfulness check (precondition for writing the copy at all).** `grep` for
`reqwest|http::|hyper|surf::|ureq` across `src-tauri/src/time_store/` returns **zero matches** —
there is no HTTP client in the module. The "offline / never leaves this Mac" claim is therefore
verifiable from the code, not merely inherited from the SURFACE's assertion. Phase 1 re-runs this
as a mechanical outcome so the claim is pinned rather than trusted.

## Copy decision — scope as well as locality

The WBS flagged one open call: the feature is local-only, but **capture is machine-GLOBAL** — any
tracking-ON Claudesk logs every CC session on the machine, including another Claudesk instance's
(memory `[[time-tracking-capture-is-machine-global]]`). The roadmap's candidate copy
*"Offline · stored locally on this Mac, visible only to you"* is **true** but says nothing about
breadth.

**Decision: convey BOTH locality and scope.** Rationale — the copy exists to close a *trust* gap,
and a reassurance line that is true-but-silent on breadth invites exactly the surprise it was
written to prevent (a user who reads "visible only to you" and then finds sessions from a project
they never opened in Claudesk). Stating scope costs a handful of words and makes the line
self-consistent with observable behavior. This also keeps the copy honest against
`[[time-tracking-capture-is-machine-global]]`, which the operator has already been surprised by
once. **Phrasing is settled at build time** (Phase 1, task P1.1); the constraint recorded here is
that it must carry three claims: **offline/no network · stored on this Mac · covers all CC
activity on this Mac**, while preserving the incumbent hint's ON-vs-OFF fact (Finding 1).

## Work Tree

- [x] Phase 1: Copy carries offline + local + scope, in both hosts  <!-- status: done — all impl +
      all 4 verification nodes [x] (parent-completion invariant satisfied) -->
  **Observable outcomes:**
  - CLI: `grep -rE 'reqwest|http::|hyper|surf::|ureq' src-tauri/src/time_store/` exits non-zero
    (no matches) — the offline claim is verifiable in the code the copy describes.
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0 (NOT `pnpm exec tsc` — that silently
    exits 0 regardless, per `[[pnpm-exec-shadows-local-binaries]]`).
  - CLI: `pnpm test` exits 0, and its output reports the new copy-guard test file
    (`settingsTimeTrackingCopy.test.ts`) with a non-zero passing count — a filter that matches
    nothing also exits 0, so the count is the observable.
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml time_store` exits 0 AND its summary
    line reports a non-zero count including `row_never_carries_prompt_text` and
    `native_row_never_carries_content` (Finding 2 — discharges 3.4 against the tests that
    actually exist).
  - CLI: `pnpm lint` and `pnpm format:check` exit 0 (proven-trustworthy exit-code gates per
    `[[pnpm-exec-shadows-local-binaries]]`; `format:check` is the one that re-drifted last
    session, so it is checked explicitly).
  - CLI: `grep -c 'in the project picker' src/components/workspace/dashboard/GlobalDashboard.tsx`
    reports 0 — the stale *rendered* pointer at the deleted picker strip is gone (Finding 4).
    **Corrected at build time (P1.2):** the first draft of this outcome grepped the bare
    phrase `project picker`, which still matches **1** — an explanatory code comment that
    deliberately names the removed surface to stop a future edit reinstating it. Greping the
    whole file conflates rendered copy with commentary about rendered copy; the property that
    matters is that no *user-facing* text routes the user to the picker. The narrower phrase
    `in the project picker` is the rendered phrasing and is the honest check.
  - Browser: with the dev app running, `⌘,` opens Settings; the Analytics group
    (`[data-testid="settings-group-analytics"]`) contains a `.settings-group-hint` whose
    text asserts offline/no-network, on-this-Mac storage, and machine-wide scope; no JS
    console errors.
  - Browser: the Analytics hint still carries its ON-vs-OFF fact (Finding 1) — the rewrite did
    not drop "zero storage / zero IO" in favor of only the privacy claim.
  - [x] P1.1 Rewrite the Analytics `SettingsGroup` hint (`SettingsPanel.tsx:529`) to carry the
        three claims from `## Copy decision` while preserving the incumbent ON-vs-OFF fact. Edit
        the existing string — do **not** add a new element or a per-control help line (Finding 1).
        <!-- status: done -->
  - [x] P1.2 Fix the tracking-OFF dashboard empty state (`GlobalDashboard.tsx:1060-1064`): retarget
        "in the project picker" → the `⌘,` Settings panel, and add the same local-only reassurance.
        One string, same trust claim, correct destination (Finding 4). <!-- status: done -->
  - [x] P1.3 **Copy-only guard rail — assert the negative.** Confirm the diff touches no
        data-flow: `git diff --stat` names only `SettingsPanel.tsx`, `GlobalDashboard.tsx`, and
        the new test; **zero** lines under `src-tauri/src/time_store/`, zero dependency-file
        changes. Per WBS 3.2, if the copy cannot be written truthfully without a code change that
        is a finding to SURFACE, not scope to absorb. <!-- status: done -->
  - [x] P1.4 Add `src/components/settings/__tests__/settingsTimeTrackingCopy.test.ts` — a **copy**
        guard, not a wiring guard (Finding 3: wiring is already fully pinned). Assert the hint
        makes each of the three claims, and that the dashboard empty state no longer says
        "project picker". Assert **single identifiers / short stable phrases**, never formatted
        multi-line fragments (the `?raw` lesson: guards that match reflowed text silently stop
        matching). <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 4 scoped checks, all pass (see Verify-auto log) -->
  - [x] verify-self  <!-- status: done — 8/8 outcomes PASS live via the MCP bridge, 0 BLOCKING, 0 COSMETIC -->
  - [x] verify-human  <!-- status: done — operator delegated the judgment calls back to the agent
        ("skip. you just verify by yourself as much as you can"); 3 of 4 settled against evidence,
        1 recorded as genuinely un-agent-verifiable. Item 1 FAILED on the agent's own read and was
        FIXED in place (compression), then re-verified live. -->
    - [x] P1.verify-human.1 Read the Analytics hint live — reassuring or legalese?
          <!-- status: FAILED-then-FIXED — see Verify-human log -->
    - [x] P1.verify-human.2 Is the machine-wide scope sentence wanted?
          <!-- status: KEPT — truthfulness verified in code; cut would make the copy misleading -->
    - [x] P1.verify-human.3 Does the new Settings pointer match how the toggle is reached?
          <!-- status: PASS — ⌘, from the dashboard opens Settings; control labelled "Time tracking" -->
    - [x] P1.verify-human.4 Below-the-fold placement noted
          <!-- status: ACKNOWLEDGED — not a defect, not in scope; recorded, not absorbed -->
  - [x] verify-codify  <!-- status: done — +7 cross-surface promise guard, both mutations proven;
        full suite 127 files / 1467 pass -->
  <!-- SURFACED (notices, not units of work — per [[feedback_surfaced_in_discoveries_not_worktree]]
       these are recorded in ## Discoveries + backlog.md, NOT as tree leaves, so they cannot
       violate the parent-completion invariant):
       1. PRIVACY-TEST identifier stale in four docs
       2. The two hook-stream drains filter differently, undocumented at both sites -->

## Current Node
- **Path:** Feature > ship
- **Active scope:** none — Phase 1 complete (single-phase feature; all phases done)
- **Blocked:** none
- **Unvisited:** none — single-phase feature. Remaining sequence within Phase 1:
  verify-auto → verify-self → verify-human → verify-codify.
- **Open discoveries:** 2 — the stale WBS test identifier (backlogged) and the
  machine-global capture claim now *verified in code* rather than inherited (see Build log).

## Build log — Phase 1 (2026-08-01)

**What shipped:** two strings and one test file. `SettingsPanel.tsx:529` (Analytics group hint)
and `GlobalDashboard.tsx:1060-1071` (tracking-OFF empty state), plus
`settingsTimeTrackingCopy.test.ts` (11 assertions).

**The machine-global claim was VERIFIED in code, not inherited from memory.** The plan's
`## Copy decision` leaned on memory `[[time-tracking-capture-is-machine-global]]`. Before writing
a privacy claim on that basis I traced the actual write path, and the two hook-stream consumers
turn out to behave **differently**:
- `status_broadcaster::resolve_cwd` (`mod.rs:240`) does ancestor/longest-prefix matching and
  **drops** an event whose `cwd` matches no open workspace (`mod.rs:34`).
- `time_store::commands::drain_loop` (`commands.rs:493-513`) reads the gate and calls
  `write_gated` on **every** event, with **no workspace filter at all**.

So the copy's "across this whole Mac, not just projects open in Claudesk" is a property of the
code as written, not a recollection. Worth recording because the *intuitive* assumption — that
both consumers of one stream filter the same way — is wrong, and a future reader checking only
`status_broadcaster` would conclude the copy overstates.

**One plan observable was written too coarsely and was corrected, not waived.** P1.2's check was
`grep -c 'project picker' … == 0`; it reports **1**, because the fix's own code comment names the
removed surface deliberately (to stop a future edit reinstating it). Greping a whole file
conflates rendered copy with commentary *about* rendered copy. The observable was narrowed to the
rendered phrasing `in the project picker` (now 0) — which is also exactly what the test asserts.
The bare-substring version would have been the weaker guard for the same reason
`native_row_never_carries_content` abandoned bare-substring checks.

**An unstyled `<kbd>` was drafted and reverted.** The first pass wrapped the chord as
`<kbd>⌘,</kbd>`. `grep` found **zero** `kbd` rules in `App.css` and **zero** other `<kbd>` uses in
`src/` — it would have rendered with browser-default serif/box styling inside a dark panel. That
is the same defect class as M10.9 WP3.5a's "eleven CSS classes referenced with zero defined",
caught before landing rather than at review. The codebase writes the chord as plain text
(`⌘,`) in nine places; the copy now matches that convention.

**The copy guard is mutation-proven, not merely present** (the M10.9 WP3.5a lesson). Two
mutations were applied and measured: dropping the machine-wide scope sentence, and reinstating
`in the project picker`. Result: **exactly 3 of 11 assertions failed** — the scope-disclosure
guard, the absence guard, and the destination guard — while the meta-guards stayed green, so the
failure is targeted rather than blanket. Both files were then restored and re-verified at 11/11.

**The `?raw` reflow hazard was exercised on purpose.** `format:check` initially failed on the new
test; Prettier rewrapped the testid assertion across lines. Re-running after `--write` still
passes 11/11, confirming the short-stable-phrase discipline holds under reflow — the exact failure
mode that silently disabled a guard twice during M10.9 WP2.

## Verify-codify log — Phase 1 (2026-08-01)

**Integration boundary: YES**, so per §2 the test set had to exercise the consuming surface — not
just the new strings. That requirement is what surfaced the one genuine coverage gap.

**Gap found (audited before writing, to avoid duplicating the build-time guard).** The build's
`settingsTimeTrackingCopy.test.ts` pins **what each surface says**. Nothing pinned that the
dashboard's instruction is still **TRUE**. That sentence — *"Turn on **Time tracking** in Settings
(⌘,)"* — hardcodes three facts owned by *other* modules: the chord (`settingsChord.ts`), the
control's existence, and its label (`SettingsPanel.tsx`). Audit confirmed the gap was real:
`grep` found **no** test tying the dashboard's advertised chord to `isSettingsChord`, and the
`"Time tracking"` label was asserted nowhere outside a comment.

**This is not a hypothetical gap — it is the exact defect this WP repaired.** The old copy said
"in the project picker" and survived long after M10.9 WP2 deleted that strip, precisely because no
test coupled the copy to the surface it named. Codifying the *promise* rather than the *wording* is
what stops the recurrence.

**Added `settingsTimeTrackingCopyPromise.test.ts` (+7).** Key design choice: assertion 1 executes
the real `isSettingsChord` **predicate** rather than grepping for a `"⌘,"` literal — a source-text
match would pass even if the chord had been rebound, so proving the two agree requires *running*
one of them.

**Both mutations proven to bite:**

| Mutation | Guard result |
|---|---|
| Rebind chord `⌘,` → `⌘;` (`settingsChord.ts:39`) | **2/7 fail** — the chord assertion *and* its meta-assertion |
| Rename the advertised label → "Session tracking" | **1/7 fail** |

**⚠️ Method lesson, learned the hard way twice in this step: verifying that a mutation LANDED is as
necessary as running the test.** The chord mutation was first reported as "7/7 passed — guard did
not bite," which read as a hole in the new guard. It was not: the first `perl` pattern had a
whitespace mismatch and changed nothing; the second hit the **doc comment on line 35** instead of
the code on line 39 (the comment quotes the predicate in backticks). Only after `sed -n '39p'`
confirmed the executable line had actually changed did the guard fail correctly. **A mutation test
that does not verify the mutation is a vacuous mutation test** — the same failure class as the
vacuous guards this project keeps re-encountering, one level up. Every mutation table above was
re-run with a landed-mutation check.

**One test-triage event (recorded in full below).** A first-pass assertion
`not.toContain("in the picker")` failed — on a **code comment** at `GlobalDashboard.tsx:503`
describing M9 live-sync, not on user-facing copy. Classified *obsolete test / high confidence*,
narrowed to the rendered phrasing, **no production code changed**.

**Final gates:** `tsc` 0 · `eslint` 0 · `format:check` green · **full suite 127 files / 1467 pass,
0 fail** (from 121/1400 at milestone baseline; +18 this WP) · **`src-tauri/` files changed: 0**,
so the copy-only claim holds structurally.

## Test Triage — "the dashboard does not advertise a route to a surface that no longer exists"

**Classification:** Obsolete test — the new assertion was written wrong; the production code it
guards is correct.
**Confidence:** high — exactly one plausible explanation, stated without hedging: the assertion
`expect(globalDashboard).not.toContain("in the picker")` is over-broad and matched a **code
comment** at `GlobalDashboard.tsx:503` (*"so flipping the WP5 checkbox in the picker flips this
view live"*) that describes the M9 live-sync mechanism. It is not user-facing copy and does not
route anyone anywhere.
**Evidence:** `grep -n "in the picker" GlobalDashboard.tsx` → single hit, line 503, inside a `//`
comment about `TIME_TRACKING_ENABLED_EVENT` sync. The sibling assertion on the real defect string
(`"in the project picker"`) passes.
**Action:** Narrowed the assertion to the rendered phrasing only, dropping the over-broad
`"in the picker"` variant. **No production code changed.**

**Why this is worth recording rather than quietly fixing:** it is the *same* over-broad-matcher
error the project has already paid for once — the OFF-invariant guard's word-boundary matching
exists because `docs` fired on `docstring`. A copy guard that greps whole source files will keep
meeting comments that legitimately discuss the removed surface (indeed, WP3 *added* such a comment
on purpose, to stop the defect recurring). The lesson generalizes: **when guarding against stale
user-facing copy, match the rendered phrasing, not a keyword** — otherwise the guard fights the
very comments written to prevent the bug.

## Verify-human log — Phase 1 (2026-08-01)

**Operator delegated the checklist back to the agent** — *"skip. you just verify by yourself as
much as you can."* So this is an agent-resolved verify-human, not an approval. Three of the four
items were settleable against evidence; the fourth is recorded as genuinely un-agent-verifiable
rather than quietly marked pass.

**P1.verify-human.1 — FAILED on the agent's own read, then FIXED in place.** The check was
"reassuring or legalese?", and a measurement settled it: the hint was **322 chars against sibling
hints of 107 / 84 / 42** — 3× the longest, 7.7× the shortest, in a panel whose other three hints
are one crisp sentence each. Worse, decomposing the claims showed it asserted *"no network"*
**three separate ways** ("Fully offline" + "nothing is uploaded" + "there is no network path").
That tripling *is* the legalese effect — over-insistence reads as defensiveness — and the code's
own design intent calls this a "help **line**", singular.
**Fix: compression, not deletion of claims.** Cut the third phrasing and "for your eyes only"
(implied by offline + local). Now **270 chars / 3 wrapped lines** (was 4), still the longest hint
but carrying four *distinct* facts with zero restatement — justified, since it is the only setting
making a privacy claim. Re-verified live: all claims present, redundancy gone, no overflow, 0 JS
errors. **This is the item that vindicates the human gate existing at all** — every automated
check passed on the verbose version, because "the strings are present" and "the copy reads well"
are different properties.

**P1.verify-human.2 — KEPT (the scope sentence).** This was the agent's own call from plan time,
so cutting it needed a reason, not a preference. The claim is **true and verified in code**
(`time_store::drain_loop` writes every hook event with no workspace filter, unlike
`status_broadcaster` which drops unmatched `cwd`), and dropping it would leave *"stored on this
Mac, nothing uploaded"* while a user reasonably infers Claudesk-only scope — i.e. the cut makes
the copy **misleading by omission**, which is the exact trust gap the WP exists to close. Kept,
reworded "this whole Mac" → "the whole Mac" during compression.

**P1.verify-human.3 — PASS.** `⌘,` dispatched **from the dashboard** opens Settings, and the
control is labelled exactly `Time tracking` as the copy says. Re-verified after the compression
edits. The old copy would have failed this — it named the picker strip M10.9 WP2 deleted.

**P1.verify-human.4 — ACKNOWLEDGED, not absorbed.** The Analytics group sits below the fold
(817px of content in a 599px viewport), so the reassurance is seen only on scroll. Not a defect
and out of this WP's copy-only scope. Recorded here rather than silently fixed or silently
dropped.

**⚠️ What the agent CANNOT verify, stated plainly rather than passed:** whether the compressed
wording is the *right voice for this product*. The length outlier and the triple-restatement were
objective and are fixed; tone against Claudesk's intended register is an operator judgment. The
copy is defensible and evidence-backed — it is not operator-approved. If the voice is wrong, it is
two string edits with a guard that will catch drift.

**Gates after the fix:** `tsc` 0 · `eslint` 0 · `format:check` green · `pnpm test` **126 files /
1460 pass** · copy guard **11/11**, and the new anti-regression assertion was **mutation-proven**
(re-stacking the third phrasing fails exactly 1 of 11).

## Verify-self log — Phase 1 (2026-08-01)

**Driven live by the orchestrator through the `tauri` MCP bridge — NOT via
`feature-verify-self-runner`.** That subagent assumes Playwright-MCP tool names, and per memory
`[[mcp-bridge-tools-not-exposed-to-subagents]]` the `mcp__tauri__*` tools reach the orchestrator
but **not** spawned subagents, which silently fall back to bare Vite with **no Tauri IPC** — the
exact stubbed-verification failure mode `[[verify-self-stub-cannot-cross-subprocess-boundary]]`
describes. `__TAURI_INTERNALS__` was confirmed present before asserting anything.

**Integration boundary: YES** — P1.1 edits a file backing the existing `⌘,` Settings panel and
P1.2 edits the existing tracking-OFF dashboard empty state; both change user-visible behavior.
Two Observable outcomes cite the consuming surfaces by name, so the rule is satisfied.

**Result: 8/8 outcomes PASS. 0 BLOCKING, 0 COSMETIC.**

| # | Outcome | Result |
|---|---|---|
| 1 | `grep` finds no HTTP client in `time_store/` — offline claim verifiable | PASS (exit 1, no matches) |
| 2 | `tsc --noEmit` exit 0 | PASS |
| 3 | `pnpm test` exit 0, new copy-guard file reports non-zero count | PASS (126 files / 1460; new file 11/11) |
| 4 | `cargo test … time_store` exit 0, both real privacy tests by name | PASS (105 pass; both named tests ok) |
| 5 | `pnpm lint` + `pnpm format:check` exit 0 | PASS |
| 6 | No rendered pointer at the deleted picker strip | PASS (`in the project picker` → 0) |
| 7 | Live: Analytics hint asserts offline + on-this-Mac + machine-wide scope; no JS errors | PASS (7/7 claims in live DOM, `__jsErrors` empty) |
| 8 | Live: Analytics hint still carries its ON-vs-OFF fact | PASS (`zero storage and zero IO` present) |

**Live evidence, measured rather than assumed:**
- **Reachability was hit-tested, not inferred** (the WP3.5b unreachable-dialog lesson): the
  Analytics group sits **below the fold** — `settings-panel-body` scrolls 817px in a 599px
  viewport. After scrolling, `getBoundingClientRect` puts the hint fully on-screen (top 435,
  bottom 507) and `document.elementFromPoint` at its centre returns the hint itself; the adjacent
  toggle is likewise topmost at its own centre. A DOM-presence check alone would have called
  below-the-fold copy "visible".
- **No horizontal overflow** — `scrollWidth 560 === clientWidth 560`. Checked deliberately: a
  longer hint is exactly what re-introduces the whole-panel horizontal-overflow bug M10.9 WP3.5a
  diagnosed live, and the 322-char hint is ~3× the incumbent's length.
- **Zero `<kbd>` elements** in the rendered empty state — confirming the reverted unstyled-`<kbd>`
  draft stayed reverted and the chord renders as plain text like the other nine sites.
- **⚠️ The copy's own instruction was verified end-to-end, which is the check that actually
  matters.** The empty state says *"Turn on Time tracking in Settings (⌘,)"*. Dispatching `⌘,`
  **from the dashboard** opened Settings and the named control was present with exactly the label
  the copy uses (`Time tracking`). This is the assertion the *old* copy would have failed — it
  named the project-picker strip, which M10.9 WP2 deleted. Asserting only that the new string
  exists would have proven the wording changed while leaving unproven the thing a user depends on:
  that the destination is real.

**Teardown (PID-scoped, per `[[lsof-ti-tcp-misses-ipv6-vite]]` and
`[[verify-self-dev-vs-prod-process-name-collision]]`):** pre-flight confirmed **no** pre-existing
`claudesk` process and both ports free, so the app under test was unambiguously mine to stop.
`driver_session{stop}` → `TaskStop` on the `tauri:dev` task → verified 1420/9223 clear with
`lsof -nP -iTCP:` (IPv6-aware; `lsof -ti tcp:` misses Vite's IPv6-only listener). **No blanket
`pkill`/port-kill was used** — a blanket kill previously destroyed the operator's live app.

## Verify-auto log — Phase 1 (2026-08-01)

Four checks, scoped to the three changed files — **not** a full-suite re-run (that was build's
gate). All pass.

| Check | Scope | Result |
|---|---|---|
| ESLint | the 3 changed files | exit 0 — 0 errors, 0 warnings |
| Targeted test | `settingsTimeTrackingCopy.test.ts` | 11/11 pass |
| `tsc --noEmit` | project-wide (no per-file mode under project refs) | exit 0 |
| Sibling suites | `settingsTimeTrackingWiring` + `dashboardWiring` | 42/42 pass |

**Why check 4 is the load-bearing one.** `dashboardWiring.test.ts` independently asserts on
`GlobalDashboard.tsx`'s `dashboard-empty-tracking-off` testid (`:120`, `:164`) — i.e. a
pre-existing guard on the very file P1.2 edited, written by a different WP for a different
reason. It passing means the edit did not disturb a neighbouring contract. A verify-auto that ran
only the new test would have missed that class of breakage entirely.

**One method note worth keeping.** ESLint's first invocation printed nothing but lost its exit
code to a shell pipeline (`PIPESTATUS` did not survive the `echo` boundary). It was re-run to read
the code directly rather than treating silent output as success — *clean output* and *exit 0* are
two different claims, and only one of them is the gate. Same discipline as using
`./node_modules/.bin/eslint` / `.../tsc` rather than `pnpm exec` (which exits 0 regardless, per
`[[pnpm-exec-shadows-local-binaries]]`).

**Gates at exit of build:** `tsc --noEmit` 0 (via `./node_modules/.bin/tsc`, never `pnpm exec`) ·
`pnpm test` 126 files / **1460** pass, 0 fail (was 121/1400) · new file **11/11** ·
`cargo test … time_store` **105** pass, 0 fail, including both real privacy tests by name ·
`pnpm lint` 0 errors (1 pre-existing warning in untouched `XtermPane.tsx`) ·
`pnpm format:check` green · zero lines under `src-tauri/src/time_store/` · zero dependency-file
changes.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

- [SURFACED-2026-08-01] WP3 / docs — `PRIVACY-TEST-COINCIDENTAL-SUBSTRING` is a **stale identifier**
  cited in four docs (`CHANGELOG.md`, `roadmap.md`, `wbs.md`, `backlog.md`) as the privacy
  self-consistency test to re-verify, but it matches nothing in the codebase. The real tests are
  `time_store::tests::row_never_carries_prompt_text` and `native_row_never_carries_content`
  (`src-tauri/src/time_store/mod.rs:413,703`). A dangling identifier in a *privacy* instruction is
  a confabulation channel — a future reader may believe a guard exists by that name, or "verify" it
  by grepping, finding the doc mentions, and calling it done. Worth a doc fix at
  `/product-finalize`'s resync, or a one-line correction now. Logged to backlog.

- [SURFACED-2026-08-01] WP3 / P1.1 — **the two hook-stream consumers filter differently, and
  nothing says so at either site.** `status_broadcaster::drain_loop` drops events whose `cwd`
  resolves to no open workspace; `time_store::drain_loop` writes every event unconditionally.
  Both read the same fan-out. The asymmetry is deliberate and correct (analytics wants all CC
  activity; status dots only mean something for an open workspace) — but it is documented at
  neither drain, so the natural inference from reading one is wrong about the other. This is
  precisely the fact WP3's copy depends on, and it took a code trace to establish. A one-line
  cross-reference comment at each `drain_loop` would make it self-documenting. Logged to backlog
  as low (comment-only; no behavior at risk).

## Notes

- **Why no 3rd-party probe is needed:** no external service, API, or SDK is involved. This is a
  string change in two frontend files plus one test.
- **Single phase is deliberate.** The WBS sizes WP3 as XS. Both edits are the same trust claim in
  the two places a user meets the feature; splitting them would put a half-consistent surface
  through a verification loop, which is worse than verifying them together.
- **Verify-self posture.** Per the project convention, the agent drives live checks through the
  `tauri` MCP bridge (`mcp__tauri__*`), not by spawning `feature-verify-self-runner` (which assumes
  Playwright-MCP names). Copy is read from the live DOM. Bridge caveats that apply here: drive
  clicks with `el.click()` inside `webview_execute_js` (caveat g), and tear down with
  `driver_session{stop}` + a **PID-scoped** port cleanup on 1420/9223 — never a blanket kill, per
  `[[lsof-ti-tcp-misses-ipv6-vite]]` (a blanket kill took out the operator's live app once).
