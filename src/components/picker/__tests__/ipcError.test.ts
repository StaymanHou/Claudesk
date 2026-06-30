import { describe, it, expect } from "vitest";
import { mapIpcError } from "../ipcError";

describe("mapIpcError — picker IPC error-surfacing (M4 WP2 P4.2)", () => {
  it("formats a string rejection (the common Tauri command-layer shape)", () => {
    // Our Rust command layer maps errors to String, so the rejection is usually a string.
    expect(mapIpcError("load projects", "projects.json is malformed")).toBe(
      "Could not load projects: projects.json is malformed",
    );
  });

  it("uses the action verb so the message names what failed", () => {
    expect(mapIpcError("open project", "denied")).toBe(
      "Could not open project: denied",
    );
    expect(mapIpcError("remove project", "no such project")).toBe(
      "Could not remove project: no such project",
    );
  });

  it("extracts .message from an Error instance", () => {
    expect(mapIpcError("open folder", new Error("dialog crashed"))).toBe(
      "Could not open folder: dialog crashed",
    );
  });

  it("stringifies a non-string, non-Error rejection", () => {
    expect(mapIpcError("load projects", { code: 42 })).toContain(
      "Could not load projects:",
    );
  });

  it("falls back to a bare message when the detail is empty/blank (never silent)", () => {
    expect(mapIpcError("load projects", "")).toBe("Could not load projects.");
    expect(mapIpcError("load projects", "   ")).toBe(
      "Could not load projects.",
    );
  });

  it("always returns a non-empty surfaced string (a rejection is never swallowed)", () => {
    for (const err of ["x", "", new Error(""), null, undefined, 0]) {
      expect(mapIpcError("do thing", err).length).toBeGreaterThan(0);
    }
  });
});
