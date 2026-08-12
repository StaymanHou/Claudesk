// The consumption seam for the app-global PiP mode.
//
// Shape: seed from the getter on mount, then track the `pip-mode` broadcast — the same
// seed+listen discipline as `useWorkflowFeaturesEnabled`, and factored out for the same reason:
// the value is APP-GLOBAL but was being read per consumer.
//
// ⚠️ Why this exists rather than the state living in `RightPanelHost`. That component is mounted
// ONCE PER WORKSPACE and never unmounted (the standing "all workspaces stay mounted" invariant),
// so an inline `useState` + `pip_get_mode` fetch + `listen("pip-mode")` meant **N redundant IPC
// fetches and N live subscriptions for one app-global value** — growing with every workspace the
// operator opens, for a value that is identical in all of them. The old comment called this
// "fine ... every mounted instance shows the same mode", which is true about the DISPLAY and
// beside the point about the cost.
// (`SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE`.)
//
// The module-level cache is what collapses N to 1: the first consumer fetches, later consumers
// read the resolved value, and ONE listener fans the broadcast out to every subscriber. A
// consumer mounting after the fetch resolves does not re-fetch.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type PipMode = "off" | "on" | "auto";

/** The default before the backend answers — matches the pre-extraction inline default. */
const DEFAULT_MODE: PipMode = "auto";

function isPipMode(v: unknown): v is PipMode {
  return v === "off" || v === "on" || v === "auto";
}

// ── The single shared subscription ──────────────────────────────────────────────────────────
let current: PipMode = DEFAULT_MODE;
let started = false;
const subscribers = new Set<(m: PipMode) => void>();

function publish(m: PipMode) {
  current = m;
  for (const fn of subscribers) fn(m);
}

/** Start the one fetch + one listener, at most once per app lifetime. */
function ensureStarted() {
  if (started) return;
  started = true;
  void invoke<PipMode>("pip_get_mode")
    .then((m) => {
      if (isPipMode(m)) publish(m);
    })
    .catch(() => {
      /* default stands — the same non-surfacing failure as the inline version */
    });
  void listen<string>("pip-mode", (e) => {
    if (isPipMode(e.payload)) publish(e.payload);
  });
  // Deliberately never unlistened: the subscription is app-global and app-lifetime, and there
  // is no moment at which Claudesk stops caring about the PiP mode. Tearing it down when the
  // last consumer unmounts would re-introduce the churn this hook removes.
}

/**
 * Read the app-global PiP mode.
 *
 * Every consumer gets the same value from one fetch and one broadcast subscription, however
 * many workspaces are open.
 */
export function usePipMode(): PipMode {
  // ⚠️ Seeded from `current` in the initializer, NOT re-synced with a `setMode(current)` inside
  // the effect. A synchronous setState in an effect is a cascading render, which this repo's
  // eslint config rejects as an ERROR (it caught exactly this) — and it is unnecessary here:
  // `useState`'s initializer already reads the live cache at mount, so a consumer mounting
  // after the fetch resolved starts with the resolved value rather than the default.
  const [mode, setMode] = useState<PipMode>(() => current);
  useEffect(() => {
    ensureStarted();
    subscribers.add(setMode);
    return () => {
      subscribers.delete(setMode);
    };
  }, []);
  return mode;
}

/**
 * Publish an optimistic local value ahead of the backend broadcast.
 *
 * The PiP toggle writes through `pip_set_mode` and the `pip-mode` broadcast confirms — but the
 * button should reflect the new mode immediately rather than after a round trip. Calling this
 * updates every subscriber at once, so all workspaces stay consistent even though only the
 * focused one was clicked (the old per-instance state updated exactly one of them).
 */
export function setPipModeOptimistic(mode: PipMode) {
  publish(mode);
}

// ── Test seams ──────────────────────────────────────────────────────────────────────────────
//
// The N→1 collapse is this module's whole reason to exist, and it lives in MODULE scope rather
// than in React — so it is drivable directly, without a component-render harness this repo does
// not have. These three exports let `__tests__/usePipMode.test.ts` assert the behavior instead
// of grepping for the shape.
//
// Named `__*ForTest` so a production caller reads as obviously wrong; they are pure accessors
// over the same state the hook uses, not a parallel implementation that could drift from it.

/** Run the once-per-app fetch+subscribe. Idempotent — that idempotence IS the property. */
export function __ensureStartedForTest() {
  ensureStarted();
}

/** Subscribe without React. Returns an unsubscribe, mirroring the hook's effect cleanup. */
export function __subscribeForTest(fn: (m: PipMode) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** The cached value a late-mounting consumer's `useState` initializer would read. */
export function __currentForTest(): PipMode {
  return current;
}
