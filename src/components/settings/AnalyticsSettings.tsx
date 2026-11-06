// The "Analytics" settings group's body: the time-tracking switch. The group shell, including
// the hint that carries the offline/whole-Mac copy, stays in SettingsPanel.tsx.

import { useSettingControl } from "./useSettingControl";
import {
  TIME_TRACKING_ENABLED_EVENT,
  getTimeTrackingEnabled,
  setTimeTrackingEnabled,
} from "../../state/timeAnalytics";

export function AnalyticsSettings({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const timeTracking = useSettingControl<boolean>({
    initial: false, // matches the backend default — no flicker on mount
    get: getTimeTrackingEnabled,
    persist: setTimeTrackingEnabled,
    event: TIME_TRACKING_ENABLED_EVENT,
    errorLabel: "update time tracking",
    onError,
  });

  return (
    <label className="settings-row settings-row-check">
      <input
        type="checkbox"
        data-testid="settings-time-tracking"
        checked={timeTracking.value}
        onChange={(e) => timeTracking.set(e.target.checked)}
      />
      <span className="settings-row-label">Time tracking</span>
    </label>
  );
}
