import { describe, it, expect } from "vitest";
import { shouldRunMirror } from "../mirrorTicker";

describe("shouldRunMirror (M4 WP4 P2 — loop-stop-on-collapse gate)", () => {
  it("runs when expanded with ≥1 background tile", () => {
    expect(shouldRunMirror(false, 1)).toBe(true);
    expect(shouldRunMirror(false, 3)).toBe(true);
  });

  it("does NOT run when collapsed — even with background tiles (the WP4 CPU win)", () => {
    expect(shouldRunMirror(true, 1)).toBe(false);
    expect(shouldRunMirror(true, 5)).toBe(false);
  });

  it("does NOT run when there is nothing to mirror (0 background tiles)", () => {
    // 0 or 1 workspace open: the only tile is the active placeholder, never mirrored.
    expect(shouldRunMirror(false, 0)).toBe(false);
  });

  it("collapsed + 0 background tiles → still off", () => {
    expect(shouldRunMirror(true, 0)).toBe(false);
  });
});
