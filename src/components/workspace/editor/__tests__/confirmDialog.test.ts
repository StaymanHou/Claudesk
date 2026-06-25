// WP12 — tests for the pure confirm-dialog model.

import { describe, it, expect } from "vitest";
import {
  closeDirtySpec,
  conflictSpec,
  deleteFileSpec,
  type ConfirmButton,
} from "../confirmDialog";

describe("closeDirtySpec", () => {
  it("offers Save / Discard / Cancel with Cancel as the Esc default", () => {
    const spec = closeDirtySpec("notes.md");
    expect(spec.buttons.map((b) => b.value)).toEqual([
      "save",
      "discard",
      "cancel",
    ]);
    expect(spec.escValue).toBe("cancel");
  });

  it("names the file in the message so the operator knows what's at risk", () => {
    expect(closeDirtySpec("notes.md").message).toContain("notes.md");
  });

  it("marks Save primary and Discard danger", () => {
    const byValue = (v: string) =>
      closeDirtySpec("x").buttons.find((b) => b.value === v) as ConfirmButton;
    expect(byValue("save").variant).toBe("primary");
    expect(byValue("discard").variant).toBe("danger");
  });
});

describe("conflictSpec", () => {
  it("offers keep-mine / load-disk and NO Esc dismissal (must pick a copy)", () => {
    const spec = conflictSpec("a.ts");
    expect(spec.buttons.map((b) => b.value)).toEqual([
      "keep-mine",
      "load-disk",
    ]);
    expect(spec.escValue).toBeNull();
  });

  it("names the file in the message", () => {
    expect(conflictSpec("a.ts").message).toContain("a.ts");
  });
});

describe("deleteFileSpec (QoL-WP5)", () => {
  it("offers cancel (primary) then delete (danger), with Esc → cancel", () => {
    const spec = deleteFileSpec("a.ts");
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "delete"]);
    const cancel = spec.buttons.find((b) => b.value === "cancel");
    const del = spec.buttons.find((b) => b.value === "delete");
    expect(cancel?.variant).toBe("primary"); // safe default is the primary
    expect(del?.variant).toBe("danger"); // delete is irreversible → danger, non-default
    expect(spec.escValue).toBe("cancel"); // Esc keeps the file
  });

  it("names the file in the message", () => {
    expect(deleteFileSpec("notes.md").message).toContain("notes.md");
  });
});
