// M10.9 WP2 — THE CONSUMPTION SEAM for the workflow-features gate.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE SEAM CONTRACT — read this before adding any workflow-coupled surface.
//
//   A GATED SURFACE MUST NOT EXIST WHEN THE GATE IS OFF.
//
//   Not rendered-then-hidden (`display:none`, `visibility:hidden`, `opacity:0`).
//   Not present-but-disabled (a greyed tab, a disabled menu item).
//   Not registered-with-a-no-op-handler (a live chord whose handler early-returns).
//
//   ABSENT. The OFF build must be byte-identical in observable behavior to a build
//   that never had the feature — no empty tabs, no dead affordances, no chord that
//   swallows a keystroke to do nothing.
//
// Concretely, when this hook returns `false`:
//   - no workflow panel appears in `AVAILABLE_PANELS` / the `RightPanel` union
//   - no workflow chord predicate matches its key (the listener must not be attached,
//     or must be attached only inside an `enabled &&` branch)
//   - no workflow menu id is registered in `MENU_IDS` / Rust `FUNCTIONAL_IDS`
//
// Every workflow-coupled surface (M11 docs tab, M12 auto-resume + drive-mode selector,
// M13 skill buttons) reads THIS HOOK. Never `invoke("workflow_get_features_enabled")`
// ad hoc — a second call site is a second source of truth, and it is exactly what the
// guard test in __tests__/offInvariantGuard.test.ts fails on.
//
// ── What the guard test can and cannot prove ──────────────────────────────────
// CAN: that the seam is the only door — no workflow panel/chord/menu-id is registered
//      while OFF, and no surface bypasses the hook to read the setting directly.
// CANNOT: prove byte-identity of a compiled build. It is a source- and
//      registry-level invariant, not a binary diff. A surface that renders itself
//      through some channel the guard does not enumerate would slip past it; the
//      mitigation is that the three enumerated registries (panels, chords, menu ids)
//      are the only ways this app surfaces UI today, and adding a fourth is a
//      conscious act that should extend the guard.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Shape: seed from the getter on mount, then track the broadcast — the same
// seed+listen discipline the picker's three settings controls use, factored into one
// hook because this one has many consumers rather than one.
//
// DEFAULTS FALSE BEFORE THE SEED RESOLVES. `getWorkflowFeaturesEnabled` is async, so
// there is a window between mount and its resolution. Defaulting `true` there would
// flash a gated surface on during startup for EVERY user including those who never
// enabled it — violating the OFF invariant in the one window nobody thinks to test.
// The honest default is the restrictive one.

import { useEffect, useState } from "react";
import { useTauriListen } from "../useTauriListen";
import {
  getWorkflowFeaturesEnabled,
  WORKFLOW_FEATURES_ENABLED_EVENT,
  WORKFLOW_FEATURES_PRE_SEED_DEFAULT,
} from "./workflowGate";

/**
 * Whether the workflow-coupled feature class is enabled.
 *
 * Returns `false` until the persisted value has been read (see the header — the
 * pre-seed default is deliberately restrictive), then tracks the persisted value for
 * the component's lifetime.
 */
export function useWorkflowFeaturesEnabled(): boolean {
  const [enabled, setEnabled] = useState(WORKFLOW_FEATURES_PRE_SEED_DEFAULT);

  // Seed from the backend once. `cancelled` guards a StrictMode double-mount / a
  // teardown before the promise resolves (same discipline as the picker's effects).
  useEffect(() => {
    let cancelled = false;
    void getWorkflowFeaturesEnabled()
      .then((value) => {
        if (!cancelled) setEnabled(value);
      })
      .catch((e) => {
        // A read failure leaves the gate OFF — the safe direction. Logged, not toasted:
        // this hook has many consumers and a failed read should not produce N toasts.
        console.error("[claudesk] workflow_get_features_enabled failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Track the broadcast so flipping the setting anywhere re-renders every consumer.
  useTauriListen<boolean>(WORKFLOW_FEATURES_ENABLED_EVENT, (event) => {
    setEnabled(event.payload);
  });

  return enabled;
}
