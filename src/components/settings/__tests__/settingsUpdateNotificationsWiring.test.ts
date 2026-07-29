import { describe, it, expect } from "vitest";
// Source-text guard (the repo ?raw convention, as in pickerTimeTrackingWiring.test.ts):
// the picker update-notification toggle + manual check button wiring is pinned
// structurally; the live toggle/persist/broadcast + check round-trip is bridge-verified
// in verify-self, not re-asserted here.
import panelSrc from "../SettingsPanel.tsx?raw";
import updaterPrefsSrc from "../../../updater/updaterPrefs.ts?raw";

// The picker "Update notifications" checkbox (M10 WP4) shares one source of truth with
// any surface reflecting the flag: the backend update_notifications_enabled setting, read
// via updater_get_notifications_enabled, mutated via updater_set_notifications_enabled,
// broadcast on `updater-notifications-enabled`. (Mirror of the time-tracking toggle test.)
describe("Settings update-notification toggle wires to the notifications source of truth", () => {
  it("seeds its checked state from getUpdateNotificationsEnabled on mount", () => {
    expect(panelSrc).toContain("get: getUpdateNotificationsEnabled");
  });

  it("subscribes to the updater-notifications-enabled broadcast", () => {
    expect(panelSrc).toContain("event: UPDATER_NOTIFICATIONS_ENABLED_EVENT");
  });

  it("invokes the set helper on change (persists + re-broadcasts)", () => {
    expect(panelSrc).toContain("persist: setUpdateNotificationsEnabled");
    expect(panelSrc).toContain("updateNotifications.set(e.target.checked)");
  });

  it("renders the toggle checkbox with a stable testid for live verify-self", () => {
    expect(panelSrc).toContain('data-testid="picker-update-notifications"');
  });

  it("reverts optimistically + surfaces an error toast on a rejected set", () => {
    expect(panelSrc).toContain('errorLabel: "update notification setting"');
  });
});

describe("picker manual 'Check for updates' button wires to App's checkNow", () => {
  it("renders the check button (only when onCheckForUpdates is provided) with a stable testid", () => {
    expect(panelSrc).toContain('data-testid="picker-check-updates"');
    expect(panelSrc).toContain("onCheckForUpdates &&");
  });

  // WP6 P1.4: manual-check feedback (up-to-date / error) moved to the SINGLE App-level
  // updater status row (useUpdater.statusNote), which renders over both scenes — so the
  // picker KICKS-only and no longer toasts these outcomes itself (removing the duplicate
  // surface, and giving the native-menu path — which discards the report — the same
  // feedback). The outcome→note mapping is unit-tested in updateFlowState.test.ts; the
  // App-side render is guarded in updaterWiring.test.ts.
  it("kicks the check without consuming the report (feedback is App-owned now)", () => {
    expect(panelSrc).toContain("onClick={onCheckForUpdates}");
    // the removed duplicate-toast branch is gone
    expect(panelSrc).not.toContain('report.outcome === "up-to-date"');
  });
});

// The typed IPC seam the picker consumes. Pins the command names + event string so a
// backend rename (pinned on the Rust side by notifications_enabled_event_name_is_stable)
// can't drift from the FE without one of the two tests failing.
describe("updaterPrefs notification-toggle IPC seam", () => {
  it("wraps the exact backend command names", () => {
    expect(updaterPrefsSrc).toContain(
      'invoke<boolean>("updater_get_notifications_enabled")',
    );
    expect(updaterPrefsSrc).toContain(
      'invoke<void>("updater_set_notifications_enabled", { enabled })',
    );
  });

  it("pins the broadcast event name to the backend const value", () => {
    expect(updaterPrefsSrc).toContain(
      'UPDATER_NOTIFICATIONS_ENABLED_EVENT = "updater-notifications-enabled"',
    );
  });
});
