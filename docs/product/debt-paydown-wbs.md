---
shape: temporary-wbs
created: 2026-06-30
status: written — not yet built
context: between-milestone debt-paydown sweep, filed after M8 close, before M9 (Time-analytics) planning
drive_mode: full-autopilot
---

# Debt-Paydown Temporary WBS — 2026-06-30

A between-milestone work breakdown to clear the **standing code-quality backlog** accumulated
across M1–M8 (the deferred `/feature-refactor` batch every cycle-close rolled forward) plus
lint/test-infra hygiene SURFACEs and one decision item. **NOT a roadmap milestone** — a scratch
WBS to drive a focused cleanup pass before M9 (Time-analytics) planning. At completion, fold
durable outcomes back into the backlog and **delete this file**.

This is the **inverse** of the 2026-06-24 QoL sweep (`qol-wbs.md`, retired): that one was net-new
features/bugs and explicitly punted the code-quality tail to "a future `/feature-refactor`". This
sweep IS that future refactor.

## The disposition model (operator's rules, 2026-06-30 session)

Every backlog item was scored on **three axes** and assigned **one of five actions**. The rules
ARE the contract — they're reproduced here so the build sessions apply them consistently and the
learning doc can cite the canonical statement.

**Three axes:**
- **Impact** = feature value **+** maintainability value, where **maintainability = code-quality ×
  P(foreseeable future-touch or future-feature-friction)**. Low-quality code that is isolated,
  frozen, or soon-to-be-replaced has ~0 maintainability impact (refactoring it is near-worthless).
- **Effort** = benchmarked against the *living docs* (roadmap + recently-archived WBS WPs + WIP):
  milestone-sized → **Large**; WP-sized → **Medium**; smaller → **Small/XS**. By this scale almost
  every backlog finding is Small/XS — **intentional**, because it means Rule 1 (below) catches most
  of the backlog and only a handful escape to a real decision.
- **Risk** = P(this change breaks something the **regression suite won't catch**). Risk is
  relative to test coverage — a well-covered change is low-risk even if structurally large, and a
  fix that *adds* the missing test lowers its own risk.

**Five actions:**
| Action | Meaning | Trigger |
|--------|---------|---------|
| **Sweep** | Fix now, in this WBS | **Rule 1:** low-effort + low-risk → ALWAYS include (no exception — "doomed" code still has a 5% survival chance, and closing the item de-clutters the backlog, which is itself impact). **Rule 2:** high-impact + low/med-effort → include. |
| **Discuss** | Surface to operator, don't auto-decide | high-effort + high-impact; **OR** high-risk + any-impact. |
| **Defer** | Keep in backlog, anchored to a future milestone/pass | net-new feature work; release-gated; or a high-effort item routed to a dedicated pass. |
| **Bury** | Move to an *archived* backlog we'll likely never revisit | low-impact + medium-effort + low-risk (the "meh" zone — not cheap enough to sweep, not valuable enough to prioritize). |
| **Delete** | Remove entirely | no longer relevant, or already resolved-along-the-way. |

**Tiebreak:** Rule 1 beats the impact calc — cheap + safe wins even at low value (de-clutter).
**Severity (MAJOR/MINOR) is an INPUT to impact, not a parallel sort key** — a MAJOR on frozen code
scores low; translate severity into the impact term, don't auto-prioritize by it.

**Ordering** (sorts the already-Swept set; precedence top-down):
1. **Deletions before modifications** (pure subtraction can only shrink surface; lowest risk).
2. **Low-risk before high-risk** (bank safe wins; an interrupted sweep leaves nothing half-applied).
3. **Within a risk tier: high-impact before low-impact** (front-load value).
4. **Co-location adjacency** as a tiebreaker (WPs touching the same files run adjacent).
5. **Effort is NOT an ordering key** (gates inclusion, doesn't sort — avoids "do all the trivial
   stuff then run out of steam"). *Risk outranks impact in ordering* (resolves the deletions-first
   vs. high-impact-first tension: deletions are lowest-risk so they sort first regardless of impact).

## Disposition outcomes (the 3 Discuss items were ruled)

- **D1 — dead `statusSnippet` tooltip path → THREAD IT** (operator, 2026-06-30). The backend already
  sends `last_output_snippet` on every event; the frontend drops it. Wire it through so hovering a
  status dot shows CC's last output line — a genuine ambient "what's this project doing" cue. → WP2.
- **D2 — the 2 editor-shell MAJORs (leaf-symlink, frontend-trusted root) → DOCS-ONLY NOW** (operator).
  The real hazard is the doc-comments claiming a guarantee the code doesn't fully give. Fix the docs
  (XS, zero-risk) to state what's actually guaranteed; **defer** the Med-risk auth-boundary hardening
  to a future pass (anchored). → docs land in WP5; hardening stays Deferred.
- **D3 — prod status-log → KEEP + SIZE-CAP/ROTATE** (operator). Keep it as a standing prod diagnostic
  for future status bugs, but bound its growth. → WP8.

## Scope (what's NOT swept — anchors intact)

- **Defer → M9:** `SURFACE-2026-06-26-ABSORB-CLAUDE-TIME` (next milestone, net-new feature);
  `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (M9 startup-trim — a real perf milestone).
- **Defer → M10:** `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY` (docs-viewer feature).
- **Defer → next `/release` gate:** M5/M7 `OC.*` DEFERRED-TO-RELEASE checklists, `HOMEBREW`,
  `MCP-BRIDGE-RELEASE-ACL-STRINGS` (release-gated by design).
- **Defer (small feature):** `SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED` (cosmetic UX bug,
  root-caused → a small feature, not code-health).
- **Defer (hardening pass):** the editor-shell auth-boundary FIX (D2) — only the docs are swept now.
- **Bury → archived backlog:** `SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP` (low-impact +
  medium-effort test-infra build-out + low-risk = the meh zone). *Unless* WP6's test work makes it
  free — then fold it in; else move to `workflow/backlog-archived.md`.
- **Delete:** `SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES` (marked SUPERSEDED — no longer
  relevant) + any entries found already-resolved-in-place during the sweep.

**Sequence of execution:** WP1 → WP2 → WP3 → WP9 → WP4 → WP5 → WP6 → WP7 → WP8
*(Ordered by the rules above: deletions (WP1) → low-risk real fixes (WP2–WP4) → comment-only bulk
(WP5) → behavior-preserving dedup (WP6) → infra config (WP7) → README + the one stateful change (WP8).
**WP9** folded in 2026-06-30 from a user bug report — a behavioral fix with a Low-Med-risk edge; slotted
right after WP3, ahead of the lower-risk WP4–WP8 batch, since it's the highest-impact item in the sweep
[user-reported, dogfooded feature] and high-impact-fixes-before-cosmetics matches the spirit of the ordering.)*

---

## WP1 — Dead-code & dead-dependency removal  `[impact: Low-Med · effort: XS · risk: XS]`  `← deletions-first`  ✅ DONE 2026-06-30
**Outcome:** All 6 targets deleted + their stale comments rewritten. 7 backlog findings RESOLVED (`WP6-DEAD-IGNORE-DEP` MAJOR, `WP7-DEAD-DIR-STATUS-CSS`, `WP4B-DEAD-DATA-ACTIVE-PANE`, `WP4B-STALE-COMMENT-XREF`, `WP5-FILMSTRIP-FLEX-SHRINK`, `WP2-OVERLAY-DEAD-BACKDROPREF`, `WP4-VESTIGIAL-DRAG-REGION`). Gate green: `cargo build` + 302 lib tests + clippy `-D warnings`; `tsc --noEmit` + `pnpm vite build` + 780 frontend tests + eslint. The `tooling/demo/` dead focus-flag/CSS findings (`M8WP4-DEAD-FOCUS-FLAG/CSS`) were left for WP5 (which owns `tooling/demo/`).
**Backlog:** `wp6-filetree-shows-ignored-files` (MAJOR dead-`ignore`-crate) + the dead-code set across `m4-wp4b`, `m5-wp4`, `wp5-frontend-ui-prototype`, picker.
**Why first:** confirmed-dead code is the safest possible change (pure subtraction) and shrinks the surface every later WP reads. Ordering rule #1.

**Tasks (each verified-dead → delete; build/test is the gate):**
- **Dead `ignore = "0.4"` crate** (`src-tauri/Cargo.toml:64`). VERIFIED 2026-06-30: zero non-comment
  `ignore::` refs (only doc-comments in `fs_index/mod.rs:18,176`); it's the ONLY ripgrep-family dep
  and `project_search/` imports none of them → the Cargo.toml comments (lines 55–79) describing a
  "ripgrep/ignore-crate shared .gitignore contract" are **doubly stale**. Remove the dep + **rewrite**
  the comments to describe the hand-rolled walk the code actually does. `cargo build` + `cargo test --lib`.
- **Dead `data-active-pane`** (`EditorSplit.tsx:426`) — live selector is `.is-active`; delete attr + fix the stale `App.css` ~443 comment cross-ref. *(m4-wp4b #1+#2.)*
- **Dead `.file-tree-dir-status { margin-left:auto }`** (`App.css` ~1577) — no-op; the right-push is `.file-tree-name { flex:1 }`. Delete rule + correct comment.
- **Inert `flex-shrink:0` on `.filmstrip`** (`App.css:88`) — parent is grid; dead. Delete/annotate.
- **Dead `backdropRef`** (`PickerOverlay.tsx:24,41`) — attached, never read. Remove.
- **Vestigial `data-tauri-drag-region`** on `pip-root` + `.pip-switch-row` (m5-wp4) — INERT on the swizzled NSPanel. Remove/annotate.

**Verify:** `cargo build` + `cargo test --lib`; `pnpm vite build` + `tsc --noEmit` + `pnpm test`. No behavior change → green is the gate.

---

## WP2 — Thread the status-snippet tooltip + git-status path-keying  `[impact: High · effort: Small · risk: Low]`  ✅ DONE 2026-06-30
**Outcome:** (D1) Status-snippet tooltip THREADED — map value is now `{state, snippet?}` (`WorkspaceStatusEntry`); `applyStatusUpdate` folds in `last_output_snippet` (sticky-per-event, cleared by a later snippet-less event); added `snippetFor` + exposed on `useWorkspaceStatus`; `App` threads it to `CenterStage`(→`Workspace`) + `Filmstrip`; `Pip` derives it for its 3 tile indicators; `AttentionStatusMap` (`pipLayout.ts`) widened to `{state}` entries. Hovering any status dot now shows CC's last output/prompt line. +4 reducer/accessor codify tests; fixed the `pipFanoutWiring` `?raw` regex for the new `snippet=` prop. Gate: `tsc` + eslint + **783 frontend tests** green (no Rust change). Resolves `SURFACE-2026-06-22-QUALITY-WP6-SNIPPET-TOOLTIP-DEAD-PATH`. Live `title`-render confirm CARRIED to the release gate (DEFERRED-TO-RELEASE — pure attribute wiring, unit-covered).
**(MAJOR) git-status path-keying — DROPPED (stale premise).** The MAJOR this targeted was ALREADY FIXED at M2 close (2026-06-22, task `m2-wp11-git-status-path-keying`): `status_map_core` re-bases via `within_repo_prefix`+`rebase_to_workspace`, with the exact nested-workspace test passing. Only the quality-findings detail entry was left `pending`. The "assert + surface" plan was written on the stale premise; operator-confirmed 2026-06-30 to skip the signage (dead defensive code for a case the re-base handles + that never fires — operator always opens repo roots) and just mark `SURFACE-2026-06-21-QUALITY-WP11-GIT-STATUS-PATH-KEYING` RESOLVED. No `git_status`/`FileTree` code change.
**Backlog:** `m3-wp6-frontend-status-indicator` (D1: thread the snippet) + `m2-wp11-tree-density-git-indicators` (MAJOR path-keying).
**Why here:** both are high-impact, low-risk wiring fixes (silent-failure seam + a now-promoted micro-feature). Low-risk tier, high impact → ordering #2/#3.

**Tasks:**
- **(D1 — THREAD IT) status-snippet tooltip.** Today `applyStatusUpdate` reduces to `Record<id, WireWorkspaceState>` (drops `last_output_snippet`), and no caller passes `WorkspaceStatusIndicator`'s `snippet` prop → the `title` always falls back to the label. Wire it: change the map value to `{state, snippet?}`, add a `snippetFor(id)` accessor in `useWorkspaceStatus`, pass `snippet` from `CenterStage`/`Workspace`. Hovering a status dot then shows CC's last output/prompt line. Files: `src/state/workspaceStatus.ts:38-39,93-98`, `useWorkspaceStatus.ts:53-55`, `CenterStage.tsx`, `Workspace.tsx:33`, `WorkspaceStatusIndicator.tsx:18`. The backend already sends the field — frontend-only change. Add a reducer test (snippet folds in + `snippetFor` reads it).
- **(MAJOR) git-status path-keying — DECIDED: assert + surface, do NOT re-base.** `FileTree.tsx:203` keys by `node.path` (workspace-root-relative) but `git_status::status_map_core` returns git-repo-root-relative paths → in a nested-repo (workspace = subdir of the git root) every indicator **silently** vanishes (no error, tree looks falsely-clean). **Operator decision 2026-06-30: the operator always opens repo ROOTS, so this case never fires in practice — do NOT pay for the re-base path-math + behavior change.** Instead, **detect `root != repo-root` and surface an explicit "git indicators unavailable (workspace is a subdir of the repo)" state** so the silent-blank becomes an *explained*-blank if it ever happens. (Rationale: the "make the code honest" lean — correctness has no payoff for the actual usage pattern, so replace the silent failure with honest signage rather than building the nested-repo support.) Files: `src-tauri/src/git_status/mod.rs` (compute repo-root, compare to `root`), `FileTree.tsx` (render the unavailable state). Add a guard test: workspace==repo-root → indicators work; workspace=subdir → the explicit unavailable state (NOT silent-blank).

**Verify:** `pnpm test` + `cargo test` green (the new reducer test + the path-keying guard test — workspace==repo-root works / workspace=subdir shows the explicit unavailable state — are the codify artifacts). Agent-drive verify-self via the MCP bridge for the live tooltip render (webview-readable); carry the visual tooltip confirm to verify-human if the bridge can't read `title`. The subdir-unavailable state needs no live check (operator always opens repo roots — it's defensive signage, unit-test-covered).

---

## WP3 — Cross-language menu-id contract pin + picker IPC error-surfacing  `[impact: High · effort: Small-Med · risk: Low]`  ✅ DONE 2026-06-30
**Outcome:** (MAJOR `app-menu-bar`) Added a cross-language contract pin — Rust test `functional_ids_are_pinned_to_the_frontend_bridge` (`app_menu/mod.rs`) reads `../src/menu/menuBridge.ts` as text + asserts every `FUNCTIONAL_IDS` literal appears as a quoted `MENU_IDS` value; a one-char id drift now fails `cargo test` instead of silently dead-clicking a menu item. (MAJOR `wp6-project-config-store` picker IPC) — STALE PREMISE: the error-surfacing was ALREADY built at M4 WP2 (`mapIpcError`/`PickerToast`/loader `.catch`/per-handler try-catch all present); WP3 confirmed + marked it + the `WP9-PICKER-PARTIAL-FAILURE-WINDOW` MINOR RESOLVED. Folded the 3 picker MINORs: `PICKER-ADD-NO-REFRESH` (prepend-and-dedup `add_project`'s returned record into local `recents`), `CMD-ADD-RECORD-IDENTICAL` (doc note: deliberate alias, single truth = `add_or_touch`), `NOW-MS-EPOCH-SENTINEL` (pre-epoch clock now logs + stamps `i64::MAX` so a just-opened project sorts first, not `0`/last). Gate green: `cargo test --lib` **303 pass** (+1 pin) + clippy `-D warnings`; `tsc --noEmit` + vitest **783 pass** + eslint clean on changed files (the 63 eslint errors are pre-existing `tmp/scratch`+`tooling/demo` noise WP7 owns). Live picker-toast + add-refresh render CARRIED to release gate (DEFERRED-TO-RELEASE — handler wiring, unit/logic-covered). **Resolved 6 findings** (1 menu MAJOR + 1 picker MAJOR + WP9-partial-failure MINOR + 3 picker MINORs).
**Backlog:** `app-menu-bar` MAJOR (cross-lang id contract) + `wp6-project-config-store` MAJOR (picker IPC) + the folded MINORs (`WP9-PICKER-PARTIAL-FAILURE-WINDOW`, `PICKER-ADD-NO-REFRESH`, `CMD-ADD-RECORD-IDENTICAL`, `NOW-MS-EPOCH-SENTINEL`).
**Why here:** two high-impact MAJORs, both low-risk (one adds a test, one adds error-handling). Same "unguarded boundary" family.

**Tasks:**
- **(MAJOR) Menu-id contract pin.** 11 functional menu-item ids duplicated Rust (`app_menu::ids`/`FUNCTIONAL_IDS`, `mod.rs:33`) ↔ TS (`MENU_IDS`, `menuBridge.ts:16`) with only-prose linkage → a one-char drift silently dead-clicks an item and ships green. Add a Rust test that reads `menuBridge.ts` as text and asserts each `ids::*` literal appears as a `MENU_IDS` value (string-grep pin — cheapest faithful guard).
- **(MAJOR) Picker IPC error-surfacing.** Every `await invoke(...)` in `ProjectPicker.tsx` assumes success: the mount loader (`:60-63`) has no `.catch` (config corruption → silently-empty recents); `handleOpenRecent`/`handleOpenFolder`/`handleRemove` (`:69-85`) rejections → unhandled promise rejections / dead clicks. Add a shared error-surfacing path (toast/inline) + a `.catch` on the loader distinguishing graceful-empty from a real error. Fold the MINORs: refresh `recents` after add; collapse/document the byte-identical `add_project`/`record_open`; fix the `now_ms().unwrap_or(0)` recency-collision sentinel.

**Verify:** `cargo test` (the new id-pin test); `pnpm test` (mock a rejecting `invoke`, assert the error branch). MCP-bridge verify-self against a corrupt/empty `projects.json` scratch state for the live toast, else carry to verify-human.

---

## WP4 — `kill_all` serial-grace + effect/listener-thrash cleanup  `[impact: Low-Med · effort: Small · risk: Low]`
**Backlog:** `wp7-pty-cc-session` (`KILL-ALL-N-SCALING`) + Theme G (effect/listener re-subscribe thrash): `m4-wp3` `CHORD-EFFECT-THRASH`, `m6-wp11` `HANDLER-BRANCH-DUPLICATION`, `wp7-pty` `ONSESSIONID-INLINE-ARROW-DEP`, `m5-wp5` `PIPMODE-STATE-DUP-PER-WORKSPACE`.
**Why grouped:** the MINORs with a *behavioral/perf* edge (not pure cosmetics) — serial teardown latency at N>1; redundant re-subscribes/IPC fetches. Low-risk, so it sits in the safe tier; modest impact, so after the MAJORs.

**Tasks:**
- **`kill_all` serial 3s×N grace** (`lib.rs:30-36`) — serializes a 3s grace per session at quit → N workspaces = 3s×N. Parallelize (join the kills concurrently) or document why serial is acceptable.
- **Effect/listener thrash (Theme G)** — for each: hold the churning value in a `useRef` + register a stable handler once (or `useCallback`). `m4-wp3` ⌘⇧+digit listener deps on churning `tiles`; `m6-wp11` inline open/close branches dodging non-stable deps; `wp7-pty` `onSessionId` inline-arrow dep.
- **`m5-wp5` PiP-mode state dup** — N redundant per-workspace IPC fetches/subs → lift to App level, fetch/subscribe once. **DECISION AT PLAN:** this app-global-state lift may overlap M9's settings-toggle plumbing (PiP mode is app-global, like the coming time-tracking toggle). If cleaner to do the lift *as part of* M9's settings work, note it + skip here — don't build M9's pattern twice. (This is the one item that might *itself* be deferred at build time.)

**Verify:** `pnpm test` (effect logic where pure) + `cargo test` (`kill_all`). Behavior-preserving → no verify-human unless `kill_all` timing is observable (carry multi-workspace-quit timing to a release smoke if so).

---

## WP5 — Comment/doc-drift sweep (incl. D2 editor-shell docs)  `[impact: Low · effort: Small · risk: XS]`  `← comment-only bulk`
**Backlog:** Theme C (comment/doc-vs-code drift) + Theme D (rationale triplication) + D2 (editor-shell doc-only fix) + the `tooling/demo/` comment nits.
**Why here:** largest theme by count, lowest individual value, **zero risk** (comment-only). One sweep correcting each rustdoc/comment to match shipped code + dropping broken intra-doc links + consolidating thrice-restated rationales to one canonical anchor.

**Tasks:**
- **(D2 — DOCS-ONLY) editor-shell doc-honesty.** Correct two over-claiming doc-comments to state the *actual* guarantee: (a) `resolve_within` (`editor_fs/mod.rs:~80`) canonicalizes the **parent** then re-attaches the raw leaf — so a **non-leaf** symlink escaping root IS rejected but a **leaf** symlink is NOT; the comment claiming "a symlink inside root that points outside is also rejected" must be narrowed. (b) `read_file`/`write_file` (`commands.rs`) take `root` **frontend-supplied/-trusted** — say so. **Defer** the actual hardening (full-target canonicalize + validate `root` against config_store) to a future pass — anchored, NOT done here.
- **Drift (Theme C):** `m2-wp4` (`STALE-FILE-BASE-DOCLINK`, `WRONG-DIFF-API-COMMENT`); `wp7-pty` (`CC-KILL-SIGTERM-COMMENT-DRIFT`); `m5-wp5` (`STALE-PIP-TOGGLE-DOC-REFS`); `m3-wp2` #4 (stale `sublime_open` "removed at WP8" comment, `lib.rs:62`); `m5-wp4` (`PIPMOVE-COMMENT-INACCURATE`, `STALE-AWAITING-SCALE-COMMENT`); `m3-wp4` #1 (docstring claims a `Result` the sig lacks); `m7` (`APPLY-UPDATE-COMMENT-OVERSELL`).
- **Rationale triplication (Theme D):** `qol-wp2` `TRIPLE-RATIONALE-COMMENT`, `qol-wp3` `TRIPLICATED-EFFECT-RATIONALE`, `m2-wp3a` `COMMENT-TRIPLICATION`, `m2-wp13` #1, `m4-wp4b` `COEXISTENCE-COMMENT-DUP`, `wp7-pty` `RAF-FOCUS-DUPLICATION` — consolidate to one canonical anchor + back-references.
- **`tooling/demo/` nits:** `DUP-CURSOR-COMMENT`, `STALE-JSDOC-CAST`, `README-DURATION-DRIFT`, `COMMITTED-GENERATED-CSS-UNDOCUMENTED`, `SHELL-INNERHTML-RAW-MARKUP` caution, `SMOKE-TIMELINE-ONE-SYSTEM-NAMING` recast.

**Verify:** `pnpm test` + `cargo test` green (comments don't change behavior). No verify-human.

---

## WP6 — Duplication-extraction & test/aria hygiene  `[impact: Low-Med · effort: Small-Med · risk: Low]`
**Backlog:** Theme A (data-dir/const dedup), Theme B (Nth-copy extraction), Theme E (tab-row aria), Theme F (test hygiene), Theme H (two-language drift), Theme I (`useTauriListen`).
**Why here:** the "extract the shared thing" MINORs — real dedup value, behavior-preserving, low-risk. After the comment sweep (WP5) since some extractions sit on those just-corrected comments (co-location, ordering #4).

**Tasks:**
- **Theme A:** promote the thrice-copied `resolve_data_dir` (`cc_session`/`config_store`/`pip`) + dup `PROJECTS_FILE` const to one shared `pub(crate)` helper/const in `config_store`; retire copies.
- **Theme B:** extract `makeFontZoom(config)` (`terminalFontZoom.ts` ≈ `editor/fontZoom.ts` — the reviewer's "decide at the 4th surface" trigger is reached); one exported `MIRROR_INTERVAL_MS`; import/derive `DEFAULT_FONT_PX` from `DEFAULT_TERMINAL_FONT_PX` + a `===` structural test.
- **Theme E:** add `aria-controls` per tab + `role=tabpanel` per pane on the term-tab-row (`m6-wp11`) and the sibling Editor/Diff/Terminal panel-tab row.
- **Theme F:** rename over-claiming tests (`m8-wp5` "animated", `qol-wp6` Ctrl/Alt), anchor substring matches, trim duplicated truth-tables (`qol-wp4`), add the promised Ctrl/Alt case (`m2-wp13` #3), swap `m6-wp8` bare-`13` literals for a neutral constant.
- **Theme H:** single-source the two-language predicates: `m2-wp3c` JS `splitable` vs CSS `:has()` (key CSS off a `data-*` attr); `m2-wp13` `CloseTabChordEvent` (shared `ChordEvent` type); `m2-wp11` #3 `GitFileStatus` (exhaustiveness-tested union).
- **Theme I:** extract `useTauriListen(event, handler)` from the 5×-copied `listen(...).then()` + cancel/unlisten boilerplate (`Pip.tsx` ×3, `usePipFanout`, `useMirrorTicker`; `useWorkspaceStatus` has the shape) — do last in this WP so the others are settled.
- **Maybe-fold:** `PANETABS-COMPONENT-TEST-GAP` — if Theme E/F work makes a PaneTabs component test cheap, add it here; else **Bury** it (don't leave it active).

**Verify:** full `pnpm test` + `cargo test` green (extractions are behavior-preserving; parity/union/aria tests are new codify artifacts). MCP-bridge verify-self on tab-row aria if cheap.

---

## WP7 — Lint/test-infra hygiene  `[impact: Med · effort: XS · risk: XS]`  `← one-liners`
**Backlog:** `SURFACE-2026-06-27-ESLINT-WALKS-GITIGNORED-SCRATCH-FIXTURE`, `SURFACE-2026-06-26-PRETTIER-DRIFT-AND-BRITTLE-RAW-REGEX-TEST`, `SURFACE-2026-06-18-MEMORY-MD-PRETTIER-NITS`, `m5-wp2` `UNPINNED-MCP-SERVER`.
**Why here:** makes the repo's OWN quality gates pass clean on a fresh tree (meta-debt).

**Tasks:**
- **eslint-ignore tmp/** — `pnpm eslint .` reports `no-undef` on `src-tauri/tmp/scratch/scratch-a/main.js`. Add `tmp/` / `src-tauri/tmp/` to the eslint flat-config `ignores`.
- **Prettier drift + brittle raw-regex test** — per `SURFACE-2026-06-26-…`; note `SURFACE-2026-06-25-CSS-RAW-EMPTY-UNDER-VITEST` (CSS `?raw` is empty under Vitest → use `readFileSync`).
- **MEMORY.md prettier nits** — `SURFACE-2026-06-18-…`; confirm correct treatment vs the `.prettierignore` exclusions.
- **Pin the MCP server** — `.mcp.json` `@hypothesi/tauri-mcp-server` → pin `@0.11.2` so future verify-self doesn't float to a broken release.
- **Decide:** enable `@typescript-eslint/no-floating-promises` for `src/` (raised by WP3's picker fix) — if cheap + clean, do it here.

**Verify:** `pnpm eslint .` exits 0 on a clean tree; `pnpm format --check` clean; suites unaffected.

---

## WP8 — README freshen + status-log size-cap (D3)  `[impact: Med-High (README) · effort: Small · risk: Low]`  `← last; the one stateful change`
**Backlog:** `m8-wp5` #2 (`STALE-STATUS-BLOCK-NOW-PROMINENT`) + D3 (`SURFACE-2026-06-27-WP1-STATUS-LOG-KEEP-OR-DEMOTE`).
**Why last + elevated:** README is the open-source front door (M13 launch) and the M8 restructure left a **stale Status block** sitting prominently right under the new demo GIFs. The status-log change is the only WP that alters prod runtime behavior → last (highest-risk tier, though still Low).

**Tasks:**
- **README Status freshen** — rewrite `README.md:45-53`: M1–M7 released (v0.2.3), M8 demos shipped; update the roadmap line to the current order (M9 time-analytics → M10 docs-viewer → M11 auto-resume → M12 skill-orch → M13 polish). Keep terse — the front page is the pitch.
- **(D3 — KEEP + SIZE-CAP/ROTATE) status-log.** The prod logger (`status_log/mod.rs`, one line/event, append-mode) was built for the stuck-dot probe (now fixed in v0.2.2); its own doc-comment predicted a demote, but operator chose **keep + bound**. Implement a size-cap or rotation (e.g. truncate-or-rotate when the file exceeds N MB) so it stays a standing diagnostic without unbounded growth. Update the module doc-comment (currently says "WP2 will likely demote this") to reflect the keep+cap decision. Files: `src-tauri/src/status_log/mod.rs` + the drain-loop bind site.

**Verify:** README renders clean on github.com (operator confirms at verify-human — it's the front page); `cargo test` green incl. a new unit test for the rotation/size-cap boundary.

---

## WP9 — Git-status live-refresh on `.git/` ops (folded-in bug report)  `[impact: High · effort: Small-Med · risk: Low-Med]`  `← folded 2026-06-30 (Discuss → operator chose new WP)`  ✅ DONE 2026-06-30
**Outcome:** Backend (`fs_watch`): added `git_meta: bool` to the `FsChange` DTO + a narrow pure `is_git_meta(root, path)` helper (`.git/{index,HEAD,MERGE_HEAD,refs/**}` only — NOT objects/`*.lock`/logs). `paths_to_change` now checks git-meta BEFORE the ignore filter: a `.git/`-meta path flips `git_meta` without entering `paths` (no tree re-walk), and a pure-git-meta batch returns `Some{paths:[], git_meta:true}` instead of `None`. Frontend: the `RightPanelHost` `fs-change` listener bumps `fsTreeRefreshKey` only when `paths.length>0` and `gitStatusRefreshKey` when `paths.length>0 || git_meta`; `checkDiskForPaths` runs on real paths only; the TS `FsChange` mirror gained `git_meta`. Gate green: `cargo test --lib` **307 pass** (+5 transform/meta/narrowness tests) + clippy `-D warnings`; `tsc --noEmit` + vitest **784 pass** (+1 DTO contract). **App compiles + launches cleanly with the change** (verified: `pnpm tauri:dev` built + the MCP bridge bound on 9223, no panic). Live git-op-transition matrix (M→staged→clean across `git add`/commit/stash/checkout WITHOUT a remount + tree-no-rewalk) CARRIED to release gate (DEFERRED-TO-RELEASE) — the notify→emit round-trip is backend-process behavior, and the in-session MCP bridge tools weren't reachable in this headless context to drive a real `git add`; the transform seam is fully unit-covered. **Resolved `SURFACE-2026-06-30-GIT-STATUS-STALE-ON-GIT-OPS`.**
**Source:** a friend's bug report (2026-06-30): the FileTree git-status badge (the `M`/etc. marker) doesn't auto-refresh — you must reload/remount the workspace before it shows the latest status. **NOT a pre-existing backlog item** — a net-new user-reported behavioral bug, scored against the disposition model (High-impact / Small-Med-effort / Low-Med-risk) → routed to **Discuss**; operator chose to fold it in as this WP and build it this session.
**Root cause:** the QoL-WP0 `fs-change` watcher (`fs_watch/`) **hard-excludes ALL of `.git/`** (`is_ignored`: `name == ".git"`) to avoid a tree re-walk storm on every git op. That's correct for the *tree* re-walk, but it also kills *git-status* refresh for any change that flips a file's status WITHOUT a working-tree content change — i.e. every pure-`.git/` op: `git add` (M→staged), `git commit` (→clean), `git stash`, `git checkout`. Those emit no `fs-change` → neither refresh key bumps → the badge stays stale until a remount. (A working-tree *content* edit DOES refresh today — but the friend's case is the staging/commit class, which is `.git/`-internal only.)
**Decision (operator, 2026-06-30):** stop swallowing `.git/`-meta events; route them to a **git-status-ONLY** refresh — bump `gitStatusRefreshKey`, NEVER `fsTreeRefreshKey` — so the badge re-fetches without re-walking the tree (the storm the exclusion guarded against is avoided by routing, not by suppression).

**Tasks:**
- **(Backend) git-meta signal on `FsChange`.** Add `git_meta: bool` to the `FsChange` DTO (snake_case, mirrored on the TS type). In `paths_to_change`: detect whether the batch touched a git-status-relevant `.git/` meta path (`.git/index`, `.git/HEAD`, `.git/MERGE_HEAD`, `.git/refs/**` — NOT `.git/`-everything, to avoid lock/log churn re-fetch storms) and set `git_meta=true`. Those meta paths are STILL kept out of `FsChange.paths` (the tree must not see them) and a pure-git-meta batch now returns `Some{paths:[], git_meta:true}` instead of `None`. Heavy dirs (`node_modules/`, `target/`, …) stay fully excluded — unchanged. Tests: pure-`.git/index` batch → `Some{paths:[], git_meta:true}`; `.git/` + worktree mix → both populated; heavy-dir-only batch → still `None`; a `.git/objects/**`/`.git/*.lock` churn-only batch → `None` (not status-relevant).
- **(Frontend) route git_meta to the git-status key only.** In `RightPanelHost`'s `fs-change` listener: bump `gitStatusRefreshKey` when `paths.length > 0 || git_meta`; bump `fsTreeRefreshKey` only when `paths.length > 0`. `checkDiskForPaths` still runs on real `paths` only. Add `git_meta` to the `FsChange` TS type.

**Verify:** `cargo test` (new transform cases) + `pnpm test` green. Live-verify via the MCP bridge against a scratch repo (`tmp/scratch/scratch-a`): open it, modify a tracked file in the in-app editor or externally, then `git add` it from a terminal — confirm the FileTree badge transitions (M→staged) WITHOUT a remount and the tree does NOT re-walk (scroll/expand preserved). Carry the full live git-op matrix (commit/stash/checkout) to the release gate if the bridge can't drive a real `git add` in-session.

---

## Completion / fold-back
Each WP runs through the normal `/feature-refactor` or `/task-*` loop, so finalize/close auto-marks
its findings/SURFACEs RESOLVED in `workflow/backlog.md` (+ `backlog-quality-findings.md`) and appends
to `CHANGELOG.md`. When all 8 WPs are done:
- Confirm every finding/SURFACE this WBS claims is RESOLVED (grep the backlog for the section names).
- **Bury** `PANETABS-COMPONENT-TEST-GAP` (unless folded into WP6) → create `workflow/backlog-archived.md`
  and move it there. **Delete** the SUPERSEDED `CC-EXIT-REQUIRES-TWO-KEYSTROKES` + any resolved-along-
  the-way stragglers found during the sweep.
- Confirm the **Deferred** items (M9/M10/release-gate/editor-shell-hardening/filmstrip-banner) still
  carry intact anchors — this sweep does NOT touch them.
- **Delete this `debt-paydown-wbs.md`** (scratch doc — same fold-back-and-delete as the retired `qol-wbs.md`).
- The hand-back learning doc for the workflow-system project is written separately this session
  (`docs/lessons/between-milestone-debt-paydown-sweep.md`) — see it for the reusable pattern + the
  directive to cross-validate against the `qol-wbs.md` session.
