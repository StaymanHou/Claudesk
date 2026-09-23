import { describe, expect, it } from "vitest";

import {
  PROMPT_DICTATED_WRAP_KEY,
  loadDictatedWrap,
  saveDictatedWrap,
} from "../promptDictatedWrap";

/** A minimal in-memory Storage — no DOM environment needed. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
} as unknown as Storage;

describe("promptDictatedWrap — the persisted toggle (paydown WP10)", () => {
  it("defaults to ON when nothing is stored", () => {
    expect(loadDictatedWrap(memoryStorage())).toBe(true);
    expect(loadDictatedWrap(undefined)).toBe(true);
  });

  it("reads OFF only for the literal 'false'; anything else falls back to ON", () => {
    expect(
      loadDictatedWrap(memoryStorage({ [PROMPT_DICTATED_WRAP_KEY]: "false" })),
    ).toBe(false);
    expect(
      loadDictatedWrap(
        memoryStorage({ [PROMPT_DICTATED_WRAP_KEY]: "garbage" }),
      ),
    ).toBe(true);
  });

  it("round-trips both values under its own key", () => {
    const s = memoryStorage();
    saveDictatedWrap(false, s);
    expect(s.getItem(PROMPT_DICTATED_WRAP_KEY)).toBe("false");
    expect(loadDictatedWrap(s)).toBe(false);
    saveDictatedWrap(true, s);
    expect(loadDictatedWrap(s)).toBe(true);
  });

  it("never throws on a storage that denies access, and reads ON", () => {
    expect(loadDictatedWrap(throwing)).toBe(true);
    expect(() => saveDictatedWrap(false, throwing)).not.toThrow();
  });
});
