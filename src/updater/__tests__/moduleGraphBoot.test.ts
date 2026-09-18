import { describe, it, expect } from "vitest";

// M14 WP2 boot smoke: the M13.5 WP3 failure was a DELETED EXPORT that tsc and the
// suite both missed while #root rendered empty. That failure is a RUNTIME module-
// resolution error, so the check is: can the real module graph be imported?
// Mutation-proven 2026-09-18: un-exporting `progressPercent` makes test 2 FAIL
// (mutation confirmed landed at the source line before trusting the result).
describe("boot smoke — updater module graph resolves after the quarantine deletion", () => {
  it("imports useUpdater's real module graph without a missing-export error", async () => {
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
