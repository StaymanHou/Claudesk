import { describe, it, expect } from "vitest";
import {
  updateConfirmSpec,
  progressPercent,
  quarantineFallbackSpec,
  QUARANTINE_FALLBACK_ACTIVE,
  statusNoteForOutcome,
  statusNoteForCheckError,
} from "../updateFlowState";
import type { DownloadProgress } from "../updaterPrefs";

describe("updateConfirmSpec — the Update & relaunch? confirm dialog", () => {
  it("weaves the version in, Update is primary, Cancel is the Esc-safe default", () => {
    const spec = updateConfirmSpec("0.2.6");
    expect(spec.message).toContain("0.2.6");
    expect(spec.message).toContain("relaunch");
    const update = spec.buttons.find((b) => b.value === "update");
    const cancel = spec.buttons.find((b) => b.value === "cancel");
    expect(update?.variant).toBe("primary");
    expect(cancel).toBeDefined();
    // Esc → cancel: cancelling before apply leaves the running app untouched.
    expect(spec.escValue).toBe("cancel");
  });
});

describe("progressPercent — download % from a DownloadProgress", () => {
  function p(over: Partial<DownloadProgress> = {}): DownloadProgress {
    return { downloaded: 0, total: 100, done: false, ...over };
  }

  it("computes a rounded percent from downloaded/total", () => {
    expect(progressPercent(p({ downloaded: 50, total: 200 }))).toBe(25);
    expect(progressPercent(p({ downloaded: 1, total: 3 }))).toBe(33);
  });

  it("returns null (indeterminate) when total is null or non-positive", () => {
    expect(progressPercent(p({ downloaded: 10, total: null }))).toBeNull();
    expect(progressPercent(p({ downloaded: 10, total: 0 }))).toBeNull();
  });

  it("done pins 100 regardless of the byte counts (the on_download_finish emit)", () => {
    expect(progressPercent(p({ downloaded: 0, total: null, done: true }))).toBe(100);
    expect(progressPercent(p({ downloaded: 5, total: 100, done: true }))).toBe(100);
  });

  it("clamps to [0,100] when a server over/under-reports", () => {
    expect(progressPercent(p({ downloaded: 500, total: 100 }))).toBe(100);
    expect(progressPercent(p({ downloaded: 0, total: 100 }))).toBe(0);
  });
});

describe("quarantineFallbackSpec — the WP1-fallback instruct-user dialog", () => {
  it("shows the exact xattr command for the given bundle, single OK ack", () => {
    const spec = quarantineFallbackSpec("/Applications/Claudesk.app");
    expect(spec.message).toContain("xattr -dr com.apple.quarantine");
    expect(spec.message).toContain("/Applications/Claudesk.app");
    expect(spec.buttons).toHaveLength(1);
    expect(spec.buttons[0].value).toBe("ok");
    expect(spec.escValue).toBe("ok"); // Esc acknowledges (there's only one action)
  });
});

describe("QUARANTINE_FALLBACK_ACTIVE — the WP1 seam default", () => {
  it("defaults to the GO path (false — updater_apply self-clears, WP6 flips if needed)", () => {
    // Operator Q4 decision: build the fallback seam now, default OFF. WP6 flips this
    // one const to true if the live Gatekeeper verdict requires the instruct-user path.
    expect(QUARANTINE_FALLBACK_ACTIVE).toBe(false);
  });
});

// WP6 P1.4 — the manual-check outcome → App-level status note mapping. This is the
// feedback the native-menu "Check for Updates…" path had no surface for (App.tsx has no
// toast like the picker: SURFACE-2026-07-17-QUALITY-WP4-MENU-CHECK-DISCARDS-OUTCOME).
describe("statusNoteForOutcome — manual-check outcome → App status note", () => {
  it("returns null for update-available (the banner surfaces it — no duplicate note)", () => {
    expect(statusNoteForOutcome("update-available")).toBeNull();
  });

  it("returns an info 'up to date' note for up-to-date", () => {
    const note = statusNoteForOutcome("up-to-date");
    expect(note).toEqual({ kind: "info", message: "Claudesk is up to date." });
  });

  // Reshaped M10 WP6: the `brew-defer` outcome is retired (brew now classifies as
  // update-available / up-to-date like direct-download; the brew-specific `brew upgrade`
  // affordance moved into the banner's isBrew branch). statusNoteForOutcome only handles
  // the two remaining outcomes — a brew "update available" shows the banner (null note),
  // a brew "up to date" is just the shared up-to-date note.

  it("statusNoteForCheckError returns an error-kind 'could not check' note", () => {
    const note = statusNoteForCheckError();
    expect(note.kind).toBe("error");
    expect(note.message).toContain("Could not check for updates");
  });
});
