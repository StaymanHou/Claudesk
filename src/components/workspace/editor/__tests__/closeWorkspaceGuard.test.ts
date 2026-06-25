// QoL-WP1 — unit coverage for the workspace-close dirty guard's pure logic:
//   - `dirtyDocCount(DocsState)` — the fold the EditorSplit handle exposes, driving the
//     "does closing this workspace discard unsaved edits?" decision.
//   - `closeWorkspaceSpec(name, count)` — the confirm-dialog spec (discard / cancel,
//     Esc → cancel) shown when dirtyDocCount > 0.
//
// States are built through the PUBLIC `docsReducer` (open-doc + set-doc) so the test
// exercises the real store machinery, not a hand-rolled DocEntry.

import { describe, it, expect } from "vitest";
import {
  docsReducer,
  initialDocsState,
  dirtyDocCount,
  type DocsState,
} from "../editorDocs";
import { closeWorkspaceSpec } from "../confirmDialog";

/** Open `path` (clean), then optionally edit it dirty by setting a different buffer. */
function open(state: DocsState, path: string, edit?: string): DocsState {
  let s = docsReducer(state, { type: "open-doc", path });
  if (edit !== undefined) s = docsReducer(s, { type: "set-doc", path, doc: edit });
  return s;
}

describe("dirtyDocCount — QoL-WP1", () => {
  it("is 0 for an empty store", () => {
    expect(dirtyDocCount(initialDocsState)).toBe(0);
  });

  it("is 0 when every open doc is clean (doc === savedDoc)", () => {
    let s = open(initialDocsState, "/a.ts");
    s = open(s, "/b.ts");
    expect(dirtyDocCount(s)).toBe(0);
  });

  it("counts a single edited (dirty) doc", () => {
    const s = open(initialDocsState, "/a.ts", "edited");
    expect(dirtyDocCount(s)).toBe(1);
  });

  it("counts only the dirty docs among a mix", () => {
    let s = open(initialDocsState, "/clean.ts"); // clean
    s = open(s, "/dirty1.ts", "x"); // dirty
    s = open(s, "/dirty2.ts", "y"); // dirty
    s = open(s, "/clean2.ts"); // clean
    expect(dirtyDocCount(s)).toBe(2);
  });

  it("drops back to clean when an edit is reverted to the saved buffer", () => {
    let s = open(initialDocsState, "/a.ts", "edited");
    expect(dirtyDocCount(s)).toBe(1);
    // Revert the buffer to the saved (empty) content → no longer dirty.
    s = docsReducer(s, { type: "set-doc", path: "/a.ts", doc: "" });
    expect(dirtyDocCount(s)).toBe(0);
  });
});

describe("closeWorkspaceSpec — QoL-WP1", () => {
  it("offers Close Anyway + Cancel, with Esc → cancel (safe default)", () => {
    const spec = closeWorkspaceSpec("my-project", 2);
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "close"]);
    expect(spec.escValue).toBe("cancel");
    // Cancel is the primary (default) action — the safe choice keeps the workspace.
    expect(spec.buttons.find((b) => b.value === "cancel")?.variant).toBe(
      "primary",
    );
    expect(spec.buttons.find((b) => b.value === "close")?.variant).toBe("danger");
  });

  it("pluralizes the unsaved-file count in the message", () => {
    expect(closeWorkspaceSpec("p", 1).message).toContain("1 file");
    expect(closeWorkspaceSpec("p", 3).message).toContain("3 files");
  });

  it("names the workspace in the message (blast-radius clarity)", () => {
    expect(closeWorkspaceSpec("claudesk", 1).message).toContain("claudesk");
  });
});
