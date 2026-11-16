import { describe, expect, it } from "vitest";
import {
  applyStatusUpdate,
  displayStateFor,
  emptyStatusMap,
  linkFor,
  linkOverlayTitle,
  stateFor,
  type WireLinkOverlay,
  type WireWorkspaceState,
} from "../workspaceStatus";
import { isActiveState } from "../../components/workspace/editor/confirmDialog";
import { readyToRespawn } from "../../components/workspace/applyDriveMode";

// M17 WP4 (AC-6) — the link overlay is a DISPLAY field. It rides the wire, folds into the map and
// reads through `linkFor`, and it changes NOTHING a guard reads: the close/quit guard
// (`isActiveState`) and the respawn guard (`readyToRespawn`) take `stateFor`, and the dot's hue
// (`displayStateFor`) stays the last state's.

const LOST: WireLinkOverlay = { status: "reconnecting", host: "mini" };
const STATES: WireWorkspaceState[] = [
  "idle",
  "running",
  "awaiting_input",
  "background_work",
  "unknown",
];

const mapWith = (state: WireWorkspaceState, link?: WireLinkOverlay) =>
  applyStatusUpdate(emptyStatusMap, { workspace_id: "ws-r", state, link });

describe("the link overlay", () => {
  it("folds into the map and reads through linkFor; the next update without it clears it", () => {
    const on = mapWith("running", LOST);
    expect(linkFor(on, "ws-r")).toEqual(LOST);
    expect(linkFor(on, "ws-other")).toBeUndefined();
    const off = applyStatusUpdate(on, {
      workspace_id: "ws-r",
      state: "unknown",
    });
    expect(linkFor(off, "ws-r")).toBeUndefined();
  });

  it("changes no guard's input and not the dot's hue, for every state", () => {
    for (const state of STATES) {
      const on = mapWith(state, LOST);
      const off = mapWith(state);
      expect(stateFor(on, "ws-r")).toBe(stateFor(off, "ws-r"));
      expect(displayStateFor(on, "ws-r")).toBe(displayStateFor(off, "ws-r"));
      expect(isActiveState(stateFor(on, "ws-r"))).toBe(
        isActiveState(stateFor(off, "ws-r")),
      );
      expect(readyToRespawn(stateFor(on, "ws-r"))).toBe(
        readyToRespawn(stateFor(off, "ws-r")),
      );
    }
  });

  it("says so in plain words", () => {
    expect(linkOverlayTitle(LOST)).toBe("Not connected to mini: reconnecting");
    expect(linkOverlayTitle({ status: "detached", host: "mini" })).toBe(
      "Detached from mini",
    );
  });
});
