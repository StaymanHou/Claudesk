# Feature: Mirror fills from the bottom (filmstrip + PiP)

**Workflow:** feature
**State:** Completed 2026-07-06 (shipped 99aca94; finalized)
**Created:** 2026-07-06
**Drive mode:** autopilot
**Backlog anchor:** SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED-AT-SESSION-START

## Problem Statement

In a filmstrip tile's (and the PiP panel's) live ~1 fps `serializeAsHTML()` mirror of a
background workspace's CC terminal, the **CC banner + first ~10–20 lines of a fresh session
are occluded by the tile's project-name + status-dot header row** (top of the tile). Root
cause: `serializeAsHTML({ scrollback: 40 })` emits the FULL active screen (~40 rows) even when
only ~10–20 rows have real content — the trailing rows are blank. The mirror node is
bottom-anchored (`.filmstrip-tile-mirror` / `.pip-tile-mirror`: `bottom:0; transform-origin:
bottom-left`), so anchoring a block whose *last* rows are blank pushes the real (top) content up
to the tile's top edge, under the header overlay. The existing anchor handles "tall block tails
to newest"; it does NOT handle "sparse block → real content should sit at the bottom." **Desired:
fill from the bottom first** — short content bottom-anchors (sits at the tile's bottom edge and
grows UPWARD, clear of the header), then tails normally once real output overflows the viewport.

**Fix seam (shared — covers both surfaces in one change):** trim trailing blank rows from the
`serializeAsHTML()` HTML string before it enters the shared `mirrorFrame`. The single serialize
call site is the serializer thunk registered in `XtermPane.tsx` (`registerTerminalSerializer`);
`useMirrorTicker` reads it once and feeds BOTH the filmstrip (`readMirrorFrame`) and the PiP
(`pip-mirror` emit). Trimming there means the filmstrip and PiP tiles both receive an
already-trimmed block whose last row is real content, so the existing bottom-anchor CSS then
places content at the tile bottom on BOTH surfaces with zero per-surface change.

Bug-fix note: entered directly (not via `/feature-reproduce`). Red-green is captured in this
plan's verify-codify anchor — a pure-logic vitest on the new trim function that fails on
un-trimmed input and passes after the fix. No separate reproduction pass is warranted for a
pure-string transform (the live visual is a verify-human/bridge observable, not a unit test).

## Work Tree

- [x] Phase 1: Trim trailing blank rows at the shared serialize seam  <!-- status: done -->

  **Observable outcomes:**
  - CLI (unit): `pnpm vitest run mirrorTrim` → a new `trimTrailingBlankRows()` test file passes;
    it asserts (a) a block with N content rows followed by M blank rows returns only the N content
    rows (last emitted row is non-blank), (b) a fully-populated block (no trailing blanks) is
    returned unchanged, (c) an all-blank/empty block returns empty (no throw), (d) whitespace-only
    trailing rows (spaces / `&nbsp;` / empty `<div></div>` / `<div><br></div>`) count as blank and
    are trimmed, (e) interior blank rows (a blank line BETWEEN content) are preserved.
  - CLI (unit): `pnpm vitest run mirrorTail` still passes — the serializer still calls
    `serializeAsHTML` with a POSITIVE `scrollback` and `includeGlobalBackground:true` (the trim
    wraps the call; it does not replace the tail semantics).
  - CLI (build/lint): `pnpm exec tsc --noEmit` → 0 errors; `pnpm lint` → 0 errors; `pnpm vite build`
    succeeds (no broken imports across XtermPane / the new module).
  - CLI (full suite): `pnpm vitest run` → all pre-existing tests still green (no regression); the
    new file adds ≥5 cases.
  - Browser/live (bridge or verify-human, carried): with a FRESH CC session open in a background
    filmstrip tile, the CC banner sits at the tile's BOTTOM edge and is fully visible (NOT clipped
    under the header row); as output grows past the tile height, the mirror tails the newest rows
    (unchanged tail behavior). The SAME is true in a PiP mirror layout (horizontal-mirror /
    vertical-mirror) for the same fresh session.
  - [x] P1.1 Add `src/components/workspace/mirrorTrim.ts` exporting a pure
    `trimTrailingBlankRows(html: string): string`. It parses the serialized block's row elements
    (xterm's `serializeAsHTML` emits one row per child node inside a wrapping `<pre>`/`<div>` — the
    existing `.filmstrip-tile-mirror pre, .filmstrip-tile-mirror div` CSS confirms the structure),
    drops trailing rows whose text content is empty/whitespace-only, and re-emits the block with the
    same wrapper + surviving rows. Preserves interior blank rows. Never throws on malformed input
    (returns the input unchanged if it can't parse rows). Pure string→string (no DOM/xterm import) so
    it's vitest-pinnable — parse via a regex/string split on the row-element boundary, matching how
    `mirrorTail.test.ts` already treats the serialized HTML as text. Document the row-element
    assumption + the "trailing-only, interior-preserved" contract in a header comment.  <!-- status: done -->
  - [x] P1.2 Wire the trim into the serializer thunk in `XtermPane.tsx`: wrap the existing
    `serialize.serializeAsHTML({ scrollback: 40, includeGlobalBackground: true })` return in
    `trimTrailingBlankRows(...)`. Single call site — this is the only place the mirror HTML is
    produced; `useMirrorTicker` → `mirrorFrame` → (filmstrip `readMirrorFrame` + PiP `pip-mirror`)
    all read downstream, so both surfaces inherit the trim. Update the adjacent comment (the
    "must TAIL the latest output" block ~L255) to note the trailing-blank trim + WHY (sparse fresh
    session content must bottom-anchor clear of the header). Do NOT touch the CSS anchor — the
    existing `bottom:0 + transform-origin:bottom-left` is correct once the block ends at real content.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; tsc 0 errors, eslint 0 errors (1 pre-existing warning L464), mirrorTrim+mirrorTail+terminalMirror 14/14 pass -->

  - [x] verify-self  <!-- status: done — agent-drivable slice PASS; live visual carried to verify-human. Detail:
        • CLI unit (mirrorTrim): 6/6 PASS — sparse→trimmed, fully-populated unchanged, all-blank safe (returns original), whitespace forms (spaces/&nbsp;/empty-span/<br>) trimmed, interior blanks preserved, malformed input unchanged.
        • CLI unit (mirrorTail): still PASS — serializer still calls serializeAsHTML with positive scrollback + includeGlobalBackground:true (trim wraps, doesn't replace).
        • Static gate: tsc --noEmit 0 errors; eslint 3 changed files 0 errors (1 pre-existing L464 warning); pnpm vite build OK (1.96s) — new import bundles into BOTH the main chunk (filmstrip) and pip- chunk (PiP).
        • Full suite: pnpm vitest run 800/800 pass, 81 files, 0 regressions (was 794; +6 mirrorTrim cases).
        • Wiring trace: the ONLY serializeAsHTML invocation in the mirror path is XtermPane:276 (now trim-wrapped); the trimmed thunk → registerTerminalSerializer → useMirrorTicker.serializeTerminal → setMirrorFrame → {Filmstrip readMirrorFrame + PiP pip-mirror emit}. Single seam feeds both surfaces — confirmed.
        • LIVE VISUAL (UNVERIFIED — carried to verify-human): "fresh sparse CC session banner sits at tile bottom, clear of header, on BOTH filmstrip + PiP mirror layouts; tails once output overflows." WKWebView visual observable needing a real spawned CC session + background-tile staging + pixel-position judgment — operator-eye per project verify-self convention; no app was running in-session. -->
  - [x] verify-human  <!-- status: done — operator approved all 4 live-visual checks 2026-07-06 ("all pass"). Integration boundary applied (XtermPane backs both mirror surfaces) so F11 skip was forbidden; operator drove the live checks on both surfaces. -->
    - [x] P1.verify-human.1 Filmstrip: fresh sparse background tile — banner at tile BOTTOM, clear of header  <!-- status: done -->
    - [x] P1.verify-human.2 Filmstrip: output past tile height still TAILS newest rows  <!-- status: done -->
    - [x] P1.verify-human.3 PiP (mirror layout): fresh sparse tile — banner at tile BOTTOM, clear of header  <!-- status: done -->
    - [x] P1.verify-human.4 Regression glance: no white bar / dark-on-white / other visual regression on either surface  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — coverage assessed sufficient + ONE structural guard added. mirrorTrim.test.ts (6 cases) already pins the trim contract; mirrorTail.test.ts pins the positive-scrollback tail. NEW: added a ?raw source-assertion guard to mirrorTail.test.ts pinning the single-seam contract (serializer thunk wraps serializeAsHTML in trimTrailingBlankRows + imports it) — catches an unwrap that would silently re-break BOTH surfaces with green unit tests (the same regression class the scrollback pin guards). Full suite 801/801 pass (was 800), no regressions, no triage. -->


## Code-Quality Review — mirror-fill-from-bottom

Reviewer: `code-quality-reviewer` subagent against ship commit `99aca94`. Result: **0 CRITICAL, 0 MAJOR, 3 MINOR.** MINOR #3 (count-drift typo) fixed in-place in the verify-self note above; MINORs #1 + #2 auto-backlogged (Mode 3) to `workflow/backlog-quality-findings.md`.

### Strengths
- Single-seam fix: the trim wraps the one `serializeAsHTML` call site (`XtermPane.tsx:274`), so filmstrip and PiP both inherit it downstream of `mirrorFrame` with zero per-surface change — minimal blast radius, correctly located at the shared choke point.
- Exemplary WHY-comments: the module header + inline `XtermPane.tsx` comment encode the non-obvious rationale (bottom-anchor + trailing-blank interaction, SURFACE anchor) rather than restating the code.
- Structural assumptions grounded + accurate: the documented `serializeAsHTML` output shape matches `@xterm/addon-serialize`'s `HTMLSerializeHandler` — verified against the vendored source (incl. the styled multi-span row case the non-greedy regex must survive).
- Fail-safe degradation: every structural-surprise path returns input unchanged + never throws → a future xterm markup change degrades to pre-fix behavior instead of blanking a live surface.
- The verify-codify `?raw` guard pins the single-seam contract (import + wrap present), catching the silent-unwrap regression class; co-exists correctly with the pre-existing scrollback pin.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [mirrorTrim.ts:77-92] Rebuild via `rows.match(ROW_RE)` + `.join("")` silently drops any inter-row text that isn't a `<div>…</div>` match. Safe today (`_rowEnd` emits rows contiguously), but the reconstruction is lossier than the prefix/suffix splice implies; the "return unchanged on surprise" contract mitigates *detected* structural changes, not this silent one. → auto-backlogged (add a one-line header note that reconstruction assumes zero inter-row content).
- [mirrorTrim.ts:32,36-37 + mirrorTrim.test.ts] Fixtures use the simple `<div><span>text</span></div>` row shape, but real styled cells produce intra-row `</span><span style='…'>` transitions — the regex handles it, but fixtures/comments under-represent the real shape. → auto-backlogged (add one styled-multi-span fixture).
- [count-drift typo] "was 780" vs "was 800" across WIP notes — **FIXED in-place** (corrected to "was 794; +6 cases").

### Assessment
Well-built, tightly-scoped bug fix: one pure, testable string transform at the single shared choke point, letting two consumers inherit the correction for free. Load-bearing structural assumption verified against the vendored xterm source. Fail-safe posture is the right disposition for a live display path. Advances the codebase rather than accruing debt; the WHY-comments and SURFACE-anchor threading are unusually good. Soft spots (fixture realism, undocumented lossy-reconstruction assumption) are both MINOR, neither warranting a refactor pass.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Current Node
- **Path:** Feature > review-quality (complete) → feature-finalize — all phases complete, ready to finalize
- **Active scope:** none (Phase 1 done: impl + all 5 verify nodes [x])
- **Blocked:** none
- **Unvisited:** none — single-phase feature complete
- **Open discoveries:** none

## Retrospect
- **What changed in our understanding:** The occlusion had a precise, already-diagnosed cause (the backlog root-cause note was correct): `serializeAsHTML` emits the full ~40-row active screen with trailing blanks, and bottom-anchoring a block whose *last* rows are blank pushes real content up under the header. The confirming detail was verifying against the vendored `@xterm/addon-serialize` `HTMLSerializeHandler` source that a blank cell is a literal space and each row is exactly one `<div><span>…</span></div>` — that structure is what made a pure string trim viable (vs. a DOM parse).
- **Assumptions that held:** The single-seam hypothesis was exactly right — trimming at the one serializer thunk in `XtermPane.tsx` covered BOTH the filmstrip and the PiP with zero per-surface change, because both read downstream of the shared `mirrorFrame`. No CSS change was needed; the existing bottom-anchor became correct once the block ends at real content. The string-based (not DOM-based) trim kept the function pure + vitest-pinnable, matching the repo's `mirrorTail.test.ts` `?raw` posture.
- **Assumptions that were wrong:** None material. One small self-inflicted friction: the initial all-blank test case asserted the wrong expectation (I'd expected the code to return an empty block; the cleaner behavior is to leave an all-blank block unchanged since there's no content to anchor) — resolved by making the all-blank path explicit in the code + fixing the test.
- **Approach delta:** Implemented as planned — single phase, `mirrorTrim.ts` + the XtermPane wrap. The only additions beyond the plan were reactive: the explicit all-blank short-circuit (from the failing test), and a verify-codify `?raw` single-seam guard in `mirrorTail.test.ts` (to catch a future unwrap that would silently re-break both surfaces with green unit tests).

## Communicate
> **Feature complete:** *Mirror fills from the bottom* has shipped. Fresh-session CC content in filmstrip + PiP live-mirror tiles now bottom-anchors at the tile edge (clear of the project-name/status-dot header) instead of being occluded, and still tails once output overflows. Verify by opening a workspace and glancing at its background filmstrip tile / a PiP mirror layout — the banner sits at the tile bottom, fully visible.

Requester = operator — closure notice for self-record. (Resolves the operator-reported `SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED-AT-SESSION-START`.)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- none
