import { describe, it, expect, beforeEach } from "vitest";
import {
  clampFontSize,
  nextFontSize,
  loadFontSize,
  saveFontSize,
  DEFAULT_FONT_PX,
  MIN_FONT_PX,
  MAX_FONT_PX,
  FONT_SIZE_KEY,
} from "../fontZoom";
import { DEFAULT_TERMINAL_FONT_PX } from "../../terminalFontZoom";

// An arbitrary in-range probe size for the clamp/step math — deliberately NOT the
// default (DEFAULT_FONT_PX), so these cases read as "any in-range integer" rather
// than implying a relationship to the default the way bare `13` literals did
// (Theme F: m6-wp8 SIBLING-TEST-BARE-LITERALS). Any value in (MIN, MAX) works.
const SAMPLE_PX = 13;

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

// Theme B (WP6): the editor default is DERIVED from the terminal default, not a re-typed
// literal — this pins that they can never silently drift apart (a single edit to either
// must keep them equal, or the editor zoom no longer ⌘0-resets to the terminal size).
describe("default-size parity with the terminal zoom", () => {
  it("DEFAULT_FONT_PX === DEFAULT_TERMINAL_FONT_PX", () => {
    expect(DEFAULT_FONT_PX).toBe(DEFAULT_TERMINAL_FONT_PX);
  });
});

describe("clampFontSize", () => {
  it("keeps in-range values (rounded)", () => {
    expect(clampFontSize(SAMPLE_PX)).toBe(SAMPLE_PX);
    expect(clampFontSize(SAMPLE_PX + 0.4)).toBe(SAMPLE_PX);
    expect(clampFontSize(SAMPLE_PX + 0.6)).toBe(SAMPLE_PX + 1);
  });
  it("clamps below min and above max", () => {
    expect(clampFontSize(MIN_FONT_PX - 5)).toBe(MIN_FONT_PX);
    expect(clampFontSize(MAX_FONT_PX + 99)).toBe(MAX_FONT_PX);
  });
  it("falls back to default for non-finite input", () => {
    expect(clampFontSize(NaN)).toBe(DEFAULT_FONT_PX);
    expect(clampFontSize(Infinity)).toBe(DEFAULT_FONT_PX);
  });
});

describe("nextFontSize", () => {
  it("grows on 'in', shrinks on 'out'", () => {
    expect(nextFontSize(SAMPLE_PX, "in")).toBe(SAMPLE_PX + 1);
    expect(nextFontSize(SAMPLE_PX, "out")).toBe(SAMPLE_PX - 1);
  });
  it("does not exceed bounds", () => {
    expect(nextFontSize(MAX_FONT_PX, "in")).toBe(MAX_FONT_PX);
    expect(nextFontSize(MIN_FONT_PX, "out")).toBe(MIN_FONT_PX);
  });
});

describe("loadFontSize / saveFontSize (persistence)", () => {
  it("returns default when the key is absent", () => {
    expect(loadFontSize(makeStorage())).toBe(DEFAULT_FONT_PX);
  });
  it("reads a previously saved, clamped value", () => {
    const s = makeStorage();
    saveFontSize(20, s);
    expect(s.getItem(FONT_SIZE_KEY)).toBe("20");
    expect(loadFontSize(s)).toBe(20);
  });
  it("clamps an out-of-range persisted value on read", () => {
    expect(loadFontSize(makeStorage({ [FONT_SIZE_KEY]: "999" }))).toBe(
      MAX_FONT_PX,
    );
    expect(loadFontSize(makeStorage({ [FONT_SIZE_KEY]: "1" }))).toBe(
      MIN_FONT_PX,
    );
  });
  it("falls back to default for a corrupt persisted value", () => {
    expect(loadFontSize(makeStorage({ [FONT_SIZE_KEY]: "not-a-number" }))).toBe(
      DEFAULT_FONT_PX,
    );
  });
  it("saveFontSize clamps before persisting", () => {
    const s = makeStorage();
    saveFontSize(100, s);
    expect(s.getItem(FONT_SIZE_KEY)).toBe(String(MAX_FONT_PX));
  });
  it("returns default and does not throw when storage is undefined", () => {
    expect(loadFontSize(undefined)).toBe(DEFAULT_FONT_PX);
    expect(() => saveFontSize(15, undefined)).not.toThrow();
  });
});

// Guard: a round-trip from a zoom sequence persists and reloads consistently.
describe("zoom round-trip", () => {
  let s: Storage;
  beforeEach(() => {
    s = makeStorage();
  });
  it("in, in, out lands at the expected size and persists it", () => {
    let px = loadFontSize(s); // DEFAULT_FONT_PX
    px = nextFontSize(px, "in"); // +1
    px = nextFontSize(px, "in"); // +2
    px = nextFontSize(px, "out"); // +1
    saveFontSize(px, s);
    expect(loadFontSize(s)).toBe(DEFAULT_FONT_PX + 1);
  });
});
