---
stage: wbs
state: complete
updated: 2026-09-22
cycle: group-f-a-prompt-staging-area
---

# WBS — Group F item F-a: Staging area for prompt input

**Scope of this pass:** F-a only. Group F is deliberately **un-numbered** (`roadmap.md` → Group F),
and **F-b is explicitly NOT decomposed here** — it is milestone-sized, its scope expanded
2026-09-15, and it wants its own `/util-grill-me` pass at its own start. Future work stays tracked
in `roadmap.md`.

⚠️ **All design decisions are SETTLED — `/util-grill-me`, 2026-09-21.** The authoritative record is
`roadmap.md` → Group F → F-a → "F-a decisions" (6 numbered decisions). **This WBS does not
re-litigate them**; it sequences their implementation. If a task below appears to contradict that
record, the record wins and the task is wrong.

## Design-priors consult

- **`new-surface-must-earn-its-place-against-existing-ones` — fires, rule 2 (prior AGREES with the
  common-sense default; higher confidence).** F-a is a new surface overlapping an existing one: the
  CC pane already accepts typed text. Running the prior's decision rule, the irreducible non-overlap
  is **Claudesk-owned durability** — the PTY line buffer cannot be read back, snapshotted, or
  survive a process death. That is a *capability*, not merely a location, so the surface earns its
  place. The prior's "scope down to exactly that non-overlap" is already satisfied by the grill's
  decisions 5 and 6 (one draft, no queue, no code-editor furniture). **No WP boundary changed.**
- **`gate-substrate-dependent-feature-class-behind-default-off-opt-in` — does NOT fire
  (over-infer guard, rule 5).** F-a depends on no `~/.claude/` substrate and functions on a bare
  install, so by the prior's own **applicability** rule it is **not** gated on
  `workflow_features_enabled`. Recorded because the absence is a decision, not an oversight.
- No other prior governs. Remaining WP-boundary calls were made from common sense (rule 1).

## Work Packages

### WP1: Probe — macOS dictation into a CM6 prose view ✅ CLOSED 2026-09-21 (ASSUMED-PASS — commit 58aab90)

⚠️ **Closed WITHOUT the measurement being taken — see "Probe outcomes" at the foot of this file
before treating anything here as answered.**

**Type:** probe
**Milestone:** Group F / F-a — ~~must complete before WP3~~ (dependency discharged, not satisfied)
**Dependencies:** none (starts immediately; runs parallel to WP2)
**Size:** S

**Learning objective:** How does macOS dictation compose into a CodeMirror 6 `contenteditable`, and
what does **line wrapping** require in order to work with it? ⚠️ **Word wrap is a REQUIREMENT, not
an outcome of this probe** (operator, 2026-09-21) — the probe finds *how* to make wrap work, not
*whether* to wrap. Only an outright infeasibility finding would reopen the default, and that is the
unlikely branch.

**Why this is a probe and not a build task:** ⚠️ **It cannot be agent-verified.** macOS dictation is
physical operator input — not agent-triggerable, not agent-observable. ⚠️ **`grep` confirms ZERO
IME/composition handling exists anywhere in the codebase**, so there is no prior art to reason from
either. The cost asymmetry is the justification: knowing the composition-handling approach before
WP3 is cheap; retrofitting IME handling into a shipped surface is not.

⚠️ **The operator's "dictation doesn't work well in the CC input area" is a CONTROL, not a
precedent.** That surface is xterm.js — a terminal grid with no text-field semantics — so it does
**not** predict CM6 behavior. It is valuable as a known-bad comparison point, nothing more.

**Timebox:** half-day (agent instrumentation ≈ 1–2h; the operator's dictation run is minutes).

⚠️ **The wrap-OFF arm is an INSTRUMENT, not a shipping option (operator, 2026-09-21).** The staging
area ships **wrap-ON only** — no wrap toggle, and none was ever under consideration (decision 5:
wrap is a *requirement*). wrap-OFF exists solely to make a wrap-ON misbehavior **attributable**:
without a no-wrap comparison, "dictation is broken in CM6" and "wrapping breaks dictation" are
indistinguishable. If wrap-ON is clean, the comparison has nothing to diagnose and the wrap-OFF
transcript is discardable. **Both arms die with the probe.**

**Success criterion:** A written finding stating (a) whether dictation composes cleanly into CM6
with `EditorView.lineWrapping` enabled; (b) whether any explicit `compositionstart`/`compositionend`
handling is needed, and if so its shape; (c) whether a long single-take utterance (the real case,
not a two-word test) survives intact. ⚠️ **Per `[[measurement-input-must-be-representative]]`, the
probe input MUST be a long dictated passage** — a short phrase measures the harness, not the system.

**Tasks:**
- [x] 1.1 Add `mode=dictation` to the existing `?cm6probe` entry point (`src/probe/cm6/Cm6ProbeApp.tsx`),
      alongside `hotkey` and `nmount`. Lazy-mounted and throwaway, per the established pattern —
      never in the normal app bundle.
- [x] 1.2 Build the harness: two CM6 views side by side, **wrap ON** and **wrap OFF**, each
      instrumented to log `compositionstart`/`compositionupdate`/`compositionend`, insert positions,
      and the resulting document text.
- [x] 1.3 Add a visible transcript readout so the operator can see divergence without a devtools
      console (the run happens in the WKWebView, not bare Vite).
- [ ] 1.4 ⚠️ **NEVER RAN — the one task that would have answered the probe.** **OPERATOR-GATED:** operator dictates a long passage into each view and reports what
      happened. ⚠️ Agent does **not** fabricate or simulate this step.
- [x] 1.5 Record the finding in this file under "Probe outcomes" and, if it changes a design input,
      in `roadmap.md` → F-a.

**WP1 → WP2 rationale:** none needed — they are **parallel**, not sequential. WP2 touches no view
layer and therefore cannot be invalidated by the probe's outcome; starting it concurrently is free.

---

### WP2: Draft store, history ring, and the bracketed-paste payload ✅ SHIPPED 2026-09-21 (commit c26a9bd)

**Description:** The pure, headless core: persistence, the history ring, and the byte payload. No
React, no CM6, no UI. This is the part the probe cannot invalidate.
**Milestone:** Group F / F-a
**Dependencies:** none (parallel with WP1)
**Size:** M

⚠️ **Persistence is `localStorage`, keyed by canonicalized `project_path` — NOT `projects.json`**
(decision 1). That file is read at startup through serde, where unbounded operator prose risks
taking the whole project list down. ⚠️ **`project_path` is the correct per-workspace key** because
`nextWorkspaceId()` is an in-memory `ws-${++counter}` reset every launch (no durable workspace
identity) while `openWorkspace` dedups on the canonical path — **workspace↔project is bijective**.

⚠️ **`slashCommandPayload` is NOT modified** — a **new** builder sits alongside it so M12/M13/M15
callers stay byte-identical. The envelope is `ESC[200~` + body (interior newlines as `\r`, matching
xterm's own transform) + `ESC[201~`; the trailing `\r` is a **separate, optional** byte and is the
*only* difference between the two send modes.

**Tasks:**
- [x] 2.1 `draftStore.ts` — pure load/save/clear keyed by canonicalized project path, reusing the
      established `localStorage` module shape (`filmstripOrder.ts` / `terminalFontZoom.ts`:
      never throws, tolerates unavailable storage, returns a sane default).
- [x] 2.2 History ring — last ~10 sent drafts per project; append-on-send, bounded, oldest evicted.
- [x] 2.3 `stagedPayload.ts` — the bracketed-paste builder, with a boolean for the trailing `\r`.
      ⚠️ Pin it **byte-for-byte** in a test, the way `autoResumeFire.test.ts` pins
      `slashCommandPayload` against its Rust twin.
- [x] 2.4 Guard test: `slashCommandPayload`'s output is **unchanged** by this WP. A regression here
      breaks auto-resume, the skill row, and the supervisor at once.
- [x] 2.5 Unit tests for the store and ring (round-trip, eviction, corrupt-value tolerance,
      storage-unavailable path).

**WP2 → WP3 rationale:** the store and payload are the stable contract the UI consumes. Building
the surface first would mean designing its state shape against an unwritten store — and the store
is the half that carries the persistence decision, which is the one with a real failure mode.

---

⚠️ **SHIPPED BUT NOT COMMITTED (2026-09-21).** No commit SHA is recorded because the operator has
deliberately not committed this session — the restore pointer said so in terms and nothing since
revoked it. All three phases went through the full `build → verify-auto → verify-self →
verify-human → verify-codify` loop plus ship and review-quality; `pnpm verify:auto` EXIT=0 at
205 files / 2798 tests. **Delivered:** `stagedPayload.ts` (bracketed-paste byte payload, 18 tests),
`draftStore.ts` (per-project unsent-draft persistence, 19), `draftHistory.ts` (per-project sent-
draft ring, 29). ⚠️ `autoResumeFire.ts` is **byte-unchanged**, so M12/M13/M15 are untouched.
⚠️ **The WP1 dependency note above is unchanged and still correct** — WP2 was parallel to WP1 and
unaffected by its dictation blocker.

### WP3: The prompt surface — right-panel tab ✅ SHIPPED 2026-09-22 (commit ec7490c)

**Description:** The CM6 prose view and its right-panel tab wiring.
**Milestone:** Group F / F-a
**Dependencies:** **WP2** (store + payload). ⚠️ **The WP1 dependency is DISCHARGED, not
satisfied** — WP1 closed assumed-pass with its question unanswered (see "Probe outcomes"), so
there is no composition-handling finding to wait for. WP3 proceeds on the settled design
decisions, carrying the unmeasured risk.
**Size:** M

⚠️ **Right-panel tab** (decision 3), chosen for **full panel height** on a long dictation. A strip
under the CC pane and a floating panel were both considered and declined. ⚠️ **Do not reach for the
overlay precedent** — the only one in the tree (`FileFinder`/`CommandPalette`) is a **modal**
(backdrop, `role="dialog"`, Escape-dismiss), which is actively wrong for a buffer holding a long
dictation.

⚠️ **`editorExtensions.ts` is NOT reused** (decision 5). `basicSetup` brings line numbers and the
code keymap as a bundle; this is a **prose** surface. Compose deliberately.

⚠️ **NOT gated on `workflow_features_enabled`** — see the priors consult above.

**Tasks:**
- [x] 3.1 Add the tab to the `RightPanelHost` tab row and to `selectPanel`/`availablePanels`
      (`panelHost.ts`). ⚠️ The panel slot must be **mounted** whenever selectable — the
      `SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED` blank-slot failure mode.
- [x] 3.2 The CM6 prose view: **wrap per WP1's finding**, history (**undo AND redo** — CM6 ships
      them as a pair via `history()` + `historyKeymap`), search-within-draft, dark theme, persisted
      font zoom. **Exclude** line numbers, syntax highlighting, bracket matching, autocompletion.
- [x] 3.3 Apply WP1's composition handling, if the probe found any is needed.
      ⚠️ **VACUOUSLY SATISFIED — no handling was applied, because WP1 produced NO FINDING.**
      Its conditional ("if the probe found any is needed") is what makes the tick honest, but
      the tick alone would read as "composition handling was implemented", which it was not.
      The panel ships wrap-ON with zero IME/composition handling, **by default rather than by
      measurement**. Standing risk, carried knowingly; dictation is assumed-working by operator
      ruling (2026-09-22) with a narrow reopening condition — an issue observed after a release
      with F-a complete.
- [x] 3.4 Wire to WP2's store: seed on mount from the project's draft, debounced save on change.
- [x] 3.5 Tab indicator when an unsent draft exists for the focused project.
- [x] 3.6 Component tests for the non-trivial state logic (seed, debounce, project switch).

**WP3 → WP4 rationale:** the surface must hold and persist text correctly before anything is
allowed to *send* it. Wiring injection into a surface whose buffer is still unproven would make a
send failure ambiguous between the buffer and the payload.

---

### WP4: Send and stage — injection integration ✅ SHIPPED 2026-09-22 (commit 5af55f6)

**Description:** Both send modes, their hotkeys, and the clear-and-archive-to-history behavior.
**Milestone:** Group F / F-a
**Dependencies:** WP3
**Size:** S

⚠️ **Both modes ship** (decision 4): **auto-submit** (`⌘↵`) and **stage-only** (`⇧⌘↵`), differing by
the single trailing `\r`. Not a hedge — one payload builder, one boolean.

⚠️ **Enters through `injectCommand` with `label: "staging"`** — the single injection funnel. **Do
not open a second path to `cc_input`.** The label exists because M13 inherited a hardcoded
`auto-resume:` prefix and misattributed every button failure to M12's automatic arm.

⚠️ **Accepted cost, recorded at grill time:** stage-only's success is **unverifiable by Claudesk** —
`injectCommand` has no retry and no readback, and parsing CC's output is forbidden by `arch.md`. The
terminal is the evidence, which is acceptable precisely because the operator is looking at it next.
**Do not build machinery to close this.**

**Tasks:**
- [x] 4.1 Send buttons in the panel for both modes.
- [x] 4.2 Hotkeys `⌘↵` / `⇧⌘↵` as a `*Chord.ts` predicate module sharing `chordEvent.ts`, matching
      the 11 existing ones. ⚠️ Verify both are free against the existing chords first;
      ⌘⇧+digit is reserved for filmstrip switching.
- [x] 4.3 On send (either mode): clear the draft **and** append it to the history ring.
- [x] 4.4 Recover-from-history affordance (minimal — the ring is the load-bearing part; a richer
      browser is additive later).
- [x] 4.5 Tests: both payload shapes reach `injectCommand` with `label: "staging"`; clear+archive
      fires on both modes. ⚠️ Per `[[ts-arity-flexible-assignability-hides-a-widened-param]]`,
      **capture the argument VALUE** in the test double — a green suite does not prove the label
      or the trailing byte was passed.

---

## Dependency map

```
WP1 (probe, operator-gated) ─┐
                             ├─→ WP3 (surface) ─→ WP4 (send/stage)
WP2 (store + payload) ───────┘
```

**Critical path:** WP1 → WP3 → WP4. ⚠️ **WP1 contains an operator-gated step (1.4)** — the agent can
build and instrument the harness, but cannot run the dictation. Sequence 1.1–1.3 early so the
operator's step is unblocked as soon as they have a moment.

**Parallel track:** WP2 is fully independent and touches no view layer. It is the right work to run
while the probe's operator step is pending — the same pattern M14 used for enrollment.

**Sizing:** S + M + M + S. Simpler than M15, whose WP1 gated *every* downstream decision; here the
probe gates **one mechanism** (wrap + composition) inside an otherwise settled build.

## Ordering rationale against the standard sequence

- **Environment / Docker** — n/a; host-based dev env, already proven (`CLAUDE.md` → Dev Environment).
- **3rd-party probes** — WP1 is the probe, and it is first. The "3rd party" here is **macOS
  dictation + CM6's composition handling**, an external behavior whose shape is unknown and
  unobservable to the agent, which is exactly what §4 requires a probe for.
- **UI mockups** — **deliberately skipped.** The surface is one text view in an existing tab slot;
  there is no flow and no multi-screen navigation to validate. Per the `/util-option-mockup`
  discriminator, nothing here is "the same surface rearranged" across options either — the
  placement question was settled at the grill.
- **Backend synchronous path** — n/a; F-a is frontend-only. No Rust change, no new IPC. WP2 is the
  headless core standing in for this slot.
- **Orchestration / async** — n/a; nothing async beyond a debounce.

## Probe outcomes

### WP1 — CLOSED **ASSUMED-PASS, 2026-09-21. The probe's question was NOT answered.**

⚠️ **Read this before building WP3.** WP1 did not fail and did not succeed — it was **closed by
operator decision without the measurement being taken.** Do not cite it as evidence that
dictation into CM6 works.

**MEASURED (browser, verify-self):** the *harness* works. Three arms render and instrument
independently; the export is self-describing; the two CM6 arms genuinely differ in wrapping
(`white-space: break-spaces` vs `pre`). `verify:auto` EXIT=0, 202 files / 2732 tests.

**NOT MEASURED — all three success criteria are UNANSWERED.** ⚠️ **No dictation was observed in
any arm, in any build, at any point.** (a) does dictation compose cleanly into CM6 with wrap ON —
unknown; (b) is explicit `compositionstart`/`compositionend` handling needed — unknown; (c) does a
long single-take utterance survive intact — unknown. The operator's stated basis was that
dictation works in a normal browser; that is general experience with other pages, **not** a
measurement of this surface.

**WHY IT WAS NOT RUN — a real environmental blocker, discovered at Phase 2 verify-human:**
⚠️ **macOS dictation does not engage AT ALL under `pnpm tauri:dev`**, while working concurrently
in the installed prod app. It failed in all three probe arms **including a plain `<textarea>`**,
and equally in the **dev app's own code editor** (same CM6 code that works in prod). Five
hypotheses were killed by evidence — CM6/contenteditable, a WKWebView/Tauri limit, a missing
entitlement, `spellcheck="false"`, and a probe-page defect. Likely mechanism: `tauri:dev` runs a
**bare adhoc-signed Mach-O** with no `.app` bundle, and dictation is a system text-input service
that attaches to a real bundle identity. Running the probe therefore needed an installed build,
which the operator declined (correctly — the probe is dev-only scaffolding, and `brew upgrade`
would kill running sessions). Filed as
`SURFACE-2026-09-21-MACOS-TEXT-INPUT-SERVICES-DEAD-UNDER-TAURI-DEV`.

### ⚠️ What WP3 inherits

1. **Wrap-ON ships with NO composition handling** — by *default*, not by finding. ⚠️ `grep`
   confirms zero IME/composition handling anywhere in the codebase, so there is no safety net.
2. **If dictation misbehaves in the shipped staging area, look here first.** The harness is
   **KEPT** (dev-only, `?cm6probe&mode=dictation`, never in the app bundle) precisely so the
   skipped measurement can still be taken — on an installed build.
3. **WP1 no longer gates WP3.** The dependency was the *finding*, and there is none. WP3 may
   proceed on the settled design decisions alone.

### ⚠️ Consequence for WP3's own verification

WP3 builds the real staging surface, and its dictation behavior is subject to the **same**
blocker: it **cannot be verified under `pnpm tauri:dev`**. Plan WP3's verify-human to either run
on an installed build or to explicitly defer the dictation check — **do not** let a green dev-build
verify-self imply dictation works.
