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

import { useCallback, useEffect, useState } from "react";
import { ProjectPicker } from "./ProjectPicker";

interface PickerOverlayProps {
  /** Open the chosen project as a new workspace (append). The parent dismisses after. */
  onOpen: (projectPath: string) => void;
  /** Close the overlay without opening anything (Esc / backdrop / close button). */
  onDismiss: () => void;
  /** M16.5 WP5 (5.7) — open workspaces' project paths; the picker lists them last. */
  openProjectPaths?: readonly string[];
}

/**
 * Give focus back to `el` (what had it before the overlay opened), if it is still in the
 * document and can take focus. Exported for its unit test.
 *
 * ⚠️ The target can go stale while the overlay is open: ⌘⇧digit still switches the center
 * stage, and the workspace that held `el` becomes a background one, which is `inert`. Focusing
 * inside an inert subtree is a no-op in WKWebView, so the restore used to strand focus on
 * <body> and the new center-stage pane took no keys until clicked (measured live,
 * paydown-2026-11-27 WP5). A stale target (inside `[inert]`, or detached because its workspace
 * closed) therefore hands focus to the CENTER-STAGE workspace's CC pane instead, the same pane a
 * plain center-stage switch focuses. The inert check is explicit, not left to the browser, so it
 * also holds where `inert` is not enforced (jsdom).
 */
export function restoreFocus(el: Element | null): void {
  if (!(el instanceof HTMLElement) || el === document.body) return;
  if (el.isConnected && el.closest("[inert]") === null) {
    el.focus();
    return;
  }
  document
    .querySelector<HTMLElement>(
      '.workspace[data-visible="true"] [data-testid="xterm-pane"] .xterm-helper-textarea',
    )
    ?.focus();
}

export function PickerOverlay({
  onOpen,
  onDismiss,
  openProjectPaths,
}: PickerOverlayProps) {
  // What had focus BEFORE the overlay opened — normally the focused workspace's xterm (the
  // filmstrip "+" click takes no focus). Captured during the first render, i.e. before
  // `ProjectPicker`'s filter input `autoFocus`es in the commit (a lazy initializer runs
  // once, at the first render, so this is the pre-open focus and never the filter).
  const [prevFocus] = useState<Element | null>(() => document.activeElement);

  // Every DISMISS path (Esc, backdrop, ×) goes through here: the picker took focus on
  // open, so without this a dismiss would strand focus on <body> and the CC pane would
  // stop taking keys until clicked. Restore BEFORE `onDismiss` unmounts the input. The
  // OPEN path does not restore: the new workspace takes focus itself.
  const dismiss = useCallback(() => {
    restoreFocus(prevFocus);
    onDismiss();
  }, [prevFocus, onDismiss]);

  // Esc closes — registered on the document so it fires regardless of focus
  // (the picker's own filter input, a recent row, anywhere inside the overlay).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dismiss]);

  return (
    <div
      className="command-palette-backdrop"
      data-testid="picker-overlay"
      // Click outside the panel closes (mousedown so it beats any input blur).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          // Keep the mousedown from moving focus to the backdrop before the restore.
          e.preventDefault();
          dismiss();
        }
      }}
    >
      <div
        className="picker-overlay-panel"
        role="dialog"
        aria-label="Open a project"
      >
        <button
          type="button"
          className="picker-overlay-close"
          data-testid="picker-overlay-close"
          aria-label="Close"
          title="Close"
          onClick={dismiss}
        >
          ×
        </button>
        <ProjectPicker onOpen={onOpen} openProjectPaths={openProjectPaths} />
      </div>
    </div>
  );
}
