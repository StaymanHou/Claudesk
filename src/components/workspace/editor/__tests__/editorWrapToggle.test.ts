import { describe, it, expect } from "vitest";
import {
  loadWrap,
  saveWrap,
  DEFAULT_WRAP,
  LINE_WRAP_KEY,
} from "../editorWrapToggle";

// A minimal in-memory Storage stand-in (same pattern as fontZoom.test.ts; the
// functions accept an injected Storage so no jsdom localStorage is needed).
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

describe("loadWrap / saveWrap (persistence)", () => {
  it("defaults to OFF and exposes that as DEFAULT_WRAP", () => {
    expect(DEFAULT_WRAP).toBe(false);
    expect(loadWrap(makeStorage())).toBe(false);
  });

  it("round-trips true and false", () => {
    const s = makeStorage();
    saveWrap(true, s);
    expect(s.getItem(LINE_WRAP_KEY)).toBe("true");
    expect(loadWrap(s)).toBe(true);

    saveWrap(false, s);
    expect(s.getItem(LINE_WRAP_KEY)).toBe("false");
    expect(loadWrap(s)).toBe(false);
  });

  it("falls back to the default for a corrupt / unexpected persisted value", () => {
    expect(loadWrap(makeStorage({ [LINE_WRAP_KEY]: "yes" }))).toBe(
      DEFAULT_WRAP,
    );
    expect(loadWrap(makeStorage({ [LINE_WRAP_KEY]: "1" }))).toBe(DEFAULT_WRAP);
    expect(loadWrap(makeStorage({ [LINE_WRAP_KEY]: "" }))).toBe(DEFAULT_WRAP);
  });

  it("returns default and does not throw when storage is undefined", () => {
    expect(loadWrap(undefined)).toBe(DEFAULT_WRAP);
    expect(() => saveWrap(true, undefined)).not.toThrow();
  });
});
