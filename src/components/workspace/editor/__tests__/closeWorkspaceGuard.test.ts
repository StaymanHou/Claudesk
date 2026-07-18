// QoL-WP1 + M10.5-WP2 — unit coverage for the workspace-close guard's pure logic:
//   - `dirtyDocCount(DocsState)` — the fold the EditorSplit handle exposes, driving the
//     "does closing this workspace discard unsaved edits?" (dirty) decision.
//   - `isActiveState(state)` — the M10.5-WP2 predicate: is a workspace's CC mid-work?
//   - `closeWorkspaceSpec(name, { dirtyCount, active })` — the confirm-dialog spec
//     (discard/stop / cancel, Esc → cancel) shown when dirty OR active; composes
//     whichever reason(s) fired into one message (never two stacked dialogs).
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
import { closeWorkspaceSpec, isActiveState } from "../confirmDialog";

/** Open `path` (clean), then optionally edit it dirty by setting a different buffer. */
function open(state: DocsState, path: string, edit?: string): DocsState {
  let s = docsReducer(state, { type: "open-doc", path });
  if (edit !== undefined)
    s = docsReducer(s, { type: "set-doc", path, doc: edit });
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

describe("isActiveState — M10.5-WP2", () => {
  it("is true for running and awaiting_input (CC mid-work)", () => {
    expect(isActiveState("running")).toBe(true);
    expect(isActiveState("awaiting_input")).toBe(true);
  });

  it("is false for idle and unknown (nothing in flight to protect)", () => {
    expect(isActiveState("idle")).toBe(false);
    expect(isActiveState("unknown")).toBe(false);
  });
});

describe("closeWorkspaceSpec — QoL-WP1 (dirty) + M10.5-WP2 (active)", () => {
  it("offers Close Anyway + Cancel, with Esc → cancel (safe default)", () => {
    const spec = closeWorkspaceSpec("my-project", {
      dirtyCount: 2,
      active: false,
    });
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "close"]);
    expect(spec.escValue).toBe("cancel");
    // Cancel is the primary (default) action — the safe choice keeps the workspace.
    expect(spec.buttons.find((b) => b.value === "cancel")?.variant).toBe(
      "primary",
    );
    expect(spec.buttons.find((b) => b.value === "close")?.variant).toBe(
      "danger",
    );
  });

  it("dirty-only: pluralizes the unsaved-file count in the message", () => {
    expect(
      closeWorkspaceSpec("p", { dirtyCount: 1, active: false }).message,
    ).toContain("1 file");
    expect(
      closeWorkspaceSpec("p", { dirtyCount: 3, active: false }).message,
    ).toContain("3 files");
  });

  it("names the workspace in the message (blast-radius clarity)", () => {
    expect(
      closeWorkspaceSpec("claudesk", { dirtyCount: 1, active: false }).message,
    ).toContain("claudesk");
  });

  it("active-only: message says CC is running, no file mention", () => {
    const spec = closeWorkspaceSpec("proj", { dirtyCount: 0, active: true });
    expect(spec.message).toContain("still working");
    expect(spec.message).toContain("proj");
    expect(spec.message).not.toContain("file");
    // Buttons/escValue are the same guard shape regardless of reason.
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "close"]);
    expect(spec.escValue).toBe("cancel");
  });

  it("combined (dirty AND active): ONE message mentions both reasons", () => {
    const spec = closeWorkspaceSpec("proj", { dirtyCount: 2, active: true });
    expect(spec.message).toContain("still working");
    expect(spec.message).toContain("2 files");
    expect(spec.message).toContain("proj");
    // Still a single dialog with the same two buttons (never two stacked dialogs).
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "close"]);
  });

  it("no-reason (total factory): a plain Close <name>? — never throws", () => {
    const spec = closeWorkspaceSpec("proj", { dirtyCount: 0, active: false });
    expect(spec.message).toContain("proj");
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "close"]);
  });
});
