// WP12 — tests for the pure tab-label helper (basename of a path).

import { describe, it, expect } from "vitest";
import { labelForPath } from "../PaneTabs";

describe("labelForPath", () => {
  it("returns the basename of a project-relative path", () => {
    expect(labelForPath("src/components/App.tsx")).toBe("App.tsx");
  });

  it("returns the basename of an absolute path", () => {
    expect(labelForPath("/Users/x/proj/notes.md")).toBe("notes.md");
  });

  it("returns the whole name when there is no slash", () => {
    expect(labelForPath("README.md")).toBe("README.md");
  });

  it("ignores a trailing slash", () => {
    expect(labelForPath("src/foo/")).toBe("foo");
  });
});
