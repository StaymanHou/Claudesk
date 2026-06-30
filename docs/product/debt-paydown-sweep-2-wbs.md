---
shape: temporary-wbs
cycle: between-M8-and-M9
created: 2026-06-30
status: in-progress (WP1 ✓, WP2 ✓, WP3 ✓, WP4 ✓ — 2026-06-30; WP5 remaining)
parent-backlog: workflow/backlog-quality-findings.md (+ workflow/backlog.md)
drive-mode: autopilot
---

# Debt-Paydown Sweep #2 — Full Rule-1 Reconciliation

> **THIS IS NOT A ROADMAP MILESTONE.** It reserves no milestone number, touches no
> roadmap sequence (M1–M8 complete; this is between-M8-and-M9). It is a temporary WBS,
> driven via the normal `/feature-refactor` and `/task-*` loops, and **deleted on
> completion** (fold-back-and-delete — see §Completion).

## Why this sweep exists

Sweep #1 (2026-06-30, commits `cd012e9..db60081`) *claimed* Rule 1 ("cheap + safe →
ALWAYS Sweep, no exception") but only themed a **subset** of the findings — it never
fanned out across the whole backlog. So a chunk of genuinely XS/zero-risk findings were
never swept, AND a set of findings are now **fixed-in-code but still marked pending** (the
CHANGELOG's "Backlog resolved" lines used the cleanup-task's *own* SURFACE IDs, which
differ from the quality-file finding IDs, so the originals were never closed).

Sweep #2 is the **Full Rule-1 reconciliation**: inventory ALL 114 surviving quality
findings, score each against the disposition model, then (A) delete already-fixed-in-code
duplicates + dead history, (B) sweep every true XS/zero-risk leftover, (C) leave only
genuinely-deferred anchors, (D) bury the meh-zone, with the operator-ruled Discuss items
folded in.

## Disposition model (reused from sweep #1 — apply consistently)

Three axes → five actions:
- **Impact** = feature value + maintainability (= quality × P(future-touch)). Closing a
  backlog entry de-clutters → de-clutter is itself an impact term.
- **Effort** = benchmarked against this project's archived units (M2–M8 full milestones).
  By that scale every finding here is **XS/S** — intentional; Rule 1 catches most.
- **Risk** = P(breaks something the suite won't catch). Suite-relative.

**Rule 1 (no exception):** low-effort + low-risk → ALWAYS Sweep. Tiebreak: Rule 1 beats
the impact calc (de-clutter). Severity is an INPUT to impact, not a parallel sort key.
**Messy middle:** high-effort+high-impact OR high-risk+any → Discuss; low-impact+med-effort+low-risk → Bury.

## Inventory tally (reconciles to 114 ✓)

| Bucket | Count | Action |
|---|---|---|
| **A** — already-fixed / dead history | 28 | Delete (bookkeeping, 0 code) |
| **B** — XS/zero-risk leftovers | 50 | Sweep (3 themes) |
| **C** — genuinely-deferred anchors | 12 | Defer/keep (untouched) |
| **D** — messy middle | 24 | Bury ~17 / Discuss-ruled ~7 |

**Operator Discuss rulings (2026-06-30):**
- **WP5 file-op failure surfacing** (delete/trash/create-collision silent) → **DEFER** as one
  anchored backlog item ("file-op error surface" — net-new UX). Honor the existing
  "intentionally deferred — new UX" comments. No code, no new comment.
- **Backend polish in load-bearing paths** (`resolve_cwd` strlen-proxy, id===sessionId seam,
  m2-wp9 concurrency windows) → **REFACTOR the logic** (apply the real-logic forms). High-risk
  trigger fired → isolated into WP5, sorted LAST, individually verify-tested.

---

## Work Packages (priority/risk-ordered: deletions → low-risk → high-risk; effort gates, doesn't sort)

### WP1 — Delete stale + dead-history findings  `[impact: declutter · effort: XS · risk: none]`
**Type:** `/task-plan` (pure bookkeeping — NO code change; edits only the backlog file).
Delete 28 finding headers from `backlog-quality-findings.md`:
- **A-i (7 stale-vs-sweep#1, verified fixed in code):** `WP4-THIRD-ZOOM-MODULE-COPY`
  (→ `makeFontZoom` factory), `WP7-THIRD-RESOLVE-DATA-DIR-COPY` (→ `pub(crate) resolve_data_dir`),
  `WP3-DUP-MIRROR-INTERVAL-CONST`, `WP3-LISTEN-BOILERPLATE-DUP` (→ `useTauriListen`),
  `WP5-TERMINAL-SEAM-UNTESTED` (→ JSX slot + `terminalSlotGuard.test.ts`), the snippet half
  of `WP6-MINORS` (→ `snippetFor` threading), the `PROJECTS-FILE-DUP` sub-finding of the
  dev-prod block.
- **A-ii (21 inside `> ALL RESOLVED 2026-06-17` blocks — dead history):** the wp1-tauri-scaffold
  (9), wp2-cc-pty-probe (4), wp3-sublime-cli-probe (6), wp4-thumbnail (2) groups.
- Also drop the 3rd M7 finding (`APPLY-UPDATE` comment, fixed sweep#1 WP5) — it lives only in
  the backlog.md pointer, not a `##` header; reconcile that pointer.
- Each header that has a *partner* sub-finding still pending (e.g. the dev-prod block) keeps the
  surviving sub-findings — delete only the resolved sub-bullet, not the whole header.

**Resolves:** 28 findings closed by deletion.

### WP2 — Comment/doc copyedit sweep (Theme B1)  `[impact: declutter+readability · effort: S · risk: very-low]`
**Type:** `/feature-refactor` (comment-only pass — NO logic change).
~33 pure-comment/doc nits across frontend + backend. Representative set: `WP10-SHARED-KEY-LAG-COMMENT`,
`WP8-COMMENT-COPYEDIT-SLIP`, `WP8-FALLBACK-COUPLING`, `WP5B-GUARD-PARITY-COMMENT`,
`WP5-NEWFILE-BLUR-DISCARDS`, `WP1-DOCSREF-FORWARD-REF-COMMENT`, `WP1-OVERNARRATED-X-COMMENT`,
`WP9-CLASSIFY-CASEFOLD-COMMENT`, `WP3-PROBE-SECTION-SHORTHAND`, `WP6-DOC-WRAP-NIT` (re-wrap 102-char
line), `WP6-SYMLINK-SKIP-UNDOCUMENTED`, `WP6-DETECTED-BIG-SYSCALL-COST`, `WP5-CLOSED-OVER-FLAG-INVARIANT`,
`WP5-TITLE-STATE-VS-ACTION`, `WP3A-MOD-R-COMMENT-OVERSELL`, `WP3C-MIDDLE-CLOSE-INDEX-COMMENT`,
`WP3C-REDUNDANT-JSX-COMMENT`, `WP2-SAVEKEYMAP-CHURN`, `WP2-LANGUAGE-TEST-SPECULATIVE-COMMENT`,
`WP3A-MOD-D-DOUBLE-BIND`, `WP5-GLOBAL-H1-RULE`, `WP3-INTRA-FEATURE-PHASE-COMMENTS`,
`WP3-APP-GLOBAL-STATE-PROSE`, `WP3-EFFECTIVERAIL-DOCSTRING-GUARANTEES`,
`WP3-REFIT-NUDGE-LEFT-ONLY-ASYMMETRY`, `WP7-DOUBLE-CC-YOLO-SUBSCRIBE`, `WP7-MENU-WRITE-FAILURE-SILENT`
(comment form — the toast form is the not-recommended branch), `WP6-DRAG-CLICK-BOUNDARY-IMPLICIT`,
`DEVPROD-BASENAME-SPACE-ASSUMPTION`, `DEVPROD-OVERLAY-WINDOW-SIZE-COUPLING`, `WP6-DOT-BOUNDARY-RATIONALE`,
`M7-TRAY-ID-UNUSED-LOOKUP` (comment on `TRAY_ID`), `M5-WP2-LINGERING-ALLOW-UNUSED-MUT` (track-only),
`APPMENU-LABEL-ONLY-ID-COMMENT` (one-line comment — the MAJOR contract is already pinned).
- **Verify-self:** `tsc --noEmit`, `eslint`, `cargo build`/clippy, `rustdoc -D broken_intra_doc_links`.
  Comment-only ⇒ no behavior to verify; green compile + lint is the bar.

**Resolves:** ~33 findings.

### WP3 — Tiny-logic + test-hygiene sweep (Themes B2 + B3)  `[impact: declutter+a11y · effort: S · risk: low]`
**Type:** `/feature-refactor` (small real-logic changes, suite-covered).
**B2 tiny-logic (~11):** `WP7-FORIN-NO-HASOWNPROPERTY` (`for..in`→`Object.keys`),
`WP9-LEN-WITHOUT-IS-EMPTY`, `WP4-BGIDS-JOIN-SPLIT-ROUNDTRIP` (memoize id array),
`WP4-ACTIVE-PILL-NOOP-PROMOTE` (no-op guard), **`WP3-OFFVIEWPORT-A11Y` (add `inert` to hidden
branch — the highest-value B item: real focus-leak fix)**, `WP3-TICKER-EFFECT-DUAL-RESPONSIBILITY`
(split clear into own effect — pairs with BGIDS, same ticker), `WP4-DEAD-UNTRACKED-OPTS-STAGED`,
`WP4-COMMIT-DIFF-GATE-TERNARIES` (derive single `commitReady`), `M7-TRAY-ID-MATCH-DUP` (collapse
predicate+match), `WP3A-MOD-D-DOUBLE-BIND` (if not folded to B1), `WP5-XTERMPANE-EFFECT-DEP`.
**B3 test-hygiene (~6):** `WP3-OVERBROAD-NEWLINE-GUARD`, `WP4POLISH-USEMEMO-DEP`,
`WP4POLISH-DOUBLE-PREDICATE`, `WP8-REDUNDANT-COLLAPSE-DEP`, the `measure.sh` probe nits
(`WP1-MEASURE-*` — dismiss-or-leave as the probe is archived).
- **Verify-self:** `tsc`, `eslint`, `vite build`, full Vitest + `cargo test`/clippy. The a11y
  `inert` change is the one with observable behavior — confirm focus can't reach the hidden
  branch (add/extend a test if the existing suite doesn't cover it).

**Resolves:** ~17 findings.

### WP4 — Bury the meh-zone (Theme D-bury)  `[impact: declutter · effort: XS · risk: none]`
**Type:** `/task-plan` (bookkeeping — move to `workflow/backlog-archived.md`, remove from active).
~17 low-impact + med-effort + low-risk OR reviewer-flagged-dismiss findings:
`FSWATCH-REWALK-AMPLIFICATION`, `FSWATCH-EMIT-FAILURE-INVISIBLE`, `FSWATCH-ISDIR-FALSE`,
`WP5B-DESCENDANT-COUNT-STALE`, `WP7-CONSIDER-ARRAY-ALLOC`, `WP2-OVERLAY-ESC-PREVENTDEFAULT`,
`WP2-TOAST-SINGLE-SLOT-MULTIPLEX`, `WP3-UNDIFFED-MIRROR-EMIT`, `WP9-REDUNDANT-MODE-REREAD`,
`WP4POLISH-STICKY-ZINDEX-COUPLING`, `WP6-HOVER-COUPLES-KEYBOARD-CURSOR`,
`WP9-PLAN-IMPL-DRIFT-CCNOTFOUND` (ack-close), `M8WP3-EVAL-CLASSIC-SCRIPT-IN-TEST`,
`WP10-ESLINT-IGNORE-BUNDLED` (ack), `WP5-SPLIT-LISTENER-CROSSPOINTER` (verify the ⌘⇧O ref isn't
stale post-WP8 first; if stale, fold the fix into WP2 instead), `WP4-TRIGGER-ONCE-UNDERFLAGGED`
(comment touches a StrictMode invariant — bury as documented-WAI rather than risk the edit),
**`DEVPROD-OVERLAY-WINDOW-SIZE-COUPLING` (added at WP2 — the cheap comment-form is infeasible:
`tauri.dev.json` is strict JSON, a `//` comment breaks parsing; the remaining "track in a shared
place" fix is meh-zone)**.

**Resolves:** ~17 findings buried.

### WP5 — Backend-polish refactor in load-bearing paths (Discuss → REFACTOR ruling)  `[impact: maintainability · effort: S-M · risk: HIGH (suite-blind paths)]`
**Type:** `/feature-refactor` — **isolated, sorted LAST so all safe wins bank first.**
Operator ruled "Refactor the logic" despite the high-risk note. Apply the real-logic forms:
- `WP2-LONGEST-PREFIX-STRLEN-PROXY`: `resolve_cwd` `.max_by_key(|(r,_)| r.len())` →
  `Path::new(r).components().count()` (the stuck-dot fix path — `status_broadcaster/mod.rs:244`).
- `WP11-ENTRY-ID-SESSIONID-ALWAYS-EQUAL`: collapse `{id, sessionId}` → single field in
  `terminalList.ts` (the documented v1 seam).
- m2-wp9 concurrency MINORs: rework the `drain_backlog`/`cc_ready`/`mark_ready` lock scope
  (`cc_session/mod.rs`, `cc_session/commands.rs`).
- Also fold `WP2-RESOLVE-CWD-LINEAR-SCAN` (record-only — note it's accepted) here.
- **Verify each change individually.** Lean on existing `resolve_cwd_*` tests + concurrency
  tests; **add coverage for any new branch** the refactor creates (a fix that adds the missing
  test lowers its own risk — Rule 5). If a refactor can't be safely covered, fall back to the
  comment-only honest-documentation form for that one item and note it.

**Resolves:** ~4 findings.

---

## Scope — what's NOT swept (anchors intact)

These survive sweep #2 untouched, each anchored to its future home:

| ID | Anchor |
|----|--------|
| `SURFACE-2026-06-26-ABSORB-CLAUDE-TIME-INTO-CLAUDESK` | M9 |
| `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` | M9 startup-trim |
| `SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE` | M9 (backend-broadcast pattern) |
| `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY` | M10 docs-viewer |
| `SURFACE-2026-06-27-M5-INSTALLED-BUILD-VERIFY-DEFERRED-TO-RELEASE` | next `/release` gate |
| `SURFACE-2026-06-26-MCP-BRIDGE-RELEASE-ACL-STRINGS` | release-gate |
| `SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED-AT-SESSION-START` | cosmetic carry-forward |
| `SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE` | net-new feature |
| `SURFACE-2026-06-19-QUALITY-WP2-RESOLVE-WITHIN-LEAF-SYMLINK` | D2 hardening (docs DONE) |
| `SURFACE-2026-06-19-QUALITY-WP2-BACKEND-TRUSTS-FRONTEND-ROOT` | D2 hardening (docs DONE) |
| `WP1-APP-WIRING-UNTESTED` | RTL/E2E adoption (Phase-1 manual-host convention) |
| `APPMENU-LISTENER-NOT-EXTRACTED` | defer unless the listener grows |
| **NEW (this sweep's Discuss ruling): file-op error surface** | future error-surface feature — `WP5-DELETE-FAILURE-NOT-SURFACED`, `WP5B-TRASH-FAILURE-NOT-SURFACED`, `WP5-CREATE-COLLISION-GITIGNORE` collapsed into one anchored Defer (net-new UX; existing code comments already say "intentionally deferred") |

Plus the standalone forward-look SURFACEs in `backlog.md` (net-new feature / informational /
already-reconciled-in-arch) are not part of the 114 and are untouched.

---

## Completion — fold-back-and-delete

When all 5 WPs are done:
1. Confirm each WP's findings are RESOLVED (closed-by-deletion for WP1/WP4; fixed-in-code for
   WP2/WP3/WP5). The `/feature-refactor` + `/task-close` loops auto-append `CHANGELOG.md`
   "Backlog resolved" lines + prune the closed entries.
2. Write the NEW "file-op error surface" Defer anchor into `backlog.md` (the Discuss ruling).
3. Execute the WP4 Bury moves into `workflow/backlog-archived.md`.
4. Verify `backlog-quality-findings.md` now contains ONLY category-C anchors (should drop from
   114 to ~12 findings).
5. **Delete this WBS file** (`docs/product/debt-paydown-sweep-2-wbs.md`) — it reserves no roadmap
   slot. CHANGELOG.md + git history are the durable record.
6. Confirm with the operator whether to push (the 13 sweep#1 commits + sweep#2 commits are all
   still unpushed as of resume — operator said "don't push yet").
