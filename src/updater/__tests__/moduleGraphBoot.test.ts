import { describe, it, expect } from "vitest";

// M14 WP2: after the quarantine deletion, pin the updater modules' EXPORTED
// surface. The survivors are still exported, and the deleted seams are gone.
// Mutation-proven 2026-09-18: un-exporting `progressPercent` makes test 2 FAIL
// (mutation confirmed landed at the source line before trusting the result).
//
// ⚠️ This is NOT a module-graph boot check, although it was first written as one.
// Under Vitest, an import never fails because a CONSUMER names a missing export:
// the module runner reads the binding as `undefined` (probed 2026-09-23). The
// mutation above dies only because test 2 asserts on the EXPORTING module. The
// app-wide check for that failure class is `pnpm check:link`.
describe("updater modules export the post-quarantine-deletion surface", () => {
  it("useUpdater is still exported as a function", async () => {
    const m = await import("../useUpdater");
    expect(typeof m.useUpdater).toBe("function");
  });
  it("imports updateFlowState and the survivors are still exported", async () => {
    const m = await import("../updateFlowState");
    expect(typeof m.progressPercent).toBe("function");
    expect(typeof m.updateConfirmSpec).toBe("function");
    expect(m).not.toHaveProperty("quarantineFallbackSpec");
    expect(m).not.toHaveProperty("QUARANTINE_FALLBACK_ACTIVE");
  });
});
