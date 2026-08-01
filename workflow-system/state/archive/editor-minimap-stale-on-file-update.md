# Feature: Editor minimap stale on file update

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-08-01
**Milestone:** 11.5 (QoL polish bucket) — WP2 of 4
**Resolves:** `SURFACE-2026-07-31-EDITOR-MINIMAP-STALE-ON-FILE-UPDATE`
**drive_mode:** autopilot

## Problem Statement

The in-app editor's minimap does not re-render when the file's content changes. The document text
itself updates correctly, so the minimap stops corresponding to the buffer it is meant to summarize
— **actively misleading as a navigation aid, which is worse than absent**. The WBS mandates
**reproduce-first**: the root cause is NOT confirmed, and a static read of the package (done at plan
time, recorded below) makes the roadmap's prime suspect look *insufficient* on its own. This feature
must reproduce the defect against the running app before any fix is written, because the fix target
changes depending on which change source (external disk reload vs. local typing) actually reproduces.

## Plan-time static read (evidence, NOT a diagnosis)

Recorded so Phase 1 has a starting map. **None of this substitutes for the reproduction** — it is
what the code says, not what the app does.

- **Suspect confirmed present:** `editorExtensions.ts:216-226` registers the minimap as
  `showMinimap.compute([], () => ({ create, displayText, showOverlay }))`. The empty deps array is
  real — the facet value (including the `create`d container) is computed once per `EditorState`.
- **⚠️ But the package re-renders on doc changes independently of that facet, which makes the deps
  array look insufficient as a whole explanation.** In `@replit/codemirror-minimap@0.5.2`
  (`dist/index.js`):
  - `minimapClass` is a `ViewPlugin` whose `update(update)` calls `this.text.update(update)`,
    `this.selection.update(update)`, `this.diagnostic.update(update)`, then `this.render()` on
    **every** update where the facet is non-null (line ~1032-1051). It does not gate on the facet
    having *changed*.
  - `TextState.shouldUpdate(update)` returns `true` when `update.docChanged` (line ~656). The
    content path is doc-driven and never consults `showMinimap`.
  - So a frozen `showMinimap` value should still leave content tracking the doc. **This is exactly
    the gap Finding 2 predicted**: the deps array explains a frozen *config*, and the symptom is
    stale *content*. Phase 1 exists to find which is actually true in the app.
- **Alternative hypotheses to keep live during Phase 1** (do not pre-commit to any):
  - **(H1) Remount-shaped, not update-shaped.** `EditorPanel` renders `<CodeMirror value={doc} …>`
    (`EditorPanel.tsx:303-313`). If a disk reload replaces the doc via a path that recreates the
    view or dispatches in a way the plugin misses, the minimap's stale state would be a
    lifecycle problem, not an update-cycle one.
  - **(H2) Canvas/render-geometry, not text-model.** `render()` (line ~1058) sizes the canvas from
    `this.getWidth()` and `view.dom.getBoundingClientRect().height`. Our WP11 CSS clips the gutter
    to 68px with `!important` (`App.css:2129-2136`) while the package sets width inline — if the
    canvas is sized or cleared under assumptions our override breaks, the text model could be
    correct while the *painted* result is stale or clipped. Also noted: `render()` calls
    `context.restore()` with no matching `save()` in that function — flagged as an observation, its
    relevance is unknown until reproduction.
  - **(H3) The two change sources differ.** External disk reload and local typing may not behave
    alike. Task 1.1 tests both precisely because the answer re-scopes the WP.

## Known constraints (binding on any fix)

- **`cm-minimap-narrow` must survive.** Any fix that recreates the container MUST keep that marker
  class, or the 68px width clip in `App.css:2129` silently regresses (the override is scoped by it).
  Phase 2 pins this with a check rather than trusting review.
- **Do not touch the disk-reload plumbing** (`EditorSplit`'s `checkDisk` → `diskDecision` →
  `reloadFromDisk`) unless the reproduction implicates it. The roadmap explicitly clears it as
  not-suspect — consistent with the text updating correctly — and it is shared machinery.
- **Not `dashboard/Minimap.tsx`.** That is the unrelated M9 time-analytics timeline component. The
  editor minimap is a CM6 extension with no dedicated component file.
- **Prefer observable values over `?raw` source guards.** Per the M10.9 WP2 lesson (`?raw` guards
  verify structure, never runtime — one there passed while the behavior was broken, and two rotted
  again last session under Prettier). If a guard is unavoidable, assert single identifiers.
- **Testing-posture constraint:** `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` is still
  undecided. There is no React component-render harness, so a full CM6-in-jsdom test may not be
  available. Phase 2 picks the cheapest honest pin and states its limits rather than faking depth.

## Work Tree

- [ ] Phase 1: Reproduce + diagnose (gates everything)  <!-- status: impl tasks COMPLETE; outcome = COULD-NOT-REPRODUCE. Phase stays open: verification nodes pending, and P1's own gate blocks Phase 2 on operator input. -->
  **Observable outcomes:**
  - CLI: `pnpm tauri:dev` builds and launches; the MCP bridge attaches on 127.0.0.1:9223
    (`mcp__tauri__driver_session{start, port:9223}` returns a session).
  - Browser: with a scratch file open in the editor, `webview_execute_js` reads the minimap canvas
    (`document.querySelector(".cm-minimap-narrow.cm-minimap-gutter canvas")`) and returns a non-null
    element with `width > 0` and `height > 0` — i.e. a baseline render exists to compare against.
  - Browser (**source A — external disk change**): after the file is modified on disk and reloaded,
    a captured canvas fingerprint (`canvas.toDataURL()` hash, or a pixel-count of non-background
    pixels) is recorded BEFORE and AFTER. The pair is recorded verbatim as the reproduction
    evidence — **identical hashes = stale (bug reproduced); different = not stale on this source**.
  - Browser (**source B — local typing**): the same before/after fingerprint pair is captured for a
    doc change made via a CM6 dispatch into the live view. Recorded the same way.
  - CLI: the verdict for BOTH sources is written into this WIP file under `## Reproduction result`
    as `source A: stale | not stale` + `source B: stale | not stale`, each with its hash pair. A
    phase cannot pass with a source left unrecorded.
  - Console: no JS errors in the webview during either capture (`webview_execute_js` reading a
    collected error array returns empty) — an exception during render would be a different bug and
    must not be silently attributed to staleness.
  - [x] P1.1 Launch the app + attach the bridge; open a scratch file (`tmp/scratch/scratch-a`) with
        enough lines that the minimap has visible content. Capture the baseline canvas fingerprint.
        <!-- status: done — baseline `78a9bcba`/ink 47124, gutter 68px, canvas 106×1085 -->
  - [x] P1.2 **Source A (external disk change):** modify the file on disk from the shell, let the
        editor's reload path pick it up, confirm the *document text* updated (this is the control —
        the SURFACE asserts text is correct; if text is ALSO stale the bug is not the minimap and
        the WP re-scopes), then re-capture the fingerprint. Record the pair.
        <!-- status: done — recipes 4/5/6, NOT stale -->
  - [x] P1.3 **Source B (local typing):** dispatch a doc change into the live `EditorView`, confirm
        the text updated, re-capture the fingerprint. Record the pair. **If B is also stale, the
        minimap is not tracking the doc at all and the fix target is broader than the reload path —
        say so explicitly in the record.** <!-- status: done — recipes 2/7, NOT stale -->
  - [x] P1.4 Diagnose against whichever source(s) reproduced, starting from the confirmed suspect
        (`showMinimap.compute([], …)`) **but not assuming it is sufficient** — the plan-time read
        above shows the package's `TextState` tracks `docChanged` independently. Instrument the
        live plugin if needed (per `debug-empirical-telemetry`: is `minimapClass.update` firing? is
        `TextState.shouldUpdate` returning true? does `render()` run and paint?). Name the
        mechanism, with the evidence that implicates it, in `## Diagnosis`.
        <!-- status: done — suspect EXONERATED as sufficient cause; no mechanism named because
             nothing reproduced. See ## Diagnosis. -->
  - [x] P1.5 **Re-scope gate.** With the mechanism named, restate WP2's size (WBS says S–M) and
        confirm Phase 2's fix target. If the diagnosis implicates shared machinery the roadmap
        cleared (the reload path) or something outside the editor, STOP and surface it rather than
        widening silently.
        <!-- status: done — GATE HELD. No mechanism ⇒ no valid Phase 2 target. Phase 2 is BLOCKED
             pending operator input on the exact conditions (5 questions in ## Diagnosis). -->
  - [ ] **BLOCKED: Phase 2 depends on operator answers — the defect does not reproduce**
        <!-- status: BLOCKED: depends on operator input (Phase 1 could-not-reproduce) -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 2: Fix + pin  <!-- status: NOT-STARTED; depends on Phase 1 -->
  **Observable outcomes:**
  - CLI: `pnpm test` exits 0 with a NEW test that encodes the reproduction — and that test is
    **mutation-proven**: reverting the fix (or mutating the fixed line) makes it FAIL, and that
    failing run is recorded in this WIP file. A green test that cannot go red is not a pin.
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0 (never `pnpm exec tsc` — it silently exits 0,
    per `[[pnpm-exec-shadows-local-binaries]]`); `pnpm lint` exits 0 errors;
    `pnpm format:check` exits 0 (last session it went red one commit after being fixed — keep it
    green as an explicit criterion); `pnpm vite build` exits 0.
  - Browser: repeating Phase 1's capture on the source(s) that reproduced now yields **different**
    before/after fingerprints — the minimap tracks the buffer. Both sources are re-checked, not
    just the one that was fixed.
  - Browser: `document.querySelector(".cm-minimap-narrow.cm-minimap-gutter")` is still present
    after the fix and its computed width is 68px — the WP11 clip did not regress. Asserted as a
    live computed value, not inferred from the CSS file.
  - CLI: a check pins the `cm-minimap-narrow` class through the fix (so a future container change
    cannot silently drop it) — mutation-proven like the reproduction test.
  - [ ] P2.1 Write the failing test encoding the reproduction (**red first**). Assert an observable
        value, not `?raw` source text. If the honest pin is narrower than a full render (e.g. a
        pure function or a facet/extension-shape assertion) because no component-render harness
        exists, state that limit in the test's comment rather than overclaiming.
        <!-- status: NOT-STARTED -->
  - [ ] P2.2 Apply the fix to the mechanism Phase 1 implicated — **not** to the suspect Phase 1
        exonerated. <!-- status: NOT-STARTED -->
  - [ ] P2.3 Preserve `cm-minimap-narrow` (mandatory if the container is recreated) and add its
        pin. <!-- status: NOT-STARTED -->
  - [ ] P2.4 Mutation-prove every new guard: revert/mutate, watch it fail, restore, watch it pass.
        Record each mutation + its catch in this WIP file. <!-- status: NOT-STARTED -->
  - [ ] P2.5 Re-run Phase 1's live capture on both sources; record the new fingerprint pairs beside
        the originals. <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 1 > P1.5 (re-scope gate) — **REPRODUCED in round 2; mechanism named**
- **Active scope:** none — Phase 2 attempt 1 failed and was reverted; awaiting an operator call
- **Blocked:** Phase 2 — `BLOCKED: option (2) is larger than scoped`. The geometry port works and is
  proven correct in isolation, but a complete fix also requires rewriting `drawLine` to render
  wrapped segments across rows. See "ATTEMPT 1" above.
- **Unvisited:** Phase 2 — unblocks on the scope decision below.

## Phase 2 status — the honest position after attempt 1

Options (1) clamp and (3) disable-under-wrap were rejected by the operator; option (2) was chosen and
attempted. **Attempt 1 proved the geometry half is correct and insufficient.** What remains:

- **(2a) Finish it properly** — port the geometry (done, reverted, recoverable) *and* rewrite
  `text.ts`'s `drawLine` to emit each line's wrapped segments as separate rows. This is the real fix
  and would be worth upstreaming to issue #1. Cost is well beyond this WP's S–M sizing — it is the
  work that stalled upstream for three years, and the branch's own TODO flags an unsolved
  measurement problem for off-viewport lines.
- **(2b) Re-scope WP2 out of M11.5** into its own feature-sized item, sized honestly, since the
  bucket's stated value is that it stays tight.
- **(2c) Reconsider (3)** — disable the minimap when wrap is ON. Previously rejected, but it is worth
  re-offering now that the true cost of (2) is measured rather than estimated.

**Recommendation: (2b)** — the diagnosis, the research, and a proven-correct geometry half are all
banked in this file, so re-opening it later is cheap. Grinding a `text.ts` rewrite inside a QoL
bucket would push out WP3 and the deadline-bearing WP4.
- **⚠️ WP re-scope:** the SURFACE's title/summary ("stale on file update") is **wrong** and must be
  rewritten to the proven symptom (minimap stops painting partway down when soft-wrap is ON and the
  document exceeds one canvas). Round 1 proved the freshness axis is fine. Also fold in the WBS's
  Finding 2 — it is now settled: the `compute([])` suspect is exonerated.
- **Open discoveries:** 1 — the unfocused-window text-reload timing observation, low-confidence
  (see `## Discoveries`)

## ✅ REPRODUCED 2026-08-01 (round 2, after operator screenshot) — and it is a DIFFERENT BUG

**The SURFACE's framing was wrong, and that is why round 1 found nothing.** The reported title says
"stale on file update" — content that fails to refresh. The operator's screenshot shows something
else entirely: the minimap **stops painting partway down** and leaves a blank tail, while the editor
still has content below. Nothing is stale; a *region* is simply never drawn. Round 1 chased
freshness (7 recipes, all correctly NOT stale) because that is what the SURFACE described.

**Operator's words: "It was blank, not stale content."**

### The reproduction (live, measured)

Conditions — `CLAUDE.md` (303 source lines) in the claudesk project, **soft-wrap ON**, scrolled to
85%. Canvas scanned in 32px bands and counted for ink:

| Condition | Blank bands | Verdict |
|---|---|---|
| wrap **ON**, scrolled 85% | **3 of 34 (9% of canvas empty)** | **BUG REPRODUCED** |
| wrap **OFF**, same file, same 85% | **0 of 34** | fully painted — no bug |

**The wrap dependency is the discriminator, and it is a clean A/B on one variable.**

### Why round 1's 7 recipes could not have found it

Every round-1 recipe used a 120–500 line **unwrapped** file whose entire document fitted inside one
canvas paint window (`totalHeight <= canvasHeight`), making the scroll-offset math a no-op. The bug
only exists when the document **exceeds** one canvas AND wrap inflates the on-screen height. Round 1
never scrolled a wrapped long file — it was testing the wrong axis because it was given the wrong
symptom. *(Lesson: the round-1 method was sound; its inputs came from a mis-stated symptom. A single
operator screenshot re-scoped the WP in one step — worth more than a 7th recipe.)*

## Round-1 record (retained — the freshness axis IS proven correct)

**COULD NOT REPRODUCE — 7 recipes, both sources, neither stale.** Run 2026-08-01 against the live
app (`pnpm tauri:dev`, PID 19136) via the MCP bridge, file open from `tmp/scratch/scratch-a`.

**Method.** A canvas fingerprint of the real minimap — `getImageData` over
`.cm-minimap-narrow.cm-minimap-gutter canvas`, reduced to an ink-pixel count + a rolling hash.
**Calibrated, not assumed:** the fingerprint was proven to *move* on a known-good change and to
*return exactly* to its prior value when the edit was undone (`78a9bcba`/47124 → `a64391ae`/31878 →
`78a9bcba`/47124). So identical hashes genuinely mean identical pixels, and a "not stale" verdict
cannot be vacuous.

| # | Recipe | Doc changed? | Minimap fingerprint | Verdict |
|---|---|---|---|---|
| 1 | Baseline, 120 dense lines | — | `78a9bcba` ink 47124 | reference |
| 2 | **Source B — local typing** (dispatch, 40 lines dense→sparse) | yes | `78a9bcba`→`a64391ae`, ink 47124→31878 | **NOT stale** |
| 3 | Undo back to baseline | yes | returns to `78a9bcba`/47124 exactly | calibration ✓ |
| 4 | **Source A — external disk change**, same content as #2 | yes | →`a64391ae`/31878 — *identical* to the typed result | **NOT stale** |
| 5 | Disk change growing 120→500 lines (line-count change) | yes (501) | →`efd5fbc7`, ink 110568 | **NOT stale** |
| 6 | Disk change while Editor tab **hidden**, then switch back (H1 remount) | yes | →`ebeba328`, ink 3252 | **NOT stale** |
| 7 | **Split panes** (2 views, 2 minimaps), typing into pane 0 | yes | both →`7f35f1a9`, ink 1416→48144 | **NOT stale** |

- **source A (external disk change): NOT STALE** (recipes 4, 5, 6)
- **source B (local typing): NOT STALE** (recipes 2, 7)

**⚠️ Self-correction on recipes 6–7 (found at teardown, recorded rather than buried).** The
"document text did not reload" observation in recipes 6–7 is **partly an artifact of my own test
error**: the shell's cwd had reset between commands, so the 300-line `CCCC` write landed in the repo
root instead of `tmp/scratch/scratch-a/` — the app was correctly watching a file I had stopped
modifying. Two consequences, stated plainly:
- **The NOT-STALE verdicts still stand.** Recipes 6 and 7 each contain a *confirmed* doc change
  observed in the DOM (recipe 6: reload to `.` content, ink→3252; recipe 7: typing, ink→48144), and
  the minimap tracked both. The fingerprints are evidence of what the minimap did *given a doc
  change that demonstrably happened*, which is what those recipes were for.
- **The focus/reload inference is WEAKER than first written** and must not be relied on. It may be
  wholly explained by the misdirected write. The backlog entry
  `SURFACE-2026-08-01-EDITOR-DISK-RELOAD-WAITS-FOR-REAL-WINDOW-FOCUS` is filed with this caveat and
  should be re-tested from scratch before anyone acts on it — it is a *maybe*, not a finding.

The minimap faithfully matched its own buffer throughout, and the SURFACE explicitly states the text
updates correctly — so nothing here is the reported bug either way.

## Diagnosis (round 2 — the real mechanism)

**Root cause: `@replit/codemirror-minimap`'s scroll model counts SOURCE lines, but the editor scrolls
in VISUAL lines. With soft-wrap on, those diverge, so the minimap runs out of lines to paint before
the editor runs out of content.**

The paint window comes from `canvasStartAndEndIndex()` (`dist/index.js:~1108`):

```js
const scrollPercent = scrollTop / (scrollHeight - clientHeight);   // EDITOR px — wrap-aware
const lineCount    = view.state.field(LinesState).length;          // SOURCE lines — wrap-blind
const totalHeight  = pTop + pBottom + lineCount * lineHeight;
const canvasTop    = Math.max(0, scrollPercent * (totalHeight - canvasHeight));
const startIndex   = Math.round(Math.max(0, canvasTop - pTop) / lineHeight);
const spaceForLines= Math.round((canvasHeight - offsetY) / lineHeight);
// caller: for (i = startIndex; i < endIndex; i++) { if (i >= lines.length) break; … }
```

`scrollPercent` is computed from the **wrap-aware** editor scroll height, while `totalHeight` is
built from the **wrap-blind** source-line count. Measured live at 85% scroll:

- `canvasHeight` = 1085px, `minimapLineHeight` = 3.85px (`editorLineHeight 15.4 / SizeRatio 4`)
- `totalHeight` = 303 × 3.85 = **1167px** — only **82px** more than the canvas
- so `canvasTop` advances just **69px**, giving `startIndex 18 → endIndex 300`
- but the editor scrolled 85% of **4545px** of real content

The minimap believes the document is 1167px tall; on screen (wrapped) it is ~4.3× that. So its window
barely moves, `endIndex` (300) hits the 303-line document end, the draw loop `break`s, and everything
below is left unpainted — the blank tail. Turn wrap off and `scrollHeight` collapses to the model's
assumption (25156px of *horizontal*-friendly single-line rows, uniform per source line), the ratio
holds, and the canvas paints fully — exactly what the A/B showed.

**This is an upstream package limitation, not a Claudesk coding error.** The package predates/ignores
`lineWrapping`. Claudesk turned it into a *visible* defect by shipping soft-wrap (M6 WP5) on a
minimap that cannot model it.

**⚠️ Our 68px `!important` clip is NOT the cause — but do not clear it yet.** It changes canvas
*width*, and every term above is a *height*. It stays a live suspect only for a horizontal variant
(content clipped left-of-68px), which is a separate question from the blank tail proven here.

### Fix options (for Phase 2 — needs an operator call, see below)

1. **Cap the scroll model to what it can paint** — clamp/rescale so `scrollPercent` maps onto the
   *paintable* range instead of overrunning the line count. Smallest change; keeps the package.
2. **Feed it visual lines** — make the minimap's line accounting wrap-aware (`view.viewportLineBlocks`
   / `lineBlockAt`). Correct in principle, but means patching or forking the package.
3. **Disable the minimap when wrap is ON** — honest and tiny: the two features are incompatible as
   built. Costs the minimap exactly where long prose files need it most.
4. **Live with it / drop the minimap for wrapped files.**

**✅ DECIDED 2026-08-01 (operator): option (2) — wrap-aware, as a LOCAL PATCH. Options (1) and (3)
explicitly REJECTED.** Not a fork: `pnpm patch` against our pinned `@replit/codemirror-minimap@0.5.2`
(MIT). Rationale for the rejections, recorded so a future reader does not re-propose them:
- **(1) clamp — rejected.** It would paint the full strip but at a *wrong scale*, so the minimap
  would misreport position instead of going blank. Trading an obvious defect for a subtle one is
  worse: the whole reason this bug matters is that a wrong nav aid beats no nav aid only when it is
  honest about being wrong.
- **(3) disable under wrap — rejected.** Wrapped long-prose files are exactly where a minimap earns
  its keep; removing it there guts the feature at its best use.

### Research findings that made (2) viable (2026-08-01)

The "fork or forget it" framing was wrong. **This is upstream issue #1 — "Bug: Support line
wrapping", open since 2023-04-23, filed by the maintainer.** His own words confirm our diagnosis:
*"Currently we assume lines do not wrap… We don't render the wrapped text/blocks on a new line."*
(Two sub-problems — overlay + scrolling — are struck through as fixed; **the rendering one, ours,
never was.**) Repo is alive (pushed 2026-07-17, 70 stars), so this is an unfinished feature, not
abandonware.

**Nothing published can be adopted** — checked exhaustively: `0.5.2` is already latest; the standalone
`codemirror-minimap@1.0.6` is **CM5-only** (`peer: codemirror >=5.15.0`, 2022);
`@oeyoews/codemirror-minimap@0.5.3` is a stale republish that is *behind* upstream with **zero** wrap
code; all 9 forks are drive-by mirrors (the single commit-ahead is a perf change); and **none of the
14 all-time PRs touches wrapping.**

**What we DO have: the maintainer's WIP branch `line-wrapping`** (sha `e5841a8`, 2023-06-22) —
**141 added / 60 removed across 2 source files**, and it validates the diagnosis line-for-line. Core
substitution (the exact unit mismatch measured above):

```diff
- const totalHeight = pTop + pBottom + lineCount * lineHeight;   // wrap-BLIND source lines
+ const totalHeight = this.view.contentHeight / Scale.SizeRatio; // wrap-AWARE real height
```

plus per-line advance via `view.lineBlockAt(doc.line(i).from).height / Scale.SizeRatio` instead of a
flat `lineHeight`, and `lineBlockAtHeight(heightAtTop)` to choose the start line. `contentHeight` is
CM6 public API and is the authoritative wrapped height — the correct denominator.

**⚠️ Scope discipline — do NOT adopt the branch wholesale.** It is **13 commits behind** and its own
commit message lists what is unfinished: *"Overscroll seems to be off · When out of viewport we can't
measure posAtCoords, so we'll need some kind of estimation · Selection & Diagnostics don't work
yet."* Taking it whole would trade a blank tail for broken selection/diagnostic marks. **Port only
the blank-tail geometry** (the three changes above); leave selection + diagnostics on today's
behavior. Their correctness under wrap is a *pre-existing* condition, not a regression we introduce —
but Phase 2 must verify we did not make them worse.

**Sources:** upstream issue #1; branch compare `main...line-wrapping`; npm registry + tarball
inspection of both alternative packages; `gh api` fork compares. All checked 2026-08-01.

### ⚠️ ATTEMPT 1 — geometry-only patch: BUILT, MEASURED, FAILED, REVERTED (2026-08-01)

**Status: reverted to pristine.** No patch remains on disk; `patches/` removed,
`pnpm-workspace.yaml` entry removed, lockfile clean, `node_modules` verified unpatched.

**What was built** (via `pnpm patch`, both `dist/index.js` + `dist/index.cjs`): the three coupled
geometry changes — `totalHeight ← view.contentHeight / SizeRatio`; `startIndex` chosen by
`lineBlockAtHeight()`; and the flat per-line budget replaced by a loop that advances by each line's
real `lineBlockAt(...).height` and terminates on accumulated height.

**Result: worse, not better — the minimap rendered essentially blank at every scroll position.**

**Why — the finding that matters.** Instrumenting the live loop showed the *geometry is correct*:
`startIndex 198` is in range, and the loop draws 18 lines to fill `canvasHeight 1085`. The failure is
downstream. Measured advances for consecutive lines at that position:

| line | block height | advance (÷ SizeRatio) |
|---|---|---|
| 199 | 715px | **178.7** |
| 200 | 15px | 3.8 |
| 203 | 675px | 168.8 |
| 204 | 870px | **217.5** |

`drawLine()` paints each source line as **one ~4px row of text**, but the cursor now advances by the
line's *true wrapped* height (up to 217px). So the canvas is mostly empty space between thin slivers
of text — the geometry says "this line occupies 217px" while the renderer draws 4px of it.

**Conclusion: the geometry port is necessary but NOT sufficient.** A correct fix must also make
`drawLine` emit the wrapped *segments* of a line across multiple rows — which is precisely the part
the upstream maintainer left unfinished (*"This is pretty close, now we need to wrap the actual
elements"*, and the branch's own TODO *"When out of viewport we can't measure posAtCoords, so we'll
need some kind of estimation"*). That is a rewrite of `text.ts`'s line-drawing path, not a
geometry tweak — materially larger than this WP's S–M sizing, and the reason upstream stalled for
3 years.

**This is a decision point, not a build step** — see `## Phase 2 status` below.

## Round-1 diagnosis (retained — still valid on the freshness axis)

**The roadmap's prime suspect is EXONERATED as a sufficient cause, and the plan-time static read
predicted exactly this.** `showMinimap.compute([], …)` (`editorExtensions.ts:217`) does freeze the
facet *value*, but in `@replit/codemirror-minimap@0.5.2` the content path never consults it:

- `minimapClass` (`dist/index.js:~1032`) is a `ViewPlugin` whose `update()` calls
  `text.update(update)` → `render()` on **every** update while the facet is non-null — it gates on
  the facet being *present*, not on it having *changed*.
- `TextState.shouldUpdate` (`~656`) returns `true` on `update.docChanged`, independent of
  `showMinimap`.

So a frozen config does not prevent content re-render — which is what all 7 recipes then confirmed
empirically. **Finding 2's caution was correct and load-bearing: had the WP trusted the roadmap's
static inference, it would have "fixed" a non-cause, shipped a no-op, and closed a live bug.**

**What this means for the fix.** There is no confirmed mechanism to fix. Phase 2 (fix + pin) has no
valid target and must not proceed on a guess — writing a red test for a defect that does not
reproduce would either be vacuous or would pin the wrong behavior. **The honest next step is
operator input on the exact conditions**, not more agent-side improvisation (7 recipes is the point
where continuing becomes guessing).

**Questions only the operator can answer** (each one re-scopes the WP):
1. Which change source was it — CC editing the file, or your own typing?
2. Was the file open in a **split pane**, and was it the focused pane?
3. Did the minimap show *stale content*, or was it *blank/absent*? (A blank minimap is a different
   failure — the 68px `!important` clip in `App.css:2129` is a live suspect for that shape and was
   NOT ruled out here, since every recipe rendered ink.)
4. Roughly how large was the file? (All recipes were 120–500 lines.)
5. Did it recover on its own — on scroll, tab switch, or reopening the file?

**Still-unruled-out hypotheses** (kept live for a re-entry, none reproduced):
- **H2 (canvas/render geometry)** — `render()` sizes the canvas from `getWidth()` and
  `view.dom.getBoundingClientRect().height`; our WP11 68px `!important` clip fights the package's
  inline width. A zero/odd-height container (collapsed pane, hidden tab at mount time) could paint
  nothing. Recipe 6 probed the hidden case and passed, but not every collapse geometry was covered.
  Also noted while reading: `render()` calls `context.restore()` with no matching `save()` in that
  function — harmless in the paths exercised, but recorded since a stack imbalance is a plausible
  source of an intermittent paint fault.
- **Large-file / idle-callback path** — `TextState.update` cancels and re-schedules highlighting via
  `requestIdleCallback`; a much larger file than tested could plausibly leave a render pending.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-01] Phase 1 / P1.2 — An external disk change made while the Claudesk window lacks
real OS focus does not reload the editor's document text until focus returns; synthetic
`focus`/`visibilitychange` events do not trigger the check. Not the WP2 bug (the minimap matched its
own buffer throughout, and the SURFACE states text updates correctly), and deliberately not pursued —
the roadmap clears the reload path as not-suspect and it is shared machinery. Logged as
`SURFACE-2026-08-01-EDITOR-DISK-RELOAD-WAITS-FOR-REAL-WINDOW-FOCUS`.
