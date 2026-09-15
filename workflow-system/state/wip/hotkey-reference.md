# Feature: Hotkey reference in the ⌘, Settings panel

**Workflow:** feature
**State:** plan (complete)
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

- [ ] Phase 1: Extract the chord registry as typed data  <!-- status: in-progress; impl complete, verification pending -->
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
  - [ ] verify-self  <!-- status: FAILED — outcome (e) completeness: TWO registered chords omitted; see Discoveries -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 2: Render the list as a fifth Settings group  <!-- status: NOT-STARTED; depends on Phase 1 -->
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
  - [ ] P2.1 Add the group via the EXISTING `SettingsGroup` component (`SettingsPanel.tsx:118`
        — takes `id`/`title`/`hint`/children, emits `data-testid="settings-group-<id>"`).
        ⚠️ **EXTEND the M10.9 WP2 panel; do not rebuild it.**  <!-- status: NOT-STARTED -->
  - [ ] P2.2 Render entries grouped by registration host (app-level · workspace · editor/CM6),
        CM6 entries visually de-emphasized but PRESENT — omitting them makes the list lie by
        omission about why `⌘F` behaves differently inside the editor.  <!-- status: NOT-STARTED -->
  - [ ] P2.3 Honor the gate at render: consume `useWorkflowFeaturesEnabled()` (the established
        hook — already used by `announceRow.ts` / `ProjectModelCell.tsx`) and hide or mark
        gate-dependent entries when OFF, per P1.3.  <!-- status: NOT-STARTED -->
  - [ ] P2.4 Guard the render against the registry: assert rendered row count equals registry
        length, so a future entry cannot be added to data yet silently not displayed.
        ⚠️ **Flatten whitespace before asserting any JSX prose** — Prettier's wrap point is not
        a contract.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 1 > P1.4 (back-loop from verify-self)
- **Active scope:** P1.4 (add the two omitted chords) + P1.6 (extend the guard to catch the
  omission DIRECTION — see Discoveries; the current guard cannot)
- **Blocked:** verify-self BLOCKED on the two omissions
- **Unvisited:** Phase 1 verify-human → verify-codify; then Phase 2 (render the list as a fifth
  Settings group)
- **Open discoveries:** two, both resolved in-phase — see Discoveries

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
