import { describe, it, expect } from "vitest";
import {
  shouldAutoNotify,
  manualCheckOutcome,
  type NotifyPrefs,
} from "../updateNotifyState";
import type { UpdateCheckResult } from "../updaterPrefs";

// Builders keep each case one expressive line — vary only the axis under test.
function result(over: Partial<UpdateCheckResult> = {}): UpdateCheckResult {
  return {
    current_version: "0.2.5",
    available_version: "0.2.6",
    status: "Update available: 0.2.5 → 0.2.6",
    install_source: "direct-download",
    ...over,
  };
}
function prefs(over: Partial<NotifyPrefs> = {}): NotifyPrefs {
  return { notificationsEnabled: true, skippedVersion: null, ...over };
}

describe("shouldAutoNotify — the auto-check-on-launch gate", () => {
  it("notifies for a direct-download newer version, notifications ON, not skipped", () => {
    expect(shouldAutoNotify(result(), prefs())).toBe(true);
  });

  it("does NOT notify when notifications are OFF (even with an update available)", () => {
    expect(shouldAutoNotify(result(), prefs({ notificationsEnabled: false }))).toBe(
      false,
    );
  });

  it("does NOT notify when the available version equals the skipped version", () => {
    expect(
      shouldAutoNotify(
        result({ available_version: "0.2.6" }),
        prefs({ skippedVersion: "0.2.6" }),
      ),
    ).toBe(false);
  });

  it("DOES notify when a version NEWER than the skipped one is available (skip is per-tag, not a floor)", () => {
    expect(
      shouldAutoNotify(
        result({ available_version: "0.2.7" }),
        prefs({ skippedVersion: "0.2.6" }),
      ),
    ).toBe(true);
  });

  it("does NOT notify when up to date (available_version null)", () => {
    expect(shouldAutoNotify(result({ available_version: null }), prefs())).toBe(false);
  });

  it("DOES notify for a Homebrew install with a newer version (reshaped M10 WP6 — symmetric with direct)", () => {
    // Reshaped M10 WP6: brew is no longer suppressed here — a brew user gets the same
    // auto-notify as direct-download when a newer version exists (the banner then shows a
    // copy-to-clipboard `brew upgrade` affordance instead of an Update button). The gate is
    // now install-source-agnostic: {enabled, newer, not-skipped} alone.
    expect(
      shouldAutoNotify(
        result({ install_source: "homebrew", available_version: "0.2.6" }),
        prefs(),
      ),
    ).toBe(true);
  });

  it("still suppresses a Homebrew install when disabled / skipped / up-to-date (source-agnostic gate)", () => {
    // The reshape only dropped the source check — the other suppressors still apply to brew.
    expect(
      shouldAutoNotify(
        result({ install_source: "homebrew", available_version: "0.2.6" }),
        prefs({ notificationsEnabled: false }),
      ),
    ).toBe(false);
    expect(
      shouldAutoNotify(
        result({ install_source: "homebrew", available_version: "0.2.6" }),
        prefs({ skippedVersion: "0.2.6" }),
      ),
    ).toBe(false);
    expect(
      shouldAutoNotify(
        result({ install_source: "homebrew", available_version: null }),
        prefs(),
      ),
    ).toBe(false);
  });

  it("OFF pref beats an available update AND a fresh (unskipped) version", () => {
    expect(
      shouldAutoNotify(
        result({ available_version: "0.9.9" }),
        prefs({ notificationsEnabled: false, skippedVersion: "0.2.6" }),
      ),
    ).toBe(false);
  });
});

describe("manualCheckOutcome — a manual check ignores skip + disable, reports the truth", () => {
  it("classifies a direct-download newer version as update-available", () => {
    expect(manualCheckOutcome(result())).toBe("update-available");
  });

  it("re-offers the SKIPPED version on a manual check (skip does not suppress manual)", () => {
    // manualCheckOutcome takes no prefs — a manual check is skip-agnostic by construction.
    expect(manualCheckOutcome(result({ available_version: "0.2.6" }))).toBe(
      "update-available",
    );
  });

  it("classifies up-to-date (available_version null, direct-download)", () => {
    expect(manualCheckOutcome(result({ available_version: null }))).toBe("up-to-date");
  });

  it("classifies a Homebrew install by version, same as direct-download (reshaped M10 WP6)", () => {
    // Reshaped M10 WP6: the `brew-defer` outcome is retired. A brew install classifies by
    // available_version exactly like direct-download — brew+available → update-available,
    // brew+none → up-to-date. The brew-ness rides result.install_source (the banner branches
    // on it for the copy affordance), NOT a separate outcome.
    expect(
      manualCheckOutcome(result({ install_source: "homebrew", available_version: "0.2.6" })),
    ).toBe("update-available");
    expect(
      manualCheckOutcome(result({ install_source: "homebrew", available_version: null })),
    ).toBe("up-to-date");
  });
});
