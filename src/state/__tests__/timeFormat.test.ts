import { describe, it, expect } from "vitest";
import { relativeTime } from "../timeFormat";

describe("relativeTime", () => {
  const now = 1_000_000_000;
  it("clamps sub-minute (and future) to 'just now'", () => {
    expect(relativeTime(now, now)).toBe("just now");
    expect(relativeTime(now - 30, now)).toBe("just now");
    expect(relativeTime(now + 500, now)).toBe("just now"); // clock skew → clamp
  });
  it("formats minutes / hours / days / months / years", () => {
    expect(relativeTime(now - 5 * 60, now)).toBe("5m ago");
    expect(relativeTime(now - 3 * 3600, now)).toBe("3h ago");
    expect(relativeTime(now - 2 * 86400, now)).toBe("2d ago");
    expect(relativeTime(now - 60 * 86400, now)).toBe("2mo ago");
    expect(relativeTime(now - 400 * 86400, now)).toBe("1y ago");
  });
});
