// M9 WP6b-1 Phase 1 — the shared-viewport React context.
//
// ONE source of truth for the visible time window, shared by the DayTimeline body
// (ruler/grid/segbars/overlap layers — all READ) and, from Phase 3, the Minimap
// (reads AND writes). Q1 resolved this as a context (over prop-drilling): N read-
// only leaves + 2 writers is exactly the shape context fits, and it avoids
// threading a setter through 4 component layers.
//
// The read/write split (`useViewport` vs `useViewportSetter`) mirrors the source
// (dashboard.jsx:2081) so read-only leaves don't re-subscribe to setter identity.
// The provider value is memoized on `[viewport]` so its identity is stable between
// viewport changes.
//
// KEY INVARIANT: the public setter (`setViewport`) ALWAYS routes writes through
// `clampViewport(next, dataWindow)` — callers (gestures, Minimap, keyboard reset)
// never touch the raw setState, so containment is enforced in one place. It accepts
// either a next viewport or an updater `(prev) => next` (the updater sees the
// current CLAMPED viewport), so gesture code can compute deltas against live state.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clampViewport,
  viewportSeedKey,
  type DataWindow,
  type Viewport,
} from "./viewport";

type ViewportUpdater = Viewport | ((prev: Viewport) => Viewport);

interface ViewportCtx {
  viewport: Viewport;
  /** Clamped setter — every write is contained to the data window. Accepts a next
   *  viewport or an updater that sees the current (clamped) viewport. */
  setViewport: (next: ViewportUpdater) => void;
  /** Reset to the seed (the `hour_range`-derived initial window) — "Fit day" / `0`. */
  reset: () => void;
  /** The current pan/zoom bounds (exposed so the Minimap can size its track). */
  dataWindow: DataWindow;
}

const ViewportContext = createContext<ViewportCtx | null>(null);

interface ViewportProviderProps {
  /** The initial + reset-target viewport (from `viewportFromHourRange`). */
  seed: Viewport;
  /** The pan/zoom bounds (from `deriveDataWindow`). */
  dataWindow: DataWindow;
  /**
   * OPTIONAL explicit re-seed key (WP6b-4 re-spec). When present, the viewport
   * re-seeds only when THIS key changes — decoupling the re-seed decision from
   * `dataWindow` growth. This is load-bearing for the flexible-timeline auto-extend:
   * a pan to the older edge WIDENS `dataWindow` (to grow the pan clamp) but must NOT
   * stomp the user's pan back to the seed. The caller bumps this key ONLY on an
   * intentional re-frame (jump-to a new span / Day-tab reset / tracking flip), so the
   * auto-extend's `dataWindow` change is a pure clamp-bound widen with the viewport
   * preserved. When ABSENT (all pre-re-spec callers), it defaults to the numeric
   * `viewportSeedKey(seed, dataWindow)` — byte-identical to the WP6b-1 behavior.
   */
  seedKey?: string;
  children: ReactNode;
}

/**
 * Owns the viewport `useState`, seeded from `seed` and clamped to `dataWindow`.
 * RE-SEEDS whenever the re-seed key changes (a new day fetch / tracking flip / an
 * explicit `seedKey` bump) — no stale window carries across genuinely-new views. The
 * default key is the four numeric bounds (via the pure `viewportSeedKey`) so an
 * identical re-fetch is a no-op (preserves the user's current pan/zoom); a caller that
 * passes an explicit `seedKey` prop controls the re-seed trigger directly (see the prop
 * doc — the flexible-timeline auto-extend needs `dataWindow` to grow WITHOUT re-seeding).
 */
export function ViewportProvider({
  seed,
  dataWindow,
  seedKey: explicitSeedKey,
  children,
}: ViewportProviderProps) {
  const [viewport, setRaw] = useState<Viewport>(() =>
    clampViewport(seed, dataWindow),
  );

  // Re-seed on a genuinely new view. Default: keyed on the four numeric bounds (via the
  // pure `viewportSeedKey`) so an identical re-fetch is a no-op (preserves the user's
  // viewport). Explicit override: the caller's `seedKey` prop (the flexible-timeline
  // decouples re-seed from `dataWindow` growth). Unit-pinned in viewport.test.ts.
  const seedKey = explicitSeedKey ?? viewportSeedKey(seed, dataWindow);
  const lastSeedKey = useRef(seedKey);
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      lastSeedKey.current = seedKey;
      return;
    }
    if (lastSeedKey.current !== seedKey) {
      lastSeedKey.current = seedKey;
      setRaw(clampViewport(seed, dataWindow));
    }
    // seed/dataWindow are captured by seedKey; eslint-safe because we compare by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const setViewport = useCallback(
    (next: ViewportUpdater) => {
      setRaw((prev) => {
        const proposed = typeof next === "function" ? next(prev) : next;
        return clampViewport(proposed, dataWindow);
      });
    },
    [dataWindow],
  );

  const reset = useCallback(() => {
    setRaw(clampViewport(seed, dataWindow));
  }, [seed, dataWindow]);

  // WP6b-1 Phase 2 — minimal keyboard reset: pressing `0` resets the viewport to
  // the seed (the "get un-lost" affordance; same action as the Toolbar "Fit day"
  // button). Deliberately NOT `Escape` — that closes the dashboard (GlobalDashboard's
  // own handler), so binding it here would create a double-action. Ignores typing
  // into inputs. Torn down on unmount. (Arrow-pan / +/- zoom / Home-End are DEFERRED
  // — SURFACE-2026-07-13-M9-WP6B1-KEYBOARD-PAN-ZOOM-DEFERRED.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "0") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave ⌘/⌃/⌥-combos alone
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (t && t.isContentEditable)
      )
        return;
      reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  const value = useMemo<ViewportCtx>(
    () => ({ viewport, setViewport, reset, dataWindow }),
    [viewport, setViewport, reset, dataWindow],
  );

  return (
    <ViewportContext.Provider value={value}>
      {children}
    </ViewportContext.Provider>
  );
}

/** Read the current viewport. Throws if used outside a `ViewportProvider`. */
export function useViewport(): Viewport {
  const ctx = useContext(ViewportContext);
  if (!ctx)
    throw new Error("useViewport must be used within a ViewportProvider");
  return ctx.viewport;
}

/** Get the clamped setter + reset + dataWindow. Throws outside a provider. */
export function useViewportSetter(): {
  setViewport: ViewportCtx["setViewport"];
  reset: ViewportCtx["reset"];
  dataWindow: DataWindow;
} {
  const ctx = useContext(ViewportContext);
  if (!ctx)
    throw new Error("useViewportSetter must be used within a ViewportProvider");
  return {
    setViewport: ctx.setViewport,
    reset: ctx.reset,
    dataWindow: ctx.dataWindow,
  };
}
