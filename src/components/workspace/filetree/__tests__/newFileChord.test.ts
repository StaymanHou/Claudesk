import { describe, it, expect } from "vitest";
import { isNewFileChord } from "../newFileChord";
import { isFinderChord } from "../../finder/finderChord";

// QoL-WP5 — ⌘N (new file) must match bare Cmd+N and must NOT collide with WP6's ⌘⇧N
// (new workspace) or the bare ⌘P finder. These pin the chord boundaries.

describe("isNewFileChord — bare Cmd+N", () => {
  it("matches bare Cmd+N (no shift)", () => {
    expect(isNewFileChord({ metaKey: true, shiftKey: false, key: "n" })).toBe(
      true,
    );
  });

  it("does NOT match Cmd+Shift+N (that is WP6's new-workspace chord)", () => {
    expect(isNewFileChord({ metaKey: true, shiftKey: true, key: "N" })).toBe(
      false,
    );
  });

  it("does NOT match plain 'n' without Cmd", () => {
    expect(isNewFileChord({ metaKey: false, shiftKey: false, key: "n" })).toBe(
      false,
    );
  });

  it("does NOT match Cmd + another key (e.g. P, the finder)", () => {
    expect(isNewFileChord({ metaKey: true, shiftKey: false, key: "p" })).toBe(
      false,
    );
  });

  it("is case-insensitive on the key (defensive)", () => {
    expect(isNewFileChord({ metaKey: true, shiftKey: false, key: "N" })).toBe(
      true,
    );
  });
});

describe("chord exclusivity — ⌘N vs the bare ⌘P finder", () => {
  it("bare ⌘N fires new-file ONLY (not the finder)", () => {
    const e = { metaKey: true, shiftKey: false, key: "n" };
    expect(isNewFileChord(e)).toBe(true);
    expect(isFinderChord(e)).toBe(false);
  });

  it("bare ⌘P fires the finder ONLY (not new-file)", () => {
    const e = { metaKey: true, shiftKey: false, key: "p" };
    expect(isFinderChord(e)).toBe(true);
    expect(isNewFileChord(e)).toBe(false);
  });
});
