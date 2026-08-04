// M12 WP2 — the filmstrip tile-action cluster: the always-visible × plus a ⏸ that is
// REVEALED ON HOVER directly beneath it.
//
// ## Why a cluster component and not two loose controls
// Two reasons, both structural rather than stylistic.
//
// 1. **The hover zone must contain both controls.** The ⏸ appears below the ×, so the
//    pointer has to travel from one to the other. If the reveal were keyed on hovering the
//    × alone, the ⏸ would vanish the instant the pointer left it — the classic hover-menu
//    gap failure. Wrapping both in one element and keying the reveal on the WRAPPER's
//    hover means moving down from × to ⏸ never leaves the trigger. ⚠️ The CSS bridge that
//    spans the gap must NOT be gated on `:hover` — that is circular and was a real
//    operator-found bug. Full mechanism + the slow-vs-fast-travel symptom live in ONE
//    place: the `.tile-actions::after` block in `App.css`.
//
// 2. **Nesting discipline in one place.** The pill and the expanded tile are themselves
//    `<button>` elements, so these controls must be `<span role="button">` — a nested
//    `<button>` is invalid HTML whose failure mode is silent (the inner control's clicks
//    surface on the outer handler, so it looks like it does the wrong thing rather than
//    like it is broken). Each control also needs `stopPropagation` on pointerdown (so the
//    strip's drag/promote handler ignores the press), `stopPropagation` on click (so the
//    pill's promote doesn't fire), and an Enter/Space keydown mirror for keyboard reach.
//    That is ~20 lines × 2 controls × 2 render modes = 4 hand-copied sites. Nesting is a
//    known silent-defect class here (`pickerRowOrder.ts:4-7` documents a 100%-reproducible
//    variant), and a rule enforced by copy-paste in four places is a rule waiting to break
//    in the fifth.
//
// ## Zero permanent real estate
// The ⏸ is `visibility: hidden` (hidden from hit-testing too, so it cannot steal clicks)
// until the cluster is hovered or focus-within, and is absolutely positioned — so it
// occupies NO layout space and the collapsed pill row, the tightest surface in the app,
// costs exactly what it costs today. Measured live: cluster width == close width == 15px.

interface TileActionsProps {
  /** Stable test-hook prefix, e.g. `filmstrip` → `filmstrip-close-ws-1`. */
  testIdPrefix: string;
  /** Workspace id, for the test hooks. */
  workspaceId: string;
  /** Display name, for the accessible labels. */
  displayName: string;
  /** Ordinary close — clears the unclean flag (a clean exit). */
  onClose: () => void;
  /** Pause-close — closes and reaps the PTY but LEAVES the session marked unfinished,
   *  so the next open offers `/resume`. */
  onPauseClose: () => void;
  /** Site-specific class for the cluster (`filmstrip-pill-actions` / `-tile-actions`). */
  className: string;
  /**
   * M10.9 gate — whether the workflow-features layer is ON.
   *
   * ⚠️ When `false` the ⏸ is **NOT RENDERED AT ALL**, per the seam contract in
   * `useWorkflowFeaturesEnabled.ts`: *a gated surface must not exist when the gate is
   * off* — not hidden, not disabled, not a no-op handler. The ⏸ is workflow-coupled
   * because its whole purpose is to preserve the unclean flag that M12's auto-resume
   * reads to fire `/resume`; with the workflow layer off there is nothing to resume
   * into, so the control would be a dead affordance.
   *
   * The × is universal and always renders — closing a workspace is not workflow-coupled.
   *
   * Passed IN as a prop rather than read from the hook here: this component renders once
   * per tile, and one subscription per tile would be N listeners for one app-global
   * value. The caller reads the hook once. (It also keeps this component pure/testable.)
   */
  workflowEnabled: boolean;
}

/** One action control. Not exported — always rendered via [`TileActions`]. */
function ActionControl({
  kind,
  testId,
  label,
  onActivate,
}: {
  kind: "close" | "pause";
  testId: string;
  label: string;
  onActivate: () => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={`tile-action tile-action--${kind}`}
      data-testid={testId}
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onActivate();
        }
      }}
    >
      {kind === "close" ? (
        "×"
      ) : (
        // Two bars rather than the literal "⏸" codepoint: the emoji-presentation glyph
        // renders inconsistently across fonts and can pick up a colour-emoji fallback,
        // whereas two spans are pixel-stable and inherit `currentColor`.
        <span className="tile-action-pause-glyph" aria-hidden="true">
          <span />
          <span />
        </span>
      )}
    </span>
  );
}

/**
 * The × / ⏸ cluster for one filmstrip tile.
 *
 * The × is always visible and behaves exactly as it always has. The ⏸ is revealed only
 * while the cluster is hovered (or contains keyboard focus, so it is reachable by Tab as
 * well as by pointer) and sits directly below the ×.
 */
export function TileActions({
  testIdPrefix,
  workspaceId,
  displayName,
  onClose,
  onPauseClose,
  className,
  workflowEnabled,
}: TileActionsProps) {
  return (
    // The hover TRIGGER. `onPointerDown` stops here too so a press anywhere in the
    // cluster (including the transparent padding) never starts a strip drag.
    <span
      className={`tile-actions ${className}`}
      data-testid={`${testIdPrefix}-actions-${workspaceId}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ActionControl
        kind="close"
        testId={`${testIdPrefix}-close-${workspaceId}`}
        label={`Close ${displayName}`}
        onActivate={onClose}
      />
      {/* Gated: ABSENT when the workflow layer is off — see `workflowEnabled` above. */}
      {workflowEnabled && (
        <ActionControl
          kind="pause"
          testId={`${testIdPrefix}-pause-${workspaceId}`}
          label={`Close ${displayName}, resume later`}
          onActivate={onPauseClose}
        />
      )}
    </span>
  );
}
