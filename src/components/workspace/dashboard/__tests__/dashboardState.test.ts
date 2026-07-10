import { describe, expect, it } from "vitest";
import { dashboardMode } from "../dashboardState";

describe("dashboardMode (tracking-gate → render mode)", () => {
  it("tracking OFF → 'off' regardless of data presence", () => {
    // The toggle is the gate: off means nothing to show even if a stale payload
    // happened to have rows.
    expect(dashboardMode(false, false)).toBe("off");
    expect(dashboardMode(false, true)).toBe("off");
  });

  it("tracking ON + rows present → 'data'", () => {
    expect(dashboardMode(true, true)).toBe("data");
  });

  it("tracking ON + no rows → 'empty' (distinct from the OFF empty-state)", () => {
    expect(dashboardMode(true, false)).toBe("empty");
  });
});
