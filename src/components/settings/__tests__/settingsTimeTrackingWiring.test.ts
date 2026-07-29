import { describe, it, expect } from "vitest";
// Source-text guard (the repo ?raw convention, as in pickerPermissionModeWiring.test.ts):
// the picker tracking-toggle's wiring to the backend time-tracking source-of-truth is
// pinned structurally; the live toggle + persistence + broadcast round-trip is
// bridge-verified in verify-self, not re-asserted here.
import panelSrc from "../SettingsPanel.tsx?raw";
import timeAnalyticsSrc from "../../../state/timeAnalytics.ts?raw";

// The picker "Time tracking" checkbox (M9 WP5) shares one source of truth with any other
// surface that reflects the flag (the WP6 dashboard empty-state, later): the backend
// `time_tracking_enabled` setting, read via time_get_tracking_enabled, mutated via
// time_set_tracking_enabled, and broadcast on `time-tracking-enabled`. These guards pin
// that contract so a refactor can't silently sever it. (Mirror of the permission-mode
// dropdown wiring test.)
describe("Settings time-tracking toggle wires to the time-tracking source of truth", () => {
  it("seeds its checked state from time_get_tracking_enabled on mount", () => {
    // Now via the shared useSettingControl spec rather than a hand-rolled effect.
    expect(panelSrc).toContain("get: getTimeTrackingEnabled");
  });

  it("subscribes to the time-tracking-enabled broadcast (stays in sync across surfaces)", () => {
    expect(panelSrc).toContain("event: TIME_TRACKING_ENABLED_EVENT");
  });

  it("invokes the set helper on change (persists + re-broadcasts)", () => {
    expect(panelSrc).toContain("persist: setTimeTrackingEnabled");
    expect(panelSrc).toContain("timeTracking.set(e.target.checked)");
  });

  it("renders a checkbox with a stable testid for live verify-self", () => {
    expect(panelSrc).toContain('data-testid="picker-time-tracking"');
    expect(panelSrc).toContain('type="checkbox"');
  });

  it("labels its write error for the shared revert path", () => {
    // The optimistic-set/revert BEHAVIOR is tested for real in useSettingControl.test.ts
    // (all four controls share one implementation). This only pins the label.
    expect(panelSrc).toContain('errorLabel: "update time tracking"');
  });
});

// The typed IPC seam the picker consumes. Pins the command names + event string so a
// backend rename (which the Rust `time_tracking_enabled_event_name_is_stable` test pins
// on its side) can't drift from the FE without one of the two tests failing.
describe("timeAnalytics tracking-toggle IPC seam", () => {
  it("wraps the exact backend command names", () => {
    expect(timeAnalyticsSrc).toContain(
      'invoke<boolean>("time_get_tracking_enabled")',
    );
    expect(timeAnalyticsSrc).toContain(
      'invoke<void>("time_set_tracking_enabled", { enabled })',
    );
  });

  it("pins the broadcast event name to the backend const value", () => {
    expect(timeAnalyticsSrc).toContain(
      'TIME_TRACKING_ENABLED_EVENT = "time-tracking-enabled"',
    );
  });
});
