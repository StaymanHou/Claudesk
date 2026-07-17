import { describe, it, expect, vi, afterEach } from "vitest";
import { BREW_UPGRADE_CMD, copyToClipboard } from "../copyToClipboard";

// M10 WP6 Phase 2 — the banner's Homebrew copy-to-clipboard helper. Pure enough to unit
// test by stubbing navigator.clipboard (the vitest env has no real clipboard). We assert:
// the exact command string, the success path via the async Clipboard API, and the
// never-throws contract (a rejecting/absent API returns false rather than blowing up).

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BREW_UPGRADE_CMD — the single source of truth for the brew command", () => {
  it("is exactly `brew upgrade claudesk`", () => {
    expect(BREW_UPGRADE_CMD).toBe("brew upgrade claudesk");
  });
});

describe("copyToClipboard", () => {
  it("writes the text via the async Clipboard API and returns true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const ok = await copyToClipboard(BREW_UPGRADE_CMD);
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("brew upgrade claudesk");
  });

  it("returns false (never throws) when the Clipboard API rejects AND no DOM fallback", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    // navigator present but document absent → both paths fail gracefully → false.
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", undefined);
    const ok = await copyToClipboard(BREW_UPGRADE_CMD);
    expect(ok).toBe(false);
  });

  it("returns false when navigator.clipboard is absent AND no DOM fallback", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", undefined);
    const ok = await copyToClipboard("anything");
    expect(ok).toBe(false);
  });
});
