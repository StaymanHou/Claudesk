// The "Claude Code" settings group's body: the permission mode new sessions start with.
// The group shell (id, title, hint, order) stays in SettingsPanel.tsx.

import { useSettingControl } from "./useSettingControl";
import {
  CC_PERMISSION_MODE_EVENT,
  CC_PERMISSION_MODE_OPTIONS,
  DEFAULT_CC_PERMISSION_MODE,
  coerceCcPermissionMode,
  type CcPermissionMode,
} from "../../cc/permissionMode";
import {
  getCcPermissionMode,
  setCcPermissionMode,
} from "../../cc/permissionModeIpc";

export function ClaudeCodeSettings({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const permissionMode = useSettingControl<CcPermissionMode>({
    initial: DEFAULT_CC_PERMISSION_MODE,
    get: getCcPermissionMode,
    persist: setCcPermissionMode,
    event: CC_PERMISSION_MODE_EVENT,
    errorLabel: "update permission mode",
    onError,
    // A stale/corrupt persisted value falls back to the default rather than selecting an
    // impossible option (behavior carried over from the picker dropdown).
    coerce: coerceCcPermissionMode,
  });

  return (
    <>
      <label className="settings-row">
        <span className="settings-row-label">Permission mode</span>
        <select
          data-testid="settings-permission-mode"
          aria-label="Permission mode"
          value={permissionMode.value}
          onChange={(e) =>
            permissionMode.set(coerceCcPermissionMode(e.target.value))
          }
        >
          {CC_PERMISSION_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {/* F-b (operator ruling 2026-09-23): a non-default profile's OWN
          permissions.defaultMode governs its sessions — Claudesk passes no
          --permission-mode for it. Said here, or this control reads as broken. */}
      <p
        className="settings-row-help"
        data-testid="settings-permission-mode-profile-note"
      >
        Applies to the <code>default</code> profile. A project on another
        profile uses that profile&apos;s own{" "}
        <code>permissions.defaultMode</code>.
      </p>
    </>
  );
}
