import { describe, it, expect } from "vitest";
import {
  deriveTiles,
  orderWorkspaces,
  tileForSwitchIndex,
} from "../filmstripTiles";
import { makeWorkspace } from "../../../state/workspace";

const wsA = makeWorkspace("/Users/me/projects/alpha");
const wsB = makeWorkspace("/Users/me/projects/beta");
const wsC = makeWorkspace("/Users/me/projects/gamma");

describe("deriveTiles", () => {
  it("renders one tile per workspace in WorkspaceList order with no persisted order", () => {
    const tiles = deriveTiles([wsA, wsB, wsC], wsB.id);
    expect(tiles.map((t) => t.id)).toEqual([wsA.id, wsB.id, wsC.id]);
    expect(tiles.map((t) => t.display_name)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("MARKS the focused workspace active — does not exclude it (complete roster)", () => {
    const tiles = deriveTiles([wsA, wsB, wsC], wsB.id);
    expect(tiles).toHaveLength(3); // center-stage tile is present, not dropped
    expect(tiles.find((t) => t.id === wsB.id)?.active).toBe(true);
    expect(tiles.filter((t) => t.active)).toHaveLength(1);
    expect(tiles.find((t) => t.id === wsA.id)?.active).toBe(false);
  });

  it("marks no tile active when focusedId is null", () => {
    const tiles = deriveTiles([wsA, wsB], null);
    expect(tiles.every((t) => !t.active)).toBe(true);
  });

  it("returns an empty roster for no workspaces", () => {
    expect(deriveTiles([], null)).toEqual([]);
  });

  it("orders by persisted project_path order when supplied", () => {
    const tiles = deriveTiles([wsA, wsB, wsC], wsA.id, [
      wsC.project_path,
      wsA.project_path,
      wsB.project_path,
    ]);
    expect(tiles.map((t) => t.id)).toEqual([wsC.id, wsA.id, wsB.id]);
  });
});

describe("orderWorkspaces", () => {
  it("follows WorkspaceList order with no persisted order", () => {
    expect(orderWorkspaces([wsA, wsB]).map((w) => w.id)).toEqual([
      wsA.id,
      wsB.id,
    ]);
  });

  it("appends open workspaces missing from the persisted order at the end", () => {
    // Only B is in the stored order; A and C append in WorkspaceList order.
    const ordered = orderWorkspaces([wsA, wsB, wsC], [wsB.project_path]);
    expect(ordered.map((w) => w.id)).toEqual([wsB.id, wsA.id, wsC.id]);
  });

  it("ignores persisted paths no longer open", () => {
    const ordered = orderWorkspaces(
      [wsA, wsB],
      ["/Users/me/projects/closed", wsB.project_path, wsA.project_path],
    );
    expect(ordered.map((w) => w.id)).toEqual([wsB.id, wsA.id]);
  });

  it("matches paths up to trailing-slash normalization", () => {
    const ordered = orderWorkspaces(
      [wsA, wsB],
      [wsB.project_path + "/", wsA.project_path],
    );
    expect(ordered.map((w) => w.id)).toEqual([wsB.id, wsA.id]);
  });
});

describe("tileForSwitchIndex (⌘⇧+digit → tile)", () => {
  const tiles = deriveTiles([wsA, wsB, wsC], wsA.id); // order: alpha, beta, gamma

  it("maps the 1-based index to the (n-1)th tile", () => {
    expect(tileForSwitchIndex(tiles, 1)?.id).toBe(wsA.id);
    expect(tileForSwitchIndex(tiles, 2)?.id).toBe(wsB.id);
    expect(tileForSwitchIndex(tiles, 3)?.id).toBe(wsC.id);
  });

  it("returns null past the end (no-op, not a clamp) — 3 tiles, ⌘⇧9", () => {
    expect(tileForSwitchIndex(tiles, 9)).toBeNull();
    expect(tileForSwitchIndex(tiles, 4)).toBeNull();
  });

  it("returns null for a below-range index", () => {
    expect(tileForSwitchIndex(tiles, 0)).toBeNull();
  });

  it("returns null on an empty roster", () => {
    expect(tileForSwitchIndex([], 1)).toBeNull();
  });
});
