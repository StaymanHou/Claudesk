# Feature: M11 WP4 — Scroll-preserving live reload of the Docs panel

**Workflow:** feature
**State:** COMPLETED 2026-08-02
**Created:** 2026-08-02
**Drive mode:** autopilot
**WBS:** `workflow-system/product/wbs.md` → WP4 (M11), size S
**Resolves:** `SURFACE-2026-07-07-DOCS-VIEWER-RELOAD-PRESERVE-SCROLL`

## Problem Statement

The Docs panel (WP2 list + WP3 render) has **no `fs-change` listener at all**, so it is a
snapshot of the moment it was opened. Two consequences, both hit routinely in this project's
own workflow: (1) the operator watches `workflow-system/state/wip/*.md` update live while CC
edits it — the panel shows stale text until something else is clicked; and (2) the panel's
top-ranked landing doc is `.session.md`, which **`/session-restore` deletes at its step 7 on
every restore** — so the panel keeps rendering text from a file that no longer exists. WP4
subscribes the panel to the existing QoL-WP0 `fs-change` watcher (no new watcher) and makes
three distinct responses to a change — **content changed** → re-render in place with scroll
preserved; **a doc appeared** → re-rank and jump; **a doc disappeared** → fall back to the
ranking — while never overriding a reader's explicit pick except when the doc they picked is
gone.

**Problem statement unchanged** [re-checked 2026-08-02 at the F9b back-loop into P3.5] — the
back-loop was a *verification-coverage* gap, not a shift in the root problem. Nothing failed and
no behavior was found wrong: the integration-boundary rule blocked spawning the verify-self
subagent because Phase 3's outcomes proved only structure (source shapes, unit tests, build)
and never drove the consuming surface. The problem being solved, and the design solving it, are
both exactly as stated above; what changed is *where the live proof is attached* (Phase 4
dissolved into Phase 3 / P3.5). Recording that explicitly so a later reader does not go hunting
for a root-cause revision that did not happen.

## Context gathered at plan time (measured, not assumed)

Read before building — each of these changed the plan's shape:

1. **`fs-change`'s `kind` field is NOT usable for appear/change/disappear classification.**
   Its own doc comment says "a hint only; the authoritative signal is `paths`", and
   `fs_watch/commands.rs:89 classify()` collapses a mixed 200ms-debounced batch to
   `FsKind::Other`. A delete+create of `.session.md` inside one window is therefore
   indistinguishable *from the event*. → **Classify by diffing the re-derived doc list**
   (`docs_list` is the ground truth), never by reading `kind`. This also answers task 4.3's
   "check `notify` coalescing empirically" question in the way that makes the answer not
   matter: the diff is correct under either coalescing behavior.
2. **The watcher does see `.session.md`.** M6 WP6 re-based ignore filtering from gitignore to
   heavy-dir names for exactly this reason; `fs_watch/mod.rs` has a test named
   `gitignored_but_non_heavy_files_are_now_kept` citing `.session.md` by name.
3. **`rel_path` and `fs-change` `paths` are the same coordinate space** — both
   project-relative, forward-slashed POSIX. Directly comparable.
4. **⚠️ The panel can be `display:none` when a change arrives** (`RightPanelHost.tsx:1262` —
   the docs slot is `display: panel === "docs" ? "flex" : "none"`, and panels stay mounted
   per the panels-stay-mounted rule; the whole `.workspace-right` is also display-none'd when
   the workspace is backgrounded). **A hidden element's `scrollTop` reads 0 and writing it is
   a silent no-op.** A naive capture→refetch→restore therefore *scrolls the reader to top* on
   any reload that lands while the panel is hidden. This is designed for in Phase 2, not
   discovered at verify.
5. **`.docs-content` is the scroll box and must stay so** — pinned + mutation-proven by
   `docsPanelWiring.test.ts:137`; `App.css:1249` carries the warning. Do not move `overflow-y`
   to `.docs-panel`.
6. **The content element survives a content swap** — no `key` on `DocMarkdown`'s output, and
   `.docs-content` is a stable `ref`'d node, so React reconciles in place. WP1 additionally
   measured that re-render-in-place is byte-identical across 5 alternating cycles.
7. **`SURFACE-2026-08-02-QUALITY-WP3-SELECTED-RECOMPUTED-FEEDS-EFFECT` becomes live here.**
   `selected` is recomputed each render and is a dep of the content-fetch effect. `docs_list`
   re-stats `mtime_ms` on every refresh, and `pickInitialDoc`'s multi-WIP tiebreak reads
   mtime — but `selected` is a **string**, so a refresh that does not change the *winner*
   compares equal and does not re-fire the fetch. That is load-bearing (otherwise every CC
   keystroke would refetch the doc) and is currently true only by good luck of the type. →
   Phase 1 pins it as a test.
8. **`pickInitialDoc` / `selectedDoc` need no change.** Both were written for this second
   caller: `pickInitialDoc` is documented pure + total "because WP4 calls it a SECOND time",
   and `selectedDoc`'s header states the deleted-chosen fall-back is deliberately WP4's.

**No 3rd-party dependency** — rides the existing backend watcher and existing `docs_list` /
`docs_read` commands. No probe WP needed. No new npm/cargo dependency.

**Method commitment carried from WP3 (six defects, four self-inflicted, zero caught by
`tsc`/lint/1600 tests/a clean build):** the two behavioral cores of this WP — the doc-set
**diff→decision** and the **scroll capture/restore lifecycle** — are extracted as pure
modules that tests **import and drive**, not logic living inside the `fs-change` callback
guarded by `?raw` string matching. Per `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`
and `[[strictmode-remount-deadlocks-an-unreleased-fetch-latch]]`, a `?raw` guard over a
behavioral property is vacuous, and a state machine that lives only inside a hook ships
broken through green gates. Every new guard gets mutation-proven
(`[[verify-the-mutation-landed]]`: confirm the mutation changed *executable code* — `sed -n`
the line — before believing a pass).

## Work Tree

- [x] Phase 1: Doc-set diff → reload decision (pure)  <!-- status: done 2026-08-02 -->
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/components/workspace/__tests__/docsReloadDecision.test.ts` exits 0, and the suite asserts each of the four decision cases as a returned value: identical set → `"none"`; content-only change (same paths, different mtimes) → `"content"` with selection unchanged; a path added → `"jump"` carrying `pickInitialDoc`'s answer for the NEW set; the selected path removed → `"refallback"` with the `chosen` sentinel cleared to `null`.
  - CLI: the same suite asserts the two easy-to-miss rules from `wbs.md` task 4.3 as values — (a) an explicit pick is never overridden by a jump, but IS **cleared** (not re-pointed) on `"refallback"`; (b) a path that disappears **and reappears** in one diff step is a `"jump"`, not a `"content"` change.
    <!-- ⚠️ WORDING CORRECTED at verify-self (2026-08-02). This outcome originally read
         "an explicit `chosen` is preserved across `content` and `jump` decisions", which
         implies a field-level assertion that deliberately does not exist: those two variants
         carry NO `chosen` field at all, so preservation is unrepresentable-by-construction
         rather than asserted. The verify-self subagent flagged the mismatch. The policy
         (explicit pick beats a jump) lives in `shouldJump` and is mutation-proven; the code
         is the stronger shape and was left alone. Corrected so a later reader does not hunt
         for a missing assertion. -->
    <!-- ⚠️ Fixture fragility noted by the same pass: `expect(decision.chosen).not.toBe(decision.selected)`
         in "clearing the sentinel is NOT the same as re-pointing it" would be TAUTOLOGICAL if
         that test's fixture fallback ever resolved to `null`. It resolves to WIP_A today, and
         the re-pointing mutant fails that exact test, so it discriminates. A future fixture
         edit could hollow it out silently — keep a non-null fallback in that case. -->
  - CLI: `./node_modules/.bin/vitest run src/components/workspace/__tests__/pickInitialDoc.test.ts` exits 0 with a new case proving the WP3-MINOR constraint: re-running `pickInitialDoc` on a set whose `mtime_ms` values all advanced but whose ranking winner is unchanged returns the **identical string**, so `selected` cannot churn the content effect.
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0 (NOT `pnpm exec tsc`, which exits 0 regardless — `[[pnpm-exec-shadows-local-binaries]]`).
  - [x] P1.1 Add `docsReloadDecision.ts` beside `pickInitialDoc.ts`: a pure `decideReload({ prev, next, chosen, selected })` returning a discriminated union `{ kind: "none" | "content" | "jump" | "refallback", chosen?, selected? }`. Diffs by `rel_path` set membership first (appear/disappear dominate), then by `mtime_ms` for content. No React, no IPC, no DOM.  <!-- status: done -->
  - [x] P1.2 Write `docsReloadDecision.test.ts` driving the real module across the four cases + the two task-4.3 rules + degenerate inputs (empty→non-empty, non-empty→empty, first-ever load with `prev === null`).  <!-- status: done -->
  - [x] P1.3 Add the mtime-churn stability case to `pickInitialDoc.test.ts` (outcome 3 above).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — eslint 0 findings (3 changed files), tsc 0, targeted suite 46/46 -->
  - [x] verify-self  <!-- status: done — 4/4 outcomes PASS, 0 blocking, 0 cosmetic; subagent ran an INDEPENDENT 6-mutant campaign, files restored byte-identically -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED (F11) per drive_mode=autopilot — no integration boundary (isolated new artifacts only), verify-self all-PASS; affirmation printed in chat for read-time veto -->
  - [x] verify-codify  <!-- status: done — 2 tests added closing the "content"-arm gap, both mutation-proven (M8/M9); full suite 1671/138 green -->

- [x] Phase 2: Scroll capture/restore lifecycle (pure) + hidden-panel correctness  <!-- status: done 2026-08-02 -->
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/components/workspace/__tests__/docsScrollRestore.test.ts` exits 0, asserting as values: a capture taken while the box is **measurable** is restored verbatim after a content swap; a capture attempted while the box is **unmeasurable** (`clientHeight === 0`, the `display:none` case) is **not recorded and does not overwrite a good prior offset**; a restore into an unmeasurable box is **deferred, not discarded**; and a restore whose target offset exceeds the new `scrollHeight` **clamps** rather than throwing away the position (a doc that shrank).
  - CLI: the same suite mutation-proves the hidden-panel arm — flipping the measurability guard to always-true makes the "hidden capture must not clobber" case FAIL (recorded in the WIP with the `sed -n` line proof that the mutation landed).
  - Browser: a jsdom test drives `readGeometry` against a **real constructed element** (no replica), asserting the read's shape and the `null`-for-missing-element contract.
    <!-- ⚠️ OUTCOME CORRECTED at verify-auto (2026-08-02). Originally: "jsdom test constructs a
         real element with scrollTop/clientHeight/scrollHeight and drives the module against
         it". That described the element-based signature the jsdom probe invalidated — jsdom
         reports clientHeight 0 for visible elements too, so asserting geometry VALUES off a
         real element would assert facts about jsdom, not about this code. The real-element
         test is therefore scoped to `readGeometry`'s shape + null contract; the geometry
         VALUES are Phase 4's live WKWebView check. The "no replica" spirit is preserved and
         strengthened: all 20 tests import and drive the real module. -->
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0.
  - [x] P2.1 Add `docsScrollRestore.ts`. ⚠️ **Signature changed from the plan** — the pure functions take an injected `ScrollGeometry` VALUE, not an `HTMLElement`, with a single thin `readGeometry(el)` doing the one DOM read. Forced by a measured jsdom limitation (see Discoveries); the plan's element-based shape would have made the hidden-panel arm untestable. Exports: `readGeometry` · `isMeasurable` (a type predicate) · `captureScroll(geom, prev)` (returns `prev` unchanged when unmeasurable) · `planRestore(geom, offset)` → `{apply, scrollTop}` (clamped; `apply:false` = defer).  <!-- status: done -->
  - [x] P2.2 Write `docsScrollRestore.test.ts` — 20 tests incl. the clamp, the deferred-restore report, the genuine-0-vs-null distinction, and the full 4-step hidden-panel round trip.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — eslint 0 findings (2 changed files), tsc 0 errors in module, targeted suite 20/20 -->
  - [x] verify-self  <!-- status: done — 4/4 PASS, 0 blocking, 0 cosmetic; subagent ran 5 INDEPENDENT mutants with distinct failure signatures, byte-identity proven via cmp+sha256 (module untracked, so git diff could not prove it) -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED (F11) per drive_mode=autopilot — no integration boundary (zero importers, confirmed by grep), verify-self all-PASS; affirmation printed in chat for read-time veto -->
  - [x] verify-codify  <!-- status: done — found + closed a REAL hole (null-geometry branch unpinned; the mutation had slipped 20/20), now 22 tests; full suite 1693/139 -->

- [x] Phase 3: Wire the panel to `fs-change`  <!-- status: done 2026-08-02 -->
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/components/workspace/__tests__/docsPanelWiring.test.ts` exits 0 with new arms: `DocsPanel` consumes `decideReload(` and `captureScroll(`/`restoreScroll(` (asserted as **call shapes**, `fn(`, on comment-stripped source — never bare identifiers, per `[[raw-guard-identifier-satisfied-by-own-comments]]`); the existing `.docs-content`-owns-overflow assertion still passes unchanged.
  - CLI: `./node_modules/.bin/vitest run` (full suite) exits 0 — the 1649-test baseline plus the new files, with zero pre-existing failures introduced.
  - CLI: `pnpm lint` exits 0 (1 pre-existing `XtermPane` warning tolerated); `pnpm format:check` exits 0.
  - CLI: `pnpm vite build` exits 0 — catches a broken import/JSX across the change, and confirms `DocsPanel` is still in a **lazy chunk** (the `main` chunk stays ~440 KB, not ~606 KB; WP3's lazy-load must not regress).
  - Console: no `react-hooks/set-state-in-effect` or `react-hooks/refs` lint error — the new subscription must not clear state at the top of an effect nor read `contentRef` during render (both are rules WP3 paid for).
  <!-- ⚠️ The five outcomes below were MOVED UP from the dissolved Phase 4 at the
       integration-boundary back-loop (2026-08-02). They are what cite the CONSUMING SURFACE
       (`DocsPanel` inside a live `RightPanelHost`, driven in the real WKWebView) — the five
       CLI outcomes above are all source/test/build checks and satisfy no part of that rule. -->
  - Browser (MCP bridge, live WKWebView, scratch workspace `tmp/scratch/scratch-a`): open the **Docs tab in a real workspace** (the consuming surface: `RightPanelHost`'s docs slot), `webview_execute_js` sets `.docs-content.scrollTop` to a mid-file offset and reads it back non-zero; a shell `Write` appends a line to that file on disk; after the 200ms debounce the rendered text contains the new line **and** `scrollTop` is within a few px of the captured offset (**not** 0).
  - Browser: with the panel open on `.session.md`, delete that file on disk → the panel falls back to the wip doc (list no longer shows a `session` row, `[data-testid="docs-content"]` renders the wip doc's text, not stale session text). This is the `/session-restore` step-7 sequence the WBS calls out as routine.
  - Browser: with the panel open on a doc and no explicit click, create a NEW `wip/*.md` on disk → the panel **jumps** to it (`aria-selected="true"` moves to the new row).
  - Browser: explicitly click a low-ranked doc (e.g. `arch.md`), then touch a wip file on disk → the selection **stays** on `arch.md` (explicit pick not overridden).
  - Browser: the hidden-panel case — switch to the Editor panel, mutate the open doc on disk, switch back to Docs → scroll offset preserved (the P3.3 deferred restore, on the real thing rather than only in jsdom).
  - CLI: teardown leaves no stray processes — `mcp__tauri__driver_session{stop}`, `TaskStop` the `tauri:dev` task, then verify ports 1420/9223 released with `lsof -nP -iTCP` (⚠️ PID-scoped only; never blanket-kill a `target/debug/claudesk` I did not launch — `[[lsof-ti-tcp-misses-ipv6-vite]]`, `[[verify-self-dev-vs-prod-process-name-collision]]`).
  - [x] P3.1 Subscribe `DocsPanel` to `FS_CHANGE_EVENT` via `listen` + `appliesToWorkspace`, using the `cancelled`-flag async-listen guard already established at `RightPanelHost.tsx:295-332`. ⚠️ Needs `workspaceId` — currently NOT a `DocsPanel` prop; thread it from the host (it is in scope there).  <!-- status: NOT-STARTED -->
  - [x] P3.2 On a matching event whose `paths` intersect the doc set (or is non-empty — a new doc's path is not yet in the set), re-run `docs_list`, feed `decideReload`, and apply: `"content"` → capture scroll, re-`docs_read`, restore; `"jump"` → set the new selection; `"refallback"` → clear `chosen` to `null`. **Must not** reset `docs` to `null` (would re-arm the fetch latch — the WP2/WP3 loop hazard the latch comment warns about).  <!-- status: NOT-STARTED -->
  - [x] P3.3 Handle the deferred restore: when Phase 2 reports the box was unmeasurable, re-apply the pending offset once the panel becomes measurable again (the `visible`/`panel` transition), so a reload that lands on a hidden panel does not silently scroll the reader to top.  <!-- status: NOT-STARTED -->

    ⚠️ **Sharpened by the Phase 2 verify-self subagent (2026-08-02) — this is the phase's
    highest-risk task.** It observed that Phase 2 proves the decision logic but **nothing yet
    proves the CALLER honors it**: that capture happens *before* the content swap, restore
    *after*, and — the unenforced one — that an `apply: false` offset is actually **held and
    re-attempted** rather than dropped. That obligation is stated only in `RestorePlan`'s doc
    comment, and the subagent named it as exactly where the
    `[[strictmode-remount-deadlocks-an-unreleased-fetch-latch]]` defect class hides (a latch
    or pending value set on one path and never released on the cancelled path). So P3.3's test
    must drive the **hold-and-retry** sequence, not merely assert the wiring calls the
    functions.
  - [x] P3.4 Add the wiring arms to `docsPanelWiring.test.ts`; mutation-prove each new arm bites.  <!-- status: done -->
  - [x] P3.5 Drive the live scenarios through the MCP bridge against a scratch workspace (absorbed from the dissolved Phase 4 / WBS task 4.4): content-reload-with-scroll-preserved, `.session.md` disappear→fallback, appear→jump, explicit-pick-not-overridden, and the hidden-panel deferred restore. Record measured offsets/paths in this WIP.  <!-- status: done — 5/5 live outcomes PASS on a clean app; the earlier FAIL was an HMR artifact, see "P3.5 LIVE PROBE" -->
  - [x] verify-auto  <!-- status: done (re-run post-P3.5) — telemetry-residue scan 0 hits, eslint 0, tsc 0, docsPanelWiring 29/29 -->
  - [x] verify-self  <!-- status: done — 11/11 PASS (5 live outcomes audited adversarially + 6 CLI verified by the subagent), 0 blocking, 0 cosmetic; 2 evidence gaps named + carried to WP5, see "Two evidence gaps" -->
  - [x] verify-human  <!-- status: done 2026-08-02 — operator approved all 4 leaves ("all good"); F13 -->
    - [x] P3.verify-human.1 Deferred-restore ISOLATION — the gap verify-self named  <!-- status: done — operator-approved -->
    - [x] P3.verify-human.2 Doc-SHRINK clamp path (unexercised live)  <!-- status: done — operator-approved -->
    - [x] P3.verify-human.3 Judgment: is jump-on-appear the right feel in real use?  <!-- status: done — operator-approved; jump-on-appear CONFIRMED as the right feel, no narrowing wanted -->
    - [x] P3.verify-human.4 Dogfood on THIS repo (real CC-driven WIP churn, not a fixture)  <!-- status: done — operator-approved -->
  - [x] verify-codify  <!-- status: done — closed the rapid-CC-churn gap (4 tests, 2 mutations proven); boundary consuming-surface TEST not achievable in CI (no E2E harness) — recorded honestly, see "Phase 3 verify-codify" -->

<!-- Phase 4 DISSOLVED at the integration-boundary back-loop (2026-08-02). Its content was
     "verify what Phase 3 built", which the boundary rule requires to live IN Phase 3 — a phase
     whose entire deliverable is another phase's verification has no independent output. All
     five of its Browser/CLI outcomes moved into Phase 3 above; its two impl tasks became P3.5.
     WP4 is therefore a 3-phase feature. WBS task 4.4 is unchanged in substance. -->

## Current Node
- **Path:** Feature > finalize (complete) — **ARCHIVED**
- **Active scope:** **REFACTOR COMPLETE.** CRITICAL + MAJOR-1 + MAJOR-3 fixed in place and mutation-proven (M23/M24/M25); MAJOR-2 + 4 MINOR backlogged (MAJOR-2 needs a behavior decision, which the scope guard forbids here). Suite 1723/140. Was: The `"jump"` arm latches the machine's answer into `chosen`, so the first jump permanently disables every later one (`DocsPanel.tsx:356`); confirmed against source. Refactor scope: the CRITICAL + MAJOR-1 (`reset` never dispatched on user selection) + MAJOR-3 (`panelFront` work gate), which are the same wiring layer. SHIPPED as `8d3e487` (not pushed — publication is the operator's call; the branch is now 39 ahead of origin/main). All 3 phases complete. Phase 4 was dissolved into Phase 3 at the integration-boundary back-loop, so WP4 is a 3-phase feature and the feature is ready to ship. P3.5 resolved via the `/debug-empirical-telemetry` sidebar: the `reloadNonce` fix was correct all along; the apparent second failure was an **HMR artifact** (4 hot updates to `DocsPanel.tsx` at 14:24:12–14:24:43, "re-verify" ran at 14:25:01 inside the hot-patched tree). 5/5 live outcomes PASS on a clean app.
- **Re-verify gate:** ✅ **PASSED** — the previously-failed outcome re-driven on the CLEANED source from a fresh launch (`htmlLen 16077`, marker present, `scrollTop` held at 900). §6 satisfied.
- **Blocked:** none
- **Unvisited:** none — all phases complete.
- **Open discoveries:** 1 — the jsdom zero-`clientHeight` finding (logged to backlog as `SURFACE-2026-08-02-JSDOM-CLIENTHEIGHT-IS-ZERO-FOR-VISIBLE-ELEMENTS-TOO`, medium). Does not block WP4; suggests an `arch.md` testing-posture note.

## Phase 1 build record (2026-08-02)

**Shipped:** `src/components/workspace/docs/docsReloadDecision.ts` (pure; `decideReload` +
`shouldJump`), `src/components/workspace/__tests__/docsReloadDecision.test.ts` (18 tests),
and 2 new cases in `pickInitialDoc.test.ts`. `pickInitialDoc.ts` / `selectedDoc` **unchanged**
— both were already written for this second caller.

**Gates:** `tsc --noEmit` 0 (local binary, not `pnpm exec`) · `pnpm lint` 0 errors (1
pre-existing `XtermPane` warning) · `pnpm format:check` clean · full suite **1669 passed /
138 files** (baseline was 1649; +20 net), zero failures.

**⚠️ Mutation proof — 7 mutations, each verified to have landed in EXECUTABLE code by
printing the mutated line before running (`[[verify-the-mutation-landed]]`; one earlier
attempt produced a transform error rather than a mutation and was correctly discarded as
no evidence):**

| # | Mutation | Result |
|---|---|---|
| M1 | `refallback` re-points `chosen` instead of clearing it (the forbidden move) | **3 failed** |
| M2 | disappear arm disabled, so appear shadows it | **5 failed** |
| M3 | `shouldJump` always true — explicit pick overridden | **1 failed** |
| M4 | content arm ignores `mtime_ms` — never re-renders | **1 failed** |
| M5 | `prev === null` reports a jump instead of `none` | **1 failed** |
| M6 | `pickInitialDoc`'s answer made timestamp-dependent (churn) | **15 failed** |
| M7 | mtime ignored entirely — "stability" via a broken tiebreak | **4 failed** |

M6/M7 are a deliberate pair: M7 is the cheat that would satisfy the stability test by
breaking the multi-WIP tiebreak, and the complement case catches it. So "stable across a
list refresh" is pinned without weakening what `pickInitialDoc` is for.

**Two design decisions made during build, both recorded in the module header:**
1. **Appear OUTRANKS content**, and **disappear outranks both.** One 200ms debounced batch
   can carry several kinds (CC writes the WIP file *and* creates a new one), so the arms need
   a stated precedence rather than an incidental one. Disappear is first because it is the
   only outcome allowed to override an explicit pick — no later arm may shadow it.
2. **A NON-selected doc changing its bytes is `"none"`.** The panel renders one doc; re-reading
   because a sibling moved is work with no visible effect. The list still refreshes regardless
   (that is how mtimes advance at all), so the next tiebreak sees current data.

**verify-codify addition (2026-08-02).** No integration boundary → no consuming-surface test
is possible yet, and unit-level is the *highest* level that exists (the module has no importer
until Phase 3) — the §2-clause-3 case, not a default-to-unit shortcut. The end-to-end coverage
for this logic is Phase 4's live MCP-bridge scenarios. Coverage audit found both exports
exercised and all four variants asserted, with one real gap: `"content"` had a single
assertion on a minimal fixture. Two tests added, both mutation-proven:

| # | Mutation | Result |
|---|---|---|
| M8 | mtime compared with `>` instead of `!==` (backward clock ignored) | **1 failed** — caught ONLY by the new backward-clock test |
| M9 | compares `prev[0]`/`next[0]` instead of the selected entry | **3 failed** |

M8 is the one worth noting: `!==` rather than `>` is deliberate — a restored file, a `git
checkout`, or a clock adjustment can *lower* an mtime while the bytes did change, and a `>`
comparison would silently keep rendering stale text in exactly those cases. Nothing pinned
that before; the prior single-pair fixture could not see it.

**`wbs.md` task 4.3's open question is now moot rather than answered.** It asked whether
`notify` coalesces a delete+create of `.session.md` into one event, to be checked
empirically. Because the decision diffs the re-listed doc set instead of reading
`FsChange.kind`, the outcome is correct under either coalescing behavior — and `kind` was
never usable for this anyway (`fs_watch/commands.rs::classify` folds a mixed batch to
`Other`, and the field's own doc comment calls it "a hint only"). Two tests pin the
delete+recreate sequence both ways (selected → `refallback`; not-selected → `jump`).

## Phase 2 build record (2026-08-02)

**Shipped:** `src/components/workspace/docs/docsScrollRestore.ts` +
`src/components/workspace/__tests__/docsScrollRestore.test.ts` (20 tests).

**⚠️ The plan's P2.1 signature was WRONG and was changed during build — measured, not
guessed.** The plan said the pure functions take an `HTMLElement | null` and read
`clientHeight` themselves. A jsdom probe (run before writing any code) found:

| jsdom fact | Value |
|---|---|
| `clientHeight` on a **visible** element | **0** |
| `clientHeight` on a `display:none` element | **0** |
| `scrollTop` after `el.scrollTop = 250` | **250** (plain writable property, persisted) |

jsdom has **no layout engine**, so `clientHeight` cannot distinguish visible from hidden.
An element-sniffing module would therefore be **untestable for the one arm that matters**:
a "hidden box must not clobber the remembered offset" test would pass trivially (jsdom
considers every box hidden) — and would pass just as happily against code with the logic
inverted. That is the vacuous-guard failure mode this WP has already paid for twice
(`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`) in a new costume: a
test that cannot distinguish the states it claims to test.

**Resolution:** geometry is an injected `ScrollGeometry` value; every decision is pure over
it; `readGeometry(el)` is the sole DOM read (3 lines), verified live in Phase 4 where a real
WKWebView has actual layout. This is strictly more testable AND keeps the DOM contact minimal.

**One type-level fix:** `isMeasurable` is a **type predicate** (`geom is ScrollGeometry`), not
a plain `boolean`. With a bare boolean, `tsc` could not see the guard excluded null and
reported **TS18047 at three call sites**; the alternative (a non-null assertion per use) would
convert a checked fact into an unchecked one.

**Mutation proof — 4 mutations, each verified to have landed in executable code:**

| # | Mutation | Result |
|---|---|---|
| M10 | measurability guard always true (**the plan-required probe**) | **5 failed**, incl. the hidden-clobber case |
| M11 | `captureScroll` returns `0` instead of `prev` when unmeasurable (the clobber bug) | **4 failed** |
| M12 | `planRestore` DISCARDS instead of deferring | **2 failed** |
| M13 | no clamp — stale offset past a shrunken doc's end | **3 failed** |

M10 was re-run **after** the type-predicate change rather than assuming the earlier proof
carried; it still bites 5/20.

**Gates:** `tsc` 0 · `eslint` 0 findings on the new files · `prettier` clean · full suite
**1691 passed / 139 files** (from 1671).

**⚠️ verify-codify found and closed a REAL hole — the suite was under-determined.** Probing
(rather than assuming the TDD set complete) revealed that `planRestore(null, offset)` was
**unpinned**: relaxing the guard to `geom !== null && !isMeasurable(geom)` — treating a null
geometry as applicable — left **all 20 tests passing**. That mutant is not hypothetical; it
throws a `TypeError` on `geom.scrollHeight` the first time a restore runs before the ref has
attached, i.e. the first-mount case. The gap existed because **"no element yet" and "element
has no layout" are two different reasons a box is unmeasurable**, and only the second had
coverage. Two tests added (22 total); the previously-invisible mutation now **fails 1/22**,
which is the proof the addition was worth making rather than a test that cannot fail. Instance
of `[[guard-predicate-completeness-vs-mutation-landing]]`: a passing "0 findings" is
under-determined until each branch has its own attributed probe. Final suite **1693 / 139**.

## Phase 3 build record (2026-08-02)

**Shipped:** `pendingRestore.ts` + `pendingRestore.test.ts` (16 tests) — the hold-and-retry
machine; the `fs-change` subscription + reload dispatch in `DocsPanel.tsx`; two new props
(`workspaceId`, `panelFront`) threaded from `RightPanelHost`; 7 new wiring arms.

**P3.3 was built as a PURE STATE MACHINE, per the Phase 2 subagent's warning.** "Is an offset
waiting, and should it apply now?" is a total `(state, event) → state` function, so the
deferral / StrictMode-remount / doc-switch sequences are asserted as values instead of trusted
inside a hook. That is the specific shape the predecessor blank-panel bug took (a latch set
before an await, never released on the cancelled path), and the reason `fetchLatch.ts` exists.

**Two things the wiring had to get right, both stated in the code:**
- **Never `setDocs(null)` on a refresh** — it would re-arm the fetch latch and, against a
  persistently failing `docs_list`, loop. Pinned by an arm.
- **Latest-refs synced in an EFFECT, not during render.** My first pass wrote
  `ref.current = x` in the render body; `react-hooks/refs` rejected it (3 errors) and the rule
  is right — a render-phase write is discarded work under a thrown-away render, and StrictMode's
  double render makes it happen for real.

**Mutation proof — 7 mutations, each landed in executable code, each attributed to ONE probe:**

| # | Mutation | Result |
|---|---|---|
| M14 | `deferred` DROPS the offset (the come-back-to-top bug) | **2 failed** |
| M15 | `hold(null)` clobbers a held offset | **1 failed** |
| M16 | `hasPending` treats `0` as absent (reader-at-top unholdable) | **1 failed** |
| M17 | `panelFront`/`visible` dropped from the retry effect's deps | **1 failed** |
| M18 | workspace filter removed (re-lists on other projects' writes) | **1 failed** |
| M19 | classify by `FsChange.kind` instead of diffing | **1 failed** |
| M20 | `setDocs(null)` on refresh (re-arms the latch) | **1 failed** |

M17–M20 were **re-proven a second time** after I switched the new arms to the file's existing
`stripComments` helper (its line-comment pattern is unanchored, hence stricter than my local
one) — the shared stripper was not assumed to behave like mine.

**Gates:** `tsc` 0 · `pnpm lint` 0 errors (1 pre-existing `XtermPane` warning) · `prettier`
clean · full suite **1716 passed / 140 files** · `pnpm vite build` clean, and **`DocsPanel`
remains its own 170.79 kB lazy chunk** (main 408 kB — the WP3 lazy-load win is intact, not
silently regressed by the new imports).

## ✅ P3.5 LIVE PROBE — RESOLVED 2026-08-02 (5/5 outcomes PASS)

**Read this block first; the "NOT YET FIXED" narrative below it is the in-flight trail, kept
for provenance and superseded by this summary.**

**Final state: all five live outcomes PASS on a freshly-launched app.**

| Outcome | Result | Measured |
|---|---|---|
| 1. Content reload, scroll preserved | **PASS** | marker present; `scrollTop` held at **900** (not 0); scrollHeight 3014→3060 |
| 2. `.session.md` disappears → fallback | **PASS** | session row gone; fell back to the wip doc; **`rendersStaleSessionText: false`** |
| 3. Doc appears → jump | **PASS** | jumped to the new `.session.md` **and** rendered it (`rendersNewDoc: true`) |
| 4. Explicit pick not overridden | **PASS** | wip file changed on disk; `arch.md` selection held |
| 5. Hidden-panel deferred restore | **⚠️ RETRACTED at WP5 P2 — see the note below this table** | reload landed at `clientHeight: 0`; offset held; restored to exactly **1200** |

⚠️ **RETRACTION (added 2026-08-02 by M11 WP5 Phase 2 — outcome 5 above and "gap 2" further down are
both reversed). Read this before citing either.** WP5 ran the decisive experiment this WP skipped and
found outcome 5 **could not have proven what it claimed**, for two reasons:
1. **WebKit retains `scrollTop`** across a content swap on a `display:none`-but-never-unmounted node —
   measured in a standalone `WKWebView` fixture containing **zero restore code**, which still returns
   to the exact prior offset. So a working restore and a fully-broken one are observationally
   identical here. **This also refutes this file's own mitigating argument** (below, ~:419) that *"a
   height-changing content replacement is exactly what clobbers a browser-retained offset"* — the
   height changed ~91px in WP5's run and the offset survived anyway.
2. **The `"deferred"` arm was never the code path under test.** `DocsPanel.tsx:436` skips the reload
   entirely while the panel is not front (setting a stale flag), and the catch-up effect at `:462`
   re-lists only after re-fronting, when the box is measurable — so the **`"applied"`** arm runs. The
   "mutate the file while the panel is hidden" recipe does **not** exercise the deferred restore.
   Reaching it requires a **race** (reload while front, then switch panels *during* the
   `docs_list`→`docs_read` round trip), which no experiment has ever driven.

**Also reversed: "gap 2 (doc-shrink clamp) — approved live, so `planRestore`'s clamp path is no longer
unit-test-only" (below, ~:437) is FALSE.** The clamp **is** unit-test-only: the browser clamps
`scrollTop` writes itself (writing `999999` or `max + 500` into the live webview both land at exactly
`scrollHeight − clientHeight`), so that live check was vacuous too.

**Neither is a code defect.** `pendingRestore.ts` (20 tests) and `docsScrollRestore.ts` (22 tests) are
mutation-proven pure functions and remain the only protection wherever the browser does *not* supply
the answer. The *behaviors* the operator approved are real; these two **live proofs** are withdrawn.
Full account: `SURFACE-2026-08-02-BROWSER-SUPPLIES-THE-ANSWER-SO-SCROLL-RESTORE-CHECKS-ARE-VACUOUS`
and the WP5 WIP → P2.1/P2.2/P2.3.

Outcome 2 is the one the WBS singled out as routine-not-edge — the `/session-restore` step-7
sequence — and it now falls back cleanly with **no stale text from the deleted file**, which is
the defect WP3 confirmed present and this WP exists to fix. Outcome 5 confirmed the unmeasurable
state **directly** (`clientHeight: 0`, `scrollTop: 0` while `display:none`): the fake zero
Phase 2 was designed around. Capturing there would have destroyed the reader's position.

### ⚠️ The real cause — and one fix was correct all along

The FIRST blanking was a genuine defect: `setLoaded(null)` cannot re-trigger an effect keyed on
`selected`, which is unchanged on a content edit. **The `reloadNonce` fix corrected it.**

The apparent SECOND failure — the one that sent me into the telemetry sidebar — was an **HMR
artifact, not a code defect.** The dev log shows four consecutive hot updates to `DocsPanel.tsx`
at 14:24:12–14:24:43 and my "re-verify" ran at **14:25:01**, i.e. inside a hot-patched component
tree whose `useRef`s and effect closures had been swapped mid-flight. A fresh launch of the
*identical source* passes everything.

**Telemetry settled it in ONE round.** Counters on the content effect:
`body=1, setLoaded=1, cancelledSkip=0`, with `loadedPath === selected` and `loadedLen` growing
8326 → 8353. All three hypotheses were ruled out *and* the symptom did not reproduce — which
was itself the finding.

**⚠️ The transferable lesson (cost: four wrong theories, nearly rewrote correct code).**
`[[hmr-stale-across-file-rename]]` was already in memory for exactly this failure mode —
*relaunch before suspecting the diff* — and I applied it to renames but not to an **in-place edit
of a hook-bearing component**, where it is arguably worse: HMR preserves module identity while
replacing closures and effect bodies, so refs/latches/pending-state survive in a shape no
code-path in the new source can produce. **Any verify-self observation taken after editing a
component with `useRef`/`useEffect` state must follow a full relaunch, not an HMR update.**
Worth a memory (`hmr-invalidates-observations-of-hook-state`).

### ⚠️ Two evidence gaps named by the Phase 3 verify-self AUDIT (2026-08-02) — carry forward

The verify-self subagent could not re-drive the live outcomes (the `mcp__tauri__*` bridge is not
exposed to subagents — `[[mcp-bridge-tools-not-exposed-to-subagents]]`; a Playwright run at
`:1420` would be a bare-Vite FALSE FAIL), so it was tasked to **audit the recorded evidence
adversarially** instead. It found two real gaps. Both are accepted, not dismissed:

1. **⚠️ Outcome 5 (hidden-panel deferred restore) is NOT ISOLATED.** `RightPanelHost.tsx:1263`
   hides the slot with `display:none` on a **never-unmounted node**, so `scrollTop === 1200` on
   return is a priori consistent with **two** mechanisms: (a) the deferred-restore path firing,
   or (b) WebKit merely retaining the offset on a node it never destroyed. The recorded numbers
   *partially* discriminate — `scrollHeight` grew 2972/3014 → **3152** with `markerPresent true`,
   proving the content was **swapped while hidden**, and a height-changing content replacement is
   exactly what clobbers a browser-retained offset; plus `clientHeight 0` while hidden confirms
   `captureScroll` took the unmeasurable branch (`docsScrollRestore.ts:93`) and returned
   `prev = 1200` rather than a fake 0. **But the decisive experiment was NOT run:** mutating
   `pendingNext`'s `"deferred"` arm to return `NO_PENDING` and re-running the live check would
   separate (a) from (b) definitively. Mitigation on record: `pendingRestore.test.ts` asserts
   that transition as a value and it is mutation-proven (M14, 2 failures). **This is the same
   "probe the component, not a replica" discipline applied everywhere else in this WP, skipped on
   the hardest outcome — worth doing at WP5 (milestone-exit verify), which drives this surface
   live anyway.**
2. **Outcome 1 never exercised the CLAMP.** `scrollTop 900` is far below
   `scrollHeight - clientHeight` (≈2526 at `clientHeight` 488), so `planRestore`'s doc-shrink
   clamp path (`docsScrollRestore.ts:131`) — a WIP file rewritten shorter, a `git checkout` —
   is **unexercised live** and rests on unit tests alone. Cheap to add at WP5: truncate the doc
   on disk instead of appending.

**✅ BOTH GAPS CLOSED at verify-human (2026-08-02, operator: "all good").** The two items were
presented as checks only the operator could settle, and both were approved live:
- **Gap 1 (deferred-restore isolation)** — approved, with the discriminating instruction that a
  *substantial* height change is what separates a real restore from a browser-retained offset.
  So the WP5 carry is now **optional confirmation, not an open question**.
- **Gap 2 (doc-shrink clamp)** — approved live, so `planRestore`'s clamp path is no longer
  unit-test-only.

Also approved, and these are the two checks no fixture could have produced:
- **Jump-on-appear CONFIRMED as the right feel** (P3.verify-human.3) — a taste question, not a
  correctness one; the operator's WP3 call that "a new phase starting is worth landing on" holds
  in real use. **No narrowing of the trigger wanted.**
- **Dogfooded on THIS repo under real CC churn** (P3.verify-human.4) — many rapid writes inside
  the 200ms debounce, which is the actual `SURFACE-2026-07-07` use case and the one condition
  none of the automated verification reproduced. Tracks the edits, scroll holds, not flickery.

The audit also independently confirmed the strengths worth keeping: outcome 2 is a **two-sided**
check (stale absent AND the fallback doc's distinctive frontmatter positively identified, so it
is not merely "some text"); outcomes 3+4 form an adversarial pair that excludes both "the jump is
unconditional" and "the jump never fires"; and outcome 1's `scrollHeight 2972→3014` (+42px, one
line) with the marker present positively excludes the `setLoaded(null)` regression that produced
the empty panel.

### Re-verify gate (§6) — passed on the CLEANED source, from a fresh launch

⚠️ Deliberately re-driven **after** the telemetry was removed, because the outcomes above were
measured on the instrumented build — and this phase's whole lesson is that a source I have read
is not the same as a build I have observed. Fresh launch, `noTelemetryGlobals: true` verified in
the running app (proving the instrumentation is gone from the *build*, not just the file):

| check | value |
|---|---|
| panel not blank | `htmlLen: 16077` |
| markdown node present | yes |
| new marker rendered | yes |
| **scroll preserved** | **`scrollTop: 900`** (scrollHeight 2972→3014) |

**Bridge caveat (h), still valid:** any `webview_execute_js` that **touches**
`window.__TAURI_INTERNALS__.invoke` — patching OR calling — fails with `Script execution
timeout`. Broader than documented caveat (d), which assumed the invoke resolves and prescribed
fire-then-poll; here the eval hangs on the call itself. Observe via the DOM, or from outside the
app. (Window-global counters inside the component worked fine.)

<details>
<summary>In-flight trail — the "NOT YET FIXED" state (superseded, kept for provenance)</summary>

## Retrospect

- **What changed in our understanding:**
  1. **A pure-module extraction proves the module, not its caller.** This WP's headline method —
     extract behavioral logic so tests import and drive real code — is right and worked for all
     three modules. But it has a blind spot we hit *twice*: `pendingRestore.ts` was fully
     mutation-proven while **no caller dispatched `"reset"`**, and `shouldJump` was proven while
     the jump arm poisoned its own input. Both were *absences*, and a `?raw` guard can only
     enumerate shapes you thought of. Now a root-`CLAUDE.md` convention.
  2. **HMR can invalidate a verify RESULT, not just a diff.** An in-place edit to a component
     holding `useRef`/`useState` leaves hook state alive in a shape no code path in the new
     source can produce — strictly worse than the rename case, which at least fails loudly.
     Cost: four wrong theories and a telemetry sidebar, *with the existing memory already read
     and judged inapplicable*. The memory has been widened.
  3. **jsdom has no layout engine** — `clientHeight` is `0` for visible elements exactly as for
     `display:none` ones. Caught by probing *before* writing code, which changed the module's
     signature from the planned element-sniffing shape to injected geometry.
  4. **A phase whose only content is another phase's verification has no independent
     deliverable.** The integration-boundary rule forced this out into the open: Phase 4 was
     "go verify Phase 3", so it dissolved into Phase 3.

- **Assumptions that held:**
  - `pickInitialDoc` / `selectedDoc` needed no change — WP3 wrote both for this second caller,
    and that held (`selectedDoc` gained one optional parameter at the review refactor, not a
    rewrite).
  - `fs-change`'s `kind` is unusable for classification; diffing the re-listed doc set is
    correct **and** made the WBS's `notify`-coalescing question moot rather than answered.
  - The watcher does see `.session.md` (M6 WP6's ignore re-base), so the routine
    `/session-restore` disappear case was wireable.
  - `.docs-content` as the stable scroll box survived a content swap, as WP1 measured.

- **Assumptions that were wrong:**
  - *"The nonce fix didn't work."* It had. I was verifying inside a hot-patched tree.
  - *"Extracting the machine addresses the caller-honors-the-plan risk."* The verify-self
    subagent named that seam as the highest risk; I answered one level too low, and code review
    then found three defects in exactly that layer.
  - *"`chosen` is safe to write from the jump arm."* It made the first jump disable every later
    one — committed **one arm after** writing a comment forbidding the identical move for
    `refallback`.
  - *"jsdom can host the scroll tests as planned."*

- **Approach delta:**
  - **4 phases → 3.** Phase 4 dissolved into Phase 3 at an F9b integration-boundary back-loop.
  - **P2.1's signature changed from the plan** (injected `ScrollGeometry` value, not an
    `HTMLElement`), forced by the measured jsdom limitation.
  - **One extra module beyond plan:** `pendingRestore.ts`, added because the Phase 2 verify-self
    subagent named the hold-and-retry seam as the highest-risk part of the WP.
  - **A `reloadNonce` was needed** that the plan did not anticipate — `setLoaded(null)` cannot
    re-trigger an effect keyed on unchanged `selected`.
  - **A code-review refactor pass** (`966dca5`) followed ship: 1 CRITICAL + 2 MAJOR fixed in
    place. Not in the plan, and the CRITICAL means the feature shipped briefly self-disabling.
  - **Verification cost far exceeded the estimate.** WP4 was sized **S**; it consumed a
    telemetry sidebar, two adversarial subagent passes, five live MCP-bridge drives, and 25
    mutations. The *code* was S-sized; proving it was not.

## Code-Quality Review — m11-wp4-docs-live-reload

Reviewed against ship baseline `480052e` by `code-quality-reviewer` (fresh context, 37 tool
uses). **1 CRITICAL · 4 MAJOR · 4 MINOR.** The CRITICAL and MAJOR-1 were independently
CONFIRMED by the orchestrator against the source before acting (see verification note below).

### Strengths
- The three pure modules are the right response to this feature's own history: `decideReload`,
  `planRestore`/`captureScroll`, and `pendingNext` are total functions over injected values, so
  22 mutation-attributed probes assert behavior rather than source text.
- Diffing the re-listed doc set instead of reading `FsChange.kind` is correct and correctly
  argued: it makes the debounce-coalescing question moot rather than answered.
- `docsScrollRestore.ts`'s geometry-as-value split is good engineering under a measured
  constraint (jsdom's zero `clientHeight`), and the discovery was filed for repo-wide reuse.
- `docsPanelWiring.test.ts:110` rewrote a brittle single-line JSX assertion into a
  whitespace-flattened, four-prop, per-prop-mutation-proven guard.
- The `reloadNonce` fix and its rationale are honest and correct.

### Issues

**CRITICAL**
- [`DocsPanel.tsx:356`] **The `"jump"` arm latches the machine's answer into `chosen`** — the
  state whose declaration (line 102 / comment at 87) says "the USER's explicit pick." This is
  the exact move `docsReloadDecision.ts:60-64` forbids for `"refallback"` (*"would forge a fake
  user choice and suppress the next legitimate jump-on-appear"*), performed one arm earlier for
  the same reason it is forbidden. Since `shouldJump(chosen)` is `chosen === null`, **the first
  jump permanently disables every subsequent jump** for the life of the mount. Routine, not
  edge: `/session-handoff` creates `.session.md` → `/feature-plan` creates a `wip/*.md` →
  `/product-research` creates `research.md` yields ONE jump then a pinned panel. ⚠️ **The
  operator's verify-human approval of jump-on-appear was given against a mechanism that
  narrows itself after one firing.**

**MAJOR**
- [`DocsPanel.tsx:486`, `handleDocLinkClick.ts:128`] **Neither user-driven selection path
  dispatches `"reset"`** — only the two `fs-change` arms do. `pendingRestore.ts:62-69` defines
  that event specifically for "the selection changed to a different document,"
  `pendingRestore.test.ts:175` asserts it, and M22 mutation-proves it. A pending offset held
  across a user click survives into the new document; it is consumed harmlessly today only
  because `planRestore` clamps against a momentarily-empty container — correctness resting on an
  incidental clamp. This is the "machine proven, caller not" gap this WP's method commitment
  exists to prevent.
- [`DocsPanel.tsx:327`] **A fourth, unmodeled selection-change path.** `setDocs(next)` refreshes
  mtimes every event and `selected` derives from `pickInitialDoc(docs)` when unchosen, so a
  *sibling* wip edit can move the auto-selection while `decideReload` returned `"none"` — no arm
  ran, no scroll captured, no reset. `pickInitialDoc.test.ts` asserts both halves of this, so the
  pure layer knows; the panel layer does not model it. Reachable in any project with two wip
  files and no `.session.md`.
- [`DocsPanel.tsx:303-387`] **The reload runs regardless of `panelFront`.** A workspace whose
  user never opened the Docs tab still issues a `docs_list` per debounce window and a full
  `docs_read` per `"content"` decision, feeding a panel with `clientHeight: 0` — N workspaces ×
  ~5 IPC round trips/sec during exactly the CC-churn scenario the feature targets. `panelFront`
  was threaded for the retry trigger and never considered as a work gate; the argument was
  never made either way.
- [`DocsPanel.tsx:284-301`, `docsPanelWiring.test.ts:151-241`] **The structural arms cannot catch
  the findings above** (all three are missing-dispatch / missing-gate absences). The WIP's own
  honesty about this is the right call, but the conclusion drawn ("regression-guarded
  structurally + at unit level") overstates it: what is guarded is that *specific known-broken
  shapes* are absent. Two of three findings here are the residual class the WIP predicted, so
  the "WP5 drives this live again" mitigation is **load-bearing and a scheduled obligation, not
  a footnote.**

**MINOR**
- [`DocsPanel.tsx:309`] A **second** per-workspace `fs-change` listener, where
  `RightPanelHost.tsx:315-317` documents the opposite pattern ("reuse the same single
  per-workspace listener instead of a second one in `EditorSplit`"). Defensible (lazy chunk,
  self-contained) but the deviation is unacknowledged, leaving the next consumer two
  conflicting precedents.
- [comment density — **THIRD consecutive flag**, WP2 and WP3 both raised it and WP3 noted it had
  grown] Now specific: worst offenders are `DocsPanel.tsx:208-222` (15 comment lines for one
  `useState(0)`, restating the P3.5 incident already in this WIP) and `DocsPanel.tsx:113-151`
  (39 contiguous comment lines above a 24-line effect, with two separate accounts of the same
  latch bug, one duplicating `fetchLatch.ts`'s own header). Module headers earn their length;
  the *incident retellings* do not. **Reviewer's judgment: this has crossed from stylistic to
  functional — the two genuine gaps sit inside the densest region of the file.** Rule worth
  adopting: state the invariant and the forbidden shape at the code, cite the WIP for narrative.
- [`DocsPanel.tsx:293`] `plan.apply && el !== null` — the second conjunct is unreachable as a
  condition (exists only for `tsc` narrowing); a note or a restructure would stop a reader
  inferring that `apply: true` with a null element is a real state.
- [`DocsPanel.tsx:372-375`] The reload path swallows a `docs_list` failure with no `setError`
  while the initial fetch surfaces it. Keeping the list is right, but the asymmetry means a
  permanently-unreadable doc dir reads as "nothing is changing," against the file's own
  "surfaced, never swallowed" convention.

### Assessment
Strong, disciplined work with one real hole. The decomposition is not over-split — each module
owns a distinct question and `pendingRestore.ts` earns its 27 executable lines because the
property it encodes is one a hook gets wrong silently. Where the WP falls short is the seam it
*identified* as highest-risk and then addressed one level too low: extracting the machine proved
the machine, while the caller fails to dispatch `reset` on the two paths the machine documents,
latches a machine-generated selection into state labelled "the user's explicit pick"
(self-disabling the headline behavior), and lets a fourth path bypass the decision matrix. All
three are absences, invisible to structural arms, and exactly the residual risk the WIP predicted
— a point for candor, a point against the claim that the boundary was adequately mitigated. Net:
the codebase is advanced by the pure modules and the testing posture, and accrues small debt in
the wiring layer that a short follow-up would clear.

### Orchestrator verification (2026-08-02)
The CRITICAL and MAJOR-1 were **not taken on trust**. Confirmed against source before routing:
`DocsPanel.tsx:356` is `setChosen(decision.selected)` inside the `"jump"` arm;
`shouldJump` is `chosen === null`; `grep 'type: "reset"'` returns **only** lines 354 and 365
(both `fs-change` arms) while `setChosen` call sites include the row click (487) and the link
handler (`handleDocLinkClick.ts:128`), neither of which dispatches it. Both findings stand.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`feature-finalize` archives the WIP.

## Phase 3 verify-codify (2026-08-02)

**Coverage audit of the 4 operator-approved behaviors** — three were already covered and were
NOT duplicated: deferred restore (17 assertions across `pendingRestore.test.ts` +
`docsScrollRestore.test.ts`), doc-shrink clamp (2 cases), jump-on-appear + explicit-pick veto
(24 assertions in `docsReloadDecision.test.ts`).

**One real gap, and it was the most important one:** the **rapid-CC-churn** behavior the operator
dogfooded (P3.verify-human.4) had **zero coverage**. Every other test drives one tidy cycle, and
the live checks mutated a fixture by hand at a controlled pace — nothing exercised many writes
in and around the 200ms debounce, which is precisely what `SURFACE-2026-07-07` describes. Four
tests added to `pendingRestore.test.ts` (20 total in that file):

- a burst of holds before any apply keeps the offset (no drop, no junk accumulation)
- a 10-batch alternating hold→apply burst converges to idle, offset consumed exactly once
- **a burst landing entirely while HIDDEN** holds through 8 deferrals, then applies (the dogfood
  case crossed with the hidden-panel case)
- **a reset mid-burst** (reader switches docs while CC writes) drops the stale offset — otherwise
  an in-flight restore would scroll them into the previous doc's position

**Mutation-proven** (2 mutations, each landed in executable code):

| # | Mutation | Result |
|---|---|---|
| M21 | `hold(null)` clobbers a held offset | **2 failed** — incl. the new hidden-burst case |
| M22 | `reset` becomes a no-op | **1 failed** — the new mid-burst doc-switch case, previously uncovered |

### ⚠️ Integration-boundary rule: consuming-surface TEST is not achievable in CI today

The boundary applies (`DocsPanel.tsx` + `RightPanelHost.tsx` are live UI), and the rule asks for
a test exercising the consuming surface end-to-end **in addition** to unit coverage. Stated
plainly rather than papered over: **this repo has no E2E harness** — `package.json`'s `test` is
`vitest run`, there is no Playwright dependency and no `tests/` dir, and the consuming surface is
a **native WKWebView** reachable only through the dev-only MCP bridge (which is agent/operator-
driven, not CI-runnable). Adopting an E2E harness is a real decision this WP has no mandate to
make (cf. `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`, still open).

**What discharges the boundary in practice, and its honest tier:**
1. **The live MCP-bridge drive at P3.5** — 5/5 outcomes on the real WKWebView with recorded
   measurements. Real end-to-end proof, but a **one-off run, not a regression test**.
2. **Operator verify-human 4/4**, including the dogfood on this repo under real CC churn.
3. **30 structural wiring assertions** in `docsPanelWiring.test.ts` (CI-runnable) — these pin
   that the panel *is wired* (call shapes, props threaded, nonce in deps, `.docs-content` owns
   overflow) but **cannot prove it works**; that distinction is this WP's central lesson.

So: the behavior is proven live and by the operator, and **regression-guarded structurally +
at unit level, not end-to-end**. The residual risk is a future change that keeps every call
shape intact while breaking runtime behavior — exactly the class that bit this phase. WP5
(milestone-exit verify) drives this surface live again, which is the practical mitigation.

## ⚠️ P3.5 LIVE PROBE — BLOCKING DEFECT FOUND, NOT YET FIXED (2026-08-02)

**The live drive did exactly what it exists for: it found a defect every structural gate
missed.** `tsc` 0, lint 0, **1716 unit tests**, a clean build, and **seven mutation-proven
wiring arms** were all green while the feature was broken in the most visible way possible.

### The symptom (measured, isolated)
On an `fs-change` to the selected doc, `.docs-content` goes **completely empty** and never
recovers. Sampled at 100ms through the event:

| sample | html len | markdown node | selection | rows |
|---|---|---|---|---|
| i=0 | **18524** | yes | `docs-row-wip` | 6 |
| i=10 (after the disk write) | **0** | no | `docs-row-wip` | 6 |

**Isolated by control:** clicking the same doc with **no disk change** renders and stays stable
across 9 samples (html 18524). So the render path is healthy — the reload path is the cause.
The list and the selection stay perfectly correct throughout, which is what makes this invisible
to every structural assertion.

### Where it lands
`current` is `null` after the reload → `docContentView` returns **`"loading"`** → the JSX
renders `DocMarkdown` only for `"content"`, so **`"loading"` renders nothing at all**. Verified
live: `contentHtmlLen: 0`, no `[data-testid='doc-markdown']`, no error node, selected path
present and valid in the list.

### Two fix attempts, BOTH insufficient — do not re-try either
1. **`setLoaded(null)` to "re-trigger" the fetch** (the shipped first version). Cannot work:
   the content effect keys on `selected`, which is unchanged on a content edit, so nothing
   re-fires and the panel is left contentless. It also violated WP3's explicit invariant that
   `loaded` is stored with its path and derived, never reset in an effect.
2. **A `reloadNonce` in the content effect's deps** (current state of the code). Verified
   present in the served bundle (`curl` of the Vite module shows both
   `}, [selected, projectPath, reloadNonce]);` and `setReloadNonce((n) => n + 1);`) — and the
   blanking **still reproduces identically**. So the nonce is necessary-but-not-sufficient; the
   mechanism by which `loaded` fails to land for the re-read path is still unidentified.

### Status
**Unresolved. Three static theories, three misses** — the honest next step is the
`/debug-empirical-telemetry` sidebar (§4b's stated trigger: runtime evidence needed, static
reasoning stalled ≥3 attempts), instrumenting the actual `setLoaded`/`current` transition rather
than reasoning from the source a fourth time.

**A regression guard IS in place and mutation-proven** (`docsPanelWiring.test.ts`): it forbids
`setLoaded(null)`, requires `setReloadNonce`, and requires `reloadNonce` in the content effect's
deps — restoring the broken shape fails it 1/29. That guard is correct and worth keeping
regardless of how the remaining bug is fixed.

**Bridge caveat found (h):** any `webview_execute_js` script that **touches
`window.__TAURI_INTERNALS__.invoke`** — patching it OR calling it — fails with
`Script execution timeout`. This is broader than the documented caveat (d) (which assumed the
invoke resolves and prescribed fire-then-poll): here the eval hangs on the call itself, so
fire-then-poll does not rescue it. IPC-level telemetry from inside the webview is therefore
unavailable; observe via the DOM instead, or from outside the app.

**Environment left clean:** driver session stopped, dev app + Vite killed **PID-scoped** after
verifying `ps` identity (never a blanket `pkill` — `[[verify-self-dev-vs-prod-process-name-collision]]`),
ports 1420/9223 confirmed free, no surviving `target/debug/claudesk`, and the `scratch-a`
fixture (`workflow-system/`) removed — `git status` in that repo is clean.

</details>

## Phase 3 boundary back-loop (F9b, 2026-08-02) — verify-self did NOT run

**Why.** Phase 3 has an **integration boundary** (rule condition 2): it modified
`DocsPanel.tsx` and `RightPanelHost.tsx`, both backing existing live UI, and user-visible
behavior changed. The rule then requires **at least one Observable Outcome citing the consuming
surface by name**, and states that an outcome exercising only the new module does not satisfy
it. Phase 3's five outcomes are all source-text / test-suite / build checks — **none drives the
panel**. Per the rule the verification subagent was **not spawned**; back-loop instead.

**This is right on the merits, not just procedurally.** Everything Phase 3 proves today is
*structural*: that the source contains certain call shapes, that 1716 unit tests pass, that it
compiles and bundles into the expected chunks. **Nothing demonstrates the panel actually
reloads.** The `?raw` arms I mutation-proved confirm the wiring is PRESENT; they cannot confirm
it WORKS — the exact distinction this WP has already paid for twice
(`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`). A subscription that never
fires, a decision applied against a stale ref, or a restore running before React commits would
each pass all five outcomes.

**Resolution — MERGE Phase 4's live outcomes into Phase 3 rather than duplicating them.** The
plan already has the right checks; they were parked one phase too late. Phase 4 as written is
"go verify what Phase 3 built", which is an artificial split: the boundary rule wants the live
proof attached to the phase that *creates* the boundary, and a phase whose entire content is
another phase's verification has no independent deliverable. So Phase 4's five Browser/CLI
outcomes move up into Phase 3, Phase 4 is dissolved, and WP4 becomes a 3-phase feature.

**Consequence for the WBS:** task 4.4 ("verify self, MCP bridge, scratch workspace") is
unchanged in substance — it is now discharged inside Phase 3 instead of a phase of its own.
Classification: **Obsolete test** — the assertion encodes a source-FORMATTING accident, not the
behavior it means to guard. It is a `?raw` guard matching the single-line JSX string
`"<DocsPanel projectPath={projectPath}"`; adding two props (`workspaceId`, `panelFront`) made
Prettier reflow the element to multi-line, so the substring no longer exists while the prop is
still passed correctly.
Confidence: **high** — one plausible explanation, verifiable in one line: the source now reads
`<DocsPanel\n  projectPath={projectPath}\n  …`, `tsc` passes (a missing required prop would be
a compile error), and the prop is visibly present at `RightPanelHost.tsx:1267`.
Evidence: `docsPanelWiring.test.ts:111` asserts a formatted multi-line-sensitive substring —
**the exact failure mode `CLAUDE.md` documents** ("another silently stopped matching after
Prettier reflowed the file… If a `?raw` guard is unavoidable, assert single identifiers — never
formatted multi-line expressions"). WP2 already paid for this once in this same file.
Action: rewrote the assertion to be reflow-proof — assert the prop-passing on a
whitespace-flattened haystack (`[[raw-guard-jsx-prose-needs-flattened-haystack]]`), and extend
it to cover all FOUR props now threaded, since two of them (`workspaceId`, `panelFront`) are
what WP4's live reload and deferred restore depend on. Mutation-proved after the rewrite: each
of the four props, deleted individually from the mount site, fails the guard.

## Test Triage

⚠️ The entry above ("passes projectPath down…", from the Phase 3 build) belongs to this section
— its `## Test Triage` heading was lost in a later full-file rewrite of this WIP. Recorded here
so the artifact is greppable, per the hard rule that no test may be modified without one.

### docsPanelWiring.test.ts › "derives the selection from the user's pick OR pickInitialDoc"
Classification: **Obsolete test** — the refactor intentionally supersedes the exact call shape it
pins. It asserts the literal `selectedDoc(chosen, docs)`; the CRITICAL fix adds a third precedence
tier, so the call is now `selectedDoc(chosen, docs, jumpedTo)`. The *property* the arm exists for
("the selection is COMPUTED, never written by an effect; the component routes through the
`selectedDoc` seam") is unchanged and still true.
Confidence: **high** — one plausible explanation, one sentence: the arm hard-codes an argument
list the fix deliberately widened.
Evidence: the arm's `toContain("selectedDoc(chosen, docs)")` vs. `DocsPanel.tsx:224`, now
`selectedDoc(chosen, docs, jumpedTo)`.
Action: widen to the call-shape prefix `selectedDoc(chosen, docs` (still proves seam routing, no
longer pins arity) **and** add an arm asserting `jumpedTo` is passed, so the new third tier is
itself guarded rather than silently unpinned. Mutation-proved after the edit.

### docsPanelWiring.test.ts › "stores the user's explicit pick separately from the computed selection"
Classification: **Obsolete test** — same cause, and the finding it was written to prevent is the
one this refactor fixes. It asserts `setChosen(entry.rel_path)` at the row click; the MAJOR-1 fix
routes **all** user selection through one `chooseDoc(relPath)` so the `"reset"` dispatch cannot be
forgotten at a call site.
Confidence: **high** — the string it matches was deliberately replaced; the arm's stated intent
("a row click records intent") is satisfied *better* by the new shape.
Evidence: the arm's `toContain("setChosen(entry.rel_path)")` vs. the row click, now
`onClick={() => chooseDoc(entry.rel_path)}`.
Action: rewrite around the new invariant — the row click goes through `chooseDoc(`, and
`chooseDoc` is the SINGLE writer of `setChosen` for user-driven selection. Strictly stronger than
the original: it pins the property whose absence *was* MAJOR-1. Mutation-proved after the edit.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-02] Phase 2 / P2.1 — **jsdom reports `clientHeight === 0` for VISIBLE and
hidden elements alike (no layout engine), while `scrollTop` is a plain writable property.**
Any Claudesk test whose property depends on element geometry (visibility, size, overflow,
scroll position, `getBoundingClientRect`) therefore cannot distinguish laid-out from
display:none in vitest+jsdom — a guard keyed on measured geometry will pass **vacuously**.
The pattern that works: take geometry as an injected value, keep the DOM read to one thin
function, and verify the read itself live (MCP bridge). Relevant well beyond this WP — the
repo has no component-render harness (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`),
so jsdom is the default reach for anything DOM-shaped. Logged to backlog.
