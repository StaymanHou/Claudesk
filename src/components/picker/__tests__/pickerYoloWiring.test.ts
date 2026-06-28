import { describe, it, expect } from "vitest";
// Source-text guard (the repo ?raw convention, as in menuBridge.test.ts): the picker
// checkbox's wiring to the shared cc-yolo source-of-truth is pinned structurally; the
// live toggle + cross-surface sync is bridge-verified in verify-self, not re-asserted here.
import pickerSrc from "../ProjectPicker.tsx?raw";

// M6 WP7 Phase 3 — the picker yolo checkbox is the THIRD sync'd surface (alongside the
// native View-menu item + App.tsx's ccYoloRef). All three share one source of truth: the
// backend `cc_yolo` setting, read via cc_get_yolo, mutated via cc_set_yolo, and broadcast
// on `cc-yolo`. These guards pin that contract so a refactor can't silently sever it.
describe("M6 WP7 Phase 3 — picker yolo checkbox wires to the cc-yolo source of truth", () => {
  it("seeds its checked-state from cc_get_yolo on mount", () => {
    expect(pickerSrc).toContain('invoke<boolean>("cc_get_yolo")');
  });

  it("subscribes to the cc-yolo broadcast (stays in sync when the menu toggles)", () => {
    expect(pickerSrc).toContain('listen<boolean>("cc-yolo"');
  });

  it("invokes cc_set_yolo on change (which persists + re-broadcasts to the menu)", () => {
    expect(pickerSrc).toContain('invoke("cc_set_yolo"');
  });

  it("labels the checkbox identically to the native View-menu item", () => {
    // Byte-match so both surfaces obviously control one setting (matches app_menu's
    // CheckMenuItem label "Skip Permission Prompts (yolo)").
    expect(pickerSrc).toContain("Skip Permission Prompts (yolo)");
  });

  it("renders the checkbox with a stable testid for live verify-self", () => {
    expect(pickerSrc).toContain('data-testid="picker-yolo"');
    expect(pickerSrc).toContain('type="checkbox"');
  });
});
