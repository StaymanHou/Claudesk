// M11 WP4 — preserving the reader's scroll position across a live re-render.
//
// Resolves SURFACE-2026-07-07-DOCS-VIEWER-RELOAD-PRESERVE-SCROLL: the operator watches a
// `wip/*.md` update live while CC edits it, and a naive "re-read → replace content" reload
// snaps to the top — disruptive precisely in the case the panel is most useful for.
//
// ── ⚠️ The case that shapes this whole module: the panel can be display:none ─────
// `RightPanelHost` renders the docs slot with `display: panel === "docs" ? "flex" : "none"`,
// and panels stay MOUNTED when another panel is fronted (the panels-stay-mounted rule); the
// whole `.workspace-right` is display-none'd when the workspace is backgrounded. So a restore
// can be attempted while the scroll box has no layout at all.
//
// ⚠️ SHARPENED at WP5: the reaching path is NOT "an `fs-change` lands while hidden" — `DocsPanel`
// *skips* the reload while the panel is not front and replays it after re-fronting, when the box
// is measurable. The unmeasurable case is reached by a RACE (a reload that starts while front,
// then a panel switch during the `docs_list`→`docs_read` round trip) or by the workspace being
// backgrounded mid-flight. The looser old wording sent a WP5 experiment down the wrong path.
//
// In a real browser a zero-height box reports `scrollTop === 0` and *silently ignores* a
// write to it. A naive capture→refetch→restore therefore does the worst possible thing: it
// captures 0, restores nothing, and the reader — who was mid-document when they switched
// away — comes back to the top. Losing the position is bad; losing it only when you were not
// looking is worse, because it reads as random.
//
// So "is this box measurable right now?" is a first-class input, not an implementation
// detail, and an unmeasurable box means DEFER, never "restore to 0".
//
// ── Why the geometry is a VALUE and not read from the element in here ────────────
// ⚠️ jsdom reports `clientHeight === 0` for VISIBLE elements as much as hidden ones, so a
// module that sniffed it would be untestable for the one arm that matters — the "hidden" test
// would pass trivially, and pass just as happily with the logic inverted.
// (`docs/lessons/mcp-tauri-bridge-caveats.md` and `arch/right-panel-surfaces.md` carry the
// measurement; not restated here.)
//
// The split: `readGeometry(el)` is the one-line DOM read (verified live against a real
// WKWebView), and every DECISION below is a pure function of a `ScrollGeometry` value a test
// can set freely. The logic is fully exercised in vitest; only the read needs a browser.

/** A scroll box's measured geometry — the inputs every decision here depends on. */
export interface ScrollGeometry {
  /** Current scroll offset. */
  scrollTop: number;
  /** Visible height. `0` means the box has no layout (display:none, detached, collapsed). */
  clientHeight: number;
  /** Total content height. */
  scrollHeight: number;
}

/**
 * Read the geometry off a live element. The ONLY DOM-touching function in this module.
 *
 * Returns `null` for a missing element so callers handle "no box yet" and "box has no
 * layout" through the same `isMeasurable` path rather than two branches.
 */
export function readGeometry(el: HTMLElement | null): ScrollGeometry | null {
  if (el === null) return null;
  return {
    scrollTop: el.scrollTop,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  };
}

/**
 * Whether a box's geometry can be trusted for capture or restore.
 *
 * `clientHeight === 0` is the display:none / detached / collapsed signal. Reading `scrollTop`
 * off such a box yields 0 regardless of where the reader actually was, and writing to it does
 * nothing — so both directions must be gated on this.
 *
 * Declared as a TYPE PREDICATE rather than a plain `boolean` so the null-narrowing is part of
 * the contract: callers below read `geom.scrollTop` / `geom.scrollHeight` after guarding, and
 * with a bare `boolean` TypeScript cannot see that the guard excluded null (it reported
 * TS18047 at three call sites). The alternative — a non-null assertion at each use — would
 * move a checked fact into an unchecked one.
 */
export function isMeasurable(
  geom: ScrollGeometry | null,
): geom is ScrollGeometry {
  return geom !== null && geom.clientHeight > 0;
}

/**
 * The offset to remember, given the box's current geometry and what was already remembered.
 *
 * ⚠️ An unmeasurable box returns `prev` UNCHANGED — it does not return 0, and it does not
 * return null. This is the load-bearing line of the module: a hidden box reports
 * `scrollTop === 0`, so recording that would overwrite a perfectly good remembered offset
 * with a fake "top of document" and destroy exactly the position we are trying to keep.
 *
 * `prev` is `null` when nothing has been captured yet.
 */
export function captureScroll(
  geom: ScrollGeometry | null,
  prev: number | null,
): number | null {
  if (!isMeasurable(geom)) return prev;
  return geom.scrollTop;
}

/** What a caller should do with a restore request. */
export interface RestorePlan {
  /**
   * `true` → apply `scrollTop` to the element now.
   * `false` → the box is not measurable; HOLD the offset and re-apply when it becomes
   * measurable (the panel is re-fronted / the workspace is re-focused).
   */
  apply: boolean;
  /** The offset to write, already clamped to what the new content can accommodate. */
  scrollTop: number;
}

/**
 * Plan a restore: whether to apply it now, and to what offset.
 *
 * Two behaviors worth stating, because both are easy to get wrong in a way nothing notices:
 *
 * 1. **An unmeasurable box DEFERS, it does not discard.** `apply: false` means "try again
 *    later", and the caller is expected to keep holding the offset. Dropping it here is what
 *    produces the "came back to the top after switching panels" bug.
 * 2. **The offset CLAMPS to `scrollHeight - clientHeight`.** A live doc can shrink (a WIP
 *    file rewritten shorter, a `git checkout`), and a stale offset past the new end would
 *    otherwise be silently pinned to the bottom by the browser or — worse, if a caller ever
 *    compares the value back — read as a failed restore. Clamping to the new maximum keeps
 *    the reader as close as the document allows. Never negative: a doc shorter than its
 *    viewport clamps to 0, which is the only correct answer there.
 */
export function planRestore(
  geom: ScrollGeometry | null,
  offset: number | null,
): RestorePlan {
  if (offset === null) return { apply: false, scrollTop: 0 };
  if (!isMeasurable(geom)) return { apply: false, scrollTop: offset };

  const max = Math.max(0, geom.scrollHeight - geom.clientHeight);
  return { apply: true, scrollTop: Math.max(0, Math.min(offset, max)) };
}
