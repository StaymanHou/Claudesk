import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  isDefaultProfile,
  isWorkflowApplicable,
} from "../workflowApplicable";
import { resolveWorkspaceProfile } from "../useWorkspaceProfile";

describe("isWorkflowApplicable — mirrors Rust profiles::workflow_applicable", () => {
  // Row for row the Rust `profile_workflow_applicable_truth_table` — change both or neither.
  it.each([
    [true, null, true],
    [true, "", true],
    [true, " default ", true],
    [true, "neo", false],
    [false, null, false],
    [false, "neo", false],
  ] as const)("gate=%s reference=%j → %s", (gate, reference, want) => {
    expect(isWorkflowApplicable(gate, reference)).toBe(want);
  });

  it("an UNKNOWN profile (undefined) fails CLOSED, unlike Rust's absent-means-default", () => {
    expect(isDefaultProfile(undefined)).toBe(false);
    expect(isWorkflowApplicable(true, undefined)).toBe(false);
    // …while an explicit null IS the default profile.
    expect(isWorkflowApplicable(true, null)).toBe(true);
  });

  it("the default name matches Rust's DEFAULT_PROFILE", () => {
    expect(DEFAULT_PROFILE).toBe("default");
  });
});

describe("resolveWorkspaceProfile", () => {
  it("a live read for the CURRENT session wins over the stored row", () => {
    expect(
      resolveWorkspaceProfile(
        null,
        { sessionId: "cc-2", profile: "neo" },
        "cc-2",
      ),
    ).toBe("neo");
    expect(
      resolveWorkspaceProfile(
        "neo",
        { sessionId: "cc-2", profile: null },
        "cc-2",
      ),
    ).toBeNull();
  });

  it("a live read for a PREVIOUS session is ignored (a respawn replaced that process)", () => {
    expect(
      resolveWorkspaceProfile(
        null,
        { sessionId: "cc-1", profile: "neo" },
        "cc-2",
      ),
    ).toBeNull();
  });

  it("falls back to the stored row, and to undefined (fail closed) when nothing has landed", () => {
    expect(resolveWorkspaceProfile("neo", null, "cc-1")).toBe("neo");
    expect(resolveWorkspaceProfile(null, null, null)).toBeNull();
    expect(resolveWorkspaceProfile(undefined, null, "cc-1")).toBeUndefined();
  });
});
