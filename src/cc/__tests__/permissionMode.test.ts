import { describe, it, expect } from "vitest";
import {
  CC_PERMISSION_MODES,
  CC_PERMISSION_MODE_OPTIONS,
  DEFAULT_CC_PERMISSION_MODE,
  coerceCcPermissionMode,
  type CcPermissionMode,
} from "../permissionMode";

// permissionMode.ts is the pure (no React / no Tauri IPC) core of the friend-requested
// dropdown — its string values are the wire contract, byte-identical to the Rust
// `CcPermissionMode` serde rendering AND to CC's `--permission-mode` tokens. These tests
// pin the vocabulary + the coercion fallback that the picker + menu rely on. The Rust side
// pins the same six strings (cc_session::tests::cc_permission_mode_serde_matches_cli_tokens);
// this is the TS half of that end-to-end contract.
describe("permissionMode — the six CC permission modes", () => {
  // The exact wire tokens CC's `--permission-mode` flag accepts (from `claude --help`).
  const EXPECTED: readonly CcPermissionMode[] = [
    "default",
    "plan",
    "acceptEdits",
    "auto",
    "dontAsk",
    "bypassPermissions",
  ];

  it("exposes exactly the six modes, in coarse→permissive order", () => {
    expect(CC_PERMISSION_MODES).toEqual(EXPECTED);
    expect(CC_PERMISSION_MODE_OPTIONS.map((o) => o.value)).toEqual(EXPECTED);
  });

  it("pairs every mode with a human label (option list is the <option> source)", () => {
    expect(CC_PERMISSION_MODE_OPTIONS).toHaveLength(6);
    for (const opt of CC_PERMISSION_MODE_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
    // Labels mirror the Rust CheckMenuItem labels (app_menu::CC_PERMISSION_MODE_ITEMS).
    const byValue = Object.fromEntries(
      CC_PERMISSION_MODE_OPTIONS.map((o) => [o.value, o.label]),
    );
    expect(byValue.default).toBe("Default (ask each time)");
    expect(byValue.bypassPermissions).toBe("Bypass Permissions (yolo)");
  });

  it("defaults to `default` (CC's normal prompts) on first run", () => {
    expect(DEFAULT_CC_PERMISSION_MODE).toBe("default");
  });
});

describe("permissionMode — coerceCcPermissionMode (honest fallback)", () => {
  it("passes every known mode through unchanged", () => {
    for (const m of CC_PERMISSION_MODES) {
      expect(coerceCcPermissionMode(m)).toBe(m);
    }
  });

  it("falls back to the default for an unknown / stale / corrupt value", () => {
    // The picker + menu read persisted/broadcast values through this so a stale value
    // (e.g. a mode from a future build, or a hand-corrupted projects.json) never leaves
    // the dropdown in an impossible state.
    for (const bad of [
      "yolo", // the OLD vocabulary — must NOT round-trip
      "acceptedits", // wrong case
      "",
      "  default  ",
      null,
      undefined,
      42,
      {},
      ["default"],
    ]) {
      expect(coerceCcPermissionMode(bad)).toBe(DEFAULT_CC_PERMISSION_MODE);
    }
  });
});
