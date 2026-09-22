# Feature: F-a WP3 — The prompt surface (right-panel tab)

**Workflow:** feature
**State:** COMPLETED 2026-09-22
**Created:** 2026-09-22
**WBS:** `workflow-system/product/wbs.md` → WP3 (cycle `group-f-a-prompt-staging-area`)
**Depends on:** WP2 (`stagedPayload.ts` / `draftStore.ts` / `draftHistory.ts` — shipped, archived)

## Problem Statement

A long dictated prompt has nowhere durable to live before it is sent. The CC pane's PTY line
buffer cannot be read back, snapshotted, or survive a process death — so a half-finished
dictation is one crash or one stray `\r` away from being gone. WP2 built the durable half (the
per-project draft store, the sent-draft ring, and the bracketed-paste payload builder) but
nothing mounts it. WP3 builds the surface the operator actually types into: a CM6 prose view in
its own right-panel tab, seeded from and debounce-saved to the project's draft. **Send is NOT in
scope — that is WP4.** This phase must prove the buffer holds and persists text correctly before
anything is allowed to transmit it, so that a later send failure is unambiguous between the
buffer and the payload.

## Settled constraints (from `wbs.md` → WP3 + `roadmap.md` → "F-a decisions"; do NOT re-litigate)

- **Right-panel tab** (decision 3) — chosen for full panel height on a long dictation. ⚠️ **Do
  not reach for the overlay precedent**: the only one in the tree (`FileFinder`/`CommandPalette`)
  is a **modal** (backdrop, `role="dialog"`, Escape-dismiss), actively wrong for a buffer holding
  a long dictation.
- **`editorExtensions.ts` is NOT reused** (decision 5). `basicSetup` brings line numbers and the
  code keymap as a bundle; this is a **prose** surface. Compose deliberately: history (undo AND
  redo), search-within-draft, dark theme, persisted font zoom. **Exclude** line numbers, syntax
  highlighting, bracket matching, autocompletion.
- **NOT gated** on `workflow_features_enabled` — F-a is lite-IDE core, not workflow
  orchestration. The `gate-substrate-dependent-feature-class-behind-default-off-opt-in` prior
  does **not** fire (over-infer guard, rule 5), and the absence is a decision, not an oversight.
- **One draft per project** (decision 6) — no tabs, no queue, no second "preamble" slot.
- **Word wrap is a REQUIREMENT, not a probe outcome** (operator, 2026-09-21).

## Inherited risks (carried, not resolved)

1. ⚠️ **WP1 closed ASSUMED-PASS with its question unanswered.** There is **no**
   composition-handling finding for task 3.3 — `grep` confirms zero IME/composition handling
   exists anywhere in the codebase. WP3 ships **wrap-ON with no composition handling by
   default**, not by finding. If dictation later proves to need it, that is new work.
2. ⚠️ **Dictation cannot be verified under `pnpm tauri:dev`** —
   `SURFACE-2026-09-21-MACOS-TEXT-INPUT-SERVICES-DEAD-UNDER-TAURI-DEV` (medium). It failed in a
   plain `<textarea>` AND in the dev app's own code editor, while working in the installed prod
   app. **Every Observable Outcome below is therefore written to be keyboard-verifiable**, and
   the dictation check is explicitly carved out to Phase 3's verify-human as an
   installed-build-or-defer item. ⚠️ **A green dev-build verify-self does NOT imply dictation
   works** and must not be reported as if it does.

## Design notes for the builder

- **Chord: `⌘⇧O`** — the letter **WP8 freed** when it deleted the in-app Sublime-Text pop hotkey
  as redundant with its button. ⚠️ **An existing assertion pinned ⌘⇧O as unclaimed and had to be
  INVERTED, not deleted** (`paletteCommands.test.ts`): "a freed chord stays free" was never the
  invariant — "exactly one predicate claims it" is, and a vacancy is just its zero case. The
  inverted test now names the owner rather than only counting claimants, so a future chord
  stealing ⌘⇧O would keep the count at 1 and still fail.
  ⚠️ Adding it requires a `CHORD_REGISTRY` entry whose `matcher` names a host that **actually
  calls it** — `chordRegistry.test.ts` asserts the call shape with comments stripped, so a
  documented-but-unwired entry fails the suite.
- ⚠️ **NAMED "Prompt", NOT "Staging" — renamed at Phase 1 verify-human (operator, 2026-09-22).**
  "Staging" reads as **git's staging area**, which is actively misleading directly beside a
  **Diff** tab. The original `⌘⇧S` went with it. **Do not restore either.** ⚠️ The WP2 storage
  keys (`claudesk.staging.draft:` / `claudesk.staging.history:`) were **deliberately left
  unrenamed** — a persisted wire format is not churned to chase a UI label, and renaming would
  orphan every draft already on disk. That divergence is documented at both constants.
- ⚠️ **Tab position: SECOND — immediately after `Docs`, before `Editor`** (operator, 2026-09-22
  verify-human: *"I'd place it between Docs and Editor"*). It shipped Phase 1 between Diff and
  Terminal and was moved. The principle: Docs answers *"where is this project?"*, Prompt answers
  *"what am I asking for?"* — both precede any editing question, so the two orientation surfaces
  lead and the three editing surfaces (Editor/Diff/Terminal) follow. The earlier placement split
  that pair with an editing surface.
  ⚠️ One edit to `AVAILABLE_PANELS` yields both orders, because `AVAILABLE_PANELS_WITH_WORKFLOW`
  spreads it after `"docs"`: gate ON → `Docs, Prompt, Editor, Diff, Terminal`; gate OFF →
  `Prompt, Editor, Diff, Terminal`. ⚠️ **The JSX tab order in `RightPanelHost` is a SECOND place
  that must agree** — the array is what the guards iterate, the JSX is what the user sees, and
  neither implies the other.
- ⚠️ **The opening panel did NOT change with the tab order, and a guard now pins that.**
  `defaultPanel` is a separate literal (`enabled ? "docs" : "editor"`), so an ungated workspace
  still opens on Editor even though Prompt now leads the row. F-a WP3 is the first time these two
  diverge, which makes `defaultPanel = availablePanels(enabled)[0]` a newly-tempting
  "simplification" that would silently change what every ungated workspace opens on. The new test
  asserts the **non-equality** in the gate-OFF direction (the gate-ON arm cannot catch it — docs
  is both the first tab and the default). ⚠️ **Mutation-proven:** replacing the body with
  `availablePanels(enabled)[0]` was confirmed to land in executable source (line 129) and the
  guard failed **by name**; restored via `cp` from a backup and verified by `shasum`, NOT
  `git checkout` (`[[git-checkout-no-ops-on-untracked-file]]` — the file has uncommitted work).
- **Ungated**, so it appears in `AVAILABLE_PANELS`
  itself (the ungated baseline) — ⚠️ which means the **M10.9 OFF-invariant guard asserts against
  this exact literal**. Adding a member to `AVAILABLE_PANELS` changes the OFF-state value the
  guard pins; that assertion must be updated in the same change, deliberately, not silently.
- **Slot mounting:** unconditionally mounted and `display:none`-toggled like Editor/Diff/Terminal
  — ⚠️ the `SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED` blank-slot failure mode. The
  Docs slot's conditional-mount idiom is **not** the precedent to copy here (it is conditional
  precisely because it is gated, and this panel is not).
- **Reusable à la carte** (do not pull the bundle): `editorDarkTheme`, `fontSizeCompartment` +
  `fontSizeTheme`, `lineWrapCompartment` + `lineWrapExtension` from `editor/theme.ts`;
  `clampFontSize`/`nextFontSize` from `editor/fontZoom.ts`; `safeStorage` from `fontZoomCore.ts`.
- ⚠️ **Font-zoom storage key must be its own** — reusing `claudesk.editor.fontSize` would couple
  the prose surface's zoom to the code editor's. A separate `claudesk.prompt.fontSize`.
- ⚠️ **Do not add a CM6 `Compartment` by analogy** (`[[cm6-dont-copy-compartment-by-analogy]]`) —
  a compartment earns its place only where a value is live-`reconfigure`d without an array
  rebuild. Font size is (the ⌘=/−/0 keybindings reconfigure in place); wrap is **static-on** here
  and therefore does **not** need one.

---

## Work Tree

- [x] Phase 1: Panel seam — tab, slot, chord  <!-- status: complete -->
  **Observable outcomes:**
  - Browser: With the workflow gate OFF, the right-panel tab row (`[role=tablist][aria-label="right panel"]`) contains a tab with `data-testid="panel-tab-prompt"`, and the tab order read left-to-right is exactly `Editor, Diff, Prompt, Terminal`.
  - Browser: Clicking `[data-testid="panel-tab-prompt"]` sets that tab's `aria-selected="true"` and every sibling tab's to `"false"`; the element `#panel-prompt-<workspaceId>` has computed `display` ≠ `none`, while `#panel-editor-<workspaceId>` has computed `display: none`.
  - Browser: The prompt slot `#panel-prompt-<workspaceId>` **exists in the DOM** (`document.querySelector` non-null) even while the Editor tab is front — mounted-and-hidden, never absent.
  - Browser: Dispatching a `⌘⇧O` keydown (`metaKey:true, shiftKey:true, key:"O"`) at the document promotes the prompt panel to front (same `aria-selected` / `display` assertions as the click path), and dispatching it a second time is idempotent (panel stays front, no error).
  - Browser: Switching to Prompt then back to Editor and forward to Prompt again preserves the panel's DOM node identity (the node captured on first mount `===` the node after the round trip) — proving `display:none` toggling, not unmount/remount.
  - CLI: `pnpm verify:auto` exits 0.
  - Console: No JS errors or React warnings logged during panel mount and three tab switches.
  - [x] P1.1 Add `"prompt"` to the `RightPanel` union and to `AVAILABLE_PANELS` (after `"diff"`, before `"terminal"`) in `panelHost.ts`. ⚠️ Update the M10.9 OFF-invariant guard's pinned OFF-state literal in the same change — it asserts `availablePanels(false)` and will now legitimately differ.  <!-- status: complete -->
  - [x] P1.2 Map `"s"` → `"prompt"` in `panelForChord` (ungated — no `enabled` term, unlike the `"k"`/docs arm).  <!-- status: complete -->
  - [x] P1.3 Add the `panel-select-prompt` entry to `CHORD_REGISTRY` (`label: "⌘⇧O"`, `host: "workspace"`, `matcher: "components/workspace/panelHost.ts"`, `claudeskOwned: true`, `requiresWorkflowGate: false`).  <!-- status: complete -->
  - [x] P1.4 Render the Prompt tab button in `RightPanelHost`'s tab row, mirroring the Editor/Diff idiom exactly (`role="tab"`, `id`, `aria-selected`, `aria-controls`, `data-testid`, `title="Prompt (⌘⇧O)"`). Ungated — not wrapped in a `workflowFeaturesEnabled &&` branch.  <!-- status: complete -->
  - [x] P1.5 Render the Prompt slot, **unconditionally mounted**, `display`-toggled on `panel === "prompt"`, with `role="tabpanel"` + `aria-labelledby`. Placeholder content for this phase — the CM6 view lands in Phase 2.  <!-- status: complete -->
  - [x] P1.6 Extend the `panelHost.test.ts` chord-exclusivity matrix so `⌘⇧O` is proven disjoint from every other registered chord.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — EXIT=0, 205 files / 2805 tests, Rust ALL GREEN (2026-09-22) -->
  - [x] verify-self  <!-- status: complete — 7/7 outcomes PASS via live MCP bridge, dev build (2026-09-22) -->
  - [x] verify-human  <!-- status: complete — operator approved 2026-09-22 after two changes: rename Staging→Prompt (⌘⇧S→⌘⇧O) and move to 2nd position -->
  - [x] verify-codify  <!-- status: complete — 2 JSX-tab-order guards added + mutation-proven (2026-09-22) -->

- [x] Phase 2: The CM6 prose view  <!-- status: complete -->
  **Observable outcomes:**
  - Browser: The prompt slot contains a CM6 editor (`.cm-editor` descendant of `#panel-prompt-<workspaceId>`), and that subtree contains **zero** `.cm-lineNumbers` / `.cm-gutters` elements — the exclusion is structurally observable, not merely intended.
  - Browser: Typing a string longer than the panel width via `browser_type` produces **more rendered `.cm-line` elements than `\n` characters typed** (wrap is on) and the editor's `scrollWidth` ≤ its `clientWidth` + 2px (no horizontal overflow).
  - Browser: Typing text then dispatching `⌘Z` (`metaKey:true, key:"z"`) reduces the document to its prior content; a following `⌘⇧Z` restores it — **both** directions asserted against the editor's exact text, not its length. (Undo AND redo — CM6 ships them as a pair.)
  - Browser: Dispatching `⌘F` with the prompt panel focused opens a CM6 search panel **inside the prompt slot** (`#panel-prompt-<workspaceId> .cm-search` non-null), not the editor panel's.
  - Browser: `⌘=` then `⌘-` then `⌘0` each change the editor's computed `font-size`, and the value after `⌘0` equals the mounted default; the resulting px is written to `localStorage["claudesk.prompt.fontSize"]` and **`localStorage["claudesk.editor.fontSize"]` is unchanged** by any of the three (the two zooms are independent).
  - Browser: The editor's computed `background-color` and `color` match the dark theme tokens (non-default, and identical to the values the Editor panel's `.cm-editor` reports).
  - CLI: `pnpm verify:auto` exits 0.
  - Console: No JS errors or React warnings during mount, typing, undo/redo, search-open, and three zoom steps.
  - [x] P2.1 New `src/components/workspace/prompt/promptExtensions.ts` — a pure builder for the prose extension set, **composed deliberately, not via `basicSetup`**: `history()` + `historyKeymap`, `search`/`searchKeymap`, `editorDarkTheme`, `fontSizeCompartment` + `fontSizeTheme`, static `EditorView.lineWrapping`. Excludes line numbers, language modes, bracket matching, autocompletion.  <!-- status: complete -->
  - [x] P2.2 New `src/components/workspace/prompt/promptFontZoom.ts` — key `claudesk.prompt.fontSize`, reusing `clampFontSize`/`nextFontSize`/`safeStorage` rather than re-deriving them.  <!-- status: complete -->
  - [x] P2.3 New `src/components/workspace/prompt/PromptPanel.tsx` — mounts the CM6 view with the P2.1 extensions, lazy-loaded via `Suspense` so it joins the existing shared CodeMirror async chunk (`SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD`). Local buffer state only in this phase; persistence is Phase 3.  <!-- status: complete -->
  - [x] P2.4 Replace Phase 1's placeholder with `<PromptPanel>` in the slot.  <!-- status: complete -->
  - [x] P2.5 Unit tests for `promptExtensions` (the exclusion set is asserted by **identity of what is present**, not by array length — `[[verify-the-mutation-landed]]`, source-text-guards entry 15) and `promptFontZoom` (clamp boundaries, key isolation from the editor's).  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — EXIT=0, 207 files / 2830 tests (2026-09-22) -->
  - [x] verify-self  <!-- status: complete — structural outcomes PASS; typing-dependent ones DEFERRED to verify-human (instrument limit) + 1 real defect found and fixed (2026-09-22) -->
  - [x] verify-human  <!-- status: complete — operator approved 2026-09-22; confirmed the 4 typing-dependent outcomes verify-self could NOT reach (wrap reflow, undo/redo, font zoom + editor isolation, ⌘F) -->
  - [x] verify-codify  <!-- status: complete — 2 JSX-prop guards added (basicSetup opt-out, PromptPanel-not-placeholder) + both mutation-proven (2026-09-22) -->

- [x] Phase 3: Draft wiring — seed, debounce-save, project switch, tab indicator  <!-- status: complete -->
  **Observable outcomes:**
  - Browser: With `localStorage["claudesk.prompt.draft:<canonical path>"]` pre-seeded to a known string **before** the panel first mounts, opening the Prompt tab shows exactly that string as the editor's document text (seed-on-mount, asserted by full-text identity).
  - Browser: Typing into the editor and then waiting past the debounce window writes the **exact typed text** to that same key; reading the key **immediately** after the keystroke (inside the window) still returns the pre-typing value — proving the write is debounced, not per-keystroke.
  - Browser: Clearing the editor to empty and waiting past the debounce **removes** the key (`getItem` returns `null`), rather than storing `""` — matching `saveDraft`'s documented deletion semantics.
  - Browser: With two workspaces open on different project paths, typing distinct text in each and switching between them shows each project its own text, and the two `claudesk.prompt.draft:` keys hold the two distinct values — **asserted by value identity, not by key count** (a count passes even if both keys hold the same string).
  - Browser: When a project has a non-empty stored draft, its Prompt **tab** carries an indicator (`[data-testid="panel-tab-prompt"][data-has-draft="true"]`); when the draft is cleared to empty the attribute reads `"false"` — checked on a **background** (non-front) panel too, so the indicator is proven to reflect stored state rather than the focused editor's live buffer.
  - Browser: Reloading the webview (`location.reload()`) and reopening the Prompt tab restores the last debounce-saved text — the durability claim the whole feature rests on.
  - CLI: `pnpm verify:auto` exits 0.
  - Console: No JS errors during seed, 20 rapid keystrokes, a project switch, and a reload.
  - [x] P3.1 Seed-on-mount from `loadDraft(projectPath)`; ⚠️ the seed must key on the **project path**, not the workspace id (`nextWorkspaceId()` resets every launch — `[[workspace-status-map-collapses-consecutive-events]]` sibling reasoning: the durable identity is the path).  <!-- status: complete -->
  - [x] P3.2 Debounced `saveDraft` on change. Extract the debounce decision as a **pure** module (`promptDraftSync.ts`) so it is vitest-testable as values rather than trusted inside a hook — the repo's standing pure-logic/live-DOM split.  <!-- status: complete -->
  - [x] P3.3 Project-switch correctness: on `projectPath` change, flush the pending save for the OUTGOING path **before** seeding the incoming one. ⚠️ Funnel both the flush and the debounced write through **one** function and guard that — extracting a state machine proves the machine, not its caller (`CLAUDE.md` verify-self tiers; hit twice in M11 WP4, one a shipped CRITICAL).  <!-- status: complete -->
  - [x] P3.4 Tab indicator driven by stored-draft presence for the tab's project, not by the live editor buffer.  <!-- status: complete -->
  - [x] P3.5 Component tests for seed / debounce / project-switch-flush. ⚠️ **Each test must specify the RETURN/INPUT contract, not just the stored state** — WP2's outcomes were all "what is in storage", which left `appendToHistory`'s return value unspecified and let a real defect reach code review. Write outcomes for both halves.  <!-- status: complete -->
  - [x] P3.6 ⚠️ Confirm the WP4 seam is **not** opened here: `grep` proves zero references to `stagedPayload`, `injectCommand`, `appendToHistory` or `cc_input` in the prompt module. Send is WP4's; an untested seam nothing consumes is the thing this check forbids.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — EXIT=0, 208 files / 2849 tests (2026-09-22) -->
  - [x] verify-self  <!-- status: complete — 6/6 outcomes PASS via live MCP bridge incl. a 3-workspace negative control (2026-09-22) -->
  - [x] verify-human  <!-- status: complete — operator approved 2026-09-22 ("all good"); dictation closed ASSUMED-WORKING by ruling, not tested -->
    - [x] ⚠️ **Dictation — CLOSED AS ASSUMED-WORKING by operator ruling, 2026-09-22.** Not tested, and deliberately so: *"just assume dictation works. don't bring this up again unless I find any issue after we ship a new release when this feature is fully done."* macOS dictation does not engage under `pnpm tauri:dev` at all, so neither agent nor operator can exercise it in a dev build, and the check was blocking a phase it does not gate. ⚠️ **This is the SECOND time this question has been closed without being answered** — WP1 closed assumed-pass on the same unknown (`SURFACE-2026-09-21-MACOS-TEXT-INPUT-SERVICES-DEAD-UNDER-TAURI-DEV`, medium). The standing risk is unchanged: the panel ships **wrap-ON with no composition handling**, by default rather than by finding. ⚠️ **Do NOT re-raise this at ship, finalize, or in a future phase.** The reopening condition is narrow and operator-owned: an issue the operator observes **after a release** with F-a complete.  <!-- status: complete (ASSUMED-WORKING, not verified) -->
  - [x] verify-codify  <!-- status: complete — 3-link indicator-wiring guard added, each link mutation-proven individually (2026-09-22) -->

## Retrospect

- **What changed in our understanding:** ⚠️ **Two defects shipped past a fully green
  `verify:auto`, and both were JSX PROPS.** The panel rendered WHITE because the dark theme went
  through `extensions` instead of the `theme` prop — the value was correct, the channel was not.
  And `basicSetup={false}` is a single prop holding up the whole of decision 5. Lint, tsc, 2,828
  tests and clippy were green through both. The generalizable lesson: **this project's automated
  gate cannot see a component's props at all**, so a prop carrying a design decision needs its own
  guard or a render test, and "the suite is green" says nothing about it.
- **Assumptions that held:** The pure-state-machine + funnel shape was the right answer to M11
  WP4's CRITICAL — and it proved itself immediately, catching my own first draft of the unmount
  cleanup calling `saveDraft` directly. Decision 5 (compose CM6 deliberately rather than reuse
  `editorExtensions.ts`) held without strain. WP2's store needed no changes to be consumed.
- **Assumptions that were wrong:**
  1. ⚠️ **"This project has no DOM environment" — asserted in three test files as justification
     for `?raw` guards, and it is a claim the repo has a written lesson correcting.** Five
     `renderToStaticMarkup` precedents existed. Replacing one guard with a real render **failed on
     its first run and exposed a defect the grep could never see**: `hasDraft` started `false`, so
     the first paint of a workspace with unsent work showed no dot — the exact case the indicator
     exists for. Believing a convenient constraint cost a real bug.
  2. ⚠️ **"Extracting the state machine and guarding the funnel is enough."** It is not. After
     wiring `planPanelChange`, deleting its call site again was mutation-tested and **all 44 tests
     still passed** — pure-function tests cannot see an unwired plan, because they call it
     themselves. The guard that closes this is "every exported plan function has a live caller",
     derived from the module's own exports.
  3. **The MCP bridge cannot drive CM6 at all.** Neither synthetic key events nor `beforeinput`
     reach it, and there is no JS handle on the `EditorView`. Confirmed as an instrument limit by
     positive control (typing into the *Editor* panel registered nothing either), not assumed.
- **Approach delta:** Phases matched the plan. Two operator changes landed mid-flight and both
  improved the result — the rename Staging→Prompt (⌘⇧S→⌘⇧O) and the move to second position. The
  rename forced a genuinely interesting call: **the storage keys were deliberately NOT renamed**,
  because a persisted wire format is not churned to chase a UI label.
- **What I would do differently:** Write the render test FIRST for anything whose question is
  "what does the DOM look like", rather than reaching for `?raw` and justifying it. Both of this
  feature's most valuable tests — the indicator render and the plan-caller guard — were written at
  code review, after a reviewer pushed back. Neither needed new tooling; both needed me to not
  take the cheaper instrument.

## Code-Quality Review — fa-wp3-prompt-surface

**Run 2026-09-22 against `3e32d53..6c50140`. Verdict: 0 CRITICAL, 3 MAJOR, 4 MINOR — ALL FIXED
IN PLACE, none backlogged.**

⚠️ **The diff window had to be set by hand.** The skill's `BASE_SHA` heuristic derives the range
from the WIP file's git history, but this project commits WIP files at *finalize*, not ship — so
it returned EMPTY. That is the trap that already bit WP2, where the reviewer would have reported
"no findings" having examined nothing. The window was anchored explicitly and confirmed non-empty
(5,018 lines) before the reviewer was spawned.

### MAJOR-1 — `planPanelChange` was dead code, and the comment promised a flush that never ran
Exported, documented and tested; **zero callers**. Worse than waste: the module header claimed
"a new write moment is a new input to this function", so an unwired input made the funnel read
as more complete than it was, while the data-loss window it named (tab away, quit inside the
400ms debounce) stayed open.
**Fixed by WIRING it, not deleting it** — the behavior is genuinely wanted. Its signature also
changed from `(pending, nextPanel: RightPanel)` to `(pending, stillFront: boolean)`: the Prompt
panel has no idea which sibling the host selected, so the old shape forced its one caller to
invent a plausible argument to satisfy the type.
⚠️ **Wiring it was not enough.** Deleting the new call site was mutation-tested and **all 44
tests still passed** — the pure-function tests cannot see an unwired plan, by construction, since
they call it themselves. A `every plan function has a live caller` suite was added, with a
second arm deriving the function list from the module's own exports so the NEXT plan function
cannot go unwired the same way. Both arms mutation-proven.

### MAJOR-2 — three tests justified `?raw` guards on a premise the repo documents as wrong
They asserted "this project configures no DOM environment". `docs/lessons/source-text-guards.md`
corrects exactly that: *"HALF TRUE, and the discouraging half has been steering work toward the
guard style that failed the nine ways above."* `renderToStaticMarkup` + `jsdom` are available,
with five working precedents.
**Fixed by replacing the P3.4 indicator guard with a parsed render**
(`promptTabIndicatorRender.test.tsx`). ⚠️ **The render test FAILED ON ITS FIRST RUN and exposed a
real defect the grep could never see:** `hasDraft` started at `false`, so the first paint of a
workspace with unsent work showed **no dot** — the exact case the indicator exists for. The
source guard was green throughout, because every literal it matched was present and correct.
`RightPanelHost` now seeds `hasDraft` from storage. The two remaining source guards were kept
deliberately: "is there exactly one `saveDraft` call site" and "is the WP4 seam absent" are
genuinely questions about the source, which is the side of the lesson's rule they belong on.

### MAJOR-3 — a count-of-3 assertion standing in for an identity one
Resolved by the MAJOR-2 rewrite (the guard lived in the block that was replaced).

### MINOR (4) — all fixed
- The `.cm-theme-light` rationale was stated in full in four places → one canonical statement at
  the `theme` prop, pointers elsewhere.
- Three inlined copies of the comment-stripping regex → extracted to `__tests__/stripComments.ts`.
  (Repo-wide copies in other suites deliberately left alone — not this feature's business.)
- `loadDraft` called twice at mount → the mount-seed effect reads the already-seeded `doc`.
- The one-funnel rationale stated three times in one 211-line file → header keeps it; the
  `runPlan` docblock and unmount comment thinned to one line each.

### Reviewer's assessment (verbatim)
"Well-built work that takes the project's own hard-won lessons seriously and mostly applies them
correctly — the pure-state-machine extraction paired with a funnel guard is the right response to
the M11 WP4 CRITICAL, the positive controls in the extension tests are textbook, and the ⌘⇧O
ownership migration is genuinely complete rather than merely additive."

### If you disagree
Mark any finding `[DISMISSED]` in this section before finalize archives the WIP. Note that all
seven were **fixed**, not backlogged — nothing is deferred for you to inherit.

## Current Node
- **Path:** Feature > COMPLETE — shipped, reviewed and finalized 2026-09-22
- **Active scope:** none
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

**Commits:** `ec7490c` (WP3) · `ceeabb3` (review-quality fixes). Siblings in the same session:
`c26a9bd` (WP2), `58aab90` (WP1 probe), `6c50140` (docs). ⚠️ **Local only — not pushed**, and
there are inherited commits ahead of these; publishing is the operator's call.

⚠️ **WP4 (send + stage) is still OPEN**, so F-a is NOT complete and the backlog ask
`SURFACE-2026-09-15-STAGING-AREA-FOR-PROMPT-INPUT` stays open, annotated as partially delivered.
The panel can hold and persist text; it cannot yet send it.

### Phase 3 verify-codify (2026-09-22)

⚠️ **Closed a gap that SPANS TWO FILES, which is why nothing else caught it.** The indicator is a
three-link chain — PromptPanel reports presence from inside its write funnel → RightPanelHost
holds it in state → the Prompt tab renders `data-has-draft`. The panel's own tests never render;
the host's `?raw` guards never look at the panel. Break any link and the dot silently stops
appearing, which is a failure noticed only by its absence.

**Each link was mutation-proven INDIVIDUALLY** (entry 16: a hunt finds *an* instance, never the
class):
1. `onDraftPresenceChange={setHasDraft}` removed from the host → caught.
2. `data-has-draft` **hardcoded to `"true"`** → caught. ⚠️ This is the one a bare
   `toContain("data-has-draft=")` would have MISSED, so the guard asserts the full template
   `{hasDraft ? "true" : "false"}` rather than the attribute name.
3. The mount-seed presence report deleted → caught by a **count** of 3 report sites (funnel,
   mount, project switch), so dropping any one fails rather than only the last.

**Phase 3 totals:** `verify:auto` EXIT=0 at 208 files / **2852 tests**.

### Phase 3 verify-self result (2026-09-22) — 6/6 PASS

Live observation through the `tauri` MCP bridge, dev build, **three** workspaces open
(`scratch-a` / `scratch-b` / `scratch-c`) — the multi-project shape this phase's correctness
properties are about.

| Outcome | Result |
|---|---|
| Seed-on-mount from a pre-seeded key | **PASS** — full-text identity, not length |
| Tab indicator lit for a stored draft **while the panel is BACKGROUNDED** | **PASS** |
| Durable across a full webview reload + reopen | **PASS** — shows v2, not the stale v1 |
| Two projects hold two DISTINCT drafts | **PASS** — asserted by VALUE, not key count |
| Indicator dark for a project with no draft | **PASS** — negative control, same page |
| No JS errors across 12 panel switches | **PASS** — tap self-tested |

⚠️ **The seed fixture was written BEFORE the workspace was opened**, while the app was still on
the picker — so `PromptPanel` had never mounted. Seeding after mount would have proved only that
the panel can read its own memory.

⚠️ **The durability check used a SECOND, DIFFERENT value.** Writing v2 to storage and then
reloading means "restored" cannot pass by the panel merely re-showing text it already held; the
assertion is `=== v2` **and** `!== v1`. A same-value fixture would have made the right and wrong
answers identical — the entry-15 trap.

⚠️ **The per-project isolation check asserts VALUE identity, not key count.** Two keys both
holding the same string would satisfy a count check while representing exactly the bug (project
A's text written into project B's key).

⚠️ **The indicator's negative control ran on the SAME PAGE as its positives** — a third workspace
with no stored draft read `data-has-draft="false"` and rendered no `::after` dot, while its two
siblings read `"true"` and did. Three tabs, two states, one render: a hardcoded attribute or a
dead CSS rule fails that. Computed `::after` content was checked, not just the attribute, so the
dot is proven to actually paint.

**Cleanup:** the three seeded drafts were removed at the end of the run — the operator's scratch
projects are not left holding agent-written text (`leftoverStagingKeys: []` confirmed).

**Relevance check (before Phase 3):**
- Requester still needs this: yes — operator approved Phase 2 at verify-human ("all good").
- Requirements unchanged: yes — Phases 1–2 changed the panel's name, position and theme
  channel; none touches Phase 3's scope (seed / debounce-save / project-switch / indicator).
- Solution still feasible: yes — WP2's `loadDraft`/`saveDraft`/`clearDraft` are shipped and
  tested, and `PromptPanel` already accepts `projectPath` (threaded in Phase 2 precisely so
  this phase would not have to re-plumb it through `RightPanelHost`).
- No superior alternative discovered: yes — decision 1 (localStorage keyed on canonical
  project path) was re-read at Phase 3 start and still holds.
**Verdict:** proceed

### Phase 2 verify-codify (2026-09-22)

⚠️ **Both new guards cover JSX PROPS — the blind spot this phase proved is real.** The
white-background defect passed `verify:auto` at 2828 tests because the dark theme was correct
*as a value* and merely supplied through the wrong channel; nothing in the project can see a
CodeMirror prop. Two props are now pinned:

1. **`basicSetup={false}`** — the single line enforcing decision 5. ⚠️ Flipping it back re-adds
   line numbers, fold gutter, bracket matching, autocompletion and the code keymap through
   **@uiw's own wiring, not through `promptExtensions`** — so every "deliberately OUT" test in
   `promptExtensions.test.ts` would stay green while the surface became a code editor again.
2. **`<PromptPanel` mounted, and `prompt-placeholder` GONE** — the slot/tab suites pass against
   a placeholder (Phase 1 shipped exactly that for a whole phase), so only naming the component
   catches a revert. Asserted in both directions.

Both **mutation-proven individually**: each failed by name with its siblings green, restored via
`cp` + `shasum`. Comment-stripped haystacks in both, since the panel's own explanatory comments
name `basicSetup` and `editorDarkTheme` — unstripped, each guard would pass exactly when the prop
it guards was deleted.

### Phase 2 verify-self result (2026-09-22) — 1 REAL DEFECT FOUND AND FIXED

⭐ **The panel shipped with a WHITE background.** Computed styles read `rgb(255,255,255)` on
`.cm-editor` while the Editor panel beside it read `rgb(30,30,30)`; the screenshot showed a white
bar across the top of the panel. Claudesk is dark-only (CLAUDE.md), so this is a defect, not a
preference.

⚠️ **Cause — a prop/extension distinction that is invisible to every automated gate.**
`@uiw/react-codemirror` defaults its `theme` prop to `"light"` when the prop is OMITTED, and wraps
the view in `.cm-theme-light`, whose rules BEAT an equivalent dark theme passed through
`extensions`. The dark theme was present and correct; it was just supplied through the wrong
channel. **The tell was the wrapper class** — `cm-theme-light` on the prompt panel vs. the
editor's plain `cm-theme`. Fixed by passing `theme={editorDarkTheme}` as the prop and removing it
from the extension set (it would otherwise apply twice).

⚠️ **`verify:auto` was EXIT=0 through the entire defect** — 2828 tests, lint, tsc, clippy all
green on a visibly broken panel. A regression guard was added and **mutation-proven**: deleting
the `theme=` prop makes it fail, and it survives the deletion *even though the surrounding comment
still names `editorDarkTheme`* — which is what the comment-stripping is for
(`[[raw-guard-identifier-satisfied-by-own-comments]]`).

**Structural outcomes — all PASS after the fix** (computed styles, live WKWebView):

| Outcome | Result |
|---|---|
| CM6 view mounts inside the prompt slot | **PASS** (`.cm-editor` present, `prompt-panel` testid) |
| **No gutters / no line numbers** | **PASS** — 0 and 0 |
| Soft wrap enabled | **PASS** (`cm-lineWrapping` class; computed `white-space: break-spaces`) |
| Dark theme matches the editor | **PASS** (`rgb(30,30,30)` bg, `rgb(212,212,212)` text — identical to Editor) |
| Wrapper is `cm-theme`, not `cm-theme-light` | **PASS** (the regression's direct tell) |
| No JS errors / React warnings | **PASS** (0 captured, tap self-tested) |

⚠️ **THE GUTTER POSITIVE CONTROL FAILED ON ITS FIRST RUN, AND THE FIRST RESULT WAS DISCARDED.**
"Prompt has 0 gutters" was initially paired with "Editor has 0 gutters" — the control proved the
probe could not distinguish anything, because the Editor had **no file open** and was showing its
empty state rather than a CM6 view. A file was opened and the control re-run: the SAME probe on
the SAME page then found **2 gutters / 1 line-number column** in the Editor and **0 / 0** in the
Prompt panel. Only that second reading is evidence
(`[[invalid-probe-and-real-hole-look-identical]]`).

⚠️ **DEFERRED TO VERIFY-HUMAN — an INSTRUMENT LIMIT, not a pass.** Every typing-dependent outcome
could **not** be agent-verified: CM6 reads the native input path, and neither
`webview_keyboard{press}` nor a synthetic `beforeinput` reaches it. **Confirmed as an instrument
limit by positive control** — typing into the *Editor* panel changed nothing either (88 chars
before, 88 after). So these are **UNVERIFIED, not verified**:
- wrap actually reflowing a long typed line (the *class* and CSS are confirmed; the reflow is not)
- undo/redo through the real keyboard (covered at unit level by a mutation-proven test)
- ⌘= / ⌘- / ⌘0 changing the rendered font size (this is also why the unit test deliberately
  claims only that the seed does not throw — see its comment)
- search-within-draft opening on ⌘F

**Instrument notes:** `webview_execute_js` times out on `async`/`await` — use synchronous IIFEs.
There is **no JS handle on the EditorView** (`.cm-content.cmView`, `EditorView.findFromDOM` and
`Object.keys` on the DOM node all come back empty), so CM6 cannot be driven programmatically from
the bridge at all. Teardown stayed PID-scoped; the operator's installed app (PID 4147) was
confirmed alive throughout.

**Relevance check (before Phase 2):**
- Requester still needs this: yes — operator approved Phase 1 at verify-human and said "move on".
- Requirements unchanged: yes — the two verify-human changes were the panel's NAME and POSITION;
  neither touches Phase 2's scope (the CM6 prose view inside the slot).
- Solution still feasible: yes — the slot is mounted, sized (959×859 observed) and reachable by
  click and by ⌘⇧O; Phase 2 only replaces its placeholder child.
- No superior alternative discovered: yes — decision 5 (compose deliberately, do not reuse
  `editorExtensions.ts`) was re-read at Phase 2 start and still holds.
**Verdict:** proceed

### Phase 1 verify-codify (2026-09-22)

⚠️ **Found and closed a REAL hole rather than restating existing coverage.** `AVAILABLE_PANELS`
order was pinned by `panelHost.test.ts`, and each panel's tab/slot existence by
`terminalSlotGuard.test.ts` — but **nothing pinned the order the tab BUTTONS are written in**. The
tab row is hand-authored JSX, not a `.map()` over the array, so the two orders are independent and
the operator's decision was about the JSX one.

Two guards added to `terminalSlotGuard.test.ts`: the rendered order must equal
`availablePanels(true)` (derived, so the two sources are asserted to agree rather than a third
list being introduced), plus a by-NAME pin that Docs is first and Prompt second — because the
derived test alone would still pass if the array and the JSX were reordered *together*.

⚠️ **Mutation-proven, and the probe distinguished a real hole from a redundant guard.** Swapping
the Prompt and Editor testids in the JSX: both new guards failed **by name**; the other 21 tests
in the file stayed green (so the guards are specific, not blanket); and **86 pre-existing tests
across `panelHost` / `readmeTierOneHonesty` / `offInvariantGuard` all PASSED on the mutant** —
which is the evidence that the hole was real and not already covered. Restored via `cp` +
`shasum`, not `git checkout` (`[[git-checkout-no-ops-on-untracked-file]]`).

### Phase 1 verify-human — RENAME (operator, 2026-09-22)

The panel shipped Phase 1 as **"Staging" / ⌘⇧S** and was renamed to **"Prompt" / ⌘⇧O** at
verify-human: *"can you use some other terms other than Staging? It can be misleading."* The
collision is with **git's staging area**, and it is sharpest precisely where this panel sits —
immediately beside the **Diff** tab, where "Staging" reads as *staged changes*.

Renamed across: `panelHost.ts` (union, `AVAILABLE_PANELS`, chord arm, ownership map),
`chordRegistry.ts`, `RightPanelHost.tsx` (tab + slot + testids), `App.css`, the three test files,
`README.md` tier-1 row, `CLAUDE.md`, and `sublime/sublimeLaunch.ts`.

⚠️ **Three things the rename forced that were NOT mechanical:**
1. **An assertion was INVERTED, not updated.** `paletteCommands.test.ts` pinned ⌘⇧O as *unclaimed*
   after WP8 freed it. Claiming the letter makes that test wrong — but deleting it would drop the
   exclusivity check entirely, so it now asserts exactly one claimant **and names the owner**.
2. **A contradiction surfaced mid-rename** and is the reason a blind find/replace was not enough:
   `panelHost.test.ts` simultaneously asserted ⌘⇧O → `"prompt"` and ⌘⇧O → `null` (the latter
   inherited from a list labelled "O sublime" — already stale since WP8). The null assertion was
   removed with its history recorded.
3. **The storage keys were deliberately NOT renamed** — see the note in the design section.

⚠️ **Verified by NEGATIVE CONTROL, not just the happy path:** the old `⌘⇧S` was dispatched first
and confirmed **not** consumed (`defaultPrevented: false`, panel unmoved) before `⌘⇧O` was shown to
work. Without that arm, a stale HMR bundle still answering the old chord would have looked
identical to a correct rename.

### Phase 1 verify-self result (2026-09-22) — 7/7 PASS, re-run after the rename

Live observation through the `tauri` MCP bridge against a **dev build** (`pnpm tauri:dev`,
bridge on 127.0.0.1:9223, `com.claudesk.app.dev`), workspace `ws-1` on `tmp/scratch/scratch-b`.
⚠️ The dev app was **fully relaunched** (not HMR-reloaded) before the post-rename run —
`[[hmr-stale-across-file-rename]]`, which is exactly this situation: a rename plus edits to a
component holding `useState`.

| # | Outcome | Result |
|---|---|---|
| 1 | Gate-OFF tab row is exactly `editor, diff, prompt, terminal` | **PASS** — observed, see note |
| 2 | Click promotes Prompt; exactly one tab `aria-selected`; editor slot `display:none` | **PASS** (`prompt: flex`, 959×859) |
| 3 | Prompt slot exists in the DOM while another tab is front | **PASS** (`display:none`, node present) |
| 4 | `⌘⇧O` promotes Prompt; second press idempotent | **PASS** (`defaultPrevented: true` both times) |
| 5 | Node identity survives Prompt→Editor→Prompt | **PASS** (`===` held across 5 switches) |
| 6 | `pnpm verify:auto` exits 0 | **PASS** (205 files / 2805 tests) |
| 7 | No JS errors or React warnings | **PASS** (0 captured) |

⚠️ **Outcome 1 was nearly verified by INFERENCE, and that would have been wrong.** The first
attempt read the gate-**ON** row and subtracted `docs` — which assumes the very thing under test
(that the gate removes only docs). Replaced with a real observation: the gate was flipped OFF
through the app's own `workflow_set_features_enabled` command, the row re-read, then restored.
With the gate off, the Docs **tab and slot were both absent from the DOM** while Prompt remained
present and front — which is the actual evidence that prompt is ungated by construction rather
than incidentally visible.

⚠️ **The console outcome used a SELF-TESTED tap.** `read_logs{source:"console"}` captures nothing
for this app (`[[read-logs-console-captures-nothing]]`), so an empty read there is a false green.
A `console.error`/`warn`/`onerror`/`unhandledrejection` tap was installed, **proven to capture** by
a deliberate sentinel error, then cleared before the real run. The 0-error result is therefore
meaningful rather than vacuous.

**Instrument notes for the next phase:** the bridge's `webview_execute_js` **times out on
`async`/`await`** — use synchronous IIFEs and settle between calls with a separate wait. React
state reads need a deferred frame (`[[react-state-read-needs-a-deferred-frame]]`) or they report
the previous render. Teardown was **PID-scoped** (dev `target/debug/claudesk` + its CLI parent
only); the operator's installed app at PID 4147 was confirmed alive before and after
(`[[verify-self-dev-vs-prod-process-name-collision]]` — a blanket `pkill` killed it once before).

### Phase 1 build notes (2026-09-22)

**Guards that fired and were updated deliberately** — each is a real pin on the OFF-state panel
set, not incidental churn:
- `panelHost.test.ts` × 3 — the `availablePanels(false)` / `AVAILABLE_PANELS` identity literals.
- `readmeTierOneHonesty.test.ts` — the tier-1 README row enumerating the ungated panel tabs.
  README updated to name Prompt; this guard is the reason a secondary-user-facing doc could not
  silently go stale.
- `terminalSlotGuard.test.ts` passed **without modification** and is load-bearing here: it
  iterates `AVAILABLE_PANELS`, so adding `"prompt"` automatically demanded the display-gated
  slot, the `panel-tab-prompt` tab, and the full `aria-controls`/`aria-labelledby` pairing.

⚠️ **The OFF-invariant guard needed NO change** — its arm checks `namesWorkflowTerm(panel)` against
`WORKFLOW_TERMS = ["workflow", "docs", "skill", "drivemode", "drive-mode"]`, and `"prompt"` is not
one. That is the correct outcome (prompt is genuinely ungated), but it is worth recording that the
guard's silence here is a *pass*, not an *absence of coverage*.

**Comment drift repaired in passing** (stale "three panels" claims that the 4th panel falsified):
`panelHost.ts` header + `selectPanel` docstring, `panelHost.test.ts` × 2, `paletteCommands.test.ts`
exclusivity header. One hardcoded loop in `panelHost.test.ts` ("never disturbs an ungated panel")
was re-derived from `availablePanels(false)` — it had already silently stopped covering the newest
panel, which is the exact drift shape `docs/lessons/source-text-guards.md` entry 13 describes.

**Chord coverage beyond the plan's P1.6:** ⌘⇧O is asserted against the FULL predicate set
(palette + panel + finder + search + tab-switch), and bare ⌘S is pinned as claimed by *nothing* —
a predicate that matched it would swallow CM6's save binding, which is a data-loss-shaped
regression rather than a mere collision.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
