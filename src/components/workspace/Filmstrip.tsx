// WP5 — Filmstrip slot.
//
// Phase 2 populates this. It is intentionally empty in Phase 1: it exists only
// to reserve the layout real-estate (a horizontal strip above the Center Stage)
// so Phase 2's WP16 can drop in tiles without reshaping the foundation.
//
// Phase 2 will render one tile per non-focused workspace — either a live ~1 fps
// `serializeAsHTML()` mirror or a static status tile, per the WP4 probe outcome
// (PASS → live mirrors). It will also gain a collapse toggle (collapsed = mini
// status tiles only). None of that is built here.

export function Filmstrip() {
  return (
    <div className="filmstrip" data-testid="filmstrip">
      {/* Phase 2 populates this. */}
    </div>
  );
}
