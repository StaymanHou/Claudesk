import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  isDefaultProfile,
  isWorkflowApplicable,
  isWorkflowHostBlocked,
} from "../workflowApplicable";
import type { HostInput, HostSubstrate } from "../hostSubstrate";
import { resolveWorkspaceProfile } from "../useWorkspaceProfile";

describe("isWorkflowApplicable — mirrors Rust profiles::workflow_applicable", () => {
  const DEV: HostSubstrate = { state: "developer", root: null, head: null };
  const MANAGED: HostSubstrate = {
    state: "managed",
    root: null,
    head: null,
    record: { clone_path: "/r", installed_at: "t", origin_url: "u" },
  };
  const HOSTS: [string, HostInput, boolean][] = [
    ["local", "local", true],
    ["developer", DEV, true],
    ["managed", MANAGED, true],
    ["absent", { state: "absent" }, false],
    ["unknown", { state: "unknown" }, false],
  ];
  // Row for row the Rust `profile_workflow_applicable_truth_table` — change both or neither.
  const PROFILES = [
    [true, null, true],
    [true, "", true],
    [true, " default ", true],
    [true, "neo", false],
    [false, null, false],
    [false, "neo", false],
  ] as const;
  for (const [gate, reference, profileOk] of PROFILES) {
    for (const [name, host, hostOk] of HOSTS) {
      it(`gate=${gate} reference=${JSON.stringify(reference)} host=${name}`, () => {
        expect(isWorkflowApplicable(gate, reference, host)).toBe(
          gate && profileOk && hostOk,
        );
        // The note's predicate: the layer WOULD apply but the remote host blocks it.
        expect(isWorkflowHostBlocked(gate, reference, host)).toBe(
          gate && profileOk && name !== "local" && !hostOk,
        );
      });
    }
  }

  it("an UNKNOWN profile (undefined) fails CLOSED, unlike Rust's absent-means-default", () => {
    expect(isDefaultProfile(undefined)).toBe(false);
    expect(isWorkflowApplicable(true, undefined, "local")).toBe(false);
    // …while an explicit null IS the default profile.
    expect(isWorkflowApplicable(true, null, "local")).toBe(true);
  });

  it("an UNKNOWN host (undefined: not seeded yet) fails CLOSED, and is host-blocked", () => {
    expect(isWorkflowApplicable(true, null, undefined)).toBe(false);
    expect(isWorkflowHostBlocked(true, null, undefined)).toBe(true);
    expect(isWorkflowHostBlocked(true, undefined, undefined)).toBe(false);
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
