import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSplitState,
  saveSplitState,
  gridColumnsFor,
  cycleRatio,
  toggleCollapse,
  DEFAULT_SPLIT,
  SPLIT_STATE_KEY,
  type SplitState,
} from "../splitWidth";

describe("gridColumnsFor", () => {
  it("maps each non-collapsed ratio to its fr track", () => {
    expect(gridColumnsFor({ collapsed: "none", ratio: "3:1" })).toBe("3fr 1fr");
    expect(gridColumnsFor({ collapsed: "none", ratio: "2:2" })).toBe("1fr 1fr");
    expect(gridColumnsFor({ collapsed: "none", ratio: "1:3" })).toBe("1fr 3fr");
  });

  it("collapses to a SINGLE 1fr track (the collapsed half is display:none, out of grid flow)", () => {
    // A two-track `0 1fr` would mis-place the lone visible item into the `0` track
    // (bug found at P2 verify-human); one displayed item + one track fills the width.
    expect(gridColumnsFor({ collapsed: "left", ratio: "2:2" })).toBe("1fr");
    expect(gridColumnsFor({ collapsed: "right", ratio: "2:2" })).toBe("1fr");
    // collapse overrides the stored ratio regardless of its value
    expect(gridColumnsFor({ collapsed: "left", ratio: "3:1" })).toBe("1fr");
    expect(gridColumnsFor({ collapsed: "right", ratio: "1:3" })).toBe("1fr");
  });

  it("default state is the 50/50 track (byte-identical to today)", () => {
    expect(gridColumnsFor(DEFAULT_SPLIT)).toBe("1fr 1fr");
  });
});

describe("cycleRatio", () => {
  it("cycles 3:1 → 2:2 → 1:3 → 3:1 (wrapping)", () => {
    expect(cycleRatio("3:1")).toBe("2:2");
    expect(cycleRatio("2:2")).toBe("1:3");
    expect(cycleRatio("1:3")).toBe("3:1");
  });
});

describe("toggleCollapse", () => {
  it("collapses a half from the none state, preserving ratio", () => {
    expect(toggleCollapse({ collapsed: "none", ratio: "3:1" }, "left")).toEqual(
      {
        collapsed: "left",
        ratio: "3:1",
      },
    );
    expect(
      toggleCollapse({ collapsed: "none", ratio: "1:3" }, "right"),
    ).toEqual({ collapsed: "right", ratio: "1:3" });
  });

  it("restores to none when toggling the already-collapsed half (ratio kept)", () => {
    expect(toggleCollapse({ collapsed: "left", ratio: "2:2" }, "left")).toEqual(
      {
        collapsed: "none",
        ratio: "2:2",
      },
    );
    expect(
      toggleCollapse({ collapsed: "right", ratio: "3:1" }, "right"),
    ).toEqual({ collapsed: "none", ratio: "3:1" });
  });

  it("mutual exclusion — collapsing one half while the other is collapsed moves the collapse", () => {
    // right was collapsed; collapse left → left collapsed (never both)
    expect(
      toggleCollapse({ collapsed: "right", ratio: "2:2" }, "left"),
    ).toEqual({ collapsed: "left", ratio: "2:2" });
    expect(
      toggleCollapse({ collapsed: "left", ratio: "2:2" }, "right"),
    ).toEqual({ collapsed: "right", ratio: "2:2" });
  });

  it("round-trips: collapse then restore returns the exact prior ratio", () => {
    const start: SplitState = { collapsed: "none", ratio: "1:3" };
    const collapsed = toggleCollapse(start, "left");
    expect(toggleCollapse(collapsed, "left")).toEqual(start);
  });
});

describe("loadSplitState / saveSplitState (localStorage round-trip)", () => {
  // The vitest env has no DOM, so stub a minimal in-memory localStorage.
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

  it("returns DEFAULT_SPLIT when nothing is stored", () => {
    expect(loadSplitState()).toEqual(DEFAULT_SPLIT);
  });

  it("round-trips a saved state", () => {
    const s: SplitState = { collapsed: "right", ratio: "1:3" };
    saveSplitState(s);
    expect(store[SPLIT_STATE_KEY]).toBe(JSON.stringify(s));
    expect(loadSplitState()).toEqual(s);
  });

  it("returns DEFAULT_SPLIT for an unparseable stored value", () => {
    store[SPLIT_STATE_KEY] = "not-json{";
    expect(loadSplitState()).toEqual(DEFAULT_SPLIT);
  });

  it("falls back per-field for invalid field values", () => {
    store[SPLIT_STATE_KEY] = JSON.stringify({
      collapsed: "bogus",
      ratio: "9:9",
    });
    expect(loadSplitState()).toEqual(DEFAULT_SPLIT);
  });

  it("keeps a valid field while defaulting an invalid sibling", () => {
    store[SPLIT_STATE_KEY] = JSON.stringify({
      collapsed: "left",
      ratio: "9:9",
    });
    expect(loadSplitState()).toEqual({
      collapsed: "left",
      ratio: DEFAULT_SPLIT.ratio,
    });
  });

  it("returns DEFAULT_SPLIT for a non-object stored value", () => {
    store[SPLIT_STATE_KEY] = JSON.stringify("a string");
    expect(loadSplitState()).toEqual(DEFAULT_SPLIT);
  });
});

describe("persistence integration (P3.3) — the full change → save → reload → derive chain", () => {
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
  afterEach(() => vi.unstubAllGlobals());

  it("a collapse survives a 'relaunch' (save then a fresh load derives the collapsed track)", () => {
    // Simulate the toggleSplitCollapse → saveSplitState flow, then a fresh mount's load.
    const afterToggle = toggleCollapse(loadSplitState(), "left");
    saveSplitState(afterToggle);
    const onRelaunch = loadSplitState();
    expect(onRelaunch).toEqual({ collapsed: "left", ratio: "2:2" });
    expect(gridColumnsFor(onRelaunch)).toBe("1fr"); // collapsed → single track
  });

  it("a cycled ratio survives a 'relaunch' and derives the right track", () => {
    let s = loadSplitState(); // default 2:2
    s = { ...s, ratio: cycleRatio(s.ratio) }; // → 1:3
    saveSplitState(s);
    const onRelaunch = loadSplitState();
    expect(onRelaunch.ratio).toBe("1:3");
    expect(gridColumnsFor(onRelaunch)).toBe("1fr 3fr");
  });

  it("first run (empty storage) derives the byte-identical 50/50 default", () => {
    expect(gridColumnsFor(loadSplitState())).toBe("1fr 1fr");
  });
});

describe("loadSplitState — no localStorage available", () => {
  it("falls back to DEFAULT_SPLIT without throwing", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadSplitState()).not.toThrow();
    expect(loadSplitState()).toEqual(DEFAULT_SPLIT);
    vi.unstubAllGlobals();
  });

  it("saveSplitState swallows storage errors", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => saveSplitState(DEFAULT_SPLIT)).not.toThrow();
    vi.unstubAllGlobals();
  });
});
