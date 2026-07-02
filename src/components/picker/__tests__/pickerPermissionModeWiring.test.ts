import { describe, it, expect } from "vitest";
// Source-text guard (the repo ?raw convention, as in menuBridge.test.ts): the picker
// dropdown's wiring to the shared cc-permission-mode source-of-truth is pinned
// structurally; the live selection + cross-surface sync is bridge-verified in
// verify-self, not re-asserted here.
import pickerSrc from "../ProjectPicker.tsx?raw";
import { CC_PERMISSION_MODE_OPTIONS } from "../../../cc/permissionMode";

// The picker permission-mode dropdown is the THIRD sync'd surface (alongside the native
// View-menu "Permission Mode" radio + App.tsx's menu handler). All surfaces share one
// source of truth: the backend `cc_permission_mode` setting, read via
// cc_get_permission_mode, mutated via cc_set_permission_mode, and broadcast on
// `cc-permission-mode`. These guards pin that contract so a refactor can't silently sever
// it (and that the dropdown replaced the old yolo checkbox — no cc_yolo names survive).
describe("picker permission-mode dropdown wires to the cc-permission-mode source of truth", () => {
  it("seeds its selected value from cc_get_permission_mode on mount", () => {
    expect(pickerSrc).toContain(
      'invoke<CcPermissionMode>("cc_get_permission_mode")',
    );
  });

  it("subscribes to the cc-permission-mode broadcast (stays in sync when the menu picks)", () => {
    expect(pickerSrc).toContain(
      "listen<CcPermissionMode>(CC_PERMISSION_MODE_EVENT",
    );
  });

  it("invokes cc_set_permission_mode on change (persists + re-broadcasts to the menu)", () => {
    expect(pickerSrc).toContain('invoke("cc_set_permission_mode"');
  });

  it("coerces reads so a stale persisted value falls back to the default", () => {
    expect(pickerSrc).toContain("coerceCcPermissionMode");
  });

  it("renders a <select> with a stable testid for live verify-self", () => {
    expect(pickerSrc).toContain('data-testid="picker-permission-mode"');
    expect(pickerSrc).toContain("<select");
  });

  it("renders one option per permission mode (all six)", () => {
    // The dropdown maps CC_PERMISSION_MODE_OPTIONS to <option>s.
    expect(CC_PERMISSION_MODE_OPTIONS).toHaveLength(6);
    expect(pickerSrc).toContain("CC_PERMISSION_MODE_OPTIONS.map");
  });

  it("no longer references the removed yolo names", () => {
    for (const stale of [
      "cc_get_yolo",
      "cc_set_yolo",
      "cc-yolo",
      "picker-yolo",
      "ccYolo",
    ]) {
      expect(pickerSrc).not.toContain(stale);
    }
  });
});
