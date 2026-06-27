import { describe, it, expect, beforeEach } from "vitest";
import {
  clampTerminalFontSize,
  nextTerminalFontSize,
  loadTerminalFontSize,
  saveTerminalFontSize,
  terminalZoomForChord,
  DEFAULT_TERMINAL_FONT_PX,
  MIN_TERMINAL_FONT_PX,
  MAX_TERMINAL_FONT_PX,
  TERMINAL_FONT_SIZE_KEY,
} from "../terminalFontZoom";

// A minimal in-memory Storage stand-in for the persistence tests (no jsdom
// localStorage dependency; the functions accept an injected Storage).
function makeStorage(initial?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("clampTerminalFontSize", () => {
  it("keeps in-range values (rounded)", () => {
    expect(clampTerminalFontSize(11)).toBe(11);
    expect(clampTerminalFontSize(11.4)).toBe(11);
    expect(clampTerminalFontSize(11.6)).toBe(12);
  });
  it("clamps below min and above max", () => {
    expect(clampTerminalFontSize(MIN_TERMINAL_FONT_PX - 5)).toBe(
      MIN_TERMINAL_FONT_PX,
    );
    expect(clampTerminalFontSize(MAX_TERMINAL_FONT_PX + 99)).toBe(
      MAX_TERMINAL_FONT_PX,
    );
  });
  it("falls back to default for non-finite input", () => {
    expect(clampTerminalFontSize(NaN)).toBe(DEFAULT_TERMINAL_FONT_PX);
    expect(clampTerminalFontSize(Infinity)).toBe(DEFAULT_TERMINAL_FONT_PX);
  });
});

describe("nextTerminalFontSize", () => {
  it("grows on 'in', shrinks on 'out'", () => {
    expect(nextTerminalFontSize(11, "in")).toBe(12);
    expect(nextTerminalFontSize(11, "out")).toBe(10);
  });
  it("does not exceed bounds", () => {
    expect(nextTerminalFontSize(MAX_TERMINAL_FONT_PX, "in")).toBe(
      MAX_TERMINAL_FONT_PX,
    );
    expect(nextTerminalFontSize(MIN_TERMINAL_FONT_PX, "out")).toBe(
      MIN_TERMINAL_FONT_PX,
    );
  });
});

describe("loadTerminalFontSize / saveTerminalFontSize (persistence)", () => {
  it("returns default (11) when the key is absent — first run matches the old hardcode", () => {
    expect(loadTerminalFontSize(makeStorage())).toBe(DEFAULT_TERMINAL_FONT_PX);
    expect(DEFAULT_TERMINAL_FONT_PX).toBe(11);
  });
  it("reads a previously saved, clamped value", () => {
    const s = makeStorage();
    saveTerminalFontSize(18, s);
    expect(s.getItem(TERMINAL_FONT_SIZE_KEY)).toBe("18");
    expect(loadTerminalFontSize(s)).toBe(18);
  });
  it("clamps an out-of-range persisted value on read", () => {
    expect(loadTerminalFontSize(makeStorage({ [TERMINAL_FONT_SIZE_KEY]: "999" }))).toBe(
      MAX_TERMINAL_FONT_PX,
    );
    expect(loadTerminalFontSize(makeStorage({ [TERMINAL_FONT_SIZE_KEY]: "1" }))).toBe(
      MIN_TERMINAL_FONT_PX,
    );
  });
  it("falls back to default for a corrupt persisted value", () => {
    expect(
      loadTerminalFontSize(makeStorage({ [TERMINAL_FONT_SIZE_KEY]: "not-a-number" })),
    ).toBe(DEFAULT_TERMINAL_FONT_PX);
  });
  it("saveTerminalFontSize clamps before persisting", () => {
    const s = makeStorage();
    saveTerminalFontSize(100, s);
    expect(s.getItem(TERMINAL_FONT_SIZE_KEY)).toBe(String(MAX_TERMINAL_FONT_PX));
  });
  it("returns default and does not throw when storage is undefined", () => {
    expect(loadTerminalFontSize(undefined)).toBe(DEFAULT_TERMINAL_FONT_PX);
    expect(() => saveTerminalFontSize(15, undefined)).not.toThrow();
  });
});

describe("terminalZoomForChord", () => {
  it("maps ⌘= and ⌘+ to 'in' (both shifted/unshifted plus key)", () => {
    expect(terminalZoomForChord({ metaKey: true, key: "=" })).toBe("in");
    expect(terminalZoomForChord({ metaKey: true, key: "+" })).toBe("in");
  });
  it("maps ⌘- to 'out'", () => {
    expect(terminalZoomForChord({ metaKey: true, key: "-" })).toBe("out");
  });
  it("maps ⌘0 to 'reset'", () => {
    expect(terminalZoomForChord({ metaKey: true, key: "0" })).toBe("reset");
  });
  it("returns null without the meta key (a bare = / - / 0 is normal typing)", () => {
    expect(terminalZoomForChord({ metaKey: false, key: "=" })).toBeNull();
    expect(terminalZoomForChord({ metaKey: false, key: "-" })).toBeNull();
    expect(terminalZoomForChord({ metaKey: false, key: "0" })).toBeNull();
  });
  it("returns null for unrelated ⌘ chords (so the listener stays out of their way)", () => {
    expect(terminalZoomForChord({ metaKey: true, key: "p" })).toBeNull();
    expect(terminalZoomForChord({ metaKey: true, key: "s" })).toBeNull();
    expect(terminalZoomForChord({ metaKey: true, key: "1" })).toBeNull();
  });
});

// Guard: a round-trip from a zoom sequence persists and reloads consistently.
describe("zoom round-trip", () => {
  let s: Storage;
  beforeEach(() => {
    s = makeStorage();
  });
  it("in, in, out lands at the expected size and persists it", () => {
    let px = loadTerminalFontSize(s); // 11
    px = nextTerminalFontSize(px, "in"); // 12
    px = nextTerminalFontSize(px, "in"); // 13
    px = nextTerminalFontSize(px, "out"); // 12
    saveTerminalFontSize(px, s);
    expect(loadTerminalFontSize(s)).toBe(12);
  });
});
