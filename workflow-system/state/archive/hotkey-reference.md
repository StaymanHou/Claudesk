# Feature: Hotkey reference in the ⌘, Settings panel

**Workflow:** feature
**State:** COMPLETED 2026-09-17
**Created:** 2026-09-15
**Entry:** spec (complex feature)
**Milestone:** M14 (remainder) — WP3
**drive_mode:** autopilot

## Problem Statement

Claudesk has **~15 keyboard chords** and **no surface that tells anyone what they are**. A stranger
who installs it can discover a few from UI placeholder text (`Go to file… (⌘P)`) but has no way to
learn the other dozen; the operator knows them by muscle memory. For a milestone whose exit
criterion is *"a stranger can install Claudesk and use the lite-IDE core with a clean, coherent UX,"*
an undiscoverable keyboard surface is a real gap.

⚠️ **There IS already a chord-ownership map — but it is a COMMENT BLOCK, not data.** It lives at
`src/components/workspace/editor/paletteCommands.ts` (~lines 20–84), documents ~15 chords with their
owning WP and disambiguation rules, and is referenced **by name** from at least three other modules
(*"see the chord-ownership map in editor/paletteCommands.ts"*). Being prose, it:

- **cannot be rendered** in Settings (the user-facing gap above),
- **cannot be tested** for agreement with the code it describes, and
- **drifts silently** — the exact `docs/lessons/source-text-guards.md` failure mode.

**So this feature is primarily an EXTRACTION, not a construction.** The map already exists and is
already authoritative-by-convention; WP3 promotes it from a comment to typed data with one renderer
and one reachability guard. That is cheaper than writing a registry from scratch *and* it removes a
live drift risk that exists today.

**[Updated 2026-09-15: verify-self back-loop — the problem is BIDIRECTIONAL, which the original
statement missed.]** The statement above framed the risk as *"a comment cannot be tested against the
code it describes"* and the fix as *"promote it to typed data with one reachability guard."* That was
half right. The reachability guard proves **registry → code** (every entry is real). verify-self
found two chords the app registers that the registry omits — the **code → registry** direction, which
that guard structurally cannot see, because an entry-less chord is not an entry and nothing iterates
it. ⚠️ **The drift this WP exists to kill runs both ways, so it takes TWO guards, not one.** One of
the two omissions (`⌘\` line wrap) documents its own check against the OLD comment map and was then
never added to it — the same drift class, caught in the act, which is direct evidence the second
direction is the one that actually bites in practice.

## User Stories

- As a **stranger evaluating Claudesk**, I want to see every keyboard shortcut in one place, so I can
  learn the tool without reading source comments or guessing.
- As the **operator**, I want the chord map to be data the code is checked against, so a chord added
  in a future WP cannot silently diverge from its documentation.
- As a **future maintainer**, I want one place to add a chord's metadata, so the Settings list, the
  UI placeholder labels, and the ownership map cannot disagree.

## Acceptance Criteria

The feature is done when:

1. **A typed chord registry exists** as data (not comments), with one entry per chord carrying at
   minimum: a stable id, the display label (`⌘⇧F`), a human description, its **owner/host** (app-level
   · workspace-scoped · CM6-internal), and whether Claudesk owns it.
2. **The `⌘,` Settings panel renders a fifth group** listing every registry entry, grouped legibly by
   host. ⚠️ **EXTENDS** the M10.9 WP2 panel using its existing `SettingsGroup` component — does not
   rebuild it.
3. **The four existing `*_CHORD_LABEL` constants are subsumed**, not duplicated —
   `NEW_FILE_CHORD_LABEL`, `SEARCH_CHORD_LABEL`, `FINDER_CHORD_LABEL`, `PALETTE_CHORD_LABEL` are
   already consumed by `ProjectSearch.tsx` / `FileFinder.tsx` / `CommandPalette.tsx`, so those call
   sites must read the registry (directly or via re-export) and there must be exactly **one** string
   per chord in the codebase.
4. ⚠️ **CM6-owned chords appear, marked as not-Claudesk-owned.** `⌘F ⌘R ⌘S ⌘D ⌘=/-/0` belong to
   CodeMirror's `coreKeymap`. **Omitting them would make the list lie by omission** about why ⌘F
   behaves differently inside the editor. They are listed and labelled, not hidden.
5. ⚠️ **Context-overloaded chords are represented as such.** `⌘W` and `⌘T` mean different things
   depending on whether a right-panel **terminal** or the **editor** holds focus. The data model
   expresses this (multiple context-scoped meanings per chord) rather than flattening it to one wrong
   description. ⚠️ **Verified mechanism (2026-09-15): the overload is NOT two predicates.**
   `RightPanelHost.tsx:779` calls `shouldCloseTerminalOnChord({ isCloseChord: isCloseTabChord(e), … })`
   — the *same* `isCloseTabChord` predicate, routed by a focus-context decision function. **So a
   registry keyed 1:1 on predicates would misrepresent `⌘W`**: the entry is one chord with two
   context-scoped *outcomes*, not two chords.
6. ⚠️ **A reachability guard proves each registry entry has a real CALLER** — not merely that the set
   is enumerable. Every entry maps to a predicate that is actually invoked by a registration host.
   **This is the load-bearing test** (see Technical Constraints).
7. `pnpm verify:auto` passes.

## Out of Scope

⚠️ **Operator-confirmed twice — at decomposition and again at spec-open (2026-09-15).**

- ❌ **Rebinding of any chord.** v1 is a **read-only reference list**. *(Ruled at spec-open: "None —
  read-only list only.")*
- ❌ **Persistence of hotkey overrides** — no `settings.json` schema change, no new IPC. **WBS task
  3.4 is therefore VOID for v1** (see Deviations).
- ❌ **Per-binding reset-to-default** — meaningless with nothing to reset. *(Named in the WBS; removed
  by the read-only ruling.)*
- ❌ **Record-any-chord capture UI**, modifier normalization, per-workspace binding scopes,
  conflict-resolution UI.
- ❌ **Project-list management in Settings** — dropped from M14 entirely by ruling R-2; not this
  feature's concern.
- ❌ **Changing any existing binding's behavior.** This feature is additive and observational: no
  chord's semantics change.

## Technical Constraints

### Existing seams (verified by reading the code 2026-09-15 — do NOT re-derive)

- **`ChordEvent`** (`src/components/workspace/chordEvent.ts`) is the canonical minimal keydown shape
  `{metaKey, shiftKey, key, ctrlKey?, altKey?}`; `ctrlKey`/`altKey` are **optional because predicates
  are deliberately permissive** on them. ⚠️ It was itself created at a debt-paydown WP *because*
  every predicate had declared its own verbatim copy with a `// mirrors ChordEvent` comment while no
  `ChordEvent` existed. ⚠️ **`workspaceSwitchChord.ts` STILL declares its own
  `WorkspaceSwitchChordEvent`** — an outstanding instance of that same drift, and a candidate cleanup
  here.
- ⚠️ **Predicate signatures VARY — the registry must not assume a uniform boolean.** Some return
  `boolean` (`isSettingsChord`); some return a value (`workspaceSwitchIndex → number | null`,
  `panelForChord → panel | null`). 11 predicate modules exist, all **pure** (no React/DOM) and
  vitest-tested.
- ⚠️ **CM6's chords are real and verified** — `editorExtensions.ts` `coreKeymap()` binds `Mod-s`,
  `Mod-d` (twice, deliberately), `Mod-r`, `Mod-f`. Criterion 4 has a genuine subject; these are not
  hypothetical.
- **Three registration hosts, not one:** (a) `App.tsx` app-level capture-phase document listeners
  (⌘⇧+digit, ⌘⇧N, ⌘⇧A, ⌘,); (b) `RightPanelHost.tsx` workspace-scoped (finder, search, newFile,
  tabSwitch, closeTab, newTerminal, closeTerminal, `panelForChord`); (c) **CM6's `coreKeymap`, which
  Claudesk does not own.**
- **`SettingsGroup`** (`SettingsPanel.tsx:118`) takes `id` / `title` / `hint` / children and emits
  `data-testid="settings-group-<id>"` — a fifth group is genuinely additive.
- ⭐ **`useSettingControl` is NOT needed for v1** (read-only, nothing persists). Noted because its
  `coerce?` hook — *"so a stale or corrupt persisted value falls back to something valid"* — is
  exactly the malformed-value defense a future rebinding version would use. **The seam already
  exists; v1 simply does not reach it.**

### Reserved ranges (documentation, not enforcement, in v1)

⚠️ **`⌘⇧`+digit is RESERVED for workspace/filmstrip switching** — a **range**, not one binding
(memory `cmd-shift-digit-reserved-for-filmstrip`). **`⌘⇧O` is FREE** (WP8 deleted the Sublime-Text
chord). `⌘⇧E` is Editor panel-select / Sublime Text pop.

⚠️ **With rebinding out of scope, the "collision model" (WBS task 3.2) is DESCRIPTIVE in v1, not an
enforcement mechanism** — there is no user input that could collide. It is retained as registry
metadata (a chord is marked reserved/free/owned) so a future rebinding version inherits it. **Do not
build reserved-range *enforcement* this WP** — it would be an unreachable guard, the very dead-code
shape constraint 6 exists to prevent.

### Traps that must shape the plan

- ⚠️ **Enumerating the registry as data proves the SET, not that each entry has a CALLER.** This is
  the M12 dead-`/exit` / M13-registry trap — flagged **twice** in `CLAUDE.md` and hit **twice** in
  M11 WP4, one a **shipped CRITICAL**. **Funnel chord reads through ONE function and guard THAT.**
- ⚠️ **A `?raw` source guard asserting a bare identifier can be satisfied by the module's OWN
  COMMENTS** — acutely dangerous here, because *the thing being replaced IS a comment block*
  describing every chord. **Strip comments before asserting; assert the CALL shape `fn(`, not the
  identifier.** (memory `raw-guard-identifier-satisfied-by-own-comments`)
- ⚠️ **A guard substring must be UNIQUE to its site** — `grep -c` before relying on one (memory
  `raw-guard-substring-must-be-unique-to-its-site`).
- ⚠️ **Mutation-prove each guard INDIVIDUALLY and confirm the mutant landed in EXECUTABLE code** — an
  invalid probe and a real hole look identical; a landed mutation can still survive a behavioral test
  as an equivalent mutant (`docs/lessons/source-text-guards.md`).
- ⚠️ **A deleted ES-module export is a RUNTIME failure, not just a `tsc` error.** If the four
  `*_CHORD_LABEL` constants are moved/re-exported, **do not split the deletion from its consumer
  migration across phases** — run a boot smoke-test in the same phase (M13.5 WP3 cost a blank app
  with `verify:auto` and `tsc` both green).
- ⚠️ **Prose/JSX guards need a flattened haystack** — Prettier's wrap point is not a contract
  (memory `raw-guard-jsx-prose-needs-flattened-haystack`).

### Design-priors consult

- **[PRIOR: `explicit-selectable-mode-over-inferred-mode`] — fires, rule 3, leaning LOW-SURFACE.**
  Its risk-surface-vs-value clause: *"When a feature's value is unclear or low … prefer the
  lower-UI/UX-bug-surface implementation … Prove the value at the low-surface version first;
  escalate only when demand is real."* A hotkey editor's value here is **operator-unproven** (the
  operator's own bindings already work; this is friend-facing). **Operator confirmed the lean twice
  and then tightened it further** at spec-open — from "rebinding where cheap" to **no rebinding at
  all**. Recorded as a *strengthening* of the prior, not a new one.
- **[PRIOR: `new-surface-must-earn-its-place-against-existing-ones`] — CHECKED, does not block.**
  Its test: *does the new surface OVERLAP an existing one, or is it the INVERSE of one?* The chord
  list overlaps **nothing** — no surface renders this today; the four `*_CHORD_LABEL` placeholders
  show a single chord each at its own point of use, which the list subsumes rather than duplicates.
  ⚠️ Per the prior's own **boundary clause**, the four placeholders are **not** removed: they are
  point-of-use affordances, and deleting them to avoid "duplication" would be the M10.9 WP3.5b
  misapplication that boundary exists to prevent.
- **Over-infer guard applied:** no prior governs the registry's data shape or the guard strategy —
  those are technical, `arch.md` territory.

### 3rd-party probe check

**No 3rd-party dependency.** Purely internal: existing pure predicates, an existing React panel, no
external API, no SDK, no network. Step 2 does not apply.

## Deviations from the WBS (recorded, not silent)

⚠️ The read-only ruling at spec-open **changes WP3's task list**. `wbs.md` must be reconciled at plan
time:

| WBS task | Status after the ruling |
|---|---|
| 3.1 registry | **Kept, and reframed** — an *extraction* of the existing comment map, not a from-scratch build |
| 3.2 collision model | **Kept as DESCRIPTIVE metadata only** — ⚠️ enforcement is out of scope; building it would be an unreachable guard |
| 3.3 Settings group | **Kept** — unchanged |
| 3.4 persistence | ⚠️ **VOID for v1** — nothing persists, so no `settings.json` change and no malformed-value path exists to defend |
| 3.5 tests | **Kept, narrowed** — reachability (the load-bearing one) + label-single-source; ⚠️ the reserved-range and malformed-persistence tests have **no subject** in v1 |

**Net effect: WP3 is SMALLER than decomposed.** Size **M → S**. This is a scope *reduction* by
operator ruling, not discovered complexity.

## Open Questions

None blocking. Two decisions deliberately deferred to plan time as cheap-to-reverse:

- [ ] Whether the registry lives beside `chordEvent.ts` (`src/components/workspace/`) or gets its own
      module. Cheap to move; decide where the guard is easiest to anchor.
- [ ] Whether `workspaceSwitchChord.ts`'s stray `WorkspaceSwitchChordEvent` interface is folded into
      `ChordEvent` in this WP or left as a separate cleanup. ⚠️ **Related to constraint 5** — if
      folded, that is an export change and the runtime-failure trap above applies.

## Asked

1. **Which bindings should be rebindable in v1?** → **"None — read-only list only."** Chosen over
   *only ⌘⇧O* and *app-level chords (~4)*. This is what voids task 3.4 and makes the collision model
   descriptive.

## Assumed (defaults taken WITHOUT asking — the review backstop)

- **The list is grouped by registration host** (app-level · workspace · editor/CM6) rather than
  alphabetically or by chord — hosts explain *why* a chord behaves differently in different focus
  contexts. Cheap to reorder.
- **The Settings group is titled "Keyboard shortcuts."** Plain label; cheap to change.
- **It is placed last** among the five groups — it is reference material, not a control.
- **Non-Claudesk (CM6) chords are visually de-emphasized but present**, per criterion 4.
- **No search/filter box** on the list — ~15 entries fit without one; adding search is the kind of
  surface the prior argues against until demand is real.
- **The registry is frontend-only TypeScript.** No Rust side: nothing persists and the backend has no
  stake in chord identity.
- **The four `*_CHORD_LABEL` constants are re-exported from the registry** rather than deleted
  outright, keeping consumer call sites unchanged and sidestepping the ES-module-export runtime trap.
  ⚠️ If the plan instead deletes them, the consumer migration must land in the **same phase**.

## Work Tree

- [x] Phase 1: Extract the chord registry as typed data  <!-- status: COMPLETE 2026-09-17 — impl P1.1-P1.7, verify-auto, verify-self, verify-human (4/4 approved) and verify-codify all [x] -->
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0 with the new registry module present.
  - CLI: `pnpm vitest run src/components/workspace/__tests__/chordRegistry` exits 0; the
    reachability spec fails if any registry entry's predicate is not invoked by a real host.
  - CLI: `grep -c "PALETTE_CHORD_LABEL" src/components/workspace/editor/paletteCommands.ts`
    still returns ≥1 — the four existing label constants remain exported (re-export, not delete).
  - Console: no new lint or type errors (`pnpm lint` exits 0).
  - [x] P1.1 Define the registry types. ⚠️ **Predicate signatures VARY** — boolean
        (`isSettingsChord`), `number | null` (`workspaceSwitchIndex`), `RightPanel | null`
        (`panelForChord`). **Do NOT model a uniform boolean predicate.** Model a `match`
        as an opaque `(e: ChordEvent) => unknown` whose truthiness is not the contract, or
        carry the predicate reference without calling it — decide which at build time and
        record why.  <!-- status: NOT-STARTED -->
  - [x] P1.2 Model **context-scoped outcomes**. ⚠️ `⌘W` is ONE chord with TWO outcomes, not
        two chords — `RightPanelHost.tsx:779` routes the SAME `isCloseTabChord` through
        `shouldCloseTerminalOnChord({ isCloseChord: … })`. A 1:1 predicate→entry keying
        misrepresents it. Same shape for `⌘T`.  <!-- status: NOT-STARTED -->
  - [x] P1.3 ⚠️ Model the **workflow-gate dependency**. `panelForChord(e, enabled)` takes a
        SECOND arg and `⌘⇧K` (Docs) returns `null` while the gate is OFF — deliberately, so
        the keystroke passes through untouched rather than being swallowed. The registry must
        mark gate-dependent entries, or Phase 2 renders a dead affordance for a gate-off user
        (the exact thing `gate-substrate-dependent-feature-class-behind-default-off-opt-in`
        forbids).  <!-- status: NOT-STARTED -->
  - [x] P1.4 Transcribe the ~15 entries from the `paletteCommands.ts:20–84` comment map,
        **including the CM6-owned set** (`Mod-s`/`Mod-d`/`Mod-r`/`Mod-f`, verified present in
        `editorExtensions.ts` `coreKeymap()`) marked not-Claudesk-owned. Mark `⌘⇧`+digit as a
        RESERVED RANGE and `⌘⇧O` as FREE — **metadata only, no enforcement** (enforcement
        would be an unreachable guard).  <!-- status: NOT-STARTED -->
  - [x] P1.5 ⚠️ **Re-export** the four `*_CHORD_LABEL` constants from their current modules so
        `ProjectSearch.tsx:142` / `FileFinder.tsx:131` / `CommandPalette.tsx:123` keep working
        unchanged, with the registry as the single source. **A deleted ES-module export is a
        RUNTIME failure, not just a `tsc` error** (M13.5 WP3: blank app, `verify:auto` AND
        `tsc` both green). **If build instead deletes them, the consumer migration MUST land in
        THIS phase plus a boot smoke-test.**  <!-- status: NOT-STARTED -->
  - [x] P1.6 ⚠️ **THE LOAD-BEARING TASK — the reachability guard.** Enumerating the registry
        proves the SET, not that each entry has a CALLER (the M12 dead-`/exit` + M13-registry
        trap; hit twice in M11 WP4, one a shipped CRITICAL). **Funnel registry reads through
        ONE accessor and guard THAT**, and assert each entry's predicate is actually invoked by
        `App.tsx`, `RightPanelHost.tsx`, or CM6. ⚠️ **Mutation-prove INDIVIDUALLY and confirm
        each mutant landed in EXECUTABLE code** — a landed mutation can survive as an
        equivalent mutant.  <!-- status: NOT-STARTED -->
  - [x] P1.7 ⚠️ Replace the `paletteCommands.ts` comment block with a pointer to the registry.
        **A `?raw` guard asserting a bare identifier can be satisfied by the module's OWN
        COMMENTS** — acutely dangerous here because the thing being replaced IS a comment
        block naming every chord. **Strip comments before asserting; assert the CALL shape
        `fn(`; `grep -c` first to confirm the substring is unique to its site.**
        <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: PASS 2026-09-15 — tsc 0, scoped eslint 0, 12/12 chordRegistry (count-confirmed, not a filtered false-green), 4 label exports + 3 consumers intact; guard fail-probe confirmed -->
  - [x] verify-self  <!-- status: PASS 2026-09-15 (re-run after F9b) — 8/8 outcomes, 0 BLOCKING; completeness independently re-derived from source, duplication confirmed correct -->
  - [x] verify-human  <!-- status: PASS 2026-09-17 — all 4 leaves approved by operator; presented rather than auto-skipped (decision-artifact carve-out: 22 descriptions ship verbatim at Phase 2) -->
    - [x] P1.verify-human.1 Registry CONTENT review — the 22 descriptions ship verbatim to users in Phase 2  <!-- status: PASS 2026-09-17 — approved as-is; two non-blocking wording flags raised (⌘R "Open the search panel" reads near-synonymous with ⌘F; ⌘⇧A "global" may read as jargon) and deliberately NOT changed -->
    - [x] P1.verify-human.2 Should the 6 CM6-owned rows be SHOWN at all? (product-surface call)  <!-- status: PASS 2026-09-17 — KEEP all 6. Upholds spec criterion 4: omitting them would make the list lie by omission about why ⌘F differs inside the editor. Phase 2 P2.2 (de-emphasized but PRESENT) stands unchanged. -->
    - [x] P1.verify-human.3 Is ⌘= / ⌘- / ⌘0 appearing TWICE acceptable to a reader? <!-- status: PASS 2026-09-17 — ACCEPTABLE as two rows. Correctness was already adjudicated at verify-self (two genuine owners selected by live DOM focus; Workspace.tsx preventDefaults only on the left-half and right-panel-terminal branches). Operator confirms the legibility half too, so Phase 2 needs NO special presentation work for the duplicate — render it as two ordinary rows. -->
    - [x] P1.verify-human.4 Guard caveat — accept the backlog entry, or fix the selector now? <!-- status: PASS 2026-09-17 — ACCEPT the backlog entry; do NOT pull the structural fix into this phase. The completeness guard (chordRegistry.test.ts:258) filters on /[Cc]hord/ plus two hardcoded *Index names — a naming convention, not a structural property. Stays logged in backlog.md as its own change. -->
  - [x] verify-codify  <!-- status: PASS 2026-09-17 — 1 new test (font-zoom split canary), mutation-proven on 2 mutants INDIVIDUALLY, each confirmed landed in executable code and restored by checksum; pnpm verify:auto GREEN (frontend 198 files / 2712 tests, +1 = exactly this test, so it ran rather than being filtered; Rust all green, fmt + clippy -D warnings clean) -->

- [x] Phase 2: Render the list as a fifth Settings group  <!-- status: COMPLETE 2026-09-17 — impl P2.1-P2.4, verify-auto, verify-self (6/6), verify-human (5/5 approved) and verify-codify all [x] -->
  **Observable outcomes:**
  - Browser: with the app running, pressing `⌘,` opens Settings and a group with
    `data-testid="settings-group-hotkeys"` is present in the DOM.
  - Browser: that group's rendered text contains at least `⌘⇧F`, `⌘P`, `⌘⇧P`, `⌘N`, `⌘,`
    and a CM6-owned entry, with every entry showing a label AND a description.
  - Browser: the entry count rendered equals the registry's length (no silent truncation) —
    assert `querySelectorAll('[data-testid^="hotkey-row-"]').length` equals the exported
    registry length.
  - Browser: with the workflow gate OFF, no gate-dependent chord (⌘⇧K Docs) is presented as
    an active binding — ⚠️ **OFF must stay byte-identical to an app that never had the
    feature** (no dead affordance).
  - Console: no JS errors on opening Settings (⚠️ read via a self-tested tap + DOM-mount
    evidence — `read_logs{source:"console"}` captures NOTHING for this app and an empty read
    is a FALSE GREEN).
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P2.1 Add the group via the EXISTING `SettingsGroup` component (`SettingsPanel.tsx:118`
        — takes `id`/`title`/`hint`/children, emits `data-testid="settings-group-<id>"`).
        ⚠️ **EXTEND the M10.9 WP2 panel; do not rebuild it.**  <!-- status: DONE 2026-09-17 — used the existing SettingsGroup (id/title/hint); ⚠️ the plan's path `src/components/picker/SettingsPanel.tsx:118` was STALE, it lives at src/components/settings/ — re-resolved by symbol -->
  - [x] P2.2 Render entries grouped by registration host (app-level · workspace · editor/CM6),
        CM6 entries visually de-emphasized but PRESENT — omitting them makes the list lie by
        omission about why `⌘F` behaves differently inside the editor.  <!-- status: DONE 2026-09-17 — HOST_SECTIONS app/workspace/editor; CM6 rows PRESENT, de-emphasized via .settings-hotkey-row-foreign -->
  - [x] P2.3 Honor the gate at render: consume `useWorkflowFeaturesEnabled()` (the established
        hook — already used by `announceRow.ts` / `ProjectModelCell.tsx`) and hide or mark
        gate-dependent entries when OFF, per P1.3.  <!-- status: DONE 2026-09-17 — ⚠️ DEVIATION: used workflowFeatures.value (this panel's own live control) NOT useWorkflowFeaturesEnabled(); the panel already holds the gate and a second source would lag its own switch. Omits via visibleChords(enabled), not greying. -->
  - [x] P2.4 Guard the render against the registry: assert rendered row count equals registry
        length, so a future entry cannot be added to data yet silently not displayed.
        ⚠️ **Flatten whitespace before asserting any JSX prose** — Prettier's wrap point is not
        a contract.  <!-- status: DONE 2026-09-17 — hotkeyGroupRender.test.tsx: 5 render tests (renderToStaticMarkup + jsdom), row count asserted against the REGISTRY not a literal; 4 mutants caught INDIVIDUALLY, each confirmed landed -->
  - [x] verify-auto  <!-- status: PASS 2026-09-17 — `pnpm verify:auto` EXIT=0, the project's mandated single-command gate (CLAUDE.md overrides the skill's generic scoped-check guidance). Per-step evidence, not just the exit code: eslint 0 errors (1 pre-existing XtermPane warning, untouched); prettier clean; tsc clean; vitest 199 files / 2717 tests; cargo fmt 0 diffs; clippy -D warnings 0 errors; cargo test 926 passed / 0 failed. ⚠️ Frontend delta 2712->2717 = exactly the 5 new render tests, i.e. evidence the new file RAN rather than being silently filtered. -->
  - [x] verify-self  <!-- status: PASS 2026-09-17 — 6/6 outcomes, 0 BLOCKING, 0 cosmetic. Driven against a DEV build I launched (title 'Claudesk (dev)' confirmed — the operator's prod 0.5.1 PID 65019 was never touched). Subagent verified the CLI outcome independently (exit 0) and correctly declined the 5 browser outcomes rather than emitting bare-Vite false verdicts. -->
  - [x] verify-human  <!-- status: PASS 2026-09-17 — all 5 leaves approved by operator ("all pass"). ⚠️ NOT auto-skippable: an integration boundary APPLIES (SettingsPanel.tsx is an existing UI surface with changed user-visible behavior), so the F11 skip path is forbidden in every drive mode including autopilot. -->
    - [x] P2.verify-human.1 Group hint copy — new user-facing text Phase 1 never reviewed  <!-- status: PASS 2026-09-17 — approved as-is. "Every chord Claudesk responds to. Editor shortcuts belong to CodeMirror, not Claudesk — they are listed so it is clear why a key behaves differently inside the editor." The raised concern (does "every chord Claudesk responds to" overclaim given the editor rows are NOT Claudesk's?) was considered and accepted; the second sentence resolves it. -->
    - [x] P2.verify-human.2 Section names APPLICATION / WORKSPACE / EDITOR  <!-- status: PASS 2026-09-17 — approved. ⚠️ These are RENDER-LAYER strings (HOST_SECTIONS in SettingsPanel.tsx), NOT registry data — the registry's host values are app/workspace/editor. Renaming a section touches only the render layer. -->
    - [x] P2.verify-human.3 Group ordering — hotkeys renders LAST of five  <!-- status: PASS 2026-09-17 — approved. Rationale upheld: the first four groups are CONTROLS that change behavior, this is READ-ONLY reference, so it sits below them. The competing view (a reference list is what a new user most wants, so put it higher) was raised and rejected. ⚠️ Position is pinned by settingsPanelWiring.test.ts's exact ordered equality — moving it is a deliberate two-site edit. -->
    - [x] P2.verify-human.4 The ⌘= / ⌘- / ⌘0 duplicate, now seen RENDERED  <!-- status: PASS 2026-09-17 — vh3's data-level ruling HOLDS at the visual level. Renders once under WORKSPACE (full opacity, two outcomes: Claude Code terminal font + right-panel terminal font) and once under EDITOR (opacity 0.68, editor font). No merged row, no special presentation. -->
    - [x] P2.verify-human.5 Gate-OFF shape — silent omission, no gap or placeholder  <!-- status: PASS 2026-09-17 — approved. With the gate OFF the WORKSPACE section drops to 11 rows and ⌘⇧K vanishes with no visual trace; a gate-off user seeing 21 shortcuts is NOT left wondering what is missing. Upholds the OFF-invariant: byte-identical to an app that never had the feature. -->
  - [x] verify-codify  <!-- status: PASS 2026-09-17 — ZERO new tests, deliberately: all 5 rulings are either already covered by tests written and mutation-proved earlier in this phase, or are free prose that must not be pinned. Coverage re-proved by a cross-section merge mutant (caught by 3 tests). pnpm verify:auto EXIT=0, 199 files / 2717 frontend / 926 Rust. -->

## Current Node
- **Path:** Feature > finalize (COMPLETE) — archived
- **Active scope:** none. Feature COMPLETED 2026-09-17, shipped `5e3ecd9`. Both phases [x], every
  verify node passed, review-quality done (0 CRITICAL / 3 MAJOR / 3 MINOR, all backlogged).
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** three carried to backlog — the P2.3 gate-seam deviation (low), the
  review-quality diff-window gap on a parked feature (medium), and the 6 quality findings (pointer).
  ⚠️ `SURFACE-2026-09-15-CHORD-COMPLETENESS-GUARD-KEYS-ON-A-NAMING-CONVENTION` stays OPEN by
  operator ruling at verify-human (accept the entry, do not fix the selector now).

## Retrospect

- **What changed in our understanding:** The feature was framed as an EXTRACTION — promote a comment
  map to typed data, guard it, render it. That framing was half right, and the missing half was the
  whole lesson. ⚠️ **The drift this WP exists to kill runs in TWO directions, so it takes TWO
  guards.** The planned reachability guard proves registry → code (every entry has a real caller).
  It cannot see code → registry: an entry-less chord is not an entry, so nothing iterates it. The
  verify-self fidelity audit found **two chords the app registers that the map never listed** — and
  one of them (`⌘\` toggle wrap) carried a source comment claiming it had been "confirmed disjoint
  from every chord in paletteCommands.ts's ownership map," i.e. it was checked against the comment
  map and then never added to it. **The exact drift class this WP exists to fix, caught in the act,
  in the artifact being replaced.** That is direct evidence the second direction is the one that
  bites in practice.
- **Assumptions that held:** The `SettingsGroup` component absorbed a fifth group with no changes.
  Predicate signatures did vary as the plan warned, and modelling `matcher` as a string path rather
  than a fake uniform `(e) => boolean` was the right call. `⌘W` really is one chord with two
  context-scoped outcomes, not two chords. The registry made the render trivial — Phase 2 was ~85
  lines because Phase 1 did the hard part.
- **Assumptions that were wrong:**
  1. **"The registry has ~15 entries."** It has **22** — the comment map was already incomplete when
     it was written.
  2. **"Three registration hosts."** There are **four**; the reachability guard failed on its first
     run because `⌘⇧P` registers in `EditorPanel.tsx`. ⚠️ **The registry was right and the host list
     was wrong** — the guard refused an unproven claim rather than passing, which is the guard doing
     its job on day one.
  3. **"Re-export the four `*_CHORD_LABEL` constants."** The code does not; they stay in their home
     modules and the labels are DUPLICATED. The property that mattered (nothing deleted, so no
     ES-module runtime break) holds, but the plan's comment claimed a single-source-of-truth the
     code never established.
  4. **The plan's `SettingsPanel.tsx` path was stale** (`picker/`, actually `settings/`) while its
     LINE number was still correct — a citation can be half-right and still send you nowhere.
- **Approach delta:** Phase 1 took an F9b back-loop it was not planned to take (the two omitted
  chords), and that back-loop added a guard the plan never called for — the completeness guard is
  net-new scope, adopted because closing the two instances without it would have left the class
  open. Phase 2's P2.3 deviated deliberately: the plan said consume `useWorkflowFeaturesEnabled()`,
  but `SettingsPanel` OWNS the gate toggle, so the hook would lag its own checkbox; it reads
  `workflowFeatures.value` instead and the deviation is backlogged rather than buried.
  ⚠️ **Method note worth carrying:** THREE mutation probes across this feature were INVALID and each
  initially read as a pass — two `perl` patterns that no-opped on regex metacharacters, and one
  dedupe probe scoped per-section that never merged the rows it claimed to. All three failed in the
  direction that **manufactures work** (concluding a guard has a hole it does not have), which is the
  under-discussed half of `invalid-probe-and-real-hole-look-identical`. **Confirm the mutant changed
  the observable you care about — not merely that the command ran.**

## Code-Quality Review — hotkey-reference (M14 WP3)

Reviewed against ship `5e3ecd9`. Diff window hand-scoped to WP3's three commits (`3db5994`,
`ef0bb82`, `5e3ecd9`) — the naive `BASE^..SHIP` range swept in the entire WP0 supervisor hotfix +
v0.5.1 release (5,844 insertions vs WP3's ~1,175) because WP3 was parked across them. See
`SURFACE-2026-09-17-REVIEW-QUALITY-DIFF-WINDOW-BREAKS-ON-A-PARKED-FEATURE`.

### Strengths
- The bidirectional guards earn their place: reachability (registry -> code) plus completeness
  (code -> registry) answer the repo's own "a registry proves the SET, not that each entry has a
  CALLER" lesson, and the completeness arm caught two real omissions rather than being ceremonial.
- `ChordOutcome[]` modelling of `WCmd` and terminal font zoom matches how
  `shouldCloseTerminalOnChord` and `Workspace.tsx` focus routing actually behave; a 1:1
  predicate->entry keying would have shipped a list that lies.
- `matcher: string | null` as a module path rather than a function reference is a defended honesty
  call — the JSDoc names the three divergent signatures that make a common type a lie.
- `hotkeyGroupRender.test.tsx` counts rows against `EXPECTED.length` rather than a literal, and
  states its own reachability ceiling (only the gate-OFF shape is observable under
  `renderToStaticMarkup`) instead of implying broader coverage.
- The `offInvariantGuard.test.ts` widening was proved non-disarming by planting a real ungated
  workflow chord, and that exercise surfaced a genuine weakness (`|| enabled` not counting as gate
  evidence) that was fixed rather than exempted.

### Issues

**CRITICAL**
- (none)

**MAJOR** — all three VERIFIED against source by the orchestrator before backlogging
- [`SettingsPanel.tsx:161` + `App.css:3991`] `.settings-hotkey-outcome` (SINGULAR) is rendered on
  every outcome div and is the selector `hotkeyGroupRender.test.tsx:145` queries, but ONLY the
  PLURAL `.settings-hotkey-outcomes` has a CSS rule — the singular is styled nowhere. VERIFIED:
  a grep for both rule heads returns only line 3991 (plural). A future author tidying "unused CSS
  classes" out of the markup silently kills the only assertion that the second outcome of a
  context-scoped chord renders. Style it, or comment it as a test-handle-only class.
- [`chordRegistry.test.ts:317-352`] The CM6 completeness arm reads only literal `key: "Mod-X"`
  entries from `editorExtensions.ts`, but the editor Find chord comes from `...searchKeymap`
  (line 180), which the regex cannot see. VERIFIED: the regex captures 8 bindings and `Mod-f` is
  NOT among them. So `cm6-find` has ZERO guard coverage in either direction — and it is the exact
  entry the group's own hint text names as the reason the EDITOR section exists. The arm passes
  while not checking the one thing its prose cites.
- [`SettingsPanel.tsx:146-150`] `HOST_SECTIONS` is a hand-maintained parallel list to the
  `ChordHost` union (`chordRegistry.ts:46`) with NO exhaustiveness check — a fourth host added to
  the union compiles clean and its entries render nowhere. The render test iterates the same
  hardcoded array, so it SHARES the blind spot. This is the WP's own drift class reintroduced one
  layer up. One-line fix: assert `new Set(HOST_SECTIONS.map(s => s.host))` covers every
  `entry.host` in `CHORD_REGISTRY`.

**MINOR**
- [`chordRegistry.ts:407`] `chordLabel()` has ZERO non-test consumers (VERIFIED by grep: only its
  own definition). An exported, documented, unit-tested accessor with no caller, in a module whose
  header warns against unreachable guards.
- [`SettingsPanel.tsx:645`] `visibleChords(workflowFeatures.value)` is called once per host section
  (3x), recomputing the same filtered array. Harmless at 22 entries; hoisting it would make the
  one-accessor-one-read discipline visible at the call site.
- [`chordRegistry.ts:1-30` + `SettingsPanel.tsx:122-144`] The same ~20-line rationale is stated
  near-verbatim in three places (registry header, panel block comment, commit message). The WP's
  own comment-budget lesson applies — three copies drift the way the original comment map did.

### Assessment
Well-built work whose strongest part is not the feature but its guards: promoting a comment to data
buys nothing unless something proves the data matches the code, and the guard was built in BOTH
directions with the second direction finding two real omissions. The data model is honest where
honesty cost something. The render layer is thinner and slightly less careful than the registry
beneath it — an unstyled class carrying a test assertion, a parallel `HOST_SECTIONS` with no tie to
the union, and a CM6 arm that misses the one binding its prose names as its reason for existing.
None is a correctness defect today; all three are drift vectors of exactly the kind this WP was
built to eliminate, reappearing one layer above where the discipline was applied. The three MAJORs
are cheap to close and are better backlog items than refactor scope.

### If you disagree
Dismiss any finding by marking its line `[DISMISSED]` in this section before `feature-finalize`
archives this WIP.

## Test Triage — settingsPanelWiring.test.ts > "declares exactly the four groups WP1's verdict specified, in order"
Classification: Obsolete test — the new feature intentionally supersedes what the test checked
Confidence: high
Evidence: The guard asserts the panel's `id=` list equals exactly `[claude-code, workflow-features,
  analytics, updates]` (settingsPanelWiring.test.ts, "the panel shell renders its four labelled
  groups"). WP3 acceptance criterion 2 requires a FIFTH group; the test's own comment says a
  reshuffle "should be a deliberate edit, not an accident" — this is that deliberate edit.
Action: Updated the expected list to include `hotkeys` in fifth position and renamed the describe
  block from "four" to "five". ⚠️ The assertion was NOT weakened to a `.toContain` or a
  length-check — it stays an exact ordered equality, which is the property that makes it a guard.
  Its sibling test at the "ships WITHOUT a dimmed backdrop" block warns that "M14 extending this
  panel" might wrongly 'fix' the missing scrim; that warning is about the BACKDROP and was left
  untouched.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-09-15] Phase 1 / P1.3 — `panelForChord` takes a SECOND argument
(`enabled: WorkflowGateValue`) and `⌘⇧K` (Docs) returns `null` while the workflow gate is OFF.
Found at plan time, NOT present in the spec's seam list. It means the registry has a
gate-dependency axis the spec did not anticipate; handled in-scope at P1.3/P2.3 rather than
deferred. No backlog entry — resolved within this feature.

[SURFACED-2026-09-15] none-blocking — `SURFACE-2026-07-13-M9-WP6B1-KEYBOARD-PAN-ZOOM-DEFERRED`
(backlog) covers deferred arrow-pan/zoom keys for the time-analytics day timeline. Those are
**viewport gestures inside one dashboard widget, not app chords**, so they are deliberately NOT
added to this registry. Recorded so a future reader does not read the omission as a gap.

[SURFACED-2026-09-15] Phase 1 / P1.6 — ⚠️ **THE REACHABILITY GUARD FOUND A FOURTH REGISTRATION
HOST ON ITS FIRST RUN.** The spec and plan both said three (`App.tsx`, `RightPanelHost.tsx`,
CM6). The guard failed with *"command-palette: isPaletteChord is never CALLED in a registration
host"* — `⌘⇧P` is registered in **`EditorPanel.tsx`**. The registry was right; the host list was
wrong. A `grep -rln 'addEventListener("keydown"'` then showed **six** keydown hosts, of which
four are app-chord hosts (the other two — `dashboard/ViewportContext.tsx`,
`picker/PickerOverlay.tsx` — own view-local keys, deliberately out of registry scope; `probe/` is
dev-only). **This is the guard doing exactly its job**: it refused an unproven reachability claim
rather than passing. Resolved in-phase; no backlog entry.

[SURFACED-2026-09-15] Phase 1 / P1.6 — **`offInvariantGuard.test.ts` needed two deliberate
edits, and a mutation proved they did not disarm it.** (1) Its chord-module count went 15 → 16
(the guard explicitly instructs a deliberate update; a SHRINK is what it forbids). (2) Its
per-export "ungated workflow chord" arm flagged `ChordEntry` (an `interface`) and
`CHORD_REGISTRY` (a data `const`) — both name `requiresWorkflowGate` and match `/chord/i`, but
**neither can consume a gate value**, exactly the reasoning the guard's own comment already
applies to `panelHost.ts`'s `RightPanel` / `AVAILABLE_PANELS`. Type-only and SCREAMING_CASE data
exports are now excluded. ⚠️ **Verified non-disarming by planting a REAL ungated workflow chord
in `panelHost.ts` — the arm still caught it.** Also fixed a genuine weakness this surfaced:
`visibleChords` used `!entry.requiresWorkflowGate || enabled`, which the guard's
`consumesGateValue` predicate does not accept as evidence; it is now an explicit
`if (enabled) return …` branch, so the module passes on evidence rather than on an exemption.

[SURFACED-2026-09-15] Phase 1 / verify-self — **No integration boundary.** The phase adds
`chordRegistry.ts` (a new module nothing imports yet) plus its guard, and edits two test files.
It touches `paletteCommands.ts` only by DELETING a comment block — `PALETTE_CHORD_LABEL` and
`isPaletteChord` are untouched, so no consuming surface changes behavior. Recorded because the
integration-boundary rule requires the determination to be stated, not assumed.

[SURFACED-2026-09-15] Phase 1 / verify-self — ⚠️ **BLOCKING: TWO REGISTERED CHORDS ARE MISSING
FROM THE REGISTRY.** Found by the verify-self fidelity audit, which checked completeness in the
direction the 12 tests structurally cannot.

1. ⚠️ **Terminal font zoom (`⌘=` / `⌘+` / `⌘-` / `⌘0`)** — `terminalZoomForChord` in
   `components/workspace/terminalFontZoom.ts`, imported and CALLED at `Workspace.tsx:773` on a
   capture-phase listener. It is Claudesk-owned and workspace-hosted, focus-routed to the CC
   terminal or the right-panel terminal. **The registry currently carries only the CM6 entry
   `cm6-font-zoom` (`claudeskOwned: false`), so Settings would tell a user those keys belong to
   CodeMirror — when in a focused terminal they are Claudesk's own path.** That is the
   lie-by-omission the CM6 entries were added to PREVENT, inverted.
2. **`⌘\` toggle line wrap** — bound in `editorExtensions.ts` `coreKeymap`
   (`{ key: "Mod-\\", run: (view) => applyWrap(view, !lineWrap) }`, M6 WP5). ⚠️ Its own source
   comment claims it was *"confirmed disjoint from every chord in paletteCommands.ts's ownership
   map"* — i.e. it was checked against the OLD COMMENT MAP and then never added to it. **Same
   drift class that motivated this WP**, caught in the act.

⚠️ **THE GUARD GAP IS THE REAL FINDING, and it is bigger than the two entries.** The reachability
guard only walks **registry → code**. Both omissions are the **code → registry** direction, which
it structurally cannot see: an entry-less chord is not an entry, so nothing iterates it.
⚠️ `Workspace.tsx` is already in the test's `HOSTS` list, so this is NOT fixed by adding a host —
**an unused host passes silently.** Fixing P1.4 without P1.6 would close these two instances and
leave the class open for the next chord anyone adds.

[SURFACED-2026-09-15] Phase 1 / P1.5 — **The "re-export" comment describes an intent the code
does not implement.** `chordRegistry.ts` re-exports only `ChordEvent`; the four `*_CHORD_LABEL`
constants remain exported from their ORIGINAL home modules with live consumers. The asserted
outcome (`grep -c PALETTE_CHORD_LABEL` >= 1) and the no-runtime-breakage property both genuinely
hold — nothing was deleted, so the ES-module runtime trap never applied — but the comment claims
a single-source-of-truth the code does not establish. Fix the COMMENT to match the code (the
labels are duplicated between the registry and the four constants); do not chase the stronger
claim in this phase.

[SURFACED-2026-09-15] Phase 1 / P1.6 — **The completeness guard is built and MUTATION-PROVEN on
both omissions individually.** It walks code → registry: collect every `*(`-shaped call in the
four registration hosts (comment-stripped), filter to chord-shaped names, and assert each is
claimed by a registry entry — plus a stale-row check so a renamed entry cannot leave a dangling
mapping that hides a real omission, plus a separate arm asserting every `Mod-` binding in CM6's
`coreKeymap` has a `host: "editor"` entry (the CM6 set is `matcher: null`, so the call-shape arm
structurally cannot reach it — which is exactly why `⌘\` was missed).
⚠️ **It cannot key on FILENAMES:** `terminalFontZoom.ts` — the module that was omitted — does not
match `*Chord*`, and neither do `panelHost.ts` or `paletteCommands.ts`. A filename scan would have
reported "complete" on the broken tree.
**Mutations, run individually, each verified landed:** deleting `terminal-font-zoom` fired the
call-shape arm AND the stale-row arm; deleting `cm6-toggle-wrap` fired the CM6-keymap arm. Restore
confirmed by checksum.

[SURFACED-2026-09-15] Phase 1 / P1.4 — **A test premise was wrong and was corrected, not
worked around.** The original `labels are unique` assertion failed once terminal zoom was added:
`⌘= / ⌘- / ⌘0` legitimately appears TWICE — Claudesk-owned (Workspace.tsx zooms the focused
terminal) and CM6-owned (the editor's keymap), disambiguated by focus. **The data was right and
the test was wrong.** Uniqueness is now on `(label, host)`, with a second arm asserting at most
ONE `claudeskOwned` entry per label (two would mean Claudesk fights itself for the key). Weakening
the assertion to "labels may repeat" would have re-opened the omission this back-loop just closed.

[SURFACED-2026-09-15] Phase 1 / verify-self — ✅ **PASS on re-run, 8/8 outcomes, 0 BLOCKING.**
The auditor re-derived completeness FROM SOURCE rather than re-running the project's own guard
(a guard and the registry it guards can share a blind spot): 14 chord-matcher call symbols
extracted from comment-stripped host source, all 14 claimed; 9 CM6 keymap bindings, all accounted
for by the 6 `host: "editor"` entries. Both new entries survived label/host/outcome scrutiny.
⚠️ **The ⌘= / ⌘- / ⌘0 duplication was explicitly adjudicated CORRECT**: `Workspace.tsx` calls
`preventDefault` only on the left-half and right-panel-terminal branches, so with the editor
focused the chord is NOT swallowed and reaches CM6's own keymap. Two owners selected by live DOM
focus; collapsing them would make the surface lie.

[SURFACED-2026-09-15] Phase 1 / P1.6 — ⚠️ **THE COMPLETENESS GUARD'S SELECTOR IS A NAMING
CONVENTION, NOT A STRUCTURAL PROPERTY.** Raised by the verify-self auditor as context, not as a
failing outcome. The guard filters call sites on `/[Cc]hord/` plus two named `*Index` symbols, so
a future matcher named outside both conventions (the auditor's example: `zoomForKey`) would be
invisible to it. It caught everything present today and the auditor's hand enumeration found no
omission it missed — but the guard is one rename away from a blind spot, and the class it defends
against is exactly "a chord exists that the registry does not know about."
**Not fixed in this phase:** the honest fix is structural (e.g. requiring every capture-phase
keydown handler in a host to route through a registry-aware helper), which is a refactor of three
working registration hosts — out of scope for a data-extraction phase and squarely the kind of
thing that belongs in its own change. **Logged to `backlog.md` rather than absorbed silently.**

[SURFACED-2026-09-17] Phase 1 / verify-human — **PASS on all 4 leaves; the gate was PRESENTED,
not auto-skipped, and the carve-out is the point.** drive_mode is `autopilot` and verify-self was
all-PASS, so auto-skip gates (a) and (b) were clean and the boundary check confirmed no integration
boundary (`chordRegistry.ts` is imported only by two test files plus `paletteCommands.ts`, whose
exports were untouched — only a comment block was deleted). That is gates (a)-(d) nominally clean.
⚠️ **It was still presented, under the skill's documented probe/decision-artifact false-positive
carve-out:** this phase's load-bearing deliverable is a *human decision ACK* — 22 description
strings that ship VERBATIM to users at Phase 2 — so auto-skipping would have silently adopted
22 user-facing strings the operator never read. The affirmation block's read-time veto was
exercised rather than relied on after the fact.

**The four rulings (do not re-litigate at Phase 2):**
1. **Content approved as-is.** Two wording flags were raised and deliberately NOT actioned:
   `⌘R` "Open the search panel" reads near-synonymous with `⌘F` "Find within the open file" to a
   stranger, and `⌘⇧A`'s "global" may read as jargon. Both stand.
2. **KEEP all 6 CM6-owned rows.** Upholds spec criterion 4 (omitting them makes the list lie by
   omission about why `⌘F` differs inside the editor). P2.2's "de-emphasized but PRESENT" is
   confirmed, not merely assumed.
3. **The `⌘= / ⌘- / ⌘0` duplication ships as TWO ORDINARY ROWS.** verify-self had already
   adjudicated it technically correct; this leaf settles the *legibility* half, which correctness
   did not answer. ⚠️ **Phase 2 therefore needs NO special presentation work for the duplicate** —
   do not "improve" it into a single merged row with two context lines.
4. **The completeness-guard selector caveat is ACCEPTED as a backlog entry**, not fixed here. The
   guard filters call sites on `/[Cc]hord/` plus two hardcoded `*Index` names
   (`chordRegistry.test.ts:258`) — a naming convention, not a structural property, so a future
   matcher named outside both (e.g. `zoomForKey`) is invisible to it. The honest fix is structural
   (route every capture-phase keydown handler through a registry-aware helper) and is a refactor of
   three working registration hosts — its own change, out of scope for a data-extraction phase.

[SURFACED-2026-09-17] Phase 1 / verify-codify — **ONE test written, not four; the other three
rulings were deliberately NOT codified.** Coverage was checked per ruling before writing anything:
- **vh1 (content approved)** — 22 free-text descriptions. A change here is a wording judgment, not
  a defect, and pinning exact prose would make Prettier's wrap point and any copy edit a contract
  violation (`raw-guard-jsx-prose-needs-flattened-haystack` + the comment-budget rule). Shape
  (`description` non-empty) is already asserted. **No test by design.**
- **vh2 (keep the 6 CM6 rows)** — already covered in the direction that bites: the CM6-keymap arm
  drives off `coreKeymap`'s bindings, so deleting the `host: "editor"` rows fires it. Confirmed
  incidentally when mutant 1 tripped BOTH that arm and the new one. **No new test needed.**
- **vh4 (guard caveat accepted)** — a decision NOT to change code. Nothing to codify.
- **vh3 (font-zoom ships as two rows)** — the one real gap. Both existing uniqueness arms PERMIT
  the split (`(label, host)` unique; at most one `claudeskOwned` per label) but neither REQUIRES
  it, so nothing failed if a future author merged the two rows into one — exactly the tidy-up a
  Phase 2 renderer invites. Now pinned by `"the font-zoom label is carried by TWO rows, one per
  owner — not merged"`, modelled on the ⌘W canary.
⚠️ **Mutation-proven INDIVIDUALLY, each mutant confirmed landed in EXECUTABLE code:** (1) deleting
the `cm6-font-zoom` row → new test fails with its intended message (and the CM6-keymap arm fires
too); (2) flipping that row's `claudeskOwned` to `true` → the new test's ownership assertion fails
(and the shared-label arm fires). `chordRegistry.ts` restored and **verified byte-identical by
`shasum`** (`8ae0ef40…`) — `git checkout` was NOT used, per
`git-checkout-no-ops-on-untracked-file`.
⚠️ **Test-count delta was checked, not assumed:** 2711 -> 2712 across 198 files, i.e. exactly the
one new test — evidence it actually RAN rather than being silently filtered (`ok. 0 passed` + exit
0 is the trap). The single lint warning is **pre-existing** in `XtermPane.tsx:898` (spread element
in a deps array), untouched by this phase; 0 errors.

**No integration boundary** — the phase adds isolated new artifacts only, so the highest AVAILABLE
test level is the data assertion: the registry has no consuming surface until Phase 2 renders it.
That is a property of the phase, not a preference for unit tests.

[SURFACED-2026-09-17] Phase 2 / P2.1 — **The plan's SettingsPanel path was STALE.** The plan cited
`src/components/picker/SettingsPanel.tsx:118`; the file lives at
`src/components/settings/SettingsPanel.tsx`. The LINE number (118, `function SettingsGroup`) was
still right, which is what makes this the `cite-code-by-symbol-not-line` trap in its most
misleading form — a citation can be half-correct and still send you to a nonexistent file.
Re-resolved by symbol. No backlog entry (the plan is consumed at close).

[SURFACED-2026-09-17] Phase 2 / P2.3 — ⚠️ **DEVIATION FROM THE PLAN, deliberate.** P2.3 said to
consume `useWorkflowFeaturesEnabled()` (the hook used by `announceRow.ts` / `ProjectModelCell.tsx`).
**Not used here.** `SettingsPanel` already holds the gate as a LIVE CONTROL
(`workflowFeatures.value` via `useSettingControl`), and the checkbox that toggles it sits a few rows
above this very group. Subscribing to the read-only hook alongside it would put two sources of truth
in one component and make the hotkey list lag its own switch. The hook remains correct for the
modules the plan cited — they have no local control. Gate-OFF omission itself is unchanged and is
pinned by a render test.

[SURFACED-2026-09-17] Phase 2 / P2.4 — **A pre-existing guard pinned the panel to EXACTLY FOUR
groups and failed on the fifth — correctly.** `settingsPanelWiring.test.ts` asserts the ordered
`id=` list equals `[claude-code, workflow-features, analytics, updates]`. Triaged as **obsolete
test** (high confidence: WP3's acceptance criterion 2 requires a fifth group, and the test's own
comment says a reshuffle "should be a deliberate edit, not an accident"). Updated to five with
`hotkeys` LAST. ⚠️ **The assertion was NOT weakened** to a `toContain` or a length check — exact
ordered equality is the entire guard — and the updated guard was **re-mutation-proven** (renaming
the new id to `zzz-hotkeys` still fails it). Its sibling "ships WITHOUT a dimmed backdrop" test
explicitly warns that "M14 extending this panel" might wrongly add a scrim; that warning concerns
the BACKDROP and was left untouched.

[SURFACED-2026-09-17] Phase 2 / P2.4 — ⚠️ **TWO OF FOUR MUTATION PROBES WERE INVALID ON FIRST RUN
AND READ AS PASSES.** Probes M3 (drop the `-foreign` marker) and M4 (drop the editor section) used
`perl -pi -e` patterns containing regex metacharacters (`?`, `{`, `"`); the substitutions silently
no-opped and the follow-up `grep -c` returned 0, which I initially read as "mutation landed, class
gone." Re-run through Python with an explicit `assert s.count(old)==1` and a post-mutation `sed -n
'<line>p'` showing the mutated text, **both mutants were then caught.** ⚠️ This is
`verify-the-mutation-landed` + `bsd-sed-lacks-word-boundary` in combination: an invalid probe and a
real guard hole are indistinguishable from the result alone, and the damage here would have been
INVERTED — concluding the render test had holes it did not have, and "strengthening" tests that were
already correct. Recorded because the near-miss was in the direction that manufactures work rather
than the one that hides bugs.

[SURFACED-2026-09-17] Phase 2 / verify-self — ✅ **PASS, 6/6 outcomes, 0 BLOCKING.** Observed
against a dev build launched for this purpose; ⚠️ **window title checked as `Claudesk (dev)` before
trusting any reading** — the operator's production 0.5.1 (PID 65019) was running throughout and the
dev/prod process-name collision is a recorded false-verdict source. It was never touched.
**Instrument discipline applied before the readings, not after:**
- **Positive control first** — `#root` present with children and 808 chars of text, so a later
  "element not found" is a real absence rather than the blank-pane instrument error.
- ⚠️ **The console tap SELF-TESTED before being trusted** (`__TAP_SELFTEST__` round-tripped), because
  `read_logs{source:"console"}` captures NOTHING for this app and an empty read is a FALSE GREEN.
  Paired with DOM-mount evidence (panel open, 22 rows, `#root` populated) so "no errors" cannot mean
  "nothing rendered".
- ⚠️ **The bridge does NOT await promises** — a `requestAnimationFrame`-wrapped read timed out. Reads
  were taken synchronously on a later tool call instead, which satisfies the deferred-frame rule by
  elapsed time rather than by a promise.
⚠️ **OUTCOME 4 WAS PROVEN IN BOTH DIRECTIONS, not asserted from a fixture.** The dev profile had the
gate **ON**, so the first reading showed 22 rows INCLUDING `⌘⇧K` — which is correct behavior, not a
leak. Asserting the OFF-invariant in that state would have been a vacuous pass. The gate was toggled
OFF live via the React fiber (`onChange` through `__reactProps`; a bare `.click()` does not reliably
reach React's synthetic system), re-read at **21 rows with the Docs row ABSENT from the DOM** and the
`⌘⇧K` label appearing nowhere in the group's text, then toggled back ON. The toggle is the
discriminator.
**Also confirmed visually (screenshots + computed style):** the group renders with correct section
headings and chord-badge alignment, no overflow, and the CM6 de-emphasis is genuinely distinct —
owned descriptions at `opacity: 1`, CM6 at `0.68`. Both multi-outcome chords (`⌘W`, terminal font
zoom) render BOTH outcomes rather than truncating to the first.
**Subagent note:** it verified the CLI outcome independently (exit 0; 199 files / 2717 frontend, 926
Rust) and returned `UNVERIFIED` for all five browser outcomes, correctly refusing to judge them from
bare Vite. That is the `mcp-bridge-tools-not-exposed-to-subagents` division of labour working as
intended — the orchestrator drove the live half.

[SURFACED-2026-09-17] Phase 2 / verify-human — **PASS on all 5 leaves; the gate was MANDATORY here,
not a judgment call.** Unlike Phase 1 (where auto-skip gates (a)-(d) were nominally clean and the
presentation was a discretionary decision-artifact carve-out), Phase 2 has a genuine **integration
boundary** — `SettingsPanel.tsx` is a file backing an existing UI surface whose user-visible
behavior changed (condition 2). Per the skill's own rule the F11 skip path is **forbidden** when a
boundary applies, in every drive mode including autopilot. ⚠️ **Worth contrasting with Phase 1 so
the distinction is not lost:** the two phases paused for entirely different reasons, and only
Phase 2's was structural.
**All mechanical checks were EXCLUDED from the checklist** per the verify-self pre-filter — group
presence, required labels, row count vs registry length, gate-OFF removal, console cleanliness and
the full `verify:auto` gate were all agent-confirmed PASS and were not re-asked. The five leaves
were exclusively judgment on the RENDERED surface, which is the half Phase 1's gate could not see:
Phase 1 judged the DATA (22 descriptions), Phase 2 judged how it READS.
**The four rulings that bind future work:**
1. **Group hint copy approved as-is.** The concern that *"Every chord Claudesk responds to"*
   overclaims — given the EDITOR rows are explicitly not Claudesk's — was raised and accepted; the
   hint's second sentence resolves it.
2. **Section names APPLICATION / WORKSPACE / EDITOR approved.** ⚠️ These are RENDER-LAYER strings
   (`HOST_SECTIONS`), not registry data; the registry's `host` values are `app`/`workspace`/`editor`.
   A future rename touches one site, not the data.
3. **The hotkey group stays LAST of five.** Controls-then-reference. The competing "a reference list
   is what a new user most wants, put it higher" reading was raised and rejected. ⚠️ Pinned by
   `settingsPanelWiring.test.ts`'s exact ordered equality — moving it is a deliberate two-site edit.
4. ⚠️ **vh3's duplicate-row ruling HOLDS at the visual level.** vh3 could only judge `⌘= / ⌘- / ⌘0`
   as data; seen rendered — once under WORKSPACE at full opacity with both terminal outcomes, once
   under EDITOR dimmed — the operator confirmed it again. **Phase 2 needs no merged-row treatment;
   do not "improve" it later.**
5. **Gate-OFF silent omission approved.** No gap, no placeholder, no "unavailable" affordance.

[SURFACED-2026-09-17] Phase 2 / verify-codify — **ZERO new tests, and that is the finding.** Each of
the 5 verify-human rulings was checked against existing coverage before writing anything:
- **vh.1 (group hint) / vh.2 (section titles)** — uncovered, and deliberately left so. Both are free
  user-facing prose; pinning the sentences would make every copy edit a test failure. Same reasoning
  that kept Phase 1's 22 descriptions untested. ⚠️ Note the section TITLES are render-layer strings
  while the section TESTIDS are pinned — the structural half is guarded, the wording half is not, and
  that split is intentional.
- **vh.3 (group last of five)** — already pinned by `settingsPanelWiring.test.ts`'s exact ordered
  equality, which was updated AND re-mutation-proved earlier this phase.
- **vh.4 (duplicate stays two rows)** / **vh.5 (gate-OFF omission)** — covered by the render tests.
⚠️ **A SECOND INVALID MUTATION PROBE FIRED HERE, and it nearly manufactured work.** The first attempt
to prove vh.4's render-level coverage added a dedupe-by-label filter INSIDE the per-section map; all
5 tests passed and it read as a real coverage hole. It was not: a per-section dedupe never merges the
two font-zoom rows because they live in DIFFERENT sections — a row count taken under the mutant showed
**21 rows with BOTH font-zoom ids still present**, i.e. nothing was merged. A corrected probe (dedupe
across the whole registry, hoisted out of the section scope) produced **20 rows with `cm6-font-zoom`
dropped** — a genuine merge — and **three tests caught it** (`no silent truncation`, `CM6 rows PRESENT
but marked`, `groups rows under their host section`). ⚠️ **The coverage was never weak; the probe was.**
Combined with the two invalid `perl` probes at P2.4, that is **three invalid probes in one phase**,
all failing in the direction that INVENTS work rather than hiding bugs — the corollary worth carrying
is `invalid-probe-and-real-hole-look-identical`: **always confirm the mutant changed the observable
you care about (here, the rendered row set) before concluding a guard has a hole.**
