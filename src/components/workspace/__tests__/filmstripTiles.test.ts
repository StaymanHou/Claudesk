import { describe, it, expect } from "vitest";
import {
  deriveTiles,
  orderAfterDrag,
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

  it("orders by the dragged order of workspace ids when supplied", () => {
    const tiles = deriveTiles([wsA, wsB, wsC], wsA.id, [
      wsC.id,
      wsA.id,
      wsB.id,
    ]);
    expect(tiles.map((t) => t.id)).toEqual([wsC.id, wsA.id, wsB.id]);
  });
});

describe("orderWorkspaces", () => {
  it("follows WorkspaceList order with no dragged order", () => {
    expect(orderWorkspaces([wsA, wsB]).map((w) => w.id)).toEqual([
      wsA.id,
      wsB.id,
    ]);
  });

  it("appends open workspaces missing from the dragged order at the end", () => {
    // Only B was dragged; A and C append in WorkspaceList order.
    const ordered = orderWorkspaces([wsA, wsB, wsC], [wsB.id]);
    expect(ordered.map((w) => w.id)).toEqual([wsB.id, wsA.id, wsC.id]);
  });

  it("ignores ids no longer open", () => {
    const ordered = orderWorkspaces([wsA, wsB], ["ws-closed", wsB.id, wsA.id]);
    expect(ordered.map((w) => w.id)).toEqual([wsB.id, wsA.id]);
  });
});

describe("a newly opened workspace always appends on the RIGHT (paydown 2026-11-04 WP6)", () => {
  // The operator's ask. `orderAfterDrag` is what App stores on a drag, so these drive the
  // same two steps: arrange, then open.
  const dragged = orderAfterDrag;

  it("a new project opened after a drag lands last, not in WorkspaceList position", () => {
    // Drag C to the front: [C, A, B]. Then open D.
    const order = dragged(deriveTiles([wsA, wsB, wsC], wsA.id), 2, 0);
    const wsD = makeWorkspace("/Users/me/projects/delta");
    const tiles = deriveTiles([wsA, wsB, wsC, wsD], wsD.id, order);
    expect(tiles.map((t) => t.id)).toEqual([wsC.id, wsA.id, wsB.id, wsD.id]);
  });

  it("a project closed and reopened lands last, not back in its old dragged slot", () => {
    // Drag A to the front: [A, B, C]. Close A, then reopen the same path: a fresh
    // workspace (new id). A path-keyed order put it back at the FRONT, which read as random.
    const order = dragged(deriveTiles([wsB, wsC, wsA], wsA.id), 2, 0);
    expect(order).toEqual([wsA.id, wsB.id, wsC.id]);
    const reopened = makeWorkspace(wsA.project_path);
    expect(reopened.id).not.toBe(wsA.id); // the premise: an open mints a fresh id
    const tiles = deriveTiles([wsB, wsC, reopened], reopened.id, order);
    expect(tiles.map((t) => t.id)).toEqual([wsB.id, wsC.id, reopened.id]);
  });

  it("an already-open workspace keeps its dragged slot (reopening an open path only focuses it)", () => {
    const order = dragged(deriveTiles([wsA, wsB, wsC], wsA.id), 2, 0); // [C, A, B]
    // `openWorkspace` on an open path returns the SAME workspace, focused: same id.
    const tiles = deriveTiles([wsA, wsB, wsC], wsA.id, order);
    expect(tiles.map((t) => t.id)).toEqual([wsC.id, wsA.id, wsB.id]);
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
