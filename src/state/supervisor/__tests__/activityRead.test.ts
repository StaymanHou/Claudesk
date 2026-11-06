// @vitest-environment jsdom
// Paydown 2026-11-04 WP12 — the activity-record READ distinguishes "failed" from "empty".
// `tryReadActivityLines` answers `null` for a failure, which is what lets the mount seed leave a
// project unseeded and retry; `readActivityLines` keeps the old `[]`-on-failure contract for the
// popover, which only lists.
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { readActivityLines, tryReadActivityLines } from "../activityRecorder";

function answer(fn: () => unknown) {
  mockIPC((cmd) => {
    if (cmd !== "supervisor_activity_read") return null;
    return fn();
  });
}

afterEach(() => {
  clearMocks();
  vi.restoreAllMocks();
});

describe("tryReadActivityLines", () => {
  it("returns the lines when the read answers a list (positive control)", async () => {
    answer(() => ["a", "b"]);
    expect(await tryReadActivityLines(10)).toEqual(["a", "b"]);
  });

  it("an empty list is a SUCCESSFUL read, not a failure", async () => {
    answer(() => []);
    expect(await tryReadActivityLines(10)).toEqual([]);
  });

  it("a rejected read is null, and is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    answer(() => {
      throw new Error("io");
    });
    expect(await tryReadActivityLines(10)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("an answer that is not a list is null, not an empty log", async () => {
    answer(() => ({ unexpected: true }));
    expect(await tryReadActivityLines(10)).toBeNull();
  });
});

describe("readActivityLines (the popover's reader)", () => {
  it("reads a failure as an empty list and never rejects", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    answer(() => {
      throw new Error("io");
    });
    await expect(readActivityLines(10)).resolves.toEqual([]);
  });

  it("passes a successful read through", async () => {
    answer(() => ["x"]);
    expect(await readActivityLines(10)).toEqual(["x"]);
  });
});
