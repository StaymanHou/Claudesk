// WP3c — tests for the pure pane/focus reducer (shared-document model).

import { describe, it, expect } from "vitest";
import {
  initialPanesState,
  panesReducer,
  type PanesState,
} from "../editorPanes";

describe("initialPanesState", () => {
  it("starts with a single pane that is active", () => {
    const s = initialPanesState("a");
    expect(s.panes).toEqual([{ id: "a" }]);
    expect(s.activePaneId).toBe("a");
  });
});

describe("split", () => {
  it("inserts the new pane after the active one and focuses it", () => {
    const s = panesReducer(initialPanesState("a"), { type: "split", id: "b" });
    expect(s.panes.map((p) => p.id)).toEqual(["a", "b"]);
    expect(s.activePaneId).toBe("b");
  });

  it("inserts directly after the active pane, not at the end", () => {
    let s: PanesState = initialPanesState("a");
    s = panesReducer(s, { type: "split", id: "b" }); // a, [b]
    s = panesReducer(s, { type: "focus", id: "a" }); // active = a
    s = panesReducer(s, { type: "split", id: "c" }); // a, [c], b
    expect(s.panes.map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(s.activePaneId).toBe("c");
  });

  it("ignores a duplicate id (caller bug) and keeps state", () => {
    const before = panesReducer(initialPanesState("a"), {
      type: "split",
      id: "b",
    });
    const after = panesReducer(before, { type: "split", id: "b" });
    expect(after).toBe(before); // identity preserved → no re-render churn
  });
});

describe("focus", () => {
  it("moves the active id to an existing pane", () => {
    let s = panesReducer(initialPanesState("a"), { type: "split", id: "b" });
    s = panesReducer(s, { type: "focus", id: "a" });
    expect(s.activePaneId).toBe("a");
  });

  it("is a no-op (identity-preserving) when focusing the already-active pane", () => {
    const s = initialPanesState("a");
    expect(panesReducer(s, { type: "focus", id: "a" })).toBe(s);
  });

  it("is a no-op for an unknown id", () => {
    const s = initialPanesState("a");
    expect(panesReducer(s, { type: "focus", id: "ghost" })).toBe(s);
  });
});

describe("close + last-pane guard", () => {
  it("never closes the final pane", () => {
    const s = initialPanesState("a");
    expect(panesReducer(s, { type: "close", id: "a" })).toBe(s);
  });

  it("removes a non-active pane and keeps focus put", () => {
    let s = panesReducer(initialPanesState("a"), { type: "split", id: "b" });
    // active is b; close a
    s = panesReducer(s, { type: "close", id: "a" });
    expect(s.panes.map((p) => p.id)).toEqual(["b"]);
    expect(s.activePaneId).toBe("b");
  });

  it("reassigns focus to a sibling when the active pane is closed", () => {
    let s = panesReducer(initialPanesState("a"), { type: "split", id: "b" }); // a, [b]
    // active is b (last); closing it should fall back to a
    s = panesReducer(s, { type: "close", id: "b" });
    expect(s.panes.map((p) => p.id)).toEqual(["a"]);
    expect(s.activePaneId).toBe("a");
  });

  it("reassigns focus to the pane that took the closed slot (middle close)", () => {
    let s: PanesState = initialPanesState("a");
    s = panesReducer(s, { type: "split", id: "b" }); // a, [b]
    s = panesReducer(s, { type: "split", id: "c" }); // a, b, [c]
    s = panesReducer(s, { type: "focus", id: "b" }); // active = b (index 1)
    s = panesReducer(s, { type: "close", id: "b" }); // a, c → focus the slot-taker
    expect(s.panes.map((p) => p.id)).toEqual(["a", "c"]);
    expect(s.activePaneId).toBe("c");
  });

  it("is a no-op for an unknown id", () => {
    const s = panesReducer(initialPanesState("a"), { type: "split", id: "b" });
    expect(panesReducer(s, { type: "close", id: "ghost" })).toBe(s);
  });
});

describe("collapse (file change → single pane)", () => {
  it("collapses to the kept pane", () => {
    let s = panesReducer(initialPanesState("a"), { type: "split", id: "b" });
    s = panesReducer(s, { type: "collapse", keepId: "a" });
    expect(s.panes).toEqual([{ id: "a" }]);
    expect(s.activePaneId).toBe("a");
  });

  it("falls back to the active pane when keepId is absent", () => {
    let s = panesReducer(initialPanesState("a"), { type: "split", id: "b" }); // active b
    s = panesReducer(s, { type: "collapse", keepId: "ghost" });
    expect(s.panes).toEqual([{ id: "b" }]);
    expect(s.activePaneId).toBe("b");
  });
});
