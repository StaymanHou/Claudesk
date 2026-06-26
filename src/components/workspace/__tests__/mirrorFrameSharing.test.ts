import { describe, expect, it, beforeEach } from "vitest";
import { computeMirrorSet } from "../useMirrorTicker";
import {
  setMirrorFrame,
  readMirrorFrame,
  mirrorFrameSnapshot,
  __resetMirrorFrame,
} from "../mirrorFrame";

// M5 WP3 Phase 3 codify — the SHARED serialize fan-out (filmstrip + PiP, one loop).
// Pure logic vitest-pinned; the live render is verify-self/human-covered (bridge:
// both tiles incl. center-staged mirror; display-only; ~1fps — all PASS 2026-06-26).

describe("computeMirrorSet — the union serialized once per tick", () => {
  const ids = ["ws-1", "ws-2", "ws-3"]; // ws-2 is center-staged in these cases

  it("expanded + PiP hidden → filmstrip BACKGROUND only (excludes the center-staged one)", () => {
    const set = computeMirrorSet(ids, "ws-2", false, false);
    expect([...set].sort()).toEqual(["ws-1", "ws-3"]);
    expect(set.has("ws-2")).toBe(false); // center-staged excluded for the filmstrip
  });

  it("PiP shown → ALL ids incl. the center-staged one (the divergence)", () => {
    const set = computeMirrorSet(ids, "ws-2", false, true);
    expect([...set].sort()).toEqual(["ws-1", "ws-2", "ws-3"]);
    expect(set.has("ws-2")).toBe(true); // the one extra mirror the filmstrip skips
  });

  it("collapsed + PiP shown → still ALL ids (PiP doesn't care about filmstrip collapse)", () => {
    const set = computeMirrorSet(ids, "ws-2", true, true);
    expect([...set].sort()).toEqual(["ws-1", "ws-2", "ws-3"]);
  });

  it("collapsed + PiP hidden → EMPTY (no serialize cost — the gate)", () => {
    expect(computeMirrorSet(ids, "ws-2", true, false).size).toBe(0);
  });

  it("a workspace in both surfaces is listed ONCE (Set dedup → single serialize)", () => {
    // expanded (bg = ws-1, ws-3) ∪ pip (all) → ws-1/ws-3 would be added twice without
    // the Set; assert no duplication.
    const set = computeMirrorSet(ids, "ws-2", false, true);
    expect(set.size).toBe(3);
  });
});

describe("mirrorFrame — the shared snapshot store", () => {
  beforeEach(() => __resetMirrorFrame());

  it("setMirrorFrame round-trips via readMirrorFrame + snapshot", () => {
    setMirrorFrame(
      new Map([
        ["ws-1", "<pre>a</pre>"],
        ["ws-2", "<pre>b</pre>"],
      ]),
    );
    expect(readMirrorFrame("ws-1")).toBe("<pre>a</pre>");
    expect(readMirrorFrame("ws-2")).toBe("<pre>b</pre>");
    expect(mirrorFrameSnapshot()).toEqual({
      "ws-1": "<pre>a</pre>",
      "ws-2": "<pre>b</pre>",
    });
  });

  it("a new frame REPLACES the prior (stale ids drop out)", () => {
    setMirrorFrame(new Map([["ws-1", "old"]]));
    setMirrorFrame(new Map([["ws-2", "new"]]));
    expect(readMirrorFrame("ws-1")).toBeNull(); // dropped
    expect(readMirrorFrame("ws-2")).toBe("new");
  });

  it("readMirrorFrame returns null for an unknown id (never throws)", () => {
    expect(readMirrorFrame("nope")).toBeNull();
  });
});
