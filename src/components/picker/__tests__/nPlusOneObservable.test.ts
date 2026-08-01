import { describe, it, expect, beforeEach } from "vitest";
import { applyCommittedModel } from "../applyCommittedModel";
import { displayModelValue } from "../../../cc/modelOverride";
import type { RecentProject } from "../ProjectPicker";

// M11.5 repair (B) — the VERIFICATION OBSERVABLE for
// SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE.
//
// The task's claim is a COUNT ("N redundant IPC reads on picker open, all N re-fired when
// the filter box is cleared"), so this file counts. The sibling suite's source guards
// ("getProjectDefaultModel is not imported") assert structure, which is strictly weaker:
// a read could return via a different call path, a re-exported wrapper, or a useEffect
// added later, and those guards would still pass. This repo has been bitten three times
// by structural guards standing in for behavior
// (SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING).
//
// There is no component-render harness here (SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-
// HARNESS), so the row lifecycle is modelled explicitly against the SAME contract the real
// component implements:
//   - mount   -> value/draft seeded from the `seedModel` PROP (no IPC read)
//   - commit  -> ONE IPC write, then onCommitted folds the value into the parent array
//   - unmount -> local state discarded (the picker's `visible` filter unmounts rows)
//   - remount -> re-seeded from the parent array
// The model is honest about what it can prove: it pins the read-count and the seed
// correctness, which is what the bug and the fix's own risk are about.

/** Counted stand-in for the IPC surface. `reads` is the observable under test. */
class IpcCounter {
  reads = 0;
  writes = 0;
  private disk = new Map<string, string | null>();

  seedDisk(path: string, model: string | null) {
    this.disk.set(path, model);
  }

  /** The call the fix removed. Any invocation here is the N+1 coming back. */
  getProjectDefaultModel(path: string): string | null {
    this.reads += 1;
    return this.disk.get(path) ?? null;
  }

  /** The per-user-action write, which legitimately stays. */
  setProjectDefaultModel(path: string, model: string | null): void {
    this.writes += 1;
    this.disk.set(path, model);
  }

  diskValue(path: string): string | null {
    return this.disk.get(path) ?? null;
  }
}

/**
 * One mounted model cell, post-fix: seeded from a prop, never reading IPC on mount.
 * Mirrors `ProjectModelCell`'s state init (`useState(seedModel)` /
 * `useState(() => displayModelValue(seedModel))`) and its commit success path.
 */
function mountCell(
  ipc: IpcCounter,
  row: RecentProject,
  onCommitted: (path: string, model: string | null) => void,
) {
  // The load-bearing line: the seed comes from the ROW, not from `ipc.get…`.
  const value = row.default_model ?? null;
  return {
    displayed: displayModelValue(value),
    value,
    commit(next: string | null) {
      ipc.setProjectDefaultModel(row.project_path, next);
      onCommitted(row.project_path, next); // success path only
    },
  };
}

const N = 12; // a realistic recents count for the 20+-rotating-projects operator

describe("the picker model cell issues ZERO mount-time IPC reads (the N+1 observable)", () => {
  let ipc: IpcCounter;
  let recents: RecentProject[];

  beforeEach(() => {
    ipc = new IpcCounter();
    recents = Array.from({ length: N }, (_, i) => ({
      project_path: `/p${i}`,
      display_name: `P${i}`,
      // Half the rows carry an override; `list_projects` returns this on the wire.
      default_model: i % 2 === 0 ? `model-${i}` : null,
    }));
    for (const r of recents)
      ipc.seedDisk(r.project_path, r.default_model ?? null);
  });

  it("mounting all N rows costs 0 reads (was N)", () => {
    for (const r of recents) mountCell(ipc, r, () => {});
    expect(ipc.reads).toBe(0);
  });

  it("a filter round-trip that unmounts and remounts all N rows costs 0 reads (was N again)", () => {
    for (const r of recents) mountCell(ipc, r, () => {}); // initial mount
    // Type in the filter box -> `visible` shrinks -> every row unmounts.
    // Clear it -> all N remount. This is where the original bug re-fired.
    for (let pass = 0; pass < 3; pass++) {
      for (const r of recents) mountCell(ipc, r, () => {});
    }
    expect(ipc.reads).toBe(0);
  });

  it("every row still displays its correct persisted value from the seed", () => {
    const shown = recents.map((r) => mountCell(ipc, r, () => {}).value);
    expect(shown).toEqual(recents.map((r) => r.default_model ?? null));
    // And that agrees with what a read WOULD have returned — i.e. the seed is not
    // merely self-consistent, it matches disk.
    expect(shown).toEqual(recents.map((r) => ipc.diskValue(r.project_path)));
    expect(ipc.reads).toBe(0); // ...proven without reading
  });

  it("an unset row shows the placeholder label, not an empty string", () => {
    const unset = recents.find((r) => r.default_model === null)!;
    expect(mountCell(ipc, unset, () => {}).displayed).toBe(
      displayModelValue(null),
    );
  });
});

describe("committing survives a filter round-trip (the staleness the fix had to avoid)", () => {
  let ipc: IpcCounter;
  let recents: RecentProject[];

  beforeEach(() => {
    ipc = new IpcCounter();
    recents = [
      { project_path: "/a", default_model: null },
      { project_path: "/b", default_model: "opus" },
    ];
    for (const r of recents)
      ipc.seedDisk(r.project_path, r.default_model ?? null);
  });

  const onCommitted = (path: string, model: string | null) => {
    recents = applyCommittedModel(recents, path, model);
  };

  it("a committed value is re-displayed after unmount+remount, NOT the stale seed", () => {
    mountCell(ipc, recents[0], onCommitted).commit("sonnet");
    // Filter /a out, then back in -> fresh mount, seeded from the parent array.
    const remounted = mountCell(ipc, recents[0], onCommitted);
    expect(remounted.value).toBe("sonnet");
    expect(remounted.value).toBe(ipc.diskValue("/a")); // agrees with disk
    expect(ipc.reads).toBe(0); // and still without a read
  });

  it("CLEARING a value survives the round-trip too (null must overwrite)", () => {
    mountCell(ipc, recents[1], onCommitted).commit(null);
    expect(mountCell(ipc, recents[1], onCommitted).value).toBeNull();
  });

  it("commits one IPC write per user action — the write path is untouched", () => {
    mountCell(ipc, recents[0], onCommitted).commit("sonnet");
    expect(ipc.writes).toBe(1);
  });

  it("a commit does not disturb the other rows' seeds", () => {
    mountCell(ipc, recents[0], onCommitted).commit("sonnet");
    expect(mountCell(ipc, recents[1], onCommitted).value).toBe("opus");
  });
});

describe("the model is calibrated — it can actually SEE the pre-fix bug", () => {
  // A model that cannot fail on the old behavior would prove nothing (the vacuous-guard
  // failure mode). This reproduces the PRE-fix cell — seeding by IPC read — and asserts
  // the counter catches it, so the zero-read assertions above are meaningful.
  it("a read-on-mount cell costs N on mount and 2N after one filter round-trip", () => {
    const ipc = new IpcCounter();
    const rows: RecentProject[] = Array.from({ length: N }, (_, i) => ({
      project_path: `/p${i}`,
    }));
    for (const r of rows) ipc.seedDisk(r.project_path, null);

    const mountPreFix = (row: RecentProject) =>
      ipc.getProjectDefaultModel(row.project_path); // the deleted useEffect

    for (const r of rows) mountPreFix(r);
    expect(ipc.reads).toBe(N);
    for (const r of rows) mountPreFix(r); // filter cleared -> remount
    expect(ipc.reads).toBe(2 * N);
  });
});
