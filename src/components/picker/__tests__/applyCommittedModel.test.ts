import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyCommittedModel } from "../applyCommittedModel";
import type { RecentProject } from "../ProjectPicker";

// M11.5 repair (B) — resolves
// SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE.
//
// The behavior under test is a VALUE transform, asserted as a value. This repo has no
// component-render harness (SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS), so the
// alternative would be `?raw` source guards — which have rotted three times here, most
// recently on the 2026-08-01 formatting sweep. Hence the extraction.

const ROWS: readonly RecentProject[] = [
  { project_path: "/a", display_name: "A", default_model: null },
  { project_path: "/b", display_name: "B", default_model: "opus" },
  { project_path: "/c", display_name: "C" }, // field absent on the wire
];

describe("applyCommittedModel — folds a persisted override back into recents", () => {
  it("sets an override on the matching row", () => {
    const next = applyCommittedModel(ROWS, "/a", "sonnet");
    expect(next[0].default_model).toBe("sonnet");
  });

  it("CLEARS an existing override when the committed value is null", () => {
    // `null` is a real value here ("inherit CC's own default"), not a missing one. If it
    // failed to overwrite, clearing a model in the UI would silently re-seed the old value
    // after a filter round-trip — the exact staleness this write-back exists to prevent.
    const next = applyCommittedModel(ROWS, "/b", null);
    expect(next[1].default_model).toBeNull();
  });

  it("populates a row whose field was absent on the wire", () => {
    const next = applyCommittedModel(ROWS, "/c", "fable");
    expect(next[2].default_model).toBe("fable");
  });

  it("leaves every other row's value untouched", () => {
    const next = applyCommittedModel(ROWS, "/a", "sonnet");
    expect(next[1].default_model).toBe("opus");
    expect(next[2].default_model).toBeUndefined();
  });

  it("preserves the other fields of the row it updates", () => {
    const next = applyCommittedModel(ROWS, "/b", "sonnet");
    expect(next[1].project_path).toBe("/b");
    expect(next[1].display_name).toBe("B");
  });

  it("preserves row order and length", () => {
    const next = applyCommittedModel(ROWS, "/b", "sonnet");
    expect(next.map((r) => r.project_path)).toEqual(["/a", "/b", "/c"]);
  });

  it("is a no-op for an unknown path (a row removed while its cell was mounted)", () => {
    const next = applyCommittedModel(ROWS, "/gone", "opus");
    expect(next).toEqual(ROWS);
    // Specifically must NOT resurrect the removed project as a new row.
    expect(next).toHaveLength(3);
  });

  it("does not mutate the input array or its row objects", () => {
    const rows: RecentProject[] = [
      { project_path: "/a", default_model: null },
      { project_path: "/b", default_model: "opus" },
    ];
    const before = structuredClone(rows);
    const next = applyCommittedModel(rows, "/a", "sonnet");
    expect(rows).toEqual(before);
    expect(next).not.toBe(rows);
    expect(next[0]).not.toBe(rows[0]);
  });

  it("matches paths verbatim, as the backend does", () => {
    // add_or_touch / remove / read_default_model all compare verbatim. A normalization
    // difference here could make the frontend and backend disagree about which record a
    // write landed on.
    expect(applyCommittedModel(ROWS, "/a/", "opus")).toEqual(ROWS);
    expect(applyCommittedModel(ROWS, "/A", "opus")).toEqual(ROWS);
  });
});

// Structural facts only, asserted as SINGLE IDENTIFIERS — never formatted multi-line
// expressions (the repo convention; a positional/multi-line guard is what rotted three
// times). These pin the N+1 removal itself, which no value assertion can reach: the
// absence of a mount-time fetch.
const cellSrc = readFileSync(
  join(__dirname, "..", "ProjectModelCell.tsx"),
  "utf8",
);

describe("the model cell performs NO mount-time IPC read (the N+1 removal)", () => {
  // ⚠️ This assertion used to read `not.toContain("getProjectDefaultModel")`. That symbol was
  // DELETED at the 2026-08-12 paydown sweep (dead wrapper over a callerless command), which
  // made the guard tautological: no file can contain a name that exists nowhere, so it passed
  // for a reason unrelated to the property. The honest form asserts what can still regress —
  // the cell reads NOTHING over the wire on mount, whatever a future read would be called.
  // (The class: SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING.)
  const readWrappers = ["getProjectDefaultModel", "readDefaultModel"];
  it.each(readWrappers)("does not import a read wrapper (%s)", (name) => {
    expect(cellSrc).not.toContain(name);
  });

  it("issues no bare invoke() of its own — every wire call is a named wrapper", () => {
    // The stronger property: even a future read added via a differently-named helper, or a
    // raw `invoke("project_get_...")`, is caught here rather than sliding past a name list.
    expect(cellSrc).not.toContain("invoke(");
  });

  it("still imports the write path, which is per-action and stays", () => {
    expect(cellSrc).toContain("setProjectDefaultModel");
  });

  it("seeds from the prop instead", () => {
    expect(cellSrc).toContain("seedModel");
  });

  it("reports committed values upward so the seed cannot go stale", () => {
    expect(cellSrc).toContain("onCommitted");
  });
});
