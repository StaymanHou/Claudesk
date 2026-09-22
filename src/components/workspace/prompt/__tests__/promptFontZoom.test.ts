import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_PROMPT_FONT_PX,
  MIN_PROMPT_FONT_PX,
  MAX_PROMPT_FONT_PX,
  PROMPT_FONT_SIZE_KEY,
  clampPromptFontSize,
  loadPromptFontSize,
  nextFontSize,
  savePromptFontSize,
} from "../promptFontZoom";
import { DEFAULT_FONT_PX, FONT_SIZE_KEY } from "../../editor/fontZoom";

/** A minimal in-memory Storage double — the repo convention for zoom tests. */
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

describe("promptFontZoom — key isolation from the editor's zoom", () => {
  it("uses its OWN storage key, not the editor's", () => {
    // ⚠️ THE POINT OF THIS MODULE. A prose surface and a code surface are read at
    // different distances; sharing one key would mean zooming the draft silently
    // resized every code file. Asserted as a NON-equality against the editor's real
    // exported key, so renaming either one cannot make this pass by coincidence.
    expect(PROMPT_FONT_SIZE_KEY).not.toBe(FONT_SIZE_KEY);
    expect(PROMPT_FONT_SIZE_KEY).toBe("claudesk.prompt.fontSize");
  });

  it("a prompt save does not write the editor's key, and vice versa", () => {
    // The behavioural half of the assertion above: the keys differing on paper does not
    // prove the module USES its own. This drives the real save and inspects both keys.
    const storage = fakeStorage();
    savePromptFontSize(19, storage);

    expect(storage.getItem(PROMPT_FONT_SIZE_KEY)).toBe("19");
    expect(
      storage.getItem(FONT_SIZE_KEY),
      "saving the prompt zoom must not touch the editor's persisted size",
    ).toBeNull();
  });

  it("reads back only its own key — an editor-only store yields the default", () => {
    // The reverse direction. A store holding ONLY the editor's key must give the prompt
    // panel its default, not the editor's size. ⚠️ The seeded value is deliberately NOT
    // the default (a fixture where right and wrong answers coincide proves nothing —
    // `docs/lessons/source-text-guards.md` entry 15).
    const otherSize = DEFAULT_PROMPT_FONT_PX + 5;
    const storage = fakeStorage({ [FONT_SIZE_KEY]: String(otherSize) });

    expect(loadPromptFontSize(storage)).toBe(DEFAULT_PROMPT_FONT_PX);
    expect(loadPromptFontSize(storage)).not.toBe(otherSize);
  });
});

describe("promptFontZoom — the default is SHARED, not re-typed", () => {
  it("derives its default from the editor's exported constant", () => {
    // Only the PERSISTED value is separate; the starting size is shared so a fresh
    // Prompt panel, a fresh editor and the terminals all mount at the same size. A
    // re-typed literal here would let them drift silently.
    expect(DEFAULT_PROMPT_FONT_PX).toBe(DEFAULT_FONT_PX);
  });
});

describe("promptFontZoom — clamp and step", () => {
  it("clamps below the minimum and above the maximum", () => {
    expect(clampPromptFontSize(MIN_PROMPT_FONT_PX - 10)).toBe(
      MIN_PROMPT_FONT_PX,
    );
    expect(clampPromptFontSize(MAX_PROMPT_FONT_PX + 10)).toBe(
      MAX_PROMPT_FONT_PX,
    );
  });

  it("leaves an in-range size untouched", () => {
    const mid = Math.floor((MIN_PROMPT_FONT_PX + MAX_PROMPT_FONT_PX) / 2);
    expect(clampPromptFontSize(mid)).toBe(mid);
  });

  it("steps in and out by one px", () => {
    const mid = Math.floor((MIN_PROMPT_FONT_PX + MAX_PROMPT_FONT_PX) / 2);
    expect(nextFontSize(mid, "in")).toBe(mid + 1);
    expect(nextFontSize(mid, "out")).toBe(mid - 1);
  });

  it("does not step past either bound", () => {
    expect(nextFontSize(MAX_PROMPT_FONT_PX, "in")).toBe(MAX_PROMPT_FONT_PX);
    expect(nextFontSize(MIN_PROMPT_FONT_PX, "out")).toBe(MIN_PROMPT_FONT_PX);
  });
});

describe("promptFontZoom — never throws", () => {
  beforeEach(() => {
    /* each test builds its own storage double */
  });

  it("returns the default when storage is unavailable", () => {
    expect(loadPromptFontSize(undefined)).toBe(DEFAULT_PROMPT_FONT_PX);
  });

  it("returns the default for an unparseable stored value", () => {
    const storage = fakeStorage({ [PROMPT_FONT_SIZE_KEY]: "not-a-number" });
    expect(loadPromptFontSize(storage)).toBe(DEFAULT_PROMPT_FONT_PX);
  });

  it("clamps an out-of-range stored value rather than honouring it", () => {
    const storage = fakeStorage({
      [PROMPT_FONT_SIZE_KEY]: String(MAX_PROMPT_FONT_PX + 100),
    });
    const got = loadPromptFontSize(storage);
    expect(got).toBeLessThanOrEqual(MAX_PROMPT_FONT_PX);
    expect(got).toBeGreaterThanOrEqual(MIN_PROMPT_FONT_PX);
  });

  it("a save to unavailable storage is a silent no-op, not a throw", () => {
    expect(() => savePromptFontSize(14, undefined)).not.toThrow();
  });
});
