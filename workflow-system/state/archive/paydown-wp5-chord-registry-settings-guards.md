---
workflow: task
state: close (complete)
completed: 2026-09-23
created: 2026-09-23
docs-only: false  # changes test guards, SettingsPanel.tsx markup/testids, deletes an export
drive_mode: autopilot
---

# Task: Paydown WP5 — chord registry + Settings panel: guards that can't see what they claim

**Workflow:** task
**State:** Completed 2026-09-23
**Created:** 2026-09-23
**Parent:** `workflow-system/product/backlog-paydown-wbs.md` §WP5

## Problem Statement
The chord-registry and Settings-panel guards claim coverage they do not have (⌘F is unguarded, the host sections have no exhaustiveness tie, the completeness selector is a naming convention, a test handle is an unstyled class), so close each hole with a guard whose mutant is proven to die.

## Context
- Finding bodies: `workflow-system/state/backlog-quality-findings.md` → `# hotkey-reference — 2026-09-17` (B1–B6), `# m10.9-wp2-workflow-features-gate` (AC1), `# m14-wp4-two-tier-setup-docs` (AG1, AG2). Row 6 = `SURFACE-2026-09-15-CHORD-COMPLETENESS-GUARD-KEYS-ON-A-NAMING-CONVENTION` in `backlog.md`.
- Files: `src/components/workspace/chordRegistry.ts`, `src/components/workspace/__tests__/chordRegistry.test.ts`, `src/components/settings/SettingsPanel.tsx`, `src/components/settings/__tests__/hotkeyGroupRender.test.tsx`, `src/components/workspace/editor/editorExtensions.ts` (read-only), `src/components/settings/__tests__/readmeTierOneHonesty.test.ts` (→ moves), the 5 settings wiring tests holding `picker-*` ids.
- ⚠️ **Mutation discipline (the WBS's central risk):** every guard change is mutation-proved INDIVIDUALLY. `cp` backup → `perl -pi -e` → `sed -n` to confirm the mutant landed in executable code → run the target test (must FAIL) → restore via `cp` → `shasum` match. **Never `git checkout`.** Each closed finding names the mutant that now dies.
- ⚠️ B4 deletes an export → `check:link` (inside `verify:auto`) is the boot proof; the deletion and its only consumer (its own test) land in the same step. Relevant high backlog item: `SURFACE-2026-08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC`.
- Plan-time measurements (so they are not re-derived):
  - `searchKeymap` binds `Mod-f`, `Mod-g`, `Mod-Shift-l`, `Mod-Alt-g`, `Mod-d`, `F3`, `Escape`. The current regex sees 8 literal `Mod-` keys and **none of the spread's**.
  - The precedent for resolving the composed keymap already exists: `editorExtensions.test.ts` does `EditorState.create({ extensions: buildEditorExtensions(…) }).facet(keymap).flat()` in the node env. No new export is needed.
  - Row 6 AST measurement over the 4 hosts. **Structural** means: calls inside a `(e: KeyboardEvent)` function whose argument is `e`, `e.<prop>`, or an object literal carrying `e`. It yields **14** symbols. **Lexical** (the old `/[Cc]hord/` + `*SwitchIndex` rule) yields **15**. **lexical − structural = {`shouldCloseTerminalOnChord`}**, a router fed a chord's *result*, not the event. **structural − lexical = ∅.** There are **zero** `e.<prop>` call arguments today, so the structural rule adds no noise.
  - B3 as filed is **partly overstated**. `hotkeyGroupRender`'s row-count arm (`rows.length === visibleChords(false).length`) already fails if an ENTRY's host has no section. The live gap is at the type layer: a union member with no title. It is closed by exhaustiveness at `tsc`.

### Decisions taken at the autopilot default (disclosed — flag if wrong)
- **B2 → the three newly visible CM6 bindings go in `NOT_LISTED` with reasons; no new Settings rows.** These are `Mod-g` (find next), `Mod-Shift-l` (select all matches) and `Mod-Alt-g` (go to line). Resolving the spread surfaces them, and adding user-facing rows is a product change outside a paydown. ⚠️ `⌘⌥G` go-to-line is a plausible future row, so it is recorded here and not re-derived.
- **Row 6 → a test-side structural selector (TypeScript AST), unioned with the lexical one; NO host refactor.** The backlog's suggested alternative was to route all 4 hosts through a registry-aware helper, which is the dispatcher that `chordRegistry.ts`'s header deliberately rejects. The union makes NEW ⊇ OLD by construction.
- **B4 → delete `chordLabel`, do not wire it.** The Settings render reads `entry.label` directly and does not want it. Wiring it into the four `*_CHORD_LABEL` constants is a consumer migration the registry's own trailing comment defers to its own change.
- **AG1 → anchor only the COMPLETENESS arm** ("tier 2 names every gated chord") with backticks, matching the file's slash-command test. The LEAK arm (tier 1 names no gated chord) stays unanchored on purpose. Anchoring it would let an un-backticked `⌘⇧K` in tier-1 prose slip through, so unanchored fails closed. That reason goes in a comment at the site.
- **B6 (rationale stated three times) stays** with the R2 comment-convention pass, per ruling R2.

## Work Tree

- [x] T1 **B2 — resolve the `searchKeymap` spread** (`chordRegistry.test.ts`, "the CM6-owned set …")  
  - Replace the `key:` regex over `editorExtensions.ts` text with the composed keymap: `EditorState.create({ extensions: buildEditorExtensions(stub) }).facet(keymap).flat()`, then `Mod-` keys only.
  - A proper key→label mapper (`Mod-`→⌘, `Shift-`→⇧, `Alt-`→⌥, backslash, letter uppercase), replacing the `slice(4)` + double-backslash hack.
  - `NOT_LISTED` gains `Mod-g`, `Mod-Shift-l`, `Mod-Alt-g`, each with its reason.
  - Add the **reverse arm** (lessons entry 13): every `host: "editor"` row's label must be produced by some bound key.
  - Mutants: **M-B2a** delete the `cm6-find` row, and the forward arm must fail. The old regex passes this mutant, so run it against the old guard too to confirm it WAS a hole. **M-B2b** delete a binding that only the reverse arm sees; pick it at act time as one no other test covers, then confirm the reverse arm fails.
- [x] T2 **Row 6 — structural completeness selector** (`chordRegistry.test.ts`, the COMPLETENESS block)  
  - A `typescript`-AST collector over the 4 HOSTS: calls in a function whose param is annotated `KeyboardEvent` (or an inline arrow passed to `addEventListener("keydown", …)`), with an argument of `e`, `e.<prop>`, or an object literal carrying `e`.
  - `chordish = structural ∪ lexical`. The lexical arm is kept so that NEW ⊇ OLD holds by construction.
  - Add a pinned check that asserts the structural set ⊇ every ACCOUNTED symbol except the known router (`shouldCloseTerminalOnChord`). This proves the structural arm reaches every real matcher, so it is not vacuous.
  - Mutant **M-R6**: add `zoomForKey(e);` inside a host's `onKeyDown`. The OLD selector must pass (the hole, confirmed) and the NEW one must fail.
- [x] T3 **B3 — tie the host sections to `ChordHost`** (`SettingsPanel.tsx`)  
  - `HOST_SECTIONS` becomes a `HOST_TITLES` object with `satisfies Record<ChordHost, string>`. Render order is insertion order.
  - `hotkeyGroupRender`'s section test iterates the registry's distinct hosts, not a literal array.
  - Mutant **M-B3**: add `| "panel"` to `ChordHost`, and `tsc --noEmit` must fail.
- [x] T4 **B1 — a stable handle for the outcome assertion**  
  - Add `data-testid="hotkey-outcome"` on each outcome div. The test queries the testid. Drop the unstyled `settings-hotkey-outcome` class, since nothing styles it.
  - Mutant **M-B1**: remove the testid, and the multi-outcome test must fail.
- [x] T5 **B5 — hoist `visibleChords(...)`** above the `HOST_TITLES` map in `SettingsPanel.tsx`  
  - A refactor with no behavior change; the existing render tests cover it. ⚠️ `offInvariantGuard`'s gate-consumption arm reads module bodies, so run it.
- [x] T6 **B4 — delete `chordLabel`** and its `describe` block, in the same step  
  - Then `pnpm check:link`. Grep `chordLabel` repo-wide (src + docs) for stragglers.
- [x] T7 **AC1 — rename the `picker-*` testids to `settings-*`** (4 ids)  
  - Sites: `SettingsPanel.tsx`, `settingsTimeTrackingWiring`, `settingsPermissionModeWiring`, `settingsUpdateNotificationsWiring`, `settingsTimeTrackingCopyPromise`, and the `settingsPanelWiring` "does NOT re-introduce" list (which now guards the new names).
  - Afterwards, `grep` must show zero `picker-(permission-mode|time-tracking|update-notifications|check-updates)` in `src/`.
  - Mutant **M-AC1**: revert one id in `SettingsPanel.tsx` only, and its wiring test must fail.
- [x] T8 **AG2 + AG1 — move and anchor `readmeTierOneHonesty.test.ts`**  
  - Use `git mv` to put it in `src/state/__tests__/`. Fix its relative imports and `REPO_ROOT` depth, then grep for path references to the old location.
  - Anchor the tier-2 completeness arm on `` `${label}` `` in backticks, and comment on why the leak arm stays unanchored.
  - Mutant **M-AG1**: in a scratch copy of the tier-2 window, the label appears only un-backticked. Build the mutant inside the test run by temporarily rewriting README's `` (`⌘⇧K`) `` to `(⌘⇧K)`, backed up via `cp`. The new arm must fail where the old one passed.
  - After the move, confirm the file still RUNS: the vitest count for it is > 0, not a silent drop (guard entry 3's `ok. 0 passed` shape).
- [x] T9 **Gate:** `pnpm verify:auto` (timeout 216000). Record the runtime in `runtimes.md` if it moves materially.  
- [x] T10 **Bookkeeping**  
  - Delete the resolved finding bodies: B1–B5, AC1, AG1, AG2.
  - Rewrite the stubs: hotkey-reference → 1 MINOR remaining (B6 → R2); m10.9-wp2 → the MAJOR is gone. Delete the m14-wp4 stub entirely.
  - Delete Row 6's SURFACE.
  - Add one `**Backlog resolved:**` CHANGELOG line per ID, each naming its mutant.
  - Update the memory `source-guard-blind-to-spread-bindings` with a note that the guard is fixed and how.

## Closure evidence — the mutant that now dies, per ID
Each mutant was applied separately via `cp` backup → `perl -pi -e`, then confirmed landed (`grep -c`/`sed -n`), then the target was run, then restored via `cp` with a `shasum` match. Where marked **(hole confirmed)**, the same mutant was also run against the HEAD guard and PASSED, which proves the old guard really was blind.

| ID | SURFACE | Mutant → result |
|---|---|---|
| B2 | `SURFACE-2026-09-17-QUALITY-CM6-GUARD-BLIND-TO-SPREAD-KEYMAPS` | **M-B2a**: delete the `cm6-find` row → the forward arm fails **(hole confirmed: the old regex arm passed)**. **M-B2b**: delete the `Mod-r` binding → the new reverse arm fails. **M-B2c**: drop the `...searchKeymap` spread → the positive control, the reverse arm and the NOT_LISTED stale check all fail. |
| Row 6 | `SURFACE-2026-09-15-CHORD-COMPLETENESS-GUARD-KEYS-ON-A-NAMING-CONVENTION` | **M-R6**: add `zoomForKey(e);` in `Workspace.tsx`'s `onKeyDown` → the completeness arm fails naming `zoomForKey` **(hole confirmed: HEAD passed 3/3)**. **M-R6b**: retype that handler `(e: Event)` → the structural positive control fails (`terminalZoomForChord` unreached). |
| B3 | `SURFACE-2026-09-17-QUALITY-HOST-SECTIONS-PARALLEL-TO-THE-UNION` | **M-B3**: add `\| "panel"` to `ChordHost` → `tsc` fails with TS1360 at `HOST_TITLES` **(hole confirmed: HEAD's `SettingsPanel.tsx` compiled clean)**. |
| B1 | `SURFACE-2026-09-17-QUALITY-TEST-SELECTOR-PINNED-TO-AN-UNSTYLED-CLASS` | **M-B1**: remove `data-testid="hotkey-outcome"` → the multi-outcome render test fails. The unstyled class was deleted. |
| B5 | `SURFACE-2026-09-17-QUALITY-VISIBLECHORDS-RECOMPUTED-PER-SECTION` | A refactor with no behavior change, so no mutant. `visibleChords` is read once as `chords`. Covered by the 5 render tests plus `offInvariantGuard` (green). |
| B4 | `SURFACE-2026-09-17-QUALITY-CHORDLABEL-HAS-NO-CONSUMER` | A deletion, so no mutant. The export and its only consumer (its own test) were removed together. `check:link` is clean, and a repo-wide grep finds zero `chordLabel`. |
| AC1 | `SURFACE-2026-07-28-QUALITY-WP2-PICKER-PREFIXED-TESTIDS-IN-SETTINGS-PANEL` | **M-AC1**: revert `settings-permission-mode` → `picker-permission-mode` in the panel only → its wiring test fails. Zero `picker-(permission-mode\|time-tracking\|update-notifications\|check-updates)` remain in `src/`. |
| AG1 | `SURFACE-2026-09-18-QUALITY-UNANCHORED-CHORD-LABEL-MATCH` | **M-AG1**: un-backtick README's `` `⌘⇧K` `` → "names every gated chord" fails **(hole confirmed: the HEAD guard passed 10/10)**. |
| AG2 | `SURFACE-2026-09-18-QUALITY-GUARD-FILE-IN-UNRELATED-DIRECTORY` | A move (`git mv` → `src/state/__tests__/`), so no mutant. It still runs **10** tests after the move (not a silent 0), and the `arch/workflow-gate.md` path is updated. |

**Not closed here:** B6 `RATIONALE-STATED-THREE-TIMES` → the R2 comment-convention pass (stub rewritten).

**Gate:** `pnpm verify:auto` EXIT 0, 28s: 220 files / **2968** tests (+2 net: +5 new registry tests, −2 `chordLabel`, −1 old CM6 test) + Rust 920. The one lint warning is the known `XtermPane.tsx:895`.

**Docs touched:** `docs/lessons/source-text-guards.md` entry 13's blind-spot note (closed, plus the residual: a matcher fed an event-DERIVED local is still invisible); memory `source-guard-blind-to-spread-bindings` (resolution note); `arch/workflow-gate.md` (moved path); `runtimes.md`.

**Backlog (delete-on-resolve, CHANGELOG lines owed at close in the same commit):** 8 finding bodies deleted from `backlog-quality-findings.md`, plus the now-empty `# m14-wp4-two-tier-setup-docs` group heading. Row 6's SURFACE and the m14-wp4 stub were deleted from `backlog.md`. The hotkey-reference and m10.9-wp2 stubs were rewritten as partials.

## Verification Observable

**Observable:** The Settings panel's rendered hotkey group is identical to HEAD's except for the intended outcome-handle swap, so the `HOST_TITLES` rewrite, the `visibleChords` hoist and the testid work changed nothing a user sees. The full gate passes with the new guards.
**Verification command:** The real `SettingsPanel` was rendered via `renderToStaticMarkup` + jsdom under mocked IPC in (a) a detached `git worktree` at HEAD `3b49856` and (b) the working tree. The `[data-testid="settings-group-hotkeys"]` outerHTML was dumped from each, the HEAD dump was normalized with `sed 's/<div class="settings-hotkey-outcome">/<div data-testid="hotkey-outcome">/'`, and the result was diffed. Plus `pnpm verify:auto`.
**Expected result:** normalized `diff` exit 0, with 3 section titles in order and 24 row lines; `verify:auto` EXIT 0.

## Verification Result

**Status:** PASS
**Date:** 2026-09-23
**Evidence:** The raw diff had 26 hunks, each exactly `< <div class="settings-hotkey-outcome">` / `> <div data-testid="hotkey-outcome">`. `normalized diff exit: 0`. Titles: `Application`, `Workspace`, `Editor`, in that order. `grep -c hotkey-row-` = 24. `pnpm verify:auto` exit 0 in 28s: `Test Files 220 passed (220)`, `Tests 2968 passed (2968)`, Rust 920 passed, `check:link — every entry linked cleanly`. No `src/` file changed after that run. The temp spec dirs were deleted and the worktree removed (`git worktree list` shows main only).
**Notes:** The user-visible surface is unchanged; the per-ID mutants above are the guard-side proof.

## Retrospect
- **What changed in our understanding:** Two findings were bigger than filed, and one was smaller. Resolving the `searchKeymap` spread surfaced **three** CM6 bindings nobody had catalogued (⌘G, ⌘⇧L, ⌘⌥G), not just the ⌘F the finding named. The finding saw one missing member of a set it never counted. B3, by contrast, was **partly overstated**: the render test's row-count arm already caught an orphaned ENTRY, so the live gap was only at the type layer (a union member with no title).
- **Assumptions that held:** The composed keymap resolves in the node env with no new export, as `editorExtensions.test.ts` already showed. Every old guard that could be re-run PASSED its mutant (B2, Row 6, B3, AG1), so each hole was real, not a misread.
- **Assumptions that were wrong:** Row 6 looked like it needed the 4-host refactor its SURFACE suggested. It did not: a test-side AST selector ("which calls receive the keydown event?") was structural, noise-free (zero `e.<prop>` arguments today) and needed no production change. A shell loop over `$files` under zsh silently did nothing, because zsh doesn't word-split an unquoted variable. It was caught by the post-rename grep, not by an error.
- **Approach delta:** B1's fix went further than the finding's options: the unstyled class was **removed** instead of kept with a comment, since a `data-testid` is the repo's test-handle convention. Verification rendered the hotkey group's HTML at HEAD (a detached worktree) and at the working tree and diffed them, which showed the user-visible surface unchanged apart from the handle swap.

**Closure notice:** Requester = operator. This is the closure notice for self-record. Paydown WP5 is complete: the chord-registry and Settings-panel guards now see what they claim to check (⌘F covered, structural matcher selection, host sections exhaustive, stable test handles, anchored README label match), and each fix is proven by a mutant that now dies. See `## Closure evidence` above; `pnpm verify:auto` is green.

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
