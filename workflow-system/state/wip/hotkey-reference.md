# Feature: Hotkey reference in the ⌘, Settings panel

**Workflow:** feature
**State:** spec
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
