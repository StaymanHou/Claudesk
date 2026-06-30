// WP6 (debt-paydown) — the shared font-zoom factory behind both zoom surfaces.
//
// terminalFontZoom.ts (the CC + right-panel terminals) and editor/fontZoom.ts (the
// CM6 editor) were verbatim siblings apart from their bounds + storage key. Both now
// build their clamp/step/persist functions from this one factory, so the math + the
// swallow-on-storage-error contract live in ONE place. The two modules keep their own
// named exports (existing imports + tests unchanged) — they're thin config wrappers.
//
// Pure logic: no React, no xterm/CM6, no DOM — unit-testable under vitest with an
// injected Storage. The factory closes over its config; callers pass a Storage (the
// modules default it to localStorage via their own safeStorage()).

/** The tunable bounds + persistence key that distinguish one zoom surface from another. */
export interface FontZoomConfig {
  /** Size on first run / on ⌘0 reset / on any unparseable-or-out-of-range fallback. */
  defaultPx: number;
  /** Lower clamp bound. */
  minPx: number;
  /** Upper clamp bound. */
  maxPx: number;
  /** Per-step delta for ⌘= / ⌘-. */
  stepPx: number;
  /** Global localStorage key the size persists under. */
  storageKey: string;
}

/** The clamp/step/persist surface a zoom module exposes (under its own named exports). */
export interface FontZoom {
  /** Clamp a candidate size into [minPx, maxPx]; non-finite → defaultPx. */
  clamp(px: number): number;
  /** The next size for a zoom direction, clamped. "in" grows, "out" shrinks. */
  next(current: number, direction: "in" | "out"): number;
  /**
   * Read the persisted size from `storage`. Returns defaultPx when absent,
   * unparseable, or out of range — never throws (a private-mode / disabled-storage
   * access error is swallowed to the default).
   */
  load(storage: Storage | undefined): number;
  /** Persist the size (clamped). Swallows storage-access errors. */
  save(px: number, storage: Storage | undefined): void;
}

/** Build a zoom surface from its bounds + key. The body is identical across surfaces. */
export function makeFontZoom(config: FontZoomConfig): FontZoom {
  const { defaultPx, minPx, maxPx, stepPx, storageKey } = config;

  function clamp(px: number): number {
    if (!Number.isFinite(px)) return defaultPx;
    return Math.min(maxPx, Math.max(minPx, Math.round(px)));
  }

  function next(current: number, direction: "in" | "out"): number {
    const delta = direction === "in" ? stepPx : -stepPx;
    return clamp(current + delta);
  }

  function load(storage: Storage | undefined): number {
    if (!storage) return defaultPx;
    try {
      const raw = storage.getItem(storageKey);
      if (raw == null) return defaultPx;
      const n = Number(raw);
      if (!Number.isFinite(n)) return defaultPx;
      return clamp(n);
    } catch {
      return defaultPx;
    }
  }

  function save(px: number, storage: Storage | undefined): void {
    if (!storage) return;
    try {
      storage.setItem(storageKey, String(clamp(px)));
    } catch {
      // private mode / quota / disabled — zoom still works for the session.
    }
  }

  return { clamp, next, load, save };
}

/** localStorage if available, else undefined (SSR / test without DOM). Shared by both modules. */
export function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
