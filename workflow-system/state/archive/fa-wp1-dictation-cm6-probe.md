# Feature: F-a WP1 — Probe: macOS dictation into a CM6 prose view

**Workflow:** feature
**State:** complete (assumed-pass — see Phase 3)
**Created:** 2026-09-21
**Type:** probe (output is KNOWLEDGE, not shipped UI)
**WBS:** `workflow-system/product/wbs.md` → WP1 (cycle `group-f-a-prompt-staging-area`)
**Timebox:** half-day (agent instrumentation ~1–2h; operator run is minutes)

## Problem Statement

F-a's staging surface is a CodeMirror 6 prose view whose motivating input is **voice dictation**,
and **word wrap is a requirement** (operator, 2026-09-21). What is unknown is whether macOS
dictation composes cleanly into a CM6 `contenteditable` **with wrapping enabled** — dictation
inserts via IME/composition events rather than keystrokes, and a wrapping view reflows during
composition. ⚠️ **This probe finds *how* to make wrap work, not *whether* to wrap**; only an
outright infeasibility finding reopens that default, and that is the unlikely branch.

Two facts make this a probe rather than a build task. First, ⚠️ **it cannot be agent-verified** —
macOS dictation is physical operator input, not agent-triggerable or agent-observable. Second,
⚠️ **`grep` confirms ZERO IME/composition handling exists anywhere in the codebase**, so there is
no prior art to reason from. The cost asymmetry justifies the spike: knowing the composition
approach before WP3 is cheap; retrofitting IME handling into a shipped surface is not.

⚠️ **The operator's "dictation doesn't work well in the CC input area" is a CONTROL, not a
precedent.** That surface is xterm.js — a terminal grid with no text-field semantics — so it does
**not** predict CM6 behavior. Phase 2 includes it as a comparison arm precisely so the finding can
distinguish "dictation is bad in Claudesk" from "dictation is bad in *terminals*".

**No 3rd-party probe gap:** this WP **is** the probe. The external dependency (macOS dictation +
CM6 composition) is exactly what it exists to characterize, so §3's known-unknown flag does not
fire — it is satisfied by this work package.

## Work Tree

- [x] Phase 1: Harness — wrap-ON vs wrap-OFF CM6 views with composition instrumentation
  **Observable outcomes:**
  - Browser: navigating to `?cm6probe&mode=dictation` renders two CM6 editors side by side, one
    labelled wrap-ON and one wrap-OFF; both are focusable and accept typed text.
  - Browser: typing into either editor appends at least one event row to that editor's visible
    transcript readout (the readout is not empty after input).
  - Browser: no JS console errors on probe load.
  - CLI: `pnpm verify:auto` exits 0 (registry: ~31s warm, timeout 216000).
  - CLI: `grep -c "mode=dictation\|dictation" src/probe/cm6/Cm6ProbeApp.tsx` ≥ 1 — the mode is
    routed, not orphaned.
  - [x] P1.1 Add `DictationProbe.tsx` under `src/probe/cm6/`, following the established throwaway
        pattern (raw `EditorView`/`EditorState`, not the `@uiw` wrapper; reuse `./theme`).
  - [x] P1.2 Two editors: wrap-ON (`EditorView.lineWrapping`) and wrap-OFF, otherwise identical.
        No line numbers, no language mode — a **prose** surface, matching WP3's intent.
  - [x] P1.3 Instrument `compositionstart` / `compositionupdate` / `compositionend` plus
        `EditorView.updateListener` — record event kind, timestamp, insert position, and doc
        length delta per event.
  - [x] P1.4 Visible transcript readout per editor. ⚠️ **Required, not a nicety** — the run happens
        in the WKWebView where `read_logs{source:"console"}` captures nothing
        (`[[read-logs-console-captures-nothing]]`), so an on-screen readout is the only channel
        that reaches the operator.
  - [x] P1.5 Route `mode=dictation` in `Cm6ProbeApp.tsx` alongside `hotkey` and `nmount`.
  - [x] verify-auto  <!-- EXIT=0, 201 files / 2726 tests, Rust green, 27s -->
  - [x] verify-self  <!-- 5/5 PASS, 0 BLOCKING, 0 COSMETIC (subagent, 2026-09-21) -->
  - [x] verify-human  <!-- APPROVED 2026-09-21 in the dev app ("looking all good") -->
    - [x] P1.verify-human.1 wrap-ON dictation fires composition events
    - [x] P1.verify-human.2 wrap-OFF arm instruments independently
    - [x] P1.verify-human.3 readout legible enough to report from
  - [x] verify-codify  <!-- 4 tests, arm-divergence mutation-proved BOTH directions; suite 202/2730 EXIT=0 -->

- [x] Phase 2: Control arm + copy-out affordance
  **Observable outcomes:**
  - Browser: the probe page shows a third input — a plain `<textarea>` control arm — alongside the
    two CM6 editors.
  - Browser: clicking the "copy transcript" control puts a non-empty text report on the clipboard
    (verifiable by reading it back via `navigator.clipboard.readText()` in the probe context).
  - Browser: the report text contains all three arm labels, so a pasted result is self-describing
    with no operator annotation needed.
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P2.1 Plain `<textarea>` third arm — the known-good baseline. Distinguishes "CM6 breaks
        dictation" from "dictation is unreliable in a WKWebView at all".
        ⚠️ Instrumented in the SAME SHAPE as the CM6 arms (same event kinds, fields, clock
        origin) — a differently-shaped control would not be comparable, which is its only job.
  - [x] P2.2 One-click transcript export (clipboard + on-screen `<pre>`), labelled per arm, so the
        operator returns findings by pasting rather than transcribing.
        ⚠️ The report carries each arm's FINAL TEXT, not just event rows — a delta transcript
        cannot answer success criterion (c), "did the utterance survive intact?". Clipboard
        failure degrades to the on-screen box rather than losing the run.
  - [x] P2.3 On-screen run instructions naming the representative-input requirement, so the
        instruction travels with the harness rather than living only in chat.
  - [x] verify-auto  <!-- EXIT=0, 202 files / 2732 tests, Rust green -->
  - [x] verify-self  <!-- 4/4 PASS, 0 BLOCKING, 0 COSMETIC (subagent, 2026-09-21) -->
    ⚠️ **Noted, not a defect:** the report's `captured:` line is re-derived on every render, so
    two reads of it differ by that one line of 179 (verify-self diffed it rather than reporting a
    false FAIL on raw inequality). Harmless — and useful, since it dates the run — but **do not
    assert byte-equality between two report reads**; strip the `captured:` line first.
  - [x] verify-human  <!-- 2026-09-21 — see below -->
    ⚠️ **The harness was NOT rejected.** Verification was cut short by an ENVIRONMENTAL blocker,
    not a defect in P2.1–P2.3: dictation will not engage anywhere under `pnpm tauri:dev` (finding
    under Phase 3). The three checks that do not depend on dictation were satisfied — three arms
    render, the export is self-describing, instructions present. ⚠️ **The layout/legibility
    judgment (P2.verify-human.3) is UNRESOLVED** — it was never reachable, because the operator
    never got to dictate into the boxes. Re-ask it at the Phase 3 run, on the installed build.
  - [x] verify-codify  <!-- Phase 2's additions were codified in the SAME test file, extended
        during the Phase 2 build: 6 tests total (was 4), adding the real-`<textarea>` guard and
        the self-describing-report guard. Suite 202 files / 2732 tests, EXIT=0. -->

- [x] Phase 3: ⏸️ OPERATOR-GATED run — **NOT RUN; closed assumed-pass by operator decision 2026-09-21**

  ⚠️ **FINDING 2026-09-21 (Phase 2 verify-human) — DICTATION DOES NOT WORK UNDER `pnpm tauri:dev`.**
  **The probe cannot be run in a dev build.** Phase 3 requires an **installed `.app`**.

  **What was observed, in this order:** dictation would not engage in *any* of the three probe
  arms — including the plain `<textarea>` control. It also would not engage in the **dev app's own
  code editor** (`scratch-a` → `hello.txt`), which is the *same CM6 code* that works in prod.
  Meanwhile the operator confirmed dictation working **concurrently** in the installed prod app's
  editor. So the failure follows the BUILD, not the element, the framework or the page.

  ⚠️ **Hypotheses KILLED by evidence, in the order they fell** (recorded so none is re-proposed):
  1. *A CM6 / contenteditable problem* — killed: the plain `<textarea>` failed too.
  2. *A WKWebView or Tauri limitation* — killed: prod is also Tauri + WKWebView and works.
     ⚠️ The agent was about to web-search for a platform limitation; **the operator stopped it.**
  3. *A missing entitlement* — killed: prod has the STRICTER posture (hardened runtime) and works.
  4. *`spellcheck="false"` on the CM6 arm* — killed: the **working** prod-code editor carries the
     identical `spellcheck="false"` / `autocorrect="off"` / `autocapitalize="off"` attributes.
  5. *A probe-page defect (missing app-shell focus path)* — killed: the dev app's **real editor**
     fails too, and the probe page was never involved in that test.

  **Likely mechanism (direct evidence, not proven):** `pnpm tauri:dev` runs a **bare, adhoc-signed
  Mach-O** — `codesign` reports `Identifier=claudesk-<hash>`, `Signature=adhoc`, no
  `TeamIdentifier`, no hardened runtime — and **no `.app` bundle exists under `target/debug/`**.
  Prod is a Developer-ID-signed bundle (`com.claudesk.app`, Team `C8RJH77B47`, hardened runtime
  26.5.0). macOS dictation is a system text-input service that attaches to an app with a real
  bundle identity; a bare binary has none. ⚠️ Not isolated further: the per-app TCC route needs
  Full Disk Access, which was deliberately not granted to chase this.

  ⚠️ **Consequence for the WBS — WP1's shape changed.** The probe run is no longer "open the dev
  app"; it needs an installed build carrying the probe code. **That is not free**: the probe is
  dev-only scaffolding (`?cm6probe`), so shipping it inside a release is wrong, and the operator's
  standing rule is that **nothing may kill a running Claudesk** — so a `brew upgrade` is NOT the
  path. Resolving HOW to run it is Phase 3's first task, and it is a real decision, not a detail.

  ⚠️ **This finding is independently valuable beyond F-a**: any future feature whose verification
  depends on macOS text-input services (dictation, and plausibly autocorrect/emoji-picker/
  character-palette behavior) **cannot be verified under `tauri:dev`** and needs an installed
  build. That generalizes past this probe.
  **Observable outcomes:**
  - CLI: `workflow-system/product/wbs.md` → "Probe outcomes" is non-empty and answers (a) wrap +
    dictation compatibility, (b) whether explicit composition handling is needed and its shape,
    (c) whether a long single-take utterance survives intact.
  - CLI: if the finding changes a design input, `roadmap.md` → F-a reflects it
    (`grep -c "2026-09-2" workflow-system/product/roadmap.md` shows the updated dating).
  ⚠️ **OPERATOR DECISION 2026-09-21 — PHASE 3 IS NOT RUN. WP1 CLOSES ASSUMED-PASS.**
  Operator: *"dont' install the dev app. just assume it works based on the evidence of the probe
  in the browser."* No installed build is made; the dictation run does not happen.

  ⚠️ **WHAT IS ASSUMED vs. WHAT IS MEASURED — do not conflate these later.**
  - **MEASURED (verify-self, browser):** the HARNESS works — three arms render and instrument
    independently, the export is self-describing, and the two CM6 arms genuinely differ in
    wrapping (`white-space: break-spaces` vs `pre`).
  - **NOT MEASURED — assumed:** the probe's actual question. **No dictation was observed in any
    arm, in any build, at any point.** So all three success criteria are UNANSWERED: (a) does
    dictation compose cleanly into CM6 with wrap ON; (b) is explicit `compositionstart`/
    `compositionend` handling needed; (c) does a long single-take utterance survive intact.
  - The operator's basis is that dictation works in a normal browser. ⚠️ That is general
    experience with other pages, **not** a measurement of this surface — and it is exactly the
    inference `[[measurement-input-must-be-representative]]` warns about. Recorded as the
    operator's accepted risk, not as evidence.

  ⚠️ **THE STANDING RISK WP3 INHERITS.** WP3 ships wrap-ON with **no composition handling**,
  because none was shown to be needed — and none was shown to be *un*needed either. If dictation
  misbehaves in the shipped staging area, **this is the first place to look**, and the harness
  still exists to run the measurement that was skipped. ⚠️ **`grep` confirms ZERO IME/composition
  handling anywhere in the codebase**, so there is no safety net already in place.

  - [~] P3.1 ⛔ **NOT RUN — operator decision 2026-09-21 (see above).** `[~]` deliberately, not
        `[x]`: this task did not happen, and ticking it would falsify the record. The PHASE is
        closed; this LEAF is permanently not-run.
        Original task text: Operator dictates a **long passage**
        into each of the three arms and pastes back the exported transcript. ⚠️ **Per
        `[[measurement-input-must-be-representative]]` the input MUST be a long dictated passage**
        — a two-word test measures the harness, not the system, and that exact mistake has already
        produced two confident wrong generalizations in this project.  <!-- status: NOT-STARTED -->
  - [x] P3.2 ⛔ **NOT RUN** — no transcripts exist to analyze. WP3 applies **no** composition
        handling, by default rather than by finding.
  - [x] P3.3 Written to `wbs.md` → "Probe outcomes" as **ASSUMED-PASS, question unanswered** —
        NOT as a probe result. `roadmap.md` unchanged: no design input was measured, so nothing
        there is superseded.
  - [x] P3.4 **KEEP the harness** — decision reversed by the deferral. Throwaway-by-convention
        assumed the probe had *answered* its question; it did not. Deleting the only instrument
        that can settle the open risk, while the risk is still open, would be the wrong trade.
        ⚠️ It stays **dev-only** (`?cm6probe&mode=dictation`, lazy-mounted, never in the app
        bundle) and costs nothing shipped. Revisit once dictation is observed on an installed
        build — or delete it if the staging area proves fine in real use.

  ⚠️ **OPERATOR RULING 2026-09-21 — wrap-OFF is an INSTRUMENT, never a shipping option.**
  The staging area ships **wrap-ON only**; there is no wrap toggle and never was one under
  consideration (grill decision 5: wrap is a *requirement*). The wrap-OFF arm exists solely so a
  wrap-ON misbehavior would be *attributable* — without a no-wrap comparison, "dictation is broken
  in CM6" and "wrapping breaks dictation" are indistinguishable. ⚠️ **Consequence for P3.2:** if
  wrap-ON is clean, the comparison has nothing to diagnose and the wrap-OFF transcript is
  discardable — do **not** write it up as a finding, and do **not** read the two-arm harness as
  evidence that a wrap toggle was ever contemplated. Both arms die with the probe at P3.4.
  - [x] verify-auto  <!-- n/a — Phase 3 shipped NO code; the suite is unchanged from Phase 2 -->
  - [x] verify-self  <!-- n/a — nothing built to observe; the phase's only deliverable was a run
        that did not happen -->
  - [x] verify-human  <!-- the operator's decision not to run IS this phase's human input -->
  - [x] verify-codify  <!-- n/a — no behavior to codify. ⚠️ The UNANSWERED question is carried
        as a standing risk into WP3, not as a test. -->

## Current Node
- **Path:** Feature > complete (archived 2026-09-22)
- **Active scope:** none — all 3 phases `[x]`
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

⚠️ **Closed ASSUMED-PASS, not passed.** Phase 3's operator-gated dictation run **did not
happen** — the learning objective (how macOS dictation composes into a wrapping CM6 view) is
**unanswered** and is carried as a standing risk into WP3, which ships wrap-ON with **no**
composition handling by *default*, not by finding. The blocker that made the run impossible is
`SURFACE-2026-09-21-MACOS-TEXT-INPUT-SERVICES-DEAD-UNDER-TAURI-DEV` (medium). The probe harness
was deliberately KEPT (`?cm6probe&mode=dictation`) so the question can still be answered from an
installed build. This file was reconciled and archived 2026-09-22 without running
`feature-finalize` — the close was an out-of-band operator decision recorded in
`workflow-system/product/wbs.md` → "Probe outcomes".

### Phase 1 verify-self result (2026-09-21) — 5/5 PASS

⚠️ **Scope:** this verified the HARNESS renders and instruments correctly. It did **NOT** verify
dictation — that is Phase 3, physical operator input, not agent-observable.

Two observations that are load-bearing beyond a bare pass, and that Phase 3 depends on:
- ⚠️ **The two arms genuinely differ in the property under test** — computed `white-space` is
  `break-spaces` on wrap-ON vs `pre` on wrap-OFF. Without this, a null result in Phase 3 would be
  ambiguous between "wrap does not affect dictation" and "wrap was never actually on".
- ⚠️ **The instrumentation tracks real input, not fixed rows** — event counts matched characters
  typed exactly (29 events / 29 chars on wrap-ON; 30 / 30 on wrap-OFF).

Method notes: the subagent waited 700ms for the React re-render before reading transcripts (a
same-tick read reports the previous render — a false FAIL), and inspected the `grep` matches to
confirm line 32 is a live routing branch rather than a comment-only match.

## Notes for build

- ⚠️ **Probe code is THROWAWAY and lazy-mounted** — `src/probe/` never enters the normal app
  bundle (`main.tsx` lazy-imports on the URL flag). Do not import probe modules from app code.
- ⚠️ **Run in the real app, not bare Vite.** A WKWebView is the actual dictation target, and a
  stubbed browser run would verify precisely where it cannot reach
  (`[[verify-self-stub-cannot-cross-subprocess-boundary]]`).
- ⚠️ **Do not touch the operator's running Claudesk.** Verification launches its own dev instance;
  teardown is PID-scoped, never a blanket `pkill`
  (`[[verify-self-dev-vs-prod-process-name-collision]]`).
- Mirror `NMountProbe.tsx`'s shape: raw `EditorView`/`EditorState`, URL-param driven, `./theme`
  for styling.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
