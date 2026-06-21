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

  it("tracks multiple expanded dirs independently", () => {
    let s: ExpandedDirs = initialExpanded;
    s = treeReducer(s, { type: "toggle", path: "a" });
    s = treeReducer(s, { type: "toggle", path: "a/b" });
    expect(isExpanded(s, "a")).toBe(true);
    expect(isExpanded(s, "a/b")).toBe(true);
    expect(s.size).toBe(2);
  });

  it("toggle returns a NEW set reference on change (React re-render)", () => {
    const before = treeReducer(initialExpanded, { type: "toggle", path: "a" });
    expect(before).not.toBe(initialExpanded);
  });

  it("a toggle does not mutate the prior state object", () => {
    const before = treeReducer(initialExpanded, { type: "toggle", path: "a" });
    const after = treeReducer(before, { type: "toggle", path: "b" });
    expect(before.has("b")).toBe(false); // prior state untouched
    expect(after.has("b")).toBe(true);
    expect(before.has("a")).toBe(true); // first toggle still intact
  });
});
