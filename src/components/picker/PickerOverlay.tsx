// M4 WP2 — PickerOverlay: the ProjectPicker shown as a dismissable modal over the
// center stage, summoned by the filmstrip "+" control to open another workspace.
//
// Reuses the established overlay shell (`command-palette-backdrop`, the same shell
// the Cmd+P file finder + command palette use) for visual + behavioral consistency:
// Esc closes, a backdrop click closes, and dismissing leaves the current center-stage
// workspace untouched. Picking a project calls `onOpen(path)` (the append path) and
// the parent dismisses.
//
// First-open (no workspace yet) does NOT use this overlay — App renders the picker
// full-screen in that case. This component is only the RE-ENTRY path at N>=1.

import { useEffect, useRef } from "react";
import { ProjectPicker } from "./ProjectPicker";

interface PickerOverlayProps {
  /** Open the chosen project as a new workspace (append). The parent dismisses after. */
  onOpen: (projectPath: string) => void;
  /** Close the overlay without opening anything (Esc / backdrop / close button). */
  onDismiss: () => void;
}

export function PickerOverlay({ onOpen, onDismiss }: PickerOverlayProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Esc closes — registered on the document so it fires regardless of focus
  // (the picker's own filter input, a recent row, anywhere inside the overlay).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div
      ref={backdropRef}
      className="command-palette-backdrop"
      data-testid="picker-overlay"
      // Click outside the panel closes (mousedown so it beats any input blur).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="picker-overlay-panel" role="dialog" aria-label="Open a project">
        <button
          type="button"
          className="picker-overlay-close"
          data-testid="picker-overlay-close"
          aria-label="Close"
          title="Close"
          onClick={onDismiss}
        >
          ×
        </button>
        <ProjectPicker onOpen={onOpen} />
      </div>
    </div>
  );
}
