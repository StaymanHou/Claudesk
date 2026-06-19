import { describe, it, expect } from "vitest";
import { initialSaveState, saveReducer, type SaveState } from "../editorSave";

describe("saveReducer", () => {
  it("starts idle", () => {
    expect(initialSaveState).toEqual({ kind: "idle" });
  });

  it("save-start → saving with the path", () => {
    const s = saveReducer(initialSaveState, {
      type: "save-start",
      path: "src/lib.rs",
    });
    expect(s).toEqual({ kind: "saving", path: "src/lib.rs" });
  });

  it("save-ok → saved", () => {
    const saving: SaveState = { kind: "saving", path: "a.ts" };
    expect(saveReducer(saving, { type: "save-ok", path: "a.ts" })).toEqual({
      kind: "saved",
      path: "a.ts",
    });
  });

  it("save-fail → error carrying the message", () => {
    const saving: SaveState = { kind: "saving", path: "ro.txt" };
    expect(
      saveReducer(saving, {
        type: "save-fail",
        path: "ro.txt",
        message: "permission denied",
      }),
    ).toEqual({ kind: "error", path: "ro.txt", message: "permission denied" });
  });

  it("reset → idle (openPath changed, clear stale status)", () => {
    const saved: SaveState = { kind: "saved", path: "old.ts" };
    expect(saveReducer(saved, { type: "reset" })).toEqual({ kind: "idle" });
  });

  it("a retry after a failed save goes save-start → saving (error is cleared)", () => {
    const errored: SaveState = {
      kind: "error",
      path: "f.ts",
      message: "boom",
    };
    expect(saveReducer(errored, { type: "save-start", path: "f.ts" })).toEqual({
      kind: "saving",
      path: "f.ts",
    });
  });
});
