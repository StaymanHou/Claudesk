// WP12 Phase 3 — tests for the pure disk-change decision logic.

import { describe, it, expect } from "vitest";
import { diskDecision, markersEqual } from "../diskConflict";

const m = (mtime_ms: number, size: number) => ({ mtime_ms, size });

describe("markersEqual", () => {
  it("equal when mtime AND size match", () => {
    expect(markersEqual(m(100, 5), m(100, 5))).toBe(true);
  });
  it("unequal when mtime differs", () => {
    expect(markersEqual(m(100, 5), m(200, 5))).toBe(false);
  });
  it("unequal when size differs", () => {
    expect(markersEqual(m(100, 5), m(100, 6))).toBe(false);
  });
  it("unequal when either side is undefined", () => {
    expect(markersEqual(undefined, m(100, 5))).toBe(false);
    expect(markersEqual(m(100, 5), undefined)).toBe(false);
  });
});

describe("diskDecision", () => {
  it("no stored baseline → noop (adopt the disk marker)", () => {
    expect(diskDecision(undefined, m(100, 5), false)).toBe("noop");
    expect(diskDecision(undefined, m(100, 5), true)).toBe("noop");
  });

  it("markers equal → noop regardless of dirty", () => {
    expect(diskDecision(m(100, 5), m(100, 5), false)).toBe("noop");
    expect(diskDecision(m(100, 5), m(100, 5), true)).toBe("noop");
  });

  it("disk changed + clean → reload (no edits at stake)", () => {
    expect(diskDecision(m(100, 5), m(200, 9), false)).toBe("reload");
  });

  it("disk changed + dirty → conflict (operator must choose)", () => {
    expect(diskDecision(m(100, 5), m(200, 9), true)).toBe("conflict");
  });

  it("size-only change with a dirty buffer → conflict", () => {
    expect(diskDecision(m(100, 5), m(100, 6), true)).toBe("conflict");
  });

  it("mtime-only change with a clean buffer → reload", () => {
    expect(diskDecision(m(100, 5), m(200, 5), false)).toBe("reload");
  });
});
