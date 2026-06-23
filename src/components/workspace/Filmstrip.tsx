// WP5 — Filmstrip slot.
//
// M4 WP2 adds the FIRST live affordance to this slot: a "+" control that
// re-opens the ProjectPicker (as an overlay) so a second/third project can be
// opened while a workspace is already on the center stage. Before WP2 this slot
// was empty (it reserved the layout real-estate from M1).
//
// WP3 (next) populates the rest of the strip — one tile per open workspace
// (live ~1 fps `serializeAsHTML()` mirror for background tiles, a static
// active-marked tile for the center-staged one), click/⌘⇧+digit promote, and
// drag-reorder. WP2 deliberately renders ONLY the "+" control, no tiles.

interface FilmstripProps {
  /** Open the ProjectPicker overlay to add another workspace (M4 WP2). */
  onAddWorkspace: () => void;
}

export function Filmstrip({ onAddWorkspace }: FilmstripProps) {
  return (
    <div className="filmstrip" data-testid="filmstrip">
      {/* WP2: the new-workspace re-entry. WP3 adds the workspace tiles. */}
      <button
        type="button"
        className="filmstrip-add"
        data-testid="filmstrip-add-workspace"
        aria-label="Open another project"
        title="Open another project"
        onClick={onAddWorkspace}
      >
        +
      </button>
    </div>
  );
}
