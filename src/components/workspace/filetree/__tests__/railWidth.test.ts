import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampRailWidth,
  loadRailWidth,
  saveRailWidth,
  RAIL_DEFAULT,
  RAIL_MAX,
  RAIL_MIN,
  RAIL_WIDTH_KEY,
} from "../railWidth";

describe("clampRailWidth", () => {
  it("passes an in-range width through (rounded)", () => {
    expect(clampRailWidth(300)).toBe(300);
    expect(clampRailWidth(299.6)).toBe(300);
  });

  it("clamps below-min up to RAIL_MIN", () => {
    expect(clampRailWidth(10)).toBe(RAIL_MIN);
    expect(clampRailWidth(RAIL_MIN - 1)).toBe(RAIL_MIN);
  });

  it("clamps above-max down to RAIL_MAX", () => {
    expect(clampRailWidth(9999)).toBe(RAIL_MAX);
    expect(clampRailWidth(RAIL_MAX + 1)).toBe(RAIL_MAX);
  });

  it("returns the default for non-finite input", () => {
    expect(clampRailWidth(NaN)).toBe(RAIL_DEFAULT);
    expect(clampRailWidth(Infinity)).toBe(RAIL_DEFAULT);
  });
});

describe("loadRailWidth / saveRailWidth (localStorage round-trip)", () => {
  // The vitest env has no DOM, so stub a minimal in-memory localStorage.
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns RAIL_DEFAULT when nothing is stored", () => {
    expect(loadRailWidth()).toBe(RAIL_DEFAULT);
  });

  it("round-trips a saved width", () => {
    saveRailWidth(420);
    expect(store[RAIL_WIDTH_KEY]).toBe("420");
    expect(loadRailWidth()).toBe(420);
  });

  it("clamps on save (out-of-range stored as the bound)", () => {
    saveRailWidth(9999);
    expect(loadRailWidth()).toBe(RAIL_MAX);
    saveRailWidth(10);
    expect(loadRailWidth()).toBe(RAIL_MIN);
  });

  it("returns RAIL_DEFAULT for a corrupt stored value", () => {
    store[RAIL_WIDTH_KEY] = "not-a-number";
    expect(loadRailWidth()).toBe(RAIL_DEFAULT);
  });

  it("clamps an out-of-range stored value on load", () => {
    store[RAIL_WIDTH_KEY] = "5000";
    expect(loadRailWidth()).toBe(RAIL_MAX);
  });
});

describe("loadRailWidth — no localStorage available", () => {
  it("falls back to RAIL_DEFAULT without throwing", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadRailWidth()).not.toThrow();
    expect(loadRailWidth()).toBe(RAIL_DEFAULT);
    vi.unstubAllGlobals();
  });
});
