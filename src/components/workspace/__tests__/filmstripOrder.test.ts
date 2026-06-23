import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import {
  reorder,
  insertionIndex,
  loadOrder,
  saveOrder,
  FILMSTRIP_ORDER_KEY,
} from "../filmstripOrder";

describe("reorder", () => {
  it("moves an item earlier", () => {
    expect(reorder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  it("moves an item later", () => {
    expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
  it("is a no-op when from === to", () => {
    expect(reorder(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
  it("clamps out-of-range indices to a no-op (returns a copy)", () => {
    const input = ["a", "b"];
    expect(reorder(input, 5, 0)).toEqual(["a", "b"]);
    expect(reorder(input, 0, 9)).toEqual(["a", "b"]);
    expect(reorder(input, -1, 0)).toEqual(["a", "b"]);
  });
  it("does not mutate the input", () => {
    const input = ["a", "b", "c"];
    reorder(input, 0, 2);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("insertionIndex (symmetric drag hit-test)", () => {
  // 4 tiles, midpoints at 77, 199, 321, 443 (the real measured layout).
  const mids = [77, 199, 321, 443];

  it("keeps the dragged tile in place when the pointer is over its own slot", () => {
    // Dragging tile 0 (A), pointer still near its midpoint → 0 others passed.
    expect(insertionIndex(mids, 0, 77)).toBe(0);
  });

  it("moves a tile RIGHT — pointer past later tiles' midpoints", () => {
    // Drag A (index 0) right past C's midpoint (321): B + C passed → index 2.
    expect(insertionIndex(mids, 0, 330)).toBe(2);
    // ...past D's midpoint (443): B+C+D passed → index 3 (end).
    expect(insertionIndex(mids, 0, 450)).toBe(3);
  });

  it("moves a tile LEFT — the round-2 regression (was stuck only moving right)", () => {
    // Drag D (index 3) left to before A: 0 other tiles' midpoints are left of x=60 → 0.
    expect(insertionIndex(mids, 3, 60)).toBe(0);
    // Drag D left to between A and B (past A's midpoint 77 only) → 1.
    expect(insertionIndex(mids, 3, 150)).toBe(1);
  });

  it("is symmetric: dragging C left and B right resolve correctly", () => {
    // Drag C (index 2) left past A's midpoint only (x=150) → 1.
    expect(insertionIndex(mids, 2, 150)).toBe(1);
    // Drag B (index 1) right past C's midpoint (x=330): A + C left of x → 2.
    expect(insertionIndex(mids, 1, 330)).toBe(2);
  });
});

describe("loadOrder / saveOrder", () => {
  // The vitest env has no DOM, so stub a minimal in-memory localStorage (the repo
  // pattern — see filetree/__tests__/railWidth.test.ts).
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

  it("returns [] when nothing is stored", () => {
    expect(loadOrder()).toEqual([]);
  });

  it("round-trips a saved order", () => {
    saveOrder(["/Users/me/a", "/Users/me/b"]);
    expect(loadOrder()).toEqual(["/Users/me/a", "/Users/me/b"]);
  });

  it("canonicalizes trailing slashes on save and load", () => {
    saveOrder(["/Users/me/a/", "/Users/me/b"]);
    expect(loadOrder()).toEqual(["/Users/me/a", "/Users/me/b"]);
  });

  it("returns [] for a non-array stored value", () => {
    store[FILMSTRIP_ORDER_KEY] = JSON.stringify({ not: "an array" });
    expect(loadOrder()).toEqual([]);
  });

  it("returns [] for unparseable JSON (never throws)", () => {
    store[FILMSTRIP_ORDER_KEY] = "{not json";
    expect(loadOrder()).toEqual([]);
  });

  it("filters out non-string entries", () => {
    store[FILMSTRIP_ORDER_KEY] = JSON.stringify([
      "/Users/me/a",
      42,
      null,
      "/Users/me/b",
    ]);
    expect(loadOrder()).toEqual(["/Users/me/a", "/Users/me/b"]);
  });

  it("falls back to [] without throwing when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadOrder()).not.toThrow();
    expect(loadOrder()).toEqual([]);
  });

  it("swallows storage errors on save (best-effort)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {},
    });
    expect(() => saveOrder(["/Users/me/a"])).not.toThrow();
  });
});
