import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadCollapsed,
  saveCollapsed,
  FILMSTRIP_COLLAPSED_KEY,
} from "../filmstripCollapse";

describe("loadCollapsed / saveCollapsed", () => {
  // The vitest env has no DOM, so stub a minimal in-memory localStorage (the repo
  // pattern — see filmstripOrder.test.ts / filetree/__tests__/railWidth.test.ts).
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to expanded (false) when nothing is stored", () => {
    expect(loadCollapsed()).toBe(false);
  });

  it("round-trips collapsed=true", () => {
    saveCollapsed(true);
    expect(store[FILMSTRIP_COLLAPSED_KEY]).toBe("true");
    expect(loadCollapsed()).toBe(true);
  });

  it("round-trips collapsed=false", () => {
    saveCollapsed(false);
    expect(store[FILMSTRIP_COLLAPSED_KEY]).toBe("false");
    expect(loadCollapsed()).toBe(false);
  });

  it("treats any non-'true' stored value as expanded (false)", () => {
    store[FILMSTRIP_COLLAPSED_KEY] = "yes";
    expect(loadCollapsed()).toBe(false);
    store[FILMSTRIP_COLLAPSED_KEY] = "1";
    expect(loadCollapsed()).toBe(false);
    store[FILMSTRIP_COLLAPSED_KEY] = "";
    expect(loadCollapsed()).toBe(false);
  });

  it("falls back to false without throwing when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadCollapsed()).not.toThrow();
    expect(loadCollapsed()).toBe(false);
  });

  it("swallows storage errors on save (best-effort)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {},
    });
    expect(() => saveCollapsed(true)).not.toThrow();
  });
});
