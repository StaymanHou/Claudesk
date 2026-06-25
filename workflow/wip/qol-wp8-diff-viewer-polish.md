# Feature: QoL-WP8 — Diff-viewer polish

**Workflow:** feature
**State:** verify-codify (all phases complete) — ready to ship
**Created:** 2026-06-25
**Drive mode:** autopilot

## Problem Statement
The M2 diff viewer (`DiffPanel` + `CommitList` + `FileDiffSection`) needs a focused
polish pass — the LAST QoL WP. The QoL WBS WP8 lists four sub-items, but a fresh read
of the code (2026-06-25) shows **two of the four already shipped during M2 WP4's own
build**: item 1 (collapse/expand-all button — `diff-collapse-all` + `toggleAllCollapsed`
in `DiffPanel.tsx`) and item 3 ("open in editor" badge per file row — `diff-open-in-editor`
"Edit" button in `FileDiffSection.tsx`, wired through `RightPanelHost.onOpenInEditor=openFile`).
Both work the live working-tree file and match the WP8 intent. The genuine remaining
work is two items: **(item B) the commits list should be COLLAPSED by default** (today
`commitsCollapsed = useState(false)`), and **(item 2 + A, merged) the sticky headers
collide** — `.diff-commits`, `.diff-commit-banner`, and `.diff-file-header` are ALL
`position:sticky; top:0` in the same `.diff-scroll` container, so the per-file header gets
shoved off by the next file's header instead of pinning under the commits section while
that file's diff scrolls. (`.diff-statusbar` is NOT a collider — it's a `flex-shrink:0`
header OUTSIDE `.diff-scroll`, always visible.) After WP8 ships, the QoL WBS completes.

## Pre-shipped items (verified at plan time — NOT re-built)
- **Item 1 — collapse/expand-all:** `DiffPanel.tsx` already renders a `diff-collapse-all`
  button (label flips Collapse all ↔ Expand all via `everyCollapsed`) calling
  `toggleAllCollapsed` over `visibleKeys`. `collapseAll`/`expandAll`/`allCollapsed` exist in
  `diffModel.ts` and are unit-tested. **No work.**
- **Item 3 — open-in-editor badge:** `FileDiffSection.tsx` renders an "Edit" button
  (`diff-open-in-editor`, `stopPropagation` so it doesn't toggle collapse) when
  `onOpenInEditor` is present; `RightPanelHost.tsx:765` passes `onOpenInEditor={openFile}`,
  always opening the live working-tree file (blob-at-rev dismissed as WAI per the DiffPanel
  doc-comment + SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV). **Design call confirmed:
  intent is still "open always opens the live working-tree file." No work.**

## Work Tree

- [x] Phase 1: Commits collapsed by default (item B)  <!-- status: DONE 2026-06-25 -->
  **Observable outcomes:**
  - Browser: in the dev seam, the diff panel mounts with the Commits section COLLAPSED —
    `[data-testid="diff-commits-header"]` has `aria-expanded="false"` and
    `[data-testid="diff-commits-body"]` is absent on first render; clicking the header
    expands it (`aria-expanded="true"`, body appears), clicking again re-collapses.
  - CLI: `pnpm vitest run` — a new/extended `DiffPanel` (or `diffModel`) test asserts the
    initial `commitsCollapsed` default is `true`; suite green.
  - Console: no React warnings; `tsc --noEmit` + `eslint` clean.
  - [x] P1.1 Flip the `commitsCollapsed` initial state in `DiffPanel.tsx` from
        `useState(false)` to `useState(true)`. Update the adjacent comment to state the
        default is collapsed-by-WP8. The CommitList already renders correctly for both
        states (`!collapsed && …body`); no CommitList change needed.  <!-- status: DONE — DiffPanel.tsx:185 useState(true) + comment; tsc --noEmit clean -->
  - [x] verify-auto  <!-- status: DONE — tsc clean, eslint clean (DiffPanel.tsx), diffModel.test 19/19 -->
  - [x] verify-self  <!-- status: DONE (static/wiring slice) — vite build clean; source trace: commitsCollapsed=useState(true) L187, passed to CommitList L398, CommitList renders aria-expanded={!collapsed} + {!collapsed && body}. LIVE Browser outcome (mount collapsed + click-expand in real app) CARRIED to verify-human (no Tauri app in-session, bare Vite can't mount a workspace DiffPanel with a real projectPath) -->
  - [x] verify-human  <!-- status: DONE — operator approved 2026-06-25 -->
    - [x] P1.verify-human.1 On opening the Diff panel for a repo with commits, the Commits section is COLLAPSED (chevron ▸, no commit rows shown)  <!-- status: DONE -->
    - [x] P1.verify-human.2 Clicking the Commits header expands it (chevron ▾, commit rows appear); clicking again re-collapses  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE — +5 ?raw wiring assertions (commitsCollapsedDefault.test.ts); full vitest 584 pass (was 579) -->

- [x] Phase 2: Stacked sticky headers + genuinely-sticky per-file row (item 2 + A)  <!-- status: DONE 2026-06-25 -->
  **Observable outcomes:**
  - Browser: with several changed files expanded and the panel scrolled into the middle of
    a long file's diff, that file's `[data-testid="diff-file-header"]` stays pinned BELOW
    the Commits section (not at viewport-0, not shoved off by the next file). Concretely:
    the file header's resolved `top` (getComputedStyle) is NOT `0px` — it equals the
    measured commits-section offset (the stacking var). In commit view, the
    `[data-testid="diff-commit-banner"]` pins below the commits section and the file header
    pins below the banner — three distinct stacked `top` values, none overlapping at 0.
  - CLI: `pnpm vitest run` — a `?raw`-source wiring test on `App.css` (+ `DiffPanel.tsx`
    if a measured offset is wired) asserts the sticky layers no longer all use `top: 0`
    (the file header / commit banner reference the stacking offset, not `top:0`); suite green.
  - Console: no React/JS errors; `tsc --noEmit` + `eslint` + `pnpm vite build` clean.
  - [x] P2.1 Establish a stacking offset for the sticky layers in `.diff-scroll`. The
        commits section height is dynamic (collapsed header-only vs expanded with a 33vh
        body), so a hard-coded `top:` is wrong. Drive the offset from a CSS custom property
        `--diff-commits-h` set on `.diff-scroll` (or `.diff-panel`) from the MEASURED
        `.diff-commits` height via a `ResizeObserver` in `DiffPanel.tsx` (ref on the
        commits wrapper). Default the var to the collapsed header height (~`2rem`) so the
        first paint is correct before the observer fires.  <!-- status: DONE — --diff-commits-h declared on .diff-scroll (default 2rem); ResizeObserver in DiffPanel measures .diff-commits offsetHeight → setProperty -->
  - [x] P2.2 `src/App.css`: change `.diff-file-header` from `top: 0` to
        `top: var(--diff-commits-h, 2rem)` and `.diff-commit-banner` likewise (banner pins
        below the commits section; file headers pin below the banner in commit view — give
        the file header an additional banner-height offset only if the operator finds the
        banner+header overlap in commit view, otherwise keep file headers below the commits
        section and let the banner pin at the same level above them via z-index). Keep the
        existing z-index order: `.diff-commits` z2, `.diff-commit-banner` z2,
        `.diff-file-header` z1 (file header tucks under both). Reconcile the now-stale
        sticky-offset comments (~L1716-1726, L1848-1854, L1876-1887).  <!-- status: DONE — .diff-commit-banner top:var(--diff-commits-h,2rem); .diff-file-header top:calc(var(--diff-commits-h,2rem) + var(--diff-commit-banner-h,0px)); 3 comments reconciled -->
  - [x] P2.3 Wire the `ResizeObserver` cleanly: ref + observer in a `useEffect`, set the var
        via `el.style.setProperty("--diff-commits-h", \`${h}px\`)`, disconnect on unmount.
        Guard the `Date.now`/observer-availability the repo way (no impure render reads).  <!-- status: DONE — scrollRef + RO measuring .diff-commits + .diff-commit-banner; sets both vars; ResizeObserver-undefined guard; ro.disconnect() cleanup; re-attach deps [view.kind, commitsCollapsed, list.kind, commitDiff] -->
  - [x] verify-auto  <!-- status: DONE — tsc clean, eslint clean (DiffPanel.tsx), diff tests 24/24 -->
  - [x] verify-self  <!-- status: DONE (static/wiring slice) — vite build clean (CSS compiled, 29.86kB bundle); source trace: .diff-commit-banner top:var(--diff-commits-h,2rem) L1865, .diff-file-header top:calc(...+--diff-commit-banner-h) L1905, no bare top:0 left on offset layers; ResizeObserver guarded+disconnect+both setProperty, scrollRef on .diff-scroll. LIVE sticky-scroll Browser outcome CARRIED to verify-human (needs real-workspace DiffPanel w/ diff data to scroll) -->
  - [x] verify-human  <!-- status: DONE — operator approved all 3 leaves 2026-06-25 -->
    - [x] P2.verify-human.1 Working-dir view: with several changed files expanded, scroll into the middle of a long file's diff — that file's header stays pinned just BELOW the (collapsed) Commits section, visible, until the next file's header replaces it (not hidden, not at viewport-0)  <!-- status: DONE -->
    - [x] P2.verify-human.2 Expand the Commits section, then scroll the files — file headers now pin LOWER (below the taller expanded Commits panel), still visible; collapse Commits again → they pin back up  <!-- status: DONE -->
    - [x] P2.verify-human.3 Commit view: click a commit; the "← Working Directory" banner pins below the Commits section, and each file's header pins below the banner (three stacked layers, none overlapping) while scrolling  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE — +7 wiring assertions (stickyHeaderStacking.test.ts: 4 CSS via fs-read, 3 DiffPanel ?raw); full vitest 591 pass (was 584) -->

## Current Node
- **Path:** Feature > (all phases complete) > ship
- **Active scope:** none — both phases COMPLETE (P1 commits-collapsed-default; P2 sticky stacking). Ready for /feature-ship.
- **Blocked:** none
- **Unvisited:** ship → finalize
- **Open discoveries:** Items 1 & 3 of the WBS WP8 list were found already-shipped at plan time (verified in DiffPanel/FileDiffSection/RightPanelHost) — scope reduced to items B + 2/A. Logged below.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SHIP-2026-06-25] Added `@types/node@22` as a devDependency. The P2 codify test reads `App.css` via `node:fs`/`node:url` (the only way to assert on CSS text — `.css?raw` and `.css?inline` both return "" under Vitest). The root tsconfig (`include:["src"]`) had no Node types, so `tsc --noEmit` failed on `node:fs`/`node:url` at ship-time. `@types/node` is the standard, correct fix for a Vite project (vite.config already imports `node:process`); adding it surfaced NO other latent tsc errors. Files: package.json + pnpm-lock.yaml.
- [SURFACED-2026-06-25] Phase 2 verify-codify — Vite's `?raw` query yields an EMPTY string for `.css` files under Vitest (CSS goes through Vite's style pipeline, not the raw-text loader), unlike `.tsx?raw` which works. To assert on `App.css` text in a vitest test, read it with `fs.readFileSync(fileURLToPath(new URL("…/App.css", import.meta.url)))` instead of importing `App.css?raw`. (Logged to backlog as a testing gotcha for future codify work.)
- [SCOPE-2026-06-25] Phase 2 went slightly richer than the plan's optional note: added a SECOND CSS var `--diff-commit-banner-h` (0 in working-dir view, measured banner height in commit view) so commit-view file headers stack below BOTH the commits section AND the banner — the plan flagged this banner-overlap as a do-only-if-needed follow-up; doing it now is cheap and makes commit view correct out of the box (no second observer needed — the same RO measures both nodes). Working-dir view (the primary surface) uses only `--diff-commits-h`.
- [SURFACED-2026-06-25] Phase scope — WP8 items 1 (collapse/expand-all) and 3 (open-in-editor badge) were already implemented during M2 WP4's build (`diff-collapse-all` button + `toggleAllCollapsed`; `diff-open-in-editor` "Edit" button wired through `RightPanelHost.onOpenInEditor=openFile`). Only items B (commits collapsed default) and 2/A (sticky stacking) remain genuine work. Not separately backlogged — it's a scope reduction, recorded here + reflected at finalize when resolving SURFACE-2026-06-20-WP4-DIFF-VIEWER-POLISH-FOLLOWUPS.
