import { describe, expect, it } from "vitest";
import { orderPickerRows } from "../pickerOrder";

// M16.5 WP5 (5.7). Every fixture is built so the ruled order and the OLD order (descending
// last_opened_at, open rows included) DISAGREE — otherwise a test could pass on the old sort.

const names = (rows: { project_path: string }[]) =>
  rows.map((r) => r.project_path);

describe("orderPickerRows — last closed, open projects last", () => {
  it("orders by last CLOSED, not last opened", () => {
    const rows = [
      // Opened most recently but closed long ago: the old sort put it first.
      { project_path: "/a", last_opened_at: 300, last_closed_at: 50 },
      { project_path: "/b", last_opened_at: 200, last_closed_at: 400 },
      { project_path: "/c", last_opened_at: 100, last_closed_at: 250 },
    ];
    expect(names(orderPickerRows(rows, []).available)).toEqual([
      "/b",
      "/c",
      "/a",
    ]);
  });

  it("falls back to last_opened_at for a project never closed since the field existed", () => {
    const rows = [
      { project_path: "/never-closed", last_opened_at: 300 },
      { project_path: "/closed", last_opened_at: 100, last_closed_at: 200 },
      { project_path: "/old", last_opened_at: 150 },
    ];
    expect(names(orderPickerRows(rows, []).available)).toEqual([
      "/never-closed",
      "/closed",
      "/old",
    ]);
  });

  it("moves open projects OUT of the top, into their own group", () => {
    const rows = [
      // The two open ones carry the highest stamps, so the old sort led with them.
      { project_path: "/open-1", last_opened_at: 900, last_closed_at: 10 },
      { project_path: "/open-2", last_opened_at: 800 },
      { project_path: "/x", last_opened_at: 100, last_closed_at: 500 },
      { project_path: "/y", last_opened_at: 200, last_closed_at: 300 },
    ];
    const { available, open } = orderPickerRows(rows, ["/open-2", "/open-1"]);
    expect(names(available)).toEqual(["/x", "/y"]);
    expect(names(open)).toEqual(["/open-1", "/open-2"]);
  });

  it("matches open paths with or without a trailing slash", () => {
    const rows = [
      { project_path: "/p/", last_opened_at: 2 },
      { project_path: "/q", last_opened_at: 1 },
    ];
    const { available, open } = orderPickerRows(rows, ["/p"]);
    expect(names(open)).toEqual(["/p/"]);
    expect(names(available)).toEqual(["/q"]);
  });

  it("keeps every row exactly once", () => {
    const rows = [
      { project_path: "/a", last_opened_at: 1 },
      { project_path: "/b", last_opened_at: 2 },
      { project_path: "/c", last_opened_at: 3 },
    ];
    const { available, open } = orderPickerRows(rows, ["/b"]);
    expect([...names(available), ...names(open)].sort()).toEqual([
      "/a",
      "/b",
      "/c",
    ]);
  });
});
