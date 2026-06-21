import { describe, it, expect } from "vitest";
import {
  treeReducer,
  initialExpanded,
  isExpanded,
  type ExpandedDirs,
} from "../treeState";

describe("treeState — expand/collapse reducer", () => {
  it("default is collapsed (empty set)", () => {
    expect(initialExpanded.size).toBe(0);
    expect(isExpanded(initialExpanded, "src")).toBe(false);
  });

  it("toggle expands then collapses", () => {
    let s: ExpandedDirs = initialExpanded;
    s = treeReducer(s, { type: "toggle", path: "src" });
    expect(isExpanded(s, "src")).toBe(true);
    s = treeReducer(s, { type: "toggle", path: "src" });
    expect(isExpanded(s, "src")).toBe(false);
  });

  it("expand is idempotent and returns the SAME ref when already expanded (no needless re-render)", () => {
    const s1 = treeReducer(initialExpanded, { type: "expand", path: "a" });
    const s2 = treeReducer(s1, { type: "expand", path: "a" });
    expect(isExpanded(s2, "a")).toBe(true);
    expect(s2).toBe(s1); // same reference — no-op
  });

  it("collapse on an unexpanded dir is a same-ref no-op", () => {
    const s = treeReducer(initialExpanded, { type: "collapse", path: "x" });
    expect(s).toBe(initialExpanded);
  });

  it("tracks multiple expanded dirs independently", () => {
    let s: ExpandedDirs = initialExpanded;
    s = treeReducer(s, { type: "expand", path: "a" });
    s = treeReducer(s, { type: "expand", path: "a/b" });
    expect(isExpanded(s, "a")).toBe(true);
    expect(isExpanded(s, "a/b")).toBe(true);
    expect(s.size).toBe(2);
  });

  it("collapse-all clears the set", () => {
    let s: ExpandedDirs = initialExpanded;
    s = treeReducer(s, { type: "expand", path: "a" });
    s = treeReducer(s, { type: "expand", path: "b" });
    s = treeReducer(s, { type: "collapse-all" });
    expect(s.size).toBe(0);
  });

  it("collapse-all on an empty set is a same-ref no-op", () => {
    const s = treeReducer(initialExpanded, { type: "collapse-all" });
    expect(s).toBe(initialExpanded);
  });

  it("a toggle does not mutate the prior state object", () => {
    const before = treeReducer(initialExpanded, { type: "expand", path: "a" });
    const after = treeReducer(before, { type: "toggle", path: "b" });
    expect(before.has("b")).toBe(false); // prior state untouched
    expect(after.has("b")).toBe(true);
  });
});
