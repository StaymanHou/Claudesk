import { describe, it, expect } from "vitest";
import {
  appliesToWorkspace,
  FS_CHANGE_EVENT,
  type FsChange,
} from "../fsChange";

describe("fsChange DTO contract", () => {
  it("consumes the backend snake_case payload verbatim (IPC-DTO casing lesson)", () => {
    // A realistic payload exactly as it arrives over the Tauri `fs-change` event
    // (snake_case, NOT camelCase — Tauri does not convert command/event payloads).
    const wire: FsChange = {
      workspace_id: "ws-1",
      paths: ["src/main.rs", "docs/product/qol-wbs.md"],
      kind: "created",
    };
    expect(wire.workspace_id).toBe("ws-1");
    expect(wire.paths).toHaveLength(2);
    expect(wire.kind).toBe("created");
  });

  it("pins the event name the backend emits", () => {
    expect(FS_CHANGE_EVENT).toBe("fs-change");
  });
});

describe("appliesToWorkspace", () => {
  const change: FsChange = {
    workspace_id: "ws-1",
    paths: ["a.txt"],
    kind: "modified",
  };

  it("is true when the event's workspace_id matches", () => {
    expect(appliesToWorkspace(change, "ws-1")).toBe(true);
  });

  it("is false for a different workspace (the multi-workspace filter)", () => {
    expect(appliesToWorkspace(change, "ws-2")).toBe(false);
  });
});
