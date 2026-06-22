import { describe, it, expect } from "vitest";
import {
  applyStatusUpdate,
  emptyStatusMap,
  stateFor,
  statusPresentation,
  type WireWorkspaceState,
  type WorkspaceStatusUpdate,
} from "../workspaceStatus";

describe("statusPresentation", () => {
  it("maps each live state to its label + dark-palette dot class", () => {
    expect(statusPresentation("running")).toEqual({
      label: "Running",
      dotClass: "status-dot-running",
    });
    expect(statusPresentation("idle")).toEqual({
      label: "Idle",
      dotClass: "status-dot-idle",
    });
    expect(statusPresentation("awaiting_input")).toEqual({
      label: "Awaiting input",
      dotClass: "status-dot-awaiting",
    });
    expect(statusPresentation("unknown")).toEqual({
      label: "Unknown",
      dotClass: "status-dot-unknown",
    });
  });

  it("falls back to Unknown for an unrecognized wire state (never throws)", () => {
    // A surface must never crash on a status it doesn't render.
    const rogue = "some_future_state" as WireWorkspaceState;
    expect(statusPresentation(rogue)).toEqual({
      label: "Unknown",
      dotClass: "status-dot-unknown",
    });
  });
});

describe("applyStatusUpdate", () => {
  it("keys live state by the wire's workspace_id verbatim (snake_case)", () => {
    const update: WorkspaceStatusUpdate = {
      workspace_id: "ws-1",
      state: "running",
      last_event_at: 1_718_000_000_000,
      last_output_snippet: "do the thing",
    };
    const next = applyStatusUpdate(emptyStatusMap, update);
    expect(next).toEqual({ "ws-1": "running" });
  });

  it("round-trips a minimal snake-key payload without renaming fields", () => {
    // A payload with the optional fields omitted (backend skip_serializing_if)
    // must still reduce — only workspace_id + state are required.
    const update = {
      workspace_id: "ws-2",
      state: "awaiting_input",
    } as WorkspaceStatusUpdate;
    const next = applyStatusUpdate(emptyStatusMap, update);
    expect(next["ws-2"]).toBe("awaiting_input");
  });

  it("overwrites the prior state for a workspace and returns a new reference", () => {
    const first = applyStatusUpdate(emptyStatusMap, {
      workspace_id: "ws-1",
      state: "running",
    });
    const second = applyStatusUpdate(first, {
      workspace_id: "ws-1",
      state: "idle",
    });
    expect(second["ws-1"]).toBe("idle");
    expect(second).not.toBe(first); // immutable update → fresh reference for React
  });

  it("tracks multiple workspaces independently", () => {
    let map = emptyStatusMap;
    map = applyStatusUpdate(map, { workspace_id: "ws-1", state: "running" });
    map = applyStatusUpdate(map, { workspace_id: "ws-2", state: "idle" });
    expect(map).toEqual({ "ws-1": "running", "ws-2": "idle" });
  });
});

describe("stateFor", () => {
  it("returns the last observed state for a known workspace", () => {
    const map = applyStatusUpdate(emptyStatusMap, {
      workspace_id: "ws-1",
      state: "running",
    });
    expect(stateFor(map, "ws-1")).toBe("running");
  });

  it("returns the honest 'unknown' default for an unseen workspace", () => {
    // Absence in the map is Unknown — never a fabricated entry, never an error.
    expect(stateFor(emptyStatusMap, "ws-never-seen")).toBe("unknown");
  });
});
