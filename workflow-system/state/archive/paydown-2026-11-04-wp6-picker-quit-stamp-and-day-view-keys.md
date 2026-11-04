---
workflow: task
state: close (complete)
completed: 2026-11-04
created: 2026-11-04
docs-only: false
drive_mode: autopilot
---

# Task: Paydown sweep WP6: picker quit-path stamp and Day-view keys

**Workflow:** task
**State:** Completed 2026-11-04
**Created:** 2026-11-04
**Parent:** `workflow-system/product/backlog-paydown-wbs.md` → WP6 (M16.5 WP8)

## Problem Statement
Four problems left over from M16.5 WP5:
- The quit path stamps `last_closed_at` by comparing canonicalized registry keys against raw stored paths, so a project stored through a symlink silently gets no stamp.
- The Day-view key listener steals arrow keys from a focused `<select>`.
- The viewport key functions accept any string.
- The picker's "Open" group label is announced as a project row.
- Operator insert: a newly opened workspace lands in a stale filmstrip slot instead of on the right.

## Context
Findings swept (bodies in `backlog-quality-findings.md` → `# m16-5-wp5-qol-batch — 2026-11-02`; pointer in `backlog.md` → `## Code-quality findings — m16-5-wp5-qol-batch (2026-11-02)`):
- `11-02-QUALITY-WP5-QUIT-PATH-STAMPS-CANONICAL-KEYS-AGAINST-RAW-STORED-PATHS` (MAJOR, latent: 0 of the operator's 27 paths differ from their realpath today)
- `11-02-QUALITY-WP5-DAY-VIEW-KEYS-DO-NOT-SKIP-SELECT` (MINOR)
- `11-02-QUALITY-WP5-VIEWPORT-KEY-ACTION-RETURN-TYPE-COLLAPSES` (MINOR)
- `11-02-QUALITY-WP5-OPEN-GROUP-LABEL-IS-A-LIST-ROW` (MINOR)
- ⚠️ The group's fifth finding, `…-PICKER-ROW-SHOULD-BE-A-COMPONENT`, belongs to **WP13**. At close, the group heading stays, and the `backlog.md` pointer is **rewritten** to that one MINOR. It is not deleted.

Code (re-anchored by symbol, 2026-11-04):
- `src-tauri/src/config_store/mod.rs`:
  - `touch_closed`: `paths.contains(&project.path)`, a verbatim `PathBuf` compare. Its doc says "compared verbatim, matching `add_or_touch`".
  - test `touch_closed_stamps_only_the_listed_known_projects`: non-existent paths, so `canonicalize` falls back and the test cannot see the bug
- `src-tauri/src/status_broadcaster/mod.rs`:
  - `canonical_key` (`canonicalize`, falling back to the lossy string). This is the project's path-key convention; `session_state::key_for` already delegates to it, so there is precedent for `config_store` doing the same.
  - `WorkspaceRegistry::open_project_paths`: its doc says both sides "derive from the frontend's canonicalized project path", but the frontend's `canonicalizeProjectPath` only normalizes the string (`state/workspace.ts`).
- Callers:
  - `src-tauri/src/lib.rs` quit teardown → `record_closed_best_effort(open_project_paths)`, which passes CANONICAL keys
  - `status_broadcaster/commands.rs` `workspace_deregister` → `record_closed_best_effort(vec![project_path])`, which passes the frontend's RAW path
  - Both must match after the fix.
- `src/components/workspace/dashboard/viewport.ts`: `VIEWPORT_KEYS: ReadonlySet<string>`, `viewportKeyAction(): "reset" | string | null`, and `viewportForKey(vp, key: string, …): Viewport | null` with a `default: return null`
- `src/components/workspace/dashboard/ViewportContext.tsx` → `ViewportProvider`'s window keydown listener: the INPUT / TEXTAREA / contentEditable skip, then `viewportForKey(...) ?? prev`
- `src/components/picker/ProjectPicker.tsx`: the `open-label` `<li className="picker-group-label" data-testid="picker-open-group">`
- Tests to extend: `dashboard/__tests__/viewportKeys.test.ts` (pure), `dashboard/__tests__/viewportKeysLive.test.tsx` (live jsdom + `act`), `picker/__tests__/pickerOrderLive.test.tsx` (live; `rows()` already special-cases the label)
- The sync-blocking guard (`src-tauri/tests/sync_commands_do_not_block.rs`) SEEDS do not include `canonicalize`, so adding it to `touch_closed` (reached from the main-thread `workspace_deregister`) does not trip the guard. A `canonicalize` is a bounded stat chain; `touch_closed` already does file IO on that path.

## Work Tree

- [x] T1 **`touch_closed` compares canonical keys on both sides**
  - [x] T1.1 **Test FIRST**, on HEAD's code. Create a real `TempDir`, a real subdirectory `proj`, and a real symlink `link → proj` (`std::os::unix::fs::symlink`). Then three cases:
    - (a) `projects.json` stores the SYMLINK path; the quit path passes the canonical realpath (what `open_project_paths` returns) → stamped
    - (b) it stores the realpath; the close path passes the symlink path with a trailing slash → stamped
    - (c) the existing negative: an unlisted real dir stays unstamped and is not ADDED

    (a) must FAIL on HEAD; record the output. ⚠️ On macOS `TempDir` lives under `/var/folders` → `/private/var/folders`, so even the "realpath" side must be built with `canonicalize()`; never assume the `TempDir` path is canonical.
  - [x] T1.2 Fix: canonicalize the given paths once with `crate::status_broadcaster::canonical_key` into a `HashSet<String>`, then stamp each project whose `canonical_key(&project.path)` is in it. New doc: compared through `canonical_key` on BOTH sides, because the quit path passes registry keys (canonical) while the close path passes the frontend's string-normalized path, and the stored path is whatever the dialog gave. Note that two records resolving to the same realpath are both stamped (correct: both were closed).
  - [x] T1.3 Fix the `open_project_paths` doc: it returns `canonical_key` forms. The frontend path is only string-normalized (`canonicalizeProjectPath`), and agreement with the flag store holds because `session_state::key_for` canonicalizes too, not because the frontend does.
  - [x] T1.4 Mutation-prove: revert to the verbatim `paths.contains(&project.path)` → T1.1(a) and (b) die.
- [x] T2 **Viewport keys are a closed type** (`viewport.ts`)
  - [x] T2.1 Write `const VIEWPORT_KEY_LIST = ["ArrowLeft", …] as const`, `export type ViewportKey = (typeof VIEWPORT_KEY_LIST)[number]`, and `export const VIEWPORT_KEYS: ReadonlySet<ViewportKey> = new Set(VIEWPORT_KEY_LIST)`. Add a type guard `isViewportKey(k: string): k is ViewportKey`, which reads the Set as `ReadonlySet<string>`, the one widening.
  - [x] T2.2 Signatures:
    - `viewportKeyAction(e): "reset" | ViewportKey | null`
    - `viewportForKey(vp, key: ViewportKey, dataWindow): Viewport`: no `null`, and the switch is exhaustive with no `default`, so a key added to the list without a case is a `tsc` error (TS2366)
    - the listener drops its `?? prev`
  - [x] T2.3 Tests (`viewportKeys.test.ts`):
    - Replace the runtime "returns null for any other key" loop for `viewportForKey` (it is now a compile-time property) with `// @ts-expect-error`-annotated calls on `"a"` and `"ArrowUp"`.
    - Keep "every `VIEWPORT_KEYS` key returns a viewport". `viewportKeyAction`'s `"x"` → `null` stays (it still takes a raw event key).
  - [x] T2.4 Mutation-prove, individually:
    - widen `viewportForKey`'s `key` back to `string` → the `@ts-expect-error` goes unused, so `tsc` fails
    - add `"PageUp"` to the list without a case → `tsc` fails
  - Run `pnpm check:link` if any export is renamed (none is planned; `VIEWPORT_KEYS` keeps its name).
- [x] T3 **The Day-view listener skips `<select>`** (`ViewportContext.tsx`)
  - [x] T3.1 Add `tag === "SELECT"` to the skip list, and update the comment ("never while typing into an input" → "…or using a form control").
  - [x] T3.2 Live test (`viewportKeysLive.test.tsx`): mount a `<select>` beside the input and press `ArrowRight` and `End` on it. The viewport must be unchanged and the event NOT `defaultPrevented`. Keep the existing positive control (the same key from `window` moves it).
  - [x] T3.3 Mutation-prove: remove the `SELECT` clause → T3.2 dies.
- [x] T4 **The "Open" label is not a list row** (`ProjectPicker.tsx`)
  - [x] T4.1 Add `role="presentation"` to the `open-label` `<li>`.
  - [x] T4.2 Live test (`pickerOrderLive.test.tsx`): in the open-group case, the label has `role="presentation"`, and every other `> li` has no role override (positive control: the rows stay list items). Mutation-prove by removing the attribute → it dies.
- [x] T5 **⭐ Operator insert (2026-11-04): a newly opened workspace always appends to the RIGHT of the filmstrip.**
  - Operator ask: "when a workspace is opened, the top filmstrip order is kind of random … can the newly open workspace just always get appended to the right instead?" Not a backlog finding; added to the paydown at the operator's request.
  - **Cause (read 2026-11-04):**
    - `App.tsx` seeds `order` from `loadOrder()`, a localStorage list of project PATHS (`claudesk.filmstripOrder`) last written at a drag's pointerup.
    - `orderWorkspaces` (`filmstripTiles.ts`) emits workspaces in that stored path order first, then appends the rest.
    - Workspaces never survive a relaunch, so a project reopened in a later session slots into its OLD dragged position, while a project never dragged appends right. That reads as random.
    - It also happens within a run: a project closed and reopened returns to its old slot.
  - **Fix:**
    - Key the in-memory order by workspace **id**, not path, and drop the persistence.
    - `openWorkspace` mints a fresh id per open (`makeWorkspace` → `nextWorkspaceId`), so a new open is in no stored order and `orderWorkspaces` appends it right.
    - Reopening an already-open path only focuses it (same id), so it keeps its slot.
    - A drag still rearranges within the run.
  - ⚠️ **Reverses M4 WP3's "the order persists (localStorage)".** It is the persistence that causes the stale slots, and with no workspace restore a cross-relaunch order can only ever slot new opens into stale positions. Record this in `arch/status-channel-and-surfaces.md` beside the filmstrip bullets. (Default taken; flag if wrong.)
  - [x] T5.1 `filmstripTiles.ts`: `orderWorkspaces(workspaces, orderIds?)` matches by `w.id` (no `canonicalizeProjectPath`); `deriveTiles`' third argument is ids. Update both docs.
  - [x] T5.2 `App.tsx`:
    - `useState<string[]>([])`
    - `reorderTiles` maps `t.id`
    - delete `commitOrder` and the `loadOrder` / `saveOrder` imports
    - rewrite the M4 comment block

    `Filmstrip.tsx`: remove the `onReorderCommit` prop and its pointerup call; keep `onReorder`.
  - [x] T5.3 `filmstripOrder.ts`: delete `loadOrder`, `saveOrder` and `FILMSTRIP_ORDER_KEY`; keep `reorder` and the drop-index math. ⚠️ Export deletion: run `pnpm check:link` plus the boot test (`appBoot.test.tsx`) in the SAME change as the consumer migration. Leaving the stale localStorage key on disk is harmless (nothing reads it); no migration code.
  - [x] T5.4 Tests:
    - In `filmstripTiles.test.ts` and `filmstripOrder.test.ts`, rewrite the path-order cases to id-order and delete the persistence tests.
    - New case 1 (the operator's ask): with an id order `[b, a]` arranged earlier, a newly opened workspace `c` (fresh id) appears LAST.
    - New case 2: a project closed and reopened (same path, new id) appears LAST, not in its old slot. Must FAIL against HEAD's path-keyed `orderWorkspaces`; record the failure.
    - Mutation-prove: match by `canonicalizeProjectPath(w.project_path)` again → case 2 dies.
  - [x] T5.5 Docs: add the filmstrip-order bullet to `arch/status-channel-and-surfaces.md`, with the M4 reversal and why.
- [x] T6 **Gate:** `pnpm verify:auto` (timeout 207000); record the runtime in `runtimes.md`.

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** In the REAL dev app (`pnpm tauri:dev`, driven over the MCP bridge), with the OLD `claudesk.filmstripOrder` key seeded to a scrambled order before mount:
- workspaces opened as scratch-a → scratch-c → scratch-b render in open order
- scratch-a, once closed and reopened, appends on the RIGHT
- the picker's "Open" label carries `role="presentation"` while the rows carry none
- the close path still stamps `last_closed_at` in the dev `projects.json`

**Verification command:** an MCP-bridge session against `com.claudesk.app.dev`:
1. Seed `localStorage["claudesk.filmstripOrder"] = [scratch-c, scratch-a, scratch-b]`, then reload.
2. Open via the picker: scratch-a, scratch-c, scratch-b.
3. Read the `[data-testid^="filmstrip-tile-ws-"]` titles.
4. Open the picker and read the `picker-open-group` role.
5. Close scratch-a with `filmstrip-close-ws-1` and reopen it.
6. Re-read the tiles, then `jq` the dev `projects.json`.

**Expected result:** tiles `[scratch-a, scratch-c, scratch-b]` (the old code would show the seeded `[c, a, b]`), then `[scratch-c, scratch-b, scratch-a]` after the reopen (the old code would put a back at index 1). Label role `presentation`; rows `null`. scratch-a `last_closed_at` within the last minute.

## Verification Result

**Status:** PASS
**Date:** 2026-11-04
**Evidence (quoted from the bridge):**
- After the three opens: `["scratch-a:ws-1", …, "scratch-c:ws-3", …, "scratch-b:ws-5", …]`, i.e. open order, not the seeded `c, a, b`.
- Picker: `{"label":{"role":"presentation","text":"Open"},"otherRoles":[null],"count":8}`
- After closing ws-1: `{"dialog":[],"tiles":["scratch-c:ws-3","scratch-b:ws-5"]}`
- After the reopen: `{"tiles":["scratch-c:ws-3","scratch-b:ws-5","scratch-a:ws-7"], "storedKeyUnchanged": "[…scratch-c,…scratch-a,…scratch-b]"}`. The reopened workspace (fresh id `ws-7`) is on the right, and the app never read or wrote the old key.
- `projects.json`: `scratch-a closed=1793813789922` against `now_ms=1793813811000`, so 22 s earlier: the close-path stamp works through the new canonical compare.
- Teardown:
  - all three workspaces closed through the UI
  - the old key restored to its original value `[]`
  - the bridge stopped
  - only the dev PIDs this session launched were killed (77257, 77042, 77006, 76838, 76811); the operator's installed app (PID 1228) is untouched

**Not live-checkable here, covered at the real boundary instead:**
- The quit path with a symlinked project would need a graceful app quit plus a symlink-stored project in the operator's dev list. It is covered by `touch_closed_matches_a_project_reached_through_a_symlink_on_either_side` against a real symlink on the real filesystem (red on HEAD).
- The `<select>` key skip is covered by the jsdom live test with `act` (`viewportKeysLive`), with `defaultPrevented` asserted.
- The closed `ViewportKey` type is a compile-time property: m1 and m2 fail `tsc`.

**Notes:** The operator's ask holds in the real app: a new or reopened workspace appends on the right, even with a stale persisted order present.

## Act evidence (2026-11-04)
- **T1, red first.** On HEAD, `touch_closed_matches_a_project_reached_through_a_symlink_on_either_side` FAILED at case (a): `left: None right: Some(50)`, "stored via symlink, closed by realpath". It passes after the fix.
  - Mutants, each run individually and restored with `cp` + `shasum`. All die.
    - w6a: back to the verbatim `paths.contains`
    - w6b: stored side not canonicalized (killed by case a)
    - w6c: given side not canonicalized (killed by case b)
- **T2 mutants.** Both fail `tsc`.
  - m1: `viewportForKey`'s key widened to `string` → TS2578, unused `@ts-expect-error` ×2
  - m2: `"PageUp"` added to the list without a case → TS2366, function lacks an ending return
- **T3 mutant.** m3: the `SELECT` clause removed → the live `<select>` test fails (1 of 3).
- **T4 mutant.** m4: `role="presentation"` removed → `pickerOrderLive` fails (1 of 3).
- **T5, red first.** A throwaway HEAD-shaped test (path-keyed drag map, as HEAD's `App` did) showed a project closed and reopened lands at the FRONT, its old slot. The throwaway was deleted. Mutants:
  - m5: HEAD behavior at both sites, path-keyed → 4 fail, including "a project closed and reopened lands last"
  - m6: `orderAfterDrag` keyed by path → 3 fail
  - m7: `orderWorkspaces` matched by path → 5 fail
  - Plan delta: `orderAfterDrag` was extracted, so `App` and the tests share ONE place where the order's key is chosen. Otherwise the tests would re-implement `App`'s mapping and could not see `App` revert to paths.
  - `check:link`: every entry links cleanly. Deleted exports: `loadOrder`, `saveOrder`, `FILMSTRIP_ORDER_KEY`; the consumer was migrated in the same change.
- **T6:** `pnpm verify:auto` EXIT=0, 47 s (3675 Vitest + 1066 cargo lib tests).
  - The first run exited 101 on `clippy::cloned_ref_to_slice_refs` in the new Rust test (fixed with `std::slice::from_ref`).
  - The ESLint `exhaustive-deps` warning in `XtermPane.tsx` is pre-existing; the file is untouched.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Retrospect
- **What changed in our understanding:**
  - The filmstrip's "random" order was M4 WP3's localStorage, PATH-keyed order. Workspaces never survive a relaunch, so it could only slot a reopened project back into a stale dragged position (shown live: a seeded `[c, a, b]` vs open order).
  - Keying by workspace id, which is fresh per open, makes "always append on the right" fall out of the existing merge rule with no new logic.
- **Assumptions that held:**
  - `canonical_key` was the right shared helper (`session_state::key_for` precedent).
  - `canonicalize` is not a sync-guard seed.
  - A real symlink on the real filesystem reproduces the quit-stamp miss (red on HEAD, case a).
  - The finding's warning that `ReadonlySet<string>` blocks the naive derivation was right; the `as const` tuple fixed it.
- **Assumptions that were wrong:**
  - The plan had the filmstrip tests copy `App`'s drag mapping. That would prove the machine but not its caller (the CLAUDE.md lesson). `orderAfterDrag` was extracted so `App` and the tests share the one place the key is chosen.
  - During verify, a freshly closed project shows no ⊘ "open without continue" control, so the bridge had to click the row button.
- **Approach delta:**
  - The operator inserted T5 mid-plan (filmstrip append-right). It reverses M4 WP3's persisted order, and that is recorded in `arch/status-channel-and-surfaces.md`.
  - `orderAfterDrag` was extracted.
  - The first gate run failed on one clippy lint in the new test.
  - Otherwise as planned.

**Closure notice:** Requester = operator, so this closure notice is for self-record. Paydown WP6 is complete, with four changes:
- A newly opened (or reopened) workspace now always appends on the right of the filmstrip.
- Quitting stamps `last_closed_at` for symlink-stored projects.
- The Day view leaves a focused `<select>` its arrow keys, and the viewport keys are a closed type.
- The picker's "Open" heading is no longer announced as a row.

To see it: open two projects, close the first, and reopen it; it lands rightmost.
