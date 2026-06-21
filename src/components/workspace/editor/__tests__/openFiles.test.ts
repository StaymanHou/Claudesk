// WP12 — tests for the pure open-files reducer (multi-file tab strip model).

import { describe, it, expect } from "vitest";
import {
  initialOpenFilesState,
  openFilesReducer,
  type OpenFilesState,
} from "../openFiles";

/** Open a file tab (helper to keep the cases terse). */
function open(state: OpenFilesState, id: string, path: string): OpenFilesState {
  return openFilesReducer(state, {
    type: "open-or-activate",
    id,
    path,
    label: path,
  });
}

describe("initialOpenFilesState", () => {
  it("starts with no tabs and no active tab (the empty editor)", () => {
    const s = initialOpenFilesState();
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });
});

describe("open-or-activate", () => {
  it("adds the first file tab and activates it", () => {
    const s = open(initialOpenFilesState(), "t1", "a.ts");
    expect(s.tabs.map((t) => t.path)).toEqual(["a.ts"]);
    expect(s.tabs[0]).toMatchObject({
      id: "t1",
      kind: "file",
      path: "a.ts",
      label: "a.ts",
      dirty: false,
    });
    expect(s.activeTabId).toBe("t1");
  });

  it("inserts a new tab directly after the active one, not at the end", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts"); // [a]
    s = open(s, "t2", "b.ts"); // [a, b], active b
    s = openFilesReducer(s, { type: "activate", id: "t1" }); // active a
    s = open(s, "t3", "c.ts"); // [a, c, b]
    expect(s.tabs.map((t) => t.path)).toEqual(["a.ts", "c.ts", "b.ts"]);
    expect(s.activeTabId).toBe("t3");
  });

  it("activates the existing tab instead of adding a duplicate (same path)", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = open(s, "t2", "b.ts"); // active b
    const before = s;
    s = openFilesReducer(s, {
      type: "open-or-activate",
      id: "t99", // a fresh id the caller offered — must be ignored
      path: "a.ts",
      label: "a.ts",
    });
    expect(s.tabs.map((t) => t.path)).toEqual(["a.ts", "b.ts"]); // no new tab
    expect(s.activeTabId).toBe("t1"); // activated the existing a
    expect(s.tabs).not.toContainEqual(expect.objectContaining({ id: "t99" }));
    expect(before.tabs.length).toBe(2);
  });

  it("returns identity when re-opening the already-active file (no churn)", () => {
    const s = open(initialOpenFilesState(), "t1", "a.ts");
    const again = openFilesReducer(s, {
      type: "open-or-activate",
      id: "t2",
      path: "a.ts",
      label: "a.ts",
    });
    expect(again).toBe(s);
  });
});

describe("activate", () => {
  it("activates a known tab", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = open(s, "t2", "b.ts"); // active b
    s = openFilesReducer(s, { type: "activate", id: "t1" });
    expect(s.activeTabId).toBe("t1");
  });

  it("is a no-op for an unknown id (identity preserved)", () => {
    const s = open(initialOpenFilesState(), "t1", "a.ts");
    expect(openFilesReducer(s, { type: "activate", id: "ghost" })).toBe(s);
  });

  it("is a no-op when already active (no re-render churn)", () => {
    const s = open(initialOpenFilesState(), "t1", "a.ts");
    expect(openFilesReducer(s, { type: "activate", id: "t1" })).toBe(s);
  });
});

describe("activate-index", () => {
  it("activates the Nth tab (1-based)", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = open(s, "t2", "b.ts");
    s = open(s, "t3", "c.ts"); // [a, b, c], active c
    s = openFilesReducer(s, { type: "activate-index", n: 2 });
    expect(s.activeTabId).toBe("t2");
  });

  it("clamps n past the end to the LAST tab (the ⌘9 = last convention)", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = open(s, "t2", "b.ts"); // [a, b]
    s = openFilesReducer(s, { type: "activate-index", n: 9 });
    expect(s.activeTabId).toBe("t2"); // last, not out of range
  });

  it("is a no-op when there are no tabs", () => {
    const s = initialOpenFilesState();
    expect(openFilesReducer(s, { type: "activate-index", n: 1 })).toBe(s);
  });
});

describe("close", () => {
  it("removes a non-active tab and keeps the active one", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = open(s, "t2", "b.ts"); // active b
    s = openFilesReducer(s, { type: "close", id: "t1" });
    expect(s.tabs.map((t) => t.id)).toEqual(["t2"]);
    expect(s.activeTabId).toBe("t2");
  });

  it("closing the active tab activates the neighbor that took its slot", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = open(s, "t2", "b.ts");
    s = open(s, "t3", "c.ts"); // [a, b, c]
    s = openFilesReducer(s, { type: "activate", id: "t2" }); // active b (idx 1)
    s = openFilesReducer(s, { type: "close", id: "t2" }); // [a, c]
    // The tab that took slot idx 1 is c → it becomes active.
    expect(s.tabs.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(s.activeTabId).toBe("t3");
  });

  it("closing the active LAST tab activates the new last tab", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = open(s, "t2", "b.ts"); // [a, b], active b (idx 1, the last)
    s = openFilesReducer(s, { type: "close", id: "t2" });
    expect(s.tabs.map((t) => t.id)).toEqual(["t1"]);
    expect(s.activeTabId).toBe("t1");
  });

  it("closing the last remaining tab returns to the empty state", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = openFilesReducer(s, { type: "close", id: "t1" });
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });

  it("is a no-op for an unknown id", () => {
    const s = open(initialOpenFilesState(), "t1", "a.ts");
    expect(openFilesReducer(s, { type: "close", id: "ghost" })).toBe(s);
  });
});

describe("add-synthetic", () => {
  it("adds a read-only synthetic tab (no path) and activates it", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = openFilesReducer(s, {
      type: "add-synthetic",
      id: "find-results",
      label: "Find Results",
    });
    expect(s.activeTabId).toBe("find-results");
    const synth = s.tabs.find((t) => t.id === "find-results");
    expect(synth).toMatchObject({
      kind: "synthetic",
      path: null,
      label: "Find Results",
      dirty: false,
    });
  });

  it("re-adding the same synthetic id activates it instead of duplicating", () => {
    let s = openFilesReducer(initialOpenFilesState(), {
      type: "add-synthetic",
      id: "fr",
      label: "Find Results",
    });
    s = open(s, "t2", "a.ts"); // active a
    s = openFilesReducer(s, {
      type: "add-synthetic",
      id: "fr",
      label: "Find Results",
    });
    expect(s.tabs.filter((t) => t.id === "fr")).toHaveLength(1);
    expect(s.activeTabId).toBe("fr");
  });
});

describe("set-dirty", () => {
  it("flips a file tab's dirty flag", () => {
    let s = open(initialOpenFilesState(), "t1", "a.ts");
    s = openFilesReducer(s, { type: "set-dirty", id: "t1", dirty: true });
    expect(s.tabs[0].dirty).toBe(true);
    s = openFilesReducer(s, { type: "set-dirty", id: "t1", dirty: false });
    expect(s.tabs[0].dirty).toBe(false);
  });

  it("is a no-op when the flag is unchanged (identity preserved)", () => {
    const s = open(initialOpenFilesState(), "t1", "a.ts");
    expect(
      openFilesReducer(s, { type: "set-dirty", id: "t1", dirty: false }),
    ).toBe(s);
  });

  it("never marks a synthetic (read-only) tab dirty", () => {
    const s = openFilesReducer(initialOpenFilesState(), {
      type: "add-synthetic",
      id: "fr",
      label: "Find Results",
    });
    expect(
      openFilesReducer(s, { type: "set-dirty", id: "fr", dirty: true }),
    ).toBe(s);
  });

  it("is a no-op for an unknown id", () => {
    const s = open(initialOpenFilesState(), "t1", "a.ts");
    expect(
      openFilesReducer(s, { type: "set-dirty", id: "ghost", dirty: true }),
    ).toBe(s);
  });
});
