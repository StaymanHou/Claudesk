---
stage: ship
state: complete
drive_mode: autopilot
wp: "M11 WP5 — Milestone-exit verify"
milestone: "Milestone 11: Workflow-docs markdown viewer"
created: 2026-08-02
---

# Feature: M11 WP5 — Milestone-exit verify

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-08-02

## Problem Statement

M11's WP1–WP4 are shipped, closed, and archived: the Docs panel exists as the gated fourth
`RightPanelHost` panel with an auto-discovered workflow-ordered doc list (WP2), renders read-only
formatted markdown with auto-select-on-open and link navigation (WP3), and live-reloads on
`fs-change` with scroll preserved (WP4). **Nothing has yet driven the roadmap's exit criterion
end-to-end as one continuous sequence on a real project** — each WP verified its own slice against
its own outcomes, which is not the same claim. WP5 produces that verdict.

WP5 is **verification-only** (WBS: *"probe (verification-only; produces the M11 exit verdict, no new
software)"*). The exit criterion to be driven, verbatim from `roadmap.md`:

> From any workspace, the `Docs` tab renders that project's conventional product/workflow docs as
> formatted, scrollable, link-navigable markdown, read-only, with no external editor pop — and a
> live on-disk change re-renders in place without jumping scroll to the top.

Plus the two operator decisions locked at the WBS: **auto-select-on-open** (most-downstream-wins)
and the **workflow-ordered doc list**.

**⚠️ WP5 inherits four carries from WP4's close that are NOT in its written task list** (source:
the WP4 close notes + `backlog-quality-findings.md` → `m11-wp4-docs-live-reload`). Two are live
experiments that WP4's operator-approved verify-human could not isolate; one is an operator behavior
call on a MAJOR finding; one is a readability finding flagged a third consecutive time:

- **(a) Deferred-restore isolation — the decisive experiment was never run.** The docs slot hides
  via `display:none` on a **never-unmounted** node, so observing `scrollTop === 1200` on return to
  the panel is consistent with *either* `pendingRestore` firing *or* WebKit simply retaining the
  offset on a still-mounted element. WP4's live check cannot tell those apart. The isolating
  experiment: mutate `pendingNext`'s `"deferred"` arm to return `NO_PENDING` (i.e. drop the held
  offset) and re-drive the same live sequence. If the offset still returns as 1200, the restore was
  never load-bearing and the WP4 outcome was **vacuous**; if it returns 0, the restore is proven.
  This is the `[[verify-the-mutation-landed]]` discipline applied to a live-app observation rather
  than a test.
- **(b) Doc-shrink clamp — never exercised.** Every WP4 live check *appended* to the fixture doc, so
  the restored offset never approached `scrollHeight - clientHeight`. The clamp path (restore an
  offset larger than the shrunken doc can scroll to) is unverified. Truncate the doc instead of
  appending.
- **(c) `SURFACE-2026-08-02-QUALITY-WP4-SIBLING-EDIT-MOVES-AUTOSELECTION` (MAJOR, medium, unfixed)
  — needs an operator behavior call before any code.** A **fourth, unmodeled selection-change path**:
  `setDocs(next)` refreshes mtimes on every `fs-change`, and `selected` derives from
  `pickInitialDoc(docs)` while `chosen === null`, so editing a *sibling* wip file can move the
  auto-selection even though `decideReload` returned `"none"` — no arm ran, no scroll was captured,
  no `"reset"` dispatched. Reachable with two `wip/*.md` files and no `.session.md`. The refactor
  skill's scope guard correctly left it: a fix means modeling a **fifth** response in the decision
  matrix, which is design work. Two candidates in the finding: **(a) treat an auto-selection move as
  a `"jump"`** (consistent with jump-on-appear, gets reset semantics free) or **(b) pin the
  auto-selection once resolved** so only appear/disappear can move it (fewer surprises, but the panel
  stops tracking "the wip I'm actually in", which is `pickInitialDoc`'s whole purpose).
- **(d) Comment density flagged a THIRD consecutive time** (WP2 → WP3 → WP4), now judged *functional
  rather than stylistic* by the reviewer: both genuine WP4 defects sat inside the densest region of
  the file. Named offenders: `DocsPanel.tsx:208-222` (15 comment lines for one `useState(0)`) and
  `DocsPanel.tsx:113-151` (39 contiguous comment lines above a 24-line effect, containing two
  separate accounts of the same latch bug, one duplicating `fetchLatch.ts`'s own header).

**⚠️ CORRECTION at P1.1 (2026-08-02) — carries (a) and (b) are SOFTER than stated above.** The
inventory read `workflow-system/state/archive/m11-wp4-docs-live-reload.md` → "Two evidence gaps",
which records: **"✅ BOTH GAPS CLOSED at verify-human (2026-08-02, operator: 'all good')."** Gap 1
(deferred-restore isolation) was approved with a discriminating instruction — *a substantial height
change is what separates a real restore from a browser-retained offset* — making the WP5 carry
**"optional confirmation, not an open question."** Gap 2 (doc-shrink clamp) was **approved live**, so
`planRestore`'s clamp path is **no longer unit-test-only**. The handoff note (and this plan's first
draft) carried both as open; they are not. Recorded because a reader would otherwise re-litigate
settled operator approvals.

**Both are still worth driving at Phase 2, for a reason that survives the correction.** The argument
that closes gap 1 is an *inference* about WebKit — that the recorded `scrollHeight` 2972/3014 → 3152
swap-while-hidden would have clobbered a browser-retained offset — not a measurement of it. The
mutation experiment (`"deferred"` → `NO_PENDING`) remains the only decisive discriminator, and Phase
2 has the surface open anyway, so it costs one extra live sequence. **What changes is the disposition
of a negative result:** if the mutated run still restores, that does not overturn an operator
approval — it means the *evidence* for a proven-load-bearing restore was weaker than recorded, which
is a documentation correction plus a `SURFACE-`, not a WP4 regression. Phase 2's outcomes are worded
to accept either result; this note fixes what a failure would *mean*.

**Scope discipline.** WP5's deliverable is a **recorded verdict**, not software. Carries (a) and (b)
are *observations* — they change the confidence in what WP4 shipped, and a failure there is a
finding, not automatically a fix inside WP5. Carry (c) is an operator decision that may or may not
produce code in this WP. Carry (d) is a judged-functional readability item on a file WP5 will
already have open. Phases 2 and 3 exist so a **negative** finding is recorded and dispositioned
rather than silently absorbed into a GO verdict.

**No 3rd-party dependency** — WP5 adds no service, API, or SDK. WP1 already probed and settled the
one net-new dependency (the renderer). No probe gap.

## Work Tree

- [x] Phase 1: Drive the M11 exit criterion end-to-end (live, MCP bridge)  <!-- status: done 2026-08-02 — every exit-criterion clause driven live and PASS; verify-human 5/5 operator-approved -->
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0; `pnpm lint` reports 0 errors; `pnpm test` passes with the pre-WP5 count as the floor (≥1723 frontend tests / ≥140 files); `pnpm format:check` clean; `pnpm vite build` exits 0 with `DocsPanel` still emitted as its **own lazy chunk** (grep the build output for a `DocsPanel-*.js` asset line) — the gate-OFF-costs-nothing property must survive the milestone close.
  - CLI: with `workflow_features_enabled` OFF, `pnpm test src/state/__tests__/offInvariantGuard.test.ts` passes — including its meta-tests (reach + offender predicate as a value, pinned by M11.5 WP4), proving M11's landed Docs surface did not narrow the guard to fit.
  - Browser (live app, `mcp__tauri__webview_*` against the real WKWebView on a scratch workspace seeded with a real doc set): with the gate **ON**, opening a workspace shows a **Docs** tab in the `right-panel-toggle` row, and `⌘⇧`-chord + click both select it. DOM snapshot contains the Docs panel container; the panel is the default/first panel per the WP3 operator call.
  - Browser: the doc **list** renders in workflow order — `vision → roadmap → wbs (+ *wbs* scratch/parked) → wip/* → backlog (+ quality-findings) → .session.md → arch · research · context · design-priors · transitions` — read the rendered row order out of the DOM (`webview_execute_js` mapping the list items to their `rel_path`s) and assert it equals the order `docsOrder`'s pure function produces for that same file set. Absent files silently missing, not rendered as empty rows.
  - Browser: **auto-select-on-open lands on the most-downstream artifact.** With `.session.md` present in the fixture, the panel opens rendering `.session.md` with no click. Then remove it and re-open → lands on the wip file, not on `vision.md`. (This directly re-verifies the direction that the WBS flags as the one a reader inverts.)
  - Browser: **render fidelity** on a real doc containing a Work-Tree — count `input[type=checkbox]` in the rendered DOM and assert it equals the source's `- [ ]`/`- [x]` count (the WP1 method: assert the *parsed live DOM*, never source text); assert `table`, `pre code`, and `h1..h3` elements are present; assert the frontmatter renders as the styled header block (a container element, **not** an `<hr>` + setext `<h2>` — the WP1-measured mangling shape).
  - Browser: **read-only** — zero `textarea`, zero `[contenteditable]`, zero `input` other than the disabled task-list checkboxes inside the rendered doc container; and no `docs_write`-shaped command exists (`grep` the Rust invoke handler).
  - Browser: **link navigation, all four `classifyHref` classes.** In-doc `#anchor` → panel `scrollTop` changes and the webview `location.href` is unchanged; cross-doc `wbs.md` → selected doc switches (rendered content changes, list selection moves); external `https://` **and** protocol-relative `//host` → webview `location.href` unchanged (no hijack) and no navigation event; `[[slug]]` → renders as inert literal text with **no** `<a>` emitted (the WP1-measured, deliberately-unhandled shape).
  - Browser: **no external editor pop** — after the whole sequence, `pgrep -x "Sublime Text"` and `pgrep -x "Sublime Merge"` report no *new* PIDs versus a baseline captured before the run.
  - Browser: **scroll-preserving live reload** — render a long wip doc, scroll to a mid-file offset (e.g. 1200), append to the file on disk → the rendered content updates (new text present in DOM) **and** `scrollTop` is still 1200 (not 0). Sampled via a `setInterval` recorder installed before the mutation, so an intermediate jump-to-top-then-restore is caught rather than missed by a single post-hoc read.
  - Console: no JS errors in the webview during the entire sequence (`read_logs` / console capture clean of `Error`/`Uncaught`).
  - [x] P1.1 Read the WP2/WP3/WP4 archived WIPs' verify sections to inventory exactly which outcomes were already driven live and which were carried — so Phase 1 drives the *criterion*, not a re-run of three WPs.  <!-- status: done — inventory below; corrected the (a)/(b) carry status in the Problem Statement -->

    **P1.1 inventory (2026-08-02).** Read `m11-wp2/wp3/wp4` archives' verify sections.

    *Already driven live on the real app (do NOT re-litigate; Phase 1 re-drives only as part of one
    continuous sequence):*
    - **WP2** — Docs tab appears, `⌘⇧K` chord + click both select it, list shows the right files in
      the right order for a real project (verify-self 6/6 live PASS, 5 of 6 mutation-proven).
    - **WP3** — panel opens on a rendered doc with no click; landing doc is the correct rank;
      frontmatter header block legible with no mangling; Work-Tree task lists / tables / code
      legible; cross-doc link switches doc; external link opens the browser with the webview
      unchanged; in-doc anchor scrolls within the panel; explicit pick never overridden; `[[slug]]`
      inert (operator accepted). Operator PASS across all three phases' verify-human.
    - **WP4** — all five reload behaviors PASS on a freshly-launched app: content reload with
      `scrollTop` held at **900** (scrollHeight 3014→3060); `.session.md` disappear → fallback with
      `rendersStaleSessionText: false`; appear → jump *and* render; explicit pick held; hidden-panel
      deferred restore to exactly **1200** at `clientHeight: 0`.

    *NOT driven by any WP — this is Phase 1's real work:*
    1. **The criterion as ONE continuous sequence.** Every result above was produced on its own
       fixture in its own app launch, verifying that WP's slice. "Each slice passed separately" is a
       weaker claim than the exit criterion, which is a single end-to-end assertion.
    2. **"No external editor pop"** — a clause of the criterion **no WP ever checked**, because none
       had a reason to. Needs the Sublime PID baseline/after comparison.
    3. **The gate-OFF half, live.** WP2 proved the gating in tests + the OFF-invariant guard; the
       live "gate off → zero Docs surfaces in the DOM, chord inert" pass was never driven.
    4. **List order asserted against `docsOrder`'s own output** rather than read and eyeballed —
       makes the ordering outcome mechanical instead of a human comparison.
  - [x] P1.2 Build the scratch fixture: seed `tmp/scratch/scratch-a` with a realistic `workflow-system/` doc set (a `vision.md`, `roadmap.md`, `wbs.md`, two `wip/*.md` with distinct mtimes, `backlog.md`, a `.session.md`, `arch.md`, `design-priors.md`) — at least one long enough to scroll past 1200px, at least one carrying a real Work-Tree, a table, a fenced code block, frontmatter, and all four link classes + a `[[slug]]`. Record the fixture's construction so Phase 2/3 reuse it rather than rebuild it.  <!-- status: done — 11 files; see the manifest below -->

    **Fixture manifest (`tmp/scratch/scratch-a/`, 11 files, untracked in that repo — removed at P3.5 teardown).**
    Deliberately **absent**: `research.md` and `context.md`, so the silent-absent-no-op path is
    exercised rather than assumed.

    | Path | Role in the checks |
    |---|---|
    | `workflow-system/product/vision.md` | lowest rank — landing here on open means the ranking is inverted |
    | `workflow-system/product/roadmap.md` | third-from-last `pickInitialDoc` fallback |
    | `workflow-system/product/wbs.md` | **178 lines**, the render-fidelity + link target: frontmatter, h1/h2/h3, a 4-row table, a fenced `ts` block, a Work-Tree with **11 checkboxes (2 checked)**, all four link classes + one `[[slug]]`, and 60 filler paragraphs so 1200px is comfortably mid-range |
    | `workflow-system/product/arch.md` | low-ranked click target for the explicit-pick-not-overridden check |
    | `workflow-system/product/design-priors.md`, `transitions.md` | two tail-of-order members, so the ordering assertion places more than one |
    | `workflow-system/state/backlog.md`, `backlog-quality-findings.md` | adjacent-pair ordering |
    | `workflow-system/state/wip/older-feature.md` (mtime …027) | the **loser** of the mtime race |
    | `workflow-system/state/wip/newer-feature.md` (mtime …029) | the **winner** when no `.session.md` exists |
    | `workflow-system/state/.session.md` (mtime …030) | **top rank**; carries `SESSION-FIXTURE-MARKER-A1` so the disappear→fallback check can positively identify *stale vs. fresh* text rather than merely "some text changed" |

    Two wip files with **1.2s-separated** mtimes is what makes the Phase 3 sibling-edit
    reproduction observable at all — a single-wip fixture cannot show an auto-selection *move*.
  - [x] P1.3 Run the static gate (tsc / lint / test / format:check / vite build + the lazy-chunk grep + the OFF-invariant guard).  <!-- status: done — all green; measurements below -->

    **P1.3 static gate (2026-08-02) — ALL PASS.**

    | Check | Result |
    |---|---|
    | `./node_modules/.bin/tsc --noEmit` | exit **0** *(not `pnpm exec tsc` — `[[pnpm-exec-shadows-local-binaries]]`: it exits 0 regardless)* |
    | `pnpm test` | **1723 passed / 140 files** — exactly the handoff baseline, zero drift |
    | `pnpm lint` | **0 errors** (1 pre-existing `XtermPane` `exhaustive-deps` warning, documented + tolerated) |
    | `pnpm format:check` | clean |
    | `pnpm vite build` | exit 0, `✓ built in 1.33s` |
    | **lazy-chunk property** | **`DocsPanel-DosKRyyC.js` = 171.20 kB, its own chunk**; `main` = **440.53 kB** (not ~606 kB) — WP3's lazy-load has not regressed, so gate-OFF still costs nothing |
    | OFF-invariant guard | **14/14**, run with `--reporter=verbose` to confirm the meta-tests ran **by name** rather than trusting a file-level pass |

    **The two meta-tests that matter for a milestone close both ran and passed:** *"the chord arm's
    content selector reaches `panelHost.ts` and does not shrink"* (M11.5 WP4's pin) and *"the panel
    set is genuinely gate-DERIVED, not a constant that ignores the gate."* **M11 landed its Docs
    surface without narrowing the guard to fit** — which is the property M11.5 WP4 was paid to
    protect, and it is now positively demonstrated rather than assumed.

    **Read-only, statically:** the Rust invoke handler registers exactly **two** docs commands,
    `docs_list` and `docs_read` (`lib.rs:468-469`), both `-> Result<…>` reads. A grep for
    `fn docs_(write|save|edit|create|delete|remove)` across `src-tauri/src/` returns **nothing**.
    So "the viewer never writes to disk" holds at the command surface, not merely in the UI.
  - [x] P1.4 Launch `pnpm tauri:dev` (background) + `mcp__tauri__driver_session{start, port:9223}`; open the scratch workspace with the gate ON. Drive the criterion in the order listed in the outcomes above, capturing evidence per outcome (DOM reads, screenshots, the scroll sampler).  <!-- status: done — every clause PASS; measured evidence below -->

    **P1.4 live drive (2026-08-02) — the exit criterion as ONE continuous sequence. ALL PASS.**
    Real WKWebView, `__TAURI_INTERNALS__` present, gate read as `true` before starting.

    | Criterion clause | Result | Measured |
    |---|---|---|
    | Docs tab exists + is first | **PASS** | `panel-tab-docs` present; tab row `"DocsEditorDiffTerminal"` |
    | Doc list = the project's conventional docs | **PASS** | **11/11** fixture files; absent `research.md`/`context.md` silently missing, **no empty rows** |
    | **Workflow-ordered** | **PASS (mechanical)** | live order == `orderDocs()` on a **shuffled** input, asserted in a throwaway vitest harness (2/2, incl. a non-vacuity check that the input was not pre-sorted); harness removed after |
    | **Auto-select on open** | **PASS (two-sided)** | `.session.md` `aria-selected="true"` with **no click**; content carried `SESSION-FIXTURE-MARKER-A1`, so it rendered *that* file rather than "some text" |
    | Frontmatter as styled header block | **PASS** | **1** frontmatter block, **0 `<hr>`** — not the WP1-measured `<hr>`+setext-`<h2>` mangling shape |
    | Task-list checkboxes | **PASS** | **11 rendered / 2 checked** — exactly the source `grep` counts; **all `disabled`** (non-interactive) |
    | Tables · code · headings | **PASS** | 1 table / 5 rows · 1 `pre code` · h1=1, h2=4, h3=1 |
    | **Read-only** | **PASS** | 0 `textarea`, 0 `[contenteditable]`, 0 non-checkbox `input` |
    | In-doc anchor | **PASS** | `#work-tree` → panel `scrollTop` 0 → **881**; target id **exists** (WP3's heading-id fix holding); `location.href` unchanged; **`window.scrollY` 0** (panel owns the scroll container, page did not move) |
    | Cross-doc link | **PASS (two-sided)** | `roadmap.md` → selection moved to `docs-row-roadmap`, new text present **and old text GONE** (`stillRendersWbs: false`) |
    | External `https://` **and** protocol-relative `//` | **PASS** | both clicked; `location.href` **unchanged**, `beforeunload` never fired, doc unchanged — no webview hijack (the protocol-relative case a naive `startsWith("http")` misroutes) |
    | `[[slug]]` inert | **PASS** | renders as literal text, **no `<a>` emitted** — the WP1-measured shape, on the live DOM |
    | **Scroll-preserving live reload** | **PASS (trajectory, not a single read)** | scrolled to **1200** (of `scrollHeight` 5662 / `clientHeight` 423), appended on disk → marker rendered, `scrollHeight` **5662 → 5754** (content genuinely swapped), sampler trajectory **`[1200, 1200]`**, **`everHitZero: false`, `minTop: 1200`** |
    | **No external editor pop** | **PASS** | `pgrep -x "Sublime Text"`/`"Sublime Merge"` — **none** at baseline, **none** after the full sequence |
    | No error surfaces | **PASS** | `docs-panel-error`, `docs-content-error`, `docs-link-note` all null |

    **Why the reload evidence is stronger than WP4's.** A single post-hoc `scrollTop` read cannot
    distinguish "held at 1200" from "jumped to 0 and was restored to 1200". The 25ms sampler was
    armed *before* the disk write and recorded the full trajectory: the offset **never left 1200**,
    while `scrollHeight` changed underneath it. That is in-place re-render, positively observed.

  - [x] P1.5 Confirm the gate-OFF half of the criterion live: turn `workflow_features_enabled` OFF in Settings, then assert zero Docs surfaces in the DOM (no tab, no panel container) and that the chord is inert. ⚠️ **Do NOT hash `~/.claude/` across a relaunch** — `hook_install` legitimately rewrites `settings.json` at launch (universal subsystem); if any `~/.claude/` claim is made, hash around the *toggle* only.  <!-- status: done — OFF→ON round trip, two-sided -->

    **P1.5 gate-OFF half (2026-08-02) — PASS, and made two-sided.** This is one of the four things
    **no WP drove live** (P1.1 inventory): WP2 proved the gating in tests + the OFF-invariant guard,
    but the live "gate off → nothing there" pass had never been run.

    | Step | Result |
    |---|---|
    | `workflow_set_features_enabled {enabled: false}` | ok |
    | Docs surfaces in the DOM | **0** — `panel-tab-docs` 0, `docs-panel` 0, `docs-list` 0, `docs-content` 0, and **zero** `docs`-bearing testids anywhere; tab row `"EditorDiffTerminal"` |
    | `⌘⇧K` chord dispatched (document + window) | **inert** — still zero docs testids, tab row unchanged |
    | `workflow_set_features_enabled {enabled: true}` | **surface returns** — 15 docs testids, tab row `"DocsEditorDiffTerminal"` |

    **The ON-restore is what makes the OFF result meaningful:** without it, "zero Docs surfaces"
    is consistent with the panel simply having failed to mount for an unrelated reason. Toggling
    back proves the absence was *the gate's effect*. The contract's shape is also confirmed — the
    surface **does not exist** when off, rather than being rendered-then-hidden or
    present-but-disabled.

    **No `~/.claude/` claim is made here, so no hashing was done** — correct per the ⚠️ above: the
    toggle writes only Claudesk's own `settings.json`, and a relaunch-spanning hash would
    false-positive on `hook_install`'s legitimate universal rewrite.
  - [x] verify-auto  <!-- status: done — 0 source files changed (verified); scoped checks on the artifacts this phase produced: WIP structure/YAML/tree integrity, fixture manifest + UTF-8 + counts + mtime order, live surface alive -->
  - [x] verify-self  <!-- status: done — adversarial EVIDENCE AUDIT (bridge not available to subagents); 7 PASS / 4 UNDER-DETERMINED, 0 BLOCKING; all four UNDER-DETERMINED closed in place, see the audit section below -->
  - [x] verify-human  <!-- status: done 2026-08-02 — operator approved all 5 leaves ("good"); F13 -->
    - [x] P1.verify-human.1 Is the Docs panel actually good for re-orientation? (taste)  <!-- status: done — operator-approved -->
    - [x] P1.verify-human.2 Dogfood on THIS repo, not the fixture  <!-- status: done — operator-approved -->
    - [x] P1.verify-human.3 "From any workspace" — the one clause the agent could not claim  <!-- status: done — operator-approved -->
    - [x] P1.verify-human.4 Accept the narrower "read-only is a property of the PANEL" claim  <!-- status: done — operator-approved -->
    - [x] P1.verify-human.5 Console-capture scope correction accepted as-is  <!-- status: done — operator-approved -->
  - [x] verify-codify  <!-- status: done — coverage AUDIT, zero new tests written (correctly); full suite 1723/1723 -->

### Phase 1 verify-codify (2026-08-02) — coverage audit, NO new tests

**No integration boundary** — Phase 1 added no artifacts at all, isolated or otherwise (zero source
files changed). It is a **verification-only** phase, so there is no new behavior to codify: every
operator-approved behavior belongs to WP2/WP3/WP4 and was codified at those WPs' own passes. The
correct output here is an **audit** proving that, not duplicate tests.

**Audit result — every approved behavior has coverage that would fail if the behavior broke:**

| Approved behavior | Existing coverage | Tests |
|---|---|---|
| Workflow ordering | `docsOrder.test.ts` | 17 |
| Render fidelity (checkboxes/tables/code/headings) | `docsRender.test.tsx` | 25 |
| Frontmatter as a styled block | `frontmatter.test.ts` | 8 |
| Link classes (in-doc / cross-doc / external / protocol-relative) | `docsLinkHandling.test.ts` | 9 |
| Auto-select-on-open ranking | `pickInitialDoc.test.ts` | 28 |
| Scroll capture/restore + clamp | `docsScrollRestore.test.ts` | 22 |
| Deferred hold-and-retry | `pendingRestore.test.ts` | 20 |
| Reload decision arms | `docsReloadDecision.test.ts` | 20 |
| Panel wiring | `docsPanelWiring.test.ts` | 31 |
| Gate-derived panel set + `selectPanel`/`reconcilePanel` both arms | `panelHost.test.ts` | — |
| Absent files silently omitted | `docs/mod.rs::discovers_present_docs_and_omits_absent_ones` | 1 |

**⚠️ My entry scope note was WRONG, and the audit is what caught it.** I flagged the **gate-ON chord
positive control** (⌘⇧K → Docs) as "the one genuinely new artifact with no prior test." It is
already codified — `panelHost.test.ts:195-215` asserts `panelForChord({metaKey, shiftKey, key:"k"},
true) === "docs"` (both `"k"` and `"K"`), `null` with the gate `false`, **and** `null` with the arg
omitted (fails closed), plus a regression guard that threading `enabled` did not accidentally gate
Editor/Diff/Terminal. WP2 covered it. **Had I trusted my own note instead of auditing, I would have
written a duplicate test** — which is exactly what §2's "if already covered, skip it, do not
duplicate" exists to prevent.

**One deliberate non-test:** the read-only *command surface* ("no `docs_write`-shaped command
exists") has no test. It is a **structural absence** verified by grep, with nothing to regress short
of someone deliberately adding a write command — and unlike the OFF-invariant guard's absences
(which protect a live contract against an easy accidental violation), this one has no realistic
accidental path. Recording the decision rather than leaving it implicit.

**Full suite: 1723 passed / 140 files** — unchanged from the P1.3 baseline, so no regression and
**no `## Test Triage` entry needed** (no test failed).

### Phase 1 verify-human (2026-08-02) — APPROVED 5/5

**No auto-skip, deliberately** — despite `drive_mode: autopilot` and zero source files changed
(so gates (a)–(c) were clean). **Gate (d) failed**: Phase 1's outcomes cite consuming surfaces by
name throughout (the live `RightPanelHost` docs slot, the `right-panel-toggle` row, the real
WKWebView), and more decisively this phase's load-bearing deliverable is a **decision artifact** —
the evidence that becomes the M11 milestone-exit verdict. That is precisely the skill's documented
"probe/decision-artifact false positive," and auto-skipping the gate feeding a **milestone close**
would be wrong even with the mechanical gates clean.

The checklist presented **only** what verify-self could not settle — every `[x]` PASS (the whole CLI
gate, render fidelity, read-only, all four link classes) was excluded per the pre-filter. What was
put to the operator was three judgment calls and two stated evidence limits:

| Leaf | Item | Result |
|---|---|---|
| .1 | Is the panel actually good for **re-orientation**? (the taste question no fixture answers) | **approved** |
| .2 | **Dogfood on THIS repo** — the real 270-line `wbs.md`, real `backlog.md`, this live WIP — not the fixture | **approved** |
| .3 | **"From any workspace"** — the criterion says *any*; the agent drove **one** scratch workspace, so this clause was asserted, not observed | **approved** |
| .4 | Accept that **"read-only" is a property of the PANEL, not the webview** (which under `csp: null` still reaches `editor_fs::write_file` / `delete_file` / `create_dir` / `project_replace`) | **approved** |
| .5 | **Console-capture scope correction** — app error surfaces ≠ a console capture | **approved as-is** |

**No design prior proposed** (§6b): the operator approved without correction, so there was no
product-design tradeoff resolved and no transferable *why* to capture. A clean approval is not a
capture moment.

**Two limits are now operator-accepted rather than open**, and the verdict must say so rather than
overclaim: *"from any workspace"* rests on the per-workspace architecture plus one driven workspace
(leaf .3), and the console claim is an error-UI check (leaf .5).

### Phase 1 verify-self — adversarial evidence audit (2026-08-02)

**Method: audit, not re-drive — and that was forced, not chosen.** The `mcp__tauri__*` bridge is
**not exposed to subagents** (`[[mcp-bridge-tools-not-exposed-to-subagents]]`); a spawned runner
navigating to `:1420` gets bare Vite with **no Tauri backend**, so `docs_list`/`docs_read` return
nothing and every outcome reports a **FALSE FAIL**. So the subagent was tasked — as WP4's Phase 3
did, the established precedent here — to **attack the recorded evidence** and to independently
re-run anything CLI-verifiable. It did both.

**Verdict: 7 PASS / 4 UNDER-DETERMINED / 0 BLOCKING / 0 FAIL.** No behavior was found wrong. The
four UNDER-DETERMINED verdicts were about **evidence strength**, not correctness — the auditor's
own words: *"the behavior is right; the evidence as recorded is under-determined."*

**What the audit independently established** (not merely reviewed): it re-ran the full CLI gate and
reproduced every number, including a **byte-identical `DocsPanel-DosKRyyC.js` chunk hash** (proving
the same build, not a re-measurement); it confirmed both load-bearing guard meta-tests fire **by
name**; and it **re-drove render fidelity itself** against the real `DocMarkdown` on the real
fixture via `renderToStaticMarkup` + jsdom, reproducing 11 checkboxes / 2 checked / **11 disabled**,
1 table, 1 `pre code`, h1/h2×4/h3, **hr=0**, 1 frontmatter container, `work-tree` id present, the
`[[slug]]` literal with no anchor, and exactly 5 anchors including `//example.com/`. It also
verified the source-count regex two independent ways (strict list-item `^\s*[-*+] \[[ xX]\]` = 11,
naive `\[[ xX]\]` = 11 → no code-fence false positives **in this fixture**), which answers the
"is the checkbox comparison circular?" attack: a source grep and a parsed-DOM count are genuinely
independent *methods*.

**All four UNDER-DETERMINED items were then CLOSED IN PLACE while the app was still up.** Each
closure is a new measurement, not a re-reading of the old one:

1. **⚠️ Scroll-preserve trajectory — the real finding, and the audit was right.** `DocsPanel`
   **never imports `useLayoutEffect`** (verified: only `useEffect` at 171/243/295/**314**/412/462),
   and the restore is the plain `useEffect` at `:314` keyed `[current, panelFront, visible]`. So
   React commits → **the browser can paint** → only then does `el.scrollTop = plan.scrollTop` run: a
   jump-to-0 would be a genuinely paintable ~16–33ms transient. Worse, the original sampler
   **deduped** (pushed only when `top` or `sh` changed), so its `[1200, 1200]` was **two endpoints**
   — one pre-swap, one post-swap — and `everHitZero: false` over two samples added nothing. **Closed
   with a fast no-dedup sampler (4ms, ~4× the frame budget):** `sampleCount: 17`,
   `distinctTops: [1200]` (one distinct value across the window), `everHitZero: false`,
   `minTop: 1200`, and the `samplesAroundSwap` window straddles the swap **frame-by-frame** —
   `scrollHeight` flips **5754 → 5828 at sample index 11** with `scrollTop` reading **1200 on every
   sample either side of it**. That is a dense sample across the exact transition, not two endpoints.
   **⚠️ A first attempt with `requestAnimationFrame` captured `frameCount: 0`** — rAF does not tick
   from the bridge's eval context — and its `everHitZero: false` was therefore a **vacuous pass**.
   Caught only because the sample count was checked. *Method rule: an "absence" result is
   meaningless until you prove the instrument recorded anything at all.*
2. **Ordering was a partial tautology — closed by capturing the primary evidence.** The original
   check compared a *hardcoded transcription* of the live order against `orderDocs()` on a shuffle of
   **the same 11 entries**, then deleted the harness — so both sides traced to one observation and
   the live order existed nowhere. **Closed two ways:** the live order is now recorded **verbatim
   from `data-rel-path`** (below), and the auditor **independently re-derived** the expected order
   from `KIND_ORDER` and confirmed it matches the WBS spec, plus shuffle-invariance over **200 random
   permutations**. Derivation and observation are now two independent records.

   ```
   workflow-system/product/vision.md · roadmap.md · wbs.md
   workflow-system/state/wip/newer-feature.md · wip/older-feature.md
   workflow-system/state/backlog.md · backlog-quality-findings.md · .session.md
   workflow-system/product/arch.md · design-priors.md · transitions.md
   ```
   Absent `research.md`/`context.md` are **structurally** omitted (`discover()` only pushes present
   files; the list maps `ordered` with no placeholder branch) — not filtered at render.
3. **⚠️ The chord "inert" claim had NO positive control — the audit's top suspicion, now closed.**
   Its concern was exact: if the synthetic dispatch never reaches the real handler, "inert" is
   **unfalsifiable** — it would pass with the gate ON too. The auditor traced registration to
   `RightPanelHost.tsx:834`, `document.addEventListener("keydown", onKeyDown, true)` (**capture
   phase**), and confirmed a dispatch on `document` does reach it. **Positive control run with the
   gate ON:** switched to Editor, dispatched the same event shape on `document` → **active tab moved
   `panel-tab-editor` → `panel-tab-docs`**, docs slot `display: flex`. Event fields recorded rather
   than assumed: `key:"K", code:"KeyK", metaKey:true, shiftKey:true, ctrlKey:false, altKey:false`.
   **So the OFF-state inertness is a real negative.** (Also learned: `docs-content` stays **mounted**
   while Editor is active — the all-panels-stay-mounted convention — so *presence* is not the
   discriminator; the **active tab** is.)
4. **Console check answered a different question than asked.** The recorded evidence was three
   **application** error surfaces being null (`docs-panel-error`, `docs-content-error`,
   `docs-link-note`), which is an error-*UI* check — an uncaught throw in the delegated click handler
   or the reload effect need not populate any of them. Accepted as a **scope correction**; nothing
   observed suggests a thrown error, and `anchorSelector`'s `CSS.escape` hardening defends the one
   throw-prone path.

**Two scope notes the audit contributed, neither a defect:**
- **"Read-only" is a property of the PANEL, not of the webview.** Rust registers exactly `docs_list`
  + `docs_read` (both reads over `read_file_core`), and the Docs panel has no path to a write — but
  the same webview, shipping **`csp: null`**, can still reach `editor_fs::write_file`,
  `delete_file`, `create_dir`, and `project_replace`. The claim is right for this feature; the
  phrasing shouldn't be read as a webview-wide guarantee. (Relates to
  `SURFACE-2026-08-02-SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE` and `[[app-ships-with-no-csp]]`.)
- **"No external editor pop" is structurally near-guaranteed** — the `docs/` directory has **zero**
  references to `sublime_open`/`smerge_open` (only call site: `src/sublime/sublimeLaunch.ts`, from
  the tab-row buttons). It correctly discharges a criterion clause no WP had checked, but it proves a
  structural absence by dynamic sampling, so treat it as weak-but-valid evidence.

**Carried to Phase 2 rather than closed here:** the criterion's *"from any workspace"* was exercised
on **one** scratch workspace, so the generalization is asserted; and this run again stayed far from
the clamp boundary (1200 of ~5239 max), which is exactly **carry (b)**. Both were already Phase 2/3
scope. One record error found and fixed: the WIP said "1 table / **5 rows**" — the real count is **4
`tbody` rows** (5 including the header).

**Fixture restored** after the two extra appends: 178 lines, **0** markers, 11 files — byte-state
identical to the P1.2 manifest.

- [x] Phase 2: Discharge the two WP4 live-verification carries (a) + (b)  <!-- status: done 2026-08-02 — both carries found VACUOUS (the browser supplies the answer unaided in both); retraction written to 4 durable records; verify-human 4/4 operator-approved -->
  **Observable outcomes:**
  - CLI: **the mutation is proven to land in executable code before its result is believed.** For carry (a), after editing `pendingNext`'s `"deferred"` arm, `sed -n '<line>p' src/components/workspace/docs/pendingRestore.ts` shows the mutated `return NO_PENDING;` on the executable line (not a comment) — per `[[verify-the-mutation-landed]]`, where two attempts in one session reported "the guard does not bite" having modified nothing.
  - Browser: **carry (a), deferred-restore isolation — a decisive result either way.** Baseline: with the panel hidden (`display:none`, `clientHeight === 0`) at reload time, returning to the panel restores `scrollTop` to the captured offset. Then with `"deferred"` mutated to `NO_PENDING`, re-drive the identical sequence and read `scrollTop` on return. **PASS = the mutated run returns 0 (or the top), proving the restore was load-bearing.** If the mutated run *also* returns the captured offset, the WP4 outcome was **vacuous** (WebKit retained the offset on the never-unmounted node) — that is a legitimate, recordable finding, not a Phase-2 failure to work around. Revert the mutation and confirm `git diff` is empty afterward.
  - Browser: **carry (b), doc-shrink clamp.** Scroll to an offset near the bottom of a long doc, then **truncate** the file on disk so `scrollHeight - clientHeight` falls *below* the captured offset. The restored `scrollTop` equals the clamped maximum (`scrollHeight - clientHeight`) and is **not** left at the stale larger value, and no JS error is thrown. Read both numbers out of the DOM and assert the relationship rather than a literal.
  - CLI: whichever of (a)/(b) yields a defect gets a `SURFACE-` entry appended to `workflow-system/state/backlog.md` (grep confirms the ID is present) — findings are recorded, never absorbed into the verdict.
  - [x] P2.1 Carry (a): run the baseline hidden-panel deferred-restore sequence, then the mutated one; `sed`-verify the mutation landed; record both `scrollTop` values; revert and confirm a clean tree.  <!-- status: done — DECISIVE NEGATIVE: WP4 outcome 5 was VACUOUS; see below -->

    **⚠️ P2.1 RESULT — the decisive experiment says WP4's outcome 5 could not have proven what it
    claimed. The evidence was VACUOUS.**

    | Run | `"deferred"` arm | Precondition | Result on return |
    |---|---|---|---|
    | **Baseline** | `return state` (production) | `clientHeight 0`, browser-reported `scrollTop 0` (the fake zero) | **1200**, marker present, `scrollHeight` 5679 → 5754 |
    | **Mutant** | `return NO_PENDING` (offset **dropped**) | `clientHeight 0`, `scrollTop 0` | **1200**, marker present, `scrollHeight` 5737 → 5828 |

    **Identical outcomes.** With the held offset deliberately discarded, the panel *still* returned
    to exactly 1200. **WebKit preserves `scrollTop` across the content swap on the never-unmounted
    node** (the slot hides via `display:none`), so this observation cannot distinguish "our restore
    fired" from "the browser kept the offset" — which is precisely what the WP4 verify-self auditor
    suspected and could not prove. The mitigating argument recorded at WP4 — that a *substantial*
    `scrollHeight` change would clobber a browser-retained offset — is now **measured false**: the
    height changed by ~91px in the mutant run and the offset survived anyway.

    **The mutation was proven live, four independent ways** — this is the part that makes the
    negative trustworthy rather than a missed setup step:
    1. `sed -n '90p'` showed `return NO_PENDING;` on an **executable** line (not a comment) —
       `[[verify-the-mutation-landed]]`, where two prior attempts reported "no bite" having modified
       nothing.
    2. `git diff --stat` confirmed a real 1-line source change.
    3. `pendingRestore.test.ts` went **20 passed → 3 failed**, with on-point names ("a deferred apply
       LEAVES THE OFFSET HELD", "repeated deferrals keep holding", "a burst that lands entirely while
       HIDDEN holds the offset through every deferral").
    4. **The Vite-served module was inspected over HTTP** — `curl localhost:1420/…/pendingRestore.ts`
       showed `case "deferred": return NO_PENDING;` — so the mutant was in the **running app**, not
       merely on disk. A **full `location.reload()`** preceded the run, so no HMR-surviving
       `pendingRef` closure could confound it (`[[hmr-stale-across-file-rename]]`: relaunch before
       believing a verify RESULT).

    **⚠️ MECHANISM CORRECTED at Phase 2 verify-self — my
    original explanation of it was incomplete.** I attributed the non-result solely to WebKit
    retention (i.e. "the arm ran and was masked"). The audit found a **second, independent reason**
    that is arguably the primary one: **the `"deferred"` arm never ran at all.**
    `DocsPanel.tsx:436` skips the reload outright while the panel is not front
    (`if (!visibleRef.current) { staleRef.current = true; return; }`), and the catch-up effect at
    `:462` re-lists only **after** re-fronting — by which point the box is measurable, `planRestore`
    returns `apply: true`, and the **`"applied"`** arm runs. Verified in source at both line numbers.

    **Consequence: the "mutate the file while the panel is hidden" recipe does NOT exercise the
    deferred path.** A future reader retrying that recipe believing it tests the deferred restore
    would be repeating my mistake. The arm **is** still reachable — but only by a **race**: a reload
    that passes the `:436` gate while front, then a panel switch *during* the `docs_list`→`docs_read`
    round trip. **No experiment has ever exercised it.**

    ⚠️ **"Over-determined / two independent reasons" — my own first framing of this, now WITHDRAWN
    (verify-self, traced in code).** The two reasons are **causally chained, not independent**: the
    `:436` gate means nothing is captured while hidden, so on re-front the `:462` catch-up calls
    `captureScroll(readGeometry(...))` on a now-**measurable** box, which reads the **live**
    `scrollTop` — and that value is 1200 *only because WebKit retained it*. Remove WebKit retention
    and the same path captures 0 and restores 0. So retention is not an additional leg; it is **the
    supplier of the answer**, which is the SURFACE's whole thesis. The `:436` finding changes *which
    arm ran*, not *whether the browser handed us the result*. The honest framing: **one mechanism
    (the browser supplies the answer), plus a separate finding that I tested the wrong arm.**

    **What this does and does NOT mean.** It does **NOT** mean the deferred-restore machine is wrong
    or unnecessary: `pendingRestore.ts` is a mutation-proven total function (20 tests), the
    hold-and-retry logic is correct, and it is the **only** thing standing between the reader and a
    lost position in any case where the browser does *not* volunteer the offset (a genuine unmount,
    a remount, a different hiding strategy, a non-WebKit engine). **Recorded as a correction to WP4's
    WBS entry, not as a WP4 regression** — the operator's approval was of a real behavior; only the
    *proof* was weaker than the record claimed.

    ⚠️ **One documentation defect this exposed, worth fixing at the next touch:**
    `docsScrollRestore.ts`'s header and `DocsPanel.tsx:71` both describe *"a reload lands while the
    panel is hidden"* as the deferred arm's motivating case — but the `:436` gate makes that case a
    skip-and-catch-up, **not** a hold-and-defer. **The prose and the code disagree**, and that
    disagreement is what led me to design the wrong experiment. It lands squarely on carry (d), whose
    entire point is that this file's comment density has become *functionally* hazardous rather than
    merely stylistic.

    Source reverted **byte-identically** (`git diff` empty vs HEAD), tests back to **20/20**, and the
    live app re-served `return state;` (verified over HTTP again after the revert).

  - [x] P2.2 Carry (b): drive the truncation case; assert the clamp relationship against live `scrollHeight`/`clientHeight` rather than a hardcoded number.  <!-- status: done — VACUOUS (was recorded PASS; REVERSED at verify-self): the browser clamps scrollTop itself, so the clamp is not live-observable -->

    **P2.2 RESULT — clamp PASS, and exercised for the first time.** Every prior check *appended*, so
    the offset never approached the boundary; this one scrolled to **5365 of max 5405** (genuinely
    near the bottom) and then **truncated** the doc 186 → 44 lines.

    | Quantity | Before truncation | After |
    |---|---|---|
    | `scrollHeight` | 5828 | **956** |
    | max scroll (`scrollHeight - clientHeight`) | 5405 | **533** |
    | `scrollTop` | 5365 | **533** |

    `clampedToMax: true`, `notLeftStale: true` (not retained at 5365), `withinRange: true`, no
    `docs-panel-error` / `docs-content-error`, panel still rendering. Asserted as a **relationship
    against live geometry**, never a literal — so it stays valid as the fixture changes.

    **⚠️⚠️ THE PARAGRAPH THAT WAS HERE WAS WRONG — REVERSED at Phase 2 verify-self (2026-08-02).**
    It claimed this result was *"trustworthy where P2.1's was not,"* on the reasoning that *"the clamp
    had to move the offset, so the browser could not have produced the correct answer on its own."*
    **Measured false.** The browser clamps `scrollTop` writes **itself** — confirmed in the live
    Claudesk webview: writing `999999` → lands at `5256`, `max + 500` → `5256`, `-300` → `0`, where
    `5256 = scrollHeight(5679) − clientHeight(423)`. And P2.2's own recorded 533 is exactly
    `956 − 423`, i.e. the browser's own maximum.

    **So carry (b) is VACUOUS for precisely the same reason as carry (a):** a clamp-free
    implementation is observationally identical to `planRestore`'s clamp. The clamp is still correct
    and worth keeping — it stops `planRestore` from *returning* a stale value a caller might compare
    back, and it covers unmount/non-WebKit cases — but **this live run did not prove it.**

    **The self-indictment worth keeping:** the deleted paragraph stated the correct durable rule
    (*an observation is only decisive when a broken implementation would give a different answer*)
    **and violated it in the same sentence.** Stating a discipline is not applying it. The check that
    would have caught this before the run costs one line: *write an out-of-range `scrollTop` and see
    what the browser does unaided.*
  - [x] P2.3 Disposition each result: proven / vacuous / defect. A defect gets a `SURFACE-` in `backlog.md` with the measured evidence; a *vacuous* WP4 outcome is recorded in the WBS's WP4 section as a correction to what that WP proved, since a future reader would otherwise trust it.  <!-- status: done — BOTH carries VACUOUS; SURFACE + corrections written into wbs.md, CHANGELOG.md, and the archived WP4 WIP -->

    **Dispositions — ⚠️ REVISED at Phase 2 verify-self (2026-08-02). The first version recorded (b)
    as PROVEN; it is not.**

    | Carry | Disposition | Why |
    |---|---|---|
    | **(a)** deferred-restore isolation | **VACUOUS** | WebKit retains `scrollTop` on the never-unmounted `display:none` node (it supplies the answer) — *and*, separately, the `:436` skip gate means the `"deferred"` arm was never the path under test |
    | **(b)** doc-shrink clamp | **VACUOUS** *(was: PROVEN)* | **the browser clamps `scrollTop` writes itself** — `999999` → `5256`, `max+500` → `5256`, `-300` → `0` in the live webview; P2.2's 533 is exactly the browser's `956 − 423` maximum |

    **So the honest Phase 2 result is: neither carry was discharged, and neither can be by the
    experiments attempted.** That is a worse outcome than the first write-up claimed and a better one
    than it would have been to ship the overstatement — the two durable records (`wbs.md` → WP4 4.4
    and the backlog SURFACE) are now corrected, and the SURFACE is renamed
    `SURFACE-2026-08-02-BROWSER-SUPPLIES-THE-ANSWER-SO-SCROLL-RESTORE-CHECKS-ARE-VACUOUS` to describe
    what was actually found rather than only (a).

    **"Closed as unobtainable" was also overstated and is withdrawn.** The audit identified a path
    that needs **no new harness** and is drivable on the live app today: **the race path** — trigger the
    reload with the panel **front**, then switch panels *during* the `docs_list`→`docs_read` round
    trip. That is the one sequence that genuinely reaches `"deferred"`. So the arm is unobtainable *by
    the sequence I tried*, not in principle. Recorded in the SURFACE as suggested action 1 of 3.

    **Not attempted now, deliberately:** the race path is timing-sensitive and would consume the rest
    of M11's budget to verify an arm whose pure logic is already mutation-proven (20 tests) and whose
    real-world exposure is narrower than WP4's own comments claim. Filed rather than chased — but
    filed **honestly**, as open work with a known method, not as a closed impossibility.

    **No code defect was found in either carry.** Both WP4 approvals stand as *behavior*; both now
    lose their evidentiary claim.
  - [x] verify-auto  <!-- status: done — revert proven in source, in the Vite-SERVED module, and behaviorally (the 3 mutant-broken tests pass by name); tsc/eslint/prettier clean; fixture at P1.2 baseline -->
  - [x] verify-self  <!-- status: done — adversarial audit of a NEGATIVE conclusion; found 1 BLOCKING record error (carry (b) claimed PROVEN, actually VACUOUS) + a mechanism correction. Both fixed in the durable records; see the audit section below -->
  - [x] verify-human  <!-- status: done 2026-08-02 — operator approved all 4 leaves ("all good"); F13 -->
    - [x] P2.verify-human.1 Accept that BOTH carries are vacuous / neither proven live  <!-- status: done — operator-approved -->
    - [x] P2.verify-human.2 Accept retracting WP4 evidence the operator had already approved  <!-- status: done — operator-approved -->
    - [x] P2.verify-human.3 Accept amending CHANGELOG.md + the ARCHIVED WP4 WIP  <!-- status: done — operator-approved -->
    - [x] P2.verify-human.4 Leave the deferred arm unproven (race path filed, not driven)  <!-- status: done — operator-approved; do NOT drive the race path in M11 -->
  - [x] verify-codify  <!-- status: done — coverage audit, zero new tests (correctly); full suite 1723/1723 -->

### Phase 2 verify-codify (2026-08-02) — no new tests, and the reasoning matters

**No integration boundary**; zero source files changed (the mutation was reverted byte-identically).
Phase 2 produced **no new app behavior** — its output was a retraction — so there is nothing to
codify. But the phase *did* produce new knowledge, so the question was asked rather than skipped.

**Why the new knowledge is NOT testable, and shouldn't be.** The two facts learned are **platform
facts, not app behavior**: WebKit retains `scrollTop` on a `display:none`-but-never-unmounted node,
and the browser clamps out-of-range `scrollTop` writes. A test asserting either would be testing
**the browser**, not Claudesk — it could not fail from any Claudesk regression, only from a WebKit
change. And it is unexpressible in this repo's test environment anyway: **jsdom has no layout
engine** (`SURFACE-2026-08-02-JSDOM-CLIENTHEIGHT-IS-ZERO-FOR-VISIBLE-ELEMENTS-TOO`), which is the
very reason `docsScrollRestore` takes geometry as an **injected value**. A test with no defect it
could catch is not coverage. The right home for these facts is the SURFACE + `CLAUDE.md`, where they
already are.

**⚠️ The one thing genuinely worth checking — is the CLAMP itself covered, given its live proof was
just retracted? YES, and non-vacuously.** `docsScrollRestore.test.ts` asserts exact values across
four cases: shrink-past-end (`planRestore(sh 500/ch 400, 600)` → **100**), shorter-than-viewport
(negative max → **0**), never-negative (`-50` → **0**), **and the negative control** — a doc that
*grew* keeps its exact offset (`600` → **600**, no clamp applied). That last one is what makes the
clamp assertions meaningful rather than a tautology. So the clamp's **unit** proof is sound; only its
**live** proof was vacuous. Nothing to add.

*(Worth noting: the existing test comment already reads "rather than leaving a value the browser will
silently pin" — the WP4 author knew about browser clamping. That knowledge simply never reached the
live-verification design, which is precisely the prose-vs-practice gap carry (d) is about.)*

**Full suite: 1723 passed / 140 files** — identical to the Phase 1 baseline. No failures, so **no
`## Test Triage` entry required.**

### Phase 2 verify-human (2026-08-02) — APPROVED 4/4

**No auto-skip, deliberately** — gates (a)–(c) were clean (autopilot, verify-self all-PASS, no
integration boundary), but **gate (d) failed** on a stronger reading than Phase 1's: this phase's
deliverable *is* a decision artifact — a **retraction written into four durable records**, including
`CHANGELOG.md` (the project's sole canonical narrative record) and an **archived** WIP. Auto-skipping
an amendment to the historical account of what a shipped WP proved would be exactly the
"probe/decision-artifact false positive" the gate's own known-limitation paragraph names.

| Leaf | Item | Result |
|---|---|---|
| .1 | Both carries vacuous; neither behavior ever proven live | **approved** |
| .2 | Retracting WP4 evidence the operator had **already approved** at WP4 verify-human | **approved** |
| .3 | Amending a closed `CHANGELOG.md` entry + the **archived** WP4 WIP rather than leaving them wrong | **approved** |
| .4 | Leave the deferred arm unproven — race path **filed, not driven** | **approved** |

**Binding decision from .4: do NOT drive the race path during M11.** It is reachable (reload while
front → switch panels *during* the `docs_list`→`docs_read` round trip) and needs no new harness, but
it stays filed as open work in
`SURFACE-2026-08-02-BROWSER-SUPPLIES-THE-ANSWER-SO-SCROLL-RESTORE-CHECKS-ARE-VACUOUS` (suggested
action 1 of 3).

**No design prior proposed** (§6b): approval without correction — no product-design tradeoff was
resolved and no transferable *why* surfaced. The durable lesson here is a **verification-method**
rule, which belongs in the SURFACE and `CLAUDE.md`, not in `design-priors.md`.

### Phase 2 verify-self — audit of a NEGATIVE conclusion (2026-08-02)

**Why this audit was scoped at a negative rather than a feature.** Phase 2's output was a conclusion
that *discredits prior shipped work* (WP4's outcome 5). A false negative there is the expensive
error — it would wrongly impugn a shipped, operator-approved behavior and mislead every future
reader of `wbs.md`. So the subagent was told to attack the negative and specifically to try to
establish five named alternative explanations (mutant not live · HMR/stale closure · wrong
precondition · a different `scrollTop` writer · the WebKit-retention claim being implausible).

**It found 1 BLOCKING error in my work and 1 mechanism correction. Both are now fixed** in all three
durable records (`wbs.md` → WP4 4.4, the backlog SURFACE, and this WIP).

| Outcome | Verdict |
|---|---|
| Mutation-landed proof | **PASS** — all four proofs independently reproduced; it additionally confirmed the `curl` proof is *probative*, since that URL serves the **Vite-transformed** module with `Cache-Control: no-cache` (the artifact the webview imports), not the raw file |
| Carry (a) decisive-either-way | **PASS** — the negative is sound (one mechanism + a wrong-arm finding, not two independent legs) |
| Carry (b) clamp | **FAIL / BLOCKING** — the measurement is real; the **decisiveness claim was false** |
| SURFACE + disposition recording | **PASS** — with two factual claims inside it wrong (now corrected) |

**1. ⚠️ BLOCKING — carry (b) is vacuous, and I had recorded it as the decisive counterexample.**
The auditor measured, in a standalone `WKWebView` fixture with **no clamp code**, that truncating the
document moves `scrollTop` to `scrollHeight − clientHeight` on its own, and that an **unclamped**
stale write lands at the maximum anyway. **I verified this myself in the live Claudesk webview**
rather than accepting it: `999999` → **5256**, `max + 500` → **5256**, `-300` → **0**, where
`5256 = 5679 − 423`. P2.2's recorded 533 is exactly `956 − 423`. So `planRestore`'s clamp and no
clamp are observationally identical. **This was the worst error of the phase**, because it was the
load-bearing contrast that made the correction's lesson land — it would have taught a future reader
that a shrink-clamp check is a safe decisive pattern.

**2. Mechanism correction — the `"deferred"` arm never ran.** `DocsPanel.tsx:436` skips the reload
while the panel is not front; the catch-up effect at `:462` re-lists after re-fronting, when the box
is measurable, so the **`"applied"`** arm runs. Verified in source. My stated *why* was incomplete,
and the recipe I used does not test what I said it tested. *(I first called this "over-determined";
withdrawn — the two findings are causally chained, since the catch-up capture reads the live
`scrollTop` that WebKit retained. One mechanism, plus a wrong-arm finding.)*

**3. "Closed as unobtainable" withdrawn** — the audit named a path needing no new harness (the race:
reload while front, switch panels *during* the IPC round trip). Unobtainable by my sequence, not in
principle.

**What the audit independently established, beyond reviewing:** it built a real `swiftc` +
`WKWebView` probe harness (`AppleWebKit/605.1.15`) and measured browser retention *and* browser
clamping with zero app code in the loop — turning both of my inferences into direct measurements, one
confirming and one refuting. It also **dissolved the tension I could not explain**: `scrollTop` reads
`0` while hidden *and* the browser retains the offset are fully consistent, because a zero-layout box
reports a zero offset while keeping scroll state internally. And it excluded alternative 4 by grep —
exactly **one** `scrollTop` writer exists in the docs subsystem (`DocsPanel.tsx:319`).

**Method worth keeping:** that standalone WKWebView harness answers *"what does the platform do
unaided?"* without the app or the bridge — which is precisely the question that decides whether a
live run can be decisive at all. Noted in the SURFACE.

**Footprint verified after:** the auditor's probe server was killed PID-scoped (75816), the session's
dev app (PID 79206) and ports 1420/9223 untouched, `git status` unchanged apart from the intended doc
edits, `pnpm-lock.yaml` clean (the gitignored-`tmp/` lockfile hazard avoided — its artifacts live in
the scratchpad, outside the repo).

- [x] Phase 3: Carry (c) operator behavior call, carry (d) disposition, and the M11 exit verdict  <!-- status: done 2026-08-02 — carry (c) reproduced then FIXED (operator: "pin once resolved"), incl. a fifth-path defect caught at verify-self; carry (d) paid; M11 exit verdict GO; teardown clean; verify-human 5/5 -->
  **Observable outcomes:**
  - Browser: **carry (c) is REPRODUCED live before any decision is asked for.** With two `wip/*.md` files and **no** `.session.md` in the fixture, note which wip the panel auto-selected, then touch/edit the *other* (sibling) wip so its mtime becomes newest → observe whether the rendered doc changes with no arm having run. Record the observed behavior (moves / does not move) plus the scroll offset before and after — an operator behavior call should be made against a demonstrated behavior, not a described one.
  - CLI: the operator's decision is recorded in the WBS/WIP with its rationale — candidate (a) *auto-selection move counts as a jump* or (b) *pin the auto-selection once resolved* — and the `SURFACE-2026-08-02-QUALITY-WP4-SIBLING-EDIT-MOVES-AUTOSELECTION` entry in `backlog-quality-findings.md` is updated to reflect the decision (grep shows its `Status:` line changed from bare `pending`).
  - CLI: **if the decision is to implement inside WP5** — the fifth response is modeled in `docsReloadDecision.ts` as a pure transition with unit tests that **import and drive the real module** (never a replica: `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`), every new arm is mutation-proven with the mutation `sed`-verified as landing, and the write funnels through the existing single `chooseDoc` writer rather than adding a second call site (the `[[…]]` caller-side rule now in root `CLAUDE.md`). `pnpm test` count rises; tsc/lint/format/build stay green. **If the decision is to defer** — the backlog entry is updated with the chosen direction and the trigger for paying it, and **no code changes** (`git diff` on `src/` empty for this phase).
  - CLI: **carry (d)** — a disposition is recorded for the third-consecutive comment-density flag. If trimmed: the two named offenders (`DocsPanel.tsx:208-222`, `DocsPanel.tsx:113-151`) shrink measurably (report before/after comment-line counts), **no ⚠️-marked invariant comment is removed** (diff review confirms), and the full gate stays green. If deferred: the backlog entry records that it was considered at WP5 and why it was left, so a fourth flag is not read as a fourth *new* finding.
  - CLI: **the M11 exit verdict is recorded** in `wbs.md` → "Probe outcomes" as a GO / GO-with-issues / NO-GO with per-criterion evidence, WP5's tasks 5.1/5.2 ticked, and any installed-`.app`-only items explicitly carried to the next `/release` gate per `[[installed-build-verify-deferred-to-release]]`. Grep confirms a `### WP5 verdict` section exists naming each exit-criterion clause.
  - CLI: teardown is clean — `mcp__tauri__driver_session{stop}`, `TaskStop` on the `tauri:dev` task, then **PID-scoped** kills only after a `ps` identity check (⚠️ never a blanket `pkill`/port-kill — that killed the operator's live app once); `lsof -nP -iTCP:1420 -iTCP:9223` reports free (note: `-ti tcp:` misses Vite's IPv6-only listener); the scratch fixture is removed and `tmp/scratch/scratch-a` reports a clean `git status`.
  - [x] P3.1 Reproduce carry (c) live on the two-wip / no-`.session.md` fixture; capture the before/after selection + scroll.  <!-- status: done — REPRODUCED, twice, with the scroll consequence measured -->

    **P3.1 — carry (c) REPRODUCED LIVE** (`SURFACE-2026-08-02-QUALITY-WP4-SIBLING-EDIT-MOVES-AUTOSELECTION`).
    Preconditions built deliberately: `.session.md` removed (so the two wip files compete) and the
    panel left **unchosen** (a page reload was needed — my Phase 2 explicit pick of `wbs.md` was
    correctly sacred and masked the bug, which is itself a small confirmation that the
    `chosen`-is-sacred rule works).

    **Run 1 — the selection moves on a sibling edit.** Sampler trajectory, 30ms, dedup'd on
    selection/content change:

    | Sample | Selected row | Renders |
    |---|---|---|
    | before | `newer-feature.md` | "The NEWER of the two wip files" |
    | after sibling edit to `older-feature.md` | **`older-feature.md`** | **"The OLDER of the two wip files"** |

    Editing a file the reader is **not** looking at moved the auto-selection and swapped the rendered
    document. `decideReload` returned `"none"` — no arm ran, no scroll captured, no `"reset"`
    dispatched — exactly as the finding predicted.

    **Run 2 — the consequence, which is what makes this a real defect rather than a curiosity.**
    Padded `older-feature.md` so it scrolled (`scrollHeight` 2347 / `clientHeight` 423), scrolled the
    reader to **600**, then touched the *sibling* `newer-feature.md`:

    | Quantity | Before | After |
    |---|---|---|
    | Selected | `older-feature.md` | **`newer-feature.md`** |
    | Rendered | "The OLDER…" | **"The NEWER…"** |
    | `scrollTop` | **600** | **0** |

    **So a reader mid-document is yanked to the top of a different document by an edit to a file they
    were not reading.** That is precisely the failure mode WP4's load-bearing constraint exists to
    prevent (*"CC rewrites WIP files many times per turn, so a jump-on-any-update would yank the doc
    out from under a reader mid-sentence"*) — reached through the one path WP4 did not model. It is
    also easy to hit in real use: any project with two `wip/*.md` files and no `.session.md`, which is
    every project mid-feature after a `/session-restore` deletes the pointer.
  - [x] P3.2 Put the reproduced behavior and the two candidate directions to the operator; record the decision + rationale. Implement only if that is the decision; otherwise update the backlog entry with the direction and its trigger.  <!-- status: done — operator chose (b) PIN ONCE RESOLVED; implemented, mutation-proven, re-verified live -->

    **⚠️ OPERATOR DECISION: option (b) — "pin once resolved."** Presented against the *reproduced*
    behavior (P3.1) with both candidate directions and a side-by-side preview of each. Chosen
    semantics: **once the panel resolves an auto-selection, only a doc APPEARING or DISAPPEARING may
    move it** — a sibling's mtime changing no longer steals the selection. Option (a) (model it as a
    fifth "jump") was declined: it would have kept the reproduced yank *by design*.

    **⚠️ This is a deliberate SCOPE EXTENSION.** The WBS sizes WP5 as *"probe (verification-only;
    produces the M11 exit verdict, no new software)"*. Option (b) ships code. Recorded as the
    operator's call, made against a live reproduction, rather than as scope drift.

    **Implementation — a FOURTH precedence tier, `settled`.** `selectedDoc`'s bottom tier recomputed
    `pickInitialDoc(docs)` on every render, and the caller refreshes `docs` with fresh mtimes on every
    `fs-change` — so the fix is to latch the first resolution and let only the re-ranking arms release
    it. Now `chosen` (user) > `jumpedTo` (jump) > `settled` (latched) > `pickInitialDoc` (live).
    Released at exactly three sites: the **jump** arm, the **refallback** arm, and `chooseDoc` — the
    single funnel for a user pick, which is where the caller-side rule in root `CLAUDE.md` says the
    write belongs (row click *and* in-doc link both route through it, so forgetting the release is
    impossible by construction rather than by vigilance).

    **⚠️ WHERE the latch is written took three attempts, and the first two were rejected by LINT —
    worth recording because both were the mistakes this repo has already paid for:**
    | Draft | Shape | Verdict |
    |---|---|---|
    | 1 | `useEffect` calling `setSettled` | **`set-state-in-effect`** — *"Calling setState synchronously within an effect can trigger cascading renders"*. The same reach-for-a-state-updater mistake WP2 and WP3 each paid for. |
    | 2 | `useRef`, read + written during render | **`Cannot access refs during render`** (5 errors) — React Compiler is stricter than I assumed. |
    | 3 | ✅ **state, written in the `docs_list` response handler** | Clean. A callback is neither render nor an effect body, so neither rule fires — and it is the honest place: the latch is a fact about *the answer when the list arrived*. |

    **Proof, in four tiers:**
    1. **Behavioral, as values** — 6 new tests in `pickInitialDoc.test.ts` driving the real function,
       including the **named regression test** with a built-in non-vacuity assertion (the *unlatched*
       call still moves, proving the fixture genuinely reproduces the defect).
    2. **Mutation-proven, pure layer** — deleting the `settled` tier fails **3** tests; hoisting it
       above `chosen`/`jumpedTo` fails the precedence test. Both mutations `sed`-verified as landing on
       executable lines.
    3. **Mutation-proven, CALLER layer (the lesson from WP4)** — 4 new wiring guards, each probed with
       its **own** mutant and each attributing to its own probe: M-A drop the 4th argument · M-B never
       set the latch · M-C drop one of the three releases · **M-D move the release *out* of `chooseDoc`
       while keeping the count at 3** — the composite-bypass shape, caught by the funnel guard alone.
       *(Re-run a second time after the draft-3 rewrite, so their bite is proven on the SHIPPED shape
       rather than inherited from the abandoned ref draft.)*
    4. **Live, on the real app** — full `location.reload()` first (HMR must not confound a verify
       RESULT), and the served modules confirmed over HTTP to carry the fix.

    | Live check | Before (P3.1) | After the fix |
    |---|---|---|
    | Baseline: unchosen, two wips, no `.session.md` | auto-selects `newer-feature.md` | same ✓ |
    | **Sibling edit makes `older-feature.md` newest** | **selection JUMPED to `older-feature.md`** | **selection STAYS on `newer-feature.md`** ✓ |
    | A new wip **APPEARS** | jumps to it | **still jumps** (`brand-new-phase.md` selected + rendered) ✓ |
    | The shown doc **DISAPPEARS** | falls back | **still falls back**, with **no stale text** from the deleted file ✓ |

    The last two matter as much as the fix: they prove the latch is **narrow**, not a blanket freeze —
    the two arms that *should* re-rank still do.

    **Gates:** `tsc` 0 · `pnpm lint` **0 errors** (1 pre-existing `XtermPane` warning) · `format:check`
    clean · **1733 tests / 140 files** (1723 baseline + 10 new). Two `## Test Triage` entries recorded
    below — both **obsolete-test**, high confidence, both from arity-brittle `?raw` guards.
  - [x] P3.3 Disposition carry (d) — trim the two named offenders or record why not; if trimming, verify no ⚠️-invariant comment was lost.  <!-- status: done — operator chose TRIM NOW; 50 comment lines cut, all 4 ⚠️ invariants preserved in tighter form -->

    **Operator decision: TRIM NOW.** Carry (d) was flagged a **third consecutive time** (WP2 → WP3 →
    WP4), and the reviewer's judgment that it had crossed from stylistic to *functional* was borne out
    twice over in this very WP: the two genuine WP4 defects sat in the densest region, **and** the
    stale prose in that region is what sent P2.1's experiment down the wrong path.

    **Measured, isolated to the trim** (whole-file percentages are misleading here, because WP5's own
    `settled` latch legitimately *added* documentation — a naive before/after shows comments rising):

    | | Count |
    |---|---|
    | Comment lines **removed** by the trim | **50** |
    | Comment lines added (new latch + the two corrections) | 70 |

    **The two named offenders, both cut to their invariants:**
    - **The `useState(0)` block** — 15 comment lines → 5, restating the P3.5 incident already recorded
      at length in the archived WIP. Kept as an explicit **`⚠️ FORBIDDEN SHAPE:`** header naming the
      broken alternative (`setLoaded(null)`), which is the part a future editor needs.
    - **The 39-line fetch-latch block** → 15, containing *two* accounts of the same StrictMode
      deadlock, one duplicating `fetchLatch.ts`'s own header. Now states the two invariants (explicit
      ref, never derived from `docs !== null`; the cleanup release is load-bearing) and **points at
      `fetchLatch.ts`** for the transition table rather than re-telling it.

    **⚠️ The operator's condition — no ⚠️-marked invariant removed — VERIFIED, not asserted.** The diff
    shows 4 `⚠️` lines removed, which looks like a violation; each is the *opening line of a block that
    was rewritten*, and each invariant was confirmed present in the new text by grep: the deferred-restore
    retry trigger · "EXPLICIT ref, never derived" · "MUST be released by the cleanup" · the forbidden
    `setLoaded(null)` shape. The cited `…FETCH-LATCH-ENTANGLED-WITH-DATA` id is retained too. Net ⚠️
    count **rose** 21 → 24. *(Checking the count alone would have been the wrong check — a rewrite and
    a deletion look identical to it.)*

    **Bonus fix, and the reason it belongs in this WP:** the **prose-vs-code disagreement Phase 2
    exposed** is now corrected in both places that carried it — `DocsPanel.tsx`'s `panelFront` doc and
    `docsScrollRestore.ts`'s module header both described *"a reload lands while the panel is hidden"*
    as the deferred arm's motivating case, which the skip-while-hidden gate contradicts. Both now name
    the real reaching path (the **race**) and cite the SURFACE. This is the single highest-value line
    of the trim: that stale sentence cost a whole live experiment.

    **Gates after the trim:** `tsc` 0 · lint **0 errors** · `format:check` clean · **1733/1733**.
  - [x] P3.4 Write the M11 exit verdict into `wbs.md` → "Probe outcomes" (per-clause evidence), tick tasks 5.1 + 5.2, and list the release-gate carries.  <!-- status: done — verdict GO, 12-clause evidence table; tasks 5.1 + 5.2 ticked -->

    **`### WP5 verdict (2026-08-02) — M11 MILESTONE EXIT: GO`** written to `wbs.md` → "Probe outcomes",
    with a **12-row table naming each exit-criterion clause** and its measured evidence, the static
    gate, the three things this WP changed beyond verifying, the release-gate carries, and the open
    filed items. WBS tasks **5.1 and 5.2 ticked**.

    **One clause is recorded as operator-accepted-as-asserted, not observed:** *"from any workspace"*
    was driven on **one** scratch workspace. Stated plainly in the verdict rather than papered over.

    **Release-gate carries: none Docs-specific.** M11 adds no PATH/env/external-spawn surface, so the
    installed-`.app` class does not apply; the only standing carry is the general first-run check
    already queued from M10.9.
  - [x] P3.5 Teardown: bridge stop, PID-scoped process kills after `ps` identity check, port check, fixture removal, scratch repo clean.  <!-- status: done — no manual kill needed; TaskStop reaped both -->

    | Step | Result |
    |---|---|
    | `driver_session{stop}` | all sessions stopped |
    | **`ps` identity check BEFORE any kill** | PID 79206 = `target/debug/claudesk`, PID 79162 = this repo's Vite — both confirmed as the ones **this session launched** |
    | `TaskStop` on the `tauri:dev` task | **both PIDs reaped — no manual kill was needed at all** |
    | Ports | `lsof -nP -iTCP:1420 -iTCP:9223` → **both FREE** (the `-nP -iTCP` form, since `-ti tcp:` misses Vite's IPv6-only listener) |
    | Fixture | `tmp/scratch/scratch-a/workflow-system/` removed; only `README.md` remains; that repo's `git status` **clean** |
    | Probe residue | grep for `MUTANT` / `WP5-*MARKER` / `__wp5tmp__` / `settledRef` across `src/` + `src-tauri/` → **zero** |
    | Scratch dirs | `scratch-a/b/c` all still present (not deleted) |

    ⚠️ **The identity check is not ceremony:** a blanket `pkill`/port-kill once killed the operator's
    live app (`[[verify-self-dev-vs-prod-process-name-collision]]`), and four unrelated
    `tauri-mcp-server` processes plus a second `claudesk`-matching node process were visible in
    `pgrep -fl claudesk` during this teardown. Only the two PIDs this session started were targeted —
    and in the end `TaskStop` handled both, so nothing was killed by hand.
  - [x] verify-auto  <!-- status: done — 5 scoped checks on the 5 changed files, all pass -->
  - [x] verify-self  <!-- status: done — audit found a BLOCKING FIFTH PATH in shipped code + 2 guard bypasses; all fixed in place, 7 mutants now bite -->
  - [x] verify-human  <!-- status: done 2026-08-02 — operator approved 5/5; the live re-drive of the fifth-path fix was DECLINED (operator: "skip it"); F13 -->
    - [x] P3.verify-human.1 Accept the fifth-path fix + that an audit caught a false invariant of mine  <!-- status: done — operator-approved -->
    - [x] P3.verify-human.2 Post-fix behavior NOT live-verified — accept static proof  <!-- status: done — operator DECLINED the live re-drive after being shown the 5-step sequence and my recommendation to run it; accepted 1734 tests + 7 mutants -->
    - [x] P3.verify-human.3 WP5's scope extension, now larger (5 source files)  <!-- status: done — operator-approved -->
    - [x] P3.verify-human.4 Exit verdict written before the fifth path was found  <!-- status: done — operator-approved as-is; no amendment requested -->
    - [x] P3.verify-human.5 Carry (d) trim  <!-- status: done — operator-approved -->
  - [x] verify-codify  <!-- status: done — coverage audit; 0 new tests (all written during build/verify-self); the one remaining gap is NOT codifiable without a new dependency decision -->

### Phase 3 verify-codify (2026-08-02) — 0 new tests, and the gap is structurally uncodifiable

**Integration boundary: YES** (`DocsPanel.tsx`, condition 2), so the rule demands a test exercising the
**consuming surface** — not just the new module. That is satisfied, but by an unusual route worth being
precise about (see the gap below).

**All coverage was written during build + verify-self, and the audit found nothing left to add:**

| Behavior approved at verify-human | Coverage | Where |
|---|---|---|
| The `settled` tier's four-way precedence | 7 value tests driving the real function | `pickInitialDoc.test.ts` (35 total) |
| The original defect (sibling edit moves the selection) | **named regression test** with built-in non-vacuity | `…test.ts:337` |
| **The fifth path** (mtime churn after a `refallback`) | **named regression test**, models the caller's sequence via the real `decideReload` | `…test.ts:388` |
| The consuming surface — latch wired, set, released only at the right **sites** | 4 strengthened wiring guards | `docsPanelWiring.test.ts` (35 total) |
| All of the above bite | **7 mutants**, each probed individually, each attributing to its own guard | recorded in verify-self |
| Comment trim kept every invariant | audit read all 55 deleted lines | verify-self axis 3 |

**⚠️ The one genuine gap, and why it is NOT codifiable here.** The operator declined the live re-drive,
so nothing proves React re-renders with the latched value through a real
`fs-change` → `setDocs` → re-render cycle. I checked whether a test could close it instead of a live run:

- **No component-render harness exists** — confirmed, not assumed: the only `render`-ish import in the
  repo is `renderToStaticMarkup` in `docsRender.test.tsx`, a **one-shot server render**. It can render
  `DocMarkdown` (pure, presentational) but cannot drive `DocsPanel`'s `useState`/`useEffect` lifecycle.
  (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` still holds.)
- **`@testing-library/react` is not installed** and not in `package.json`.
- **`DocsPanel` makes 4 Tauri IPC calls at mount** (`invoke` ×3 + `listen`), so even adding a harness
  would additionally require mocking the IPC boundary.

So closing this gap means **adopting a new test dependency and an IPC-mocking strategy** — a repo-wide
decision with its own deferred SURFACE, not something WP5 should settle unilaterally while already
running past its verification-only scope. **Writing a lower-tier test that *looked* like it covered the
cycle would be worse than the honest gap** — it is exactly the "unit test that passes while the
user-facing behavior is broken" this state's own guidance warns against, and this WP has already been
bitten twice by proofs that were weaker than they read.

**Disposition: leave the gap open and named** (in the WIP, the `wbs.md` verdict, and the backlog entry),
rather than paper over it. Natural closure: the operator's own dogfooding, where every
`/session-restore` exercises the triggering step.

**Full suite: 1734 passed / 140 files.** No failures → **no `## Test Triage` entry required** for this
state. *(Two triage entries exist from earlier in Phase 3; both were obsolete-test, both resolved.)*

### Phase 3 verify-human (2026-08-02) — APPROVED 5/5; the live re-drive DECLINED

**No auto-skip possible** — integration boundary applies (condition 2: `DocsPanel.tsx` backs an existing
UI surface and its user-visible behavior changed), so the F11 skip path is **forbidden** and this phase
pauses in every drive mode.

| Leaf | Item | Result |
|---|---|---|
| .1 | Accept the fifth-path fix, and that an audit caught an invariant of mine that was false in three files | **approved** |
| .2 | **Post-fix behavior is NOT live-verified** — accept the static proof instead | **operator DECLINED the live re-drive** |
| .3 | WP5's scope extension, now 5 source files | **approved** |
| .4 | The exit verdict was written *before* the fifth path was found | **approved as-is**, no amendment requested |
| .5 | Carry (d) comment trim | **approved** |

**⚠️ THE STANDING GAP, recorded so it is not mistaken for verified: the fifth-path fix has never run on
the real app.** P3.2's live table was recorded *before* the audit found the defect, so it verified the
**broken** version. The fix rests on **1734 tests + 7 mutants** — which prove the guards bite on source
text and the pure tier is correct, but **not** that React re-renders with the latched value through a
real `fs-change` → `setDocs` → re-render cycle. That last step is the only thing the live app shows, and
it is the exact class of gap that produced this defect in the first place.

**The operator was shown the 5-step sequence and my explicit recommendation to run it, and chose to
skip.** Recorded as a deliberate, informed decision — not an oversight, and not an implicit claim of
verification. The declined sequence, for whoever picks this up:

1. Relaunch `tauri:dev`, rebuild the fixture (2 wips + `.session.md`), open `scratch-a` → panel latches `.session.md`.
2. **Delete `.session.md`** → `refallback` fires (this is the step that cleared the latch in the broken version).
3. Scroll into the fallen-back wip (e.g. 600).
4. **Touch the *other* wip** so it becomes newest → **THE ASSERTION:** selection holds, scroll stays 600. *(Broken version: swaps doc, drops to 0.)*
5. Create then delete a new wip → confirms appear-jump and disappear-fallback still work **after** a re-latch (the "narrow, not a freeze" control).

**Failure mode if the fix is wrong despite the tests:** the selection moves and the reader loses their
place — **visible but harmless**; nothing is lost or corrupted. That asymmetry is what makes skipping
defensible. Natural next check: the operator's own dogfooding, where a real `/session-restore` exercises
step 2 on every restore.

**No design prior proposed** (§6b): approval without correction; the lesson here is
verification-method, not product-design.

### Phase 3 verify-self (2026-08-02) — the audit found a BLOCKING defect in the code I had just shipped

**Integration boundary: YES** (condition 2 — `DocsPanel.tsx` backs an existing UI surface and its
user-visible behavior changed). Satisfied by outcomes naming the real `RightPanelHost` docs slot in the
live WKWebView. App already torn down at P3.5, so the subagent audited on four hostile axes.

**⚠️ Axis 1 — FAIL / BLOCKING: a FIFTH selection-change path, in the fix itself.** The original defect
was a *fourth unmodeled path*; my fix added a tier and introduced a fifth. **The `jump` and
`refallback` arms are NOT symmetric:**
- `"jump"` releases `settled` **and immediately writes `jumpedTo`** → a tier above still pins the
  selection. Safe.
- `"refallback"` releases `settled` and writes **nothing** (`chosen=null`, `jumpedTo=null`) → drops the
  panel onto the **live-compute tier and leaves it there permanently.**

Exact sequence — and the trigger is the **most routine event in this workflow**:
1. Panel opens on `.session.md` (top-ranked), latches it.
2. **`/session-restore` deletes `.session.md`** — every restore — → `refallback` → all three tiers
   cleared. Selection correctly falls to the newest wip; reader scrolls in.
3. **CC touches a sibling wip.** `decideReload` → `"none"` (no arm runs), but `setDocs(next)` refreshes
   every mtime and `selectedDoc` falls through all four tiers → **selection swaps, reader dropped at
   `scrollTop` 0.** Byte-for-byte the defect this WP shipped code to fix.

So the invariant I had written into three files — *"only an appear/disappear may move an
auto-selection"* — **was false as shipped.**

**FIX: `refallback` RE-LATCHES instead of clearing** — `setSettled(decision.selected)`, where
`decision.selected` is already `pickInitialDoc(next)` (the answer computed *without* the vanished file,
so it cannot point at a deleted doc — which is what the old comment there feared). `chosen` stays
null, so jump-on-appear still fires; only the auto-resolution is pinned.

**⚠️ Axis 2 — FAIL / BLOCKING: two guard bypasses.** All four of my caller-side mutants reproduced
independently, and the comment-stripper was confirmed in force — but the audit found **two edits that
broke the fix while passing all four guards and all 69 tests**:
- **BYPASS-2 (fatal):** one extra `setSettled(null);` immediately after the latch write → the fix is
  **entirely inert**, original defect fully restored. `releases = 4` satisfied `>= 3`.
- **BYPASS-3:** a release added in the `"content"` arm, which must **never** release.

Root cause: **`releases >= 3` is an unbounded count with no site attribution** — it cannot tell "three
right places" from "three right places plus a wrong one." **Rewritten to pin by SITE:** exact count
(`=== 2`, since refallback now re-latches), presence of `setSettled(decision.selected)`, **no release
adjacent to the latch write** (kills BYPASS-2), and **zero `setSettled` in the `content` arm** (kills
BYPASS-3) — each with a non-empty-slice assertion so none can pass vacuously.

**Mutation campaign after the fixes — SEVEN mutants, each biting, each attributed:**

| Mutant | Caught by |
|---|---|
| M-A drop the 4th argument | 4th-arg guard |
| M-B never set the latch | latch-write guard |
| M-C drop the jump-arm release | site guard |
| M-D move the release out of `chooseDoc` (count preserved) | funnel guard |
| **BYPASS-2** neutralize the latch at birth | **adjacency guard (new)** |
| **BYPASS-3** release in the `content` arm | **content-arm guard (new)** |
| **M-E** `refallback` clears instead of re-latching (**the fifth path**) | **site guard (new)** |

⚠️ **An honest correction about M-E.** I first ran it against `pickInitialDoc.test.ts` and saw
**35/35 pass** — right observation, wrong conclusion. My new behavioral test drives the *real*
`decideReload` and asserts on `decision.selected`, so it models the **correct** sequence and
structurally cannot see a caller that ignores it. Re-run against `docsPanelWiring.test.ts`, M-E
**fails**. Division of labor: the behavioral test documents the *sequence*; the **wiring guard is what
actually prevents the regression** — a live instance of this milestone's own rule that extracting a
machine proves the machine, **not its caller**.

**Axis 3 — PASS.** The audit read all 55 deleted comment lines: all four ⚠️ invariants survive, both
rewritten claims verified **true against the code**, and the one deleted measurement
(`scrollHeight 3034 → 433`) survives in `docsPanelWiring.test.ts` + the archived WP4 WIP — so the
pointer-to-archive is honest, not dangling.

**Axis 4 — PASS.** Both pure-tier mutants re-run and `sed`-verified; the 6 tests are non-vacuous. The
audit's noted gap — *no test at any tier covered the post-`refallback` sequence* — is exactly why the
fifth path shipped invisible, now closed by the regression test + the site guard.

**Also independently verified by the audit** (things I had asserted): `docs_list` failure is correctly
unlatched (`pickInitialDoc([]) === null`); `settled` **cannot** point at a deleted doc (4 routes
probed); the "one mount is one project" keying claim holds (`CenterStage.tsx:43` `key={ws.id}`,
`project_path` never mutated).

**Gate after all fixes:** `tsc` **0** (one narrowing error found and fixed — `decision.chosen` read
before the `kind` narrow) · lint **0 errors** · `format:check` clean · **1734 tests / 140 files**.

⚠️ **Hazard flagged by the audit, worth heeding while this work is uncommitted:** it reflexively used
`git checkout -- <file>` to restore a mutant, which **reverted the uncommitted shipped work to HEAD**.
It caught this from a prior snapshot and restored byte-identically, then used `cp` thereafter. **Use
`cp` from a snapshot, never `git checkout`, to revert a mutant in an uncommitted tree.**

### Phase 3 verify-auto (2026-08-02) — 5 scoped checks, all PASS

Unlike Phases 1–2 (verification-only), Phase 3 **did** change source, so the standard scoped checks
apply. Five files: `pickInitialDoc.ts` · `DocsPanel.tsx` · `docsScrollRestore.ts` +
`pickInitialDoc.test.ts` · `docsPanelWiring.test.ts`.

| # | Check | Result |
|---|---|---|
| 1 | `tsc --noEmit` | exit **0** |
| 2 | `eslint` on the 5 files | exit **0** — zero errors **and zero warnings** in these files (the pre-existing `XtermPane` warning is elsewhere) |
| 3 | `prettier --check` on the 5 files | clean |
| 4 | Unit smoke — the two files exercising the new tier (**not** the full suite) | **69/69** |
| 5 | Import/arity smoke — `selectedDoc` gained a 4th parameter | passes: unlatched picks the newest, latched stays put; throwaway removed |

⚠️ **A vacuous-pass trap caught in passing:** the first attempt passed all five paths as one quoted
`$F` argument. ESLint failed loudly (`No files matching the pattern`, exit 2) — but **Prettier printed
`All matched files use Prettier code style!` while matching ZERO files.** A "clean" formatter result is
therefore consistent with checking nothing. Re-run unquoted before believing it. Same class as the rAF
sampler that reported `everHitZero: false` from zero samples (this WP's Phase 1) — an instrument that
examined nothing is indistinguishable from a pass.

Check 5 earns its place because `selectedDoc`'s **public signature changed**: a caller left on the
3-argument form type-checks fine (the parameter is defaulted) and silently disables the whole fix, so
arity is worth one direct assertion rather than trusting `tsc`.

## Current Node
- **Path:** Feature > ✅ SHIPPED — commit `0951d2d` (NOT pushed; 42 commits now ahead of origin/main, operator's call)
- **Active scope:** none — all **42** Work Tree checkboxes are `[x]` (Phases 1–3, each with impl + verify-auto + verify-self + verify-human + verify-codify). Next: `/feature-ship`.
- **Blocked:** none
- **⚠️ Standing gap, operator-accepted:** the fifth-path fix is **not live-verified** — the live run predates it. Rests on 1734 tests + 7 mutants. The operator declined the 5-step re-drive after being shown it; recorded in `wbs.md`'s verdict and the backlog entry so neither reads as verified.
- **⚠️ Phase 3 verify-self found and fixed a BLOCKING FIFTH PATH in the code P3.2 shipped** (the `refallback` arm cleared the `settled` latch and wrote nothing → after any `/session-restore` deleted `.session.md`, a sibling edit reproduced the original defect). Fixed by re-latching onto `decision.selected`. Also closed two wiring-guard bypasses. **7 mutants now bite**; gates green at 1734 tests.
- **Phase 1:** ✅ COMPLETE — all children `[x]` (P1.1–P1.5, verify-auto, verify-self, verify-human 5/5, verify-codify)
- **Phase 2:** ✅ COMPLETE — all children `[x]` (P2.1–P2.3, verify-auto, verify-self, verify-human 4/4, verify-codify)
- **Phase 2 headline (final, post-verify-self):** **BOTH carries are VACUOUS — neither the deferred restore nor the doc-shrink clamp has ever been proven live**, because **the browser supplies the correct answer unaided in both cases**: WebKit retains `scrollTop` on the never-unmounted `display:none` slot, and it clamps out-of-range `scrollTop` writes itself. Additionally the **`"deferred"` arm was never the path under test** — `DocsPanel.tsx:436`'s skip-while-hidden gate routes the hidden case to the `"applied"` arm via the `:462` catch-up. **Not** closed as unobtainable: reachable via the **race path** (reload while front, switch panels during the `docs_list`→`docs_read` round trip), filed as open work. Corrections written to `wbs.md` → WP4 4.4, `CHANGELOG.md`, the archived WP4 WIP, and `SURFACE-2026-08-02-BROWSER-SUPPLIES-THE-ANSWER-SO-SCROLL-RESTORE-CHECKS-ARE-VACUOUS`. **No code defect**; source reverted byte-identically, `src/` clean, 20/20 + 22/22 tests green.
- **Unvisited:** Phase 2 (discharge WP4 carries (a) deferred-restore isolation + (b) doc-shrink clamp), then Phase 3 (carry (c) operator behavior call · carry (d) disposition · M11 exit verdict · teardown)
- **Open discoveries:** none
- **Live session state:** ✅ **TORN DOWN at P3.5.** Bridge stopped, both PIDs reaped by `TaskStop` (no manual kill), ports 1420/9223 free, scratch fixture removed and that repo clean, zero probe residue in `src/`. Nothing left running.
- **Phase 3 headline:** carry (c) **reproduced live then FIXED** — operator chose **"pin once resolved"**, shipped as a fourth `settled` precedence tier (⚠️ a deliberate scope extension of a verification-only WP). Carry (d) **paid** — 50 comment lines cut, all 4 ⚠️ invariants preserved, plus the prose-vs-code fix that had cost a live experiment. **M11 exit verdict: GO**, recorded in `wbs.md` → "Probe outcomes" with a 12-clause evidence table; WBS tasks 5.1 + 5.2 ticked.

## Notes — method constraints that apply to every phase

Recorded here at plan time because each one has already cost this milestone real time:

- **Assert the parsed live DOM, never source text** (WP1 method note 1). The first WP1 danger
  predicate counted the fixture's own heading prose as live vectors.
- **A guard/observation must be mutation-proven, not merely present**, and the mutation must be
  `sed`-verified as landing in *executable* code (`[[verify-the-mutation-landed]]`).
- **`display:none` on a never-unmounted node makes some observations under-determined** — this is
  exactly carry (a). When an outcome could be satisfied by the browser rather than by our code, the
  isolating mutation is the only decisive move.
- **Relaunch the dev app before believing a verify RESULT**, not just before suspecting a diff
  (`[[hmr-stale-across-file-rename.md]]`, widened after this cost four wrong theories) — HMR keeps
  module identity while replacing closures, so hook-resident refs survive in shapes no source path
  can produce.
- **MCP bridge caveats that bite here:** `webview_interact{click}` may fail on
  `window.__MCP__.resolveRef` → fall back to `el.click()` inside `webview_execute_js`, but pair it
  with explicit geometry + `elementFromPoint` when the check is about *reachability*; a
  `webview_execute_js` that calls `invoke(...)` times out the eval → use fire-then-poll via a
  `window.__x` global; bridge tools do **not** reach spawned subagents, so drive the live checks
  directly rather than delegating them.
- **The integration-boundary rule** (which dissolved WP4's Phase 4 into Phase 3): a phase whose only
  content is another phase's verification has no independent deliverable. Phases 2 and 3 here each
  carry their own findings/decisions, not just re-checks of Phase 1.

## Code-Quality Review — m11-wp5-milestone-exit-verify

*Reviewer: `code-quality-reviewer` against ship baseline `0951d2d`. **0 CRITICAL / 2 MAJOR / 2 MINOR**.
**Both MAJOR and both MINOR were FIXED IN PLACE** rather than backlogged — see the dispositions below;
each was a small, self-contained correction to code written in this same WP, and MAJOR-1 was a
demonstrated silent-pass hole in a guard written minutes earlier.*

### Strengths (reviewer's, abridged)
- The **retraction discipline** — two previously-approved live proofs withdrawn across four durable
  records, with the mechanism explained and the code exonerated: *"a repo that reverses its own green
  verdicts is unusually trustworthy."*
- The fifth-path defect was found **inside the same phase that introduced it**, and the honest M-E
  correction applies this milestone's "the machine, not its caller" lesson to the author's own fix.
- `setSettled(decision.selected)` is correct on a non-obvious axis: `decision.selected` is
  `pickInitialDoc(next)` computed *without* the vanished file, so re-latching **structurally cannot**
  point at a deleted doc — the old comment's fear is dissolved rather than guarded.
- The position-not-arity regexes were **verified to survive a Prettier reflow to five multi-line args**.

### MAJOR-1 — ⚠️ FIXED. A silent-pass hole in the `chooseDoc` funnel guard.
`panel.indexOf("}, [])")` matches the **empty** dependency array. The moment `chooseDoc` gains a dep
(`}, [dep]);`), `indexOf` returns `-1` and `slice(start, -1)` **silently widens to nearly the whole
file** — so the guard keeps passing while the release has moved out of the funnel, i.e. **the exact M-D
bypass it exists to catch goes undetected.** The reviewer demonstrated it end-to-end. Verified here by
reading the code, then fixed: match **any** dep array (`/\}\s*,\s*\[[^\]]*\]\s*\)/`), assert the slice
index is `> 0`, and bound the body (`< 2000` chars — a function, not half a file). Re-probed after: the
bypass now **fails**, and for the right reason rather than by luck. *(A guard whose failure mode is a
silent pass is precisely what `[[verify-the-mutation-landed]]` exists to prevent — and I wrote it.)*

### MAJOR-2 — ⚠️ FIXED. Carry (d) was RE-INFLATED by my own new code.
Reviewer measured, and I confirmed: WP3 41% → WP4 45% → **WP5 ship 48%**, net **+35** comment lines.
The two new `settled` blocks were individually **larger than the offenders carry (d) named** — 23
comment lines above one `useState` (vs. the flagged 15-line block I had just cut to 5) and 18 above one
`setSettled(...)`. So the trim was real on its two targets while the file moved the wrong way.
**Fixed** by pruning exactly what the reviewer named as prunable-without-invariant-loss: the
three-rejected-drafts **process narrative** (kept as a 4-line ⚠️ FORBIDDEN SHAPES rule; the draft
history lives in this WIP) and the `refallback` block's re-telling of the fifth-path incident (kept the
mechanism, dropped the story the regression test already tells). **Now 46%, 650 lines, and all 25 ⚠️
markers intact** (verified by count, not eyeballed).
⚠️ **The reviewer's deeper point stands and is NOT closed by this trim:** four consecutive flags on one
file means the carry *"needs a density **budget**, not another trim pass."* Filed as a MINOR-batch item.

### MINOR-1 — ⚠️ FIXED. The fifth-path test's title over-claimed.
It drives the real `decideReload` and asserts on `decision.selected`, so it models the **correct**
caller and cannot catch one that ignores it (measured: reverting the fix leaves that file 35/35 green).
Renamed to *"documents the sequence; the WIRING guard is what pins it"* with the measurement in the
comment. *(A test named after a defect it structurally cannot detect is the same category error this
milestone spent two phases un-learning.)*

### MINOR-2 — ⚠️ FIXED. A justification that went stale within its own commit.
The jump arm's release was documented as "belt-and-braces for the case where a later `refallback`
clears `jumpedTo`" — but `refallback` now **re-latches**, so that reason no longer holds. The line is
still correct; the *reason* was one commit stale. Rewritten to state the actual invariant the reviewer
surfaced and the diff never stated outright: **`settled !== null` implies `settled` IS the selection**,
because both higher tiers clear it when they take over — which is what makes a stale pointer to a
nonexistent doc unreachable.

### Assessment (reviewer's, key judgments)
- **Correctness: sound.** The reviewer independently traced all three writers of `settled`, derived the
  invariant above, and checked the `docs_list` `.catch` recovery path and the initial-fetch/`runReload`
  race — **no defect in either**.
- **On the four-tier shape: not yet a smell.** Each tier is a distinct *authority* (user / jump /
  latched-auto / live-auto), not a special case of another, and the precedence is pure and
  mutation-proven. A `selectionSource` discriminated union would encode the invariant in the type
  system and is worth doing **if a fifth tier ever appears** — "proposing it now would be refactoring
  ahead of the evidence."
- **On the missing live re-drive:** defensible **only because the wiring guard holds the line** — which
  is why MAJOR-1 was the highest-value item in the diff, above the comment trim. That is exactly why it
  was fixed rather than backlogged.
- *"Future readers will find the logic clear and the file tiring; the WIP's own honesty is what keeps
  this a well-built change rather than a well-narrated one."*

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`feature-finalize` archives this WIP.

**Gate after all four fixes:** `tsc` 0 · lint 0 errors · `format:check` clean · **1734 tests / 140
files** · the M-D bypass re-probed and now caught.

## Test Triage — the four WP5 `settled`-latch wiring guards (`docsPanelWiring.test.ts`)
Classification: **Obsolete test** — they pin an implementation shape that WP5 itself abandoned mid-task.
Confidence: **high**
Evidence: all four assert the `settledRef.current` shape from my **second** draft of the latch. That
draft was rejected by lint (`Cannot access refs during render`, 5 errors), so the third and final
shape writes `setSettled(pickInitialDoc(entries))` in the `docs_list` response handler. The guards
therefore describe code that no longer exists, while the *properties* they state (the tier is passed
in; the latch is set from a resolved value; three release sites; the release lives inside the single
`chooseDoc` writer) are all still true of the final code.
⚠️ Worth noting they failed **correctly** — which is itself evidence the guards bite rather than pass
vacuously. Three drafts, three different lint/verdict outcomes: (1) `useEffect` + `setSettled` →
`set-state-in-effect`; (2) `useRef` read/written in render → `Cannot access refs during render`;
(3) ✅ state written in the fetch callback — not render, not an effect body.
Action: rewrote the four assertions against the final shape (`const [settled, setSettled] =
useState`, `setSettled(pickInitialDoc(entries))`, `setSettled(null)` ×3, and the `chooseDoc` body).
Then **re-ran the four-mutant campaign against the rewritten guards** (M-A…M-D) so their bite is
proven on the shipped code rather than inherited from the draft.

## Test Triage — "passes jumpedTo as the THIRD precedence tier, below the user's pick" (`docsPanelWiring.test.ts:303`)
Classification: **Obsolete test** — the WP5 P3.2 change intentionally supersedes what it checked.
Confidence: **high**
Evidence: the assertion is `expect(panel).toContain("selectedDoc(chosen, docs, jumpedTo)")`, a
**literal full-arity** match. The operator-approved fix adds a fourth tier, so the call is now
`selectedDoc(chosen, docs, jumpedTo, settled)` — the substring no longer appears, while the property
the test *states* (jumpedTo is passed as the third tier, below `chosen`) is fully intact.
⚠️ **This exact failure was already triaged once in this same file, one test earlier**: line 297-299
reads *"Prefix, not the full argument list. The original pinned `selectedDoc(chosen, docs)` exactly
and broke when the code-review refactor added a third precedence tier — the arm was asserting arity
when its stated property is seam-routing. Triaged as obsolete."* The fix was applied to that arm and
then the identical brittleness was reintroduced in the next one.
Action: rewrote the assertion to pin **ordinal position without arity** (`jumpedTo` appears as the
third argument, `settled` fourth) so the precedence property is still enforced but a fifth tier does
not break it. Kept the `const [jumpedTo, setJumpedTo]` assertion unchanged. The *behavioral*
precedence is pinned as VALUES in `pickInitialDoc.test.ts` (mutation-proven, see P3.2) — which is the
tier that actually protects the invariant; this guard only protects the seam routing.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-08-02] Phase 1 verify-self — four UNDER-DETERMINED evidence verdicts were closed
**in place** rather than via an F9b back-loop. Gate check: no source file was modified (this is a
verification-only phase — `git status -- src src-tauri` empty throughout), so there was no build to
re-run and no code fix to make; each closure was a **new live measurement** on the surface that was
still open. Re-verified by a fresh adversarial subagent audit *first* (which is what identified all
four), then by the new measurements themselves: no-dedup 4ms sampler (17 samples straddling the
content swap frame-by-frame), verbatim `data-rel-path` capture + the auditor's independent 200-permutation
`KIND_ORDER` re-derivation, and a gate-ON chord **positive control** (Editor → Docs on the same
synthetic dispatch, event fields recorded). The console-surface item was accepted as a scope
correction, not closed. Full detail in "Phase 1 verify-self — adversarial evidence audit".

[SHORTCUT-2026-08-02] P3.2 — Phase 3 verify-self returned **2 BLOCKING** findings against code shipped
minutes earlier: a **fifth selection-change path** (the `refallback` arm cleared the latch and wrote
nothing, dropping the panel permanently onto the live-compute tier, so a sibling edit after any
`/session-restore` reproduced the original defect) and **two guard bypasses** that broke the fix while
passing all four wiring guards. **Fixed in place rather than via an F9b back-loop.** Gate 1 (trivial
extension): both fixes are one-line-class edits to the leaf just written — `setSettled(null)` →
`setSettled(decision.selected)` in the `refallback` arm, plus rewriting one guard from a count to
site-located assertions. No redesign, no new abstraction, no file outside P3.2's scope. Gate 2 (fresh
model invocation): the findings came from a **freshly-spawned adversarial subagent**, and I verified its
central claim in the source myself before accepting it (the arm asymmetry, and that
`decision.selected` already carries `pickInitialDoc(next)`); the fixes were then re-proven by a
**seven-mutant campaign**, each mutant probed individually and each attributing to its own guard.
Gate 3: this entry. ⚠️ Note M-E initially reported "does not bite" — see the verify-self section for
why that was the right observation with the wrong conclusion.

[SHORTCUT-2026-08-02] P2.2/P2.3 — Phase 2 verify-self returned **1 BLOCKING** finding (carry (b)
recorded as PROVEN when it is VACUOUS: the browser clamps `scrollTop` itself) plus a mechanism
correction (the `:436` skip gate means the `"deferred"` arm never ran). **Fixed in place rather than
via an F9b back-loop.** Gate 1 (trivial extension): the defect was in *prose in three markdown
records*, not in code — no source file was touched by Phase 2 at all, so there was nothing for
`feature-build` to rebuild; the fix is a mechanical correction of claims in `wbs.md` → WP4 4.4, the
backlog SURFACE (also renamed to describe both carries), and this WIP's P2.1/P2.2/P2.3. Gate 2
(fresh model invocation): the finding itself came from a **freshly-spawned subagent**, and I
independently re-measured its central claim in the live app before accepting it (`999999` → 5256,
`max+500` → 5256, `-300` → 0, where 5256 = 5679−423). Gate 3: this entry.

⚠️ **The gate-2 re-verification EARNED ITS KEEP — my first correction pass was incomplete, and a
second fresh subagent caught five misses**, two of them serious: **`CHANGELOG.md:10`** still stated
the retracted 1200px measurement as verified fact (and CHANGELOG is the project's *sole canonical
narrative record*, read by people who never open a WIP), and the **WIP's `## Current Node`** still
carried `carry (b) PROVEN … (a) closed as unobtainable` — the field the Work Tree rules make
**authoritative on every skill entry**, so the next skill would have resumed on the pre-correction
verdict. Also missed: the **archived WP4 WIP** (a reader investigating what WP4 proved lands there
directly, and it still taught both wrong lessons *including* the mitigating argument WP5 refuted),
two stale HTML status comments, and the **"over-determined" framing** — which the auditor refuted
*in code*: the two findings are causally **chained**, since the `:462` catch-up capture reads the
live `scrollTop` that WebKit retained, so retention is the answer's *supplier*, not a second
independent leg. All five now fixed across `CHANGELOG.md`, `wbs.md`, the archived WP4 WIP, and this
file. **The lesson: correcting a claim means finding every record that repeats it** — a rename plus
the two files you were looking at is not a sweep.

[SURFACED-2026-08-02] Phase 1 verify-self — **`requestAnimationFrame` does not tick from the MCP
bridge's `webview_execute_js` eval context** (`frameCount: 0`), so a rAF-based sampler returns a
**vacuous** `everHitZero: false` that is indistinguishable from a genuine pass. Use a fast
`setInterval` (4ms) instead, and **always assert the sample count before believing an
absence-shaped result**. Candidate bridge caveat (h) — logged to `backlog.md`; generalizes beyond
this WP to any future live timing observation through the bridge.
