# Feature: M11 WP2 — Docs panel plumbing (4th RightPanelHost panel + workflow-ordered doc list)

**Workflow:** feature
**State:** COMPLETED 2026-08-01 — shipped `6632f59`, review-quality done, finalized
**Created:** 2026-08-01
**Drive mode:** autopilot
**Source:** `workflow-system/product/wbs.md` → WP2 (tasks 2.1–2.5) + the 2026-08-01 Activation audit

## Problem Statement

M11 delivers a workflow-docs markdown viewer in the workspace's right half. WP2 builds everything
*except* the render: a **Docs** panel registered as the fourth member of `RightPanelHost`'s
Editor/Diff/Terminal row (clickable tab + a direct-select `⌘⇧` chord), a backend `docs_list` that
auto-discovers the conventional doc set under a workspace's project root, a `docs_read` that returns
one doc's raw text, and a pure workflow-ordering function that sequences the list for
re-orientation (`vision → roadmap → wbs → wip → backlog → .session.md → arch · research · context ·
design-priors · transitions`). WP3 plugs WP1's verdict (`react-markdown@10` + `remark-gfm@4` +
`rehype-sanitize@6`) into the known list + known `docs_read` shape that this WP establishes.

The whole surface is **gated behind M10.9's `workflow_features_enabled`**, and M11's Docs tab is that
gate's **first consumer by design** (`useWorkflowFeaturesEnabled` has shipped with zero consumers
since M10.9 WP2). The gate's contract is absence, not concealment: with the gate off there must be no
tab, no chord, and no `"docs"` member anywhere in a live registry.

**Not in scope (deliberate, each owned elsewhere):** the markdown render itself, link interception,
and `[[slug]]` handling (all WP3); scroll-preserving live reload on `fs-change`
(WP4 — `SURFACE-2026-07-07-DOCS-VIEWER-RELOAD-PRESERVE-SCROLL`); and the app-wide CSP posture
(`SURFACE-2026-08-01-APP-SHIPS-WITH-CSP-NULL-NO-SECOND-LINE-OF-DEFENSE`, arch-level — it becomes
load-bearing when WP3 renders untrusted HTML, not when WP2 lists filenames).

**3rd-party probe check:** no external service/API/SDK — backend fs over existing seams plus React
panel plumbing. The one dependency M11 adds (`react-markdown`) belongs to WP3 and its probe (WP1) is
complete. No known unknown.

## Design decisions settled at plan time

Two calls the WBS left open are settled here, both measured against the code rather than predicted.
Recording them now so build does not re-litigate them.

### D1 — Gating shape: `AVAILABLE_PANELS` / `RightPanel` become GATE-DERIVED (not a separate module)

**Re-measured at plan time, not inherited.** Adding `"docs"` to the `RightPanel` union *alone* — one
word, no `AVAILABLE_PANELS` entry, no chord, no tab — fails the OFF-invariant guard's chord arm with
`offenders: ["src/components/workspace/panelHost.ts"]`, and **only** that arm (12 other tests pass).
M11.5 WP4 put `panelHost.ts` in scope via `exportsChordIdentifier` (it exports `panelForChord` +
`PanelChordEvent`).

**The predicate is the key, and it points at the fix.** The arm's offender test is
`namesWorkflowTerm(src) && !/useWorkflowFeaturesEnabled/i.test(src)` — a module naming a workflow term
is compliant **iff it also consumes the seam**. So the guard is not saying "`docs` may not live in
`panelHost.ts`"; it is saying "whatever module names `docs` must read the gate." That makes
gate-derivation the shape the guard is actually asking for, and the guard's own header sanctions it:
*"If M11 makes AVAILABLE_PANELS dynamic, update this test to assert the OFF-state value of that
computation rather than deleting the assertion."*

**Chosen:** `panelHost.ts` exposes a gate-parameterized derivation — `availablePanels(enabled)` and
`panelForChord(e, enabled)` — with the static `AVAILABLE_PANELS` retained as the OFF-state value the
guard keeps asserting. The alternative (a separate gated module `panelHost.ts` never names) was
rejected: it splits one 4-member registry across two files to satisfy a text predicate, leaving
`panelForChord`'s mnemonic map in one file and the Docs mnemonic in another — worse to read, and it
dodges the guard rather than answering it.

**Blast radius measured:** exactly **one** runtime consumer outside `panelHost.ts`
(`RightPanelHost.tsx`), with 8 `setPanel(cur => selectPanel(cur, …))` call sites all routing through
the single `selectPanel` guard. Everything else grepping `RightPanel` is a comment mention.

⚠️ **Do NOT narrow the chord arm to make the error go away.** M11.5 WP4 pinned the arm's reach and its
offender predicate as standing meta-tests precisely so that dodge fails loudly. The guard extension
here asserts the OFF-state *value* of the new computation; it never weakens the predicate.

### D2 — Chord: `⌘⇧K`

Both `⌘⇧K` and `⌘⇧G` were verified free at activation. **`⌘⇧K`** is chosen — `G` reads as "git" beside
the existing Diff panel and would mis-cue. Pinned in `paletteCommands.ts`'s ownership matrix in-build.

### D3 — The FRONT-panel reconciliation hazard (this WP's subtlest correctness risk)

`selectPanel` guards transitions **into** a panel; it never re-examines one already front. The gate is
runtime-toggleable via `⌘,`, so a user can have Docs front when the gate flips off — leaving
`panel === "docs"` with nothing to correct it. **The type system will not catch this**: the value is
already in `useState`, so no assignment happens at flip time. This is a dead surface in exactly the
state M10.9's contract forbids. Phase 3 handles it explicitly and behavior-tests it (Phase 3's
outcomes assert the reconciliation, not merely the absence of a tab).

## Work Tree

- [x] Phase 1: Backend — `docs_list` + `docs_read` over the existing `editor_fs` seams  <!-- status: COMPLETE 2026-08-01 -->
  **Observable outcomes:**
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml docs` exits 0 with a non-zero test count printed (per `SURFACE-2026-07-29-CARGO-TEST-FILTER-OUTCOMES-ARE-VACUOUS-WITHOUT-A-COUNT`, a filter that matches nothing must not read as a pass).
  - CLI: a unit test over a synthetic tree asserts `docs_list` returns exactly the present conventional docs — absent files silently omitted, `workflow-system/product/archive/**` and `CHANGELOG.md` excluded, `*wbs*.md` glob catching `wbs.md` + `m11-wbs-parked.md` + a `temporary-wbs.md`.
  - CLI: a unit test asserts the **legacy layout is NOT discovered** (`docs/product/` + `workflow/` → empty list), and that a project carrying legacy leftovers alongside the migrated tree yields only the `workflow-system/` copy. *(Revised at Phase 1 verify-human, 2026-08-01 — operator dropped legacy-layout support; the original outcome asserted the opposite.)*
  - CLI: a unit test asserts `.session.md` IS returned (gitignored-but-present — discovery must not filter on git-tracked).
  - CLI: a path-escape test asserts `docs_read("../../etc/passwd")` returns a typed `OutsideWorkspace`/`Io` error, not file contents.
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0.
  - [x] P1.1 New `src-tauri/src/docs/` module: a pure `discover(root) -> Vec<DocEntry>` over the curated set (NOT a flat glob), scoped to the `workflow-system/` layout only.  <!-- status: done — legacy support removed at verify-human per operator -->
  - [x] P1.2 `docs_list` command — authenticate the frontend-supplied root via `editor_fs::validate_root` (reuse; never re-trust a frontend root), then `discover`.  <!-- status: done -->
  - [x] P1.3 `docs_read` command — reuse `editor_fs::read_file_core` (`mod.rs:263`; **not** the private `resolve_within`), returning raw text read-only.  <!-- status: done -->
  - [x] P1.4 Register both in `lib.rs`'s invoke handler.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 13/13 docs tests, clippy --all-targets clean, fmt clean, IPC reachability mutation-proven -->
  - [x] verify-self  <!-- status: done — all 6 outcomes PASS, 5 of 6 mutation-proven; 2 cosmetic findings fixed in place -->
    - [x] O1 cargo test docs → 15 passed, non-vacuous count  <!-- status: done -->
    - [x] O2 curated set / archive+CHANGELOG excluded / *wbs* glob  <!-- status: done — mutation-proven -->
    - [x] O3 legacy layout + both-layouts  <!-- status: done — mutation-proven -->
    - [x] O4 .session.md returned despite gitignore  <!-- status: done — mutation-proven -->
    - [x] O5 path-escape rejected with typed error (`..` + absolute)  <!-- status: done -->
    - [x] O6 clippy --all-targets -D warnings  <!-- status: done -->
  - [x] verify-human  <!-- status: done — operator PASS 2026-08-01, with one scope change: drop legacy-layout support -->
    - [x] Curated doc set reviewed — approved as-is  <!-- status: done -->
    - [x] Legacy-layout support — REMOVED per operator  <!-- status: done -->

  **Operator decision (2026-08-01, Phase 1 verify-human): legacy-layout support is OUT.**
  The pre-2026-07-28 `docs/product/` + `workflow/` roots are no longer probed. An un-migrated
  project shows **no docs** rather than a partial list. Rationale: a second permanent set of roots
  to serve a shrinking population of stale projects is not worth carrying, and migrating the project
  is the real fix. Removed the `Layout` struct + `LAYOUTS` loop in favor of two plain
  `PRODUCT_DIR`/`STATE_DIR` consts; the two legacy tests were **inverted rather than deleted**
  (`ignores_the_legacy_pre_migration_layout`, `a_migrated_project_carrying_legacy_leftovers_yields_only_the_new_layout`)
  so the decision is asserted and a future re-add must consciously change a test. Mutation-proved:
  pointing `PRODUCT_DIR` at the legacy root makes the leftovers test fail, so it discriminates on
  which root is read. The dedup guard was re-examined and KEPT — its real justification was never
  the two-layout case (distinct roots yield distinct paths) but a `PRODUCT_DOCS` name overlapping the
  `*wbs*` glob, which still stands. `wbs.md` task 2.1 corrected so the durable spec matches.
  Gates after the change: 721 tests, clippy 0, fmt 0.
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [x] verify-codify  <!-- status: done — 2 new contract tests; existing 15 already cover the verified behaviors -->

- [x] Phase 2: Pure frontend core — workflow ordering + gate-derived panel registry  <!-- status: COMPLETE 2026-08-01 -->
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/components/workspace/__tests__/` exits 0; the ordering test asserts the full sequence `vision → roadmap → wbs (+ scratch/parked) → wip/* → backlog (+ quality-findings) → .session.md → arch · research · context · design-priors · transitions` over a synthetic file set, plus present/absent mixes. *(Revised 2026-08-01: the original said "and both layouts" — superseded by the Phase 1 verify-human decision to drop legacy-layout support.)*
  - CLI: `./node_modules/.bin/vitest run src/state/__tests__/offInvariantGuard.test.ts` exits 0 — the guard passes with `"docs"` in the codebase, because the derivation is gate-coupled. The chord arm is NOT narrowed.
  - CLI: a test asserts `availablePanels(false)` equals the three-member OFF value and `availablePanels(true)` contains `"docs"`; `panelForChord({⌘⇧K}, false)` returns `null` while `panelForChord({⌘⇧K}, true)` returns `"docs"`.
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0 (**not** `pnpm exec tsc`, which exits 0 regardless — see `[[pnpm-exec-shadows-local-binaries]]`).
  - [x] P2.1 `docsOrder.ts` — pure ordering + a `DocEntry`→display-label derivation; no React/DOM (repo posture: pure logic → vitest).  <!-- status: done -->
  - [x] P2.2 Convert `panelHost.ts` to the gate-derived shape (D1): `availablePanels(enabled)`, `panelForChord(e, enabled)`, `selectPanel(current, target, enabled)`; retain the static OFF-state `AVAILABLE_PANELS`. **Plus `reconcilePanel` (D3), added here rather than Phase 3** — it is pure logic, so it belongs with its siblings and is unit-testable now.  <!-- status: done -->
  - [x] P2.3 Extend the OFF-invariant guard to assert the **OFF-state value of the computation** (per its own header) rather than only the static array — extension, never a weakening of the predicate. **Plus an anti-vacuity companion** pinning that ON differs from OFF.  <!-- status: done -->
  - [x] P2.4 Unit tests for P2.1/P2.2 including the ⌘⇧K mapping and the gate-off `null`.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc 0, eslint 0 on all 5 changed files, 51/51 scoped tests, gate-bypass mutation-proven -->
  - [x] verify-self  <!-- status: done — all 4 outcomes PASS; guard verdict EXTENSION (byte-compared vs HEAD); 3 cosmetic findings, 2 fixed in place + 1 backlogged -->
    - [x] O1 ordering test asserts the full sequence + present/absent mixes  <!-- status: done -->
    - [x] O2 guard passes with "docs" present, chord arm NOT narrowed  <!-- status: done — internals byte-identical to HEAD -->
    - [x] O3 availablePanels(false)/(true) + ⌘⇧K gated both ways  <!-- status: done -->
    - [x] O4 tsc --noEmit exits 0  <!-- status: done -->
  - [x] verify-human  <!-- status: done — operator PASS 2026-08-01, no changes requested -->
    - [x] Doc ordering (spine → reference tail) reviewed — approved as-is  <!-- status: done -->
    - [x] ⌘⇧K chord choice — approved  <!-- status: done -->
    - [x] Multi-file kinds label by filename — approved  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — 2 new reconcilePanel property tests; the 3 approved behaviors were already pinned -->

  **Codify note (2026-08-01).** The three operator-approved behaviors (ordering, ⌘⇧K gating,
  multi-file labelling) were already pinned by named, mutation-proven tests from build — duplicating
  them would add no regression protection, so they were skipped per the do-not-duplicate rule. One
  genuine gap was closed: `reconcilePanel`'s tests asserted the fallback **is** `"editor"` (a
  literal) but nothing asserted **why that is safe** — that the fallback target is itself ungated. A
  fallback to a gated panel would be a silent trap: reconciliation would "fix" a dead surface by
  selecting another dead surface, and every existing assertion would still pass. Added two property
  tests (`its fallback target is itself ungated`, `reconciles EVERY gated panel off the front`),
  written against the derivation rather than a hardcoded list so a future gated panel inherits the
  coverage. Mutation-proved: changing the fallback to `"docs"` fails both, with the message naming
  the violated property. Phase 3 is `reconcilePanel`'s first real consumer, which is why this was
  worth closing now rather than later.

- [x] Phase 3: Wire the panel into `RightPanelHost` — tab, chord, list body, front-panel reconciliation  <!-- status: COMPLETE 2026-08-01 -->
  **Observable outcomes:**
  - Browser (MCP bridge, gate ON, scratch workspace): the tab row shows a 4th `data-testid="panel-tab-docs"` button; clicking it sets `aria-selected="true"` and reveals a docs list whose first entries match the workflow order for that project.
  - Browser (MCP bridge, gate ON): `⌘⇧K` selects the Docs panel from the Editor panel (assert via the tab's `aria-selected`), and is idempotent (pressing again leaves it selected).
  - Browser (MCP bridge, gate OFF): `document.querySelectorAll('[data-testid="panel-tab-docs"]').length === 0` — no tab exists (absent, not hidden/disabled), and `⌘⇧K` does not `preventDefault` or change the front panel.
  - Browser (MCP bridge): with Docs front and the gate flipped OFF via the live setting, the front panel **reconciles to Editor** — `panel === "docs"` must not survive (D3). Asserted as behavior, not by reading source.
  - Console: no JS errors on panel switch or on gate flip in either direction.
  - CLI: `./node_modules/.bin/vitest run` exits 0 across the full suite; `pnpm lint` 0 errors; `pnpm format:check` clean.
  - [x] P3.1 Consume the gate via `useWorkflowFeaturesEnabled()` in `RightPanelHost` — never `invoke("workflow_get_features_enabled")` ad hoc, never the raw `getWorkflowFeaturesEnabled()` wrapper (the guard scans for both bypass shapes).  <!-- status: done -->
  - [x] P3.2 Conditionally render the Docs tab button + the panel container inside an `enabled &&` branch; thread `enabled` into the chord listener so the ⌘⇧K branch is not merely a no-op handler. **Via a latest-ref** (`workflowFeaturesEnabledRef`) — the listener's dep array is identity-stable by design, so a direct capture would stale-close over the gate. Same pattern as `overlayOpenRef`/`terminalsRef`.  <!-- status: done -->
  - [x] P3.3 **Front-panel reconciliation (D3)** — ⚠️ implemented as a RENDER-TIME DERIVATION, not the effect the plan specified. See the Phase 3 build notes; the effect version tripped the react-hooks cascading-render lint rule, and deriving is strictly better (no extra render pass, and the dead panel is never rendered front even for one frame).  <!-- status: done -->
  - [x] P3.4 Panel body: fetch `docs_list` for the workspace's project root, render the workflow-ordered list (selection state per workspace, alongside the existing Editor/Diff/Terminal state — all workspaces stay mounted; switching is display toggling, never remount). No render of the doc body (WP3).  <!-- status: done -->
  - [x] P3.5 Pin ⌘⇧K in `paletteCommands.ts`'s chord-ownership matrix + `panelHost.ts`'s header map.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc 0, eslint 0 on all 6 changed files, 63/63 scoped tests, vite build 0 + the 6 new CSS classes confirmed present in the built stylesheet -->
  - [x] verify-self  <!-- status: done — all 6 live outcomes PASS on the real app via the MCP bridge; 2 BLOCKING test-coverage gaps found by the static agent and fixed in place -->
    - [x] O1 gate OFF: no docs tab / slot / component in the DOM  <!-- status: done — live -->
    - [x] O2 gate ON: tab appears, ⌘⇧K selects Docs, slot display:flex  <!-- status: done — live -->
    - [x] O3 gate OFF: ⌘⇧K does NOT preventDefault (key passes through)  <!-- status: done — live, defaultPrevented:false -->
    - [x] O4 gate flip with Docs front → reconciles to Editor  <!-- status: done — live, 5/5 trials -->
    - [x] O5 list shows the right docs in the right order  <!-- status: done — live, 8/8 rows exact -->
    - [x] O6 no JS console errors; full suite + tsc + lint + format green  <!-- status: done -->
  - [x] verify-human  <!-- status: done — operator PASS 2026-08-01, no changes requested -->
    - [x] Docs tab + ⌘⇧K + gated behavior reviewed — approved  <!-- status: done -->
    - [x] List is select-only (render is WP3) — accepted as scoped  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — extracted + pinned `docsView`; the consuming-surface tests were already added at verify-self -->

  **Codify note (2026-08-01).** The integration boundary (`RightPanelHost`) is covered by the two
  gate-wiring guards added at verify-self, both mutation-proven — so no duplication was needed there.
  The one real gap was `DocsPanel`'s render branching, which had **zero** tests: its three inline
  conditionals decide whether a failed `docs_list` reads as an ERROR or silently as "no docs", and
  nothing pinned that. Extracted the decision into a pure `docsView(docs, error)` (per the repo rule
  that async/ordering logic must be a value-asserted function, never a `?raw` guard), wired the
  component to it so the test covers the code that actually runs, and pinned 4 states + exclusivity.
  **Mutation-proved:** reordering the guards so emptiness wins over error — the confident-wrong-answer
  bug — fails two tests by name. Gates: 1513 frontend (+5) / 723 backend, tsc·lint·format·clippy·cargo-fmt all 0.

## Current Node
- **Path:** Feature > review-quality (complete) → feature-finalize
- **Active scope:** none — shipped `6632f59`; review 0 CRITICAL / 3 MAJOR / 4 MINOR (1 MAJOR fixed in place, rest backlogged)
- **Blocked:** none
- **Unvisited:** none — all phases complete
- **Open discoveries:** 1 — `SURFACE-2026-08-01-OFF-INVARIANT-CHORD-ARM-PREDICATE-IS-MODULE-LEVEL-NOT-PER-EXPORT` (low; no live gap, defense-in-depth only; relevant to Phase 3)

## Build notes — Phase 1 (2026-08-01)

**Shape as built:** `src-tauri/src/docs/` — `mod.rs` (pure `discover` + `DocEntry`) + `commands.rs`
(`docs_list`, `docs_read`), registered in `lib.rs`. Follows the repo's
`command → pure-fn → typed-error → String` convention; the pure core takes an injected
`root: &Path` and is `TempDir`-testable with no Tauri runtime.

**Reuse over re-implementation (the security-relevant call).** `docs_read` delegates to
`editor_fs::read_file_core` and both commands authenticate the frontend root via
`editor_fs::validate_root`, rather than growing a second path-confinement guard. The doc set is a
strict *subset* of the tree the editor can already open, so this adds no trust surface — and it keeps
the WP7 symlink handling in exactly one implementation. A second guard is one that drifts.

**`DocEntry` carries `file_name` alongside `kind`** — `kind` alone cannot distinguish `wbs.md` from
`m11-wbs-parked.md` from `temporary-wbs.md`, and all three are legitimately discoverable. Phase 2's
ordering function needs both fields.

**Gates:** 13 new tests (`cargo test docs` → 13 passed, non-zero count so the filter is not vacuous
per `SURFACE-2026-07-29-CARGO-TEST-FILTER-OUTCOMES-ARE-VACUOUS-WITHOUT-A-COUNT`); full suite 719
passed / 0 failed; `cargo clippy --all-targets -- -D warnings` clean; `cargo fmt --check` clean.

## Build notes — Phase 2 (2026-08-01)

**The gating shape (D1) is settled and PROVEN, not asserted.** `panelHost.ts` now exposes
`availablePanels(enabled)`, with the static `AVAILABLE_PANELS` retained as the OFF-state baseline the
guard checks. `selectPanel` and `panelForChord` take the gate as a **defaulted-`false`** third/second
argument — so every existing call site compiles unchanged *and* fails closed. That default is why
`RightPanelHost.tsx` needed no edit in this phase: Docs stays unavailable until Phase 3 threads the
gate through deliberately.

**⚠️ The guard's chord arm required a REAL dependency, not a comment — measured.** First attempt put
`useWorkflowFeaturesEnabled` in a doc comment; the arm still failed, because `isUngatedWorkflowChord`
strips comments before matching. The fix is `type WorkflowGateValue = ReturnType<typeof
useWorkflowFeaturesEnabled>` — a type-only import that makes the coupling structural and
machine-checked (if the seam ever returns an object instead of a boolean, every gate parameter in the
file breaks at compile time). This is the guard working exactly as designed: it refuses to accept a
convention where it can demand a dependency.

**`reconcilePanel` (D3) landed here rather than in Phase 3** — it is pure logic, so it belongs beside
its siblings and is unit-testable now. Phase 3 only has to call it from an effect.

**Guard extension is mutation-proven on BOTH bypasses, each attributed to its own arm:**
leaking `"docs"` into `AVAILABLE_PANELS` fails the OFF-state arm; making `availablePanels` ignore its
argument fails the new anti-vacuity arm. That second test is the one that earned its place — without
it, a gate-ignoring constant would satisfy the OFF assertion *while making Docs permanently
unreachable*, and the arm would be guarding nothing.

**Gates:** 1494 frontend tests pass (was 1470, +24), `tsc --noEmit` 0, `pnpm lint` 0 errors (1
pre-existing warning in untouched `XtermPane.tsx`), `pnpm format:check` clean. Backend untouched this
phase (723 still green).

## Build notes — Phase 3 (2026-08-01)

**⚠️ D3 shipped as a RENDER-TIME DERIVATION, not the effect the plan specified.** The planned
`useEffect(() => setPanel(cur => reconcilePanel(cur, enabled)), [enabled])` is a state-sync effect,
and `pnpm lint` rejected it: *"Calling setState synchronously within an effect can trigger cascading
renders."* The rule is right, and suppressing it would have been the wrong move — `reconcilePanel` is
a **pure function of (storedPanel, gate)**, so the corrected value can simply be computed:

```
const [storedPanel, setPanel] = useState<RightPanel>("editor");
const panel = reconcilePanel(storedPanel, workflowFeaturesEnabled);
```

`storedPanel` is the write target (all 9 `setPanel` call sites); `panel` is what every read uses.
**This is strictly better than the effect**, not merely lint-clean: an effect would fire an extra
render pass on every gate change AND would briefly render the dead Docs panel before correcting it.
Deriving closes that window entirely — a gated panel is never front, not even for one frame. A free
consequence: `time_set_active_context` reports `surface: panel`, so time-analytics now records what
the user actually SEES rather than the stale stored value.

**The chord reads the gate through a latest-ref.** The capture-phase keydown listener registers once
on `[visible]` with an identity-stable dep array, so capturing `workflowFeaturesEnabled` directly
would stale-close over its value at registration. `workflowFeaturesEnabledRef` mirrors the existing
`overlayOpenRef` / `terminalsRef` pattern in the same file. The gate is passed to the PREDICATE
(`panelForChord(e, ref.current)`), not checked after it — so with the gate off we never reach
`preventDefault` and the keystroke passes through, rather than being swallowed by a matched-then-no-op
handler (which M10.9's contract forbids by name).

**The Docs slot is NOT unconditionally mounted**, unlike its three siblings. The
SURFACE-2026-06-20 "never blank" guard is satisfied differently: `selectPanel` cannot return `"docs"`
while the gate is off, and the derivation evicts it if the gate flips — so the panel can never be
front without its slot existing. `terminalSlotGuard.test.ts` gained a parallel suite for gated
panels, because its existing suites iterate `AVAILABLE_PANELS` (now the OFF-state set) and therefore
no longer cover `"docs"` — without that addition a gated panel would silently escape the guard.

**CSS was written, not assumed.** `docsPanelStyles.test.ts` pins that every `docs-*` class referenced
in JSX has a rule — the M10.9 WP3.5a failure class (eleven referenced, zero defined) that no other
gate catches. Read via `node:fs`, not `?raw` ([[vitest-raw-import-css-returns-processed-not-text]]).
⚠️ **Its scope is measured, not assumed:** it catches a whole missing class (mutation-proved by
deleting `.docs-panel-empty`) but NOT a missing modifier (deleting `.docs-list-row.is-selected` left
it green, since the base class still has a rule). Stated in the test so it is not mistaken for more.

**Gates:** 1507 frontend tests (was 1498, +9), `tsc` 0, `pnpm lint` **0 errors**, `format:check`
clean. Backend untouched (723 green).

## Retrospect

- **What changed in our understanding:** The gating problem was not *"register the panel
  conditionally"* — it was **"where may the `"docs"` identity live at all."** The activation audit had
  measured that much; what the build added is *why* the guard's answer is the right one. Its offender
  predicate is `namesWorkflowTerm(src) && !/useWorkflowFeaturesEnabled/i.test(src)`, so it is not
  saying "`docs` may not live here" but **"whatever module names `docs` must consume the seam."**
  That reframes gate-derivation from *a way around the error* into *the shape the guard is asking
  for* — and it is why the fix is a real type-level dependency rather than a comment.

- **Assumptions that held:** All five load-bearing activation-audit claims. The seam had zero
  consumers as designed; `⌘⇧K` was genuinely free; `read_file_core`/`validate_root` were the right
  public reuse surfaces (and the WBS's correction away from the private `resolve_within` was right);
  the guard's own header had already sanctioned making `AVAILABLE_PANELS` dynamic. The WP's M/L
  sizing was accurate.

- **Assumptions that were wrong:**
  1. **The plan specified `reconcilePanel` as a `useEffect`.** Lint rejected it (cascading renders),
     and deriving at render turned out strictly better — no extra render pass, and a revoked panel is
     never front even for one frame. The plan's mechanism was wrong; its *hazard analysis* (D3) was
     exactly right, which is what mattered.
  2. **A comment mentioning the seam does not satisfy the guard.** I assumed prose would; the arm
     strips comments first. Measured, not reasoned.
  3. **My first `?raw` guard and my first backend-contract test were both vacuous** — satisfied by
     comments and by an arbitrary two-unknowns comparison respectively. Both found by mutation.

- **Approach delta:** Three phases as planned, in order, no back-loops. Two operator-driven scope
  changes landed cleanly at verify-human gates (legacy-layout support dropped at Phase 1; Phase 2
  approved unchanged). The material delta is `reconcilePanel` moving from Phase 3 to Phase 2 (it is
  pure logic, so it belonged with its siblings) and from an effect to a derivation.

- **The method that paid, again:** *instruct verification subagents to attack the work, not confirm
  it.* Every defect this WP found came from that framing — including the two BLOCKING coverage gaps
  the live verification could never have caught, because **the app behaved correctly the whole time;
  what was broken was that nothing pinned it.** Live checking proves behavior; only mutation proves
  the tests would notice if it changed. Worth carrying: I fixed the same vacuity class three separate
  times here, and twice the lesson failed to transfer to the next file I wrote until a mutation
  forced it.

## Code-Quality Review — m11-wp2-docs-panel-plumbing

Reviewer: `code-quality-reviewer` against ship baseline `6632f59`. **0 CRITICAL / 3 MAJOR / 4 MINOR.**
Drive mode autopilot → MAJOR + MINOR auto-backlogged (see
`workflow-system/state/backlog-quality-findings.md`), **except MAJOR-1, which was VERIFIED and FIXED
IN PLACE** — it was an over-claiming comment in a test shipped minutes earlier, and leaving a
knowingly-wrong claim in a guard is the failure this feature twice paid to avoid.

### Strengths
- The gate-derived registry answers the OFF-invariant guard rather than dodging it, retaining
  `AVAILABLE_PANELS` as the literal OFF-state baseline exactly as the guard's own header prescribed.
- `reconcilePanel` closes a hazard the type system cannot see, and its two property tests assert the
  *property* (fallback is itself ungated; every gated panel is evicted) rather than the literal
  `"editor"` — they still hold for a future second gated panel.
- `docs_read`/`docs_list` reuse `editor_fs::validate_root` + `read_file_core` instead of growing a
  second path-confinement guard, with the reasoning stated rather than the safety asserted.
- Several test comments state measured scope limits honestly rather than implying more coverage than
  exists (`docsPanelStyles`, the wbs-glob directory test, `commands.rs`).
- The chord is gated at the *predicate*, so `preventDefault` is never reached and the key passes
  through — correctly avoiding the "registered-with-a-no-op-handler" shape the seam contract names.

### Issues

**CRITICAL** — none.

**MAJOR**
- **[FIXED IN PLACE 2026-08-01]** `terminalSlotGuard.test.ts:176-183` — the "gate branch is in the
  wrong place" sub-assertion is **inert for the `panel-tab-docs` marker**: `prevSlot === -1` there
  (the tab row precedes every slot), so it degenerates into a duplicate of the `> -1` check above,
  while the comment claimed it covered both markers. **Independently verified before acting**
  (measured `gateAt: 20036 / prevSlot: -1` for the tab vs `27213 / 24057` for the slot). Over-claim,
  not a coverage hole — the tab's gating is still caught by the first assertion, mutation-proved.
  Comment corrected to state the real scope.
- `DocsPanel.tsx:36-55` — the fetch effect lists `docs` in its deps and uses `docs !== null` as the
  once-only latch while the error path sets `setDocs([])`, so `docs` does double duty as data AND
  has-fetched flag, coupling the effect's re-run to its own write. Works today only because both
  arms write non-null. **WP4 is scheduled to add reload-on-`fs-change` to this exact component**; a
  refetch that resets `docs` to `null` would re-arm the effect and can loop against a persistently
  failing `docs_list`. Should become an explicit `fetched` ref before WP4 lands. → backlogged.
- `DocsPanel.tsx` — no component/wiring test: nothing pins that it calls `docs_list` with
  `root: projectPath` (stringly-typed across IPC — the `tauri-command-removal-needs-invoke-sweep`
  failure class), that `selected` is per-instance, or that `visible` defers the first fetch. The
  codify note closed the *decision function* gap (`docsView`), not the component's use of it. →
  backlogged.

**MINOR** (all → backlogged)
- `panelHost.ts:26-43` — the type-only seam import is genuinely load-bearing (verified: replacing the
  alias with `boolean` makes the module an offender), but the 18-line justification argues with the
  guard before describing the code, burying the secondary type-safety benefit in a position that
  reads as primary.
- `docs/mod.rs:184-201` — 9 comment lines + a dedicated private-helper test for a dedup branch no
  production input can reach; an assertion that the fixed lists and glob sets are disjoint would pin
  the same invariant at its actual source, smaller.
- `DocsPanel.tsx:29,95` — `selected` has no consumer until WP3; the header says so, the code doesn't.
- `commands.rs:40-48` — `validate_frontend_root` is a verbatim copy of `editor_fs::commands`' private
  fn of the same name. The cleanest fix (`pub(crate)` on the original) is one keyword and would make
  the module's own "a second guard is one that drifts" principle true across both halves.

### Assessment
Well-built work clearing a genuinely hard bar: the first consumer of a seam that shipped deliberately
unconsumed, which neither weakened nor dodged the guard protecting it. The render-time derivation is
the right call over the planned state-sync effect. The backend is clean and its tests are unusually
honest about what they do and do not pin. **Weakest area: the frontend integration boundary** —
`DocsPanel`, the one net-new component, carries no test of its own IPC wiring, and its fetch latch is
entangled with its data in a way WP4 will have to untangle. Comment-to-code ratio in `panelHost.ts`
and `docs/mod.rs` is high enough that load-bearing sentences compete with provenance narration.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`feature-finalize` archives this WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-08-01] P1.1 — Two COSMETIC verify-self findings fixed in place rather than via an
F9b back-loop (all three shortcut gates held: trivial extension of just-written scaffolding, fresh
subagent re-verification, this entry). (a) The dedup guard in `push_if_present` was dead code whose
test (`both_layouts_present_yields_both_without_duplication`) asserted a property it never exercised
— deleting the guard left the suite green. Added `dedupes_a_file_matched_twice` (drives
`push_if_present` directly, since `discover` cannot currently produce a collision) and renamed the
over-promising test to `both_layouts_present_yields_entries_from_each`. (b) Doc comments over-claimed:
`discover`'s "never recurses into archive/" described an effect as a mechanism, and `commands.rs`
implied `validate_frontend_root` was tested when no test covers it. Both corrected to state what is
actually guaranteed. Re-verified by a FRESH `feature-verify-self-runner` invocation, which
mutation-proved the new test fails iff the guard is removed (precise single-test attribution).

[SHORTCUT-2026-08-01] P3.2/P3.3 — ⚠️ **Two BLOCKING findings, both in test coverage I wrote this
phase, both fixed in place** (gates held: trivial extensions of just-written scaffolding, fresh
subagent had already produced the finding independently, this entry). **Neither was found by the live
verification** — the app behaved correctly in every live check; the defect was that *nothing pinned
it*, so a future edit could silently break the gate wiring with all gates green.
  **(a) The gated tab/slot were asserted PRESENT, never asserted GATED.** Removing
  `{workflowFeaturesEnabled && ...}` from the Docs tab — making it a dead affordance while the gate
  is off, the exact shape M10.9 forbids by name — left all 1507 tests, `tsc` and `eslint` green.
  `terminalSlotGuard.test.ts` only checked that the substring `panel-tab-docs` existed, and
  `offInvariantGuard`'s chord arm never scans `RightPanelHost.tsx` at all (it selects by
  `export …Chord`, which the host does not export). Fixed with a per-gated-panel assertion that
  locates each element and scans BACKWARD for an enclosing gate branch.
  **(b) The `reconcilePanel` assertion was VACUOUS — the very failure mode this session had already
  fixed twice elsewhere.** `expect(hostSource).toContain("reconcilePanel")` matched the file's own
  PROSE: deleting the real call site (`const panel = storedPanel;`) left two comment mentions behind
  and the test stayed green with reconciliation fully defeated. `offInvariantGuard.test.ts` added
  `stripComments` for precisely this reason and I did not carry the lesson into the file I wrote.
  Fixed by stripping comments first and asserting the CALL (`reconcilePanel(`) plus the derivation
  shape, not the bare identifier. **Both fixes mutation-proven**: each probe now fails with a message
  naming the violated property.

[SHORTCUT-2026-08-01] P2.1/P2.2 — Two COSMETIC verify-self findings fixed in place (gates held:
trivial extensions of just-written scaffolding, fresh-subagent re-verification, this entry).
(a) The `lib.rs` mod-doc comment added THIS phase claimed the docs module "tolerates both the
`workflow-system/` and legacy layouts" — the exact opposite of the operator's Phase 1 decision, and
the first thing a reader of the invoke handler sees. Corrected. (b) The Rust↔TS **kind-string
contract** was unpinned: `KIND_ORDER`/`KIND_LABELS` mirror the backend's `PRODUCT_DOCS`/`STATE_DOCS`
by hand across a stringly-typed boundary, so a backend kind rename would silently demote that doc to
the unknown tail with a raw-filename label, every test green on both sides. Added two contract tests.
⚠️ **The first version of the rank test did NOT fire** — it compared a de-ranked kind against another
*unknown*, and ordering between two equal-rank entries is decided by the filename tiebreak. Caught by
mutation (dropping `design-priors` from `KIND_ORDER` left it passing); fixed by choosing a sentinel
filename that also loses the tiebreak, then re-proven — both tests now name the drifted kind
precisely. Same lesson as P1.1b: a new test is not coverage until a mutation says so.

[SURFACED-2026-08-01] Phase 2 verify-self — the OFF-invariant guard's chord arm cannot catch an
ungated chord inside a module that references the seam elsewhere (predicate is module-level, not
per-export). Measured: `panelForChord` mutated to return `"docs"` ungated still passed the guard
14/14, because `panelHost.ts` references the seam via `WorkflowGateValue`. **No live gap** — the WP2
unit test catches it (mutation-proven) — so this is about lost defense-in-depth, not lost coverage.
Logged as `SURFACE-2026-08-01-OFF-INVARIANT-CHORD-ARM-PREDICATE-IS-MODULE-LEVEL-NOT-PER-EXPORT`
(low). Relevant to Phase 3, which wires that very chord.

[SHORTCUT-2026-08-01] P1.1b — Third finding from the fresh re-verification: `glob_dir`'s `is_file()`
filter was reachable in production (a directory named `old-wbs.md/` passes the glob's name predicate)
and unpinned. Added `a_directory_matching_the_wbs_glob_is_not_an_entry`. **The first version of that
test's comment was wrong and was corrected by measurement:** it claimed to pin BOTH guards; mutating
`glob_dir`'s filter left all 15 tests green, while neutering `push_if_present`'s own `is_file()` made
the test fail. So the test pins the SECOND guard — the one that actually decides the observable
outcome — and the first is a redundant early-out. Comment now says exactly that. This is the
`[[verify-the-mutation-landed]]` discipline catching an over-claim in my own new test.
