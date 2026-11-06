// The "Updates" settings group's body: the notification switch and the manual check.

import { useSettingControl } from "./useSettingControl";
import {
  UPDATER_NOTIFICATIONS_ENABLED_EVENT,
  getUpdateNotificationsEnabled,
  setUpdateNotificationsEnabled,
} from "../../updater/updaterPrefs";

export function UpdatesSettings({
  onError,
  onCheckForUpdates,
}: {
  onError: (message: string) => void;
  /** Optional: the button hides when App hasn't wired it. See `SettingsPanelProps`. */
  onCheckForUpdates?: () => void;
}) {
  const updateNotifications = useSettingControl<boolean>({
    initial: true, // backend default is ON (operator-benefit default)
    get: getUpdateNotificationsEnabled,
    persist: setUpdateNotificationsEnabled,
    event: UPDATER_NOTIFICATIONS_ENABLED_EVENT,
    errorLabel: "update notification setting",
    onError,
  });

  return (
    <>
      <label className="settings-row settings-row-check">
        <input
          type="checkbox"
          data-testid="settings-update-notifications"
          checked={updateNotifications.value}
          onChange={(e) => updateNotifications.set(e.target.checked)}
        />
        <span className="settings-row-label">Update notifications</span>
      </label>
      {onCheckForUpdates && (
        <button
          type="button"
          className="settings-check-updates"
          data-testid="settings-check-updates"
          onClick={onCheckForUpdates}
        >
          Check for updates
        </button>
      )}
    </>
  );
}
