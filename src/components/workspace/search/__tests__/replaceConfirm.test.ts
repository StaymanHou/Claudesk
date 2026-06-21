// WP7 Phase 3 — tests for the pure Replace-All confirm spec.

import { describe, it, expect } from "vitest";
import { replaceAllSpec } from "../replaceConfirm";

describe("replaceAllSpec", () => {
  it("names the blast radius (match + file counts) and the replacement", () => {
    const spec = replaceAllSpec(14, 5, "newName");
    expect(spec.message).toContain("14 matches");
    expect(spec.message).toContain("5 files");
    expect(spec.message).toContain('"newName"');
    expect(spec.title).toBe("Replace across project");
  });

  it("singularizes the count phrase: '1 match in 1 file'", () => {
    const spec = replaceAllSpec(1, 1, "x");
    // Assert the COUNT phrasing specifically — the static tail ("rewrites files on disk")
    // legitimately contains "files", so don't assert its absence over the whole message.
    expect(spec.message).toContain("1 match in 1 file");
    expect(spec.message).not.toContain("1 matches");
    expect(spec.message).not.toContain("in 1 files");
  });

  it("calls out an empty replacement as a deletion", () => {
    const spec = replaceAllSpec(3, 2, "");
    expect(spec.message).toContain("empty text (deletes the matches)");
  });

  it("Cancel is the primary (safe) default and Esc resolves to cancel", () => {
    const spec = replaceAllSpec(2, 1, "y");
    const cancel = spec.buttons.find((b) => b.value === "cancel");
    const replace = spec.buttons.find((b) => b.value === "replace");
    expect(cancel?.variant).toBe("primary");
    expect(replace?.variant).toBe("danger"); // replace is the destructive action
    expect(spec.escValue).toBe("cancel");
  });
});
