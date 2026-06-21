// WP12 — a small modal confirm dialog (the close-dirty-tab guard + the disk-change
// conflict prompt render through this).
//
// The shape (title + message + ordered buttons) and what each press resolves to live
// in the pure confirmDialog.ts model (vitest-tested); this component is the thin DOM
// layer. Dark-only, aligned to the command-palette overlay tokens in App.css.
//
// A button press resolves to its `value` via `onChoose`. Esc resolves to `spec.escValue`
// when that is non-null (the close guard's "cancel"); when escValue is null (the
// conflict prompt — the operator MUST pick a copy) Esc is inert. Backdrop click follows
// the same escValue rule, so a conflict can't be dismissed by clicking away.

import { useEffect, useRef } from "react";
import type { ConfirmSpec } from "./confirmDialog";

interface ConfirmModalProps<V extends string> {
  spec: ConfirmSpec<V>;
  /** Called with the chosen button's `value` (or escValue on Esc/backdrop). */
  onChoose: (value: V) => void;
}

export function ConfirmModal<V extends string>({
  spec,
  onChoose,
}: ConfirmModalProps<V>) {
  // Focus the primary (or first) button on open so Enter/Space activates the default
  // action and the dialog is keyboard-operable immediately.
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  const dismiss = () => {
    if (spec.escValue !== null) onChoose(spec.escValue);
    // escValue null (conflict) → Esc/backdrop are inert; the user must pick a button.
  };

  const primaryIndex = Math.max(
    spec.buttons.findIndex((b) => b.variant === "primary"),
    0,
  );

  return (
    <div
      className="confirm-dialog-backdrop"
      data-testid="confirm-dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          dismiss();
        }
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-label={spec.title}
      >
        <p className="confirm-dialog-title">{spec.title}</p>
        <p className="confirm-dialog-message">{spec.message}</p>
        <div className="confirm-dialog-buttons">
          {spec.buttons.map((b, i) => (
            <button
              key={b.id}
              ref={i === primaryIndex ? primaryRef : undefined}
              type="button"
              className={`confirm-dialog-btn confirm-dialog-btn-${b.variant ?? "default"}`}
              data-testid={`confirm-${b.id}`}
              onClick={() => onChoose(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
