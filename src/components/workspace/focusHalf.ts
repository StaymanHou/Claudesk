// M4 WP4b — intra-workspace focus-half derivation.
//
// At N workspaces each split into a LEFT CC terminal (`.workspace-left`) and a RIGHT
// panel (`.workspace-right`, the RightPanelHost), "where will my keystrokes land" has
// no on-screen answer. WP4b paints a subtle `#6ea8ff` accent on whichever half of the
// CENTER-STAGE workspace holds keyboard focus — the coarser sibling of the M2 WP3c
// active-*editor-pane* strip.
//
// This is the pure seam: given a focus event's target node, decide which half it lives
// in. The React side (Workspace.tsx) is a thin capture-phase focusin/focusout wrapper
// that calls this and writes `data-focus-half` on the `.workspace` root; the CSS does
// the painting. Keeping the closest()-walk pure makes it vitest-testable without a DOM
// render harness (none is stood up in this repo — cf. the deferred jsdom backlog item).

export type FocusHalf = "left" | "right" | "none";

/**
 * Given a focus event target (or any node), return which workspace half contains it:
 * `"left"` if inside `.workspace-left`, `"right"` if inside `.workspace-right`, else
 * `"none"` (focus left both halves — header, off-workspace, or `null`).
 *
 * Uses `closest()` so a target deep inside CodeMirror, the xterm rows, the file tree,
 * or any panel resolves to its owning half. `.workspace-left` and `.workspace-right`
 * are never nested in each other, so a single closest() over the union selector is
 * unambiguous: it matches the nearest ancestor, which is the half the target sits in.
 *
 * Duck-typed (does the target have a `closest`?) rather than `instanceof Element`: the
 * repo's vitest env is node (no DOM globals — `Element` is undefined there, so an
 * `instanceof` guard would throw ReferenceError), so structural narrowing keeps this
 * seam unit-testable with minimal fakes while behaving identically against real nodes.
 */
export function deriveFocusHalf(target: EventTarget | null): FocusHalf {
  // Non-Elements (text nodes, window, null, the document) have no `closest` → none.
  if (!target || typeof (target as Element).closest !== "function") return "none";
  const half = (target as Element).closest(".workspace-left, .workspace-right");
  if (!half) return "none";
  return half.classList.contains("workspace-left") ? "left" : "right";
}
