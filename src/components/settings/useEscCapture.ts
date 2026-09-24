// F-b Phase 5 — let a dialog stacked on top of the ⌘, Settings panel (or the picker) own Esc.
//
// ⚠️ Why a WINDOW capture listener. App.tsx's overlay Esc handler is a `document` capture
// listener, so a React `onKeyDown` inside the dialog runs AFTER it, by which time Settings has
// already closed and taken the dialog with it. That is the "one Esc peels two layers" bug that
// `escDismiss.ts` exists to prevent. Window capture runs before document capture, so the dialog
// consumes Esc first and one keypress peels exactly one layer.

import { useEffect, useRef } from "react";

export function useEscCapture(active: boolean, onEsc: () => void): void {
  const latest = useRef(onEsc);
  useEffect(() => {
    latest.current = onEsc;
  });
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      latest.current();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [active]);
}
