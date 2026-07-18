// WP12 — tests for the pure confirm-dialog model.

import { describe, it, expect } from "vitest";
import {
  closeDirtySpec,
  conflictSpec,
  deleteFileSpec,
  deleteFolderSpec,
  quitWhileActiveSpec,
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

describe("deleteFolderSpec (QoL-WP5b)", () => {
  it("offers cancel (primary) then delete (danger), with Esc → cancel", () => {
    const spec = deleteFolderSpec("src", 5);
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "delete"]);
    expect(spec.buttons.find((b) => b.value === "cancel")?.variant).toBe(
      "primary",
    );
    expect(spec.buttons.find((b) => b.value === "delete")?.variant).toBe(
      "danger",
    );
    expect(spec.escValue).toBe("cancel");
  });

  it("is STRONGER than the file confirm: names the folder + 'everything inside it' + count + Trash", () => {
    const msg = deleteFolderSpec("components", 12).message;
    expect(msg).toContain("components");
    expect(msg).toContain("everything inside it");
    expect(msg).toContain("12 items");
    expect(msg).toMatch(/Trash/i); // tells the operator it's recoverable
  });

  it("singularizes the count and handles an empty folder", () => {
    expect(deleteFolderSpec("d", 1).message).toContain("1 item");
    expect(deleteFolderSpec("d", 1).message).not.toContain("1 items");
    expect(deleteFolderSpec("empty", 0).message).toContain("It is empty.");
  });
});

describe("quitWhileActiveSpec (M10.5-WP2)", () => {
  it("offers Quit Anyway (danger) + Cancel (primary), Esc → cancel (safe default)", () => {
    const spec = quitWhileActiveSpec(["scratch-a"]);
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "quit"]);
    expect(spec.buttons.find((b) => b.value === "cancel")?.variant).toBe(
      "primary",
    );
    expect(spec.buttons.find((b) => b.value === "quit")?.variant).toBe("danger");
    expect(spec.escValue).toBe("cancel");
  });

  it("enumerates a single busy workspace, singular verb + 'it'", () => {
    const msg = quitWhileActiveSpec(["scratch-a"]).message;
    expect(msg).toContain("scratch-a");
    expect(msg).toContain("is still working");
    expect(msg).toMatch(/stop it\?/);
  });

  it("enumerates multiple busy workspaces (comma-joined), plural verb + 'them'", () => {
    const msg = quitWhileActiveSpec(["scratch-a", "scratch-b"]).message;
    expect(msg).toContain("scratch-a, scratch-b");
    expect(msg).toContain("are still working");
    expect(msg).toMatch(/stop them\?/);
  });

  it("names all N when more than two are busy", () => {
    const msg = quitWhileActiveSpec(["a", "b", "c"]).message;
    expect(msg).toContain("a, b, c");
    expect(msg).toContain("are still working");
  });

  it("is total: an empty list yields a generic quit prompt (never throws)", () => {
    const spec = quitWhileActiveSpec([]);
    expect(spec.message).toContain("Quit Claudesk?");
    expect(spec.buttons.map((b) => b.value)).toEqual(["cancel", "quit"]);
  });
});
